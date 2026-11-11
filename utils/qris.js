const QRCode = require('qrcode');

/**
 * Calculates CRC16 CCITT (FALSE) checksum for EMVCo QR codes.
 * Polynomial: 0x1021, Init: 0xFFFF
 */
function calculateCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    let charCode = str.charCodeAt(i);
    crc ^= (charCode << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Parses an EMVCo QRIS string into a key-value tag map.
 */
function parseQRIS(qrisStr) {
  const tags = {};
  let index = 0;
  while (index < qrisStr.length) {
    if (index + 4 > qrisStr.length) break;
    const tag = qrisStr.substring(index, index + 2);
    const length = parseInt(qrisStr.substring(index + 2, index + 4), 10);
    const value = qrisStr.substring(index + 4, index + 4 + length);
    if (tag) {
      tags[tag] = value;
    }
    index += 4 + length;
  }
  return tags;
}

const KNOWN_ACQUIRER_NAMES = {
  'ID.CO.BCA.WWW': 'BCA',
  'ID.DANA.WWW': 'DANA',
  'ID.CO.BRI.WWW': 'BRI',
  'ID.CO.BANKMANDIRI.WWW': 'Mandiri',
  'ID.CO.BNI.WWW': 'BNI',
  'ID.CO.CIMBNIAGA.WWW': 'CIMB Niaga',
  'ID.CO.SHOPEE.WWW': 'ShopeePay',
  'ID.CO.GOPAY.WWW': 'GoPay',
  'ID.OVO.WWW': 'OVO',
  'ID.LINKAJA.WWW': 'LinkAja'
};

function inspectAcquirers(qrisStr) {
  if (!qrisStr || typeof qrisStr !== 'string') return [];
  const tags = parseQRIS(qrisStr.trim());
  const list = [];
  for (let tagNum = 26; tagNum <= 45; tagNum++) {
    const tagKey = String(tagNum);
    if (!tags[tagKey]) continue;
    const subTags = parseQRIS(tags[tagKey]);
    const domain = (subTags['00'] || '').trim().toUpperCase();
    const merchantPan = subTags['01'] || '';
    const merchantId = subTags['02'] || '';
    const friendlyName =
      KNOWN_ACQUIRER_NAMES[domain] ||
      (domain.includes('BCA') ? 'BCA' :
      domain.includes('DANA') ? 'DANA' :
      domain.includes('BRI') ? 'BRI' :
      domain.includes('MANDIRI') ? 'Mandiri' :
      domain.includes('BNI') ? 'BNI' :
      domain || `Acquirer #${tagKey}`);
    list.push({
      tag: tagKey,
      domain,
      name: friendlyName,
      pan: merchantPan,
      merchant_id: merchantId,
      raw: tags[tagKey]
    });
  }
  return list;
}

function rebuildQRISFromTags(tags) {
  delete tags['63'];
  let rebuilt = '';
  const sortedTags = Object.keys(tags).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  for (const tag of sortedTags) {
    const value = tags[tag];
    if (value === undefined || value === null || value === '') continue;
    const length = value.length.toString().padStart(2, '0');
    rebuilt += `${tag}${length}${value}`;
  }
  rebuilt += '6304';
  const crc = calculateCRC16(rebuilt);
  return rebuilt + crc;
}

/**
 * Filters a multi-acquirer QRIS string to route payments exclusively to a chosen acquirer
 * ('bca', 'dana', or 'multi'/'all'). Default 'bca' keeps ONLY BCA in Tag 26 so all payments
 * land in KlikBCA Merchant mutation logs for automatic verification.
 */
function filterQrisAcquirer(qrisStr, mode = 'bca') {
  if (!qrisStr || typeof qrisStr !== 'string') return qrisStr;
  const normMode = String(mode || 'bca').trim().toLowerCase();
  if (normMode === 'multi' || normMode === 'all') {
    return qrisStr.trim();
  }

  const tags = parseQRIS(qrisStr.trim());
  const acquirers = inspectAcquirers(qrisStr);
  if (acquirers.length <= 1) {
    return qrisStr.trim();
  }

  let matched = null;
  if (normMode === 'bca') {
    matched = acquirers.find(a => a.domain.includes('BCA'));
  } else if (normMode === 'dana') {
    matched = acquirers.find(a => a.domain.includes('DANA'));
  } else {
    matched = acquirers.find(a => a.domain === normMode.toUpperCase() || a.name.toLowerCase() === normMode);
  }

  if (!matched) {
    return qrisStr.trim();
  }

  for (let tagNum = 26; tagNum <= 45; tagNum++) {
    delete tags[String(tagNum)];
  }
  tags['26'] = matched.raw;

  return rebuildQRISFromTags(tags);
}

/**
 * Generates a dynamic QRIS string with a specific amount from a static QRIS base.
 */
function generateDynamicQRIS(staticQRIS, amount, acquirerMode = 'bca') {
  if (!staticQRIS) {
    throw new Error('Static QRIS string is empty');
  }

  // Apply acquirer filter first (default: BCA only so payments hit KlikBCA)
  const routedStatic = filterQrisAcquirer(staticQRIS.trim(), acquirerMode);

  // Parse original tags
  const tags = parseQRIS(routedStatic);

  // 1. Set Point of Initiation Method to 12 (Dynamic)
  tags['01'] = '12';

  // 2. Set Transaction Amount (Tag 54)
  // Ensure amount is formatted as integer string (or with decimals if needed, but QRIS IDR is typically integer)
  const amountStr = Math.round(amount).toString();
  tags['54'] = amountStr;

  return rebuildQRISFromTags(tags);
}

let browserInstance = null;
let cachedPuppeteer = null;

async function getPuppeteerLib() {
  if (cachedPuppeteer) return cachedPuppeteer;
  try {
    cachedPuppeteer = require('puppeteer');
  } catch (err) {
    if (err && err.code === 'ERR_REQUIRE_ESM') {
      const mod = await import('puppeteer');
      cachedPuppeteer = mod.default || mod;
    } else {
      throw err;
    }
  }
  return cachedPuppeteer;
}

async function getBrowser() {
  if (browserInstance && browserInstance.process() && !browserInstance.process().killed) {
    return browserInstance;
  }
  try {
    const puppeteer = await getPuppeteerLib();
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    return browserInstance;
  } catch (err) {
    console.warn('[QRIS Image Generator] Puppeteer not available, using raw QR code fallback:', err.message);
    return null;
  }
}

function validateQRIS(qrisStr) {
  if (!qrisStr || typeof qrisStr !== 'string') return false;
  const trimmed = qrisStr.trim();
  if (!trimmed.startsWith('000201') || trimmed.length < 30) return false;
  const crcTagIdx = trimmed.lastIndexOf('6304');
  if (crcTagIdx === -1 || crcTagIdx + 8 !== trimmed.length) return false;
  const payloadWithoutCrc = trimmed.slice(0, crcTagIdx + 4);
  const actualCrc = trimmed.slice(crcTagIdx + 4).toUpperCase();
  return calculateCRC16(payloadWithoutCrc) === actualCrc;
}

function extractNmid(qrisStr) {
  try {
    const tags = parseQRIS(qrisStr);
    
    // 1. Check Tag 51 (National Merchant ID - NMID is usually here)
    if (tags['51']) {
      const subTags = parseQRIS(tags['51']);
      if (subTags['02']) return subTags['02'];
    }
    
    // 2. Check Tag 26-45 (Merchant Account Information)
    for (let tagNum = 26; tagNum <= 45; tagNum++) {
      const tagStr = tagNum.toString();
      if (tags[tagStr]) {
        const subTags = parseQRIS(tags[tagStr]);
        if (subTags['02'] && subTags['02'].startsWith('ID')) return subTags['02'];
        if (subTags['03'] && subTags['03'].startsWith('ID')) return subTags['03'];
      }
    }
  } catch (e) {
    console.error('Error extracting NMID:', e);
  }
  return 'ID1023289166127'; // Fallback to user's known NMID
}

/**
 * Generates a styled QRIS voucher image from a text string.
 * Falls back to a raw QR Code if Puppeteer is not available.
 */
async function generateQRISImage(qrisStr) {
  // Always generate the raw QR code first as the primary fallback
  let rawQr;
  try {
    rawQr = await QRCode.toDataURL(qrisStr, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 200,
      color: {
        dark: '#0A1128',
        light: '#FFFFFF'
      }
    });
  } catch (err) {
    console.error('Failed to generate raw QR Code image:', err);
    throw err;
  }

  try {
    const browser = await getBrowser();
    if (!browser) {
      return rawQr;
    }

    const tags = parseQRIS(qrisStr);
    const merchantName = tags['59'] || 'Hobbycloud RC';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #FFFFFF;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      width: 220px;
      height: 240px;
    }
    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .qr-image {
      width: 200px;
      height: 200px;
      display: block;
    }
    .merchant-name {
      font-size: 18px;
      font-weight: bold;
      color: #0c1c30;
      margin-top: 4px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <img class="qr-image" src="${rawQr}" />
    <div class="merchant-name">${merchantName}</div>
  </div>
</body>
</html>
    `;

    const page = await browser.newPage();
    await page.setViewport({ width: 220, height: 240, deviceScaleFactor: 2 });
    await page.setContent(htmlContent);

    // Wait for the QR image to load
    await page.evaluate(async () => {
      const img = document.querySelector('.qr-image');
      if (img && !img.complete) {
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }
    });

    const screenshotBuffer = await page.screenshot({ type: 'png' });
    await page.close();
    
    return 'data:image/png;base64,' + screenshotBuffer.toString('base64');
  } catch (err) {
    console.error('[QRIS Image Generator] Failed to generate styled QR code, falling back to raw QR:', err);
    return rawQr;
  }
}

module.exports = {
  calculateCRC16,
  parseQRIS,
  validateQRIS,
  extractNmid,
  inspectAcquirers,
  filterQrisAcquirer,
  generateDynamicQRIS,
  generateQRISImage
};

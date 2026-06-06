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

/**
 * Generates a dynamic QRIS string with a specific amount from a static QRIS base.
 */
function generateDynamicQRIS(staticQRIS, amount) {
  if (!staticQRIS) {
    throw new Error('Static QRIS string is empty');
  }

  // Parse original tags
  const tags = parseQRIS(staticQRIS.trim());

  // 1. Set Point of Initiation Method to 12 (Dynamic)
  tags['01'] = '12';

  // 2. Set Transaction Amount (Tag 54)
  // Ensure amount is formatted as integer string (or with decimals if needed, but QRIS IDR is typically integer)
  const amountStr = Math.round(amount).toString();
  tags['54'] = amountStr;

  // Remove existing CRC tag (63) if present to compute it fresh
  delete tags['63'];

  // 3. Rebuild QRIS string in numerical tag order
  let rebuilt = '';
  const sortedTags = Object.keys(tags).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  
  for (const tag of sortedTags) {
    const value = tags[tag];
    const length = value.length.toString().padStart(2, '0');
    rebuilt += `${tag}${length}${value}`;
  }

  // 4. Append Tag 63 (CRC16) with length 04
  rebuilt += '6304';

  // 5. Calculate and append CRC16 checksum
  const crc = calculateCRC16(rebuilt);
  return rebuilt + crc;
}

let browserInstance = null;

async function getBrowser() {
  if (browserInstance && browserInstance.process() && !browserInstance.process().killed) {
    return browserInstance;
  }
  try {
    const puppeteer = require('puppeteer');
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
      width: 300,
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
      width: 330px;
      height: 360px;
    }
    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .qr-image {
      width: 300px;
      height: 300px;
      display: block;
    }
    .merchant-name {
      font-size: 24px;
      font-weight: bold;
      color: #0c1c30;
      margin-top: 10px;
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
    await page.setViewport({ width: 330, height: 360, deviceScaleFactor: 2 });
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
  generateDynamicQRIS,
  generateQRISImage
};

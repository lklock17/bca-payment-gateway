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

/**
 * Generates a Data URL QR Code image from a text string.
 */
async function generateQRISImage(qrisStr) {
  try {
    return await QRCode.toDataURL(qrisStr, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 400,
      color: {
        dark: '#0A1128',  // Sleek dark navy
        light: '#FFFFFF'
      }
    });
  } catch (err) {
    console.error('Failed to generate QR Code image:', err);
    throw err;
  }
}

module.exports = {
  calculateCRC16,
  parseQRIS,
  generateDynamicQRIS,
  generateQRISImage
};

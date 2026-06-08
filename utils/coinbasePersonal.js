const crypto = require('crypto');

/**
 * Generates a JSON Web Token (JWT) for Coinbase Developer Platform (CDP) API keys
 */
function generateCDPJWT(keyName, privateKey, method, path) {
  // Strip query parameters for the uri claim
  const basePath = path.split('?')[0];
  const host = 'api.coinbase.com';
  const uri = `${method.toUpperCase()} ${host}${basePath}`;

  const header = {
    alg: 'ES256',
    typ: 'JWT',
    kid: keyName,
    nonce: crypto.randomBytes(16).toString('hex')
  };

  const payload = {
    iss: 'cdp',
    nbf: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 120,
    sub: keyName,
    uri: uri
  };

  const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const dataToSign = `${headerBase64}.${payloadBase64}`;

  const signer = crypto.createSign('SHA256');
  signer.update(dataToSign);

  // Sign using ieee-p1363 for ES256/JWT compatibility
  const signature = signer.sign({
    key: privateKey,
    dsaEncoding: 'ieee-p1363'
  }, 'base64url');

  return `${dataToSign}.${signature}`;
}

/**
 * Makes a signed request to the Coinbase API.
 * Supports legacy HMAC keys and modern CDP API keys (JWT).
 */
async function makeCoinbaseRequest(apiKey, apiSecret, method, path, bodyObj = null) {
  const isCDP = apiKey && apiKey.startsWith('organizations/');
  
  const headers = {
    'Content-Type': 'application/json',
    'CB-VERSION': '2016-02-18',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  if (isCDP) {
    const cleanedSecret = apiSecret.replace(/\\n/g, '\n');
    const token = generateCDPJWT(apiKey, cleanedSecret, method, path);
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyString = bodyObj ? JSON.stringify(bodyObj) : '';
    const prehash = timestamp + method.toUpperCase() + path + bodyString;
    
    // Signature for Coinbase Retail API (v2) is a lowercase hex HMAC-SHA256
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(prehash)
      .digest('hex');

    headers['CB-ACCESS-KEY'] = apiKey;
    headers['CB-ACCESS-SIGN'] = signature;
    headers['CB-ACCESS-TIMESTAMP'] = timestamp;
  }

  const url = `https://api.coinbase.com${path}`;
  const options = {
    method: method.toUpperCase(),
    headers: headers
  };
  if (bodyObj) {
    options.body = JSON.stringify(bodyObj);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Coinbase API error: ${response.status} - ${text}`);
  }
  return response.json();
}

/**
 * Searches for the account ID corresponding to the given currency code (e.g., USDT)
 */
async function getAccountId(apiKey, apiSecret, currencyCode) {
  const data = await makeCoinbaseRequest(apiKey, apiSecret, 'GET', '/v2/accounts?limit=100');
  const account = data.data.find(acc => acc.balance.currency === currencyCode.toUpperCase());
  if (!account) {
    throw new Error(`Account for currency ${currencyCode} not found in Coinbase!`);
  }
  return account.id;
}

/**
 * Generates a new unique receiving address under the given Coinbase account
 */
async function createAddress(apiKey, apiSecret, accountId) {
  const data = await makeCoinbaseRequest(apiKey, apiSecret, 'POST', `/v2/accounts/${accountId}/addresses`, {
    name: 'Top Up Address'
  });
  return {
    id: data.data.id,
    address: data.data.address
  };
}

/**
 * Retrieves the transaction history for a specific receiving address
 */
async function checkTransactions(apiKey, apiSecret, accountId, addressId) {
  const data = await makeCoinbaseRequest(apiKey, apiSecret, 'GET', `/v2/accounts/${accountId}/addresses/${addressId}/transactions`);
  return data.data; // List of transaction objects
}

module.exports = {
  makeCoinbaseRequest,
  getAccountId,
  createAddress,
  checkTransactions
};


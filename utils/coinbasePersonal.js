const crypto = require('crypto');

/**
 * Makes a signed request to the Coinbase Retail API (v2)
 */
async function makeCoinbaseRequest(apiKey, apiSecret, method, path, bodyObj = null) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyString = bodyObj ? JSON.stringify(bodyObj) : '';
  const prehash = timestamp + method.toUpperCase() + path + bodyString;
  
  // Signature for Coinbase Retail API (v2) is a lowercase hex HMAC-SHA256
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(prehash)
    .digest('hex');

  const headers = {
    'Content-Type': 'application/json',
    'CB-ACCESS-KEY': apiKey,
    'CB-ACCESS-SIGN': signature,
    'CB-ACCESS-TIMESTAMP': timestamp,
    'CB-VERSION': '2016-02-18',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  const url = `https://api.coinbase.com${path}`;
  const options = {
    method: method.toUpperCase(),
    headers: headers
  };
  if (bodyObj) {
    options.body = bodyString;
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

let cachedUsdtPrice = 16300; // Default fallback price in IDR
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

/**
 * Fetches the current USDT to IDR exchange rate.
 * Tries Coinbase API first, falls back to Indodax API if Coinbase is down.
 */
async function getUsdtToIdrPrice() {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_DURATION) {
    return cachedUsdtPrice;
  }

  // 1. Try Coinbase API
  try {
    console.log('[Crypto Rates] Fetching USDT/IDR rate from Coinbase...');
    const response = await fetch('https://api.coinbase.com/v2/prices/USDT-IDR/spot');
    if (response.ok) {
      const data = await response.json();
      if (data && data.data && data.data.amount) {
        const rate = parseFloat(data.data.amount);
        if (rate > 0) {
          cachedUsdtPrice = rate;
          lastFetchTime = now;
          console.log(`[Crypto Rates] Coinbase USDT price updated: IDR ${cachedUsdtPrice}`);
          return cachedUsdtPrice;
        }
      }
    }
    console.warn('[Crypto Rates] Coinbase response not OK or empty amount. Trying fallback...');
  } catch (err) {
    console.warn(`[Crypto Rates] Coinbase API failed: ${err.message}. Trying Indodax fallback...`);
  }

  // 2. Fallback to Indodax API
  try {
    console.log('[Crypto Rates] Fetching USDT/IDR rate from Indodax...');
    const response = await fetch('https://indodax.com/api/usdt_idr/ticker');
    if (response.ok) {
      const data = await response.json();
      if (data && data.ticker && data.ticker.last) {
        const rate = parseFloat(data.ticker.last);
        if (rate > 0) {
          cachedUsdtPrice = rate;
          lastFetchTime = now;
          console.log(`[Crypto Rates] Indodax USDT price updated (Fallback): IDR ${cachedUsdtPrice}`);
          return cachedUsdtPrice;
        }
      }
    }
    console.warn('[Crypto Rates] Indodax response not OK or empty last price.');
  } catch (err) {
    console.error(`[Crypto Rates] Indodax API failed: ${err.message}`);
  }

  // Return cached or default value if both failed
  console.log(`[Crypto Rates] Using cached/fallback rate: IDR ${cachedUsdtPrice}`);
  return cachedUsdtPrice;
}

module.exports = {
  getUsdtToIdrPrice
};

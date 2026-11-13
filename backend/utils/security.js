const net = require('net');

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
  '100.100.100.200',
  '0.0.0.0',
  '::',
  '::0'
]);

function isPrivateOrLinkLocalIp(hostname) {
  const cleanHost = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!net.isIP(cleanHost)) return false;

  if (net.isIPv4(cleanHost)) {
    const parts = cleanHost.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    return false;
  }

  // IPv6 checks
  if (cleanHost === '::1' || cleanHost === '::') return true;
  if (cleanHost.startsWith('fe80:') || cleanHost.startsWith('fc') || cleanHost.startsWith('fd')) {
    return true;
  }
  if (cleanHost.startsWith('::ffff:')) {
    const mappedV4 = cleanHost.slice(7);
    return isPrivateOrLinkLocalIp(mappedV4);
  }
  return false;
}

/**
 * Validates a webhook URL against SSRF and invalid protocols.
 * Allows local /api/test-webhook for the built-in tester UI.
 */
function validateWebhookUrl(rawUrl) {
  if (rawUrl === undefined || rawUrl === null || rawUrl === '') {
    return { valid: true, url: null };
  }
  if (typeof rawUrl !== 'string') {
    return { valid: false, reason: 'webhook_url harus berupa string URL yang valid' };
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) return { valid: true, url: null };
  if (trimmed.length > 2048) {
    return { valid: false, reason: 'webhook_url terlalu panjang (maksimal 2048 karakter)' };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'Format webhook_url tidak valid' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'webhook_url hanya mendukung protokol http:// atau https://' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'webhook_url tidak boleh menyertakan kredensial user/password' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, reason: 'webhook_url mengarah ke host internal yang dilarang' };
  }

  // Allow built-in /api/test-webhook on localhost/127.0.0.1 for Tester UI
  const isBuiltinTestWebhook =
    (hostname === 'localhost' || hostname === '127.0.0.1') &&
    parsed.pathname === '/api/test-webhook';

  const allowPrivateWebhooks = String(process.env.ALLOW_PRIVATE_WEBHOOKS || '').toLowerCase() === 'true';

  if (!isBuiltinTestWebhook && !allowPrivateWebhooks) {
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal') || isPrivateOrLinkLocalIp(hostname)) {
      return { valid: false, reason: 'webhook_url tidak boleh mengarah ke jaringan lokal atau IP privat (SSRF protection)' };
    }
  }

  return { valid: true, url: parsed.toString() };
}

/**
 * In-memory rate limiter middleware (no external dependencies).
 */
function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  maxAttempts = 10,
  keyFn = (req) => req.ip || req.socket.remoteAddress || 'unknown',
  message = 'Terlalu banyak percobaan. Silakan coba lagi nanti.'
} = {}) {
  const store = new Map();
  const MAX_ENTRIES = 10000;

  function cleanup(now) {
    if (store.size <= MAX_ENTRIES) return;
    for (const [k, entry] of store.entries()) {
      if (now >= entry.resetAt) {
        store.delete(k);
      }
    }
    if (store.size > MAX_ENTRIES) {
      store.clear();
    }
  }

  const middleware = (req, res, next) => {
    const now = Date.now();
    cleanup(now);

    const key = String(keyFn(req) || 'unknown');
    let entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > maxAttempts) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        status: 'error',
        message,
        retry_after_seconds: retryAfterSec
      });
    }

    req._rateLimitResetKey = () => store.delete(key);
    next();
  };

  middleware.resetKey = (key) => store.delete(String(key));
  return middleware;
}

module.exports = {
  validateWebhookUrl,
  isPrivateOrLinkLocalIp,
  createRateLimiter
};

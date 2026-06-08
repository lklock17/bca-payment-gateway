const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const database = require('./database');
const qrisUtil = require('./utils/qris');
const checkerService = require('./services/bcaChecker');
const bcaScraper = require('./services/bcaScraper');
const cryptoRates = require('./utils/cryptoRates');

const app = express();
const PORT = process.env.PORT || 3005;

// Global Log Buffer for Admin Dashboard Console Widget
const logBuffer = [];
const MAX_LOGS = 100;

function addLog(type, args) {
  const timestamp = new Date().toLocaleTimeString('id-ID', { 
    timeZone: 'Asia/Jakarta', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit', 
    hour12: false 
  });
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  logBuffer.unshift({ timestamp, type, message });
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.pop();
  }
}

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
  addLog('info', args);
  originalLog(...args);
};
console.warn = (...args) => {
  addLog('warn', args);
  originalWarn(...args);
};
console.error = (...args) => {
  addLog('error', args);
  originalError(...args);
};

// Token Secret generation
const JWT_SECRET = crypto.randomBytes(32).toString('hex');

function generateToken(user) {
  const payload = { id: user.id, email: user.email, role: user.role };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: 'Token otentikasi diperlukan' });

  try {
    const [encoded, signature] = token.split('.');
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url');
    
    if (signature !== expectedSignature) {
      return res.status(401).json({ message: 'Token tidak valid atau kedaluwarsa' });
    }
    
    const user = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token tidak valid' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Akses ditolak: Memerlukan hak akses Admin' });
  }
}

// Middleware
app.use(cors());
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// ==========================================
// 1. AUTHENTICATION ROUTE
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password harus diisi' });
  }

  try {
    const user = await database.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ message: 'Email atau password salah' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Email atau password salah' });
    }

    const token = generateToken(user);
    res.json({ token, email: user.email, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
});

// ==========================================
// 2. ADMIN USER MANAGEMENT
// ==========================================
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await database.all('SELECT id, email, role, created_at FROM users');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data user' });
  }
});

app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password harus diisi' });
  }

  try {
    const userExists = await database.get('SELECT id FROM users WHERE email = ?', [email]);
    if (userExists) {
      return res.status(400).json({ message: 'Email sudah terdaftar' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await database.run(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
      [email, hashedPassword, role || 'user']
    );
    res.status(201).json({ message: 'User berhasil dibuat' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal membuat user baru' });
  }
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const user = await database.get('SELECT email FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });
    if (user.email === 'admin@gateway.com') {
      return res.status(400).json({ message: 'Akun admin utama tidak dapat dihapus' });
    }

    await database.run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menghapus user' });
  }
});

app.put('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { email, password, role } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email harus diisi' });
  }

  try {
    const user = await database.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    // Prevent changing primary admin role
    if (user.email === 'admin@gateway.com' && role !== 'admin') {
      return res.status(400).json({ message: 'Akun admin utama harus tetap memiliki role Admin' });
    }

    // Check if email already taken
    if (email !== user.email) {
      const emailExists = await database.get('SELECT id FROM users WHERE email = ? AND id != ?', [email, id]);
      if (emailExists) {
        return res.status(400).json({ message: 'Email sudah digunakan oleh user lain' });
      }
    }

    let query = 'UPDATE users SET email = ?, role = ? WHERE id = ?';
    let params = [email, role || 'user', id];

    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      query = 'UPDATE users SET email = ?, password = ?, role = ? WHERE id = ?';
      params = [email, hashedPassword, role || 'user', id];
    }

    await database.run(query, params);
    res.json({ message: 'User berhasil diperbarui' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal memperbarui data user' });
  }
});

// ==========================================
// 3. MERCHANT MANAGEMENT
// ==========================================
app.get('/api/merchants', authenticateToken, async (req, res) => {
  try {
    const merchants = await database.all('SELECT id, name, bca_user, bca_pass, static_qris, crypto_address, coinbase_api_key, coinbase_webhook_secret, status, api_key, created_at FROM merchants');
    
    // Attach session status to each merchant
    const merchantsWithStatus = merchants.map(m => {
      let bcaStatus = { status: 'disconnected', error: null };
      if (m.bca_user) {
        bcaStatus = bcaScraper.getSessionStatus(m.bca_user);
      }
      return { 
        ...m, 
        bca_status: bcaStatus.status, 
        bca_error: bcaStatus.error 
      };
    });
    
    res.json(merchantsWithStatus);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil data merchant' });
  }
});

app.post('/api/merchants', authenticateToken, requireAdmin, async (req, res) => {
  const { name, bca_user, bca_pass, static_qris, crypto_address, coinbase_api_key, coinbase_webhook_secret } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'Nama merchant wajib diisi' });
  }

  const hasBca = bca_user && bca_pass && static_qris;
  const hasCoinbase = coinbase_api_key && coinbase_webhook_secret;
  const hasDirectCrypto = crypto_address;

  if (!hasBca && !hasCoinbase && !hasDirectCrypto) {
    return res.status(400).json({ message: 'Kredensial KlikBCA, Coinbase Commerce, atau Alamat Crypto Wallet wajib diisi salah satu' });
  }

  try {
    // Generate unique API Key (like midtrans server key)
    const apiKey = 'BCA-GW-' + crypto.randomBytes(16).toString('hex').toUpperCase();
    
    await database.run(
      'INSERT INTO merchants (name, bca_user, bca_pass, static_qris, crypto_address, coinbase_api_key, coinbase_webhook_secret, api_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        name, 
        bca_user || null, 
        bca_pass || null, 
        static_qris || null, 
        crypto_address || null, 
        coinbase_api_key || null, 
        coinbase_webhook_secret || null, 
        apiKey
      ]
    );
    res.status(201).json({ message: 'Merchant berhasil ditambahkan' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal menambahkan merchant' });
  }
});

app.put('/api/merchants/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, bca_user, bca_pass, static_qris, crypto_address, coinbase_api_key, coinbase_webhook_secret } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Nama merchant wajib diisi' });
  }

  const hasBca = bca_user && bca_pass && static_qris;
  const hasCoinbase = coinbase_api_key && coinbase_webhook_secret;
  const hasDirectCrypto = crypto_address;

  if (!hasBca && !hasCoinbase && !hasDirectCrypto) {
    return res.status(400).json({ message: 'Kredensial KlikBCA, Coinbase Commerce, atau Alamat Crypto Wallet wajib diisi salah satu' });
  }

  try {
    const merchant = await database.get('SELECT id FROM merchants WHERE id = ?', [id]);
    if (!merchant) return res.status(404).json({ message: 'Merchant tidak ditemukan' });

    await database.run(
      'UPDATE merchants SET name = ?, bca_user = ?, bca_pass = ?, static_qris = ?, crypto_address = ?, coinbase_api_key = ?, coinbase_webhook_secret = ? WHERE id = ?',
      [
        name, 
        bca_user || null, 
        bca_pass || null, 
        static_qris || null, 
        crypto_address || null, 
        coinbase_api_key || null, 
        coinbase_webhook_secret || null, 
        id
      ]
    );
    res.json({ message: 'Merchant berhasil diperbarui' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal memperbarui merchant' });
  }
});

app.delete('/api/merchants/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const merchant = await database.get('SELECT id FROM merchants WHERE id = ?', [id]);
    if (!merchant) return res.status(404).json({ message: 'Merchant tidak ditemukan' });

    // Also delete associated transactions
    await database.run('DELETE FROM transactions WHERE merchant_id = ?', [id]);
    await database.run('DELETE FROM merchants WHERE id = ?', [id]);
    res.json({ message: 'Merchant beserta transaksinya berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menghapus merchant' });
  }
});

// ==========================================
// 4. TRANSACTION & STATUS ROUTES
// ==========================================
app.get('/api/transactions', authenticateToken, async (req, res) => {
  const { limit } = req.query;
  try {
    let query = `
      SELECT t.*, m.name as merchant_name, m.crypto_address 
      FROM transactions t
      JOIN merchants m ON t.merchant_id = m.id
      ORDER BY t.created_at DESC
    `;
    const params = [];
    if (limit) {
      query += ' LIMIT ?';
      params.push(parseInt(limit, 10));
    }
    const txs = await database.all(query, params);
    res.json(txs);
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data transaksi' });
  }
});

app.post('/api/transactions/:id/simulate-payment', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const tx = await database.get('SELECT status FROM transactions WHERE id = ?', [id]);
    if (!tx) return res.status(404).json({ message: 'Transaksi tidak ditemukan' });
    if (tx.status !== 'pending') return res.status(400).json({ message: 'Transaksi sudah diproses' });

    await checkerService.markTransactionSuccess(id);
    res.json({ message: 'Simulasi pembayaran sukses berhasil dipicu' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal melakukan simulasi pembayaran' });
  }
});

app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const volumeRow = await database.get("SELECT SUM(amount) as val FROM transactions WHERE status = 'success'");
    const totalRow = await database.get("SELECT COUNT(id) as val FROM transactions");
    const successRow = await database.get("SELECT COUNT(id) as val FROM transactions WHERE status = 'success'");
    const pendingRow = await database.get("SELECT COUNT(id) as val FROM transactions WHERE status = 'pending'");
    const activeMerchantsRow = await database.get("SELECT COUNT(id) as val FROM merchants WHERE status = 'active'");

    const volume = volumeRow.val || 0;
    const totalTx = totalRow.val || 0;
    const successCount = successRow.val || 0;
    const pendingTx = pendingRow.val || 0;
    const activeMerchants = activeMerchantsRow.val || 0;
    const successRate = totalTx > 0 ? Math.round((successCount / totalTx) * 100) : 0;

    res.json({ volume, totalTx, successCount, pendingTx, successRate, activeMerchants });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menghitung statistik' });
  }
});

app.get('/api/logs', authenticateToken, (req, res) => {
  res.json(logBuffer);
});

// ==========================================
// 5. PUBLIC API (INTEGRASI MERCHANT STORE)
// ==========================================

// Middleware for Store API Key verification
async function authenticateApiKey(req, res, next) {
  const authHeader = req.headers['authorization'];
  const apiKey = authHeader && authHeader.split(' ')[1];

  if (!apiKey) {
    return res.status(401).json({ status: 'error', message: 'API Key diperlukan pada header Authorization Bearer' });
  }

  try {
    const merchant = await database.get('SELECT * FROM merchants WHERE api_key = ? AND status = "active"', [apiKey]);
    if (!merchant) {
      return res.status(401).json({ status: 'error', message: 'API Key tidak valid atau merchant dinonaktifkan' });
    }
    req.merchant = merchant;
    next();
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Otentikasi API Key gagal' });
  }
}

/**
 * Charge endpoint (POST /api/v1/charge)
 * Body: { external_id, amount, webhook_url, payment_method }
 */
app.post('/api/v1/charge', authenticateApiKey, async (req, res) => {
  const { external_id, amount, webhook_url, payment_method } = req.body;

  if (!external_id || !amount) {
    return res.status(400).json({ status: 'error', message: 'external_id dan amount wajib diisi' });
  }

  const baseAmt = parseFloat(amount);
  if (isNaN(baseAmt) || baseAmt <= 0) {
    return res.status(400).json({ status: 'error', message: 'amount harus bernilai positif' });
  }

  const method = payment_method === 'crypto' ? 'crypto' : 'qris';

  try {
    if (method === 'crypto') {
      if (!req.merchant.coinbase_api_key) {
        return res.status(400).json({ status: 'error', message: 'Coinbase Commerce API Key belum dikonfigurasi untuk merchant ini.' });
      }

      console.log(`[Crypto Charge] Creating Coinbase charge for merchant "${req.merchant.name}", IDR ${baseAmt}...`);
      
      const cbResponse = await fetch('https://api.commerce.coinbase.com/charges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CC-Api-Key': req.merchant.coinbase_api_key,
          'X-CC-Version': '2018-03-22',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          name: `Order ${external_id}`,
          description: `Pembayaran Order #${external_id} - ${req.merchant.name}`,
          pricing_type: 'fixed_price',
          local_price: {
            amount: baseAmt.toString(),
            currency: 'IDR'
          },
          metadata: {
            external_id: external_id,
            merchant_id: req.merchant.id
          }
        })
      });

      if (!cbResponse.ok) {
        const errorText = await cbResponse.text();
        throw new Error(`Coinbase Commerce API error: ${cbResponse.status} - ${errorText}`);
      }

      const cbData = await cbResponse.json();
      const chargeCode = cbData.data.code;
      const hostedUrl = cbData.data.hosted_url;

      // Save crypto transaction to SQLite
      const result = await database.run(
        'INSERT INTO transactions (merchant_id, external_id, amount, status, payment_method, coinbase_charge_code, webhook_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [req.merchant.id, external_id, baseAmt, 'pending', 'crypto', chargeCode, webhook_url || null]
      );

      return res.status(201).json({
        status: 'pending',
        transaction_id: result.id,
        external_id: external_id,
        amount: baseAmt,
        payment_method: 'crypto',
        hosted_url: hostedUrl,
        coinbase_charge_code: chargeCode,
        created_at: new Date().toISOString()
      });
    }

    // Otherwise, default to QRIS flow
    // 1. Dapatkan daftar nominal dari semua transaksi yang sedang pending milik merchant ini
    const pendingTxs = await database.all(
      'SELECT amount FROM transactions WHERE merchant_id = ? AND status = "pending"',
      [req.merchant.id]
    );
    const activeAmounts = new Set(pendingTxs.map(tx => tx.amount));

    // 2. Cari kode unik (suffix) antara 1 sampai 199 yang belum digunakan untuk nominal dasar ini
    const maxSuffix = 199;
    let suffix = Math.floor(Math.random() * maxSuffix) + 1;
    let finalAmt = baseAmt + suffix;

    let attempts = 0;
    while (activeAmounts.has(finalAmt) && attempts < maxSuffix) {
      suffix = (suffix % maxSuffix) + 1; // Geser ke kode unik berikutnya
      finalAmt = baseAmt + suffix;
      attempts++;
    }

    // Generate Dynamic QRIS string dengan nominal unik yang baru
    const dynamicQrisStr = qrisUtil.generateDynamicQRIS(req.merchant.static_qris, finalAmt);
    
    // Generate QR Image data-url
    const qrCodeImage = await qrisUtil.generateQRISImage(dynamicQrisStr);

    // Save transaction to SQLite
    const result = await database.run(
      'INSERT INTO transactions (merchant_id, external_id, amount, status, qris_string, qris_image, webhook_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.merchant.id, external_id, finalAmt, 'pending', dynamicQrisStr, qrCodeImage, webhook_url || null]
    );

    res.status(201).json({
      status: 'pending',
      transaction_id: result.id,
      external_id: external_id,
      amount: finalAmt,
      base_amount: baseAmt,
      fee: suffix,
      qris_string: dynamicQrisStr,
      qris_image: qrCodeImage,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Charge API Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Gagal membuat invoice pembayaran: ' + err.message });
  }
});

/**
 * Status endpoint (GET /api/v1/status/:external_id)
 */
app.get('/api/v1/status/:external_id', authenticateApiKey, async (req, res) => {
  const { external_id } = req.params;

  try {
    const tx = await database.get(
      'SELECT status, amount, payment_method, coinbase_charge_code, created_at, updated_at FROM transactions WHERE external_id = ? AND merchant_id = ?',
      [external_id, req.merchant.id]
    );

    if (!tx) {
      return res.status(404).json({ status: 'error', message: 'Transaksi tidak ditemukan' });
    }

    res.json({
      external_id: external_id,
      status: tx.status,
      amount: tx.amount,
      payment_method: tx.payment_method || 'qris',
      coinbase_charge_code: tx.coinbase_charge_code || null,
      hosted_url: tx.coinbase_charge_code ? `https://commerce.coinbase.com/charges/${tx.coinbase_charge_code}` : null,
      created_at: tx.created_at,
      updated_at: tx.updated_at
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Gagal mengambil status transaksi' });
  }
});

/**
 * Coinbase Commerce Webhook endpoint
 */
app.post('/api/webhooks/coinbase', async (req, res) => {
  const signature = req.headers['x-cc-webhook-signature'];
  if (!signature) {
    return res.status(400).json({ message: 'Missing X-CC-Webhook-Signature header' });
  }

  try {
    const event = req.body.event;
    if (!event || !event.data || !event.data.metadata) {
      return res.status(400).json({ message: 'Invalid webhook payload structure' });
    }

    const { merchant_id, external_id } = event.data.metadata;
    if (!merchant_id) {
      return res.status(400).json({ message: 'Missing merchant_id in metadata' });
    }

    // Retrieve merchant to get the webhook shared secret
    const merchant = await database.get('SELECT * FROM merchants WHERE id = ?', [merchant_id]);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    if (!merchant.coinbase_webhook_secret) {
      return res.status(400).json({ message: 'Merchant coinbase_webhook_secret not configured' });
    }

    // Verify webhook signature using rawBody buffer
    const bodyToSign = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const computedSignature = crypto
      .createHmac('sha256', merchant.coinbase_webhook_secret)
      .update(bodyToSign)
      .digest('hex');

    if (computedSignature !== signature) {
      console.warn(`[Coinbase Webhook] Signature mismatch for merchant #${merchant.id}. Received: ${signature}, Computed: ${computedSignature}`);
      return res.status(401).json({ message: 'Signature verification failed' });
    }

    console.log(`[Coinbase Webhook] Signature verified successfully. Event: ${event.type}, Code: ${event.data.code}`);

    // Process payment confirmation
    if (event.type === 'charge:confirmed') {
      const tx = await database.get(
        'SELECT * FROM transactions WHERE coinbase_charge_code = ? AND merchant_id = ?',
        [event.data.code, merchant.id]
      );

      if (tx) {
        if (tx.status === 'pending') {
          console.log(`[Coinbase Webhook] Payment confirmed for Tx #${tx.id} (External: ${tx.external_id}). Marking as success.`);
          await checkerService.markTransactionSuccess(tx.id, event.data.id || 'coinbase_ref');
        } else {
          console.log(`[Coinbase Webhook] Transaction #${tx.id} is already in status: ${tx.status}. Skipping.`);
        }
      } else {
        console.warn(`[Coinbase Webhook] No matching transaction found for charge code: ${event.data.code}`);
      }
    } else {
      console.log(`[Coinbase Webhook] Received unhandled event type: ${event.type}`);
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[Coinbase Webhook Error]', err.message);
    res.status(500).json({ message: 'Internal server error: ' + err.message });
  }
});

// Webhook logger in-memory database for testing
const webhookLogs = [];

app.post('/api/test-webhook', (req, res) => {
  console.log('[Mock Webhook] Received payload:', req.body);
  webhookLogs.unshift({
    timestamp: new Date().toISOString(),
    headers: req.headers,
    body: req.body
  });
  if (webhookLogs.length > 50) webhookLogs.pop();
  res.json({ status: 'ok', message: 'Webhook received successfully' });
});

app.get('/api/test-webhook-logs', (req, res) => {
  res.json(webhookLogs);
});


// Start Server & Database Initialization
(async () => {
  try {
    console.log('Initializing database...');
    await database.initDb();
    console.log('Database initialized successfully.');

    // Start Express listener
    app.listen(PORT, () => {
      console.log(`BCA Payment Gateway server is running on port ${PORT}`);
      
      // Start background polling transaction check
      checkerService.startChecker(10000); // Poll every 10 seconds
    });
  } catch (err) {
    console.error('Failed to initialize server:', err);
    process.exit(1);
  }
})();

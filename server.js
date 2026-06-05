const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const database = require('./database');
const qrisUtil = require('./utils/qris');
const checkerService = require('./services/bcaChecker');
const bcaScraper = require('./services/bcaScraper');

const app = express();
const PORT = process.env.PORT || 3005;

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
app.use(express.json());
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
    const merchants = await database.all('SELECT id, name, bca_user, bca_pass, static_qris, status, api_key, created_at FROM merchants');
    
    // Attach session status to each merchant
    const merchantsWithStatus = merchants.map(m => {
      let bcaStatus = 'disconnected';
      if (m.bca_user) {
        bcaStatus = bcaScraper.getSessionStatus(m.bca_user);
      }
      return { ...m, bca_status: bcaStatus };
    });
    
    res.json(merchantsWithStatus);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil data merchant' });
  }
});

app.post('/api/merchants', authenticateToken, requireAdmin, async (req, res) => {
  const { name, bca_user, bca_pass, static_qris } = req.body;
  if (!name || !static_qris) {
    return res.status(400).json({ message: 'Nama merchant dan static QRIS wajib diisi' });
  }

  try {
    // Generate unique API Key (like midtrans server key)
    const apiKey = 'BCA-GW-' + crypto.randomBytes(16).toString('hex').toUpperCase();
    
    await database.run(
      'INSERT INTO merchants (name, bca_user, bca_pass, static_qris, api_key) VALUES (?, ?, ?, ?, ?)',
      [name, bca_user, bca_pass, static_qris, apiKey]
    );
    res.status(201).json({ message: 'Merchant berhasil ditambahkan' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menambahkan merchant' });
  }
});

app.put('/api/merchants/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, bca_user, bca_pass, static_qris } = req.body;

  try {
    const merchant = await database.get('SELECT id FROM merchants WHERE id = ?', [id]);
    if (!merchant) return res.status(404).json({ message: 'Merchant tidak ditemukan' });

    await database.run(
      'UPDATE merchants SET name = ?, bca_user = ?, bca_pass = ?, static_qris = ? WHERE id = ?',
      [name, bca_user, bca_pass, static_qris, id]
    );
    res.json({ message: 'Merchant berhasil diperbarui' });
  } catch (err) {
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
      SELECT t.*, m.name as merchant_name 
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
 * Body: { external_id, amount, webhook_url }
 */
app.post('/api/v1/charge', authenticateApiKey, async (req, res) => {
  const { external_id, amount, webhook_url } = req.body;

  if (!external_id || !amount) {
    return res.status(400).json({ status: 'error', message: 'external_id dan amount wajib diisi' });
  }

  const baseAmt = parseFloat(amount);
  if (isNaN(baseAmt) || baseAmt <= 0) {
    return res.status(400).json({ status: 'error', message: 'amount harus bernilai positif' });
  }

  try {
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
    res.status(500).json({ status: 'error', message: 'Gagal membuat QRIS dinamis: ' + err.message });
  }
});

/**
 * Status endpoint (GET /api/v1/status/:external_id)
 */
app.get('/api/v1/status/:external_id', authenticateApiKey, async (req, res) => {
  const { external_id } = req.params;

  try {
    const tx = await database.get(
      'SELECT status, amount, created_at, updated_at FROM transactions WHERE external_id = ? AND merchant_id = ?',
      [external_id, req.merchant.id]
    );

    if (!tx) {
      return res.status(404).json({ status: 'error', message: 'Transaksi tidak ditemukan' });
    }

    res.json({
      external_id: external_id,
      status: tx.status,
      amount: tx.amount,
      created_at: tx.created_at,
      updated_at: tx.updated_at
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Gagal mengambil status transaksi' });
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

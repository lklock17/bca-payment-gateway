const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const {
  loadDotEnv,
  getEnvConfig,
  getPublicEnvStatus,
  updateDotEnvStaticQris
} = require('./backend/config/env');

// Load environment configuration
loadDotEnv();
let envConfig = getEnvConfig();

const database = require('./database');
const qrisUtil = require('./utils/qris');
const checkerService = require('./services/bcaChecker');
const bcaScraper = require('./services/bcaScraper');
const { createAuthHelpers } = require('./backend/middlewares/auth');
const {
  requireAdmin,
  createUserMgmtWritableMiddleware
} = require('./backend/middlewares/rbac');

const app = express();
const PORT = envConfig.port;

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
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg))
    .join(' ');
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

// Fallback runtime JWT secret if not configured in .env
const runtimeJwtSecret =
  envConfig.jwt_secret || crypto.randomBytes(32).toString('hex');

const { generateToken, authenticateToken } = createAuthHelpers({
  database,
  jwtSecret: runtimeJwtSecret,
  jwtExpiresHours: envConfig.jwt_expires_hours
});

const requireUserMgmtWritable = createUserMgmtWritableMiddleware(() => getEnvConfig());

// Express Middleware
app.use(cors());
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: true }));

// Root redirect & production-safe index.html serving
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

app.get('/index.html', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (envConfig.node_env === 'production') {
    let html = fs.readFileSync(indexPath, 'utf8');
    html = html.replace(/<!-- DEMO_HINT_START -->[\s\S]*?<!-- DEMO_HINT_END -->/g, '');
    html = html.replace(/<!-- DEMO_SCRIPT_START -->[\s\S]*?<!-- DEMO_SCRIPT_END -->/g, '');
    return res.type('html').send(html);
  }
  res.sendFile(indexPath);
});

app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password harus diisi' });
  }

  try {
    const user = await database.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
    if (!user) {
      return res.status(400).json({ message: 'Email atau password salah' });
    }

    if (user.is_active === 0) {
      return res.status(403).json({ message: 'Akun Anda telah dinonaktifkan. Hubungi administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Email atau password salah' });
    }

    const tokenData = generateToken(user);

    // Save session audit record to database
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;
    await database.run(
      `INSERT INTO sessions (user_id, token_jti, ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [user.id, tokenData.jti, ipAddress, userAgent, tokenData.expiresAt]
    );

    // Update user's last login timestamp
    await database.run(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
      [user.id]
    );

    res.json({
      token: tokenData.token,
      email: user.email,
      role: user.role,
      is_primary_admin: Boolean(user.is_primary_admin),
      expires_at: tokenData.expiresAt
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await database.get(
      'SELECT id, email, role, is_primary_admin, managed_by_env, is_active, created_at, last_login_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      is_primary_admin: Boolean(user.is_primary_admin),
      managed_by_env: Boolean(user.managed_by_env),
      is_active: Boolean(user.is_active),
      created_at: user.created_at,
      last_login_at: user.last_login_at
    });
  } catch (err) {
    res.status(500).json({ message: 'Gagal memuat data profil' });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    if (req.user && req.user.jti) {
      await database.run(
        'UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_jti = ? AND user_id = ?',
        [req.user.jti, req.user.id]
      );
    }
    res.json({ message: 'Sesi berhasil diakhiri' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal melakukan logout' });
  }
});

// ==========================================
// 2. ADMIN USER MANAGEMENT
// ==========================================
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await database.all(
      `SELECT id, email, role, is_primary_admin, managed_by_env, is_active, created_at, last_login_at
         FROM users
        ORDER BY is_primary_admin DESC, id ASC`
    );
    const sanitized = users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      is_primary_admin: Boolean(u.is_primary_admin),
      managed_by_env: Boolean(u.managed_by_env),
      is_active: Boolean(u.is_active),
      created_at: u.created_at,
      last_login_at: u.last_login_at
    }));
    res.json(sanitized);
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data user' });
  }
});

app.post('/api/users', authenticateToken, requireAdmin, requireUserMgmtWritable, async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password harus diisi' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const targetRole = role === 'admin' ? 'admin' : 'user';

  try {
    const userExists = await database.get('SELECT id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (userExists) {
      return res.status(400).json({ message: 'Email sudah terdaftar' });
    }

    const rounds = envConfig.bcrypt_rounds || 10;
    const hashedPassword = await bcrypt.hash(password, rounds);
    const roleRow = await database.get('SELECT id FROM roles WHERE name = ?', [targetRole]);

    const result = await database.run(
      `INSERT INTO users (email, password, role, role_id, is_primary_admin, managed_by_env, is_active, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, 1, CURRENT_TIMESTAMP)`,
      [cleanEmail, hashedPassword, targetRole, roleRow ? roleRow.id : null]
    );
    res.status(201).json({ message: 'User berhasil dibuat', id: result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal membuat user baru' });
  }
});

app.put('/api/users/:id', authenticateToken, requireAdmin, requireUserMgmtWritable, async (req, res) => {
  const { id } = req.params;
  const { email, password, role, is_active } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email harus diisi' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const user = await database.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    // Protection for Primary Admin
    if (user.is_primary_admin === 1) {
      if (role && role !== 'admin') {
        return res.status(400).json({ message: 'Akun Administrator utama harus tetap memiliki role Admin' });
      }
      if (is_active === 0 || is_active === false) {
        return res.status(400).json({ message: 'Akun Administrator utama tidak dapat dinonaktifkan' });
      }
    }

    // Protection for Env-Managed Users when locked
    const currentEnvConfig = getEnvConfig();
    if (user.managed_by_env === 1 && currentEnvConfig.lock_env_managed_users) {
      if (cleanEmail !== user.email.toLowerCase()) {
        return res.status(400).json({
          message: 'Email akun yang dikelola oleh file .env tidak dapat diubah via Dashboard. Ubah di file .env server.'
        });
      }
      if (password && password.trim() !== '') {
        return res.status(400).json({
          message: 'Password akun yang dikelola oleh file .env diproteksi dari pengubahan via UI. Ubah di file .env server.'
        });
      }
    }

    // Check duplicate email
    if (cleanEmail !== user.email.toLowerCase()) {
      const emailExists = await database.get('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?', [cleanEmail, id]);
      if (emailExists) {
        return res.status(400).json({ message: 'Email sudah digunakan oleh user lain' });
      }
    }

    const nextRole = role === 'admin' ? 'admin' : (role === 'user' ? 'user' : user.role);
    const roleRow = await database.get('SELECT id FROM roles WHERE name = ?', [nextRole]);
    const nextActive = is_active !== undefined ? (is_active ? 1 : 0) : user.is_active;

    let query = 'UPDATE users SET email = ?, role = ?, role_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    let params = [cleanEmail, nextRole, roleRow ? roleRow.id : user.role_id, nextActive, id];

    if (password && password.trim() !== '') {
      const rounds = envConfig.bcrypt_rounds || 10;
      const hashedPassword = await bcrypt.hash(password, rounds);
      query = 'UPDATE users SET email = ?, password = ?, role = ?, role_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      params = [cleanEmail, hashedPassword, nextRole, roleRow ? roleRow.id : user.role_id, nextActive, id];
    }

    await database.run(query, params);
    res.json({ message: 'User berhasil diperbarui' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal memperbarui data user' });
  }
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, requireUserMgmtWritable, async (req, res) => {
  const { id } = req.params;
  try {
    const user = await database.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });

    if (user.is_primary_admin === 1) {
      return res.status(400).json({ message: 'Akun Administrator utama tidak dapat dihapus' });
    }

    if (Number(user.id) === Number(req.user.id)) {
      return res.status(400).json({ message: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif' });
    }

    const currentEnvConfig = getEnvConfig();
    if (user.managed_by_env === 1 && currentEnvConfig.lock_env_managed_users) {
      return res.status(400).json({
        message: 'Akun ini dikelola oleh file .env dan diproteksi dari penghapusan via Dashboard UI.'
      });
    }

    await database.run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal menghapus user' });
  }
});

// ==========================================
// 3. SYSTEM & ENV CONFIGURATION STATUS
// ==========================================
app.get('/api/system/env-status', authenticateToken, (req, res) => {
  envConfig = getEnvConfig();
  const status = getPublicEnvStatus(envConfig);
  res.json(status);
});

// ==========================================
// 4. MERCHANT MANAGEMENT
// ==========================================
app.get('/api/merchants', authenticateToken, async (req, res) => {
  try {
    envConfig = getEnvConfig();
    const isAdmin = req.user && req.user.role === 'admin';
    const merchants = await database.all(
      isAdmin
        ? 'SELECT id, name, bca_user, bca_pass, static_qris, qris_acquirer, status, api_key, created_at FROM merchants'
        : 'SELECT id, name, bca_user, static_qris, qris_acquirer, status, api_key, created_at FROM merchants'
    );

    const merchantsWithStatus = merchants.map((m) => {
      const effectiveBcaUser = m.bca_user || envConfig.bca_user || null;
      let bcaStatus = { status: 'disconnected', error: null };
      if (effectiveBcaUser) {
        bcaStatus = bcaScraper.getSessionStatus(effectiveBcaUser);
      }

      const effectiveStaticQris = m.static_qris || envConfig.static_qris || '';
      const hasStaticQris = Boolean(effectiveStaticQris);
      const hasBcaPass = Boolean(m.bca_pass || envConfig.bca_pass);
      const isUsingEnvBca = !m.bca_user && Boolean(envConfig.bca_user);
      const detectedAcquirers = effectiveStaticQris
        ? qrisUtil.inspectAcquirers(effectiveStaticQris).map((a) => ({ tag: a.tag, domain: a.domain, name: a.name }))
        : [];
      const qrisAcquirer = m.qris_acquirer || 'bca';

      if (!isAdmin) {
        const maskedApiKey = m.api_key
          ? `${m.api_key.slice(0, 10)}••••`
          : null;
        let maskedBcaUser = null;
        if (m.bca_user) {
          maskedBcaUser = getPublicEnvStatus(envConfig).bca_user_masked;
        } else if (envConfig.bca_user) {
          maskedBcaUser = `${getPublicEnvStatus(envConfig).bca_user_masked} (via .env)`;
        }
        return {
          id: m.id,
          name: m.name,
          bca_user: maskedBcaUser,
          bca_pass: null,
          static_qris: null,
          qris_acquirer: qrisAcquirer,
          detected_acquirers: detectedAcquirers,
          has_static_qris: hasStaticQris,
          has_bca_pass: hasBcaPass,
          is_using_env_bca: isUsingEnvBca,
          status: m.status,
          api_key: maskedApiKey,
          created_at: m.created_at,
          bca_status: bcaStatus.status,
          bca_error: bcaStatus.error
        };
      }

      return {
        ...m,
        qris_acquirer: qrisAcquirer,
        detected_acquirers: detectedAcquirers,
        bca_pass: null,
        has_static_qris: hasStaticQris,
        has_bca_pass: hasBcaPass,
        is_using_env_bca: isUsingEnvBca,
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
  const { name, bca_user, bca_pass, static_qris, qris_acquirer } = req.body || {};
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) {
    return res.status(400).json({ message: 'Nama merchant wajib diisi' });
  }

  const cleanBcaUser = typeof bca_user === 'string' && bca_user.trim() !== '' ? bca_user.trim() : null;
  const cleanBcaPass = typeof bca_pass === 'string' && bca_pass.trim() !== '' ? bca_pass : null;
  const cleanStaticQris = typeof static_qris === 'string' && static_qris.trim() !== '' ? static_qris.trim() : null;
  const cleanAcquirer = ['bca', 'dana', 'multi'].includes(String(qris_acquirer || '').toLowerCase())
    ? String(qris_acquirer).toLowerCase()
    : 'bca';

  const effectiveUser = cleanBcaUser || envConfig.bca_user;
  const effectivePass = cleanBcaPass || envConfig.bca_pass;

  if (!effectiveUser || !effectivePass) {
    return res.status(400).json({
      message: 'Kredensial KlikBCA (User dan Password) wajib diisi atau diset di file .env'
    });
  }

  try {
    const apiKey = 'BCA-GW-' + crypto.randomBytes(16).toString('hex').toUpperCase();

    const result = await database.run(
      'INSERT INTO merchants (name, bca_user, bca_pass, static_qris, qris_acquirer, api_key, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        trimmedName,
        cleanBcaUser,
        cleanBcaPass,
        cleanStaticQris,
        cleanAcquirer,
        apiKey,
        req.user.id
      ]
    );
    res.status(201).json({
      message: 'Merchant berhasil ditambahkan',
      id: result.id,
      name: trimmedName,
      api_key: apiKey,
      qris_acquirer: cleanAcquirer,
      has_static_qris: Boolean(cleanStaticQris || envConfig.static_qris)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal menambahkan merchant' });
  }
});

app.put('/api/merchants/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, bca_user, bca_pass, static_qris, qris_acquirer } = req.body || {};
  const trimmedName = typeof name === 'string' ? name.trim() : '';

  if (!trimmedName) {
    return res.status(400).json({ message: 'Nama merchant wajib diisi' });
  }

  try {
    const merchant = await database.get('SELECT * FROM merchants WHERE id = ?', [id]);
    if (!merchant) return res.status(404).json({ message: 'Merchant tidak ditemukan' });

    const finalBcaUser = bca_user !== undefined
      ? (typeof bca_user === 'string' && bca_user.trim() !== '' ? bca_user.trim() : null)
      : merchant.bca_user;
    const finalBcaPass = (typeof bca_pass === 'string' && bca_pass.trim() !== '')
      ? bca_pass
      : merchant.bca_pass;
    const finalStaticQris = static_qris !== undefined
      ? (typeof static_qris === 'string' && static_qris.trim() !== '' ? static_qris.trim() : null)
      : merchant.static_qris;
    const finalAcquirer = qris_acquirer !== undefined && ['bca', 'dana', 'multi'].includes(String(qris_acquirer).toLowerCase())
      ? String(qris_acquirer).toLowerCase()
      : (merchant.qris_acquirer || 'bca');

    const effectiveUser = finalBcaUser || envConfig.bca_user;
    const effectivePass = finalBcaPass || envConfig.bca_pass;

    if (!effectiveUser || !effectivePass) {
      return res.status(400).json({
        message: 'Kredensial KlikBCA (User dan Password) wajib diisi atau diset di file .env'
      });
    }

    await database.run(
      'UPDATE merchants SET name = ?, bca_user = ?, bca_pass = ?, static_qris = ?, qris_acquirer = ? WHERE id = ?',
      [
        trimmedName,
        finalBcaUser,
        finalBcaPass,
        finalStaticQris,
        finalAcquirer,
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

    await database.run('DELETE FROM transactions WHERE merchant_id = ?', [id]);
    await database.run('DELETE FROM merchants WHERE id = ?', [id]);
    res.json({ message: 'Merchant beserta transaksinya berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menghapus merchant' });
  }
});

app.post('/api/merchants/:id/sync-qris', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const merchant = await database.get('SELECT * FROM merchants WHERE id = ?', [id]);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant tidak ditemukan' });
    }

    const currentEnv = getEnvConfig();
    const bcaUser = merchant.bca_user || currentEnv.bca_user;
    const bcaPass = merchant.bca_pass || currentEnv.bca_pass;

    if (!bcaUser || !bcaPass) {
      return res.status(400).json({
        message: 'Kredensial KlikBCA (User dan Password) belum dikonfigurasi untuk merchant ini atau di .env.'
      });
    }

    const staticQris = await bcaScraper.fetchStaticQris(bcaUser, bcaPass);
    if (!staticQris || !qrisUtil.validateQRIS(staticQris)) {
      return res.status(422).json({
        message: 'Hasil decode QRIS dari KlikBCA tidak valid atau gagal checksum CRC16.'
      });
    }

    await database.run('UPDATE merchants SET static_qris = ? WHERE id = ?', [staticQris, id]);
    updateDotEnvStaticQris(staticQris);
    envConfig = getEnvConfig();

    res.json({
      message: 'QRIS Statis berhasil disinkronkan dari portal KlikBCA dan disimpan ke DB serta .env!',
      static_qris: staticQris,
      has_static_qris: true,
      env_updated: true
    });
  } catch (err) {
    console.error('[Sync QRIS Error]', err);
    res.status(500).json({
      message: 'Gagal menarik QRIS Statis dari KlikBCA: ' + (err.message || 'Unknown error')
    });
  }
});

// ==========================================
// 5. TRANSACTION & STATUS ROUTES
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

app.post('/api/transactions/:id/simulate-payment', authenticateToken, requireAdmin, async (req, res) => {
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

app.get('/api/logs', authenticateToken, requireAdmin, (req, res) => {
  res.json(logBuffer);
});

// ==========================================
// 6. PUBLIC API (INTEGRASI MERCHANT STORE)
// ==========================================
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

app.post('/api/v1/charge', authenticateApiKey, async (req, res) => {
  const { external_id, amount, webhook_url } = req.body;

  if (!external_id || !amount) {
    return res.status(400).json({ status: 'error', message: 'external_id dan amount wajib diisi' });
  }

  const baseAmt = parseFloat(amount);
  if (!Number.isFinite(baseAmt) || baseAmt <= 0) {
    return res.status(400).json({ status: 'error', message: 'amount harus bernilai positif' });
  }

  envConfig = getEnvConfig();
  const staticQris = req.merchant.static_qris || envConfig.static_qris;
  if (!staticQris) {
    return res.status(400).json({
      status: 'error',
      message: 'String QRIS Statis perlu diset untuk merchant ini (atau di file .env) agar dapat men-generate dynamic QRIS'
    });
  }

  try {
    const pendingTxs = await database.all(
      'SELECT amount FROM transactions WHERE merchant_id = ? AND status = "pending"',
      [req.merchant.id]
    );
    const activeAmounts = new Set(pendingTxs.map((tx) => tx.amount));

    const maxSuffix = 199;
    let suffix = Math.floor(Math.random() * maxSuffix) + 1;
    let finalAmt = baseAmt + suffix;

    let attempts = 0;
    while (activeAmounts.has(finalAmt) && attempts < maxSuffix) {
      suffix = (suffix % maxSuffix) + 1;
      finalAmt = baseAmt + suffix;
      attempts++;
    }

    const rawAcquirer = typeof req.body.acquirer === 'string' ? req.body.acquirer.trim().toLowerCase() : '';
    const selectedAcquirer = ['bca', 'dana', 'multi'].includes(rawAcquirer)
      ? rawAcquirer
      : (req.merchant.qris_acquirer || 'bca');

    const dynamicQrisStr = qrisUtil.generateDynamicQRIS(staticQris, finalAmt, selectedAcquirer);
    const qrCodeImage = await qrisUtil.generateQRISImage(dynamicQrisStr);
    const activeAcquirers = qrisUtil.inspectAcquirers(dynamicQrisStr).map((a) => a.name);

    const result = await database.run(
      'INSERT INTO transactions (merchant_id, external_id, amount, status, qris_string, qris_image, webhook_url, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.merchant.id, external_id, finalAmt, 'pending', dynamicQrisStr, qrCodeImage, webhook_url || null, 'qris']
    );

    res.status(201).json({
      status: 'pending',
      transaction_id: result.id,
      external_id: external_id,
      amount: finalAmt,
      base_amount: baseAmt,
      fee: suffix,
      payment_method: 'qris',
      qris_acquirer: selectedAcquirer,
      active_acquirers: activeAcquirers,
      qris_string: dynamicQrisStr,
      qris_image: qrCodeImage,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Charge API Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Gagal membuat invoice pembayaran: ' + err.message });
  }
});

app.get('/api/v1/status/:external_id', authenticateApiKey, async (req, res) => {
  const { external_id } = req.params;

  try {
    const tx = await database.get(
      'SELECT id, status, amount, payment_method, created_at, updated_at FROM transactions WHERE external_id = ? AND merchant_id = ?',
      [external_id, req.merchant.id]
    );

    if (!tx) {
      return res.status(404).json({ status: 'error', message: 'Transaksi tidak ditemukan' });
    }

    res.json({
      external_id: external_id,
      status: tx.status,
      amount: tx.amount,
      payment_method: 'qris',
      created_at: tx.created_at,
      updated_at: tx.updated_at
    });
  } catch (err) {
    console.error('[Status API Error]', err.message);
    res.status(500).json({ status: 'error', message: 'Gagal mengambil status transaksi' });
  }
});

// Webhook mock testing logger
const webhookLogs = [];

app.post('/api/test-webhook', (req, res) => {
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
if (require.main === module) {
  (async () => {
    try {
      console.log('Initializing database...');
      await database.initDb(envConfig);
      console.log('Database initialized successfully.');

      app.listen(PORT, () => {
        console.log(`BCA Payment Gateway server is running on port ${PORT}`);
        checkerService.startChecker(10000);
      });
    } catch (err) {
      console.error('Failed to initialize server:', err);
      process.exit(1);
    }
  })();
}

module.exports = { app, envConfig };

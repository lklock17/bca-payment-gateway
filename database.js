const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { bootstrapAdminAndUsers } = require('./backend/services/adminBootstrap');

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'gateway.db');
const db = new sqlite3.Database(dbPath);

// Helper to run query (Promise-based)
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// Helper to get single row
const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Helper to get all rows
const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

async function safeAlter(sql) {
  try {
    await run(sql);
  } catch (err) {
    // Ignore "duplicate column name" or already-applied migration errors
  }
}

// Initialize DB schemas, migrations, RBAC tables & .env user bootstrapping
const initDb = async (customEnvConfig = null) => {
  await run('PRAGMA foreign_keys = ON');

  // 1. Roles & Permissions (RBAC)
  await run(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      description TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    )
  `);

  // 2. Users Table
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      role_id INTEGER,
      is_primary_admin INTEGER NOT NULL DEFAULT 0,
      managed_by_env INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL
    )
  `);

  // Migrate existing users table safely (SQLite ALTER cannot use non-constant DEFAULT CURRENT_TIMESTAMP)
  await safeAlter('ALTER TABLE users ADD COLUMN role_id INTEGER');
  await safeAlter('ALTER TABLE users ADD COLUMN is_primary_admin INTEGER NOT NULL DEFAULT 0');
  await safeAlter('ALTER TABLE users ADD COLUMN managed_by_env INTEGER NOT NULL DEFAULT 0');
  await safeAlter('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
  await safeAlter('ALTER TABLE users ADD COLUMN last_login_at DATETIME');
  await safeAlter('ALTER TABLE users ADD COLUMN updated_at DATETIME');

  await run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  await run('CREATE INDEX IF NOT EXISTS idx_users_primary_admin ON users(is_primary_admin)');

  // 3. Sessions Table (Audit Login & Token Revocation)
  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_jti TEXT UNIQUE NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_sessions_jti ON sessions(token_jti)');
  await run('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');

  // 4. Merchants Table
  await run(`
    CREATE TABLE IF NOT EXISTS merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bca_user TEXT,
      bca_pass TEXT,
      static_qris TEXT,
      qris_acquirer TEXT DEFAULT 'bca',
      status TEXT DEFAULT 'active',
      api_key TEXT UNIQUE NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await safeAlter('ALTER TABLE merchants ADD COLUMN created_by INTEGER');
  await safeAlter("ALTER TABLE merchants ADD COLUMN qris_acquirer TEXT DEFAULT 'bca'");

  // 5. Transactions Table
  await run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id INTEGER NOT NULL,
      external_id TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      qris_string TEXT,
      qris_image TEXT,
      webhook_url TEXT,
      bca_ref TEXT UNIQUE,
      payment_method TEXT DEFAULT 'qris',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES merchants (id)
    )
  `);

  await safeAlter('ALTER TABLE transactions ADD COLUMN bca_ref TEXT');
  await safeAlter('CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_bca_ref ON transactions(bca_ref)');
  await safeAlter("ALTER TABLE transactions ADD COLUMN payment_method TEXT DEFAULT 'qris'");
  await run('CREATE INDEX IF NOT EXISTS idx_transactions_merchant_status ON transactions(merchant_id, status)');
  await run('CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions(external_id)');

  // 6. Seed default RBAC roles & permissions
  await run("INSERT OR IGNORE INTO roles (name, description) VALUES ('admin', 'Administrator Sistem dengan akses penuh')");
  await run("INSERT OR IGNORE INTO roles (name, description) VALUES ('user', 'Operator Kasir dengan akses lihat transaksi & monitor')");

  const defaultPerms = [
    ['users:manage', 'Mengelola daftar user dan administrator'],
    ['merchants:write', 'Menambah, mengubah, dan menghapus akun merchant'],
    ['transactions:read', 'Melihat data transaksi dan statistik']
  ];
  for (const [code, desc] of defaultPerms) {
    await run('INSERT OR IGNORE INTO permissions (code, description) VALUES (?, ?)', [code, desc]);
  }

  const adminRole = await get("SELECT id FROM roles WHERE name = 'admin'");
  const userRole = await get("SELECT id FROM roles WHERE name = 'user'");
  const allPerms = await all('SELECT id, code FROM permissions');
  if (adminRole) {
    for (const p of allPerms) {
      await run('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [adminRole.id, p.id]);
    }
  }
  if (userRole) {
    const readPerm = allPerms.find((p) => p.code === 'transactions:read');
    if (readPerm) {
      await run('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [userRole.id, readPerm.id]);
    }
  }

  // 7. Bootstrap & sync primary admin + seed users from .env
  await bootstrapAdminAndUsers({ run, get, all }, customEnvConfig);
};

module.exports = {
  db,
  run,
  get,
  all,
  initDb
};

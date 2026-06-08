const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'gateway.db');
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

// Initialize DB schemas
const initDb = async () => {
  // Create Users Table
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create Merchants Table
  await run(`
    CREATE TABLE IF NOT EXISTS merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bca_user TEXT,
      bca_pass TEXT,
      static_qris TEXT,
      status TEXT DEFAULT 'active',
      api_key TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create Transactions Table
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES merchants (id)
    )
  `);

  // Migrate existing DB if needed
  try {
    await run("ALTER TABLE transactions ADD COLUMN bca_ref TEXT");
    await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_bca_ref ON transactions(bca_ref)");
  } catch (e) {
    // Column already exists
  }

  // Migrate crypto columns for merchants and transactions
  try {
    await run("ALTER TABLE merchants ADD COLUMN crypto_address TEXT");
  } catch (e) {
    // Column already exists
  }

  try {
    await run("ALTER TABLE transactions ADD COLUMN payment_method TEXT DEFAULT 'qris'");
  } catch (e) {
    // Column already exists
  }

  try {
    await run("ALTER TABLE transactions ADD COLUMN crypto_amount REAL");
  } catch (e) {
    // Column already exists
  }

  try {
    await run("ALTER TABLE transactions ADD COLUMN crypto_rate REAL");
  } catch (e) {
    // Column already exists
  }

  try {
    await run("ALTER TABLE transactions ADD COLUMN crypto_tx_hash TEXT");
    await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_crypto_hash ON transactions(crypto_tx_hash)");
  } catch (e) {
    // Column/index already exists
  }

  try {
    await run("ALTER TABLE merchants ADD COLUMN coinbase_api_key TEXT");
  } catch (e) {
    // Column already exists
  }

  try {
    await run("ALTER TABLE merchants ADD COLUMN coinbase_webhook_secret TEXT");
  } catch (e) {
    // Column already exists
  }

  try {
    await run("ALTER TABLE transactions ADD COLUMN coinbase_charge_code TEXT");
    await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_coinbase_code ON transactions(coinbase_charge_code)");
  } catch (e) {
    // Column/index already exists
  }

  // Seed default admin if table is empty
  const adminExists = await get('SELECT id FROM users WHERE email = ?', ['admin@gateway.com']);
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await run(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
      ['admin@gateway.com', hashedPassword, 'admin']
    );
    console.log('Default admin seeded: admin@gateway.com / admin123');
  }
};

module.exports = {
  db,
  run,
  get,
  all,
  initDb
};

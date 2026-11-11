const fs = require('fs');
const path = require('path');

/**
 * Load .env file from project root without overriding already-set process.env variables.
 */
function loadDotEnv(envFilePath = path.join(__dirname, '..', '..', '.env')) {
  if (!fs.existsSync(envFilePath)) return false;
  const envContent = fs.readFileSync(envFilePath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    if (!key) return;
    let val = trimmed.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  });
  return true;
}

function parseBoolean(val, defaultVal = false) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const norm = String(val).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(norm)) return true;
  if (['false', '0', 'no', 'off'].includes(norm)) return false;
  return defaultVal;
}

function parseIntSafe(val, defaultVal, minVal = 1, maxVal = 100000) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const parsed = parseInt(String(val).trim(), 10);
  if (!Number.isFinite(parsed)) return defaultVal;
  return Math.min(Math.max(parsed, minVal), maxVal);
}

function maskEmail(emailStr) {
  if (!emailStr || typeof emailStr !== 'string') return null;
  const s = emailStr.trim();
  if (!s) return null;
  const atIdx = s.indexOf('@');
  if (atIdx > 2) {
    return s.slice(0, 2) + '••••' + s.slice(atIdx);
  }
  if (atIdx > 0) {
    return s.slice(0, 1) + '••••' + s.slice(atIdx);
  }
  return s.slice(0, 2) + '••••';
}

function parseSeedUsers(rawJson) {
  if (!rawJson || typeof rawJson !== 'string' || !rawJson.trim()) return [];
  try {
    const parsed = JSON.parse(rawJson.trim());
    if (!Array.isArray(parsed)) {
      console.warn('[EnvConfig] SEED_USERS_JSON harus berupa JSON array. Diabaikan.');
      return [];
    }
    const validUsers = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const email = typeof item.email === 'string' ? item.email.trim().toLowerCase() : '';
      const password = typeof item.password === 'string' ? item.password : '';
      const role = item.role === 'admin' ? 'admin' : 'user';
      const isActive = item.is_active === undefined ? true : Boolean(item.is_active);
      if (!email || !password) {
        console.warn('[EnvConfig] Entri SEED_USERS_JSON dilewati karena email/password kosong.');
        continue;
      }
      validUsers.push({ email, password, role, is_active: isActive ? 1 : 0 });
    }
    return validUsers;
  } catch (err) {
    console.warn('[EnvConfig] Gagal mem-parse SEED_USERS_JSON:', err.message);
    return [];
  }
}

function getEnvConfig(env = process.env) {
  const rawMode = String(env.USER_MANAGEMENT_MODE || 'hybrid').trim().toLowerCase();
  const validModes = ['hybrid', 'env_only', 'db_only'];
  const userManagementMode = validModes.includes(rawMode) ? rawMode : 'hybrid';
  if (!validModes.includes(rawMode)) {
    console.warn(`[EnvConfig] USER_MANAGEMENT_MODE="${rawMode}" tidak valid, fallback ke "hybrid".`);
  }

  const nodeEnv = String(env.NODE_ENV || 'development').trim().toLowerCase();
  const adminEmail = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = String(env.ADMIN_PASSWORD || '');

  return {
    port: parseIntSafe(env.PORT, 3005, 1, 65535),
    node_env: nodeEnv,
    jwt_secret: String(env.JWT_SECRET || ''),
    jwt_expires_hours: parseIntSafe(env.JWT_EXPIRES_HOURS, 24, 1, 8760),
    bcrypt_rounds: parseIntSafe(env.BCRYPT_ROUNDS, 10, 4, 15),
    user_management_mode: userManagementMode,
    admin_email: adminEmail,
    admin_password: adminPassword,
    admin_sync_on_boot: parseBoolean(env.ADMIN_SYNC_ON_BOOT, true),
    strict_env_admin: parseBoolean(env.STRICT_ENV_ADMIN, false),
    seed_users: parseSeedUsers(env.SEED_USERS_JSON),
    seed_users_sync: parseBoolean(env.SEED_USERS_SYNC, false),
    lock_env_managed_users: parseBoolean(env.LOCK_ENV_MANAGED_USERS, true),
    bca_user: String(env.BCA_USER || '').trim(),
    bca_pass: String(env.BCA_PASS || ''),
    static_qris: String(env.STATIC_QRIS || '').trim()
  };
}

function getPublicEnvStatus(envConfig) {
  const hasBcaUser = Boolean(envConfig.bca_user);
  const hasBcaPass = Boolean(envConfig.bca_pass);
  const hasStaticQris = Boolean(envConfig.static_qris);
  const bcaEnvReady = Boolean(hasBcaUser && hasBcaPass && hasStaticQris);
  const adminEnvConfigured = Boolean(envConfig.admin_email && envConfig.admin_password);

  return {
    user_management_mode: envConfig.user_management_mode,
    admin_env_configured: adminEnvConfigured,
    admin_sync_on_boot: envConfig.admin_sync_on_boot,
    admin_email_masked: adminEnvConfigured ? maskEmail(envConfig.admin_email) : null,
    lock_env_managed_users: envConfig.lock_env_managed_users,
    seed_users_count: Array.isArray(envConfig.seed_users) ? envConfig.seed_users.length : 0,
    bca_env_ready: bcaEnvReady,
    has_bca_user: hasBcaUser,
    has_bca_pass: hasBcaPass,
    has_static_qris: hasStaticQris,
    bca_user_masked: hasBcaUser ? maskEmail(envConfig.bca_user) : null
  };
}

function updateDotEnvValue(key, value, envFilePath = path.join(__dirname, '..', '..', '.env')) {
  const cleanKey = String(key || '').trim();
  if (!cleanKey) {
    throw new Error('Environment key cannot be empty');
  }
  const cleanValue = String(value === undefined || value === null ? '' : value).replace(/\r?\n/g, '').trim();

  let lines = [];
  if (fs.existsSync(envFilePath)) {
    const raw = fs.readFileSync(envFilePath, 'utf8');
    lines = raw.split(/\r?\n/);
  }

  let updated = false;
  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      return line;
    }
    const idx = trimmed.indexOf('=');
    const lineKey = trimmed.slice(0, idx).trim();
    if (lineKey === cleanKey) {
      updated = true;
      return `${cleanKey}=${cleanValue}`;
    }
    return line;
  });

  if (!updated) {
    if (newLines.length > 0 && newLines[newLines.length - 1] !== '') {
      newLines.push('');
    }
    newLines.push(`${cleanKey}=${cleanValue}`);
  }

  let finalContent = newLines.join('\n');
  if (!finalContent.endsWith('\n')) {
    finalContent += '\n';
  }
  fs.writeFileSync(envFilePath, finalContent, 'utf8');
  process.env[cleanKey] = cleanValue;
  return true;
}

function updateDotEnvStaticQris(staticQris, envFilePath = path.join(__dirname, '..', '..', '.env')) {
  return updateDotEnvValue('STATIC_QRIS', staticQris, envFilePath);
}

module.exports = {
  loadDotEnv,
  parseBoolean,
  parseIntSafe,
  maskEmail,
  parseSeedUsers,
  getEnvConfig,
  getPublicEnvStatus,
  updateDotEnvValue,
  updateDotEnvStaticQris
};

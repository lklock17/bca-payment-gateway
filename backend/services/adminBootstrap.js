const bcrypt = require('bcryptjs');
const { getEnvConfig, maskEmail } = require('../config/env');

/**
 * Bootstrap & synchronize Primary Administrator and optional SEED_USERS_JSON from .env
 * into the SQLite users table.
 *
 * Modes:
 * - hybrid   : Primary admin & seed users synced from .env; additional operators CRUD via Dashboard.
 * - env_only : Primary admin & seed users synced from .env; Dashboard user mutations locked.
 * - db_only  : .env only used on initial setup (when no admin exists); runtime changes stay in DB.
 */
async function bootstrapAdminAndUsers(db, customEnvConfig = null) {
  const envConfig = customEnvConfig || getEnvConfig();
  const rounds = envConfig.bcrypt_rounds || 10;
  const adminRoleRow = await db.get('SELECT id FROM roles WHERE name = ?', ['admin']);
  const userRoleRow = await db.get('SELECT id FROM roles WHERE name = ?', ['user']);
  const adminRoleId = adminRoleRow ? adminRoleRow.id : null;
  const userRoleId = userRoleRow ? userRoleRow.id : null;

  const hasEnvAdmin = Boolean(envConfig.admin_email && envConfig.admin_password);

  // Fail-fast / critical warning check in production
  if (envConfig.node_env === 'production') {
    if (!hasEnvAdmin || envConfig.admin_password === 'admin123' || envConfig.admin_password.length < 8) {
      const msg = '[EnvBootstrap] PERINGATAN KEAMANAN: ADMIN_EMAIL / ADMIN_PASSWORD belum diset aman di .env pada NODE_ENV=production!';
      if (envConfig.strict_env_admin) {
        throw new Error(`${msg} (STRICT_ENV_ADMIN=true menghentikan startup).`);
      }
      console.warn(msg);
    }
  }

  // 1. Primary Admin Bootstrap / Sync
  let primaryAdmin = await db.get('SELECT * FROM users WHERE is_primary_admin = 1 LIMIT 1');

  if (hasEnvAdmin) {
    if (!primaryAdmin) {
      // Check if ADMIN_EMAIL already exists in DB (e.g. upgraded DB or pre-seeded)
      const byEnvEmail = await db.get('SELECT * FROM users WHERE LOWER(email) = ?', [envConfig.admin_email]);
      // Or legacy default admin@gateway.com if upgrading old gateway.db
      const legacyAdmin = !byEnvEmail
        ? await db.get("SELECT * FROM users WHERE LOWER(email) = 'admin@gateway.com' AND role = 'admin' LIMIT 1")
        : null;

      const targetToPromote = byEnvEmail || legacyAdmin;

      if (targetToPromote) {
        const passwordMatch = await bcrypt.compare(envConfig.admin_password, targetToPromote.password);
        const hashedPassword = passwordMatch
          ? targetToPromote.password
          : await bcrypt.hash(envConfig.admin_password, rounds);

        await db.run(
          `UPDATE users
             SET email = ?,
                 password = ?,
                 role = 'admin',
                 role_id = ?,
                 is_primary_admin = 1,
                 managed_by_env = 1,
                 is_active = 1,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [envConfig.admin_email, hashedPassword, adminRoleId, targetToPromote.id]
        );
        console.log(`[EnvBootstrap] Primary admin disinkronkan dari .env: ${maskEmail(envConfig.admin_email)}`);
      } else {
        const hashedPassword = await bcrypt.hash(envConfig.admin_password, rounds);
        await db.run(
          `INSERT INTO users (email, password, role, role_id, is_primary_admin, managed_by_env, is_active, updated_at)
           VALUES (?, ?, 'admin', ?, 1, 1, 1, CURRENT_TIMESTAMP)`,
          [envConfig.admin_email, hashedPassword, adminRoleId]
        );
        console.log(`[EnvBootstrap] Primary admin baru dibuat dari .env: ${maskEmail(envConfig.admin_email)}`);
      }
    } else if (envConfig.user_management_mode !== 'db_only' && envConfig.admin_sync_on_boot) {
      const emailChanged = primaryAdmin.email.toLowerCase() !== envConfig.admin_email;
      const passwordChanged = !(await bcrypt.compare(envConfig.admin_password, primaryAdmin.password));
      const needsFlagUpdate =
        primaryAdmin.role !== 'admin' ||
        primaryAdmin.is_active !== 1 ||
        primaryAdmin.managed_by_env !== 1 ||
        primaryAdmin.role_id !== adminRoleId;

      if (emailChanged || passwordChanged || needsFlagUpdate) {
        if (emailChanged) {
          // Ensure no duplicate email collision with another non-primary row
          const collision = await db.get(
            'SELECT id FROM users WHERE LOWER(email) = ? AND id != ?',
            [envConfig.admin_email, primaryAdmin.id]
          );
          if (collision) {
            throw new Error(
              `[EnvBootstrap] Konflik ADMIN_EMAIL (${maskEmail(envConfig.admin_email)}) sudah digunakan oleh user ID #${collision.id}.`
            );
          }
        }

        const nextHash = passwordChanged
          ? await bcrypt.hash(envConfig.admin_password, rounds)
          : primaryAdmin.password;

        await db.run(
          `UPDATE users
             SET email = ?,
                 password = ?,
                 role = 'admin',
                 role_id = ?,
                 is_primary_admin = 1,
                 managed_by_env = 1,
                 is_active = 1,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [envConfig.admin_email, nextHash, adminRoleId, primaryAdmin.id]
        );
        console.log(`[EnvBootstrap] Primary admin diperbarui mengikuti .env (ADMIN_SYNC_ON_BOOT=true): ${maskEmail(envConfig.admin_email)}`);
      }
    }
  } else {
    // Fallback when ADMIN_EMAIL / ADMIN_PASSWORD are not yet configured in .env
    if (!primaryAdmin) {
      const existingAdmin = await db.get(
        "SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1"
      );
      if (existingAdmin) {
        await db.run(
          `UPDATE users
             SET is_primary_admin = 1,
                 role_id = COALESCE(role_id, ?),
                 is_active = COALESCE(is_active, 1),
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [adminRoleId, existingAdmin.id]
        );
      } else {
        const fallbackEmail = 'admin@gateway.com';
        const fallbackPass = 'admin123';
        const hashedPassword = await bcrypt.hash(fallbackPass, rounds);
        await db.run(
          `INSERT INTO users (email, password, role, role_id, is_primary_admin, managed_by_env, is_active, updated_at)
           VALUES (?, ?, 'admin', ?, 1, 0, 1, CURRENT_TIMESTAMP)`,
          [fallbackEmail, hashedPassword, adminRoleId]
        );
        console.warn('[EnvBootstrap] ADMIN_EMAIL/ADMIN_PASSWORD belum diset di .env. Akun fallback dev dibuat: admin@gateway.com (segera atur .env untuk produksi).');
      }
    }
  }

  // 2. Provision optional SEED_USERS_JSON
  if (Array.isArray(envConfig.seed_users) && envConfig.seed_users.length > 0) {
    for (const seedItem of envConfig.seed_users) {
      if (hasEnvAdmin && seedItem.email === envConfig.admin_email) continue;

      const targetRoleId = seedItem.role === 'admin' ? adminRoleId : userRoleId;
      const existingUser = await db.get('SELECT * FROM users WHERE LOWER(email) = ?', [seedItem.email]);

      if (!existingUser) {
        const hashedPassword = await bcrypt.hash(seedItem.password, rounds);
        await db.run(
          `INSERT INTO users (email, password, role, role_id, is_primary_admin, managed_by_env, is_active, updated_at)
           VALUES (?, ?, ?, ?, 0, 1, ?, CURRENT_TIMESTAMP)`,
          [seedItem.email, hashedPassword, seedItem.role, targetRoleId, seedItem.is_active]
        );
        console.log(`[EnvBootstrap] Seed user dibuat dari .env: ${maskEmail(seedItem.email)} (${seedItem.role})`);
      } else if (envConfig.user_management_mode !== 'db_only' && envConfig.seed_users_sync) {
        const passwordChanged = !(await bcrypt.compare(seedItem.password, existingUser.password));
        const needsUpdate =
          passwordChanged ||
          existingUser.role !== seedItem.role ||
          existingUser.is_active !== seedItem.is_active ||
          existingUser.managed_by_env !== 1 ||
          existingUser.role_id !== targetRoleId;

        if (needsUpdate) {
          const nextHash = passwordChanged
            ? await bcrypt.hash(seedItem.password, rounds)
            : existingUser.password;

          await db.run(
            `UPDATE users
               SET password = ?,
                   role = ?,
                   role_id = ?,
                   managed_by_env = 1,
                   is_active = ?,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [nextHash, seedItem.role, targetRoleId, seedItem.is_active, existingUser.id]
          );
          console.log(`[EnvBootstrap] Seed user disinkronkan dari .env: ${maskEmail(seedItem.email)}`);
        }
      }
    }
  }
}

module.exports = {
  bootstrapAdminAndUsers
};

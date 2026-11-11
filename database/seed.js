const { loadDotEnv, getEnvConfig } = require('../backend/config/env');
const database = require('../database');

async function runSeed() {
  loadDotEnv();
  const envConfig = getEnvConfig();
  console.log(`[Seed] Menjalankan inisialisasi & sinkronisasi user (Mode: ${envConfig.user_management_mode})...`);
  await database.initDb(envConfig);
  console.log('[Seed] Selesai.');
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed] Gagal:', err);
      process.exit(1);
    });
}

module.exports = { runSeed };

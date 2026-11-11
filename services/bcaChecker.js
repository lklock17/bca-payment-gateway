const database = require('../database');
const bcaScraper = require('./bcaScraper');
const qrisUtil = require('../utils/qris');
const { updateDotEnvStaticQris } = require('../backend/config/env');

/**
 * Dispatches a webhook notification to the merchant's endpoint.
 * Retries up to 3 times in case of failures.
 */
async function dispatchWebhook(transaction) {
  if (!transaction.webhook_url) {
    console.log(`[Webhook] No webhook URL configured for transaction ${transaction.id}`);
    return;
  }

  const payload = {
    transaction_id: transaction.id,
    external_id: transaction.external_id,
    amount: transaction.amount,
    status: 'success',
    updated_at: new Date().toISOString()
  };

  console.log(`[Webhook] Sending payment notification for Tx ${transaction.id} to ${transaction.webhook_url}...`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(transaction.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payment-Signature': 'sha256-signature-placeholder' // Signature header for security
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log(`[Webhook] Webhook dispatched successfully to ${transaction.webhook_url} (Attempt ${attempt})`);
        return true;
      } else {
        console.warn(`[Webhook] Receiver returned status ${response.status} (Attempt ${attempt}/3)`);
      }
    } catch (err) {
      console.error(`[Webhook] Failed to dispatch webhook (Attempt ${attempt}/3):`, err.message);
    }
    // Wait 2 seconds before retry
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.error(`[Webhook] Max retries reached. Failed to send webhook for Tx ${transaction.id}`);
  return false;
}

/**
 * Updates transaction status to success and triggers webhook dispatch.
 */
async function markTransactionSuccess(txId, bcaRef = null) {
  try {
    const tx = await database.get('SELECT * FROM transactions WHERE id = ?', [txId]);
    if (!tx || tx.status !== 'pending') return;

    await database.run(
      'UPDATE transactions SET status = ?, bca_ref = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['success', bcaRef, txId]
    );

    console.log(`[Checker] Transaction ${txId} (Ext: ${tx.external_id}) marked as SUCCESS (Ref: ${bcaRef}).`);

    // Dispatch webhook asynchronously
    dispatchWebhook(tx).catch(err => console.error('[Webhook Dispatch Error]', err));
  } catch (err) {
    console.error(`[Checker] Error marking transaction ${txId} as success:`, err);
  }
}

// Map to track the last keep-alive check for each merchant (merchantId -> timestamp)
const lastPollTimes = {};
// Map to track one-time background static QRIS auto-fetch attempts (merchantId -> credential signature)
const staticQrisSyncAttempted = {};
let isChecking = false;

/**
 * Core polling logic to check pending transactions against BCA Merchant accounts.
 * Keeps browser sessions running 24/7 (standby) and runs a 2-minute keep-alive for idle merchants.
 */
async function checkPendingTransactions() {
  if (isChecking) {
    console.log('[Checker] A polling cycle is already active. Skipping this run.');
    return;
  }
  isChecking = true;
  try {
    // 1. Dapatkan daftar seluruh merchant yang aktif
    const merchants = await database.all("SELECT * FROM merchants WHERE status = 'active'");
    if (merchants.length === 0) return;

    // 2. Dapatkan seluruh transaksi pending (Invoice aktif)
    const pendingTxs = await database.all(`
      SELECT * FROM transactions 
      WHERE status = 'pending' 
        AND created_at >= datetime('now', '-1 hour')
    `);

    // Kelompokkan transaksi pending berdasarkan merchant_id
    const pendingByMerchant = {};
    for (const tx of pendingTxs) {
      if (!pendingByMerchant[tx.merchant_id]) {
        pendingByMerchant[tx.merchant_id] = [];
      }
      pendingByMerchant[tx.merchant_id].push(tx);
    }

    const now = Date.now();

    for (const merchant of merchants) {
      const bcaUser = merchant.bca_user || process.env.BCA_USER;
      const bcaPass = merchant.bca_pass || process.env.BCA_PASS;
      if (!bcaUser || !bcaPass) {
        continue;
      }

      // Auto-fetch Static QRIS once in background if DB static_qris or .env STATIC_QRIS is empty
      const credSig = `${bcaUser}:${bcaPass.length}`;
      const needsDbQris = !merchant.static_qris || merchant.static_qris.trim() === '';
      const needsEnvQris = !process.env.STATIC_QRIS || process.env.STATIC_QRIS.trim() === '';
      if ((needsDbQris || needsEnvQris) && staticQrisSyncAttempted[merchant.id] !== credSig) {
        staticQrisSyncAttempted[merchant.id] = credSig;
        try {
          console.log(`[Checker] Menjalankan auto-fetch QRIS Statis dari KlikBCA untuk merchant "${merchant.name}" (DB kosong: ${needsDbQris}, .env kosong: ${needsEnvQris})...`);
          const fetchedQris = await bcaScraper.fetchStaticQris(bcaUser, bcaPass);
          if (fetchedQris && qrisUtil.validateQRIS(fetchedQris)) {
            await database.run('UPDATE merchants SET static_qris = ? WHERE id = ?', [fetchedQris, merchant.id]);
            merchant.static_qris = fetchedQris;
            updateDotEnvStaticQris(fetchedQris);
            console.log(`[Checker] Static QRIS berhasil di-auto-fetch dari KlikBCA dan diperbarui ke DB & .env untuk merchant "${merchant.name}".`);
          }
        } catch (qrisErr) {
          console.warn(`[Checker] Auto-fetch Static QRIS gagal untuk merchant "${merchant.name}":`, qrisErr.message);
        }
      }

      const hasPending = pendingByMerchant[merchant.id] && pendingByMerchant[merchant.id].length > 0;
      const lastPoll = lastPollTimes[merchant.id] || 0;
      const timeSinceLastPoll = now - lastPoll;

      // ATURAN POLLING STANDBY:
      // - Jika ada transaksi pending: Cek setiap 10 detik (sangat responsif).
      // - Jika IDLE (tidak ada transaksi): Cek setiap 1 menit (60000ms) untuk keep-alive agar sesi KlikBCA tidak logout.
      if (hasPending || timeSinceLastPoll >= 60000) {
        lastPollTimes[merchant.id] = now;
        
        console.log(`[Checker] Polling merchant "${merchant.name}" (Pending: ${hasPending ? 'YA (10s)' : 'TIDAK (1m Keep-Alive)'})...`);
        const bcaTransactions = await bcaScraper.fetchBcaTransactions(bcaUser, bcaPass);
        console.log(`[Checker] Scraped transactions count: ${bcaTransactions ? bcaTransactions.length : 0}. Data:`, JSON.stringify(bcaTransactions));

        if (hasPending && bcaTransactions && bcaTransactions.length > 0) {
          for (const tx of pendingByMerchant[merchant.id]) {
            // Cari apakah nominal transaksi cocok dengan mutasi masuk KlikBCA
            let matchedBcaTx = null;
            for (const bcaTx of bcaTransactions) {
              const timeAndAmtMatch = bcaTx.amount === tx.amount && new Date(bcaTx.date).getTime() >= new Date(tx.created_at + ' Z').getTime() - 300000;
              if (timeAndAmtMatch) {
                // Pastikan RRN ini belum pernah digunakan sebelumnya
                const alreadyUsed = await database.get('SELECT id FROM transactions WHERE bca_ref = ?', [bcaTx.ref]);
                if (!alreadyUsed) {
                  matchedBcaTx = bcaTx;
                  break;
                }
              }
            }

            if (matchedBcaTx) {
              console.log(`[Checker] Match found! Transaction ${tx.id} matched with BCA Ref ${matchedBcaTx.ref}.`);
              await markTransactionSuccess(tx.id, matchedBcaTx.ref);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Checker] Error during polling cycle:', err);
  } finally {
    isChecking = false;
  }
}

// Background scheduler
let checkerInterval = null;

function startChecker(intervalMs = 30000) {
  if (checkerInterval) return;
  
  console.log(`[Checker] Starting transaction status background checker (Interval: ${intervalMs}ms)...`);
  setTimeout(() => {
    checkPendingTransactions().catch(err => console.error('[Checker] Initial run error:', err));
  }, 1500);
  checkerInterval = setInterval(checkPendingTransactions, intervalMs);
}

function stopChecker() {
  if (checkerInterval) {
    clearInterval(checkerInterval);
    checkerInterval = null;
    console.log('[Checker] Transaction checker stopped.');
  }
}

module.exports = {
  startChecker,
  stopChecker,
  markTransactionSuccess,
  dispatchWebhook
};

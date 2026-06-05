const database = require('../database');
const bcaScraper = require('./bcaScraper');

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

/**
 * Core polling logic to check pending transactions against BCA Merchant accounts.
 * Keeps browser sessions running 24/7 (standby) and runs a 2-minute keep-alive for idle merchants.
 */
async function checkPendingTransactions() {
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
      if (!merchant.bca_user || !merchant.bca_pass) {
        continue;
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
        const bcaTransactions = await bcaScraper.fetchBcaTransactions(merchant.bca_user, merchant.bca_pass);

        if (hasPending && bcaTransactions && bcaTransactions.length > 0) {
          for (const tx of pendingByMerchant[merchant.id]) {
            // Cari apakah nominal transaksi cocok dengan mutasi masuk KlikBCA
            let matchedBcaTx = null;
            for (const bcaTx of bcaTransactions) {
              const timeAndAmtMatch = bcaTx.amount === tx.amount && new Date(bcaTx.date) >= new Date(tx.created_at);
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
  }
}

// Background scheduler
let checkerInterval = null;

function startChecker(intervalMs = 30000) {
  if (checkerInterval) return;
  
  console.log(`[Checker] Starting transaction status background checker (Interval: ${intervalMs}ms)...`);
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

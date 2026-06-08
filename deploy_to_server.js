const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

conn.on('ready', () => {
  console.log('[SSH] Connected to 168.144.39.71 for deployment...');
  
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('[SFTP] Error:', err);
      conn.end();
      return;
    }

    const filesToUpload = [
      { local: 'database.js', remote: '/opt/bcagateaway/database.js' },
      { local: 'server.js', remote: '/opt/bcagateaway/server.js' },
      { local: 'public/dashboard.html', remote: '/opt/bcagateaway/public/dashboard.html' },
      { local: 'public/tester.html', remote: '/opt/bcagateaway/public/tester.html' },
      { local: 'public/docs.html', remote: '/opt/bcagateaway/public/docs.html' },
      { local: 'utils/cryptoRates.js', remote: '/opt/bcagateaway/utils/cryptoRates.js' },
      { local: 'utils/qris.js', remote: '/opt/bcagateaway/utils/qris.js' }
    ];

    let uploadIndex = 0;
    function uploadNext() {
      if (uploadIndex >= filesToUpload.length) {
        console.log('[SFTP] All files uploaded successfully.');
        
        // Now restart PM2 on the server
        console.log('[SSH] Restarting bca-gateway process on server...');
        conn.exec('pm2 restart bca-gateway && sleep 5 && pm2 status && tail -n 30 /root/.pm2/logs/bca-gateway-out.log', (execErr, stream) => {
          if (execErr) {
            console.error('[SSH] Failed to execute restart:', execErr);
            conn.end();
            return;
          }

          stream.on('close', (code, signal) => {
            console.log(`[SSH] Commands completed with code ${code}.`);
            conn.end();
          });

          stream.on('data', (data) => {
            process.stdout.write(data.toString());
          });

          stream.stderr.on('data', (data) => {
            process.stderr.write(data.toString());
          });
        });
        return;
      }

      const file = filesToUpload[uploadIndex];
      const localPath = path.join(__dirname, ...file.local.split('/'));
      const remotePath = file.remote;

      console.log(`[SFTP] Uploading ${localPath} to ${remotePath}...`);
      sftp.fastPut(localPath, remotePath, {}, (uploadErr) => {
        if (uploadErr) {
          console.error(`[SFTP] Upload failed for ${file.local}:`, uploadErr.message);
          conn.end();
          return;
        }
        uploadIndex++;
        uploadNext();
      });
    }

    uploadNext();
  });
}).on('error', (err) => {
  console.error('[SSH] Connection error:', err);
}).connect({
  host: '168.144.39.71',
  port: 22,
  username: 'root',
  password: '!*711Maxwin',
  readyTimeout: 30000
});

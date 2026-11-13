const { Client } = require('ssh2');
const { loadDotEnv } = require('./backend/config/env');

loadDotEnv();

const host = process.env.SSH_HOST;
const port = parseInt(process.env.SSH_PORT || '22', 10);
const username = process.env.SSH_USER || 'root';
const password = process.env.SSH_PASSWORD;

if (!host || !password) {
  console.error('[Error] Set SSH_HOST and SSH_PASSWORD in .env or environment variables.');
  process.exit(1);
}

const conn = new Client();

const commands = [
  'echo "=== NODE PROCESSES ==="',
  'ps aux | grep node | grep -v grep',
  'echo ""',
  'echo "=== CHROME PROCESSES ==="',
  'ps aux | grep -E "chrome|chromium" | grep -v grep'
].join('\n');

conn.on('ready', () => {
  conn.exec(commands, (err, stream) => {
    if (err) {
      console.error(err);
      conn.end();
      return;
    }

    let stdout = '';
    stream.on('data', (data) => {
      stdout += data.toString();
    });

    stream.on('close', () => {
      console.log(stdout);
      conn.end();
    });
  });
}).connect({
  host,
  port,
  username,
  password,
  readyTimeout: 10000
});

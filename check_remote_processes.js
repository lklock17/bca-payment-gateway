const { Client } = require('ssh2');

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
  host: '168.144.39.71',
  port: 22,
  username: 'root',
  password: '!*711Maxwin',
  readyTimeout: 10000
});

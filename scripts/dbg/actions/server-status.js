/**
 * Config Server Status Action
 *
 * Checks if the local config HTTP server is running.
 * Output: JSON only to stdout
 */

const fs = require('fs');
const http = require('http');

const CONFIG_SERVER_PID_FILE = '/tmp/sk-config-server.pid';
const PORT = 9600;

function outputJSON(data, exitCode = 0) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(exitCode);
}

function checkHealth() {
  return new Promise((resolve) => {
    http.get(`http://localhost:${PORT}/health`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (_) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function run(args) {
  let pid = null;
  let pidAlive = false;

  if (fs.existsSync(CONFIG_SERVER_PID_FILE)) {
    try {
      pid = parseInt(fs.readFileSync(CONFIG_SERVER_PID_FILE, 'utf8').trim(), 10);
      process.kill(pid, 0);
      pidAlive = true;
    } catch (_) {
      pid = null;
    }
  }

  const health = await checkHealth();
  const running = pidAlive && health && health.status === 'ok';

  outputJSON({
    running,
    pid: pidAlive ? pid : null,
    port: PORT,
    url: `http://localhost:${PORT}/config`
  }, running ? 0 : 1);
}

module.exports = { run };

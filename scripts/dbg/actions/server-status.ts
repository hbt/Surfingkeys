/**
 * Config Server Status Action
 *
 * Checks if the local config HTTP server is running.
 * Output: JSON only to stdout
 */

export {};

const fs = require('fs');
const http = require('http');
const path = require('path');

const CONFIG_SERVER_PID_FILE = '/tmp/sk-config-server-9600.pid';
const PORT = 9600;

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CHROME_BUILD = path.join(PROJECT_ROOT, 'dist/development/chrome/background.js');

function checkBuildPort() {
  if (!fs.existsSync(CHROME_BUILD)) {
    return { checked: false, reason: 'dist/development/chrome/background.js not found' };
  }
  // The port is baked in as a JSON string literal e.g. "9600"
  const src = fs.readFileSync(CHROME_BUILD, 'utf8');
  const match = src.match(/"(\d+)"(?=[^"]*\/config)/);
  if (!match) {
    return { checked: false, reason: 'could not detect port in background.js' };
  }
  const bakedPort = parseInt(match[1], 10);
  return {
    checked: true,
    bakedPort,
    ok: bakedPort === PORT,
  };
}

function outputJSON(data: unknown, exitCode = 0) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(exitCode);
}

function checkHealth() {
  return new Promise((resolve) => {
    http.get(`http://localhost:${PORT}/health`, (res: unknown) => {
      const r = res as { on: (event: string, cb: (...args: unknown[]) => void) => void };
      let body = '';
      r.on('data', (chunk: unknown) => body += String(chunk));
      r.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (_) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function run(args: unknown[]) {
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
  const running = pidAlive && health && (health as Record<string, unknown>)['status'] === 'ok';
  const buildCheck = checkBuildPort();

  const warnings = [];
  if (buildCheck.checked && !buildCheck.ok) {
    warnings.push(`chrome build has port ${buildCheck.bakedPort} baked in — extension will show "Config server unreachable". Run: npm run build:dev`);
  } else if (!buildCheck.checked) {
    warnings.push(`could not verify chrome build port: ${buildCheck.reason}`);
  }

  outputJSON({
    running,
    pid: pidAlive ? pid : null,
    port: PORT,
    url: `http://localhost:${PORT}/config`,
    build: buildCheck.checked ? { port: buildCheck.bakedPort, ok: buildCheck.ok } : { ok: null, reason: buildCheck.reason },
    ...(warnings.length ? { warnings } : {}),
  }, running ? 0 : 1);
}

module.exports = { run };

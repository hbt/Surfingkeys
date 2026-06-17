/**
 * Config Server Restart Action
 *
 * Stops the running config server (if any) then starts a fresh one.
 * Output: JSON only to stdout
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import http from 'http';

const CONFIG_SERVER_PID_FILE = '/tmp/sk-config-server-9600.pid';
const CONFIG_SERVER_LOG_FILE = '/tmp/sk-config-server.log';
const SERVER_SCRIPT = path.join(__dirname, '../../server.ts');
const PORT = 9600;

function outputJSON(data: unknown, exitCode = 0) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(exitCode);
}

function checkHealth(): Promise<unknown> {
  return new Promise((resolve) => {
    http.get(`http://localhost:${PORT}/health`, (res: unknown) => {
      const r = res as { on: (event: string, cb: (...args: unknown[]) => void) => void };
      let body = '';
      r.on('data', (chunk: unknown) => body += String(chunk));
      r.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (_) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function stopIfRunning(): Promise<number | null> {
  if (!fs.existsSync(CONFIG_SERVER_PID_FILE)) return null;

  const pid = parseInt(fs.readFileSync(CONFIG_SERVER_PID_FILE, 'utf8').trim(), 10);

  try {
    process.kill(pid, 0);
  } catch (_) {
    fs.unlinkSync(CONFIG_SERVER_PID_FILE);
    return null;
  }

  process.kill(pid, 'SIGTERM');
  await new Promise((r) => setTimeout(r, 500));

  try {
    process.kill(pid, 0);
    process.kill(pid, 'SIGKILL');
    await new Promise((r) => setTimeout(r, 200));
  } catch (_) { /* already gone */ }

  if (fs.existsSync(CONFIG_SERVER_PID_FILE)) fs.unlinkSync(CONFIG_SERVER_PID_FILE);

  return pid;
}

async function run(_args: unknown[]) {
  const stoppedPid = await stopIfRunning();

  try {
    const logFd = fs.openSync(CONFIG_SERVER_LOG_FILE, 'a');
    const server = spawn('bun', [SERVER_SCRIPT], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
    fs.closeSync(logFd);
    server.unref();

    await new Promise((r) => setTimeout(r, 500));
    const health = await checkHealth();

    if (health && (health as Record<string, unknown>)['status'] === 'ok') {
      outputJSON({
        success: true,
        message: 'Config server restarted',
        stopped: stoppedPid ?? 'not running',
        pid: server.pid,
        port: PORT,
        url: `http://localhost:${PORT}/config`,
        log: CONFIG_SERVER_LOG_FILE,
      });
    } else {
      outputJSON({
        success: false,
        error: 'Config server failed to start after restart',
        log: CONFIG_SERVER_LOG_FILE,
      }, 1);
    }
  } catch (error) {
    outputJSON({ success: false, error: (error as Error).message }, 1);
  }
}

export { run };

/**
 * Config Server Start Action
 *
 * Starts the local config HTTP server on port 9600.
 * The extension fetches config from this server on startup.
 *
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
  // Check if already running
  if (fs.existsSync(CONFIG_SERVER_PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(CONFIG_SERVER_PID_FILE, 'utf8').trim(), 10);
      process.kill(pid, 0); // Check if process exists
      outputJSON({
        success: false,
        error: 'Config server is already running',
        pid,
        port: PORT,
        hint: 'Use "bin/dbg server-stop" to stop it first'
      }, 1);
      return;
    } catch (err) {
      // PID file exists but process doesn't, clean it up
      fs.unlinkSync(CONFIG_SERVER_PID_FILE);
    }
  }

  try {
    const logFd = fs.openSync(CONFIG_SERVER_LOG_FILE, 'a');

    const server = spawn('bun', [SERVER_SCRIPT], {
      detached: true,
      stdio: ['ignore', logFd, logFd]
    });

    fs.closeSync(logFd);

    server.unref();

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify via health check
    const health = await checkHealth();

    if (health && (health as Record<string, unknown>)['status'] === 'ok') {
      outputJSON({
        success: true,
        message: 'Config server started',
        pid: server.pid,
        port: PORT,
        url: `http://localhost:${PORT}/config`,
        log: CONFIG_SERVER_LOG_FILE
      }, 0);
    } else {
      // Check if process is still alive
      try {
        process.kill(server.pid!, 0);
        outputJSON({
          success: false,
          error: 'Config server started but health check failed',
          pid: server.pid,
          log: CONFIG_SERVER_LOG_FILE
        }, 1);
      } catch (_) {
        if (fs.existsSync(CONFIG_SERVER_PID_FILE)) {
          fs.unlinkSync(CONFIG_SERVER_PID_FILE);
        }
        outputJSON({
          success: false,
          error: 'Config server failed to start',
          log: CONFIG_SERVER_LOG_FILE
        }, 1);
      }
    }

  } catch (error) {
    outputJSON({
      success: false,
      error: (error as Error).message
    }, 1);
  }
}

export { run };

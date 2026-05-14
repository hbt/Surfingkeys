/**
 * CDP Proxy Start Action
 *
 * Starts a WebSocket proxy for stateless CDP communication.
 * Uses the reusable proxy-core module for the actual proxy logic.
 * See docs/cdp/proxy.md for usage instructions.
 *
 * Output: JSON only to stdout
 * Logs: Written to /tmp/dbg-proxy.jsonl (JSONL format, one JSON object per line)
 */

import fs from 'fs';
import path from 'path';
import { createProxy } from '../lib/proxy-core';
import { config, outputJSON, isProxyRunning } from './proxy-config';

/**
 * Main action runner
 */
async function run(args: unknown[]) {
  // Check if already running
  const status = isProxyRunning();
  if (status.running) {
    outputJSON({
      success: false,
      error: 'Proxy already running',
      pid: status.pid,
      port: config.PROXY_PORT,
      hint: 'Use "bin/dbg proxy-stop" to stop it first',
      docs: 'docs/cdp/proxy.md'
    }, 1);
    return;
  }

  try {
    // Create proxy instance with config values
    const proxyResult = await createProxy({
      port: config.PROXY_PORT,
      logFile: config.LOG_FILE,
      cdpPort: config.CDP_PORT,
      cdpHost: config.CDP_HOST
    });

    const { server, shutdown } = proxyResult;

    // Write PID file
    fs.writeFileSync(config.PID_FILE, process.pid.toString());

    // Setup graceful shutdown
    const gracefulShutdown = () => {
      shutdown();

      if (fs.existsSync(config.PID_FILE)) {
        fs.unlinkSync(config.PID_FILE);
      }

      process.exit(0);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    // Output success JSON
    outputJSON({
      success: true,
      pid: process.pid,
      proxy: {
        host: '127.0.0.1',
        port: config.PROXY_PORT,
        url: `ws://127.0.0.1:${config.PROXY_PORT}`
      },
      cdp: {
        host: config.CDP_HOST,
        port: config.CDP_PORT
      },
      log: config.LOG_FILE,
      docs: 'docs/cdp/proxy.md'
    });

    // Keep process alive - server will handle connections

  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      outputJSON({
        success: false,
        error: `Port ${config.PROXY_PORT} is already in use`,
        port: config.PROXY_PORT,
        hint: 'Check if proxy is running: "bin/dbg proxy-status"',
        docs: 'docs/cdp/proxy.md'
      }, 1);
    } else {
      outputJSON({
        success: false,
        error: (error as Error).message,
        docs: 'docs/cdp/proxy.md'
      }, 1);
    }
  }
}

export { run };

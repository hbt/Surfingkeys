#!/usr/bin/env bun
/**
 * Surfingkeys Config Server
 *
 * Serves .surfingkeysrc.js over HTTP so the extension can fetch it on startup
 * without requiring CDP or debug ports.
 *
 * Port: 9600
 * PID file: /tmp/sk-config-server.pid
 */

import { existsSync } from 'fs';
import { resolve } from 'path';

const PORT = 9600;
const PID_FILE = '/tmp/sk-config-server.pid';
const CONFIG_FILE = resolve(import.meta.dir, '../.surfingkeysrc.js');

function log(method: string, path: string, status: number, bytes: number): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${method} ${path} → ${status} (${bytes} bytes)`);
}

function healthResponse(): Response {
  const body = JSON.stringify({ status: 'ok', file: CONFIG_FILE });
  log('GET', '/health', 200, body.length);
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function configResponse(): Response {
  if (!existsSync(CONFIG_FILE)) {
    const body = `/* Config file not found: ${CONFIG_FILE} */`;
    log('GET', '/config', 404, body.length);
    return new Response(body, {
      status: 404,
      headers: {
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const content = Bun.file(CONFIG_FILE);
  return content.text().then((text: string) => {
    log('GET', '/config', 200, text.length);
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }) as unknown as Response;
}

function notFound(path: string): Response {
  const body = 'Not Found';
  log('GET', path, 404, body.length);
  return new Response(body, { status: 404 });
}

// Write PID file
Bun.write(PID_FILE, String(process.pid));
console.log(`[${new Date().toISOString()}] Config server starting on port ${PORT}`);
console.log(`[${new Date().toISOString()}] Serving: ${CONFIG_FILE}`);
console.log(`[${new Date().toISOString()}] PID: ${process.pid} → ${PID_FILE}`);

// Graceful shutdown
function shutdown(): void {
  console.log(`\n[${new Date().toISOString()}] Shutting down...`);
  try {
    const fs = require('fs');
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch (_) {}
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

Bun.serve({
  port: PORT,
  fetch(req: Request): Response | Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/health') return healthResponse();
    if (url.pathname === '/config') return configResponse();
    return notFound(url.pathname);
  }
});

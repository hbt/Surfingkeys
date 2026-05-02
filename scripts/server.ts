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

import { existsSync, appendFileSync } from 'fs';
import { resolve } from 'path';

const DEBUG_LOG_FILE = '/tmp/sk-debug.log';

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

function configResponse(origin: string | null): Response | Promise<Response> {
  // Only serve to chrome-extension:// origins (or no Origin = curl/direct)
  if (origin !== null && !origin.startsWith('chrome-extension://')) {
    const body = 'Forbidden';
    log('GET', '/config', 403, body.length);
    return new Response(body, { status: 403 });
  }

  const corsHeaders: Record<string, string> = {
    'Content-Type': 'application/javascript',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {})
  };

  if (!existsSync(CONFIG_FILE)) {
    const body = `/* Config file not found: ${CONFIG_FILE} */`;
    log('GET', '/config', 404, body.length);
    return new Response(body, { status: 404, headers: corsHeaders });
  }

  const content = Bun.file(CONFIG_FILE);
  return content.text().then((text: string) => {
    log('GET', '/config', 200, text.length);
    return new Response(text, { status: 200, headers: corsHeaders });
  });
}

function loadedResponse(req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  if (origin !== null && !origin.startsWith('chrome-extension://')) {
    const body = 'Forbidden';
    log('POST', '/loaded', 403, body.length);
    return Promise.resolve(new Response(body, { status: 403 }));
  }

  return req.json().then((data: { snippetsLength?: number }) => {
    const snippetsLength = data?.snippetsLength ?? '?';
    const ts = new Date().toISOString();
    console.log(`[${ts}] POST /loaded ← snippetsLength=${snippetsLength}`);
    const body = JSON.stringify({ ok: true });
    log('POST', '/loaded', 200, body.length);
    const corsHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(origin ? { 'Access-Control-Allow-Origin': origin } : {})
    };
    return new Response(body, { status: 200, headers: corsHeaders });
  }).catch(() => {
    const body = JSON.stringify({ ok: true });
    log('POST', '/loaded', 200, body.length);
    return new Response(body, { status: 200 });
  });
}

function logEntryResponse(req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  if (origin !== null && !origin.startsWith('chrome-extension://')) {
    const body = 'Forbidden';
    log('POST', '/log', 403, body.length);
    return Promise.resolve(new Response(body, { status: 403 }));
  }

  const corsHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {})
  };

  return req.json().then((data: { context?: string; message?: string; data?: unknown; timestamp?: number }) => {
    const line = JSON.stringify(data) + '\n';
    try {
      appendFileSync(DEBUG_LOG_FILE, line);
    } catch (_) {}
    const body = JSON.stringify({ ok: true });
    log('POST', '/log', 200, body.length);
    return new Response(body, { status: 200, headers: corsHeaders });
  }).catch(() => {
    const body = JSON.stringify({ ok: true });
    return new Response(body, { status: 200, headers: corsHeaders });
  });
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
    if (url.pathname === '/config') return configResponse(req.headers.get('Origin'));
    if (url.pathname === '/loaded' && req.method === 'POST') return loadedResponse(req);
    if (url.pathname === '/log' && req.method === 'POST') return logEntryResponse(req);
    return notFound(url.pathname);
  }
});

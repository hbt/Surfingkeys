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

import { existsSync, appendFileSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

const DEBUG_LOG_FILE = '/tmp/sk-debug.log';
const ERROR_LOG_FILE = resolve(import.meta.dir, '../log/errors.jsonl');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 9600;
const PID_FILE = `/tmp/sk-config-server-${PORT}.pid`;
const CONFIG_FILE = process.env.CONFIG_FILE
    ? resolve(process.cwd(), process.env.CONFIG_FILE)
    : resolve(import.meta.dir, '../.surfingkeysrc.js');
const DOMAIN_FILES_DIR = process.env.DOMAIN_FILES_DIR
    ? resolve(process.cwd(), process.env.DOMAIN_FILES_DIR)
    : '/home/hassen/config/js';

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

function errorEntryResponse(req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  if (origin !== null && !origin.startsWith('chrome-extension://')) {
    log('POST', '/errors', 403, 9);
    return Promise.resolve(new Response('Forbidden', { status: 403 }));
  }
  const corsHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {})
  };
  return req.json().then((data: unknown) => {
    const line = JSON.stringify(data) + '\n';
    try {
      mkdirSync(resolve(import.meta.dir, '../log'), { recursive: true });
      appendFileSync(ERROR_LOG_FILE, line);
    } catch (_) {}
    const body = JSON.stringify({ ok: true });
    log('POST', '/errors', 200, body.length);
    return new Response(body, { status: 200, headers: corsHeaders });
  }).catch(() => new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders }));
}

function notFound(path: string): Response {
  const body = 'Not Found';
  log('GET', path, 404, body.length);
  return new Response(body, { status: 404 });
}

async function triggerInspectorResponse(url: URL): Promise<Response> {
  const x = url.searchParams.get('x');
  const y = url.searchParams.get('y');
  if (!x || !y || isNaN(Number(x)) || isNaN(Number(y))) {
    return new Response('bad request', { status: 400 });
  }
  const script = `sleep 0.2; xte "mousemove ${x} ${y}"; xdotool click --clearmodifiers 3; xdotool key Up; xdotool key Return`;
  Bun.spawn(['bash', '-c', script], { stdout: 'ignore', stderr: 'ignore' });
  log('GET', '/trigger/inspector', 200, 2);
  return new Response('OK', { status: 200 });
}

async function domainAssetResponse(url: URL): Promise<Response> {
  const host = url.searchParams.get('host');
  const type = url.searchParams.get('type');

  if (!host || !type || (type !== 'js' && type !== 'css')) {
    const body = 'bad request';
    log('GET', '/domain-asset', 400, body.length);
    return new Response(body, { status: 400 });
  }
  // Security: reject path traversal attempts
  if (host.includes('/') || host.includes('..') || host.includes('\0')) {
    const body = 'forbidden';
    log('GET', '/domain-asset', 403, body.length);
    return new Response(body, { status: 403 });
  }

  const filePath = `${DOMAIN_FILES_DIR}/${host}.${type}`;
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    log('GET', `/domain-asset?host=${host}&type=${type}`, 404, 0);
    return new Response('not found', { status: 404 });
  }

  const content = await file.text();
  const mime = type === 'js' ? 'application/javascript' : 'text/css';
  log('GET', `/domain-asset?host=${host}&type=${type}`, 200, content.length);
  return new Response(content, {
    status: 200,
    headers: { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' },
  });
}

// ── Eval relay ──────────────────────────────────────────────────────────────

interface PendingEval {
  resolve: (value: Response) => void;
  reject: (reason?: unknown) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

const pendingEvals = new Map<string, PendingEval>();
const sseSubscribers = new Set<ReadableStreamDefaultController>();

function evalOriginAllowed(origin: string | null): boolean {
  return origin === null || origin.startsWith('chrome-extension://');
}

function corsHeaders(origin: string | null): Record<string, string> {
  return origin ? { 'Access-Control-Allow-Origin': origin } : {};
}

function evalStatusResponse(): Response {
  const body = JSON.stringify({
    panelConnected: sseSubscribers.size > 0,
    subscribers: sseSubscribers.size,
  });
  log('GET', '/eval-status', 200, body.length);
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function evalSubscribeResponse(req: Request): Response {
  const origin = req.headers.get('Origin');
  if (!evalOriginAllowed(origin)) {
    return new Response('Forbidden', { status: 403 });
  }

  let controller!: ReadableStreamDefaultController;
  const stream = new ReadableStream({
    start(c) {
      controller = c;
      sseSubscribers.add(controller);
      log('GET', '/eval-subscribe', 200, 0);
    },
    cancel() {
      sseSubscribers.delete(controller);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    },
  });
}

function evalResponse(req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  if (!evalOriginAllowed(origin)) {
    return Promise.resolve(new Response('Forbidden', { status: 403 }));
  }

  return req.json().then(({ target, code }: { target: string; code: string }) => {
    if (sseSubscribers.size === 0) {
      const body = JSON.stringify({ error: 'no panel connected' });
      log('POST', '/eval', 503, body.length);
      return new Response(body, {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = `data: ${JSON.stringify({ id, target, code })}\n\n`;

    return new Promise<Response>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        pendingEvals.delete(id);
        const body = JSON.stringify({ error: 'timeout' });
        log('POST', '/eval', 504, body.length);
        resolve(new Response(body, {
          status: 504,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        }));
      }, 10_000);

      pendingEvals.set(id, { resolve, reject, timeoutHandle });

      // Broadcast to all SSE subscribers
      const encoded = new TextEncoder().encode(payload);
      for (const ctrl of sseSubscribers) {
        try { ctrl.enqueue(encoded); } catch (_) { sseSubscribers.delete(ctrl); }
      }
    });
  });
}

function evalResultResponse(req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  if (!evalOriginAllowed(origin)) {
    return Promise.resolve(new Response('Forbidden', { status: 403 }));
  }

  return req.json().then(({ id, result, error }: { id: string; result?: string; error?: string }) => {
    const pending = pendingEvals.get(id);
    if (!pending) {
      const body = JSON.stringify({ ok: false, reason: 'unknown id' });
      return new Response(body, {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    clearTimeout(pending.timeoutHandle);
    pendingEvals.delete(id);

    const responseBody = error
      ? JSON.stringify({ error })
      : JSON.stringify({ result });

    log('POST', '/eval-result', 200, responseBody.length);
    pending.resolve(new Response(responseBody, {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    }));

    const ackBody = JSON.stringify({ ok: true });
    return new Response(ackBody, {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  });
}

function evalModuleResponse(req: Request): Response {
  // Wraps arbitrary code as an ES module so the SW can import() it from localhost
  // (localhost is in script-src by default; import() doesn't require unsafe-eval)
  const url = new URL(req.url);
  const origin = req.headers.get('Origin');
  const code = url.searchParams.get('code') ?? 'undefined';
  const body = `const __r = await (async () => { return (${code}); })();\nexport { __r as result };\n`;
  log('GET', '/eval-module', 200, body.length);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin ?? '*',
    },
  });
}

function evalScriptResponse(req: Request): Response {
  // Classic (non-module) script loaded via importScripts() in the SW.
  // Evaluates `code` synchronously in SW global scope and stores result in
  // self.__sk_eval_result so the caller can read it after importScripts() returns.
  const url = new URL(req.url);
  const code = url.searchParams.get('code') ?? 'undefined';
  // Wrap in try/catch so a runtime error sets __sk_eval_error instead of throwing
  const body = [
    'try {',
    `  self.__sk_eval_result = (${code});`,
    '  self.__sk_eval_error = undefined;',
    '} catch (e) {',
    '  self.__sk_eval_result = undefined;',
    '  self.__sk_eval_error = e.message;',
    '}',
  ].join('\n') + '\n';
  const origin = req.headers.get('Origin');
  log('GET', '/eval-script', 200, body.length);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin ?? '*',
    },
  });
}

async function editGvimResponse(req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  if (origin !== null && !origin.startsWith('chrome-extension://')) {
    log('POST', '/edit-gvim', 403, 9);
    return new Response('Forbidden', { status: 403 });
  }

  const corsHeaders: Record<string, string> = {
    'Content-Type': 'text/plain',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
  };

  let body: { data?: string; line?: number; column?: number };
  try {
    body = await req.json();
  } catch {
    return new Response('bad request', { status: 400, headers: corsHeaders });
  }

  const content = body.data ?? '';
  const line = body.line ?? 0;
  const column = body.column ?? 0;

  // Write content to temp file (mirrors cvim_server.py mkstemp)
  const tmpPath = join(tmpdir(), `cvim-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(tmpPath, content, 'utf8');

  try {
    const proc = Bun.spawn(['gvim', '-f', tmpPath, '-c', `call cursor(${line}, ${column})`], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await proc.exited;

    const edited = readFileSync(tmpPath, 'utf8');
    log('POST', '/edit-gvim', 200, edited.length);
    return new Response(edited, { status: 200, headers: corsHeaders });
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

// Write PID file
Bun.write(PID_FILE, String(process.pid));
console.log(`[${new Date().toISOString()}] Config server starting on port ${PORT}`);
console.log(`[${new Date().toISOString()}] Serving: ${CONFIG_FILE}`);
console.log(`[${new Date().toISOString()}] Domain files: ${DOMAIN_FILES_DIR}`);
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
  idleTimeout: 0,  // disable timeout — SSE connections must stay open indefinitely
  fetch(req: Request): Response | Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/health') return healthResponse();
    if (url.pathname === '/config') return configResponse(req.headers.get('Origin'));
    if (url.pathname === '/loaded' && req.method === 'POST') return loadedResponse(req);
    if (url.pathname === '/log' && req.method === 'POST') return logEntryResponse(req);
    if (url.pathname === '/errors' && req.method === 'POST') return errorEntryResponse(req);
    if (url.pathname === '/eval-status') return evalStatusResponse();
    if (url.pathname === '/eval-subscribe') return evalSubscribeResponse(req);
    if (url.pathname === '/eval' && req.method === 'POST') return evalResponse(req);
    if (url.pathname === '/eval-result' && req.method === 'POST') return evalResultResponse(req);
    if (url.pathname === '/eval-module') return evalModuleResponse(req);
    if (url.pathname === '/eval-script') return evalScriptResponse(req);
    if (url.pathname === '/edit-gvim' && req.method === 'POST') return editGvimResponse(req);
    if (url.pathname === '/domain-asset') return domainAssetResponse(url);
    if (url.pathname === '/trigger/inspector') return triggerInspectorResponse(url);
    return notFound(url.pathname);
  }
});

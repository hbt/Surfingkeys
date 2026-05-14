/**
 * DevTools Status Action
 *
 * Runs a layered health check of the sk-devtools eval relay:
 *   1. Config server reachable
 *   2. DevTools panel connected (SSE)
 *   3. SW debugger attachment alive (bg eval)
 *   4. Page eval works (page eval)
 *
 * Output: JSON only to stdout
 */

import http from 'http';

const SERVER_PORT = 9600;
const EVAL_TIMEOUT_MS = 6000;

function httpGet(url: string) {
  return new Promise((resolve) => {
    http.get(url, (res: unknown) => {
      const r = res as { statusCode: number; on: (event: string, cb: (...args: unknown[]) => void) => void };
      let body = '';
      r.on('data', (chunk: unknown) => body += String(chunk));
      r.on('end', () => {
        try { resolve({ ok: r.statusCode === 200, status: r.statusCode, body: JSON.parse(body) }); }
        catch (_) { resolve({ ok: r.statusCode === 200, status: r.statusCode, body }); }
      });
    }).on('error', (err: Error) => resolve({ ok: false, error: err.message }));
  });
}

function httpPost(url: string, payload: unknown) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = http.request(url, opts, (res: unknown) => {
      const r = res as { statusCode: number; on: (event: string, cb: (...args: unknown[]) => void) => void };
      let body = '';
      r.on('data', (chunk: unknown) => body += String(chunk));
      r.on('end', () => {
        try { resolve({ ok: r.statusCode === 200, status: r.statusCode, body: JSON.parse(body) }); }
        catch (_) { resolve({ ok: false, status: r.statusCode, body }); }
      });
    });
    req.on('error', (err: Error) => resolve({ ok: false, error: err.message }));
    const timer = setTimeout(() => { req.destroy(); resolve({ ok: false, error: 'timeout' }); }, EVAL_TIMEOUT_MS);
    req.on('close', () => clearTimeout(timer));
    req.write(data);
    req.end();
  });
}

function check(ok: boolean, label: string, detail: unknown, fix: string) {
  return { ok, label, ...(detail ? { detail } : {}), ...(fix && !ok ? { fix } : {}) };
}

async function run() {
  const checks = [];
  const warnings = [];

  // 1. Server reachable
  const health = await httpGet(`http://localhost:${SERVER_PORT}/health`) as Record<string, unknown>;
  const healthBody = health.body as Record<string, unknown> | undefined;
  const serverOk = !!(health.ok && healthBody && healthBody.status === 'ok');
  checks.push(check(serverOk, 'server_reachable',
    serverOk ? `http://localhost:${SERVER_PORT}` : (health.error || `HTTP ${health.status}`),
    'Run: ./bin/dbg server-start'
  ));

  // 2. Panel connected (SSE)
  const evalStatus = await httpGet(`http://localhost:${SERVER_PORT}/eval-status`) as Record<string, unknown>;
  const evalBody = evalStatus.body as Record<string, unknown> | undefined;
  const panelConnected = !!(evalStatus.ok && evalBody && evalBody.panelConnected === true);
  checks.push(check(panelConnected, 'panel_connected',
    panelConnected ? `${evalBody?.subscribers} subscriber(s)` : 'no panel',
    'Open F12 in gchrb → click the "Surfingkeys" tab — badge should show ● Connected'
  ));

  // 3. SW debugger alive (bg eval)
  let swOk = false;
  let swDetail = 'skipped (panel not connected)';
  if (panelConnected) {
    const swEval = await httpPost(`http://localhost:${SERVER_PORT}/eval`, {
      target: 'bg',
      code: 'chrome.runtime.id',
    }) as Record<string, unknown>;
    const swBody = swEval.body as Record<string, unknown> | undefined;
    swOk = !!(swEval.ok && swBody && swBody.result && !swBody.error);
    if (swBody && swBody.error === 'Extension context invalidated.') {
      swDetail = 'SW restarted — debugger lost attachment';
    } else if (swBody && swBody.error === 'timeout') {
      swDetail = 'eval timed out';
    } else if (swOk) {
      swDetail = `extension id: ${swBody?.result}`;
    } else {
      swDetail = swBody && swBody.error ? String(swBody.error) : JSON.stringify(swBody);
    }
  }
  checks.push(check(swOk, 'sw_debugger_attached', swDetail,
    'Close and reopen F12 → click the "Surfingkeys" tab again to reattach'
  ));

  // 4. Page eval works
  let pageOk = false;
  let pageDetail = 'skipped (SW not attached)';
  if (swOk) {
    const pageEval = await httpPost(`http://localhost:${SERVER_PORT}/eval`, {
      target: 'page',
      code: 'document.title',
    }) as Record<string, unknown>;
    const pageBody = pageEval.body as Record<string, unknown> | undefined;
    pageOk = !!(pageEval.ok && pageBody && !pageBody.error);
    pageDetail = pageOk
      ? `page title: ${pageBody?.result}`
      : (pageBody && pageBody.error ? String(pageBody.error) : JSON.stringify(pageBody));
  }
  checks.push(check(pageOk, 'page_eval_works', pageDetail,
    'Ensure F12 is open on a regular web page (not chrome:// or extension page)'
  ));

  const allOk = checks.every(c => c.ok);

  if (!allOk) {
    const failed = checks.filter(c => !c.ok);
    for (const c of failed) {
      if (c.fix) warnings.push(`[${c.label}] ${c.detail} → ${c.fix}`);
    }
  }

  console.log(JSON.stringify({
    ok: allOk,
    checks,
    ...(warnings.length ? { warnings } : {}),
  }, null, 2));

  process.exit(allOk ? 0 : 1);
}

export { run };

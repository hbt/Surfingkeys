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

const http = require('http');

const SERVER_PORT = 9600;
const EVAL_TIMEOUT_MS = 6000;

function httpGet(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode === 200, status: res.statusCode, body: JSON.parse(body) }); }
        catch (_) { resolve({ ok: res.statusCode === 200, status: res.statusCode, body }); }
      });
    }).on('error', (err) => resolve({ ok: false, error: err.message }));
  });
}

function httpPost(url, payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = http.request(url, opts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode === 200, status: res.statusCode, body: JSON.parse(body) }); }
        catch (_) { resolve({ ok: false, status: res.statusCode, body }); }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    const timer = setTimeout(() => { req.destroy(); resolve({ ok: false, error: 'timeout' }); }, EVAL_TIMEOUT_MS);
    req.on('close', () => clearTimeout(timer));
    req.write(data);
    req.end();
  });
}

function check(ok, label, detail, fix) {
  return { ok, label, ...(detail ? { detail } : {}), ...(fix && !ok ? { fix } : {}) };
}

async function run() {
  const checks = [];
  const warnings = [];

  // 1. Server reachable
  const health = await httpGet(`http://localhost:${SERVER_PORT}/health`);
  const serverOk = health.ok && health.body && health.body.status === 'ok';
  checks.push(check(serverOk, 'server_reachable',
    serverOk ? `http://localhost:${SERVER_PORT}` : (health.error || `HTTP ${health.status}`),
    'Run: ./bin/dbg server-start'
  ));

  // 2. Panel connected (SSE)
  const evalStatus = await httpGet(`http://localhost:${SERVER_PORT}/eval-status`);
  const panelConnected = evalStatus.ok && evalStatus.body && evalStatus.body.panelConnected === true;
  checks.push(check(panelConnected, 'panel_connected',
    panelConnected ? `${evalStatus.body.subscribers} subscriber(s)` : 'no panel',
    'Open F12 in gchrb → click the "Surfingkeys" tab — badge should show ● Connected'
  ));

  // 3. SW debugger alive (bg eval)
  let swOk = false;
  let swDetail = 'skipped (panel not connected)';
  if (panelConnected) {
    const swEval = await httpPost(`http://localhost:${SERVER_PORT}/eval`, {
      target: 'bg',
      code: 'chrome.runtime.id',
    });
    swOk = swEval.ok && swEval.body && swEval.body.result && !swEval.body.error;
    if (swEval.body && swEval.body.error === 'Extension context invalidated.') {
      swDetail = 'SW restarted — debugger lost attachment';
    } else if (swEval.body && swEval.body.error === 'timeout') {
      swDetail = 'eval timed out';
    } else if (swOk) {
      swDetail = `extension id: ${swEval.body.result}`;
    } else {
      swDetail = swEval.body && swEval.body.error ? swEval.body.error : JSON.stringify(swEval.body);
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
    });
    pageOk = pageEval.ok && pageEval.body && !pageEval.body.error;
    pageDetail = pageOk
      ? `page title: ${pageEval.body.result}`
      : (pageEval.body && pageEval.body.error ? pageEval.body.error : JSON.stringify(pageEval.body));
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

module.exports = { run };

/**
 * DevTools Start Action
 *
 * Deterministic, zero-shot sequence that:
 *   1. Snapshots existing windows
 *   2. Launches gchrb
 *   3. Finds + moves + maximizes the new window
 *   4. Activates it and sends F12 / Surfingkeys panel key sequence
 *   5. Polls until panelConnected === true
 *
 * Every step is followed by a verification.
 * All steps write to /tmp/dbg-devtools-start.jsonl — one JSON object per line.
 *
 * Output: JSON to stdout
 */

import { spawnSync, execSync } from 'child_process';
import fs from 'fs';
import http from 'http';

const LOG_FILE = '/tmp/dbg-devtools-start.jsonl';
const SERVER_PORT = 9600;
const TARGET_WORKSPACE = 5;

// ── Logging ───────────────────────────────────────────────────────────────────

let logFd: number | undefined;

function openLog() {
  logFd = fs.openSync(LOG_FILE, 'w');
}

function writeLog(obj: Record<string, unknown>) {
  const line = JSON.stringify({ ts: Math.floor(Date.now() / 1000), ...obj });
  fs.writeSync(logFd!, line + '\n');
}

function closeLog() {
  if (logFd !== undefined) fs.closeSync(logFd);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function cmd(command: string) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

function getWindowSet() {
  const out = cmd('wmctrl -l');
  const ids = new Set();
  for (const line of out.split('\n')) {
    const m = line.match(/^(0x[0-9a-f]+)/i);
    if (m) ids.add(m[1].toLowerCase());
  }
  return ids;
}

function getWindowDesktop(winId: string) {
  const out = cmd('wmctrl -l');
  for (const line of out.split('\n')) {
    const m = line.match(/^(0x[0-9a-f]+)\s+(\d+)/i);
    if (m && m[1].toLowerCase() === winId.toLowerCase()) {
      return parseInt(m[2], 10);
    }
  }
  return null;
}

function getActiveWindow() {
  return cmd('xdotool getactivewindow').trim();
}

function winIdToInt(id: unknown) {
  // xdotool returns decimal; wmctrl returns 0x hex — normalize both to integer
  const s = String(id).trim();
  if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s, 16);
  return parseInt(s, 10);
}

function winIdsMatch(a: unknown, b: unknown) {
  return winIdToInt(a) === winIdToInt(b);
}

function getScreenDimensions() {
  const out = cmd('xdpyinfo | grep dimensions');
  const m = out.match(/(\d+)x(\d+) pixels/);
  if (m) return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
  return null;
}

function getWindowGeometry(winId: string) {
  const out = cmd(`xdotool getwindowgeometry ${winId}`);
  const wm = out.match(/Geometry:\s+(\d+)x(\d+)/);
  if (wm) return { w: parseInt(wm[1], 10), h: parseInt(wm[2], 10) };
  return null;
}

function httpGet(url: string) {
  return new Promise((resolve) => {
    http.get(url, (res: unknown) => {
      const r = res as { statusCode: number; on: (event: string, cb: (...args: unknown[]) => void) => void };
      let body = '';
      r.on('data', (chunk: unknown) => body += String(chunk));
      r.on('end', () => {
        try { resolve({ ok: r.statusCode === 200, body: JSON.parse(body) }); }
        catch (_) { resolve({ ok: r.statusCode === 200, body }); }
      });
    }).on('error', (err: Error) => resolve({ ok: false, error: err.message }));
  });
}

function httpPost(url: string, payload: unknown) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };
    const req = http.request(url, opts, (res: unknown) => {
      const r = res as { statusCode: number; on: (event: string, cb: (...args: unknown[]) => void) => void };
      let body = '';
      r.on('data', (chunk: unknown) => body += String(chunk));
      r.on('end', () => {
        try { resolve({ ok: r.statusCode === 200, body: JSON.parse(body) }); }
        catch (_) { resolve({ ok: false, body }); }
      });
    });
    req.on('error', (err: Error) => resolve({ ok: false, error: err.message }));
    const timer = setTimeout(() => { req.destroy(); resolve({ ok: false, error: 'timeout' }); }, 4000);
    req.on('close', () => clearTimeout(timer));
    req.write(data);
    req.end();
  });
}

async function isAlreadyStarted(): Promise<boolean> {
  try {
    const evalStatus = await httpGet(`http://localhost:${SERVER_PORT}/eval-status`) as Record<string, unknown>;
    const evalBody = evalStatus.body as Record<string, unknown> | undefined;
    if (!(evalStatus.ok && evalBody?.panelConnected === true)) return false;

    const swEval = await httpPost(`http://localhost:${SERVER_PORT}/eval`, { target: 'bg', code: 'chrome.runtime.id' }) as Record<string, unknown>;
    const swBody = swEval.body as Record<string, unknown> | undefined;
    if (!(swEval.ok && swBody?.result && !swBody?.error)) return false;

    const pageEval = await httpPost(`http://localhost:${SERVER_PORT}/eval`, { target: 'page', code: 'document.title' }) as Record<string, unknown>;
    const pageBody = pageEval.body as Record<string, unknown> | undefined;
    return !!(pageEval.ok && pageBody && !pageBody.error);
  } catch (_) {
    return false;
  }
}

// ── Bail helper ───────────────────────────────────────────────────────────────

function bail(step: string, detail: string, hint?: string) {
  const obj = { ok: false, error: step, detail, log: LOG_FILE, ...(hint ? { hint } : {}) };
  writeLog({ step, error: true, detail });
  closeLog();
  console.log(JSON.stringify(obj, null, 2));
  process.exit(1);
}

// ── Steps ─────────────────────────────────────────────────────────────────────

async function run() {
  if (await isAlreadyStarted()) {
    console.log(JSON.stringify({ ok: true, alreadyStarted: true, detail: 'devtools already connected — skipping' }, null, 2));
    process.exit(0);
  }

  openLog();
  const startMs = Date.now();

  // STEP 1: snapshot windows
  const setA = getWindowSet();
  if (setA.size === 0) bail('snapshot', 'wmctrl returned no windows');
  writeLog({ step: 'snapshot', windowCount: setA.size });

  // STEP 2: launch gchrb
  const launch = spawnSync('gchrb', [], { encoding: 'utf8' });
  if (launch.error) bail('gchrb_launch', launch.error.message);
  writeLog({ step: 'gchrb_launch', exitCode: launch.status ?? 0 });

  // STEP 3: find new window (poll up to 8s)
  let newWin = null;
  const findStart = Date.now();
  while (Date.now() - findStart < 8000) {
    await sleep(200);
    const setB = getWindowSet();
    const diff = [...setB].filter(id => !setA.has(id));
    if (diff.length === 1) {
      newWin = diff[0];
      break;
    }
    if (diff.length > 1) {
      // Take the last one (most recently appeared)
      newWin = diff[diff.length - 1];
      break;
    }
  }
  const findElapsed = Date.now() - findStart;
  if (!newWin) bail('find_window', 'new window never appeared within 8s', 'gchrb may have failed to start');
  const newWinId = newWin as string;
  writeLog({ step: 'find_window', windowId: newWinId, elapsedMs: findElapsed });

  // STEP 4: move to workspace
  cmd(`wmctrl -i -r ${newWinId} -t ${TARGET_WORKSPACE}`);
  await sleep(300);
  const actualDesktop = getWindowDesktop(newWinId);
  writeLog({ step: 'move_workspace', windowId: newWinId, target: TARGET_WORKSPACE, actual: actualDesktop });
  if (actualDesktop !== TARGET_WORKSPACE) {
    bail('move_workspace', `expected desktop ${TARGET_WORKSPACE}, got ${actualDesktop}`);
  }

  // STEP 5: maximize
  cmd(`wmctrl -i -r ${newWinId} -b add,maximized_vert,maximized_horz`);
  await sleep(400);
  const screen = getScreenDimensions();
  const geom = getWindowGeometry(newWinId);
  writeLog({ step: 'maximize', ...(geom || {}), ...(screen ? { screenW: screen.w, screenH: screen.h } : {}) });

  // STEP 6: switch to target workspace, then activate window
  cmd(`wmctrl -s ${TARGET_WORKSPACE}`);
  await sleep(400);
  cmd(`wmctrl -i -a ${newWinId}`);
  let activateOk = false;
  for (let i = 0; i < 3; i++) {
    await sleep(300);
    const active = getActiveWindow();
    if (winIdsMatch(active, newWinId)) { activateOk = true; break; }
  }
  const activeAfter = getActiveWindow();
  writeLog({ step: 'activate', expected: newWinId, actual: activeAfter, ok: activateOk });
  if (!activateOk) bail('activate', `window ${newWinId} did not become active (got ${activeAfter})`);

  // STEP 7: xdotool windowfocus
  cmd(`xdotool windowfocus --sync ${newWinId}`);
  await sleep(200);
  const focusedActive = getActiveWindow();
  const focusOk = winIdsMatch(focusedActive, newWinId);
  writeLog({ step: 'windowfocus', ok: focusOk, actual: focusedActive, expected: newWinId });
  if (!focusOk) bail('windowfocus', `window focus mismatch: got ${focusedActive}, expected ${newWinId}`);

  // STEP 8: settle
  await sleep(500);
  writeLog({ step: 'settle', ms: 500 });

  // STEP 9: press F12
  cmd(`xdotool key --window ${newWinId} F12`);
  await sleep(1500);
  writeLog({ step: 'key_F12', sent: true });

  // STEP 10: click the Surfingkeys tab in DevTools directly by screen coords
  cmd(`xdotool mousemove 183 579 click 1`);
  await sleep(500);
  writeLog({ step: 'click_surfingkeys_tab', sent: true });


  // STEP 14: poll panel connected (up to 10s)
  let panelConnected = false;
  let pollAttempts = 0;
  const pollStart = Date.now();
  while (Date.now() - pollStart < 10000) {
    await sleep(500);
    pollAttempts++;
    const res = await httpGet(`http://localhost:${SERVER_PORT}/eval-status`) as Record<string, unknown>;
    const resBody = res.body as Record<string, unknown> | undefined;
    if (res.ok && resBody && resBody.panelConnected === true) {
      panelConnected = true;
      break;
    }
  }
  const pollElapsed = Date.now() - pollStart;
  writeLog({ step: 'panel_connected', ok: panelConnected, attempts: pollAttempts, elapsedMs: pollElapsed });
  if (!panelConnected) {
    bail('panel_connected', 'panel never connected within 10s',
      'check log, try ./bin/dbg devtools-start again or manually open F12 and click Surfingkeys tab');
  }

  // STEP 15: output result
  const elapsedMs = Date.now() - startMs;
  closeLog();
  console.log(JSON.stringify({
    ok: true,
    windowId: newWinId,
    workspace: TARGET_WORKSPACE,
    panelConnected: true,
    elapsedMs,
    log: LOG_FILE,
  }, null, 2));

  process.exit(0);
}

export { run };

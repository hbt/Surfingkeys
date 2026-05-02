/**
 * devtools-panel.js — Surfingkeys DevTools panel page
 *
 * Bridges the config server /eval endpoint to:
 *   target:'bg'   → chrome.debugger → Runtime.evaluate in extension SW
 *   target:'page' → chrome.devtools.inspectedWindow.eval in the inspected tab
 */

const CONFIG_SERVER = 'http://localhost:9600';
const EXTENSION_ID = chrome.runtime.id;
const statusEl = document.getElementById('status');

function setStatus(connected) {
  statusEl.textContent = connected
    ? 'sk-devtools | ● Connected'
    : 'sk-devtools | ● Disconnected';
  statusEl.className = connected ? 'connected' : 'disconnected';
}

// ── BG eval via chrome.debugger ───────────────────────────────────────────────

let attachedDebuggee = null; // { targetId }

function findSWTarget() {
  return new Promise((resolve, reject) => {
    chrome.debugger.getTargets((targets) => {
      const sw = targets.find(t =>
        (t.type === 'service_worker' || t.type === 'worker') &&
        t.url.startsWith(`chrome-extension://${EXTENSION_ID}/`)
      );
      if (sw) { resolve(sw); return; }
      const summary = targets
        .filter(t => t.type === 'service_worker' || t.url.includes('chrome-extension'))
        .map(t => `${t.type}|${t.url}`)
        .join('; ');
      reject(new Error(`SW target not found. extensionId=${EXTENSION_ID} candidates=[${summary}]`));
    });
  });
}

async function ensureAttached() {
  const target = await findSWTarget();
  const debuggee = { targetId: target.id };

  if (attachedDebuggee && attachedDebuggee.targetId === debuggee.targetId) {
    return debuggee; // already attached to this target
  }

  // Detach from stale target if needed
  if (attachedDebuggee) {
    await new Promise(r => chrome.debugger.detach(attachedDebuggee, r));
    attachedDebuggee = null;
  }

  await new Promise((resolve, reject) => {
    chrome.debugger.attach(debuggee, '1.3', () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  attachedDebuggee = debuggee;
  return debuggee;
}

// Reattach if SW restarts (new targetId)
chrome.debugger.onDetach.addListener((_source, reason) => {
  if (reason !== 'canceled_by_user') attachedDebuggee = null;
});

async function evalInBG(code) {
  const debuggee = await ensureAttached();
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
      expression: code,
      awaitPromise: true,
      returnByValue: true,
    }, (res) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (res.exceptionDetails) {
        const msg = res.exceptionDetails.exception?.description
          || res.exceptionDetails.text
          || 'unknown exception';
        reject(new Error(msg));
      } else {
        resolve({ result: JSON.stringify(res.result?.value) });
      }
    });
  });
}

// ── Page eval ────────────────────────────────────────────────────────────────

function evalInPage(code) {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(code, (result, exceptionInfo) => {
      if (exceptionInfo && exceptionInfo.isException) {
        reject(new Error(exceptionInfo.value || exceptionInfo.description));
      } else {
        resolve({ result: JSON.stringify(result) });
      }
    });
  });
}

// ── Result poster ─────────────────────────────────────────────────────────────

function postResult(id, result, error) {
  return fetch(`${CONFIG_SERVER}/eval-result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, result, error }),
  }).catch(() => {});
}

// ── SSE subscriber ────────────────────────────────────────────────────────────

function subscribeSSE() {
  const es = new EventSource(`${CONFIG_SERVER}/eval-subscribe`);

  es.onopen = () => setStatus(true);
  es.onerror = () => setStatus(false);

  es.onmessage = async (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch (_) { return; }

    const { id, target, code } = msg;
    let result, error;

    try {
      const outcome = target === 'bg'
        ? await evalInBG(code)
        : await evalInPage(code);
      result = outcome.result;
      error = outcome.error;
    } catch (e) {
      error = e.message;
    }

    await postResult(id, result, error);
  };
}

// ── Boot ──────────────────────────────────────────────────────────────────────

subscribeSSE();

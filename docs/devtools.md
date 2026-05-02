# sk-devtools — Eval Relay

Lets a coding agent run arbitrary JS in the extension's service worker (SW) and inspected page inside **gchrb** (the main browser profile), which has no remote debug port.

## system.architecture

```
Agent (curl)           config server :9600        DevTools panel (F12)       gchrb SW
────────────           ───────────────────        ────────────────────       ─────────
POST /eval  ────────►  SSE relay ────────────────►  receive command
            ◄────────  wait for result  ◄──POST──    chrome.debugger.sendCommand
{ result }                                           Runtime.evaluate ◄──────► SW / page
```

- Agent sends one HTTP call — no streaming, no polling
- Panel executes via `chrome.debugger` (SW) or `inspectedWindow.eval` (page)
- Panel POSTs result back; server closes the original request
- Zero user interaction after the one-time F12 setup

---

## system.setup

### 1. Build and reload

```bash
npm run build:dev
```

Reload extension in gchrb: `chrome://extensions` → find Surfingkeys → click ↺

### 2. Start config server

```bash
./bin/dbg server-start
./bin/dbg server-status   # → { "running": true }
```

### 3. Open DevTools in gchrb (one-time per session)

- Press **F12** on any tab in gchrb
- Click the **"Surfingkeys"** tab in the DevTools toolbar
- Badge should show: `sk-devtools | ● Connected`

### 4. Verify

```bash
curl -s http://localhost:9600/eval-status | jq .
# { "panelConnected": true, "subscribers": 1 }
```

---

## system.usage

### dev.endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/eval-status` | GET | Check if panel is connected |
| `/eval` | POST | Run JS, wait up to 10s for result |
| `/eval-subscribe` | GET | SSE stream (panel uses this internally) |
| `/eval-result` | POST | Panel posts result here (internal) |

### dev.eval-targets

| `target` | Runs in | API access |
|----------|---------|------------|
| `bg` | Extension service worker | `chrome.*`, SW globals, storage |
| `page` | Inspected tab (current page in F12) | DOM, `window`, page JS |

### dev.examples

```bash
# Check extension is loaded
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"chrome.runtime.id"}' | jq .
# { "result": "\"aajlcoiaogpknhgninhopncaldipjdnp\"" }

# Read all storage
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => chrome.storage.local.get(null, r))"}' | jq .

# Read specific storage keys
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => chrome.storage.local.get([\"localPath\",\"snippets\"], r))"}' | jq .

# Inspect SW globals
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"Object.keys(self)"}' | jq .

# Get page title
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"page","code":"document.title"}' | jq .

# Alert in page
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"page","code":"alert(\"hello from agent\")"}' | jq .

# Duplicate active tab
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => chrome.tabs.query({active:true,currentWindow:true}, tabs => chrome.tabs.duplicate(tabs[0].id, r)))"}' | jq .

# List all open tabs
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => chrome.tabs.query({}, r))"}' | jq .
```

---

## system.session-checklist

```bash
# 1. Server running?
./bin/dbg server-status

# 2. Panel connected? (requires F12 open in gchrb)
curl -s http://localhost:9600/eval-status | jq .
# Must show: "panelConnected": true

# 3. Quick smoke test
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"chrome.runtime.id"}' | jq .
```

---

## system.troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `panelConnected: false` | F12 not open or panel tab not clicked | Open F12 in gchrb, click Surfingkeys tab |
| `{ "error": "timeout" }` | Panel connected but request timed out | Check panel is on Surfingkeys tab, not hidden |
| `{ "error": "SW target not found" }` | Extension not loaded or SW not running | Reload extension, reopen F12 |
| Server won't start (`EADDRINUSE`) | Stale bun process holding :9600 | `kill $(lsof -ti :9600 \| head -1)` then `./bin/dbg server-start` |
| No "Surfingkeys" tab in F12 | `devtools_page` missing from manifest | `npm run build:dev` then reload extension |
| Panel shows Disconnected briefly | MV3 SW went idle — SSE reconnects automatically | Wait a few seconds; badge updates automatically |

---

## system.implementation

| File | Role |
|------|------|
| `scripts/server.ts` | `/eval`, `/eval-status`, `/eval-subscribe`, `/eval-result` endpoints |
| `src/pages/devtools.html` | Hidden DevTools background page (loaded via `manifest.devtools_page`) |
| `src/pages/devtools.js` | Registers the visible "Surfingkeys" panel via `chrome.devtools.panels.create()` |
| `src/pages/devtools-panel.html` | Visible panel UI — status badge |
| `src/pages/devtools-panel.js` | SSE subscriber + `chrome.debugger` SW eval + `inspectedWindow.eval` page eval |
| `src/background/start.js` | `chrome.runtime.onConnect` keeps `sk-devtools` port alive |
| `config/esbuild.config.js` | Adds `devtools_page` + `debugger` permission to dev manifest |

### dev.why-chrome-debugger

Chrome MV3 extension service workers block `eval()` and `new Function()` via CSP (`unsafe-eval` is rejected at manifest load time). `importScripts()` from external URLs is also blocked by Chrome's extension security policy. The `chrome.debugger` API with `Runtime.evaluate` is the only mechanism that allows arbitrary JS execution in the SW context without modifying the CSP.

**Note:** attaching the debugger to a service worker target does **not** show the "Chrome is being debugged" banner (that only appears for tab targets).

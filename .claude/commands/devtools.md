# /devtools — sk-devtools Eval Relay

The eval relay lets you run arbitrary JS inside the Surfingkeys Chrome extension running in **gchrb** (the main browser profile, which has **no remote debug port**). Use it to inspect state, trigger Chrome APIs, and exercise runtime behavior — **without touching source code**.

---

## decision.rule

**Before modifying any source file, ask yourself: "Is this a one-time action or an inspection?"**

| Goal | Tool |
|------|------|
| Trigger a tab action NOW (duplicate, close, navigate) | eval relay |
| Read extension state (storage, tabs, globals) | eval relay |
| Verify a bug or behavior interactively | eval relay |
| Add a new persistent keybinding or feature | source change |
| Fix a bug that requires code logic to change | source change |

**If you were asked to "trigger tv to duplicate tabs" — use the eval relay. Do NOT add a new mapkey to source.**

---

## step0.session-checklist

Run these before any eval call. Both must pass.

```bash
# 1. Config server running?
./bin/dbg server-status
# Expected: { "running": true }

# 2. Panel connected? (requires F12 open in gchrb, Surfingkeys tab selected)
curl -s http://localhost:9600/eval-status | jq .
# Expected: { "panelConnected": true, "subscribers": 1 }
```

If either check fails, see the troubleshooting table below before proceeding.

---

## usage.targets

| `target` | Runs in | Access |
|----------|---------|--------|
| `bg` | Extension service worker | `chrome.*`, SW globals (`self`), storage, all background actions |
| `page` | Currently inspected tab (F12 focus) | DOM, `window`, page-level JS |

---

## usage.curl-examples

### Check panel connected

```bash
curl -s http://localhost:9600/eval-status | jq .
```

### SW: verify extension identity

```bash
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"chrome.runtime.id"}' | jq .
```

### SW: read storage

```bash
# All keys
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => chrome.storage.local.get(null, r))"}' | jq .

# Specific keys
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => chrome.storage.local.get([\"localPath\",\"snippets\"], r))"}' | jq .
```

### SW: write storage

```bash
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => chrome.storage.local.set({myKey:\"myVal\"}, r))"}' | jq .
```

### SW: inspect globals

```bash
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"Object.keys(self).filter(k => typeof self[k] === \"function\")"}' | jq .
```

### SW: tabs.query — list all tabs

```bash
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => chrome.tabs.query({}, r))"}' | jq .
```

### SW: tabs.duplicate — duplicate active tab

```bash
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => chrome.tabs.query({active:true,currentWindow:true}, tabs => chrome.tabs.duplicate(tabs[0].id, r)))"}' | jq .
```

### SW: tabs.remove — close a tab by ID

```bash
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => chrome.tabs.remove(TAB_ID, r))"}' | jq .
# Replace TAB_ID with the numeric ID from tabs.query
```

### SW: tabs.update — navigate active tab

```bash
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => chrome.tabs.query({active:true,currentWindow:true}, tabs => chrome.tabs.update(tabs[0].id, {url:\"https://example.com\"}, r)))"}' | jq .
```

### SW: call a Surfingkeys background action directly

Background actions are registered as `self[action]` in the SW. Call them directly — no message passing needed.

```bash
# duplicateTab
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => self.duplicateTab({}, {}, r))"}' | jq .

# reloadTabMagic — reload tabs to the right
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => self.reloadTabMagic({magic:\"DirectionRight\"}, {}, r))"}' | jq .

# reloadTabMagic — all except active
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => self.reloadTabMagic({magic:\"AllExceptActive\"}, {}, r))"}' | jq .

# getTabs
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"new Promise(r => self.getTabs({queryInfo:{}}, {}, r))"}' | jq .
```

Available actions: any function registered as `self.<name>` in `src/background/start.js` — e.g. `closeTab`, `focusTab`, `focusTabByIndex`, `nextTab`, `previousTab`, `moveTab`, `togglePinTab`, `tabOnly`, `closeTabMagic`, `detachTabMagic`, `goToParentTab`, `getTabs`, `getTopSites`, `getRecentlyClosed`, `getAllURLs`, `jumpVIMark`, `addVIMark`, etc.

### Page: read DOM

```bash
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"page","code":"document.title"}' | jq .

curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"page","code":"window.location.href"}' | jq .
```

### Page: run arbitrary page JS

```bash
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"page","code":"document.querySelectorAll(\"a\").length"}' | jq .
```

---

## troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `panelConnected: false` | F12 not open or Surfingkeys panel tab not clicked | Open F12 in gchrb, click the Surfingkeys tab |
| `{ "error": "timeout" }` | Panel connected but request timed out (10s) | Ensure Surfingkeys tab is visible in F12, not hidden behind another panel |
| `{ "error": "SW target not found" }` | Extension not loaded or SW went idle and failed to reattach | Reload extension at chrome://extensions, reopen F12 |
| Server not responding | Config server not started | `./bin/dbg server-start` |
| Server won't start (`EADDRINUSE`) | Stale process holding :9600 | `kill $(lsof -ti :9600 \| head -1)` then `./bin/dbg server-start` |
| No "Surfingkeys" tab in F12 | `devtools_page` missing — dev build not loaded | `npm run build:dev` then reload extension |
| Panel badge shows Disconnected | MV3 SW went idle; SSE reconnects automatically | Wait a few seconds; badge updates on its own |

---

## reference

Full architecture and implementation details: `docs/devtools.md`

---

## reference.archive

**`/home/hassen/workspace/surfingkeys-archive`** — old fork baseline (pre-rewrite).

| File | Role |
|------|------|
| `content_scripts/hbt.js` | HBT content-script fork — defines `amap`, `MyCustomMapping`, `indexByAnnotation`, and other custom helpers injected into every page |
| `pages/bg.js` | HBT background-script fork — custom background actions registered before the upstream rewrite |

Use this archive when:
- Tracing a config helper (`amap`, `MyCustomMapping`) that no longer exists in the current source
- Understanding what a `.surfingkeysrc.js` call used to resolve to before the migration
- Comparing old command annotations/IDs against current `unique_id` values

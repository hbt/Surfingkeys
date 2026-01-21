# ADR-006: Service Worker Dormancy Auto-Wake

## meta.status
Accepted

## meta.date
2026-01-21

## meta.deciders
- hbt (developer)
- Claude (AI assistant)

## context.problem

The `bin/dbg reload` command was failing with "Extension not detected" when the Chrome extension's service worker was dormant. Chrome service workers go dormant after ~30 seconds of inactivity, disappearing from the CDP targets list.

### context.constraints

**Chrome Service Worker Lifecycle:**
- Service workers become **DORMANT** after ~30 seconds of inactivity
- Dormant workers do not appear in CDP `/json` endpoint
- Workers must be explicitly woken by:
  - Opening an extension page
  - Content script communication
  - Chrome alarm/event triggers

**Detection Requirements:**
- `bin/dbg reload` relies on `type: "service_worker"` target to detect extension
- When dormant, no service worker target exists
- Extension iframe targets (`frontend.html`) persist even when SW is dormant

### context.evidence

**Service worker awake:**
```bash
curl -s http://localhost:9222/json | jq '.[] | select(.type == "service_worker")'
# Returns: {type: "service_worker", url: "chrome-extension://.../background.js"}
```

**Service worker dormant:**
```bash
curl -s http://localhost:9222/json | jq '.[] | select(.type == "service_worker")'
# Returns: (empty)

curl -s http://localhost:9222/json | jq '.[] | select(.url | contains("chrome-extension"))'
# Returns: {type: "iframe", url: "chrome-extension://.../pages/frontend.html"}
```

### context.attempted_solutions

**Attempt 1: Wake via extension iframe**
- Connect to iframe via CDP WebSocket
- Execute `chrome.tabs.create({url: chrome.runtime.getURL("pages/options.html")})`
- ❌ Failed: After extension reload, iframe context is invalidated ("Extension context invalidated")

**Attempt 2: Wake via browser CDP Target.createTarget**
- Get browser WebSocket from `/json/version`
- Send `Target.createTarget` with extension options page URL
- ✅ Success: Creates new tab directly, bypasses stale iframe contexts

## decision.chosen

**Use browser-level CDP `Target.createTarget` to wake dormant service workers by opening an extension page.**

### decision.rationale

1. **Reliability:**
   - Browser WebSocket is always available
   - `Target.createTarget` works regardless of extension state
   - No dependency on potentially stale iframe contexts

2. **Simplicity:**
   - Single CDP command creates the wake trigger
   - No complex multi-step process
   - Service worker typically wakes within 100-200ms

3. **Non-intrusive:**
   - Opens options page in background (not active)
   - Can be cleaned up after reload if needed
   - User's workflow not interrupted

### decision.implementation

**Detection flow:**
```
detectExtensionId()
├─ detectExtensionIdFromServiceWorker()
│   └─ Look for type: "service_worker" with background.js
│   └─ Found? Return extension ID
├─ detectExtensionIdFromIframe()
│   └─ Look for type: "iframe" with frontend.html
│   └─ Found? Extract extension ID
└─ wakeServiceWorker()
    └─ GET /json/version → browserWsUrl
    └─ Target.createTarget {url: "chrome-extension://<id>/pages/options.html"}
    └─ Poll for service_worker target (max 3s)
    └─ Return extension ID
```

### decision.code_changes

**File:** `scripts/dbg/actions/reload.js`

| Function | Purpose |
|----------|---------|
| `detectExtensionIdFromServiceWorker()` | Original detection from SW target |
| `detectExtensionIdFromIframe()` | Fallback detection from iframe |
| `wakeServiceWorker()` | Wake via `Target.createTarget` |
| `detectExtensionId()` | Orchestrates detection with auto-wake |

## consequences.positive

- ✅ `bin/dbg reload` works even after 30+ seconds of inactivity
- ✅ No manual intervention required to wake service worker
- ✅ Wake completes in ~100-200ms
- ✅ Works after extension reload (when iframe contexts are stale)

## consequences.negative

- ⚠️ Opens an extra options tab
  - **Mitigation:** Tab opened in background, can be closed after reload
- ⚠️ Adds ~100-200ms to reload when SW is dormant
  - **Mitigation:** Minimal overhead, only when actually dormant

## consequences.related_decisions

- **ADR-004:** CDP Reload Test Simplification - Explains service worker lifecycle challenges
- **ADR-003:** CDP Message Bridge - Bridge requires awake service worker

## references

- Implementation: `scripts/dbg/actions/reload.js`
- Chrome Service Worker Lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- CDP Target Domain: https://chromedevtools.github.io/devtools-protocol/tot/Target/

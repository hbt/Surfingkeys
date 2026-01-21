# ADR-007: Startup Settings Persistence Pattern

## meta.status
Accepted

## meta.date
2026-01-22

## meta.deciders
- hbt (developer)
- Claude (AI assistant)

## context.problem

User configuration settings defined in `~/.surfingkeys-*.js` were not available to background event listeners that fire before any content script runs.

### context.specific_case

The `newTabUrl` setting controls where CTRL-T redirects. The `chrome.tabs.onCreated` listener fires immediately when a new tab is created, but:

1. User config runs in **content script context** (needs `api.*`, DOM access)
2. `onCreated` fires in **background context** before any page loads
3. The `conf.newTabUrl` value was never updated in time

### context.execution_timeline

```
Extension Load     Page Load          New Tab Created
     │                 │                    │
     ▼                 ▼                    ▼
conf.newTabUrl    snippets run        onCreated fires
= "default"       settings sent       conf still has default!
                  to background
                       │
                       ▼
                  conf updated
                  (too late)
```

### context.existing_pattern

The codebase already has a `conf` object for background-specific settings and an `updateSettings` message flow:

| Component | Location | Purpose |
|-----------|----------|---------|
| `conf` object | `start.js:218` | Runtime config for background |
| `_setNewTabUrl()` | `chrome.js:240` | Browser-specific defaults |
| `updateSettings` | `start.js:1417` | Receives settings from content scripts |
| `scope: "snippets"` | `front.js:490` | Marks settings from user config |

## decision.chosen

**Selective storage persistence** for settings that must be available at extension startup.

### decision.implementation

**1. Add setting to `conf` with default:**
```javascript
// start.js:218
var conf = {
    newTabUrl: browser._setNewTabUrl(),
    // ...
};
```

**2. Persist to storage when received from snippets:**
```javascript
// start.js:1425-1428
if (k === 'newTabUrl') {
    chrome.storage.local.set({ newTabUrl: message.settings[k] });
}
```

**3. Read from storage in early-firing listeners:**
```javascript
// start.js:383-390
chrome.storage.local.get('newTabUrl', function(data) {
    const targetUrl = data.newTabUrl || conf.newTabUrl;
    // use targetUrl
});
```

### decision.data_flow

```
┌─────────────────────────────────────────────────────────────┐
│                    EXTENSION LOAD                           │
│  conf.newTabUrl = default                                   │
│  storage.newTabUrl = value from last session (if any)       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    FIRST PAGE LOAD                          │
│  ~/.surfingkeys-*.js executes                               │
│  settings.newTabUrl = "https://..."                         │
│       │                                                     │
│       ▼                                                     │
│  RUNTIME('updateSettings', {scope: "snippets", ...})        │
│       │                                                     │
│       ├──► conf.newTabUrl updated                           │
│       └──► chrome.storage.local.set({newTabUrl: ...})       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    NEW TAB (anytime)                        │
│  onCreated fires                                            │
│  storage.get('newTabUrl') → use persisted value             │
└─────────────────────────────────────────────────────────────┘
```

## decision.alternatives_considered

### alternative.eval_snippets_in_background

Parse and execute user config in background service worker.

**Rejected because:**
- User config needs `api.*` functions (mapkey, etc.)
- User config may manipulate DOM
- Would require duplicating the entire API surface

### alternative.dedicated_config_file

Separate JSON config file for background-only settings.

**Rejected because:**
- Fragments user configuration
- Users expect `settings.*` to work uniformly
- Additional file management complexity

### alternative.sync_storage

Use `chrome.storage.sync` instead of `local`.

**Rejected because:**
- Sync has strict quotas (8KB per item, 100KB total)
- Settings are device-specific (different homepage per device is valid)
- Local storage is sufficient for this use case

## consequences.positive

| Benefit | Description |
|---------|-------------|
| **Preserves user config syntax** | `settings.newTabUrl = "..."` works like other settings |
| **Uses existing infrastructure** | Builds on `conf` and `updateSettings` patterns |
| **Survives restarts** | Storage persists across service worker restarts |
| **Minimal code** | ~10 lines added total |

## consequences.negative

| Tradeoff | Mitigation |
|----------|------------|
| **Dual storage** | Value in both `conf` and `storage.local` | Storage is source of truth for startup |
| **Async read** | `storage.get()` is async | Acceptable for `onCreated` which triggers navigation anyway |

## implementation.pattern_for_future_settings

To add more startup-critical settings:

**1. Add to `conf` object** (`start.js:218`):
```javascript
var conf = {
    newTabUrl: browser._setNewTabUrl(),
    myNewSetting: "default",  // add here
};
```

**2. Add to persistence list** (`start.js:1425`):
```javascript
const STARTUP_SETTINGS = ['newTabUrl', 'myNewSetting'];
if (STARTUP_SETTINGS.includes(k)) {
    chrome.storage.local.set({ [k]: message.settings[k] });
}
```

**3. Read from storage** in any listener that fires before content scripts.

## implementation.files_changed

| File | Changes |
|------|---------|
| `src/background/chrome.js` | `_setNewTabUrl()` returns default URL |
| `src/background/start.js` | Added `newTabUrl` to `conf`, storage persistence in `updateSettings`, storage read in `onCreated` |
| `src/content_scripts/common/default.js` | `on` mapping uses `RUNTIME('openNewtab')` |

## references

- `chrome.storage.local` API: https://developer.chrome.com/docs/extensions/reference/storage/
- MV3 Service Worker lifecycle: https://developer.chrome.com/docs/extensions/mv3/service_workers/

# ADR-003: CDP Message Bridge for Extension Testing

## meta.status
Accepted

## meta.date
2026-01-20

## meta.deciders
- hbt (developer)
- Claude (AI assistant)

## context.problem

Chrome DevTools Protocol (CDP) testing requires programmatic access to extension functionality, but the extension's message handlers are trapped inside esbuild's closure scope and inaccessible from CDP's `Runtime.evaluate` global scope.

### context.constraints
- Extension code bundled by esbuild wraps everything in `(() => { ... })()`
- CDP `Runtime.evaluate` executes in ServiceWorkerGlobalScope (global)
- Direct `chrome.runtime.sendMessage()` from background to itself causes "message port closed" errors
- Need reusable solution for accessing all extension handlers, not one-off hacks

### context.attempted_solutions

**Attempt 1: Direct chrome.runtime.reload() via CDP eval**
- ❌ Chrome security model silently ignores/blocks the call
- Function exists but execution has no effect

**Attempt 2: chrome.runtime.sendMessage() to self**
- ❌ Background sends to itself but handler lookup fails
- Message routing checks `self.hasOwnProperty(action)` but `self` (global) ≠ `self2` (closure variable)

**Attempt 3: Direct handler call via eval**
- ❌ `self2.cdpReloadExtension` not accessible from global scope
- Scope barrier between CDP eval context and bundled code

## decision.chosen

Implement `globalThis.__CDP_MESSAGE_BRIDGE__` that exposes the extension's message dispatch mechanism to CDP's global scope.

### decision.implementation

```javascript
// In src/background/start.js after message listener registration:
globalThis.__CDP_MESSAGE_BRIDGE__ = {
    /**
     * Dispatch message through extension's handler system
     * @param {string} action - Handler name (e.g., 'cdpReloadExtension')
     * @param {object} payload - Additional message data
     * @param {boolean} expectResponse - Whether handler returns data
     */
    dispatch: function(action, payload, expectResponse) {
        // Validate handler exists
        if (!self.hasOwnProperty(action)) {
            return { error: 'Handler not found', action };
        }

        // Create proper message format
        var message = { action, needResponse: expectResponse || false, ...payload };
        var sender = { id: chrome.runtime.id, url: 'cdp://testing', origin: 'cdp' };
        var responseData = null;
        var sendResponse = (response) => { responseData = response; };

        // Route through existing handleMessage infrastructure
        var result = handleMessage(message, sender, sendResponse);
        return responseData || result;
    },

    /**
     * List all available handlers
     */
    listActions: function() {
        return Object.keys(self).filter(k => typeof self[k] === 'function');
    }
};
```

### decision.usage

```typescript
// From CDP test (Runtime.evaluate):
globalThis.__CDP_MESSAGE_BRIDGE__.dispatch(
    'cdpReloadExtension',
    {},
    true  // expectResponse
);

// Returns: {status: 'reload_initiated', timestamp: 1768896578192}
```

## decision.rationale

### rationale.architecture
- **Proper abstraction**: Exposes message routing, not individual functions
- **Reusable**: Works for all 87 extension handlers without modification
- **Maintainable**: New handlers automatically available through bridge
- **No duplication**: Leverages existing `handleMessage` infrastructure

### rationale.security
- Uses extension's existing validation (`self.hasOwnProperty`)
- Mock sender clearly identifies CDP origin: `{origin: 'cdp'}`
- No bypassing of permission checks or message validation

### rationale.scope_solution
- Bridge lives in global scope (accessible to CDP)
- Bridge references closure variables (`self`, `handleMessage`)
- JavaScript closure captures allow bridge to access internal state
- Clean separation: CDP → global bridge → closure handlers

## consequences.positive
- ✅ All 87 extension handlers accessible via CDP without changes
- ✅ Future handlers automatically exposed through bridge
- ✅ Consistent API for CDP tests across all functionality
- ✅ No modification needed to handler implementations
- ✅ Testing foundation enables comprehensive automated tests

## consequences.negative
- ⚠️ Bridge accessible from any code with global scope access
- ⚠️ Additional surface area for potential misuse (mitigated by sender validation)
- ⚠️ `globalThis` pollution (single well-named symbol: `__CDP_MESSAGE_BRIDGE__`)

## consequences.alternatives_rejected

### alternative.individual_global_functions
Expose each handler individually to global scope:
```javascript
globalThis.__cdpReload = () => chrome.runtime.reload();
globalThis.__cdpGetTabs = (query) => { ... };
// ... 87 more functions
```

**Rejected because**:
- ❌ Doesn't scale - would need 87 global functions
- ❌ Maintenance burden - each new handler requires global exposure
- ❌ More namespace pollution
- ❌ No unified interface for testing

### alternative.separate_cdp_message_listener
Add dedicated `chrome.runtime.onMessage` listener for CDP:
```javascript
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (sender.origin === 'cdp') {
        // handle CDP messages
    }
});
```

**Rejected because**:
- ❌ Still can't send messages from background to itself via chrome.runtime
- ❌ Would need content script intermediary
- ❌ More complex message routing
- ❌ Doesn't solve scope access issue

## technical.scope_explanation

### Why handlers are inaccessible from CDP:

```javascript
// Built background.js structure:
"use strict";
(() => {                          // ← esbuild closure
    var self2 = {};               // ← local variable

    self2.cdpReloadExtension = function() { ... };

    function handleMessage(msg, sender, respond) {
        if (self2.hasOwnProperty(msg.action)) {
            self2[msg.action](msg, sender, respond);
        }
    }

    chrome.runtime.onMessage.addListener(handleMessage);
})();                             // ← closure ends here

// CDP Runtime.evaluate runs here (global scope):
eval('self2.cdpReloadExtension()');  // ❌ ReferenceError: self2 not defined
```

### How bridge solves it:

```javascript
(() => {                          // ← closure
    var self2 = {};
    self2.cdpReloadExtension = function() { ... };

    function handleMessage(...) { ... }

    // Bridge captures closure variables via lexical scope:
    globalThis.__CDP_MESSAGE_BRIDGE__ = {
        dispatch: function(action, ...) {
            // Can access self2 and handleMessage!
            return handleMessage({ action, ... }, ...);
        }
    };
})();

// CDP can now call:
globalThis.__CDP_MESSAGE_BRIDGE__.dispatch('cdpReloadExtension', ...);  // ✅
```

## references
- Implementation: src/background/start.js:487-561
- Usage example: tests/cdp-reload-messaging.ts:160-177
- CDP experiment scope: docs/cdp-experiment-scope.md
- Commit: 634ccf6 [feat] Add CDP Message Bridge

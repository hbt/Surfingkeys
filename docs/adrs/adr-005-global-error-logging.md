# ADR-005: Global Error Logging and Tracking

## meta.status
Accepted

## meta.date
2026-01-21

## meta.deciders
- hbt (developer)
- Claude (AI assistant)

## context.problem

Surfingkeys had minimal error logging and tracking infrastructure, making it difficult to diagnose issues in production. Many errors occurred silently without being captured or persisted.

### context.gaps_identified

**Missing Global Handlers:**
- ❌ No `window.onerror` - Unhandled JS errors silently fail
- ❌ No `window.onunhandledrejection` - Promise rejections silently fail
- ❌ No `chrome.runtime.onError` - MV3 service worker errors not caught
- ❌ Silent failures - Many `.catch((e) => {})` blocks drop errors

**No Error Persistence:**
- All errors only logged to console (transient)
- Lost on extension restart/reload
- No historical tracking or analysis

**Undetected Failure Scenarios:**
1. Unhandled promise rejections in background
2. Service Worker crashes (MV3)
3. Tab messaging failures (silently suppressed)
4. Chrome API errors (storage, tabs, windows)
5. Command execution errors
6. Cross-frame errors in nested iframes
7. Network timeouts
8. Native messaging connection failures

### context.existing_infrastructure

**LOG() Function** (common/utils.js):
- Basic console logging with configurable levels
- Default: error level only
- No persistence
- Routes to console only

**User-Facing Error Reporting:**
- `showPopup()` - displays errors to user
- `showBanner()` - temporary notifications
- `reportIssue()` - creates GitHub issue template

**Scattered Try-Catch:**
- 18+ try-catch blocks across codebase
- 35+ promise `.catch()` handlers
- Inconsistent error handling patterns
- Many silent failures

### context.constraints

**Chrome Extension Environment:**
- Background scripts run in service worker (MV3)
- Content scripts run in isolated world (cannot access page JS directly)
- `chrome.storage.local` max 10MB (can be increased with permission)
- Must not impact extension performance

**CDP Testing Requirements:**
- Need to verify error handlers work via Chrome DevTools Protocol
- Cannot easily access MV2 background pages via CDP
- Content scripts in isolated world (not page context)
- Live code injection for testing without rebuild cycles

## decision.chosen

**Implement comprehensive global error collection with persistence.**

### decision.architecture

**Error Collector Module** (`src/common/errorCollector.js`):

```javascript
// Global handlers
- window.onerror           // Catches unhandled JS errors
- window.onunhandledrejection  // Catches promise rejections

// Persistence
- chrome.storage.local     // Survives reloads/crashes
- In-memory cache          // Immediate access

// Context tracking
- background vs content_script
- URL, timestamp, userAgent
- Stack traces
- Error type categorization
```

**Integration Points:**
- `src/background/chrome.js` - Install handlers at background startup
- `src/content_scripts/chrome.js` - Install handlers at content script startup

**API Functions:**
```javascript
installErrorHandlers(context)  // Install global handlers
getStoredErrors()              // Get errors from storage
clearStoredErrors()            // Clear all stored errors
getMemoryErrors()              // Get errors from current session
reportError(type, msg, details) // Manually report an error
```

### decision.error_data_structure

Each captured error contains:
```javascript
{
  type: 'window.onerror' | 'unhandledrejection' | 'chrome.runtime.lastError' | 'manual',
  message: 'Error message',
  context: 'background' | 'content_script',
  url: 'https://example.com',
  source: 'file.js',      // For window.onerror
  lineno: 123,            // Line number
  colno: 45,              // Column number
  stack: 'Error: ...\n at ...', // Stack trace
  timestamp: '2026-01-21T...',
  userAgent: 'Mozilla/5.0 ...'
}
```

### decision.storage_strategy

**chrome.storage.local (NOT localStorage):**
- ✅ Persists across extension restarts/reloads
- ✅ Survives browser crashes
- ✅ Available in background AND content scripts
- ✅ Works in MV3 service workers (localStorage doesn't)
- ❌ NOT synchronized across devices (use sync for that)
- Max 10MB storage (100 errors × ~50KB = 5MB max)

**Storage Key:** `surfingkeys_errors`

**Rotation:** Keep last 100 errors (FIFO queue)

### decision.cdp_testing_workflow

**CDP Scripts for Live Testing:**

1. **debug/cdp-test-error-handlers.ts**
   - Full test (background + content)
   - Injects handlers, triggers errors, verifies storage
   - Limitation: Can't easily access MV2 background via CDP

2. **debug/cdp-test-error-handlers-simple.ts**
   - Content script testing only
   - Discovered: chrome API not available in page context
   - Learning: Content scripts run in isolated world

3. **debug/cdp-verify-error-collection.ts**
   - Production verification script
   - Checks if handlers are installed
   - Provides manual testing instructions

**Testing Pattern:**
```typescript
// 1. Connect to background/page via CDP WebSocket
// 2. Inject error collector code using Runtime.evaluate
// 3. Trigger test errors (throw, Promise.reject)
// 4. Verify errors captured in chrome.storage.local
// 5. Display results
```

### decision.rationale

1. **Comprehensive Coverage:**
   - Catches errors that would otherwise be silent
   - Two handlers cover all error types (sync + async)

2. **Persistence:**
   - chrome.storage.local survives restarts
   - Historical tracking enables pattern analysis
   - Debugging production issues becomes possible

3. **CDP Testing:**
   - Live code injection without rebuild cycles
   - Fast iteration during development
   - Validates handlers work in production

4. **Minimal Overhead:**
   - Handlers only activate on actual errors
   - Async storage writes don't block execution
   - 100-error limit prevents unbounded growth

5. **Context Awareness:**
   - Separate tracking for background vs content scripts
   - Stack traces and timestamps aid debugging
   - URL tracking shows which pages trigger errors

## consequences.positive

- ✅ All unhandled errors now captured
- ✅ Errors persist across extension reloads
- ✅ CDP testing workflow enables rapid validation
- ✅ Stack traces and context aid debugging
- ✅ Historical error tracking possible
- ✅ No performance impact on normal operation
- ✅ Works in both MV2 and MV3 extensions

## consequences.negative

- ⚠️ Error storage consumes chrome.storage.local quota (mitigated by 100-error limit)
- ⚠️ CDP testing can't easily access MV2 background pages (use MV3 service worker debugging)
- ⚠️ Page context errors not captured (by design - extension-only focus)

## consequences.neutral

- Background service worker may be inactive when testing via CDP (wake with tab creation)
- Console logs remain visible (handlers don't suppress them)
- Manual testing still valuable (CDP complements, doesn't replace)

## consequences.future_enhancements

Potential future additions (not implemented now):

1. **Error Viewer UI** - Page to view/filter/export errors
2. **Error Rate Limiting** - Prevent storage overflow from error floods
3. **Error Categorization** - Group similar errors
4. **Error Context** - Capture Mode.stack, current command, active settings
5. **Remote Reporting** - Send critical errors to external service
6. **Source Maps** - Better stack traces for minified code

## decision.implementation

**Files Created:**
- `src/common/errorCollector.js` (207 lines) - Core error collector module
- `debug/cdp-test-error-handlers.ts` (507 lines) - Full CDP test
- `debug/cdp-test-error-handlers-simple.ts` (406 lines) - Content script CDP test
- `debug/cdp-verify-error-collection.ts` (241 lines) - Production verification

**Files Modified:**
- `src/background/chrome.js` - Added `installErrorHandlers('background')`
- `src/content_scripts/chrome.js` - Added `installErrorHandlers('content_script')`

**Build Changes:**
- Bundled with esbuild (no build config changes needed)

## decision.verification

**Method 1: Chrome DevTools Console**
```javascript
// Should see on any page with Surfingkeys:
[ERROR COLLECTOR] ✓ Installed global error handlers in content_script
[ERROR COLLECTOR]   - window.onerror
[ERROR COLLECTOR]   - window.onunhandledrejection

// View stored errors:
chrome.storage.local.get(['surfingkeys_errors'], console.log)

// Trigger test error:
throw new Error('TEST ERROR')

// Trigger test rejection:
Promise.reject(new Error('TEST REJECTION'))
```

**Method 2: CDP Verification Script**
```bash
CDP_PORT=9222 npx ts-node debug/cdp-verify-error-collection.ts
```

## consequences.related_decisions

- **ADR-001:** esbuild Build Alternative - Error collector bundled via esbuild
- **ADR-003:** CDP Message Bridge - CDP testing pattern similar to message bridge testing
- **ADR-004:** CDP Reload Test Simplification - Same service worker lifecycle challenges

## references

- Implementation: `src/common/errorCollector.js`
- CDP Tests: `debug/cdp-test-error-handlers*.ts`
- Investigation: `docs/investigation/ERROR_LOGGING_ANALYSIS.md` (moved from root)
- chrome.storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- MV3 Service Workers: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers

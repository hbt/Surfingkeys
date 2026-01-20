# Testing

## testing.overview

Surfingkeys uses a hybrid testing approach combining unit tests and real browser E2E tests.

**Test Infrastructure:**
- **Jest** - Unit tests for logic and utilities
- **CDP (Chrome DevTools Protocol)** - Real browser E2E tests via automated headless Chrome
- **Debug Scripts** - Manual exploration and live code modification

---

## testing.running_tests

### Automated Tests

**Run all tests:**
```bash
npm test
```

**Run single CDP test in headless mode:**
```bash
npm run test:cdp:headless tests/cdp/cdp-keyboard.test.ts
```

**Run all CDP tests in parallel (16 workers):**
```bash
npm run test:cdp:headless:all
```

**Run single CDP test in live mode (visible browser on port 9222):**
```bash
npm run test:cdp:live tests/cdp/cdp-keyboard.test.ts
```

### Manual Debugging

For live experimentation and debugging without rebuild cycles, see **[debug/README.md](../debug/README.md)**.

Debug scripts allow you to inject code, modify behavior, and inspect state in real-time during development.

---

## testing.philosophy

Good tests verify behavior, not implementation. CDP tests use real Chrome with the actual extension, sending keyboard events and checking observable outcomes (scrolling, DOM changes, tab operations). This catches integration issues that mocked tests miss. Tests should be fast, isolated, and deterministic - each test creates its own tab with a clean state. Headless mode enables parallel execution (22 tests run in ~3 seconds), while live mode aids debugging by showing what's happening in a visible browser.

---

## testing.structure

### Unit Tests (Jest)
- **Location:** `tests/*.test.js`
- **Purpose:** Pure function testing, logic verification
- **Speed:** Fast (~100ms for suite)
- **Coverage:** ~97% pass rate

### E2E Tests (CDP + Jest)
- **Location:** `tests/cdp/*.test.ts`
- **Purpose:** Real browser testing with actual extension
- **Speed:** Parallel execution ~3s for full suite (16 workers)
- **Framework:** Jest with streaming reporter
- **Modes:**
  - Headless (port 9223) - Automated CI/CD
  - Live (port 9222) - Visual debugging

**Test Categories:**
- Keyboard commands (j/k scrolling, f hints, yt tab duplicate)
- Extension lifecycle (reload, messaging)
- Chrome APIs (tabs, clipboard, storage)
- Error handling (global error collectors)

### Debug Scripts (CDP)
- **Location:** `debug/*.ts`
- **Purpose:** Manual exploration, live code injection
- **Speed:** Immediate iteration without rebuild
- **Use:** Development and debugging (not automated tests)

See [debug/README.md](../debug/README.md) for debug workflow.

---

## testing.cdp_error_handlers

**Error Handler Testing** - Verify global error logging catches all unhandled errors.

**Scripts:**
- `debug/cdp-test-error-handlers.ts` - Full test (background + content)
- `debug/cdp-test-error-handlers-simple.ts` - Content script only
- `debug/cdp-verify-error-collection.ts` - Production verification

**Run verification:**
```bash
CDP_PORT=9222 CDP_MODE=live npx ts-node debug/cdp-verify-error-collection.ts
```

**Manual verification in Chrome DevTools:**
```javascript
// Check handlers installed:
window._surfingkeysErrorHandlersInstalled

// View stored errors:
chrome.storage.local.get(['surfingkeys_errors'], console.log)

// Trigger test error:
throw new Error('TEST ERROR')

// Trigger test rejection:
Promise.reject(new Error('TEST REJECTION'))
```

**What gets captured:**
- `window.onerror` - Unhandled JS errors
- `window.onunhandledrejection` - Promise rejections
- `chrome.runtime.lastError` - Chrome API errors
- Context, stack traces, timestamps, URLs

**Storage:** `chrome.storage.local` key `surfingkeys_errors` (max 100 errors, FIFO rotation)

**See also:**
- [ADR-005: Global Error Logging](adrs/adr-005-global-error-logging.md)
- [Error Logging Analysis](investigation/ERROR_LOGGING_ANALYSIS.md)
- Implementation: `src/common/errorCollector.js`

---

## testing.references

- **Debug Workflow:** [debug/README.md](../debug/README.md)
- **Strategy Analysis:** [testing-strategy-analysis.md](testing-strategy-analysis.md)
- **CDP Experiment Scope:** [cdp-experiment-scope.md](cdp-experiment-scope.md)
- **Chrome DevTools Protocol:** https://chromedevtools.github.io/devtools-protocol/

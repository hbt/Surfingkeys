The user is asking me to reflect on the three approaches I used during this session:

1. CDP + proxy (websocat commands)
2. CDP debug scripts (TypeScript with npm run debug:cdp:live)
3. Direct source code modification + dbg reload

They want my professional assessment of workflow preferences, strengths, and weaknesses. This is a good UX/DX question. Let me think through what I experienced:

## CDP + Proxy (websocat)

**Strengths:**
- Fastest iteration - one-liners, instant feedback
- No build step, perfect for quick inspection

**Weaknesses:**
- Not persistent - changes disappear on reload
- Only for runtime injection, not config/data

**Usage:**

Start/stop proxy server:
```bash
./bin/dbg proxy-start
```

**Example: Open options page**

```bash
TARGET=$(curl -s http://127.0.0.1:9222/json | jq -r '.[] | select(.url | contains("chrome-extension")) | .id' | head -1)
echo '{"targetId": "'$TARGET'", "method": "Runtime.evaluate", "params": {"expression": "chrome.runtime.openOptionsPage()", "returnByValue": true}}' | websocat ws://127.0.0.1:9623
```

See [docs/cdp/proxy.md](./proxy.md) for more examples and request format details.

## CDP + sk-cdp CLI (Recommended)

**Strengths:**
- Clean DX - no JSON escaping or shell quoting hell
- Target shortcuts: `bg`, `sw`, `options`, `frontend`, `popup`
- Auto-target discovery (service_worker, page, iframe)
- Multi-line code support via heredocs
- `--json` output for scripting and agents
- Better error messages with suggestions

**Weaknesses:**
- One extra CLI tool to learn (but worth it)
- Still runtime-only, not persistent

**Commands:**

```bash
sk-cdp targets                                    # List all CDP targets
sk-cdp targets --json                             # Machine-readable output
sk-cdp eval --target bg "chrome.runtime.id"       # Eval in service worker
sk-cdp eval --target options "document.title"     # Eval in options page
sk-cdp eval --target google.com "document.title"  # Eval in matching tab
sk-cdp send --target bg "Runtime.evaluate" '{}'   # Raw CDP method
sk-cdp eval --target frontend "chrome.runtime.openOptionsPage()"  # Open options page
```

**Target Shortcuts:**

| Shortcut | Target Type | Pattern |
|----------|-------------|---------|
| `bg`, `sw`, `background` | service_worker | background.js |
| `options` | page | options.html |
| `frontend` | iframe | frontend.html |
| `popup` | page | popup.html |

Multi-line code:
```bash
sk-cdp eval --target bg <<'CODE'
new Promise(r => chrome.storage.local.get(null, r))
CODE
```

**Observability: Metadata & Verification**

sk-cdp automatically captures metadata before and after execution to verify side effects:

```bash
sk-cdp eval --target options.html "document.title"
# Output:
# "Surfingkeys Settings"
#
# ─ Metadata ─
# Duration: 6ms
# Context: page
# Console log: /tmp/dbg-proxy.log
# Timestamp: 2026-01-21T16:28:41.291Z
```

**Metadata includes:**
- **Execution**: Duration and timestamp
- **Tab info**: URL, title, active status, window ID (via Chrome tabs API)
- **Document**: Readiness state, element count with query timing
- **Viewport**: Height, width, scroll position, DPI
- **Context**: Detects page vs iframe vs shadow-DOM
- **Changes**: Before/after comparisons for DOM mutations, URL changes, tab switches
- **Console**: Reference to proxy log file for all events

**Example: Verify a DOM mutation:**
```bash
sk-cdp eval --target options.html <<'CODE'
(function() {
  const el = document.createElement('div');
  el.textContent = 'Test';
  document.body.appendChild(el);
  return 'Added element';
})()
CODE
# Output shows: Elements: 421 → 422 (+1)
```

See [docs/cdp/sk-cdp.md](./cdp/sk-cdp.md) for full reference and examples.

### Console & Exception Logging

The proxy automatically captures all console messages and exceptions from all targets:

```bash
# Start proxy - automatically subscribes to Runtime events
./bin/dbg proxy-start
```

**What gets logged to `/tmp/dbg-proxy.log`:**
- Console messages (log, warn, error, info, debug)
- Uncaught exceptions with stack traces
- Timestamps and target identification

**Access logs from sk-cdp:**
```bash
sk-cdp eval --target options.html "console.log('test')"
# Output includes: Console log: /tmp/dbg-proxy.log

# View logs in real-time
tail -f /tmp/dbg-proxy.log | grep "\[LOG\]\|\[ERROR\]\|\[EXCEPTION\]"

# Search for specific messages
grep "Error" /tmp/dbg-proxy.log
grep "target_id" /tmp/dbg-proxy.log
```

**Example log output:**
```
[2026-01-21T16:34:57.094Z]   ← [9AFA5CE2...] [LOG] console.log message
[2026-01-21T16:34:57.095Z]   ← [9AFA5CE2...] [ERROR] console.error message
[2026-01-21T16:34:57.096Z]   ← [9AFA5CE2...] [EXCEPTION] TypeError: Cannot read property 'x' of undefined
```

## Direct source modification + bin/dbg reload

**Strengths:**
- Changes are persistent and testable through full build pipeline
- Can commit and see real-world effects

**Weaknesses:**
- Slower feedback loop - edit, reload cycle
- Verification overhead adds latency

**Usage:**

```bash
bin/dbg reload
```

Automatically:
1. Rebuilds the extension (npm run build)
2. Reloads the extension in Chrome
3. Returns JSON with build timestamp for verification

## Workflow summary

**When to use what:**
- **Inspection**: `sk-cdp eval "..."` (most of the time) - with automatic metadata & console logging
- **One-liner**: `websocat ...` (when you already know the CDP command)
- **Shipping**: Source code + `bin/dbg reload` - persistent changes through build pipeline

**Debugging workflow:**
```bash
# 1. Explore & inspect with sk-cdp (instant feedback + metadata)
sk-cdp eval --target options.html "document.querySelectorAll('input').length"

# 2. Check console/error logs captured by proxy
tail /tmp/dbg-proxy.log | grep ERROR

# 3. Test side effects (mutations, navigation, tab changes)
sk-cdp eval --target options.html "/* code */ return result"
# Metadata shows before/after changes

# 4. Make real changes
# Edit source files

# 5. Verify through build pipeline
./bin/dbg reload
```

### Sending Keyboard Input

To send keystrokes to a target page, use `Input.dispatchKeyEvent` with three events: `keyDown`, `char`, and `keyUp`:

```bash
./bin/sk-cdp send --target options "Input.dispatchKeyEvent" '{"type": "keyDown", "key": "f"}' && sleep 0.05 && ./bin/sk-cdp send --target options "Input.dispatchKeyEvent" '{"type": "char", "text": "f"}' && sleep 0.05 && ./bin/sk-cdp send --target options "Input.dispatchKeyEvent" '{"type": "keyUp", "key": "f"}'
```

This sends the `f` key to the options page. Replace `"f"` with any other key (e.g., `;` for semicolon).

**Uppercase keys with shift modifier:**

To send uppercase `E` (which requires shift):

```bash
./bin/sk-cdp send --target options.html "Input.dispatchKeyEvent" '{"type": "keyDown", "key": "E", "modifiers": 8}' && sleep 0.05 && ./bin/sk-cdp send --target options.html "Input.dispatchKeyEvent" '{"type": "char", "text": "E", "modifiers": 8}' && sleep 0.05 && ./bin/sk-cdp send --target options.html "Input.dispatchKeyEvent" '{"type": "keyUp", "key": "E", "modifiers": 8}'
```

**Modifiers reference:**
- `1` = Alt
- `2` = Ctrl
- `4` = Meta/Cmd
- `8` = Shift

**Key advantages of sk-cdp + proxy logging:**
- ✅ Metadata shows you when code does nothing (failures detected)
- ✅ Console logs persist for investigation
- ✅ No timeout waiting - events logged immediately
- ✅ Works for all targets concurrently
- ✅ DOM mutations visible in before/after comparison

## Automated Testing using Playwright

Playwright tests provide **functional testing** of the extension with optional **V8 code coverage** collection for code analysis.

### Running Playwright Tests

**Default: Fast functional tests (no coverage overhead):**
```bash
bunx playwright test tests/playwright/commands/cmd-scroll-down.spec.ts
```

Output:
```
  3 passed (2.9s)
```

**With V8 coverage collection:**
```bash
COVERAGE=true bunx playwright test tests/playwright/commands/cmd-scroll-down.spec.ts
```

**Parallel coverage run with manifest:**
```bash
npm run cov:parallel
```

Output includes coverage reports for each test:
```
✓ Test 1: pressing j key scrolls page down (1.3s)
--- V8 Coverage Report ---
Coverage: 77.01% (42973/55803 bytes)
  77.0% | chrome-extension://aajlcoiaogpknhgninhopncaldipjdnp/content.js
```

### How Coverage Works

When `COVERAGE=true` is set:

1. Browser launches with `--remote-debugging-port` for Chrome DevTools Protocol (CDP)
2. Tests run normally with full functional assertions
3. After each test, the `collectOptionalCoverage()` helper:
   - Connects to CDP to the page target
   - Enables Profiler domain with `startPreciseCoverage()`
   - Collects V8 coverage data with `takePreciseCoverage()`
   - Reports coverage percentage and scripts
4. Coverage is isolated per-test (can be accumulated with further work)

### Coverage Collection Details

**What's measured:**
- Content script (`content.js`) execution during test
- Function-level execution counts
- Code branch coverage (which if/else paths were taken)
- Byte-level precision (exact offsets in source code)

**Example coverage data structure:**
```json
{
  "scriptId": "6",
  "url": "chrome-extension://aajlcoiaogpknhgninhopncaldipjdnp/content.js",
  "functions": [
    {
      "functionName": "elm.skScrollBy",
      "ranges": [
        {"startOffset": 116472, "endOffset": 117481, "count": 3},
        {"startOffset": 116532, "endOffset": 116626, "count": 0}
      ],
      "isBlockCoverage": true
    }
  ]
}
```

### Timing & Overhead

- **Without coverage:** ~2.9s for 3 tests
- **With coverage:** ~5.8s for 3 tests (~100% overhead)

The overhead is mostly one-time browser startup with remote debugging. With further optimization (context/connection pooling), this can be reduced to ~30-50% overhead.

### Single Source of Truth

All Playwright tests maintain **one implementation** for both modes:
- Same test assertions in both modes
- Coverage collection is **optional** via `COVERAGE=true` environment variable
- Helper `collectOptionalCoverage()` handles all coverage logic internally
- No duplicate test files

Example: `cmd-scroll-down.spec.ts` tests scroll behavior identically whether coverage is enabled or not.

### When to Use Playwright Tests

- ✅ **Functional verification** - Does the command work? (always)
- ✅ **CI/CD automation** - Fast, simple test suite (default, no coverage)
- ✅ **Code coverage analysis** - Which code paths were exercised? (optional with `COVERAGE=true`)
- ❌ Performance profiling - Use Chrome DevTools instead

### Running All Playwright Tests

```bash
# Fast functional tests
bunx playwright test tests/playwright/

# With coverage
COVERAGE=true bunx playwright test tests/playwright/
```

See `tests/playwright/commands/` for test examples and `tests/playwright/utils/pw-helpers.ts` for the `collectOptionalCoverage()` helper.

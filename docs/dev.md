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

## CDP Debug Scripts (TypeScript)

**Strengths:**
- Reusable, documented, and maintainable
- Better for complex operations

**Weaknesses:**
- Slower iteration - write, save, npm run cycle
- Still not persistent, runtime-only

**Gold Standard Screenshot:**

```bash
npm run debug:cdp:live debug/cdp-screenshot.ts
npm run debug:cdp:headless debug/cdp-screenshot.ts
```

Output: `/tmp/screenshot-[timestamp].png` (PNG, 50-60KB)

The script demonstrates the reusable CDP pattern:
- Direct WebSocket connection to Chrome DevTools
- Auto-opens options page if not already open
- Clean error handling and logging
- Timestamp-based output filename
- Works in both headless and live modes

See `debug/cdp-screenshot.ts` for the implementation pattern.

### Headless Testing with bin/dbg test-run

`bin/dbg test-run` provides the recommended way to run CDP tests with JSON output:

```bash
bin/dbg test-run tests/cdp/commands/cdp-create-hints.test.ts
```

**Output:**
- Clean JSON to stdout (structured JSON report with V8 code coverage data and test metadata)
- All logs and diagnostics written to `/tmp/dbg-test-run-<timestamp>.log`
- Useful for CI/CD integration and automated test analysis

Headless runs also auto-enable Chrome's Developer Mode by seeding
`extensions.ui.developer_mode=true` in the temporary profile so that
`chrome.userScripts` is available for config loading in MV3 builds.

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

## Hybrid approach I actually used

1. **sk-cdp** for quick inspection/exploration (or websocat for ultra-quick one-liners)
2. Source modification for actual implementation
3. **bin/dbg reload** for verification
4. Screenshot for final confirmation

This workflow makes sense because:
- sk-cdp exploration is fast and clean (no JSON escaping)
- Source changes are persistent
- bin/dbg reload validates the real build pipeline (~400ms)
- Screenshots provide visual confirmation

**When to use what:**
- **Inspection**: `sk-cdp eval "..."` (most of the time) - with automatic metadata & console logging
- **One-liner**: `websocat ...` (when you already know the CDP command)
- **Complex scenario**: CDP debug script in `debug/` - for reusable, documented patterns
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

# 6. Take screenshots for final confirmation
npm run debug:cdp:live debug/cdp-screenshot.ts
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

## CDP Test Coverage Analysis

CDP tests automatically collect V8 code coverage during execution, providing branch-level insights into which code paths are tested.

### Coverage Collection Workflow

Tests using `startCoverage()` and `collectCoverageWithAnalysis()` from `tests/cdp/utils/cdp-coverage.ts`:

```typescript
// In beforeAll:
await startCoverage(pageWs, 'content-page');

// In afterAll:
await collectCoverageWithAnalysis(pageWs, TEST_NAME);
```

This generates coverage data with automatic analysis at: `/tmp/cdp-coverage/page-{testName}-coverage-{timestamp}.json`

### Coverage Data Structure

File contains three top-level keys:

```json
{
  "result": [...],           // Original V8 coverage data (raw branch data)
  "timestamp": 18419.995,    // V8 timestamp when coverage was collected
  "analysis": {              // Generated analysis (new!)
    "functionSummary": { ... },
    "hotPathAnalysis": { ... }
  }
}
```

### Function-Level Summary

Each function gets aggregated metrics:

```bash
jq '.analysis.functionSummary["isElementClickable"]' page-hints-coverage-*.json
```

Returns:
```json
{
  "scriptUrl": "chrome-extension://aajlcoiaogpknhgninhopncaldipjdnp/content.js",
  "totalExecutions": 255,        // Sum of all branch executions
  "totalBranches": 5,            // Number of code branches/paths
  "uncoveredBranches": 1,        // Branches with count: 0 (untested)
  "coveragePercent": 80,         // Percentage of branches covered
  "isBlockCoverage": true        // Has branch-level detail
}
```

### Hot Path Analysis

Three analyses identify patterns in coverage:

```bash
# Get hottest functions (most frequently executed)
jq '.analysis.hotPathAnalysis.hottest' page-hints-coverage-*.json

# Get coldest functions (never executed)
jq '.analysis.hotPathAnalysis.coldest' page-hints-coverage-*.json

# Get most uncovered functions (most branches untested)
jq '.analysis.hotPathAnalysis.mostUncovered' page-hints-coverage-*.json
```

**Hottest function example:**
```json
{
  "functionName": "getVisibleElements",
  "scriptUrl": "chrome-extension://aajlcoiaogpknhgninhopncaldipjdnp/content.js",
  "executionCount": 3838,    // Called 3838 times during test!
  "branches": 10
}
```

**Most uncovered example:**
```json
{
  "functionName": "_sanitizeElements2",
  "uncoveredBranches": 15,
  "totalBranches": 16,
  "coveragePercent": 6       // Only 6% of branches tested
}
```

### Querying Coverage Data

Common jq queries to analyze coverage:

```bash
# Get all function names in coverage:
jq '.analysis.functionSummary | keys' page-hints-coverage-*.json

# Get specific function coverage:
jq '.analysis.functionSummary["functionName"]' page-hints-coverage-*.json

# Find functions with less than 50% coverage:
jq '.analysis.functionSummary | to_entries[] | select(.value.coveragePercent < 50)' page-hints-coverage-*.json

# Find functions with 0% coverage:
jq '.analysis.functionSummary | to_entries[] | select(.value.coveragePercent == 0)' page-hints-coverage-*.json

# Find functions with 100% coverage:
jq '.analysis.functionSummary | to_entries[] | select(.value.coveragePercent == 100)' page-hints-coverage-*.json

# Get only function names and coverage percent:
jq '.analysis.functionSummary | to_entries[] | {name: .key, coverage: .value.coveragePercent}' page-hints-coverage-*.json

# Compare a function's coverage across multiple test runs:
jq '.analysis.functionSummary["isElementClickable"].coveragePercent' page-hints-coverage-*.json
jq '.analysis.functionSummary["isElementClickable"].coveragePercent' page-show-usage-coverage-*.json

# Get top 5 hottest functions:
jq '.analysis.hotPathAnalysis.hottest[0:5]' page-hints-coverage-*.json

# Find uncovered functions that are also in hot path:
jq '.analysis.hotPathAnalysis.hottest[] | select(.executionCount > 100)' page-hints-coverage-*.json
```

### Understanding Coverage Metrics

**totalExecutions:** Sum of execution counts across all branches in the function. Higher = frequently used during test.

**totalBranches:** Number of distinct code paths (if/else blocks, OR conditions, etc.). More branches = more complex logic.

**uncoveredBranches:** Count of branches where execution count was 0. Indicates which paths weren't tested.

**coveragePercent:** `(totalBranches - uncoveredBranches) / totalBranches * 100`. Percentage of logic branches exercised.

**Example interpretation:**
- `isElementClickable`: 255 executions, 5 branches, 80% coverage → Well-tested hint-finding logic, missing 1 branch
- `_sanitizeElements2`: 2 executions, 16 branches, 6% coverage → HTML sanitization not exercised by this test
- `clone`: 102 executions, 1 branch, 100% coverage → Fully tested, no branches

### Coverage Workflow

1. **Run test:** Coverage is collected during test execution
2. **Analysis generated:** `collectCoverageWithAnalysis()` automatically aggregates data
3. **Find insights:** Query with jq to identify:
   - Hot paths (performance-critical code)
   - Cold spots (untested code)
   - Coverage gaps (functions needing more tests)
4. **Plan tests:** Use insights to guide new test cases
5. **Compare over time:** Run same tests, compare coverage to track improvement

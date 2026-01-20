# Testing

## testing.overview

Surfingkeys uses a hybrid testing strategy:
- **Jest + jsdom** - Fast unit tests for logic (existing)
- **CDP (Chrome DevTools Protocol)** - Real browser E2E tests (new)

See [testing-strategy-analysis.md](testing-strategy-analysis.md) for detailed strategy.

---

## testing.cdp

### testing.cdp.experiment

**Minimal CDP Test** - Proves TypeScript can connect to Chrome extension via CDP and capture console output.

**Purpose:** Foundation for automated testing where agent can verify implementations.

**Status:** ✅ Working (basic console capture)

### testing.cdp.what_it_does

Connects to Surfingkeys extension background page via Chrome DevTools Protocol and captures all console messages in real-time.

**Use Case:**
```javascript
// In extension code
console.log('[TRACE] Feature X executed');

// CDP test captures this and verifies feature ran
```

### testing.cdp.preflights

**Automatic preflight check:** The test automatically checks if Chrome is running with debugging enabled and provides helpful error messages if not.

**Requirements before running test:**

1. **Chrome running with remote debugging**
   ```bash
   # Recommended: Use custom launcher
   /home/hassen/config/scripts/private/bin/gchrb-dev
   ```

2. **Surfingkeys extension loaded**
   - Extension must be built (`npm run esbuild:dev`)
   - Loaded in Chrome (`chrome://extensions/`)
   - Verify extension is active

3. **Dependencies installed**
   ```bash
   npm install
   # Ensures ws, @types/ws, ts-node are available
   ```

**The test will automatically:**
- Check if port 9222 is accessible
- Show helpful error message if Chrome not running with debugging
- Connect to extension background page if available

### testing.cdp.usage

**Run CDP monitor:**
```bash
npm run test:cdp
```

This command:
- Starts CDP monitor in background (auto-manages process)
- Shows process ID and log file location
- Displays last 10 lines from log
- Exits immediately (non-blocking)
- Monitor continues running in background
- All output logged to `/tmp/surfingkeys-cdp.log`

**Manual workflow (if needed):**
```bash
# Run the TypeScript test directly
npx ts-node tests/cdp-basic.ts &

# Tail logs in separate terminal
tail -f /tmp/surfingkeys-cdp.log
```

**If Chrome not running with debugging:**
```
❌ Chrome DevTools Protocol not available on port 9222

Please launch Chrome with remote debugging enabled:

  /home/hassen/config/scripts/private/bin/gchrb-dev
```

**Expected output (when Chrome running):**
```
=== CDP Test Started: 2026-01-20T07:00:00.000Z ===

CDP Basic Test - Console Log Capture

✓ Found background: Surfingkeys (service_worker)
✓ Connected to background page

Listening for console messages...

Press Alt+Shift+R or run: ./scripts/reload-extension.sh

Logs: tail -f /tmp/surfingkeys-cdp.log

---

💬 [LOG] Background page loaded
💬 [LOG] Settings initialized
```

**Interactive testing:**
- Press `Alt+Shift+R` in Chrome to reload extension
- Or run: `xdotool key alt+shift+r`
- Watch console logs appear in log file

**Log file location:** `/tmp/surfingkeys-cdp.log`

**Exit:** `Ctrl+C` (if running in foreground) or `kill %1` (if backgrounded)

### testing.cdp.verification

**Verify it's working:**

1. Test should connect without errors
2. You should see "Listening for console messages..."
3. Trigger extension reload (Alt+Shift+R)
4. Console logs should appear in terminal

**If it fails:**
- Check Chrome is running with `--remote-debugging-port=9222`
- Verify: `curl http://localhost:9222/json | jq .`
- Check extension is loaded and active
- Check for WebSocket connection errors

### testing.cdp.after_reboot

**Checklist after system reboot:**

- [ ] Launch Chrome with debugging: `gchrb-dev` 
- [ ] Load extension in Chrome
- [ ] Verify debugging port: `curl http://localhost:9222/json`
- [ ] Run test: `npm run test:cdp`

### testing.cdp.implementation

**File:** `tests/cdp-basic.ts`

**What it does:**
1. Connects to `http://localhost:9222/json` to discover targets
2. Finds Surfingkeys background page (service_worker or background_page)
3. Opens WebSocket connection to background page
4. Enables `Runtime` and `Log` CDP domains
5. Listens for console messages (`Runtime.consoleAPICalled`)
6. Prints logs with color-coded prefixes

**Dependencies:**
- `ws` - WebSocket client
- `@types/ws` - TypeScript definitions
- `ts-node` - Run TypeScript directly

### testing.cdp.next_steps

**Future enhancements:**

1. **Keyboard simulation** - Send keyboard events to test commands
2. **DOM inspection** - Verify UI elements appear/disappear
3. **Chrome API testing** - Test `chrome.tabs.query()`, etc.
4. **Automated Chrome launch** - Start Chrome programmatically
5. **Jest integration** - Run CDP tests alongside unit tests
6. **Message tracing** - Capture content ↔ background messaging

See [cdp-experiment-scope.md](cdp-experiment-scope.md) for full scope.

---

## testing.jest

### testing.jest.unit_tests

**Existing test suite** - Jest with mocked Chrome APIs

**Run:**
```bash
npm test
```

**Coverage:** 97.3% pass rate (recently fixed)

**Use for:**
- Pure function testing
- Logic verification
- Fast regression suite

**Limitations:**
- Mocked Chrome APIs (not real browser)
- No E2E verification
- Cannot test real keyboard events

See [testing-strategy-analysis.md](testing-strategy-analysis.md) for when to use Jest vs CDP.

---

## testing.workflow

### testing.workflow.development

**When developing a feature:**

1. **Write logic** - Pure functions, utilities
2. **Jest test** - Verify logic works (fast TDD cycle)
3. **Implement UI** - Integrate into extension
4. **CDP test** - Verify in real browser
5. **Ship** - Confident it works

### testing.workflow.agent_verification

**Agent workflow:**

```
Agent: "Implementing fuzzy finder..."
Agent: *writes code*
Agent: *adds console.log('[TRACE] Fuzzy finder opened')*
Agent: *runs: npm run test:cdp (starts monitor in background)*
Agent: *waits 2 seconds for monitor to start*
Agent: *triggers: xdotool key alt+shift+r (reloads extension)*
Agent: *waits 2 seconds for logs*
Agent: *checks: grep "TRACE.*Fuzzy finder" /tmp/surfingkeys-cdp.log*
Agent: "Feature verified ✅"
```

**Key:** Agent can verify own work without human intervention.

---

## testing.references

- **Strategy Analysis:** [testing-strategy-analysis.md](testing-strategy-analysis.md)
- **CDP Scope:** [cdp-experiment-scope.md](cdp-experiment-scope.md)
- **CDP Test:** `tests/cdp-basic.ts`
- **Jest Tests:** `tests/` directory
- **Chrome DevTools Protocol:** https://chromedevtools.github.io/devtools-protocol/

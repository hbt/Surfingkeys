# Migration Phase 2: Automated Testing Infrastructure

## migration.phase2.overview

**Goal:** Establish reliable automated testing before implementing any features

**Why:** Cannot verify implementations without testing infrastructure. Manual verification creates prompt-back-and-forth hell.

**Core Principle:** Build the verification layer before the feature layer.

---

## migration.phase2.rationale

**Problem Without Testing:**
```
Agent: "I implemented usage tracking"
User: "Does it work?"
Agent: "Please test manually and let me know"
User: *spends 30 minutes testing*
User: "It's broken in these 5 ways"
Agent: "Let me fix..."
[Repeat cycle 3-4 times]
```

**Solution With Testing:**
```
Agent: "I implemented usage tracking"
Agent: "Running automated tests..."
Agent: "Tests pass ✅ - verified it tracks commands and persists data"
User: "Great, ship it"
```

**Impact:**
- Agent can verify own implementations
- Faster iteration cycles
- Higher quality code
- Less manual testing burden
- Confidence in changes

---

## migration.phase2.foundation

**Existing Work:** CDP experiments in archive branch

**Location:** `archive/hbt-master-manifest-v2-fork-2018-2025:docs/cdp.md`

**What Already Works:**
- Chrome DevTools Protocol integration
- Direct connection to extension background page
- Programmatic access to Chrome Extension APIs
- Python test scripts with CDP automation

**Challenge:** CDP work built on v0.9.48 architecture, must port to current upstream

---

## migration.phase2.goals

**2.1 Port CDP Integration**
- Bring CDP documentation to master
- Adapt Python examples for current extension structure
- Verify CDP can connect to background page

**2.2 Establish Test Framework**
- Decide: Jest + CDP? Playwright? Custom?
- Create test utilities and helpers
- Document testing patterns

**2.3 Build Feedback Loop**
- Tracing: Log command execution flow
- Logging: Structured debug output
- Testing: Automated verification

**2.4 Create Example Tests**
- Test basic command execution
- Test mapping system
- Test storage/persistence
- Prove testing approach works

---

## migration.phase2.deliverables

**✅ Completed Tooling:**

**Debug Infrastructure:**
- `bin/dbg` - JSON-based debug command wrapper (clean interface for debugging)
- `scripts/dbg/index.js` - Main debug entry point
- `scripts/dbg/actions/` - Individual action implementations
- `scripts/dbg/lib/` - Supporting utilities

**Headless Testing Suite (package.json):**
```json
"test:cdp:headless": "bun tests/cdp/run-headless.js",
"test:cdp:headless:all": "find tests/cdp -name '*.test.ts' -type f | xargs -P 16 -I {} bun run test:cdp:headless {}",
"test:cdp:headless:seq": "bun tests/cdp/run-all-sequential.js",
"test:cdp:live": "bun tests/cdp/run-live.js",
"debug:cdp:headless": "bun debug/run-headless.js",
"debug:cdp:live": "bun debug/run-live.js"
```

**Test Infrastructure:**
- Headless Chrome testing with CDP (tests/cdp/run-headless.js)
- Parallel test execution (up to 16 concurrent via xargs -P 16)
- Sequential test execution option (run-all-sequential.js)
- Live browser testing for manual verification
- Debug scripts with both headless and live modes

**Validation Tools:**
- `scripts/validate-mappings.js` - Mapping conflict detection
- `scripts/validate-mappings.js --prefixes` - Prefix-based conflict detection

---

## migration.phase2.testing_approaches

**Option A: CDP + Python (existing approach)**
- **Pros:** Already proven in archive experiments
- **Pros:** Direct browser control, no middleman
- **Cons:** Python dependency, separate from JS ecosystem

**Option B: Playwright + JavaScript**
- **Pros:** Native Chrome extension testing support
- **Pros:** Same language as codebase
- **Pros:** Rich debugging tools
- **Cons:** Learning curve, new dependency

**Option C: Jest + Puppeteer + CDP**
- **Pros:** Combines existing Jest tests with E2E
- **Pros:** JavaScript-based
- **Cons:** Puppeteer may have limitations with extensions

**Decision Criteria:**
- Which integrates best with existing test suite (97.3% pass rate)?
- Which provides fastest feedback loop?
- Which is easiest to maintain?
- Which handles Chrome extension APIs reliably?

---

## migration.phase2.tracing_and_logging

**Tracing Requirements:**

Track command execution flow:
```javascript
// Example trace output
TRACE: User pressed 'gf'
  → keyboardUtils.mapKey('gf')
  → Normal.openLink()
  → Hints.create(linkHints)
  → [User selected hint]
  → chrome.tabs.create({url: 'https://...'})
  ✓ Command completed in 234ms
```

**Implementation:**
```javascript
// src/common/tracer.js
class CommandTracer {
  trace(command, step, data) {
    if (DEBUG_MODE) {
      console.log(`TRACE [${command}]: ${step}`, data);
    }
    // Also send to structured log
    this.log.push({
      timestamp: Date.now(),
      command,
      step,
      data
    });
  }
}
```

**Logging Requirements:**

Structured debug output:
```javascript
// src/common/logger.js
const logger = {
  debug: (msg, context) => { /* ... */ },
  info: (msg, context) => { /* ... */ },
  warn: (msg, context) => { /* ... */ },
  error: (msg, context) => { /* ... */ }
};

// Usage
logger.debug('Command executed', {
  command: 'openLink',
  keybinding: 'gf',
  duration: 234,
  result: 'success'
});
```

**Benefits:**
- Debugging feature implementations
- Understanding command flow
- Identifying performance bottlenecks
- Test assertions on execution flow

---

## migration.phase2.example_test_structure

**Test: Command Execution**

```javascript
// tests/e2e/commands.test.js
describe('Command Execution', () => {
  let browser, page, cdp;

  beforeAll(async () => {
    // Setup: Load extension, connect CDP
    ({ browser, page, cdp } = await setupExtensionTest());
  });

  test('openLink command (gf) creates hints', async () => {
    // Navigate to test page with links
    await page.goto('http://example.com');

    // Execute command via CDP
    await cdp.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'g'
    });
    await cdp.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'f'
    });

    // Verify hints appeared
    const hints = await page.$$('[data-surfingkeys-hint]');
    expect(hints.length).toBeGreaterThan(0);
  });

  test('scrollDown command (j) scrolls page', async () => {
    const initialScroll = await page.evaluate(() => window.scrollY);

    // Press 'j'
    await cdp.sendCommand('Input.dispatchKeyEvent', {
      type: 'char',
      text: 'j'
    });

    // Verify scroll changed
    await page.waitForFunction(
      (initial) => window.scrollY > initial,
      {},
      initialScroll
    );

    const newScroll = await page.evaluate(() => window.scrollY);
    expect(newScroll).toBeGreaterThan(initialScroll);
  });

  afterAll(async () => {
    await browser.close();
  });
});
```

---

## migration.phase2.workflow

**Development Cycle with Testing:**

**1. Implement Feature**
```bash
# Create feature branch
git checkout -b feature/usage-tracking
```

**2. Write Test First (TDD)**
```javascript
// tests/e2e/usage-tracking.test.js
test('tracks command invocations', async () => {
  // Execute command
  await executeCommand('scrollDown');

  // Verify tracking
  const stats = await getUsageStats();
  expect(stats.scrollDown.count).toBe(1);
});
```

**3. Implement Until Test Passes**
```javascript
// src/content_scripts/command-stats.js
function trackCommand(name) {
  // Implementation
}
```

**4. Run Tests**
```bash
npm run test:e2e
# ✅ All tests pass
```

**5. Agent Self-Verification**
- Agent runs tests automatically
- Agent reports: "Implementation complete, tests pass"
- User trusts implementation without manual verification

---

## migration.phase2.success_criteria

**Status:** ✅ **COMPLETE**

Phase 2 complete:
- [x] CDP integration ported and working on master
- [x] Test framework implemented (headless CDP-based)
- [x] Can write and run automated tests
- [x] Package.json configured with test commands
- [x] bin/dbg provides structured debug output
- [x] Mapping validation scripts functional
- [x] Parallel and sequential test execution available
- [x] Agent can verify implementations via test:cdp:headless
- [x] **Ready to implement Phase 3 features with confidence**

**Quick Start:**
```bash
# Run single test
npm run test:cdp:headless tests/cdp/cdp-keyboard.test.ts

# Run all tests in parallel (16 concurrent)
npm run test:cdp:headless:all

# Run all tests sequentially
npm run test:cdp:headless:seq

# Debug with live browser
npm run debug:cdp:live debug/cdp-screenshot.ts

# Validate keybindings for conflicts
npm run validate:mappings
npm run validate:mappings:prefixes
```

---

## migration.phase2.what_was_implemented

**Approach Chosen:** Headless CDP-based testing via Bun runner

**Implementation:**
- Created `bin/dbg` wrapper for JSON-based debug commands
- Implemented `scripts/dbg/` infrastructure with actions and utilities
- Built headless test runner: `tests/cdp/run-headless.js`
- Added sequential runner: `tests/cdp/run-all-sequential.js`
- Configured parallel execution via package.json (up to 16 concurrent)
- Added mapping validation tools with prefix detection
- Integrated with existing Jest test suite (97.3% pass rate)

**Key Files:**
- `bin/dbg` - Debug wrapper
- `scripts/dbg/index.js` - Entry point
- `scripts/dbg/actions/` - Action implementations
- `scripts/dbg/lib/` - Utilities
- `scripts/validate-mappings.js` - Keybinding conflict detection
- `package.json` - Test commands (test:cdp:headless, test:cdp:headless:all, etc.)

**Test Execution:**
- Single test headless: `npm run test:cdp:headless [file]`
- Parallel all tests: `npm run test:cdp:headless:all` (16 concurrent)
- Sequential all tests: `npm run test:cdp:headless:seq`
- Live browser debug: `npm run debug:cdp:live [script]`
- Headless debug: `npm run debug:cdp:headless [script]`

---

## migration.phase2.transition_notes

**Phase 2 → Phase 3 Ready:**
- ✅ Testing infrastructure functional and proven
- ✅ Can run tests autonomously
- ✅ Mapping validation prevents conflicts
- ✅ bin/dbg provides structured debugging
- ✅ Ready to master upstream commands with confidence

---

## migration.phase2.transition_to_phase3

**Readiness Check:**
- ✅ Can test command execution
- ✅ Can test keybinding mappings
- ✅ Can test data persistence
- ✅ Agent can run tests without user
- ✅ Test failures are clear and actionable

**When ready → Phase 3:**
- Build fuzzy finder (with tests)
- Build usage tracking (with tests)
- Build mapping validator (with tests)
- Review commands (with automated testing)

**Without Phase 2 → Phase 3 = Pain**
**With Phase 2 → Phase 3 = Smooth sailing**

---

## References

- Archive CDP work: `archive/hbt-master-manifest-v2-fork-2018-2025:docs/cdp.md`
- Existing test suite: `tests/` (Jest-based, 97.3% pass rate)
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- Playwright Chrome Extensions: https://playwright.dev/docs/chrome-extensions

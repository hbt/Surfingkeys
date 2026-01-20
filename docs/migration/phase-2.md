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

**Documentation:**
- [ ] `docs/cdp.md` - Ported and updated for current master
- [ ] `docs/testing-strategy.md` - How to write and run tests
- [ ] `docs/debugging.md` - Tracing and logging guide

**Code:**
- [ ] `tests/e2e/` - End-to-end test suite
- [ ] `tests/helpers/` - CDP utilities and test helpers
- [ ] `src/common/logger.js` - Structured logging utility
- [ ] `src/common/tracer.js` - Command execution tracing

**Examples:**
- [ ] `tests/e2e/commands.test.js` - Basic command execution tests
- [ ] `tests/e2e/mappings.test.js` - Keybinding tests
- [ ] `tests/e2e/storage.test.js` - Data persistence tests

**Scripts:**
- [ ] `scripts/test-e2e.sh` - Run full test suite
- [ ] `scripts/test-watch.sh` - Watch mode for TDD
- [ ] `package.json` updates - Add test commands

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

Phase 2 complete when:
- [ ] CDP integration ported and working on master
- [ ] Test framework decided and configured
- [ ] Can write and run automated tests
- [ ] Tracing captures command execution flow
- [ ] Logging provides structured debug output
- [ ] At least 5 example tests written and passing
- [ ] Documentation explains how to write tests
- [ ] Agent can verify own implementations
- [ ] **Critical:** Ready to implement Phase 3 features with confidence

---

## migration.phase2.execution_plan

**Step 1: Port CDP Documentation**
- Copy `archive:.../docs/cdp.md` to master
- Update for current extension structure
- Verify CDP connection works

**Step 2: Choose Testing Approach**
- Evaluate options (CDP+Python vs Playwright vs Jest+Puppeteer)
- Spike: Build proof-of-concept test with each
- Document decision (ADR-004?)

**Step 3: Setup Test Infrastructure**
- Install dependencies
- Configure test runner
- Create helper utilities

**Step 4: Build Tracing & Logging**
- Implement tracer utility
- Implement logger utility
- Integrate into existing code

**Step 5: Write Example Tests**
- Command execution test
- Mapping test
- Storage test
- Verify all pass

**Step 6: Document Testing Patterns**
- How to write tests
- How to run tests
- How to debug failing tests
- Best practices

---

## migration.phase2.timeline

**Estimated Duration:** 1-2 weeks

**Week 1:**
- Port CDP docs
- Choose testing approach
- Setup infrastructure
- Build tracing/logging

**Week 2:**
- Write example tests
- Document patterns
- Refine based on learnings
- Validate approach

**Ready for Phase 3:** When agent can implement features and verify them autonomously

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

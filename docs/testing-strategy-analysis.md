# Automated Testing Strategy Analysis

## overview

**Context:** Migration Phase 2 requires automated testing infrastructure before implementing features.

**Current State:**
- Jest + jsdom (mocked Chrome APIs) - functional, 97.3% pass rate (recently fixed)
- CDP experiments (real browser) - proven on archive branch, 6 Python examples

**Goal:** Determine optimal testing strategy for development and feature verification

---

## current.mocked_testing

### current.mocked_testing.architecture

**Framework:** Jest + jsdom

**Environment:**
- `testEnvironment: 'jsdom'` - Fake browser DOM
- Mocked Chrome APIs using `jest.fn()`
- Tests run in Node.js, not real browser

**Example Mock:**
```javascript
global.chrome = {
    runtime: {
        sendMessage: jest.fn(),
        getURL: jest.fn((path) => `chrome-extension://fake-extension-id/${path}`),
        onMessage: {
            addListener: jest.fn()
        }
    },
    extension: {
        getURL: jest.fn()
    }
}
```

### current.mocked_testing.test_structure

**Location:** `tests/` directory organized by module

```
tests/
├── background/start.test.js
├── content_scripts/
│   ├── common/normal.test.js
│   ├── markdown.test.js
│   ├── uiframe.test.js
│   └── ui/
│       ├── frontend.test.js
│       └── omnibar.test.js
├── data/
├── nvim/
└── utils.ts
```

**Example Test:**
```javascript
test("normal /", async () => {
    normal.enter();
    await new Promise((r) => {
        document.addEventListener("surfingkeys:front", function(evt) {
            if (evt.detail.length && evt.detail[0] === "openFinder") {
                r(evt);
            }
        });
        document.body.dispatchEvent(new KeyboardEvent('keydown',{'key':'/'}));
    });
});
```

**What it tests:**
- Pressing `/` triggers `openFinder` event
- Uses fake KeyboardEvent
- Verifies event dispatch mechanism

### current.mocked_testing.strengths

**Fast Execution:**
- No browser startup overhead
- Runs in milliseconds
- Suitable for CI/CD pipelines

**Isolation:**
- Tests individual functions
- No external dependencies
- Reproducible results

**Development Velocity:**
- Quick feedback loop
- TDD-friendly
- Easy to debug in IDE

**Coverage Reporting:**
- `collectCoverage: true` in jest.config
- Identifies untested code paths

**Integration:**
- Already configured
- NPM script: `npm test`
- Working (97.3% pass rate)

### current.mocked_testing.weaknesses

**Not Real Browser:**
- jsdom is incomplete DOM implementation
- Missing browser APIs
- Different behavior than Chrome

**Mocked Chrome APIs:**
- `chrome.tabs.query()` returns whatever you mock
- Doesn't test actual Chrome Extension behavior
- False positives: tests pass, extension broken
- False negatives: tests fail, extension works

**Cannot Verify:**
- Real keybinding behavior
- Actual tab switching
- Content script injection
- Chrome Extension API edge cases
- Visual rendering issues

**Limited Scope:**
- Unit tests only
- No integration testing
- No E2E verification
- Cannot test full user workflows

**Development Pain Point:**
```
Scenario:
1. Jest tests pass ✅
2. Deploy to browser
3. Feature doesn't work ❌
4. Debug in browser manually
5. Fix code
6. Update mocks to match
7. Repeat
```

**The Problem:** Agent implements feature, mocked tests pass, user finds it's broken.

---

## cdp.real_browser_testing

### cdp.architecture

**Framework:** Chrome DevTools Protocol (CDP)

**How it Works:**
```
Test Script (Python/JavaScript)
  ↓ WebSocket connection
Chrome Background Page (extension context)
  ↓ Runtime.evaluate(javascript_code)
Real Chrome Extension APIs
  ↓ chrome.tabs.query(), chrome.windows, etc.
Real Browser Behavior
```

**Key Insight:** Connect to **extension background page**, not web page.

**Discovery:**
```bash
# Find extension background WebSocket endpoint
curl -s http://localhost:9222/json | jq '.[] | select(.url | contains("_generated_background_page.html")) | .webSocketDebuggerUrl'
```

Output:
```
"ws://localhost:9222/devtools/page/5591A6D431C2B1D3B40ABABE62B4A500"
```

### cdp.existing_experiments

**Location:** Archive branch `archive/hbt-master-manifest-v2-fork-2018-2025:docs/examples/`

**6 Python Scripts:**

1. **cdp-console-logger.py**
   - Listens to console output from extension
   - Captures errors and debug logs
   - Real-time tracing

2. **cdp-direct-bg.py**
   - Direct execution in background context
   - Tests Chrome API access
   - Proves CDP connection works

3. **cdp-e2e-test.py**
   - End-to-end test example
   - Simulates user workflow
   - Verifies outcomes

4. **cdp-inspect-buttons.py**
   - DOM inspection from extension context
   - Tests hints and UI elements

5. **cdp-inspect-buttons-v2.py**
   - Improved version of above
   - Better error handling

6. **cdp-send-sequence.py**
   - Sends keyboard input sequences
   - Tests multi-key commands
   - Verifies command execution

### cdp.chrome_launch_requirements

**Required Flags:**
```bash
google-chrome-stable \
  --user-data-dir=/tmp/chrome-test-profile \
  --remote-debugging-port=9222 \
  --disable-infobars \
  --new-window
```

**Verification:**
```bash
curl http://localhost:9222/json | jq .
```

### cdp.strengths

**Real Browser:**
- Actual Chrome instance
- Real Chrome Extension APIs
- Real DOM rendering
- Real JavaScript execution

**True E2E Testing:**
- Test complete workflows
- Verify user-visible behavior
- Catch integration bugs
- Test keyboard shortcuts in reality

**Chrome Extension API Access:**
```python
# This actually queries real tabs
result = cdp.execute("""
    chrome.tabs.query({active: true}, (tabs) => {
        console.log(tabs[0].title);
    });
""")
```

**Development Feedback:**
- See extension running
- Use DevTools for debugging
- Console.log visible in real-time
- Visual verification possible

**Agent Verification:**
- Agent implements fuzzy finder
- Agent runs CDP test
- Test actually types in fuzzy finder
- Test verifies results appear
- ✅ Feature proven to work

**No Mock Maintenance:**
- No need to update mocks
- Real APIs always up-to-date
- No mock/reality divergence

### cdp.weaknesses

**Slower Execution:**
- Browser startup: ~2-3 seconds
- Extension load time
- Not suitable for 100s of tests

**Setup Complexity:**
- Requires Chrome launch with flags
- Must find WebSocket endpoint
- Python dependency (websocket-client)
- More moving parts

**Flakiness Potential:**
- Timing issues (wait for element)
- Race conditions
- Network delays
- State cleanup between tests

**Not Ideal for Unit Tests:**
- Overkill for testing pure functions
- Slow for TDD cycle
- Better for integration/E2E

**Debug Difficulty:**
- Harder to step through
- Async WebSocket communication
- Need to inspect browser state

---

## strategy.hybrid_approach

### strategy.hybrid_approach.rationale

**Neither approach is sufficient alone:**
- Mocked tests: fast but unreliable
- CDP tests: reliable but slow

**Solution:** Use both strategically

### strategy.hybrid_approach.testing_pyramid

```
         /\
        /  \  E2E Tests (CDP)
       /----\  - Critical workflows
      /      \ - Feature verification
     /--------\  Integration Tests (CDP + Jest)
    /          \ - Module interactions
   /------------\ - API contracts
  /______________\ Unit Tests (Jest + Mocks)
                   - Pure functions
                   - Utilities
                   - Logic
```

### strategy.hybrid_approach.when_to_use_each

**Use Jest (Mocked) for:**

1. **Pure Functions**
   ```javascript
   // src/common/utils.js
   function parseUrl(url) {
       // No Chrome APIs, no side effects
   }
   ```
   - Fast TDD cycle
   - No browser needed

2. **Logic Testing**
   - Algorithms
   - Data transformations
   - State machines

3. **Negative Cases**
   - Error handling
   - Edge cases
   - Invalid input

4. **Regression Suite**
   - Run on every commit
   - CI/CD pipeline
   - Fast feedback (<10 seconds)

**Use CDP (Real Browser) for:**

1. **Feature Verification**
   ```python
   # Fuzzy finder feature
   def test_fuzzy_finder():
       press_key('?')
       type_text('scroll')
       results = get_visible_commands()
       assert 'scrollDown' in results
   ```

2. **Chrome Extension APIs**
   - `chrome.tabs.query()`
   - `chrome.windows.create()`
   - `chrome.storage.sync`
   - Real behavior, not mocked

3. **Keyboard Shortcuts**
   - Multi-key sequences ('g', 'f')
   - Mode transitions (normal → insert)
   - Conflict detection

4. **Visual Features**
   - Hints rendering
   - Omnibar display
   - Fuzzy finder UI

5. **Integration Testing**
   - Background ↔ Content script messaging
   - Event flow through system
   - End-to-end workflows

6. **Development Verification**
   - Agent implements feature
   - CDP test proves it works
   - No manual testing needed

### strategy.hybrid_approach.workflow

**TDD with Hybrid Strategy:**

**1. Write Pure Function (Jest)**
```javascript
// src/content_scripts/fuzzy-search.js
function fuzzyMatch(query, text) {
    // Implementation
}
```

```javascript
// tests/content_scripts/fuzzy-search.test.js
test('fuzzyMatch returns score', () => {
    expect(fuzzyMatch('scrl', 'scrollDown')).toBeGreaterThan(0);
    expect(fuzzyMatch('xyz', 'scrollDown')).toBe(0);
});
```

**Iterate quickly:** Change code → Run jest → See result in <1 second

**2. Integrate into UI**
```javascript
// src/content_scripts/fuzzy-finder.js
class FuzzyFinder {
    search(query) {
        return commands.map(cmd => ({
            ...cmd,
            score: fuzzyMatch(query, cmd.name)
        })).filter(c => c.score > 0);
    }
}
```

**3. Verify with CDP**
```python
# tests/e2e/fuzzy-finder.test.py
def test_fuzzy_finder_searches():
    open_fuzzy_finder()  # Press ?
    type_text('scrl')
    results = get_displayed_commands()
    assert 'scrollDown' in results
    assert 'scrollUp' in results
    assert 'openLink' not in results  # Doesn't match
```

**Run:** Python script connects to real browser, verifies feature works

**4. Ship with Confidence**
- Unit tests: Logic is correct ✅
- E2E test: Feature works in browser ✅

---

## strategy.implementation_plan

### strategy.implementation_plan.phase1_cdp_port

**Goal:** Get CDP working on current master

**Tasks:**
1. Copy `archive:.../docs/cdp.md` to master
2. Update for current extension structure
3. Port 1-2 Python examples
4. Verify connection to background page works
5. Document CDP setup process

**Deliverable:** Can run CDP tests against current extension

### strategy.implementation_plan.phase2_framework_choice

**Option A: Keep Python**
- Pros: Already proven, examples exist
- Cons: Separate ecosystem, Python dependency

**Option B: Port to JavaScript (Puppeteer/Playwright)**
- Pros: Same language as codebase, better integration
- Cons: Learning curve, need to adapt existing scripts

**Decision Criteria:**
- Which integrates with Jest better?
- Which is easier for agent to work with?
- Which provides better debugging?

**Recommendation:** Start with Python (proven), evaluate JavaScript port later

### strategy.implementation_plan.phase3_tooling

**Build:**

1. **Test Utilities**
   ```javascript
   // tests/helpers/cdp-utils.js
   async function connectToExtension() {
       const ws = await findExtensionWebSocket();
       return new CDPClient(ws);
   }

   async function executeInBackground(code) {
       const cdp = await connectToExtension();
       return await cdp.evaluate(code);
   }

   async function pressKey(key) {
       await cdp.sendEvent('Input.dispatchKeyEvent', {
           type: 'char',
           text: key
       });
   }
   ```

2. **Logging/Tracing**
   ```javascript
   // src/common/logger.js
   const logger = {
       trace(command, step, data) {
           console.log(`[TRACE] ${command} → ${step}`, data);
       }
   };
   ```

3. **Test Runner Scripts**
   ```bash
   # scripts/test-e2e.sh
   #!/bin/bash
   # 1. Launch Chrome with debugging
   # 2. Wait for extension load
   # 3. Run CDP tests
   # 4. Collect results
   # 5. Shutdown Chrome
   ```

### strategy.implementation_plan.phase4_example_tests

**Write:**

1. **Command Execution Test**
   ```python
   def test_scroll_down_command():
       navigate_to('http://example.com')
       initial_scroll = get_scroll_position()
       press_key('j')  # scrollDown command
       new_scroll = get_scroll_position()
       assert new_scroll > initial_scroll
   ```

2. **Mapping Test**
   ```python
   def test_open_link_hints():
       navigate_to('http://example.com')
       press_key('f')
       hints = get_visible_hints()
       assert len(hints) > 0
       assert all(h.is_visible() for h in hints)
   ```

3. **Storage Test**
   ```python
   def test_usage_tracking():
       execute_command('scrollDown')
       stats = get_usage_stats()
       assert stats['scrollDown']['count'] == 1
   ```

### strategy.implementation_plan.phase5_documentation

**Create:**

1. **docs/testing-strategy.md** - This document
2. **docs/testing-howto.md** - Step-by-step guide
   - How to run Jest tests
   - How to run CDP tests
   - How to write new tests
   - Debugging tips

3. **docs/debugging.md** - Tracing and logging guide

---

## strategy.success_criteria

**Phase 2 Complete When:**

- [ ] CDP connects to current master extension
- [ ] Can execute JavaScript in background context
- [ ] Can send keyboard events to content scripts
- [ ] Can verify command execution
- [ ] At least 3 example CDP tests working
- [ ] Documentation explains both approaches
- [ ] Agent can verify implementations autonomously
- [ ] Clear guidelines on when to use each approach

**Agent Self-Verification Example:**
```
User: "Implement usage tracking"
Agent: *writes code*
Agent: *runs Jest tests* → Logic tests pass ✅
Agent: *runs CDP test* → Tracking verified in real browser ✅
Agent: "Implementation complete, all tests pass"
User: "Ship it" (no manual testing needed)
```

---

## strategy.decision_matrix

### When Agent Implements a Feature

| Feature Type | Jest (Mocked) | CDP (Real Browser) | Why |
|--------------|---------------|-------------------|-----|
| Fuzzy search algorithm | ✅ Required | ✅ Required | Logic + UI verification |
| Usage tracking | ✅ Required | ✅ Required | Logic + persistence verification |
| Mapping validator | ✅ Required | ❌ Optional | Pure logic, no browser needed |
| Command dispatcher | ✅ Required | ✅ Required | Logic + real Chrome API calls |
| URL parser | ✅ Required | ❌ Not needed | Pure function |
| Fuzzy finder UI | ❌ Limited value | ✅ Required | Visual feature, needs real DOM |

**Rule of Thumb:**
- If it calls Chrome APIs → CDP required
- If it has UI → CDP required
- If it's pure logic → Jest sufficient
- If in doubt → Both

---

## next_steps

**Immediate (This Session):**

1. Port CDP docs to master
2. Test 1 CDP example against current extension
3. Verify it works
4. Document any changes needed for current structure

**Phase 2 Execution:**

1. Setup CDP infrastructure (Week 1)
2. Build test utilities and helpers (Week 1)
3. Write 5 example tests (Week 2)
4. Document testing patterns (Week 2)
5. Agent validation (Week 2)

**Then Phase 3:**

Build features with confidence, knowing tests will verify them.

---

## references

- Archive CDP docs: `archive/hbt-master-manifest-v2-fork-2018-2025:docs/cdp.md`
- Archive CDP examples: `archive/.../docs/examples/cdp-*.py`
- Current Jest config: `jest.config.js`
- Current tests: `tests/` directory
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/

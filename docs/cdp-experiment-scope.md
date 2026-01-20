# CDP Testing Experiment Scope

## experiment.goal

**Objective:** Build TypeScript-based CDP testing infrastructure that enables agent to verify feature implementations automatically.

**Success Criteria:**
- Agent implements a feature (e.g., fuzzy finder)
- Agent runs CDP test
- Test verifies: DOM changes, console logs, message passing, behavior
- Agent reports: "Feature works ✅" with proof
- No manual testing required

---

## experiment.requirements

### requirement.1_cdp_connection

**Connect to multiple targets:**
- Extension background page (Chrome APIs)
- Content page (DOM, UI, keyboard events)
- Dynamically discover WebSocket URLs

**Capabilities:**
- Execute JavaScript in each context
- Send keyboard events to page
- Query Chrome Extension APIs from background

### requirement.2_logging_capture

**Console output from all sources:**
- Background page: `console.log()`, `console.error()`
- Content scripts: `console.log()`, `console.error()`
- Exceptions from both contexts

**Use Cases:**
- Agent adds `console.log('[TRACE] fuzzy finder opened')` to code
- CDP test captures log
- Verifies feature executed

### requirement.3_message_passing_tracing

**Track communication:**
- Content script → Background: `chrome.runtime.sendMessage()`
- Background → Content script: `chrome.tabs.sendMessage()`
- CustomEvents: `surfingkeys:${type}` events

**Implementation:**
```typescript
// Inject tracing wrapper in content script
const originalSendMessage = chrome.runtime.sendMessage;
chrome.runtime.sendMessage = function(...args) {
    console.log('[MESSAGE->BG]', args[0].action, args[0]);
    return originalSendMessage.apply(this, args);
};
```

**CDP captures:**
```
[MESSAGE->BG] getTabs {action: 'getTabs', queryInfo: {...}}
[MESSAGE<-BG] response: [{id: 1, title: 'Google'}]
```

### requirement.4_dom_inspection

**Verify UI changes:**
- Element existence: `document.querySelector('.fuzzy-finder')`
- Element visibility: `element.offsetParent !== null`
- Element content: `element.textContent`
- CSS properties: `getComputedStyle(element)`

**Use Cases:**
- Test: "Press `?` to open help"
- CDP verifies: Help popup exists and visible

### requirement.5_extension_reload

**Automated reload:**
```typescript
// Via background page CDP connection
await cdp.executeInBackground(`
    chrome.runtime.reload();
`);

// Wait for extension to reload
await waitForExtensionReady();
```

**Why:** After implementing feature, need fresh extension state

### requirement.6_keyboard_simulation

**Send real keyboard events:**
```typescript
await cdp.sendKeyEvent('char', 'j');  // scrollDown
await cdp.sendKeyEvent('char', 'g');  // Leader for multi-key
await cdp.sendKeyEvent('char', 'f');  // Complete "gf" = openLink
```

**Verify:**
- Hints appear after 'f'
- Scroll position changed after 'j'

### requirement.7_chrome_api_verification

**Test Extension APIs:**
```typescript
// Get active tab
const tabs = await cdp.executeInBackground(`
    new Promise(resolve => {
        chrome.tabs.query({active: true}, resolve);
    })
`);

// Create new tab
await cdp.executeInBackground(`
    chrome.tabs.create({url: 'https://example.com'});
`);
```

---

## experiment.architecture

### architecture.components

```
┌─────────────────────────────────────────────┐
│        CDP Test Runner (TypeScript)         │
│  - Discovers targets                        │
│  - Manages connections                      │
│  - Orchestrates tests                       │
└──────────┬──────────────────────┬───────────┘
           │                      │
    ┌──────▼────────┐      ┌─────▼──────────┐
    │  Background   │      │  Content Page  │
    │  Connection   │      │  Connection    │
    │               │      │                │
    │  - Execute JS │      │  - Execute JS  │
    │  - Chrome APIs│      │  - Send keys   │
    │  - Capture logs│     │  - Inspect DOM │
    └───────────────┘      └────────────────┘
```

### architecture.data_flow

**Example: Test "Show Help" Feature**

```
1. CDP Test Runner
   ↓ Send keyboard 'shift+/' to content page
2. Content Page
   ↓ Dispatch KeyboardEvent
3. Content Script (keyboardUtils)
   ↓ Map key to command
4. Content Script (normal mode)
   ↓ Execute showUsage()
5. Content Script
   ↓ chrome.runtime.sendMessage({action: 'getUsage'})
6. Background Page
   ↓ Handle message, return usage data
7. Content Script
   ↓ Render help popup in DOM
8. CDP Test Runner
   ↓ Inspect DOM: querySelector('.help-popup')
   ↓ Verify popup.style.display !== 'none'
   ↓ Capture console logs
   ↓ Assert: "Help popup rendered" ✅
```

---

## experiment.implementation

### implementation.phase1_infrastructure

**File:** `tests/e2e/cdp-client.ts`

**Responsibilities:**
- Connect to CDP targets
- Execute JavaScript
- Send keyboard events
- Capture console output
- Query DOM

**Interface:**
```typescript
class CDPClient {
    // Connection
    async connectToBackground(): Promise<BackgroundConnection>
    async connectToPage(url: string): Promise<PageConnection>

    // Execution
    async executeInBackground(code: string): Promise<any>
    async executeInPage(code: string): Promise<any>

    // Keyboard
    async sendKey(key: string): Promise<void>
    async sendKeySequence(keys: string[]): Promise<void>

    // DOM
    async querySelector(selector: string): Promise<Element | null>
    async waitForElement(selector: string, timeout: number): Promise<Element>

    // Logging
    onConsoleMessage(callback: (msg: ConsoleMessage) => void): void
    getConsoleLogs(): ConsoleMessage[]

    // Utilities
    async waitFor(condition: () => boolean, timeout: number): Promise<void>
    async reload Extension(): Promise<void>
}
```

### implementation.phase2_test_helpers

**File:** `tests/e2e/helpers.ts`

**Common test patterns:**
```typescript
// Setup Chrome with extension loaded
export async function setupTestEnvironment(): Promise<TestEnv> {
    // Launch Chrome with --remote-debugging-port=9222
    // Load extension
    // Wait for ready
    // Return CDPClient instance
}

// Navigate to test page
export async function navigateToTestPage(url: string): Promise<void> {
    // ...
}

// Execute command by keyboard shortcut
export async function executeCommand(keys: string | string[]): Promise<void> {
    // Send keyboard events
    // Wait for command completion
}

// Verify element state
export async function assertElementVisible(selector: string): Promise<void> {
    const el = await cdp.querySelector(selector);
    assert(el && el.offsetParent !== null, `Element ${selector} not visible`);
}

// Capture message trace
export async function captureMessageTrace(): Promise<Message[]> {
    // Inject tracing wrapper
    // Return captured messages
}
```

### implementation.phase3_example_test

**File:** `tests/e2e/help-popup.test.ts`

```typescript
import { test, expect } from '@jest/globals';
import { setupTestEnvironment, executeCommand, assertElementVisible } from './helpers';

describe('Help Popup Feature', () => {
    let env: TestEnv;

    beforeAll(async () => {
        env = await setupTestEnvironment();
    });

    test('shows help when pressing ?', async () => {
        // Navigate to test page
        await env.navigateTo('https://example.com');

        // Capture console logs
        const logs: string[] = [];
        env.cdp.onConsoleMessage(msg => logs.push(msg.text));

        // Execute command
        await executeCommand('?');

        // Verify DOM
        await assertElementVisible('#sk_usage');

        // Verify logs captured the action
        expect(logs).toContain('[TRACE] Help popup opened');

        // Verify help content contains expected commands
        const helpContent = await env.cdp.executeInPage(`
            document.querySelector('#sk_usage').textContent
        `);
        expect(helpContent).toContain('scrollDown');
        expect(helpContent).toContain('scrollUp');
    });

    test('closes help when pressing Escape', async () => {
        // Open help first
        await executeCommand('?');
        await assertElementVisible('#sk_usage');

        // Close help
        await env.cdp.sendKey('Escape');

        // Wait for disappearance
        await env.cdp.waitFor(() => {
            const el = document.querySelector('#sk_usage');
            return !el || el.offsetParent === null;
        }, 2000);

        // Verify closed
        const visible = await env.cdp.executeInPage(`
            const el = document.querySelector('#sk_usage');
            el && el.offsetParent !== null
        `);
        expect(visible).toBe(false);
    });

    afterAll(async () => {
        await env.cleanup();
    });
});
```

### implementation.phase4_message_tracing

**Inject tracing on extension load:**

**File:** `tests/e2e/inject-tracer.ts`

```typescript
export const TRACE_INJECTION = `
    // Wrap chrome.runtime.sendMessage
    (function() {
        const original = chrome.runtime.sendMessage;
        chrome.runtime.sendMessage = function(...args) {
            console.log('[MESSAGE→BG]', args[0]);
            return original.apply(this, args);
        };
    })();

    // Wrap CustomEvent dispatch
    (function() {
        const original = EventTarget.prototype.dispatchEvent;
        EventTarget.prototype.dispatchEvent = function(event) {
            if (event.type && event.type.startsWith('surfingkeys:')) {
                console.log('[EVENT]', event.type, event.detail);
            }
            return original.call(this, event);
        };
    })();
`;

// Execute on content page after navigation
await cdp.executeInPage(TRACE_INJECTION);
```

**Captured logs:**
```
[MESSAGE→BG] {action: 'getTabs', queryInfo: {currentWindow: true}}
[EVENT] surfingkeys:front ['showPopup', 'Help opened']
[MESSAGE→BG] {action: 'getUsage'}
```

---

## experiment.validation

### validation.fuzzy_finder_test

**Complete test example:**

```typescript
test('fuzzy finder searches and filters commands', async () => {
    // Setup
    await env.navigateTo('https://example.com');

    // Track messages
    const messages: any[] = [];
    env.cdp.onConsoleMessage(msg => {
        if (msg.text.includes('[MESSAGE')) {
            messages.push(msg.text);
        }
    });

    // Open fuzzy finder (hypothetical keybinding)
    await executeCommand(':');

    // Verify UI appeared
    await assertElementVisible('.fuzzy-finder');

    // Type search query
    await env.cdp.sendKeySequence(['s', 'c', 'r', 'l']);

    // Verify filtered results
    const results = await env.cdp.executeInPage(`
        Array.from(document.querySelectorAll('.fuzzy-result'))
            .map(el => el.textContent)
    `);

    expect(results).toContain('scrollDown');
    expect(results).toContain('scrollUp');
    expect(results).not.toContain('openLink');

    // Verify search was logged
    expect(messages.some(m => m.includes('fuzzy search: scrl'))).toBe(true);

    // Select result and execute
    await env.cdp.sendKey('Enter');

    // Verify command executed (page scrolled)
    const scrollChanged = await env.cdp.executeInPage(`
        window.scrollY > 0
    `);
    expect(scrollChanged).toBe(true);
});
```

**Agent verification:**
```
Agent: "Implemented fuzzy finder feature"
Agent: "Running CDP test..."
Agent: *executes test above*
Agent: "Test passed ✅"
Agent: "- Fuzzy finder UI opens on ':' key"
Agent: "- Search filters correctly ('scrl' matches scroll commands)"
Agent: "- Selected command executes (page scrolled)"
Agent: "Feature ready to ship"
```

---

## experiment.tooling

### tooling.chrome_launcher

**File:** `tests/e2e/chrome-launcher.ts`

```typescript
export async function launchChromeWithDebugging(): Promise<ChromeInstance> {
    // Launch Chrome with:
    // --remote-debugging-port=9222
    // --user-data-dir=/tmp/chrome-test-profile
    // --load-extension=dist-esbuild/development/chrome

    // Wait for CDP port to be ready
    // Return instance handle
}
```

### tooling.target_discovery

**File:** `tests/e2e/target-discovery.ts`

```typescript
export async function findExtensionBackgroundPage(): Promise<string> {
    const targets = await fetch('http://localhost:9222/json').then(r => r.json());
    const bg = targets.find(t =>
        t.url.includes('_generated_background_page.html')
    );
    return bg.webSocketDebuggerUrl;
}

export async function findContentPage(urlPattern: string): Promise<string> {
    const targets = await fetch('http://localhost:9222/json').then(r => r.json());
    const page = targets.find(t =>
        t.type === 'page' && t.url.includes(urlPattern)
    );
    return page.webSocketDebuggerUrl;
}
```

### tooling.test_runner

**File:** `scripts/test-cdp.sh`

```bash
#!/bin/bash
# Launch Chrome with extension and run CDP tests

set -e

# Build extension
npm run esbuild:dev

# Launch Chrome
echo "Launching Chrome with debugging..."
google-chrome-stable \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-test-$(date +%s) \
  --load-extension=$(pwd)/dist-esbuild/development/chrome \
  --new-window https://example.com &

CHROME_PID=$!

# Wait for CDP to be ready
sleep 2

# Run tests
echo "Running CDP tests..."
npm run test:e2e

# Cleanup
kill $CHROME_PID
```

---

## experiment.deliverables

**Code:**
- [ ] `tests/e2e/cdp-client.ts` - CDP connection and control
- [ ] `tests/e2e/helpers.ts` - Test utilities
- [ ] `tests/e2e/inject-tracer.ts` - Message/event tracing
- [ ] `tests/e2e/*.test.ts` - Example tests (help, scroll, fuzzy finder)
- [ ] `scripts/test-cdp.sh` - Test runner

**Documentation:**
- [ ] `docs/cdp.md` - Ported and updated
- [ ] `docs/testing-howto.md` - Step-by-step guide
- [ ] `docs/cdp-api-reference.md` - CDPClient API docs

**Examples:**
- [ ] Help popup test (DOM verification)
- [ ] Scroll command test (behavior verification)
- [ ] Tab switching test (Chrome API verification)
- [ ] Message passing test (tracing verification)

---

## experiment.success_metrics

**Agent can autonomously:**
- [ ] Implement a feature
- [ ] Write CDP test for it
- [ ] Run test and verify results
- [ ] Report success/failure with proof
- [ ] No human intervention needed

**Test coverage:**
- [ ] DOM manipulation verified
- [ ] Console logging captured
- [ ] Message passing traced
- [ ] Chrome APIs tested
- [ ] Keyboard events simulated
- [ ] Extension reload automated

**Development velocity:**
- [ ] Test execution: <10 seconds
- [ ] Feedback loop: immediate
- [ ] False positives: <5%
- [ ] Agent confidence: high

---

## next_steps

**1. Port one CDP example to TypeScript**
- Choose: `cdp-console-logger.py`
- Implement as `tests/e2e/cdp-client.ts`
- Verify connection works

**2. Build test helper for help popup**
- Implement: `executeCommand()`, `assertElementVisible()`
- Write: `help-popup.test.ts`
- Run and verify

**3. Add message tracing**
- Inject wrapper on page load
- Capture logs
- Verify message flow

**4. Document and iterate**
- Write testing-howto.md
- Get feedback
- Expand test coverage

**When Phase 2 complete:**
- Full CDP infrastructure working
- Agent can verify implementations
- Ready for Phase 3 feature development

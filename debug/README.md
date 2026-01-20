# CDP Debugging Scripts

This directory contains Chrome DevTools Protocol (CDP) debugging scripts for Surfingkeys development.

## Prerequisites

1. Chrome running with remote debugging:
   ```bash
   # Live mode (visible browser, port 9222)
   google-chrome-stable --remote-debugging-port=9222

   # OR Headless mode (no GUI, port 9223)
   gchrb-dev-headless
   ```

2. Surfingkeys extension loaded in Chrome

3. For some tests: Fixtures server running
   ```bash
   node tests/fixtures-server.js
   ```

## Configuration

All debug scripts now use environment-based configuration via `.env` file:

```bash
# .env file (in project root)
CDP_PORT=9222        # 9222 for live mode, 9223 for headless
CDP_MODE=live        # 'live' or 'headless'
CDP_HOST=localhost   # Usually localhost
```

### Switching Between Modes

**Option 1: Edit .env file**
```bash
# For live mode (visible browser)
CDP_PORT=9222
CDP_MODE=live

# For headless mode (no GUI)
CDP_PORT=9223
CDP_MODE=headless
```

**Option 2: Use run-test.sh helper**
```bash
# Run in live mode
./debug/run-test.sh live debug/cdp-debug-verify-working.ts

# Run in headless mode
./debug/run-test.sh headless debug/cdp-test-hints-headless.ts
```

**Option 3: Override environment variables**
```bash
CDP_PORT=9223 CDP_MODE=headless npx ts-node debug/cdp-debug-verify-working.ts
```

## Available Scripts

### 1. cdp-debug-show-current-state.ts
**Status**: ✅ WORKS

Shows the current state of your active Chrome tab.

```bash
npx ts-node debug/cdp-debug-show-current-state.ts
```

**What it shows:**
- Current tab title and URL
- Active element (what has focus)
- Whether element is editable
- Inferred mode (Normal vs Insert)

**Use case**: Quick check of "what mode am I in?"

---

### 2. cdp-debug-verify-working.ts
**Status**: ✅ WORKS

Proves Surfingkeys is working by creating a test tab and functionally testing it.

```bash
npx ts-node debug/cdp-debug-verify-working.ts
```

**What it does:**
- Creates a fresh tab with test page
- Sends 'j' key to scroll
- Verifies page scrolled (proves Surfingkeys captured the key)
- Shows what globals exist in window

**Use case**: Verify Surfingkeys is actually working on a page

---

### 3. cdp-debug-breakpoint-hints.ts
**Status**: ✅ WORKS

Demonstrates breakpoint-style debugging with the 'f' key (hint creation).

```bash
npx ts-node debug/cdp-debug-breakpoint-hints.ts
```

**What it does:**
- Creates test tab
- Sets 6 "breakpoints" (pauses with inspections)
- Presses 'f' key
- Inspects DOM at: 0ms, 100ms, 500ms, 1000ms after keypress
- Shows WHEN hints are created
- Proves timing with visual confirmation

**Use case**: Learn how to do step-by-step debugging with pauses and inspections

**What you learn:**
- How to pause execution at specific points
- How to inspect state at each pause
- How timing affects what you see
- When Surfingkeys creates hints (answer: immediately!)

---

### 4. cdp-debug-live-modification-scrolling.ts
**Status**: ✅ WORKS

Demonstrates live code modification for scrolling behavior (PAGE context).

```bash
npx ts-node debug/cdp-debug-live-modification-scrolling.ts
```

**What it does:**
- Tests original 'j' key scroll (96px)
- Injects logging to track window.scrollBy() calls
- Modifies scroll distance to 2x
- Tests modified behavior
- ALL without reloading extension!

**What you learn:**
- How to wrap functions to add logging
- How to modify behavior at runtime
- How to test multiple iterations without rebuild
- Page context modification techniques

---

### 5. cdp-debug-live-modification-clipboard.ts
**Status**: ✅ WORKS

Demonstrates live code modification for clipboard (PAGE CONTEXT).

```bash
npx ts-node debug/cdp-debug-live-modification-clipboard.ts
```

**What it does:**
- Uses real Surfingkeys command: `ya` (copy link URL with hints)
- Injects logging into `document.execCommand('copy')` in PAGE context
- Wraps the copy operation to track what's being copied
- Shows page console logs
- ALL without reloading extension!

**What you learn:**
- How to modify PAGE context (where Chrome's execCommand runs)
- How to wrap document APIs
- How to use real Surfingkeys commands in tests
- Page context affects one tab only

**Technical note:**
- Chrome uses `document.execCommand('copy')` in page, not `navigator.clipboard` in background
- We wrap the page-level API to intercept Surfingkeys clipboard operations

---

### 6. cdp-debug-live-modification-tabs.ts
**Status**: ✅ WORKS

Comprehensive end-to-end test for Chrome Tabs API (BACKGROUND CONTEXT).

```bash
npx ts-node debug/cdp-debug-live-modification-tabs.ts
```

**What it does:**
- Injects logging into `chrome.tabs.duplicate()` and `chrome.tabs.remove()` in BACKGROUND
- Uses real Surfingkeys commands: `yt` (duplicate tab) and `gx$` (close tabs on right)
- Duplicates tab 3 times with STATE VERIFICATION after each duplication
- Switches back to original tab
- Closes tabs on the right
- Verifies tab count, IDs, and state at EVERY step

**What you learn:**
- How to modify BACKGROUND SCRIPT (service worker)
- How to wrap Chrome Tabs API (all Promises)
- How to verify state after each operation
- How to use multiple Surfingkeys commands in sequence
- Background context affects ALL tabs (extension-wide)

**State verification demonstrates:**
- Tab count after each duplication
- New tab IDs as they're created
- Active tab after switch
- Which tabs remain after close command

**Promise handling:**
- All `chrome.tabs.*` APIs return Promises
- `awaitPromise: true` in Runtime.evaluate handles them automatically
- Works for ALL Chrome extension APIs

**This test proves:**
- ✅ Background context access
- ✅ Chrome API wrapping
- ✅ Promise handling
- ✅ State tracking at each step
- ✅ Console logging from background
- ✅ No reload needed

---

### 7. cdp-debug-full-demo.ts
**Status**: ✅ WORKS

Comprehensive demonstration of all CDP debugging capabilities.

```bash
npx ts-node debug/cdp-debug-full-demo.ts
```

**What it demonstrates:**
1. Runtime inspection - Explore JavaScript environment
2. Variable inspection - Read and modify variables live
3. Call stack analysis - Understand execution flow
4. Live code modification - Monkey-patch functions
5. Network monitoring - Track HTTP activity
6. Performance profiling - Measure execution time
7. Debugger domain - Advanced debugging features

**Use case**: Learn what CDP can do, reference for building custom debug scripts

---

## Mental Model: CDP Debugging

```
┌─────────────────────────────────────────────────────────────┐
│  Extension Background (Service Worker)                      │
│  ← Can execute Chrome APIs, modify with CDP                 │
│  ← navigator.clipboard, chrome.tabs.*, chrome.storage.*     │
│  ← Affects ALL tabs (extension-wide)                        │
│                                                              │
│  Example: Modify navigator.clipboard.writeText()            │
│  → clipboard-debug script modifies this                     │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│  Web Page (window scope)                                    │
│  ← Can execute JavaScript, modify with CDP                  │
│  ← window.scrollBy(), DOM operations, etc.                  │
│  ← Affects ONE tab only                                     │
│                                                              │
│  Example: Modify window.scrollBy()                          │
│  → scrolling-debug script modifies this                     │
└─────────────────────────────────────────────────────────────┘

Content Script Scope (isolated)
  ↑
  Contains: Mode, Normal, Front, Hints, etc.
  Cannot access directly from CDP (security isolation)
  But we can intercept when it calls window.* functions
```

## Live Modification: Two Contexts

### Page Context
**Examples: scrolling-debug, clipboard-debug**
- Modifies: `window.scrollBy()`, `document.execCommand()`
- Affects: Current tab only
- Use for: DOM operations, page-specific behavior
- Real command tested: `ya` (copy link with hints)

### Background Context
**Example: tabs-debug**
- Modifies: `chrome.tabs.*` APIs
- Affects: ALL tabs (extension-wide)
- Use for: Chrome APIs, extension operations
- Real commands tested: `yt` (duplicate tab), `gx$` (close tabs right)
- Proves: Promise handling, state verification at each step

## Key Learnings

### What CDP CAN Do:
- ✅ Query active tab
- ✅ Execute JavaScript in page context
- ✅ Send keyboard/mouse events
- ✅ Measure effects (scroll, DOM changes)
- ✅ Monitor network activity
- ✅ Profile performance
- ✅ Infer mode from behavior

### What CDP CANNOT Easily Do:
- ❌ Read Mode.stack directly (it's in content script scope, not window scope)
- ❌ Access content script variables (they're in isolated context)

### Solution:
Instead of trying to read internal state, we **test behaviorally**:
- Send 'j' key → Did it scroll? → Surfingkeys is working
- Check activeElement → Is it editable? → Infer Insert vs Normal mode

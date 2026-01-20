# CDP Debugging Scripts

This directory contains Chrome DevTools Protocol (CDP) debugging scripts for **live experimentation and debugging** during Surfingkeys development.

**Purpose:** Manual exploration, live code injection, and behavioral verification without rebuild cycles.

**Not for:** Automated testing (use `tests/cdp/` with Jest framework instead).

## Quick Start

### Headless Mode (Automatic)
```bash
npm run debug:cdp:headless debug/cdp-debug-verify-working.ts
```
- Automatic Chrome launch
- Automatic port allocation (9400-9499)
- Parallel-safe
- No manual setup!

### Live Mode (Visible Browser)
```bash
# One-time setup: Launch Chrome with debugging
google-chrome-stable --remote-debugging-port=9222

# Run debug script
npm run debug:cdp:live debug/cdp-debug-show-current-state.ts
```

## Parallel Execution

Run multiple debug scripts simultaneously:
```bash
npm run debug:cdp:headless debug/script1.ts &
npm run debug:cdp:headless debug/script2.ts &
npm run debug:cdp:headless debug/script3.ts &
wait
```

Each gets a unique port (9400-9499 range).

## Logs

All runs log to `/tmp/`:
- `/tmp/cdp-debug-headless-*.log` - Headless runs
- `/tmp/cdp-debug-live-*.log` - Live runs

## Available Scripts

### 1. cdp-debug-show-current-state.ts
**Status**: ✅ WORKS

Shows the current state of your active Chrome tab.

```bash
npm run debug:cdp:live debug/cdp-debug-show-current-state.ts
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
npm run debug:cdp:headless debug/cdp-debug-verify-working.ts
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
npm run debug:cdp:headless debug/cdp-debug-breakpoint-hints.ts
```

**What it does:**
- Creates test tab
- Sets 6 "breakpoints" (pauses with inspections)
- Presses 'f' key
- Inspects DOM at: 0ms, 100ms, 500ms, 1000ms after keypress
- Shows WHEN hints are created
- Proves timing with visual confirmation

**Use case**: Learn how to do step-by-step debugging with pauses and inspections

---

### 4. cdp-debug-live-modification-scrolling.ts
**Status**: ✅ WORKS

Demonstrates live code modification for scrolling behavior (PAGE context).

```bash
npm run debug:cdp:headless debug/cdp-debug-live-modification-scrolling.ts
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
npm run debug:cdp:headless debug/cdp-debug-live-modification-clipboard.ts
```

**What it does:**
- Uses real Surfingkeys command: `ya` (copy link URL with hints)
- Injects logging into `document.execCommand('copy')` in PAGE context
- Wraps the copy operation to track what's being copied
- Shows page console logs
- ALL without reloading extension!

**Technical note:**
- Chrome uses `document.execCommand('copy')` in page, not `navigator.clipboard` in background
- We wrap the page-level API to intercept Surfingkeys clipboard operations

---

### 6. cdp-debug-live-modification-tabs.ts
**Status**: ✅ WORKS

Comprehensive end-to-end test for Chrome Tabs API (BACKGROUND CONTEXT).

```bash
npm run debug:cdp:headless debug/cdp-debug-live-modification-tabs.ts
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

---

### 7. cdp-debug-full-demo.ts
**Status**: ✅ WORKS

Comprehensive demonstration of all CDP debugging capabilities.

```bash
npm run debug:cdp:headless debug/cdp-debug-full-demo.ts
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

## Debug vs Test

| Feature | Debug Scripts | Automated Tests |
|---------|--------------|-----------------|
| Purpose | Exploration, live experimentation | Regression testing, CI/CD |
| Run time | Manual, on-demand | Automatic, parallel |
| Speed | Fast iteration, no rebuild | Fast execution, batched |
| Output | Verbose, detailed state | Pass/fail, coverage reports |
| Chrome | Visible or headless | Headless only |
| Use when | Developing new features | Verifying existing features |

## Debug Workflow

### Typical Debug Session

**1. Problem:** "Does the clipboard copy work correctly?"

**2. Run Debug Script:**
```bash
npm run debug:cdp:headless debug/cdp-debug-live-modification-clipboard.ts
```

**3. What You See:**
- Script creates test tab
- Injects logging into `document.execCommand('copy')`
- Triggers `ya` command (copy link with hints)
- Shows what was copied in real-time
- **No extension reload needed!**

**4. Iterate:**
```bash
# Modify the script to test different scenarios
# Run again immediately - fast iteration
npm run debug:cdp:headless debug/cdp-debug-live-modification-clipboard.ts
```

### When to Use Debug Scripts

**Use debug scripts when:**
- ✅ Exploring how a feature works
- ✅ Testing live code modifications
- ✅ Understanding timing and execution order
- ✅ Inspecting state at specific points
- ✅ Rapid iteration without rebuilding

**Use automated tests when:**
- ✅ Verifying functionality works (regression testing)
- ✅ Running in CI/CD
- ✅ Testing multiple scenarios in parallel
- ✅ Need pass/fail verification

## Migration from Old Workflow

### Old Workflow (DEPRECATED)
```bash
# 1. Edit .env to set CDP_PORT=9223
# 2. gchrb-dev-headless  (manual Chrome launch)
# 3. npx ts-node debug/script.ts
```

### New Workflow (RECOMMENDED)
```bash
# One command!
npm run debug:cdp:headless debug/script.ts
```

### Why Migrate?
- ✅ Zero setup - one command does everything
- ✅ Parallel execution - run multiple scripts
- ✅ No port conflicts - automatic allocation
- ✅ Automatic cleanup - no zombie Chrome processes

## Advanced: Manual Override

For edge cases, you can still override ports:
```bash
CDP_PORT=9500 npm run debug:cdp:headless debug/script.ts
```

## Deprecated Methods

These still work but are no longer recommended:

- **run-test.sh**: Use npm scripts instead
- **.env PORT configuration**: Automatic port allocation is better
- **Manual Chrome launch for headless**: Runners handle this now

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

# Plan: `settings.prefixKeyTimeout` — Deferred Execution for Prefix-Conflicted Keys

## Context

When a key (e.g. `y`) is bound to a command AND also serves as a prefix for a longer sequence
(e.g. `yy`), pressing `y` immediately fires the single-key action. The second `y` arrives too
late: `yy` is unreachable.

The fix: when a matched node has BOTH a `meta` (direct action) AND children (possible
continuations), defer execution by `settings.prefixKeyTimeout` milliseconds. If a continuation
key arrives within that window, cancel the timer and continue the sequence normally. If the
timeout fires with no new key, execute the deferred action.

## Key Constraint

This is a **content-script only** change. No background handler, no new `unique_id`, no Playwright
test needed (timing-based behaviour — not testable via `invokeCommand`). No `g-NNN` key needed.

---

## 1.0 Files to Modify

| File | Change |
|------|--------|
| `src/content_scripts/common/runtime.ts` | Add `prefixKeyTimeout: 0` to `conf` defaults |
| `src/content_scripts/common/mode.ts` | Add deferred execution logic to `handleMapKey` and `Mode.finish` |

---

## 2.0 User Config

After the feature is implemented, the user can enable it in `.surfingkeys-2026.js`:
```javascript
settings.prefixKeyTimeout = 200;  // ms; 0 = disabled (default)
```

---

## 3.0 Implementation

### 3.1 `src/content_scripts/common/runtime.ts` — add default

In the `conf` object (around line 101, near `repeatThreshold`):
```typescript
prefixKeyTimeout: 0,            // ms; 0 = disabled; deferred execution for prefix conflicts
```

### 3.2 `src/content_scripts/common/mode.ts` — three changes

#### 3.2.1 Add `_executeDeferredAction` helper

Add as a function local to `handleMapKey`'s closure (or as a method on the mode). Called both
when the timeout fires AND when an incompatible key arrives while deferred.

```typescript
function executeDeferredAction(mode: any) {
    const node = mode._deferredNode;
    const savedRepeats = mode._deferredRepeats;
    mode._deferredNode = null;
    mode._deferredTimer = null;
    mode._deferredRepeats = "";
    if (!node) return;

    if (mode.setLastKeys) mode.setLastKeys(node.meta.word);
    trackCommandUsage(node.meta.word, node.meta.annotation, mode.name);
    (RUNTIME as any).repeats = parseInt(savedRepeats) || 1;
    while ((RUNTIME as any).repeats > 0) {
        node.meta.code();
        (RUNTIME as any).repeats--;
    }
}
```

#### 3.2.2 Modify `Mode.finish` — cancel pending timer on reset

At the top of the existing `Mode.finish` body (before the `if` check):
```typescript
if (mode._deferredTimer) {
    clearTimeout(mode._deferredTimer);
    mode._deferredTimer = null;
    mode._deferredNode = null;
    mode._deferredRepeats = "";
}
```

#### 3.2.3 Modify `Mode.handleMapKey` — deferred dispatch

In the main `else` branch (trie navigation, lines ~325–380):

**Step A — cancel timer at start of each keypress (add just before `var last = this.map_node`):**
```typescript
if (this._deferredTimer) {
    clearTimeout(this._deferredTimer);
    this._deferredTimer = null;
    // _deferredNode stays set; we'll handle it in the navigation block below
}
```

**Step B — deferred node continuation (replace `this.map_node = this.map_node.find(key)` with):**
```typescript
var last = this.map_node;

if (this._deferredNode !== null) {
    // Deferred state: current map_node IS the deferred node.
    const contNode = this.map_node.find(key);
    if (contNode) {
        // Key continues the sequence (e.g. y → yy): clear deferred, navigate deeper
        this._deferredNode = null;
        this._deferredRepeats = "";
        this.map_node = contNode;
        // Fall through to normal meta handling with contNode
    } else {
        // Key does NOT continue sequence (e.g. y → j): execute deferred y action first,
        // then process j from root
        executeDeferredAction(this);
        this.map_node = this.mappings;   // reset to root
        last = this.map_node;
        this.map_node = this.map_node.find(key);  // try j from root
    }
} else {
    this.map_node = this.map_node.find(key);
}
```

**Step C — deferred scheduling (in the `code.length === 0` branch, around line 344, WRAP the
execution block):**
```typescript
// Check if this node has children (possible multi-key continuations)
const hasChildren = Object.keys(this.map_node).some(k => k.length === 1);

if (runtime.conf.prefixKeyTimeout > 0 && hasChildren) {
    // Defer: this node is both a complete command and a prefix
    this._deferredNode = this.map_node;
    this._deferredRepeats = this.repeats;
    const _self = this;
    this._deferredTimer = setTimeout(function() {
        executeDeferredAction(_self);
        Mode.finish(_self);
    }, runtime.conf.prefixKeyTimeout);
    event.sk_stopPropagation = true;
    // Don't reset map_node — leave it pointing at this node so next key can navigate deeper
    actionDone = false;
} else {
    // Existing execution block (lines 345–371, unchanged):
    if (this.setLastKeys) { this.setLastKeys(this.map_node.meta.word); }
    trackCommandUsage(...);
    (RUNTIME as any).repeats = parseInt(this.repeats) || 1;
    event.sk_stopPropagation = ...;
    if ((RUNTIME as any).repeats > runtime.conf.repeatThreshold) {
        // dialog branch
    } else {
        while (...) { code(); ... }
    }
    actionDone = Mode.finish(this);
}
```

---

## 4.0 State Variables (on Mode instance)

Three new instance variables (initialized to `null`/`""` in Normal mode constructor or lazily):

| Variable | Type | Purpose |
|----------|------|---------|
| `_deferredNode` | `Trie \| null` | The trie node whose action is deferred |
| `_deferredRepeats` | `string` | Repeat count at time of deferral (`this.repeats`) |
| `_deferredTimer` | `ReturnType<typeof setTimeout> \| null` | Active timeout handle |

---

## 5.0 Behaviour Summary

| Scenario | Result |
|----------|--------|
| `y` alone (timeout fires) | Execute yank URL after `prefixKeyTimeout` ms |
| `y` → `y` quickly | Cancel timer, navigate to `yy` node, execute yank title |
| `y` → `j` quickly (j not in y's children) | Execute yank URL immediately, then execute scroll-down |
| `y` → Escape | Cancel timer, discard deferred action (Mode.finish clears it) |
| `prefixKeyTimeout = 0` (default) | Behaviour unchanged from current |
| Node has meta but NO children | Execute immediately regardless of setting |

---

## 6.0 Scratch Test (TDD — write first, run RED, then GREEN after impl)

**File:** `tests/playwright/scratch/scratch-prefix-key-timeout.spec.ts`

**Run:**
```bash
bunx playwright test tests/playwright/scratch/scratch-prefix-key-timeout.spec.ts \
  --config=playwright.scratch.config.ts
```

**Expected RED (before implementation):**
- Test 1 fails: `setSkConf` returns `false` (key not in `runtime.conf`)
- Test 2 fails: `scrollY > START_Y` immediately after press (fired, not deferred)
- Test 3 fails: `scrollY > START_Y` (y fired, yy unreachable)
- Test 4 passes: control always passes (existing behavior)

**Expected GREEN (after implementation):**
- All 4 tests pass

### Full spec

```typescript
/**
 * Scratch: red/green test for `settings.prefixKeyTimeout`.
 *
 * Problem: when `y` is bound to a command AND `yy` is also bound,
 * pressing `y` fires immediately — `yy` is unreachable.
 *
 * Fix: when prefixKeyTimeout > 0 and a matched node has both a direct
 * action AND children, defer execution by that many ms.
 *
 * RED before impl:
 *   test 1 — setSkConf returns false (key not in runtime.conf)
 *   test 2 — y fires immediately, scrollY changes right after keypress
 *   test 3 — y fires (scroll down), yy never reached
 *
 * GREEN after impl:
 *   test 1 — prefixKeyTimeout recognized
 *   test 2 — scrollY unchanged right after press; changes after timeout
 *   test 3 — scrollY < START_Y (yy fired: scroll up, not down)
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-prefix-key-timeout.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, setSkConf } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const TIMEOUT_MS = 200;   // prefixKeyTimeout under test
const START_Y    = 500;   // starting scroll position (allows up and down)

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.beforeAll(async () => {
    const result = await launchWithCoverage();
    context = result.context;
    cov = result.cov;
    page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Bind y → scroll down, yy → scroll up.
    // These create the prefix conflict this feature resolves.
    await callSKApi(page, 'unmapAllExcept', []);
    await callSKApi(page, 'mapcmdkey', 'y', 'cmd_scroll_down');
    await callSKApi(page, 'mapcmdkey', 'yy', 'cmd_scroll_up');

    // Predictable scroll measurement: no smooth scroll, large step
    await setSkConf(page, 'smoothScroll', false);
    await setSkConf(page, 'scrollStepSize', 200);
});

test.afterAll(async () => {
    await cov?.close();
    await context?.close();
});

test.beforeEach(async () => {
    await page.evaluate((y) => window.scrollTo(0, y), START_Y);
    await page.waitForTimeout(50);
});

// ---------------------------------------------------------------------------

test('1 — prefixKeyTimeout setting is recognized in runtime.conf', async () => {
    const applied = await setSkConf(page, 'prefixKeyTimeout', TIMEOUT_MS);
    // RED: key not yet in runtime.conf before implementation
    expect(applied).toBe(true);
    await setSkConf(page, 'prefixKeyTimeout', 0);
});

test('2 — y is deferred: scrollY unchanged within timeout window', async () => {
    await setSkConf(page, 'prefixKeyTimeout', TIMEOUT_MS);

    await page.mouse.click(100, 100);
    await page.keyboard.press('y');
    await page.waitForTimeout(30);  // well within 200ms timeout

    const scrollAfterPress = await page.evaluate(() => window.scrollY);
    // RED: before impl fires immediately → scrollY > START_Y
    expect(scrollAfterPress).toBe(START_Y);

    // After timeout fires, scroll down should have happened
    await page.waitForTimeout(TIMEOUT_MS + 100);
    const scrollAfterTimeout = await page.evaluate(() => window.scrollY);
    expect(scrollAfterTimeout).toBeGreaterThan(START_Y);

    await setSkConf(page, 'prefixKeyTimeout', 0);
});

test('3 — yy resolves prefix: second y within timeout fires scroll-up not scroll-down', async () => {
    await setSkConf(page, 'prefixKeyTimeout', TIMEOUT_MS);

    await page.mouse.click(100, 100);
    await page.keyboard.press('y');
    await page.waitForTimeout(50);   // within timeout window
    await page.keyboard.press('y');
    await page.waitForTimeout(TIMEOUT_MS + 100);  // let any timer expire

    const scrollY = await page.evaluate(() => window.scrollY);
    // GREEN: yy fired (scroll up) → scrollY < START_Y
    // RED:   y fired immediately (scroll down) → scrollY > START_Y
    expect(scrollY).toBeLessThan(START_Y);

    await setSkConf(page, 'prefixKeyTimeout', 0);
});

test('4 — control: prefixKeyTimeout=0 fires y immediately (no deferral)', async () => {
    // Rely on default 0 — do not set prefixKeyTimeout
    // (setSkConf may return false before impl if key not in conf; ignore)
    await page.mouse.click(100, 100);
    await page.keyboard.press('y');
    await page.waitForTimeout(30);

    const scrollY = await page.evaluate(() => window.scrollY);
    // GREEN both before and after impl: y fires immediately when timeout=0
    expect(scrollY).toBeGreaterThan(START_Y);
});
```

## 7.0 Implementation Steps (after scratch test is RED)

1. Build: `npm run build:dev` — confirm all 5 checks pass
2. Run scratch test → confirm tests 1–3 are RED, test 4 is GREEN
3. Implement `src/content_scripts/common/runtime.ts` and `mode.ts` changes (section 3.0)
4. Build again
5. Run scratch test → confirm all 4 GREEN

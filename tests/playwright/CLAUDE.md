# Playwright Testing Guide

---

## 1.0 Running Tests

```bash
# Single test
bunx playwright test tests/playwright/commands/cmd-scroll-down.spec.ts

# Single test with V8 coverage
COVERAGE=true bunx playwright test tests/playwright/commands/cmd-scroll-down.spec.ts

# Full suite (dot reporter, minimal output)
npm run test:playwright:parallel
```

### 1.1 Linter / Verify Script

`scripts/verify.ts` — unified CI runner. Runs lint, type check, build, and optionally tests.

```bash
bun scripts/verify.ts              # fast: ESLint + integrity + issues + typecheck + build (~10-20s)
bun scripts/verify.ts --tests      # fast + Playwright tests
bun scripts/verify.ts --coverage   # fast + Playwright with V8 coverage
bun scripts/verify.ts --full       # fast + slow + personal checks
bun scripts/verify.ts --only lint  # single check by ID
```

Check groups:

| Group | Checks | When run |
|-------|--------|----------|
| `fast` | lint, integrity, issues, typecheck, build | Always (parallel) |
| `slow` | Playwright tests, coverage | `--tests` / `--coverage` / `--full` |
| `personal` | custom-mappings audit, upstream lag, config lint | `--full` only (informational, never block) |

---

## 2.0 Reference Files

| What | Path |
|------|------|
| Spec skeleton | `tests/playwright/TEMPLATE_TEST.md` |
| Shared launch helpers | `tests/playwright/utils/pw-helpers.ts` |
| Coverage wrap helpers | `tests/playwright/utils/coverage-utils.ts` |
| V8 profiler / CDP | `tests/playwright/utils/cdp-coverage.ts` |
| Settings overrides | `tests/playwright/settings/settings-helpers.ts` |
| Verify runner | `scripts/verify.ts` |
| **Scenario A** (page target) | `tests/playwright/commands/cmd-scroll-down.spec.ts` |
| **Scenario B** (SW + invokeCommand) | `tests/playwright/commands/cmd-tab-next.spec.ts` |
| **Scenario C** (chord + magic dispatch) | `tests/playwright/commands/cmd-tab-detach-m.spec.ts` |
| **Scenario D** (settings) | `tests/playwright/settings/setting-scroll-step-size.spec.ts` |
| **Scenario E** (CDP / SW eval) | `tests/playwright/features/incognito.spec.ts` |
| **Scenario F** (multi-tab) | `tests/playwright/commands/cmd-tab-print-m.spec.ts` |
| **Scenario G** (incognito) | `tests/playwright/features/incognito.spec.ts` |
| **Scenario H** (config server) | `tests/playwright/features/config-server-debug.spec.ts` |
| **Scenario I** (omnibar `:` trigger) | `tests/playwright/scratch/scratch-colon-omnibar-trigger.spec.ts` |

---

## 3.0 Scenario Decision Tree

```
What are you testing?
│
├─ Content-script command (scroll, hints, visual, nav, insert)?
│  └─ → Scenario A — Page target
│
├─ Background command (tab, session, bookmark)?
│  ├─ Testing behaviour only (not the key)?
│  │  └─ → Scenario B — SW target + invokeCommand
│  └─ Testing the keybinding or magic dispatch path?
│     └─ → Scenario C — Key dispatch + callSKApi (chord)
│
├─ Testing a runtime.conf setting?
│  └─ → Scenario D — Settings override
│
├─ Need to call Chrome APIs directly in the service worker?
│  └─ → Scenario E — CDP / SW eval
│
├─ Need to set up multiple tabs and move between them?
│  └─ → Scenario F — Multi-tab management
│
├─ Testing incognito window creation?
│  └─ → Scenario G — Incognito
│
├─ Testing config loading or startup pipeline?
│  └─ → Scenario H — Custom config server
│
└─ Testing commands invoked via the `:` command bar?
   └─ → Scenario I — Omnibar `:` trigger (mapcmdkey remap)
```

---

## 4.0 Scenario A — Page Target (content-script commands)

**When:** scroll, hints, visual, insert, nav — anything that runs in the page context.

**Key helpers:** `launchWithCoverage(fixtureUrl)` — coverage connects **after** `page.goto()` via deferred `covInit()`.

```typescript
import { launchWithCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.beforeAll(async () => {
    const result = await launchWithCoverage(FIXTURE_URL);
    context = result.context;
    page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    cov = await result.covInit();   // connect AFTER page.goto()
    await page.waitForTimeout(500); // let content script initialise
});

test.afterAll(async () => {
    if (cov) printCoverageDelta(await cov.delta(), SUITE_LABEL);
    await cov?.close();
    await context?.close();
});

test('scrolls down', async () => {
    await invokeCommand(page, 'cmd_scroll_down');
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});
```

**Reference:** `tests/playwright/commands/cmd-scroll-down.spec.ts`

**Checklist:**
- [ ] `launchWithCoverage(FIXTURE_URL)` — fixture URL passed at launch
- [ ] `covInit()` called **after** `page.goto()`
- [ ] Content script allowed 500ms to initialise before first test

---

## 5.0 Scenario B — SW Target + invokeCommand (tab/bookmark commands)

**When:** Testing what a command **does** (not how it's triggered). Coverage connects immediately at launch.

**Key helpers:** `launchWithCoverage()` (no arg), `invokeCommand(page, uniqueId, repeats?)`.

```typescript
import { launchWithCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
let context: BrowserContext;
let cov: ServiceWorkerCoverage | undefined;

test.beforeAll(async () => {
    const result = await launchWithCoverage(); // no fixtureUrl → connects to SW immediately
    context = result.context;
    cov = result.cov;
    const p = await context.newPage();
    await p.goto(FIXTURE_URL, { waitUntil: 'load' });
    await p.waitForTimeout(500);
});

test('moves to next tab', async () => {
    const tab = await context.newPage();
    await tab.goto(FIXTURE_URL, { waitUntil: 'load' });
    await invokeCommand(tab, 'cmd_tab_next');
    // verify via SW helpers (see Scenario F)
});
```

**Reference:** `tests/playwright/commands/cmd-tab-next.spec.ts`

**Checklist:**
- [ ] No `fixtureUrl` arg in `launchWithCoverage()` — coverage on SW target, not page
- [ ] Use `invokeCommand` when testing behavior, not the key dispatch path
- [ ] Each test manages its own pages (no shared `page` variable in `beforeAll`)

---

## 6.0 Scenario C — Key Dispatch + callSKApi (magic/chord commands)

**When:** Testing the full keybinding dispatch path — specifically magic tab commands dispatched via chord (e.g. `gD` → `cmd_tab_detach_m`).

**`callSKApi` must be defined locally in each spec** (not exported from any shared util):

```typescript
async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}
```

**Setup — clear all bindings and remap to the test key:**

```typescript
await callSKApi(page, 'unmapAllExcept', []);
await callSKApi(page, 'mapcmdkey', 'gD', 'cmd_tab_detach_m');  // chord
// or single key:
await callSKApi(page, 'mapcmdkey', 'j', 'cmd_scroll_down');
```

**Dispatch a chord (sequential key presses with delay):**

```typescript
await page.keyboard.press('g');
await page.waitForTimeout(50);
await page.keyboard.press('D');
await page.waitForTimeout(500); // let SW process the message
```

**Why `g-NNN` placeholder keys matter:** Commands in `src/content_scripts/common/commands/` use `g-NNN` as their registered key. If a test tries to use a real key that conflicts with a default binding (e.g. `b` is already bound as `cmd_omnibar_bookmarks`), the `mapkey` call is silently rejected. `unmapAllExcept([])` clears all defaults first, then `mapcmdkey` can bind to any key safely.

**Reference:** `tests/playwright/commands/cmd-tab-detach-m.spec.ts`

**Checklist:**
- [ ] `callSKApi` defined locally (not imported)
- [ ] `unmapAllExcept([])` called before `mapcmdkey`
- [ ] Chord dispatched as sequential `keyboard.press()` calls with `waitForTimeout(50)` between
- [ ] SW allowed 500ms+ after chord to process the message
- [ ] Use this pattern only when testing the keybinding/dispatch path; use `invokeCommand` otherwise

---

## 7.0 Scenario D — Settings Override (runtime.conf)

**When:** Testing that a command respects a `runtime.conf` setting (e.g. `scrollStepSize`, `smoothScroll`).

**Key helpers:** `setSkConf` from `pw-helpers`, or `applySetting`/`restoreSetting` from `settings/settings-helpers.ts`.

```typescript
import { applySetting, restoreSetting, DEFAULTS } from '../settings/settings-helpers';

test('respects scrollStepSize', async () => {
    await applySetting(page, 'scrollStepSize', 200);
    await invokeCommand(page, 'cmd_scroll_down');
    const delta = await page.evaluate(() => window.scrollY);
    expect(delta).toBeGreaterThan(100);
    await restoreSetting(page, 'scrollStepSize');
});
```

**Direct override** (without the settings helper):

```typescript
await page.evaluate(([k, v]) => {
    document.dispatchEvent(new CustomEvent('__sk_conf_override', {
        detail: { key: k, value: v }
    }));
}, ['scrollStepSize', 200] as [string, unknown]);
await page.waitForTimeout(50);
```

**Available DEFAULTS** (mirrors `runtime.js`):

| Key | Default |
|-----|---------|
| `scrollStepSize` | 70 |
| `digitForRepeat` | true |
| `smoothScroll` | true |
| `hintCharacters` | `'sadfgqwertzxcvb'` |
| `showTabIndices` | true |
| `omnibarMaxResults` | 10 |
| `tabsThreshold` | 9 |

**Reference:** `tests/playwright/settings/setting-scroll-step-size.spec.ts`

**Checklist:**
- [ ] Always restore the setting after each test (or use separate context per spec)
- [ ] `waitForTimeout(50)` after dispatching the override event
- [ ] Each settings spec file uses its own `launchWithCoverage()` context (prevents leakage)

---

## 8.0 Scenario E — CDP / SW Eval (direct Chrome API)

**When:** You need to call Chrome APIs (e.g. `chrome.tabs.query`, `chrome.windows.getCurrent`) directly inside the service worker — without going through a command.

```typescript
async function getActiveTabViaSW(ctx: BrowserContext): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() =>
        new Promise<any>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0] ?? null));
        })
    );
}

// Verify current window is not incognito
const windowInfo = await sw.evaluate((): Promise<{ id: number; incognito: boolean }> =>
    new Promise((resolve, reject) => {
        chrome.windows.getCurrent(undefined, (win) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve({ id: win!.id!, incognito: win!.incognito });
        });
    })
);
expect(windowInfo.incognito).toBe(false);
```

**Common SW helpers** (copy into your spec as needed):

```typescript
// All tabs across all windows
async function getAllTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    return sw.evaluate(() => new Promise<any[]>((resolve) => chrome.tabs.query({}, resolve)));
}

// All windows
async function getAllWindowsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    return sw.evaluate(() => new Promise<any[]>((resolve) => chrome.windows.getAll({ populate: true }, resolve)));
}

// Activate a specific tab
async function activateTabViaSW(ctx: BrowserContext, tabId: number): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    await sw.evaluate((id: number) => new Promise<void>((resolve) => chrome.tabs.update(id, { active: true }, () => resolve())), tabId);
}
```

**Reference:** `tests/playwright/features/incognito.spec.ts`

**Checklist:**
- [ ] Access SW via `ctx.serviceWorkers()[0]` — throw if absent
- [ ] All Chrome API calls wrapped in `new Promise` (callback-style APIs)
- [ ] `chrome.runtime.lastError` checked inside the callback before resolving

---

## 9.0 Scenario F — Multi-Tab Management

**When:** Testing commands that operate across multiple tabs (next/prev, move, gather, detach, close).

**Key pattern:** Use `openSiblingTabViaSW` from `pw-helpers` to create tabs that don't inherit `openerTabId` (Playwright's default `context.newPage()` sets opener, which can break tab-index tests).

```typescript
import { launchWithDualCoverage, FIXTURE_BASE, openSiblingTabViaSW } from '../utils/pw-helpers';

// Cleanup helper — reset to a single known tab
async function closeAllExcept(keepPage: Page) {
    for (const p of context.pages()) {
        if (p !== keepPage) await p.close().catch(() => {});
    }
    await keepPage.bringToFront();
    await keepPage.waitForTimeout(200);
}

// In test:
await closeAllExcept(anchorPage);
const tab2Id = await openSiblingTabViaSW(context, FIXTURE_URL);
await context.newPage().then(p => p.goto(FIXTURE_URL, { waitUntil: 'load' }));
await page.waitForTimeout(300); // let tabs settle

const tabs = await getAllTabsViaSW(context);
expect(tabs.length).toBe(2);

// Activate tab 0, dispatch command, verify active tab changed
const tab0 = tabs.find((t: any) => t.index === 0);
await activateTabViaSW(context, tab0!.id);
await page.bringToFront();
await invokeCommand(page, 'cmd_tab_next');

const active = await getActiveTabViaSW(context);
expect(active.index).toBe(1);
```

**Reference:** `tests/playwright/commands/cmd-tab-detach-m.spec.ts`, `cmd-tab-print-m.spec.ts`

**Checklist:**
- [ ] Use `openSiblingTabViaSW` (not `context.newPage()`) when tab index order matters
- [ ] `closeAllExcept` before each test that cares about tab count
- [ ] `activateTabViaSW` + `page.bringToFront()` to set focus before dispatching keys
- [ ] Use `chrome.tabs.query({})` (not `{currentWindow: true}`) in cross-window magic commands

---

## 10.0 Scenario G — Incognito

**When:** Testing commands that interact with incognito windows.

**Playwright limitation:** `context.newPage({ incognito: true })` does not work on persistent contexts. Incognito must be created via the extension SW (`chrome.windows.create({ incognito: true })`).

**Pre-allowlist the extension** (required once, done automatically in `launchExtensionContext`):

```typescript
// In pw-helpers.ts launchExtensionContext — writes a Preferences file before launch:
fs.writeFileSync(path.join(defaultDir, 'Preferences'), JSON.stringify({
    extensions: {
        ui: { developer_mode: true },
        settings: { [EXTENSION_ID]: { incognito: true } },
    },
}));
```

**Open incognito window via SW:**

```typescript
const incognitoWindowId = await sw.evaluate((): Promise<number> =>
    new Promise((resolve) => {
        chrome.windows.create({ incognito: true }, (win) => resolve(win!.id!));
    })
);
```

**Verify incognito state:**

```typescript
const windowInfo = await sw.evaluate((): Promise<{ incognito: boolean }> =>
    new Promise((resolve, reject) => {
        chrome.windows.getCurrent(undefined, (win) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve({ incognito: win!.incognito });
        });
    })
);
expect(windowInfo.incognito).toBe(true);
```

**Reference:** `tests/playwright/features/incognito.spec.ts`, `tests/playwright/scratch/incognito-cdp-open.spec.ts`

**Checklist:**
- [ ] Extension pre-allowlisted for incognito in `Preferences` (handled by `launchExtensionContext`)
- [ ] Use `chrome.windows.create({ incognito: true })` via SW — not Playwright API
- [ ] Commands that open incognito in production are typically in `EXCLUDED_COMMANDS` (Playwright can't fully test them)

---

## 11.0 Scenario H — Custom Config Server

**When:** Testing config loading, the startup pipeline, or user-script registration.

Two config servers run on different ports:

| Port | Purpose |
|------|---------|
| `9602` | Fixture config — neutral, used by all tests |
| `9601` | Real `.surfingkeys-2026.js` — used by config debug tests only |

```typescript
const FIXTURE_CONFIG_URL = 'http://localhost:9602/config';

// Verify fixture server responds
const resp = await request.get(FIXTURE_CONFIG_URL);
expect(resp.status()).toBe(200);

// Verify config applied to extension
const markerSeen = await page.waitForFunction(
    () => document.documentElement.dataset['skConfigServerLoaded'] === 'true',
    { timeout: 5000 },
);
```

**Reference:** `tests/playwright/features/config-server-debug.spec.ts`

**Checklist:**
- [ ] Config server tests go in `tests/playwright/features/`
- [ ] Isolate from the normal fixture config server (9602) — use a separate port if testing a custom config
- [ ] Registration timing is flaky in Docker — mark with `test.skip` or `test.fixme` if needed

---

## 11.1 Scenario I — Omnibar `:` Trigger (colon command bar)

**When:** Testing commands invoked via the `:` command bar (`cmd_omnibar_commands`), such as cookie commands.

### Confirmed working pattern

```typescript
// 1. Remap ':' to cmd_omnibar_commands via callSKApi
await callSKApi(page, 'unmapAllExcept', []);
await callSKApi(page, 'mapcmdkey', ':', 'cmd_omnibar_commands');
await page.waitForTimeout(200);

// 2. Click to ensure page focus, then press ':'
await page.mouse.click(100, 100);
await page.keyboard.press(':');

// 3. Wait for omnibar — use throwing variant (see below)
await waitForOmnibar(page, true);
```

### Why `Shift+Semicolon` is unreliable

`Shift+*` combos are known to be flaky in Playwright headless Chrome. `Shift+Semicolon` (the real
keyboard combo for `:`) occasionally fails to register because headless Chrome handles modifier
key state differently from a real keyboard. The remap approach bypasses this entirely.

**Scratch test results** (all three cases on a single run):

| # | Method | Result |
|---|--------|--------|
| 1 | `mapcmdkey(':')` → `press(':')` | open=true ✓ |
| 2 | no remap → `press('Shift+Semicolon')` | open=true (passed this run — flaky in CI) |
| 3 | no remap → `press(':')` | open=true (passed this run — no default binding without remap) |

Cases 2 and 3 passed in the scratch run but are not reliable across environments. Use case 1.

### Throwing `waitForOmnibar` (required)

The cookie test specs use a silently-returning `waitForOmnibar` that masks failures when the omnibar
never opens. Always use the **throwing** variant:

```typescript
async function waitForOmnibar(page: Page, open: boolean, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isOmnibarOpen(page) === open) return;
        await page.waitForTimeout(100);
    }
    throw new Error(`waitForOmnibar(${open}): timed out after ${timeoutMs}ms`);
}
```

**Reference:** `tests/playwright/scratch/scratch-colon-omnibar-trigger.spec.ts`

**Checklist:**
- [ ] `mapcmdkey(':', 'cmd_omnibar_commands')` via `callSKApi` (not raw `Shift+Semicolon`)
- [ ] `unmapAllExcept([])` called before `mapcmdkey`
- [ ] `waitForOmnibar` **throws** on timeout (never silently returns)
- [ ] `page.mouse.click()` before triggering to ensure page focus

---

## 12.0 Coverage

### 12.1 Single vs Dual Coverage

| Mode | Helper | Use when |
|------|--------|----------|
| Single (page) | `launchWithCoverage(fixtureUrl)` | Content-script commands (Scenario A) |
| Single (SW) | `launchWithCoverage()` | SW commands (Scenario B) |
| Dual (BG + content) | `launchWithDualCoverage(fixtureUrl)` + `withPersistedDualCoverage` | Commands that touch both layers |

### 12.2 Dual Coverage Setup

```typescript
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import { withPersistedDualCoverage } from '../utils/coverage-utils';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const SUITE_LABEL = 'cmd_<unique_id>';
const FIXTURE_URL = `${FIXTURE_BASE}/<fixture>.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.beforeAll(async () => {
    const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
    context = result.context;
    covBg = result.covBg;
    initContentCoverageForUrl = result.covForPageUrl;
    const page = await context.newPage();
    await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(500);
});

test.afterAll(async () => {
    await covBg?.close();
    await context?.close();
});

test('my test', async () => {
    await withPersistedDualCoverage(
        { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
        test.info().title,
        async () => {
            // test body
        },
    );
});
```

### 12.3 Coverage Artifacts

Written to `test-artifacts/coverage/` per test. When `COVERAGE=true`, `withPersistedDualCoverage` asserts artifacts exist and are non-trivial.

```bash
# Verify coverage in the mappings report
bun scripts/mappings-json-report.ts | jq '
  .mappings.list[]
  | select(.annotation | type == "object")
  | select(.annotation.unique_id == "cmd_<unique_id>")
  | .code_coverage'
```

Expected: `"hasData": true` and each changed source file appears under `bySourceFile`.

> `src/content_scripts/common/normal.js` and `runtime.js` are content-bundle files — they won't appear in `background` target coverage.

---

## 13.0 Conventions

### 13.1 Naming

| Item | Convention |
|------|-----------|
| File name | `cmd-<unique-id>.spec.ts` (hyphens, `_` → `-`) |
| `describe` label | `cmd_<unique_id> (Playwright)` (underscores, exact `unique_id`) |
| Key-triggered magic variants | `-m.spec.ts` suffix (e.g. `cmd-tab-detach-m.spec.ts`) |
| One command per file | yes — never bundle multiple commands |

### 13.2 Fixtures

- Must be **self-contained** — inline styles, no external URLs (causes flakiness)
- Served from `http://127.0.0.1:9873` (`FIXTURE_BASE` in `pw-helpers.ts`)
- Fixture HTML lives under `tests/fixtures/` or the dir served by `tests/fixtures-server.js`

### 13.3 Scratch Tests

One-off diagnostic/verification specs → `tests/playwright/scratch/`. Excluded from the normal suite (`testIgnore` in `playwright.config.ts`). Run via scratch config:

```bash
bunx playwright test tests/playwright/scratch/<name>.spec.ts --config=playwright.scratch.config.ts
```

### 13.4 Template

See **[TEMPLATE_TEST.md](TEMPLATE_TEST.md)** for the copy-paste spec skeleton (page target and SW target variants).
For advanced scenarios (dual coverage, settings, CDP, multi-tab, incognito, config server) see the scenario sections above.

---

## 14.0 Known Flaky Tests

Ignore on first failure, pass on retry:

| Test | Note |
|------|------|
| `cmd-hints-learn-element` | Timing |
| `cmd-visual-document-start` | Timing |
| `cmd-scroll-half-page-down` | Smooth scroll overshoot |

Skipped in Docker (pass locally):

| Test | Reason |
|------|--------|
| `cmd-capture-scrolling-element` | Popup timing |
| `cmd-capture-full-page` | Popup timing |
| `cmd-nav-next-link` | Navigation timing |
| `features/config-server-debug` › fixture config applied | User script registration timing |

---

## 15.0 Master Checklist — New Spec

- [ ] File in `tests/playwright/commands/` named `cmd-<unique-id-dashes>.spec.ts`
- [ ] One `unique_id` per file
- [ ] `describe` label is `cmd_<unique_id> (Playwright)` (underscores, not hyphens)
- [ ] Correct target: page (`launchWithCoverage(url)`) for content commands; SW (`launchWithCoverage()`) for tab/bookmark
- [ ] `launchWithCoverage` or `launchWithDualCoverage` used (never raw `chromium.launch`)
- [ ] Coverage wrapped with `withPersistedDualCoverage` if using dual mode
- [ ] Fixtures are self-contained (inline styles, no external URLs)
- [ ] `callSKApi` defined **locally** in each spec that uses it (not imported)
- [ ] `unmapAllExcept([])` called before `mapcmdkey` if testing key dispatch
- [ ] `g-NNN` placeholder registered in `g-keys.ts` if used in tests
- [ ] `invokeCommand` for behavior testing; `callSKApi` + key press for keybinding dispatch testing
- [ ] `COVERAGE=true` run passes (`hasData: true` in mappings report)
- [ ] `bun scripts/verify.ts` (fast checks) passes before commit

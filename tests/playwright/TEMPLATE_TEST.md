# Playwright Spec Template

Copy the relevant variant below into a new file under `tests/playwright/commands/`.
File name must match the command `unique_id`: `cmd-<unique-id>.spec.ts`.

---

## Variant A — Page target (content-script commands)

Use for: scroll, hints, visual, insert, nav commands — anything that runs in the page context.

Coverage connects **after** `page.goto()` via the deferred `covInit()` callback.

```typescript
// tests/playwright/commands/cmd-<unique-id>.spec.ts
import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

// Point at the fixture HTML that exercises this command.
// All fixtures are served from tests/fixtures-server.js on port 9873.
const FIXTURE_URL = `${FIXTURE_BASE}/<your-fixture>.html`;

// Module-level handles — shared across all tests in the describe block.
let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('cmd_<unique_id> (Playwright)', () => {
    test.beforeAll(async () => {
        // Launch a persistent Chrome context with the extension loaded.
        // Pass FIXTURE_URL so coverage is deferred until after page.goto().
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        // Connect the V8 profiler to the page target (no-op when COVERAGE is unset).
        cov = await result.covInit();
        // Give the extension content script time to initialise.
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        // Print function-level coverage delta (only when COVERAGE=true).
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_<unique_id>');
        await cov?.close();
        await context?.close();
    });

    // Optional: reset page state between tests.
    // test.beforeEach(async () => {
    //     await page.evaluate(() => window.scrollTo(0, 0));
    //     await page.waitForTimeout(100);
    // });

    test('<describe what the command should do>', async () => {
        // TODO: implement test body
        // Example:
        // await page.keyboard.press('j');
        // expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        // if (DEBUG) console.log('...');
    });
});
```

---

## Variant B — SW target (background commands)

Use for: tab, session, bookmark commands — anything dispatched to the extension service worker.

Coverage connects **immediately** at launch via `result.cov` (no fixture page needed at that point).

```typescript
// tests/playwright/commands/cmd-<unique-id>.spec.ts
import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

// A fixture page is still needed so the extension content script is active.
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

// No `page` variable here — tests open pages as needed inside each test.
let context: BrowserContext;
let cov: ServiceWorkerCoverage | undefined;

test.describe('cmd_<unique_id> (Playwright)', () => {
    test.beforeAll(async () => {
        // No fixtureUrl argument → coverage connects to the service-worker target immediately.
        const result = await launchWithCoverage();
        context = result.context;
        cov = result.cov; // ready at launch, no deferred init required
        // Open one fixture page so the extension is active.
        const p = await context.newPage();
        await p.goto(FIXTURE_URL, { waitUntil: 'load' });
        await p.waitForTimeout(500);
    });

    test.afterAll(async () => {
        // Print function-level coverage delta (only when COVERAGE=true).
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_<unique_id>');
        await cov?.close();
        await context?.close();
    });

    test('<describe what the command should do>', async () => {
        // TODO: implement test body.
        // Use invokeCommand() to trigger the command by unique_id without key dispatch:
        //   await invokeCommand(page, 'cmd_<unique_id>');
        // Or drive the service worker directly:
        //   const sw = context.serviceWorkers()[0];
        //   await sw.evaluate(() => chrome.tabs.query({}, tabs => ...));
        // if (DEBUG) console.log('...');
    });
});
```

---

## Naming conventions

| Item | Convention |
|------|-----------|
| File name | `cmd-<unique-id>.spec.ts` (hyphens, matches command `unique_id` with `_` → `-`) |
| `describe` label | `cmd_<unique_id> (Playwright)` (underscores, exact `unique_id`) |
| Coverage label | same string passed to `printCoverageDelta` |
| One command per file | yes — do not bundle multiple commands |

## Fixture rules

- Fixtures must be **self-contained**: inline styles, no external URLs (external links cause flakiness).
- Place fixture HTML files under `tests/` or the directory served by `tests/fixtures-server.js`.
- Fixture server base: `http://127.0.0.1:9873` (exported as `FIXTURE_BASE` from `pw-helpers.ts`).

## Running the spec

```bash
# Run once
bunx playwright test tests/playwright/commands/cmd-<unique-id>.spec.ts

# Run with V8 coverage
COVERAGE=true bunx playwright test tests/playwright/commands/cmd-<unique-id>.spec.ts
```

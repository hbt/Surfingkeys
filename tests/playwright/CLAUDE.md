# Playwright Testing Guide

## Running Tests

```bash
# Single test
bunx playwright test tests/playwright/commands/cmd-scroll-down.spec.ts

# Full suite (dot reporter, minimal output)
npm run test:playwright:parallel

# Single test with V8 coverage
COVERAGE=true bunx playwright test tests/playwright/commands/cmd-scroll-down.spec.ts

# Full suite with coverage
COVERAGE=true npm run test:playwright:parallel
```

## Template

See **[TEMPLATE_TEST.md](TEMPLATE_TEST.md)** for the canonical spec skeleton (page target and SW target variants).

## Coverage

Coverage is persisted to disk per test via `withPersistedDualCoverage` (from `coverage-utils.ts`). It snapshots before the test body runs and flushes after, writing JSON files under `test-artifacts/coverage/`.

Two targets are captured simultaneously:
- **Background** (`service_worker` / `background.js`): always connected at launch via `covBg`
- **Content** (`page` / `content.js`): connected per-test via `initContentCoverageForUrl`

When `COVERAGE=true`, `withPersistedDualCoverage` asserts that coverage artifacts exist and are non-trivial. Missing or empty coverage fails the test.

## Instrumenting a New Spec

Use `launchWithDualCoverage` from `tests/playwright/utils/pw-helpers.ts` and wrap each test body with `withPersistedDualCoverage` from `tests/playwright/utils/coverage-utils.ts`:

```typescript
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import { withPersistedDualCoverage } from '../utils/coverage-utils';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const SUITE_LABEL = 'cmd_<unique_id>';
const FIXTURE_URL = `${FIXTURE_BASE}/<your-fixture>.html`;
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

Reference: [`commands/cmd-scroll-down.spec.ts`](commands/cmd-scroll-down.spec.ts)

## Conventions

- Fixtures must be **self-contained** — inline styles, no external URLs (causes flakiness)
- Name spec files after command `unique_id`: `cmd-scroll-down.spec.ts`
- Key-triggered command variants use a `.key.spec.ts` suffix: `cmd-tab-detach-magic-right.key.spec.ts`
- One command per file
- Fixture server runs on `http://127.0.0.1:9873` (`tests/fixtures-server.js`)

## Custom Keybindings in Tests

Bind a key (or chord) to a command using `callSKApi`, which dispatches a `surfingkeys:api` CustomEvent that the content script picks up.

**`callSKApi` must be defined locally in each spec** — it is not exported from any shared utility:

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

Always pair `unmapAllExcept` + `mapcmdkey` (typically in `beforeEach` or at test start):

```typescript
await callSKApi(page, 'unmapAllExcept', []);
await callSKApi(page, 'mapcmdkey', 'j', 'cmd_scroll_down');      // single key
await callSKApi(page, 'mapcmdkey', 'tde', 'cmd_tab_detach_magic_right'); // chord
```

### g-NNN placeholder keys

Commands defined in `src/content_scripts/common/commands/` use `g-NNN` as their registered key (e.g. `mapkey('g-016', { unique_id: 'cmd_foo', ... }, fn)`). The real binding is set by `api.mapcmdkey` in the user config.

**Why this matters for tests**: if a command uses a real key that conflicts with an existing default binding (e.g. `b` is already bound as `cmd_omnibar_bookmarks`), the `mapkey` call is silently rejected and the command never enters `commandRegistry`. `mapcmdkey` and `invokeCommand` both fail silently.

Using a `g-NNN` placeholder avoids all prefix conflicts — the command is always registered, and `mapcmdkey` can bind it to any real key after the conflicting key is freed.

**Adding a new g-NNN key**: declare it in `src/content_scripts/common/g-keys.ts` first. A duplicate entry causes `tsc` error TS1117. Use `"g-NNN" satisfies GKey` at every `mapkey`/`mappings.add` call site so an unregistered key fails at compile time.

In tests, bind via `unmapAllExcept` + `mapcmdkey` using the real target key (not the placeholder):

```typescript
await callSKApi(page, 'unmapAllExcept', []);
await callSKApi(page, 'mapcmdkey', 'bv', 'cmd_bookmark_save_youtube_position');
// Now 'bv' works — 'b' conflict is gone because unmapAllExcept cleared it
```

Or skip the key dispatch entirely and use `invokeCommand` directly (no key needed).

Trigger chords with sequential individual `keyboard.press()` calls with small delays between each character.

Alternative — **direct invocation** without key dispatch, using `invokeCommand` from `pw-helpers.ts`:

```typescript
import { invokeCommand } from '../utils/pw-helpers';
await invokeCommand(page, 'cmd_scroll_down');         // optional repeats arg
```

Use `invokeCommand` when testing command behaviour directly; use `callSKApi` + key press when testing the keybinding dispatch path.

Reference examples:
- Page target (single key): [`commands/cmd-scroll-down.spec.ts`](commands/cmd-scroll-down.spec.ts)
- SW target (chord + key dispatch): [`commands/cmd-tab-detach-magic-right.key.spec.ts`](commands/cmd-tab-detach-magic-right.key.spec.ts)

## Known Flaky Tests

Ignore on first failure, pass on retry:
- `cmd-hints-learn-element`
- `cmd-visual-document-start`
- `cmd-scroll-half-page-down`

Skipped in Docker (timing issues, pass locally):
- `cmd-capture-scrolling-element` — popup timing
- `cmd-capture-full-page` — popup timing
- `cmd-nav-next-link` — navigation timing
- `features/config-server-debug` › fixture config applied — user script registration timing

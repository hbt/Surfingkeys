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

Output shows functions executed during each test with call counts:
```
[Coverage:cmd_scroll_down] 66 functions hit — http://127.0.0.1:9873/scroll-test.html
  x  80  Mode.hasScroll
  x   3  elm.safeScroll_
  x   2  scroll
  ...
```

Coverage target is selected automatically per spec:
- Content-script commands (scroll, hints, visual, insert, nav): page target
- Background commands (tab, session, bookmark): service worker target

## Instrumenting a New Spec

Use `launchWithCoverage` from `tests/playwright/utils/pw-helpers.ts`:

```typescript
// Page target (content-script commands)
const result = await launchWithCoverage(FIXTURE_URL);
context = result.context;
await page.goto(FIXTURE_URL);
cov = await result.covInit();   // after goto

// SW target (background commands)
const result = await launchWithCoverage();
context = result.context;
cov = result.cov;               // ready immediately
```

## Conventions

- Fixtures must be **self-contained** — inline styles, no external URLs (causes flakiness)
- Name spec files after command `unique_id`: `cmd-scroll-down.spec.ts`
- One command per file
- Fixture server runs on `http://127.0.0.1:9873` (`tests/fixtures-server.js`)

## Known Flaky Tests

Ignore on first failure, pass on retry:
- `cmd-hints-learn-element`
- `cmd-visual-document-start`
- `cmd-nav-next-link`
- `cmd-scroll-half-page-down`

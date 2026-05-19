# add-playwright-linters

Improve test quality through linting and structural improvements.
Findings from 3-agent investigation (pw-rules, test-pats, skapi-unmap).

---

## Phase 1 — ESLint rules (zero violations) ✅ done

- [x] Add `no-focused-test` — blocks `.only` from landing in CI; 0 violations confirmed
- [x] Add `missing-playwright-await` — catches unawaited async Playwright calls; 0 violations confirmed
- [x] Add `valid-describe-callback` — syntax correctness; 0 violations confirmed
- [x] Add `no-unsafe-references` — closure bugs in `page.evaluate()`; 0 violations confirmed
- note: `no-conditional-expect` and `no-conditional-in-test` moved to Phase 2 — audited at 85 violations

## Phase 2 — ESLint rules (known violations — warn first)

- [ ] Add `no-conditional-expect` as `warn` — **~15 violations** across hints/visual/yank/marks tests; expects inside if blocks
- [ ] Add `no-conditional-in-test` as `warn` — **~70 violations** across tab-close/tab-reload/feature tests; if blocks checking tab counts
- [ ] Add `no-wait-for-timeout` as `warn` — **1,803 calls across 308 files**; migrate gradually
  - Define timeout constants: `KEYBOARD_DEBOUNCE=50`, `UI_FLUSH=200`, `PAGE_LOAD=500`, `LONG_OP=1500`
  - Replace with `waitForFunction`, `waitForLoadState`, `waitForNavigation` where possible
  - Remaining unavoidable delays get inline `// eslint-disable` with reason
- [ ] Add `no-skipped-test` as `warn` — 9 calls / 7 files; all are documented in CLAUDE.md
- [ ] Add `prefer-web-first-assertions` — auto-fixable; reduces flakiness
- [ ] Add `no-element-handle` — enforce locator API over `$()` / `$$()`
- [ ] Add `no-eval` — block `$eval`/`$$eval`; auto-fixable

## Phase 3 — DRY: extract `callSKApi` to shared helper

- [ ] Move `callSKApi` from 13 copy-pasted files into `tests/playwright/utils/pw-helpers.ts`
- [ ] Export and import in all 13 files:
  - `unmap-all-except.spec.ts`
  - `cmd-nav-new-window.spec.ts`
  - `cmd-tab-detach-magic-*.key.spec.ts` (11 files)
- [ ] Add lint rule or grep check to prevent future copy-paste of the function body

## Phase 4 — test.extend fixtures for duplicated helpers

- [ ] Create `tests/playwright/utils/fixtures.ts` with `test.extend` fixtures
- [ ] Extract `getTabsViaSW` — duplicated in ~50 tab command test files
- [ ] Extract `fetchHintLabels` / `fetchHintSnapshot` / `clickHintByLabel` — duplicated in ~15 hints files
- [ ] Extract `isOmnibarOpen` — duplicated in ~15 omnibar test files
- [ ] Update all affected tests to import from fixtures instead

## Phase 5 — test isolation standard

- [x] **ESLint rule:** `local/require-custom-command-mapping` (`error`) — every `tests/playwright/commands/**/*.spec.ts` must call `callSKApi(…, 'unmapAllExcept', [])` + `callSKApi(…, 'mapcmdkey', …)`; rule defined in `config/eslint-rules/require-custom-command-mapping.js`; **0 violations** ✅
- [x] Establish standard: all command tests call `unmapAllExcept([])` + `mapcmdkey` in beforeEach — **all ~285 command spec files migrated**
  - Tests that fail under key isolation flagged with `test.fail(); // flagged: fails after key isolation`
- [ ] Audit flagged `test.fail()` tests and fix underlying isolation issues (omnibar, visual mode entry)
- [ ] Add to CLAUDE.md test conventions section

## Phase 6 — coverage assertion gap

- [ ] Only 64 of 310 tests (21%) call `assertBasicCoverage`
- [ ] Decide: enforce `assertBasicCoverage` in all tests that use `withPersistedDualCoverage`?
- [ ] If yes: add custom eslint rule or grep check to `run-lint.ts`

## Phase 7 — afterEach cleanup gaps

- [ ] ~90 files (~30%) missing afterEach `Escape` keypress for page-mode commands
  - (Prevents modal/omnibar state leakage between tests)
- [ ] Audit which command categories need it (visual, hints, omnibar, insert)
- [ ] Add afterEach cleanup to missing files
- [ ] Add to test template in `tests/playwright/TEMPLATE_TEST.md`

---

## Reference

- ESLint rules investigated: 58 total (eslint-plugin-playwright@2.10.3)
- Currently enabled: `expect-expect`, `no-standalone-expect`, `valid-expect`
- Test files analyzed: 310 (37,072 lines)
- `waitForTimeout` calls: 1,803 across 308 files
- `callSKApi` copies: 13 files (should be 1)
- `test.extend` usages: 0 (opportunity)
- `assertBasicCoverage` adoption: 21% (64/310)

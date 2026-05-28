# Settings Spec Linter

## Rules

- [x] naming-convention (error) — files must match `setting-<name>.spec.ts`
- [x] coverage-flush (warning) — afterAll must have cov?.close() or withPersistedDualCoverage
- [x] describe-label (error) — describe must be `setting: <camelCaseName>`
- [x] restore-on-apply (error) — test() with applySetting must also have restoreSetting
- [x] boolean-both-states (warning) — boolean settings tested with both true and false
- [ ] source-cross-reference (warning) — settings with src ops must have a spec (skipped: cross-file, not an ESLint rule)

## Implementation

**Approach: ESLint local plugin rules + RuleTester tests**

- Rules 1–5 are per-file and fit the ESLint model
- Implemented as `.js` files in `config/eslint-rules/`
- Registered in `config/eslint.config.js` under `tests/playwright/settings/**/*.spec.ts`
- Tests use ESLint's built-in `RuleTester` class, run with `bun test`
- Test files go in `config/eslint-rules/__tests__/`
- Rule 6 (`source-cross-reference`) is cross-file — skipped from ESLint, may be added as standalone later

## Test Results

All 5 per-file rules implemented and passing (34 RuleTester tests across 5 rule files).

Running `bun scripts/run-lint.ts` passes cleanly. Against actual specs:
- `setting-scroll-step-size.spec.ts` — PASS (no issues)
- `setting-digit-for-repeat.spec.ts` — 1 WARNING: boolean setting `digitForRepeat` only tested with `false` (explicit `applySetting`); `true` tested only implicitly via default behavior test
- `setting-new-tab-position.spec.ts` — describe label fixed (was `"open 3 links via cmd_hints_link_background_tab"`, updated to `"setting: newTabPosition"`); now PASS

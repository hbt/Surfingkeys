---
adr: CDP-CI
title: CDP Test Suite CI Integration
status: proposed
date: 2026-05-28
category: infrastructure
tags:
  - testing
  - ci
  - playwright
  - cdp
deciders:
  - hbt
technical_story: "tests/cdp/ Playwright suite needs to run as part of the full CI pipeline"
depends_on:
  - adr: "003"
    title: CDP Message Bridge for Extension Testing
    reason: "tests/cdp/ uses sw.evaluate() which relies on the CDP message bridge"
  - adr: "004"
    title: CDP Reload Test Simplification
    reason: "Establishes the Playwright-first testing direction for CDP-backed tests"
enhances:
  - adr: "003"
    title: CDP Message Bridge for Extension Testing
    reason: "Brings CDP-backed tests into the same CI pipeline and report stream as Playwright tests"
---

# ADR-CDP-CI: CDP Test Suite CI Integration

**Date**: 2026-05-28
**Status**: Proposed

---

## ci.overview

### ci.overview.what

`tests/cdp/` is a Playwright-based test suite for commands that cannot be validated through
observable page state alone. Where `tests/playwright/` tests assert DOM changes, scroll positions,
or network requests that a standard Playwright page can see, CDP tests call `sw.evaluate()` to
invoke `chrome.*` APIs directly in the service worker and assert the return value or side-effect
from within Chrome's privileged context.

Current directory layout:

```
tests/cdp/
└── commands/        # one spec per command_id, matching tests/playwright/commands/ convention
```

No spec files exist yet — the directory was scaffolded as part of the CDP-test-first planning for
commands that are impossible to cover in `tests/playwright/`.

### ci.overview.why-separate

`tests/cdp/` is a distinct tree (not a subdirectory of `tests/playwright/`) for these reasons:

| Reason | Detail |
|--------|--------|
| Different execution model | CDP specs require `sw.evaluate()` and a Chrome debug port; standard Playwright specs do not |
| Different fixture needs | CDP specs may need a different `webServer` setup or none at all |
| Excluded from `testIgnore` by default | `playwright.config.ts` uses `testDir: './tests/playwright'`; `tests/cdp/` falls outside that tree entirely — not an accident |
| Conceptual separation | These tests verify Chrome API behavior, not rendered page state |

A separate config file (`playwright.cdp.config.ts`) will be introduced at repo root to point at
`tests/cdp/`. The question resolved by this ADR is how that config integrates with CI.

---

## ci.approach

Three integration options were evaluated.

### ci.approach.option-a — Add tests/cdp/ as a second Playwright project (RECOMMENDED)

Extend `playwright.config.ts` with a second entry in the `projects` array:

```typescript
projects: [
  { name: 'playwright', testDir: './tests/playwright', testIgnore: ['**/scratch/**'] },
  { name: 'cdp',        testDir: './tests/cdp' },
]
```

A single `bunx playwright test` invocation (and therefore `npm run test:playwright:parallel`) covers
both suites. The JSON reporter produces one combined output file under
`test-artifacts/reports/runs/`, preserving the current single-report contract.

| Dimension | Assessment |
|-----------|------------|
| CI impact | Zero changes to `scripts/ci-worker.ts` — the Docker run command is unchanged |
| Reporting | Both suites land in the same JSON report; `ci-gather.ts` / `ci-report.ts` need no changes |
| `--workers=N` | Respected identically for both projects |
| `check-issues.ts` | No changes required unless exclusion lists need updating |
| Parallelism | CDP specs run in the same worker pool as Playwright specs |
| Isolation risk | A failing CDP spec triggers `maxFailures` the same as any other spec |

**Cons:**

- CDP specs that are slow or flaky share the `maxFailures: 1` abort threshold with the full suite.
  Mitigation: mark unstable CDP specs with `test.skip` until stable.
- The `webServer` array in `playwright.config.ts` (fixtures server on `:9873`, config servers on
  `:9601`/`:9602`) will be started even for CDP-only runs. Mitigation: `reuseExistingServer: true`
  means overhead is minimal; servers are not started if already listening.
- If CDP specs require a debug port that is not present in Docker, they must be skipped via an env
  guard (e.g. `test.skip(!process.env.CDP_PORT, 'requires debug port')`). This is the same pattern
  used by Docker-incompatible specs today.

### ci.approach.option-b — Separate playwright.cdp.config.ts + separate npm script

Keep a standalone `playwright.cdp.config.ts` at repo root. Add:

```json
"test:cdp:parallel": "CONFIG_SERVER_PORT=9602 BUILD_SUFFIX=-test npm run build:dev && bun scripts/test-parallel.ts --config playwright.cdp.config.ts"
```

Modify `scripts/ci-worker.ts` to run both scripts sequentially (or in a shell chain).

| Dimension | Assessment |
|-----------|------------|
| CI impact | `ci-worker.ts` must be edited to run a second test command |
| Reporting | Two separate JSON report files per commit — `ci-gather.ts` aggregation becomes more complex |
| `--workers=N` | Each run gets its own worker pool; total concurrency doubles |
| Isolation | CDP failures do not abort the Playwright suite and vice versa |

**Cons:**

- More moving parts: two npm scripts, two report files, CI worker changes, gather/report script
  changes.
- Report filenames encode a single run; two files per commit breaks the current 1:1 SHA→report
  assumption in `ci-gather.ts` (`parseRunFilename` maps one filename to one `RunEntry`).

### ci.approach.option-c — Merge tests/cdp/ into tests/playwright/cdp/ with testMatch filter

Move `tests/cdp/` into `tests/playwright/cdp/`, add a `testMatch` glob to the existing project, or
add a second project pointing at the subdirectory.

| Dimension | Assessment |
|-----------|------------|
| Directory clarity | Mixed metaphors — `tests/playwright/` implies page-visible assertions |
| Future migration | CDP specs may eventually be replaced by Playwright native API; a clean `tests/cdp/` root makes that refactor obvious |

**Cons:**

- Violates the conceptual separation that motivated the separate directory. Not recommended.

---

## ci.implementation

Step-by-step changes required to implement Option A.

### ci.implementation.playwright-config

File: `/home/hassen/workspace/surfingkeys/playwright.config.ts`

Current state:

```typescript
testDir: './tests/playwright',
testIgnore: ['**/scratch/**'],
// ...
workers: 1,
projects: [{ name: '' }],
```

Required change: replace the single `testDir` + single `projects` entry with two named projects.
The top-level `testDir` should be removed (or kept as a fallback); each project declares its own.
`testIgnore` moves into the `playwright` project. The `cdp` project needs no `testIgnore` unless
scratch equivalents are added later.

The `workers: 1` top-level value is a known issue (see existing comment in the config): it would
cap both projects. The existing workaround — setting `workers` only via `--workers=N` CLI — already
handles this since `project.workers` is `undefined` by default and the CLI flag takes precedence.
No change needed there.

### ci.implementation.package-json

File: `/home/hassen/workspace/surfingkeys/package.json`

No new scripts are required for Option A. The existing scripts continue to work:

| Script | Behaviour after change |
|--------|----------------------|
| `test:playwright:parallel` | Runs both suites via `bunx playwright test` |
| `test:playwright` | Same |
| `docker:test:playwright:parallel` | Same |

One optional addition: a focused script for running only the CDP suite locally.

```json
"test:cdp": "CONFIG_SERVER_PORT=9602 BUILD_SUFFIX=-test npm run build:dev && bunx playwright test --project=cdp"
```

### ci.implementation.ci-worker

File: `/home/hassen/workspace/surfingkeys/scripts/ci-worker.ts`

No changes required. The worker invokes `docker-compose run --rm tests` which calls
`npm run test:playwright:parallel` inside Docker. That script calls `bunx playwright test` which
now covers both projects automatically.

The quick-run path (`quick: true`) passes a single spec file path:

```typescript
["npm", "run", "test:playwright:parallel", "--", "tests/playwright/commands/cmd-scroll-down.spec.ts"]
```

This path continues to work unchanged because Playwright resolves the explicit file path
regardless of `testDir` in the config.

### ci.implementation.docker-env

No Docker changes required. The `tests/cdp/` directory is within the repo root which is already
bind-mounted into the container.

CDP specs that require a remote debug port (`--remote-debugging-port`) are not available in Docker.
Those specs must self-skip:

```typescript
test.skip(process.env.DOCKER_CI === '1', 'requires CDP debug port — not available in Docker');
```

This is consistent with how `cmd-capture-full-page` and `cmd-nav-next-link` handle their Docker
incompatibility today (via `test.skip` in the spec body).

### ci.implementation.check-issues

File: `/home/hassen/workspace/surfingkeys/scripts/check-issues.ts`

No changes required at integration time. The `EXCLUDED_IDS` set controls which missing-test IDs
fail CI. Once CDP specs are written and passing, specific IDs can be removed from `EXCLUDED_IDS`
(see `ci.exclusions` below).

---

## ci.reporting

### ci.reporting.json-output

`scripts/test-parallel.ts` passes `PLAYWRIGHT_JSON_OUTPUT` to `bunx playwright test`. The JSON
reporter is a built-in Playwright reporter that aggregates all projects into one file. With Option
A, the combined JSON report will contain suites from both the `playwright` project and the `cdp`
project under the top-level `suites` array.

Report file location and naming are unchanged:
`test-artifacts/reports/runs/<ISO>-<sha>-<env>.json`

### ci.reporting.suite-attribution

Each test result in the JSON will carry the project name (`playwright` or `cdp`) in its
`projectName` field. The existing summary scripts (in `CLAUDE.md`) iterate `suites` recursively
and aggregate `stats.expected` / `stats.unexpected` — this works for any number of projects without
modification.

`ci-gather.ts` reads `data.stats` from the top-level JSON. Playwright's JSON reporter rolls all
project stats into the top-level `stats` object, so `ci-gather.ts` continues to produce correct
aggregate counts.

### ci.reporting.html-report

The HTML report (`test-artifacts/playwright/`) groups results by project name when multiple
projects are present. CDP tests will appear under a `cdp` section, making it easy to distinguish
failures by suite.

---

## ci.exclusions

### ci.exclusions.current-state

`cmd_nav_new_incognito_window` appears in two exclusion lists:

| File | List | Entry |
|------|------|-------|
| `scripts/check-issues.ts` | `EXCLUDED_IDS` | `'cmd_nav_new_incognito_window'` (under "Incognito" group) |
| `scripts/lib/mappings-report/constants.ts` | `DEFERRED_COMMANDS` | `{ unique_id: 'cmd_nav_new_incognito_window', reason: 'Incognito — chrome.windows.create with incognito not supported in Playwright' }` |

The reason: `chrome.windows.create({ incognito: true })` is callable in the service worker but
the resulting incognito window is inaccessible from a standard Playwright browser context. A CDP
test can verify the API call succeeds and returns a window object without needing to interact with
the incognito window from the page side.

### ci.exclusions.removal-trigger

Remove `cmd_nav_new_incognito_window` from `EXCLUDED_IDS` in `check-issues.ts` **and** from
`DEFERRED_COMMANDS` in `scripts/lib/mappings-report/constants.ts` once:

1. A CDP spec exists at `tests/cdp/commands/cmd-nav-new-incognito-window.spec.ts`
2. The spec verifies `chrome.windows.create({ incognito: true })` returns a valid window ID
3. The spec is passing in CI (or explicitly skipped in Docker with a passing local run documented)

### ci.exclusions.other-candidates

Other IDs in `EXCLUDED_IDS` that may be candidates for CDP coverage once the suite matures:

| ID | Reason currently excluded | CDP testable? |
|----|--------------------------|---------------|
| `cmd_nav_incognito` | Incognito window lifecycle | Partial — SW call verifiable |
| `cmd_tab_close_magic_incognito` | Chrome split incognito isolates SW | No — tab query returns `[]` |
| `cmd_tab_reload_magic_incognito` | Same | No |
| `cmd_tab_copy_urls_magic_incognito` | Same | No |
| `cmd_tab_detach_magic_incognito` | Same | No |
| `cmd_quit_chrome` | Terminates browser | No — destructive |
| `cmd_session_save_quit` | Browser lifecycle | Partial — save side-effect verifiable |

Do not remove exclusions speculatively. Each removal requires a passing spec.

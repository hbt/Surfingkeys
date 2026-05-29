# stream.testing / CI todos

CI and testing infrastructure improvements. CI is part of the testing stream — not a separate stream.

---

## 1. Pre-commit vs CI split

Goal: keep pre-commit near-instant; let CI own all heavy checks.

- [ ] Audit which checks belong in pre-commit vs CI
  - Pre-commit (keep fast): build only (`--only build`, ~1-2s); maybe `--only build,integrity` (~3s)
  - Move to CI: TypeScript strict, lint, mappings issues, coverage
- [ ] Update `scripts/pre-commit-lint.sh` to only run fast check(s)
- [ ] Add `post-commit.sh` hint output so agent knows to loop on CI status
- [ ] Decide whether Playwright linters (Phase 2+) stay in pre-commit or move to CI as they grow heavier
- See: `ideas/enhance-ci.md` for the drafted implementation

---

## 2. CI infrastructure (`scripts/ci.ts` + worker)

Goal: stop reinventing the wheel; use or build something more standard and reusable.

- [ ] Audit current `ci.ts` / `ci-worker.ts` / `ci-gather.ts` — document what each does and what's custom vs could be replaced
- [ ] Evaluate existing open-source self-hosted CI tools (Woodpecker CI, Forgejo Actions, Dagger, etc.) — can any replace the custom worker without losing the Docker + coverage setup?
- [ ] Standardize test result output to a known format (JUnit XML is the most portable; also used by Playwright's built-in reporter)
  - Playwright already has `junit` reporter — enable it alongside the existing JSON reporter
  - This makes results consumable by any standard CI dashboard or aggregator
- [ ] Deduplicate `buildReport()` in `verify.ts` — `integrity` and `issues` both call it independently (~13s each); merge into one check
- [ ] Automated CI feedback loop: detect `stats.unexpected > 0` → dispatch fix agent to `ci/fix-<sha>` worktree
  - Prereq: `failedTests[]` must be in report JSON (or cross-ref via `completed[].filename`)
  - Prereq: clarify whether `ci-gather.ts` pulls from local `test-artifacts/` or remote `ctms-ops`

---

## 3. Coverage in CI

CI currently runs tests but does not collect coverage data. Coverage only exists for local runs.

- [ ] Enable `COVERAGE=true` in the Docker CI test run
  - Trade-off: slower runs — benchmark the delta before committing
  - Option: run coverage on a subset (e.g. one shard, or only on changed commands)
- [ ] Pipe coverage output into `test-artifacts/reports/runs/<ts>-<sha>-docker.json` alongside pass/fail stats
- [ ] Surface coverage delta in CI report output (`bun scripts/ci.ts report`)
- [ ] Historical coverage data: ensure coverage from CI runs is accumulated the same way local runs are

---

## 4. Excluded / skipped tests tracking

A small but growing set of tests don't run in Docker (timing, popup, incognito reasons). Need visibility.

Current known exclusions:

| Test | Reason |
|------|--------|
| `cmd-capture-scrolling-element` | Popup timing — passes locally |
| `cmd-capture-full-page` | Popup timing — passes locally |
| `cmd-nav-next-link` | Navigation timing flaky in Docker |
| `features/config-server-debug` | User script registration timing |

- [ ] Maintain a machine-readable exclusions list (JSON or TS constant) so the CI report can surface the count
- [ ] For each excluded test: investigate whether the root cause can be fixed (retry logic, longer timeout, different fixture approach)
- [ ] Surface exclusion count in the CI dashboard / report so it doesn't silently grow

---

## 5. Incognito test coverage

CDP-based incognito test is a proof of concept. Needs to extend to all incognito commands.

- [ ] Inventory all commands that require incognito (`unique_id` list from mappings report — filter by tag or exclusion reason)
- [ ] Determine whether Playwright can cover them (pre-allowlisted extension + `browserContext` with incognito) or CDP is required
- [ ] Extend incognito test coverage to all incognito commands, not just the one POC
- [ ] Track incognito commands separately in the CI exclusions list if they can't run in Docker
- See done chapters: `add-testing-incognito.md`, `incognito-cdp.md`

---

## 6. CI + testing dashboard

No single view of key metrics. Hard to track trends.

- [ ] Define the key metrics to surface:
  - Pass rate (total, per category)
  - Coverage % (total, per command)
  - Excluded / skipped test count
  - Flaky test count and which tests
  - Pre-commit check duration trend
- [ ] Evaluate options: static HTML from `ci.ts report`, Grafana + JSON, simple terminal dashboard, or a proper web UI
- [ ] Dedicated worktree branch pattern for agent-driven fixes:
  - CI detects failure → creates `ci/fix-<sha>-<test-slug>` branch → agent gets test name + failure output → fixes in worktree → PR for review
  - Requires: JUnit output (item 2), failedTests in report (item 2), worktree tooling already exists

---

## 7. `buildReport()` deduplication (quick win)

- [ ] Merge `integrity` and `issues` checks in `verify.ts` to call `buildReport()` once
- [ ] Confirm wall-time and CPU impact before/after

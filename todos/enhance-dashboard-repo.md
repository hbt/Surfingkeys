# enhance-dashboard-repo

Goal: evolve `scripts/ccs.ts` into a full repo-state snapshot dashboard.
Queryable, navigable, organised by data type. One invocation = current truth about the project.

---

## 0. Architecture decision

- [ ] Decide on UI mode: **TUI** (term cursor navigation via readline/tput) vs **static terminal** (current, paged with `less -R`) vs **local web** (`bun scripts/server.ts` extension)
  - TUI: keyboard navigation between sections, fold/expand, search — requires a lib (`blessed`, `ink`, or raw ANSI escape sequences)
  - Static: simpler, pipeable, greppable — add `--section <name>` flag for targeted output
  - Web: richest UI, shareable URLs, graphs — but higher cost to build
  - Recommendation: start with `--section` flag + `--json` output on static; add TUI later
- [ ] Decide on data layer: read files directly (current) vs DuckDB JSON reads (as planned in `enhance-ci.md#6`)
  - File reads: fast, no deps, sufficient for most sections
  - DuckDB: enables cross-joins (e.g. uncovered mappings × open todos), trend queries over time
  - Recommendation: file reads first; DuckDB opt-in via `--query` flag

---

## 1. Todos section

Surface open/done counts across all `todos/` files without manual counting.

- [ ] Parse all `todos/**/*.md` for `- [ ]` (open) and `- [x]` (done) items
- [ ] Group by directory: root, `features/`, `bugs/`, plus any future subdirs
- [ ] Output per-file breakdown: filename | open | done | total | % done
- [ ] Aggregate row: total open, total done, total items, overall % done
- [ ] Flag files with 0 done items (never touched) and files with 100% done (candidates to archive)
- [ ] Stream cross-ref: map each file to its stream label from `status.md` (migration, testing, typescript…)
- [ ] Show top-5 files by open item count (highest debt)

---

## 2. Plans section

- [ ] Parse all `plans/**/*.md` for open `- [ ]` items
- [ ] Display: plan name | open items | status (derive from item count: 0 open = done, else active)
- [ ] Link to `todos/status.md` stream entries that reference each plan

---

## 3. Tests section

Richer than the current "latest run" panel.

- [ ] **Suite inventory**: count spec files in `tests/playwright/commands/`, `features/`, `settings/`, `scratch/`
- [ ] **Pass rate trend**: last N runs — sparkline or mini-table showing pass % per run
- [ ] **Flaky test tracker**: across last N runs, which tests appear as `flaky` most often — rank by frequency
- [ ] **Known exclusions**: read from a machine-readable source (see `enhance-ci.md#4`) and show count + list
- [ ] **Failure details**: for the latest run, show failing spec names (walk the JSON `suites` tree — already have `stats`, need to add `walk()`)
- [ ] **Local vs docker split**: separate history rows by env so trends are comparable
- [ ] **Pre-commit timing**: read from verify output or git hook log if available

---

## 4. Coverage section

- [ ] **Per-command coverage inventory**: list `test-artifacts/coverage-html/` dirs — name, mtime, whether bg+content both present
- [ ] **Zero-coverage commands**: cross-ref `tests/playwright/commands/` spec list vs coverage dirs — identify specs with no coverage HTML generated yet (see `fix-no-coverage-tests.md`)
- [ ] **Coverage age**: flag coverage dirs older than N days (stale — test may have changed)
- [ ] **V8 JSON summary**: optionally parse `test-artifacts/coverage-raw/` for function/line hit counts to show a `%` (expensive — gate behind `--coverage-detail` flag)

---

## 5. Mappings section

Pull from `bun scripts/mappings-json-report.ts --json` output (already cached-friendly).

- [ ] **Total mappings**: count of `mappings.list[]` entries
- [ ] **Issues count**: `issues[]` length — categories: conflicts, missing keys, duplicates
- [ ] **Coverage gap**: mappings with no corresponding spec file in `tests/playwright/commands/`
- [ ] **Custom vs upstream**: count of entries in `custom_configuration` vs standard
- [ ] Flag: run `--integrity` check and surface pass/fail inline

---

## 6. Repo health section

Expand current extension-status panel.

- [ ] **Git worktrees**: run `git worktree list` — show count + branch names + dirty state for each
- [ ] **Uncommitted changes**: file count from `git status --short`
- [ ] **Branch ahead/behind**: `git rev-list --count HEAD...origin/HEAD` for local vs remote drift
- [ ] **CI queue**: pending item count from `ctms-ops` (already in `ci-gather.ts` — reuse)
- [ ] **Docker container**: surfingkeys container running/stopped + duration (already in `ci-gather.ts`)
- [ ] **Relay server**: current panel (keep)
- [ ] **Build age**: current panel (keep) — also add whether `dist/development` is newer than latest source change

---

## 7. Navigation & UX

- [ ] **Section flag**: `bun scripts/ccs.ts --section todos` to print only one section (fast, scriptable)
- [ ] **JSON output**: `--json` flag dumps all sections as structured JSON (for piping into DuckDB or `jq`)
- [ ] **Refresh interval**: `--watch N` flag — re-render every N seconds (like `watch -n5`) using ANSI clear-screen
- [ ] **Colour legend**: `--no-color` flag for CI/pipe contexts
- [ ] **Section ordering**: make section order configurable via a constant at top of file (user can reorder)
- [ ] **Timestamps**: all "age" values include absolute ISO date on `--verbose`
- [ ] **Pager**: if output > terminal height, auto-pipe to `less -R` unless stdout is not a TTY

---

## 8. Data freshness & caching

- [ ] `mappings-json-report.ts` is slow (~9s) — cache output to `test-artifacts/cache/mappings.json` with mtime check; `--refresh` to bypass
- [ ] `ci-gather.ts` runs rsync + SSH — skip remote fetch if `--offline` flag is passed (local cache only)
- [ ] Show cache age next to each section header so user knows how fresh the data is

---

## References

- Current dashboard: `scripts/ccs.ts`
- CI gather/report: `scripts/ci-gather.ts`, `scripts/ci-report.ts`
- Mappings report: `scripts/mappings-json-report.ts`
- Coverage: `test-artifacts/coverage-html/`, `test-artifacts/coverage-raw/`
- Test runs: `test-artifacts/reports/runs/`
- Related todos: `enhance-ci.md#6`, `fix-no-coverage-tests.md`, `review-coverage-test.md`

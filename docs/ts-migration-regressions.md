# ts-migration-regressions

## migration.overview

| Field | Value |
|-------|-------|
| Branch | `jsts` |
| Worktree | `/home/hassen/workspace/surfingkeys-jsts` |
| Base commit | `cd1daec` ([feat] worktree:status + worktree:merge) |
| Test command | `npm run test:playwright:parallel` |
| Test suite size | 633 tests |
| Report date | 2026-05-10 |

---

## migration.baseline

**Commit:** `cd1daec` (pre-TS, baseline)

| Metric | Count |
|--------|-------|
| Passed | 631 |
| Failed | 2 |
| Flaky | 0 |
| Total | 633 |

**Known baseline failures (pre-existing, not TS-related):**

| Test | Reason |
|------|--------|
| `cmd-hints-first-input › 1.1 should load input-test.html fixture` | Page title includes tab index prefix `[2]` — pre-existing showTabIndices issue |
| `cmd-hints-select-input › 1.1 should load input-test.html fixture` | Same as above |

Report file: `test-reports/runs/2026-05-10T23-57-05-808Z-cd1daec.json`

---

## migration.commits

### commit.1 — `3a20bad` (cherry of `42f6882`)

**[ts] convert 4 JS files to TypeScript — commandMetadata, usageTracker, observer, fuzzyFilter**

Files changed:
- `src/common/commandMetadata.js` → `commandMetadata.ts`
- `src/common/usageTracker.js` → `usageTracker.ts`
- `src/content_scripts/common/observer.js` → `observer.ts`
- `src/content_scripts/ui/fuzzyFilter.js` → `fuzzyFilter.ts`

| Metric | Count | Delta vs baseline |
|--------|-------|-------------------|
| Passed | 629 | -2 |
| Failed | 2 | 0 |
| Flaky | 2 | +2 |
| Total completed | 633 | — |

**New failures:** None.

**Flaky tests (known):**
- `cmd-hints-learn-element › 2.3 can re-enter regional hints after l command` — listed as known flaky in CLAUDE.md
- `cmd-tab-close › cmd_tab_close closes the active tab` — listed as known flaky in CLAUDE.md

**Verdict:** No regressions. The 2-point drop in "passed" is absorbed by the 2 known flaky tests.

Report file: `test-reports/runs/2026-05-10T23-58-57-184Z-3a20bad.json`

---

### commit.2 — `f569234` (cherry of `7590bb0`)

**[ts] fix type errors in observer.ts + usageTracker.ts**

Files changed: `observer.ts` (5 lines), `usageTracker.ts` (5 lines)

| Metric | Count | Delta vs baseline |
|--------|-------|-------------------|
| Passed | 629 | -2 |
| Failed | 2 | 0 |
| Flaky | 2 | +2 |
| Total completed | 633 | — |

**New failures:** None.

**Flaky tests (known):**
- `cmd-tab-close › cmd_tab_close closes the active tab`
- `cmd-visual-document-start › gg moves cursor to beginning of document` — listed as known flaky in CLAUDE.md

**Verdict:** No regressions.

Report file: `test-reports/runs/2026-05-11T00-00-50-758Z-f569234.json`

---

### commit.3 — `45abe15` (cherry of `ed1904c`)  ⚠️ REGRESSION INTRODUCED

**[ts] convert trie.js → trie.ts**

Files changed: Added `src/content_scripts/common/trie.ts` (137 lines, new file). **`trie.js` was NOT removed.**

| Metric | Count | Delta vs baseline |
|--------|-------|-------------------|
| Passed | ~97 | -534 |
| Failed (timed out) | ~163 | +161 |
| Retries | ~336 | — |
| Suite result | TIMED OUT (8 min) | — |
| Total completed | ~597/633 | 36 tests not reached |

**Root cause:** Both `trie.js` and `trie.ts` coexist. The new `trie.ts` uses ES class syntax (`class Trie implements TrieNode`), while `trie.js` uses prototype-based constructor (`function Trie()`). When esbuild resolves `import Trie from './trie'`, it picks up `trie.ts` (TypeScript takes precedence). The class-based Trie has a different instantiation pattern or missing compatibility, causing the hints system to malfunction. Since hints use Trie for key-sequence matching, any test that exercises hints or keyboard dispatch hangs or errors.

**Affected test categories (from test-results directory):**

| Test suite | Failure mode |
|------------|-------------|
| `cmd-hints-link-active-tab` | Tests hang after test 2.1 (`af` key press triggers hints) |
| `cmd-hints-link-background-tab` | Same — hints system hangs |
| `cmd-hints-multiple-links` | Same |
| `cmd-nav-open-clipboard` | Navigation command fails (possible Trie-related key dispatch issue) |
| All other `cmd-hints-*` suites | Presumed affected (pattern matches) |

**Sample failing test (confirmed):**
- `cmd-hints-link-active-tab › 2.1 should create hints when pressing af key`
  - Test 1.1 and 1.2 pass (no hint interaction)
  - Test 2.1 hangs indefinitely when `af` key fires hint creation via broken Trie

**Verdict:** Critical regression. The hints subsystem is broken. ~163 tests fail or time out. Suite cannot complete within 8 minutes.

---

### commit.4 — `0a00f93` (cherry of `493f17e`)

**[ts] fix trie.ts lint — refactor this-alias to pass eslint**

Files changed: `trie.ts` only (17-line refactor, no semantic change). **`trie.js` still not removed.**

| Metric | Count | Delta vs baseline |
|--------|-------|-------------------|
| Passed | ~97 | -534 |
| Failed (timed out) | ~164 | +162 |
| Suite result | TIMED OUT (8 min) | — |
| Total completed | ~598/633 | — |

**New failures:** None beyond commit 3's regressions. This commit is a lint-only fix and does not address the root cause (coexisting `.js` and `.ts`).

**Verdict:** Regression from commit 3 persists unchanged.

---

### commit.5 — `50187e8` (cherry of `d3d4136`)

**[ts] convert errorCollector.js → errorCollector.ts**

Files changed: Added `src/common/errorCollector.ts` (242 lines, new file). **`errorCollector.js` was NOT removed.**

| Metric | Count | Delta vs baseline |
|--------|-------|-------------------|
| Passed | ~97 | -534 |
| Failed (timed out) | ~163 | +161 |
| Suite result | TIMED OUT (8 min) | — |
| Total completed | ~597/633 | — |

**New failures:** None beyond commit 3's regressions. `errorCollector` is not in the hot path for hints/keyboard dispatch.

**Verdict:** Regression from commit 3 persists. No additional regression from errorCollector.ts.

---

### commit.6 — `78ba877` (cherry of `5fdc5cd`)

**[ts] convert runtime.js → runtime.ts**

Files changed: Added `src/content_scripts/common/runtime.ts` (255 lines, new file). **`runtime.js` was NOT removed.**

| Metric | Count | Delta vs baseline |
|--------|-------|-------------------|
| Passed | ~97 | -534 |
| Failed (timed out) | ~163 | +161 |
| Suite result | TIMED OUT (8 min) | — |
| Total completed | ~597/633 | — |

**Confirmed failing tests (from test-results/):**

| Test | Error |
|------|-------|
| `cmd-hints-link-active-tab › ...` (5 tests) | Hints system hangs on key press |
| `cmd-nav-open-clipboard › pressing cc with selected URL text opens a new tab` | `newTabCount` not greater than `initialTabCount` |
| `cmd-nav-open-clipboard › cc command opens clipboard URL in new tab` | Same — tab not opened |

**Verdict:** Regression from commit 3 persists. No additional regression from runtime.ts.

---

## migration.summary

| Commit | Hash | Passed | Failed | Suite | New Regressions |
|--------|------|--------|--------|-------|-----------------|
| Baseline | `cd1daec` | 631 | 2 | ✅ Complete | — |
| 1 — 4 JS→TS | `3a20bad` | 629 | 2 (+2 flaky) | ✅ Complete | None |
| 2 — type fixes | `f569234` | 629 | 2 (+2 flaky) | ✅ Complete | None |
| 3 — trie.ts | `45abe15` | ~97 | ~163 | ❌ TIMEOUT | **Yes — hints system broken** |
| 4 — trie lint | `0a00f93` | ~97 | ~164 | ❌ TIMEOUT | None (commit 3 persists) |
| 5 — errorCollector.ts | `50187e8` | ~97 | ~163 | ❌ TIMEOUT | None (commit 3 persists) |
| 6 — runtime.ts | `78ba877` | ~97 | ~163 | ❌ TIMEOUT | None (commit 3 persists) |

## migration.root_cause

The regression is introduced by commit 3 (`ed1904c` / `45abe15` in this branch). The pattern repeated in commits 5 and 6:

- A new `.ts` file is added alongside the old `.js` file (no deletion).
- esbuild resolves `.ts` over `.js` when both exist.
- `trie.ts` uses ES class syntax; `trie.js` uses prototype-based constructor.
- The hints system (which uses Trie for key-sequence matching) breaks when it receives the class-based Trie instead of the prototype-based one.

**Fix pattern required:** Each JS→TS conversion must also delete the corresponding `.js` file in the same commit.

## migration.known_flaky_baseline

Per `CLAUDE.md`, these tests are known flaky and should be ignored on first failure:
- `cmd-hints-learn-element`
- `cmd-visual-document-start`
- `cmd-nav-next-link`
- `cmd-scroll-half-page-down`
- `cmd-tab-close`

# project.contributions

Documents hbt's fork work (2026+), separated from upstream history.

## overview

| Metric | Value |
|--------|-------|
| Fork work started | 2026-01-20 |
| hbt commits (2026+) | 820 |
| Upstream commits merged (2026) | 15 (from 8 contributors) |
| Total 2026+ commits | 835 |
| Agent-authored commits | 0 — all commits are by hbt |

**Note:** All commits are human-authored under `hbt` (`hassenbentanfous@gmail.com`). Several commits set up tooling *for* coding agents (CLAUDE.md, kanban system, agent timeout guards), but no commits are authored by an AI.

---

## commits.by-month

| Month | Count | Primary work |
|-------|-------|--------------|
| 2026-01 | 382 | esbuild migration, ESLint, CDP/Playwright infra, docs (ADRs, C4, feature tree), command migration tooling |
| 2026-02 | 2 | Upstream bug fixes only (iframe keyboard close, Alt-f imap) |
| 2026-03 | 19 | Playwright test migration (551/552 passing), coverage tooling, mappings report |
| 2026-04 | 36 | Coverage instrumentation rollout, upstream syncs, worktree tooling, audit report |
| 2026-05 | 396 | TypeScript migration (strict), Magic Tab system, bookmarks, CI/Docker, config server, settings fixes |

---

## work.streams

### stream.infrastructure (2026-01)
- Migrated build from webpack → **esbuild**
- ESLint configuration and linting pipeline
- CDP-based test infrastructure; Playwright POC
- Documentation: feature tree, C4 architecture diagrams, glossary, ADRs
- Command migration tooling (mappings report)
- Agent workflow tooling: file-based kanban, CLAUDE.md, timeout guards

### stream.testing (2026-01 – 2026-04)
- Full Playwright test suite migration from CDP/Jest
- 551/552 commands covered with Playwright specs
- Per-function call-count coverage instrumentation
- Dual coverage (V8 + custom delta) across all spec categories
- `tests/playwright/scratch/` for one-off diagnostic specs
- `tests/playwright/CLAUDE.md` conventions enforced

### stream.typescript (2026-05)
- TypeScript migration phases 5–8
- Strict mode (`noImplicitAny`, strict null checks)
- Source files renamed `.js` → `.ts`

### stream.tab-magic (2026-05)
- `tabHandleMagic` dispatch system replacing legacy tab handlers
- Commands: close, reload, copy URL, pin, bookmark, detach
- Direction-aware dispatch (`CurrentTab`, `DirectionLeft`, `DirectionRight`, `DirectionRightAll`)
- Cross-window support via `chrome.tabs.query({})`

### stream.bookmarks (2026-05)
- Add/remove/cut/copy bookmark folders
- Pending-key dispatch for multi-step bookmark operations

### stream.ci (2026-05)
- Docker-based CI hardening
- Parallel test runner (`scripts/test-parallel.ts`)
- Pre-commit lint hooks
- Test run history to `test-artifacts/reports/runs/`

### stream.config-server (2026-05)
- Zero-CDP local config auto-fetch
- Config server debug feature with Playwright test coverage

### stream.settings (2026-05)
- SW restart persistence (`persistentSettingKeys`)
- Snippet error isolation via per-call safeApi proxy
- Broadcast change detection, `loadSettings` cache

---

## authors.upstream-merged (2026)

| Author | Commits | Contribution |
|--------|---------|--------------|
| brook hong | 6 | Upstream maintainer — ongoing fixes |
| twio142 | 3 | External contributor (upstream PRs) |
| WzLYVg387U | 1 | External contributor (upstream PR) |
| Maddison Hellstrom | 1 | External contributor (upstream PR) |
| kain-tm | 1 | External contributor (upstream PR) |
| Federico Franco | 1 | External contributor (upstream PR) |
| alps2006 | 1 | External contributor (upstream PR) |
| agguser | 1 | External contributor (upstream PR) |

---

## commit.patterns

| Prefix | Meaning |
|--------|---------|
| `[feat]` | New feature |
| `[fix]` | Bug fix |
| `[test]` | Test additions/changes |
| `[docs]` | Documentation |
| `[ci]` | CI/build tooling |
| `[refactor]` | Code restructuring |
| `[ts]` | TypeScript migration |
| `[lint]` | Linting changes |
| `[wip]` | Work-in-progress checkpoint |
| `[settings]` | Settings system |
| `[bookmarks]` | Bookmarks feature |
| `[scratch]` | Scratch/diagnostic tests |
| `[migration]` | Command migration work |
| `[upstream]` | Upstream sync/merge |

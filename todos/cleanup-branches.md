# Branch & Worktree Cleanup

Last reviewed: 2026-05-27

## Worktrees

| Worktree | Branch | HEAD | Ahead master | Status |
|----------|--------|------|--------------|--------|
| `surfingkeys/` | `master` | d65d1fc | — | active |
| `surfingkeys-archive/` | `archive/hbt-master-manifest-v2-fork-2018-2025` | a764162 | 229 | archive, keep |
| `surfingkeys-bookmarks/` | `bookmarks` | f9c2853 | 11 | active WIP |
| `surfingkeys-deepseek-playwright/` | `deepseek-playwright` | 31b27b3 | 0 | stale, remove |
| `surfingkeys-fix-playwright-keymapping/` | `fix-playwright-keymapping` | 8ff6e23 | 0 | stale, remove |
| `surfingkeys-jsts/` | `jsts` | a18b9db | 0 | stale, remove |
| `surfingkeys-passthrough-single-key/` | `feat/passthrough-single-key` | 6752b9e | 0 | stale, remove |
| `surfingkeys-upstream-sync/` | `upstream-sync` | 92cd255 | 0 | stale, remove |

## Branches with Unmerged Work

| Branch | Ahead | Behind | Notes |
|--------|-------|--------|-------|
| `bookmarks` | 11 | 1 | Active feature — bookmark folder commands, has wip commit + merge from master. Needs rebase/completion decision. |
| `worktree-agent-a1d93e15` | 22 | 205 | Agent-generated JS→TS conversion (trie, errorCollector, runtime, mode, keyboardUtils, utils, clipboard, debug_utils, cursorPrompt, ace, devtools, pages-nav, neovim). Diverged — needs rebase onto master before landing. No worktree. |
| `archive/hbt-master-manifest-v2-fork-2018-2025` | 229 | 1119 | Archive of old fork. Reference only — do not merge. |
| `archive/failed-v0.9.54-port-attempt-2019` | 188 | 1097 | Old failed port attempt. Archive only — do not merge. |

## Stale Branches (0 ahead of master, safe to delete)

- [ ] `cleanup-configs` — 707 behind
- [ ] `crewai-experiment` — 151 behind
- [ ] `deepseek-playwright` — 31 behind (has stale worktree)
- [ ] `exp-bun` — 590 behind
- [ ] `feat/passthrough-single-key` — 36 behind (has stale worktree)
- [ ] `feat/tab-tests` — 222 behind
- [ ] `feat/verify-script` — 232 behind
- [ ] `fix-docker-coverage` — 145 behind
- [ ] `fix-playwright-keymapping` — 20 behind (has stale worktree)
- [ ] `jsts` — 70 behind (has stale worktree)
- [ ] `probe-sa-omnibar` — 51 behind
- [ ] `probe-sa-visual` — 51 behind
- [ ] `relevant-code-coverage` — 51 behind
- [ ] `tests/sa-batch1` — 48 behind
- [ ] `tests/sa-batch2` — 48 behind
- [ ] `tests/sa-batch3` — 48 behind
- [ ] `tests/sa-batch4` — 48 behind
- [ ] `upstream-sync` — 348 behind (has stale worktree)
- [ ] `worktree-agent-a75ed429` — 205 behind (paired agent branch, no unique commits)

## Action Items

- [ ] Remove 5 stale worktrees: `deepseek-playwright`, `fix-playwright-keymapping`, `jsts`, `feat/passthrough-single-key`, `upstream-sync`
- [ ] Delete stale branches listed above (all 0 ahead of master)
- [ ] Decide on `bookmarks` — rebase onto master and continue, or close
- [ ] Decide on `worktree-agent-a1d93e15` TS migration — rebase onto master or discard

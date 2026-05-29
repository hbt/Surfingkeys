# Status

<!-- sections ordered by priority — stream.migration is #1, Bugs are last (blocked) -->

## stream.migration

> **Primary priority.** Blocking full switch from old Chrome + MV2 extension to new Chrome + MV3 extension. Must reach a usable daily-driver state before the switch is possible.

**Blockers (browser switch)**

| Item | File | Status |
|------|------|--------|
| Audit full list — identify blockers vs nice-to-have | [migration.md](migration.md#blockers-must-be-done-before-switching-browsers) | active |
| Port settings (hintAlign, focusAfterClosed, newTabPosition, theme…) | [migration.md](migration.md#settings-config-only--add-to-surfingkeysjs) | active |
| Resolve 5 key conflicts | [migration.md](migration.md#key-conflicts-to-resolve) | active |

**Chrome extensions ecosystem**

| Item | File | Status |
|------|------|--------|
| Inventory all extensions in old profile; identify MV2-only | [migration.md](migration.md#chrome-extensions-to-investigate) | active |
| PushBullet — MV3 version or replacement | [migration.md](migration.md#chrome-extensions-to-investigate) | active |
| Dark Reader — verify MV3 version works in new profile | [migration.md](migration.md#chrome-extensions-to-investigate) | active |
| Chrome dotfiles / custom NTP / other extensions | [migration.md](migration.md#chrome-extensions-to-investigate) | active |

**Commands backlog (100+ items)**

| Item | File | Status |
|------|------|--------|
| Yank / clipboard keys | [migration.md](migration.md#yank--clipboard-keys) | backlog |
| Paste / link-open keys | [migration.md](migration.md#paste--link-open-keys) | backlog |
| Tab management keys | [migration.md](migration.md#tab-management-keys) | backlog |
| Download keys | [migration.md](migration.md#download-keys) | backlog |
| Omnibar / search / nav keys | [migration.md](migration.md#omnibar--search--nav-keys) | backlog |
| Domain-specific configs | [migration.md](migration.md#domain-specific-configs-add-to-surfingkeysjs) | backlog |
| Other features | [migration.md](migration.md#other-features) | backlog |

---

## stream.coding-agents

Improving agent-navigability: CLAUDE.md accuracy, docs/ structure, slash command coverage.
Prerequisite for bug work — devtools + scratch patterns must mature before ACE/neovim bugs can be investigated.

| Item | File | Status |
|------|------|--------|
| `cce todo list` cwd auto-scoping (cce todo #129) | [features/coding-agents.md](features/coding-agents.md#0-cce-todo-integration) | blocked/cce |
| Review + update CLAUDE.md files | [features/coding-agents.md](features/coding-agents.md) | planned |
| Move generated docs → docs/gen/, .gitignore | [features/coding-agents.md](features/coding-agents.md) | planned |
| Create docs/llm/ for agent-navigable project knowledge | [features/coding-agents.md](features/coding-agents.md) | planned |
| Audit + gap-fill .claude/commands/ slash commands | [features/coding-agents.md](features/coding-agents.md) | planned |
| Design bug workflow process + `/bug` slash command | [features/coding-agents.md](features/coding-agents.md#4-bug-workflow-process) | planned |

---

## stream.testing

CI is part of this stream. Goal: standardize patterns, enforce coverage, give coding agents a stable surface.

**Standardization**

| Item | File | Status |
|------|------|--------|
| Playwright linters Phase 2–7 | [add-playwright-linters.md](add-playwright-linters.md) | active |
| invokeCommand → mapcmdkey (165 specs) | [fix-invokecommand-calls.md](fix-invokecommand-calls.md) | active |

**Coverage**

| Item | File | Status |
|------|------|--------|
| Fix 5 zero-coverage tests | [fix-no-coverage-tests.md](fix-no-coverage-tests.md) | active |
| Improve 9 low-coverage tests (21–26%) | [review-coverage-test.md](review-coverage-test.md) | active |
| Enable coverage collection in CI | [enhance-ci.md](enhance-ci.md#3-coverage-in-ci) | planned |

**Incognito**

| Item | File | Status |
|------|------|--------|
| Extend incognito coverage to all incognito commands | [enhance-ci.md](enhance-ci.md#5-incognito-test-coverage) | planned |

**CI infrastructure**

| Item | File | Status |
|------|------|--------|
| Pre-commit vs CI split (keep pre-commit fast) | [enhance-ci.md](enhance-ci.md#1-pre-commit-vs-ci-split) | active |
| Refactor `ci.ts`; standardize to JUnit XML; evaluate existing CI tools | [enhance-ci.md](enhance-ci.md#2-ci-infrastructure) | planned |
| Deduplicate `buildReport()` in verify.ts | [enhance-ci.md](enhance-ci.md#7-buildreport-deduplication-quick-win) | planned |

**Visibility**

| Item | File | Status |
|------|------|--------|
| Track excluded/skipped tests; surface count in CI report | [enhance-ci.md](enhance-ci.md#4-excluded--skipped-tests-tracking) | planned |
| CI + testing dashboard (pass rate, coverage, flaky, exclusions) | [enhance-ci.md](enhance-ci.md#6-ci--testing-dashboard) | planned |
| Agent dispatch on CI failure → worktree fix branch | [enhance-ci.md](enhance-ci.md#6-ci--testing-dashboard) | planned |

---

## stream.typescript

Background/incremental — can run in parallel with higher-priority streams.

| Item | File | Status |
|------|------|--------|
| Strict rules Phase 2 (6 rules) | [features/jsts-phase2.md](features/jsts-phase2.md) | planned |

---

## stream.infrastructure

| Item | File | Status |
|------|------|--------|
| Branch + worktree cleanup | [cleanup-branches.md](cleanup-branches.md) | active |
| Automate server startup at boot | [features/dev-tooling.md](features/dev-tooling.md) | planned |

---

## stream.settings

Linters done (5 rules). Helpers done. 3 specs exist. Gap: most settings have no dedicated spec.

| Item | File | Status |
|------|------|--------|
| Expand test coverage — inventory all settings, write missing specs | [enhance-settings.md](enhance-settings.md#settings-test-coverage-expansion) | active |
| Migrate existing 3 specs to `withPersistedDualCoverage` | [enhance-settings.md](enhance-settings.md#settings-test-coverage-expansion) | active |
| Fix/promote `setting-show-tab-indices` from scratch | [enhance-settings.md](enhance-settings.md#settings-test-coverage-expansion) | active |
| Resolve scratch `sw-restart-loses-settings` (bug fixed — promote or delete?) | [enhance-settings.md](enhance-settings.md#settings-test-coverage-expansion) | active |
| Resolve duplicate `features/digit-repeat.spec.ts` | [enhance-settings.md](enhance-settings.md#settings-test-coverage-expansion) | active |
| `newTabUrl` → generalize `persistentSettingKeys` registry | [enhance-settings.md](enhance-settings.md) | planned |
| Untyped settings flow → schema validation at storage boundary | [enhance-settings.md](enhance-settings.md) | planned |

---

## Features (new)

| Item | File | Status |
|------|------|--------|
| Marks system redesign (3-tier) | [features/marks.md](features/marks.md) | planned |
| Hint command system (`c` prefix) | [features/hint-command-system.md](features/hint-command-system.md) | planned |

---

## Bugs

> **Blocked on infrastructure.** ACE/neovim bugs require probing editor popup state — not reliably possible without better devtools + scratch test patterns for UI commands. Investigate after `stream.coding-agents` devtools work matures.

| Item | File | Status |
|------|------|--------|
| ACE editor broken (pre-fill + save) | [bugs/cmd-insert-vim-editor-ace-broken.md](bugs/cmd-insert-vim-editor-ace-broken.md) | blocked |
| Neovim editor fires-once — secondary issue | [bugs/cmd-insert-neovim-editor-fires-once.md](bugs/cmd-insert-neovim-editor-fires-once.md) | blocked |

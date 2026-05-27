# bookmark-folder-commands

Port the archive fork's named bookmark folder system into the current fork as proper
extension commands with `unique_id`s, RUNTIME handlers, and Playwright tests.

Branch: `bookmarks` — commit `7ca13fd` — marked BROKEN.

---

## Phase 1 — Fix verify failures (unblock build)

- [x] Remove all 7 `mapkey('')` stubs from `src/content_scripts/common/commands/settings.ts`
  - Triggered `annotations.empty_key` (7 violations)
- [x] Run `npm run verify` — expect 0 failures

## Phase 2 — Write + run Playwright tests

Tests target the SW directly — no key bindings needed to run them.

Setup pattern: create test folder via `sw.evaluate(() => chrome.bookmarks.create(...))`
Cleanup: `afterEach` removes test folder via `chrome.bookmarks.search` + `removeTree`
Verify: `sw.evaluate(() => chrome.bookmarks.getChildren(...))` after command

- [ ] `cmd-bookmark-toggle-folder` — adds URL; pressing again removes it
- [ ] `cmd-bookmark-copy-folder` — ordered, reversed, repeats limit
- [ ] `cmd-bookmark-empty-folder` — empties populated folder; no-op on empty
- [ ] `cmd-bookmark-add-m` — adds tab, skips duplicate
- [ ] `cmd-bookmark-remove-m` — removes bookmarked tab; no-op if not present
- [ ] `cmd-bookmark-cut-folder` — cuts 1 reversed + backs up to clipboard
- [ ] `cmd-bookmark-lookup-url` — finds folder names containing current URL

```bash
bunx playwright test tests/playwright/commands/cmd-bookmark-
COVERAGE=true bunx playwright test tests/playwright/commands/cmd-bookmark-
```

## Phase 3 — TypeScript quality + types

Review `src/background/start.ts` handlers (lines 2406–2575) for type safety and correctness.

- [ ] Define a `BookmarkMsg` interface (extends `Msg`) with `folder`, `reverse?`, `repeats?`, `magic?`
  - Replace `message: Msg` casts throughout bookmark handlers
- [ ] `bookmarkCutFromFolder` — remove `(self.bookmarkCopyFolder as ...)()` cast if possible;
  type `self` entries properly or extract helper
- [ ] `bookmarkLookupCurrentURL` — verify `_response()` / `sendResponse` path is always called
  (async + `needResponse` must be satisfied on every code path)
- [ ] `_deepPluck` — tighten return type and recursive type guard
- [ ] Run `npm run verify` — 0 failures after changes

## Phase 4 — Wire keys in settings.ts

> **Constraint:** `RUNTIME` is a TS import — not available in user config files.
> `bmapping` loop must live in `settings.ts`, not in `~/.surfingkeys-2026.js`.

> **unique_id count:** 8 folders × 8 actions = ~64 unique_ids, each mapping to one of 7 RUNTIME handlers.

- [ ] Add `bmapping` loop to `src/content_scripts/common/commands/settings.ts`
  - Folders: `m r w l L W R g` (+ digits `0–9` optional)
  - 8 key patterns per folder: `b bY by Bc BC B! Ba Br`
  - Pattern: `mapkey(key, { short, unique_id: \`cmd_bookmark_toggle_folder_${key}\`, feature_group: 14 }, () => RUNTIME(...))`
  - repeats: pass as `(RUNTIME as any).repeats` — no `|| 1` fallback
- [ ] `bL` for `bookmarkLookupCurrentURL` — `LL` conflicts with `L` (cmd_hints_regional)
- [ ] Clean up dead commented block in `~/.surfingkeys-2026.js` (lines 544–576)
- [ ] Build + reload: `npm run build:dev`, manual reload in gchrb
- [ ] Smoke test: press `bm` on any page → check `chrome://bookmarks/` for "morning" folder

## Phase 5 — Regression + commit

- [ ] `npm run test:playwright:parallel` — 0 unexpected failures (4 known Docker skips OK)
- [ ] `npm run verify` — all 5 checks green
- [ ] Commit: `[feat] Add bookmark folder commands (7 handlers + tests)`

---

## Gotchas

| Issue | Detail |
|-------|--------|
| `repeats` — no `\|\| 1` fallback | Use `message.repeats as number` bare — CLAUDE.md rule |
| `bookmarkCutFromFolder` self-call cast | Calls `self.bookmarkCopyFolder` which is typed `unknown` — cast required |
| Folder creation `parentId: "1"` | Must create missing folders under Bookmarks Bar, not root |
| `bookmarkLookupCurrentURL` must call `sendResponse` | Uses `needResponse` — async; every code path must call it or message hangs |
| `mapkey('')` stubs | Triggers `annotations.empty_key` — never register empty-key stubs |
| `LL` key conflict | `L` → `cmd_hints_regional` blocks `LL` — use `bL` |
| `RUNTIME` not in config files | It's a TS import — config `api.mapkey` callbacks can only call `api.*` |

---

## Reference

| File | Status |
|------|--------|
| `src/background/start.ts` | ✅ Handlers implemented (lines 2406–2575) |
| `src/content_scripts/common/commands/settings.ts` | ✅ Empty-key stubs removed — ❌ bmapping loop missing (Phase 4) |
| `tests/playwright/commands/cmd-bookmark-*.spec.ts` | ❌ Removed — recreate in Phase 2 |
| `/home/hassen/.surfingkeys-2026.js` | ⚠️ Dead commented block (lines 544–576) — clean up in Phase 4 |

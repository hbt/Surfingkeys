# bookmark-folder-commands

Port the archive fork's named bookmark folder system into the current fork as proper
extension commands with `unique_id`s, RUNTIME handlers, and Playwright tests.

Branch: `bookmarks`

---

## Phase 1 — Fix verify failures (unblock build)

- [x] Remove all 7 `mapkey('')` stubs from `src/content_scripts/common/commands/settings.ts`
  - Triggered `annotations.empty_key` (7 violations)
- [x] Run `npm run verify` — expect 0 failures

## Phase 2 — Write + run Playwright tests

Tests use keyboard dispatch (`page.keyboard.press`) + `callSKApi` + `setConf` via `__sk_conf_override`.

- [x] `cmd-bookmark-toggle-folder` — adds URL; round-trip (add → remove via two toggles); title strip verified
  - `tests/playwright/commands/cmd-bookmark-toggle-folder.key.spec.ts` — 3/3 pass
- [ ] `cmd-bookmark-copy-folder` — ordered, reversed, repeats limit
- [ ] `cmd-bookmark-empty-folder` — empties populated folder; no-op on empty
- [ ] `cmd-bookmark-add-m` — adds tab, skips duplicate; repeats adds N tabs
- [ ] `cmd-bookmark-remove-m` — removes bookmarked tab; no-op if not present; repeats removes N tabs
- [ ] `cmd-bookmark-cut-folder` — cuts N items (repeats); backs up to clipboard
- [ ] `cmd-bookmark-lookup-url` — finds folder names containing current URL

```bash
bunx playwright test tests/playwright/commands/cmd-bookmark-
COVERAGE=true bunx playwright test tests/playwright/commands/cmd-bookmark-
```

## Phase 3 — TypeScript quality + types

Review `src/background/start.ts` handlers (lines 2406–2575) for type safety and correctness.

- [x] `bookmarkToggleFolder` — added to `NamedAction` union in `@types/surfingkeys.d.ts`
- [x] `bookmarkToggleFolder` — replaced `message.folder as string` with `const { folder } = message as Msg & { folder: string }`
- [x] `bookmarkToggleFolder` — replaced `sender.tab!` non-null assertions with guard + early return
- [ ] Define a `BookmarkMsg` interface (extends `Msg`) with `folder`, `reverse?`, `repeats?`, `magic?`
  - Apply pattern to remaining bookmark handlers
- [ ] `bookmarkCutFromFolder` — remove `|| 1` fallback on `message.repeats` (line ~2548; violates no-fallback rule)
- [ ] `bookmarkCutFromFolder` — remove `(self.bookmarkCopyFolder as ...)()` cast if possible;
  type `self` entries properly or extract helper
- [ ] `bookmarkLookupCurrentURL` — verify `_response()` / `sendResponse` path is always called
  (async + `needResponse` must be satisfied on every code path)
- [ ] `_deepPluck` — tighten return type and recursive type guard
- [ ] Run `npm run verify` — 0 failures after changes

## Phase 4 — Wire keys (pending-key design)

> **Design change:** Per-folder unique_ids rejected. One static unique_id per action type.
> Folder resolved at runtime from `settings.bookmarkFolders` via pending-key capture.
> User presses `b` → pending-key mode → next key looked up in `runtime.conf.bookmarkFolders`.

- [x] `cmd_bookmark_toggle_folder` — registered in `settings.ts` with `function(key)` pending-key handler
- [x] `settings.bookmarkFolders?: Record<string, string>` added to `SurfingKeysConf`
- [x] `bookmarkFolders: undefined` added to `runtime.conf` defaults (enables `__sk_conf_override` in tests)
- [x] User config wired: `settings.bookmarkFolders = bmapping` + `api.mapcmdkey('b', 'cmd_bookmark_toggle_folder')`
- [ ] Register remaining action commands in `settings.ts` using same pending-key pattern:
  - `cmd_bookmark_copy_folder` (key `by` / `bY`)
  - `cmd_bookmark_cut_folder` (key `Bc` / `BC`)
  - `cmd_bookmark_empty_folder` (key `B!`)
  - `cmd_bookmark_add_m` (key `Ba`)
  - `cmd_bookmark_remove_m` (key `Br`)
  - `cmd_bookmark_lookup_url` (key `bl`)
- [ ] Wire each in user config via `api.mapcmdkey`
- [ ] Clean up dead commented block in `~/.surfingkeys-2026.js` (lines ~554–578)
- [ ] Build + reload: `npm run build:dev`, manual reload in gchrb
- [ ] Smoke test: press `b` then `m` on any page → banner "Added to [morning]" → check `chrome://bookmarks/`

## Phase 5 — UX polish (toggle command done as reference)

- [x] `bookmarkToggleFolder` — strip `[N] ` tab-index prefix from bookmark title
- [x] `bookmarkToggleFolder` — show banner feedback: `Added to [folder]` / `Removed from [folder]`
- [ ] Apply same title-strip + banner pattern to all other bookmark handlers

## Phase 6 — Regression + commit

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
| Pending-key: `invokeCommand` won't work | `cmd.code()` called with no args — `key` is `undefined`; use keyboard dispatch in tests |
| `__sk_conf_override` needs `hasOwnProperty` | Field must exist in `runtime.conf` defaults; `bookmarkFolders: undefined` added for this |
| Tab-index prefix `[N] ` | Content script prepends to `document.title`; strip with `/^\[\d+\] /` before bookmarking |

---

## Reference

| File | Status |
|------|--------|
| `src/background/start.ts` | ✅ Handlers implemented (lines 2406–2575) |
| `src/content_scripts/common/commands/settings.ts` | ✅ `cmd_bookmark_toggle_folder` registered (pending-key) — ❌ other 6 actions missing |
| `@types/surfingkeys.d.ts` | ✅ `bookmarkFolders` in `SurfingKeysConf`; `bookmarkToggleFolder` in `NamedAction` |
| `src/content_scripts/common/runtime.ts` | ✅ `bookmarkFolders: undefined` in conf defaults |
| `tests/playwright/commands/cmd-bookmark-toggle-folder.key.spec.ts` | ✅ 3/3 pass |
| `tests/playwright/commands/cmd-bookmark-*.spec.ts` | ❌ Remaining 6 commands untested |
| `/home/hassen/.surfingkeys-2026.js` | ✅ `bookmarkFolders` + `mapcmdkey('b', ...)` — ⚠️ dead commented block ~554–578 |

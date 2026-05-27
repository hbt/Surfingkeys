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
- [x] `cmd-bookmark-copy-folder` — ordered, reversed, repeats limit
  - `cmd-bookmark-copy-folder-reversed.key.spec.ts` + `cmd-bookmark-copy-folder-ordered.key.spec.ts`
- [x] `cmd-bookmark-empty-folder` — empties populated folder; no-op on empty
  - `cmd-bookmark-empty-folder.key.spec.ts`
- [x] `cmd-bookmark-add-m` — adds tab, skips duplicate; DirectionRight adds all right tabs
  - `cmd-bookmark-add-m.key.spec.ts` — 3/3 pass (CurrentTab + DirectionRight + no-dup)
- [x] `cmd-bookmark-remove-m` — removes bookmarked tab; no-op if not present; DirectionRight removes all right tabs
  - `cmd-bookmark-remove-m.key.spec.ts` — 3/3 pass (CurrentTab + DirectionRight + no-op)
- [x] `cmd-bookmark-cut-folder` — cuts N items (repeats); backs up to clipboard
  - `cmd-bookmark-cut-folder-reversed.key.spec.ts` + `cmd-bookmark-cut-folder-ordered.key.spec.ts`
- [x] `cmd-bookmark-lookup-url` — finds folder names containing current URL
  - `cmd-bookmark-lookup-url.spec.ts`

```bash
bunx playwright test tests/playwright/commands/cmd-bookmark-
COVERAGE=true bunx playwright test tests/playwright/commands/cmd-bookmark-
```

## Phase 3 — TypeScript quality + types

Review `src/background/start.ts` handlers (lines 2406–2575) for type safety and correctness.

- [x] `bookmarkToggleFolder` — added to `NamedAction` union in `@types/surfingkeys.d.ts`
- [x] `bookmarkToggleFolder` — replaced `message.folder as string` with `const { folder } = message as Msg & { folder: string }`
- [x] `bookmarkToggleFolder` — replaced `sender.tab!` non-null assertions with guard + early return
- [x] Define `BookmarkMsg` interface (`folder`, `reverse?`, `repeats?`, `magic?`) in `@types/surfingkeys.d.ts`
  - Applied via `BMsg = Msg & BookmarkMsg` alias to all 6 bookmark handlers; all manual casts removed
- [x] `bookmarkCutFromFolder` — removed `|| 1` / `Math.max` fallback; bare `message.repeats as number`
- [x] `bookmarkCutFromFolder` — extracted `_copyFolderURLs()` helper; `(self.bookmarkCopyFolder as Function)()` cast gone
- [x] `bookmarkLookupCurrentURL` — both code paths call `_response`; no fix needed
- [x] `_deepPluck` — tightened: `typeof val === 'string'` guard, removed redundant `key in o`, explicit `: unknown` annotations
- [x] `npm run verify` — all checks pass (pre-existing mappings prefix conflict unchanged)

## Phase 4 — Wire keys (pending-key design)

> **Design change:** Per-folder unique_ids rejected. One static unique_id per action type.
> Folder resolved at runtime from `settings.bookmarkFolders` via pending-key capture.
> User presses `b` → pending-key mode → next key looked up in `runtime.conf.bookmarkFolders`.

- [x] `cmd_bookmark_toggle_folder` — registered in `settings.ts` with `function(key)` pending-key handler
- [x] `settings.bookmarkFolders?: Record<string, string>` added to `SurfingKeysConf`
- [x] `bookmarkFolders: undefined` added to `runtime.conf` defaults (enables `__sk_conf_override` in tests)
- [x] `mode.ts` — chained pending-key support: handler can re-set `this.pendingMap` during execution to chain a 2nd key capture (backward-compatible)
- [x] `settings.bookmarkMagicKeys?: Record<string, string>` added to `SurfingKeysConf`
- [x] `bookmarkMagicKeys` default config added to `runtime.conf` (13 direction mappings)
- [x] All commands registered in `settings.ts`:
  - `cmd_bookmark_copy_folder_reversed` / `cmd_bookmark_copy_folder_ordered` (single-stage)
  - `cmd_bookmark_cut_folder_reversed` / `cmd_bookmark_cut_folder_ordered` (single-stage)
  - `cmd_bookmark_empty_folder` (single-stage)
  - `cmd_bookmark_lookup_url` (single-stage)
  - `cmd_bookmark_add_m` (2-stage: folder key → magic key)
  - `cmd_bookmark_remove_m` (2-stage: folder key → magic key)
- [x] User config wired — all `api.mapcmdkey` mappings set:
  - `bt` → toggle, `B!` → empty, `LL` → lookup
  - `by` / `bY` → copy reversed / ordered
  - `ba` / `br` → add_m / remove_m
  - `bc` / `bC` → cut reversed / ordered
- [x] `settings.bookmarkMagicKeys` added to `/home/hassen/.surfingkeys-2026.js`
- [x] No dead commented block — lines ~554–578 are the active `bookmarkMagicKeys` + `mapcmdkey` config
- [ ] Build + reload: `npm run build:dev`, manual reload in gchrb
- [ ] Smoke test: press `ba` then `m` then `t` on any page → banner "Added to [morning]" → check `chrome://bookmarks/`

## Phase 5 — UX polish ✅

- [x] `bookmarkToggleFolder` — strip `[N] ` tab-index prefix from bookmark title
- [x] `bookmarkToggleFolder` — show banner feedback: `Added to [folder]` / `Removed from [folder]`
- [x] All other handlers have banner feedback (copy, empty, add, remove, cut)
- [x] `bookmarkLookupCurrentURL` — uses `showPopup` (correct: returns query data, not fire-and-forget)

## ~~Phase 6 — Regression + commit~~ (skipped — redundant with subagent verify run)

---

## Gotchas

| Issue | Detail |
|-------|--------|
| `repeats` — no `\|\| 1` fallback | Use `message.repeats as number` bare — CLAUDE.md rule |
| `bookmarkCutFromFolder` self-call cast | Calls `self.bookmarkCopyFolder` which is typed `unknown` — cast required |
| Folder creation `parentId: "1"` | Must create missing folders under Bookmarks Bar, not root |
| `bookmarkLookupCurrentURL` must call `sendResponse` | Uses `needResponse` — async; every code path must call it or message hangs |
| `mapkey('')` stubs | Triggers `annotations.empty_key` — never register empty-key stubs |
| `LL` key conflict | `L` → `cmd_hints_regional` may block `LL` — verify in browser |
| `RUNTIME` not in config files | It's a TS import — config `api.mapkey` callbacks can only call `api.*` |
| Pending-key: `invokeCommand` won't work | `cmd.code()` called with no args — `key` is `undefined`; use keyboard dispatch in tests |
| `__sk_conf_override` needs `hasOwnProperty` | Field must exist in `runtime.conf` defaults; `bookmarkFolders: undefined` added for this |
| Tab-index prefix `[N] ` | Content script prepends to `document.title`; strip with `/^\[\d+\] /` before bookmarking |
| 3-key chained pending | `mode.ts` clears `pendingMap` before calling handler, checks if re-set; `add_m`/`remove_m` use this for folder→magic chain |

---

## Reference

| File | Status |
|------|--------|
| `src/background/start.ts` | ✅ All handlers implemented (lines 2406–2575) |
| `src/content_scripts/common/commands/settings.ts` | ✅ All 9 commands registered (add_m + remove_m are 2-stage) |
| `src/content_scripts/common/mode.ts` | ✅ Chained pending-key support added |
| `@types/surfingkeys.d.ts` | ✅ `bookmarkFolders` + `bookmarkMagicKeys` in `SurfingKeysConf`; `bookmarkToggleFolder` in `NamedAction` |
| `src/content_scripts/common/runtime.ts` | ✅ `bookmarkFolders: undefined` + `bookmarkMagicKeys` defaults in conf |
| `tests/playwright/commands/cmd-bookmark-*.spec.ts` | ✅ All 9 commands have tests |
| `/home/hassen/.surfingkeys-2026.js` | ✅ `bookmarkFolders` + `bookmarkMagicKeys` + all 9 `mapcmdkey` — ⚠️ dead commented block ~554–578 |

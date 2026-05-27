# fix-magic — cleanup after unified pending-key tab commands

Follow-up tasks after the additive pass in commit `e8666ea`.
New unified commands (`gX`, `gR`, `gY`, `gP`, `gD`) are live and tested.

**STATUS: ALL DONE** — closed in commits `62c66eb` → `cb14be2`.

---

## 1. Expand unified specs to full direction coverage ✅

- [x] `cmd-tab-reload-m.spec.ts` — 12 directions covered
- [x] `cmd-tab-copy-urls-m.spec.ts` — 13 directions covered
- [x] `cmd-tab-detach-m.spec.ts` — 12 directions covered
- [x] `cmd-tab-pin-m.spec.ts` — 13 directions covered

---

## 2. Delete legacy per-direction test specs ✅

All 44 legacy specs deleted (13 close + 11 reload + 13 copy-urls + 20 detach/key).

---

## 3. Remove legacy explicit-direction mapkeys from tabs.ts ✅

49 mapkeys removed in `cb14be2`. `tabs.ts` shrunk from ~926 → ~377 lines.

---

## 4. Migrate bookmarkMagicKeys → magicKeys ✅

Done in `20edd04` — `bookmarkMagicKeys` removed from runtime defaults and
`settings.ts`; both `cmd_bookmark_add_m` and `cmd_bookmark_remove_m` use
`runtime.conf.magicKeys`.

---

## 5. Remove orphaned handlers from start.ts ✅

`bookmarkTabsMagic` and `unbookmarkTabsMagic` removed in `20edd04`.

---

## User config migration ✅

`.surfingkeys-2026.js` migrated in dotfiles commit `19827fa9`:
- `tc` → `cmd_tab_close_m` (pending-key)
- `td` → `cmd_tab_detach_m` (pending-key)
- `tr` → `cmd_tab_reload_m` (pending-key); old `trx` → `trc`
- `yt` → `cmd_tab_copy_urls_m` (pending-key)
- Bookmark folder bindings activated (`bt`, `B!`, `bL`, `by`, `bY`, `ba`, `br`, `bc`, `bC`)

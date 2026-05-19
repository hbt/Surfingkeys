# bookmark-folder-commands

Fix broken WIP implementation and bring bookmark folder commands to shippable state.

Branch: `bookmarks` — commit `7ca13fd` — marked BROKEN.

---

## Phase 1 — Fix verify failures (unblock build)

- [x] Remove all 7 `mapkey('')` stubs from `src/content_scripts/common/commands/settings.ts`
  - These triggered `annotations.empty_key` (7 violations) — keys are config-side only
  - The `unique_id`s are registered via `api.mapcmdkey()` in the config loop
- [x] Run `npm run verify` — expect 0 failures

## Phase 2 — Wire config

- [ ] Add `bmapping` loop to `/home/hassen/.surfingkeys-2026.js` (see `plan.md` §1.4)
  - 8 folders: `m r w l L W R g` + digits `0–9`
  - 8 key patterns per folder: `b bY by Bc BC B! Ba Br`
- [ ] Use `bL` (not `LL`) for `bookmarkLookupCurrentURL` — `LL` conflicts with `L` (cmd_hints_regional)
- [ ] Reload extension in gchrb after config change
- [ ] Smoke test: press `bm` on any page → check `chrome://bookmarks/` for "morning" folder

## Phase 3 — Write + run Playwright tests

Test stubs were removed (caused `tests.invalid_files` — unique_ids not in settings.ts).
Re-create after Phase 2 (config wired, commands reachable via keys).

- [ ] Write + run `cmd-bookmark-toggle-folder` — adds + removes URL in folder
- [ ] Write + run `cmd-bookmark-copy-folder` — ordered, reversed, repeats limit
- [ ] Write + run `cmd-bookmark-empty-folder` — empties populated folder, no-op on empty
- [ ] Write + run `cmd-bookmark-add-m` — adds tab, skips duplicate
- [ ] Write + run `cmd-bookmark-remove-m` — removes bookmarked tab, no-op if not present
- [ ] Write + run `cmd-bookmark-cut-folder` — cuts 1 reversed + backs up to clipboard
- [ ] Write + run `cmd-bookmark-lookup-url` — finds folder names containing current URL

```bash
# Run all bookmark tests
bunx playwright test tests/playwright/commands/cmd-bookmark-

# With coverage
COVERAGE=true bunx playwright test tests/playwright/commands/cmd-bookmark-
```

## Phase 4 — Regression + commit

- [ ] `npm run test:playwright:parallel` — 0 unexpected failures (4 known Docker skips OK)
- [ ] `npm run verify` — all 5 checks green
- [ ] Commit: `[feat] Add bookmark folder commands (7 handlers + tests)`
- [ ] Remove `[wip] BROKEN` warning from commit message / branch description

---

## Reference

| File | Status |
|------|--------|
| `src/background/start.ts` | ✅ Handlers implemented (lines 2406–2575) |
| `src/content_scripts/common/commands/settings.ts` | ✅ Empty-key stubs removed |
| `tests/playwright/commands/cmd-bookmark-*.spec.ts` | ❌ Removed (broken stubs — recreate in Phase 3) |
| `/home/hassen/.surfingkeys-2026.js` | ❌ bmapping loop missing |

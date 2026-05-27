# fix-magic — cleanup after unified pending-key tab commands

Follow-up tasks after the additive pass in commit `e8666ea`.
New unified commands (`gX`, `gR`, `gY`, `gP`, `gD`) are live and tested.
This file tracks what to remove and expand before the branch can be closed.

---

## 1. Expand unified specs to full direction coverage

Each new `*-m` spec currently tests only a small subset. Expand to match what the legacy per-direction specs cover, then the legacy specs can be deleted.

- [ ] `cmd-tab-reload-m.spec.ts` — add all directions (currently only `gRt`); 11 legacy specs to absorb
- [ ] `cmd-tab-copy-urls-m.spec.ts` — add all directions (currently `gYt`, `gYa`); 12 legacy specs to absorb
- [ ] `cmd-tab-detach-m.spec.ts` — add all directions (currently only `gDt`); 20 legacy specs to absorb
- [ ] `cmd-tab-pin-m.spec.ts` — add all directions (currently `gPt` pin + toggle); no legacy specs exist

---

## 2. Delete legacy per-direction test specs

Only after the unified specs above fully cover each direction.

### cmd-tab-close-magic (13 specs — unified spec already covers all)
- [ ] `cmd-tab-close-magic-right.spec.ts`
- [ ] `cmd-tab-close-magic-right-inclusive.spec.ts`
- [ ] `cmd-tab-close-magic-left.spec.ts`
- [ ] `cmd-tab-close-magic-left-inclusive.spec.ts`
- [ ] `cmd-tab-close-magic-except-active.spec.ts`
- [ ] `cmd-tab-close-magic-all-window.spec.ts`
- [ ] `cmd-tab-close-magic-all-windows.spec.ts`
- [ ] `cmd-tab-close-magic-children.spec.ts`
- [ ] `cmd-tab-close-magic-children-recursive.spec.ts`
- [ ] `cmd-tab-close-magic-other-windows.spec.ts`
- [ ] `cmd-tab-close-magic-other-windows-no-pinned.spec.ts`
- [ ] `cmd-tab-close-current.spec.ts`
- [ ] `cmd-tab-close-magic-incognito.spec.ts` (already removed — skip)

### cmd-tab-reload-magic (11 specs)
- [ ] `cmd-tab-reload-magic-right.spec.ts`
- [ ] `cmd-tab-reload-magic-right-inclusive.spec.ts`
- [ ] `cmd-tab-reload-magic-left.spec.ts`
- [ ] `cmd-tab-reload-magic-left-inclusive.spec.ts`
- [ ] `cmd-tab-reload-magic-except-active.spec.ts`
- [ ] `cmd-tab-reload-magic-all-window.spec.ts`
- [ ] `cmd-tab-reload-magic-all-windows.spec.ts`
- [ ] `cmd-tab-reload-magic-children.spec.ts`
- [ ] `cmd-tab-reload-magic-children-recursive.spec.ts`
- [ ] `cmd-tab-reload-magic-other-windows.spec.ts`
- [ ] `cmd-tab-reload-magic-other-windows-no-pinned.spec.ts`

### cmd-tab-copy-urls-magic (12 specs)
- [ ] `cmd-tab-copy-urls-magic-current.spec.ts`
- [ ] `cmd-tab-copy-urls-magic-right.spec.ts`
- [ ] `cmd-tab-copy-urls-magic-right-inclusive.spec.ts`
- [ ] `cmd-tab-copy-urls-magic-left.spec.ts`
- [ ] `cmd-tab-copy-urls-magic-left-inclusive.spec.ts`
- [ ] `cmd-tab-copy-urls-magic-except-active.spec.ts`
- [ ] `cmd-tab-copy-urls-magic-all-window.spec.ts`
- [ ] `cmd-tab-copy-urls-magic-all-windows.spec.ts`
- [ ] `cmd-tab-copy-urls-magic-children.spec.ts`
- [ ] `cmd-tab-copy-urls-magic-children-recursive.spec.ts`
- [ ] `cmd-tab-copy-urls-magic-other-windows.spec.ts`
- [ ] `cmd-tab-copy-urls-magic-other-windows-no-pinned.spec.ts`

### cmd-tab-detach-magic (20 specs — 10 `.spec.ts` + 10 `.key.spec.ts`)
- [ ] `cmd-tab-detach-magic-right.spec.ts` + `.key.spec.ts`
- [ ] `cmd-tab-detach-magic-right-inclusive.spec.ts` + `.key.spec.ts`
- [ ] `cmd-tab-detach-magic-left.spec.ts` + `.key.spec.ts`
- [ ] `cmd-tab-detach-magic-left-inclusive.spec.ts` + `.key.spec.ts`
- [ ] `cmd-tab-detach-magic-except-active.spec.ts` + `.key.spec.ts`
- [ ] `cmd-tab-detach-magic-all-window.spec.ts` + `.key.spec.ts`
- [ ] `cmd-tab-detach-magic-children.spec.ts` + `.key.spec.ts`
- [ ] `cmd-tab-detach-magic-children-recursive.spec.ts` + `.key.spec.ts`
- [ ] `cmd-tab-detach-magic-other-windows.spec.ts` + `.key.spec.ts`
- [ ] `cmd-tab-detach-magic-other-windows-no-pinned.spec.ts` + `.key.spec.ts`

---

## 3. Remove legacy explicit-direction mapkeys from tabs.ts

After specs deleted and unified spec covers all directions. Remove all mapkeys marked with `TODO(hbt) NEXT [magic] remove`:

- [ ] 13 close mapkeys (`gxt`, `gxe`, `gxq`, and direction variants)
- [ ] 12 reload mapkeys
- [ ] 13 copy-urls mapkeys
- [ ] 11 detach mapkeys

---

## 4. Migrate bookmarkMagicKeys → magicKeys

- [ ] `runtime.ts` — remove `bookmarkMagicKeys` default; callers already use `magicKeys`
- [ ] `settings.ts` — switch `cmd_bookmark_add_m` and `cmd_bookmark_remove_m` to read `runtime.conf.magicKeys`
- [ ] Run bookmark regression tests after: `cmd-bookmark-add-m.key.spec.ts`, `cmd-bookmark-remove-m.key.spec.ts`

---

## 5. Remove orphaned handlers from start.ts

- [ ] `bookmarkTabsMagic` handler (no mapkey wired, line ~1558)
- [ ] `unbookmarkTabsMagic` handler (no mapkey wired, line ~1570)

---

## Verification (final gate before closing)

```bash
npm run build:dev
npm run test:playwright:parallel
bun scripts/mappings-json-report.ts --integrity
```

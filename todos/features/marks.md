# Marks — Feature Redesign

Migrate from the current single-tier mark system to a 3-tier system matching
vim conventions + tab workflow. Replace/extend `cmd_marks_add` / `cmd_marks_jump`.

## Reference

- Archive implementation: `surfingkeys-archive/content_scripts/hbt.js:987-1035`
  (`addVIMark2` / `jumpVIMark` — local per-site marks via `localStorage["sklocalMarks"]`)
- Current upstream: `src/content_scripts/common/normal.js:725-764`
  (all marks global, `''` toggles scroll element state — not site-aware)

---

## 1. Local page marks — `ma` / `'a` (lowercase a–z)

**Vim-like scroll-position marks scoped to the current page.**

- [ ] `ma` — saves `{ scrollLeft, scrollTop }` for the current page URL
  - Storage: `localStorage["sklocalMarks"][hostname+path][mark]`
  - No URL saved — these are intra-page position bookmarks only
- [ ] `'a` — jumps to saved scroll position on the current page
  - If no mark exists for this page: show banner "No local mark 'a' on this page"
- [ ] `''` — toggle between current scroll position and last visited position on this page
  - Archive behaviour: save current → jump to last, then swap (true toggle)
  - Replace current upstream behaviour (element-based toggle, not site-aware)
- [ ] Test: `cmd-marks-local-add.spec.ts`, `cmd-marks-local-jump.spec.ts`

---

## 2. Tab marks — `tma` / `t'a` (prefix `t` + lowercase a–z)

**Marks that point to a tab (by tab ID or URL snapshot).**

- [ ] `tma` — saves the current tab's URL as tab mark `a`
  - Storage: `chrome.storage.local["tabMarks"][mark]` = `{ url, title }`
  - Consider: store tab ID for fast switch, fall back to URL match if tab closed
- [ ] `t'a` — switches focus to the tab saved as mark `a`
  - If tab still open: `chrome.tabs.update(tabId, { active: true })`
  - If tab closed: open URL in new tab
  - Show banner if no tab mark exists
- [ ] `tom` — omnibar to fuzzy-pick from all tab marks (mirrors `om` for URL marks)
- [ ] Key registration: `tm` prefix mirrors tab-command convention (`tc`, `tr`, `td` etc.)
  - `api.mapcmdkey('tm', 'cmd_tab_marks_add')`   — but `tm` is taken (`cmd_tab_mute_toggle`)
  - Alternative prefix: `tM` or dedicated chord — **decide before implementing**
- [ ] Test: `cmd-tab-marks-add.spec.ts`, `cmd-tab-marks-jump.spec.ts`

---

## 3. Global URL marks — `mA` / `'A` (uppercase A–Z)

**Current upstream behaviour — keep as-is, just ensure config wires them up.**

- [x] `mA` — saves URL + `{ scrollLeft, scrollTop }` to `chrome.storage` (global, persists)
- [x] `'A` — switches to matching tab (or opens new tab) + restores scroll position
- [x] `<Ctrl-'>` A — jump to mark always in new tab
- [x] `om` — omnibar fuzzy-pick all global marks
- [ ] Test: `cmd-marks-add.spec.ts`, `cmd-marks-jump.spec.ts`, `cmd-marks-jump-new-tab.spec.ts`
  — confirm Playwright specs exist and pass

---

## Implementation order

1. **Local marks** (highest value, closest to vim muscle memory)
2. **`''` fix** (small, high-impact — restore archive site-aware toggle behaviour)
3. **Tab marks** (new feature — decide key prefix conflict first)
4. **Global marks** (already works — just tests + config)

---

## Key conflicts to resolve before implementing tab marks

| Key | Currently mapped to |
|-----|---------------------|
| `tm` | `cmd_tab_mute_toggle` |
| `tM` | free |
| `t'm` | free (chord: `t` `'` `m`) |

Recommended: use `tM` prefix for tab-mark set, `t'` prefix for tab-mark jump.
i.e. `tMa` = set tab mark a, `t'a` = jump to tab mark a.

# Migration: Archive → Master & Old Config → New Config

Tracking items from `.surfingkeys-2018.js` and `surfingkeys-archive` not yet in master / `.surfingkeysrc.js`.

**Goal:** complete this migration to fully switch from the old Chrome + old extension to the new Chrome + MV3 extension. Some items below are hard blockers for that switch; the rest are quality-of-life.

Reference plan: `/home/hassen/.claude/plans/glowing-popping-falcon.md`

---

## Blockers (must be done before switching browsers)

These are the items whose absence makes the new extension not usable as a daily driver.
Need a pass through the full list below to identify and move items here.

- [ ] **Audit the full list** — go through every section, mark items as `[blocker]` or `[nice-to-have]`; anything used daily or relied on for workflow goes in blockers
- [ ] **Settings** — at minimum `hintAlign`, `focusAfterClosed`, `newTabPosition`, `theme`, `interceptedErrors` (all config-only, quick)
- [ ] **Key conflicts** — resolve the 5 conflicts in the table below before porting those commands

---

## Chrome Extensions (to investigate)

Extensions currently used in the old browser that are MV2 or have no MV3 equivalent.
Need to decide: use MV3 version, replace with a surfingkeys command, or drop.

- [ ] **Inventory** — list all extensions installed in the old Chrome profile; identify which are MV2-only
- [ ] **PushBullet** — used for cross-device clipboard/notification; check if MV3 version exists or if a native alternative covers it; `opb` key in migration list
- [ ] **Dark Reader** — check MV3 status (it has an MV3 version as of v4.9+); verify it works in the new profile
- [ ] **Chrome dotfiles / custom NTP / other custom extensions** — inventory what exists; decide what to port, replace, or drop
- [ ] **For each extension with no MV3 equivalent** — decide: build a surfingkeys command, find an alternative, or accept the loss

---

## Settings (config-only — add to `.surfingkeysrc.js`)

- [ ] `settings.hintAlign = "left"` — default is `"center"` (`runtime.ts:81`)
- [ ] `settings.focusAfterClosed = "left"` — default is `"right"` (`start.ts:433`)
- [ ] `settings.newTabPosition = "right"` — default is `"default"` (`start.ts:435`)
- [ ] `settings.modeAfterYank = "Normal"` — default is `""` (`runtime.ts:87`)
- [ ] `settings.interceptedErrors = ["*"]` — default is `[]` (`start.ts:438`)
- [ ] `settings.theme` — restore custom CSS (font sizes, `sk_find` 20pt)
- [ ] `settings.prevLinkRegex` / `settings.nextLinkRegex` — restore custom regexes

---

## Yank / Clipboard Keys

- [ ] `ymd` — copy URL as markdown (config mapping, inline JS)
- [ ] `ymt` — copy title as markdown (config mapping, inline JS)
- [ ] `yw` — copy all URLs in current window (impl needed; `yY` does all tabs, not window-scoped)
- [ ] `yr` — readability via txtify.it (config mapping, inline redirect)
- [ ] `yD` — enable disabled elements on page (impl needed)
- [ ] `yI` — open Chrome inspector / debugger (impl needed)
- [ ] `yp` (old: copy page body inner text) — key conflict with `cmd_yank_form_post`; pick new key

---

## Paste / Link-Open Keys

- [ ] `pp` / `gv` — paste clipboard URL into current tab (impl needed)
- [ ] `of` / `nf` — open hinted link incognito (impl needed; `of` conflict with `cmd_markdown_open_file`)
- [ ] `nw` — open hinted link in new window (impl needed)
- [ ] `ysd` — focus element via hint (impl needed)
- [ ] `Ml` — linkify / make URLs clickable on page (impl needed)
- [ ] `<Ctrl-a>` — increment URL last path number (impl needed)
- [ ] `<Ctrl-x>` — decrement URL last path number (impl needed)

---

## Tab Management Keys

- [ ] `ts` / `tS` — suspend / unsuspend tab (impl needed; archive: `tabSuspendM` / `tabUnsuspendM`)
- [ ] `tR` — reverse tab order (impl needed; archive: `tabReverseM`)
- [ ] `t!u` — deduplicate tabs by URL (impl needed; archive: `tabUnique`)
- [ ] `tC` — show current tab index/position (impl needed; archive: `tabShowIndexPosition`)
- [ ] `tH` — toggle tab highlight (impl needed; archive: `tabToggleHighlight`)
- [ ] `th` — toggle tab highlight magic (impl needed; archive: `tabToggleHighlightM`)
- [ ] `t!h` — clear all tab highlights (impl needed; archive: `tabHighlightClearAll`)
- [ ] `tp` — move highlighted tabs (impl needed; archive: `tabMoveHighlighted`)
- [ ] `` t` `` — quick mark save tab (impl needed; archive: `tabQuickMarkSave`)
- [ ] `` ` `` — quick mark jump tab (impl needed; archive: `tabQuickMarkJump`)
- [ ] `WL` / `tL` — toggle pin all tabs across windows / in window (impl needed; archive: `tabTogglePinAll` / `windowsTogglePinAll`)
- [ ] `tb` / `tB` — print / capture tab screenshot (impl needed; archive: `tabPrintM` / `tabPageCaptureM`)
- [ ] `bv` — save YouTube playback position to bookmark (impl needed; archive: `bookmarkSaveYoutube`)
- [ ] `tyl{X}` / `tYl{X}` — create YouTube playlist from bookmark folder (impl needed)
- [ ] `b!O` — clear all output bookmark folders (impl needed)

---

## Download Keys

- [ ] `xl` — open last downloaded file (impl needed; archive: `downloadOpenLastFile`)
- [ ] `xs` — show last downloaded file in folder (impl needed; archive: `downloadShowLastFile`)

---

## Omnibar / Search / Nav Keys

- [ ] `cmap <Ctrl-j>` → `<Tab>` — omnibar forward nav (config only)
- [ ] `cmap <Ctrl-k>` → `<Shift-Tab>` — omnibar backward nav (config only)
- [ ] `os` — search Stackoverflow (config: `addSearchAliasX`)
- [ ] `oj` — search Javascript (config: `addSearchAliasX`)
- [ ] `ot` — search TypeScript (config: `addSearchAliasX`)
- [ ] `ou` — search Ubuntu (config: `addSearchAliasX`)
- [ ] `oG` — search Golang + GitHub (config: `addSearchAliasX`)
- [ ] `hg` alias — search GitHub Golang (config: `addSearchAliasX`)
- [ ] `d` alias — Google define (config: `addSearchAliasX`)
- [ ] `g` alias — Google Golang (config: `addSearchAliasX`)
- [ ] `l` alias — Google Laravel (config: `addSearchAliasX`)
- [ ] `G` alias — Google Golang GitHub (config: `addSearchAliasX`)
- [ ] `j` alias — Google Javascript (config: `addSearchAliasX`)
- [ ] `n` alias — Google NPM (config: `addSearchAliasX`)
- [ ] `s` alias — Google Stackoverflow (config: `addSearchAliasX`)
- [ ] `u` alias — Google Ubuntu (config: `addSearchAliasX`)
- [ ] `m` alias — Google IMDB Movie (config: `addSearchAliasX`)
- [ ] `ov` — toggle Google verbatim (impl needed)
- [ ] `S` (visual mode) — search selected text (key conflict: normal `S` = history back)
- [ ] `oi` search IMDB — key conflict with `cmd_nav_incognito`; pick new key
- [ ] `on` search NPM — key conflict with `cmd_tab_new`; pick new key
- [ ] `opb` — toggle PushBullet extension (low priority)

---

## Domain-Specific Configs (add to `.surfingkeysrc.js`)

- [ ] **GitHub** — `ge` edit issue, `gl` label issue, `disabledDomainKeys: ["s","w","j","k"]`
- [ ] **YouTube** — `yb` toggle speed, `>>` speed up, `<<` slow down, `yv` tldw, auto-unmute
- [ ] **ChatGPT** — custom `j/k/s/w` scrolling for main container
- [ ] **Wikipedia** — `;e` switch to English version
- [ ] **Google homepage** — custom `j/k/s/w` scrolling, fix image links, hide logo
- [ ] **Gmail** — `disabledDomainKeys: ["s","w","j","k","a","d"]`
- [ ] **Asana** — unmap `TAB, x, a, m, r, c`
- [ ] **BitBucket** — auto-redirect commit URLs to GitHub
- [ ] **Spotify** — auto-unmute on load
- [ ] **Netflix** — auto-unmute on load, unmap `[` `]`
- [ ] **PMR/hbtlabs** — `disabledDomainKeys: ["s"]`, `stealFocusOnLoad: false`
- [ ] **Recoll (localhost:8801)** — fix `file://` links to route through open-file proxy
- [ ] **CyberChef** — `<F8>` → Step key

---

## Other Features

- [ ] `startBannerService()` — interval-based banner display from `localStorage.sfk_banner`
- [ ] `usrc` / `gsrv` — open page source in gvim
- [ ] `uE` — edit URL in gvim (separate from Ace editor variant)
- [ ] `tlib()` — Z-Library auto-download (low priority)

---

## Key Conflicts to Resolve

| Old Key | Old Purpose | Taken By | unique_id |
|---------|------------|----------|-----------|
| `yp` | Copy page body inner text | Copy form data for POST | `cmd_yank_form_post` |
| `yd` | Yank text of element | Copy downloading URL | `cmd_yank_download_url` |
| `of` | Open hinted link incognito | Open local markdown file | `cmd_markdown_open_file` |
| `oi` | Search IMDB | Open incognito window | `cmd_nav_incognito` |
| `on` | Search NPM | Open new tab | `cmd_tab_new` |

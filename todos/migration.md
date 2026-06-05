# Migration: Archive → Master & Old Config → New Config

Tracking items from `.surfingkeys-2018.js` and `surfingkeys-archive` not yet in master / `.surfingkeysrc.js`.

**Goal:** complete this migration to fully switch from the old Chrome + old extension to the new Chrome + MV3 extension. Some items below are hard blockers for that switch; the rest are quality-of-life.

Reference plan: `/home/hassen/.claude/plans/glowing-popping-falcon.md`

---

## Blockers (must be done before switching browsers)

These are the items whose absence makes the new extension not usable as a daily driver.

- [x] **Audit the full list** — done: 3/7 settings done; rest of backlog is backlog
- [x] **Settings** — 3/7 done (hintAlign, focusAfterClosed, newTabPosition); 4 remaining marked [NTH]
- [ ] **Key conflicts** — resolve the 5 conflicts in the table below before porting those commands

---

## Chrome Extensions (to investigate)

Extensions currently used in the old browser that are MV2 or have no MV3 equivalent.
Need to decide: use MV3 version, replace with a surfingkeys command, or drop.

- [x] **Inventory** — list all extensions installed in the old Chrome profile; identify which are MV2-only
- [ ] **PushBullet** — used for cross-device clipboard/notification; check if MV3 version exists or if a native alternative covers it; `opb` key in migration list ref. /home/hassen/workspace/surfingkeys/plans/add-pushbullet-support-browser-to-android-viceversa-plan-missing.md and need plan for android to chrome browser or investigate pushbullet alternatives or hack something with termux. Although, i do need a push store when laptop is not active. 
- [x] **Dark Reader** — check MV3 status (it has an MV3 version as of v4.9+); verify it works in the new profile
- [x] **Chrome dotfiles / custom NTP / other custom extensions** — inventory what exists; decide what to port, replace, or drop
- [x] **For each extension with no MV3 equivalent** — decide: build a surfingkeys command, find an alternative, or accept the loss

---

## Settings (config-only — add to `.surfingkeysrc.js`)

- [x] `settings.hintAlign = "left"` — default is `"center"` (`runtime.ts:81`)
- [x] `settings.focusAfterClosed = "left"` — default is `"right"` (`start.ts:433`)
- [x] `settings.newTabPosition = "right"` — default is `"default"` (`start.ts:435`)
- [ ] `settings.modeAfterYank = "Normal"` — default is `""` (`runtime.ts:87`) [NTH]
- [ ] `settings.interceptedErrors = ["*"]` — default is `[]` (`start.ts:438`) [NTH]
- [ ] `settings.theme` — restore custom CSS (font sizes, `sk_find` 20pt) [NTH]
- [ ] `settings.prevLinkRegex` / `settings.nextLinkRegex` — restore custom regexes [NTH]

---

## Yank / Clipboard Keys (Built-in + Custom)

### Already Mapped ✓
- [x] `yy` → `cmd_yank_url` — copy current page URL
- [x] `yg` → `cmd_yank_screenshot` — capture screenshot
- [x] `ya` → `cmd_yank_link_url` — copy selected link URL
- [x] `<Ctrl-c>` → `cmd_yank_selection` — copy selected text

### Unmapped Built-in Yank Commands
**Query to update:** `bun scripts/mappings-json-report.ts | jq '.mappings.list[] | select(.annotation.unique_id | startswith("cmd_yank"))'`

- [ ] `cmd_yank_table_column` — `yc` — Copy all cells from selected table column
- [ ] `cmd_yank_download_url` — `yd` — Copy URLs of files being downloaded (conflicts with old `yd`)
- [ ] `cmd_yank_form_json` — `yf` — Copy form data as JSON
- [ ] `cmd_yank_host` — `yh` — Copy hostname of current page
- [ ] `cmd_yank_input_value` — `yi` — Copy value from selected input field
- [ ] `cmd_yank_settings` — `yj` — Copy current SurfingKeys settings as JSON
- [ ] `cmd_yank_title` — `yl` — Copy title of current page
- [ ] `cmd_yank_multiple_links` — `yma` — Copy URLs of multiple links (separate lines)
- [ ] `cmd_yank_table_columns` — `ymc` — Copy multiple table columns (tab-separated)
- [ ] `cmd_yank_multiple_elements` — `ymv` — Copy text from multiple elements (separate lines)
- [ ] `cmd_yank_form_post` — `yp` — Copy form data formatted for POST (conflicts with old `yp`)
- [ ] `cmd_yank_pre_text` — `yq` — Copy text from selected pre element
- [ ] `cmd_yank_query_history` — `yQ` — Copy all OmniQuery search history
- [ ] `cmd_yank_page_source` — `ys` — Copy HTML source code of current page
- [ ] `cmd_yank_element_text` — `yv` — Copy text content of selected element
- [ ] `cmd_yank_all_urls` — `yY` — Copy URLs of all open tabs (separate lines)

### Custom Yank Commands (from Archive)
- [ ] `ymd` — copy URL as markdown (config mapping, inline JS) ^4kp2mx
- [ ] `ymt` — copy title as markdown (config mapping, inline JS) ^9b3wr7
- [ ] `yw` — copy all URLs in current window (impl needed; `yY` does all tabs, not window-scoped) ^t5q8vn
- [ ] `yr` — readability via txtify.it (config mapping, inline redirect) ^m7x3np
- [ ] `yD` — enable disabled elements on page (impl needed) ^q8wr2k
- [x] `yI` — open Chrome inspector / debugger (impl needed) ^v5t9bz

---

## Paste / Link-Open Keys (Built-in + Custom)

### Already Mapped ✓
- [x] `cc` → `cmd_nav_open_clipboard` — open clipboard content as URL
- [x] `gv` → `cmd_nav_clipboard_navigate` — navigate to clipboard URL

### Unmapped Built-in Paste Commands
**Query to update:** `bun scripts/mappings-json-report.ts | jq '.mappings.list[] | select(.annotation.description | test("clipboard|paste"; "i"))'`

- [ ] `cmd_paste_proxy` — `;ap` — Apply proxy config from JSON in clipboard
- [ ] `cmd_proxy_copy_info` — `;cp` — Copy current proxy config to clipboard as JSON
- [ ] `cmd_paste_form` — `;pf` — Fill form fields with data from clipboard
- [ ] `cmd_paste_history` — `;ph` — Import browser history URLs from clipboard
- [ ] `cmd_paste_settings` — `;pj` — Restore SurfingKeys settings from JSON in clipboard
- [ ] `cmd_paste_html` — `;pp` — Replace current page content with HTML from clipboard (conflicts with URL convert `;pp`)
- [ ] `cmd_tools_yank_history` — `;yh` — Copy all browser history URLs to clipboard
- [ ] `cmd_markdown_copy_html` — `cc` — Copy generated HTML code from markdown preview (conflicts with `cc`)
- [ ] `cmd_tools_read_text` — `gr` — Read selected text or clipboard content aloud (TTS)

### Custom Paste/Link Commands (from Archive)
- [x] `pp` / `gv` — paste clipboard URL into current tab (impl needed) ^j6n8ht
- [x] `of` / `nf` / `tnf` — open hinted link incognito (impl needed; `of` conflict with `cmd_markdown_open_file`) ^r3p7dw
- [ ] `nw` — open hinted link in new window (impl needed) ^x4b6fy
- [ ] `ysd` — focus element via hint (impl needed) ^h9k2lq
- [x] `Ml` — linkify / make URLs clickable on page (impl needed) ^w7v5rc
- [ ] `<Ctrl-a>` — increment URL last path number (impl needed) ^s2t8mx
- [ ] `<Ctrl-x>` — decrement URL last path number (impl needed) ^a6n3pk

---

## Tab Management Keys

> **Magic variants note:** Adding direction-awareness (`*TabMagic` pattern) to a command is low-cost — "like adding a vector to a one-dimensional command." A previous analysis was too conservative about which commands should get magic variants. When porting each item below, explicitly decide: plain command only, or include magic variant? Default bias should be **include magic** unless there's a clear reason not to.

- [ ] `ts` / `tS` — suspend / unsuspend tab (impl needed; archive: `tabSuspendM` / `tabUnsuspendM`) ^c5r9wz
- [ ] `tR` — reverse tab order (impl needed; archive: `tabReverseM`) ^d8m4jb
- [ ] `t!u` — deduplicate tabs by URL (impl needed; archive: `tabUnique`) ^e3k7xn
- [ ] `tC` — show current tab index/position (impl needed; archive: `tabShowIndexPosition`) ^f6p2qt
- [ ] `tH` — toggle tab highlight (impl needed; archive: `tabToggleHighlight`) ^g9v5wr
- [ ] `th` — toggle tab highlight magic (impl needed; archive: `tabToggleHighlightM`) ^h4b8zc
- [ ] `t!h` — clear all tab highlights (impl needed; archive: `tabHighlightClearAll`) ^i7m3ks
- [ ] `tp` — move highlighted tabs (impl needed; archive: `tabMoveHighlighted`) ^j2x6ny
- [x] `` t` `` — quick mark save tab (impl needed; archive: `tabQuickMarkSave`) ^l5w9rd
- [x] `` ` `` — quick mark jump tab (impl needed; archive: `tabQuickMarkJump`) ^n8q4bp
- [ ] `WL` / `tL` — toggle pin all tabs across windows / in window (impl needed; archive: `tabTogglePinAll` / `windowsTogglePinAll`) ^o3t7mv
- [x] `tb` — print tab(s) via magic key (`cmd_tab_print_m`) ^p6k2hz
- [x] `tB` — capture tab screenshot (impl needed; archive: `tabPageCaptureM`) ^tB8m3kw
- [x] `bv` — save YouTube playback position to bookmark (impl needed; archive: `bookmarkSaveYoutube`) ^q9n5xw
- [x] `tyl{X}` / `tYl{X}` — create YouTube playlist from bookmark folder (impl needed) ^r4c8jt
- [x] `b!O` — clear all output bookmark folders (impl needed) ^s7v3pm

---

## Download Keys

- [x] `xl` — open last downloaded file (impl needed; archive: `downloadOpenLastFile`) ^t2b6qr
- [x] `xs` — show last downloaded file in folder (impl needed; archive: `downloadShowLastFile`) ^u5n9ck

---

## Omnibar / Search / Nav Keys

- [ ] `cmap <Ctrl-j>` → `<Tab>` — omnibar forward nav (config only) ^v8r4wz
- [ ] `cmap <Ctrl-k>` → `<Shift-Tab>` — omnibar backward nav (config only) ^w3m7xb
- [ ] `os` — search Stackoverflow (config: `addSearchAliasX`) ^a9k2nt
- [ ] `oj` — search Javascript (config: `addSearchAliasX`) ^b6p5rw
- [ ] `ot` — search TypeScript (config: `addSearchAliasX`) ^c4v8mz
- [ ] `ou` — search Ubuntu (config: `addSearchAliasX`) ^d7b3qx
- [ ] `oG` — search Golang + GitHub (config: `addSearchAliasX`) ^e2n6ks
- [ ] `hg` alias — search GitHub Golang (config: `addSearchAliasX`) ^f5t9pw
- [ ] `d` alias — Google define (config: `addSearchAliasX`) ^g8x4rc
- [ ] `g` alias — Google Golang (config: `addSearchAliasX`) ^h3m7vq
- [ ] `l` alias — Google Laravel (config: `addSearchAliasX`) ^i6k2nb
- [ ] `G` alias — Google Golang GitHub (config: `addSearchAliasX`) ^j9w5tp
- [ ] `j` alias — Google Javascript (config: `addSearchAliasX`) ^k4r8zc
- [ ] `n` alias — Google NPM (config: `addSearchAliasX`) ^l7v3mx
- [ ] `s` alias — Google Stackoverflow (config: `addSearchAliasX`) ^m2q6ks
- [ ] `u` alias — Google Ubuntu (config: `addSearchAliasX`) ^n5b9pw
- [ ] `m` alias — Google IMDB Movie (config: `addSearchAliasX`) ^o8t4rz
- [ ] `ov` — toggle Google verbatim (impl needed) ^p3n7xw
- [ ] `S` (visual mode) — search selected text (key conflict: normal `S` = history back) ^q6k2mb
- [ ] `oi` search IMDB — key conflict with `cmd_nav_incognito`; pick new key ^r9v5tq
- [ ] `on` search NPM — key conflict with `cmd_tab_new`; pick new key ^s4p8zx
- [ ] `opb` — toggle PushBullet extension (low priority) ^t7w3nk

---

## Domain-Specific Configs (add to `.surfingkeysrc.js`)

- [ ] **GitHub** — `ge` edit issue, `gl` label issue, `disabledDomainKeys: ["s","w","j","k"]` ^u2b6rv
- [ ] **YouTube** — `yb` toggle speed, `>>` speed up, `<<` slow down, `yv` tldw, auto-unmute ^v5m9kw
- [ ] **ChatGPT** — custom `j/k/s/w` scrolling for main container ^w8r4pz
- [ ] **Wikipedia** — `;e` switch to English version ^x3n7tb
- [ ] **Google homepage** — custom `j/k/s/w` scrolling, fix image links, hide logo ^y6k2qw
- [ ] **Gmail** — `disabledDomainKeys: ["s","w","j","k","a","d"]` ^z9p5rc
- [ ] **Asana** — unmap `TAB, x, a, m, r, c` ^a4v8mz
- [ ] **BitBucket** — auto-redirect commit URLs to GitHub ^b7t3xn
- [ ] **Spotify** — auto-unmute on load ^c2w6kp
- [ ] **Netflix** — auto-unmute on load, unmap `[` `]` ^d5r9bq
- [ ] **PMR/hbtlabs** — `disabledDomainKeys: ["s"]`, `stealFocusOnLoad: false` ^e8m4vz
- [ ] **Recoll (localhost:8801)** — fix `file://` links to route through open-file proxy ^f3b7tw
- [ ] **CyberChef** — `<F8>` → Step key ^g6p2kn

---

## Unmigrated Built-in Commands (Investigation Backlog)

These are built-in SurfingKeys commands from the mappings report that haven't been migrated to `.surfingkeysrc.js`. They may be useful to enable or can be left as defaults.

**Update this list:** `bun scripts/mappings-json-report.ts | jq '.mappings.list[] | select(.annotation.unique_id as $id | ["cmd_yank", "cmd_paste", "cmd_nav_open_clipboard", "cmd_markdown_copy_html", "cmd_tools_read_text", "cmd_tab_copy_urls_m", "cmd_yank_link_url", "cmd_yank_screenshot", "cmd_yank_selection"] | map(. as $prefix | $id | startswith($prefix)) | any | not)' | jq -r '[.annotation.unique_id, .key] | @csv'`

### Tab Commands (from `cmd_tab_*`, `cmd_close_tabs_*`)
- [ ] Audit which tab commands should be explicitly mapped vs. using defaults

### Hints Commands (from `cmd_hints_*`)
- [ ] Audit which hints commands should be explicitly mapped vs. using defaults

### Navigation Commands (from `cmd_nav_*`)
- [ ] `cmd_nav_reload` — `r` — Reload current tab (already mapped ✓)
- [ ] Audit other nav commands for coverage

### Omnibar Commands (from `cmd_omnibar_*`)
- [ ] Most are trigger commands with `o` prefix; audit coverage

### Visual Mode Commands (from `cmd_visual_*`)
- [ ] Audit which visual mode commands need explicit mapping

### Bookmark Commands (from `cmd_bookmark_*`)
- [ ] Several `cmd_bookmark_*` already mapped with `b`/`by`/`bY` etc.; audit coverage

### Tools/Utilities (from `cmd_tools_*`)
- [ ] `cmd_tools_increment_number_in_url` — `<Ctrl-a>` — increment URL number
- [ ] `cmd_tools_decrement_number_in_url` — `<Ctrl-x>` — decrement URL number
- [ ] Other tools commands to investigate

---

## Other Features

- [ ] `startBannerService()` — interval-based banner display from `localStorage.sfk_banner` ^h9v5rx
- [ ] `usrc` / `gsrv` — open page source in gvim ^i4m8wq
- [ ] `uE` — edit URL in gvim (separate from Ace editor variant) ^j7k3pz
- [ ] `tlib()` — Z-Library auto-download (low priority) ^k2n6bt

---

## Key Conflicts to Resolve

| Old Key | Old Purpose | Taken By | unique_id |
|---------|------------|----------|-----------|
| `yp` | Copy page body inner text | Copy form data for POST | `cmd_yank_form_post` |
| `yd` | Yank text of element | Copy downloading URL | `cmd_yank_download_url` |
| `of` | Open hinted link incognito | Open local markdown file | `cmd_markdown_open_file` |
| `oi` | Search IMDB | Open incognito window | `cmd_nav_incognito` |
| `on` | Search NPM | Open new tab | `cmd_tab_new` |

---

## References

^4kp2mx — `ymd`: archive `surfingskeysrc-config-example.js:166` (inline JS — `Clipboard.write("[" + document.location.href + "](" + window.location.href + ")")`). No master equivalent; closest `cmd_yank_url` (`yy`) copies URL only.

^9b3wr7 — `ymt`: archive `surfingskeysrc-config-example.js:169` (inline JS — `Clipboard.write("[" + document.title + "](" + window.location.href + ")")`). No master equivalent; closest `cmd_yank_title` (`yl`) copies title only.

^t5q8vn — `yw`: archive `surfingskeysrc-config-example.js:165` → content impl `content_scripts/hbt.js:391` → bg handler `bg.js:1850`. Master: `cmd_tab_copy_urls_m` (`yta` = AllInWindow) likely covers this; verify scope matches.

^m7x3np — `yr`: archive `.surfingkeys-2018.js:245-250` (inline JS — `window.location.href = "https://txtify.it/" + window.location.href`). No master equivalent.

^q8wr2k — `yD`: archive `.surfingkeys-2018.js:231-242` (inline JS — removes `disabled` and `readonly` attributes from all elements via `document.getElementsByTagName("*")`). No master equivalent.

^v5t9bz — `yI`: archive `.surfingkeys-2018.js:253` → `CustomCommands.hintOpenDebuggerInspector` → `content_scripts/hbt.js:741-765`. No master equivalent; closest `cmd_chrome_inspect` (`;i`) but different mechanism.

^k2m4cs — `yp`: archive `.surfingkeys-2018.js:220-222` (inline JS — `Clipboard.write(window.document.body.innerText)`). Key conflict with `cmd_yank_form_post`; needs new key.

^j6n8ht — `pp` / `gv`: archive `.surfingkeys-2018.js:285,288` → `CustomCommands.pasteFromClipboard` → `content_scripts/hbt.js:440-450`. Master: `cmd_nav_open_clipboard` (`cc`) covers this.

^r3p7dw — `of` / `nf`: archive `.surfingkeys-2018.js:254-255` → `CustomCommands.hintOpenLinkIncognito` → `content_scripts/hbt.js:622-626`. `of` conflicts with `cmd_markdown_open_file`; `nf` free. Master has `cmd_nav_open_link_incognito`.

^x4b6fy — `nw`: archive `.surfingkeys-2018.js:256` → `CustomCommands.hintOpenLinkNewWindow` → `content_scripts/hbt.js:628-632`. Master has `cmd_nav_open_link_new_window` (`nw`).

^h9k2lq — `ysd`: archive `.surfingkeys-2018.js:258` → `CustomCommands.hintFocusElement` → `content_scripts/hbt.js:767-771` (creates hints, calls `element.focus()`). No master equivalent.

^w7v5rc — `Ml`: archive `.surfingkeys-2018.js:484` → `CustomCommands.urlMake` → `content_scripts/hbt.js:1180-1182` (calls `linkifyElement(document.body)`). No master equivalent.

^s2t8mx — `<Ctrl-a>`: archive `.surfingkeys-2018.js:471` → `CustomCommands.urlIncrementLastPath` → `content_scripts/hbt.js:1184-1192` (calls `urlReplaceNumber2()`). Master: `cmd_tools_increment_number_in_url`.

^a6n3pk — `<Ctrl-x>`: archive `.surfingkeys-2018.js:472` → `CustomCommands.urlDecrementLastPath` → `content_scripts/hbt.js:1158-1166` (calls `urlReplaceNumber2()` with negative value). Master: `cmd_tools_decrement_number_in_url`.

^c5r9wz — `ts` / `tS`: archive `.surfingkeys-2018.js:380-381` → `CustomCommands.tabFixSuspended` / `tabUnsuspendM` → `content_scripts/hbt.js:1518,1529`. Note: `tS` was commented out in archive. No master equivalent.

^d8m4jb — `tR`: archive `.surfingkeys-2018.js:410` → `CustomCommands.tabReverseM` → `bg.js:1942` + `content_scripts/hbt.js:916`. No master equivalent.

^e3k7xn — `t!u`: archive `.surfingkeys-2018.js:411` → `CustomCommands.tabUnique` → `bg.js:1375`. No master equivalent.

^f6p2qt — `tC`: archive `.surfingkeys-2018.js:390` → `CustomCommands.tabShowIndexPosition` → `bg.js:1513`. No master equivalent.

^g9v5wr — `tH`: archive `.surfingkeys-2018.js:393` → `CustomCommands.tabToggleHighlight` → `bg.js:2025` + `content_scripts/hbt.js:944`. No master equivalent.

^h4b8zc — `th`: archive `.surfingkeys-2018.js:394` → `CustomCommands.tabToggleHighlightM` → `bg.js:1964` + `content_scripts/hbt.js:929`. No master equivalent.

^i7m3ks — `t!h`: archive `.surfingkeys-2018.js:395` → `CustomCommands.tabHighlightClearAll` → `bg.js:2060` + `content_scripts/hbt.js:966`. No master equivalent.

^j2x6ny — `tp`: archive `.surfingkeys-2018.js:396` → `CustomCommands.tabMoveHighlighted` → `bg.js:2041` + `content_scripts/hbt.js:957`. No master equivalent.

^l5w9rd — `` t` ``: archive `.surfingkeys-2018.js:399` → `CustomCommands.tabQuickMarkSave` → `bg.js:1557` + `content_scripts/hbt.js:1487`. No master equivalent.

^n8q4bp — `` ` ``: archive `.surfingkeys-2018.js:400` → `CustomCommands.tabQuickMarkJump` → `bg.js:1563` + `content_scripts/hbt.js:1492`. No master equivalent.

^o3t7mv — `WL` / `tL`: archive `.surfingkeys-2018.js:436-437` → `CustomCommands.tabTogglePinAll` / `windowsTogglePinAll` → `content_scripts/hbt.js:867,876`. No master equivalent.

^p6k2hz — `tb`: archive `.surfingkeys-2018.js:404` → `CustomCommands.tabPrintM` → `bg.js:2014` + `content_scripts/hbt.js:1474`. **Migrated** as `cmd_tab_print_m` (`g-022`); handler uses MV3 `chrome.scripting.executeScript` + `window.print()`.

^tB8m3kw — `tB`: archive `.surfingkeys-2018.js:405` → `CustomCommands.tabPageCaptureM` → `bg.js:1988` + `content_scripts/hbt.js:1461`. No master equivalent.

^q9n5xw — `bv`: archive `.surfingkeys-2018.js:951` → `CustomCommands.bookmarkSaveYoutube` → `bg.js:2207`. No master equivalent.

^r4c8jt — `tyl{X}` / `tYl{X}`: archive `.surfingkeys-2018.js:920,924` (dynamic mapkey loop over bookmark folder map) → `CustomCommands.createYoutubePlaylist` / `createYoutubePlaylistReversed`. No master equivalent.

^s7v3pm — `b!O`: archive `.surfingkeys-2018.js:942` (inline — `[...Array(10).keys()].forEach(nb => CustomCommands.bookmarkEmptyFolder(...))`). No master equivalent.

^t2b6qr — `xl`: archive `.surfingkeys-2018.js:850` → `CustomCommands.downloadOpenLastFile` → `bg.js:2146` + `content_scripts/hbt.js:1203`. No master equivalent.

^u5n9ck — `xs`: archive `.surfingkeys-2018.js:851` → `CustomCommands.downloadShowLastFile` → `bg.js:2125` + `content_scripts/hbt.js:1194`. No master equivalent.

^v8r4wz — `cmap <Ctrl-j>` → `<Tab>`: archive `.surfingkeys-2018.js:757` (inline — `cmap("<Ctrl-j>", "<Tab>")`). Config-only; no master equivalent.

^w3m7xb — `cmap <Ctrl-k>` → `<Shift-Tab>`: archive `.surfingkeys-2018.js:758` (inline — `cmap("<Ctrl-k>", "<Shift-Tab>")`). Config-only; no master equivalent.

^a9k2nt — `os`: archive `.surfingkeys-2018.js:689-699` (`addSearchAliasX`) + `.surfingkeys-2018.js:728` (`mapkey("os", ...)`). Master has `addSearchAlias('s', 'stackoverflow', ...)` but not `os` omnibar key.

^b6p5rw — `oj`: archive `.surfingkeys-2018.js:651-661` (`addSearchAliasX`) + `.surfingkeys-2018.js:731` (`mapkey("oj", "Search Javascript", ...)`). No master equivalent.

^c4v8mz — `ot`: archive `.surfingkeys-2018.js:603-613` (`addSearchAliasX`) + `.surfingkeys-2018.js:737` (`mapkey("ot", "Search typescript", ...)`). No master equivalent.

^d7b3qx — `ou`: archive `.surfingkeys-2018.js:700-710` (`addSearchAliasX`) + `.surfingkeys-2018.js:749` (`mapkey("ou", "Search Ubuntu", ...)`). No master equivalent.

^e2n6ks — `oG`: archive `.surfingkeys-2018.js:639-649` (`addSearchAliasX`) + `.surfingkeys-2018.js:743` (`mapkey("oG", "Search golang", ...)`). No master equivalent.

^f5t9pw — `hg`: archive `.surfingkeys-2018.js:578-588` (`addSearchAliasX`) + `.surfingkeys-2018.js:752` (`mapkey("ohg", "Search github golang", ...)`). Note: mapkey uses `ohg` not `hg`. No master equivalent.

^g8x4rc — `d` alias: archive `.surfingkeys-2018.js:591-601` (`addSearchAliasX` for Google define). Master has `d` mapped to DuckDuckGo — different purpose; would need new alias key.

^h3m7vq — `g` alias: archive `.surfingkeys-2018.js:615-625` (`addSearchAliasX` for Google Golang). Master has `g` for generic Google — different purpose.

^i6k2nb — `l` alias: archive `.surfingkeys-2018.js:627-637` (`addSearchAliasX` for Google Laravel). No master equivalent.

^j9w5tp — `G` alias: archive `.surfingkeys-2018.js:639-649` (`addSearchAliasX` for Google Golang GitHub). No master equivalent.

^k4r8zc — `j` alias: archive `.surfingkeys-2018.js:651-661` (`addSearchAliasX` for Google Javascript). No master equivalent.

^l7v3mx — `n` alias: archive `.surfingkeys-2018.js:677-687` (`addSearchAliasX` for Google NPM). No master equivalent.

^m2q6ks — `s` alias: archive `.surfingkeys-2018.js:689-699` (`addSearchAliasX` for Google Stackoverflow). Master has `s` for stackoverflow but different URL template.

^n5b9pw — `u` alias: archive `.surfingkeys-2018.js:700-710` (`addSearchAliasX` for Google Ubuntu). No master equivalent.

^o8t4rz — `m` alias: archive `.surfingkeys-2018.js:711-721` (`addSearchAliasX` for Google IMDB Movie). No master equivalent.

^p3n7xw — `ov`: archive `.surfingkeys-2018.js:765-776` (inline JS — manipulates URL `tbs` param to toggle `&tbs=li:1` for Google verbatim). No master equivalent.

^q6k2mb — `S` (visual mode): archive `.surfingkeys-2018.js:763` (`amap("S", "Normal Search Selected sg")`). Master has `cmd_visual_find_selected` mapped to `*` not `S`; key conflict with normal-mode `S` (history back).

^r9v5tq — `oi` (search IMDB): archive `.surfingkeys-2018.js:722-724` (`mapkey("oi", "Search IMDB", ...)` opens omnibar with `extra: "m"`). Key conflict with `cmd_nav_incognito`; needs new key.

^s4p8zx — `on` (search NPM): archive `.surfingkeys-2018.js:734-736` (`mapkey("on", "Search NPMJS", ...)` opens omnibar with `extra: "n"`). Key conflict with `cmd_tab_new`; needs new key.

^t7w3nk — `opb`: archive `.surfingkeys-2018.js:778-780` → `CustomCommands.togglePushBullet` → `content_scripts/hbt.js:1607-1612` + `bg.js:2752`. No master equivalent.

^u2b6rv — **GitHub**: archive `.surfingkeys-2018.js:1557-1572` — `ge` edit issue, `gl` label issue, `disabledDomainKeys: ["s","w","j","k"]` on github.com. Config-only; no master equivalent.

^v5m9kw — **YouTube**: archive `.surfingkeys-2018.js:1126-1293` — `yb` toggle playback speed (localStorage `yt-speed-enabled`, lines 1171-1187), `>>` speed up 0.25x (1189-1195), `<<` slow down 0.25x (1197-1203), `yv` tldw via `tldw.tube` (1166-1170), auto-unmute via `fixMuteButton()` (1128-1137). No master equivalent.

^w8r4pz — **ChatGPT**: archive `.surfingkeys-2018.js:1321-1416` — `findMainScrollableContainer()` + custom `j/k/s/w` scroll 20px on main container. Config-only; no master equivalent.

^x3n7tb — **Wikipedia**: archive `.surfingkeys-2018.js:1087-1105` — `;e` replaces language prefix in hostname (e.g. `fr.wikipedia.org` → `en.wikipedia.org`). Config-only; no master equivalent.

^y6k2qw — **Google homepage**: archive `.surfingkeys-2018.js:1420-1519` — custom `j/k/s/w` scroll (1450-1464), image link fix (1467-1490, decodes `imgurl=` param), hide logo (1438-1445, `hplogo` display none). Config-only; no master equivalent.

^z9p5rc — **Gmail**: archive `.surfingkeys-2018.js:1038-1042` — `disabledDomainKeys: ["s","w","j","k","a","d"]` on mail.google.com. Config-only; no master equivalent.

^a4v8mz — **Asana**: archive `.surfingkeys-2018.js:1521-1536` — `unmap("TAB")`, `unmap("x")`, `unmap("a")`, `unmap("m")`, `unmap("r")`, `unmap("c")` on app.asana.com. Config-only; no master equivalent.

^b7t3xn — **BitBucket**: archive `.surfingkeys-2018.js:1538-1550` (inline — replaces `bitbucket.org` → `github.com` and `commits` → `commit` in URL). Config-only; no master equivalent.

^c2w6kp — **Spotify**: archive `.surfingkeys-2018.js:1295-1300` (inline — `RUNTIME("tabUnmute")` on open.spotify.com load). Config-only; no master equivalent.

^d5r9bq — **Netflix**: archive `.surfingkeys-2018.js:1302-1308` — `RUNTIME("tabUnmute")` + `unmap("]")` + `unmap("[")` on netflix.com load. Config-only; no master equivalent.

^e8m4vz — **PMR/hbtlabs**: archive `.surfingkeys-2018.js:1861-1867` — `disabledDomainKeys: ["s"]` + `stealFocusOnLoad: false` on hbtlabs.com. Config-only; no master equivalent.

^f3b7tw — **Recoll**: archive `.surfingkeys-2018.js:1836-1848` (inline — replaces `file://` links with `http://localhost:3066/open-file?url=` + `btoa(...)` on localhost:8801). Config-only; no master equivalent.

^g6p2kn — **CyberChef**: archive `.surfingkeys-2018.js:1310-1317` — `mapkey("<F8>", "Step", ...)` clicks `#step` element on CyberChef domain. Config-only; no master equivalent.

^h9v5rx — `startBannerService()`: archive `.surfingkeys-2018.js:1849-1858` — `setInterval` every 500ms reads `localStorage['sfk_banner']`, calls `Front.showBanner()` for 2s, then deletes key. No master equivalent.

^i4m8wq — `usrc` / `gsrv`: archive `.surfingkeys-2018.js:523-524` → `CustomCommands.openSourceCodeExternalEditor` → `bg.js:2728-2745` (sends page HTML via POST to `http://127.0.0.1:8001`). No master equivalent.

^j7k3pz — `uE`: archive `.surfingkeys-2018.js:480` → `CustomCommands.urlEditExternalEditor` → `bg.js:2704-2726` (sends current tab URL to `http://127.0.0.1:8001` for gvim editing). No master equivalent.

^k2n6bt — `tlib()`: archive `.surfingkeys-2018.js:1871-1886` — auto-clicks `.addDownloadedBook.premiumBtn` or `.btn.btn-primary.addDownloadedBook` on Z-Library pages (currently disabled with early return). No master equivalent.

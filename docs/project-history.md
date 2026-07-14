# project.history

## fork.origin

| Field | Value |
|-------|-------|
| Upstream | [brookhong/Surfingkeys](https://github.com/brookhong/Surfingkeys) |
| Fork repo | `git@github.com:hbt/SurfingKeys.git` |
| Fork work started | 2026-01-20 |
| Total commits (all time) | 1,794 |
| Date range | 2015-09-04 → present |
| Upstream history included | Yes — full history, not shallow |

hbt's fork contains the **complete upstream history** from the first commit in 2015. Custom work begins on 2026-01-20.

---

## eras.upstream

### era.1 — Initial Build: Core Vim Navigation (2015-09 – 2015-12)

| | |
|-|-|
| Commits | ~61 |
| Author | brook hong |

Key work:
- `init` commit — Chrome extension bringing Vim-style navigation to the browser
- Hint system (`Hints.create`, filtering, z-index)
- Omnibar split from Normal mode; bookmark/tab navigation via overlay
- Visual mode cursor, `scrollIntoView`, find highlighting
- Vim marks (`m` / `'`), `gu` to go up URL path
- `ZZ` save session / `ZR` restore; `B/F` tab switch history
- Settings via `chrome.storage.sync`, load from local path
- Mode architecture: `Normal`, `Omnibar`, `StatusBar` as separate modules
- Releases: `0.0.5`, `0.2.0`

---

### era.2 — Feature Expansion: Mappings, Scroll, Search (2016)

| | |
|-|-|
| Commits | ~138 |
| Author | brook hong + ~6 contributors |

Key work:
- User snippets and delta-settings model (`imap`/`iunmap`)
- `map`/`unmap` API, `unmapAllExcept`
- Smooth scrolling, jQuery 3.x migration, Trie-based keymapping
- Visual mode: `F/;/,`, overlay marks
- Omnibar: tab/history/bookmark search with highlighting
- Markdown preview (`sm`), Ace editor integration
- `gxx` close all except current, DuckDuckGo engine
- Versions: `0.5.x` – `0.6.x`

---

### era.3 — Rapid Growth: Firefox Support, API Maturity (2017)

| | |
|-|-|
| Commits | ~232 (peak year) |
| Author | brook hong + ~14 contributors |

Key work:
- **Firefox support** added (2017-11-25)
- New options page with mapping UI for non-technical users
- Proxy settings integration
- CSS animation replacing jQuery.animate for hints
- Rich keystroke hints with timeout display
- Shadow DOM traversal (`getVisibleElements` in shadowRoot)
- Modules: `KeyboardUtils`, `jQueryUtils`
- `npm run dev` build workflow
- **API documentation generation** added (2017-10-15)
- Linting in build process
- Versions: `0.9.x` series

---

### era.4 — Stability: Cross-Browser Polish (2018)

| | |
|-|-|
| Commits | ~101 |
| Author | brook hong + ~10 contributors |

Key work:
- Firefox fixes throughout
- Emoji completion in Omnibar
- `oi` open page in incognito mode
- Numeric hints mode (type text to filter links)
- Cross-origin clipboard handling
- Visual mode: query word (`qv`)
- DOMException safety guards
- Versions: `0.9.3x` – `0.9.4x`

---

### era.5 — Framework Modernization (2019–2020)

| | |
|-|-|
| Commits | ~134 |
| Author | brook hong + ~25 contributors |

Key work:
- **DOMPurify** for sanitizing raw HTML (2020-04-25)
- Dependency upgrades: ACE 1.4.11, marked 1.0.0, mermaid 8.5.0
- `webRequest` permissions removed
- Dictorium inline dictionary integration
- Recompute scrollable elements on invalidation
- Shadow DOM: multiple fix rounds
- `pixi.js` for screen capture features
- Versions: `0.9.6x`

---

### era.6 — MV3 Prep + 1.0 Refactoring (2021–2022)

| | |
|-|-|
| Commits | ~97 |
| Author | brook hong + ~26 contributors |

Key work:
- **1.0 refactoring** (2021-11-28)
- iOS Safari support (2021-12-25)
- nvim integration: native messaging host, Unicode, Windows
- CodeMirror vim editor support (2022-12-19)
- Safari compatibility: config from HTTP(S) URL
- Frontend frame lazy attachment
- `addSearchAlias` extended: `suggestions` callback, favicon fetching
- Tab groups support
- `zb`/`zt` bindings
- Versions: `1.0.x` – `1.1.2`

---

### era.7 — MV3 Full + Community Growth (2023–2025)

| | |
|-|-|
| Commits | ~68 |
| Author | brook hong + ~28 contributors |

Key work:
- **Manifest V3 full support** merged (2024-11-09)
- `[mv3]` fixes: `vmap`, user scripts on `file:///`, `searchSelectedWith`
- **LLM integration**: AI chat (`A` key), Gemini support
- Regional hints mode (2025-04-07)
- Tab groups support (#1445)
- Localization: Russian, Traditional Chinese, Korean
- Omnibar: filter by title/URL, custom commands API
- PDF viewer upgrade
- Lurk mode (`lmap`)
- Versions: `1.13.0` – `1.17.12`

---

## eras.hbt

### era.8 — hbt Fork Work (2026-01-20 → present)

See [project-contributions.md](project-contributions.md) for full breakdown.

| | |
|-|-|
| Commits | 931+ |
| Author | hbt |
| Burst 1 | 2026-01: 375 commits — infrastructure, esbuild, ESLint, CDP/Playwright, docs |
| Burst 2 | 2026-05: 430 commits — TypeScript, tab magic, bookmarks, CI, settings |
| Trailing | 2026-03: 17, 2026-04: 30, 2026-06: 64, 2026-07: 15 |

hbt's commit volume in ~6 months exceeds any single upstream year, including brook hong's peak of 232 commits in 2017.

#### Commits per month

| Month | Commits | Dominant tags | Work done |
|-------|--------:|----------------|-----------|
| 2026-01 | 375 | `[test]` 62, `[docs]` 37, `[refactor]` 27, `[fix]` 26, `[feat]` 25, `[migration]` 16 | Fork bring-up: esbuild build pipeline, ESLint/lint tooling, initial CDP + Playwright test scaffolding, first docs pass, atomic scroll-wait test pattern, JSON reporter console-log capture |
| 2026-03 | 17 | `[tests]` 11, `[perf]` 2, `[report]` 2 | Stood up the Playwright MV3 POC suite and began the CDP→Playwright migration; -36%/-250s perf pass on the 10 slowest CDP tests |
| 2026-04 | 30 | `[tests]` 16, `[test]` 13, `[coverage]` 7, `[docs]` 6 | Finished bulk CDP→Playwright conversion (551/552 passing), added V8 coverage instrumentation across spec batches, split/trimmed CLAUDE.md docs, `invokeCommand` bridge pattern |
| 2026-05 | 430 | `[fix]` 40, `[feat]` 40, `[test]` 34, `[ci]` 22, `[docs]` 20, `[bookmarks]` 19, `[ts]` 15 | Largest burst: TypeScript migration, tab-magic dispatch system, bookmarks feature work, CI restructuring (verify moved pre→post-commit), mapping-conflict validation rewrite, settings-reference docs regenerated from live data |
| 2026-06 | 64 | `[feat]` 19, `[fix]` 7, `[refactor]` 2 | Archive-to-fork command migrations (`cmd_nav_url_increment/decrement`, `cmd_tab_warmup`), `sk.ts` CLI lookup subcommand, mappings report renamed/refactored, migration.md docs expanded |
| 2026-07 | 15 | `[feat]` 4, `[fix]` 4, `[perf]` 3 | Hint-scan perf work (TreeWalker-based `zz`, 70s freeze fix + otel tracing), vim-mark page scoping fix, digit-prefix repeat fix on tab magic commands |

```bash
# per-month tag breakdown used for the "Dominant tags" column above (repeat per month)
git log --no-merges --author="hbt" --since="2026-05-01" --until="2026-05-31" \
  --pretty=format:'%s' | grep -oE '\[[a-zA-Z0-9_-]+\]' | sort | uniq -c | sort -rn
```

```bash
# Total commits by hbt (matches "931+" author-count claim)
git log --no-merges --author="hbt" --oneline | wc -l

# hbt commits broken down by month (derives the Burst 1 / Burst 2 numbers)
git log --no-merges --author="hbt" --date=format:'%Y-%m' --pretty=format:'%ad' | sort | uniq -c

# brookhong's commits per year, sorted descending (confirms the 232-commit 2017 peak)
git log --no-merges --author="brookhong\|brook hong" --date=format:'%Y' --pretty=format:'%ad' | sort | uniq -c | sort -rn
```

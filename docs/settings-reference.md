# Surfingkeys Settings Reference

This document catalogs all Surfingkeys settings discovered in the codebase.
Generated from: `bun scripts/mappings-json-report.ts`

## Overview

| Metric | Count |
|--------|-------|
| Total usages (all accesses) | 126 |
| Unique settings | 60 |
| Accessed via `runtime.conf.*` | 56 |
| Accessed via `settings.*` | 4 |
| Excluded (false positives) | 4 |

## 1.0 Process Breakdown

| Process | Count | Description |
|---------|-------|-------------|
| `content_script` | 56 | Used exclusively in content scripts |
| `background` | 3 | Used exclusively in the background service worker |
| `mixed` | 1 | Referenced across multiple process types (nvim) |

## 2.0 Content Script Settings (`runtime.conf.*`)

All 56 settings below are accessed via `runtime.conf.*` in content scripts. Sorted by usage frequency.

| Setting | Freq | Source Files | Notes |
|---------|------|-------------|-------|
| bookmarkFolders | 8 | commands/settings.ts | |
| lastQuery | 7 | visual.ts, content.ts | internal state |
| richHintsForKeystroke | 5 | ui/frontend.ts | ms timeout; 0 disables |
| omnibarPosition | 5 | ui/omnibar.ts | `"middle"` or `"bottom"` |
| omnibarMaxResults | 5 | ui/omnibar.ts | results per page |
| blocklistPattern | 4 | normal.ts, content.ts | regex; disables SK on match |
| clickableSelector | 4 | common/utils.ts | extra CSS selector for hints |
| textAnchorPat | 4 | clipboard.ts, hints.ts, visual.ts | internal |
| scrollStepSize | 4 | common/normal.ts | px per `j`/`k` step |
| aceKeybindings | 4 | ui/frontend.ts | `"vim"` or `"emacs"` |
| historyMUOrder | 4 | ui/omnibar.ts | most-used order |
| showModeStatus | 3 | insert.ts, mode.ts, normal.ts | always show mode |
| magicKeys | 3 | commands/settings.ts, commands/tabs.ts | |
| disabledOnActiveElementPattern | 3 | hints.ts, normal.ts | auto-disable regex |
| caretViewport | 3 | common/hints.ts | `[top,left,bottom,right]` |
| useLocalMarkdownAPI | 3 | content_scripts/markdown.ts | chjj/marked vs GitHub API |
| lurkingPattern | 2 | content.ts | internal |
| stealFocusOnLoad | 2 | normal.ts, content.ts | prevent focus on load |
| modeAfterYank | 2 | common/visual.ts | mode after yank in visual |
| lastKeys | 2 | commands/settings.ts | internal state |
| editableBodyCare | 2 | common/normal.ts | don't auto-Insert on body |
| enableAutoFocus | 2 | common/normal.ts | focus after click |
| pageUrlRegex | 2 | common/hints.ts | internal |
| hintAlign | 2 | common/hints.ts | `"left"` / `"center"` / `"right"` |
| tabsThreshold | 2 | ui/frontend.ts, ui/omnibar.ts | tab count for Omnibar |
| omnibarHistoryCacheSize | 2 | ui/omnibar.ts | max history items |
| showProxyInStatusBar | 1 | content.ts | |
| ignoredFrameHosts | 1 | content.ts | frames excluded from `w` loop |
| editableSelector | 1 | common/utils.ts | extra editable CSS selectors |
| language | 1 | common/utils.ts | `"zh-CN"`, `"ru-RU"` |
| tabOpenLinkThreshold | 1 | common/utils.ts | |
| cursorAtEndOfInput | 1 | common/insert.ts | cursor at end on input enter |
| clickablePat | 1 | commands/navigation.ts | regex for clickable text links |
| smartPageBoundary | 1 | common/normal.ts | |
| smoothScroll | 1 | common/normal.ts | smooth `j`/`k`/`e`/`d` |
| scrollFriction | 1 | common/normal.ts | force to start continuous scroll |
| scrollFallback | 1 | common/normal.ts | |
| mouseSelectToQuery | 1 | common/normal.ts | hosts with select-to-query |
| hintShiftNonActive | 1 | common/hints.ts | new tab inactive on shift-hint |
| prevLinkRegex | 1 | common/hints.ts | regex for prev-page links |
| nextLinkRegex | 1 | common/hints.ts | regex for next-page links |
| hintExplicit | 1 | common/hints.ts | wait for input on single hint |
| digitForRepeat | 1 | common/mode.ts | digits reserved for repeat |
| repeatThreshold | 1 | common/mode.ts | max repeat count |
| defaultVoice | 1 | content_scripts/chrome.ts | TTS voice |
| verticalTabs | 1 | ui/frontend.ts | vertical tab picker |
| colorfulKeystrokeHints | 1 | ui/frontend.ts | colored hint display |
| defaultLLMProvider | 1 | ui/llmchat.ts | |
| defaultSearchEngine | 1 | ui/omnibar.ts | default search alias |
| focusFirstCandidate | 1 | ui/omnibar.ts | focus first Omnibar result |
| omnibarTabsQuery | 1 | ui/omnibar.ts | internal |
| omnibarSuggestion | 1 | ui/omnibar.ts | show suggestion URLs |
| omnibarSuggestionTimeout | 1 | ui/omnibar.ts | ms before suggestion query |
| useNeovim | 1 | content_scripts/front.ts | Neovim integration |
| autoSpeakOnInlineQuery | 1 | content_scripts/front.ts | auto TTS on inline query |
| focusOnSaved | 1 | content_scripts/front.ts | focus input after vim editor |

## 3.0 Background Settings (`settings.*`)

Used exclusively in `background/start.ts`.

| Setting | Freq | Notes |
|---------|------|-------|
| defaultZoomFactor | 2 | Default zoom level |
| llm | 1 | LLM provider configuration |
| showAdvanced | 1 | Show advanced settings UI |

## 4.0 Mixed / Other (`settings.*`)

Settings referenced across process boundaries or outside the standard src directories.

| Setting | Freq | Files | Notes |
|---------|------|-------|-------|
| element | 3 | nvim/renderer.ts, nvim/screen.ts | Neovim renderer internal |

## 5.0 Excluded Settings (False Positives)

| Name | Reason |
|------|--------|
| hasOwnProperty | Built-in JS method, not a config setting |
| k | Loop variable in `for...in`, not a literal property |
| error | Transient UI error message property |
| regexName | Function parameter in `ensureRegex()` helper |

## 6.0 Settings by Command Group

### Scroll Commands
| Setting | Role |
|---------|------|
| scrollStepSize | px per `j`/`k` step |
| scrollFriction | force needed for continuous scroll |
| scrollFallback | fallback scroll behaviour |
| smoothScroll | smooth scroll for `j`/`k`/`e`/`d` |

### Omnibar
| Setting | Role |
|---------|------|
| omnibarMaxResults | results per page |
| omnibarHistoryCacheSize | max history items fetched |
| omnibarPosition | `"middle"` or `"bottom"` |
| omnibarSuggestion | show suggestion URLs |
| omnibarSuggestionTimeout | ms before suggestion query |
| defaultSearchEngine | default search alias |
| historyMUOrder | list history by most-used |
| tabsThreshold | tab count before Omnibar forced |
| focusFirstCandidate | focus first Omnibar candidate |

### Hints Mode
| Setting | Role |
|---------|------|
| hintAlign | alignment on target elements |
| hintExplicit | wait for input on single hint |
| hintShiftNonActive | shift-hint opens inactive tab |
| clickableSelector | extra CSS for hintable elements |
| clickablePat | regex for clickable text links |
| nextLinkRegex | regex for next-page links |
| prevLinkRegex | regex for prev-page links |
| caretViewport | limit hint generation area |

### Repeat Behaviour
| Setting | Role |
|---------|------|
| digitForRepeat | reserve digits for repeat |
| repeatThreshold | max repeat count |

### Input / Focus
| Setting | Role |
|---------|------|
| cursorAtEndOfInput | cursor at end on input enter |
| enableAutoFocus | focus after mouse click |
| stealFocusOnLoad | prevent page focus on load |
| editableBodyCare | don't auto-Insert when body editable |
| editableSelector | extra editable element selectors |
| focusOnSaved | focus input after vim editor quit |

## 7.0 Notes

| Note | Detail |
|------|--------|
| User config vs runtime | Settings defined as `settings.xxx` in user config are accessed as `runtime.conf.xxx` at runtime |
| Internal state | `lastQuery`, `lastKeys`, `omnibarTabsQuery`, `lurkingPattern`, `pageUrlRegex`, `magicKeys` are internal runtime state, not user-configurable |
| Process | 93% of settings (56/60) are content-script-only; only 3 live in the background SW |
| Source of truth | Run `bun scripts/mappings-json-report.ts` for live counts; this file reflects the last manual sync |

## 8.0 References

| Resource | Path |
|----------|------|
| Live report | `bun scripts/mappings-json-report.ts` |
| Report schema | `bun scripts/mappings-json-report.ts --schema` |
| Integrity check | `bun scripts/mappings-json-report.ts --integrity` |
| Settings annotations | `docs/settings/all.json` |
| README user docs | `/README.md` (settings table) |
| Glossary | `docs/initial-upstream-repo-analysis/glossary.md` |

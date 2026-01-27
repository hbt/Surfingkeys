# Surfingkeys Settings Reference

This document catalogs all Surfingkeys settings discovered in the codebase.

## Overview

- **Total documented in README:** 52 settings
- **Additional in runtime.conf:** 11 settings
- **Found in settings.* only:** 14 settings
- **Grand total:** ~77 unique settings

## 1.0 Documented Settings (from README.md)

These are user-configurable settings documented in the README:

| Setting | Default | Description |
|---------|---------|-------------|
| aceKeybindings | "vim" | Keybindings for ACE editor ("vim" or "emacs") |
| autoSpeakOnInlineQuery | false | Automatically speak query string with TTS on inline query |
| blocklistPattern | undefined | Regex to match sites where Surfingkeys is disabled |
| caretViewport | null | Limit hints generation on `v` in format `[top, left, bottom, right]` |
| caseSensitive | false | Whether finding in page/Omnibar is case sensitive |
| clickablePat | /(https?\|thunder\|magnet):\/\/\S+/ig | Regex to detect clickable links from text |
| clickableSelector | "" | Extra CSS selector to pick elements for hints mode |
| cursorAtEndOfInput | true | Whether to put cursor at end of input when entering input box |
| defaultSearchEngine | "g" | Default search engine used in Omnibar |
| digitForRepeat | true | Whether digits are reserved for repeats |
| disabledOnActiveElementPattern | undefined | Auto-disable extension when active element matches pattern |
| editableBodyCare | true | Don't auto-activate Insert mode when document.body is editable |
| editableSelector | div.CodeMirror-scroll,div.ace_content | CSS selector for additional editable elements |
| enableAutoFocus | true | Whether to enable auto focus after mouse click |
| enableEmojiInsertion | false | Whether to turn on Emoji completion in Insert mode |
| focusAfterClosed | "right" | Which tab is focused after current tab closes ["left", "right", "last"] |
| focusFirstCandidate | false | Whether to focus first candidate of matched result in Omnibar |
| focusOnSaved | true | Whether to focus text input after quitting from vim editor |
| hintAlign | "center" | Alignment of hints on target elements ["left", "center", "right"] |
| hintExplicit | false | Whether to wait for explicit input when only single hint available |
| hintShiftNonActive | false | Whether new tab is active after entering hint while holding shift |
| historyMUOrder | true | Whether to list history in order of most used beneath Omnibar |
| ignoredFrameHosts | ["https://tpc.googlesyndication.com"] | Frames to exclude when looping with `w` |
| interceptedErrors | [] | Which errors to show Surfingkeys error page for |
| language | undefined | Language of usage popover ("zh-CN", "ru-RU") |
| modeAfterYank | "" | Mode to fall back to after yanking text in visual mode |
| mouseSelectToQuery | [] | Hosts with enabled mouse selection to query feature |
| newTabPosition | 'default' | Where to place new tab ["left", "right", "first", "last", "default"] |
| nextLinkRegex | /((>>\|next)+)/i | Regex to match links indicating next page |
| omnibarHistoryCacheSize | 100 | Maximum items fetched from browser history |
| omnibarMaxResults | 10 | How many results listed per page in Omnibar |
| omnibarPosition | "middle" | Where to position Omnibar ["middle", "bottom"] |
| omnibarSuggestion | false | Show suggestion URLs |
| omnibarSuggestionTimeout | 200 | Timeout before Omnibar suggestion URLs are queried (ms) |
| prevLinkRegex | /((<<\|prev(ious)?)+)/i | Regex to match links indicating previous page |
| repeatThreshold | 9 | Maximum number of actions to be repeated |
| richHintsForKeystroke | 500 | Timeout (ms) to show rich hints for keystroke (0 disables) |
| scrollFriction | 0 | Force needed to start continuous scrolling after initial step |
| scrollStepSize | 70 | Step size for each move by `j`/`k` |
| showModeStatus | false | Whether to always show mode status |
| showProxyInStatusBar | false | Whether to show proxy info in status bar |
| showTabIndices | false | Whether to show tab numbers in tab titles |
| smartCase | true | Make caseSensitive true if search pattern has uppercase |
| smoothScroll | true | Use smooth scrolling for `j`/`k`/`e`/`d` keys |
| startToShowEmoji | 2 | Characters needed after colon to show emoji suggestion |
| stealFocusOnLoad | true | Prevent focus on input on page load |
| tabIndicesSeparator | "\|" | Separator between index and original tab title |
| tabsMRUOrder | true | List opened tabs in MRU order beneath Omnibar |
| tabsThreshold | 100 | When opened tabs exceed this, Omnibar used for choosing tabs |
| theme | undefined | CSS to change Surfingkeys UI elements |
| useLocalMarkdownAPI | true | Use chjj/marked vs github markdown API |
| verticalTabs | true | Show tab pickers vertically aligned |

## 2.0 Additional Runtime Settings (in runtime.conf but not README)

These settings are used in the code but not documented in README:

| Setting | Usage |
|---------|-------|
| colorfulKeystrokeHints | Display hints with colors |
| defaultLLMProvider | Default LLM provider for AI features |
| defaultVoice | Default voice for TTS |
| lastKeys | Last pressed keys (internal state) |
| lastQuery | Last search query (internal state) |
| lurkingPattern | Pattern for lurking mode |
| omnibarTabsQuery | Query for tabs in Omnibar (internal) |
| pageUrlRegex | Regex pattern for page URLs |
| smartPageBoundary | Smart boundary detection for pages |
| textAnchorPat | Pattern for text anchors |
| useNeovim | Whether to use Neovim integration |

## 3.0 Settings API Methods (settings.*)

These are methods/properties on the settings object (not user config):

| Property | Purpose |
|----------|---------|
| blocklist | Access blocklist data |
| clear | Clear settings |
| cmdHistory | Command history storage |
| defaultZoomFactor | Default zoom factor |
| error | Error handling |
| findHistory | Find-in-page history |
| llm | LLM configuration |
| llmChatHistory | LLM chat history storage |
| marks | Vim-style marks storage |
| noPdfViewer | Disable PDF viewer setting |
| OmniQueryHistory | Omnibar query history |
| sessions | Tab sessions storage |
| set | Method to set settings |
| showAdvanced | Show advanced settings |

## 4.0 Settings Related to Commands

### Scroll Commands
- **scrollStepSize** - Used by: j, k, h, l (scroll commands)
- **scrollFriction** - Used by: scroll commands with smooth scrolling
- **smoothScroll** - Used by: j, k, e, d, U, P (all scroll commands)

### Omnibar Commands
- **omnibarMaxResults** - Used by: all Omnibar searches
- **omnibarHistoryCacheSize** - Used by: history searches
- **omnibarPosition** - Used by: Omnibar display
- **omnibarSuggestion** - Used by: Omnibar suggestions
- **omnibarSuggestionTimeout** - Used by: Omnibar suggestions
- **defaultSearchEngine** - Used by: Omnibar search

### Hints Mode
- **hintAlign** - Used by: hint display
- **hintExplicit** - Used by: hint selection behavior
- **hintShiftNonActive** - Used by: hint with Shift modifier
- **clickableSelector** - Used by: hint element detection
- **clickablePat** - Used by: clickable link detection

### Repeat Behavior
- **digitForRepeat** - Used by: all commands with repeat support
- **repeatThreshold** - Used by: repeat count limiting

## 5.0 Notes

1. **User Config vs Runtime**: Settings defined as `settings.xxx` in user config are accessed as `runtime.conf.xxx` at runtime
2. **Internal State**: Some `runtime.conf.*` properties are internal state, not user-configurable
3. **Documentation Gap**: 11 settings in code not documented in README
4. **Settings Methods**: 14 additional `settings.*` properties are API methods/storage, not user config

## 6.0 References

- Main documentation: `/README.md` (settings table)
- Source code: `src/` (runtime.conf usage)
- Related: `/docs/glossary.md` (smoothScroll definition)

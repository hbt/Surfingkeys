# Custom Feature Tree - Archive Branch

## tree.overview

Hierarchical organization of custom features in the archive branch (2018-2025 fork). Features are grouped by domain and functionality, showing dependencies and relationships.

**Organization Principle:** Features grouped by user workflow and functional domain, not by implementation location.

**Legend:**
- ✨ **Core Innovation** - Novel pattern/system
- 🔧 **Enhancement** - Improved upstream feature
- 🔌 **Integration** - External service/tool integration
- 📦 **Utility** - Helper/convenience feature

---

## tree.core_systems

### ✨ Magic Pattern System
**Purpose:** Composable command modifiers for tab operations

```
Magic Pattern System
├── Direction Modifiers
│   ├── DirectionRight (e)
│   ├── DirectionRightInclusive (E)
│   ├── DirectionLeft (q)
│   └── DirectionLeftInclusive (Q)
├── Scope Modifiers
│   ├── Window Scope
│   │   ├── AllTabsInCurrentWindowExceptActiveTab (c)
│   │   ├── AllTabsInCurrentWindow (C)
│   │   ├── AllWindowsNoPinnedTabsExceptCurrentWindow (w)
│   │   └── AllOtherTabsInOtherWindowsExceptAllTabsInCurrentWindow (W)
│   ├── State Scope
│   │   ├── AllIncognitoWindowsIncludingPinnedIncognitoTabs (o)
│   │   └── currentTab (t)
│   └── Global Scope
│       └── AllTabsInAllWindowExceptActiveTab (g)
└── Hierarchy Modifiers
    ├── highlightedTabs (h)
    ├── childrenTabs (K) - non-recursive
    └── childrenTabsRecursively (k)
```

**Dependencies:**
- `CustomCommonConfig.tabMagic` configuration
- `tabCheckMagicByKey()` key resolver
- `Normal.repeats` integration
- Background command handlers (`*M` methods)

**Enables:**
- All Magic-enabled commands (below)
- Composable tab operations with count + direction
- Advanced tab filtering and batch operations

---

### ✨ Annotation Mapping System
**Purpose:** Decouple keybindings from implementation, enable command introspection

```
Annotation Mapping System
├── amap() Function
│   └── Maps keys to commands by annotation string
├── MyCustomMapping Class
│   ├── Command Registry (acmds Map)
│   ├── Annotation Extraction
│   └── Documentation Generation
└── CustomCommands Namespace
    └── ~100+ command implementations
```

**Key Functions:**
- `amap(keys, annotation)` - Bind keys to annotated commands
- `MyCustomMapping.acmds` - Query command metadata
- `printAllCommands()` - Generate documentation

**Benefits:**
- Programmatic command introspection
- Auto-generated command documentation
- Centralized command registry
- Type-safe command references

---

## tree.tab_management

### Tab Operations

```
Tab Operations
├── 🔧 Navigation
│   ├── Next/Previous with Repeats
│   │   ├── q - go one tab left
│   │   └── e - go one tab right
│   ├── Position-based
│   │   ├── tg0/tgq - go to first tab
│   │   ├── gte - go to last tab
│   │   └── tg - go to tab by index
│   ├── History-based
│   │   ├── t[ - tab history back
│   │   └── t] - tab history forward
│   └── Parent Navigation
│       └── gtp - go to parent opener tab
│
├── ✨ Magic-Enabled Closing
│   └── tc + Magic Key
│       ├── tc+e - close N tabs to right
│       ├── tc+q - close N tabs to left
│       ├── tc+c - close all except current
│       ├── tc+w - close tabs in other windows
│       ├── tc+o - close all incognito tabs
│       ├── tc+h - close highlighted tabs
│       └── tc+k - close child tabs recursively
│
├── 🔧 Manipulation
│   ├── Reordering
│   │   ├── tq - move tab left
│   │   ├── te - move tab right
│   │   └── tR + Magic - reverse tab order
│   ├── Duplication
│   │   └── tv - duplicate current tab
│   └── Window Management
│       └── td + Magic - detach tabs to new window
│
├── ✨ State Management
│   ├── Pin/Unpin
│   │   ├── tl - toggle pin current
│   │   ├── tL - toggle pin all in window
│   │   ├── WL - toggle pin all windows
│   │   └── tj + Magic - toggle pin with magic filter
│   ├── Mute/Unmute
│   │   └── tm - toggle mute current tab
│   ├── Suspend Management
│   │   ├── ts - fix suspended tabs
│   │   └── (suspended tab auto-reload disabled)
│   └── Incognito Toggle
│       └── ti/tx - toggle incognito
│
├── ✨ Reload Operations
│   ├── Basic Reload
│   │   ├── r - reload (smart: resumes from error pages)
│   │   └── R - hard reload (nocache)
│   └── Magic Reload
│       └── tr + Magic - reload filtered tabs
│
├── ✨ Highlighting System
│   ├── Toggle Highlight
│   │   ├── tH - toggle current tab highlight
│   │   └── th + Magic - toggle highlight with magic
│   ├── Clear Highlights
│   │   └── t!h - clear all highlights
│   └── Batch Operations on Highlighted
│       └── tp - move highlighted tabs
│
├── ✨ Quickmarks
│   ├── t` - mark current tab position
│   └── ` - jump to marked tab
│
└── 🔧 Utilities
    ├── tC - show tab count/index/position
    ├── tu - undo closed tab
    ├── t!u - remove duplicate tabs
    └── (upstream tU, tz also available)
```

**Dependencies:**
- Magic Pattern System
- Background tab query APIs
- Tab state tracking

---

## tree.clipboard_operations

### Clipboard Management

```
Clipboard Operations
├── 📦 Page-Level Copy
│   ├── yy - copy current URL
│   ├── yh - copy page host
│   ├── yl - copy page title
│   ├── yp - copy page body text
│   ├── ymd - copy URL as markdown link
│   ├── ymt - copy title as markdown link
│   └── ysrc - copy page source
│
├── 🔧 Hint-Based Copy
│   ├── Single Element
│   │   ├── yf - copy link URL
│   │   ├── yc - copy table column
│   │   ├── yd - yank element text
│   │   ├── yi/yv - yank input value
│   │   └── yI - open inspector on element
│   └── Multiple Elements
│       ├── yma - copy multiple link URLs
│       ├── ymc - copy multiple table columns
│       └── ymv - yank text of multiple elements
│
├── ✨ Magic-Enabled Copy
│   ├── yt + Magic - copy tab URLs by filter
│   │   ├── yt+e - copy tabs to right
│   │   ├── yt+c - copy all tabs in window
│   │   └── yt+g - copy all tabs globally
│   └── yw - copy all tabs in current window
│
├── 📦 Web Dev Utilities
│   ├── yJ - copy form data as JSON
│   ├── yP - copy form data as POST params
│   └── yD - enable disabled/readonly form elements
│
├── 🔌 Paste Operations
│   ├── pp/gv - paste into page
│   ├── P/gz - paste and open in new tab
│   └── (Smart URL detection and opening)
│
└── 🔧 Screenshot/Capture
    ├── ysc - capture current page
    └── (ysf, yss - full page/scrolling - may be disabled)
```

**Dependencies:**
- Surfingkeys `Clipboard` API
- Hint system integration
- Magic Pattern for batch operations

---

## tree.bookmark_operations

### Bookmark Management

```
Bookmark Operations
├── ✨ Magic-Enabled Bookmarking
│   ├── Bookmark Add (ba + Magic + folder choice)
│   │   └── Add filtered tabs to specified folder
│   ├── Bookmark Remove (br + Magic + folder choice)
│   │   └── Remove filtered tabs from folder
│   └── Supported Magic Filters
│       ├── Direction-based (e, q, E, Q)
│       ├── Scope-based (c, C, w, W, o, g)
│       └── Hierarchy-based (h, k, K)
│
├── 🔧 Incognito Integration
│   └── incognitoBookmarkFolder: "incognito"
│       └── Auto-folder for incognito tab bookmarks
│
└── 📦 Print/Export Operations
    ├── tb + Magic - print tabs as PDF
    └── tB + Magic - print with page capture
```

**Note:** Bookmark operations use folder selection prompts combined with magic filters for batch operations.

---

## tree.url_manipulation

### URL Operations

```
URL Operations
├── 🔧 URL Navigation
│   ├── gu - go up one path level
│   ├── gU - go to root URL
│   └── g? - reload without query string
│
├── ✨ URL Editing
│   ├── ue - edit URL inline (vim-like)
│   ├── ute/Ue - edit and open in new tab
│   └── uE - edit with external GVim
│
├── ✨ URL Increment/Decrement
│   ├── Ctrl-a - increment last numeric path component
│   └── Ctrl-x - decrement last numeric path component
│   └── Use Case: Navigate paginated content
│
├── 🔧 Link Detection
│   ├── ol - detect and open links from text (new tab)
│   ├── Ol - detect and open links (current tab)
│   └── Ml - make URLs (parse and process text for URLs)
│
└── 📦 Readability Integration
    └── yr - open current page in txtify.it reader
```

**Dependencies:**
- URL parsing utilities
- Text extraction algorithms
- External editor integration (for uE)

---

## tree.hints_and_interaction

### Hints System

```
Hints System
├── 🔧 Basic Hints
│   ├── f - open link (shift to flip overlapped)
│   ├── c - open link in background tab
│   ├── C - open link in active new tab
│   └── Alt-c - open multiple links in tabs
│
├── 🔌 Custom Hint Actions
│   ├── of/nf - open link in incognito window
│   ├── nw - open link in new window
│   ├── ysd - focus element (for interaction)
│   └── yI - open DevTools inspector on element
│
├── ✨ Pattern-Based Navigation
│   ├── ]] - next page (smart pattern matching)
│   ├── [[ - previous page (smart pattern matching)
│   └── Custom Patterns
│       ├── Next: (next|>|›|»|forward)
│       └── Prev: (prev|back|<|‹|«)
│
├── 📦 Mouse Simulation
│   ├── Alt-m - mouse over elements
│   └── Alt-, - mouse out elements
│
└── 🔧 Advanced Hint Features
    ├── Mfa - flag and open all links
    │   └── (Tracks opened links to avoid duplicates)
    └── ymc - copy table columns (multi-select)
```

**Enhancements over Upstream:**
- Pattern-based pagination (no hardcoded selectors)
- Incognito/new window hint modes
- DevTools integration via hints

---

## tree.vim_like_features

### Vim-Inspired Operations

```
Vim-Like Features
├── ✨ Marks System
│   ├── VIM Marks (URL-based, persistent)
│   │   ├── m - add URL to mark
│   │   └── ' - jump to marked URL
│   ├── Tab Quickmarks (position-based, session)
│   │   ├── t` - mark tab position
│   │   └── ` - jump to marked tab
│   └── oM - open URL from vim-like marks (picker)
│
├── 🔧 Scrolling
│   ├── j/s - scroll down
│   ├── k/w - scroll up
│   ├── h/a - scroll left
│   ├── l/d - scroll right
│   ├── gg - scroll to top
│   ├── gf - scroll to bottom
│   ├── % - scroll to percentage
│   ├── 0/ga - scroll all the way left
│   ├── $/gd - scroll all the way right
│   └── g] - switch frames
│
├── 🔧 Scroll Target Management
│   ├── yss - change scroll target
│   └── ysf - display hints for scrollable elements
│
├── 📦 History Navigation
│   ├── A - go back in history
│   ├── D - go forward in history
│   └── H - open URL from history
│
└── 🔧 Zoom Operations
    ├── Zr - zoom reset
    ├── Zi - zoom in
    └── Zo - zoom out
```

**Note:** Heavily customized scrolling keybindings for ergonomics (e.g., `s`/`w` instead of `j`/`k` for some users)

---

## tree.insert_mode_features

### Insert Mode Operations

```
Insert Mode Operations
├── 🔧 Input Navigation
│   └── (Enhanced gi - go to first input)
│       └── insertGoToFirstInput()
│
├── 📦 Paste Operations
│   └── (Integrated with clipboard operations)
│       └── Smart URL detection from clipboard
│
└── 🔧 Form Utilities
    └── yD - enable disabled form elements
        └── Removes disabled/readonly attributes
```

**Note:** Lighter customization compared to other modes; mostly leverages upstream Insert mode

---

## tree.omnibar_operations

### Omnibar Features

```
Omnibar Operations
├── 🔧 Tab Selection
│   └── oT - choose tab via omnibar
│
├── 📦 Mark Selection
│   └── oM - open URL from vim marks
│
└── 🔧 History Search
    └── H - search and open from history
```

**Note:** Most omnibar features use upstream; custom additions focus on mark integration

---

## tree.integrations

### External Integrations

```
External Integrations
├── 🔌 Browser Features
│   ├── PushBullet Toggle
│   │   └── togglePushBullet - enable/disable notifications
│   ├── User Agent Switching
│   │   └── (User agent switcher commands)
│   └── Dark Reader Integration
│       └── Auto-reload dark reader extension
│
├── 🔌 Development Tools
│   ├── CDP Integration
│   │   └── (See docs/cdp.md for testing framework)
│   ├── Network Activity Logging
│   │   └── printNetworkActivity
│   └── DevTools Inspector
│       └── yI - open inspector via hints
│
├── 🔌 Productivity Tools
│   ├── Readability (txtify.it)
│   │   └── yr - open page in reader mode
│   ├── Page Capture
│   │   └── tB + Magic - capture and print
│   └── Form Recovery
│       └── (Mentioned but implementation unclear)
│
└── 🔌 External Editor
    └── uE - edit URL in GVim
        └── Requires system integration
```

**Dependencies:** External extensions, system tools, web services

---

## tree.background_utilities

### Background Page Features

```
Background Features
├── ✨ Cross-Origin Requests
│   └── bajax - background AJAX proxy
│       └── Bypass CORS for content scripts
│
├── 🔧 Global State Management
│   ├── setBackgroundLocalStorage
│   └── getBackgroundLocalStorage
│       └── Share state across all tabs
│
├── 📦 Extension Lifecycle
│   ├── testMyPort - verify background connectivity
│   └── handleCtrlWFeature - custom window key handling
│
└── 🔧 Tab State Tracking
    ├── tabDoneLoading - track load completion
    └── Tab hierarchy tracking (parent/child)
```

**Purpose:** Centralized state and services accessible from all content scripts

---

## tree.domain_specific_config

### Domain Configuration

```
Domain-Specific Configuration
├── Per-Domain Settings
│   └── (DomainConfig section in .surfingkeysrc)
│
├── Auto-Reload Control
│   ├── Don't reload on uBlock origin blocks
│   └── Don't reload on certain error types
│
└── Custom Behavior Overrides
    └── (Site-specific command modifications)
```

**Note:** Allows customizing behavior per website without affecting global config

---

## tree.configuration_system

### Configuration Management

```
Configuration System
├── ✨ IDE Navigation Helpers
│   ├── mmconfig Object
│   │   └── Organize config by feature domain
│   └── Region Comments
│       └── Foldable sections in IDE
│
├── 🔧 Settings Customization
│   ├── Hint Characters: "gaswqbertdf"
│   ├── Scroll Step Size: 50
│   ├── Focus After Tab Close: "left"
│   ├── New Tab Position: "right"
│   ├── Show Tab Indices: true
│   └── Digit For Repeat: true
│
└── 📦 Theme Customization
    └── Custom CSS for status bar, hints, find
```

**Purpose:** Extensive personalization and IDE-friendly organization

---

## tree.migration_priorities

### Feature Priority for Migration

**🔥 Critical (Port First):**
1. Magic Pattern System - Foundation for all tab operations
2. amap/MyCustomMapping - Command organization
3. Tab Highlighting - Multi-select functionality
4. Magic-enabled tab close/reload/detach
5. VIM Marks - URL bookmark system

**⚡ High Value:**
1. URL increment/decrement
2. Pattern-based pagination (]], [[)
3. Smart reload (error page resume)
4. Tab quickmarks
5. Copy tab URLs with magic

**📌 Nice-to-Have:**
1. External editor integration (if still needed)
2. bajax (may be obsolete with Manifest v3)
3. PushBullet integration (check if still used)
4. Custom hint actions (incognito, new window)
5. Background localStorage access

**⏭️ Consider Skipping:**
1. Workarounds for v0.9.48 limitations
2. Features replaced by upstream improvements
3. Experimental features never fully adopted
4. Site-specific hacks
5. Integration with deprecated services

---

## tree.dependencies_graph

### Feature Dependencies

```
Foundation Layer
├── CustomCommonConfig.tabMagic
├── amap/MyCustomMapping
└── aruntime wrapper

Core Patterns
├── Magic Pattern System
│   └── Used by: tab close, reload, detach, pin, highlight, bookmark, copy
├── Annotation Mapping
│   └── Used by: all amap() calls
└── CustomCommands Namespace
    └── Contains: ~100+ command implementations

Advanced Features
├── Tab Highlighting
│   └── Depends on: Magic Pattern, background state
├── VIM Marks
│   └── Depends on: background storage, omnibar
├── Tab Quickmarks
│   └── Depends on: session state tracking
└── bajax
    └── Depends on: background page CORS bypass

Integrations
└── All depend on: external extensions/services/tools
```

**Migration Strategy:** Port foundation → core patterns → advanced features → integrations

---

## tree.statistics

**Feature Counts:**
- Total Custom Commands: ~100+
- Magic-Enabled Commands: ~15
- Hint-Based Commands: ~20
- Clipboard Operations: ~25
- Tab Operations: ~40
- URL Operations: ~10
- Integration Features: ~8

**Code Distribution:**
- `content_scripts/hbt.js`: 1,617 lines
- `bg.js` (custom additions): ~500 lines (estimated)
- `.surfingkeysrc`: 737 lines
- `custom-commons.js`: 62 lines

**Magic Directive Count:** 13 directives
**Key Sections in Config:** 20+ organized sections

---

## tree.references

**Source Files:**
- Feature implementations: `content_scripts/hbt.js`
- Background handlers: `bg.js` (search for `async *M(` methods)
- Configuration: `.surfingkeysrc`
- Shared config: `custom-commons.js`

**Key Patterns:**
- Magic commands: Search for `CustomCommands.*M`
- Hint actions: Search for `CustomCommands.hint*`
- Clipboard ops: Section "Clipboard" in .surfingkeysrc

**Documentation:**
- Glossary: `docs/archive-analysis/custom-glossary.md`
- Command List: `docs/commands-list.txt` (if generated)

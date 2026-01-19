# Surfingkeys Feature Tree

**Based on**: Visual Models for Software Requirements methodology
**Purpose**: Hierarchical organization and prioritization of features for scope management
**Version**: 1.17.12
**Last Updated**: 2026-01-20

## Legend

- **[P0]** = Core / Must-have features (essential for basic functionality)
- **[P1]** = High priority / Should-have features (important for user experience)
- **[P2]** = Medium priority / Nice-to-have features (enhances capabilities)
- **[P3]** = Low priority / Optional features (advanced use cases)

## Feature Tree Visualization

```
Surfingkeys - Keyboard-based Browser Navigation Extension
│
├─── [P0] Core Navigation & Interaction
│    ├─── Keyboard Modes
│    │    ├─── Normal Mode (default navigation)
│    │    ├─── Visual Mode (text selection & manipulation)
│    │    ├─── Insert Mode (form input & editing)
│    │    ├─── Hints Mode (link & element selection)
│    │    └─── Special Modes
│    │         ├─── PassThrough Mode (temporary disable)
│    │         ├─── Lurk Mode (pattern-based disable)
│    │         └─── Disabled Mode (site-specific disable)
│    │
│    ├─── Link & Element Interaction
│    │    ├─── Primary Hints (link following)
│    │    ├─── Regional Hints (element selection)
│    │    ├─── Hint Overlapping Management
│    │    ├─── Continuous Following
│    │    └─── Active/New Tab Opening
│    │
│    ├─── Page Scrolling
│    │    ├─── Smooth Scroll (configurable)
│    │    ├─── Page Up/Down
│    │    ├─── Top/Bottom Navigation
│    │    ├─── Element Scroll (DIVs)
│    │    └─── Repeatable Actions (number prefix)
│    │
│    └─── Frame Management
│         ├─── Frame Switching
│         ├─── Nested Frame Support
│         └─── Frame Host Filtering
│
├─── [P0] Browser Integration
│    ├─── Tab Management
│    │    ├─── Tab Navigation
│    │    │    ├─── Switch by Index (MRU/Natural order)
│    │    │    ├─── Next/Previous Tab
│    │    │    ├─── First/Last Tab
│    │    │    └─── Tab Overlay/Omnibar
│    │    │
│    │    ├─── Tab Operations
│    │    │    ├─── Open New Tab
│    │    │    ├─── Duplicate Tab
│    │    │    ├─── Close Tab(s)
│    │    │    ├─── Restore Closed Tab
│    │    │    ├─── Pin/Unpin Tab
│    │    │    └─── Mute/Unmute Tab
│    │    │
│    │    ├─── Tab Organization
│    │    │    ├─── Move Tab (left/right/position)
│    │    │    ├─── Tab Groups (Chrome only)
│    │    │    └─── Tab Indices Display
│    │    │
│    │    └─── Advanced Tab Features
│    │         ├─── Close by Pattern (left/right/others)
│    │         ├─── Tab Search & Filter
│    │         └─── Recently Closed History
│    │
│    ├─── Window Management
│    │    ├─── Move Tab to Window
│    │    ├─── New Window Creation
│    │    ├─── Gather Tabs to Window
│    │    └─── Incognito Mode
│    │
│    ├─── History & Navigation
│    │    ├─── Back/Forward Navigation
│    │    ├─── History Access
│    │    └─── History Backup/Restore
│    │
│    └─── Bookmarks
│         ├─── Bookmark Search
│         ├─── Create Bookmark
│         ├─── Delete from Bookmarks
│         └─── Vim-like Marks
│              ├─── Quick Marks (m + key)
│              ├─── Jump to Mark (' + key)
│              └─── Bookmark-based Marks
│
├─── [P1] Search & Content Discovery
│    ├─── Omnibar (Unified Search Interface)
│    │    ├─── URL/Bookmark Search
│    │    ├─── History Search
│    │    ├─── Tab Search
│    │    ├─── Command Palette
│    │    └─── Omnibar Navigation
│    │         ├─── Pagination (next/prev page)
│    │         ├─── Candidate Cycling
│    │         ├─── Multi-select Opening
│    │         └─── Delete from Results
│    │
│    ├─── Page Search & Find
│    │    ├─── In-page Find (/)
│    │    ├─── Regex Search Support
│    │    ├─── Whole Word Search
│    │    ├─── Case Sensitivity Control
│    │    └─── Smart Case Detection
│    │
│    ├─── Search Engines
│    │    ├─── Pre-configured Engines (8)
│    │    │    ├─── Google (g)
│    │    │    ├─── DuckDuckGo (d)
│    │    │    ├─── Bing (w)
│    │    │    ├─── Wikipedia (W)
│    │    │    ├─── Baidu (b)
│    │    │    └─── Others (YouTube, GitHub, etc.)
│    │    │
│    │    ├─── Custom Search Aliases
│    │    │    ├─── Add Search Alias
│    │    │    ├─── Remove Search Alias
│    │    │    └─── Favicon Integration
│    │    │
│    │    └─── Search Features
│    │         ├─── Search Selected Text
│    │         ├─── Search from Clipboard
│    │         ├─── Site-specific Search
│    │         └─── Interactive Search
│    │
│    └─── Content Operations
│         ├─── Link Detection (clickable patterns)
│         └─── URL Queue Management
│
├─── [P1] Clipboard & Data Operations
│    ├─── Copy Operations (15+ variants)
│    │    ├─── URL Copying
│    │    │    ├─── Current URL
│    │    │    ├─── Current Title
│    │    │    ├─── URL as Markdown Link
│    │    │    ├─── URL as Org-mode Link
│    │    │    └─── Multiple URLs/Titles
│    │    │
│    │    ├─── Content Copying
│    │    │    ├─── Selected Text
│    │    │    ├─── Page Source (HTML/Markdown)
│    │    │    ├─── Page Element HTML
│    │    │    └─── JSON Data
│    │    │
│    │    ├─── Form Data
│    │    │    ├─── Form Field Content
│    │    │    ├─── Multiple Columns
│    │    │    └─── Table Data
│    │    │
│    │    └─── Settings & Configuration
│    │         ├─── Export Settings (JSON)
│    │         └─── Copy All Listed Items
│    │
│    └─── Paste Operations
│         ├─── Paste as HTML
│         ├─── Restore Settings (from clipboard)
│         └─── Form Filling
│
├─── [P1] Text Editing & Input
│    ├─── Editor Integration
│    │    ├─── Vim Editor (ACE-based)
│    │    │    ├─── Input Field Editing
│    │    │    ├─── Textarea Editing
│    │    │    ├─── Select Element Navigation
│    │    │    └─── URL Editing
│    │    │
│    │    └─── Neovim Integration (Chrome only)
│    │         ├─── WebSocket Transport
│    │         ├─── Terminal Rendering
│    │         └─── Full Neovim Features
│    │
│    ├─── Insert Mode Features
│    │    ├─── Line Editing Shortcuts
│    │    │    ├─── Move to Start/End (Ctrl-a/e)
│    │    │    ├─── Delete Line (Ctrl-u)
│    │    │    ├─── Word Movement (Alt-b/f)
│    │    │    └─── Word Deletion (Alt-w/d)
│    │    │
│    │    ├─── Emoji Completion
│    │    │    ├─── Auto-suggest (: + chars)
│    │    │    ├─── Configurable Trigger
│    │    │    └─── 1000+ Emoji Support
│    │    │
│    │    └─── Quote Toggling (Ctrl-')
│    │
│    └─── Editor Configuration
│         ├─── Vim Keybindings
│         ├─── Emacs Keybindings
│         ├─── Tab Completion
│         └─── Focus Management
│
├─── [P1] Session & State Management
│    ├─── Session Operations
│    │    ├─── Save Session (named/LAST)
│    │    ├─── Restore Session
│    │    ├─── List Sessions
│    │    ├─── Delete Session
│    │    └─── Quick Save & Quit (ZZ/ZQ/ZR)
│    │
│    ├─── Settings Management
│    │    ├─── Settings Editor (;e)
│    │    ├─── Export/Import Settings
│    │    ├─── Domain-specific Settings
│    │    └─── Settings Sync (Chrome/Safari)
│    │
│    └─── Repeat & History
│         ├─── Dot Repeat (last action)
│         ├─── Number Prefixes (repeat count)
│         └─── Repeat Threshold Control
│
├─── [P2] Advanced Content Features
│    ├─── PDF Viewer (Chrome only)
│    │    ├─── Custom PDF.js Viewer
│    │    ├─── Full Keyboard Navigation
│    │    ├─── Annotations Support
│    │    ├─── Search in PDF
│    │    └─── Toggle Native Viewer
│    │
│    ├─── Markdown Features
│    │    ├─── Markdown Preview
│    │    │    ├─── Local Parser (marked.js)
│    │    │    ├─── GitHub API Parser
│    │    │    └─── Live Editing
│    │    │
│    │    └─── Export to HTML
│    │
│    ├─── Page Capture
│    │    ├─── Current Viewport
│    │    ├─── Full Page Screenshot
│    │    ├─── Scrollable Element Capture
│    │    └─── Save/Copy Image
│    │
│    └─── Visual Mode Features
│         ├─── Text Selection
│         │    ├─── Caret Mode
│         │    ├─── Range Mode
│         │    ├─── Vim Movement (hjkl, w, b, etc.)
│         │    └─── Center Cursor (zz)
│         │
│         ├─── Selection Actions
│         │    ├─── Search Selected
│         │    ├─── Translate Selected
│         │    ├─── Copy Selected
│         │    └─── Word Search (*)
│         │
│         └─── Character Navigation
│              ├─── Find Forward/Backward (f/F)
│              ├─── Repeat Find (;/,)
│              └─── Visual Cursor (large for visibility)
│
├─── [P2] LLM & AI Integration
│    ├─── LLM Chat
│    │    ├─── Provider Support
│    │    │    ├─── Ollama
│    │    │    ├─── AWS Bedrock
│    │    │    ├─── DeepSeek
│    │    │    ├─── Gemini
│    │    │    └─── Custom Providers (OpenAI compatible)
│    │    │
│    │    ├─── Chat Interface
│    │    │    ├─── Normal Mode Chat (A)
│    │    │    ├─── Visual Mode Chat (with selection)
│    │    │    ├─── Regional Hints Chat (L then l)
│    │    │    └─── Custom System Prompts
│    │    │
│    │    └─── AI Features
│    │         ├─── Chat with Page Content
│    │         ├─── Chat with Selected Text
│    │         └─── Tool Integration (link extraction)
│    │
│    ├─── Translation
│    │    ├─── Google Translate Integration
│    │    └─── Translate Selected Text
│    │
│    └─── Text-to-Speech
│         ├─── Voice Selection
│         ├─── Voice Testing
│         └─── Speak Inline Query
│
├─── [P2] Network & Proxy
│    ├─── Proxy Management (Chrome only)
│    │    ├─── Proxy Modes
│    │    │    ├─── Direct (no proxy)
│    │    │    ├─── ByHost (selective)
│    │    │    ├─── Bypass (inverse selective)
│    │    │    ├─── Always (all traffic)
│    │    │    ├─── System (OS settings)
│    │    │    └─── Clear (no control)
│    │    │
│    │    ├─── Proxy Configuration
│    │    │    ├─── Set Proxy (IP:Port)
│    │    │    ├─── SOCKS5 Support
│    │    │    ├─── Per-site Toggle
│    │    │    └─── Host List Management
│    │    │
│    │    └─── Shortcuts
│    │         ├─── ;pa (always mode)
│    │         ├─── ;pb (byhost mode)
│    │         ├─── ;pd (direct mode)
│    │         ├─── ;ps (system mode)
│    │         └─── cp (toggle current site)
│    │
│    └─── Chrome Pages Access
│         ├─── chrome://about
│         ├─── chrome://bookmarks
│         ├─── chrome://downloads
│         ├─── chrome://extensions
│         ├─── chrome://history
│         └─── chrome://settings
│
├─── [P2] Customization & Extension
│    ├─── Key Mapping System
│    │    ├─── Mode-specific Mappings
│    │    │    ├─── mapkey (Normal mode)
│    │    │    ├─── vmapkey (Visual mode)
│    │    │    ├─── imapkey (Insert mode)
│    │    │    ├─── cmap (Omnibar)
│    │    │    └─── lmap (Lurk mode)
│    │    │
│    │    ├─── Map Operations
│    │    │    ├─── map (create alias)
│    │    │    ├─── unmap (remove mapping)
│    │    │    ├─── iunmap (remove insert mapping)
│    │    │    └─── vunmap (remove visual mapping)
│    │    │
│    │    └─── Advanced Mapping
│    │         ├─── Domain-specific Mappings
│    │         ├─── Repeat Control (repeatIgnore)
│    │         ├─── Leader Key Support
│    │         └─── Sequence Mappings
│    │
│    ├─── User Scripts
│    │    ├─── Custom JavaScript Execution
│    │    ├─── API Integration
│    │    └─── Event Hooks
│    │
│    ├─── Theme & Display
│    │    ├─── Custom CSS Themes
│    │    ├─── Hint Character Sets
│    │    ├─── Hint Alignment (left/center/right)
│    │    ├─── Status Bar Display
│    │    └─── Font Customization
│    │
│    └─── Configuration (50+ settings)
│         ├─── Behavioral Settings
│         │    ├─── smoothScroll
│         │    ├─── scrollStepSize
│         │    ├─── tabsThreshold
│         │    ├─── tabsMRUOrder
│         │    ├─── digitForRepeat
│         │    └─── stealFocusOnLoad
│         │
│         ├─── Search & Find
│         │    ├─── defaultSearchEngine
│         │    ├─── caseSensitive
│         │    ├─── smartCase
│         │    └─── clickablePat
│         │
│         ├─── Visual Preferences
│         │    ├─── hintAlign
│         │    ├─── hintExplicit
│         │    ├─── richHintsForKeystroke
│         │    ├─── omnibarPosition
│         │    └─── verticalTabs
│         │
│         └─── Advanced Settings
│              ├─── blocklistPattern
│              ├─── lurkingPattern
│              ├─── editableBodyCare
│              ├─── ignoredFrameHosts
│              └─── interceptedErrors
│
├─── [P3] Developer Features
│    ├─── Extension API
│    │    ├─── Front API (UI operations)
│    │    ├─── Hints API (hint customization)
│    │    ├─── Clipboard API
│    │    ├─── Normal API (mode control)
│    │    └─── Visual API (selection control)
│    │
│    ├─── Command System
│    │    ├─── Built-in Commands (10+)
│    │    │    ├─── createSession/openSession
│    │    │    ├─── setProxyMode/setProxy
│    │    │    ├─── settings.set
│    │    │    └─── showUsage/help
│    │    │
│    │    └─── Custom Commands
│    │         └─── JavaScript Execution
│    │
│    ├─── Performance
│    │    ├─── Trie-based Lookup
│    │    ├─── Lazy Loading
│    │    └─── Memory Optimization
│    │
│    └─── Debug & Logging
│         ├─── Error Interception
│         └─── Performance Monitoring
│
└─── [P3] Accessibility & UX
     ├─── Visual Feedback
     │    ├─── Mode Indicators
     │    ├─── Status Bar Display
     │    ├─── Rich Hints (keystroke help)
     │    └─── Help System (?)
     │
     ├─── Internationalization
     │    ├─── Language Support (zh-CN, ru-RU)
     │    └─── l10n.json translations
     │
     ├─── Mouse Integration
     │    ├─── Mouse Selection to Query
     │    └─── Keyboard-triggered Mouse Actions
     │
     ├─── Handedness Support
     │    ├─── Right-hand Hints
     │    ├─── Left-hand Hints
     │    └─── Configurable Hint Characters
     │
     └─── Error Pages
          └─── Custom Error Handling
```

## Feature Statistics

| Category                      | Feature Count   | Priority Distribution  |
| ----------------------------- | --------------- | ---------------------- |
| Core Navigation & Interaction | 25+             | P0                     |
| Browser Integration           | 60+             | P0                     |
| Search & Content Discovery    | 40+             | P1                     |
| Clipboard & Data Operations   | 30+             | P1                     |
| Text Editing & Input          | 25+             | P1                     |
| Session & State Management    | 15+             | P1                     |
| Advanced Content Features     | 20+             | P2                     |
| LLM & AI Integration          | 15+             | P2                     |
| Network & Proxy               | 20+             | P2                     |
| Customization & Extension     | 80+             | P2                     |
| Developer Features            | 20+             | P3                     |
| Accessibility & UX            | 15+             | P3                     |
| **TOTAL**                     | **200+**        | ---------------------- |

## Cross-Browser Compatibility Matrix

| Feature Category     | Chrome/Chromium   | Firefox     | Safari       |
| -------------------- | ----------------- | ----------- | ------------ |
| Core Navigation      | ✓ Full            | ✓ Full      | ✓ Full       |
| Browser Integration  | ✓ Full            | ✓ Partial*  | ⚠ Limited**  |
| Search & Discovery   | ✓ Full            | ✓ Full      | ✓ Partial*** |
| Clipboard Operations | ✓ Full            | ✓ Full      | ✓ Full       |
| Text Editing         | ✓ Full            | ✓ Vim only† | ✓ Vim only†  |
| Session Management   | ✓ Full            | ✓ Full      | ✓ Full       |
| PDF Viewer           | ✓ Full            | ✗ None      | ✗ None       |
| LLM Integration      | ✓ Full            | ✓ Full      | ✓ Full       |
| Proxy Management     | ✓ Full            | ✗ None      | ✗ None       |
| Customization        | ✓ Full            | ✓ Full      | ✓ Full       |
| Neovim Integration   | ✓ Full            | ✗ None      | ✗ None       |
| Tab Groups           | ✓ Full            | ✗ None      | ✗ None       |
| Sync                 | ✓ Full            | ✗ None      | ✓ Full       |

*Firefox limitations: No window management, Tab Groups
**Safari limitations: No window management, limited Omnibar, no Markdown preview
***Safari Omnibar partially supported
†Neovim not available, only ACE Vim editor

## Prioritization Rationale

### P0 (Core / Must-have)
Features essential for basic keyboard-based browsing:
- **Navigation modes**: Foundation of the extension
- **Hints system**: Primary interaction method
- **Tab/window management**: Core browser integration
- **Scrolling**: Basic page navigation

### P1 (High Priority / Should-have)
Features that significantly enhance user experience:
- **Omnibar & search**: Power user efficiency
- **Clipboard operations**: Content workflow
- **Text editing**: Form interaction
- **Session management**: State persistence

### P2 (Medium Priority / Nice-to-have)
Features that extend capabilities:
- **PDF viewer**: Specialized content handling
- **LLM integration**: Modern AI features
- **Proxy management**: Network control
- **Advanced customization**: Power user flexibility

### P3 (Low Priority / Optional)
Features for edge cases and advanced users:
- **Developer API**: Extension ecosystem
- **Debug tools**: Troubleshooting
- **Accessibility**: Specialized UX improvements

## Dependencies & Relationships

### Critical Dependencies
```
Core Navigation ──→ Browser Integration ──→ User Experience
      ↓                     ↓
   Hints Mode      Tab/Window Management
      ↓                     ↓
Text Editing      Session Management
```

### Feature Enablers
- **Key Mapping System** enables → All customization
- **Omnibar** enables → Search, Commands, Tab switching
- **Visual Mode** enables → Text selection, AI chat, Translation
- **Settings System** enables → All configuration

### Optional Enhancements
- **LLM Integration** enhances → Regional Hints, Visual Mode
- **PDF Viewer** enhances → Content viewing
- **Proxy** enhances → Network control
- **Neovim** enhances → Text editing

## Usage Notes

This feature tree should be used for:

1. **Scope Management**: Define MVP vs. future releases
2. **Development Planning**: Prioritize feature implementation
3. **Testing Coverage**: Ensure all features are tested
4. **Documentation**: Guide user documentation structure
5. **Release Planning**: Group features by priority for releases

## Recommended Development Phases

**Phase 1 (MVP)**: P0 features only (Core Navigation + Browser Integration)
**Phase 2**: Add P1 features (Search, Clipboard, Editing, Sessions)
**Phase 3**: Add P2 features (PDF, LLM, Proxy, Advanced Customization)
**Phase 4**: Add P3 features (Developer API, Debug, Accessibility)

---

**Document Metadata**:
- Generated: 2026-01-20
- Source: Surfingkeys v1.17.12 codebase analysis
- Methodology: Visual Models for Software Requirements (Feature Tree)
- Analysis: 200+ features across 11 categories
- Key files analyzed: default.js, api.js, start.js, manifest.json, README.md

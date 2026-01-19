# Surfingkeys Glossary

**Domain-Driven Design Ubiquitous Language**

This glossary establishes a shared vocabulary for the Surfingkeys domain. All terms here represent concepts used consistently across code, documentation, and communication.

---

## modes

### mode
An operational state that determines which key bindings are active and how user input is processed. Modes are managed via a priority-based stack.

### normal.mode
The default mode for keyboard-based page navigation and browser control. Most navigation shortcuts work in this mode.

### visual.mode
Mode for text selection and manipulation using vim-like movement commands. Has two sub-states: Caret and Range.

### visual.caret
Visual mode state where cursor moves without selecting text. Indicated by "Caret" in status line.

### visual.range
Visual mode state where cursor movement selects text. Indicated by "Range" in status line.

### insert.mode
Mode activated when focus is in an editable element (input, textarea, contentEditable). Vim editor keybindings available here.

### hints.mode
Mode for keyboard-based link and element selection using hint characters overlaid on clickable elements.

### regional.hints
Special hints mode for selecting large visible elements on the page, triggered by `L`. Used for operations on content blocks.

### passthrough.mode
Temporary mode that suppresses all Surfingkeys bindings, allowing the page's native shortcuts to work. Activated by `Alt-i`.

### ephemeral.passthrough
PassThrough mode with a 1-second timeout, activated by `p`.

### lurk.mode
Dormant state where Surfingkeys is inactive until explicitly activated. Configured via `settings.lurkingPattern` for specific sites.

### disabled.mode
State where Surfingkeys is completely disabled for a site, persisted in settings.blocklist.

### mode.stack
Priority-ordered collection of active modes. The highest priority mode handles events first.

---

## navigation

### hints
Clickable element overlays labeled with characters for keyboard-based selection.

### hint.characters
Character set used to generate hint labels. Default: "asdfgqwertzxcvb". Configurable via `Hints.setCharacters()`.

### hint.align
Positioning of hint labels relative to target elements: left, center, or right.

### continuous.following
Hints mode behavior where hints remain active after selection, allowing multiple consecutive activations.

### scroll.target
The currently focused scrollable element (window or DIV) for scroll operations.

### smooth.scroll
Animated scrolling behavior for j/k/e/d navigation keys. Toggle via `settings.smoothScroll`.

### vim.marks
Named bookmarks (`ma`, `'a`) that point to specific URLs for quick navigation.

---

## input

### omnibar
Unified command and search interface, similar to vim's command line or browser address bar.

### omnibar.type
Sub-mode determining omnibar behavior: Bookmarks, History, URLs, Tabs, Commands, SearchEngine, etc.

### search.alias
Short key (e.g., `g`, `d`, `w`) that triggers a specific search engine in omnibar or search operations.

### search.leader.key
Prefix key for search operations. Default: `s`. Example: `sg` searches selected text with google.

### only.this.site.key
Modifier key for site-restricted searches. Default: `o`. Example: `sog` searches current site with google.

### inline.query
Feature for looking up text using external services (e.g., dictionaries) with results displayed inline.

---

## keybindings

### mapkey
Function to create a keyboard shortcut in normal mode, binding a keystroke sequence to a JavaScript function.

### vmapkey
Visual mode equivalent of mapkey.

### imapkey
Insert mode equivalent of mapkey.

### cmap
Omnibar mode key mapping.

### lmap
Lurk mode key mapping.

### keystroke
A single key press or key combination, encoded as `<Ctrl-x>`, `<Alt-i>`, or plain characters like `j`, `gg`.

### keystroke.sequence
Multiple keystrokes pressed in succession to trigger a command (e.g., `gg` for top of page).

### annotation
Help message describing what a mapped key does, displayed in the help popup (`?`).

### repeatIgnore
Property on mappings indicating the action should not be repeatable via dot (`.`) command.

### domain.mapping
Key mapping that only activates on URLs matching a specific regex pattern.

---

## ui

### frontend
The Surfingkeys UI layer, rendered in a shadow DOM in the top-level content window.

### status.line
Visual indicator showing current mode and other status information.

### banner
Temporary notification message displayed at top/bottom of page.

### popup
Modal message dialog.

### rich.hints
Enhanced hints that show additional context (e.g., keystroke help) when hovering over elements.

### theme
CSS customization for Surfingkeys UI elements via `settings.theme`.

---

## content

### content.window
Any webpage frame where Surfingkeys operates, including top window and iframes.

### top.window
The outermost content window of a page (non-iframe context).

### frame
An iframe element on the page. Surfingkeys can switch focus between frames.

### shadow.dom
Encapsulated DOM tree used by Surfingkeys for its UI to avoid style conflicts with the page.

### clickable.element
Element identified as interactive by Surfingkeys (links, buttons, or elements matching `settings.clickableSelector`).

### editable.element
Input fields, textareas, contentEditable elements, or elements matching `settings.editableSelector`.

### large.element
Element occupying significant viewport space (configurable threshold). Used in Regional Hints mode.

---

## editing

### ace.editor
JavaScript-based code editor with vim/emacs keybindings, used for editing inputs, textareas, and URLs.

### vim.keybindings
Default keybinding set for ACE editor, mimicking vim behavior.

### emacs.keybindings
Alternative keybinding set for ACE editor, activated via `settings.aceKeybindings = "emacs"`.

### neovim.integration
Feature allowing use of external Neovim instance (Chrome only) via WebSocket for editing.

### emoji.completion
Auto-completion of emoji when typing `:` followed by emoji name in insert mode.

---

## browser.integration

### tab.management
Operations for creating, closing, switching, moving, pinning, and muting browser tabs.

### tab.overlay
Visual interface showing all open tabs with hint labels for switching.

### mru.order
Most Recently Used ordering of tabs in overlays/omnibar. Toggle via `settings.tabsMRUOrder`.

### session
Named collection of tab URLs that can be saved and restored.

### window.management
Operations for moving tabs between windows and creating new windows.

### bookmarks
Browser bookmarks, searchable and manageable via omnibar and shortcuts.

### history
Browser navigation history, searchable via omnibar.

---

## clipboard

### clipboard.read
Operation to retrieve text from system clipboard.

### clipboard.write
Operation to copy text to system clipboard.

### yank
Vim terminology for copying text (e.g., `yy` copies current URL).

---

## advanced.features

### proxy.mode
Configuration determining how Chrome routes network traffic: direct, byhost, bypass, always, system, clear.

### llm.provider
AI service integration (Ollama, Bedrock, DeepSeek, Gemini, Custom) for chat features.

### llm.chat
Interactive AI conversation interface, callable via `A` in normal/visual mode.

### system.prompt
Initial instruction given to LLM to set behavior (e.g., "You're a translator").

### pdf.viewer
Integrated PDF.js-based viewer for full Surfingkeys functionality in PDF files.

### markdown.preview
Feature to render markdown from clipboard with live editing.

---

## settings

### settings.object
JavaScript object containing all configuration options for Surfingkeys behavior, UI, and features.

### settings.blocklist
List of sites where Surfingkeys is disabled, persisted across sessions.

### settings.blocklistPattern
Regex pattern matching sites where Surfingkeys should be disabled by default.

### settings.lurkingPattern
Regex pattern matching sites where Surfingkeys should start in lurk mode.

### settings.theme
CSS string for customizing Surfingkeys UI appearance.

---

## runtime

### runtime.message
Communication mechanism between content scripts, background script, and frontend.

### background.script
Extension component running in browser context, handling cross-tab operations and browser API calls.

### content.script
Extension component injected into web pages, handling page interaction and mode management.

### api
Public JavaScript interface exposed to user configuration scripts for customizing Surfingkeys.

---

## actions

### feedkeys
Operation to programmatically simulate keypresses in normal mode.

### scroll.action
Movement operation on scroll target: up, down, pageUp, pageDown, top, bottom, left, right.

### repeat.count
Number prefix for actions (e.g., `3j` scrolls down 3 times). Controlled by `settings.digitForRepeat`.

### dot.repeat
Vim-style repeat of last action by pressing `.`.

---

## data.flow

### command.message
Message sent from content window to frontend to trigger UI operations.

### ack.message
Response message with acknowledgment flag requiring a callback response.

### event.listener
Handler function registered for browser or custom events within a mode.

---

## Quick Reference Tables

### modes.summary

| Mode | Trigger | Purpose | Key Indicator |
|------|---------|---------|---------------|
| Normal | Default | Navigation & control | - |
| Visual | `v` | Text selection | Caret/Range |
| Insert | Auto (focus) | Form input editing | - |
| Hints | `f` | Link following | Hint overlays |
| PassThrough | `Alt-i` | Suppress Surfingkeys | PT icon |
| Lurk | Auto (pattern) | Dormant until called | Grey icon |

### omnibar.types

| Type | Trigger | Purpose |
|------|---------|---------|
| Bookmarks | `b` | Search bookmarks |
| History | `oh` | Search history |
| URLs | `t` | Search bookmarks + history |
| Tabs | `T` | Switch tabs |
| Commands | `:` | Execute commands |
| SearchEngine | `og`/`ow` | Search with engine |

### key.terminology

| Term | Example | Meaning |
|------|---------|---------|
| Keystroke | `j` | Single key press |
| Sequence | `gg` | Multiple keys in order |
| Modifier | `<Ctrl-x>` | Key with modifier |
| Leader | `s` in `sg` | Prefix for related commands |

---

**Document Metadata**
- Version: 1.0
- Last Updated: 2026-01-20
- Based on: Surfingkeys v1.17.12
- Methodology: Domain-Driven Design (Ubiquitous Language)
- Purpose: Shared vocabulary for code, docs, and communication

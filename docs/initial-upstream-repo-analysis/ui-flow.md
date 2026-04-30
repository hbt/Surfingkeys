# Surfingkeys UI Flow

**Based on**: Visual Models for Software Requirements methodology (UI Flow Model)
**Purpose**: Illustrate high-level paths users take to navigate between different screens/modes
**Version**: 1.17.12
**Last Updated**: 2026-01-20

## model.overview

The UI Flow model shows navigation paths between different UI states in Surfingkeys. Unlike traditional applications with distinct screens, Surfingkeys operates through **modes** and **overlays** that appear contextually on web pages.

## model.components

### Primary UI Components

| Component          | Description                                   | Trigger                     | Exit                   |
| ------------------ | --------------------------------------------- | --------------------------- | ---------------------- |
| **Status Bar**     | Shows current mode, proxy status              | Always visible (if enabled) | N/A                    |
| **Mode Indicator** | Displays current mode (Caret/Range in Visual) | Automatic on mode change    | Mode exit              |
| **Omnibar**        | Unified input interface for search/commands   | `t`, `b`, `:`, `o`, etc.    | `Esc`, `Enter`         |
| **Help Popup**     | Displays all available key mappings           | `?`, `u`                    | `Esc`                  |
| **Vim Editor**     | ACE-based editor for text editing             | `I`, `;u`, `;e`, `Ctrl-i`   | `Esc`, `:q`, `:w`      |
| **LLM Chat**       | AI chat interface                             | `A`                         | `Esc`                  |
| **Find Bar**       | In-page search interface                      | `/`                         | `Esc`, `Enter`         |
| **Hints Overlay**  | Interactive hint labels on clickable elements | `f`, `cf`, `af`, etc.       | Hint selected, `Esc`   |
| **Tabs Overlay**   | Visual tab picker with hints                  | `T`                         | Tab selected, `Esc`    |
| **Windows Popup**  | Window selection interface                    | `W`                         | Window selected, `Esc` |
| **Banner**         | Temporary notification message                | Various actions             | Timeout (1.6s)         |
| **Popup**          | Persistent message display                    | `Front.showPopup()`         | User dismissal         |
| **PDF Viewer**     | Custom PDF.js-based viewer                    | PDF file opened             | Navigate away          |

## flow.modes

### Mode State Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         PAGE LOAD                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  Check Pattern │
                    └────────┬───────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
         [blocklisted]  [lurkingPattern]  [normal]
                │            │              │
                ▼            ▼              ▼
         ╔══════════╗  ╔══════════╗  ╔════════════╗
         ║ DISABLED ║  ║   LURK   ║  ║   NORMAL   ║ ◄──┐
         ║   MODE   ║  ║   MODE   ║  ║    MODE    ║    │
         ╚══════════╝  ╚═════╦════╝  ╚══════╦═════╝    │
              ▲              ║              ║           │
              │              ║ Alt-i, p     ║           │
         Alt-s to toggle     ╚═════►────────╝           │
              │                     │                   │ Esc
              └─────────────────────┘                   │
                                    │                   │
                ┌───────────────────┼───────────────────┼────────────┐
                │                   │                   │            │
                ▼                   ▼                   ▼            ▼
         ╔════════════╗      ╔════════════╗      ╔════════════╗  ╔════════════╗
         ║   INSERT   ║      ║   VISUAL   ║      ║   HINTS    ║  ║ PASSTHROUGH║
         ║    MODE    ║      ║    MODE    ║      ║    MODE    ║  ║    MODE    ║
         ╚══════╦═════╝      ╚═════╦══════╝      ╚══════╦═════╝  ╚══════╦═════╝
                │                  │                    │               │
                │ i, click input   │ v, V, /+Enter      │ f, cf, af...  │ Alt-i
                │                  │                    │               │
                └──────────────────┴────────────────────┴───────────────┘
                                   │
                                   │ Esc, Tab, Blur
                                   │
                                   ▼
                            ╔════════════╗
                            ║   NORMAL   ║
                            ║    MODE    ║
                            ╚════════════╝
```

### Mode Transitions Table

| From Mode       | To Mode       | Triggers                                       | Notes                                   |
| --------------- | ------------- | ---------------------------------------------- | --------------------------------------- |
| **Normal**      | Insert        | `i` (hints for input), click input, auto-focus | Automatic when editable element focused |
| **Normal**      | Visual        | `v` (toggle), `V` (select line), `/` + `Enter` | Creates cursor overlay                  |
| **Normal**      | Hints         | `f`, `cf`, `af`, `C`, `I`, `yf`, etc.          | Shows hint labels on elements           |
| **Normal**      | PassThrough   | `Alt-i` (explicit), `p` (ephemeral 1s)         | All keys pass to page                   |
| **Normal**      | Lurk          | `Alt-s` (if on lurking site)                   | Extension mostly inactive               |
| **Normal**      | Disabled      | `Alt-s` (toggle)                               | Extension completely inactive           |
| **Insert**      | Normal        | `Esc`, `Ctrl-[`, blur, `Tab`                   | Returns to normal mode                  |
| **Visual**      | Normal        | `Esc`, `v` (toggle back)                       | Removes cursor overlay                  |
| **Visual**      | Insert        | Select input, `i`                              | Edit selected input                     |
| **Hints**       | Normal        | Hint selected, `Esc`, non-hint key             | Returns after action                    |
| **Hints**       | Hints (cont.) | `cf` (continuous hints)                        | Stays in hints mode                     |
| **PassThrough** | Normal        | `Esc` (explicit), timeout (ephemeral)          | Returns control to SK                   |
| **Lurk**        | Normal        | `Alt-i`, `p`                                   | Activates extension                     |
| **Disabled**    | Normal        | `Alt-s` (toggle)                               | Reactivates extension                   |

## flow.omnibar

### Omnibar Type Flow

```
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════╦═══════╝
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
   [t: URLs]                    [b: Bookmarks]                  [:: Commands]
        │                              │                              │
        ▼                              ▼                              ▼
  ╔═══════════╗                ╔═══════════╗                  ╔═══════════╗
  ║  OMNIBAR  ║                ║  OMNIBAR  ║                  ║  OMNIBAR  ║
  ║   URLs    ║                ║ Bookmarks ║                  ║  Commands ║
  ╚═════╦═════╝                ╚═════╦═════╝                  ╚═════╦═════╝
        │                              │                              │
        ▼                              ▼                              ▼
   Search URLs                    Find bookmarks               Execute command
   History + Bookmarks            Ctrl-Shift-<key>             JavaScript code
        │                         to create mark                     │
        │                              │                              │
        ▼                              ▼                              ▼
   [Enter: Open]                 [Enter: Open]                [Enter: Execute]
   [Ctrl-d: Delete]              [Enter: Open mark]            [Show result]
        │                              │                              │
        └──────────────────────────────┴──────────────────────────────┘
                                       │
                                       ▼
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════════════╝
```

### Omnibar Types & Triggers

| Type               | Trigger Key                     | Description                   | Special Actions                           |
| ------------------ | ------------------------------- | ----------------------------- | ----------------------------------------- |
| **URLs**           | `t`                             | Browse history + bookmarks    | `Ctrl-d`: delete from history             |
| **Bookmarks**      | `b`                             | Browse bookmarks only         | `Ctrl-Shift-<key>`: create vim mark       |
| **AddBookmark**    | `ab`                            | Add current page to bookmarks | Choose folder, create new folder with `/` |
| **History**        | `oh`                            | Browse history only           | ----------------------------------------- |
| **RecentlyClosed** | `X`                             | Recently closed tabs          | ----------------------------------------- |
| **TabURLs**        | (internal)                      | All tab URLs                  | Used by other features                    |
| **Tabs**           | `T` (threshold), `;j` (omnibar) | Switch between tabs           | `T`: overlay or omnibar based on count    |
| **Windows**        | `W`                             | Select window                 | Move tab to selected window               |
| **VIMarks**        | `om`                            | Show vim-like marks           | Jump to marked URL                        |
| **SearchEngine**   | `og`, `ow`, `ob`, etc.          | Trigger search engine         | `o<alias>`: search with engine            |
| **Commands**       | `:`                             | Execute commands              | JavaScript eval, built-in commands        |
| **OmniQuery**      | (internal)                      | Generic omnibar query         | ----------------------------------------- |
| **UserURLs**       | `Front.openOmnibar()`           | Custom URL list               | For extensions via API                    |
| **LLMChat**        | `A`                             | AI chat interface             | With/without selected text                |

## flow.editor

### Vim Editor Flow

```
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════╦═══════╝
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
   [I: Edit Input]              [;u: Edit URL]               [;e: Edit Settings]
        │                              │                              │
        ▼                              ▼                              ▼
  ╔═══════════╗                ╔═══════════╗                  ╔═══════════╗
  ║    VIM    ║                ║    VIM    ║                  ║    VIM    ║
  ║  EDITOR   ║                ║  EDITOR   ║                  ║  EDITOR   ║
  ║  (Input)  ║                ║   (URL)   ║                  ║(Settings) ║
  ╚═════╦═════╝                ╚═════╦═════╝                  ╚═════╦═════╝
        │                              │                              │
        ▼                              ▼                              ▼
   Pick input hint              Edit current URL             Edit config.js
   <input>: 1 line              Tab completion               Full editor
   <textarea>: multi-line       from bookmarks               Syntax highlight
   <select>: navigate           Space: select                :w to save
        │                              │                              │
        ▼                              ▼                              ▼
   [Enter/:w: Save]            [Enter/:w: Open URL]         [:w: Save & reload]
   [Esc/:q: Cancel]            [Esc/:q: Cancel]             [Esc/:q: Cancel]
        │                              │                              │
        └──────────────────────────────┴──────────────────────────────┘
                                       │
                                       ▼
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════════════╝

   ┌─────────────────────────────────────────────────────────────┐
   │              Additional Editor Triggers                      │
   ├─────────────────────────────────────────────────────────────┤
   │  Insert Mode + Ctrl-i  →  Edit current input                │
   │  ;pm (markdown preview) →  Edit markdown (after preview)    │
   └─────────────────────────────────────────────────────────────┘
```

### Editor Context Types

| Context      | Trigger              | Editor Size   | Tab Completion    | Save Action            |
| ------------ | -------------------- | ------------- | ----------------- | ---------------------- |
| `<input>`    | `I` + hint, `Ctrl-i` | Single line   | All page words    | Write to input         |
| `<textarea>` | `I` + hint, `Ctrl-i` | Multi-line    | All page words    | Write to textarea      |
| `<select>`   | `I` + hint           | Multi-line    | N/A               | Select option, close   |
| URL          | `;u`                 | Multi-line    | Bookmarks/History | Open URL in new tab    |
| Settings     | `;e`                 | Full screen   | N/A               | Save settings & reload |
| Markdown     | `;pm` (on preview)   | Full screen   | N/A               | Refresh preview        |

## flow.hints

### Hints Mode Flow

```
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════╦═══════╝
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
   [f: follow]              [I: edit input]                [yf: copy link]
        │                              │                              │
        ▼                              ▼                              ▼
  ╔═══════════╗                ╔═══════════╗                  ╔═══════════╗
  ║   HINTS   ║                ║   HINTS   ║                  ║   HINTS   ║
  ║  (links)  ║                ║  (input)  ║                  ║  (links)  ║
  ╚═════╦═════╝                ╚═════╦═════╝                  ╚═════╦═════╝
        │                              │                              │
        │ Type hint chars              │ Type hint chars              │
        │ Shift: flip overlaps         │                              │
        │ Space: hold hints            │                              │
        │                              │                              │
        ▼                              ▼                              ▼
   [Select link]              [Select input]               [Select link]
        │                              │                              │
        ▼                              ▼                              ▼
   Open in tab/current         ╔════════════════╗             Copy URL to clipboard
        │                      ║     INSERT     ║                    │
        │                      ║      MODE      ║                    │
        │                      ╚════════════════╝                    │
        │                                                             │
        └─────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════════════╝

   ┌─────────────────────────────────────────────────────────────┐
   │                  Hints Mode Variations                       │
   ├───────┬──────────────────────────────────────────────────────┤
   │  f    │ Follow link (current tab)                            │
   │  cf   │ Continuous following (stay in hints)                 │
   │  af   │ Active following (new tab, focus)                    │
   │  C    │ Open in non-active new tab                           │
   │  I    │ Edit input (vim editor)                              │
   │  O    │ Open detected URLs from text                         │
   │  yf   │ Copy link URL                                        │
   │  ya   │ Copy link as markdown                                │
   │  L    │ Regional hints (pick large element)                  │
   └───────┴──────────────────────────────────────────────────────┘
```

### Regional Hints Flow

```
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════╦═══════╝
                                       │
                                       │ L
                                       ▼
                              ╔════════════════╗
                              ║   REGIONAL     ║
                              ║     HINTS      ║ ◄──┐
                              ╚════════╦═══════╝    │
                                       │            │
        ┌──────────────────────────────┼────────────┼──────────┐
        │                              │            │          │
        ▼                              ▼            │          ▼
   [ct: copy text]              [ch: copy HTML]    │     [d: delete]
        │                              │            │          │
        ▼                              ▼            │          ▼
   Copy to clipboard           Copy to clipboard   │    Remove element
        │                              │            │          │
        │                              │            │          │
        │                              ▼            │          │
        │                         [l: chat]         │          │
        │                              │            │          │
        │                              ▼            │          │
        │                      ╔════════════════╗   │          │
        │                      ║   LLM CHAT     ║   │          │
        │                      ║   (element)    ║   │          │
        │                      ╚════════╦═══════╝   │          │
        │                              │            │          │
        │                              │ Esc        │          │
        └──────────────────────────────┴────────────┴──────────┘
                                       │
                                       │ Esc
                                       ▼
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════════════╝
```

## flow.llm

### LLM Chat Flow

```
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════╦═══════╝
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        │ A (no selection)             │ v, select, A                 │ L, l
        ▼                              ▼                              ▼
  ╔═══════════╗                ╔═══════════╗                  ╔═══════════╗
  ║  LLM CHAT ║                ║  LLM CHAT ║                  ║  LLM CHAT ║
  ║  (empty)  ║                ║  (text)   ║                  ║ (element) ║
  ╚═════╦═════╝                ╚═════╦═════╝                  ╚═════╦═════╝
        │                              │                              │
        ▼                              ▼                              ▼
   Type question              Selected text as context     Element text as context
   Choose provider            Type question                Type question
   Set system prompt          Get AI response              Get AI response
        │                              │                              │
        ▼                              ▼                              ▼
   [Send message]             [Send message]               [Send message]
        │                              │                              │
        ▼                              ▼                              ▼
   Get AI response            Continue chat                Continue chat
        │                              │                              │
        │                              │                              │
        └──────────────────────────────┴──────────────────────────────┘
                                       │
                                       │ Esc, close
                                       ▼
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════════════╝

   ┌─────────────────────────────────────────────────────────────┐
   │              LLM Provider Configuration                      │
   ├─────────────────────────────────────────────────────────────┤
   │  Ollama       → Local model (403 fix required)              │
   │  AWS Bedrock  → Claude models                               │
   │  DeepSeek     → DeepSeek API                                │
   │  Gemini       → Google Gemini                               │
   │  Custom       → OpenAI-compatible APIs                      │
   └─────────────────────────────────────────────────────────────┘
```

## flow.visual

### Visual Mode Flow

```
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════╦═══════╝
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        │ v (toggle)                   │ V (line)                     │ / + Enter
        ▼                              ▼                              ▼
  ╔═══════════╗                ╔═══════════╗                  ╔═══════════╗
  ║  VISUAL   ║                ║  VISUAL   ║                  ║  VISUAL   ║
  ║  (Caret)  ║ ◄────v─────────║  (Range)  ║                  ║  (Find)   ║
  ╚═════╦═════╝                ╚═════╦═════╝                  ╚═════╦═════╝
        │                              │                              │
        │ hjkl, w, b, e, 0, $          │ hjkl, w, b, e, 0, $          │ n, N
        │ f, F, ;, ,                   │ Select text                  │ Navigate
        │ zz (center)                  │                              │
        │                              ▼                              │
        │                      ┌───────────────┐                      │
        │                      │  Actions on   │                      │
        │                      │  Selected     │                      │
        │                      └───────┬───────┘                      │
        │                              │                              │
        │        ┌─────────────────────┼─────────────────────┐        │
        │        │                     │                     │        │
        │        ▼                     ▼                     ▼        │
        │   [sg: search]         [y: yank]            [A: chat]       │
        │        │                     │                     │        │
        │        ▼                     ▼                     ▼        │
        │   Search with google    To clipboard      ╔════════════╗   │
        │        │                     │            ║  LLM CHAT  ║   │
        │        │                     │            ╚════════════╝   │
        │        │                     │                     │        │
        └────────┴─────────────────────┴─────────────────────┴────────┘
                                       │
                                       │ Esc, v
                                       ▼
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════════════╝
```

## flow.tabs

### Tab Navigation Flow

```
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════╦═══════╝
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        │ E/R (prev/next)              │ T (switch)                   │ gt/gT
        ▼                              ▼                              ▼
  Switch directly        ┌──────────[check count]──────────┐    Switch by index
        │                │                                  │          │
        │                ▼                                  ▼          │
        │     [count < tabsThreshold]         [count >= tabsThreshold]│
        │                │                                  │          │
        │                ▼                                  ▼          │
        │        ╔═══════════╗                      ╔═══════════╗     │
        │        ║   TABS    ║                      ║  OMNIBAR  ║     │
        │        ║  OVERLAY  ║                      ║   Tabs    ║     │
        │        ╚═════╦═════╝                      ╚═════╦═════╝     │
        │              │                                  │            │
        │              ▼                                  ▼            │
        │     Type hint char                    Type to filter        │
        │     or ; to omnibar                   Enter to switch       │
        │              │                                  │            │
        │              ▼                                  │            │
        │     [Select tab]                               │            │
        │              │                                  │            │
        └──────────────┴──────────────────────────────────┴────────────┘
                                       │
                                       ▼
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════════════╝

   ┌─────────────────────────────────────────────────────────────┐
   │                 Tab Operations                               │
   ├───────┬──────────────────────────────────────────────────────┤
   │  x    │ Close current tab                                    │
   │  X    │ Restore closed tab                                   │
   │  <<   │ Move tab left                                        │
   │  >>   │ Move tab right                                       │
   │  W    │ Move tab to window                                   │
   │  yt   │ Duplicate tab                                        │
   │  on   │ Open new tab                                         │
   │  ;gt  │ Gather tabs to current window                        │
   └───────┴──────────────────────────────────────────────────────┘
```

## flow.find

### Find in Page Flow

```
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════╦═══════╝
                                       │
                                       │ /
                                       ▼
                              ╔════════════════╗
                              ║   FIND BAR     ║
                              ║    (input)     ║
                              ╚════════╦═══════╝
                                       │
                                       │ Type search term
                                       │ Ctrl-Enter: whole word
                                       │
                                       ▼
                              ┌────────────────┐
                              │  Highlight all │
                              │  occurrences   │
                              └────────┬───────┘
                                       │
                                       │ Enter
                                       ▼
                              ╔════════════════╗
                              ║     VISUAL     ║
                              ║     (Caret)    ║
                              ╚════════╦═══════╝
                                       │
                                       │ n: next
                                       │ N: previous
                                       │
                                       ▼
                              Jump to occurrence
                                       │
                                       │ Esc
                                       ▼
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════════════╝
```

## flow.settings

### Settings & Session Flow

```
                              ╔════════════════╗
                              ║     NORMAL     ║
                              ║      MODE      ║
                              ╚════════╦═══════╝
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        │ ;e                           │ ZZ/ZQ/ZR                     │ yj/yi
        ▼                              ▼                              ▼
  ╔═══════════╗                ╔═══════════╗                  ╔═══════════╗
  ║    VIM    ║                ║  SESSION  ║                  ║ CLIPBOARD ║
  ║  EDITOR   ║                ║ OPERATION ║                  ║ OPERATION ║
  ║(Settings) ║                ╚═════╦═════╝                  ╚═════╦═════╝
  ╚═════╦═════╝                      │                              │
        │                            │                              │
        │ Edit config                ▼                              ▼
        │                      ZZ: Save & Quit              Export/Import
        │                      ZR: Restore LAST             Settings
        │                      ZQ: Just Quit                │
        │                            │                      │
        │                            │                      │
        │                            ▼                      │
        │                    ╔════════════════╗             │
        │                    ║  COMMAND MODE  ║             │
        │                    ║  (: omnibar)   ║             │
        │                    ╚════════╦═══════╝             │
        │                            │                      │
        │                            ▼                      │
        │                    createSession <name>           │
        │                    openSession <name>             │
        │                    listSession                    │
        │                    deleteSession <name>           │
        │                            │                      │
        ▼                            │                      │
   [:w to save & reload]             │                      │
        │                            │                      │
        └────────────────────────────┴──────────────────────┘
                                     │
                                     │ Esc
                                     ▼
                            ╔════════════════╗
                            ║     NORMAL     ║
                            ║      MODE      ║
                            ╚════════════════╝
```

## flow.pdf

### PDF Viewer Flow

```
                              ┌────────────────┐
                              │   Open PDF     │
                              │      URL       │
                              └────────┬───────┘
                                       │
                                       ▼
                            ┌──────────────────┐
                            │  Check PDF type  │
                            └────────┬─────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                                 │
                    ▼                                 ▼
            [.pdf extension]                  [inline PDF]
                    │                                 │
                    ▼                                 ▼
          ╔═════════════════╗              ╔═════════════════╗
          ║  SURFINGKEYS    ║              ║   CHROME PDF    ║
          ║   PDF VIEWER    ║              ║     VIEWER      ║
          ║   (pdf.js)      ║              ║   (limited)     ║
          ╚═══════╦═════════╝              ╚═══════╦═════════╝
                  │                                 │
                  │                                 │ ;s toggle
                  │ ;s toggle                       │
                  │                                 │
                  └─────────────┬───────────────────┘
                                │
                                ▼
                       All SK features work:
                       - Scroll (j/k/e/d)
                       - Search (/)
                       - Hints (f)
                       - Visual mode (v)
                       - Zoom
                       - Annotations
                                │
                                │ Navigate away
                                ▼
                       ╔════════════════╗
                       ║     NORMAL     ║
                       ║      MODE      ║
                       ╚════════════════╝
```

## paths.common

### Common User Journeys

#### Journey 1: Quick Link Following

```
[Page Load] → [Normal Mode] → [f: hints] → [Type hint] → [Link Opens] → [Normal Mode]
```

#### Journey 2: Search and Navigate

```
[Page Load] → [Normal Mode] → [t: omnibar] → [Type search]
    → [Enter: open] → [Page Load] → [Normal Mode]
```

#### Journey 3: Edit Input with Vim

```
[Page Load] → [Normal Mode] → [I: hints] → [Pick input] → [Vim Editor]
    → [:w save] → [Normal Mode]
```

#### Journey 4: Visual Selection and Search

```
[Page Load] → [Normal Mode] → [v: visual] → [Move cursor] → [v: range]
    → [Select text] → [sg: search] → [New tab opens] → [Normal Mode]
```

#### Journey 5: Chat with AI about Content

```
[Page Load] → [Normal Mode] → [L: regional hints] → [Pick element]
    → [l: chat] → [LLM Chat] → [Conversation] → [Esc] → [Normal Mode]
```

#### Journey 6: Bookmark & Mark Navigation

```
[Page Load] → [Normal Mode] → [b: bookmarks] → [Search]
    → [Ctrl-Shift-f: create mark] → [Normal Mode]
    → [Later] → ['f: jump to mark] → [Page Load]
```

#### Journey 7: Tab Management

```
[Multiple Tabs] → [Normal Mode] → [T: tab overlay/omnibar]
    → [Select tab] → [Switch to tab] → [Normal Mode]
```

#### Journey 8: Session Management

```
[Multiple Tabs] → [Normal Mode] → [:: command] → [createSession work]
    → [Later] → [:: command] → [openSession work]
    → [All tabs restored] → [Normal Mode]
```

## matrix.navigation

### Key-to-Screen Navigation Matrix

| From Screen/Mode   | Key(s)                | To Screen/Mode              | Notes                      |
| ------------------ | --------------------- | --------------------------- | -------------------------- |
| **Normal**         | `?`, `u`              | Help Popup                  | Show all mappings          |
| **Normal**         | `t`                   | Omnibar (URLs)              | Search history + bookmarks |
| **Normal**         | `b`                   | Omnibar (Bookmarks)         | Search bookmarks only      |
| **Normal**         | `:`                   | Omnibar (Commands)          | Execute commands/JS        |
| **Normal**         | `f`                   | Hints (Links)               | Follow links               |
| **Normal**         | `I`                   | Hints (Inputs) → Vim Editor | Edit inputs                |
| **Normal**         | `v`                   | Visual (Caret)              | Start text selection       |
| **Normal**         | `/`                   | Find Bar                    | Search in page             |
| **Normal**         | `A`                   | LLM Chat                    | AI conversation            |
| **Normal**         | `;e`                  | Vim Editor (Settings)       | Edit configuration         |
| **Normal**         | `;u`                  | Vim Editor (URL)            | Edit URL to open           |
| **Normal**         | `;pm`                 | Markdown Preview            | Preview from clipboard     |
| **Normal**         | `T`                   | Tabs Overlay/Omnibar        | Switch tabs                |
| **Normal**         | `W`                   | Windows Popup               | Move tab to window         |
| **Normal**         | `L`                   | Regional Hints              | Pick large element         |
| **Normal**         | `i`, Click Input      | Insert Mode                 | Edit in input              |
| **Normal**         | `Alt-i`               | PassThrough Mode            | Disable SK temporarily     |
| **Normal**         | `Alt-s`               | Disabled/Lurk               | Toggle SK on site          |
| **Visual (Caret)** | `v`                   | Visual (Range)              | Start selecting text       |
| **Visual (Range)** | `sg`, `sw`, etc.      | Search (New Tab)            | Search selected text       |
| **Visual (Range)** | `y`                   | Normal + Clipboard          | Copy to clipboard          |
| **Visual (Range)** | `A`                   | LLM Chat                    | Chat about selection       |
| **Visual**         | `Esc`, `v`            | Normal                      | Exit visual mode           |
| **Insert**         | `Ctrl-i`              | Vim Editor                  | Edit with vim              |
| **Insert**         | `Esc`, `Ctrl-[`, Blur | Normal                      | Exit insert mode           |
| **Hints**          | Type hints            | Normal                      | Action executed            |
| **Hints**          | `Esc`                 | Normal                      | Cancel hints               |
| **Regional Hints** | `ct`, `ch`, `d`       | Normal                      | Action executed            |
| **Regional Hints** | `l`                   | LLM Chat                    | Chat about element         |
| **Omnibar**        | `Enter`               | Normal + Action             | Execute action             |
| **Omnibar**        | `Esc`                 | Normal                      | Cancel omnibar             |
| **Vim Editor**     | `:w`, `Enter`         | Normal + Action             | Save & apply               |
| **Vim Editor**     | `:q`, `Esc`           | Normal                      | Cancel edit                |
| **LLM Chat**       | `Esc`                 | Normal                      | Close chat                 |
| **Find Bar**       | `Enter`               | Visual (Caret)              | Start navigation           |
| **Find Bar**       | `Esc`                 | Normal                      | Cancel find                |
| **PassThrough**    | `Esc`                 | Normal                      | Reactivate SK              |
| **Lurk**           | `Alt-i`, `p`          | Normal                      | Activate SK                |
| **Disabled**       | `Alt-s`               | Normal                      | Enable SK                  |

## config.display

### UI Component Display Configuration

| Component          | Position                                          | Size                 | Dismissal           | Persistence         |
| ------------------ | ------------------------------------------------- | -------------------- | ------------------- | ------------------- |
| **Status Bar**     | Bottom (default)                                  | 1 line               | N/A                 | Always (if enabled) |
| **Mode Indicator** | Bottom                                            | 1 line               | Mode change         | Mode duration       |
| **Omnibar**        | Middle/Bottom (setting)                           | Auto, max 10 results | `Esc`, `Enter`      | Until action        |
| **Help Popup**     | Full screen overlay                               | Full                 | `Esc`               | Until dismissed     |
| **Vim Editor**     | Full screen (textarea/settings) or inline (input) | Depends on context   | `:q`, `Esc`         | Until saved/quit    |
| **LLM Chat**       | Right sidebar                                     | 40% width            | `Esc`, Close button | Until closed        |
| **Find Bar**       | Bottom                                            | 1 line               | `Esc`, `Enter`      | Until dismissed     |
| **Hints**          | Inline on elements                                | Small labels         | Action, `Esc`       | Until action        |
| **Tabs Overlay**   | Center                                            | Grid/List            | Action, `Esc`       | Until action        |
| **Windows Popup**  | Center                                            | List                 | Action, `Esc`       | Until action        |
| **Banner**         | Top                                               | 1-2 lines            | Auto timeout (1.6s) | Temporary           |
| **Popup**          | Center modal                                      | Medium               | User action         | Until dismissed     |
| **Regional Hints** | Full screen overlay                               | Large hints          | Action, `Esc`       | Until action        |
| **PDF Viewer**     | Full screen                                       | Full                 | Navigate away       | Until closed        |

## notes.implementation

### Technical Notes

1. **ShadowRoot Architecture**: All UI components are rendered inside a shadowRoot attached to the top-level content window, ensuring isolation from page styles and scripts.

2. **Message Passing**: UI components communicate through a message passing system:
   - Content → Top → Frontend (for UI commands)
   - Frontend → Top → Content (for responses)
   - Background is bypassed in favor of direct content-frontend communication

3. **Mode State Management**: Modes are managed by a state machine in `mode.js`, with each mode having entry/exit handlers and key event handlers.

4. **Omnibar Types**: The Omnibar is a polymorphic component that adapts its behavior based on the `type` parameter, with different renderers and key handlers for each type.

5. **Hints Generation**: Hints are dynamically generated by traversing the DOM for clickable elements, using either the default hint characters or custom sets defined by `Hints.setCharacters()`.

6. **Visual Mode Cursor**: The large cursor in Visual mode is created as a DOM element positioned absolutely to follow text selection, making it highly visible for navigation.

7. **PDF Viewer Integration**: The PDF.js viewer is loaded as a separate page that replaces the default Chrome PDF viewer, with full integration of Surfingkeys keyboard shortcuts.

8. **LLM Provider Abstraction**: LLM providers are abstracted through a common interface, allowing multiple providers to be supported through the same UI.

## summary

Surfingkeys employs a **mode-based navigation system** with **contextual overlays** rather than traditional multi-screen navigation. Users flow between:

1. **Modes** (Normal, Visual, Insert, Hints, PassThrough, Lurk, Disabled) as primary states
2. **Overlays** (Omnibar, Editor, Chat, Find) as temporary contexts
3. **Actions** (search, navigate, edit, copy) as state transitions

The UI flow is designed for **keyboard efficiency** with minimal visual disruption, maintaining context while providing powerful functionality through layered interactions.

---

**Document Metadata**:
- Generated: 2026-01-20
- Source: Surfingkeys v1.17.12 codebase analysis
- Methodology: Visual Models for Software Requirements (UI Flow Model)
- Analysis: 8 primary UI components, 7 modes, 50+ navigation paths
- Key files analyzed: front.js, frontend.js, omnibar.js, llmchat.js, command.js, mode.js, normal.js, visual.js, hints.js

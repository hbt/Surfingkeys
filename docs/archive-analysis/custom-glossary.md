# Custom Glossary - Archive Branch

## glossary.overview

This glossary documents custom domain concepts introduced in the archive branch (2018-2025 fork). It focuses **exclusively** on custom additions and does not repeat upstream Surfingkeys concepts documented in the main branch glossary.

**Scope:** Custom patterns, abstractions, and terminology unique to the hbt fork

**Related Files:**
- `content_scripts/hbt.js` - Custom command implementations
- `bg.js` - Background handlers for custom commands
- `custom-commons.js` - Shared configuration
- `.surfingkeysrc` - User configuration and keybindings

---

## glossary.magic_pattern_system

### glossary.magic.overview

**Term:** Magic Pattern System

**Definition:** A command modifier system that extends tab operations with directional and scope-based parameters, enabling Vim-like composability with count and direction modifiers.

**Purpose:** Transform simple tab operations into powerful, composable commands that can operate on specific tab subsets based on direction, window scope, tab state, or hierarchical relationships.

### glossary.magic.architecture

**Pattern:** Commands suffixed with `M` accept a magic key parameter:
```javascript
// Frontend invocation
CustomCommands.tabCloseM(magicKey)

// Backend handler
async tabCloseM(message, sender, sendResponse) {
    let magic = message.magic;          // e.g., "DirectionRight"
    let repeats = message.repeats || -1; // count from Normal.repeats
    // ... operate on tabs matching magic + repeats criteria
}
```

**Key Mapping Flow:**
1. User presses command key + magic modifier (e.g., `tc` + `e`)
2. Frontend calls `tabCheckMagicByKey(k)` to resolve magic name
3. Magic name sent to background handler
4. Background applies magic filter to select tabs
5. Operation executes on filtered tabs

### glossary.magic.directives

**Configuration:** Defined in `CustomCommonConfig.tabMagic` (custom-commons.js)

#### Directional Magic (Navigation-based)

| Magic Name | Key | Description | Inclusive |
|-----------|-----|-------------|-----------|
| `DirectionRight` | `e` | Tabs to the right of current | No |
| `DirectionRightInclusive` | `E` | Current + tabs to the right | Yes |
| `DirectionLeft` | `q` | Tabs to the left of current | No |
| `DirectionLeftInclusive` | `Q` | Current + tabs to the left | Yes |

**Use Cases:**
- Close 3 tabs to the right: `3` `tc` `e`
- Reload all tabs from current rightward: `tc` `E`

#### Scope Magic (Window/State-based)

| Magic Name | Key | Description |
|-----------|-----|-------------|
| `AllTabsInCurrentWindowExceptActiveTab` | `c` | Current window, excluding active tab |
| `AllTabsInCurrentWindow` | `C` | Entire current window |
| `AllWindowsNoPinnedTabsExceptCurrentWindow` | `w` | Other windows, no pinned tabs |
| `AllOtherTabsInOtherWindowsExceptAllTabsInCurrentWindow` | `W` | All tabs in other windows only |
| `AllIncognitoWindowsIncludingPinnedIncognitoTabs` | `o` | All incognito tabs across windows |
| `AllTabsInAllWindowExceptActiveTab` | `g` | Global scope, except current |
| `currentTab` | `t` | Only the active tab |

**Use Cases:**
- Close all tabs in window except current: `tc` `c`
- Reload all incognito tabs: `tr` `o`

#### Hierarchy Magic (Tab Relationships)

| Magic Name | Key | Description |
|-----------|-----|-------------|
| `highlightedTabs` | `h` | Tabs marked as highlighted |
| `childrenTabs` | `K` | Direct child tabs (non-recursive) |
| `childrenTabsRecursively` | `k` | All descendant tabs (recursive) |

**Use Cases:**
- Close all child tabs: `tc` `k`
- Reload highlighted tabs: `tr` `h`

### glossary.magic.count_integration

**Repeats System:** Commands integrate with Surfingkeys' `Normal.repeats` for count-based operations

**Example:**
```javascript
self.tabCloseM = async (k) => {
    let magic = tabCheckMagicByKey(k);
    let ret = await aruntime({
        action: "tabCloseM",
        repeats: Normal.repeats || -1,  // -1 = all matching tabs
        magic: magic,
    });
};
```

**Semantics:**
- `repeats = -1`: Apply to all tabs matching magic filter
- `repeats = N`: Apply to first N tabs matching magic filter
- Direction + count: `3` `tc` `e` = close 3 tabs to the right

### glossary.magic.commands

**Magic-Enabled Commands:** (Commands suffixed with `M`)

| Command | Purpose | Magic Support |
|---------|---------|---------------|
| `tabCloseM` | Close tabs by filter | ✓ All magic types |
| `tabReloadM` | Reload tabs by filter | ✓ All magic types |
| `tabDetachM` | Detach tabs to new window | ✓ All magic types |
| `tabTogglePinM` | Pin/unpin tabs by filter | ✓ All magic types |
| `tabPrintM` | Print tabs as PDF | ✓ All magic types |
| `tabReverseM` | Reverse tab order | ✓ Scope magic |
| `tabToggleHighlightM` | Toggle highlight state | ✓ All magic types |
| `tabMoveHighlighted` | Move highlighted tabs | Uses `h` magic |
| `copyTabURLsM` | Copy URLs from tabs | ✓ All magic types |
| `bookmarkAddM` | Bookmark tabs by filter | ✓ All magic types |
| `bookmarkRemoveM` | Remove bookmarks by filter | ✓ All magic types |

---

## glossary.custom_mapping_system

### glossary.amap

**Term:** amap (Annotation Mapping)

**Definition:** Custom mapping function that binds keys to commands using annotation-based lookups instead of direct function references.

**Signature:**
```javascript
amap(keys, annotation)
```

**Purpose:** Decouple keybindings from implementation, enabling:
- Command introspection and documentation generation
- Centralized command registry
- Consistent mapping patterns

**Example:**
```javascript
// Define in hbt.js
MyCustomMapping.acmds.set("zoom reset", {
    mode: "Normal",
    meta: {
        word: "Zr",
        annotation: "zoom reset",
        code: resetZoomFunction,
        options: {}
    }
});

// Map in .surfingkeysrc
amap("Zr", "zoom reset");
```

**vs. mapkey():**
- `mapkey()` - Direct function binding (upstream pattern)
- `amap()` - Annotation-based binding (custom pattern)

### glossary.my_custom_mapping

**Term:** MyCustomMapping

**Definition:** Singleton class managing the custom command registry and initialization.

**Responsibilities:**
1. Extract command metadata from code annotations
2. Build searchable command map (`acmds`)
3. Enable programmatic command introspection
4. Support documentation generation

**Usage:**
```javascript
// Initialization (.surfingkeysrc)
let mc = new MyCustomMapping();
mc.init();

// Query commands
MyCustomMapping.acmds.get("zoom reset");  // Returns command metadata
MyCustomMapping.acmds.keys();             // All annotations
```

### glossary.custom_commands_namespace

**Term:** CustomCommands

**Definition:** IIFE (Immediately Invoked Function Expression) namespace containing all custom command implementations.

**Structure:**
```javascript
var CustomCommands = (function() {
    let self = {};

    self.commandName = function() { /* implementation */ };
    // ... ~100+ custom commands

    return self;
})();
```

**Purpose:** Isolate custom code from upstream to minimize merge conflicts

---

## glossary.architectural_patterns

### glossary.aruntime

**Term:** aruntime (Async Runtime)

**Definition:** Promise wrapper around Surfingkeys' `runtime.command()` for cleaner async/await syntax.

**Implementation:**
```javascript
async function aruntime(obj) {
    return new Promise((resolve) => {
        runtime.command(obj, resolve);
    });
}
```

**Usage:**
```javascript
// Before (callback-based)
runtime.command({ action: "..." }, function(res) {
    // handle response
});

// After (async/await)
let res = await aruntime({ action: "..." });
```

### glossary.custom_common_config

**Term:** CustomCommonConfig

**Definition:** Shared configuration object for custom functionality.

**Location:** `custom-commons.js`

**Contents:**
- `tabMagic`: Magic directive definitions
- `incognitoBookmarkFolder`: Incognito bookmark folder name

**Purpose:** Centralize configuration accessible from both content scripts and background

### glossary.tab_check_magic_by_key

**Term:** tabCheckMagicByKey

**Definition:** Helper function mapping magic modifier keys to magic directive names.

**Implementation:**
```javascript
function tabCheckMagicByKey(k) {
    let map = new Map();
    let magics = CustomCommonConfig.tabMagic;

    Object.keys(magics).forEach((name) => {
        map.set(magics[name].key, name);
    });

    return map.get(k);  // Returns magic name, e.g., "DirectionRight"
}
```

---

## glossary.custom_features

### glossary.tab_highlighting

**Term:** Tab Highlighting System

**Definition:** Mechanism to mark tabs for batch operations, similar to visual selection in Vim.

**Operations:**
- `tabToggleHighlight` - Mark/unmark current tab
- `tabToggleHighlightM` - Mark/unmark using magic filter
- `tabHighlightClearAll` - Clear all highlights
- `tabMoveHighlighted` - Move all highlighted tabs

**Use Case:** Select non-contiguous tabs for batch close/move/bookmark

### glossary.tab_quickmarks

**Term:** Tab Quickmarks

**Definition:** Named bookmarks for tab positions, enabling quick tab navigation.

**Operations:**
- `tabQuickMarkSave` (t\`) - Save current tab position to mark
- `tabQuickMarkJump` (\`) - Jump to marked tab

**Scope:** Session-persistent (not saved to disk)

### glossary.vim_marks

**Term:** VIM Marks (URL Marks)

**Definition:** URL-based marks system inspired by Vim, storing URLs for quick access.

**Operations:**
- `addVIMark2` (`m`) - Add current URL to mark
- `jumpVIMark` (`'`) - Open marked URL

**vs. Tab Quickmarks:**
- VIM Marks: Store URLs (persistent across sessions if synced)
- Tab Quickmarks: Store tab positions (session-only)

### glossary.hint_match_patterns

**Term:** Hint Match Patterns

**Definition:** Enhanced hint mode that filters links by regex pattern before hinting.

**Implementation:**
```javascript
CustomCommands.hintMatchPatterns(pattern, direction)
```

**Use Cases:**
- Next page: `]]` matches `/(next|>|›|»|forward)/i`
- Prev page: `[[` matches `/(prev|back|<|‹)/i`

**Purpose:** Intelligent pagination without hardcoded selectors

### glossary.bajax

**Term:** bajax (Background Ajax)

**Definition:** Cross-origin HTTP request proxy via background page.

**Why:** Content scripts have CORS restrictions; background page can make arbitrary requests

**Usage:**
```javascript
await CustomCommands.bajax({
    url: "https://api.example.com/data",
    method: "GET",
    // ... request config
});
```

### glossary.background_local_storage

**Term:** Background LocalStorage Access

**Definition:** Commands to read/write background page's localStorage from content scripts.

**Methods:**
- `setBackgroundLocalStorage({ key, value })`
- `getBackgroundLocalStorage({ key })`

**Purpose:** Persist state globally across all tabs

---

## glossary.integration_features

### glossary.pushbullet_toggle

**Term:** PushBullet Integration

**Definition:** Toggle PushBullet notification forwarding from background page.

**Command:** `togglePushBullet`

**Implementation:** Communicates with PushBullet extension or API

### glossary.url_increment_decrement

**Term:** URL Path Manipulation

**Definition:** Vim-like URL path increment/decrement for pagination.

**Commands:**
- `urlIncrementLastPath` (Ctrl-a) - Increment numeric path component
- `urlDecrementLastPath` (Ctrl-x) - Decrement numeric path component

**Example:**
```
https://example.com/page/5
Ctrl-a → https://example.com/page/6
Ctrl-x → https://example.com/page/4
```

### glossary.external_editor

**Term:** External Editor Integration

**Definition:** Edit URLs using external Vim/GVim editor.

**Command:** `urlEditExternalEditor`

**Workflow:**
1. Command opens external editor with current URL
2. User edits URL
3. Modified URL replaces current page

**Requirement:** System integration (not portable)

---

## glossary.configuration_patterns

### glossary.mmconfig

**Term:** mmconfig (Multi-Module Config)

**Definition:** IDE navigation helper object organizing configuration by feature category.

**Structure:**
```javascript
mmconfig.Zoom = {};        // Zoom commands
mmconfig.Tabs = {};        // Tab commands
mmconfig.Clipboard = {};   // Clipboard commands
// ... etc
```

**Purpose:** Enable IDE "go to declaration" navigation using region comments

**Note:** Has no runtime effect, purely organizational

### glossary.region_comments

**Term:** Region Comments

**Definition:** IDE folding markers organizing `.surfingkeysrc` into collapsible sections.

**Format:**
```javascript
//region SectionName
// ... commands and configuration
//endregion
```

**Purpose:** Navigate large config file (~700 lines) efficiently in IDEs like IntelliJ

---

## glossary.comparison_with_upstream

### glossary.custom_vs_upstream_mapping

| Aspect | Upstream | Custom (Archive) |
|--------|----------|------------------|
| Mapping Function | `mapkey()` | `amap()` + `mapkey()` |
| Command Registry | Implicit | Explicit (`MyCustomMapping.acmds`) |
| Documentation | Manual | Auto-generated from annotations |
| Magic Pattern | ❌ None | ✓ Directional + Scope modifiers |
| Count Integration | Basic | Enhanced with magic filters |
| Code Organization | Monolithic config | Namespace isolation (`CustomCommands`) |

---

## glossary.terminology_quick_reference

| Term | Short Definition |
|------|------------------|
| **Magic Pattern** | Direction/scope modifier system for tab operations |
| **Magic Key** | Single character selecting a magic directive (e.g., `e` = DirectionRight) |
| **Magic Command** | Command ending with `M` accepting magic key parameter |
| **amap** | Annotation-based key mapping function |
| **MyCustomMapping** | Custom command registry class |
| **CustomCommands** | Namespace for all custom command implementations |
| **tabMagic** | Configuration object defining all magic directives |
| **aruntime** | Promise wrapper for `runtime.command()` |
| **Repeats** | Count prefix from `Normal.repeats` (Vim-style) |
| **Tab Highlighting** | Visual-mode-like tab selection system |
| **VIM Marks** | URL bookmark system (persistent) |
| **Tab Quickmarks** | Tab position marks (session-only) |
| **bajax** | Background page HTTP proxy for CORS bypass |
| **mmconfig** | IDE navigation helper for config organization |

---

## glossary.migration_notes

**When porting custom features to new upstream:**

1. **Magic Pattern** - Core innovation, port this first as foundation
2. **amap/MyCustomMapping** - Assess if upstream has equivalent introspection
3. **CustomCommands namespace** - May inline into new architecture
4. **aruntime** - Upstream may have native async command API now
5. **Magic directives** - Reconsider which scopes are still valuable
6. **Tab highlighting** - Check if upstream has multi-select now

**Deprecated Concepts:**
- Check if workarounds (like bajax for CORS) are obsolete with Manifest v3

---

## glossary.references

**Source Files:**
- Custom command implementations: `content_scripts/hbt.js:333-1615`
- Magic configuration: `custom-commons.js:1-62`
- Background handlers: `bg.js` (scattered, search for `M` suffix methods)
- User config: `.surfingkeysrc` (keybindings and usage examples)

**Key Commits:**
- Magic pattern introduction: (search git log for "magic")
- amap system: (early 2019 commits)
- Tab highlighting: (search for "highlight" in git log)

# Architecture Documentation - Archive Branch

**Source Branch:** `archive/hbt-master-manifest-v2-fork-2018-2025`

**Date:** 2026-01-20

---

## architecture.overview

This document describes the architectural patterns and code organization of the 2018-2025 custom fork, built on Surfingkeys v0.9.48 (Chrome Extension Manifest v2).

**Key Characteristics:**
- **Isolation pattern:** Custom code separated into distinct namespaces
- **Messaging architecture:** Callback-based runtime.command() (v0.9.48 era)
- **Configuration approach:** File-based with symbolic links
- **State management:** Mix of localStorage and session variables

---

## architecture.code_organization

### architecture.file_structure

**Custom Code Locations:**

```
content_scripts/
├── hbt.js                    # Custom command implementations (1,617 lines)
│   ├── DOMUtils              # DOM helper utilities
│   ├── MyCustomMapping       # Command registry system
│   └── CustomCommands        # Custom command namespace (93 functions)

bg.js                          # Background handlers (modified)
├── Magic pattern handlers (tabCloseM, tabReloadM, etc.)
└── Background async operations

custom-commons.js              # Shared configuration
└── CustomCommonConfig         # Magic directives + shared config

.surfingkeysrc                 # User configuration (2,895 lines)
├── amap() bindings            # 154 mappings
├── mapkey() bindings          # 49 direct mappings
└── mmconfig sections          # IDE navigation helper
```

**Design Principle:** Minimize upstream modifications by isolating custom code

### architecture.namespace_isolation

**CustomCommands IIFE Pattern:**

```javascript
var CustomCommands = (function() {
    let self = {};

    // Helper functions (private)
    function shouldSkipOtherRepeats() { /* ... */ }
    async function aruntime(obj) { /* ... */ }

    // Public command implementations
    self.tabCloseM = async (k) => { /* ... */ };
    self.copyTabURLsM = async (k) => { /* ... */ };
    // ... 93 total commands

    return self;
})();
```

**Benefits:**
- Prevents global namespace pollution
- Clear boundary between custom and upstream code
- Easy to identify custom code during merges
- Can be extracted as module in future

**Coupling Points:**
- Depends on `Normal.repeats` (upstream)
- Depends on `runtime.command()` (upstream)
- Depends on `Front.showBanner()` (upstream)

---

## architecture.messaging_architecture

### architecture.messaging.v0_9_48_pattern

**Era:** Pre-v0.9.54 (before messaging port refactor)

**Frontend → Background Communication:**

```javascript
// Content script (hbt.js)
async function aruntime(obj) {
    return new Promise((resolve) => {
        runtime.command(obj, resolve);  // Callback-based
    });
}

// Usage
let result = await aruntime({
    action: "tabCloseM",
    repeats: Normal.repeats || -1,
    magic: "DirectionRight"
});
```

**Background Handler (bg.js):**

```javascript
// Background listener
runtime.on('tabCloseM', async (message, sender, sendResponse) => {
    let tabs = await getTabsByMagic(message.magic, message.repeats);
    await chrome.tabs.remove(tabs.map(t => t.id));
    sendResponse({ count: tabs.length });
});
```

**Message Flow:**

```
┌──────────────────┐
│ Content Script   │
│ (hbt.js)         │
└────────┬─────────┘
         │ runtime.command({action, ...})
         ├──────────────────────────────────┐
         │                                  │
         ▼                                  ▼
┌────────────────────┐          ┌──────────────────────┐
│ Upstream Runtime   │          │ Custom bg.js Handler │
│ Message Router     │─────────▶│ Magic pattern logic  │
└────────────────────┘          └──────────┬───────────┘
         ▲                                  │
         │ sendResponse(result)             │
         └──────────────────────────────────┘
```

**Why This Broke in v0.9.54:**
Upstream refactored from callback-based `runtime.command()` to long-lived port connections, breaking all custom async handlers.

### architecture.messaging.aruntime_abstraction

**Purpose:** Promisify callback-based messaging

**Implementation:**

```javascript
async function aruntime(obj) {
    return new Promise((resolve) => {
        runtime.command(obj, resolve);
    });
}
```

**Benefits:**
- Clean async/await syntax in content scripts
- Hides callback complexity
- Easy to adapt to new messaging patterns (just change wrapper)

**Migration Path:**
When porting to new upstream, only need to update `aruntime()` implementation, not every command.

---

## architecture.state_management

### architecture.state.session_state

**Normal.repeats:**
- Managed by upstream Surfingkeys
- Accessed directly by custom commands for count integration
- Cleared after command execution
- Tight coupling (unavoidable)

**Tab Highlighting:**
```javascript
// Stored in tab object (chrome.tabs API)
// Set via background page:
chrome.tabs.update(tabId, { highlighted: true });

// Query highlighted tabs:
chrome.tabs.query({ highlighted: true, currentWindow: true });
```

**Tab Quickmarks:**
```javascript
// Session-persistent (not saved to disk)
// Stored in background page variable:
let tabQuickmarks = new Map();  // markName → tabId

self.tabQuickMarkSave = (mark) => {
    tabQuickmarks.set(mark, currentTabId);
};
```

### architecture.state.persistent_state

**Background LocalStorage:**

```javascript
// Write from content script:
await CustomCommands.setBackgroundLocalStorage({
    key: "pushbullet_enabled",
    value: "true"
});

// Read from content script:
let result = await CustomCommands.getBackgroundLocalStorage({
    key: "pushbullet_enabled"
});
```

**Why Background Storage:**
- Shared across all tabs
- Persists across sessions
- Not cleared when content script reloads

**VIM Marks Storage:**
- Uses Surfingkeys' built-in storage (chrome.storage.sync)
- Persistent across browser restarts
- Synced across devices if Chrome sync enabled

---

## architecture.configuration_system

### architecture.config.file_based

**Primary Config:** `~/.surfingkeysrc`

**Loading Mechanism:**
```javascript
// Surfingkeys loads via Settings → Advanced
// File URL: file:///home/hassen/.surfingkeysrc.js
```

**Repository Integration:**
```bash
# Repo has symlink (gitignored for security):
.surfingkeysrc.js -> ~/.surfingkeysrc.js

# Actual file in home directory:
~/.surfingkeysrc      # 2,895 lines
~/.surfingkeysrc.js   # Symlink to above
```

**Security Model:**
- Config contains private data (bookmarks, URLs)
- Symlink approach: repo references file without copying it
- Gitignore prevents accidental commit

### architecture.config.custom_common

**Shared Config Object:**

```javascript
// custom-commons.js
var CustomCommonConfig = {
    tabMagic: {
        DirectionRight: { key: "e", /* ... */ },
        DirectionLeft: { key: "q", /* ... */ },
        // ... all magic directives
    },
    incognitoBookmarkFolder: "Incognito Bookmarks"
};
```

**Access Pattern:**
- Frontend (hbt.js): Reads magic directives
- Background (bg.js): Reads magic directives + folder names
- Loaded in both contexts (duplicated code)

### architecture.config.my_custom_mapping

**Command Registry Pattern:**

```javascript
class MyCustomMapping {
    static #acmds = new Map();

    static get acmds() { return this.#acmds; }

    init() {
        // Extract all command annotations from code
        let modes = [Normal, Insert, Visual, /* ... */];
        let commands = this.mapCommandsByAnnotations(modes);

        // Populate registry
        commands.forEach(cmd => {
            this.#acmds.set(cmd.annotation, cmd);
        });
    }
}
```

**Purpose:**
- Programmatic command introspection
- Documentation generation
- Centralized command metadata

**Initialization:**
```javascript
// In .surfingkeysrc
let mc = new MyCustomMapping();
mc.init();  // Populates command registry

// Now can use:
amap("Zr", "zoom reset");  // Looks up in registry
```

---

## architecture.magic_pattern_implementation

### architecture.magic.frontend

**Key Resolution Flow:**

```javascript
// 1. User presses: tc + e (close tabs to right)
self.tabCloseM = async (k) => {
    // 2. Resolve magic name from key
    let magic = tabCheckMagicByKey(k);  // k="e" → "DirectionRight"

    // 3. Send to background with repeats
    let ret = await aruntime({
        action: "tabCloseM",
        repeats: Normal.repeats || -1,
        magic: magic
    });
};

// Helper function
function tabCheckMagicByKey(k) {
    let map = new Map();
    let magics = CustomCommonConfig.tabMagic;

    Object.keys(magics).forEach((name) => {
        map.set(magics[name].key, name);
    });

    return map.get(k);  // e → DirectionRight
}
```

### architecture.magic.backend

**Background Handler Pattern:**

```javascript
// bg.js
runtime.on('tabCloseM', async (message, sender, sendResponse) => {
    let { magic, repeats } = message;

    // 1. Get tabs matching magic filter
    let tabs = await getTabsByMagic(magic, sender.tab);

    // 2. Apply repeats limit
    if (repeats !== -1) {
        tabs = tabs.slice(0, repeats);
    }

    // 3. Execute operation
    await chrome.tabs.remove(tabs.map(t => t.id));

    sendResponse({ count: tabs.length });
});

// Magic filter implementation
async function getTabsByMagic(magicName, currentTab) {
    let allTabs = await chrome.tabs.query({});
    let currentIndex = allTabs.findIndex(t => t.id === currentTab.id);

    switch(magicName) {
        case "DirectionRight":
            return allTabs.slice(currentIndex + 1);
        case "DirectionLeft":
            return allTabs.slice(0, currentIndex);
        case "AllTabsInCurrentWindow":
            return allTabs.filter(t => t.windowId === currentTab.windowId);
        // ... all magic types
    }
}
```

**Repeats Semantics:**

| Value | Behavior |
|-------|----------|
| `-1` | All matching tabs |
| `N > 0` | First N matching tabs |
| Not set | Defaults to -1 |

---

## architecture.integration_points

### architecture.integration.chrome_apis

**Used Chrome APIs:**

```javascript
// Tabs API (extensive use)
chrome.tabs.query()
chrome.tabs.get()
chrome.tabs.update()
chrome.tabs.remove()
chrome.tabs.create()
chrome.tabs.move()
chrome.tabs.highlight()
chrome.tabs.reload()
chrome.tabs.duplicate()

// Windows API
chrome.windows.getCurrent()
chrome.windows.getAll()
chrome.windows.create()

// Storage API
chrome.storage.sync.get()
chrome.storage.sync.set()
chrome.storage.local.get()
chrome.storage.local.set()

// Bookmarks API
chrome.bookmarks.get()
chrome.bookmarks.create()
chrome.bookmarks.remove()
chrome.bookmarks.getTree()

// Downloads API (minimal)
chrome.downloads.download()
```

**Manifest v2 Dependencies:**
- Background page (not service worker)
- Persistent background execution
- Full sync/async chrome.* API access

### architecture.integration.external

**PushBullet:**
- Integration via background page
- State toggled via `togglePushBullet` command
- Actual implementation unclear (may be extension messaging)

**External Editor (GVim):**
- System-level integration
- Likely uses native messaging host
- Not portable (requires local setup)

**Clipboard:**
- Uses `document.execCommand('copy')` (deprecated but works in Manifest v2)
- Clipboard permissions in manifest

---

## architecture.patterns_and_conventions

### architecture.patterns.naming

**Command Naming:**

| Pattern | Meaning | Example |
|---------|---------|---------|
| `<operation>M` | Magic-enabled | `tabCloseM`, `tabReloadM` |
| `<operation>` | Standard | `copyTopURL`, `tabUndo` |
| `hint<Operation>` | Hint mode trigger | `hintOpenLinkIncognito` |
| `a<function>` | Async wrapper | `aruntime`, `amap` |

**Variable Naming:**
- `self.*` for public namespace methods
- `let mc` for MyCustomMapping instance
- `mmconfig.*` for IDE navigation sections

### architecture.patterns.error_handling

**Pattern:** Minimal error handling, relies on upstream robustness

```javascript
// Typical pattern (no try/catch)
self.tabCloseM = async (k) => {
    let magic = tabCheckMagicByKey(k);
    if (!magic) return;  // Early exit on invalid magic

    let ret = await aruntime({
        action: "tabCloseM",
        repeats: Normal.repeats || -1,
        magic: magic
    });
};
```

**Assumption:** If runtime.command() fails, upstream handles it

**User Feedback:**
- Success: `Front.showBanner()` for important operations
- Errors: Silent failures (upstream may show errors)

### architecture.patterns.async_conventions

**Async Evolution:**

```javascript
// Old callback style (rarely used)
runtime.command({ action: "..." }, function(res) {
    Front.showBanner(res.message);
});

// New async/await style (preferred)
let res = await aruntime({ action: "..." });
Front.showBanner(res.message);
```

**All magic commands:** Async by default (use `await`)

---

## architecture.performance_considerations

### architecture.performance.tab_queries

**Optimization:** Cache tab queries when possible

```javascript
// Inefficient (multiple queries):
let tab1 = await chrome.tabs.query({ active: true });
let tab2 = await chrome.tabs.query({ currentWindow: true });

// Better (single query + filter):
let allTabs = await chrome.tabs.query({});
let activeTab = allTabs.find(t => t.active);
let currentWindow = allTabs.filter(t => t.windowId === activeTab.windowId);
```

**Magic pattern handlers:** Generally efficient (one query per operation)

### architecture.performance.messaging_overhead

**Pattern:** Minimize round-trips

```javascript
// Good: Single message with all data
await aruntime({
    action: "tabCloseM",
    repeats: Normal.repeats || -1,
    magic: magic,
    // All data in one message
});

// Bad: Multiple sequential messages
let tabs = await aruntime({ action: "getTabs", magic: magic });
let count = await aruntime({ action: "count", tabs: tabs });
await aruntime({ action: "close", tabs: tabs });
```

---

## architecture.security_considerations

### architecture.security.config_isolation

**Private Data in Config:**
- Bookmarks with internal URLs
- Site-specific keybindings (reveal domains visited)
- Custom search engines (reveal services used)

**Mitigation:**
- Config file not committed to repo
- Symlink approach (gitignored)
- Documentation extraction filters out URLs

### architecture.security.cors_bypass

**bajax Pattern:**

```javascript
// Content script has CORS restrictions
// Solution: Proxy through background page

await CustomCommands.bajax({
    url: "https://external-api.com/data",
    method: "POST",
    data: { /* ... */ }
});
```

**Risk:** Background page can make arbitrary requests
**Use Case:** Legitimate cross-origin integrations (not exploited maliciously)

---

## architecture.migration_challenges

### architecture.migration.breaking_changes_v0_9_54

**What Broke:**

1. **Messaging Architecture**
   - v0.9.48: Callback-based `runtime.command()`
   - v0.9.54: Long-lived port connections
   - Impact: All `aruntime()` calls broken

2. **Port Management**
   - Old: Each message = new connection
   - New: Persistent ports with reconnection logic
   - Impact: Custom handlers need rewrite

3. **Message Flow**
   - Old: Direct action → handler mapping
   - New: Port-based messaging with handshake
   - Impact: Custom commands can't register handlers

**Why Fork Diverged:**
- Too many custom async handlers to rewrite
- No clear migration path documented
- Breaking architectural change without compatibility layer

### architecture.migration.adaptation_strategy

**For New Upstream (Manifest v3):**

1. **Preserve Abstractions:**
   - Keep `aruntime()` wrapper, update implementation
   - Keep magic pattern logic (value is high)
   - Rewrite messaging layer only

2. **Simplify Where Possible:**
   - Reduce bajax usage (Manifest v3 has better CORS handling)
   - Inline small helpers (if upstream has equivalents)

3. **Test Incrementally:**
   - Port one magic command type at a time
   - Verify messaging before adding features

---

## architecture.technical_debt

### architecture.debt.coupling

**Tight Coupling Points:**

| Component | Coupled To | Risk Level |
|-----------|-----------|-----------|
| `CustomCommands` | `Normal.repeats` | High - Direct global access |
| `aruntime()` | `runtime.command()` | High - Upstream API dependency |
| Magic handlers | Chrome Tabs API | Medium - Stable API |
| `amap()` | `MyCustomMapping.acmds` | Low - Internal coupling |

**Refactoring Needed:**
- Abstract `Normal.repeats` access
- Create messaging interface layer
- Reduce global variable dependencies

### architecture.debt.code_duplication

**Duplicated Config:**
- `CustomCommonConfig` loaded in both content + background
- Solution: Single source with import (Manifest v3 modules)

**Duplicated Patterns:**
- Each magic command has similar structure
- Solution: Higher-order function for magic commands

**Example Refactor:**

```javascript
// Current: Duplicated
self.tabCloseM = async (k) => {
    let magic = tabCheckMagicByKey(k);
    if (!magic) return;
    await aruntime({ action: "tabCloseM", repeats: Normal.repeats || -1, magic });
};

self.tabReloadM = async (k) => {
    let magic = tabCheckMagicByKey(k);
    if (!magic) return;
    await aruntime({ action: "tabReloadM", repeats: Normal.repeats || -1, magic });
};

// Better: Factory function
function createMagicCommand(action) {
    return async (k) => {
        let magic = tabCheckMagicByKey(k);
        if (!magic) return;
        await aruntime({ action, repeats: Normal.repeats || -1, magic });
    };
}

self.tabCloseM = createMagicCommand("tabCloseM");
self.tabReloadM = createMagicCommand("tabReloadM");
```

---

## architecture.strengths

**What Worked Well:**

1. ✅ **Namespace Isolation**
   - `CustomCommands` IIFE prevented merge conflicts
   - Easy to identify custom code

2. ✅ **Magic Pattern Abstraction**
   - Powerful, composable command modifiers
   - Clean key → directive → filter flow

3. ✅ **aruntime() Wrapper**
   - Hid callback complexity
   - Single point to update for messaging changes

4. ✅ **Configuration Flexibility**
   - File-based config with IDE navigation
   - Easy to reorganize and comment

5. ✅ **Documentation Generation**
   - MyCustomMapping enabled auto-docs
   - Command introspection for analysis

---

## architecture.lessons_learned

### architecture.lessons.architecture

1. **Abstraction Layers Matter**
   - `aruntime()` isolated breaking changes to one place
   - Should have also abstracted `Normal.repeats` access

2. **Upstream Coupling is Risky**
   - Direct dependency on `runtime.command()` caused 7-year divergence
   - Always abstract external dependencies

3. **Documentation as Code**
   - `MyCustomMapping` annotation system was valuable
   - Generated docs stayed in sync with code

### architecture.lessons.migration

1. **Breaking Changes Compound**
   - Small architectural break → massive refactor needed
   - Incremental migration impossible without compatibility layer

2. **Custom Code Should Be Extractable**
   - `CustomCommands` IIFE helped
   - But still too coupled to upstream globals

3. **Testing Would Have Helped**
   - No automated tests for custom commands
   - Manual verification of 203 commands is error-prone

---

## architecture.references

**Source Files:**
- `content_scripts/hbt.js:1-1617` - Custom implementations
- `bg.js` - Background handlers (search for "M" suffix)
- `custom-commons.js:1-62` - Shared configuration
- `.surfingkeysrc` - User configuration

**Related Documentation:**
- [Custom Commands](custom-commands.md) - Command inventory
- [Custom Glossary](custom-glossary.md) - Terminology reference
- [ADR-002](../../adrs/adr-002-repository-restructuring-upstream-sync.md) - Migration decision

**External:**
- [Surfingkeys v0.9.48 Release](https://github.com/brookhong/Surfingkeys/releases/tag/0.9.48) - Last stable version for fork
- [Chrome Extension Manifest v2](https://developer.chrome.com/docs/extensions/mv2/) - Platform documentation

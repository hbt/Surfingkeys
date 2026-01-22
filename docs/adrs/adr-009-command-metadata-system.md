# ADR 009: Command Metadata System for Persistent Command Identification

**Date**: 2026-01-22
**Status**: Accepted
**Context**: Command usage tracking
**Scope**: Surfingkeys keyboard command system

---

## Problem

The original usage tracking system stores command statistics keyed by keyboard key sequence (e.g., `"j"`, `"gg"`). This approach has a critical limitation:

**When users remap keys, the usage history becomes corrupted:**
- Key `"j"` tracked with 100 uses for "Scroll down"
- User remaps `"j"` → "Custom action"
- New annotation is stored, overwriting old data
- Result: 150 total uses under an annotation that doesn't match the action

This makes command statistics unreliable across configuration changes.

---

## Solution: Structured Command Metadata

Replace string-based annotations with object-based metadata containing:

```javascript
// Before (string-only)
annotation: "Scroll down"

// After (structured metadata)
annotation: {
    short: "Scroll down",                    // Display string
    unique_id: "cmd_scroll_down",           // Persistent identifier
    category: "scroll",                      // Semantic grouping
    description: "Scroll the page down by one line",  // Long form
    tags: ["scroll", "vim", "movement"]     // Classification
}
```

### Key Benefits

| Benefit | Impact |
|---------|--------|
| **Stable identification** | Usage statistics survive key remaps via `unique_id` |
| **Categorization** | Commands grouped by category for analytics |
| **Better tracking** | Can distinguish between different actions |
| **Future extensibility** | Room for additional metadata (permissions, frequency, etc.) |
| **Backward compatible** | Helper functions support both strings and objects |

---

## Implementation

### Phase 1: Helper Functions (Done)

Created `src/common/commandMetadata.js` with three functions:

```javascript
getAnnotationString(annotation)  // Extract display string (handles both types)
getAnnotationMetadata(annotation)  // Extract metadata object
getCommandId(annotation, fallbackKey)  // Get persistent ID
```

**Why separate?** Allows gradual adoption without breaking existing code.

### Phase 2: Storage Layer (Done)

Updated `src/common/usageTracker.js`:

```javascript
// Before: keyed by key sequence
commands["j"] = { annotation: "Scroll down", count: 150 }

// After: keyed by command ID
commands["cmd_scroll_down"] = {
    command_id: "cmd_scroll_down",
    key: "j",  // Updated when key is remapped
    display_name: "Scroll down",
    category: "scroll",
    count: 150
}
```

**Effect**: If user remaps `"j"` → `"k"`, the same command entry is updated with new key, preserving count.

### Phase 3: Consumer Updates (Done)

Updated annotation consumers to use helper functions:
- `mode.js`: Display annotations in repeat dialogs
- `frontend.js`: Help menu and rich hints display
- `hints.js`: Hints menu display

All continue to work with both legacy strings and new objects.

### Phase 4: Gradual Migration (Current)

**Migration Status**: 15/160 commands (9.4%)

Migrated commands include scroll commands:
- `cmd_scroll_down`, `cmd_scroll_up`, `cmd_scroll_left`, `cmd_scroll_right`
- `cmd_scroll_top`, `cmd_scroll_bottom`
- `cmd_scroll_full_page_down`, `cmd_scroll_half_page_down`
- `cmd_scroll_full_page_up`, `cmd_scroll_half_page_up`
- `cmd_scroll_leftmost`, `cmd_scroll_rightmost`, `cmd_scroll_percentage`
- `cmd_scroll_reset_target`, `cmd_scroll_change_target`

Run `npm run validate:mappings` to see current migration progress.

Other commands can be migrated incrementally.

---

## Architecture Decisions

### Why keyed by `unique_id` instead of key?

- **Remappings**: User can map different keys to same command
- **Multi-mode**: Same command exists in Normal/Visual/etc.
- **Forward compatibility**: Can support command aliases

### Why keep `key` field?

- **Remap detection**: Compare old vs. new key to detect changes
- **Display**: Show current key binding in stats
- **Validation**: Verify key still matches when reading stats

### Why not use `feature_group`?

- `feature_group` is for UI categorization (by numeric index)
- `category` is semantic (e.g., "scroll", "navigation", "search")
- Can have many `unique_id` per feature_group, or vice versa

---

## Usage Examples

### For Developers

**Define a new scroll command:**
```javascript
self.mappings.add("n", {
    annotation: {
        short: "Scroll next",
        unique_id: "cmd_scroll_next",
        category: "scroll",
        description: "Scroll to next section",
        tags: ["scroll", "navigation"]
    },
    feature_group: 2,
    code: function() { /* ... */ }
});
```

**Access in tracking:**
```javascript
// trackCommandUsage() automatically handles both types
trackCommandUsage("n", meta.annotation, "Normal");
```

### For Analytics

**Query scroll commands only:**
```javascript
const scrollCommands = Object.values(stats.commands)
    .filter(cmd => cmd.category === 'scroll')
    .sort((a, b) => b.count - a.count);
```

**Track remap events:**
```javascript
const remapped = Object.values(stats.commands)
    .filter(cmd => cmd.key !== cmd.lastKey);
```

---

## Migration Path

**Current Status**: 15/160 commands migrated (9.4%)

**Completed** (Phase 4):
- Scroll commands: 15 commands ✓

**Remaining commands** (to be migrated):
- Navigation commands (Tab operations, links, etc.)
- Search commands (Find, highlight, etc.)
- Visual mode commands
- Insert mode commands
- Omnibar commands

**Timeline**: Migrate as features are updated, not all at once.

**Progress Tracking**: Run `npm run validate:mappings` to see real-time migration count.

---

## Testing

### Manual Verification

1. **Scroll commands still work**: `j`, `k`, `h`, `l`, etc.
2. **Stats are recorded**: Open stats-viewer, execute scroll commands
3. **Annotations display**: Help menu (`?`) shows scroll commands
4. **No console errors**: Check browser console for errors

### Automated Tests

- `tests/cdp/cdp-usage-tracking.test.ts`: Verify tracking works
- Existing UI tests should continue to pass

---

## Future Enhancements

1. **Command registry**: Centralized definition of all commands
2. **Dynamic IDs**: Generate from unique_id + variant (for chained commands)
3. **Permissions**: Track which user config enables/disables each command
4. **Recommendations**: Suggest unmapped commands based on similar patterns
5. **Analytics export**: JSON export with command ID mappings

---

## Alternatives Considered

### Option A: Hash-based IDs
- **Pro**: Auto-generated from annotation text
- **Con**: Fragile (text changes break tracking)
- **Chosen**: No, requires manual unique_id

### Option B: Numeric command registry
- **Pro**: Compact storage
- **Con**: Hard to debug (what is command #42?)
- **Chosen**: No, using semantic string IDs

### Option C: Store both key and action in history
- **Pro**: Full history of all remaps
- **Con**: Requires migration of existing data
- **Chosen**: Partial - new entries use both, old entries still work

---

## References

- [Usage Tracker Implementation](../../src/common/usageTracker.js)
- [Command Metadata Helpers](../../src/common/commandMetadata.js)
- [Scroll Commands Example](../../src/content_scripts/common/normal.js)
- [Stats Viewer](../../src/pages/stats-viewer.js)


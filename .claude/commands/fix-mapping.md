# /fix-mapping — Keybinding Fix Guide

Use this command when a keybinding, map, or mode-specific binding is broken, ambiguous, or mapped to the wrong behavior.

## Goal

Fix the binding with the smallest correct change, then verify the behavior end to end.

## Working rules

- Start from the user-visible symptom, not the implementation.
- Trace the active binding path before changing code.
- Prefer the narrowest fix that preserves existing behavior elsewhere.
- If the binding is intentional but surprising, document the behavior instead of changing it.

## Investigation flow

1. Identify the exact key sequence, mode, and page/context where the problem appears.
2. Find the binding definition and any overrides or remaps that affect it.
3. Follow the execution path to the final action or command.
4. Check whether the issue is caused by:
   - a wrong key map
   - a mode mismatch
   - a collision with another binding
   - a platform-specific modifier issue
   - stale generated output or build artifacts
5. Reproduce the bug in the smallest possible way.
6. Implement the fix.
7. Verify the behavior with the appropriate test or runtime check.

## Fix path

- Check the archived config first when the user says the key used to work.
- Check the current repo source bindings next.
- Check the active user config last, because `unmapAllExcept([])` can remove built-in defaults.
- If source already defines the intended command but the user config clears defaults, restore the binding in `.surfingkeysrc.js` with `api.mapcmdkey(...)`.
- If the binding is a bookmark shortcut, use `api.mapkey(\`,${key}\`, ...)` and verify the bookmark array entry.
- After the edit, run `./scripts/validate-mappings.ts --verbose`.
- Confirm the report shows the key in the correct layer and that the `unique_id` is valid.

## Things to inspect

- Source binding tables and any generated mapping output.
- Mode-specific handlers and fallback logic.
- Platform differences between macOS, Windows, and Linux modifiers.
- Conflicts with default browser shortcuts or page shortcuts.
- Any docs or command files that describe the binding behavior.

## Important distinction

- `gg` can mean different things in this codebase.
- `,gg` is a bookmark entry in the bookmarking system, not a direct command binding.
- Bookmark entries are registered with `api.mapkey(\`,${key}\`, ...)` from the bookmark arrays.
- Direct command bindings map keys to a command ID or action name with `api.mapcmdkey(...)`.
- Bookmark entries map a key prefix plus a label to one or more target URLs.
- When debugging a reported key issue, first confirm whether the user means a bookmark shortcut like `,gg` or a real command mapping.

## Fix criteria

- The intended keybinding now triggers the correct action.
- No unrelated mappings are changed.
- The fix is easy to explain in one sentence.
- There is a test, reproduction note, or runtime check proving the result.

## Report schema

Use the mappings JSON report to avoid guessing file paths or jq filters.

### Top-level shape

```json
{
  "mappings": {
    "summary": { "...": "..." },
    "list": [ "MappingEntry" ]
  },
  "settings": { "...": "..." },
  "custom_configuration": { "...": "..." }
}
```

### `MappingEntry`

```json
{
  "key": "gg",
  "mode": "Normal",
  "mappingType": "direct",
  "annotation": {
    "short": "Scroll to the top of the page",
    "unique_id": "cmd_scroll_top",
    "category": "scroll",
    "description": "Scroll to the very top of the page",
    "tags": ["scroll", "vim", "navigation"]
  },
  "source": {
    "file": "content_scripts/common/normal.js",
    "line": 987
  },
  "handler_type": "inline",
  "validationStatus": "valid"
}
```

Notes:

- `annotation` may also be a plain string for unmigrated entries.
- Use a type guard in jq before reading `.annotation.unique_id`.
- `mappingType` can be `mapkey`, `direct`, `search_alias`, or `command`.

### Practical jq selectors

```bash
# List top-level keys
bun run --silent report:mappings:json | jq 'keys'

# Inspect the report list schema
bun run --silent report:mappings:json | jq '.mappings.list[0] | keys'

# Find a command by unique_id
bun run --silent report:mappings:json \
  | jq '.mappings.list[] | select((.annotation|type)=="object" and .annotation.unique_id=="cmd_scroll_top")'

# Find a key binding by key
bun run --silent report:mappings:json \
  | jq '.mappings.list[] | select(.key=="gg" and .mode=="Normal")'
```

## Known current example

- In this repo, `gg` is already defined in normal mode as `cmd_scroll_top`.
- The implementation is in [`src/content_scripts/common/normal.js`](/home/hassen/workspace/surfingkeys/src/content_scripts/common/normal.js:987).
- Because `.surfingkeysrc.js` calls `api.unmapAllExcept([])`, the user config must restore `gg` explicitly with `api.mapcmdkey('gg', 'cmd_scroll_top')`.
- The verification command that proved the fix was `bun scripts/validate-mappings.ts --verbose`.

## Learning log

Capture repeated debugging patterns here after a real fix:

- Common root cause:
- Common files to inspect first:
- Useful verification steps:
- Regressions to watch for:

## Notes

Add project-specific mapping rules, exceptions, and examples here after you walk through a real keybinding fix.

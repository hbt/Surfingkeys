# sk-cdp CLI

# // TODO(hbt) NEXT [docs] review this and dev.md + CLAUDE.md for consistency + make it a one stop file for all commands / references /examples

Simplified CDP wrapper that eliminates JSON escaping and provides better developer experience.

## Commands

| Command | Description |
|---------|-------------|
| `eval` | Evaluate JavaScript expression in a target |
| `targets` | List all available CDP targets |
| `send` | Send raw CDP method to a target |

## Quick Start

```bash
sk-cdp targets                                    # List all CDP targets
sk-cdp eval --target bg "chrome.runtime.id"       # Eval in service worker
sk-cdp eval --target options "document.title"     # Eval in options page
sk-cdp eval --target google.com "document.title"  # Eval in any matching tab
sk-cdp send --target bg "Runtime.evaluate" '{}'   # Raw CDP method
```

## Target Shortcuts

| Shortcut | Target Type | Pattern |
|----------|-------------|---------|
| `bg`, `sw`, `background` | service_worker | background.js |
| `options` | page | options.html |
| `frontend` | iframe | frontend.html |
| `popup` | page | popup.html |

## Options

| Flag | Description |
|------|-------------|
| `--target`, `-t` | Target by shortcut or URL pattern (default: first extension target) |
| `--json` | Output raw JSON (machine-readable, best for scripting) |
| `--raw` | Show complete CDP response object |
| `--watch-errors` | Exit with error code on JavaScript exceptions |

## Usage Examples

### List targets

```bash
# Human-readable output with grouping
sk-cdp targets

# Machine-readable JSON for scripting
sk-cdp targets --json | jq '.summary'
```

### Evaluate in service worker (background)

```bash
sk-cdp eval --target bg "chrome.runtime.id"
sk-cdp eval --target bg "chrome.storage.local.get(null)"
```

### Evaluate in options page

```bash
sk-cdp eval --target options "document.title"
sk-cdp eval --target options "document.querySelectorAll('input').length"
```

### Evaluate in any page by URL

```bash
sk-cdp eval --target google.com "document.title"
sk-cdp eval --target duckduckgo.com "document.body.className"
```

### Multi-line code via heredoc

```bash
sk-cdp eval --target bg <<'CODE'
new Promise(r => chrome.storage.local.get(null, r))
CODE
```

### Send raw CDP method

```bash
sk-cdp send --target bg "Runtime.evaluate" '{"expression":"1+1","returnByValue":true}'
sk-cdp send --target bg --json "Runtime.getProperties" '{"objectId":"..."}'
```

### Parse JSON with jq

```bash
sk-cdp eval --target bg --json "chrome.runtime.id" | jq '.result.result.value'
sk-cdp targets --json | jq '.summary.byType'
```

## Output Formats

```bash
# Pretty print (default)
sk-cdp eval --target bg "1 + 2"
# Output: 3

# JSON response (for scripting)
sk-cdp eval --target bg --json "1 + 2"
# Output: {"result":{"result":{"type":"number","value":3}}, ...}

# Full response with metadata
sk-cdp eval --target bg --raw "1 + 2"
```

## Metadata

sk-cdp automatically captures metadata before and after execution:

```bash
sk-cdp eval --target options "document.title"
# Output:
# "Surfingkeys Settings"
#
# ─ Metadata ─
# Duration: 6ms
# Context: page
# Console log: /tmp/dbg-proxy.log
# Timestamp: 2026-01-21T16:28:41.291Z
```

Metadata includes:
- **Execution**: Duration and timestamp
- **Tab info**: URL, title, active status, window ID
- **Document**: Readiness state, element count
- **Context**: Detects page vs iframe vs shadow-DOM
- **Changes**: Before/after comparisons for DOM mutations

## Error Handling

Helpful error messages with suggestions:

```bash
sk-cdp eval --target nonexistent "1+1"
# ❌ Target not found matching: nonexistent
#
# Available extension targets:
#   - service_worker: background.js
#   - page: options.html
#
# Shortcuts: bg, sw, background, options, frontend, popup
```

## Requirements

- CDP proxy running: `./bin/dbg proxy-start`
- Chrome with `--remote-debugging-port=9222`

## Comparison

| Approach | Use Case | Speed | Complexity |
|----------|----------|-------|-----------|
| **sk-cdp** | Quick checks, scripting | ⚡ Fast | ✅ Simple |
| **websocat + proxy** | Very quick one-liners | ⚡⚡ Fastest | ⚠️ JSON escaping |
| **CDP debug scripts** | Repeatable test scenarios | ⏱️ Slow | ⚠️ More code |

## Tips

**Use IIFE for code that uses return:**
```bash
sk-cdp eval --target options "(function() { return 42; })()"
```

**Use --json for scripting/agents:**
```bash
sk-cdp eval --target bg --json "chrome.runtime.id" | jq -r '.result.result.value'
```

**Check storage in service worker:**
```bash
sk-cdp eval --target bg <<'CODE'
new Promise(r => chrome.storage.local.get(null, d => r(JSON.stringify(d, null, 2))))
CODE
```

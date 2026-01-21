# sk-cdp CLI

Simplified CDP wrapper that eliminates JSON escaping and provides better developer experience.

## Usage

### Basic inspection

```bash
sk-cdp eval "document.body.style.backgroundColor"
```

### Target selection

```bash
sk-cdp eval --target options.html "document.querySelectorAll('input').length"
```

### Multi-line code

```bash
sk-cdp eval --target options.html <<'CODE'
(function() {
  const inputs = document.querySelectorAll('input');
  const types = Array.from(inputs).map(i => i.type);
  return { count: types.length, types };
})()
CODE
```

### Error handling

```bash
# Show errors in red
sk-cdp eval "this.will.cause.an.error()"
```

### Output formatting

```bash
# Pretty print (default)
sk-cdp eval "1 + 2"

# Raw JSON response
sk-cdp eval --json "1 + 2"

# Full response object
sk-cdp eval --raw "1 + 2"
```

## Options

| Flag | Description |
|------|-------------|
| `--target PATTERN` | Target page by URL pattern (e.g., `options.html`, `frontend.html`). Defaults to first extension page. |
| `--watch-errors` | Exit with error code if JavaScript exception occurs |
| `--json` | Output raw JSON response (useful for piping to jq) |
| `--raw` | Show complete response object |

## Examples

### Get current options page background color

```bash
sk-cdp eval --target options.html "window.getComputedStyle(document.body).backgroundColor"
```

### Count all input elements

```bash
sk-cdp eval --target options.html "document.querySelectorAll('input').length"
```

### Inspect form element values

```bash
sk-cdp eval --target options.html <<'CODE'
(function() {
  const inputs = document.querySelectorAll('input[type="text"]');
  return Array.from(inputs).map(i => ({
    id: i.id,
    value: i.value,
    placeholder: i.placeholder
  }));
})()
CODE
```

### Parse JSON with jq

```bash
sk-cdp eval --json --target options.html "document.querySelectorAll('input').length" | jq '.result.result.value'
```

### Verify theme application

```bash
sk-cdp eval --target options.html <<'CODE'
(function() {
  const body = document.body;
  const style = window.getComputedStyle(body);
  return {
    backgroundColor: style.backgroundColor,
    color: style.color,
    styleTag: !!document.getElementById('sk-dark-theme')
  };
})()
CODE
```

## Requirements

- CDP proxy running: `./bin/dbg proxy-start`
- WebSocket (ws) package available in node_modules

## Comparison with other approaches

| Approach | Use Case | Speed | Persistence | Complexity |
|----------|----------|-------|-------------|-----------|
| **sk-cdp** | Quick checks, multi-line code | ⚡ Fast | ❌ No | ✅ Simple |
| **websocat + proxy** | Very quick one-liners | ⚡⚡ Fastest | ❌ No | ⚠️ JSON escaping |
| **CDP debug scripts** | Repeatable test scenarios | ⏱️ Slow | ❌ No | ⚠️ More code |
| **Source + bin/dbg reload** | Shipping code | ⏱️ Slower | ✅ Yes | ✅ Simple |

## Advantages over websocat

✅ No JSON escaping needed
✅ Multi-line code via heredocs
✅ Auto-discover targets
✅ Proper error display
✅ Output formatting (pretty, JSON, raw)
✅ Optional --watch-errors flag

## Tips

**Use IIFE for code that uses return:**
```bash
sk-cdp eval --target options.html "(function() { return 42; })()"
```

**Pipe to jq for complex output:**
```bash
sk-cdp eval --json --target options.html "..." | jq '.result.result.value'
```

**Test in live environment before committing:**
```bash
sk-cdp eval --target options.html "risky_code()"
# Then verify result, then update source and use bin/dbg reload
```

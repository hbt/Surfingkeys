The user is asking me to reflect on the three approaches I used during this session:

1. CDP + proxy (websocat commands)
2. CDP debug scripts (TypeScript with npm run debug:cdp:live)
3. Direct source code modification + dbg reload

They want my professional assessment of workflow preferences, strengths, and weaknesses. This is a good UX/DX question. Let me think through what I experienced:

## CDP + Proxy (websocat)

**Strengths:**
- Fastest iteration - one-liners, instant feedback
- No build step, perfect for quick inspection

**Weaknesses:**
- Not persistent - changes disappear on reload
- Only for runtime injection, not config/data

**Usage:**

Start/stop proxy server:
```bash
./bin/dbg proxy-start
```

**Example: Open options page**

```bash
TARGET=$(curl -s http://127.0.0.1:9222/json | jq -r '.[] | select(.url | contains("chrome-extension")) | .id' | head -1)
echo '{"targetId": "'$TARGET'", "method": "Runtime.evaluate", "params": {"expression": "chrome.runtime.openOptionsPage()", "returnByValue": true}}' | websocat ws://127.0.0.1:9623
```

See [docs/cdp/proxy.md](./proxy.md) for more examples and request format details.

## CDP + sk-cdp CLI (Recommended)

**Strengths:**
- Clean DX - no JSON escaping or shell quoting hell
- Multi-line code support via heredocs
- Auto-target discovery
- Better error display
- Proper output formatting
- Fast iteration - still no build step

**Weaknesses:**
- One extra CLI tool to learn (but worth it)
- Still runtime-only, not persistent

**Usage:**

Simple expression:
```bash
sk-cdp eval "document.body.style.backgroundColor"
```

Target selection:
```bash
sk-cdp eval --target options.html "document.querySelectorAll('input').length"
```

Multi-line code:
```bash
sk-cdp eval --target options.html <<'CODE'
(function() {
  const inputs = document.querySelectorAll('input');
  return Array.from(inputs).map(i => i.type);
})()
CODE
```

**Observability: Metadata & Verification**

sk-cdp automatically captures metadata before and after execution to verify side effects:

```bash
sk-cdp eval --target options.html "document.title"
# Output:
# "Surfingkeys Settings"
#
# ─ Metadata ─
# Duration: 6ms
# Context: page
# Console log: /tmp/dbg-proxy.log
# Timestamp: 2026-01-21T16:28:41.291Z
```

**Metadata includes:**
- **Execution**: Duration and timestamp
- **Tab info**: URL, title, active status, window ID (via Chrome tabs API)
- **Document**: Readiness state, element count with query timing
- **Viewport**: Height, width, scroll position, DPI
- **Context**: Detects page vs iframe vs shadow-DOM
- **Changes**: Before/after comparisons for DOM mutations, URL changes, tab switches
- **Console**: Reference to proxy log file for all events

**Example: Verify a DOM mutation:**
```bash
sk-cdp eval --target options.html <<'CODE'
(function() {
  const el = document.createElement('div');
  el.textContent = 'Test';
  document.body.appendChild(el);
  return 'Added element';
})()
CODE
# Output shows: Elements: 421 → 422 (+1)
```

See [docs/cdp/sk-cdp.md](./cdp/sk-cdp.md) for full reference and examples.

### Console & Exception Logging

The proxy automatically captures all console messages and exceptions from all targets:

```bash
# Start proxy - automatically subscribes to Runtime events
./bin/dbg proxy-start
```

**What gets logged to `/tmp/dbg-proxy.log`:**
- Console messages (log, warn, error, info, debug)
- Uncaught exceptions with stack traces
- Timestamps and target identification

**Access logs from sk-cdp:**
```bash
sk-cdp eval --target options.html "console.log('test')"
# Output includes: Console log: /tmp/dbg-proxy.log

# View logs in real-time
tail -f /tmp/dbg-proxy.log | grep "\[LOG\]\|\[ERROR\]\|\[EXCEPTION\]"

# Search for specific messages
grep "Error" /tmp/dbg-proxy.log
grep "target_id" /tmp/dbg-proxy.log
```

**Example log output:**
```
[2026-01-21T16:34:57.094Z]   ← [9AFA5CE2...] [LOG] console.log message
[2026-01-21T16:34:57.095Z]   ← [9AFA5CE2...] [ERROR] console.error message
[2026-01-21T16:34:57.096Z]   ← [9AFA5CE2...] [EXCEPTION] TypeError: Cannot read property 'x' of undefined
```

## CDP Debug Scripts (TypeScript)

**Strengths:**
- Reusable, documented, and maintainable
- Better for complex operations

**Weaknesses:**
- Slower iteration - write, save, npm run cycle
- Still not persistent, runtime-only

**Gold Standard Screenshot:**

```bash
npm run debug:cdp:live debug/cdp-screenshot.ts
npm run debug:cdp:headless debug/cdp-screenshot.ts
```

Output: `/tmp/screenshot-[timestamp].png` (PNG, 50-60KB)

The script demonstrates the reusable CDP pattern:
- Direct WebSocket connection to Chrome DevTools
- Auto-opens options page if not already open
- Clean error handling and logging
- Timestamp-based output filename
- Works in both headless and live modes

See `debug/cdp-screenshot.ts` for the implementation pattern.

## Direct source modification + bin/dbg reload

**Strengths:**
- Changes are persistent and testable through full build pipeline
- Can commit and see real-world effects

**Weaknesses:**
- Slower feedback loop - edit, reload cycle
- Verification overhead adds latency

**Usage:**

```bash
bin/dbg reload
```

Automatically:
1. Rebuilds the extension (npm run build)
2. Reloads the extension in Chrome
3. Returns JSON with build timestamp for verification

## Hybrid approach I actually used

1. **sk-cdp** for quick inspection/exploration (or websocat for ultra-quick one-liners)
2. Source modification for actual implementation
3. **bin/dbg reload** for verification
4. Screenshot for final confirmation

This workflow makes sense because:
- sk-cdp exploration is fast and clean (no JSON escaping)
- Source changes are persistent
- bin/dbg reload validates the real build pipeline (~400ms)
- Screenshots provide visual confirmation

**When to use what:**
- **Inspection**: `sk-cdp eval "..."` (most of the time) - with automatic metadata & console logging
- **One-liner**: `websocat ...` (when you already know the CDP command)
- **Complex scenario**: CDP debug script in `debug/` - for reusable, documented patterns
- **Shipping**: Source code + `bin/dbg reload` - persistent changes through build pipeline

**Debugging workflow:**
```bash
# 1. Explore & inspect with sk-cdp (instant feedback + metadata)
sk-cdp eval --target options.html "document.querySelectorAll('input').length"

# 2. Check console/error logs captured by proxy
tail /tmp/dbg-proxy.log | grep ERROR

# 3. Test side effects (mutations, navigation, tab changes)
sk-cdp eval --target options.html "/* code */ return result"
# Metadata shows before/after changes

# 4. Make real changes
# Edit source files

# 5. Verify through build pipeline
./bin/dbg reload

# 6. Take screenshots for final confirmation
npm run debug:cdp:live debug/cdp-screenshot.ts
```

**Key advantages of sk-cdp + proxy logging:**
- ✅ Metadata shows you when code does nothing (failures detected)
- ✅ Console logs persist for investigation
- ✅ No timeout waiting - events logged immediately
- ✅ Works for all targets concurrently
- ✅ DOM mutations visible in before/after comparison

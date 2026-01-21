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

1. CDP + proxy for quick inspection/exploration
2. Source modification for actual implementation
3. dbg reload for verification
4. Screenshot for final confirmation

This workflow makes sense because CDP exploration is fast, source changes are persistent, dbg reload validates the real build pipeline, and screenshots provide visual confirmation that everything works as intended.

# CDP Proxy

WebSocket proxy for stateless CDP communication with Chrome extensions.
Automatically captures all console messages and exceptions to `/tmp/dbg-proxy.log`.

**Recommended:** Use [`sk-cdp`](./sk-cdp.md) CLI instead of raw websocat for better DX.

## proxy.commands

| Command | Description |
|---------|-------------|
| `bin/dbg proxy-start` | Start proxy server (auto-captures console & exceptions) |
| `bin/dbg proxy-stop` | Stop proxy server |
| `bin/dbg proxy-status` | Check if running |

## proxy.config

| Variable | Default | Description |
|----------|---------|-------------|
| `CDP_PROXY_PORT` | 9623 | Proxy WebSocket port |
| `CDP_PORT` | 9222 | Chrome DevTools port |
| `CDP_HOST` | 127.0.0.1 | Chrome DevTools host |

Set in `.env` file at project root.

## proxy.usage

### Quick Start: Get extension target ID

```bash
TARGET=$(curl -s http://127.0.0.1:9222/json | jq -r '.[] | select(.url | contains("chrome-extension")) | .id' | head -1)
```

### Example 1: Open Options Page

```bash
TARGET=$(curl -s http://127.0.0.1:9222/json | jq -r '.[] | select(.url | contains("options.html")) | .id' | head -1)
echo '{"targetId": "'$TARGET'", "method": "Runtime.evaluate", "params": {"expression": "chrome.runtime.openOptionsPage()", "returnByValue": true}}' | websocat ws://127.0.0.1:9623
```

### Example 2: Inspect DOM (Count elements)

```bash
TARGET=$(curl -s http://127.0.0.1:9222/json | jq -r '.[] | select(.url | contains("options.html")) | .id' | head -1)
echo '{"targetId": "'$TARGET'", "method": "Runtime.evaluate", "params": {"expression": "document.querySelectorAll(\"*\").length", "returnByValue": true}}' | websocat ws://127.0.0.1:9623
```

Response: `{"result":{"result":{"type":"number","value":422}}}`

### Example 3: Query List of Open Tabs

```bash
TARGET=$(curl -s http://127.0.0.1:9222/json | jq -r '.[] | select(.url | contains("chrome-extension")) | .id' | head -1)
echo '{"targetId": "'$TARGET'", "method": "Runtime.evaluate", "params": {"expression": "chrome.tabs.query({}).then(t => ({count: t.length, titles: t.map(tab => tab.title)}))", "returnByValue": true, "awaitPromise": true}}' | websocat ws://127.0.0.1:9623
```

Response includes tab count and titles.

### Example 4: Capture Screenshot

Capture and save to `/tmp/screenshot-[timestamp].png`:

```bash
TIMESTAMP=$(date +%s)
TARGET=$(curl -s http://127.0.0.1:9222/json | jq -r '.[] | select(.url | test("options")) | .id' | head -1)
printf '{"targetId": "'$TARGET'", "method": "Runtime.evaluate", "params": {"expression": "chrome.tabs.captureVisibleTab().then(data => data)", "returnByValue": true, "awaitPromise": true}}' | websocat -B 200000 ws://127.0.0.1:9623 > /tmp/response.json
tail -1 /tmp/response.json | jq -r '.result.result.value' | sed 's/data:image\/jpeg;base64,//' | python3 -c "import sys, base64; sys.stdout.buffer.write(base64.b64decode(sys.stdin.read()))" > /tmp/screenshot-${TIMESTAMP}.png
echo "Screenshot saved to: /tmp/screenshot-${TIMESTAMP}.png"
ls -lh /tmp/screenshot-${TIMESTAMP}.png
```

Response: JPEG image data. File size typically 80-100KB for standard window.

### Example 5: List Available Targets

```bash
curl -s http://127.0.0.1:9222/json | jq '.[] | select(.type == "page") | {id: .id, title: .title, type: .type}'
```

Shows all available pages and extensions currently attached to DevTools.

### Example 6: Attach to Different Target

Query a different target (e.g., Google Search page) instead of the options page:

```bash
TARGET=$(curl -s http://127.0.0.1:9222/json | jq -r '.[] | select(.title | contains("Google")) | .id' | head -1)
echo '{"targetId": "'$TARGET'", "method": "Runtime.evaluate", "params": {"expression": "document.title", "returnByValue": true}}' | websocat ws://127.0.0.1:9623
```

Simply change the `select()` filter to target a different page by title, URL, or type.

## proxy.request-format

```json
{
  "targetId": "CHROME_TARGET_ID",
  "method": "CDP_METHOD",
  "params": {}
}
```

- `targetId` - Required. Chrome target ID from `/json` endpoint
- `method` - CDP protocol method (e.g., `Runtime.evaluate`)
- `params` - Method-specific parameters

## proxy.logs

Proxy writes all activity AND console/exception events to `/tmp/dbg-proxy.log`:

```bash
# View all logs in real-time
tail -f /tmp/dbg-proxy.log

# Filter console messages only
tail -f /tmp/dbg-proxy.log | grep "\[LOG\]\|\[ERROR\]\|\[EXCEPTION\]"

# Search for specific messages
grep "Error" /tmp/dbg-proxy.log
grep "TypeError" /tmp/dbg-proxy.log
```

**Log format:**
```
[2026-01-21T16:34:57.094Z]   ← [9AFA5CE2...] [LOG] console.log message
[2026-01-21T16:34:57.095Z]   ← [9AFA5CE2...] [ERROR] console.error message
[2026-01-21T16:34:57.096Z]   ← [9AFA5CE2...] [EXCEPTION] TypeError: Cannot read property
```

**What gets captured:**
- Console messages (log, warn, error, info, debug levels)
- Uncaught exceptions with stack traces
- All events for all targets simultaneously
- Timestamped for correlation with client requests

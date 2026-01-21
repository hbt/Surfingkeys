# CDP Proxy

WebSocket proxy for stateless CDP communication with Chrome extensions.

## proxy.commands

| Command | Description |
|---------|-------------|
| `bin/dbg proxy-start` | Start proxy server |
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

```bash
TARGET=$(curl -s http://127.0.0.1:9222/json | jq -r '.[] | select(.url | contains("options.html")) | .id' | head -1)
echo '{"targetId": "'$TARGET'", "method": "Runtime.evaluate", "params": {"expression": "chrome.tabs.captureVisibleTab().then(data => ({length: data.length, type: typeof data}))", "returnByValue": true, "awaitPromise": true}}' | websocat ws://127.0.0.1:9623
```

Response: Base64-encoded PNG data. Pipe to file: `| jq -r '.result.result.value' | base64 -d > screenshot.png`

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

Logs written to `/tmp/dbg-proxy.log`

```bash
tail -f /tmp/dbg-proxy.log
```

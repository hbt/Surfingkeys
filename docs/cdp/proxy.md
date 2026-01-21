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

### Step 1: Get extension target ID

```bash
TARGET=$(curl -s http://127.0.0.1:9222/json | jq -r '.[] | select(.url | contains("chrome-extension")) | .id' | head -1)
```

### Step 2: Send command via proxy

```bash
echo '{"targetId": "'$TARGET'", "method": "Runtime.evaluate", "params": {"expression": "new Promise((r)=>chrome.tabs.create({url:\"https://www.google.com\"},r))", "returnByValue": true, "awaitPromise": true}}' | websocat ws://127.0.0.1:9623
```

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

# Chrome DevTools Protocol (CDP) Integration for Testing Surfingkeys

**Session ID:** `b7c92240-bcec-489e-a0c6-5baf58b93422`
**Date:** 2026-01-16

## Overview

This document explains how to use Chrome DevTools Protocol (CDP) to test Surfingkeys extension programmatically. CDP allows you to control Chrome remotely and access Chrome Extension APIs that are not exposed through CDP directly.

## The Problem

CDP doesn't expose Chrome Extension APIs like `chrome.tabs.query()`. To test Surfingkeys features (like tab switching with `T` key), we need access to:
- Which tab is focused
- Tab titles, URLs, IDs
- Other browser-level state only available via Extension APIs

## The Solution

**Connect CDP directly to the Surfingkeys extension background page**, not to the web page.

### Data Flow

```
Test Script (Python)
  ↓ WebSocket to CDP endpoint
Surfingkeys Background Page (extension context)
  ↓ JavaScript execution via Runtime.evaluate
Chrome Extension APIs (chrome.tabs.query, etc.)
  ↓ Results returned
Test Script receives data
```

## Setup

### 1. Launch Chrome with Remote Debugging

Modify `gchrtmp` script to include `--remote-debugging-port=9222`:

```bash
/usr/bin/google-chrome-stable \
  --user-data-dir=/tmp/tmp-google-chrome-"$date" \
  --remote-debugging-port=9222 \
  --password-store=basic \
  --disable-infobars \
  --new-window "$*"
```

Run: `gchrtmp https://google.com`

### 2. Verify CDP is Active

```bash
curl http://localhost:9222/json | jq .
```

You should see all open tabs and extension pages.

### 3. Find Surfingkeys Background Page WebSocket URL

```bash
curl -s http://localhost:9222/json | jq '.[] | select(.url | contains("_generated_background_page.html")) | {title, webSocketDebuggerUrl}'
```

Output:
```json
{
  "title": "Surfingkeys",
  "webSocketDebuggerUrl": "ws://localhost:9222/devtools/page/5591A6D431C2B1D3B40ABABE62B4A500"
}
```

**This WebSocket URL is what you connect to.**

## Working Test Script

Save as `cdp-test-active-tab.py`:

```python
#!/usr/bin/env python3
"""
CDP Test: Query active tab via Surfingkeys extension background page

Usage:
  python3 cdp-test-active-tab.py

Prerequisites:
  - Chrome launched with --remote-debugging-port=9222
  - Surfingkeys extension loaded
  - pip install websocket-client
"""

import json
import websocket

# Find this URL using:
# curl -s http://localhost:9222/json | jq '.[] | select(.url | contains("_generated_background_page.html"))'
BG_WS = "ws://localhost:9222/devtools/page/5591A6D431C2B1D3B40ABABE62B4A500"

def get_active_tab():
    """Query the currently active tab using chrome.tabs.query()"""
    ws = websocket.create_connection(BG_WS)

    # JavaScript to execute in extension background context
    js_code = """
    new Promise((resolve) => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            resolve(tabs);
        });
    });
    """

    # Send CDP command to evaluate JavaScript
    command = {
        "id": 1,
        "method": "Runtime.evaluate",
        "params": {
            "expression": js_code,
            "awaitPromise": True,
            "returnByValue": True
        }
    }
    ws.send(json.dumps(command))

    # Collect responses (filter out events, wait for our response with id:1)
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == 1:
            if "value" in msg["result"]["result"]:
                tabs = msg["result"]["result"]["value"]
                ws.close()
                return tabs[0] if tabs else None
            else:
                ws.close()
                return None

if __name__ == "__main__":
    tab = get_active_tab()
    if tab:
        print(f"✓ Active Tab:")
        print(f"  Title: {tab['title']}")
        print(f"  URL: {tab['url']}")
        print(f"  ID: {tab['id']}")
    else:
        print("✗ No active tab found")
```

### Example Output

```
✓ Active Tab:
  Title: Google
  URL: https://www.google.com/
  ID: 1672962614
```

## How to Use for Testing

### Test Tab Switching (T key in Surfingkeys)

1. **Start:** Google tab is active
2. **Action:** Press `T`, arrow down, Enter (switches to hckrnews tab)
3. **Verify:** Run test script

```bash
# Before action
python3 cdp-test-active-tab.py
# Output: Google

# After pressing T → ArrowDown → Enter
python3 cdp-test-active-tab.py
# Output: hckr news - Hacker News sorted by time
```

### Automating Tab Switch Test

You can send keyboard events via CDP and verify results:

```python
# Connect to a page tab (not background)
PAGE_WS = "ws://localhost:9222/devtools/page/079471019CB0604A35B05F739AA50908"

# Send 'T' key to open tab switcher
# (see session logs for full keyboard event code)

# Verify tab changed using extension background API
tab = get_active_tab()
assert tab['title'] == 'hckr news'
```

## Key Insights

### What Didn't Work

1. **Messaging from page context to extension** - `externally_connectable` didn't work reliably in Manifest v2
2. **CDP Runtime.evaluate from web page** - Web pages can't call `chrome.runtime.sendMessage()` without extension ID, and even with ID, "Receiving end does not exist" errors occurred

### What Worked

**Connect CDP directly to extension background page.** This gives full access to Chrome Extension APIs in the execution context.

## Available Chrome APIs via This Method

Once connected to background page, you can call ANY Chrome API:

```javascript
// Tabs
chrome.tabs.query({...})
chrome.tabs.get(tabId)
chrome.tabs.create({url: '...'})

// Windows
chrome.windows.getAll()
chrome.windows.getCurrent()

// Bookmarks
chrome.bookmarks.search('query')

// History
chrome.history.search({text: 'foo'})

// Storage
chrome.storage.local.get(...)

// etc.
```

All APIs declared in `manifest.json` permissions are accessible.

## Troubleshooting

### CDP Connection Fails

```bash
# Check if Chrome is running with debug port
lsof -i :9222

# List all CDP targets
curl http://localhost:9222/json
```

### Background Page WebSocket URL Changed

Extension reloads create new background pages with new IDs. Re-run discovery:

```bash
curl -s http://localhost:9222/json | \
  jq '.[] | select(.url | contains("_generated_background_page.html")) | .webSocketDebuggerUrl'
```

Update `BG_WS` variable in your script.

### No Tabs Returned

Check if Surfingkeys extension is loaded:
```bash
chrome://extensions
```

Verify it has `tabs` permission in `manifest.json` (it does).

## References

- [Chrome DevTools Protocol Documentation](https://chromedevtools.github.io/devtools-protocol/)
- [Runtime Domain](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)

## Session Notes

This approach was discovered after trying:
1. HTTP bridge with polling (too complex)
2. Native messaging (requires host setup)
3. Content script injection (context isolation issues)

**Direct CDP connection to background page** is the simplest and most reliable method.

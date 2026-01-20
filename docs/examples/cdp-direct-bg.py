#!/usr/bin/env python3
import json
import websocket

# Connect to Surfingkeys background page directly
BG_WS = "ws://localhost:9222/devtools/page/5591A6D431C2B1D3B40ABABE62B4A500"

ws = websocket.create_connection(BG_WS)
print("✓ Connected to Surfingkeys background page\n")

# Call chrome.tabs.query directly in background context
js = """
new Promise((resolve) => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        resolve(tabs);
    });
});
"""

ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {
    "expression": js,
    "awaitPromise": True,
    "returnByValue": True
}}))

while True:
    msg = json.loads(ws.recv())
    if msg.get("id") == 1:
        if "value" in msg["result"]["result"]:
            tabs = msg["result"]["result"]["value"]
            for tab in tabs:
                print(f"✓ Active Tab:")
                print(f"  Title: {tab['title']}")
                print(f"  URL: {tab['url']}")
                print(f"  ID: {tab['id']}")
        else:
            print(json.dumps(msg, indent=2))
        break

ws.close()

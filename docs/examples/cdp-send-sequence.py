#!/usr/bin/env python3
"""
CDP Experiment: Send key sequence 't', arrow down, enter
"""

import json
import websocket
import time
import requests

# Google tab WebSocket URL
WS_URL = "ws://localhost:9222/devtools/page/079471019CB0604A35B05F739AA50908"

def send_key(ws, key_name, text=None, code=None, key_code=None, cmd_id_start=1):
    """Send a complete key press (keyDown, char if text, keyUp)"""

    # keyDown
    params = {
        "type": "keyDown",
        "key": key_name
    }
    if code:
        params["code"] = code
    if key_code:
        params["windowsVirtualKeyCode"] = key_code
        params["nativeVirtualKeyCode"] = key_code

    command = {"id": cmd_id_start, "method": "Input.dispatchKeyEvent", "params": params}
    ws.send(json.dumps(command))
    ws.recv()  # Consume response

    # char (only for printable characters)
    if text:
        params = {
            "type": "char",
            "text": text,
            "key": key_name
        }
        command = {"id": cmd_id_start + 1, "method": "Input.dispatchKeyEvent", "params": params}
        ws.send(json.dumps(command))
        ws.recv()  # Consume response

    # keyUp
    params = {
        "type": "keyUp",
        "key": key_name
    }
    if code:
        params["code"] = code
    if key_code:
        params["windowsVirtualKeyCode"] = key_code
        params["nativeVirtualKeyCode"] = key_code

    command = {"id": cmd_id_start + 2, "method": "Input.dispatchKeyEvent", "params": params}
    ws.send(json.dumps(command))
    ws.recv()  # Consume response

def get_active_tab():
    """Get the currently active/focused tab"""
    response = requests.get("http://localhost:9222/json")
    targets = response.json()

    # Filter to just pages
    pages = [t for t in targets if t.get("type") == "page"]

    return pages

def main():
    print("Step 1: Getting current active tab state...")
    before_tabs = get_active_tab()
    print(f"  Found {len(before_tabs)} tabs:")
    for i, tab in enumerate(before_tabs):
        print(f"    [{i}] {tab['title'][:50]}")
    print()

    print("Step 2: Connecting to Google tab...")
    ws = websocket.create_connection(WS_URL)
    print("✓ Connected!\n")

    # Focus the page
    print("Step 3: Bringing page to front...")
    command = {"id": 1, "method": "Page.bringToFront"}
    ws.send(json.dumps(command))
    ws.recv()
    print("✓ Page focused\n")

    time.sleep(0.5)

    # Send key sequence
    print("Step 4: Sending key sequence...")

    print("  📤 Sending 't'")
    send_key(ws, "t", text="t", code="KeyT", key_code=84, cmd_id_start=10)
    print("     [sleeping 500ms]")
    time.sleep(0.5)

    print("  📤 Sending ArrowDown")
    send_key(ws, "ArrowDown", code="ArrowDown", key_code=40, cmd_id_start=20)
    print("     [sleeping 500ms]")
    time.sleep(0.5)

    print("  📤 Sending Enter")
    send_key(ws, "Enter", code="Enter", key_code=13, cmd_id_start=30)
    print("     [sleeping 500ms]")
    time.sleep(0.5)

    print("\n✓ Key sequence sent!\n")

    ws.close()

    # Check tab state after
    print("Step 5: Checking if focused tab changed...")
    time.sleep(1)  # Give Chrome time to switch tabs

    after_tabs = get_active_tab()
    print(f"  Found {len(after_tabs)} tabs:")
    for i, tab in enumerate(after_tabs):
        print(f"    [{i}] {tab['title'][:50]}")
    print()

    # Try to detect which tab is now active by checking URL changes
    print("Step 6: Detecting active tab...")
    print("  (Note: CDP doesn't expose which tab has focus directly)")
    print("  Current tabs:")
    for tab in after_tabs:
        print(f"    - {tab['title'][:40]}")
        print(f"      URL: {tab['url'][:60]}")

    print("\nDone! Check Chrome to see which tab is now active.")

if __name__ == "__main__":
    main()

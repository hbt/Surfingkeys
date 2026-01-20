#!/usr/bin/env python3
"""
End-to-End CDP Test with DevTools Extension Bridge

This script demonstrates a complete testing workflow:
1. Uses CDP to automate browser (send keys)
2. Uses HTTP bridge to query Chrome extension APIs (verify state)
3. Combines both to create a complete test assertion
"""

import json
import websocket
import time
import uuid
from flask import Flask, jsonify, request
import threading
from queue import Queue

# ============================================================================
# HTTP BRIDGE SERVER (communicates with Chrome extension)
# ============================================================================

app = Flask(__name__)
command_queue = []
response_dict = {}

@app.route('/get_command', methods=['GET'])
def get_command():
    """Extension polls this endpoint for commands"""
    if command_queue:
        cmd = command_queue.pop(0)
        return jsonify(cmd)
    return jsonify(None)

@app.route('/post_response', methods=['POST'])
def post_response():
    """Extension posts responses here"""
    data = request.json
    response_dict[data['id']] = data['result']
    return jsonify({'status': 'ok'})

def start_http_server():
    """Start Flask server in background thread"""
    app.run(host='localhost', port=8888, debug=False, use_reloader=False)

# ============================================================================
# EXTENSION API CLIENT (sends commands to extension via HTTP bridge)
# ============================================================================

class ExtensionBridge:
    """Client for querying Chrome extension APIs via HTTP bridge"""

    @staticmethod
    def send_command(command, params=None, timeout=5):
        """Send command to extension and wait for response"""
        cmd_id = str(uuid.uuid4())
        command_obj = {
            'id': cmd_id,
            'command': command,
            'params': params or {}
        }

        # Queue command for extension to pick up
        command_queue.append(command_obj)
        print(f"  [Bridge] Queued command: {command}")

        # Wait for response
        start_time = time.time()
        while cmd_id not in response_dict:
            if time.time() - start_time > timeout:
                raise TimeoutError(f"Extension did not respond to {command}")
            time.sleep(0.1)

        # Get and return response
        response = response_dict.pop(cmd_id)
        print(f"  [Bridge] Got response: {response}")
        return response

    @staticmethod
    def get_active_tab():
        """Get the currently active tab"""
        response = ExtensionBridge.send_command('get_active_tab')
        if response.get('success'):
            return response['data']
        else:
            raise Exception(response.get('error', 'Unknown error'))

    @staticmethod
    def get_all_tabs():
        """Get all open tabs"""
        response = ExtensionBridge.send_command('get_all_tabs')
        if response.get('success'):
            return response['data']
        else:
            raise Exception(response.get('error', 'Unknown error'))

# ============================================================================
# CDP CLIENT (automates browser)
# ============================================================================

class CDPClient:
    """Client for Chrome DevTools Protocol automation"""

    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url)
        self.cmd_id = 0

    def send_command(self, method, params=None):
        """Send CDP command and get response"""
        self.cmd_id += 1
        command = {
            "id": self.cmd_id,
            "method": method,
            "params": params or {}
        }
        self.ws.send(json.dumps(command))
        response = json.loads(self.ws.recv())
        return response

    def send_key(self, key_name, text=None, code=None, key_code=None):
        """Send a complete key press (keyDown, char, keyUp)"""
        # keyDown
        params = {"type": "keyDown", "key": key_name}
        if code:
            params["code"] = code
        if key_code:
            params["windowsVirtualKeyCode"] = key_code
            params["nativeVirtualKeyCode"] = key_code
        self.send_command("Input.dispatchKeyEvent", params)

        # char (only for printable characters)
        if text:
            params = {"type": "char", "text": text, "key": key_name}
            self.send_command("Input.dispatchKeyEvent", params)

        # keyUp
        params = {"type": "keyUp", "key": key_name}
        if code:
            params["code"] = code
        if key_code:
            params["windowsVirtualKeyCode"] = key_code
            params["nativeVirtualKeyCode"] = key_code
        self.send_command("Input.dispatchKeyEvent", params)

    def close(self):
        """Close connection"""
        self.ws.close()

# ============================================================================
# END-TO-END TEST
# ============================================================================

def run_test():
    """Run the complete end-to-end test"""

    print("\n" + "="*70)
    print("CDP END-TO-END TEST: Tab Switcher Verification")
    print("="*70)

    # Google tab WebSocket URL (from earlier discovery)
    WS_URL = "ws://localhost:9222/devtools/page/079471019CB0604A35B05F739AA50908"

    print("\n[1] SETUP: Connecting to CDP...")
    cdp = CDPClient(WS_URL)

    # Bring page to front
    cdp.send_command("Page.bringToFront")
    print("    ✓ Connected to CDP")

    print("\n[2] PRE-STATE: Get current active tab via Extension Bridge...")
    try:
        before_tab = ExtensionBridge.get_active_tab()
        print(f"    ✓ Active tab BEFORE: {before_tab['title']}")
    except Exception as e:
        print(f"    ⚠ Could not get tab (extension may not be loaded): {e}")
        print("    → Make sure to reload the extension after adding bridge.js!")
        return

    print("\n[3] ACTION: Send key sequence via CDP (t, ArrowDown, Enter)...")
    print("    Sending 't'...")
    cdp.send_key("t", text="t", code="KeyT", key_code=84)
    time.sleep(0.5)

    print("    Sending 'ArrowDown'...")
    cdp.send_key("ArrowDown", code="ArrowDown", key_code=40)
    time.sleep(0.5)

    print("    Sending 'Enter'...")
    cdp.send_key("Enter", code="Enter", key_code=13)
    time.sleep(0.5)

    print("    ✓ Key sequence sent")

    print("\n[4] POST-STATE: Get active tab after automation...")
    time.sleep(1)  # Give Chrome time to switch tabs
    after_tab = ExtensionBridge.get_active_tab()
    print(f"    ✓ Active tab AFTER: {after_tab['title']}")

    print("\n[5] VERIFICATION: Check if tab changed...")
    if before_tab['id'] != after_tab['id']:
        print("    ✅ TEST PASSED: Tab switched successfully")
        print(f"       From: {before_tab['title']}")
        print(f"       To:   {after_tab['title']}")
    else:
        print("    ❌ TEST FAILED: Tab did not change")
        print(f"       Still on: {before_tab['title']}")

    print("\n[6] CLEANUP: Closing connections...")
    cdp.close()
    print("    ✓ CDP connection closed")

    print("\n" + "="*70)
    print("TEST COMPLETE")
    print("="*70 + "\n")

# ============================================================================
# MAIN
# ============================================================================

def main():
    print("Starting HTTP bridge server on http://localhost:8888...")

    # Start Flask server in background thread
    server_thread = threading.Thread(target=start_http_server, daemon=True)
    server_thread.start()

    # Wait for server to start
    time.sleep(2)
    print("✓ HTTP bridge server started\n")

    # Run the test
    try:
        run_test()
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()

    print("\nPress Ctrl+C to exit...")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nExiting...")

if __name__ == "__main__":
    main()

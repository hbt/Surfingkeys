#!/usr/bin/env python3
"""
CDP Console Logger - Captures all console output to file

Usage: python3 cdp-console-logger.py /tmp/console.log
"""

import json
import websocket
import requests
import threading
import sys
from datetime import datetime

LOG_FILE = sys.argv[1] if len(sys.argv) > 1 else "/tmp/chrome-console.log"

def log_to_file(target_title, log_type, message):
    """Append console message to log file"""
    timestamp = datetime.now().isoformat()
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{timestamp}] [{target_title}] {log_type.upper()}: {message}\n")
        f.flush()

def listen_to_target(target):
    """Connect to a target and listen for console events"""
    ws_url = target['webSocketDebuggerUrl']
    title = target.get('title', 'Unknown')

    def on_message(ws, message):
        data = json.loads(message)

        # Console API called (console.log, console.error, etc.)
        if data.get('method') == 'Runtime.consoleAPICalled':
            params = data['params']
            log_type = params['type']  # log, error, warn, info, debug
            args = params.get('args', [])

            # Extract text from arguments
            texts = []
            for arg in args:
                if arg.get('type') == 'string':
                    texts.append(arg['value'])
                else:
                    texts.append(str(arg.get('value', arg.get('description', ''))))

            message = ' '.join(texts)
            log_to_file(title, log_type, message)
            print(f"[{title}] {log_type}: {message}")

        # Exception thrown
        elif data.get('method') == 'Runtime.exceptionThrown':
            exception = data['params']['exceptionDetails']
            error_msg = exception.get('text', 'Unknown error')
            log_to_file(title, 'exception', error_msg)
            print(f"[{title}] EXCEPTION: {error_msg}")

    ws = websocket.WebSocketApp(ws_url, on_message=on_message)

    # Enable Runtime domain
    def on_open(ws):
        ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        ws.send(json.dumps({"id": 2, "method": "Log.enable"}))
        print(f"✓ Listening to: {title}")

    ws.on_open = on_open
    ws.run_forever()

def main():
    print(f"CDP Console Logger")
    print(f"Log file: {LOG_FILE}\n")

    # Get all targets
    response = requests.get("http://localhost:9222/json")
    targets = response.json()

    # Filter to pages and extensions only
    targets = [t for t in targets if t.get('type') in ['page', 'background_page']]

    print(f"Found {len(targets)} targets\n")

    # Start a thread for each target
    threads = []
    for target in targets:
        t = threading.Thread(target=listen_to_target, args=(target,), daemon=True)
        t.start()
        threads.append(t)

    print("\n📝 Logging console output (Ctrl+C to stop)...\n")

    # Keep main thread alive
    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        print("\nStopped.")

if __name__ == "__main__":
    main()

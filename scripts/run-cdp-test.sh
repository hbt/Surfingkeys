#!/bin/bash
# CDP Test Runner - Starts monitor in background and shows status

set -e

LOG_FILE="/tmp/surfingkeys-cdp.log"

# Kill any existing CDP test processes
pkill -f "ts-node tests/cdp-basic.ts" 2>/dev/null || true

# Start CDP monitor in background
npx ts-node tests/cdp-basic.ts >> $LOG_FILE 2>&1 &
CDP_PID=$!

# Wait a moment for it to start
sleep 2

# Check if process is still running
if ! kill -0 $CDP_PID 2>/dev/null; then
    echo "❌ CDP test failed to start. Check that Chrome is running with --remote-debugging-port=9222"
    echo "See logs: $LOG_FILE"
    exit 1
fi

echo "✓ CDP monitor started (PID: $CDP_PID)"
echo "✓ Logs: $LOG_FILE"
echo ""
echo "Monitor running in background. To view logs:"
echo "  tail -f $LOG_FILE"
echo ""
echo "To stop monitor:"
echo "  kill $CDP_PID"
echo ""

# Show last few lines from log
tail -n 10 $LOG_FILE 2>/dev/null || true

#!/bin/bash
# CDP Test Runner - Switch between live and headless modes
# Usage: ./run-test.sh [live|headless] <test-file>

MODE=$1
TEST_FILE=$2

if [ -z "$MODE" ] || [ -z "$TEST_FILE" ]; then
    echo "Usage: $0 [live|headless] <test-file>"
    echo ""
    echo "Examples:"
    echo "  $0 live debug/cdp-debug-verify-working.ts"
    echo "  $0 headless debug/cdp-test-hints-headless.ts"
    exit 1
fi

if [ "$MODE" = "live" ]; then
    export CDP_PORT=9222
    export CDP_MODE=live
    export CDP_HOST=localhost
    echo "Running in LIVE mode (port 9222)..."
elif [ "$MODE" = "headless" ]; then
    export CDP_PORT=9223
    export CDP_MODE=headless
    export CDP_HOST=localhost
    echo "Running in HEADLESS mode (port 9223)..."
else
    echo "Error: Mode must be 'live' or 'headless'"
    exit 1
fi

if [ ! -f "$TEST_FILE" ]; then
    echo "Error: Test file not found: $TEST_FILE"
    exit 1
fi

echo "Test file: $TEST_FILE"
echo "CDP endpoint: http://${CDP_HOST}:${CDP_PORT}"
echo ""

npx ts-node "$TEST_FILE"

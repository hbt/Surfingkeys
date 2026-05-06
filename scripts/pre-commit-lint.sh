#!/bin/bash
# Pre-commit hook to run all fast verification checks (lint + integrity + validate)
# This hook provides warnings only and does not prevent commits

echo "🔍 Running fast checks..."

# Run all fast checks (lint + integrity + validate)
bun scripts/verify.ts

# Capture the exit code
VERIFY_EXIT_CODE=$?

# Display result
if [ $VERIFY_EXIT_CODE -eq 0 ]; then
    echo "✅ All checks passed"
else
    echo "⚠️  One or more checks failed (commit will proceed)"
fi

# Always exit with 0 to allow commit to proceed
exit 0

#!/bin/bash
# Pre-commit hook to run linter
# This hook provides warnings only and does not prevent commits

echo "🔍 Running linter..."

# Run the linter
npm run lint

# Capture the exit code
LINT_EXIT_CODE=$?

# Display result
if [ $LINT_EXIT_CODE -eq 0 ]; then
    echo "✅ Linter passed successfully"
else
    echo "⚠️  Linter found issues (commit will proceed)"
fi

# Always exit with 0 to allow commit to proceed
exit 0

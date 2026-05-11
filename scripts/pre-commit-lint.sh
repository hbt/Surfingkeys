#!/bin/bash
# Pre-commit hook: fast checks + Playwright suite
# Blocks commits on any failure — fix regressions before committing.
# To bypass (not recommended): git commit --no-verify

echo "🔍 Running checks (lint + Playwright suite)..."

bun scripts/verify.ts && bun scripts/verify.ts --only tests

VERIFY_EXIT_CODE=$?

if [ $VERIFY_EXIT_CODE -eq 0 ]; then
    echo "✅ All checks passed"
else
    echo "❌ Checks failed — fix regressions before committing"
    echo "   To bypass (not recommended): git commit --no-verify"
fi

exit $VERIFY_EXIT_CODE

#!/bin/bash
# Pre-commit hook: fast checks + Playwright suite
# Blocks commits on any failure — fix regressions before committing.
# To bypass (not recommended): git commit --no-verify

REPO_ROOT=$(git rev-parse --show-toplevel)

bun "$REPO_ROOT/scripts/verify.ts"

if [ $? -eq 0 ]; then
    echo "✅ All checks passed"
else
    echo "❌ Checks failed — fix before committing"
    echo "   To bypass: git commit --no-verify"
    exit 1
fi

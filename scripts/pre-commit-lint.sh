#!/bin/bash
# Pre-commit hook: fast checks + Playwright suite
# Blocks commits on any failure — fix regressions before committing.
# To bypass (not recommended): git commit --no-verify

REPO_ROOT=$(git rev-parse --show-toplevel)

# Get all staged files
STAGED=$(git diff --cached --name-only)

# If there are staged files and ALL of them are .md, skip verify
if [ -n "$STAGED" ] && ! echo "$STAGED" | grep -qv '\.md$'; then
    echo "⚡ Skipping verify — markdown-only commit"
    exit 0
fi

bun "$REPO_ROOT/scripts/verify.ts"

if [ $? -eq 0 ]; then
    echo "✅ All checks passed"
else
    echo "❌ Checks failed — fix before committing"
    echo "   To bypass: git commit --no-verify"
    exit 1
fi

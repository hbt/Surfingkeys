#!/bin/bash
# Post-commit: run verify then enqueue commit to CI (fire-and-forget)

REPO_ROOT=$(git rev-parse --show-toplevel)

bun "$REPO_ROOT/scripts/verify.ts"

if [ $? -eq 0 ]; then
    echo "✅ All checks passed"
else
    echo "⚠️  Checks failed — consider amending or fixing forward"
fi

SHA=$(git rev-parse HEAD)
SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
nohup bash -c "bun $SCRIPT_DIR/post-commit.ts $SHA" >/tmp/post-commit-ci.log 2>&1 &
exit 0

#!/bin/bash
# Post-commit: enqueue commit to ctms-ops CI (fire-and-forget)
SHA=$(git rev-parse HEAD)
SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
nohup bash -c "bun $SCRIPT_DIR/post-commit.ts $SHA" >/tmp/post-commit-ci.log 2>&1 &
exit 0

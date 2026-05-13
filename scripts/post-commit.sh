#!/bin/bash
# Post-commit: enqueue commit to ctms-ops CI (fire-and-forget)
SHA=$(git rev-parse HEAD)
nohup bash -c "bun $(dirname "$0")/post-commit.ts $SHA" >/tmp/post-commit-ci.log 2>&1 &
exit 0

# Plan: Move Heavy Verify to CI, Keep Shell Fast

## Context

Currently `pre-commit-lint.sh` runs all 5 fast checks (~35-40s) before every commit, blocking the shell. The CI system (`ci-worker.ts` on ctms-ops) already runs the full suite remotely — so the pre-commit is duplicating work and slowing down the commit loop.

Goal: commit instantly (or near-instantly), let CI own the full check history, and have the post-commit hook prompt the coding agent to `/loop` and monitor CI status.

---

## Changes

### 1. `scripts/pre-commit-lint.sh` — single fast sanity only

Replace all 5 checks with just the build check (~1-2s). If esbuild fails the code can't even ship, everything else is moot. TypeScript and lint will be caught by CI.

```bash
#!/bin/bash
REPO_ROOT=$(git rev-parse --show-toplevel)
bun "$REPO_ROOT/scripts/verify.ts" --only build
if [ $? -ne 0 ]; then
    echo "❌ Build failed — fix before committing"
    exit 1
fi
```

> Alternative: `--only build,integrity` (~3s) adds mappings schema check. User to decide.

---

### 2. `scripts/post-commit.sh` — add loop hint after queuing

After enqueueing, print a line the coding agent can act on:

```bash
#!/bin/bash
SHA=$(git rev-parse HEAD)
SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
nohup bash -c "bun $SCRIPT_DIR/post-commit.ts $SHA" >/tmp/post-commit-ci.log 2>&1 &
echo "[ci] ${SHA:0:8} queued — check: bun scripts/ci.ts report"
echo "     /loop 5m bun scripts/ci.ts report"
exit 0
```

This gives the agent a concrete command to loop on and a human-readable reminder.

---

## Remaining Optimisations to verify.ts

### 3. Deduplicate `buildReport()` — merge `integrity` + `issues` into one check

Both the `integrity` and `issues` fast checks independently call `buildReport()` (full AST scan of `src/`, coverage data, custom config parse — ~13s each). They run in parallel so wall time is unaffected, but they double CPU load during that window.

Options:
- Merge into a single `verify.ts` check that runs `buildReport()` once, then validates schema + checks issues in the same process
- Or: make `check-issues.ts` accept a pre-built report JSON on stdin / as a flag to avoid the subprocess re-spawn

**Impact:** reduces CPU load, makes the parallel window cleaner. Wall time unchanged.

---

## What CI Already Handles (no changes needed)

| Component | What it does |
|-----------|-------------|
| `post-commit.ts` | Pushes SHA to ctms-ops, writes queue entry |
| `ci-worker.ts` | Dequeues, checks out SHA, runs full Docker test suite |
| `ci-gather.ts` | rsync results back locally |
| `bun scripts/ci.ts report` | Shows queue + completed runs (SHA, pass/fail, duration) |

CI result keyed by SHA in `test-artifacts/reports/runs/<ts>-<sha>-docker.json`. Check with `stats.unexpected === 0`.

---

## Files to Modify

| File | Change |
|------|--------|
| `scripts/pre-commit-lint.sh` | Replace 5-check verify with `--only build` |
| `scripts/post-commit.sh` | Add echo hint after nohup line |

---

## Verification

1. Make a commit — should complete in ~1-2s (build only)
2. Post-commit prints `[ci] <sha> queued — check: bun scripts/ci.ts report`
3. Run `/loop 5m bun scripts/ci.ts report` — after ~5-10min CI result appears
4. Confirm `stats.unexpected === 0` for the commit SHA

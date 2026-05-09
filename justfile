# Surfingkeys — task runner

# List available commands
default:
    @just --list

# ── worktree ──────────────────────────────────────────────────────────────────

# Show status of all worktrees (branch, ahead/behind master, dirty state, last commit)
worktree-status:
    bun scripts/worktree-status.ts

# Merge a worktree branch into master.
# Usage: just worktree-merge feat/my-feature
#        just worktree-merge feat/my-feature --remove
worktree-merge branch *args:
    bun scripts/worktree-merge.ts "{{branch}}" {{args}}

# Set up a newly created worktree (symlinks node_modules + builds)
worktree-setup:
    bun scripts/worktree-setup.ts

# ── build ─────────────────────────────────────────────────────────────────────

# Development build
build:
    npm run build:dev

# Production build
build-prod:
    npm run build:prod

# ── test ──────────────────────────────────────────────────────────────────────

# Run Playwright tests (parallel)
test:
    npm run test:playwright:parallel

# ── lint ──────────────────────────────────────────────────────────────────────

# Run all linters
lint:
    npm run lint

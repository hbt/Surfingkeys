# Surfingkeys Dev Guide

- User uses voice-to-text (expect typos: "Doc db" → DuckDB)


## Browser Profiles — CRITICAL LIMITATION

**NEVER suggest using CDP/remote debug port against `gchrb` (the main browser profile).**

| Profile | Remote Debug Port | CDP / dbg proxy / sk-cdp |
|---------|------------------|--------------------------|
| `gchrb` | ❌ None | ❌ Not available |
| `gchrb-dev` | ✅ Yes | ✅ Works |

- `gchrb` is the regular daily-use Chrome. Chrome does not allow attaching a remote debug port to an existing profile that wasn't launched with one.
- `gchrb-dev` is a separate profile launched with `--remote-debugging-port`. All CDP tooling (`./bin/sk-cdp`, `./bin/dbg proxy-*`) only works there.
- When the user says "I reloaded the extension in my browser" they mean `gchrb`. There is no debug port there. Do not suggest `sk-cdp eval` or CDP inspection as a debugging step for `gchrb`.


## Development Commands

**Quick CDP inspection:**
```bash
./bin/sk-cdp eval --target bg "chrome.runtime.id"        # Service worker
./bin/sk-cdp eval --target google.com "document.title"   # Any matching tab
./bin/sk-cdp targets                                      # List all targets
./bin/sk-cdp targets --json                               # Machine-readable
```

**Proxy & logging:**
```bash
./bin/dbg proxy-start   # Captures all console & exceptions → /tmp/dbg-proxy.log
./bin/dbg proxy-stop
./bin/dbg proxy-status
```

**Reload & build:**
```bash
./bin/dbg reload        # Build + reload extension (returns JSON with build.timestamp)
./bin/dbg --help        # Full reference
```

See **[docs/dev.md](docs/dev.md)** for the full debugging guide (CDP proxy, debug scripts, sk-cdp).


## Automated Testing

Use Playwright for all new tests. Legacy CDP/Jest tests in `tests/cdp/` are not being extended.

```bash
# Single test
bunx playwright test tests/playwright/commands/cmd-scroll-down.spec.ts

# Full suite
npm run test:playwright:parallel
```

See **[tests/playwright/CLAUDE.md](tests/playwright/CLAUDE.md)** for coverage, instrumentation, fixtures, and conventions.


## Git Worktrees

Worktrees let you work on a branch in a separate directory without disturbing the main checkout.

### Create a worktree

```bash
git worktree add /home/hassen/workspace/surfingkeys-<branch-name> -b <branch-name>
```

### Required setup after creation

```bash
cd /path/to/new-worktree
npm run worktree:setup   # symlinks node_modules + builds extension
```

> After each cherry-pick or code change, re-run `npm run build:dev` before running tests.

### List / remove worktrees

```bash
git worktree list
git worktree remove /path/to/worktree
```

### Upstream sync workflow

When syncing from `brookhong/Surfingkeys`:
1. Create worktree on a dedicated branch (`upstream-sync`)
2. Run `npm run worktree:setup`
3. Cherry-pick commits one at a time oldest→newest, skipping version bumps
4. For each: review diff → cherry-pick → build → smoke test → full suite
5. Commits that conflict with hbt work go in `upstream-excluded.json` with a reason

```bash
git fetch brookhong
git log master..brookhong/master --oneline   # filter against upstream-excluded.json
```


## Documentation

| File | Purpose |
|------|---------|
| docs/dev.md | Full dev workflow: debugging, CDP proxy, sk-cdp, Playwright testing |
| docs/api.md | General API (generated: `npm run build:doc`) |
| docs/cmds.md | Keyboard commands (generated: `npm run build:doc-cmds`) |
| docs/adrs/ | Architecture decision records |
| docs/cdp/proxy.md | CDP proxy examples and request formats |
| docs/refs/chrome-api/ | Chrome extension + DevTools protocol API reference |
| docs/initial-upstream-repo-analysis/glossary.md | Terms and acronyms — initial analysis |
| docs/initial-upstream-repo-analysis/feature-tree.md | Feature tree — initial analysis |
| docs/initial-upstream-repo-analysis/ui-flow.md | UI screens and flows — initial analysis |
| docs/initial-upstream-repo-analysis/c4/ | C2 and C3 architecture diagrams — initial analysis |

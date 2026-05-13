# Surfingkeys Dev Guide

- User uses voice-to-text (expect typos: "Doc db" → DuckDB)


## Browser Profiles — CRITICAL LIMITATION

**NEVER suggest using CDP/remote debug port against `gchrb` (the main browser profile).**

| Profile | Remote Debug Port | CDP / dbg proxy / sk-cdp | sk-devtools eval relay |
|---------|------------------|--------------------------|------------------------|
| `gchrb` | ❌ None | ❌ Not available | ✅ Works (requires F12 setup) |
| `gchrb-dev` | ✅ Yes | ✅ Works | ✅ Works |

- `gchrb` is the regular daily-use Chrome. Chrome does not allow attaching a remote debug port to an existing profile that wasn't launched with one.
- `gchrb-dev` is a separate profile launched with `--remote-debugging-port`. All CDP tooling (`./bin/sk-cdp`, `./bin/dbg proxy-*`) only works there.
- When the user says "I reloaded the extension in my browser" they mean `gchrb`. There is no debug port there. Do not suggest `sk-cdp eval` or CDP inspection as a debugging step for `gchrb`.
- **When you need to run JS in `gchrb`**, use the sk-devtools eval relay instead (see section below).


## gchrb Debugging — sk-devtools Eval Relay

When CDP is unavailable (i.e. the user is on `gchrb`), use the eval relay: a local HTTP server on `:9600` that forwards JS to the extension's DevTools panel via SSE.

**Setup (one-time per session):**
```bash
./bin/dbg server-start          # Start relay server on :9600
./bin/dbg server-status         # Verify: { "running": true }
```
Then in gchrb: press **F12** → click the **"Surfingkeys"** tab in DevTools. Badge shows `sk-devtools | ● Connected`.

**Check panel is ready:**
```bash
curl -s http://localhost:9600/eval-status | jq .
# Must show: { "panelConnected": true }
```

**Run JS in the service worker:**
```bash
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"bg","code":"chrome.runtime.id"}' | jq .
```

**Run JS in the inspected page:**
```bash
curl -s -X POST http://localhost:9600/eval \
  -H 'Content-Type: application/json' \
  -d '{"target":"page","code":"document.title"}' | jq .
```

See **[.claude/commands/devtools.md](.claude/commands/devtools.md)** for full reference, troubleshooting, and more examples.


## Development Commands

### Build vs Reload

| Command | What it does | Use when |
|---------|-------------|----------|
| `npm run build:dev` | Build only (no Chrome interaction) | gchrb manual reload, worktree setup, CI |
| `./bin/dbg reload` | Build + reload extension in `gchrb-dev` | Active dev loop with CDP tooling |

After `./bin/dbg reload`, the extension is live in `gchrb-dev`. If the user reloads manually in `gchrb`, run `npm run build:dev` first.

### CDP inspection (gchrb-dev only)

```bash
./bin/sk-cdp eval --target bg "chrome.runtime.id"        # Service worker
./bin/sk-cdp eval --target google.com "document.title"   # Any matching tab
./bin/sk-cdp targets                                      # List all targets
./bin/sk-cdp targets --json                               # Machine-readable
```

### CDP proxy & logging (gchrb-dev only)

```bash
./bin/dbg proxy-start   # Captures all console & exceptions → /tmp/dbg-proxy.log
./bin/dbg proxy-stop
./bin/dbg proxy-status
```

### Full bin/dbg reference

```bash
./bin/dbg reload              # Build + reload extension in gchrb-dev
./bin/dbg proxy-start         # Start CDP proxy → /tmp/dbg-proxy.log
./bin/dbg proxy-stop
./bin/dbg proxy-status
./bin/dbg server-start        # Start sk-devtools relay server on :9600
./bin/dbg server-stop
./bin/dbg server-status
./bin/dbg open-background     # Open SW DevTools console
./bin/dbg errors-list         # List stored extension errors
./bin/dbg errors-clear        # Clear stored extension errors
./bin/dbg config-set          # Set external config file path in storage
./bin/dbg config-clear        # Wipe all config state
./bin/dbg --help              # Full reference
```

See **[docs/dev.md](docs/dev.md)** for the full debugging guide (CDP proxy, debug scripts, sk-cdp).


## Automated Testing

Use Playwright for all new tests. Legacy CDP/Jest tests in `tests/cdp/` are not being extended.

```bash
# Single test
bunx playwright test tests/playwright/commands/cmd-scroll-down.spec.ts

# Single test with V8 coverage
COVERAGE=true bunx playwright test tests/playwright/commands/cmd-scroll-down.spec.ts

# Full suite
npm run test:playwright:parallel
```

### Playwright conventions (enforce strictly)

| Rule | Detail |
|------|--------|
| One command per file | Never put two `unique_id`s in one spec |
| File naming | `cmd-<unique_id-with-dashes>.spec.ts` |
| SW vs page target | Tab/bookmark/session commands → SW target; scroll/hints/nav → page target |
| Fixtures | Self-contained — inline styles, no external URLs |
| Known flaky | `cmd-hints-learn-element`, `cmd-visual-document-start`, `cmd-nav-next-link`, `cmd-scroll-half-page-down` — ignore first failure |

See **[tests/playwright/CLAUDE.md](tests/playwright/CLAUDE.md)** for coverage, instrumentation, fixtures, and full template.


### Test Run History

Past runs saved to `test-artifacts/reports/runs/` by `npm run test:playwright:parallel` (`scripts/test-parallel.ts`).

| Path | Content | Notes |
|------|---------|-------|
| `test-artifacts/reports/runs/<ts>-<hash>.json` | Full Playwright JSON reporter output | Persisted — all runs kept |
| `test-artifacts/results/` | Per-test artifacts (screenshots, traces, error context) | Latest run only — overwritten |
| `test-artifacts/playwright/` | HTML report | Latest run only — overwritten |

Filename format: `<ISO-timestamp>-<short-git-hash>.json`

**Summarize all runs:**
```bash
python3 -c "
import json, glob, os
for f in sorted(glob.glob('test-artifacts/reports/runs/*.json')):
    d = json.load(open(f)); s = d['stats']
    print(f'{os.path.basename(f)}  pass={s[\"expected\"]}  fail={s[\"unexpected\"]}  flaky={s[\"flaky\"]}')
"
```

**Find last clean run (0 failures):**
```bash
python3 -c "
import json, glob, os
for f in sorted(glob.glob('test-artifacts/reports/runs/*.json'), reverse=True):
    d = json.load(open(f)); s = d['stats']
    if s['unexpected'] == 0:
        print('Last clean:', os.path.basename(f)); break
"
```

**List failing tests in a specific run:**
```bash
python3 -c "
import json, sys
def walk(suites):
    for s in suites:
        for spec in s.get('specs', []):
            for t in spec.get('tests', []):
                if t.get('status') == 'unexpected':
                    print(spec['file'], '|', spec['title'])
        walk(s.get('suites', []))
walk(json.load(open(sys.argv[1]))['suites'])
" test-artifacts/reports/runs/<filename>.json
```

**Current known failures:**

| Test | Status |
|------|--------|
| `commands/cmd-capture-scrolling-element` | skipped in Docker (popup timing); passes locally |
| `commands/cmd-capture-full-page` | skipped in Docker (popup timing); passes locally |
| `commands/cmd-nav-next-link` | skipped in Docker (navigation timing flaky) |
| `features/config-server-debug` › fixture config applied | skipped in Docker (user script registration timing) |

Last fully clean run: commit `a7f779a` — 2026-05-12T22:35 (730 pass, 0 fail, 4 flaky) — 2 capture tests skipped in Docker (popup timing)


## Tab Command Architecture

New tab commands go through the `tabHandleMagic` dispatch system — **not** legacy handlers like `tabOnly`, `tabCloseM`, etc.

Pattern: `closeTabMagic` → `reloadTabMagic` → any new `*TabMagic`

- Handler receives a `direction` (e.g. `CurrentTab`, `DirectionRight`, `DirectionLeft`, `DirectionRightAll`) and `repeats`
- Registered via `mapkey(key, desc, () => RUNTIME(unique_id, { direction, repeats: R }))` in `default.js`
- Dispatched in `start.js` via `commandRegistry`
- Use `var repeats = message.repeats` (not `|| 1` fallback)
- Use `chrome.tabs.query({})` (not `{currentWindow: true}`) to support cross-window magic

When adding a new tab magic command, read `closeTabMagic` as the canonical reference.


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


## Archive

`/home/hassen/workspace/surfingkeys-archive` — old legacy fork with many custom commands being migrated into this fork (which is based on latest upstream). Use it to look up existing custom commands, mappings, or behaviour not yet ported here.

## Config Files

| File | Used by | Notes |
|------|---------|-------|
| `/home/hassen/.surfingkeys-2026.js` | **This fork** (current) | Active config loaded by the extension |
| `/home/hassen/.surfingkeysrc` | **Archive** (legacy fork) | Reference only — do not treat as current config |


## Mappings Report

```bash
bun scripts/mappings-json-report.ts            # Full JSON report
bun scripts/mappings-json-report.ts --schema   # Print the JSON schema (use to understand report structure before querying)
bun scripts/mappings-json-report.ts --integrity  # Run integrity checks
```

Top-level keys: `mappings.list[]`, `settings`, `issues`, `custom_configuration`.
Each entry's metadata lives under `.annotation` (not top-level).


## Documentation

| File | Purpose |
|------|---------|
| docs/dev.md | Full dev workflow: debugging, CDP proxy, sk-cdp, Playwright testing |
| docs/devtools.md | sk-devtools eval relay — run JS in gchrb SW/page via DevTools panel |
| docs/api.md | General API (generated: `npm run build:doc`) |
| docs/cmds.md | Keyboard commands (generated: `npm run build:doc-cmds`) |
| docs/adrs/ | Architecture decision records |
| docs/cdp/proxy.md | CDP proxy examples and request formats |
| docs/refs/chrome-api/ | Chrome extension + DevTools protocol API reference |
| docs/initial-upstream-repo-analysis/glossary.md | Terms and acronyms — initial analysis |
| docs/initial-upstream-repo-analysis/feature-tree.md | Feature tree — initial analysis |
| docs/initial-upstream-repo-analysis/ui-flow.md | UI screens and flows — initial analysis |
| docs/initial-upstream-repo-analysis/c4/ | C2 and C3 architecture diagrams — initial analysis |

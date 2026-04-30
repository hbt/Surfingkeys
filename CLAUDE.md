- User uses voice-to-text (expect typos: "Doc db" → DuckDB)


## Development Commands

#### // TODO(hbt) NEXT [dev] add healthcheck + autofix (clean clone, deps, bun, config, servers, tests, debug, dev) and better examples + refs for sk-cdp

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

### Playwright (primary — use for all new tests)

```bash
# Single test
bunx playwright test tests/playwright/commands/cmd-scroll-down.spec.ts

# Full suite (dot reporter, minimal output)
npm run test:playwright:parallel

# Single test with V8 coverage
COVERAGE=true bunx playwright test tests/playwright/commands/cmd-scroll-down.spec.ts

# Full suite with coverage (one report per file)
COVERAGE=true npm run test:playwright:parallel
```

**Coverage output** shows functions actually executed during each test, with call counts:
```
[Coverage:cmd_scroll_down] 66 functions hit — http://127.0.0.1:9873/scroll-test.html
  x  80  Mode.hasScroll
  x   3  elm.safeScroll_
  x   2  scroll
  x   2  KeyboardUtils.decodeKeystroke
  ...
```

**Coverage target** is selected automatically per spec:
- Content-script commands (scroll, hints, visual, insert, nav): page target
- Background commands (tab, session, bookmark): service worker target

To instrument a new spec, use `launchWithCoverage` in `tests/playwright/utils/pw-helpers.ts`:
```typescript
// Page target (content-script commands)
const result = await launchWithCoverage(FIXTURE_URL);
context = result.context;
await page.goto(FIXTURE_URL);
cov = await result.covInit();   // after goto

// SW target (background commands)
const result = await launchWithCoverage();
context = result.context;
cov = result.cov;               // ready immediately
```

### Jest/CDP (legacy — not for new tests)

Old CDP-based tests live in `tests/cdp/`. Still runnable but not being extended:
```bash
./bin/dbg test-run tests/cdp/commands/cmd-scroll-down.test.ts   # single
./bin/dbg run-allp                                               # all (parallel)
```

See `docs/dev.md` for full legacy test reference.


### Test fixtures & organisation

- Fixtures must be **self-contained** — inline styles, no external URLs (external links cause flakiness)
- Name spec files after command `unique_id`: `cmd-scroll-down.spec.ts`
- One command per file
- Fixture server runs on `http://127.0.0.1:9873` (`tests/fixtures-server.js`)


## Git Worktrees

Worktrees let you work on a branch in a separate directory without disturbing the main checkout — useful for upstream syncs, experiments, or parallel work.

### Create a worktree

```bash
git worktree add /home/hassen/workspace/surfingkeys-<branch-name> -b <branch-name>
# e.g.
git worktree add /home/hassen/workspace/surfingkeys-upstream-sync -b upstream-sync
```

### Required setup after creation

A new worktree shares git history but has **no `node_modules` and no build output**. Playwright tests load the extension from `dist/development/chrome`, so both are required before tests can run.

```bash
cd /path/to/new-worktree
npm run worktree:setup   # symlinks node_modules + builds extension
```

What `worktree:setup` does:
1. Symlinks `node_modules` from the main worktree (avoids reinstall)
2. Runs `npm run build:dev` to produce `dist/development/chrome`

> After each cherry-pick or code change, re-run `npm run build:dev` to keep the extension in sync before running tests.

### List / remove worktrees

```bash
git worktree list                    # show all
git worktree remove /path/to/worktree
```

### Upstream sync workflow

When syncing from `brookhong/Surfingkeys`:
1. Create worktree on a dedicated branch (`upstream-sync`)
2. Run `npm run worktree:setup`
3. Cherry-pick commits one at a time oldest→newest, skipping version bumps
4. For each: review diff → cherry-pick → build → smoke test → full suite
5. Commits that conflict with hbt work and should be skipped go in `upstream-excluded.json` with a reason
6. Pre-existing flaky tests (ignore if they pass on retry): `cmd-hints-learn-element`, `cmd-visual-document-start`, `cmd-nav-next-link`, `cmd-scroll-half-page-down`

**Check what's new upstream:**
```bash
git fetch brookhong
git log master..brookhong/master --oneline   # then filter against upstream-excluded.json
```


## Documentation
#### // TODO(hbt) NEXT [docs] clean up after review + migration

| File | Purpose |
|------|---------|
| docs/dev.md | Full dev workflow: debugging, CDP proxy, sk-cdp, Playwright testing |
| docs/glossary.md | Terms and acronyms |
| docs/api.md | General API (generated: `npm run build:doc`) |
| docs/cmds.md | Keyboard commands (generated: `npm run build:doc-cmds`) |
| docs/feature-tree.md | Feature tree |
| docs/ui-flow.md | UI screens and flows |
| docs/adrs/ | Architecture decision records |
| docs/migration/ | Current migration process |
| docs/c4/ | C2 and C3 architecture diagrams |
| docs/chrome-api/ | Chrome extension + DevTools protocol API reference |
| docs/cdp/proxy.md | CDP proxy examples and request formats |

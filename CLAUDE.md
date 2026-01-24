- User uses voice-to-text (expect typos: "Doc db" → DuckDB)


## Development Commands

#### // TODO(hbt) NEXT [dev] add healthcheck + autofix (clean clone, deps, bun, config, servers, tests, debug, dev) and better examples + refs for sk-cdp 

**Quick CDP inspection (most common):**
```bash
./bin/sk-cdp eval --target bg "chrome.runtime.id"        # Service worker
./bin/sk-cdp eval --target google.com "document.title"   # Any matching tab
./bin/sk-cdp targets                                      # List all targets
./bin/sk-cdp targets --json                               # Machine-readable
```

**Proxy & logging:**
- Start proxy: `./bin/dbg proxy-start` (auto-captures console & exceptions to `/tmp/dbg-proxy.log`)
- Stop proxy: `./bin/dbg proxy-stop`
- Check status: `./bin/dbg proxy-status`

**Reload & build:**
- Reload extension: `./bin/dbg reload` - builds and reloads (returns JSON with build.timestamp)
- More debugging: `./bin/dbg --help` - returns JSON

## Debugging Approaches

See **[docs/dev.md](docs/dev.md)** for comprehensive guide to all 3 debugging strategies.

### 1a. CDP + Proxy via websocat (Fastest one-liners)
Start proxy: `./bin/dbg proxy-start` (auto-logs all console & exceptions to `/tmp/dbg-proxy.log`)

One-liner CDP commands via websocat (instant feedback, no build):
```bash
echo '{"targetId": "...", "method": "Runtime.evaluate", "params": {...}}' | websocat ws://127.0.0.1:9623
```

See [docs/cdp/proxy.md](docs/cdp/proxy.md) for examples.

**Use this for:** Very quick single-line checks, minimal overhead
**Logging:** All console output automatically captured by proxy

### 1b. CDP + sk-cdp CLI (Recommended for most cases)
Start proxy: `./bin/dbg proxy-start` (captures all console & exceptions to `/tmp/dbg-proxy.log`)

**Commands:**
```bash
./bin/sk-cdp eval --target bg "chrome.runtime.id"     # Eval in service worker
./bin/sk-cdp eval --target options "document.title"   # Eval in options page
./bin/sk-cdp targets                                   # List all CDP targets
./bin/sk-cdp targets --json                            # Machine-readable output
./bin/sk-cdp send --target bg "Runtime.evaluate" '{}'  # Raw CDP method
```

**Target Shortcuts:** `bg`, `sw`, `background`, `options`, `frontend`, `popup`

**Features:**
- No JSON escaping or shell quoting
- Target shortcuts for common extension contexts
- Auto-target discovery (service_worker, page, iframe)
- Automatic metadata: Duration, DOM changes, tab state, console log reference
- `--json` output for scripting and agents

See [docs/cdp/sk-cdp.md](docs/cdp/sk-cdp.md) for full reference.

**Use this for:** Inspections, side-effect verification, full debugging observability

### 2. CDP Debug Scripts (Reusable patterns)
#### // TODO(hbt) NEXT [docs] fix examples. screenshot methods through chrome dont account for UI (e.g ;  + screenshot) . gnome screenshots are better?. write test
```bash
npm run debug:cdp:live debug/cdp-screenshot.ts
npm run debug:cdp:headless debug/cdp-screenshot.ts
```

Gold standard screenshot: `debug/cdp-screenshot.ts` (works headless & live)

**Use this for:** Complex debugging, reusable patterns, reproducible debugging

### 3. Direct Modification + bin/dbg reload (Persistent changes)
```bash
bin/dbg reload
```

Automatically builds and reloads extension.

**Use this for:** Testing actual implementation, verifying build pipeline

### Debug Scripts vs Tests
- **Debug scripts** (`debug/`): Temporary exploratory tools for investigation, prototyping, and iteration. May be kept in git for reference but are not maintained after the debugging session ends (e.g., may break with API changes)
- **Test scripts** (`tests/`): Permanent, stable regression tests that are actively maintained and must remain functional


## Automated Testing using Jest

#### // TODO(hbt) NEXT [tests] consolidate both reporters? fix the headless:seq + :all (aggregate results. pass/fail for whole suite)

### Recommended: Run single test with bin/dbg test-run (preferred method)
```bash
./bin/dbg test-run tests/cdp/commands/cmd-scroll-down.test.ts
```

**Why use this:**
- ✅ **Simplest command** - one command, everything automated
- ✅ **Clean JSON output** - structured report with coverage data to stdout
- ✅ **Complete logging** - all diagnostics and logs written to `/tmp/dbg-headless-*.log`
- ✅ **Full automation** - headless Chrome with Developer Mode + `--enable-experimental-extension-apis --enable-features=UserScriptsAPI`
- ✅ **Per-test coverage** - automatic V8 coverage collection and delta reporting

**Example output:**
```json
{"type":"test-summary","success":true,"tests":2,"passed":2,"failed":0,"slow":0,"assertions":4,"duration":4110,"coverage":...}
```

### Alternative: Direct npm scripts (more verbose)

**Run single test in headless mode:**
```bash
./bin/dbg test-run tests/cdp/commands/cmd-scroll-down.test.ts
```

**Run all tests in parallel headless mode** (limit of 16 concurrent):
```bash
./bin/dbg run-allp
```

**Run single test in live browser** (requires manual setup from user):
```bash
npm run test:cdp:live tests/cdp/commands/cmd-scroll-down.test.ts
```

### Best Practices for Test Fixtures

**Avoid network traffic in tests:**
- ❌ Don't use fixtures with external links (e.g., `hackernews.html` has links to github.com, cloudflare.com, etc.)
- ✅ Use self-contained fixtures like `scroll-test.html` (no external resources)
- ✅ Fixtures should have inline styles, no external CSS/JS
- ✅ Keep fixtures minimal but with enough content for scrolling/interaction

**Example: Good fixture**
```html
<!DOCTYPE html>
<html><head><style>/* inline styles */</style></head>
<body><!-- self-contained content --></body></html>
```

**Test organization:**
- Name test files after command unique_id: `cmd-scroll-down.test.ts`
- One command per test file (focused testing)
- Keep tests simple: behavior verification without complex async waits



## Documentation
#### // TODO(hbt) NEXT [docs] clean up after review + migration

- **docs/dev.md** - Development workflow: 3 debugging approaches (proxy, debug scripts, bin/dbg reload)
- docs/glossary.md - Terms and Acronyms
- docs/feature-tree.md
- docs/api.md - General API (generated using npm run build:doc)
- docs/cmds.md - Keyboard commands (generated using npm run build:doc-cmds)
- docs/ui-flow.md - UI screens and flows
- docs/adrs - ADRs
- docs/migration - Current migration process
- docs/c4 - C2 and C3 architecture
- docs/chrome-api - Chrome extension and DevTools protocol API documentation
- docs/cdp/proxy.md - CDP proxy examples and request formats




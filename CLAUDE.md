- User uses voice-to-text (expect typos: "Doc db" → DuckDB)


## Development Commands

**Quick CDP inspection (most common):**
```bash
sk-cdp eval "document.body.style.backgroundColor"
sk-cdp eval --target options.html "document.querySelectorAll('input').length"
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

Simplified wrapper with no JSON escaping:
```bash
sk-cdp eval "document.body.style.backgroundColor"
sk-cdp eval --target options.html "document.querySelectorAll('input').length"
```

**Features:**
- No JSON escaping or shell quoting
- Auto-target discovery and multi-line code support
- Automatic metadata: Duration, DOM changes, tab state, console log reference
- Detects when side effects fail (e.g., button clicks that don't work)

See [docs/cdp/sk-cdp.md](docs/cdp/sk-cdp.md) for full reference.

**Use this for:** Inspections, side-effect verification, full debugging observability

### 2. CDP Debug Scripts (Reusable patterns)
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

### Run single test in headless mode (fully automated)
npm run test:cdp:headless tests/cdp/cdp-keyboard.test.ts

### Run all tests in parallel headless mode (limit of 16 concurrent)
npm run test:cdp:headless:all

### Run single test in live browser (requires manual setup from user)
npm run test:cdp:live tests/cdp/cdp-keyboard.test.ts



## Documentation

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





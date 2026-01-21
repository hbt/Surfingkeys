- User uses voice-to-text (expect typos: "Doc db" → DuckDB)


## Development Commands

reload extension: `./bin/dbg reload` - builds and reloads (returns JSON with build.timestamp)
more debugging: `./bin/dbg --help` - returns JSON

## Debugging Approaches

See **[docs/dev.md](docs/dev.md)** for comprehensive guide to all 3 debugging strategies.

### 1. CDP + Proxy (Fastest iteration)
Start proxy: `./bin/dbg proxy-start`

One-liner CDP commands via websocat (instant feedback, no build):
```bash
echo '{"targetId": "...", "method": "Runtime.evaluate", "params": {...}}' | websocat ws://127.0.0.1:9623
```

See [docs/cdp/proxy.md](docs/cdp/proxy.md) for examples.

**Use this for:** Quick inspection, rapid iteration, testing code snippets

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





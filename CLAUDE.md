- User uses voice-to-text (expect typos: "Doc db" → DuckDB)


## Development Commands

build: `npm run esbuild:dev`
reload extension: `xdotool key alt+shift+r`


## Automated Testing using Jest

### Run single test in headless mode (fully automated)
npm run test:cdp:headless tests/cdp/cdp-keyboard.test.ts

### Run all tests in parallel headless mode
npm run test:cdp:headless:all

### Run single test in live browser (requires manual setup)
npm run test:cdp:live tests/cdp/cdp-keyboard.test.ts


## Debugging and Live Development using CDP + Code Injection

npm run debug:cdp:headless debug/cdp-debug-live-modification-tabs.ts
npm run debug:cdp:live debug/cdp-debug-live-modification-tabs.ts


### Mode Selection
- **Live mode**: Use when visual inspection or interactive iteration is needed (user will explicitly request this)
- **Headless mode**: Default for automated debugging without browser UI

### Debug Scripts vs Tests
- **Debug scripts** (`debug/`): Temporary exploratory tools for investigation, prototyping, and iteration. May be kept in git for reference but are not maintained after the debugging session ends (e.g., may break with API changes)
- **Test scripts** (`tests/`): Permanent, stable regression tests that are actively maintained and must remain functional



## Documentation

- docs/glossary.md Terms and Acronyms
- docs/feature-tree.md 
- docs/api.md General API (generated using npm run build:doc)
- docs/cmds.md Keyboard commands (generated using npm run build:doc-cmds)
- docs/ui-flow.md UI screens and flows
- docs/testing.md (error logging, debugging, testing)
- docs/adrs ADRs 
- docs/migration Current migration process 
- docs/c4 C2 and C3 architecture 
- docs/chrome-api and node_modules/@types/chrome/index.d.ts Official chrome extension and dev tools extensions APIs documentation in markdown retrieved using (scripts/fetch-all-chrome-apis.sh) and Typescript definitions for the chrome API





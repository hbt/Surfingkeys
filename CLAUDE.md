- User uses voice-to-text (expect typos: "Doc db" → DuckDB)


## Development Commands

build: `npm run esbuild:dev`
reload extension: `xdotool key alt+shift+r`
CDP monitor: `npm run test:cdp` (use run_in_background: true, logs to /tmp/surfingkeys-cdp.log) and then read+monitor the log file every few seconds

## CDP Testing

Live mode (uses browser at port 9222):
- `npm run test:cdp:live tests/cdp/cdp-keyboard.test.ts`
- Setup (one-time):
  1. Manually load extension in Chrome: chrome://extensions/ → Load unpacked → `dist-esbuild/development/chrome`
  2. Start Chrome with: `google-chrome-beta --remote-debugging-port=9222`
- Extension persists in your default profile across restarts

Headless mode (auto-launches isolated Chrome):
- `npm run test:cdp:headless tests/cdp/cdp-keyboard.test.ts`
- No setup needed, fully automated


## Documentation

- docs/glossary.md Terms and Acronyms
- docs/feature-tree.md 
- docs/api.md General API (generated using npm run build:doc)
- docs/cmds.md Keyboard commands (generated using npm run build:doc-cmds)
- docs/testing.md How to test Surfingkeys (wip!)
- docs/ui-flow.md UI screens and flows
- docs/adrs ADRs 
- docs/migration Current migration process 
- docs/c4 C2 and C3 architecture 
- docs/chrome-api and node_modules/@types/chrome/index.d.ts Official chrome extension and dev tools extensions APIs documentation in markdown retrieved using (scripts/fetch-all-chrome-apis.sh) and Typescript definitions for the chrome API





- User uses voice-to-text (expect typos: "Doc db" → DuckDB)


## Development Commands

build: `npm run esbuild:dev`
reload extension: `xdotool key alt+shift+r`
CDP monitor: `npm run test:cdp` (use run_in_background: true, logs to /tmp/surfingkeys-cdp.log) and then read+monitor the log file every few seconds


## Documentation

- docs/glossary.md Terms and Acronyms
- docs/feature-tree.md 
- docs/api.md General API (generated using npm run build:doc)
- docs/cmds.md Keyboard commands (generated using npm run build:doc-cmds)
- docs/testing.md How to test Surfingkeys
- docs/ui-flow.md UI screens and flows
- docs/adrs ADRs 
- docs/migration Current migration process 
- docs/c4 C2 and C3 architecture 





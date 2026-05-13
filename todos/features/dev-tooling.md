# Dev Tooling — Improvements

## Automated server startup

- [ ] `dbg server-start` should be called by `boot.ts`
  - Currently users must manually run `./bin/dbg server-start` to start the sk-devtools eval relay on `:9600`
  - Automate this in the boot sequence so the relay is always running when needed
  - See: `.claude/commands/devtools.md` for sk-devtools eval relay setup

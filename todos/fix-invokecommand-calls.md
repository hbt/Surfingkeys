# fix-invokecommand-calls

Replace `invokeCommand` calls in Playwright specs with `mapcmdkey` + `keyboard.press()` for more realistic key dispatch testing.

Reference implementation: `tests/playwright/commands/cmd-tab-next.v2.spec.ts`

## Why

`invokeCommand` bypasses the key dispatch path entirely. The `mapcmdkey` + key press approach exercises the full binding → dispatch → handler chain, which is more realistic and catches keybinding regressions.

## Todo

- [ ] Audit all 165 specs using `invokeCommand` and identify candidates for migration
- [ ] Migrate SW-target specs first (tab, bookmark, session, tools) — key dispatch is most meaningful there
- [ ] For each migrated spec: bind a short chord via `mapcmdkey`, trigger via sequential `keyboard.press()` calls
- [ ] Keep `invokeCommand` only where key dispatch is irrelevant (e.g. coverage-only tests)
- [ ] Update `tests/playwright/CLAUDE.md` to reflect preferred pattern

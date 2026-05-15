# pass.single-key

## feature.summary
Pass exactly one keystroke to the page then automatically exit PassThrough mode.
Useful when in Normal mode and need to fire one native browser/page shortcut without
fully entering PassThrough.

## archive.source
- File: `surfingkeys-archive/content_scripts/hbt.js` lines 427–438
- Config: `~/.surfingkeysrc:805` — `mapkey("v", "Pass Single key", CustomCommands.passSingleKey)`

## archive.behaviour
1. If currently in Visual mode → toggle Visual mode off (special case)
2. Otherwise → enter PassThrough mode
3. Register one-time `keydown` listener on PassThrough mode instance
4. On first keydown: immediately exit PassThrough → return to Normal
5. Flag `event.ignore_stop_propgation_hack = true` used to ensure clean exit

## implementation.approach

### New command in normal.ts (alongside existing passThrough commands)
Add `cmd_passthrough_single_key` after `cmd_passthrough_ephemeral` (~line 367):

```ts
mapkey('<key>', {
    short: 'Pass single key',
    unique_id: 'cmd_passthrough_single_key',
    category: 'modes',
    description: 'Pass exactly one keystroke to the page then return to Normal mode',
    tags: ['modes', 'passthrough', 'single'],
}, function() {
    const pt = self.passThrough();
    const handler = function(event: any) {
        pt.exit();
        pt.removeEventListener('keydown', handler);
    };
    pt.addEventListener('keydown', handler);
});
```

### Key binding
Default key: `<Alt-p>` or user-configurable.
Archive used `v` — avoid that (conflicts with Visual mode entry).

### API exposure
Add to `self.passThrough` API surface if user scripts should call it:
- `passThrough` in `api.ts:519` and `user_scripts/index.ts:266` — extend if needed

## implementation.files
| File | Change |
|------|--------|
| `src/content_scripts/common/normal.ts` | Add `cmd_passthrough_single_key` mapkey (~line 367) |
| `src/content_scripts/default.js` | Confirm key binding |
| `tests/playwright/commands/cmd-passthrough-single-key.spec.ts` | New Playwright test |

## test.approach
- Enter PassThrough single-key mode
- Simulate one keypress (e.g. `j`)
- Assert: key reached the page (scroll or DOM change)
- Assert: mode returned to Normal after that keypress

## references
- Existing pattern: `cmd_passthrough_ephemeral` in `normal.ts:357–365`
- Existing tests: `tests/playwright/commands/cmd-passthrough-ephemeral.spec.ts`
- Archive impl: `surfingkeys-archive/content_scripts/hbt.js:427–438`

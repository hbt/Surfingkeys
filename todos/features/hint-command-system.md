# Hint Command System — Unified Subcommand Prefix

## Origin

Noticed `api.mapcmdkey('L', 'cmd_hints_regional')` in config — a large `L` binding with no obvious
discoverability. Led to realising hint-related commands are scattered with no coherent structure.

Compare: tab commands have the `t` prefix convention (`tc`, `tr`, `td`, `tm`, etc.) — the "magic"
pattern where pressing `t` shows subcommand options via the keystroke popup.

---

## Problem

Hint-related commands today are spread across arbitrary keys with no shared prefix:

| Key | Command |
|-----|---------|
| `f` | open link (hint) |
| `F` | open link in new tab |
| `L` | `cmd_hints_regional` |
| `i` | focus input |
| `v` | visual select |
| `ya` | yank all links |
| ... | more scattered |

No discoverability. No grouping. No mental model.

---

## Idea: `c` prefix for hint/cursor commands

Model after the tab "magic" implementation — one prefix key, subcommands shown in keystroke popup.

| Key | Intent |
|-----|--------|
| `c` | prefix — shows subcommand popup |
| `cy` | yank (copy link/text/url under cursor) |
| `cm` | mark element |
| `cr` | regional hint (replaces `L`) |
| `ci` | focus input |
| `ct` | open in new tab |
| `cv` | visual select from hint |
| `cs` | select/search |

### Why `c`

- Mnemonic: **c**ursor / **c**hoose / **c**ommand
- Currently partially used (`cS`, `cp`, etc.) — check conflicts before committing
- Short, on home row

---

## Todos

- [ ] Audit all current `c*` bindings in `config/default.js` — identify conflicts
- [ ] Audit all hint-related commands in `src/content_scripts/common/normal.js`
- [ ] Design full subcommand map (what belongs under `c` vs stays standalone)
- [ ] Decide: migrate `L` → `cr` (regional hints) or keep `L` as alias
- [ ] Implement using `mapcmdkey` pattern — no new runtime needed
- [ ] Update keystroke popup labels so subcommands are self-documenting
- [ ] Consider: does `c` prefix conflict with any visual-mode or other mode bindings?

---

## Reference

- Magic tab pattern: `src/content_scripts/common/normal.js` — `cmd_tab_*` family
- Regional hints: `api.mapcmdkey('L', 'cmd_hints_regional')` in `config/default.js`
- Keystroke popup: `src/content_scripts/front.js` — `showKeystroke()` / Trie walk

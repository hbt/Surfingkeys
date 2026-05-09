# Neovim Integration — Todos

## Missing Commands (archive → nvim native messaging)

- [ ] **`cmd_tools_edit_url_neovim`** — Edit URL in neovim (archive: `uE`)
  - Open current page URL in a real nvim buffer via native messaging
  - On `:wq` save → navigate to the edited URL (reload or new tab variant)
  - Complement to existing `;u`/`;U` which use Ace editor only
  - Reference: `cmd_tools_edit_url_reload` (`src/content_scripts/common/default.js`) for Ace version

- [ ] **`cmd_tools_source_neovim`** — Open page source in neovim (archive: `usrc`, `gsrv`)
  - Yank current page HTML source and open in a nvim scratch buffer
  - Read-only inspection use case (view source with vim navigation/search)
  - Reference: archive `content_scripts/hbt.js` `CustomCommands.openSourceCodeExternalEditor()`

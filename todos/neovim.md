# Neovim Integration — Todos

## Missing Commands (archive → nvim native messaging)

- [x] **`cmd_tools_edit_url_neovim`** — Edit URL in neovim (archive: `uE`) — **DONE** `e9962fe` (`;nu`)
  - `front.showEditor(window.location.href, callback, 'url', true)` — routes to `renderNvim` via `useNeovim=true`
  - On `:wq` save → opens result in new tab via `tabOpenLink`

- [x] **`cmd_tools_source_neovim`** — Open page source in neovim (archive: `usrc`, `gsrv`) — **DONE** `e9962fe` (`;ns`)
  - `front.showEditor(document.documentElement.outerHTML, null, 'html', true)`
  - Read-only inspection in neovim scratch buffer

# Review: Omnibar Commands

Newly mapped in `.surfingkeys-2026.js` (OMNIBAR section, 2026-05-30).
Verify each works as expected after reload.

## Trigger commands (normal mode → opens omnibar)

- [ ] `ob`  → `cmd_omnibar_bookmarks` — browse bookmarks
- [ ] `ot`  → `cmd_omnibar_url` — enter URL → new tab
- [ ] `og`  → `cmd_omnibar_url_current` — enter URL → current tab
- [ ] `oc`  → `cmd_omnibar_commands` — run a command
- [ ] `oq`  → `cmd_omnibar_translate` — translate word under cursor
- [ ] `oA`  → `cmd_omnibar_llm_chat` — LLM chat
- [ ] `ou`  → `cmd_omnibar_tab_urls` — URLs from open tabs
- [ ] `ox`  → `cmd_omnibar_recent_closed` — recently closed tabs
- [ ] `oB`  → `cmd_omnibar_add_bookmark` — save current page to bookmark folder
- [ ] `oX`  → `cmd_close_tabs_by_url` — close tabs matching URL pattern

## In-omnibar commands (while omnibar is open)

- [ ] `<Tab>`        → `cmd_omnibar_cycle_forward` — next result
- [ ] `<Shift-Tab>`  → `cmd_omnibar_cycle_backward` — prev result
- [ ] `<Ctrl-n>`     → `cmd_omnibar_history_forward` — next input history
- [ ] `<Ctrl-p>`     → `cmd_omnibar_history_backward` — prev input history
- [ ] `<Ctrl-.>`     → `cmd_omnibar_next_page` — next results page
- [ ] `<Ctrl-,>`     → `cmd_omnibar_previous_page` — prev results page
- [ ] `<Esc>`        → `cmd_omnibar_close` — close
- [ ] `<Ctrl-j>`     → `cmd_omnibar_toggle_position` — toggle top/bottom
- [ ] `<Ctrl-'>`     → `cmd_omnibar_toggle_quotes` — toggle quoted search
- [ ] `<Ctrl-c>`     → `cmd_omnibar_copy_urls` — copy focused/all URLs
- [ ] `<Ctrl-d>`     → `cmd_omnibar_delete_focused` — delete focused item
- [ ] `<Ctrl-D>`     → `cmd_omnibar_delete_all` — delete all listed items
- [ ] `<Ctrl-i>`     → `cmd_omnibar_edit_url` — edit focused URL in vim
- [ ] `<Ctrl-r>`     → `cmd_omnibar_resort_history` — toggle history sort order
- [ ] `<Ctrl-m>`     → `cmd_omnibar_create_mark` — create vim mark for focused item

## Notes

- `oH` (history) and `om` (vim marks) were already mapped before this session
- `oT` / `oo` are tab-choose (not omnibar triggers) — intentionally kept in TABS section

# Review: Low Coverage Tests

Commands with 21–30% function coverage. These tests run and produce data, but only exercise
a small slice of the code. May be acceptable (narrow command scope) or may indicate missing test cases.

Detected from run: 2026-05-16 (757 passed)

## Checklist

- [ ] `cmd_tab_reload_magic_except_active` — 21% (208/991 fns) — tab magic with large shared bundle; consider adding multi-tab fixture
- [ ] `cmd_tab_reload_magic_all_window` — 21% (210/992 fns) — tab magic with large shared bundle; consider adding multi-tab fixture
- [ ] `cmd_tab_reload_magic_left_inclusive` — 21% (211/992 fns) — tab magic with large shared bundle; consider adding multi-tab fixture
- [ ] `cmd_tab_reload_magic_right_inclusive` — 21% (211/992 fns) — tab magic with large shared bundle; consider adding multi-tab fixture
- [ ] `cmd_nav_history_forward` — 21% (399/1870 fns) — nav command; check if history is properly established in fixture
- [ ] `cmd_nav_reload` — 22% (426/1932 fns) — basic nav; review if additional scenarios needed
- [ ] `cmd_nav_reload_hard` — 22% (426/1932 fns) — basic nav; review if additional scenarios needed
- [ ] `cmd_nav_url_root` — 25% (479/1944 fns) — nav command; large shared bundle expected
- [ ] `cmd_nav_remove_hash` — 26% (507/1989 fns) — nav command; check if URL-with-hash fixture is used

## Notes

- Incognito commands are intentionally excluded from this list (annotated separately in the report)
- Low % on tab magic commands is partly structural: large shared tabHandleMagic bundle, narrow test scope
- For relevant/actual coverage use `relevant_coverage` in the report (baseline-subtracted)

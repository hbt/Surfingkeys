# Fix: Zero-Coverage Tests

Commands with Playwright tests that capture 0 coverage functions on both targets.
These tests pass but exercise nothing — likely a timing issue, broken fixture, or missing coverage instrumentation.

Detected from run: 2026-05-16 (757 passed)

## Checklist

- [ ] `cmd_create_session` — investigate why test captures 0 functions; check fixture setup and coverage instrumentation
- [ ] `cmd_hints_select_input` — investigate why test captures 0 functions; check fixture setup and coverage instrumentation
- [ ] `cmd_list_session` — investigate why test captures 0 functions; check fixture setup and coverage instrumentation
- [ ] `cmd_visual_click_node` — investigate why test captures 0 functions; check fixture setup and coverage instrumentation
- [ ] `cmd_visual_click_node_newtab` — investigate why test captures 0 functions; check fixture setup and coverage instrumentation

## Notes

- These also appear under `issues.relevant_coverage.dead_tests` in the mappings report
- Root causes to check: `launchWithDualCoverage()` not called, coverage flushed before command runs, command dispatched to wrong target

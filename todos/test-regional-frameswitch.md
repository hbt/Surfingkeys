# Test & Implementation Investigation: Regional (LL) and Frame-Switch (g])

## Phase 1: Test Discovery & Execution
- [x] Find test file for cmd_hints_regional (regional/LL command)
- [x] Find test file for cmd_frame_switch (g] command)
- [x] Run cmd_hints_regional test (13 tests PASSED, 15.7s)
- [x] Run cmd_frame_switch test (1 test PASSED, 2.5s)
- [x] Report test results and any failures (BOTH PASS)

## Phase 2: Implementation Investigation
- [x] Locate cmd_hints_regional implementation in codebase (src/content_scripts/common/commands/hints.ts:49-58)
- [x] Locate cmd_frame_switch implementation in codebase (src/content_scripts/common/commands/frames.ts:16-43)
- [x] Analyze how regional hints work (getLargeElements + regionalHints option)
- [x] Analyze how frame switching works (hints.create for iframes + rotateFrame fallback)
- [x] Document key files and behavior (TypeScript source, mapkey registration, content script bootstrap)

## Phase 3: Summary
- [x] Create summary report with findings (see impl-investigator output)

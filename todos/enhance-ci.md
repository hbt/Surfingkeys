## enhance-ci

- [ ] deduplicate `buildReport()` in verify.ts — `integrity` and `issues` checks both call `buildReport()` independently (~13s each, parallel so no wall-time impact but doubles CPU); merge into one check or pipe report JSON between them
- [ ] automated CI feedback loop: cron runs `ci.ts report --json`, detects failures (`stats.unexpected > 0`), spawns fix subagent on `ci/fix-<short>` branch for review + merge
  - prereq: determine if `gather()` pulls from local `test-artifacts/` or remote `ctms-ops` (affects subagent access to full test report)
  - prereq: failing test names not in JSON output — need either `failedTests[]` in report or cross-ref via `completed[].filename` → full Playwright JSON

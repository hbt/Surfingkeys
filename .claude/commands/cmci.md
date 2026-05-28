---
description: Git commit command that enforces structured commit messages with ticket numbers and labels
argument-hint: none
model: claude-sonnet-4-6
---

run git status and commit.

If you modified files across more than one repo, you should commit to each repo individually.
Your commit is preferrably limited to the files you modified, check with `cce me` and `git status`

Commit message must contain:

- ticket number (if any) e.g 9554
- a label as a prefix e.g 9554 [import] One line summary.
- Explanation of changes and why they are made
- Generate relevant #hash #tags at the bottom

After your commit, schedule with /loop to check on it in 8 minutes . (average time for CI server run and check via ./scripts/ci.ts report for your commit ) 

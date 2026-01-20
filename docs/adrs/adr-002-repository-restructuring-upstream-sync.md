---
adr: 2
title: Repository restructuring and upstream synchronization
status: accepted
date: 2026-01-20
category: workflow
tags:
  - git
  - repository-management
  - upstream-sync
  - manifest-v3
  - fork-maintenance
deciders:
  - Repository maintainer
technical_story: "8-year fork divergence from upstream required cleanup and resync to adopt Manifest v3"
depends_on: []
related_to: []
enhances: []
supersedes: []
superseded_by: []
enables:
  - Adoption of Manifest v3 from upstream
  - Future upstream synchronization without merge conflicts
  - Clear separation between custom work and upstream code
  - Ability to contribute changes back to upstream
---

# ADR-002: Repository Restructuring and Upstream Synchronization

## Context

### Fork History

Surfingkeys was forked from brookhong/Surfingkeys on **November 29, 2018** to add custom commands and functionality. For approximately 9 months (Nov 2018 - Sep 2019), the fork actively merged upstream changes while maintaining custom enhancements.

**Breaking point**: In September 2019 (version 0.9.48 → 0.9.54), upstream introduced fundamental changes to the messaging port architecture that broke custom commands. After a failed attempt to adapt (preserved in dev branch, Nov 2019), all upstream synchronization ceased.

**Result**: 7-year divergence (2019-2026) with:
- Master branch frozen at v0.9.48
- 345 commits behind upstream
- Custom work incompatible with upstream architecture
- No path forward for Manifest v3 migration (required by Chrome)

### Repository State Before Restructuring

**Branches:**
- `master`: Custom fork with 8 unpushed commits (mix of valuable CDP docs + temporary analysis files)
- `dev`: Failed 2019 attempt to adapt to v0.9.54 (36 commits, 6+ years old)

**Other work:**
- `surfingkeys2` directory: Separate fork with 10 commits of test/lint/docs improvements built on upstream

**Problem:**
- Cannot adopt Manifest v3 without upstream code
- Custom work would be lost if simply resetting to upstream
- No clear separation between permanent custom work and temporary experiments
- Archive/backup strategy needed before major Git operations

### Requirements

1. **Preserve all custom work** - 8 years of development must not be lost
2. **Sync with upstream** - Need latest code for Manifest v3 support
3. **Integrate recent work** - surfingkeys2 improvements should be included
4. **Maintain accessibility** - Archived work must be easily recoverable
5. **Enable future syncs** - Avoid creating another 7-year divergence

## Decision

**Execute incremental repository restructuring with archive-first strategy:**

### Phase 1: Safety and Backups (Zero-Risk Operations)

1. **Create timestamped backup tags**
   ```bash
   git tag backup-master-pre-cleanup-2026-01-20 HEAD
   git tag backup-dev-pre-cleanup-2026-01-20 dev
   ```
   - Acts as point-in-time snapshots
   - Enables instant rollback via `git reset --hard <tag>`
   - Preserved in reflog even if deleted

2. **Archive dev branch** before deletion
   ```bash
   git branch archive/failed-v0.9.54-port-attempt-2019 dev
   git branch -D dev
   ```
   - Preserves historical context of 2019 breaking changes
   - Frees `dev` branch name for future use
   - Pushed to origin for permanent backup

### Phase 2: Master Cleanup (Selective Preservation)

1. **Soft reset 8 unpushed commits** to staging area
   ```bash
   git reset --soft HEAD~8
   ```
   - Keeps all file changes in working directory
   - Removes commits from history (preserved in reflog)
   - Allows selective re-staging

2. **Stage only CDP-related work**
   - Keep: `docs/cdp.md`, CDP Python examples, related background.js changes
   - Discard: temporary analysis files (plans/, gh/, session_ids.txt)
   - Rationale: CDP integration is permanent infrastructure, analysis was temporary exploration

3. **Commit cleaned CDP work and push**
   ```bash
   git commit -m "docs: Add CDP integration guide for testing Surfingkeys"
   git push origin master
   ```

### Phase 3: Archival (Permanent Preservation)

1. **Archive entire fork history**
   ```bash
   git branch archive/hbt-master-manifest-v2-fork-2018-2025 master
   git push origin archive/hbt-master-manifest-v2-fork-2018-2025
   ```
   - Naming: `hbt-master-manifest-v2-fork-2018-2025`
     - `manifest-v2`: Indicates Chrome extension Manifest v2 era
     - `2018-2025`: Full timeline of fork development
   - Contains: Complete 8-year history + CDP work
   - Configured upstream tracking for easy push/pull

### Phase 4: Upstream Reset (Point of No Return)

1. **Hard reset master to upstream**
   ```bash
   git fetch brookhong master
   git reset --hard brookhong/master
   git push origin master --force-with-lease
   ```
   - Discards fork history on master (preserved in archive)
   - Master now matches brookhong/master exactly
   - Force push overwrites origin/master

2. **Verify safety net**
   - Archive branch exists locally and remotely
   - Backup tags point to pre-reset state
   - Reflog contains full history

### Phase 5: Integration (Merge Recent Work)

1. **Import surfingkeys2 commits**
   ```bash
   git remote add surfingkeys2-temp /home/hassen/workspace/surfingkeys2
   git fetch surfingkeys2-temp
   git merge surfingkeys2-temp/hbt --no-edit
   git push origin master
   ```
   - Fast-forward merge (no conflicts, both based on upstream)
   - Adds: test fixes, ESLint config, C4 docs, DDD glossary

### Phase 6: Configuration (Operational Cleanup)

1. **Configure upstream tracking for archive branches**
   ```bash
   git branch --set-upstream-to=origin/archive/hbt-master-manifest-v2-fork-2018-2025 \
              archive/hbt-master-manifest-v2-fork-2018-2025
   ```
   - Enables `git pull`/`git push` on archive branches
   - Improves maintainability

## Consequences

### Positive

- **Clean upstream base** - Master now tracks brookhong/master, enabling Manifest v3 adoption
- **Complete preservation** - All 8 years of custom work safely archived with descriptive naming
- **Future sync enabled** - Can pull upstream changes via `git pull brookhong master`
- **Enhanced with recent work** - Test suite (97.3% pass rate), linting, documentation improvements merged
- **Multiple safety nets**:
  - Archive branches (local + remote)
  - Backup tags (timestamped)
  - Git reflog (30-90 day history)
- **Clear historical narrative** - Archive branch names document the fork's journey
- **Separation of concerns** - Experimental work separated from permanent infrastructure

### Negative

- **Master history replaced** - Original fork commits no longer in master lineage
  - Mitigation: Fully preserved in archive branch
  - Trade-off: Necessary for upstream compatibility
- **CDP work lost from master** - Original CDP documentation not on current master
  - Mitigation: Preserved in archive, can be re-integrated after Manifest v3 migration
  - Reason: CDP work was built on v0.9.48 codebase, may need adaptation for latest upstream
- **Two parallel histories** - Archive branch and master no longer share common ancestry after reset
  - Consequence: Cannot merge archive back into master (cherry-pick required)
- **Maintenance complexity** - Must remember archive branches exist when searching for old work
- **Force push executed** - Rewrote origin/master history
  - Impact: Anyone with clones must re-clone or reset
  - Mitigation: Solo project, no collaborators affected

### Neutral

- **Archive branch count** - 2 archive branches created
  - `archive/failed-v0.9.54-port-attempt-2019` (36 commits)
  - `archive/hbt-master-manifest-v2-fork-2018-2025` (8 years)
- **Upstream tracking model**
  - Master tracks origin/master for push
  - Pull upstream via `git pull brookhong master` (explicit)
  - Prevents accidental upstream pushes
- **surfingkeys2 directory** - Work successfully integrated, original directory can now be deleted

## Operational Guidelines

### Accessing Archived Work

**View fork history:**
```bash
git log archive/hbt-master-manifest-v2-fork-2018-2025
```

**Extract specific files from archive:**
```bash
git checkout archive/hbt-master-manifest-v2-fork-2018-2025 -- path/to/file
```

**Cherry-pick commits from archive:**
```bash
git cherry-pick <commit-hash-from-archive>
```

### Synchronizing with Upstream

**Pull latest upstream changes:**
```bash
git fetch brookhong master
git merge brookhong/master
# OR
git pull brookhong master
```

**Verify sync status:**
```bash
git log --oneline master..brookhong/master  # Shows commits we're missing
git log --oneline brookhong/master..master  # Shows our commits not in upstream
```

### Recovery Procedures

**Restore to pre-restructuring state:**
```bash
git reset --hard backup-master-pre-cleanup-2026-01-20
git push origin master --force-with-lease
```

**Restore specific archived work:**
```bash
git branch hbt-custom-work archive/hbt-master-manifest-v2-fork-2018-2025
git checkout hbt-custom-work
# Work with fork history in isolated branch
```

## Timeline of Execution

All operations performed on **2026-01-20**:

1. ✅ Created backup tags (safety net)
2. ✅ Reviewed dev branch (confirmed 6-year-old failed experiment)
3. ✅ Archived and deleted dev branch
4. ✅ Cleaned master commits (kept CDP, discarded temporary files)
5. ✅ Archived complete fork history
6. ✅ Reset master to upstream brookhong/master
7. ✅ Merged surfingkeys2 work (test/lint/docs)
8. ✅ Configured upstream tracking for archives
9. ✅ Verified all work preserved and accessible

**Duration**: ~45 minutes of incremental, verified operations

## Future Work

1. **Re-integrate CDP work** - After Manifest v3 migration stabilizes
   - Cherry-pick relevant commits from archive
   - Update for new upstream architecture
   - Verify compatibility with latest Chrome APIs

2. **Evaluate archive retention** - After 1 year
   - Determine if archives are still needed
   - Consider compressing into single reference tag
   - Document sunset plan for old branches

3. **Establish sync cadence** - Prevent future 7-year divergences
   - Monthly upstream check: `git fetch brookhong master`
   - Quarterly merge if no breaking changes
   - Document merge strategy in CONTRIBUTING.md

4. **Cleanup surfingkeys2 directory**
   - Work successfully merged into main repo
   - Directory can be removed from filesystem
   - Document where work was integrated

## References

- Upstream repository: [brookhong/Surfingkeys](https://github.com/brookhong/Surfingkeys)
- Fork repository: [hbt/Surfingkeys](https://github.com/hbt/Surfingkeys)
- Archive branches:
  - `archive/hbt-master-manifest-v2-fork-2018-2025` (8-year fork)
  - `archive/failed-v0.9.54-port-attempt-2019` (2019 dev attempt)
- Backup tags:
  - `backup-master-pre-cleanup-2026-01-20`
  - `backup-dev-pre-cleanup-2026-01-20`
- First fork commit: `60548f5` (2018-11-29 "ignore .idea files")
- Last upstream merge (pre-restructure): `9e7cd25` (2019-09-16)
- Breaking upstream version: 0.9.54 (messaging port architecture change)

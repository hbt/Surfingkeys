# Migration Phase 1: Archive Documentation & Analysis

## phase1.overview

**Goal:** Extract complete documentation from archive branch - pure analysis, no planning/prioritization

**Timeline:** 2026-01-20 onwards

**Scope:** Mirror the upstream analysis work (10 commits) but for the archive branch

**Out of Scope:**
- ❌ Priority lists
- ❌ Migration decisions
- ❌ Understanding new architecture
- ❌ Adaptation strategies

## phase1.key_principles

**1. Incremental** - One step at a time, complete before moving forward

**2. Automated Testing** - Establish reliable testing infrastructure
- Leverage CDP experiments and tooling
- Smooth development workflow
- Automated test framework must be reliable
- Quality gates before features merge

**3. Documentation Maintenance** - Fight documentation drift
- Update docs with each change
- ADRs remain accurate
- Migration plan evolves but stays current
- Documentation is deliverable, not afterthought

## phase1.setup

### 1.1 Create Worktree

```bash
# Create worktree for archive branch
git worktree add ../surfingkeys-archive archive/hbt-master-manifest-v2-fork-2018-2025

# Navigate to worktree
cd ../surfingkeys-archive

# Create documentation structure
mkdir -p docs/archive-analysis
```

**Purpose:** Work on archive branch without switching contexts

**Result:** Two working directories:
- `~/workspace/surfingkeys/` → master branch
- `~/workspace/surfingkeys-archive/` → archive branch

### 1.2 Verify Archive State

```bash
# Check what custom files exist
ls -la content_scripts/hbt.js

# Identify custom modifications
git log --oneline --author="hbt" | head -20

# Verify build still works (if needed)
npm install
npm run build:dev
```

**Purpose:** Understand archive state before analysis

## phase1.documentation_extraction

### 1.3 Custom Commands Inventory

**Objective:** Complete list of all custom commands

**Method:**
1. Analyze `content_scripts/hbt.js` structure
2. Adapt `scripts/generate-command-docs.js` for custom code
3. Extract command definitions, keybindings, descriptions

**Output:** `docs/archive-analysis/custom-commands.md`

**Format:**
```markdown
## Command Categories

### Navigation
| Command | Keybinding | Description |
|---------|------------|-------------|
| customTabNext | `gt` | Navigate to next tab with direction |
| ... | ... | ... |
```

### 1.4 Custom Glossary

**Objective:** Document domain vocabulary and custom concepts

**Method:**
1. Manual review of custom code
2. Identify key patterns and abstractions
3. Extract "magic" pattern and similar concepts
4. Document terminology used in custom commands

**Output:** `docs/archive-analysis/custom-glossary.md`

**Format:**
```markdown
## glossary.magic_navigation

**Term:** Magic Navigation Pattern

**Definition:** A command modifier system that adds directional and count-based parameters to tab operations, enabling Vim-like composition (e.g., "close 2 tabs to the right").

**Components:**
- Direction: left, right, all
- Count: numeric multiplier
- State filter: locked, incognito, etc.

**Example Usage:**
- `2gt` - Go to tab 2 positions right
- `3T<` - Close 3 tabs to the left
```

### 1.5 Custom Feature Tree

**Objective:** Hierarchical organization of custom features

**Method:**
1. Group commands by domain/category
2. Mirror structure of upstream's `docs/feature-tree.md`
3. Show relationships and dependencies

**Output:** `docs/archive-analysis/custom-feature-tree.md`

**Format:**
```markdown
## Custom Features

### Tab Management
├── Navigation with Direction
│   ├── Next/Previous with count
│   ├── Jump by position
│   └── Wrap-around behavior
├── Close by State
│   ├── Close locked tabs
│   ├── Close incognito tabs
│   └── Close by domain
└── Tab Manipulation
    ├── Move with direction
    ├── Pin/Unpin operations
    └── Duplicate with modifiers
```

### 1.6 Statistics & Metrics

**Objective:** Quantitative analysis of custom work

**Method:**
1. Count custom commands
2. Measure custom code volume
3. Identify files modified vs upstream
4. Calculate integration points

**Output:** `docs/archive-analysis/statistics.md`

**Format:**
```markdown
## statistics.overview

| Metric | Count |
|--------|-------|
| Total custom commands | TBD |
| Custom keybindings | TBD |
| Files modified from upstream | TBD |
| New files added | TBD |
| Lines of custom code | TBD |
| External integrations | TBD |

## statistics.code_distribution

| File | Lines Added | Lines Modified |
|------|-------------|----------------|
| content_scripts/hbt.js | TBD | TBD |
| ... | ... | ... |
```

### 1.7 Architectural Patterns

**Objective:** Document how custom code is organized and implemented

**Method:**
1. Analyze code structure in `hbt.js`
2. Document messaging patterns
3. Identify state management approach
4. Extract integration patterns

**Output:** `docs/archive-analysis/architecture.md`

**Format:**
```markdown
## architecture.code_organization

Custom code resides primarily in:
- `content_scripts/hbt.js` - Main custom commands
- `background.js` - Custom background handlers (if any)

## architecture.messaging_patterns

[Document how custom commands communicate with background]

## architecture.state_management

[Document how custom state is managed]

## architecture.integration_points

[Document external service integrations, clipboard, etc.]
```

## phase1.deliverables

**Files to create on archive branch:**

```
docs/archive-analysis/
├── custom-commands.md       # Complete command inventory
├── custom-glossary.md        # Domain vocabulary
├── custom-feature-tree.md   # Hierarchical features
├── statistics.md            # Quantitative analysis
└── architecture.md          # Code organization patterns
```

**Commit strategy:**
```bash
# On archive branch (in worktree)
cd ~/workspace/surfingkeys-archive

git add docs/archive-analysis/
git commit -m "docs: Add comprehensive archive analysis for migration

- Extract complete custom command inventory
- Document domain glossary (magic navigation, etc.)
- Build hierarchical feature tree
- Generate statistics and metrics
- Document architectural patterns

Phase 1 of migration strategy - pure analysis, no planning."

git push origin archive/hbt-master-manifest-v2-fork-2018-2025
```

## phase1.success_criteria

Phase 1 complete when:
- [x] Worktree created and functional
- [ ] All 5 documentation files generated
- [ ] Statistics provide clear scope picture
- [ ] Glossary captures all custom concepts
- [ ] Feature tree shows complete hierarchy
- [ ] Documentation committed to archive branch
- [ ] **Can answer:** "How many custom features exist and what are they?"

## phase1.execution_plan

**Step 1:** Setup worktree and directory structure

**Step 2:** Analyze `content_scripts/hbt.js` - understand custom command structure

**Step 3:** Generate custom commands inventory

**Step 4:** Extract glossary terms (manual identification of key concepts)

**Step 5:** Build feature tree (organize commands hierarchically)

**Step 6:** Generate statistics (counts, metrics, scope)

**Step 7:** Document architecture patterns

**Step 8:** Commit all documentation to archive branch

## phase1.next_steps

After Phase 1 completion:
- Review findings
- Assess scope and complexity
- Plan Phase 2 based on analysis data
- Create ADR-003 documenting rebuild-forward strategy

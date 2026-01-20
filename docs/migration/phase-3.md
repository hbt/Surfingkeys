# Migration Phase 3: Upstream Command Mastery & Tooling

## migration.phase3.overview

**Goal:** Master the upstream commands before deciding what custom features to port

**Why:** Can't make informed migration decisions without knowing what already exists upstream

**Prerequisites:** ✅ Phase 2 complete - automated testing infrastructure functional

**Core Activities:**
1. Understand all upstream commands (descriptions, mappings, behavior)
2. Build tooling for command discovery and validation
3. Test commands manually to evaluate usefulness
4. Track actual usage to inform migration priorities
5. Detect mapping conflicts before they happen

---

## migration.phase3.tooling_requirements

**3.1 Command Lookup System**

**Need:** Instant access to command details during discussions

**Implementation:**
- Slash command: `/claude commands [search-term]`
- Searches: command name, keybinding, description
- Returns: structured command details (see template below)

**Example:**
```
User: "What does 'gf' do?"
Agent: "/claude commands gf"
→ Returns structured template with mapping, implementation, data flow
```

---

**3.2 Fuzzy Finder Enhancement**

**Current State:** `?` shows help popup with plain text scrolling

**Requirement:**
- Fuzzy search by: command name, keybinding, description, category
- Filter by: category, mode (normal/visual/insert)
- Quick preview of command implementation
- Jump to source code

**Implementation Options:**
- Enhance existing help popup with search input
- Build separate command palette (Chrome extension popup)
- Integration with omnibar for command search

**Testing:** Use Phase 2 automated testing to verify fuzzy finder works

**Deliverable:** Fuzzy finder with automated tests

---

**3.3 Mapping Conflict Detection**

**Problem:** Overriding 'g' breaks 'gf', 'gg', 'gc', etc.

**Detection Strategy:**
```javascript
// scripts/validate-mappings.js
function detectMappingConflicts(mappings) {
  const conflicts = [];

  // Check if any mapping is a prefix of another
  for (let [key1, cmd1] of mappings) {
    for (let [key2, cmd2] of mappings) {
      if (key1 !== key2 && key2.startsWith(key1)) {
        conflicts.push({
          blocker: key1,
          blocked: key2,
          reason: `Mapping '${key1}' prevents '${key2}' from being triggered`
        });
      }
    }
  }

  return conflicts;
}
```

**Testing:** Automated tests verify conflict detection works correctly

**Deliverable:**
- Script: `scripts/validate-mappings.js` (with tests)
- Run before committing mapping changes
- Show conflicts in console with remediation suggestions

---

**3.4 Usage Tracking**

**Goal:** Data-driven decisions on which commands matter

**Metrics to Track:**
- Command invocations count
- Last used timestamp
- Usage frequency (daily/weekly/monthly/never)
- Context (which sites used most)

**Implementation:**
```javascript
// src/content_scripts/command-stats.js
{
  "command_usage": {
    "openLink": {
      "count": 142,
      "last_used": "2026-01-20T14:23:00Z",
      "frequency": "daily"
    },
    "scrollDown": {
      "count": 1523,
      "last_used": "2026-01-20T14:30:00Z",
      "frequency": "daily"
    },
    "togglePinTab": {
      "count": 2,
      "last_used": "2026-01-10T10:15:00Z",
      "frequency": "never"
    }
  }
}
```

**Privacy:** Local only, no telemetry

**Testing:** Automated tests verify tracking, persistence, and stats generation

**Deliverable:**
- Tracking middleware in command dispatcher (with tests)
- Dashboard to view stats: `/stats` command or options page
- Export usage report for migration decisions

---

## migration.phase3.command_template

**Structured format for command details:**

```markdown
## Command: [Name]

### mapping
- **Keybinding:** `[key combo]`
- **Mode:** normal | visual | insert
- **Conflicts:** [list if any]

### description
[What the command does - 1-2 sentences]

### implementation
- **Location:** `src/path/to/file.js:line`
- **Function:** `functionName()`
- **Dependencies:** [other modules/commands it uses]

### data_flow
```
User presses 'gf'
  → keyboardUtils.mapKey('gf')
  → Normal.openLink()
  → Hints.create(linkHints)
  → User selects hint
  → chrome.tabs.create(url)
```
```

### usage_stats
- **Frequency:** daily | weekly | monthly | never
- **Use Cases:** [when you actually use this]
- **Alternatives:** [other commands that do similar things]

### testing_notes
- **Tested On:** [date]
- **Works:** ✅ | ❌
- **Issues:** [any bugs or quirks]
- **Useful:** ⭐⭐⭐⭐⭐ (1-5 stars)
```

**Usage in Conversation:**
```
User: "Explain the 'gf' command"
Agent: [Uses template above, fills from docs/cmds.md + source code]
```

---

## migration.phase3.workflow

**Iterative Command Review Process:**

**Step 1: Command Discovery**
- Review `docs/cmds.md` (already generated)
- Filter by category or search term
- Agent provides template-formatted details

**Step 2: Manual Testing**
- Load extension in browser
- Test command in real usage
- Note: useful vs. redundant vs. broken

**Step 3: Documentation**
- Update command template with testing notes
- Mark usefulness rating
- Track in `docs/migration/command-review-log.md`

**Step 4: Usage Tracking**
- Let tracking run for 1-2 weeks
- Collect real-world usage data
- Compare perceived vs. actual usefulness

**Step 5: Migration Decisions** (Phase 4)
- Armed with: testing notes + usage stats
- Decide: keep as-is, customize, or ignore
- Plan custom features to port

---

## migration.phase3.enhancement_to_claude_md

**Current CLAUDE.md:** Formatting instructions only

**Enhanced CLAUDE.md:**
```markdown
# CLAUDE RESPONSE FORMAT
[existing formatting rules]

# PROJECT CONTEXT

## project.documentation_index

Quick access to key documentation:
- **Commands:** `docs/cmds.md` - Complete upstream command list
- **Features:** `docs/feature-tree.md` - Hierarchical feature organization
- **Glossary:** `docs/glossary.md` - Domain vocabulary
- **Architecture:** `docs/c4/` - System architecture diagrams
- **ADRs:** `docs/adrs/` - Architecture decision records

## project.migration_context

This is a migration-in-progress project:
- **Phase 1:** Archive analysis (completed by separate agent)
- **Phase 2:** Automated testing infrastructure (completed)
- **Phase 3:** Upstream command mastery (current phase)
- **Archive:** `archive/hbt-master-manifest-v2-fork-2018-2025` - 8-year fork with custom features

## project.command_lookup_protocol

When user references a command (e.g., "gf", "scrollDown"):
1. Check `docs/cmds.md` for command definition
2. Locate implementation in `src/content_scripts/`
3. Use command template format (see `docs/migration/phase-3.md#command_template`)
4. Include: mapping, description, implementation, data flow

## project.slash_commands

Available project-specific commands:
- `/claude commands [term]` - Search and explain upstream commands
- (More to be defined in Phase 3)
```

---

## migration.phase3.deliverables

**Code (all with automated tests):**
- [ ] `scripts/validate-mappings.js` - Mapping conflict detector
- [ ] `src/content_scripts/command-stats.js` - Command usage tracker
- [ ] `src/content_scripts/fuzzy-finder.js` - Enhanced command search UI

**Documentation:**
- [ ] `docs/migration/phase-3.md` - This document
- [ ] `docs/migration/command-review-log.md` - Testing notes tracker
- [ ] Enhanced `CLAUDE.md` - Project context + command lookup protocol

**Tooling:**
- [ ] `/claude commands` slash command implementation
- [ ] Fuzzy finder UI in extension
- [ ] Usage stats dashboard (in options page or standalone)

**Data:**
- [ ] 1-2 weeks of usage tracking data
- [ ] Command review log with usefulness ratings
- [ ] Mapping conflict report

---

## migration.phase3.execution_plan

**Week 1: Tooling Foundation**
- Build mapping conflict detector (with tests)
- Implement usage tracking (with tests)
- Enhance CLAUDE.md
- Create `/claude commands` slash command

**Week 2: Fuzzy Finder**
- Design fuzzy finder UI/UX
- Implement with automated tests
- Integrate into extension
- Manual testing and refinement

**Week 3: Command Review**
- Review commands by category
- Test manually in browser
- Document in review log
- Rate usefulness

**Week 4: Data Collection**
- Run with usage tracking enabled
- Normal daily usage
- Let data accumulate

**Week 5: Analysis**
- Review usage stats
- Compare testing notes vs. actual usage
- Identify gaps (missing features)
- Prepare for Phase 4 decisions

---

## migration.phase3.success_criteria

Phase 3 complete when:
- [ ] All tooling built and functional with automated tests
- [ ] Mapping conflicts can be detected automatically
- [ ] Usage tracking captures real-world data
- [ ] Fuzzy finder improves command discovery
- [ ] Reviewed at least 80% of upstream commands
- [ ] Command review log has usefulness ratings
- [ ] Enhanced CLAUDE.md provides context to coding agents
- [ ] 1-2 weeks of usage data collected
- [ ] Ready to answer: "Which upstream commands are actually useful?"
- [ ] Ready to answer: "What gaps exist that custom features should fill?"

---

## migration.phase3.transition_to_phase4

**Phase 4 Preview:** Custom Feature Migration

**Armed with:**
- Complete upstream command knowledge
- Usefulness ratings based on testing
- Real-world usage statistics
- Complete archive analysis (from Phase 1)
- Reliable testing infrastructure (from Phase 2)

**Ready to decide:**
- Which custom features fill real gaps
- Which archive commands are redundant with upstream
- Migration priority based on data, not guesswork

---

## References

- Upstream commands: `docs/cmds.md`
- Feature tree: `docs/feature-tree.md`
- Glossary: `docs/glossary.md`
- Testing infrastructure: `docs/testing-strategy.md` (from Phase 2)

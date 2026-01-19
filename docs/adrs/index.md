# Architecture Decision Records

## adrs.overview

ADRs document significant architectural decisions made in Surfingkeys, capturing context, rationale, and consequences to maintain institutional knowledge across team/time boundaries.

## adrs.format

Each ADR follows this structure:
- **Title**: Short phrase describing the decision
- **Status**: Accepted, Proposed, Deprecated, or Superseded
- **Date**: When the decision was made (or committed)
- **Context**: The issue/problem driving the decision
- **Decision**: What was decided and how it addresses the context
- **Consequences**: Trade-offs, benefits, and challenges resulting from the decision

## adrs.decisions

### adrs.decisions.workflow

| ADR | Title | Status | Date | Key Driver |
|-----|-------|--------|------|-----------|
| [ADR-001](adr-001-esbuild-build-alternative.md) | esbuild as alternative bundler | Accepted | 2026-01-20 | 23x faster builds, improved dev experience |

## adrs.status_summary

| Status | Count | ADRs |
|--------|-------|------|
| Accepted | 1 | ADR-001 |
| Proposed | 0 | - |
| Deprecated | 0 | - |
| Superseded | 0 | - |

### adrs.status_summary.yaml_migration

| Migration Status | Count | ADRs |
|------------------|-------|------|
| **YAML frontmatter complete** | 1 | ADR-001 |

**Status**: All ADRs using YAML frontmatter format.

## adrs.relationships

### adrs.relationships.evolution_chains

No evolution chains yet - ADR-001 is foundational.

### adrs.relationships.dependency_graph

```
Foundation Layer:
┌────────────────────────────────────────────────┐
│ ADR-001: esbuild Build Alternative             │
└────────────────────────────────────────────────┘
```

### adrs.relationships.by_concern

| Concern | ADRs | Dependencies |
|---------|------|--------------|
| **Build System** | ADR-001 | Foundation - no dependencies |

## adrs.usage

### adrs.usage.creating_new_adrs

When making significant architectural decisions:

1. **Create new ADR** - Use next sequential number (e.g., `adr-002-title.md`)
2. **Fill template** - Include all standard sections (Context, Decision, Consequences)
3. **Update index** - Add entry to appropriate category table
4. **Commit with ADR** - Include ADR in same commit as implementation (or propose before)

### adrs.usage.updating_existing_adrs

When decisions change:

1. **Mark as Deprecated/Superseded** - Update Status field in original ADR
2. **Create new ADR** - Document the new decision (reference old ADR number)
3. **Update index** - Move old ADR to superseded, add new ADR

### adrs.usage.template

```markdown
---
adr: NNN
title: [Short title without ADR-NNN prefix]
status: proposed | accepted | deprecated | superseded
date: YYYY-MM-DD
category: architecture | security | performance | workflow | infrastructure
tags:
  - tag1
  - tag2
deciders:
  - [Name or role]
technical_story: "[Link to issue/commit if applicable]"
depends_on:
  - adr: XXX
    title: [Title of dependency]
    reason: "[How this ADR uses/requires that decision]"
related_to:
  - adr: YYY
    title: [Title]
    reason: "[How decisions influence each other]"
enhances:
  - adr: ZZZ
    title: [Title]
    reason: "[How this improves the existing decision]"
supersedes:
  - adr: AAA
    title: [Title]
    reason: "[Why this replaces the older decision]"
superseded_by:
  - adr: BBB
    title: [Title]
    date: YYYY-MM-DD
enables:
  - [Future capability 1]
  - [Future capability 2]
---

# ADR-NNN: [Full Title]

## Context

[Describe the forces at play: technical, political, social, project. What is the issue you're facing?]

## Decision

[State what we decided to do and how it addresses the context.]

## Consequences

### Positive

- [Benefit 1]
- [Benefit 2]

### Negative

- [Trade-off 1] → Track as future work
- [Trade-off 2]

### Neutral

- [Impact 1]
- [Impact 2]
```

## adrs.references

- [ADR GitHub Organization](https://adr.github.io/) - ADR methodology and tools
- [Michael Nygard's ADR article](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) - Original ADR concept
- [YAML Frontmatter](https://jekyllrb.com/docs/front-matter/) - Metadata format specification

# Surfingkeys Documentation

# // TODO(hbt) NEXT [docs] add docs/gen/ for generated files and prune docs/archive later.

This directory contains documentation for the Surfingkeys Chrome extension project.

## docs.navigation

| Category | Location | Purpose | Type |
|----------|----------|---------|------|
| **Development** | [dev.md](./dev.md) | 3 debugging approaches: CDP proxy, debug scripts, bin/dbg reload | Active |
| **API Reference** | [API.md](./API.md) | Generated from source (documentation.js) | Generated |
| **Commands** | [cmds.md](./cmds.md) | Keyboard commands reference | Generated |
| **Glossary** | [glossary.md](./glossary.md) | Terms and acronyms | Reference |
| **Features** | [feature-tree.md](./feature-tree.md) | Feature breakdown and organization | Reference |
| **UI Flows** | [ui-flow.md](./ui-flow.md) | UI screens and user flows | Reference |
| **Architecture** | [adrs/](./adrs/) | Architecture Decision Records (9 ADRs) | Active |
| **Chrome APIs** | [chrome-api/](./chrome-api/) | Chrome extension API documentation | Reference |
| **CDP Tools** | [cdp/](./cdp/) | Chrome DevTools Protocol debugging utilities | Active |

## docs.sections

### Development

- **[dev.md](./dev.md)** - Comprehensive debugging guide covering:
  - CDP + proxy (websocat one-liners)
  - CDP + sk-cdp CLI (recommended)
  - CDP debug scripts (TypeScript)
  - Direct modification + bin/dbg reload
  - Console logging and metadata capture
  - Keyboard input sending

### API & Commands

- **[API.md](./API.md)** - Auto-generated API reference from source code (updated 2026-01-19)
- **[cmds.md](./cmds.md)** - Keyboard commands reference with categories (updated 2026-01-19)
- **[glossary.md](./glossary.md)** - Terminology, acronyms, and definitions

### Architecture

- **[adrs/](./adrs/)** - Architecture Decision Records:
  - ADR-001: esbuild build alternative
  - ADR-002: Repository restructuring & upstream sync
  - ADR-003: CDP message bridge
  - ADR-004: CDP reload test simplification
  - ADR-005: Global error logging
  - ADR-006: Config consolidation
  - ADR-007: Service worker dormancy wake
  - ADR-008: Startup settings persistence
  - ADR-009: Command metadata system

### Debugging & Tools

- **[cdp/proxy.md](./cdp/proxy.md)** - CDP proxy examples and request formats
- **[cdp/sk-cdp.md](./cdp/sk-cdp.md)** - sk-cdp CLI reference with target shortcuts
- **[chrome-api/](./chrome-api/)** - Chrome extension API documentation (44 files, 660 KB)

### Features & UI

- **[feature-tree.md](./feature-tree.md)** - Feature hierarchy and organization
- **[ui-flow.md](./ui-flow.md)** - UI screens, flows, and user interactions

## docs.archive

Historical documentation, one-time analysis, and work-in-progress:

| Location | Content | Purpose |
|----------|---------|---------|
| [archive/analysis/](./archive/analysis/) | Error logging investigation reports | One-time analysis (2026-01-21) |
| [archive/wip/cdp/](./archive/wip/cdp/) | CDP proxy enhancement POC | Exploratory features |

## docs.generated

Auto-generated files (do NOT edit directly):

- **API.md** - Run `npm run build:doc` to regenerate
- **cmds.md** - Run `npm run build:doc-cmds` to regenerate

## docs.maintenance

### Generated Files Workflow

When source code changes affect APIs or commands:

```bash
# Regenerate API documentation
npm run build:doc

# Regenerate commands documentation
npm run build:doc-cmds

# Commit the updated files
git add docs/API.md docs/cmds.md
git commit -m "chore: update generated documentation"
```

### ADR Process

To add a new ADR:

1. Create `docs/adrs/adr-NNN-title.md` (follow existing format)
2. Use status: `Proposed`, `Accepted`, `Deprecated`, or `Superseded`
3. Include: Context, Decision, Consequences
4. Reference from [adrs/index.md](./adrs/index.md)
5. Commit with message: `docs(adr): Add ADR-NNN - title`

### One-Time Analysis

Investigation reports, analysis documents, and explorations should be moved to `docs/archive/` to keep the main docs focused on active development and reference material.

## docs.external-references

- **[Chrome Extension API Docs](https://developer.chrome.com/docs/extensions/)**
- **[Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)**
- **[Manifest V3 Migration](https://developer.chrome.com/docs/extensions/mv3/)**

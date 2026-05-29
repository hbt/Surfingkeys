# stream.coding-agents

Improving the experience of coding agents working in this repo — documentation quality,
navigability, and tooling alignment.

---

## 0. cce todo integration

`cce todo list` shows todos from all projects. When working in surfingkeys, agents see noise from cce, nvim, etc.

**Current state:**
- `cce me` returns current session's cwd — the data is available
- `cwd` is stored as a tag on todos (`todo_tags` table, key=`cwd`)
- `project` column exists on todos; `cce todo list --project surfingkeys` already works as a manual workaround
- `session_id` column exists; `cce todo list --session-id <id>` already works

**Missing:** `cce todo list` does not auto-infer `--project` from the current session's cwd. Must be added to cce.

- [ ] **cce todo #129** — implement cwd-based auto-scoping: call `cce me`, infer project from cwd basename, default `--project` to it; `--all-projects` flag to override
- Related cce todos: #19 (session auto-detect), #21 (auto-detect for list/kanban/outline), #24 (group by project), #25 (per-project numbering)

**Workaround until fixed:** `cce todo list --project surfingkeys`

---

## 1. CLAUDE.md review

Ensure both files reflect current practices and are not stale.

- [ ] Review `CLAUDE.md` (root) — audit each section against current tooling
  - Tab command architecture section: verify `tabHandleMagic` docs are still canonical
  - Playwright conventions table: check known flaky list is current
  - Mappings report section: verify script commands still valid
  - Config files table: confirm paths are correct
- [ ] Review `tests/playwright/CLAUDE.md` — audit against current test runner + coverage setup
  - Coverage utils: confirm `launchWithDualCoverage` / `withPersistedDualCoverage` are still the right helpers
  - Flaky test list: update based on latest known flaky state
- [ ] Consider adding a `docs/llm/` section pointer in root `CLAUDE.md` once that dir exists

---

## 2. docs/ reorganization

### 2.1 Move generated files to docs/gen/ and .gitignore them

Generated files currently committed to the repo:

| File(s) | Generator |
|---------|-----------|
| `docs/API.md` | `npm run build:doc` (documentation.js) |
| `docs/cmds.md` | `npm run build:doc-cmds` (generate-command-docs.ts) |
| `docs/settings-reference.md` | `scripts/mappings-json-report.ts` |
| `docs/refs/chrome-api/*.md` (21 files) | `npm run build:doc-chrome-api` (fetch-all-chrome-apis.sh) |
| `docs/settings/all.json` | `scripts/mappings-json-report.ts` |
| `docs/settings/by-setting-key/*.json` (102 files) | `scripts/mappings-json-report.ts` |

Steps:
- [ ] Create `docs/gen/` dir
- [ ] Move above files/dirs under `docs/gen/`
- [ ] Update `.gitignore` to exclude `docs/gen/`
- [ ] Update all build scripts to output to `docs/gen/` instead of `docs/`
- [ ] Update `docs/README.md` and `CLAUDE.md` references

### 2.2 Create docs/llm/

A curated, agent-navigable subset of project knowledge. Not generated — maintained by hand.
Goal: a coding agent should be able to orient itself quickly from this folder alone.

Proposed structure:
```
docs/llm/
  index.md          # what's in this folder and when to use each file
  architecture.md   # system overview: key flows, SW/page/popup roles, command dispatch
  commands.md       # how commands are defined, keyed, dispatched (tabHandleMagic, mapkey, etc.)
  testing.md        # Playwright setup, coverage, fixtures, conventions summary
  tooling.md        # build, reload, CDP, eval relay, bin/dbg cheat sheet
  streams.md        # active work streams + pointers to todos/
```

- [ ] Create `docs/llm/index.md` — navigation map
- [ ] Create `docs/llm/architecture.md` — distill from `docs/command_message_flow.md`, C4 diagrams, ADRs
- [ ] Create `docs/llm/commands.md` — distill from `CLAUDE.md` tab command section + source patterns
- [ ] Create `docs/llm/testing.md` — distill from `tests/playwright/CLAUDE.md` + `docs/dev.md`
- [ ] Create `docs/llm/tooling.md` — distill from `CLAUDE.md` bin/dbg section + `docs/devtools.md`
- [ ] Create `docs/llm/streams.md` — mirror of `todos/status.md` stream index with status + intent

---

## 3. Slash commands review (.claude/commands/)

Current commands: `cmci`, `dbg`, `devtools`, `fix-mapping`, `map`, `migrate`

- [ ] Audit each command against current workflow — are they still accurate?
  - `/map` — check step-by-step matches current `tabHandleMagic` pattern
  - `/migrate` — check TDD-first flow matches current Playwright conventions
  - `/fix-mapping` — check jq selectors still work against current mappings report schema
  - `/devtools` — check eval relay curl examples still valid (port, endpoints)
  - `/dbg` — check `bin/dbg errors-list` output format is still what the command expects
  - `/cmci` — check commit format matches `[label] ticket description` convention
- [ ] Identify gaps: what workflows are missing a slash command?
  - candidate: `/test` — run a specific Playwright spec with coverage
  - candidate: `/coverage` — check coverage delta for a command
  - candidate: `/stream` — look up current status of a work stream
- [ ] Identify gaps: what workflows are missing a slash command?
  - candidate: `/bug` — systematic bug workflow (log → investigate → scratch → fix → spec → commit)
  - candidate: `/test` — run a specific Playwright spec with coverage
  - candidate: `/coverage` — check coverage delta for a command
- [ ] Ensure all commands are referenced in `CLAUDE.md` or `docs/llm/tooling.md`

---

## 4. Bug workflow process

No repeatable process exists yet. Current state:
- Bug files in `todos/bugs/` are reasonably structured (symptoms, hypotheses, code refs)
- Scratch tests exist as a reproduce-and-verify step
- But: no standard flow from "something is broken" → logged → investigated → reproduced → fixed → specced

### 4.1 Blockers on current bug workflow

- **Devtools tooling is immature** — eval relay works but setup is fragile; `/devtools` slash command is a WIP; hard to probe extension state reliably in gchrb
- **Debugging UI commands is hard** — ACE/neovim bugs require interacting with editor popups that are difficult to instrument or introspect without CDP
- **Scratch tests require a clear reproduction path first** — if the bug can't be triggered reliably, the scratch spec is hard to write
- **No `/bug` workflow command** — each investigation starts from scratch (pun intended)

### 4.2 What the workflow should look like (not yet designed)

Rough phases to define:
1. **Log** — create `todos/bugs/<name>.md` with symptoms, expected, reproduction steps, env
2. **Investigate** — probe state via devtools eval relay; check `bin/dbg errors-list`; read source
3. **Reproduce** — write scratch Playwright spec in `tests/playwright/scratch/`
4. **Fix** — source edit + `npm run build:dev` + re-run scratch
5. **Formalize** — promote scratch spec to `tests/playwright/commands/`, run full suite
6. **Commit** — `/cmci` with `[fix]` label

### 4.3 Dependencies (must improve first)

- Devtools eval relay needs to be reliable before investigation step is useful → `stream.ci` + devtools hardening
- Scratch test patterns need to be solid for UI-heavy commands (popups, editors) → `stream.testing`
- The neovim/ACE bugs specifically need a way to probe the editor's internal state — not currently possible without native CDP access to the page's iframe context

### 4.4 Todos

- [ ] Design the `/bug` slash command workflow once devtools + scratch patterns are stable
- [ ] Establish scratch test template for UI popup commands (editor, visual mode, hints overlay)
- [ ] Decide: should bug files live in `todos/bugs/` or move closer to the test that reproduces them?

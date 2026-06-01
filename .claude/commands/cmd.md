# /cmd — Command Guide

Add a new command, port one from the legacy fork, or fix a broken binding.

---

## Usage

```
/cmd new      — define a brand-new command from scratch
/cmd migrate  — port a command from the legacy archive
/cmd fix      — diagnose and fix a broken or wrong binding
```

---

## Reference Files

| What | Path |
|------|------|
| Command definitions (navigation) | `src/content_scripts/common/commands/navigation.ts` |
| Command definitions (tabs) | `src/content_scripts/common/commands/tabs.ts` |
| Registered placeholder keys | `src/content_scripts/common/g-keys.ts` |
| Background handlers | `src/background/start.ts` |
| Repeat config | `src/content_scripts/common/runtime.js` |
| Test exclusions | `scripts/lib/mappings-report/constants.ts` |
| User config | `/home/hassen/.surfingkeys-2026.js` |
| Legacy config | `/home/hassen/.surfingkeysrc` |
| Legacy content script | `surfingkeys-archive/content_scripts/hbt.js` |
| Legacy background | `surfingkeys-archive/bg.js` |
| Report script | `scripts/mappings-json-report.ts` |

---

## State Machine Overview

```
/cmd [new | migrate | fix]
        │
        ├─ NEW ──────────────────────────────────────────────┐
        │  ORIENT: find analogous command                    │
        │                                                    │
        ├─ MIGRATE ──────────────────────────────────────────┤
        │  S0: DISCOVER (find in archive)                    │
        │  S1: EXISTS?  ── yes → STOP (already ported)       │
        │  S2: UNDERSTAND (magic vs standalone)              │
        │  S3: SPEC (write failing Playwright test)          │
        │                                                    ▼
        │                                     ┌─ SHARED PIPELINE ─┐
        │                                     │ S4: KEY ALLOC     │
        │                                     │ S5: HANDLER       │
        │                                     │ S6: REGISTER      │
        │                                     │ S7: EXCLUDE?*     │
        │                                     │ S8: BIND          │
        │                                     │ S9: BUILD         │
        │                                     │ S10: TEST         │
        │                                     │ S11: COVERAGE**   │
        │                                     │ S12: INTEGRITY**  │
        │                                     │ S13: COMMIT       │
        │                                     └───────────────────┘
        │                                     * NEW path only
        │                                     ** MIGRATE path only
        │
        └─ FIX ──────────────────────────────────────────────
           F0: SYMPTOM (key + mode + context)
           F1: CLASSIFY (bookmark `,X` vs command `X`)
           F2: TRACE (follow binding chain to action)
           F3: ROOT CAUSE (wrong map / collision / stale build)
           F4: FIX (narrowest change in correct layer)
           F5: VERIFY (report confirms key in correct layer)
```

---

# PATH: NEW

## ORIENT

**Entry:** You have a description of the desired behavior. No legacy command exists to port.

**Actions:**
Find an existing command that is structurally similar (same category, same background pattern)
to model the new command on exactly.

```bash
bun scripts/mappings-json-report.ts | jq -r \
  '.mappings.list[] | select(.annotation | type == "object") | [.annotation.unique_id, .key, .annotation.short] | @tsv' \
  | grep -i "<keyword>"
```

**Exit criteria:**
- [ ] Analogous command identified by `unique_id`
- [ ] Category confirmed (`navigation`, `tabs`, `scroll`, etc.)
- [ ] Background pattern confirmed (reuse existing RUNTIME action or needs new handler)

→ Continue to **S4: KEY ALLOCATION**

---

# PATH: MIGRATE

## S0 — DISCOVER

**Entry:** You have a key from the legacy config to port.

**Actions:**

1.1 Find what the key calls in `.surfingkeysrc`:
```bash
grep -n "<key>" /home/hassen/.surfingkeysrc
```

> `amap` in legacy maps a key to an existing command by its annotation string — it's an alias,
> not an implementation. Find the real function by searching `hbt.js` for the function name.

1.2 Find the implementation in the archive:
```bash
grep -n "<CommandName>" /home/hassen/workspace/surfingkeys-archive/content_scripts/hbt.js
grep -n "<CommandName>" /home/hassen/workspace/surfingkeys-archive/bg.js
```

**Exit criteria:**
- [ ] Legacy key resolved to a concrete function name in `hbt.js` or `bg.js`

---

## S1 — EXISTS?

**Entry:** You know the function name from S0.

**Actions:**
Check if this command is already in the current fork:
```bash
bun scripts/mappings-json-report.ts --schema   # understand structure first
bun scripts/mappings-json-report.ts | jq -r \
  '.mappings.list[] | select(.annotation | type == "object") | [.annotation.unique_id, .key, .annotation.short] | @tsv' \
  | grep -i "<keyword>"
```

**Branch:**
- Already exists → **STOP** — just add the `api.mapcmdkey` binding (go to **S8: BIND**)
- Does not exist → continue to **S2: UNDERSTAND**

---

## S2 — UNDERSTAND

**Entry:** Command is confirmed absent from the current fork.

**Actions:**
Read the legacy implementation and answer:
- What does the content script send? (`action`, `request`, `magic`, `repeats`?)
- Does it go through `tabHandleMagic` (direction-based) or is it a standalone handler?
- Does it use `repeats`? As a count or as an index?
- What does the background handler actually do?

**Branch:**
- Routes through `tabHandleMagic(magic, tab, repeats, ...)` in `bg.js`
  → use `RUNTIME("*TabMagic", { magic: 'Direction...' })` pattern + add case to `tabHandleMagic` switch in `start.ts`
- Standalone handler
  → simple `RUNTIME("actionName")` + `self.actionName` handler

**Exit criteria:**
- [ ] Dispatch type determined (magic or standalone)
- [ ] `repeats` usage understood (count, index, or unused)
- [ ] Background action identified

---

## S3 — SPEC (TDD)

**Entry:** You know the command's behavior, dispatch type, and repeats contract.

**Actions:**
Create `tests/playwright/commands/cmd-<unique-id-dashes>.spec.ts` **before** writing any
implementation code.

Rules (enforce strictly):
- read `tests/playwright/CLAUDE.md`
- One `unique_id` per file
- SW target (not page target) for tab/session/bookmark commands
- Use `launchWithDualCoverage` + `withPersistedDualCoverage`
- Use `invokeCommand(page, 'unique_id', repeats?)` — never dispatch by key
- Helpers via SW: `getActiveTabViaSW`, `getTabsViaSW`, `activateTabViaSW`
  (copy from `tests/playwright/commands/cmd-tab-next.spec.ts`)
- Test edge cases: clamp behaviour, repeats=1, repeats=N

Run the spec and confirm it fails:
```bash
bunx playwright test tests/playwright/commands/cmd-<unique-id>.spec.ts
```

Expected: all N tests fail (command not found). If they pass, re-check **S1**.

**Exit criteria:**
- [ ] Spec file created at correct path
- [ ] All tests fail with "command not found" (not with assertion errors)

→ Continue to **S4: KEY ALLOCATION**

---

# SHARED PIPELINE

## S4 — KEY ALLOCATION

**Entry:** You know the command you're adding (from NEW/ORIENT or MIGRATE/S3).

**Actions:**
Find the highest existing `g-NNN` placeholder and increment by 1:
```bash
grep -r 'mapkey("g-\|mappings.add("g-' \
  src/content_scripts/common/commands/ \
  src/content_scripts/common/normal.ts \
  | grep -oP 'g-\d+' | sort -V | tail -5
```

**Register the new key in `g-keys.ts` before using it anywhere.**
A duplicate entry causes `tsc` error TS1117. Use `"g-NNN" satisfies GKey` at every
`mapkey`/`mappings.add` call site so an unregistered key fails at compile time.

Choose `unique_id`: `cmd_<category>_<action>` (e.g. `cmd_tab_goto_index`)

**Exit criteria:**
- [ ] `g-NNN` confirmed as unused (no existing entry)
- [ ] `g-NNN` registered in `src/content_scripts/common/g-keys.ts`
- [ ] `unique_id` chosen in `cmd_<category>_<action>` format

---

## S5 — HANDLER

**Entry:** `g-NNN` is registered. `unique_id` is chosen.

**Actions:**

**Branch:**
- Reusing an existing RUNTIME action (e.g. `openIncognito`) with different args
  → no new handler needed, skip to **S6**
- New action needed → add to `src/background/start.ts` near its closest sibling:

```typescript
self.myNewAction = function(_message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
    // chrome API call
};
```

If the command accepts a count prefix, add to `actionsRepeatBackground` in
`src/content_scripts/common/runtime.js`:
```js
var actionsRepeatBackground = [..., 'myNewAction'];
```

**Exit criteria:**
- [ ] Handler exists in `start.ts` (new or confirmed reuse)
- [ ] `actionsRepeatBackground` updated if command accepts repeats

---

## S6 — REGISTER

**Entry:** Handler is in place.

**Actions:**
Add to the appropriate commands file (`navigation.ts`, `tabs.ts`, etc.), next to the analogous
sibling command. Import `GKey` at the top if not already imported:

```typescript
import type { GKey } from '../g-keys.js';

mapkey('g-NNN' satisfies GKey, {
    short: "One-line description",
    unique_id: "cmd_category_action",
    feature_group: 8,
    category: "navigation",          // or "tabs", "scroll", etc.
    description: "Full description of what this command does",
    tags: ["tag1", "tag2"]
}, function() {
    RUNTIME('myNewAction');
});
```

**Exit criteria:**
- [ ] `mapkey` call added next to analogous sibling
- [ ] `"g-NNN" satisfies GKey` used at call site (compile-time guard)
- [ ] `unique_id`, `category`, `short`, `description`, `tags` all populated

---

## S7 — EXCLUDE? *(NEW path only)*

**Entry:** Command registered. Determining Playwright testability.

**Actions:**
Can this command be tested in Playwright?

**Branch:**
- Testable → skip this state, continue to **S8**
- Not testable → add to `EXCLUDED_COMMANDS` in `scripts/lib/mappings-report/constants.ts`:

```typescript
{ unique_id: 'cmd_category_action', reason: 'Incognito — chrome.windows.create with incognito not supported in Playwright' },
```

Common untestable categories where CDP test is better than playwright:
- Incognito window creation
- `chrome://` pages
- TTS / audio
- System proxy changes
- Browser lifecycle (quit, restart) 

**Exit criteria:**
- [ ] Either confirmed testable OR added to `EXCLUDED_COMMANDS` with clear reason

---

## S8 — BIND

**Entry:** Command is registered. Handler exists.

**Actions:**
Add the binding in the relevant section (TABS, SCROLLING, HINTS, etc.) of
`/home/hassen/.surfingkeys-2026.js`, next to the analogous sibling:

```javascript
api.mapcmdkey('xyz', 'cmd_category_action'); // comment describing what it does
```

**Exit criteria:**
- [ ] `api.mapcmdkey` call added in correct section of user config

---

## S9 — BUILD

**Entry:** All source changes made (handler, registration, binding).

**Actions:**
```bash
npm run build:dev
```

> Builds both `chrome` (for gchrb) and `chrome-test` (for Playwright).
> All 5 pre-commit checks must pass: ESLint, mappings schema, mappings issues, TypeScript, build.

**Exit criteria:**
- [ ] `npm run build:dev` exits 0
- [ ] All 5 pre-commit checks green

---

## S10 — TEST

**Entry:** Build passes.

**Actions:**
```bash
bunx playwright test tests/playwright/commands/cmd-<unique-id>.spec.ts
```

If tests fail, check:
- `actionsRepeatBackground` missing the action name
- `message.repeats` vs `message.request.index` mismatch
  (legacy archive used `request.index`; current fork passes repeats directly)
- `chrome.tabs.query({currentWindow: true})` vs `chrome.tabs.query({})`
  — use `currentWindow: true` for index-based navigation, `{}` for cross-window magic

**Exit criteria:**
- [ ] All N Playwright tests pass

---

## S11 — COVERAGE *(MIGRATE path only)*

**Entry:** Tests pass.

**Actions:**

Check git diff to know which source files changed:
```bash
git diff --stat
```

Run with coverage:
```bash
COVERAGE=true bunx playwright test tests/playwright/commands/cmd-<unique-id>.spec.ts
```

Verify the report — `bySourceFile` must include the files from `git diff`:
```bash
bun scripts/mappings-json-report.ts | jq '
  .mappings.list[]
  | select(.annotation | type == "object")
  | select(.annotation.unique_id == "cmd_<unique_id>")
  | .code_coverage'
```

Expected shape:
```json
{
  "hasData": true,
  "testCaseCount": 4,
  "targets": {
    "background": {
      "bySourceFile": {
        "src/background/start.js": { "total": 222, "covered": 175, "pct": "78.8%" }
      }
    }
  }
}
```

> `src/content_scripts/common/normal.js` and `runtime.js` are content-bundle files —
> they won't appear in `background` target coverage. Content coverage is a separate gap
> not yet wired for SW-target commands.

**Exit criteria:**
- [ ] `hasData: true` in coverage report
- [ ] Each file from `git diff --stat` (background bundle) appears in `bySourceFile`

---

## S12 — INTEGRITY *(MIGRATE path only)*

**Entry:** Coverage verified.

**Actions:**
```bash
bun scripts/mappings-json-report.ts --integrity
```

**Exit criteria:**
- [ ] Integrity check exits 0 with no issues

---

## S13 — COMMIT

**Entry:** Build passes, tests pass, integrity clean.

**Actions:**
Two repos may need commits:

1. **surfingkeys repo** — `src/` and `scripts/` changes:
   ```
   [feat] Add cmd_category_action — short description
   ```

2. **vcsh dotfiles** — `/home/hassen/.surfingkeys-2026.js`:
   ```
   [sfk] Bind xyz → cmd_category_action
   ```

**Exit criteria:**
- [ ] surfingkeys repo committed (if `src/` or `scripts/` changed)
- [ ] vcsh dotfiles committed (if user config changed)

---

# PATH: FIX

## F0 — SYMPTOM

**Entry:** A key is broken, wrong, or ambiguous.

**Actions:**
Pin down the exact problem before touching any code:
- What is the exact key sequence?
- What mode? (Normal, Visual, Insert, Hints)
- What page or context? (any page, specific URL, `chrome://`)
- What happens vs what should happen?

**Exit criteria:**
- [ ] Key sequence, mode, and context fully specified

---

## F1 — CLASSIFY

**Entry:** Symptom is precise.

**Actions:**
Determine binding type — this changes where you look:

**Branch:**
- Key starts with `,` (e.g. `,gg`) → **bookmark shortcut**
  Registered with `api.mapkey(\`,${key}\`, ...)` from bookmark arrays.
  Not a command binding. Look in the bookmarks section of `.surfingkeys-2026.js`.
- Key is a direct sequence (e.g. `gg`, `gt`, `zz`) → **command binding**
  Continue to **F2**.

> `gg` can mean different things. `,gg` is a bookmark entry; `gg` is a command binding.
> Confirm with the user which one they mean before proceeding.

**Exit criteria:**
- [ ] Binding type confirmed (bookmark vs command)
- [ ] If bookmark: located in user config bookmark array → fix there, skip to **F5**

---

## F2 — TRACE

**Entry:** Confirmed as a command binding.

**Actions:**
Follow the binding chain from key to final action:

```bash
# Find the binding in the report
bun scripts/mappings-json-report.ts | jq \
  '.mappings.list[] | select(.key=="<key>" and .mode=="Normal")'

# Find by unique_id
bun scripts/mappings-json-report.ts | jq \
  '.mappings.list[] | select((.annotation|type)=="object" and .annotation.unique_id=="cmd_scroll_top")'
```

Check for:
1. Source binding definition (file + line)
2. Any overrides or remaps in `commandRegistry`
3. Whether user config `unmapAllExcept([])` wiped the default

**Exit criteria:**
- [ ] Full chain traced: key → source file → handler → chrome API call
- [ ] Any overrides or conflicts identified

---

## F3 — ROOT CAUSE

**Entry:** Binding chain is traced.

**Actions:**
Identify which of these caused the problem:

| Cause | Signal |
|-------|--------|
| Wrong key map | Report shows key bound to wrong `unique_id` |
| Mode mismatch | Binding exists but in wrong mode |
| Collision | Two bindings on same key |
| `unmapAllExcept` cleared it | Key absent from report but defined in source |
| Stale build | Source correct but built artifact outdated |
| Platform modifier | Works on macOS, fails on Linux (or vice versa) |

**Branch:**
- Source already defines the right command but user config clears defaults
  → restore in `.surfingkeys-2026.js` with `api.mapcmdkey(...)`, go to **F4**
- Source definition is wrong
  → fix in the commands file, go to **F4**
- Stale build
  → `npm run build:dev`, go to **F5**

**Exit criteria:**
- [ ] Root cause identified and categorised

---

## F4 — FIX

**Entry:** Root cause is known.

**Actions:**
Make the narrowest change that fixes the issue:
- If `unmapAllExcept` stripped it → add `api.mapcmdkey('key', 'unique_id')` in user config
- If wrong source binding → edit the commands file
- If bookmark shortcut → fix in bookmark array with `api.mapkey(\`,${key}\`, ...)`

**Rules:**
- Prefer the narrowest fix that preserves existing behavior elsewhere
- If the binding is intentional but surprising, document it instead of changing it
- Never change unrelated mappings

```bash
npm run build:dev
```

**Exit criteria:**
- [ ] One change made in the correct layer
- [ ] No unrelated mappings modified
- [ ] Fix explainable in one sentence
- [ ] Build passes

---

## F5 — VERIFY

**Entry:** Fix applied and built.

**Actions:**
```bash
bun scripts/mappings-json-report.ts | jq \
  '.mappings.list[] | select(.key=="<key>" and .mode=="Normal")'
```

Confirm:
- Key appears in the report in the correct mode
- `unique_id` is the intended one
- `validationStatus` is `"valid"`

**Exit criteria:**
- [ ] Report shows key bound to correct `unique_id` in correct mode
- [ ] `validationStatus: "valid"`
- [ ] Manual or Playwright test confirms the key triggers the right action

---

# Notes / Gotchas

## Architecture

- `g-0XX` keys are placeholder keys — the real key comes from `api.mapcmdkey` in the user config
- `tabHandleMagic` in the current fork is **synchronous** (not async like the archive)
- Use `chrome.tabs.query({})` (not `{currentWindow: true}`) in cross-window magic commands
- Use `chrome.tabs.query({currentWindow: true})` for index-based navigation commands

## Legacy migration gotchas

- Legacy archive used `runtime.command({ action, request: { index } })` — current fork uses
  `RUNTIME("action", { ... })` and reads from `message.*` directly
- `convertMessageArgsToMouselessArg` normalisation does NOT exist in current fork — message
  fields are accessed directly
- `amap("key", "annotation string")` in legacy is an alias, not a command implementation —
  always find the underlying function in `hbt.js`
- Always distinguish `.surfingkeysrc` (legacy) from `.surfingkeys-2026.js` (current)
- Source map attribution only works for bundle targets (`background.js`, `content.js`) — it
  does NOT infer function names for anonymous property assignments by name, but byte-range
  coverage still counts them

## Report schema (jq reference)

```bash
# List top-level keys
bun scripts/mappings-json-report.ts | jq 'keys'

# Inspect list entry shape
bun scripts/mappings-json-report.ts | jq '.mappings.list[0] | keys'

# Find by unique_id
bun scripts/mappings-json-report.ts \
  | jq '.mappings.list[] | select((.annotation|type)=="object" and .annotation.unique_id=="cmd_scroll_top")'

# Find by key
bun scripts/mappings-json-report.ts \
  | jq '.mappings.list[] | select(.key=="gg" and .mode=="Normal")'
```

`MappingEntry` shape:
```json
{
  "key": "gg",
  "mode": "Normal",
  "mappingType": "direct",
  "annotation": {
    "short": "...",
    "unique_id": "cmd_scroll_top",
    "category": "scroll",
    "description": "...",
    "tags": ["scroll", "vim"]
  },
  "source": { "file": "content_scripts/common/normal.js", "line": 987 },
  "validationStatus": "valid"
}
```

Notes: `annotation` may be a plain string for unmigrated entries — use a type guard in jq
(`(.annotation|type)=="object"`) before reading `.annotation.unique_id`.

## Fix learning log

Capture repeated debugging patterns here after a real fix:

- Common root cause:
- Common files to inspect first:
- Useful verification steps:
- Regressions to watch for:

---

# Master Checklist

## NEW path

- [ ] ORIENT: analogous command identified
- [ ] S4: `g-NNN` declared in `g-keys.ts`; `"g-NNN" satisfies GKey` at call site
- [ ] S5: handler in `start.ts`; `actionsRepeatBackground` updated if needed
- [ ] S6: `mapkey` registered with full metadata next to sibling
- [ ] S7: either testable confirmed OR added to `EXCLUDED_COMMANDS` with reason
- [ ] S8: `api.mapcmdkey` added in correct section of user config
- [ ] S9: `npm run build:dev` passes (all 5 checks)
- [ ] S10: Playwright tests pass
- [ ] S13: surfingkeys repo committed; vcsh dotfiles committed

## MIGRATE path

- [ ] S0: legacy key → function name in `hbt.js`/`bg.js`
- [ ] S1: confirmed not already ported
- [ ] S2: dispatch type (magic vs standalone) and repeats contract understood
- [ ] S3: failing spec written; all tests fail before implementation
- [ ] S4–S10: shared pipeline (same as NEW)
- [ ] S11: coverage — `bySourceFile` includes all changed background files
- [ ] S12: `--integrity` check passes
- [ ] S13: both repos committed

## FIX path

- [ ] F0: exact key + mode + context documented
- [ ] F1: binding type classified (bookmark vs command)
- [ ] F2: full binding chain traced to final action
- [ ] F3: root cause identified (wrong map / collision / unmapAllExcept / stale build)
- [ ] F4: narrowest fix applied; build passes
- [ ] F5: report confirms key in correct mode with `validationStatus: "valid"`

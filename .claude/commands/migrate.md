# /migrate — Command Migration Guide

Guide for porting a custom command from the legacy fork into this fork.

---

## Key reference files

| What | Path |
|------|------|
| Legacy config | `/home/hassen/.surfingkeysrc` |
| Current config | `/home/hassen/.surfingkeys-2026.js` |
| Legacy source | `/home/hassen/workspace/surfingkeys-archive/` |
| Legacy content script | `surfingkeys-archive/content_scripts/hbt.js` |
| Legacy background | `surfingkeys-archive/bg.js` |
| Current content script | `src/content_scripts/common/normal.js` |
| Current background | `src/background/start.js` |
| Current RUNTIME repeat config | `src/content_scripts/common/runtime.js` |
| Report script | `scripts/mappings-json-report.ts` |

---

## Step 1 — Discover

**1.1** Look up the key in `.surfingkeysrc` to find what it calls:
```bash
grep -n "<key>" /home/hassen/.surfingkeysrc
```

> **`amap` in legacy** maps a key to an existing command by its annotation string — it's an alias, not an implementation. Find the real implementation by searching `hbt.js` for the function name.

**1.2** Check if the command already exists in the current fork:
```bash
bun scripts/mappings-json-report.ts --schema   # understand structure first
bun scripts/mappings-json-report.ts | jq -r '.mappings.list[] | select(.annotation | type == "object") | [.annotation.unique_id, .key, .annotation.short] | @tsv' | grep -i "<keyword>"
```

**1.3** Find the implementation in the archive:
```bash
grep -n "<CommandName>" /home/hassen/workspace/surfingkeys-archive/content_scripts/hbt.js
grep -n "<CommandName>" /home/hassen/workspace/surfingkeys-archive/bg.js
```

---

## Step 2 — Understand the command

Read the legacy implementation and answer:

- What does the content script send? (`action`, `request`, `magic`, `repeats`?)
- Does it go through `tabHandleMagic` (direction-based) or is it a standalone handler?
- Does it use `repeats`? As a count or as an index?
- What does the background handler do with it?

**Is it magic?** Check if `bg.js` routes it through `tabHandleMagic(magic, tab, repeats, ...)`.
- Yes → use `RUNTIME("*TabMagic", { magic: 'Direction...' })` pattern in content script, add case to `tabHandleMagic` switch in `start.js`
- No → simple `RUNTIME("actionName")` + standalone `self.actionName` handler

---

## Step 3 — Choose unique_id and key

- `unique_id`: `cmd_<category>_<action>` (e.g. `cmd_tab_goto_index`, `cmd_tab_close_magic_left`)
- Placeholder key: next `g-0XX` after the last used one
  ```bash
  grep -r 'mapkey("g-\|mappings.add("g-' \
    src/content_scripts/common/commands/ \
    src/content_scripts/common/normal.ts \
    | grep -oP 'g-\d+' | sort -V | tail -5
  ```
- **Register the key in `src/content_scripts/common/g-keys.ts` first.** A duplicate entry causes `tsc` error TS1117. Use `"g-NNN" satisfies GKey` at every `mapkey`/`mappings.add` call site.
- Actual keybinding: registered in `/home/hassen/.surfingkeys-2026.js` via `api.mapcmdkey('key', 'unique_id')`

---

## Step 4 — Write the spec first (TDD)

Create `tests/playwright/commands/cmd-<unique-id-dashes>.spec.ts`.

**Rules (enforce strictly):**
- One `unique_id` per file
- SW target (not page target) for tab/session/bookmark commands
- Use `launchWithDualCoverage` + `withPersistedDualCoverage`
- Use `invokeCommand(page, 'unique_id', repeats?)` — never dispatch by key
- Helpers via SW: `getActiveTabViaSW`, `getTabsViaSW`, `activateTabViaSW` (copy from `cmd-tab-next.spec.ts`)
- Test edge cases: clamp behaviour, repeats=1, repeats=N

Reference: `tests/playwright/commands/cmd-tab-next.spec.ts`

**Run the spec — confirm it fails before implementing:**
```bash
bunx playwright test tests/playwright/commands/cmd-<unique-id>.spec.ts
```

Expected: all N tests fail (command not found). If they pass already, the command exists — re-check Step 1.2.

---

## Step 5 — Implement

**5.1 Content script** — `src/content_scripts/common/normal.js`

Add after the last `g-0XX` entry:
```js
self.mappings.add("g-0XX", {
    annotation: {
        short: "Short description",
        unique_id: "cmd_<name>",
        category: "navigation",          // or "tabs", "history", etc.
        description: "Full description",
        tags: ["tabs", "navigation"]
    },
    feature_group: 3,
    code: function() {
        RUNTIME("actionName");           // or RUNTIME("actionName", { extra: args })
    }
});
```

**5.2 Background** — `src/background/start.js`

Add near similar handlers (e.g. near `nextTab`/`previousTab` for tab nav):
```js
self.actionName = function(message, sender, sendResponse) {
    var repeats = message.repeats || 1;
    chrome.tabs.query({ currentWindow: true }, function(tabs) {
        // ... implementation
    });
};
```

**5.3 Repeats support** (if the command accepts a count prefix)

Check `src/content_scripts/common/runtime.js` — if `actionsRepeatBackground` does not already include the action name, add it:
```js
var actionsRepeatBackground = [..., 'actionName'];
```

**5.4 Keybinding** — `/home/hassen/.surfingkeys-2026.js`

```js
api.mapcmdkey('tg', 'cmd_tab_goto_index');
```

---

## Step 6 — Build and verify

> `npm run build:dev` builds **both** `chrome` (for gchrb) and `chrome-test` (for Playwright). Playwright tests load from `dist/development/chrome-test`.

```bash
npm run build:dev
bunx playwright test tests/playwright/commands/cmd-<unique-id>.spec.ts
```

All N tests should pass. If any fail, check:
- `actionsRepeatBackground` missing the action name
- `message.repeats` vs `message.request.index` mismatch (legacy archive used `request.index`, current fork passes repeats directly)
- `chrome.tabs.query({currentWindow: true})` vs `chrome.tabs.query({})` — use `currentWindow: true` for index-based navigation, `{}` for cross-window magic

---

## Step 7 — Verify coverage touches changed files

After tests pass, confirm the coverage data actually exercises the new code paths.

**7.1** Check git diff to know which source files changed:
```bash
git diff --stat
```

**7.2** Run with coverage:
```bash
COVERAGE=true bunx playwright test tests/playwright/commands/cmd-<unique-id>.spec.ts
```

**7.3** Check the report — `bySourceFile` must include the files from git diff:
```bash
bun scripts/mappings-json-report.ts | jq '
  .mappings.list[]
  | select(.annotation | type == "object")
  | select(.annotation.unique_id == "cmd_<unique_id>")
  | .code_coverage'
```

Expected output shape:
```json
{
  "hasData": true,
  "testCaseCount": 4,
  "targets": {
    "background": {
      "totalFunctions": 412,
      "coveredFunctions": 345,
      "pct": "83.7%",
      "bySourceFile": {
        "src/background/start.js": { "total": 222, "covered": 175, "pct": "78.8%" }
      }
    }
  }
}
```

Confirm each file from `git diff --stat` that belongs to the background bundle appears in `bySourceFile`.

> **Note:** `src/content_scripts/common/normal.js` and `runtime.js` are content-bundle files — they won't appear in `background` target coverage. Content coverage is a separate gap not yet wired for SW-target commands.

---

## Step 8 — Integrity check

```bash
bun scripts/mappings-json-report.ts --integrity
```

---

## Notes / gotchas

- Legacy archive used `runtime.command({ action, request: { index } })` — current fork passes args directly as `RUNTIME("action", { ... })` and reads from `message.*`
- Legacy `convertMessageArgsToMouselessArg` normalisation does NOT exist in current fork — message fields are accessed directly
- `tabHandleMagic` in current fork is **synchronous** (not async like archive)
- `g-0XX` keys are placeholder keys — the real key comes from `api.mapcmdkey` in the user config
- Always check `.surfingkeysrc` (legacy) vs `.surfingkeys-2026.js` (current) — they are different files for different forks
- `amap("key", "annotation string")` in legacy is an alias, not a command implementation — always find the underlying function in `hbt.js`
- Source map attribution only works for bundle targets (`background.js`, `content.js`) — it does NOT infer function names for anonymous property assignments (`self.foo = function() {}`) by name, but byte-range coverage still counts them

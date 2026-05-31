# /map — Add a New Command Mapping

Add a new named command to the extension and bind it to a key in the user config.

---

## Key reference files

| What | Path |
|------|------|
| Command definitions (navigation) | `src/content_scripts/common/commands/navigation.ts` |
| Command definitions (tabs) | `src/content_scripts/common/commands/tabs.ts` |
| Background handlers | `src/background/start.ts` |
| Test exclusions | `scripts/lib/mappings-report/constants.ts` |
| User config | `/home/hassen/.surfingkeys-2026.js` |

---

## Step 1 — Find an analogous command

Identify an existing command that is structurally similar (same category, same background pattern). Model the new command on it exactly.

```bash
bun scripts/mappings-json-report.ts | jq -r '.mappings.list[] | select(.annotation | type == "object") | [.annotation.unique_id, .key, .annotation.short] | @tsv' | grep -i "<keyword>"
```

---

## Step 2 — Find the next available placeholder key

Commands use `g-NNN` placeholder keys (the real binding is set via `api.mapcmdkey` in the user config). Find the highest existing number and increment by 1.

```bash
grep -r "mapkey('g-0" src/content_scripts/common/commands/ src/content_scripts/common/normal.ts | grep -oP "g-\d+" | sort -V | tail -5
```

**Then register the new key in `src/content_scripts/common/g-keys.ts` before using it.** A duplicate entry in that file causes `tsc` error TS1117. Use `"g-NNN" satisfies GKey` at every `mapkey`/`mappings.add` call site so an unregistered key fails at compile time.

---

## Step 3 — Add the background handler (if needed)

If the command dispatches a new `RUNTIME('actionName')` that doesn't already exist, add a handler to `src/background/start.ts` next to its closest sibling:

```typescript
self.myNewAction = function(_message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
    // chrome API call
};
```

If it reuses an existing action (e.g. `openIncognito`) with different arguments, no new handler is needed.

---

## Step 4 — Register the command

Add to the appropriate commands file (`navigation.ts`, `tabs.ts`, etc.) using the placeholder key from Step 2. Import `GKey` from `../g-keys.js` at the top of the file, then use `satisfies GKey` at the call site:

```typescript
import type { GKey } from '../g-keys.js';

// ...

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

Place it next to the analogous sibling command identified in Step 1.

---

## Step 5 — Exclude from test coverage (if not Playwright-testable)

If the command cannot be tested in Playwright (incognito, chrome://, audio, system-level), add it to `EXCLUDED_COMMANDS` in `scripts/lib/mappings-report/constants.ts`:

```typescript
{ unique_id: 'cmd_category_action', reason: 'Incognito — chrome.windows.create with incognito not supported in Playwright' },
```

Add it near other entries with the same reason category.

Common untestable categories:
- Incognito window creation
- `chrome://` pages
- TTS / audio
- System proxy changes
- Browser lifecycle (quit, restart)

---

## Step 6 — Bind the key in user config

In `/home/hassen/.surfingkeys-2026.js`, add the binding in the relevant section (TABS, SCROLLING, HINTS, etc.):

```javascript
api.mapcmdkey('xyz', 'cmd_category_action'); // comment describing what it does
```

Place it next to the analogous sibling binding.

---

## Step 7 — Build and verify

```bash
npm run build:dev
```

All 5 pre-commit checks must pass (ESLint, mappings schema, mappings issues, TypeScript, build).

---

## Step 8 — Commit

Two repos may need commits:

1. **surfingkeys repo** — `src/` and `scripts/` changes:
   ```
   [feat] Add cmd_category_action — short description
   ```

2. **vcsh dotfiles** — `/home/hassen/.surfingkeys-2026.js`:
   ```
   [sfk] Bind xyz → cmd_category_action
   ```

---

## Checklist

- [ ] Analogous command identified and used as model
- [ ] `g-NNN` placeholder key declared in `src/content_scripts/common/g-keys.ts` (duplicate → TS1117)
- [ ] `"g-NNN" satisfies GKey` used at every `mapkey`/`mappings.add` call site
- [ ] Background handler added (or confirmed existing action is reused)
- [ ] Command registered in commands file with correct `unique_id`, metadata, RUNTIME call
- [ ] Test exclusion added if Playwright cannot test it (with clear reason)
- [ ] `api.mapcmdkey` binding added in correct section of user config
- [ ] `npm run build:dev` passes
- [ ] Both repos committed

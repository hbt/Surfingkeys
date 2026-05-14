# jsts — deferred work

## context

Phase8 attempted to mass-fix 1,748 `no-explicit-any` ESLint violations across 54 files in
one pass using subagents. This caused 193 test regressions because subagents changed runtime
logic while fixing types (variable shadowing, optional chaining, control flow restructuring).
Phase8 was reverted. This doc captures the right approach for when we revisit.

---

## no-explicit-any.approach

### rule.1 — one file at a time, test gate required

After each file:
```bash
npx tsc --noEmit       # 0 errors
npm run build:dev      # build passes
npm run test:playwright:parallel   # 0 new failures vs baseline
```

Do not touch the next file until all three pass.

### rule.2 — safe vs risky fixes

**Safe** (change the annotation, nothing else):
- `param: any` → `param: string | number | Element | ...`
- `var x: any = []` → `var x: string[] = []`
- `Record<string, any>` → `Record<string, unknown>`
- `callback: any` → `callback: () => void` (when callback is never called with args)

**Risky — suppress instead of fix:**
- Requires renaming variables (e.g. `type → initialType` to avoid shadowing)
- Requires adding optional chaining (`?.`) where a direct call existed
- Requires adding intermediate variables for type narrowing
- Requires restructuring control flow

For risky spots use:
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
```

### rule.3 — acceptable end state

Having 200 suppressions + 300 proper fixes + 722 passing tests is better than
0 violations + 193 failing tests. Suppressions are honest — they say "risky, fix later".

---

## no-explicit-any.priority-order

### tier-1 — safe files (annotation-only, no logic risk)

| File | Violations | Notes |
|------|-----------|-------|
| `src/background/chrome.ts` | 19 | params + Chrome API callbacks |
| `src/background/firefox.ts` | 15 | same pattern |
| `src/background/safari.ts` | 9 | same |
| `src/common/errorCollector.ts` | 18 | local types only |
| `src/common/usageTracker.ts` | 6 | trivial |
| `src/common/commandMetadata.ts` | 4 | trivial |
| `src/common/utils.ts` | 12 | utility functions |
| `src/content_scripts/gist.ts` | 9 | isolated module |
| `src/background/llm.ts` | 45 | self-contained stream parser |

### tier-2 — medium risk (fix safe parts, suppress rest)

| File | Violations | Notes |
|------|-----------|-------|
| `src/content_scripts/common/mode.ts` | 41 | core mode system — verify carefully |
| `src/content_scripts/common/runtime.ts` | 18 | message dispatch |
| `src/content_scripts/common/insert.ts` | 25 | mode subclass |
| `src/content_scripts/common/observer.ts` | 11 | DOM observer |
| `src/content_scripts/common/trie.ts` | 11 | data structure |
| `src/content_scripts/common/keyboardUtils.ts` | 7 | key encoding |
| `src/content_scripts/common/clipboard.ts` | 6 | clipboard bridge |

### tier-3 — high risk (heavy suppression expected)

Fix these only after expanding test coverage for their commands.

| File | Violations | Risk |
|------|-----------|------|
| `src/content_scripts/ui/frontend.ts` | 183 | core UI — every command touches this |
| `src/content_scripts/ui/omnibar.ts` | 149 | omnibar — complex state machine |
| `src/content_scripts/common/utils.ts` | 143 | most-imported file |
| `src/user_scripts/index.ts` | 123 | public API surface |
| `src/content_scripts/front.ts` | 110 | front message dispatcher |
| `src/content_scripts/common/hints.ts` | 88 | hints engine |
| `src/content_scripts/common/normal.ts` | 86 | normal mode |
| `src/content_scripts/common/api.ts` | 86 | command API |
| `src/content_scripts/common/commands/clipboard.ts` | 77 | command registrations |
| `src/content_scripts/common/visual.ts` | 60 | visual mode |
| `src/content_scripts/options.ts` | 58 | options page |

---

## coverage.gap

The invokeCommand bridge (`skInvokeReady` flag in content.ts) is used by most non-trivial
tests. If content script init crashes, all these tests show "Target page, context or browser
has been closed" — 193 failures from one root cause.

Before tackling tier-3 files, add smoke tests that validate:
- Content script loads without JS errors
- `skInvokeReady` is set within 5s of page load
- Key command categories invoke without crashing: visual, omnibar, passthrough, yank

---

## shared-types.already-done

Phase7 (`45080b8`) added proper types to `src/background/start.ts` — this is kept.
The `@types/surfingkeys.d.ts` types added in phase7 are still available:
`LLMClientsMap`, `ScrollPositionData`, `TabURLMap`, `TabMessageMap`, `BookmarkFolder`, etc.

When re-approaching tier-2/3 files, add new shared types to `@types/surfingkeys.d.ts`
rather than defining them locally per-file.

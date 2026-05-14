# jsts migration — status

## current.state

| Metric | Value |
|--------|-------|
| `tsc --noEmit` errors | **0** |
| ESLint `no-explicit-any` violations | **0** |
| Total ESLint errors | **0** |
| `as unknown as` double-casts | 219 |
| `@ts-expect-error` suppressions | 5 |
| Test suite | ~722 pass, 0 fail (baseline) |

## completed.phases

| Phase | Commit | Description |
|-------|--------|-------------|
| phase1–5 | `db04350` | Rename src + scripts to `.ts`; fix import paths |
| phase6 | `db04350` | Rename `src/pages` + scripts; fix type errors |
| phase7 | `45080b8` | Fix `no-explicit-any` in `src/background/start.ts` (560 violations) |
| phase8 | `02e8d09` | Fix `no-explicit-any` across entire codebase — 1,748 violations in 51 files |
| phase8-fix | `989aba0` | Fix `mode.ts` regression: `MapMeta.code: Array<>` compiled to `code[0]()` breaking all key commands |

### phase8.type-additions

New exports in `@types/surfingkeys.d.ts`:
`SKKeyboardEvent`, `ModeConstructor`, `HintCallback`, `HintsModule`, `ClipboardManager`, `FrontCommand`, `FrontAPI`, `BrowserAdapter`, `LLMMessage`, `LLMProvider`, `OmnibarItem`, `OmnibarHandler`, `InlineQueryConfig`, `CommandRegistrar`, `NormalModule`, `VisualModule`, `InsertModule`, `FrontendAPI`, `LLMClientFn`, `LLMClientsMap`, `ClipboardResponse`, `TrieNode`, `KeyTarget`, and `globalThis` declaration merge for `_isConfigReady`, `__CDP_MESSAGE_BRIDGE__`, etc.

## remaining.work

### remaining.1 — reduce `as unknown as` double-casts (219 sites)

These are locations where the type system was satisfied with a workaround rather than a proper structural type. Each represents a gap in the type graph.

**Priority files** (most casts):
| File | Approx casts |
|------|-------------|
| `src/content_scripts/ui/frontend.ts` | ~35 |
| `src/content_scripts/ui/omnibar.ts` | ~30 |
| `src/content_scripts/common/normal.ts` | ~25 |
| `src/content_scripts/common/api.ts` | ~20 |
| `src/content_scripts/front.ts` | ~20 |
| `src/content_scripts/common/hints.ts` | ~15 |
| rest | ~74 |

**Approach**: For each cast site, either:
- Add the missing method/property to the relevant interface in `@types/surfingkeys.d.ts`
- Define a local interface that accurately models the object shape
- Use a type guard where the shape is truly dynamic

### remaining.2 — `@ts-expect-error` suppressions (5 sites)

These are places where TypeScript correctly flags an issue but we suppressed it. Review each:
```bash
grep -rn "ts-expect-error" src/ --include="*.ts"
```
Each should either be fixed properly or documented with a reason comment.

### remaining.3 — runtime type safety at boundaries

Several locations receive external data (Chrome API responses, DOM events, user config) that are typed as `unknown` or with casts but lack proper runtime validation. Candidates:
- `src/common/errorCollector.ts` — `globalThis` property access
- `src/background/llm.ts` — LLM provider response shapes
- `src/content_scripts/common/runtime.ts` — message deserialization

### remaining.4 — interface consolidation

Many interfaces were defined locally inside source files during phase8. Candidates to promote to `@types/surfingkeys.d.ts` for reuse:
- `NormalModeInstance` (normal.ts) — used only locally but describes the core mode
- `MapMeta` (mode.ts) — central to key dispatch
- `GistCommentResponse` (start.ts) — could move to the Gist interfaces section
- Local `InsertModeSubset`, `AceEditorFront`, etc.

### remaining.5 — test infrastructure

| Item | Status |
|------|--------|
| `cmd-capture-scrolling-element` | Skipped unconditionally — needs popup timing fix |
| `cmd-capture-full-page` | Skipped unconditionally — needs popup timing fix |
| `cmd-nav-next-link` | Skipped unconditionally — needs navigation timing fix |
| `features/config-server-debug` | Skipped in Docker — user script registration timing |
| Flaky: hints/nav timing tests | ~9 tests pass on retry — no fix yet |

### remaining.6 — eslint strict mode (optional)

Currently only `no-explicit-any` was enforced. Consider enabling:
- `@typescript-eslint/no-unsafe-assignment`
- `@typescript-eslint/no-unsafe-call`
- `@typescript-eslint/no-unsafe-member-access`
- `@typescript-eslint/no-unsafe-return`

These require typed linting (`parserOptions.project`) and will surface remaining type gaps at call sites. High noise, high value.

## verification.commands

```bash
# Type check
npx tsc --noEmit

# Lint
bun scripts/run-lint.ts

# Count remaining double-casts
grep -r "as unknown as" src/ --include="*.ts" | wc -l

# Count ts-expect-error
grep -r "ts-expect-error" src/ --include="*.ts" | wc -l

# Full test suite
PW_MAX_FAILURES=0 npm run test:playwright:parallel
```

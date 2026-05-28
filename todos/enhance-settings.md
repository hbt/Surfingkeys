# Enhance Settings System

## Audit: Settings Tests (done)

- [x] **[audit-inclusion]** Included in CI + parallel. No naming linter (test-coverage.ts only scans commands/).
- [x] **[audit-standardization]** scroll-step-size strong, digit-for-repeat moderate, show-tab-indices weak (no disable test, no applySetting).
- [x] **[audit-coverage]** All 3 pass. Zero coverage artifacts — old launchWithCoverage() never flushes. Content-script settings (scrollStepSize, digitForRepeat) unreachable via CDP V8 regardless.

## Reorganize Settings Tests (done)

- [x] **[move-newtab]** Moved `commands-settings/open-3-links-background-tab.spec.ts` → `settings/setting-new-tab-position.spec.ts` (`62e8254`)
- [x] **[move-showtab]** Moved `settings/setting-show-tab-indices.spec.ts` → `scratch/setting-show-tab-indices.spec.ts` (`62e8254`)
- [x] **[linter-plan]** Plan complete — 6 checks designed, see below

## Settings Spec Linter (planned)

- [ ] **[lint-types]** Create `scripts/lib/playwright-lint/types.ts` — `LintDiagnostic`, `Severity`, `SettingsLintResult`, `SpecFile`
- [ ] **[lint-checks]** Create `scripts/lib/playwright-lint/settings-spec-linter.ts` — implement all 6 checks:
  - `naming-convention` (error) — filename regex `setting-<name>.spec.ts`
  - `coverage-flush` (warning) — text regex for `cov?.close()` / `withPersistedDualCoverage`
  - `describe-label` (error) — Babel AST, `test.describe('setting: <camelCase>', ...)`
  - `restore-on-apply` (error) — Babel AST, every `test()` with `applySetting` must also have `restoreSetting`
  - `boolean-both-states` (warning) — AST + `docs/settings/all.json` `valueType: 'boolean'`
  - `source-cross-reference` (warning) — reuse `scanDirectoryForSettings` + `loadSettingsAnnotations`
- [ ] **[lint-entry]** Create `scripts/lint-settings-specs.ts` — entry point, exits 1 on errors
- [ ] **[lint-integrate]** Edit `scripts/verify.ts` — add `settings-spec-lint` to CHECKS (`fast` group, after `issues`)

## High Priority

- [ ] **SW restart loses snippet settings** — `loadSettings()` fetches from storage but never writes back into `conf`; fix by merging storage result into `conf` after startup load (`start.ts:551`)
  - Scratch test plan: `tests/playwright/scratch/sw-restart-loses-settings.spec.ts` — set `newTabPosition='last'` via snippets, trigger `cdpReloadExtension`, verify setting reverts to `'right'` (demonstrates bug)
- [ ] **Snippets have no error isolation** — one bad `api.mapkey()` aborts all subsequent mappings; wrap each call or wrap the full snippet with try/catch per-statement; add execution timeout (`content.ts:122`)
  - Scratch test plan: `tests/playwright/scratch/snippets-error-isolation.spec.ts` — register snippet with valid→throw→valid mapkeys; assert mapping before error works, mapping after error does NOT (bug signal)

## Medium Priority

- [ ] **Two sources of truth for defaults** — `conf` (`start.ts:429`) and `runtime.conf` (`runtime.ts:60`) define defaults independently; extract shared defaults module imported by both; closes race window where content scripts see `undefined` for `llm`, `focusAfterClosed`, `tabsMRUOrder`, `showTabIndices`
- [ ] **`newTabUrl` persistence is a one-off hack** — generalize to a `persistentSettingKeys: Set<string>` registry; loop it in `updateSettings` scope=snippets instead of hardcoding (`start.ts:1886`)
- [ ] **Untyped settings flow** — settings move as `Record<string, unknown>` with `(runtime.conf as any)[k]`; add schema validation at storage read boundary using `SurfingKeysConf` interface (`start.ts:856`, `content.ts:105`)

## Low Priority

- [ ] **`loadSettings` called on every page load** — no caching; add a cached result with explicit invalidation; decouple config-server fetch from local/sync merge
- [ ] **Broadcast hits all tabs unconditionally** — add change detection; skip broadcast if settings unchanged (`start.ts:870`)
- [ ] **`scope: "snippets"` dual behavior undocumented** — rename or document transient vs persistent semantics; make the distinction explicit (`start.ts:1879`)

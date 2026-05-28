# Enhance Settings System

## Audit: Settings Tests (in progress)

- [ ] **[audit-inclusion]** Are settings specs included in ci.ts + package.json playwright parallel? Naming linter in verify.ts?
- [ ] **[audit-standardization]** Are the 3 specs standardized? Structure, helpers, naming conventions?
- [ ] **[audit-coverage]** Do tests hit the actual read/write ops of each setting? (run with COVERAGE=true)

## High Priority

- [ ] **SW restart loses snippet settings** — `loadSettings()` fetches from storage but never writes back into `conf`; fix by merging storage result into `conf` after startup load (`start.ts:551`)
- [ ] **Snippets have no error isolation** — one bad `api.mapkey()` aborts all subsequent mappings; wrap each call or wrap the full snippet with try/catch per-statement; add execution timeout (`content.ts:122`)

## Medium Priority

- [ ] **Two sources of truth for defaults** — `conf` (`start.ts:429`) and `runtime.conf` (`runtime.ts:60`) define defaults independently; extract shared defaults module imported by both; closes race window where content scripts see `undefined` for `llm`, `focusAfterClosed`, `tabsMRUOrder`, `showTabIndices`
- [ ] **`newTabUrl` persistence is a one-off hack** — generalize to a `persistentSettingKeys: Set<string>` registry; loop it in `updateSettings` scope=snippets instead of hardcoding (`start.ts:1886`)
- [ ] **Untyped settings flow** — settings move as `Record<string, unknown>` with `(runtime.conf as any)[k]`; add schema validation at storage read boundary using `SurfingKeysConf` interface (`start.ts:856`, `content.ts:105`)

## Low Priority

- [ ] **`loadSettings` called on every page load** — no caching; add a cached result with explicit invalidation; decouple config-server fetch from local/sync merge
- [ ] **Broadcast hits all tabs unconditionally** — add change detection; skip broadcast if settings unchanged (`start.ts:870`)
- [ ] **`scope: "snippets"` dual behavior undocumented** — rename or document transient vs persistent semantics; make the distinction explicit (`start.ts:1879`)

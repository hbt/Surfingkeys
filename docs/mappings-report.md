# mappings-json-report

Schema and field reference for `bun scripts/mappings-json-report.ts`.

**Run:** `bun scripts/mappings-json-report.ts | jq .`
**Source:** `scripts/mappings-json-report.ts`

---

## report.top-level

| Field | Type | Description |
|---|---|---|
| `mappings` | object | All keyboard mappings extracted from `src/` |
| `settings` | object | All `runtime.conf.*` and `settings.*` usages found in `src/` |
| `custom_configuration` | object? | Parsed `~/.surfingkeys-2026.js` (omitted if file is empty or missing) |

---

## report.mappings

```json
{
  "mappings": {
    "summary": { ... },
    "list": [ MappingEntry, ... ]
  }
}
```

### report.mappings.summary

| Field | Type | Description |
|---|---|---|
| `total` | number | Total mapping entries found |
| `by_mode` | `Record<string, number>` | Count per mode (Normal, Visual, Insert, Omnibar, Command, Hints, CursorPrompt) |
| `by_type` | `Record<string, number>` | Count per extraction type (see `mappingType` below) |
| `migrated` | number | Entries with an object annotation (have `unique_id`) |
| `not_migrated` | number | Entries still using a plain string annotation |
| `validation.valid` | number | Migrated entries that pass all field checks |
| `validation.invalid` | number | Entries with missing required fields or duplicate `unique_id` |
| `validation.not_migrated` | number | Same as `not_migrated` |
| `config_options` | object | Discovery of `mapping_options` keys across all entries (see below) |
| `tests` | object? | Test coverage stats (present when `tests/cdp/commands/` is found) |

#### report.mappings.summary.config_options

Dynamically discovered — one key per unique `mapping_options` property found across all mappings.

```json
"config_options": {
  "feature_group": {
    "count": 142,
    "percentage": "38.5%",
    "sample_values": [2, 3, 7],
    "value_descriptions": { "2": "Scroll Page / Element", "3": "Tabs", "7": "Clipboard" }
  },
  "repeatIgnore": {
    "count": 18,
    "percentage": "4.9%",
    "sample_values": [true]
  }
}
```

| Field | Description |
|---|---|
| `count` | How many mappings have this option set |
| `percentage` | `count / total` mappings |
| `sample_values` | Up to 5 distinct values seen |
| `value_descriptions` | Only on `feature_group`: human-readable category names |

**feature_group values:**

| # | Category |
|---|---|
| 0 | Help |
| 1 | Mouse Click |
| 2 | Scroll Page / Element |
| 3 | Tabs |
| 4 | Page Navigation |
| 5 | Sessions |
| 6 | Search selected with |
| 7 | Clipboard |
| 8 | Omnibar |
| 9 | Visual Mode |
| 10 | vim-like marks |
| 11 | Settings |
| 12 | Chrome URLs |
| 13 | Proxy |
| 14 | Misc |
| 15 | Insert Mode |
| 16 | Lurk Mode |
| 17 | Regional Hints Mode |

#### report.mappings.summary.tests

| Field | Description |
|---|---|
| `total_with_tests` | Migrated commands that have at least one matching test file |
| `total_without_tests` | Migrated commands with no test file |
| `invalid_test_names` | Test files in `tests/cdp/commands/` whose name doesn't match any known `unique_id` or valid setting suffix |

---

### report.mappings.list — MappingEntry

Each item in `mappings.list` represents one keyboard binding or command registration.

```json
{
  "key": "e",
  "mode": "Normal",
  "annotation": { ... },
  "source": { "file": "content_scripts/common/default.js", "line": 412 },
  "mappingType": "direct",
  "mapping_options": { "feature_group": 3, "repeatIgnore": true },
  "runtime_options": { "accepts_count": false },
  "validationStatus": "valid",
  "test_coverage": { "hasTest": true, "testFiles": ["cmd-tab-next.test.ts"] }
}
```

#### MappingEntry — core fields

| Field | Type | Description |
|---|---|---|
| `key` | string | The key sequence (e.g. `"e"`, `"gi"`, `"sg"`) or command name for `command` type |
| `mode` | string | `Normal` \| `Visual` \| `Insert` \| `Omnibar` \| `Command` \| `Hints` \| `CursorPrompt` |
| `annotation` | string \| object | Either a legacy plain string or a structured `AnnotationObject` |
| `source.file` | string | Relative path from `src/` where the binding is defined |
| `source.line` | number | Line number of the `mapkey` / `mappings.add` call |
| `mappingType` | string | How the binding was registered (see table below) |

#### MappingEntry — mappingType values

| Value | Source pattern | Notes |
|---|---|---|
| `mapkey` | `mapkey(key, annotation, fn)` | High-level API; used in user scripts and `default.js` |
| `direct` | `self.mappings.add(key, { annotation, ... })` | Low-level Trie registration; carries `mapping_options` |
| `search_alias` | `addSearchAlias(alias, ...)` | Expands into 3–4 synthetic entries per alias |
| `command` | `command(name, annotation, fn)` | Omnibar `:command` entries |

#### MappingEntry — annotation

**String (not migrated):**
```json
"annotation": "Close current tab"
```

**AnnotationObject (migrated):**
```json
"annotation": {
  "short": "Close tab",
  "unique_id": "cmd_tab_close",
  "category": "Tabs",
  "description": "Close the current browser tab",
  "tags": ["tab", "close"]
}
```

| Field | Required | Description |
|---|---|---|
| `short` | yes | Brief label shown in help menu |
| `unique_id` | yes | Snake-case stable identifier used for test file matching (`cmd_*`) |
| `category` | yes | Grouping label (free text, not the same as `feature_group`) |
| `description` | yes | Full description for documentation |
| `tags` | yes (≥1) | Array of topic tags |

#### MappingEntry — optional fields

| Field | Present when | Description |
|---|---|---|
| `mapping_options` | `mappingType === 'direct'` | Raw options passed to `mappings.add` (e.g. `feature_group`, `repeatIgnore`, `code`, `stopPropagation`) |
| `runtime_options.accepts_count` | `mappingType === 'direct'` | `true` unless `repeatIgnore: true` is set — whether a numeric prefix like `3j` is meaningful |
| `validationStatus` | always | `valid` \| `invalid` \| `not_migrated` |
| `validationErrors` | when invalid | Array of human-readable error strings (missing fields, duplicate `unique_id`) |
| `test_coverage` | when annotation is an object | Coverage linkage (see below) |

#### MappingEntry — test_coverage

| Field | Description |
|---|---|
| `hasTest` | `true` if at least one test file in `tests/cdp/commands/` matches this `unique_id` |
| `testFiles` | Sorted list of matching filenames (e.g. `["cmd-scroll-down.test.ts", "cmd-scroll-down.scrollStepSize.test.ts"]`) |

**Test file matching rules** (applied to filenames stripped of `.test.ts`):
1. **Exact:** `cmd-scroll-down` → normalized to `cmd_scroll_down` → matched against `unique_id`
2. **Setting variant:** `cmd-scroll-down.scrollStepSize` → command part matches `unique_id`, setting part must be a known `runtime.conf` or `settings` property

---

## report.settings

```json
{
  "settings": {
    "summary": { ... },
    "excluded": [ ... ],
    "list": [ SettingEntry, ... ]
  }
}
```

### report.settings.summary

| Field | Description |
|---|---|
| `total_usages` | Total AST occurrences of `runtime.conf.*` or `settings.*` in `src/` |
| `unique_settings` | Distinct setting names found (after exclusions) |
| `runtime_conf_settings` | Settings accessed via `runtime.conf.x` |
| `settings_api` | Settings accessed via `settings.x` |
| `excluded_count` | Number of false-positive names filtered out |

### report.settings.excluded

Known false positives filtered from results:

| Name | Why excluded |
|---|---|
| `hasOwnProperty` | Built-in JS method |
| `k` | Loop variable in `for...in` |
| `error` | Transient UI message property |
| `regexName` | Function parameter in `ensureRegex()` |

### report.settings.list — SettingEntry

```json
{
  "setting": "scrollStepSize",
  "type": "runtime.conf",
  "frequency": 4,
  "files": ["content_scripts/common/default.js"],
  "functions": ["scroll"],
  "usages": [
    { "file": "content_scripts/common/default.js", "line": 89, "function": "scroll", "context": "read" }
  ],
  "annotation": { ... }
}
```

| Field | Description |
|---|---|
| `setting` | Property name (e.g. `scrollStepSize`) |
| `type` | `runtime.conf` or `settings` |
| `frequency` | Total AST hits across all files |
| `files` | Distinct files where the setting is accessed |
| `functions` | Distinct function names containing the access |
| `usages` | Per-occurrence detail: file, line, function, `read`/`write` context |
| `annotation` | Optional — enriched from `docs/settings/all.json` if a matching entry exists |

---

## report.custom_configuration

Only present if `~/.surfingkeys-2026.js` exists and contains mapping calls.

```json
{
  "custom_configuration": {
    "summary": { "total": 5 },
    "mappings": [
      { "key": "F", "type": "mapkey", "unique_id": "cmd_hints_open", "description": "Open hints" }
    ]
  }
}
```

### CustomConfigMapping

| Field | Present when | Description |
|---|---|---|
| `key` | always | Key sequence or alias |
| `type` | always | `mapkey` \| `vmapkey` \| `imapkey` \| `cmapkey` \| `map` \| `unmap` \| `mapcmdkey` variants |
| `unique_id` | object annotation or `mapcmdkey` | The `unique_id` being bound or remapped |
| `description` | string or object annotation | `short` or `description` from the annotation |

---

## usage.jq-recipes

```bash
# All valid Normal mode commands
bun scripts/mappings-json-report.ts | jq '.mappings.list[] | select(.mode == "Normal" and .validationStatus == "valid")'

# Commands without tests
bun scripts/mappings-json-report.ts | jq '.mappings.list[] | select(.test_coverage.hasTest == false) | .annotation.unique_id'

# Invalid / duplicate entries
bun scripts/mappings-json-report.ts | jq '.mappings.list[] | select(.validationStatus == "invalid") | {key, file: .source.file, errors: .validationErrors}'

# Coverage summary
bun scripts/mappings-json-report.ts | jq '.mappings.summary.tests'

# Settings read vs write
bun scripts/mappings-json-report.ts | jq '.settings.list[] | {setting, writes: [.usages[] | select(.context == "write")] | length}'

# All unique_ids (for grep/reference)
bun scripts/mappings-json-report.ts | jq -r '.mappings.list[] | select(.annotation.unique_id) | .annotation.unique_id' | sort
```

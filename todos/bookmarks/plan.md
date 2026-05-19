# bookmark-folder-commands

Port the archive fork's named bookmark folder system into the current fork as
proper extension commands with `unique_id`s, RUNTIME handlers, and Playwright tests.

Source: archive `bg.js:2362–2695` — `byX`, `bCx`, `b!X`, etc.

---

## 1. Architecture

### 1.1 Private helpers (`src/background/start.ts`)

| Helper | Purpose |
|--------|---------|
| `_getBookmarkFolderByName(name, cb)` | Find folder node by title; cb(undefined) if missing |
| `_getBookmarkChildrenByName(name, cb)` | Get direct children of named folder |
| `_deepPluck(obj, key)` | Recursively extract all `key` values from nested objects |
| `_normalizeUrl(url)` | Strip trailing slash for consistent URL comparison |

### 1.2 RUNTIME handlers (7 total)

| Handler | unique_id | Description |
|---------|-----------|-------------|
| `bookmarkToggleFolder` | `cmd_bookmark_toggle_folder` | Add/remove current tab URL in named folder |
| `bookmarkCopyFolder` | `cmd_bookmark_copy_folder` | Copy all folder URLs to clipboard; supports `reverse` + `repeats` |
| `bookmarkEmptyFolder` | `cmd_bookmark_empty_folder` | `removeTree` + recreate empty folder |
| `bookmarkAddM` | `cmd_bookmark_add_m` | Add tabs via `tabHandleMagic` to folder, skip duplicates |
| `bookmarkRemoveM` | `cmd_bookmark_remove_m` | Remove tabs via `tabHandleMagic` from folder |
| `bookmarkCutFromFolder` | `cmd_bookmark_cut_folder` | Backup to clipboard then delete N items |
| `bookmarkLookupCurrentURL` | `cmd_bookmark_lookup_url` | Find all folders containing current URL |

### 1.3 Key registration pattern

Keys are **not** registered in `settings.ts` — they are assigned dynamically in
`.surfingkeys-2026.js` via `api.mapcmdkey()` in a `bmapping` loop.

`settings.ts` should have **no** `mapkey('')` stubs for these commands — that triggers
`annotations.empty_key` violations. The `unique_id` existence is satisfied by the config
calling `api.mapcmdkey(key, unique_id, fn)` at runtime.

### 1.4 Config binding pattern (`~/.surfingkeys-2026.js`)

```javascript
const bmapping = {
    m: "morning",   r: "read_later",  w: "watch_later",
    l: "later",     L: "listen_later", W: "weekly",
    R: "remember",  g: "incognito",
};
[...Array(10).keys()].forEach(n => { bmapping[String(n)] = `output${n}`; });

for (const [key, folder] of Object.entries(bmapping)) {
    api.mapcmdkey(`b${key}`,  'cmd_bookmark_toggle_folder',
        () => RUNTIME('bookmarkToggleFolder', { folder }));
    api.mapcmdkey(`by${key}`, 'cmd_bookmark_copy_folder',
        () => RUNTIME('bookmarkCopyFolder', { folder, reverse: true, repeats: R }));
    api.mapcmdkey(`bY${key}`, 'cmd_bookmark_copy_folder',
        () => RUNTIME('bookmarkCopyFolder', { folder, reverse: false, repeats: R }));
    api.mapcmdkey(`Bc${key}`, 'cmd_bookmark_cut_folder',
        () => RUNTIME('bookmarkCutFromFolder', { folder, reverse: true, repeats: R }));
    api.mapcmdkey(`BC${key}`, 'cmd_bookmark_cut_folder',
        () => RUNTIME('bookmarkCutFromFolder', { folder, reverse: false, repeats: R }));
    api.mapcmdkey(`B!${key}`, 'cmd_bookmark_empty_folder',
        () => RUNTIME('bookmarkEmptyFolder', { folder }));
    api.mapcmdkey(`Ba${key}`, 'cmd_bookmark_add_m',
        () => RUNTIME('bookmarkAddM', { folder, repeats: R, magic: 'CurrentTab' }));
    api.mapcmdkey(`Br${key}`, 'cmd_bookmark_remove_m',
        () => RUNTIME('bookmarkRemoveM', { folder, repeats: R, magic: 'CurrentTab' }));
}

// NOTE: avoid `LL` — blocked by `L` (cmd_hints_regional). Use different key.
api.mapcmdkey('bL', 'cmd_bookmark_lookup_url',
    () => RUNTIME('bookmarkLookupCurrentURL', {}));
```

### 1.5 Tests (Variant B — SW target)

All 7 files in `tests/playwright/commands/cmd-bookmark-*.spec.ts`.
- Setup: create test folder via `sw.evaluate(() => chrome.bookmarks.create(...))`
- Cleanup: `afterEach` removes test folder via `chrome.bookmarks.search` + `removeTree`
- Verify: `sw.evaluate(() => chrome.bookmarks.getChildren(...))` after command

---

## 2. Gotchas

| Issue | Note |
|-------|------|
| `mapkey('')` in settings.ts | Triggers `annotations.empty_key` — do NOT register stubs there |
| `LL` key conflict | `L` → `cmd_hints_regional` blocks `LL` — use `bL` instead |
| `repeats` field | Use `message.repeats as number` — no `\|\| 1` fallback (CLAUDE.md) |
| `bookmarkCutFromFolder` calling `self.bookmarkCopyFolder` | Cast required: `(self.bookmarkCopyFolder as ...)()` — TS type is `unknown` |
| Folder creation on-the-fly | Create under `parentId: "1"` (Bookmarks Bar) if folder not found |
| `bookmarkLookupCurrentURL` | Must call `_response()` — uses async and `needResponse` must be satisfied |

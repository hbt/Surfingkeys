# Bug: cmd_insert_neovim_editor (Ctrl-Alt-i) only works once per page load

## Symptom
`Ctrl-Alt-i` opens the embedded neovim editor correctly on first use.
On subsequent attempts (same tab, same page), nothing happens — no popup, no error visible.

## Expected
Should open the neovim editor every time, as many times as needed.

## Reproduction
1. Focus a text input on any page
2. Press `Ctrl-Alt-i` → neovim panel opens ✅
3. Edit, save (`:wq`)
4. Focus any input again
5. Press `Ctrl-Alt-i` → nothing happens ❌

## Root Cause (investigated)
`_neovim` is a module-level Promise in `frontend.js` (line 588). On first use it is created and
resolves with a live `nvim` instance. When the user closes the editor, `quitNvim()` calls `destroy()`
on the nvim object — but **never resets `_neovim = null`**. On the next invocation, the `if (!_neovim)`
guard is skipped, `.then(nvim => …)` resolves instantly with the already-destroyed instance, and
`nvim.connect()` silently fails on the dead object.

## Fix Applied
Added `_neovim = null` as the first line of `quitNvim()` in
`src/content_scripts/ui/frontend.js:594` so each session gets a fresh instance.

## Investigation
- [x] Use /devtools to check background SW state after first use
- [x] Check `renderNvim()` in frontend.js — `_neovim` promise never reset → **root cause**
- [ ] Secondary: `nativeConnected` in `chrome.js` never resets to `false` — may cause background
      to hold a pending-forever promise if the native host doesn't auto-restart (lower priority)

## Relevant Code
- `src/content_scripts/ui/frontend.js` — `renderNvim()`, `_neovim` promise
- `src/background/chrome.js` — `startNative()`, `nvimServer.instance`
- `src/background/start.js` — `self.connectNative`
- `src/pages/neovim.js` — bootstrap + `nvim.on('nvim:close')`

# Bug: cmd_insert_vim_editor (Ctrl-i) — ACE editor opens empty, can't save

## Symptoms
1. **No pre-fill** — editor opens but input field text is not loaded into it
2. **Can't save** — typing in the editor and pressing `:wq` / `<Enter>` does nothing (or unknown binding needed)

## Expected
- Editor opens with current input field text pre-filled
- On save (`:wq`), text is written back to the input field and insert mode is restored

## Reproduction
1. Focus a textarea with some text
2. Press `Ctrl-i` → ACE editor popup opens
3. Editor is empty (text not pre-loaded) ❌
4. Type something, attempt `:wq` → nothing written back ❌

## Hypotheses
- Pre-fill: `getRealEdit()` may not be capturing the active element correctly after `element.blur()` + `insert.exit()` reorder
- Save: vim keybindings in ACE may not be configured; `:wq` command handler may be missing or broken
- The `onEditorSaved` callback chain may be broken (`front.onEditorSaved` not set before editor opens)

## Investigation
- [ ] Check `getRealEdit()` — does it return the correct element after blur?
- [ ] Check `front.showEditor()` — is `content` extracted and passed in message?
- [ ] Check ACE `renderAceEditor()` — is `message.content` applied to editor?
- [ ] Check vim `:wq` handler in `frontend.js` → `_save()` → `onEditorSaved`
- [ ] Check if ACE vim mode is even loaded (keybindings config)

## Relevant Code
- `src/content_scripts/common/default.js` — `openVim()`, `getRealEdit()`
- `src/content_scripts/front.js` — `showEditor()`, `updateElementBehindEditor()`
- `src/content_scripts/ui/frontend.js` — `renderAceEditor()`, `createAceEditor()`, `_save()`

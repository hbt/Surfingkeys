# completions

## completions.zsh.dynamic

Dynamic zsh completion for `bin/dbg` - automatically discovers new actions

### installation

```bash
# add to ~/.zshrc
fpath=(/path/to/surfingkeys/completions $fpath)
autoload -U compinit && compinit

# optional: add alias to use just 'dbg' instead of 'bin/dbg'
alias dbg="bin/dbg"
```

### reload

After installation reload shell or run:

```bash
exec zsh
```

### verify

Type `bin/dbg <TAB>` to see available actions with descriptions

### dynamic.discovery

Actions are discovered from `scripts/dbg/actions/*.js` at completion time.
Descriptions are extracted from JSDoc comments (line 3-5).

**Adding new actions:**
1. Create `scripts/dbg/actions/my-action.js`
2. Add JSDoc comment with description:
   ```js
   /**
    * My Action Name
    *
    * Description of what this action does
    */
   ```
3. Completions update automatically - no need to modify completion script
4. Test: `bin/dbg <TAB>` should show new action

### performance

Completion is fast - only scans action directory when TAB is pressed.
Falls back to static list if directory not found.

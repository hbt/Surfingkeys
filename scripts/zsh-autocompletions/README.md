# ZSH Autocompletions Reference

This directory contains reference copies of custom ZSH completions.

## npm / nr completion

**File**: `_npm.bash`

**Active location**: `~/.zsh/completions/_npm.bash`

**Loaded in**: `~/.zshrc` (lines 510-514)

### Features

- Autocompletes `npm run` script names from `package.json`
- Supports colon-separated script names (e.g., `esbuild:dev`, `test:cdp:watch`)
- Works with `nr` alias (shorthand for `npm run`)

### How it works

Based on the mage completion approach:

1. **`_get_comp_words_by_ref -n : cur`** - Tells bash completion to NOT treat `:` as a word separator
2. **`__ltrim_colon_completions "$cur"`** - Handles colon trimming for proper completion

### Usage examples

```bash
npm run esb<TAB>           # Shows: esbuild:dev, esbuild:prod
npm run esbuild:d<TAB>     # Completes to: npm run esbuild:dev
bin/dbg t<TAB>             # Completes to: bin/dbg test-run
```

### Installation pattern

In `.zshrc`:
```bash
if [ -f ~/.zsh/completions/_npm.bash ]; then
    source ~/.zsh/completions/_npm.bash
fi
```

Bash completion functions loaded via `bashcompinit` (line 271 in `.zshrc`).

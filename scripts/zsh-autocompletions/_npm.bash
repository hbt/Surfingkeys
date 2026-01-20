#!/usr/bin/env bash

# NPM completion with support for colon-separated script names
# Based on mage completion approach

_npm_completions() {
    local cur prev opts

    # Handle colons in completions (like mage does)
    _get_comp_words_by_ref -n : cur

    prev="${COMP_WORDS[COMP_CWORD-1]}"

    # If previous word is 'run' or 'run-script', or if we're completing for 'nr' command
    if [[ "${prev}" == "run" || "${prev}" == "run-script" || "${COMP_WORDS[0]}" == "nr" ]]; then
        local package_json="./package.json"

        if [[ -f "$package_json" ]]; then
            # Extract script names using jq or sed
            if command -v jq &>/dev/null; then
                opts=$(jq -r '.scripts // {} | keys[]' "$package_json" 2>/dev/null)
            else
                # Fallback: extract with sed/grep
                opts=$(sed -n '/"scripts":/,/}/p' "$package_json" | grep -oP '"\K[^"]+(?="\s*:)' | grep -v "scripts")
            fi

            COMPREPLY+=( $(compgen -W "${opts}" -- "${cur}") )
        fi
    else
        # Complete npm commands
        case "${prev}" in
            npm)
                if [[ ${cur} == -* ]]; then
                    opts="--version --help"
                else
                    opts="run run-script test start install i update uninstall publish init"
                fi
                COMPREPLY+=( $(compgen -W "${opts}" -- "${cur}") )
                ;;
            *)
                # Default: no completion
                ;;
        esac
    fi

    # Handle colon completion (like mage does)
    __ltrim_colon_completions "$cur"
}

complete -F _npm_completions npm
complete -F _npm_completions nr  # alias for npm run

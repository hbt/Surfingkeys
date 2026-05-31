import type { ExcludedSetting } from './types';

// ============================================================================
// FEATURE GROUP DESCRIPTIONS
// ============================================================================

/**
 * Maps feature_group indices to their human-readable category names
 * Used to categorize commands for display in the help menu
 */
export const FEATURE_GROUP_DESCRIPTIONS: Record<number, string> = {
    0: 'Help',
    1: 'Mouse Click',
    2: 'Scroll Page / Element',
    3: 'Tabs',
    4: 'Page Navigation',
    5: 'Sessions',
    6: 'Search selected with',
    7: 'Clipboard',
    8: 'Omnibar',
    9: 'Visual Mode',
    10: 'vim-like marks',
    11: 'Settings',
    12: 'Chrome URLs',
    13: 'Proxy',
    14: 'Misc',
    15: 'Insert Mode',
    16: 'Lurk Mode',
    17: 'Regional Hints Mode'
};

// ============================================================================
// EXCLUSION LIST
// ============================================================================

/**
 * Settings that are false positives detected by the AST scanner.
 * These are not genuine configuration settings and should be excluded from reports.
 */
export const EXCLUDED_SETTINGS: ExcludedSetting[] = [
    {
        name: 'hasOwnProperty',
        reason: 'Built-in JavaScript method used for property validation, not a configuration setting'
    },
    {
        name: 'k',
        reason: 'Loop variable in for...in iterations, not a literal property name (dynamic property access)'
    },
    {
        name: 'error',
        reason: 'Transient error message property for UI communication, not a user-configurable runtime setting'
    },
    {
        name: 'regexName',
        reason: 'Function parameter in ensureRegex() helper, not a configuration setting'
    }
];

// ============================================================================
// EXCLUDED MAPPING KEY PATTERNS
// ============================================================================

/**
 * Mapping entries whose key matches these patterns are AST scanner artifacts —
 * the static analyser could not resolve the key or annotation to a concrete value.
 * They are not real user-facing commands and should be dropped from the report.
 */
export const EXCLUDED_MAPPING_KEY_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
    {
        pattern: /^<Identifier:/,
        reason: 'AST placeholder — key is a runtime variable that the static scanner cannot resolve (e.g. mapkey(keys, annotation, ...) inside api.ts helper functions)'
    }
];

// ============================================================================
// EXCLUDED COMMANDS (testing)
// ============================================================================

/**
 * Commands excluded from test coverage requirements.
 * These will not appear as "missing tests" in reports or issues.
 */
export const EXCLUDED_COMMANDS: Array<{ unique_id: string; reason: string }> = [
    // chrome:// navigation — Playwright cannot access chrome:// pages
    { unique_id: 'cmd_chrome_about',              reason: 'chrome:// page — not accessible in Playwright' },
    { unique_id: 'cmd_chrome_bookmarks',          reason: 'chrome:// page — not accessible in Playwright' },
    { unique_id: 'cmd_chrome_cache',              reason: 'chrome:// page — not accessible in Playwright' },
    { unique_id: 'cmd_chrome_downloads',          reason: 'chrome:// page — not accessible in Playwright' },
    { unique_id: 'cmd_chrome_extensions',         reason: 'chrome:// page — not accessible in Playwright' },
    { unique_id: 'cmd_chrome_history',            reason: 'chrome:// page — not accessible in Playwright' },
    { unique_id: 'cmd_chrome_cookies',            reason: 'chrome:// page — not accessible in Playwright' },
    { unique_id: 'cmd_chrome_net_internals',      reason: 'chrome:// page — not accessible in Playwright' },
    { unique_id: 'cmd_chrome_view_source',        reason: 'chrome:// page — not accessible in Playwright' },
    { unique_id: 'cmd_chrome_inspect',            reason: 'Opens Chrome DevTools — requires CDP, not testable in Playwright' },
    { unique_id: 'cmd_chrome_close_downloads_shelf', reason: 'Chrome UI shelf element — not accessible in Playwright' },
    // Browser lifecycle
    { unique_id: 'cmd_quit_chrome',               reason: 'Terminates the browser process — cannot be tested in Playwright' },
    // TTS — non-deterministic, system audio dependency
    { unique_id: 'cmd_list_voices',               reason: 'TTS — voice availability is system-dependent and non-deterministic' },
    { unique_id: 'cmd_stop_reading',              reason: 'TTS — requires active audio playback, not testable in headless Playwright' },
    { unique_id: 'cmd_test_voices',               reason: 'TTS — requires audio output, non-deterministic across environments' },
    // Proxy — system-level network changes, no observable page state
    { unique_id: 'cmd_set_proxy',                 reason: 'System-level proxy change — no observable page state to assert' },
    { unique_id: 'cmd_set_proxy_mode',            reason: 'System-level proxy change — no observable page state to assert' },
    { unique_id: 'cmd_proxy_toggle_site',         reason: 'Proxy state mutation — requires network proxy infrastructure' },
    { unique_id: 'cmd_paste_proxy',               reason: 'Clipboard → proxy — depends on clipboard and proxy infrastructure' },
    { unique_id: 'cmd_proxy_copy_info',           reason: 'Proxy state read — requires active proxy configuration' },
    // Markdown — complex fixture not yet established
    { unique_id: 'cmd_markdown_toggle_section',   reason: 'Markdown feature — fixture and page state not yet set up' },
    { unique_id: 'cmd_markdown_switch_parser',    reason: 'Markdown feature — fixture and page state not yet set up' },
    { unique_id: 'cmd_markdown_copy_html',        reason: 'Markdown feature — fixture and page state not yet set up' },
    { unique_id: 'cmd_markdown_open_file',        reason: 'Markdown feature — requires file system access, not testable in Playwright' },
    { unique_id: 'cmd_markdown_edit_source',      reason: 'Markdown feature — fixture and page state not yet set up' },
    // Lurk mode — requires lurkingPattern config not yet wired in test harness
    { unique_id: 'cmd_lurk_enter_normal',         reason: 'Lurk mode — requires lurkingPattern config and mode-switch fixture not yet established' },
    { unique_id: 'cmd_lurk_ephemeral_normal',     reason: 'Lurk mode — requires lurkingPattern config and mode-switch fixture not yet established' },
    // Neovim integration — requires external process
    { unique_id: 'cmd_neovim_enable_input',       reason: 'Neovim integration — requires external Neovim process, not testable in CI' },
    // Deferred — not prioritized for current cycle
    { unique_id: 'cmd_nav_incognito',             reason: 'Deferred — incognito window lifecycle in Playwright needs investigation' },
    { unique_id: 'cmd_nav_new_incognito_window',  reason: 'Incognito — chrome.windows.create with incognito not supported in Playwright' },
    { unique_id: 'cmd_bookmark_youtube_playlist_ordered', reason: 'Mirror of cmd_bookmark_youtube_playlist (natural order) — covered by playlist key spec' },
    { unique_id: 'cmd_omnibar_llm_chat',          reason: 'Deferred — LLM chat integration not yet stable for testing' },
    { unique_id: 'cmd_session_save_quit',         reason: 'Deferred — session save/quit browser lifecycle not yet set up' },
    { unique_id: 'cmd_tools_read_text',           reason: 'Deferred — TTS read-text dispatch chain not yet isolated for testing' },
    { unique_id: 'cmd_visual_llm_chat',           reason: 'Deferred — LLM chat visual integration not yet stable for testing' },
];

// ============================================================================
// KNOWN LOW COVERAGE COMMANDS
// ============================================================================

/**
 * Commands where low code coverage is expected by design.
 * These are annotated in the report with a `note` field on `code_coverage`
 * to distinguish intentional limitations from gaps that need fixing.
 */
export const KNOWN_LOW_COVERAGE_COMMANDS: Array<{ unique_id: string; reason: string }> = [
    // Incognito commands — Chrome split incognito mode prevents the regular SW from querying
    // incognito tabs (chrome.tabs.query returns only regular tabs). AllIncognitoTabs always
    // resolves to [] in Playwright, so only the no-op early-return path executes.
    { unique_id: 'cmd_tab_detach_magic_incognito',    reason: 'incognito — only no-op path testable in Playwright (Chrome split incognito isolates SW from incognito tabs)' },
    { unique_id: 'cmd_tab_close_magic_incognito',     reason: 'incognito — only no-op path testable in Playwright (Chrome split incognito isolates SW from incognito tabs)' },
    { unique_id: 'cmd_tab_reload_magic_incognito',    reason: 'incognito — only no-op path testable in Playwright (Chrome split incognito isolates SW from incognito tabs)' },
    { unique_id: 'cmd_tab_copy_urls_magic_incognito', reason: 'incognito — only no-op path testable in Playwright (Chrome split incognito isolates SW from incognito tabs)' },
];

// ============================================================================
// MODE MAPPINGS
// ============================================================================

export const MODE_MAP: Record<string, string> = {
    'mapkey': 'Normal',
    'vmapkey': 'Visual',
    'imapkey': 'Insert',
    'cmapkey': 'Omnibar',
    'command': 'Command'
};

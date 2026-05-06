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
// MODE MAPPINGS
// ============================================================================

export const MODE_MAP: Record<string, string> = {
    'mapkey': 'Normal',
    'vmapkey': 'Visual',
    'imapkey': 'Insert',
    'cmapkey': 'Omnibar',
    'command': 'Command'
};

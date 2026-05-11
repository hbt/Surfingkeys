/**
 * Settings test harness for SurfingKeys Playwright tests.
 *
 * Provides helpers to override runtime.conf values mid-test via the
 * existing __sk_conf_override CustomEvent bridge (see content.js).
 *
 * Usage:
 *
 *   import { applySetting, DEFAULTS } from './settings-helpers';
 *
 *   // In a test:
 *   await applySetting(page, 'scrollStepSize', 140);
 *   // ... test body ...
 *   await applySetting(page, 'scrollStepSize', DEFAULTS.scrollStepSize); // restore
 *
 * Pattern for isolated settings tests:
 *   Each spec should use its own launchWithCoverage() context so settings
 *   changes don't leak between spec files.
 */

import type { Page } from '@playwright/test';
import { setSkConf } from '../utils/pw-helpers';

// ---------------------------------------------------------------------------
// Known defaults (mirrors runtime.js)
// ---------------------------------------------------------------------------

export const DEFAULTS = {
    scrollStepSize:    70,
    digitForRepeat:    true,
    smoothScroll:      true,
    hintCharacters:    'sadfgqwertzxcvb',
    showTabIndices:    true,
    omnibarMaxResults: 10,
    tabsThreshold:     9,
} as const;

// ---------------------------------------------------------------------------
// Core helper
// ---------------------------------------------------------------------------

/**
 * Apply a runtime.conf override.  Returns true if the key exists, false if
 * the key was not found in runtime.conf (and the override was ignored).
 *
 * Wraps setSkConf from pw-helpers, providing a named alias with better docs.
 */
export async function applySetting(page: Page, key: string, value: unknown): Promise<boolean> {
    return setSkConf(page, key, value);
}

/**
 * Apply multiple runtime.conf overrides at once.
 * Returns a map of key → success (true = applied, false = key not found).
 */
export async function applySettings(
    page: Page,
    overrides: Record<string, unknown>,
): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(overrides)) {
        results[key] = await setSkConf(page, key, value);
    }
    return results;
}

/**
 * Restore a setting to its known default value from DEFAULTS.
 * Throws if the key is not in DEFAULTS (unknown setting).
 */
export async function restoreSetting(page: Page, key: keyof typeof DEFAULTS): Promise<boolean> {
    return setSkConf(page, key, DEFAULTS[key]);
}

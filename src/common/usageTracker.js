/**
 * Command Usage Tracker for Surfingkeys
 *
 * Tracks keyboard command usage for statistics and analytics.
 * Stores data in chrome.storage.local for persistence.
 *
 * Usage:
 * - Call trackCommandUsage() when a command is executed
 * - Call getUsageStats() to retrieve statistics
 */

const STORAGE_KEY = 'surfingkeys_usage';
const MAX_RECENT_HISTORY = 100;

/**
 * Track a command execution
 * @param {string} key - The key sequence (e.g., "j", "gg", "gf")
 * @param {string} annotation - Command description
 * @param {string} mode - Mode name (e.g., "Normal", "Visual")
 */
function trackCommandUsage(key, annotation, mode = 'Normal') {
    const timestamp = new Date().toISOString();
    const url = typeof window !== 'undefined' ? window.location.href : 'unknown';

    chrome.storage.local.get([STORAGE_KEY], (result) => {
        const usage = result[STORAGE_KEY] || {
            commands: {},
            recentHistory: [],
            stats: {
                totalInvocations: 0,
                firstTracked: timestamp,
                lastTracked: timestamp
            }
        };

        // Update command aggregate
        if (!usage.commands[key]) {
            usage.commands[key] = {
                annotation: annotation,
                mode: mode,
                count: 0,
                firstUsed: timestamp,
                lastUsed: timestamp
            };
        }

        usage.commands[key].count++;
        usage.commands[key].lastUsed = timestamp;
        // Update annotation in case it changed
        if (annotation) {
            usage.commands[key].annotation = annotation;
        }

        // Add to recent history
        usage.recentHistory.unshift({
            key: key,
            annotation: annotation,
            mode: mode,
            timestamp: timestamp,
            url: url
        });

        // Limit recent history
        if (usage.recentHistory.length > MAX_RECENT_HISTORY) {
            usage.recentHistory = usage.recentHistory.slice(0, MAX_RECENT_HISTORY);
        }

        // Update global stats
        usage.stats.totalInvocations++;
        usage.stats.lastTracked = timestamp;

        chrome.storage.local.set({ [STORAGE_KEY]: usage }, () => {
            if (chrome.runtime.lastError) {
                console.error('[USAGE TRACKER] Failed to save:', chrome.runtime.lastError.message);
            }
        });
    });
}

/**
 * Get all usage statistics
 * @returns {Promise<object>} Usage statistics
 */
function getUsageStats() {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            resolve(result[STORAGE_KEY] || {
                commands: {},
                recentHistory: [],
                stats: {
                    totalInvocations: 0,
                    firstTracked: null,
                    lastTracked: null
                }
            });
        });
    });
}

/**
 * Get frequently used commands (sorted by count)
 * @param {number} limit - Maximum number of commands to return
 * @returns {Promise<Array>} Array of {key, annotation, count, ...}
 */
async function getFrequentCommands(limit = 20) {
    const usage = await getUsageStats();
    return Object.entries(usage.commands)
        .map(([key, data]) => ({ key, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

/**
 * Get recently used commands
 * @param {number} limit - Maximum number of commands to return
 * @returns {Promise<Array>} Array of recent command executions
 */
async function getRecentCommands(limit = 20) {
    const usage = await getUsageStats();
    return usage.recentHistory.slice(0, limit);
}

/**
 * Clear all usage statistics
 * @returns {Promise<void>}
 */
function clearUsageStats() {
    return new Promise((resolve) => {
        chrome.storage.local.set({
            [STORAGE_KEY]: {
                commands: {},
                recentHistory: [],
                stats: {
                    totalInvocations: 0,
                    firstTracked: null,
                    lastTracked: null
                }
            }
        }, () => {
            console.log('[USAGE TRACKER] Cleared all usage statistics');
            resolve();
        });
    });
}

/**
 * Export usage data as JSON
 * @returns {Promise<string>} JSON string of usage data
 */
async function exportUsageData() {
    const usage = await getUsageStats();
    return JSON.stringify(usage, null, 2);
}

export {
    trackCommandUsage,
    getUsageStats,
    getFrequentCommands,
    getRecentCommands,
    clearUsageStats,
    exportUsageData
};

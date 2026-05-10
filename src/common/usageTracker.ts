/**
 * Command Usage Tracker for Surfingkeys
 *
 * Tracks keyboard command usage for statistics and analytics.
 * Stores data in chrome.storage.local for persistence.
 *
 * Supports both legacy string annotations and new structured metadata objects
 * for gradual migration to command identification system.
 *
 * Usage:
 * - Call trackCommandUsage() when a command is executed
 * - Call getUsageStats() to retrieve statistics
 */

import { getAnnotationString, getAnnotationMetadata, getCommandId, type Annotation } from './commandMetadata.js';

const STORAGE_KEY = 'surfingkeys_usage';
const MAX_RECENT_HISTORY = 100;

interface CommandEntry {
    key: string;
    display_name: string;
    command_id: string;
    category: string | null;
    mode: string;
    count: number;
    firstUsed: string;
    lastUsed: string;
}

interface RecentEntry {
    key: string;
    command_id: string;
    display_name: string;
    category: string | null;
    mode: string;
    timestamp: string;
    url: string;
}

interface UsageStats {
    commands: Record<string, CommandEntry>;
    recentHistory: RecentEntry[];
    stats: {
        totalInvocations: number;
        firstTracked: string | null;
        lastTracked: string | null;
    };
}

/**
 * Track a command execution
 */
function trackCommandUsage(key: string, annotation: Annotation, mode = 'Normal'): void {
    const timestamp = new Date().toISOString();
    const url = typeof window !== 'undefined' ? window.location.href : 'unknown';

    // Extract display string and metadata from annotation
    const displayString = getAnnotationString(annotation);
    const metadata = getAnnotationMetadata(annotation);
    const commandId = getCommandId(annotation, key);  // Unique ID that persists across remaps

    chrome.storage.local.get([STORAGE_KEY], (result) => {
        const usage: UsageStats = result[STORAGE_KEY] || {
            commands: {},
            recentHistory: [],
            stats: {
                totalInvocations: 0,
                firstTracked: timestamp,
                lastTracked: timestamp
            }
        };

        // Update command aggregate by unique ID (or key as fallback)
        if (!usage.commands[commandId]) {
            usage.commands[commandId] = {
                key: key,
                display_name: displayString,
                command_id: commandId,
                category: metadata.category,
                mode: mode,
                count: 0,
                firstUsed: timestamp,
                lastUsed: timestamp
            };
        }

        usage.commands[commandId].count++;
        usage.commands[commandId].lastUsed = timestamp;
        usage.commands[commandId].key = key;  // Update key in case it was remapped
        // Update display name in case annotation changed
        if (displayString) {
            usage.commands[commandId].display_name = displayString;
        }

        // Add to recent history
        usage.recentHistory.unshift({
            key: key,
            command_id: commandId,
            display_name: displayString,
            category: metadata.category,
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
 */
function getUsageStats(): Promise<UsageStats> {
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
 */
async function getFrequentCommands(limit = 20): Promise<Array<{ key: string } & CommandEntry>> {
    const usage = await getUsageStats();
    return Object.entries(usage.commands)
        .map(([key, data]) => ({ key, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

/**
 * Get recently used commands
 */
async function getRecentCommands(limit = 20): Promise<RecentEntry[]> {
    const usage = await getUsageStats();
    return usage.recentHistory.slice(0, limit);
}

/**
 * Clear all usage statistics
 */
function clearUsageStats(): Promise<void> {
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
 */
async function exportUsageData(): Promise<string> {
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

export type { UsageStats, CommandEntry, RecentEntry };

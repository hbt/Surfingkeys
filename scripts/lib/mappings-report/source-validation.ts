import type { MappingEntry, Issues } from './types';

// ============================================================================
// SOURCE VALIDATION
// ============================================================================

// Normalize key for comparison (handle modifier key variations, case-sensitive)
export function normalizeKey(key: string): string {
    return key
        .replace(/<Ctrl-/gi, '<C-')
        .replace(/<Alt-/gi, '<A-')
        .replace(/<Shift-/gi, '<S-');
}

// Check if key1 is a strict prefix of key2
export function isPrefix(key1: string, key2: string): boolean {
    if (key1 === key2) return false;
    return key2.startsWith(key1);
}

interface KeyEntry {
    key: string;
    mode: string;
    id: string | null;
    short: string;
}

// Find prefix conflicts among entries grouped by mode
export function findPrefixConflicts(entries: KeyEntry[]): Issues['source_validation']['prefix_conflicts'] {
    const conflicts: Issues['source_validation']['prefix_conflicts'] = [];

    // Group by mode
    const byMode = new Map<string, KeyEntry[]>();
    for (const entry of entries) {
        if (!byMode.has(entry.mode)) byMode.set(entry.mode, []);
        byMode.get(entry.mode)!.push(entry);
    }

    for (const [mode, modeEntries] of byMode) {
        for (let i = 0; i < modeEntries.length; i++) {
            for (let j = 0; j < modeEntries.length; j++) {
                if (i === j) continue;
                const a = modeEntries[i];
                const b = modeEntries[j];
                const normA = normalizeKey(a.key);
                const normB = normalizeKey(b.key);
                if (isPrefix(normA, normB)) {
                    conflicts.push({
                        mode,
                        blocked_key: b.key,
                        blocked_id: b.id,
                        blocked_short: b.short,
                        blocker_key: a.key,
                        blocker_id: a.id,
                        blocker_short: a.short,
                    });
                }
            }
        }
    }

    return conflicts;
}

// Find g-XXX placeholder issues
export function findGPlaceholderIssues(mappings: MappingEntry[]): Issues['source_validation']['g_placeholder_issues'] {
    const G_PATTERN = /^g-(\d+)$/;
    const issues: Issues['source_validation']['g_placeholder_issues'] = [];

    // Collect all g-XXX keys with their associated unique_ids
    const keyToIds = new Map<string, string[]>();
    for (const entry of mappings) {
        if (!entry.key) continue;
        if (!G_PATTERN.test(entry.key)) continue;
        const id = typeof entry.annotation === 'object' ? (entry.annotation.unique_id ?? '(unknown)') : '(unknown)';
        if (!keyToIds.has(entry.key)) keyToIds.set(entry.key, []);
        keyToIds.get(entry.key)!.push(id);
    }

    if (keyToIds.size === 0) return issues;

    // Check for duplicates
    for (const [key, ids] of keyToIds) {
        if (ids.length > 1) {
            issues.push({
                type: 'duplicate',
                key,
                message: `Duplicate g-XXX key: ${key} (used by ${ids.join(', ')})`,
                affected_ids: ids,
            });
        }
    }

    // Extract numeric suffixes and sort
    const nums = [...keyToIds.keys()]
        .map(k => parseInt(G_PATTERN.exec(k)![1], 10))
        .sort((a, b) => a - b);

    // Check starts at 001
    if (nums[0] !== 1) {
        const firstKey = `g-${String(nums[0]).padStart(3, '0')}`;
        issues.push({
            type: 'wrong_start',
            key: firstKey,
            message: `g-XXX sequence does not start at g-001 (first key is ${firstKey})`,
        });
    }

    // Check for gaps
    for (let i = 1; i < nums.length; i++) {
        if (nums[i] !== nums[i - 1] + 1) {
            const prev = `g-${String(nums[i - 1]).padStart(3, '0')}`;
            const curr = `g-${String(nums[i]).padStart(3, '0')}`;
            for (let missing = nums[i - 1] + 1; missing < nums[i]; missing++) {
                const missingKey = `g-${String(missing).padStart(3, '0')}`;
                issues.push({
                    type: 'gap',
                    key: missingKey,
                    message: `Gap in g-XXX sequence: missing ${missingKey} (sequence jumps ${prev} → ${curr})`,
                });
            }
        }
    }

    return issues;
}

export function generateSourceValidation(mappings: MappingEntry[]): Issues['source_validation'] {
    // Build key entries, skipping Command mode
    const entries: Array<{ key: string; mode: string; id: string | null; short: string }> = mappings
        .filter(e => e.key && e.mode && e.mode !== 'Command')
        .map(e => ({
            key: e.key,
            mode: e.mode,
            id: typeof e.annotation === 'object' ? (e.annotation.unique_id ?? null) : null,
            short: typeof e.annotation === 'object' ? (e.annotation.short ?? e.key) : e.key,
        }));

    return {
        prefix_conflicts: findPrefixConflicts(entries),
        g_placeholder_issues: findGPlaceholderIssues(mappings),
    };
}

import type { CustomConfiguration, Issues, MappingEntry } from './types';
import { findPrefixConflicts } from './source-validation';

// ============================================================================
// CONFIG VALIDATION
// ============================================================================

export function generateConfigValidation(
    customConfig: CustomConfiguration,
    validIds: Set<string>,
    sourceMappings: MappingEntry[] = []
): Issues['config_validation'] {
    // Build unique_id → mode lookup from source mappings
    const idToMode = new Map<string, string>();
    for (const m of sourceMappings) {
        const uid = typeof m.annotation === 'object' ? m.annotation.unique_id : undefined;
        if (uid) idToMode.set(uid, m.mode);
    }

    // Derive mode from the mapping function type; for mapcmdkey resolve via source
    function modeFromType(type: string, unique_id?: string): string {
        if (type === 'mapcmdkey' && unique_id && idToMode.has(unique_id)) {
            return idToMode.get(unique_id)!;
        }
        if (type.startsWith('v')) return 'Visual';
        if (type.startsWith('i')) return 'Insert';
        if (type.startsWith('c')) return 'Command';
        return 'Normal';
    }

    // Build key entries from customConfig.mappings for prefix conflict detection
    // Domain-scoped mappings are excluded — they only apply on specific sites so
    // cannot create a global prefix conflict with non-domain mappings.
    const keyEntries = customConfig.mappings
        .filter(m => !m.hasDomain)
        .map(m => ({
            key: m.key,
            mode: modeFromType(m.type, m.unique_id),
            id: m.unique_id ?? null,
            short: m.unique_id ?? m.key,
        }));

    // Reuse source-validation prefix conflict logic
    const rawConflicts = findPrefixConflicts(keyEntries);
    const prefixConflicts: Issues['config_validation']['prefix_conflicts'] = rawConflicts.map(c => ({
        blocked_key: c.blocked_key,
        blocker_key: c.blocker_key,
        blocker_target: c.blocker_short,
    }));

    // Find mapcmdkey entries referencing unknown unique_ids
    const invalidMapcmdkeyTargets: Issues['config_validation']['invalid_mapcmdkey_targets'] = [];
    for (const m of customConfig.mappings) {
        if (m.type === 'mapcmdkey' && m.unique_id !== undefined) {
            if (!validIds.has(m.unique_id)) {
                invalidMapcmdkeyTargets.push({
                    key: m.key,
                    unique_id: m.unique_id,
                });
            }
        }
    }

    // Detect exact duplicate keys (same key+mode bound to 2+ entries, excluding unmap)
    const keyGroups = new Map<string, typeof customConfig.mappings>();
    for (const m of customConfig.mappings) {
        if (m.type === 'unmap') continue;
        if (m.hasDomain) continue;
        const groupKey = `${modeFromType(m.type, m.unique_id)}:${m.key}`;
        if (!keyGroups.has(groupKey)) keyGroups.set(groupKey, []);
        keyGroups.get(groupKey)!.push(m);
    }
    const duplicateKeys: Issues['config_validation']['duplicate_keys'] = [];
    for (const [, entries] of keyGroups) {
        if (entries.length > 1) {
            duplicateKeys.push({
                key: entries[0].key,
                entries: entries.map(e => ({ unique_id: e.unique_id, type: e.type, line: e.line })),
            });
        }
    }

    return {
        prefix_conflicts: prefixConflicts,
        invalid_mapcmdkey_targets: invalidMapcmdkeyTargets,
        duplicate_keys: duplicateKeys,
    };
}

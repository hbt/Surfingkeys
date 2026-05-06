import type { CustomConfiguration, Issues } from './types';
import { findPrefixConflicts } from './source-validation';

// ============================================================================
// CONFIG VALIDATION
// ============================================================================

export function generateConfigValidation(
    customConfig: CustomConfiguration,
    validIds: Set<string>
): Issues['config_validation'] {
    // Build key entries from customConfig.mappings for prefix conflict detection
    const keyEntries = customConfig.mappings.map(m => ({
        key: m.key,
        mode: 'Normal',
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

    return {
        prefix_conflicts: prefixConflicts,
        invalid_mapcmdkey_targets: invalidMapcmdkeyTargets,
    };
}

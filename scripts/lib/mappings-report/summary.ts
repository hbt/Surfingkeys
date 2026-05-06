import type { MappingEntry, Summary, SettingUsage } from './types';
import { FEATURE_GROUP_DESCRIPTIONS } from './constants';
import { validateAnnotation } from './validation';
import { generateTestCoverageStats } from './test-coverage';

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

/**
 * Generate configuration options report by discovering all properties
 * from mapping_options across all mappings
 */
export function generateConfigOptionsReport(mappings: MappingEntry[]): Record<string, any> {
    const configStats: Record<string, { count: number; values: Set<any> }> = {};

    for (const mapping of mappings) {
        if (!mapping.mapping_options) continue;

        for (const [key, value] of Object.entries(mapping.mapping_options)) {
            if (value === undefined) continue;

            if (!configStats[key]) {
                configStats[key] = { count: 0, values: new Set() };
            }

            configStats[key].count++;

            // Store sample values (limit to 5)
            if (configStats[key].values.size < 5) {
                if (typeof value === 'object') {
                    configStats[key].values.add(JSON.stringify(value));
                } else {
                    configStats[key].values.add(value);
                }
            }
        }
    }

    // Convert to final format
    const result: Record<string, any> = {};
    const total = mappings.length;

    for (const [key, stats] of Object.entries(configStats)) {
        const entry: any = {
            count: stats.count,
            percentage: ((stats.count / total) * 100).toFixed(1) + '%',
            sample_values: Array.from(stats.values)
        };

        // Add value descriptions for feature_group
        if (key === 'feature_group') {
            const valueDescMap: Record<string, string> = {};
            for (const value of stats.values) {
                const numValue = Number(value);
                if (!isNaN(numValue) && FEATURE_GROUP_DESCRIPTIONS[numValue]) {
                    valueDescMap[String(numValue)] = FEATURE_GROUP_DESCRIPTIONS[numValue];
                }
            }
            if (Object.keys(valueDescMap).length > 0) {
                entry.value_descriptions = valueDescMap;
            }
        }

        result[key] = entry;
    }

    return result;
}

export function generateSummary(mappings: MappingEntry[], testMap?: Map<string, string>, settingsUsages?: SettingUsage[]): Summary {
    const summary: Summary = {
        total: mappings.length,
        by_mode: {},
        by_type: {},
        by_handler_type: {},
        migrated: 0,
        not_migrated: 0,
        validation: {
            valid: 0,
            invalid: 0,
            not_migrated: 0
        },
        config_options: generateConfigOptionsReport(mappings),  // NEW: Add config options discovery
        tests: (testMap && settingsUsages) ? generateTestCoverageStats(mappings, testMap, settingsUsages) : undefined
    };

    // Track unique_ids to detect duplicates
    const uniqueIdMap = new Map<string, MappingEntry[]>();

    for (const mapping of mappings) {
        // Count by mode
        summary.by_mode[mapping.mode] = (summary.by_mode[mapping.mode] || 0) + 1;

        // Count by type
        summary.by_type[mapping.mappingType] = (summary.by_type[mapping.mappingType] || 0) + 1;

        // Count migration status (legacy)
        if (typeof mapping.annotation === 'object' && mapping.annotation.unique_id) {
            summary.migrated++;
        } else {
            summary.not_migrated++;
        }

        // Validate annotation and update counts
        const validation = validateAnnotation(mapping.annotation);
        mapping.validationStatus = validation.status;
        if (validation.errors.length > 0) {
            mapping.validationErrors = validation.errors;
        }

        // Track unique_ids for duplicate detection
        if (typeof mapping.annotation === 'object' && mapping.annotation.unique_id) {
            const uid = mapping.annotation.unique_id;
            if (!uniqueIdMap.has(uid)) {
                uniqueIdMap.set(uid, []);
            }
            uniqueIdMap.get(uid)!.push(mapping);
        }

        summary.validation[validation.status]++;
    }

    // Second pass: mark duplicates as invalid
    for (const [uid, mappingsWithId] of uniqueIdMap.entries()) {
        if (mappingsWithId.length > 1) {
            // Check if these are browser-specific variants (same key, same file, different implementations)
            const isBrowserVariant =
                mappingsWithId.every(m => m.key === mappingsWithId[0].key) && // Same key
                mappingsWithId.every(m => m.source.file === mappingsWithId[0].source.file) && // Same file
                mappingsWithId.length === 2; // Exactly 2 variants

            if (isBrowserVariant) {
                // Skip marking as invalid - these are intentional browser-specific implementations
                continue;
            }

            // Mark all but the first as invalid duplicates
            for (let i = 1; i < mappingsWithId.length; i++) {
                const mapping = mappingsWithId[i];
                // Decrement the old validation count
                if (mapping.validationStatus) {
                    summary.validation[mapping.validationStatus]--;
                }
                // Update to invalid
                mapping.validationStatus = 'invalid';
                if (!mapping.validationErrors) {
                    mapping.validationErrors = [];
                }
                mapping.validationErrors.push(
                    `Duplicate unique_id: "${uid}" (also used in ${mappingsWithId[0].source.file}:${mappingsWithId[0].source.line})`
                );
                // Increment invalid count
                summary.validation.invalid++;
            }
        }
    }

    // Compute by_handler_type across all entries
    for (const mapping of mappings) {
        if (mapping.handler_type) {
            summary.by_handler_type[mapping.handler_type] =
                (summary.by_handler_type[mapping.handler_type] || 0) + 1;
        }
    }

    return summary;
}

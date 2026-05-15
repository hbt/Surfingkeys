import type { MappingEntry, CustomConfiguration, Issues, CategoryStats } from './types';
import { generateSourceValidation } from './source-validation';
import { generateConfigValidation } from './config-validation';

// ============================================================================
// ISSUES GENERATION
// ============================================================================

export function generateIssues(
    mappings: MappingEntry[],
    customConfig: CustomConfiguration,
    invalidTestFiles?: string[]
): Issues {
    const annotationsInvalid: Array<{ key: string; unique_id?: string; file: string; line: number; errors: string[] }> = [];
    const annotationsNotMigrated: Array<{ key: string; file: string; line: number }> = [];
    const testsMissing: string[] = [];
    const customMappingsUnmapped: string[] = [];
    const codeCoverageMissing: string[] = [];

    type CatAccum = { total: number; has_test: number; missing_ids: string[] };
    const testsCat = new Map<string, CatAccum>();
    const coverageCat = new Map<string, CatAccum>();

    function ensureCat(map: Map<string, CatAccum>, cat: string): CatAccum {
        if (!map.has(cat)) map.set(cat, { total: 0, has_test: 0, missing_ids: [] });
        return map.get(cat)!;
    }

    function buildCategoryRecord(map: Map<string, CatAccum>): Record<string, CategoryStats> {
        const out: Record<string, CategoryStats> = {};
        for (const [cat, s] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            out[cat] = {
                total: s.total,
                has_test: s.has_test,
                missing: s.missing_ids.length,
                coverage_pct: s.total > 0 ? Math.round((s.has_test / s.total) * 1000) / 10 : 0,
                missing_ids: s.missing_ids.sort(),
            };
        }
        return out;
    }

    for (const mapping of mappings) {
        if (mapping.validationStatus === 'invalid') {
            annotationsInvalid.push({
                key: mapping.key,
                ...(typeof mapping.annotation === 'object' && mapping.annotation.unique_id
                    ? { unique_id: mapping.annotation.unique_id }
                    : {}),
                file: mapping.source.file,
                line: mapping.source.line,
                errors: mapping.validationErrors ?? []
            });
        } else if (mapping.validationStatus === 'not_migrated') {
            // Skip search_alias auto-generated keys (addSearchAlias dynamic entries)
            if (mapping.mappingType === 'search_alias') continue;
            // Skip scanner artifacts from api.js where key couldn't be resolved
            if (mapping.key?.startsWith('<Identifier:')) continue;
            annotationsNotMigrated.push({
                key: mapping.key,
                file: mapping.source.file,
                line: mapping.source.line
            });
        }

        const uid = typeof mapping.annotation === 'object' ? mapping.annotation.unique_id : undefined;

        if (uid) {
            const cat = uid.split('_')[1] ?? 'unknown';

            if (mapping.test_coverage) {
                const s = ensureCat(testsCat, cat);
                s.total++;
                if (mapping.test_coverage.hasTest) { s.has_test++; }
                else if (!mapping.test_coverage.excluded) { s.missing_ids.push(uid); testsMissing.push(uid); }
            }
            if (mapping.custom_mapping && !mapping.custom_mapping.hasMapping) {
                customMappingsUnmapped.push(uid);
            }
            if (mapping.code_coverage) {
                const s = ensureCat(coverageCat, cat);
                s.total++;
                if (mapping.code_coverage.hasData) { s.has_test++; }
                else { s.missing_ids.push(uid); codeCoverageMissing.push(uid); }
            }
        }
    }

    // Build validIds from all structured annotation unique_ids
    const validIds = new Set<string>();
    for (const mapping of mappings) {
        if (typeof mapping.annotation === 'object' && mapping.annotation.unique_id) {
            validIds.add(mapping.annotation.unique_id);
        }
    }

    return {
        annotations: {
            invalid: annotationsInvalid,
            not_migrated: annotationsNotMigrated
        },
        tests: {
            missing: testsMissing.sort(),
            invalid_files: (invalidTestFiles ?? []).slice().sort(),
            by_category: buildCategoryRecord(testsCat),
        },
        custom_mappings: {
            unmapped: customMappingsUnmapped.sort()
        },
        code_coverage: {
            missing: codeCoverageMissing.sort(),
            by_category: buildCategoryRecord(coverageCat),
        },
        source_validation: generateSourceValidation(mappings),
        config_validation: generateConfigValidation(customConfig, validIds),
    };
}

import type { MappingEntry, Issues } from './types';

// ============================================================================
// ISSUES GENERATION
// ============================================================================

export function generateIssues(mappings: MappingEntry[], invalidTestFiles?: string[]): Issues {
    const annotationsInvalid: Array<{ key: string; unique_id?: string; file: string; line: number; errors: string[] }> = [];
    const annotationsNotMigrated: Array<{ key: string; file: string; line: number }> = [];
    const testsMissing: string[] = [];
    const customMappingsUnmapped: string[] = [];
    const codeCoverageMissing: string[] = [];

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
            annotationsNotMigrated.push({
                key: mapping.key,
                file: mapping.source.file,
                line: mapping.source.line
            });
        }

        const uid = typeof mapping.annotation === 'object' ? mapping.annotation.unique_id : undefined;

        if (uid) {
            if (mapping.test_coverage && !mapping.test_coverage.hasTest) {
                testsMissing.push(uid);
            }
            if (mapping.custom_mapping && !mapping.custom_mapping.hasMapping) {
                customMappingsUnmapped.push(uid);
            }
            if (mapping.code_coverage && !mapping.code_coverage.hasData) {
                codeCoverageMissing.push(uid);
            }
        }
    }

    return {
        annotations: {
            invalid: annotationsInvalid,
            not_migrated: annotationsNotMigrated
        },
        tests: {
            missing: testsMissing.sort(),
            invalid_files: (invalidTestFiles ?? []).slice().sort()
        },
        custom_mappings: {
            unmapped: customMappingsUnmapped.sort()
        },
        code_coverage: {
            missing: codeCoverageMissing.sort()
        }
    };
}

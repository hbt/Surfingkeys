import * as path from 'path';
import type { Report } from './types';
import { scanDirectory } from './scanner';
import { scanDirectoryForSettings, loadSettingsAnnotations, generateSettingsStatistics } from './settings';
import { scanTestFiles } from './test-coverage';
import { generateSummary } from './summary';
import { parseCustomConfigAST, generateCustomMappingStats } from './custom-config';
import { generateCoverageStats } from './code-coverage';
import { generateIssues } from './issues';
import { REPORT_JSON_SCHEMA } from './schema';
import Ajv from 'ajv/dist/2020';

// ============================================================================
// BUILD REPORT & INTEGRITY CHECK
// ============================================================================

export function buildReport(): Report {
    // __dirname is scripts/lib/mappings-report, so project root is ../../../
    const projectRoot = path.join(__dirname, '..', '..', '..');
    const srcDir = path.join(projectRoot, 'src');
    const mappings: any[] = [];

    // Load settings annotations
    const annotationsMap = loadSettingsAnnotations(projectRoot);

    // Scan all source files
    scanDirectory(srcDir, srcDir, mappings);

    // Scan for settings usage
    const settingsUsages: any[] = [];
    scanDirectoryForSettings(srcDir, srcDir, settingsUsages);
    const settingsStats = generateSettingsStatistics(settingsUsages, annotationsMap);

    // Sort by mode, then by key
    mappings.sort((a, b) => {
        if (a.mode !== b.mode) return a.mode.localeCompare(b.mode);
        return a.key.localeCompare(b.key);
    });

    // Scan for test files
    const testMap = scanTestFiles(projectRoot);

    // Generate summary
    const summary = generateSummary(mappings, testMap, settingsUsages);

    // Parse custom configuration
    const customConfigPath = path.join(process.env.HOME || '/root', '.surfingkeys-2026.js');
    const customConfig = parseCustomConfigAST(customConfigPath);

    // Add custom_mapping field to each mapping and get coverage counts
    const customMappingCoverage = generateCustomMappingStats(mappings, customConfig);
    summary.custom_mapping_coverage = customMappingCoverage;

    // Add code_coverage field to each mapping
    const coverageRawDir = path.join(projectRoot, 'test-artifacts/coverage-raw');
    const coverageSummary = generateCoverageStats(mappings, coverageRawDir);
    summary.code_coverage = coverageSummary;

    // Generate actionable issues (must run after all per-mapping fields are populated)
    const issues = generateIssues(mappings, customConfig, summary.tests?.invalid_test_names);

    return {
        mappings: {
            summary,
            list: mappings
        },
        settings: settingsStats,
        issues,
        ...(customConfig.mappings.length > 0 && { custom_configuration: customConfig })
    };
}

function findMissingDescriptions(node: unknown, path: string, requireDesc: boolean): string[] {
    if (typeof node !== 'object' || node === null) return [];
    const obj = node as Record<string, unknown>;
    const missing: string[] = [];

    if (requireDesc && !('description' in obj)) {
        missing.push(path);
    }

    if (typeof obj.properties === 'object' && obj.properties !== null) {
        for (const [key, val] of Object.entries(obj.properties)) {
            missing.push(...findMissingDescriptions(val, `${path}/properties/${key}`, true));
        }
    }

    if (typeof obj.$defs === 'object' && obj.$defs !== null) {
        for (const [key, val] of Object.entries(obj.$defs)) {
            missing.push(...findMissingDescriptions(val, `$defs/${key}`, true));
        }
    }

    if (typeof obj.items === 'object' && obj.items !== null) {
        missing.push(...findMissingDescriptions(obj.items, `${path}/items`, false));
    }

    return missing;
}

export function runIntegrityCheck(): void {
    const report = buildReport();

    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile(REPORT_JSON_SCHEMA);
    const valid = validate(report);
    const schemaErrors = validate.errors?.map(e => `${e.instancePath} ${e.message}`) ?? [];

    const missingDescriptions = findMissingDescriptions(REPORT_JSON_SCHEMA, '', false);

    const ok = valid && missingDescriptions.length === 0;
    const result = {
        integrity: ok ? 'ok' : 'fail',
        errors: schemaErrors,
        missing_descriptions: missingDescriptions,
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(ok ? 0 : 1);
}

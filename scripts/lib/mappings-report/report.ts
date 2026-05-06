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
    const coverageRawDir = path.join(projectRoot, 'coverage-raw');
    const coverageSummary = generateCoverageStats(mappings, coverageRawDir);
    summary.code_coverage = coverageSummary;

    // Generate actionable issues (must run after all per-mapping fields are populated)
    const issues = generateIssues(mappings, summary.tests?.invalid_test_names);

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

export function runIntegrityCheck(): void {
    const report = buildReport();

    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile(REPORT_JSON_SCHEMA);
    const valid = validate(report);

    const result = {
        integrity: valid ? 'ok' : 'fail',
        errors: validate.errors?.map(e => `${e.instancePath} ${e.message}`) ?? []
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(valid ? 0 : 1);
}

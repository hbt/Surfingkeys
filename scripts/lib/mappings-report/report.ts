import * as path from 'path';
import type { Report } from './types';
import { buildLastTestRun } from './last-test-run';
import { scanDirectory } from './scanner';
import { scanDirectoryForSettings, loadSettingsAnnotations, generateSettingsStatistics } from './settings';
import { scanTestFiles } from './test-coverage';
import { generateSummary } from './summary';
import { parseCustomConfigAST, generateCustomMappingStats } from './custom-config';
import { generateCoverageStats } from './code-coverage';
import { computeRelevantCoverage, computeDerivedContentBaseline, buildRelevantCoverageContext } from './relevant-coverage';
import { generateIssues } from './issues';
import { REPORT_JSON_SCHEMA } from './schema';
import { EXCLUDED_MAPPING_KEY_PATTERNS } from './constants';
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

    // Remove AST placeholder entries that the scanner could not statically resolve
    const excludedCount = mappings.length;
    mappings.splice(0, mappings.length, ...mappings.filter(m =>
        !EXCLUDED_MAPPING_KEY_PATTERNS.some(({ pattern }) => pattern.test(m.key))
    ));

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

    // Compute derived content baseline once (scans all cmd_* dirs) for reuse
    const derivedContentBaseline = computeDerivedContentBaseline(coverageRawDir);

    // Compute the sourcemap resolvers + background baseline once — these are expensive
    // to build (parsing multi-hundred-KB sourcemaps) and identical for every command.
    const relevantCoverageContext = buildRelevantCoverageContext(coverageRawDir, projectRoot);

    // Add relevant_coverage field to each mapping that has code coverage data
    for (const mapping of mappings) {
        const uniqueId = (mapping.annotation as any)?.unique_id;
        if (!uniqueId) continue;
        if (!mapping.code_coverage?.hasData) continue;
        const rc = computeRelevantCoverage(uniqueId, coverageRawDir, projectRoot, derivedContentBaseline, relevantCoverageContext);
        if (rc) mapping.relevant_coverage = rc;
    }

    // Generate actionable issues (must run after all per-mapping fields are populated)
    const issues = generateIssues(mappings, customConfig, summary.tests?.invalid_test_names);

    const lastTestRun = buildLastTestRun(projectRoot);

    return {
        mappings: {
            summary,
            list: mappings
        },
        settings: settingsStats,
        issues,
        ...(customConfig.mappings.length > 0 && { custom_configuration: customConfig }),
        last_test_run: lastTestRun,
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

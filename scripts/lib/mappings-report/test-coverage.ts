import * as fs from 'fs';
import * as path from 'path';
import type { MappingEntry, SettingUsage } from './types';
import { EXCLUDED_COMMANDS } from './constants';

// ============================================================================
// TEST COVERAGE TRACKING
// ============================================================================

/**
 * Scan the tests/playwright/commands directory for test files
 * Returns a map of test names (without .spec.ts extension) and their paths
 */
export function scanTestFiles(projectRoot: string): Map<string, string> {
    const testDir = path.join(projectRoot, 'tests', 'playwright', 'commands');
    const testMap = new Map<string, string>();

    if (!fs.existsSync(testDir)) {
        return testMap;
    }

    const files = fs.readdirSync(testDir);
    for (const file of files) {
        if (file.endsWith('.spec.ts')) {
            // Extract test name without .spec.ts extension
            const testName = file.substring(0, file.length - 8); // Remove '.spec.ts'
            const testPath = path.join(testDir, file);
            testMap.set(testName, testPath);
        }
    }

    return testMap;
}

/**
 * Match test files with mapping entries and generate test coverage stats
 * Supports three test naming patterns:
 * 1. Direct mapping: cmd-scroll-down -> cmd_scroll_down (exact unique_id match)
 * 2. With setting: cmd-scroll-down.scrollStepSize -> tests cmd_scroll_down with scrollStepSize setting
 * 3. Qualifier variant: cmd-hints-link-background-tab.minimal -> variant test for cmd_hints_link_background_tab
 *
 * This function mutates the mappings array by adding test_coverage field to each mapping
 */
export function generateTestCoverageStats(mappings: MappingEntry[], testMap: Map<string, string>, settingsUsages: SettingUsage[]): {
    total_with_tests: number;
    total_without_tests: number;
    total_excluded: number;
    invalid_test_names: string[];
} {
    const mappingsByUniqueId = new Map<string, MappingEntry>();

    // Build map of unique_ids
    for (const mapping of mappings) {
        if (typeof mapping.annotation === 'object' && mapping.annotation.unique_id) {
            // Handle duplicate unique_ids (they should exist)
            if (!mappingsByUniqueId.has(mapping.annotation.unique_id)) {
                mappingsByUniqueId.set(mapping.annotation.unique_id, mapping);
            }
        }
    }

    // Build set of valid setting names
    const validSettings = new Set<string>();
    for (const usage of settingsUsages) {
        validSettings.add(usage.setting);
    }

    // Build reverse map: unique_id -> test file names
    const uniqueIdToTests = new Map<string, string[]>();
    const invalidTestNames: string[] = [];

    for (const testName of testMap.keys()) {
        let isValid = false;

        // Try exact match first
        const normalizedTestName = testName.replace(/-/g, '_');
        if (mappingsByUniqueId.has(normalizedTestName)) {
            if (!uniqueIdToTests.has(normalizedTestName)) {
                uniqueIdToTests.set(normalizedTestName, []);
            }
            uniqueIdToTests.get(normalizedTestName)!.push(testName + '.spec.ts');
            isValid = true;
        } else {
            // Try pattern with last dot: cmd-scroll-down.scrollStepSize or cmd-foo.minimal
            const lastDotIndex = testName.lastIndexOf('.');
            if (lastDotIndex !== -1) {
                const commandPart = testName.substring(0, lastDotIndex);
                const normalizedCommandPart = commandPart.replace(/-/g, '_');

                if (mappingsByUniqueId.has(normalizedCommandPart)) {
                    if (!uniqueIdToTests.has(normalizedCommandPart)) {
                        uniqueIdToTests.set(normalizedCommandPart, []);
                    }
                    uniqueIdToTests.get(normalizedCommandPart)!.push(testName + '.spec.ts');
                    isValid = true;
                }
            }
        }

        if (!isValid) {
            // Test file exists but doesn't match any known pattern
            invalidTestNames.push(testName);
        }
    }

    // Build excluded commands lookup
    const excludedMap = new Map<string, string>(
        EXCLUDED_COMMANDS.map(e => [e.unique_id, e.reason])
    );

    // Add test_coverage field to each mapping
    for (const mapping of mappings) {
        if (typeof mapping.annotation === 'object' && mapping.annotation.unique_id) {
            const uid = mapping.annotation.unique_id;
            const testFiles = uniqueIdToTests.get(uid);

            if (testFiles && testFiles.length > 0) {
                mapping.test_coverage = {
                    hasTest: true,
                    testFiles: testFiles.sort()
                };
            } else {
                const excludeReason = excludedMap.get(uid);
                mapping.test_coverage = {
                    hasTest: false,
                    ...(excludeReason && { excluded: true, excludeReason })
                };
            }
        }
        // No test_coverage field for non-migrated or invalid mappings
    }

    // Count mappings with and without tests (excluded commands don't count as missing)
    const totalMigratedWithValidIds = mappingsByUniqueId.size;
    const totalWithTests = uniqueIdToTests.size;
    const totalExcluded = [...mappingsByUniqueId.keys()].filter(uid => excludedMap.has(uid)).length;
    const totalWithoutTests = totalMigratedWithValidIds - totalWithTests - totalExcluded;

    return {
        total_with_tests: totalWithTests,
        total_without_tests: totalWithoutTests,
        total_excluded: totalExcluded,
        invalid_test_names: invalidTestNames.sort()
    };
}

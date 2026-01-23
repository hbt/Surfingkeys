#!/usr/bin/env node
/**
 * Test All Action
 *
 * Discovers all CDP tests and runs them sequentially via bin/dbg test-run.
 * Aggregates all JSON output and provides summary statistics.
 *
 * Output: Concise JSON to stdout with reference to verbose aggregate report file
 * Logs: Verbose aggregate report written to /tmp/cdp-test-reports/
 *
 * Usage:
 *   bin/dbg test-all
 *   bin/dbg test-all | jq .
 *   cat $(bin/dbg test-all | jq -r .aggregateReportFile)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests/cdp');
const REPORTS_DIR = '/tmp/cdp-test-reports';

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * Discover all test files
 */
function discoverTestFiles() {
    try {
        const findCommand = `find ${TESTS_DIR} -name '*.test.ts' -type f`;
        const output = execSync(findCommand, { encoding: 'utf8' });
        return output
            .trim()
            .split('\n')
            .filter(f => f.length > 0)
            .sort();
    } catch (error) {
        throw new Error(`Failed to discover test files: ${error.message}`);
    }
}

/**
 * Run a single test via bin/dbg test-run and return parsed JSON
 */
function runTestViaDbg(testFile) {
    // Convert absolute path to relative path from PROJECT_ROOT
    let relativePath = testFile;
    if (path.isAbsolute(testFile)) {
        relativePath = path.relative(PROJECT_ROOT, testFile);
    }

    try {
        const cmd = `./bin/dbg test-run ${relativePath}`;
        const output = execSync(cmd, {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Parse JSON from output
        const json = JSON.parse(output.trim());
        return {
            success: true,
            testFile: relativePath,
            result: json
        };
    } catch (error) {
        return {
            success: false,
            testFile: relativePath,
            error: error.message
        };
    }
}

/**
 * Generate aggregate statistics
 */
function generateAggregateStats(testResults) {
    const stats = {
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0,
        totalSkipped: 0,
        totalSlow: 0,
        totalAssertions: 0,
        totalDuration: 0,
        successCount: 0,
        failureCount: 0
    };

    testResults.forEach(tr => {
        if (tr.success) {
            stats.successCount++;
            const result = tr.result;
            stats.totalTests += result.tests || 0;
            stats.totalPassed += result.passed || 0;
            stats.totalFailed += result.failed || 0;
            stats.totalSkipped += result.skipped || 0;
            stats.totalSlow += result.slow || 0;
            stats.totalAssertions += result.assertions || 0;
            stats.totalDuration += result.duration || 0;
        } else {
            stats.failureCount++;
        }
    });

    return stats;
}

/**
 * Create concise summary for stdout
 */
function createConciseSummary(testResults, stats, aggregateReportFile, aggregateDiagnosticsFile) {
    const overallSuccess = stats.failureCount === 0 && stats.totalFailed === 0;

    return {
        type: 'test-all-summary',
        success: overallSuccess,
        summary: {
            totalTestFiles: testResults.length,
            successfulFiles: stats.successCount,
            failedFiles: stats.failureCount,
            totalTests: stats.totalTests,
            totalPassed: stats.totalPassed,
            totalFailed: stats.totalFailed,
            totalSkipped: stats.totalSkipped,
            totalSlow: stats.totalSlow,
            totalAssertions: stats.totalAssertions,
            totalDuration: stats.totalDuration
        },
        testSummaries: testResults.map(tr => ({
            file: tr.testFile,
            success: tr.success,
            ...(tr.success ? {
                tests: tr.result.tests,
                passed: tr.result.passed,
                failed: tr.result.failed,
                skipped: tr.result.skipped,
                slow: tr.result.slow,
                duration: tr.result.duration,
                reportFile: tr.result.reportFile,
                diagnosticsFile: tr.result.diagnosticsFile,
                ...(tr.result.headlessLogFile ? { headlessLogFile: tr.result.headlessLogFile } : {})
            } : {
                error: tr.error
            })
        })),
        aggregateReportFile,
        aggregateDiagnosticsFile
    };
}

/**
 * Create verbose aggregate report
 */
function createAggregateReport(testResults, stats, timestamp) {
    return {
        type: 'test-all-report',
        version: '1.0',
        timestamp: Math.floor(new Date().getTime() / 1000),
        isoTimestamp: new Date().toISOString(),
        summary: {
            totalTestFiles: testResults.length,
            successfulFiles: stats.successCount,
            failedFiles: stats.failureCount,
            totalTests: stats.totalTests,
            totalPassed: stats.totalPassed,
            totalFailed: stats.totalFailed,
            totalSkipped: stats.totalSkipped,
            totalSlow: stats.totalSlow,
            totalAssertions: stats.totalAssertions,
            totalDuration: stats.totalDuration
        },
        details: {
            overallSuccess: stats.failureCount === 0 && stats.totalFailed === 0,
            executionTime: new Date().toISOString()
        },
        testResults: testResults.map(tr => ({
            file: tr.testFile,
            success: tr.success,
            result: tr.result,
            error: tr.error || null
        })),
        timestamp
    };
}

/**
 * Main action runner
 */
async function run(args) {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Discover all test files
        const testFiles = discoverTestFiles();

        if (testFiles.length === 0) {
            console.log(JSON.stringify({
                success: false,
                error: 'No test files found in tests/cdp/',
                aggregateReportFile: null
            }));
            process.exit(1);
        }

        // Run each test and collect results
        const testResults = [];
        for (const testFile of testFiles) {
            const result = runTestViaDbg(testFile);
            testResults.push(result);
        }

        // Generate statistics
        const stats = generateAggregateStats(testResults);

        // Create file paths
        const aggregateReportFile = path.join(REPORTS_DIR, `test-all-report-${timestamp}.json`);
        const aggregateDiagnosticsFile = path.join(REPORTS_DIR, `test-all-diagnostics-${timestamp}.json`);

        // Write verbose aggregate report
        const aggregateReport = createAggregateReport(testResults, stats, timestamp);
        fs.writeFileSync(aggregateReportFile, JSON.stringify(aggregateReport, null, 2));

        // Write diagnostics (same as report for now, can be extended)
        fs.writeFileSync(aggregateDiagnosticsFile, JSON.stringify({
            type: 'test-all-diagnostics',
            version: '1.0',
            timestamp: Math.floor(new Date().getTime() / 1000),
            summary: stats,
            testFiles: testFiles.length,
            reportFile: aggregateReportFile
        }, null, 2));

        // Create concise summary for stdout
        const conciseSummary = createConciseSummary(testResults, stats, aggregateReportFile, aggregateDiagnosticsFile);

        // Output concise JSON to stdout
        console.log(JSON.stringify(conciseSummary));

        // Exit code: 0 if all tests passed, 1 if any failures
        const exitCode = stats.failureCount === 0 && stats.totalFailed === 0 ? 0 : 1;
        process.exit(exitCode);

    } catch (error) {
        console.log(JSON.stringify({
            success: false,
            error: error.message,
            aggregateReportFile: null
        }));
        process.exit(1);
    }
}

module.exports = { run };

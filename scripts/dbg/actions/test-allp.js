#!/usr/bin/env node
/**
 * Test All Parallel Action
 *
 * Discovers all CDP tests and runs them in parallel via bin/dbg test-run.
 * Respects configurable concurrency limit (default: 12 concurrent tests).
 * Aggregates all JSON output and provides summary statistics.
 *
 * Output: Concise JSON to stdout with reference to verbose aggregate report file
 * Logs: Verbose aggregate report written to /tmp/cdp-test-reports/
 *
 * Usage:
 *   bin/dbg test-allp                              (default: 12 concurrent)
 *   bin/dbg test-allp --max-parallel 8             (limit to 8 concurrent)
 *   bin/dbg test-allp --concurrency 16             (limit to 16 concurrent)
 *   bin/dbg test-allp | jq .
 *   cat $(bin/dbg test-allp | jq -r .aggregateReportFile)
 */

const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests/cdp');
const REPORTS_DIR = '/tmp/cdp-test-reports';

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * Parse command line arguments for concurrency limit
 */
function parseConcurrencyLimit(args) {
    let limit = 12; // default

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--max-parallel' && args[i + 1]) {
            limit = parseInt(args[i + 1], 10);
            if (isNaN(limit) || limit < 1) {
                limit = 12;
            }
            break;
        }
        if (args[i] === '--concurrency' && args[i + 1]) {
            limit = parseInt(args[i + 1], 10);
            if (isNaN(limit) || limit < 1) {
                limit = 12;
            }
            break;
        }
    }

    return Math.max(1, limit); // ensure at least 1
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
 * Returns Promise that resolves with test result
 * Uses async exec() instead of sync execSync() for true parallelization
 */
function runTestViaDbg(testFile) {
    // Convert absolute path to relative path from PROJECT_ROOT
    let relativePath = testFile;
    if (path.isAbsolute(testFile)) {
        relativePath = path.relative(PROJECT_ROOT, testFile);
    }

    return new Promise((resolve) => {
        const cmd = `./bin/dbg test-run ${relativePath}`;

        exec(cmd, {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large output
        }, (error, stdout, stderr) => {
            try {
                // Try stdout first, then stderr
                const output = stdout || stderr;
                if (!output) {
                    throw new Error('No output from test command');
                }

                // Parse JSON from output
                const json = JSON.parse(output.trim());
                resolve({
                    success: true,
                    testFile: relativePath,
                    result: json
                });
            } catch (parseError) {
                resolve({
                    success: false,
                    testFile: relativePath,
                    error: parseError.message
                });
            }
        });
    });
}

/**
 * Run tests in parallel with concurrency limit
 * Returns array of test results in sorted order (by test file name)
 *
 * Implementation: Uses a work queue pattern where we maintain a pool of
 * running tasks. When one completes, we launch the next from the queue.
 * This ensures we always have up to N tasks running in parallel.
 */
async function runTestsInParallel(testFiles, concurrencyLimit) {
    const results = [];
    const queue = [...testFiles];
    const running = [];

    /**
     * Launch next test from queue, maintain concurrency limit
     */
    async function launchNext() {
        if (queue.length === 0) return;

        const testFile = queue.shift();
        const promise = runTestViaDbg(testFile).then(result => {
            results.push(result);
            // Remove from running pool
            const idx = running.indexOf(promise);
            if (idx > -1) {
                running.splice(idx, 1);
            }
            // Launch next test from queue
            return launchNext();
        });

        running.push(promise);
    }

    // Launch initial batch of tests (up to concurrencyLimit)
    for (let i = 0; i < Math.min(concurrencyLimit, testFiles.length); i++) {
        await launchNext();
    }

    // Wait for all remaining tests to complete
    await Promise.all(running);

    // Sort results by test file name for deterministic output
    results.sort((a, b) => a.testFile.localeCompare(b.testFile));

    return results;
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
            const result = tr.result;
            stats.totalTests += result.tests || 0;
            stats.totalPassed += result.passed || 0;
            stats.totalFailed += result.failed || 0;
            stats.totalSkipped += result.skipped || 0;
            stats.totalSlow += result.slow || 0;
            stats.totalAssertions += result.assertions || 0;
            stats.totalDuration += result.duration || 0;

            // Count as successful only if all tests passed
            if ((result.failed || 0) === 0) {
                stats.successCount++;
            } else {
                stats.failureCount++;
            }
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
        type: 'test-allp-summary',
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
            success: tr.success && (tr.result?.failed === 0),
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
        type: 'test-allp-report',
        version: '1.0',
        timestamp: Math.floor(new Date().getTime() / 1000),
        isoTimestamp: new Date().toISOString(),
        executionMode: 'parallel',
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

        // Parse concurrency limit from arguments
        const concurrencyLimit = parseConcurrencyLimit(args);

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

        // Run tests in parallel
        const testResults = await runTestsInParallel(testFiles, concurrencyLimit);

        // Generate statistics
        const stats = generateAggregateStats(testResults);

        // Create file paths
        const aggregateReportFile = path.join(REPORTS_DIR, `test-allp-report-${timestamp}.json`);
        const aggregateDiagnosticsFile = path.join(REPORTS_DIR, `test-allp-diagnostics-${timestamp}.json`);

        // Write verbose aggregate report
        const aggregateReport = createAggregateReport(testResults, stats, timestamp);
        fs.writeFileSync(aggregateReportFile, JSON.stringify(aggregateReport, null, 2));

        // Write diagnostics (same as report for now, can be extended)
        fs.writeFileSync(aggregateDiagnosticsFile, JSON.stringify({
            type: 'test-allp-diagnostics',
            version: '1.0',
            timestamp: Math.floor(new Date().getTime() / 1000),
            summary: stats,
            testFiles: testFiles.length,
            concurrencyLimit: concurrencyLimit,
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

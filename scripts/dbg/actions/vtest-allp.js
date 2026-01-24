#!/usr/bin/env node
/**
 * Visual Test All Parallel Action
 *
 * Runs all CDP tests via bin/dbg test-allp with configurable parallelism.
 * Aggregates the JSON results into a visual markdown report.
 *
 * Accepts --max-parallel and --concurrency arguments to control test concurrency.
 *
 * Output: Markdown report to stdout with reference to full report file
 * Logs: Verbose aggregate report written to /tmp/cdp-test-reports/
 *
 * Usage:
 *   bin/dbg vtest-allp
 *   bin/dbg vtest-allp --max-parallel 8
 *   bin/dbg vtest-allp | less
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { formatMarkdownTable } = require('../lib/markdown-utils');
const {
    ensureReportsDir,
    generateTimestamp,
    PROJECT_ROOT,
    REPORTS_DIR
} = require('../lib/test-utils');

// Create log file
const timestamp = generateTimestamp();
const LOG_FILE = `/tmp/dbg-vtest-allp-${timestamp}.log`;
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

/**
 * Log to file only
 */
function log(message) {
    logStream.write(`${new Date().toISOString()} ${message}\n`);
}

/**
 * Run test-allp and get JSON results
 */
function runTestAllParallel(args) {
    return new Promise((resolve) => {
        log('Running: bin/dbg test-allp');

        try {
            // test-allp may exit with non-zero code if tests fail, but still outputs JSON
            // So we use spawnSync to capture output without throwing
            const cmdArgs = ['test-allp'];

            // Pass through any command line arguments (e.g., --max-parallel, --concurrency)
            if (args && args.length > 0) {
                cmdArgs.push(...args);
                log(`Command args: ${args.join(' ')}`);
            }

            const proc = spawnSync('./bin/dbg', cmdArgs, {
                cwd: PROJECT_ROOT,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe']
            });

            const output = proc.stdout || '';

            if (!output || output.trim().length === 0) {
                log(`✗ No output from test-allp`);
                resolve({
                    success: false,
                    error: 'No output from test-allp'
                });
                return;
            }

            try {
                const json = JSON.parse(output.trim());
                log(`✓ Successfully parsed test-allp JSON output`);
                resolve({
                    success: true,
                    json: json
                });
            } catch (err) {
                log(`✗ Failed to parse test-allp output as JSON: ${err.message}`);
                resolve({
                    success: false,
                    error: `Failed to parse JSON: ${err.message}`,
                    rawOutput: output.substring(0, 1000)
                });
            }
        } catch (error) {
            log(`✗ Failed to run test-allp: ${error.message}`);
            resolve({
                success: false,
                error: error.message
            });
        }
    });
}

/**
 * Generate Test All Summary markdown from test-allp JSON
 */
function generateTestAllSummary(testAllJson) {
    let md = '# Test All Summary\n\n';

    const summary = testAllJson.summary || {};
    const testSummaries = testAllJson.testSummaries || [];

    // Build Test Files table
    md += '## Test Files\n\n';
    const testFilesRows = [
        ['File', 'Status', 'Tests', 'Passed', 'Failed', 'Duration'],
        ['---', '---', '---', '---', '---', '---']
    ];

    testSummaries.forEach(ts => {
        const displayPath = ts.file.replace('tests/cdp/', '');
        const status = ts.success ? '✅' : '❌';
        testFilesRows.push([
            displayPath,
            status,
            String(ts.tests || 0),
            String(ts.passed || 0),
            String(ts.failed || 0),
            `${ts.duration || 0}ms`
        ]);
    });

    md += formatMarkdownTable(testFilesRows);
    md += '\n\n';

    // Build Overview table
    md += '## Overview\n\n';
    const overviewRows = [
        ['Metric', 'Value'],
        ['---', '---'],
        ['Test Files', String(summary.totalTestFiles || 0)],
        ['Successful', String(summary.successfulFiles || 0)],
        ['Failed', String(summary.failedFiles || 0)],
        ['Total Tests', String(summary.totalTests || 0)],
        ['Skipped', String(summary.totalSkipped || 0)],
        ['Slow Tests', String(summary.totalSlow || 0)],
        ['Assertions', String(summary.totalAssertions || 0)],
        ['Duration', `${summary.totalDuration || 0}ms`]
    ];

    md += formatMarkdownTable(overviewRows);
    md += '\n\n';

    // Add status emoji
    const statusEmoji = testAllJson.success ? '✅ PASSED' : '❌ FAILED';
    md += statusEmoji + '\n\n';

    // Add report reference
    if (testAllJson.aggregateReportFile) {
        md += `- Report: ${testAllJson.aggregateReportFile}\n`;
    }

    return md;
}

/**
 * Main action runner
 */
async function run(args) {
    ensureReportsDir();
    log('=== Visual Test All Parallel Action (Using test-allp) ===');

    try {
        // Run test-allp to get JSON results
        const testAllResult = await runTestAllParallel(args);

        if (!testAllResult.success) {
            log(`ERROR: ${testAllResult.error}`);
            logStream.end();

            console.error(`Error: ${testAllResult.error}`);
            if (testAllResult.rawOutput) {
                console.error(`Raw output: ${testAllResult.rawOutput}`);
            }
            process.exit(1);
        }

        const testAllJson = testAllResult.json;
        const testSummaries = testAllJson.testSummaries || [];

        log(`Test-allp success: ${testAllJson.success}`);
        log(`Processing ${testSummaries.length} test files`);

        // Generate Test All Summary markdown
        const summaryMarkdown = generateTestAllSummary(testAllJson);

        // Write report to file
        const reportFile = path.join(REPORTS_DIR, `vtest-allp-report-${timestamp}.md`);
        fs.writeFileSync(reportFile, summaryMarkdown);
        log(`✓ Wrote report to: ${reportFile}`);

        // Determine exit code based on overall success
        const allPassed = testAllJson.success;
        log(`Overall success: ${allPassed}, exiting with code: ${allPassed ? 0 : 1}`);

        // Output to stdout
        console.log(summaryMarkdown);

        logStream.end();

        // Exit with appropriate code
        setTimeout(() => {
            process.exit(allPassed ? 0 : 1);
        }, 100);

    } catch (error) {
        log(`FATAL ERROR: ${error.message}`);
        log(error.stack);
        logStream.end();

        console.error(`Fatal Error: ${error.message}`);
        process.exit(1);
    }
}

module.exports = { run };

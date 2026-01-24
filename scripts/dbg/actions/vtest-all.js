#!/usr/bin/env node
/**
 * Visual Test All Action
 *
 * Runs all CDP tests via bin/dbg test-all (single execution).
 * Aggregates the JSON results into a visual markdown report.
 *
 * This reuses the test execution from test-all, avoiding duplicate runs.
 *
 * Output: Markdown report to stdout with reference to full report file
 * Logs: Verbose aggregate report written to /tmp/cdp-test-reports/
 *
 * Usage:
 *   bin/dbg vtest-all
 *   bin/dbg vtest-all | less
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
const LOG_FILE = `/tmp/dbg-vtest-all-${timestamp}.log`;
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

/**
 * Log to file only
 */
function log(message) {
    logStream.write(`${new Date().toISOString()} ${message}\n`);
}

/**
 * Run test-all and get JSON results
 */
function runTestAll() {
    return new Promise((resolve) => {
        log('Running: bin/dbg test-all');

        try {
            // test-all may exit with non-zero code if tests fail, but still outputs JSON
            // So we use spawnSync to capture output without throwing
            const proc = spawnSync('./bin/dbg', ['test-all'], {
                cwd: PROJECT_ROOT,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe']
            });

            const output = proc.stdout || '';

            if (!output || output.trim().length === 0) {
                log(`✗ No output from test-all`);
                resolve({
                    success: false,
                    error: 'No output from test-all'
                });
                return;
            }

            try {
                const json = JSON.parse(output.trim());
                log(`✓ Successfully parsed test-all JSON output`);
                resolve({
                    success: true,
                    json: json
                });
            } catch (err) {
                log(`✗ Failed to parse test-all output as JSON: ${err.message}`);
                resolve({
                    success: false,
                    error: `Failed to parse JSON: ${err.message}`,
                    rawOutput: output.substring(0, 1000)
                });
            }
        } catch (error) {
            log(`✗ Failed to run test-all: ${error.message}`);
            resolve({
                success: false,
                error: error.message
            });
        }
    });
}

/**
 * Generate Test All Summary markdown from test-all JSON
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
    log('=== Visual Test All Action (Reusing test-all) ===');

    try {
        // Run test-all to get JSON results
        const testAllResult = await runTestAll();

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

        log(`Test-all success: ${testAllJson.success}`);
        log(`Processing ${testSummaries.length} test files`);

        // Generate Test All Summary markdown
        const summaryMarkdown = generateTestAllSummary(testAllJson);

        // Write report to file
        const reportFile = path.join(REPORTS_DIR, `vtest-all-report-${timestamp}.md`);
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

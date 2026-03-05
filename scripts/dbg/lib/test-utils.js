/**
 * Shared test utilities for bin/dbg test runners
 *
 * Provides common functions for test discovery, execution, and aggregation.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { formatMarkdownTable } = require('./markdown-utils');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests/cdp');
const REPORTS_DIR = '/tmp/cdp-test-reports';

/**
 * Ensure reports directory exists
 */
function ensureReportsDir() {
    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
}

/**
 * Discover all test files in tests/cdp
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
 * Generate aggregate statistics from test results
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
 * Generate ISO timestamp safe for use in file names
 */
function generateTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Format cell value for markdown tables
 */
function formatCellValue(value, format = 'text') {
    if (value === null || value === undefined) return '';

    switch (format) {
        case 'code':
            return `\`${String(value).replace(/\|/g, '\\|')}\``;
        case 'boolean':
            return value ? '✅' : '❌';
        case 'number':
            return String(value);
        case 'duration':
            return `${value}ms`;
        case 'status':
            return value === 'passed' ? '✅' : value === 'failed' ? '❌' : '⊘';
        default:
            return String(value).replace(/\|/g, '\\|');
    }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => {
        return current?.[prop];
    }, obj);
}

/**
 * Build markdown table from data and column definitions
 */
function buildTable(data, columnDefs) {
    const rows = [];

    const headers = columnDefs.map(col => col.header);
    rows.push(headers);

    const separators = columnDefs.map(col => '---');
    rows.push(separators);

    data.forEach(item => {
        const row = columnDefs.map(col => {
            const value = typeof col.accessor === 'function'
                ? col.accessor(item)
                : getNestedValue(item, col.accessor);
            return formatCellValue(value, col.format);
        });
        rows.push(row);
    });

    return formatMarkdownTable(rows);
}

/**
 * Generate Markdown report from JSON test report
 */
function generateMarkdownReport(jsonReport) {
    let md = '## Test Report\n\n';

    // Handle both Unix timestamps (seconds) and ISO strings
    let timestampStr;
    if (typeof jsonReport.timestamp === 'number') {
        timestampStr = new Date(jsonReport.timestamp * 1000).toISOString();
    } else {
        timestampStr = jsonReport.timestamp;
    }
    md += `**Generated**: ${timestampStr}\n\n`;

    // Summary section
    md += '### Summary\n\n';
    const summary = jsonReport.summary;
    md += `- **Total Tests**: ${summary.total}\n`;
    md += `- **Passed**: ${summary.passed} ✅\n`;
    md += `- **Failed**: ${summary.failed} ❌\n`;
    md += `- **Skipped**: ${summary.skipped}\n`;
    md += `- **Slow**: ${summary.slow}\n`;
    md += `- **Assertions**: ${summary.assertions.passing}\n`;
    md += `- **Duration**: ${jsonReport.duration.total}ms\n`;
    md += `- **Status**: ${jsonReport.success ? '✅ PASSED' : '❌ FAILED'}\n\n`;

    // Test cases table (if only one suite)
    if (jsonReport.suites && jsonReport.suites.length === 1) {
        const suite = jsonReport.suites[0];
        md += '### Test Cases\n\n';
        const testColumnDefs = [
            { header: 'Test', accessor: 'title', format: 'text' },
            { header: 'Status', accessor: 'status', format: 'status' },
            { header: 'Assertions', accessor: 'assertions.passing', format: 'number' },
            { header: 'Duration', accessor: 'duration', format: 'duration' },
            { header: 'Retries', accessor: 'invocations', format: 'number' },
        ];
        md += buildTable(suite.tests, testColumnDefs);
        md += '\n';
    } else if (jsonReport.suites && jsonReport.suites.length > 1) {
        // Show tests organized by suite
        md += '### Test Cases by Suite\n\n';
        jsonReport.suites.forEach(suite => {
            md += `#### ${suite.file}\n\n`;
            const testColumnDefs = [
                { header: 'Test', accessor: 'title', format: 'text' },
                { header: 'Status', accessor: 'status', format: 'status' },
                { header: 'Assertions', accessor: 'assertions.passing', format: 'number' },
                { header: 'Duration', accessor: 'duration', format: 'duration' },
            ];
            md += buildTable(suite.tests, testColumnDefs);
            md += '\n';
        });
    }

    return md;
}

/**
 * Retry failed tests with flaky detection
 *
 * @param {Array} testResults - Initial test results array
 * @param {Function} runFn - (testFile) => Promise<{success, testFile, result?, error?}>
 * @param {number} maxRetries - Number of retry rounds (default: 2 → up to 3 total attempts)
 * @returns {Array} Updated test results with retry/flaky metadata
 */
async function retryFailedTests(testResults, runFn, maxRetries = 2) {
    if (maxRetries === 0) return testResults;

    // Build mutable map for results
    const resultMap = new Map(testResults.map(r => [r.testFile, { ...r, retries: [] }]));

    // Track which tests still need retrying
    let stillFailing = testResults.filter(
        tr => !tr.success || (tr.result?.failed > 0)
    );

    for (let attempt = 2; attempt <= maxRetries + 1 && stillFailing.length > 0; attempt++) {
        process.stderr.write(`[retry ${attempt - 1}/${maxRetries}] ${stillFailing.length} tests...\n`);

        const retryResults = await Promise.all(stillFailing.map(ft => runFn(ft.testFile)));

        for (const retryResult of retryResults) {
            const entry = resultMap.get(retryResult.testFile);
            entry.retries.push({
                attempt,
                success: retryResult.success,
                failed: retryResult.result?.failed || 0
            });

            if (retryResult.success && !retryResult.result?.failed) {
                // Passed on retry — upgrade + mark flaky
                entry.success = true;
                entry.result = retryResult.result;
                entry.flaky = true;
            }
        }

        // Only retry tests that are still failing after this round
        stillFailing = retryResults
            .filter(r => !r.success || (r.result?.failed > 0))
            .map(r => resultMap.get(r.testFile));
    }

    // Re-attach initial attempt info into retries array (prepend attempt 1)
    return testResults.map(orig => {
        const entry = resultMap.get(orig.testFile);
        if (entry.retries.length === 0) return orig; // never retried

        return {
            ...entry,
            retries: [
                { attempt: 1, success: orig.success, failed: orig.result?.failed || 0 },
                ...entry.retries
            ]
        };
    });
}

module.exports = {
    ensureReportsDir,
    discoverTestFiles,
    generateAggregateStats,
    generateTimestamp,
    formatCellValue,
    getNestedValue,
    buildTable,
    generateMarkdownReport,
    retryFailedTests,
    PROJECT_ROOT,
    TESTS_DIR,
    REPORTS_DIR
};

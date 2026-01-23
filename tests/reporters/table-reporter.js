/**
 * Table Reporter - Consumes JSON report and outputs human-readable Markdown tables
 *
 * This reporter builds on top of json-reporter.js to provide human-readable output.
 * It reads the JSON report and transforms it into formatted Markdown tables.
 *
 * Easy to iterate: Modify columnDefinitions to add/remove columns
 *
 * Usage:
 *   Jest automatically runs this when it detects json-reporter has completed
 *   Or manually: node table-reporter.js <path-to-json-report>
 */

const fs = require('fs');
const path = require('path');
const { formatMarkdownTable } = require('../../scripts/dbg/lib/markdown-utils');

/**
 * Escape special characters in cell values
 */
function escapeCell(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return str
        .replace(/\|/g, '\\|')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Format cell value based on type
 */
function formatCellValue(value, format = 'text') {
    if (value === null || value === undefined) return '';

    switch (format) {
        case 'code':
            return `\`${escapeCell(value)}\``;
        case 'boolean':
            return value ? '✅' : '❌';
        case 'number':
            return String(value);
        case 'duration':
            return `${value}ms`;
        case 'status':
            return value === 'passed' ? '✅' : value === 'failed' ? '❌' : '⊘';
        default:
            return escapeCell(value);
    }
}

/**
 * Safely access nested properties using dot notation
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => {
        return current?.[prop];
    }, obj);
}

/**
 * Build a table from data using column definitions
 */
function buildTable(data, columnDefs) {
    const rows = [];

    // Add header row
    const headers = columnDefs.map(col => col.header);
    rows.push(headers);

    // Add separator row
    const separators = columnDefs.map(col => '---');
    rows.push(separators);

    // Add data rows
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
 * Generate markdown report from JSON report
 */
function generateMarkdownReport(jsonReport) {
    let md = '# Test Report - Markdown View\n\n';
    md += `**Generated**: ${new Date().toISOString()}\n\n`;

    // Summary section
    md += '## Summary\n\n';
    const summary = jsonReport.summary;
    md += `- **Total Tests**: ${summary.total}\n`;
    md += `- **Passed**: ${summary.passed}\n`;
    md += `- **Failed**: ${summary.failed}\n`;
    md += `- **Skipped**: ${summary.skipped}\n`;
    md += `- **Slow**: ${summary.slow}\n`;
    md += `- **Assertions**: ${summary.assertions.passing}\n`;
    md += `- **Duration**: ${jsonReport.duration.total}ms\n`;
    md += `- **Status**: ${jsonReport.success ? '✅ PASSED' : '❌ FAILED'}\n\n`;

    // Resource issues
    if (jsonReport.issues && (jsonReport.issues.resourceLeaks || jsonReport.issues.wasInterrupted || jsonReport.issues.openHandlesTotal > 0)) {
        md += '## Issues\n\n';
        md += `- **Resource Leaks**: ${jsonReport.issues.resourceLeaks ? '⚠️ Yes' : '✅ No'}\n`;
        md += `- **Was Interrupted**: ${jsonReport.issues.wasInterrupted ? '⚠️ Yes' : '✅ No'}\n`;
        md += `- **Open Handles**: ${jsonReport.issues.openHandlesTotal}\n\n`;
    }

    // Coverage section
    if (jsonReport.coverage && jsonReport.coverage.enabled) {
        md += '## Coverage\n\n';
        const cov = jsonReport.coverage.summary;
        md += `- **Functions**: ${cov.functions}%\n`;
        md += `- **Statements**: ${cov.statements}%\n`;
        md += `- **Bytes**: ${cov.bytes}%\n\n`;
    }

    // Test suites table
    md += '## Test Suites\n\n';
    const suiteColumnDefs = [
        { header: 'Suite', accessor: 'file', format: 'code' },
        { header: 'Status', accessor: 'status', format: 'status' },
        { header: 'Tests', accessor: 'numTests', format: 'number' },
        { header: 'Passed', accessor: 'numPassed', format: 'number' },
        { header: 'Failed', accessor: 'numFailed', format: 'number' },
        { header: 'Duration', accessor: 'duration', format: 'duration' },
        { header: 'Slow', accessor: 'perfStats.slow', format: 'boolean' },
    ];
    md += buildTable(jsonReport.suites, suiteColumnDefs);
    md += '\n';

    // Individual tests table (if only one suite, show tests)
    if (jsonReport.suites.length === 1) {
        const suite = jsonReport.suites[0];
        md += '## Test Cases\n\n';
        const testColumnDefs = [
            { header: 'Test', accessor: 'title', format: 'text' },
            { header: 'Status', accessor: 'status', format: 'status' },
            { header: 'Assertions', accessor: 'assertions.passing', format: 'number' },
            { header: 'Duration', accessor: 'duration', format: 'duration' },
            { header: 'Retries', accessor: 'invocations', format: 'number' },
        ];
        md += buildTable(suite.tests, testColumnDefs);
        md += '\n';
    } else if (jsonReport.suites.length > 1) {
        // Show tests organized by suite
        md += '## Test Cases by Suite\n\n';
        jsonReport.suites.forEach(suite => {
            md += `### ${suite.file}\n\n`;
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
 * Output report
 */
function outputReport(markdown, reportDir, timestamp) {
    // Output to console
    console.log('\n=== TEST REPORT (TABLE FORMAT) ===\n');
    console.log(markdown);

    // Save to file
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportFile = path.join(reportDir, `test-report-table-${timestamp}.md`);
    fs.writeFileSync(reportFile, markdown, 'utf8');

    console.log(`\n✓ Table report saved to: ${reportFile}\n`);
}

/**
 * Find and read the most recent JSON report
 */
function findLatestJsonReport(reportDir) {
    if (!fs.existsSync(reportDir)) {
        throw new Error(`Report directory not found: ${reportDir}`);
    }

    const files = fs.readdirSync(reportDir)
        .filter(f => f.startsWith('test-report-') && f.endsWith('.json') && !f.includes('diagnostics'))
        .map(f => ({
            name: f,
            path: path.join(reportDir, f),
            time: fs.statSync(path.join(reportDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
        throw new Error(`No JSON reports found in ${reportDir}`);
    }

    return files[0].path;
}

/**
 * Main function
 */
function main() {
    const reportDir = '/tmp/cdp-test-reports';

    try {
        // Find latest JSON report
        const jsonReportPath = findLatestJsonReport(reportDir);
        console.log(`\nReading JSON report: ${jsonReportPath}`);

        // Load JSON report
        const jsonReport = JSON.parse(fs.readFileSync(jsonReportPath, 'utf8'));

        // Generate markdown
        const markdown = generateMarkdownReport(jsonReport);

        // Get timestamp from original report
        const timestamp = new Date(jsonReport.timestamp).toISOString().replace(/[:.]/g, '-');

        // Output
        outputReport(markdown, reportDir, timestamp);
    } catch (err) {
        console.error('❌ Error generating table report:', err.message);
        process.exit(1);
    }
}

// Export for use as module
module.exports = {
    generateMarkdownReport,
    formatMarkdownTable,
    buildTable,
    findLatestJsonReport
};

// Run if called directly
if (require.main === module) {
    main();
}

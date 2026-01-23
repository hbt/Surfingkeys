/**
 * Table Reporter - Standalone Jest Reporter
 *
 * Transforms JSON test reports into human-readable Markdown tables.
 * Reads the JSON output from json-reporter and generates Markdown output.
 *
 * The Table Reporter is the consumer of the JSON reporter's output.
 * JSON is the single source of truth; this reporter displays the data.
 *
 * Usage:
 *   npm run test:cdp:headless -- --reporter=table tests/file.test.ts
 *
 * Note:
 *   - Run JSON reporter first (or alongside) to generate JSON output
 *   - Table Reporter finds and reads the latest JSON report
 *   - Outputs formatted Markdown tables only (no JSON)
 */

const fs = require('fs');
const path = require('path');

// Table formatting borrowed from generate-command-docs.js
function formatMarkdownTable(rows) {
    if (rows.length === 0) return '';

    const numCols = Math.max(...rows.map(r => r.length));
    const colWidths = new Array(numCols).fill(0);

    rows.forEach(row => {
        row.forEach((cell, i) => {
            colWidths[i] = Math.max(colWidths[i], cell.length);
        });
    });

    const formattedLines = rows.map((row) => {
        const formattedCells = [];

        for (let i = 0; i < numCols; i++) {
            const cell = row[i] || '';
            const cellWidth = cell.length;
            const padding = colWidths[i] - cellWidth;

            let formattedCell;
            if (cell.match(/^-+$/)) {
                formattedCell = '-'.repeat(colWidths[i]);
            } else {
                formattedCell = cell + ' '.repeat(padding);
            }

            formattedCells.push(formattedCell);
        }

        return '| ' + formattedCells.join(' | ') + ' |';
    });

    return formattedLines.join('\n') + '\n';
}

function escapeCell(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return str
        .replace(/\|/g, '\\|')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

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

function getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => {
        return current?.[prop];
    }, obj);
}

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
 * Find the latest JSON report file
 */
function findLatestJsonReport(reportDir) {
    if (!fs.existsSync(reportDir)) {
        return null;
    }

    const files = fs.readdirSync(reportDir)
        .filter(f => f.startsWith('test-report-') && f.endsWith('.json') && !f.includes('diagnostics'))
        .map(f => ({
            name: f,
            path: path.join(reportDir, f),
            time: fs.statSync(path.join(reportDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

    return files.length > 0 ? files[0].path : null;
}

/**
 * Generate Markdown report from JSON report
 */
function generateMarkdownReport(jsonReport) {
    let md = '# Test Report\n\n';
    // Handle both Unix timestamps (seconds) and ISO strings
    let timestampStr;
    if (typeof jsonReport.timestamp === 'number') {
        timestampStr = new Date(jsonReport.timestamp * 1000).toISOString();
    } else {
        timestampStr = jsonReport.timestamp;
    }
    md += `**Generated**: ${timestampStr}\n\n`;

    // Summary section
    md += '## Summary\n\n';
    const summary = jsonReport.summary;
    md += `- **Total Tests**: ${summary.total}\n`;
    md += `- **Passed**: ${summary.passed} ✅\n`;
    md += `- **Failed**: ${summary.failed} ❌\n`;
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

class TableReporter {
    constructor(globalConfig, options = {}) {
        this.globalConfig = globalConfig;
        this.options = options;
    }

    /**
     * Called after all tests have run
     * Find and read the JSON report, then output Markdown
     */
    onRunComplete(contexts, results) {
        const reportDir = '/tmp/cdp-test-reports';
        const jsonReportPath = findLatestJsonReport(reportDir);

        if (!jsonReportPath) {
            console.error('\n❌ Error: No JSON report found in', reportDir);
            console.error('   Make sure to run JSON reporter first: --reporters=json-reporter\n');
            return;
        }

        try {
            // Read the JSON report
            const jsonReport = JSON.parse(fs.readFileSync(jsonReportPath, 'utf8'));

            // Generate Markdown
            const markdown = generateMarkdownReport(jsonReport);

            // Output to console
            console.log('\n' + markdown);

            // Also save to file
            // Handle both Unix timestamps (seconds) and ISO strings
            let ts;
            if (typeof jsonReport.timestamp === 'number') {
                // Unix timestamp in seconds - convert to milliseconds
                ts = new Date(jsonReport.timestamp * 1000).toISOString();
            } else {
                // ISO string
                ts = jsonReport.timestamp;
            }
            const timestamp = ts.replace(/[:.]/g, '-');
            const reportFile = path.join(reportDir, `test-report-table-${timestamp}.md`);
            fs.writeFileSync(reportFile, markdown, 'utf8');

            console.error(`\n✓ Markdown report saved to: ${reportFile}\n`);
        } catch (err) {
            console.error('\n❌ Error generating Markdown report:', err.message);
            console.error('   JSON report file:', jsonReportPath, '\n');
        }
    }
}

module.exports = TableReporter;

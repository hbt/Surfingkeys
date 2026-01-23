#!/usr/bin/env node
/**
 * Visual Test Run Action
 *
 * Runs Jest tests with --reporter=table and outputs markdown table to stdout.
 * Provides human-readable visual output with file references.
 *
 * Usage:
 *   bin/dbg vtest-run tests/cdp/commands/cdp-create-hints.test.ts
 *   bin/dbg vtest-run tests/cdp/commands/cdp-create-hints.test.ts | less
 *
 * Output: Markdown table formatted results to stdout
 * Logs: Written to /tmp/dbg-vtest-run-<timestamp>.log
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Create log file
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = `/tmp/dbg-vtest-run-${timestamp}.log`;
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

/**
 * Log to file only
 */
function log(message) {
    logStream.write(`${new Date().toISOString()} ${message}\n`);
}

/**
 * Extract clean markdown table from verbose output
 * Removes npm noise, JSON output, and verbose headers
 * Keeps everything from "# Test Report" onwards
 */
function cleanTableOutput(output) {
    // Find the start of the markdown report (first occurrence of "# Test Report")
    const reportStart = output.indexOf('# Test Report');

    if (reportStart === -1) {
        // No markdown report found, return original (shouldn't happen)
        log('⚠ Warning: Could not find "# Test Report" header in output');
        return output;
    }

    // Extract from "# Test Report" onwards
    const cleanedOutput = output.substring(reportStart);

    log(`✓ Cleaned output: Removed ${reportStart} bytes of verbose prefix`);

    return cleanedOutput;
}

/**
 * Format markdown table with proper column alignment
 * Matches the formatting from scripts/generate-command-docs.js
 */
function formatMarkdownTable(rows) {
    if (rows.length === 0) return '';

    // Calculate max width for each column
    const numCols = Math.max(...rows.map(r => r.length));
    const colWidths = new Array(numCols).fill(0);

    rows.forEach(row => {
        row.forEach((cell, i) => {
            colWidths[i] = Math.max(colWidths[i], cell.length);
        });
    });

    // Format each row
    const formattedLines = rows.map((row) => {
        const formattedCells = [];

        for (let i = 0; i < numCols; i++) {
            const cell = row[i] || '';
            const cellWidth = cell.length;
            const padding = colWidths[i] - cellWidth;

            let formattedCell;
            // Check if this is a separator row (contains only dashes)
            if (cell.match(/^-+$/)) {
                formattedCell = '-'.repeat(colWidths[i]);
            } else {
                // Left-align text with padding
                formattedCell = cell + ' '.repeat(padding);
            }

            formattedCells.push(formattedCell);
        }

        return '| ' + formattedCells.join(' | ') + ' |';
    });

    return formattedLines.join('\n');
}

/**
 * Restructure markdown output:
 * - Move Coverage after Test Cases
 * - Remove Suite column from Test Suites (redundant with header)
 * - Rename "Test Suites" to "Summary"
 * - Remove "Files" section
 * - Keep Summary metrics but integrate into table
 */
function restructureMarkdown(markdown) {
    // Split by sections
    const lines = markdown.split('\n');
    let result = [];
    let inSummarySection = false;
    let inCoverageSection = false;
    let inTestSuitesSection = false;
    let inTestCasesSection = false;

    let summaryMetrics = [];
    let coverageLines = [];
    let testSuitesLines = [];
    let testCasesLines = [];
    let headerLine = '';
    let timestamp = '';

    // First pass: collect all sections
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Extract timestamp
        if (line.includes('**Generated**:')) {
            timestamp = line;
            continue;
        }

        // Summary section
        if (line === '## Summary') {
            inSummarySection = true;
            inCoverageSection = false;
            inTestSuitesSection = false;
            inTestCasesSection = false;
            continue;
        }

        // Coverage section
        if (line === '## Coverage') {
            inCoverageSection = true;
            inSummarySection = false;
            inTestSuitesSection = false;
            inTestCasesSection = false;
            continue;
        }

        // Test Suites section
        if (line === '## Test Suites') {
            inTestSuitesSection = true;
            inSummarySection = false;
            inCoverageSection = false;
            inTestCasesSection = false;
            continue;
        }

        // Test Cases section
        if (line === '## Test Cases') {
            inTestCasesSection = true;
            inSummarySection = false;
            inCoverageSection = false;
            inTestSuitesSection = false;
            continue;
        }

        // Stop processing on Files section
        if (line.includes('📄 Files:')) {
            break;
        }

        // Collect lines for each section
        if (inSummarySection && line.trim()) {
            summaryMetrics.push(line);
        } else if (inCoverageSection && line.trim()) {
            coverageLines.push(line);
        } else if (inTestSuitesSection && line.trim()) {
            testSuitesLines.push(line);
        } else if (inTestCasesSection && line.trim()) {
            // Skip status summary lines like "✅ Tests passed" or "❌ Tests failed"
            if (!line.trim().match(/^(✅|❌)\s+(Tests|tests)\s+(passed|failed)/)) {
                testCasesLines.push(line);
            }
        }
    }

    // Build restructured output (Test Cases → Summary → Coverage)

    // Test Cases section first
    result.push('## Test Cases');
    result.push('');
    result.push(...testCasesLines);
    result.push('');

    // Convert Summary metrics to table
    result.push('## Summary');
    result.push('');

    // Parse summary metrics to extract values
    let summaryTable = {
        status: '✅',
        tests: '-',
        passed: '-',
        failed: '-',
        skipped: '-',
        slow: '-',
        assertions: '-',
        duration: '-'
    };

    for (const line of summaryMetrics) {
        if (line.includes('**Total Tests**')) summaryTable.tests = line.split(':')[1].trim();
        if (line.includes('**Passed**')) {
            // Extract number only, remove emoji
            const value = line.split(':')[1].trim();
            summaryTable.passed = value.replace(/\s*✅\s*/g, '');
        }
        if (line.includes('**Failed**')) {
            // Extract number only, remove emoji
            const value = line.split(':')[1].trim();
            summaryTable.failed = value.replace(/\s*❌\s*/g, '');
        }
        if (line.includes('**Skipped**')) summaryTable.skipped = line.split(':')[1].trim();
        if (line.includes('**Slow**')) summaryTable.slow = line.split(':')[1].trim();
        if (line.includes('**Assertions**')) summaryTable.assertions = line.split(':')[1].trim();
        if (line.includes('**Duration**')) summaryTable.duration = line.split(':')[1].trim();
        if (line.includes('**Status**') && line.includes('✅ PASSED')) summaryTable.status = '✅ PASSED';
        if (line.includes('**Status**') && line.includes('❌ FAILED')) summaryTable.status = '❌ FAILED';
    }

    // Format summary table with proper column widths
    const summaryTableRows = [
        ['Status', 'Tests', 'Passed', 'Failed', 'Skipped', 'Slow', 'Assertions', 'Duration'],
        ['-', '-', '-', '-', '-', '-', '-', '-'],
        [summaryTable.status, summaryTable.tests, summaryTable.passed, summaryTable.failed, summaryTable.skipped, summaryTable.slow, summaryTable.assertions, summaryTable.duration]
    ];
    result.push(formatMarkdownTable(summaryTableRows));
    result.push('');

    // Coverage section (moved after Summary)
    if (coverageLines.length > 0) {
        result.push('## Coverage');
        result.push('');
        result.push(...coverageLines);
        result.push('');
    }

    return result.join('\n');
}

/**
 * Run the test and capture table output
 */
async function runTest(testFile) {
    return new Promise((resolve) => {
        log(`Running test with table reporter: ${testFile}`);

        const proc = spawn('npm', ['run', 'test:cdp:headless', '--', '--reporter=table', testFile], {
            cwd: PROJECT_ROOT,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            log(`Test process exited with code: ${code}`);
            log(`Stdout length: ${stdout.length} bytes`);
            log(`Stderr length: ${stderr.length} bytes`);

            // Extract JSON metadata from stderr/stdout for file references
            let reportFile = null;
            let diagnosticsFile = null;
            let headlessLogFile = null;

            // Look for reportFile path in stderr/stdout
            const reportMatch = (stderr + stdout).match(/\/tmp\/cdp-test-reports\/test-report-[^\s]+\.json/);
            if (reportMatch) {
                reportFile = reportMatch[0];
            }

            const diagnosticsMatch = (stderr + stdout).match(/\/tmp\/cdp-test-reports\/test-diagnostics-[^\s]+\.json/);
            if (diagnosticsMatch) {
                diagnosticsFile = diagnosticsMatch[0];
            }

            // Extract headless log path
            const headlessMatch = (stdout).match(/Log:\s*(\S*cdp-headless[^\s]*\.log)/);
            if (headlessMatch && headlessMatch[1]) {
                headlessLogFile = headlessMatch[1];
            }

            if (stdout) {
                log(`✓ Captured table output (${stdout.length} bytes)`);
                resolve({
                    success: true,
                    table: stdout,
                    exitCode: code,
                    reportFile: reportFile,
                    diagnosticsFile: diagnosticsFile,
                    headlessLogFile: headlessLogFile
                });
            } else {
                log(`✗ No table output captured`);
                log(`Stderr: ${stderr.substring(0, 500)}`);
                resolve({
                    success: false,
                    error: 'No table output captured',
                    exitCode: code,
                    stderr: stderr.substring(0, 1000)
                });
            }
        });

        proc.on('error', (error) => {
            log(`✗ Process error: ${error.message}`);
            resolve({
                success: false,
                error: error.message,
                exitCode: -1
            });
        });
    });
}

/**
 * Format output with restructured markdown
 */
function formatOutput(result, testFile) {
    let output = '';

    output += `\n${'═'.repeat(80)}\n`;
    output += `Test: ${testFile}\n`;
    output += `${'═'.repeat(80)}\n\n`;

    // Clean verbose output, keeping only markdown from "# Test Report" onwards
    const cleanedTable = cleanTableOutput(result.table);

    // Restructure markdown for better readability
    const restructuredMarkdown = restructureMarkdown(cleanedTable);
    output += restructuredMarkdown;

    output += `\n`;

    // Log file references to file (for later reference, not shown in terminal)
    log(`📄 Files:`);
    if (result.headlessLogFile) {
        log(`  Chrome Log:    ${result.headlessLogFile}`);
    }
    if (result.reportFile) {
        log(`  Full Report:   ${result.reportFile}`);
    }
    if (result.diagnosticsFile) {
        log(`  Diagnostics:   ${result.diagnosticsFile}`);
    }

    return output;
}

/**
 * Main action runner
 */
async function run(args) {
    log('=== Visual Test Run Action ===');

    if (args.length === 0) {
        log('ERROR: No test file specified');
        logStream.end();

        console.error('Error: No test file specified');
        console.error('Usage: bin/dbg vtest-run <test-file>');
        console.error('Example: bin/dbg vtest-run tests/cdp/commands/cdp-create-hints.test.ts');
        process.exit(1);
    }

    const testFile = args[0];

    // Check if test file exists
    const testPath = path.join(PROJECT_ROOT, testFile);
    if (!fs.existsSync(testPath)) {
        log(`ERROR: Test file not found: ${testPath}`);
        logStream.end();

        console.error(`Error: Test file not found: ${testFile}`);
        process.exit(1);
    }

    log(`Test file: ${testFile}`);

    try {
        const result = await runTest(testFile);
        logStream.end();

        if (result.success) {
            // Output formatted table with file references
            console.log(formatOutput(result, testFile));
            process.exit(result.exitCode);
        } else {
            // Output error
            console.error(`\nError: ${result.error}`);
            if (result.stderr) {
                console.error(`\nStderr:\n${result.stderr}`);
            }
            process.exit(1);
        }
    } catch (error) {
        log(`FATAL ERROR: ${error.message}`);
        log(error.stack);
        logStream.end();

        console.error(`Fatal Error: ${error.message}`);
        process.exit(1);
    }
}

module.exports = { run };

#!/usr/bin/env node
/**
 * Visual Test Sample Action
 *
 * Runs a small sample of CDP tests (default: 10) sequentially.
 * Measures wall-clock time per test to separate Chrome startup overhead
 * from actual test execution time.
 *
 * Purpose: Investigate why vtest-all is slow without running all 130 tests.
 *
 * Output: Markdown table with per-test timing breakdown
 * Logs: Written to /tmp/dbg-vtest-sample-*.log
 *
 * Usage:
 *   bin/dbg vtest-sample                              (10 tests, alphabetical)
 *   bin/dbg vtest-sample --count 5                   (5 tests)
 *   bin/dbg vtest-sample --count 20 --random          (20 random tests)
 *   bin/dbg vtest-sample --dir tests/cdp/commands    (from specific dir)
 *   bin/dbg vtest-sample --count 5 --dir tests/cdp/commands --random
 *
 * Output columns:
 *   File        - test file name (relative)
 *   Status      - pass/fail
 *   Tests       - number of test cases
 *   Wall        - wall-clock time (Chrome start + test + cleanup)
 *   TestDur     - actual Jest test duration from JSON output
 *   Overhead    - wall - testDur (Chrome startup + proxy + cleanup cost)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { formatMarkdownTable } = require('../lib/markdown-utils');
const {
    ensureReportsDir,
    generateTimestamp,
    PROJECT_ROOT,
    REPORTS_DIR
} = require('../lib/test-utils');

const timestamp = generateTimestamp();
const LOG_FILE = `/tmp/dbg-vtest-sample-${timestamp}.log`;
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(message) {
    logStream.write(`${new Date().toISOString()} ${message}\n`);
}

/**
 * Parse CLI args:
 *   --count N       number of tests to sample (default: 10)
 *   --dir <path>    directory to discover tests from (default: tests/cdp)
 *   --random        random sampling instead of alphabetical first-N
 */
function parseArgs(args) {
    const opts = {
        count: 10,
        dir: path.join(PROJECT_ROOT, 'tests/cdp'),
        random: false
    };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--count' && args[i + 1]) {
            const n = parseInt(args[i + 1], 10);
            if (!isNaN(n) && n > 0) opts.count = n;
            i++;
        } else if (args[i] === '--dir' && args[i + 1]) {
            opts.dir = path.isAbsolute(args[i + 1])
                ? args[i + 1]
                : path.join(PROJECT_ROOT, args[i + 1]);
            i++;
        } else if (args[i] === '--random') {
            opts.random = true;
        }
    }

    return opts;
}

/**
 * Discover test files in dir, sort, optionally shuffle, then take first N
 */
function sampleTestFiles(dir, count, random) {
    try {
        const output = execSync(`find ${dir} -name '*.test.ts' -type f`, { encoding: 'utf8' });
        let files = output.trim().split('\n').filter(f => f.length > 0).sort();

        if (random) {
            // Fisher-Yates shuffle
            for (let i = files.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [files[i], files[j]] = [files[j], files[i]];
            }
        }

        return files.slice(0, count);
    } catch (err) {
        throw new Error(`Failed to discover test files in ${dir}: ${err.message}`);
    }
}

/**
 * Run a single test via bin/dbg test-run, tracking wall-clock time.
 * Returns { testFile, wallMs, result, success, error }
 */
function runTestWithTiming(testFile) {
    const relativePath = path.isAbsolute(testFile)
        ? path.relative(PROJECT_ROOT, testFile)
        : testFile;

    const wallStart = Date.now();

    try {
        const output = execSync(`./bin/dbg test-run ${relativePath}`, {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 10 * 1024 * 1024
        });

        const wallMs = Date.now() - wallStart;
        const json = JSON.parse(output.trim());

        return { testFile: relativePath, wallMs, success: true, result: json };
    } catch (err) {
        const wallMs = Date.now() - wallStart;

        // execSync throws on non-zero exit but may still have JSON on stdout
        const stdout = err.stdout || '';
        try {
            const json = JSON.parse(stdout.trim());
            return { testFile: relativePath, wallMs, success: json.success !== false, result: json };
        } catch (_) {
            return { testFile: relativePath, wallMs, success: false, error: err.message };
        }
    }
}

/**
 * Format milliseconds as human-readable string
 */
function fmtMs(ms) {
    if (ms >= 60000) {
        const m = Math.floor(ms / 60000);
        const s = ((ms % 60000) / 1000).toFixed(1);
        return `${m}m${s}s`;
    }
    if (ms >= 1000) {
        return `${(ms / 1000).toFixed(1)}s`;
    }
    return `${ms}ms`;
}

/**
 * Build markdown report from timing results
 */
function buildReport(results, opts, totalWallMs) {
    let md = '# vtest-sample Report\n\n';

    // Config
    md += '## Config\n\n';
    md += `| Setting | Value |\n| --- | --- |\n`;
    md += `| Sample count | ${results.length} |\n`;
    md += `| Directory | \`${path.relative(PROJECT_ROOT, opts.dir)}\` |\n`;
    md += `| Selection | ${opts.random ? 'random' : 'alphabetical first-N'} |\n`;
    md += `| Total wall time | ${fmtMs(totalWallMs)} |\n`;
    md += '\n';

    // Per-test breakdown table
    md += '## Per-Test Timing\n\n';

    const rows = [
        ['File', 'Status', 'Tests', 'Wall', 'TestDur', 'Overhead', 'Overhead%']
    ];
    rows.push(['---', '---', '---', '---', '---', '---', '---']);

    const timings = [];

    results.forEach(r => {
        const name = path.basename(r.testFile, '.test.ts');
        const status = r.success && (r.result?.failed === 0) ? '✅' : '❌';
        const tests = r.success ? String(r.result?.tests || 0) : '-';
        const wall = fmtMs(r.wallMs);
        const testDur = r.success && r.result?.duration ? r.result.duration : null;
        const testDurStr = testDur !== null ? fmtMs(testDur) : '-';
        const overhead = testDur !== null ? r.wallMs - testDur : null;
        const overheadStr = overhead !== null ? fmtMs(overhead) : '-';
        const overheadPct = overhead !== null && r.wallMs > 0
            ? `${Math.round(overhead / r.wallMs * 100)}%`
            : '-';

        timings.push({ name, wallMs: r.wallMs, testDur, overhead });
        rows.push([name, status, tests, wall, testDurStr, overheadStr, overheadPct]);
    });

    md += formatMarkdownTable(rows);
    md += '\n\n';

    // Overhead analysis
    const withDuration = timings.filter(t => t.overhead !== null);
    if (withDuration.length > 0) {
        const avgWall = Math.round(withDuration.reduce((s, t) => s + t.wallMs, 0) / withDuration.length);
        const avgTestDur = Math.round(withDuration.reduce((s, t) => s + t.testDur, 0) / withDuration.length);
        const avgOverhead = Math.round(withDuration.reduce((s, t) => s + t.overhead, 0) / withDuration.length);
        const maxWall = Math.max(...withDuration.map(t => t.wallMs));
        const minWall = Math.min(...withDuration.map(t => t.wallMs));

        md += '## Overhead Analysis\n\n';
        md += `| Metric | Value |\n| --- | --- |\n`;
        md += `| Avg wall time / test | ${fmtMs(avgWall)} |\n`;
        md += `| Avg test duration | ${fmtMs(avgTestDur)} |\n`;
        md += `| Avg overhead (Chrome+proxy) | ${fmtMs(avgOverhead)} |\n`;
        md += `| Overhead share | ${Math.round(avgOverhead / avgWall * 100)}% |\n`;
        md += `| Fastest test | ${fmtMs(minWall)} |\n`;
        md += `| Slowest test | ${fmtMs(maxWall)} |\n`;
        md += `| Estimated 130 tests @ avg | ${fmtMs(avgWall * 130)} |\n`;
        md += '\n';

        // Sort by wall time descending — top 5 slowest
        const sorted = [...withDuration].sort((a, b) => b.wallMs - a.wallMs);
        if (sorted.length > 1) {
            md += '## Slowest Tests\n\n';
            const slowRows = [['Rank', 'File', 'Wall', 'TestDur', 'Overhead']];
            slowRows.push(['---', '---', '---', '---', '---']);
            sorted.slice(0, 5).forEach((t, i) => {
                slowRows.push([
                    `#${i + 1}`,
                    t.name,
                    fmtMs(t.wallMs),
                    fmtMs(t.testDur),
                    fmtMs(t.overhead)
                ]);
            });
            md += formatMarkdownTable(slowRows);
            md += '\n';
        }
    }

    return md;
}

async function run(args) {
    ensureReportsDir();
    log('=== vtest-sample ===');

    const opts = parseArgs(args);

    log(`count=${opts.count}, dir=${opts.dir}, random=${opts.random}`);

    // Discover and sample
    let testFiles;
    try {
        testFiles = sampleTestFiles(opts.dir, opts.count, opts.random);
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }

    if (testFiles.length === 0) {
        console.error('No test files found.');
        process.exit(1);
    }

    log(`Running ${testFiles.length} tests...`);
    console.error(`Running ${testFiles.length} tests from ${path.relative(PROJECT_ROOT, opts.dir)} (${opts.random ? 'random' : 'alphabetical'})...\n`);

    const results = [];
    const totalWallStart = Date.now();

    for (let i = 0; i < testFiles.length; i++) {
        const f = testFiles[i];
        const rel = path.isAbsolute(f) ? path.relative(PROJECT_ROOT, f) : f;
        const name = path.basename(f, '.test.ts');

        process.stderr.write(`[${i + 1}/${testFiles.length}] ${name}...`);
        log(`Running: ${rel}`);

        const result = runTestWithTiming(f);
        results.push(result);

        const statusSymbol = result.success && (result.result?.failed === 0) ? '✅' : '❌';
        process.stderr.write(` ${statusSymbol} ${fmtMs(result.wallMs)}\n`);
        log(`Done: ${rel} wall=${result.wallMs}ms success=${result.success}`);
    }

    const totalWallMs = Date.now() - totalWallStart;
    log(`All tests done. Total wall=${totalWallMs}ms`);

    const report = buildReport(results, opts, totalWallMs);

    // Write report file
    const reportFile = path.join(REPORTS_DIR, `vtest-sample-${timestamp}.md`);
    fs.writeFileSync(reportFile, report);
    log(`Report written: ${reportFile}`);

    // Print report to stdout
    console.log(report);
    console.error(`\nReport: ${reportFile}`);
    console.error(`Log:    ${LOG_FILE}`);

    logStream.end();

    const anyFailed = results.some(r => !r.success || (r.result?.failed > 0));
    setTimeout(() => process.exit(anyFailed ? 1 : 0), 100);
}

module.exports = { run };

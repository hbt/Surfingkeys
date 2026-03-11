/**
 * test-coverage-query — Query per-function call counts from last coverage run
 *
 * Reads /tmp/cdp-coverage/*-per-test-coverage-*.json files produced by cdp-coverage.ts.
 * No live Chrome connection required.
 *
 * Usage:
 *   bin/dbg test-coverage-query funcs
 *     → Show functionDelta for all tests in the most recent run
 *
 *   bin/dbg test-coverage-query funcs --test "2.1 cursor at 0"
 *     → Filter to tests whose testName contains the substring
 *
 *   bin/dbg test-coverage-query find getMetas
 *     → Which tests called getMetas and how many times (sorted desc)
 *
 *   bin/dbg test-coverage-query hot --limit 10
 *     → Top-10 hottest functions across the most recent run
 *
 * Examples (from cmd-insert-cursor-backward-word tests, 2026-03-11):
 *
 *   $ bin/dbg test-coverage-query funcs --test "2.1 should move cursor to start"
 *   {
 *     "test": "cmd_insert_cursor_backward_word 2.1 should move cursor to start of word from end of text",
 *     "functions": {
 *       "getMetas":          { "count": 31, "scriptUrl": "content.js" },
 *       "handleStack":       { "count": 16, "scriptUrl": "content.js" },
 *       "_onWindowMessage":  { "count": 14, "scriptUrl": "content.js" },
 *       "onAfterHandler":    { "count": 13, "scriptUrl": "content.js" },
 *       "dispatchSKEvent":   { "count": 12, "scriptUrl": "content.js" }
 *     }
 *   }
 *
 *   $ bin/dbg test-coverage-query find getMetas
 *   [
 *     { "test": "cmd_insert_cursor_backward_word 2.1 ...", "count": 31 },
 *     { "test": "cmd_insert_cursor_backward_word 2.2 ...", "count": 28 }
 *   ]
 *
 *   $ bin/dbg test-coverage-query hot --limit 5
 *   [
 *     { "function": "getMetas",         "totalCount": 59, "appearsInTests": 2 },
 *     { "function": "handleStack",      "totalCount": 32, "appearsInTests": 2 },
 *     { "function": "_onWindowMessage", "totalCount": 28, "appearsInTests": 2 }
 *   ]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const COVERAGE_DIR = path.join(os.tmpdir(), 'cdp-coverage');

/**
 * Load all per-test coverage files from the most recent run.
 * "Most recent run" = the batch of files sharing the latest date-hour prefix.
 * Falls back to all files if no grouping is possible.
 */
function loadCoverageFiles() {
    if (!fs.existsSync(COVERAGE_DIR)) {
        return [];
    }

    const files = fs.readdirSync(COVERAGE_DIR)
        .filter(f => f.includes('-per-test-coverage-') && f.endsWith('.json'))
        .map(f => ({
            name: f,
            path: path.join(COVERAGE_DIR, f),
            mtime: fs.statSync(path.join(COVERAGE_DIR, f)).mtimeMs
        }))
        .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) return [];

    // Group by timestamp prefix (first 16 chars of the timestamp part: YYYY-MM-DDTHH-MM)
    // Timestamp suffix pattern: per-test-coverage-2026-03-11T12-34-56-789Z.json
    const timestampRe = /per-test-coverage-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2})/;
    const latestMatch = files[0].name.match(timestampRe);
    const latestPrefix = latestMatch ? latestMatch[1] : null;

    const batch = latestPrefix
        ? files.filter(f => f.name.includes(latestPrefix))
        : files;

    const results = [];
    for (const file of batch) {
        try {
            const data = JSON.parse(fs.readFileSync(file.path, 'utf-8'));
            results.push(data);
        } catch (_) {
            // skip unparseable files
        }
    }
    return results;
}

/**
 * subcommand: funcs [--test <substr>]
 * Show functionDelta for each test (optionally filtered by test name substring).
 */
function cmdFuncs(args) {
    const testFilterIdx = args.indexOf('--test');
    const testFilter = testFilterIdx !== -1 ? args[testFilterIdx + 1] : null;

    const records = loadCoverageFiles();
    if (records.length === 0) {
        console.log(JSON.stringify({ error: `No coverage files found in ${COVERAGE_DIR}` }));
        return;
    }

    const filtered = testFilter
        ? records.filter(r => r.testName && r.testName.includes(testFilter))
        : records;

    if (filtered.length === 0) {
        console.log(JSON.stringify({ error: `No tests matching filter: ${testFilter}` }));
        return;
    }

    const output = filtered.map(r => ({
        test: r.testName,
        functions: r.functionDelta || null
    }));

    console.log(JSON.stringify(output.length === 1 ? output[0] : output, null, 2));
}

/**
 * subcommand: find <funcName>
 * Which tests called funcName, sorted by count desc.
 */
function cmdFind(args) {
    const funcName = args[0];
    if (!funcName) {
        console.log(JSON.stringify({ error: 'Usage: bin/dbg test-coverage-query find <funcName>' }));
        return;
    }

    const records = loadCoverageFiles();
    if (records.length === 0) {
        console.log(JSON.stringify({ error: `No coverage files found in ${COVERAGE_DIR}` }));
        return;
    }

    const results = [];
    for (const r of records) {
        const fd = r.functionDelta;
        if (!fd) continue;

        // Exact match first, then substring match
        const exactEntry = fd[funcName];
        if (exactEntry) {
            results.push({ test: r.testName, count: exactEntry.count, scriptUrl: exactEntry.scriptUrl });
            continue;
        }

        // Substring match on key names
        for (const [key, val] of Object.entries(fd)) {
            if (key.includes(funcName)) {
                results.push({ test: r.testName, function: key, count: val.count, scriptUrl: val.scriptUrl });
            }
        }
    }

    results.sort((a, b) => b.count - a.count);
    console.log(JSON.stringify(results, null, 2));
}

/**
 * subcommand: hot [--limit N]
 * Top-N hottest functions summed across all tests.
 */
function cmdHot(args) {
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) || 10 : 10;

    const records = loadCoverageFiles();
    if (records.length === 0) {
        console.log(JSON.stringify({ error: `No coverage files found in ${COVERAGE_DIR}` }));
        return;
    }

    const accumulator = new Map(); // funcName → { totalCount, appearsInTests }

    for (const r of records) {
        const fd = r.functionDelta;
        if (!fd) continue;

        for (const [funcName, val] of Object.entries(fd)) {
            const existing = accumulator.get(funcName) || { totalCount: 0, appearsInTests: 0 };
            existing.totalCount += val.count;
            existing.appearsInTests += 1;
            accumulator.set(funcName, existing);
        }
    }

    const sorted = Array.from(accumulator.entries())
        .map(([funcName, stats]) => ({ function: funcName, ...stats }))
        .sort((a, b) => b.totalCount - a.totalCount)
        .slice(0, limit);

    console.log(JSON.stringify(sorted, null, 2));
}

/**
 * Main action runner
 */
async function run(args) {
    const subcommand = args[0];
    const subArgs = args.slice(1);

    switch (subcommand) {
        case 'funcs':
            cmdFuncs(subArgs);
            break;
        case 'find':
            cmdFind(subArgs);
            break;
        case 'hot':
            cmdHot(subArgs);
            break;
        default:
            console.log(JSON.stringify({
                error: `Unknown subcommand: ${subcommand || '(none)'}`,
                usage: 'bin/dbg test-coverage-query <funcs|find|hot> [options]',
                subcommands: {
                    'funcs [--test <substr>]': 'Show functionDelta per test',
                    'find <funcName>': 'Which tests called funcName, sorted by count desc',
                    'hot [--limit N]': 'Top-N hottest functions across all tests (default: 10)'
                }
            }, null, 2));
            process.exit(1);
    }
}

module.exports = { run };

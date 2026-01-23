#!/usr/bin/env node
/**
 * Test runner wrapper that uses JSON reporter
 *
 * Usage:
 *   node tests/cdp/run-with-json-report.js <test-file>
 *   node tests/cdp/run-with-json-report.js tests/cdp/commands/cdp-create-hints.test.ts
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testFile = process.argv[2];

if (!testFile) {
    console.error('❌ Usage: node run-with-json-report.js <test-file>');
    console.error('   Example: node run-with-json-report.js tests/cdp/commands/cdp-create-hints.test.ts');
    process.exit(1);
}

const testPath = path.resolve(testFile);
if (!fs.existsSync(testPath)) {
    console.error(`❌ Test file not found: ${testPath}`);
    process.exit(1);
}

console.log('Running test with JSON reporter...\n');

// Run jest with the JSON reporter config
const jestProcess = spawn('npx', [
    'jest',
    `--config=config/jest.config.cdp.json.js`,
    '--',
    testPath
], {
    stdio: 'inherit',
    env: {
        ...process.env,
        FORCE_COLOR: '1'
    }
});

jestProcess.on('exit', (code) => {
    process.exit(code);
});

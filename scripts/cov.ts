#!/usr/bin/env bun
/**
 * Run a Playwright spec with coverage, then generate the Istanbul HTML report.
 *
 * Usage:
 *   npm run cov tests/playwright/commands/cmd-tab-close.spec.ts
 *   npm run cov /absolute/path/to/cmd-tab-close-all-left.spec.ts
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const specFile = process.argv[2];
if (!specFile) {
    console.error('Usage: npm run cov <spec-file>');
    process.exit(1);
}

// cmd-tab-close-all-left.spec.ts → cmd_tab_close_all_left
const label = path.basename(specFile, '.spec.ts').replace(/-/g, '_');

// 1. Run test with coverage (non-zero exit = test failures, not a fatal error)
console.log(`\n[cov] 1/2  Running ${path.basename(specFile)} with coverage...`);
try {
    execSync(`COVERAGE=true bunx playwright test ${specFile}`, { stdio: 'inherit' });
} catch {
    console.warn('\n[cov] Some tests failed — coverage file may still be available.');
}

// 2. Find the latest v8.json for this spec
const covDir = path.join('coverage-raw', label);
if (!fs.existsSync(covDir)) {
    console.error(`[cov] No coverage dir found: ${covDir}`);
    process.exit(1);
}
const latest = fs.readdirSync(covDir)
    .filter(f => f.endsWith('.v8.json'))
    .sort()
    .slice(-1)[0];
if (!latest) {
    console.error(`[cov] No .v8.json files in ${covDir}`);
    process.exit(1);
}
const jsonFile = path.join(covDir, latest);

// 3. Generate HTML report
console.log(`\n[cov] 2/2  Generating HTML report from ${jsonFile}...`);
execSync(`bun scripts/coverage-html.ts ${jsonFile}`, { stdio: 'inherit' });

const htmlPath = path.resolve(path.join('coverage-html', label, 'index.html'));
console.log(`\n[cov] Done → ${htmlPath}`);

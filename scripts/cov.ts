#!/usr/bin/env bun
/**
 * Run a Playwright spec with coverage, then generate the raw V8 HTML report.
 *
 * Usage:
 *   npm run cov:html tests/playwright/commands/cmd-tab-close.spec.ts
 *   npm run cov:html /absolute/path/to/cmd-tab-close-all-left.spec.ts
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const specFile = process.argv[2];
if (!specFile) {
    console.error('Usage: npm run cov:html <spec-file>');
    process.exit(1);
}

// cmd-tab-close-all-left.spec.ts → cmd_tab_close_all_left
const label = path.basename(specFile, '.spec.ts').replace(/-/g, '_');
const runStartMs = Date.now();

// 1. Run test with coverage (non-zero exit = test failures, not a fatal error)
console.log(`\n[cov] 1/2  Running ${path.basename(specFile)} with coverage...`);
try {
    execSync(`COVERAGE=true bunx playwright test ${specFile}`, { stdio: 'inherit' });
} catch {
    console.warn('\n[cov] Some tests failed — coverage file may still be available.');
}

function listV8JsonFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listV8JsonFiles(full));
            continue;
        }
        if (entry.isFile() && full.endsWith('.v8.json')) {
            out.push(full);
        }
    }
    return out;
}

function listIndexHtmlFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listIndexHtmlFiles(full));
            continue;
        }
        if (entry.isFile() && entry.name === 'index.html') {
            out.push(full);
        }
    }
    return out;
}

function pickLatest(paths: string[]): string | null {
    if (paths.length === 0) return null;
    paths.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return paths[0];
}

function pickLatestPerDirectory(paths: string[]): string[] {
    const byDir = new Map<string, string[]>();
    for (const filePath of paths) {
        const dir = path.dirname(filePath);
        const entries = byDir.get(dir) ?? [];
        entries.push(filePath);
        byDir.set(dir, entries);
    }
    return Array.from(byDir.values())
        .map((group) => pickLatest(group))
        .filter((filePath): filePath is string => !!filePath)
        .sort();
}

function detectTargetFromPayload(filePath: string): 'background' | 'content' | 'unknown' {
    try {
        const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (payload?.target === 'service_worker') return 'background';
        if (payload?.target === 'page') return 'content';
    } catch {
        // fallback below
    }
    if (filePath.includes('/background/')) return 'background';
    if (filePath.includes('/content/')) return 'content';
    return 'unknown';
}

// 2. Find persisted v8.json files for this spec
const covDir = path.join('coverage-raw', label);
if (!fs.existsSync(covDir)) {
    console.error(`[cov] No coverage dir found: ${covDir}`);
    process.exit(1);
}
const allFiles = pickLatestPerDirectory(listV8JsonFiles(covDir)
    .filter((f) => {
        try {
            return fs.statSync(f).mtimeMs >= runStartMs - 3000;
        } catch {
            return false;
        }
    })
    .sort());
if (allFiles.length === 0) {
    console.error(`[cov] No fresh .v8.json files under ${covDir} for this run`);
    process.exit(1);
}

const byTarget = allFiles.reduce(
    (acc, f) => {
        const target = detectTargetFromPayload(f);
        if (target === 'background') acc.background.push(f);
        else if (target === 'content') acc.content.push(f);
        return acc;
    },
    { background: [] as string[], content: [] as string[] },
);

if (byTarget.background.length === 0 || byTarget.content.length === 0) {
    console.error('[cov] Missing required dual-target coverage artifacts.');
    console.error(`[cov] background files: ${byTarget.background.length}`);
    console.error(`[cov] content files:   ${byTarget.content.length}`);
    console.error('[cov] Ensure the spec persists both target sessions (background + content).');
    process.exit(1);
}

// 3. Generate HTML reports for all persisted coverage files
console.log(`\n[cov] 2/2  Generating raw V8 HTML reports from ${allFiles.length} persisted files...`);
for (const filePath of allFiles) {
    execSync(`bun scripts/coverage-html.ts ${filePath}`, { stdio: 'inherit' });
}

const htmlRoot = path.resolve(path.join('coverage-html', label));
console.log(`\n[cov] Done → ${htmlRoot}`);

// Open both target reports (background + content) when available.
try {
    const allIndexes = listIndexHtmlFiles(htmlRoot);
    if (allIndexes.length === 0) {
        throw new Error('No index.html generated');
    }
    const bgIndexes = allIndexes.filter(p => p.includes('/background/index.html'));
    const contentIndexes = allIndexes.filter(p => p.includes('/content/index.html'));

    const bgTarget = pickLatest(bgIndexes);
    const contentTarget = pickLatest(contentIndexes);

    if (!bgTarget || !contentTarget) {
        const fallback = pickLatest(allIndexes);
        if (!fallback) throw new Error('No report candidate found');
        execSync(`xdg-open "${fallback}"`, { stdio: 'ignore' });
        console.log(`[cov] Opened report: ${fallback}`);
    } else {
        execSync(`xdg-open "${bgTarget}"`, { stdio: 'ignore' });
        execSync(`xdg-open "${contentTarget}"`, { stdio: 'ignore' });
        console.log(`[cov] Opened background report: ${bgTarget}`);
        console.log(`[cov] Opened content report: ${contentTarget}`);
    }
} catch {
    console.warn(`[cov] Could not open report with xdg-open. Open manually under: ${htmlRoot}`);
}

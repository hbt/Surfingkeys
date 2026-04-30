#!/usr/bin/env bun
/**
 * Convert a raw V8 coverage JSON (from ServiceWorkerCoverage.flush()) into
 * a source-mapped Istanbul HTML report.
 *
 * Usage:
 *   bun scripts/coverage-html.ts coverage-raw/cmd_tab_close/<timestamp>.v8.json
 *   bun scripts/coverage-html.ts coverage-raw/cmd_tab_close/<timestamp>.v8.json --out coverage-html
 */

import v8ToIstanbul from 'v8-to-istanbul';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const inputFile = args.find(a => !a.startsWith('--'));
const outFlag = args.indexOf('--out');
const outBase = outFlag !== -1 ? args[outFlag + 1] : 'coverage-html';

if (!inputFile) {
    console.error('Usage: bun scripts/coverage-html.ts <v8-json-file> [--out <dir>]');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
const label: string = data.spec;

const DIST_DIR = path.resolve('dist/development/chrome');
const KNOWN_BUNDLES = ['background.js', 'content.js', 'api.js'];

const map = libCoverage.createCoverageMap({});

for (const script of data.result as any[]) {
    const jsFile = KNOWN_BUNDLES.find(f => script.url.endsWith(f));
    if (!jsFile) continue;

    const scriptPath = path.join(DIST_DIR, jsFile);
    const sourceMapPath = scriptPath + '.map';
    if (!fs.existsSync(scriptPath) || !fs.existsSync(sourceMapPath)) {
        console.warn(`[Coverage] Skipping ${jsFile} — not found in ${DIST_DIR}`);
        continue;
    }

    const source = fs.readFileSync(scriptPath, 'utf-8');
    const sourceMap = JSON.parse(fs.readFileSync(sourceMapPath, 'utf-8'));

    const converter = v8ToIstanbul(scriptPath, 0, { source, sourceMap: { sourcemap: sourceMap } });
    await converter.load();
    converter.applyCoverage(script.functions);
    map.merge(converter.toIstanbul());
}

const outputDir = path.join(outBase, label);
fs.mkdirSync(outputDir, { recursive: true });

const context = libReport.createContext({ dir: outputDir, coverageMap: map });
(reports.create('html') as any).execute(context);
(reports.create('text-summary') as any).execute(context);

console.log(`\n[Coverage] HTML report → ${outputDir}/index.html`);

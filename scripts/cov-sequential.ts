#!/usr/bin/env bun
/**
 * Run Playwright specs sequentially with coverage enabled, then write a manifest
 * that indexes every raw V8 JSON artifact created during the run.
 *
 * Usage:
 *   npm run cov:sequential
 *   npm run cov:sequential -- tests/playwright/commands/cmd-scroll-down.spec.ts
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

type ManifestEntry = {
    group: string;
    files: string[];
    targets: { background: number; content: number; unknown: number };
};

const runStartMs = Date.now();
const startedAt = new Date(runStartMs).toISOString();
const runId = startedAt.replace(/[:.]/g, '-');
const coverageRoot = path.resolve('coverage-raw', 'runs', runId);
const manifestDir = path.resolve('coverage-manifests');
const manifestPath = path.join(manifestDir, `${runId}.json`);

const reportPath = path.resolve('test-reports', 'runs', `${runId}.json`);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

const playwrightArgs = process.argv.slice(2);
const cmd = ['playwright', 'test', '--workers=1', ...playwrightArgs];

console.log(`\n[cov:sequential] Running: COVERAGE=true bunx ${cmd.join(' ')}`);
const run = spawnSync('bunx', cmd, {
    stdio: 'inherit',
    env: { ...process.env, COVERAGE: 'true', COVERAGE_OUTPUT_DIR: coverageRoot, PLAYWRIGHT_JSON_OUTPUT: reportPath },
});

function listV8JsonFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { out.push(...listV8JsonFiles(full)); continue; }
        if (entry.isFile() && full.endsWith('.v8.json')) out.push(full);
    }
    return out;
}

function detectTarget(filePath: string): 'background' | 'content' | 'unknown' {
    try {
        const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (payload?.target === 'service_worker') return 'background';
        if (payload?.target === 'page') return 'content';
    } catch { /* fallback below */ }
    if (filePath.includes(`${path.sep}background${path.sep}`)) return 'background';
    if (filePath.includes(`${path.sep}content${path.sep}`)) return 'content';
    return 'unknown';
}

function buildEntries(files: string[]): ManifestEntry[] {
    const byGroup = new Map<string, ManifestEntry>();
    for (const filePath of files) {
        const relative = path.relative(coverageRoot, filePath);
        const group = path.dirname(relative);
        const target = detectTarget(filePath);
        const entry = byGroup.get(group) ?? { group, files: [], targets: { background: 0, content: 0, unknown: 0 } };
        entry.files.push(relative);
        entry.targets[target] += 1;
        byGroup.set(group, entry);
    }
    return Array.from(byGroup.values())
        .map((e) => ({ ...e, files: e.files.sort() }))
        .sort((a, b) => a.group.localeCompare(b.group));
}

const coverageFiles = listV8JsonFiles(coverageRoot);
const manifest = {
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    command: `COVERAGE=true bunx ${cmd.join(' ')}`,
    argv: cmd,
    exitCode: run.status,
    signal: run.signal,
    success: run.status === 0,
    coverageRoot: path.relative(process.cwd(), coverageRoot),
    testReportPath: path.relative(process.cwd(), reportPath),
    artifactCount: coverageFiles.length,
    groupCount: new Set(coverageFiles.map((f) => path.dirname(path.relative(coverageRoot, f)))).size,
    entries: buildEntries(coverageFiles),
};

fs.mkdirSync(manifestDir, { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`\n[cov:sequential] Wrote manifest → ${manifestPath}`);
console.log(`[cov:sequential] Test report  → ${reportPath}`);
console.log(`[cov:sequential] Indexed ${coverageFiles.length} raw V8 file(s) across ${manifest.entries.length} group(s).`);

if (run.status !== 0) process.exitCode = run.status ?? 1;

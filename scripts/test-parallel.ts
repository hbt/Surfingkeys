#!/usr/bin/env bun
/**
 * Run Playwright specs in parallel and write a timestamped JSON report.
 *
 * Usage:
 *   npm run test:playwright:parallel
 *   npm run test:playwright:parallel -- tests/playwright/commands/cmd-scroll-down.spec.ts
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = path.resolve('test-reports', 'runs', `${runId}.json`);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

const cmd = ['playwright', 'test', '--workers=9', ...process.argv.slice(2)];

console.log(`\n[test:parallel] Running: bunx ${cmd.join(' ')}`);
const run = spawnSync('bunx', cmd, {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT: reportPath },
});

console.log(`\n[test:parallel] Report → ${reportPath}`);

if (run.status !== 0) process.exitCode = run.status ?? 1;

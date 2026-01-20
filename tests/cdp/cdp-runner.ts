#!/usr/bin/env ts-node
/**
 * CDP Test Runner - Runs all CDP experiments
 *
 * Usage:
 *   npm run test:cdp:all
 *
 * Available individual experiments:
 *   npm run test:cdp:reload-keyboard   # Extension reload via keyboard shortcut
 *   npm run test:cdp:reload-messaging  # Extension reload via CDP messaging
 *   npm run test:cdp:api              # Chrome API verification
 */

import { execSync } from 'child_process';
import * as path from 'path';

const EXPERIMENTS = {
    'reload-keyboard': 'cdp-basic.ts',
    'reload-messaging': 'cdp-reload-messaging.ts'
};

function runExperiment(name: string, scriptFile: string) {
    const scriptPath = path.join(__dirname, scriptFile);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running experiment: ${name}`);
    console.log(`Script: ${scriptFile}`);
    console.log('='.repeat(60) + '\n');

    try {
        execSync(`npx ts-node ${scriptPath}`, {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
        });
        console.log(`\n✅ Experiment "${name}" completed\n`);
        return true;
    } catch (error) {
        console.error(`\n❌ Experiment "${name}" failed\n`);
        return false;
    }
}

function main() {
    console.log('Running all CDP experiments...\n');
    let passed = 0;
    let failed = 0;

    for (const [name, scriptFile] of Object.entries(EXPERIMENTS)) {
        if (runExperiment(name, scriptFile)) {
            passed++;
        } else {
            failed++;
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`Total: ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log('='.repeat(60) + '\n');

    process.exit(failed > 0 ? 1 : 0);
}

main();

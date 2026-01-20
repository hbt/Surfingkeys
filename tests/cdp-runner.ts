#!/usr/bin/env ts-node
/**
 * CDP Test Runner - Routes to specific CDP experiments
 *
 * Usage:
 *   npm run test:cdp reload-keyboard   # Test extension reload via keyboard shortcut
 *   npm run test:cdp reload-messaging  # Test extension reload via CDP messaging
 *   npm run test:cdp all              # Run all experiments
 *
 * Available experiments:
 * - reload-keyboard: Auto-trigger Alt+Shift+R and verify extension reloads
 * - reload-messaging: Send reload command via CDP and verify with uptime check
 */

import { execSync } from 'child_process';
import * as path from 'path';

const EXPERIMENTS = {
    'reload-keyboard': 'cdp-basic.ts',
    'reload-messaging': 'cdp-reload-messaging.ts'
};

function showHelp() {
    console.log('CDP Test Runner\n');
    console.log('Usage:');
    console.log('  npm run test:cdp <experiment>\n');
    console.log('Available experiments:');
    console.log('  reload-keyboard   - Extension reload via keyboard shortcut (Alt+Shift+R)');
    console.log('  reload-messaging  - Extension reload via CDP Runtime.evaluate');
    console.log('  all              - Run all experiments\n');
    console.log('Examples:');
    console.log('  npm run test:cdp reload-keyboard');
    console.log('  npm run test:cdp reload-messaging');
    console.log('  npm run test:cdp all');
}

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
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
        showHelp();
        process.exit(0);
    }

    const experiment = args[0];

    if (experiment === 'all') {
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

    if (!(experiment in EXPERIMENTS)) {
        console.error(`❌ Unknown experiment: "${experiment}"\n`);
        showHelp();
        process.exit(1);
    }

    const scriptFile = EXPERIMENTS[experiment as keyof typeof EXPERIMENTS];
    const success = runExperiment(experiment, scriptFile);
    process.exit(success ? 0 : 1);
}

main();

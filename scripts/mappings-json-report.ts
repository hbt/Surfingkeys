#!/usr/bin/env bun
import { buildReport, runIntegrityCheck } from './lib/mappings-report/report';
import { REPORT_JSON_SCHEMA } from './lib/mappings-report/schema';

function main(): void {
    if (process.argv.includes('--schema')) {
        process.stdout.write(JSON.stringify(REPORT_JSON_SCHEMA, null, 2) + '\n');
        return;
    }
    if (process.argv.includes('--integrity')) {
        runIntegrityCheck();
        return;
    }
    const report = buildReport();
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main();

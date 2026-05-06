#!/usr/bin/env bun
/**
 * Reads issues from mappings-json-report and exits non-zero if any are found.
 *
 * Usage:
 *   bun scripts/check-issues.ts
 */

import { spawnSync } from 'child_process';
import path from 'path';

const ROOT = path.join(import.meta.dir, '..');

const result = spawnSync('bun', ['scripts/mappings-json-report.ts'], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 30_000,
});

if (result.status !== 0) {
    console.error('Failed to build mappings report:');
    console.error(result.stderr);
    process.exit(1);
}

const report = JSON.parse(result.stdout);
const { issues } = report;

interface IssueCheck {
    label: string;
    items: unknown[];
}

const checks: IssueCheck[] = [
    { label: 'annotations.invalid',                          items: issues.annotations.invalid },
    { label: 'annotations.not_migrated',                     items: issues.annotations.not_migrated },
    { label: 'tests.missing',                                items: issues.tests.missing },
    { label: 'tests.invalid_files',                          items: issues.tests.invalid_files },
    { label: 'custom_mappings.unmapped',                     items: issues.custom_mappings.unmapped },
    { label: 'code_coverage.missing',                        items: issues.code_coverage.missing },
    { label: 'source_validation.prefix_conflicts',           items: issues.source_validation.prefix_conflicts },
    { label: 'source_validation.g_placeholder_issues',       items: issues.source_validation.g_placeholder_issues },
    { label: 'config_validation.prefix_conflicts',           items: issues.config_validation.prefix_conflicts },
    { label: 'config_validation.invalid_mapcmdkey_targets',  items: issues.config_validation.invalid_mapcmdkey_targets },
];

const failed = checks.filter(c => c.items.length > 0);

if (failed.length === 0) {
    console.log('✅ No issues found.');
    process.exit(0);
}

for (const c of failed) {
    const preview = c.items.slice(0, 5);
    const more = c.items.length - preview.length;
    console.log(`\n❌ ${c.label} (${c.items.length}):`);
    console.log(JSON.stringify(preview, null, 2));
    if (more > 0) console.log(`  ... and ${more} more`);
}

process.exit(1);

#!/usr/bin/env bun
/**
 * Audit which commands have no entry in the user's custom config.
 * Informational only — always exits 0.
 *
 * Reuses mappings-json-report.ts output; no duplicate scanning.
 *
 * Usage:
 *   bun scripts/audit-custom-mappings.ts
 *   bun scripts/audit-custom-mappings.ts --json
 */

import { spawnSync } from 'child_process';
import path from 'path';

const ROOT = path.join(import.meta.dir, '..');

const result = spawnSync('bun', ['scripts/mappings-json-report.ts'], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
});

if (result.status !== 0) {
    console.error('Failed to build mappings report:');
    console.error(result.stderr);
    process.exit(1);
}

const report = JSON.parse(result.stdout);
const unmappedIds: string[] = report.issues.custom_mappings.unmapped;

// Build uid → category map from structured annotations
const categoryMap = new Map<string, string>();
for (const entry of report.mappings.list) {
    const ann = entry.annotation;
    if (typeof ann === 'object' && ann !== null && ann.unique_id) {
        categoryMap.set(ann.unique_id, ann.category ?? 'uncategorized');
    }
}

// Group unmapped ids by category
const byCategory = new Map<string, string[]>();
for (const uid of unmappedIds) {
    const cat = categoryMap.get(uid) ?? 'uncategorized';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(uid);
}

const argv = process.argv.slice(2);

if (argv.includes('--json')) {
    const out: Record<string, string[]> = {};
    for (const [cat, ids] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        out[cat] = ids.sort();
    }
    console.log(JSON.stringify({ total: unmappedIds.length, by_category: out }, null, 2));
    process.exit(0);
}

console.log(`\nℹ️  custom_mappings.unmapped — ${unmappedIds.length} commands not in personal config\n`);

const sorted = [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [cat, ids] of sorted) {
    console.log(`  ${cat} (${ids.length})`);
    for (const id of ids.sort()) {
        console.log(`    ${id}`);
    }
}

console.log();

const dupes = report.issues.config_validation.duplicate_keys ?? [];
if (dupes.length > 0) {
    console.log(`⚠️  config_validation.duplicate_keys — ${dupes.length} key(s) bound to multiple commands\n`);
    for (const { key, entries } of dupes) {
        console.log(`  '${key}'`);
        for (const e of entries) {
            const loc = e.line ? `:${e.line}` : '';
            const target = e.unique_id ?? `(${e.type})`;
            console.log(`    ${target}${loc}`);
        }
    }
    console.log();
}

process.exit(0);

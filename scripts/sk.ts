#!/usr/bin/env bun
/**
 * SurfingKeys CLI dispatcher.
 *
 * Usage:
 *   bun scripts/sk.ts detect-mapping-conflict <key> [--mode <Normal|Visual|Insert|...>]
 *   bun scripts/sk.ts --help
 */

import path from 'path';
import { execSync } from 'child_process';
import { normalizeKey, isPrefix } from './lib/mappings-report/source-validation';

const ROOT = path.join(import.meta.dir, '..');

interface MappingEntry {
    key?: string;
    mode?: string;
    annotation?: { unique_id?: string; short?: string };
}

interface Report {
    mappings: { list: MappingEntry[] };
    custom_configuration?: {
        mappings: Array<{ key: string; type: string; unique_id?: string }>;
    };
}

function loadJsonReport(): Report {
    const json = execSync('bun run --silent report:mappings:json', {
        cwd: ROOT,
        timeout: 30000,
        maxBuffer: 16 * 1024 * 1024,
    });
    return JSON.parse(json.toString());
}

interface KeyEntry {
    key: string;
    mode: string;
    id: string | null;
    short: string;
}

const TYPE_TO_MODE: Record<string, string> = {
    mapkey: 'Normal',
    vmapkey: 'Visual',
    imapkey: 'Insert',
    cmapkey: 'Command',
};

function collectEntries(report: Report): KeyEntry[] {
    const entries: KeyEntry[] = [];

    // Source bindings
    for (const e of report.mappings.list) {
        if (e.key && e.mode) {
            entries.push({
                key: e.key,
                mode: e.mode,
                id: e.annotation?.unique_id || null,
                short: e.annotation?.short || e.key,
            });
        }
    }

    // User config bindings
    const cc = report.custom_configuration;
    if (cc) {
        // Build a map of unique_id → mode from source for mapcmdkey resolution
        const idToMode = new Map<string, string>();
        for (const e of report.mappings.list) {
            if (e.annotation?.unique_id && e.mode) {
                idToMode.set(e.annotation.unique_id, e.mode);
            }
        }

        for (const m of cc.mappings) {
            if (!m.key) continue;
            let mode: string | undefined;
            if (m.type === 'mapcmdkey') {
                mode = m.unique_id ? idToMode.get(m.unique_id) : undefined;
            } else {
                mode = TYPE_TO_MODE[m.type];
            }
            if (!mode) continue;
            entries.push({
                key: m.key,
                mode,
                id: m.unique_id || null,
                short: m.unique_id || m.key,
            });
        }
    }

    return entries;
}

function detectMappingConflict(args: string[]): number {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: bun scripts/sk.ts detect-mapping-conflict <key> [--mode <mode>]

Checks whether <key> has prefix conflicts with existing bindings.

Options:
  --mode <mode>   Mode to check: Normal, Visual, Insert, Command (default: Normal)
  --help, -h      Show this help

Exit codes:
  0  No conflicts
  1  One or more conflicts found
`);
        return 0;
    }

    const candidateKey = args[0];

    const modeIdx = args.indexOf('--mode');
    const mode = modeIdx !== -1 && args[modeIdx + 1] ? args[modeIdx + 1] : 'Normal';

    console.log(`Loading JSON report...`);
    let report: Report;
    try {
        report = loadJsonReport();
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Error loading JSON report:', msg);
        return 1;
    }

    const allEntries = collectEntries(report);
    const modeEntries = allEntries.filter(e => e.mode === mode);

    const normCandidate = normalizeKey(candidateKey);

    interface Conflict {
        direction: 'blocked-by' | 'would-block';
        existingKey: string;
        id: string | null;
        short: string;
    }

    const conflicts: Conflict[] = [];

    for (const entry of modeEntries) {
        const normExisting = normalizeKey(entry.key);

        if (isPrefix(normExisting, normCandidate)) {
            // existing is prefix of candidate → existing blocks candidate
            conflicts.push({ direction: 'blocked-by', existingKey: entry.key, id: entry.id, short: entry.short });
        } else if (isPrefix(normCandidate, normExisting)) {
            // candidate is prefix of existing → candidate would block existing
            conflicts.push({ direction: 'would-block', existingKey: entry.key, id: entry.id, short: entry.short });
        }
    }

    if (conflicts.length === 0) {
        console.log(`\x1b[32m✅ no conflicts\x1b[0m — '${candidateKey}' is free in ${mode} mode`);
        return 0;
    }

    console.log(`\x1b[31m❌ ${conflicts.length} conflict(s) for '${candidateKey}' in ${mode} mode:\x1b[0m\n`);
    for (const c of conflicts) {
        const idStr = c.id ? ` (${c.id})` : '';
        if (c.direction === 'blocked-by') {
            console.log(`  \x1b[33m'${c.existingKey}'\x1b[0m${idStr} — ${c.short}`);
            console.log(`    → '${c.existingKey}' is a prefix of '${candidateKey}' — \x1b[31mblocked\x1b[0m`);
        } else {
            console.log(`  \x1b[33m'${c.existingKey}'\x1b[0m${idStr} — ${c.short}`);
            console.log(`    → '${candidateKey}' would block '${c.existingKey}' — \x1b[31mwould shadow existing binding\x1b[0m`);
        }
    }
    return 1;
}

// CLI dispatcher
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`SurfingKeys CLI

Usage:
  bun scripts/sk.ts detect-mapping-conflict <key> [--mode <mode>]
  bun scripts/sk.ts --help

Subcommands:
  detect-mapping-conflict   Check if a candidate key has prefix conflicts
`);
    process.exit(0);
}

const [subcommand, ...subArgs] = args;

switch (subcommand) {
    case 'detect-mapping-conflict':
        process.exit(detectMappingConflict(subArgs));
        break;
    default:
        console.error(`Unknown subcommand: '${subcommand}'. Run with --help for usage.`);
        process.exit(1);
}

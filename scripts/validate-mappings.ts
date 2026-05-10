#!/usr/bin/env bun
/**
 * Validates SurfingKeys mappings for prefix conflicts and user config coverage.
 *
 * Usage:
 *   bun scripts/validate-mappings.ts              # Run both source + config validation
 *   bun scripts/validate-mappings.ts --source     # Source-level prefix conflict check only
 *   bun scripts/validate-mappings.ts --config [file]  # User config checks only
 *   bun scripts/validate-mappings.ts --prefixes   # Prefix analysis (mode-aware)
 */

import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.join(import.meta.dir, '..');

interface AnnotationObject {
  unique_id?: string;
  short?: string;
}

interface MappingEntry {
  key?: string;
  mode?: string;
  annotation?: AnnotationObject;
}

interface Report {
  mappings: {
    list: MappingEntry[];
    summary: { total: number };
  };
  issues: {
    source_validation: {
      prefix_conflicts: Array<{
        mode: string;
        blocked_key: string;
        blocked_id: string | null;
        blocked_short: string;
        blocker_key: string;
        blocker_id: string | null;
        blocker_short: string;
      }>;
      g_placeholder_issues: Array<{
        type: 'duplicate' | 'gap' | 'wrong_start';
        key: string;
        message: string;
        affected_ids?: string[];
      }>;
    };
    config_validation: {
      prefix_conflicts: Array<{
        blocked_key: string;
        blocker_key: string;
        blocker_target: string;
      }>;
      invalid_mapcmdkey_targets: Array<{
        key: string;
        unique_id: string;
      }>;
    };
    custom_mappings: {
      unmapped: string[];
    };
  };
  custom_configuration?: {
    summary: { total: number };
    mappings: Array<{ key: string; type: string; unique_id?: string }>;
  };
}

// Load JSON report via bun run report:mappings:json
function loadJsonReport(): Report {
    const json = execSync('bun run --silent report:mappings:json', { cwd: ROOT, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(json.toString());
}

// Source-level prefix conflict check — reads from report.issues.source_validation
function validateSource(report: Report): number {
    console.log('Source Validation — Default Mapping Prefix Conflicts');
    console.log('=====================================================\n');

    const { prefix_conflicts, g_placeholder_issues } = report.issues.source_validation;

    if (prefix_conflicts.length === 0) {
        console.log('\x1b[32m✓ No prefix conflicts in default mappings.\x1b[0m\n');
    } else {
        // Group by mode for display
        const byMode = new Map<string, typeof prefix_conflicts>();
        for (const c of prefix_conflicts) {
            if (!byMode.has(c.mode)) byMode.set(c.mode, []);
            byMode.get(c.mode)!.push(c);
        }

        for (const [mode, modeConflicts] of byMode) {
            console.log(`\x1b[36m${mode} mode (${modeConflicts.length} conflicts):\x1b[0m`);
            for (const c of modeConflicts) {
                const blockedId = c.blocked_id ? ` [${c.blocked_id}]` : '';
                const blockerKey = `\x1b[33m${c.blocker_key}\x1b[0m`;
                console.log(`  \x1b[31m✗ "${c.blocked_key}"${blockedId} blocked by ${blockerKey} (${c.blocker_short})`);
            }
            console.log('');
        }

        console.log(`\x1b[31m${prefix_conflicts.length} prefix conflict(s) found in default mappings.\x1b[0m\n`);
    }

    // g-XXX placeholder issues
    console.log('g-XXX Placeholder Validation');
    console.log('─────────────────────────────');

    if (g_placeholder_issues.length === 0) {
        console.log('\x1b[32m✓ No g-XXX issues found.\x1b[0m\n');
    } else {
        for (const issue of g_placeholder_issues) {
            console.log(`\x1b[31m✗ ${issue.message}\x1b[0m`);
        }
        console.log('');
    }

    return prefix_conflicts.length + g_placeholder_issues.length;
}

// User config validation — reads from report.issues.config_validation
function validateConfig(report: Report, configPath: string): number {
    console.log('User Config Validation');
    console.log('======================\n');
    console.log(`Config: ${configPath}\n`);

    const cc = report.custom_configuration;
    if (!cc || cc.mappings.length === 0) {
        console.log('No user mappings found.\n');
        return 0;
    }

    const rawKeys = cc.mappings;
    const byType = (t: string) => rawKeys.filter(m => m.type === t).length;
    console.log(`User bindings: ${rawKeys.length} (mapkey: ${byType('mapkey')}, mapcmdkey: ${byType('mapcmdkey')}, map: ${byType('map')}, unmap: ${byType('unmap')})\n`);

    const { prefix_conflicts, invalid_mapcmdkey_targets } = report.issues.config_validation;

    if (prefix_conflicts.length === 0) {
        console.log('\x1b[32m✓ No prefix conflicts among user mappings.\x1b[0m');
    } else {
        console.log(`\x1b[31m✗ ${prefix_conflicts.length} prefix conflict(s) among user mappings:\x1b[0m`);
        for (const c of prefix_conflicts) {
            console.log(`  "${c.blocked_key}" blocked by \x1b[33m${c.blocker_key}\x1b[0m (${c.blocker_target})`);
        }
    }

    if (invalid_mapcmdkey_targets.length === 0) {
        console.log('\x1b[32m✓ All mapcmdkey unique_ids are valid.\x1b[0m');
    } else {
        console.log(`\x1b[31m✗ ${invalid_mapcmdkey_targets.length} mapcmdkey unique_id(s) not found in report:\x1b[0m`);
        for (const { key, unique_id } of invalid_mapcmdkey_targets) {
            console.log(`  \x1b[31m"${key}" → "${unique_id}" (unknown unique_id)\x1b[0m`);
        }
    }

    // Coverage stats from issues.custom_mappings.unmapped
    const unmapped = report.issues.custom_mappings.unmapped;
    const allIds = report.mappings.list
        .map(e => e.annotation?.unique_id)
        .filter(Boolean) as string[];
    const uniqueIds = [...new Set(allIds)];
    const total = uniqueIds.length;
    const mappedCount = total - unmapped.length;
    const pct = total > 0 ? ((mappedCount / total) * 100).toFixed(1) : '0.0';

    console.log(`\nCoverage: ${mappedCount}/${total} unique_ids mapped (${pct}%)`);
    console.log(`Unmapped: ${unmapped.length} commands have no user binding\n`);

    if (unmapped.length > 0 && process.argv.includes('--verbose')) {
        console.log('Unmapped unique_ids:');
        for (const id of unmapped) {
            console.log(`  ${id}`);
        }
        console.log('');
    } else if (unmapped.length > 0) {
        console.log('  (use --verbose to list unmapped ids)\n');
    }

    return prefix_conflicts.length + invalid_mapcmdkey_targets.length;
}

// Prefix analysis — grouped by first key character, mode-aware
function showPrefixKeys(report: Report): void {
    interface KeyEntry { key: string; mode: string; id: string | null; short: string }

    const entries: KeyEntry[] = report.mappings.list
        .filter(e => e.key && e.mode && e.mode !== 'Command')
        .map(e => ({
            key: e.key!,
            mode: e.mode!,
            id: e.annotation?.unique_id || null,
            short: e.annotation?.short || e.key!,
        }));

    // Group by mode, then by prefix char
    const byMode = new Map<string, Map<string, KeyEntry[]>>();
    for (const entry of entries) {
        if (!byMode.has(entry.mode)) byMode.set(entry.mode, new Map());
        const modeMap = byMode.get(entry.mode)!;

        let prefix: string;
        if (entry.key.startsWith('<')) {
            const endIdx = entry.key.indexOf('>');
            prefix = entry.key.slice(0, endIdx + 1);
        } else {
            prefix = entry.key[0];
        }

        if (!modeMap.has(prefix)) modeMap.set(prefix, []);
        modeMap.get(prefix)!.push(entry);
    }

    console.log('\nKey Prefix Analysis (mode-aware)');
    console.log('=================================\n');

    for (const [mode, prefixMap] of byMode) {
        const multiKey = [...prefixMap.entries()].filter(([, cmds]) => cmds.length > 1);
        if (multiKey.length === 0) continue;

        console.log(`\x1b[36m${mode} mode:\x1b[0m`);
        const sorted = multiKey.sort((a, b) => b[1].length - a[1].length);

        for (const [prefix, cmds] of sorted) {
            console.log(`  \x1b[33m${prefix}\x1b[0m (${cmds.length} commands):`);
            for (const cmd of cmds.slice(0, 5)) {
                const idStr = cmd.id ? ` [${cmd.id}]` : '';
                console.log(`    ${cmd.key}${idStr} — ${cmd.short}`);
            }
            if (cmds.length > 5) console.log(`    ... and ${cmds.length - 5} more`);
        }
        console.log('');
    }
}

// CLI
const args = process.argv.slice(2);

// Help flag
if (args.includes('--help') || args.includes('-h')) {
    console.log(`Validates SurfingKeys mappings for prefix conflicts and user config coverage.

Usage:
  bun scripts/validate-mappings.ts              # Run both source + config validation
  bun scripts/validate-mappings.ts --source     # Source-level prefix conflict check only
  bun scripts/validate-mappings.ts --config [file]  # User config checks only
  bun scripts/validate-mappings.ts --prefixes   # Prefix analysis (mode-aware)
  bun scripts/validate-mappings.ts --verbose    # Show unmapped command IDs
  bun scripts/validate-mappings.ts --help       # Show this help

Options:
  --source              Check default mappings for prefix conflicts
  --config [file]       Validate user config (defaults to .surfingkeysrc.js)
  --prefixes, -p        Show key prefix analysis grouped by mode
  --verbose             List all unmapped command IDs
  --help, -h            Show this help message
`);
    process.exit(0);
}

const showSource = args.includes('--source');
const showConfig = args.includes('--config');
const showPrefixes = args.includes('--prefixes') || args.includes('-p');
const runBoth = !showSource && !showConfig && !showPrefixes;

// Config path: arg after --config, or first non-flag arg, or default
const configIdx = args.indexOf('--config');
const configArg = (configIdx !== -1 && args[configIdx + 1] && !args[configIdx + 1].startsWith('-'))
    ? args[configIdx + 1]
    : args.find(a => !a.startsWith('-'));
const configPath = configArg || path.join(ROOT, '.surfingkeysrc.js');

console.log('Loading JSON report...');
let report: Report;
try {
    report = loadJsonReport();
} catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Error loading JSON report:', msg);
    process.exit(1);
}
console.log(`  ${report.mappings.summary.total} mappings loaded\n`);

let exitCode = 0;

if (showPrefixes || runBoth) {
    showPrefixKeys(report);
}

if (showSource || runBoth) {
    exitCode += validateSource(report);
}

if (showConfig || runBoth) {
    exitCode += validateConfig(report, configPath);
}

process.exit(exitCode > 0 ? 1 : 0);

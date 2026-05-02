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

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.join(import.meta.dir, '..');

interface KeyEntry {
  key: string;
  mode: string;
  id: string | null;
  short: string;
}

interface Conflict {
  blocked: KeyEntry;
  blockedBy: KeyEntry;
}

interface RawKeyInfo {
  type: 'mapcmdkey' | 'mapkey' | 'map' | 'unmap';
  target: string;
}

interface UserMappings {
  keyEntries: KeyEntry[];
  mappedIds: Set<string>;
  rawKeys: Map<string, RawKeyInfo>;
}

interface CoverageStats {
  total: number;
  mapped: number;
  unmapped: number;
  unmappedIds: string[];
}

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
}

// Load JSON report via bun run report:mappings:json
function loadJsonReport(): Report {
    const json = execSync('bun run --silent report:mappings:json', { cwd: ROOT, timeout: 30000 });
    return JSON.parse(json.toString());
}

// Normalize key for comparison (handle modifier key variations, case-sensitive)
function normalizeKey(key: string): string {
    return key
        .replace(/<Ctrl-/gi, '<C-')
        .replace(/<Alt-/gi, '<A-')
        .replace(/<Shift-/gi, '<S-');
}

// Check if key1 is a strict prefix of key2
function isPrefix(key1: string, key2: string): boolean {
    if (key1 === key2) return false;
    return key2.startsWith(key1);
}

// Find prefix conflicts within a list of {key, mode, id, short} entries
// Returns: [{ blocked: entry, blockedBy: entry }]
function findPrefixConflicts(entries: KeyEntry[]): Conflict[] {
    const conflicts: Conflict[] = [];

    // Group by mode
    const byMode = new Map<string, KeyEntry[]>();
    for (const entry of entries) {
        if (!byMode.has(entry.mode)) byMode.set(entry.mode, []);
        byMode.get(entry.mode)!.push(entry);
    }

    for (const [, modeEntries] of byMode) {
        for (let i = 0; i < modeEntries.length; i++) {
            for (let j = 0; j < modeEntries.length; j++) {
                if (i === j) continue;
                const a = modeEntries[i];
                const b = modeEntries[j];
                const normA = normalizeKey(a.key);
                const normB = normalizeKey(b.key);
                if (isPrefix(normA, normB)) {
                    conflicts.push({ blocked: b, blockedBy: a });
                }
            }
        }
    }

    return conflicts;
}

// Build entries list from JSON report mappings.list
function reportToEntries(report: Report): KeyEntry[] {
    return report.mappings.list
        .filter(e => e.key && e.mode)
        // Skip command-mode keys (they are word commands, not key sequences)
        .filter(e => e.mode !== 'Command')
        .map(e => ({
            key: e.key!,
            mode: e.mode!,
            id: e.annotation?.unique_id || null,
            short: e.annotation?.short || e.key!,
        }));
}

// Source-level prefix conflict check
function validateSource(report: Report): number {
    console.log('Source Validation — Default Mapping Prefix Conflicts');
    console.log('=====================================================\n');

    const entries = reportToEntries(report);
    const conflicts = findPrefixConflicts(entries);

    if (conflicts.length === 0) {
        console.log('\x1b[32m✓ No prefix conflicts in default mappings.\x1b[0m\n');
        return 0;
    }

    // Group by mode for display
    const byMode = new Map<string, Conflict[]>();
    for (const c of conflicts) {
        const mode = c.blocked.mode;
        if (!byMode.has(mode)) byMode.set(mode, []);
        byMode.get(mode)!.push(c);
    }

    for (const [mode, modeConflicts] of byMode) {
        console.log(`\x1b[36m${mode} mode (${modeConflicts.length} conflicts):\x1b[0m`);
        for (const { blocked, blockedBy } of modeConflicts) {
            const blockedId = blocked.id ? ` [${blocked.id}]` : '';
            const blockerKey = `\x1b[33m${blockedBy.key}\x1b[0m`;
            console.log(`  \x1b[31m✗ "${blocked.key}"${blockedId} blocked by ${blockerKey} (${blockedBy.short})`);
        }
        console.log('');
    }

    console.log(`\x1b[31m${conflicts.length} prefix conflict(s) found in default mappings.\x1b[0m\n`);
    return conflicts.length;
}

// Extract user mappings from config file
// Returns: { keyEntries: [{key, mode, id, short}], mappedIds: Set<string>, rawKeys: Map<key, info> }
function extractUserMappings(configPath: string): UserMappings {
    if (!fs.existsSync(configPath)) {
        console.error(`Config file not found: ${configPath}`);
        return { keyEntries: [], mappedIds: new Set(), rawKeys: new Map() };
    }

    // Strip single-line comments before parsing to avoid false positives
    const raw = fs.readFileSync(configPath, 'utf-8');
    const content = raw.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    const mappedIds = new Set<string>();
    const rawKeys = new Map<string, RawKeyInfo>();

    // mapcmdkey(key, unique_id) — maps a key to a command by unique_id
    const mapcmdkeyPattern = /(?:api\.)?mapcmdkey\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = mapcmdkeyPattern.exec(content)) !== null) {
        const [, key, uniqueId] = match;
        mappedIds.add(uniqueId);
        rawKeys.set(key, { type: 'mapcmdkey', target: uniqueId });
    }

    // mapkey(key, description, ...) — creates a new key binding
    const mapkeyPattern = /(?:api\.)?mapkey\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/g;
    while ((match = mapkeyPattern.exec(content)) !== null) {
        const [, key, desc] = match;
        if (!rawKeys.has(key)) rawKeys.set(key, { type: 'mapkey', target: desc });
    }

    // map(newKey, existingKey) — remaps an existing key; negative lookbehind avoids matching amap/unmap
    const mapPattern = /(?<![a-zA-Z])(?:api\.)?map\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/g;
    while ((match = mapPattern.exec(content)) !== null) {
        const [, key, target] = match;
        if (!rawKeys.has(key)) rawKeys.set(key, { type: 'map', target });
    }

    // unmap(key) — removes a key binding
    const unmapPattern = /(?:api\.)?unmap\s*\(\s*['"]([^'"]+)['"]/g;
    while ((match = unmapPattern.exec(content)) !== null) {
        const [, key] = match;
        if (!rawKeys.has(key)) rawKeys.set(key, { type: 'unmap', target: '(unmapped)' });
    }

    // Build key entries (mode unknown for user config, use 'Normal' as default)
    const keyEntries = [...rawKeys.entries()].map(([key, info]) => ({
        key,
        mode: 'Normal',
        id: info.type === 'mapcmdkey' ? info.target : null,
        short: info.target,
    }));

    return { keyEntries, mappedIds, rawKeys };
}

// Coverage stats: how many unique_ids from report have a user mapping
function coverageStats(report: Report, mappedIds: Set<string>): CoverageStats {
    const allIds = report.mappings.list
        .map(e => e.annotation?.unique_id)
        .filter(Boolean) as string[];
    const uniqueIds = [...new Set(allIds)];
    const mapped = uniqueIds.filter(id => mappedIds.has(id));
    const unmapped = uniqueIds.filter(id => !mappedIds.has(id));
    return { total: uniqueIds.length, mapped: mapped.length, unmapped: unmapped.length, unmappedIds: unmapped };
}

// User config validation
function validateConfig(report: Report, configPath: string): number {
    console.log('User Config Validation');
    console.log('======================\n');
    console.log(`Config: ${configPath}\n`);

    const { keyEntries, mappedIds, rawKeys } = extractUserMappings(configPath);

    if (rawKeys.size === 0) {
        console.log('No user mappings found.\n');
        return 0;
    }

    console.log(`User bindings: ${rawKeys.size} (mapkey: ${[...rawKeys.values()].filter(v => v.type === 'mapkey').length}, mapcmdkey: ${[...rawKeys.values()].filter(v => v.type === 'mapcmdkey').length}, map: ${[...rawKeys.values()].filter(v => v.type === 'map').length}, unmap: ${[...rawKeys.values()].filter(v => v.type === 'unmap').length})\n`);

    // Build valid unique_id set from report
    const validIds = new Set<string>(
        report.mappings.list
            .map(e => e.annotation?.unique_id)
            .filter(Boolean) as string[]
    );

    // Prefix conflicts among user-mapped keys
    const conflicts = findPrefixConflicts(keyEntries);
    if (conflicts.length === 0) {
        console.log('\x1b[32m✓ No prefix conflicts among user mappings.\x1b[0m');
    } else {
        console.log(`\x1b[31m✗ ${conflicts.length} prefix conflict(s) among user mappings:\x1b[0m`);
        for (const { blocked, blockedBy } of conflicts) {
            console.log(`  "${blocked.key}" blocked by \x1b[33m${blockedBy.key}\x1b[0m (${blockedBy.short})`);
        }
    }

    // Invalid unique_ids from mapcmdkey calls
    const invalidIds: Array<{ key: string; id: string }> = [];
    for (const [key, info] of rawKeys.entries()) {
        if (info.type === 'mapcmdkey' && !validIds.has(info.target)) {
            invalidIds.push({ key, id: info.target });
        }
    }

    if (invalidIds.length === 0) {
        console.log('\x1b[32m✓ All mapcmdkey unique_ids are valid.\x1b[0m');
    } else {
        console.log(`\x1b[31m✗ ${invalidIds.length} mapcmdkey unique_id(s) not found in report:\x1b[0m`);
        for (const { key, id } of invalidIds) {
            console.log(`  \x1b[31m"${key}" → "${id}" (unknown unique_id)\x1b[0m`);
        }
    }

    // Coverage stats
    const stats = coverageStats(report, mappedIds);
    const pct = stats.total > 0 ? ((stats.mapped / stats.total) * 100).toFixed(1) : '0.0';
    console.log(`\nCoverage: ${stats.mapped}/${stats.total} unique_ids mapped (${pct}%)`);
    console.log(`Unmapped: ${stats.unmapped} commands have no user binding\n`);

    if (stats.unmapped > 0 && process.argv.includes('--verbose')) {
        console.log('Unmapped unique_ids:');
        for (const id of stats.unmappedIds) {
            console.log(`  ${id}`);
        }
        console.log('');
    } else if (stats.unmapped > 0) {
        console.log('  (use --verbose to list unmapped ids)\n');
    }

    return conflicts.length + invalidIds.length;
}

// Prefix analysis — grouped by first key character, mode-aware
function showPrefixKeys(report: Report): void {
    const entries = reportToEntries(report);

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

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
import { readFileSync } from 'fs';
import { normalizeKey, isPrefix } from './lib/mappings-report/source-validation';

const ROOT = path.join(import.meta.dir, '..');

interface MappingEntry {
    key?: string;
    mode?: string;
    annotation?: {
        unique_id?: string;
        short?: string;
        description?: string;
        category?: string;
        tags?: string[];
    };
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

interface SlideFrame {
    path: string;
    scenario?: string;
    step?: string;
}

interface SlideSection {
    label: string;
    frames: SlideFrame[];
    videoPath?: string;
}

// --- Magic-key prefix support ---------------------------------------------
//
// Some commands (e.g. cmd_tab_close_m mapped to 'tc') don't act on their own:
// after the prefix key they wait for ONE more keystroke, a "magic key", which
// selects a direction/variant. Source of truth:
//
//   - Which commands consume a magic key: source annotation `tags` includes
//     'magic' (mirrors src/content_scripts/front.ts:628 `tags.includes('magic')`).
//     Two-level folder commands (description contains "next key = folder", e.g.
//     cmd_bookmark_add_m in src/content_scripts/common/commands/settings.ts:273)
//     are excluded — their immediate next key is a bookmark folder, not a magic key.
//   - key -> MagicDirection: runtime default at
//     src/content_scripts/common/runtime.ts:127-142, overridable by the user's
//     `settings.magicKeys` in ~/.surfingkeys-2026.js (loadMagicKeys reads that).
//   - MagicDirection -> human label: src/content_scripts/front.ts:629-645.

const MAGIC_DIRECTION_LABELS: Record<string, string> = {
    DirectionLeft: 'tabs left',
    DirectionRight: 'tabs right',
    DirectionLeftInclusive: 'tabs left (incl.)',
    DirectionRightInclusive: 'tabs right (incl.)',
    CurrentTab: 'current tab',
    AllInWindow: 'all in window',
    AllExceptActiveAllWindows: 'all except active (all windows)',
    AllExceptActive: 'all except active',
    ChildrenTabs: 'child tabs',
    ChildrenTabsRecursively: 'child tabs (recursive)',
    OtherWindowsNoPinned: 'other windows (no pinned)',
    AllOtherWindowsTabs: 'all other windows',
    AllIncognitoTabs: 'incognito tabs',
    SameDomain: 'same domain',
    HighlightedTabs: 'highlighted tabs',
};

// Fallback used only when settings.magicKeys can't be read from the user config.
const DEFAULT_MAGIC_KEYS: Record<string, string> = {
    q: 'DirectionLeft', e: 'DirectionRight',
    Q: 'DirectionLeftInclusive', E: 'DirectionRightInclusive',
    t: 'CurrentTab', C: 'AllInWindow',
    g: 'AllExceptActiveAllWindows', c: 'AllExceptActive',
    k: 'ChildrenTabs', K: 'ChildrenTabsRecursively',
    w: 'OtherWindowsNoPinned', W: 'AllOtherWindowsTabs',
    o: 'AllIncognitoTabs', d: 'SameDomain',
};

function loadMagicKeys(): Record<string, string> {
    const configPath = path.join(process.env.HOME || '', '.surfingkeys-2026.js');
    try {
        const code = readFileSync(configPath, 'utf8');
        const block = code.match(/settings\.magicKeys\s*=\s*\{([\s\S]*?)\}/);
        if (block) {
            const table: Record<string, string> = {};
            const re = /(['"])((?:\\.|[^\\])*?)\1\s*:\s*(['"])([A-Za-z]+)\3/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(block[1]!)) !== null) {
                table[m[2]!] = m[4]!;
            }
            if (Object.keys(table).length > 0) return table;
        }
    } catch {
        // fall through to source default
    }
    return { ...DEFAULT_MAGIC_KEYS };
}

function isMagicCommand(entry: MappingEntry | undefined): boolean {
    const tags = entry?.annotation?.tags;
    if (!tags?.includes('magic')) return false;
    // Two-level folder commands take a folder key first, not a magic key.
    if (/next key = folder/i.test(entry?.annotation?.description || '')) return false;
    return true;
}

function formatMagicKeyOptions(magicKeys: Record<string, string>): string {
    return Object.entries(magicKeys)
        .map(([k, dir]) => `${k}=${MAGIC_DIRECTION_LABELS[dir] || dir}`)
        .join('  ');
}

// Fallback for the default (custom-config-key) lookup: when `query` isn't a
// literal custom key, see if it's <magic-prefix><magic-key>. Returns an exit
// code if it resolved (valid or invalid magic key), or null if not a magic
// composition at all (so the caller falls back to normal "not found").
function tryMagicLookup(
    query: string,
    report: Report,
    magicKeys: Record<string, string>
): number | null {
    const cc = report.custom_configuration?.mappings;
    if (!cc) return null;

    const magicIds = new Set<string>();
    for (const e of report.mappings.list) {
        if (isMagicCommand(e) && e.annotation?.unique_id) {
            magicIds.add(e.annotation.unique_id);
        }
    }

    const candidates = cc.filter(
        m =>
            m.unique_id &&
            magicIds.has(m.unique_id) &&
            query.length > m.key.length &&
            query.startsWith(m.key)
    );
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.key.length - a.key.length);
    const chosen = candidates[0]!;
    const prefix = chosen.key;
    const suffix = query.slice(prefix.length);

    const src = report.mappings.list.find(e => e.annotation?.unique_id === chosen.unique_id);
    const uid = chosen.unique_id!;
    const short = src?.annotation?.short || uid;
    const description = src?.annotation?.description || '(no description)';
    const mode = src?.mode || '(unknown)';

    const direction = magicKeys[suffix];

    console.log();
    console.log(`\x1b[36m🔍 Magic-key Lookup\x1b[0m`);
    console.log();
    console.log(`  Base command   \x1b[33m${uid}\x1b[0m`);
    console.log(`  Short label    ${short}`);
    console.log(`  Description    ${description}`);
    console.log(`  Mode           ${mode}`);
    console.log();
    console.log(`  Custom Mapped  yes`);
    console.log(`  Prefix key     \x1b[33m${prefix}\x1b[0m`);

    if (direction) {
        const label = MAGIC_DIRECTION_LABELS[direction] || direction;
        console.log(`  Magic key      \x1b[33m${suffix}\x1b[0m → ${direction} (${label})`);
        console.log();
        console.log(`  \x1b[32m✅ Resolved\x1b[0m — '${prefix}' + '${suffix}' → ${short.replace(/ via magic key$/, '')}: ${label}`);
        console.log();
        return 0;
    }

    console.log(`  Magic key      \x1b[31m'${suffix}' is not a valid magic key for this command\x1b[0m`);
    console.log();
    console.log(`  Valid keys     ${formatMagicKeyOptions(magicKeys)}`);
    console.log();
    return 1;
}

function lookup(args: string[]): number {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: bun scripts/sk.ts lookup <query> [--by-mapping-key] [--by-unique-id]

Looks up a command in the mappings report by custom config key (default), mapping key, or unique_id.

Options:
  --by-mapping-key   Search by default/source key (e.g., '$')
  --by-unique-id     Search by unique identifier (e.g., 'cmd_scroll_rightmost')
  --help, -h         Show this help

Default (no flags): Search by custom config key (e.g., 'gd')

Examples:
  bun scripts/sk.ts lookup gd
  bun scripts/sk.ts lookup '$' --by-mapping-key
  bun scripts/sk.ts lookup cmd_scroll_rightmost --by-unique-id
`);
        return 0;
    }

    const query = args[0];
    const hasByMappingKey = args.includes('--by-mapping-key');
    const hasByUniqueId = args.includes('--by-unique-id');

    console.log(`Loading mappings report...`);
    let report: Report;
    try {
        report = loadJsonReport();
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Error loading report:', msg);
        return 1;
    }

    let matches: MappingEntry[] = [];

    if (hasByUniqueId) {
        // Search by unique_id
        matches = report.mappings.list.filter(e => e.annotation?.unique_id === query);
    } else if (hasByMappingKey) {
        // Search by mapping key with normalization
        const normalizedQuery = normalizeKey(query);
        matches = report.mappings.list.filter(e => {
            if (!e.key) return false;
            // Handle raw keys and CallExpression strings
            let keyStr = e.key;
            if (keyStr.startsWith('<CallExpression:')) {
                // Extract the key from CallExpression format
                const match = keyStr.match(/KeyboardUtils\.encodeKeystroke\("([^"]+)"\)/);
                if (match) keyStr = match[1];
            }
            return normalizeKey(keyStr) === normalizedQuery;
        });
    } else {
        // Default: search by custom config key
        if (!report.custom_configuration?.mappings) {
            console.error(
                `\x1b[31m❌ No custom config found\x1b[0m — custom-config-key lookup requires a config file.`
            );
            console.log(`\nTry --by-mapping-key or --by-unique-id instead.`);
            return 1;
        }
        const customEntry = report.custom_configuration.mappings.find(m => m.key === query);
        if (customEntry && customEntry.unique_id) {
            matches = report.mappings.list.filter(e => e.annotation?.unique_id === customEntry.unique_id);
        }
    }

    if (matches.length === 0) {
        // Fallback (default lookup only): maybe query is <magic-prefix><magic-key>.
        if (!hasByUniqueId && !hasByMappingKey) {
            const rc = tryMagicLookup(query, report, loadMagicKeys());
            if (rc !== null) return rc;
        }
        const searchType = hasByUniqueId ? 'unique_id' : hasByMappingKey ? 'mapping key' : 'custom config key';
        console.log(`\x1b[33m⚠️  Not found\x1b[0m — no command with ${searchType} '${query}'`);
        return 1;
    }

    // Display results
    const magicKeys = loadMagicKeys();
    console.log();
    for (let i = 0; i < matches.length; i++) {
        const entry = matches[i];
        const uid = entry.annotation?.unique_id || '(no unique_id)';
        const short = entry.annotation?.short || entry.key;
        const description = entry.annotation?.description || '(no description)';
        const category = entry.annotation?.category || '(uncategorized)';
        const tags = entry.annotation?.tags?.join(', ') || '(no tags)';

        // Get custom mapping info
        const customKeysStr = entry.custom_mapping?.mappings
            ? entry.custom_mapping.mappings.map(m => m.key).join(', ')
            : '(none)';
        const customMapped = entry.custom_mapping?.hasMapping ? 'yes' : 'no';

        // Get source info
        const sourceFile = entry.source?.file || '(unknown)';
        const sourceLine = entry.source?.line || '?';

        // Get test coverage
        const testCoverage = entry.test_coverage?.hasTest ? 'yes' : 'no';
        const testPaths = entry.test_coverage?.testFiles?.map(f => `tests/playwright/commands/${f}`).join(', ');

        // Validation status
        const validationStatus = entry.validationStatus || '(unknown)';

        // Format key - handle CallExpression format
        let keyStr = entry.key || '(no key)';
        if (keyStr.startsWith('<CallExpression:')) {
            const match = keyStr.match(/KeyboardUtils\.encodeKeystroke\("([^"]+)"\)/);
            if (match) keyStr = match[1];
        }

        console.log(`\x1b[36m🔍 Lookup Result${matches.length > 1 ? ` (${i + 1}/${matches.length})` : ''}\x1b[0m`);
        console.log();
        console.log(`  Unique ID      \x1b[33m${uid}\x1b[0m`);
        console.log(`  Short label    ${short}`);
        console.log(`  Description    ${description}`);
        console.log(`  Category       ${category}`);
        console.log(`  Tags           ${tags}`);
        console.log();
        console.log(`  Default Key    \x1b[33m${keyStr}\x1b[0m`);
        console.log(`  Mode           ${entry.mode}`);
        console.log();
        console.log(`  Custom Mapped  ${customMapped}`);
        console.log(`  Custom Keys    ${customKeysStr}`);
        console.log();
        console.log(`  Source         ${sourceFile}:${sourceLine}`);
        console.log(`  Validation     ${validationStatus}`);
        console.log(`  Test Coverage  ${testCoverage}${testPaths ? `  (${testPaths})` : ''}`);
        console.log();

        if (isMagicCommand(entry)) {
            console.log(`  \x1b[35m⏳ Pending-key prefix\x1b[0m — this key waits for one magic key next:`);
            console.log(`     ${formatMagicKeyOptions(magicKeys)}`);
            console.log();
        }
    }

    return 0;
}

function slidesLookup(args: string[]): number {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: bun scripts/sk.ts slides-lookup <file-url>

Looks up the test and frame referenced by a slides.html file:// URL with a #tN-sM hash.

Example:
  bun scripts/sk.ts slides-lookup 'file:///home/hassen/workspace/surfingkeys/test-artifacts/playwright/slides-scratch-colon-omnibar-trigger.html#t4-s5'
`);
        return 0;
    }

    const rawUrl = args[0] ?? '';

    // Split hash from path
    const hashIdx = rawUrl.indexOf('#');
    const filePart = hashIdx !== -1 ? rawUrl.slice(0, hashIdx) : rawUrl;
    const hash = hashIdx !== -1 ? rawUrl.slice(hashIdx) : '';

    // Resolve file path
    const filePath = filePart.startsWith('file://')
        ? decodeURIComponent(filePart.slice('file://'.length))
        : filePart;

    // Parse #tN-sM
    const hashMatch = hash.match(/^#t(\d+)-s(\d+)$/);
    if (!hashMatch) {
        console.error(`Invalid or missing hash fragment '${hash}'. Expected format: #tN-sM`);
        return 1;
    }
    const testNum = parseInt(hashMatch[1]!);
    const slideNum = parseInt(hashMatch[2]!);
    const testIdx = testNum - 1;
    const frameIdx = slideNum - 1;

    // Read HTML and extract sections JSON
    let html: string;
    try {
        html = readFileSync(filePath, 'utf8');
    } catch (e: unknown) {
        console.error(`Cannot read file: ${filePath}`);
        return 1;
    }

    const sectionsMatch = html.match(/^const sections = (\[[\s\S]*?\]);/m);
    if (!sectionsMatch) {
        console.error('Could not find sections JSON in the HTML file.');
        return 1;
    }

    let sections: SlideSection[];
    try {
        sections = JSON.parse(sectionsMatch[1]!) as SlideSection[];
    } catch {
        console.error('Failed to parse sections JSON.');
        return 1;
    }

    const section = sections[testIdx];
    if (!section) {
        console.error(`Test index ${testIdx} out of range (file has ${sections.length} test(s)).`);
        return 1;
    }

    const frame = section.frames[frameIdx];
    if (!frame) {
        console.error(`Frame index ${frameIdx} out of range (test has ${section.frames.length} frame(s)).`);
        return 1;
    }

    console.log(`\x1b[36mURL\x1b[0m      ${rawUrl}`);
    console.log(`\x1b[36mTest\x1b[0m     #${testNum} of ${sections.length}: ${section.label}`);
    console.log(`\x1b[36mSlide\x1b[0m    #${slideNum} of ${section.frames.length}: ${frame.path}`);
    if (frame.scenario) console.log(`\x1b[36mScenario\x1b[0m ${frame.scenario}`);
    if (frame.step)     console.log(`\x1b[36mStep\x1b[0m     ${frame.step}`);
    if (section.videoPath) console.log(`\x1b[36mVideo\x1b[0m    ${section.videoPath}`);

    return 0;
}

// CLI dispatcher
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`SurfingKeys CLI

Usage:
  bun scripts/sk.ts detect-mapping-conflict <key> [--mode <mode>]
  bun scripts/sk.ts lookup <query> [--by-mapping-key] [--by-unique-id]
  bun scripts/sk.ts slides-lookup <file-url>
  bun scripts/sk.ts --help

Subcommands:
  detect-mapping-conflict   Check if a candidate key has prefix conflicts
  lookup                    Look up a command by custom config key, mapping key, or unique_id
  slides-lookup             Resolve a slides.html file:// URL with #tN-sM hash
`);
    process.exit(0);
}

const [subcommand, ...subArgs] = args;

switch (subcommand) {
    case 'detect-mapping-conflict':
        process.exit(detectMappingConflict(subArgs));
        break;
    case 'lookup':
        process.exit(lookup(subArgs));
        break;
    case 'slides-lookup':
        process.exit(slidesLookup(subArgs));
        break;
    default:
        console.error(`Unknown subcommand: '${subcommand}'. Run with --help for usage.`);
        process.exit(1);
}

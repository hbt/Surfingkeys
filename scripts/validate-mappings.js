#!/usr/bin/env node
/**
 * Validates SurfingKeys user configuration for mapping conflicts.
 * Detects when a key mapping blocks access to other commands.
 *
 * Usage: node scripts/validate-mappings.js [config-file]
 * Default config: ~/.surfingkeys-2026.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Extract all default mappings from docs/cmds.md
function extractDefaultMappings(cmdsPath) {
    const content = fs.readFileSync(cmdsPath, 'utf-8');
    const mappings = new Map(); // key -> description

    // Match table rows: | `key` | description |
    const keyPattern = /\|\s*`([^`]+)`\s*\|\s*([^|]+)\|/g;
    let match;

    while ((match = keyPattern.exec(content)) !== null) {
        let key = match[1];
        const desc = match[2].trim();

        // Decode HTML entities
        key = key
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');

        // Skip if it's a command (starts with `:`)
        if (key.startsWith(':')) continue;

        mappings.set(key, desc);
    }

    return mappings;
}

// Extract user mappings from config file
function extractUserMappings(configPath) {
    if (!fs.existsSync(configPath)) {
        return new Map();
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const mappings = new Map(); // key -> { type, description }

    // Match api.mapkey('key', ...) or api.map('key', ...)
    // Also match mapkey/map/unmap without api prefix
    const patterns = [
        /(?:api\.)?mapkey\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/g,
        /(?:api\.)?map\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/g,
        /(?:api\.)?unmap\s*\(\s*['"]([^'"]+)['"]/g,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const key = match[1];
            const target = match[2] || '(unmapped)';
            const type = pattern.source.includes('unmap') ? 'unmap' :
                         pattern.source.includes('mapkey') ? 'mapkey' : 'map';
            mappings.set(key, { type, target });
        }
    }

    return mappings;
}

// Normalize key for comparison (handle modifier key variations)
function normalizeKey(key) {
    return key
        .replace(/<Ctrl-/gi, '<C-')
        .replace(/<Alt-/gi, '<A-')
        .replace(/<Shift-/gi, '<S-')
        .toLowerCase();
}

// Check if key1 is a prefix of key2
function isPrefix(key1, key2) {
    if (key1 === key2) return false;

    // For special keys like <Ctrl-x>, treat as atomic
    if (key1.startsWith('<') && key1.endsWith('>')) {
        return key2.startsWith(key1);
    }

    return key2.startsWith(key1);
}

// Find all commands blocked by a given key mapping
function findBlockedCommands(mappedKey, defaultMappings) {
    const blocked = [];
    const normalizedMapped = normalizeKey(mappedKey);

    for (const [defaultKey, desc] of defaultMappings) {
        const normalizedDefault = normalizeKey(defaultKey);
        if (isPrefix(normalizedMapped, normalizedDefault)) {
            blocked.push({ key: defaultKey, description: desc });
        }
    }

    return blocked;
}

// Find all commands that would block the given key
function findBlockingCommands(targetKey, defaultMappings) {
    const blocking = [];
    const normalizedTarget = normalizeKey(targetKey);

    for (const [defaultKey, desc] of defaultMappings) {
        const normalizedDefault = normalizeKey(defaultKey);
        if (isPrefix(normalizedDefault, normalizedTarget)) {
            blocking.push({ key: defaultKey, description: desc });
        }
    }

    return blocking;
}

// Count migrated commands (those with unique_id in metadata)
function countMigratedCommands() {
    try {
        const srcDir = path.join(__dirname, '..', 'src');
        // Use grep to find unique_id definitions in JS/TS files
        const grepCmd = `grep -r "unique_id" ${srcDir} --include="*.js" --include="*.ts" 2>/dev/null | grep -c "cmd_"`;
        const migratedCount = parseInt(execSync(grepCmd, { encoding: 'utf-8' }).trim()) || 0;

        return migratedCount;
    } catch (e) {
        return 0;
    }
}

// Main validation
function validate(configPath, cmdsPath) {
    console.log('SurfingKeys Mapping Validator');
    console.log('=============================\n');

    // Load mappings
    const defaultMappings = extractDefaultMappings(cmdsPath);
    const userMappings = extractUserMappings(configPath);

    console.log(`Default mappings (unique keys): ${defaultMappings.size}`);
    console.log(`  Note: SurfingKeys supports multiple modes (Normal/Visual/Insert)`);
    console.log(`  Use: npm run report:migration for mode-based breakdown`);
    console.log(`User mappings: ${userMappings.size}`);

    // Show migration status
    const migratedCount = countMigratedCommands();
    const totalMappings = defaultMappings.size;
    const migrationPercent = totalMappings > 0 ? ((migratedCount / totalMappings) * 100).toFixed(1) : 0;
    console.log(`\nCommand Metadata Migration:`);
    console.log(`  Migrated (with unique_id): ${migratedCount}`);
    console.log(`  Percentage of unique keys: ${migrationPercent}%\n`);

    if (userMappings.size === 0) {
        console.log('No user mappings found. Your config is clean!\n');
        return { blocked: 0, warnings: [] };
    }

    let totalBlocked = 0;
    const warnings = [];

    // Check each user mapping
    for (const [userKey, userInfo] of userMappings) {
        const blocked = findBlockedCommands(userKey, defaultMappings);

        if (blocked.length > 0) {
            totalBlocked += blocked.length;
            const warning = {
                key: userKey,
                type: userInfo.type,
                target: userInfo.target,
                blocked: blocked
            };
            warnings.push(warning);

            console.log(`\x1b[31m✗ "${userKey}" (${userInfo.type}) blocks ${blocked.length} command(s):\x1b[0m`);
            for (const cmd of blocked) {
                console.log(`    \x1b[33m${cmd.key}\x1b[0m - ${cmd.description}`);
            }
            console.log('');
        }
    }

    // Summary
    console.log('─'.repeat(50));
    if (totalBlocked === 0) {
        console.log('\x1b[32m✓ No conflicts detected. All commands are reachable.\x1b[0m');
    } else {
        console.log(`\x1b[31m✗ ${totalBlocked} command(s) blocked by ${warnings.length} mapping(s).\x1b[0m`);
        console.log('\nSuggestion: Use longer key sequences or unmap defaults first.');
    }

    return { blocked: totalBlocked, warnings };
}

// Show which keys have multi-key commands (useful for planning)
function showPrefixKeys(cmdsPath) {
    const defaultMappings = extractDefaultMappings(cmdsPath);

    // Group by first character/key
    const prefixGroups = new Map();

    for (const [key, desc] of defaultMappings) {
        // Get the prefix (first char or first special key)
        let prefix;
        if (key.startsWith('<')) {
            const endIdx = key.indexOf('>');
            prefix = key.slice(0, endIdx + 1);
        } else {
            prefix = key[0];
        }

        if (!prefixGroups.has(prefix)) {
            prefixGroups.set(prefix, []);
        }
        prefixGroups.get(prefix).push({ key, desc });
    }

    console.log('\nKey Prefix Analysis');
    console.log('===================\n');
    console.log('Keys with multiple commands (risky to override):\n');

    const sorted = [...prefixGroups.entries()]
        .filter(([_, cmds]) => cmds.length > 1)
        .sort((a, b) => b[1].length - a[1].length);

    for (const [prefix, cmds] of sorted) {
        console.log(`\x1b[36m${prefix}\x1b[0m (${cmds.length} commands):`);
        for (const cmd of cmds.slice(0, 5)) {
            console.log(`    ${cmd.key} - ${cmd.desc}`);
        }
        if (cmds.length > 5) {
            console.log(`    ... and ${cmds.length - 5} more`);
        }
        console.log('');
    }
}

// CLI
const args = process.argv.slice(2);
const showPrefixes = args.includes('--prefixes') || args.includes('-p');
const configArg = args.find(a => !a.startsWith('-'));

const configPath = configArg || path.join(process.env.HOME, '.surfingkeys-2026.js');
const cmdsPath = path.join(__dirname, '..', 'docs', 'cmds.md');

if (!fs.existsSync(cmdsPath)) {
    console.error(`Error: docs/cmds.md not found. Run 'npm run build:doc-cmds' first.`);
    process.exit(1);
}

if (showPrefixes) {
    showPrefixKeys(cmdsPath);
} else {
    const result = validate(configPath, cmdsPath);
    process.exit(result.blocked > 0 ? 1 : 0);
}

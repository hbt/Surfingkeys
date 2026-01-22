#!/usr/bin/env node
/**
 * Find all migrated and non-migrated commands using AST-like parsing
 * Matches patterns: mapkey, vmapkey, imapkey, cmapkey, command, self.mappings.add
 * Reports exact locations with annotation type detection
 * Usage: node scripts/find-migrated-commands.js
 */

const fs = require('fs');
const path = require('path');

function findAllCommands() {
    const srcDir = path.join(__dirname, '..', 'src');
    const migrated = [];
    const notMigrated = [];

    // Map mode names
    const modeMap = {
        mapkey: 'Normal',
        vmapkey: 'Visual',
        imapkey: 'Insert',
        cmapkey: 'Omnibar',
        command: 'Command',
        'self.mappings.add': 'Omnibar'
    };

    // Scan all JS and TS files
    function scanDir(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filepath = path.join(dir, file);
            const stat = fs.statSync(filepath);

            if (stat.isDirectory()) {
                scanDir(filepath);
            } else if (file.endsWith('.js') || file.endsWith('.ts')) {
                const content = fs.readFileSync(filepath, 'utf-8');
                const relPath = path.relative(srcDir, filepath);

                // Parse mapkey/vmapkey/imapkey/cmapkey patterns
                parseMapkeyPatterns(content, relPath, migrated, notMigrated, modeMap);

                // Parse command patterns
                parseCommandPatterns(content, relPath, migrated, notMigrated);

                // Parse self.mappings.add patterns with direct object (Normal mode - scroll commands)
                parseMappingsAddPatterns(content, relPath, migrated, notMigrated);

                // Parse self.mappings.add patterns (Omnibar with KeyboardUtils)
                parseOmnibarPatterns(content, relPath, migrated, notMigrated);
            }
        }
    }

    function parseMapkeyPatterns(content, relPath, migrated, notMigrated, modeMap) {
        const patterns = ['mapkey', 'vmapkey', 'imapkey', 'cmapkey'];

        for (const pattern of patterns) {
            // Simpler approach: find all mapkey calls and then parse them separately
            // Match: mapkey('key', ...rest of call...)
            const regex = new RegExp(
                `${pattern}\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]\\s*,\\s*([\\s\\S]*?)\\)\\s*;`,
                'g'
            );

            let match;
            while ((match = regex.exec(content)) !== null) {
                const key = match[1];
                const callBody = match[2];  // Everything between key and final );
                const lineNum = content.substring(0, match.index).split('\n').length;

                // Extract annotation from the call body
                // It's either the first parameter after the key, or inside 'annotation:' field
                let annotationStr = null;
                let isMigrated = false;
                let uniqueId = null;
                let shortName = null;

                // Case 1: annotation: {...} object format
                const objMatch = callBody.match(/annotation\s*:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/);
                if (objMatch) {
                    annotationStr = '{' + objMatch[1] + '}';
                    isMigrated = /unique_id\s*:/.test(annotationStr);

                    if (isMigrated) {
                        const idMatch = annotationStr.match(/unique_id\s*:\s*["']([^"']+)["']/);
                        if (idMatch) {
                            uniqueId = idMatch[1];
                        }
                    }

                    const shortMatch = annotationStr.match(/short\s*:\s*["']([^"']+)["']/);
                    if (shortMatch) {
                        shortName = shortMatch[1];
                    }
                } else {
                    // Case 2: Direct string annotation as first param
                    const stringMatch = callBody.match(/^['"`]([^'"`]*)['"`]/);
                    if (stringMatch) {
                        annotationStr = stringMatch[1];
                        shortName = annotationStr.replace(/^#\d+/, '').trim();
                    }
                }

                const mode = modeMap[pattern] || 'Normal';
                const cmdInfo = {
                    file: relPath,
                    lineNum,
                    key,
                    mode,
                    shortName: shortName || '(unnamed)',
                    uniqueId: uniqueId || null
                };

                if (isMigrated && uniqueId) {
                    migrated.push(cmdInfo);
                } else if (annotationStr !== null) {
                    notMigrated.push(cmdInfo);
                }
            }
        }
    }

    function parseMappingsAddPatterns(content, relPath, migrated, notMigrated) {
        // Match: self.mappings.add("key", {annotation: {...}, ...})
        // Captures full object including nested annotations
        const regex = /self\.mappings\.add\s*\(\s*["']([^"']+)["']\s*,\s*\{([\s\S]*?)\}\s*\)/g;

        let match;
        while ((match = regex.exec(content)) !== null) {
            const key = match[1];
            const objectBody = match[2];
            const lineNum = content.substring(0, match.index).split('\n').length;

            // Extract annotation from object body
            let uniqueId = null;
            let shortName = null;
            let isMigrated = false;

            // Look for annotation field
            const annotationMatch = objectBody.match(/annotation\s*:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/);
            if (annotationMatch) {
                const annotationBody = annotationMatch[1];
                isMigrated = /unique_id\s*:/.test(annotationBody);

                if (isMigrated) {
                    const idMatch = annotationBody.match(/unique_id\s*:\s*["']([^"']+)["']/);
                    if (idMatch) {
                        uniqueId = idMatch[1];
                    }
                }

                const shortMatch = annotationBody.match(/short\s*:\s*["']([^"']+)["']/);
                if (shortMatch) {
                    shortName = shortMatch[1];
                }
            } else {
                // Try legacy string annotation as direct object field
                const stringMatch = objectBody.match(/annotation\s*:\s*["']([^"']+)["']/);
                if (stringMatch) {
                    shortName = stringMatch[1].replace(/^#\d+/, '').trim();
                }
            }

            const cmdInfo = {
                file: relPath,
                lineNum,
                key,
                mode: 'Normal',  // self.mappings.add is used in normal mode for scroll commands
                shortName: shortName || '(unnamed)',
                uniqueId: uniqueId || null
            };

            if (isMigrated && uniqueId) {
                migrated.push(cmdInfo);
            } else if (shortName !== null) {
                notMigrated.push(cmdInfo);
            }
        }
    }

    function parseCommandPatterns(content, relPath, migrated, notMigrated) {
        // Match: command('name', 'description', function...)
        const regex = /command\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/g;

        let match;
        while ((match = regex.exec(content)) !== null) {
            const name = match[1];
            const description = match[2];
            const lineNum = content.substring(0, match.index).split('\n').length;

            const cmdInfo = {
                file: relPath,
                lineNum,
                key: name,
                mode: 'Command',
                shortName: description.replace(/^#\d+/, '').trim(),
                uniqueId: null
            };

            notMigrated.push(cmdInfo);
        }
    }

    function parseOmnibarPatterns(content, relPath, migrated, notMigrated) {
        // Match: self.mappings.add(KeyboardUtils.encodeKeystroke('key'), { annotation: ..., ... })
        const regex = /self\.mappings\.add\s*\(\s*KeyboardUtils\.encodeKeystroke\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*,\s*\{([^}]+)\}/gs;

        let match;
        while ((match = regex.exec(content)) !== null) {
            const key = match[1];
            const objectBody = match[2];
            const lineNum = content.substring(0, match.index).split('\n').length;

            // Extract annotation from object
            const annotationMatch = objectBody.match(/annotation\s*:\s*(['"`])([^'"`]*)\1/);
            let shortName = '(unnamed)';
            let isMigrated = false;
            let uniqueId = null;

            if (annotationMatch) {
                shortName = annotationMatch[2];
            }

            // Check for unique_id in object
            const idMatch = objectBody.match(/unique_id\s*:\s*['"`]([^'"`]+)['"`]/);
            if (idMatch) {
                uniqueId = idMatch[1];
                isMigrated = true;
            }

            const cmdInfo = {
                file: relPath,
                lineNum,
                key,
                mode: 'Omnibar',
                shortName,
                uniqueId
            };

            if (isMigrated && uniqueId) {
                migrated.push(cmdInfo);
            } else {
                notMigrated.push(cmdInfo);
            }
        }
    }

    scanDir(srcDir);
    return { migrated, notMigrated };
}

// Main
const { migrated, notMigrated } = findAllCommands();

console.log('Command Migration Status - Deterministic Locations');
console.log('='.repeat(80));
console.log(`✅ Migrated: ${migrated.length}`);
console.log(`⏳ Not migrated: ${notMigrated.length}`);
console.log(`Total commands: ${migrated.length + notMigrated.length}\n`);

// === MIGRATED SECTION ===
console.log('╔ MIGRATED COMMANDS (with unique_id)');
console.log('║' + '='.repeat(78));

// Sort by file then line number
migrated.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.lineNum - b.lineNum;
});

// Group by file
const migratedByFile = {};
for (const cmd of migrated) {
    if (!migratedByFile[cmd.file]) {
        migratedByFile[cmd.file] = [];
    }
    migratedByFile[cmd.file].push(cmd);
}

for (const [file, cmds] of Object.entries(migratedByFile)) {
    console.log(`║ 📄 ${file}`);
    for (const cmd of cmds) {
        console.log(`║   L${cmd.lineNum.toString().padStart(4)}: ${cmd.uniqueId.padEnd(30)} | Key: "${cmd.key}"`);
    }
}

console.log('╚' + '='.repeat(78) + '\n');

// === NOT MIGRATED SECTION ===
console.log('╔ NOT MIGRATED (still using string annotations)');
console.log('║' + '='.repeat(78));

// Sort by file then line number
notMigrated.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.lineNum - b.lineNum;
});

// Group by file
const notMigratedByFile = {};
for (const cmd of notMigrated) {
    if (!notMigratedByFile[cmd.file]) {
        notMigratedByFile[cmd.file] = [];
    }
    notMigratedByFile[cmd.file].push(cmd);
}

if (notMigrated.length === 0) {
    console.log('║ ✨ All commands migrated!');
} else {
    for (const [file, cmds] of Object.entries(notMigratedByFile)) {
        console.log(`║ 📄 ${file}`);
        console.log(`║   (${cmds.length} commands to migrate):`);
        for (const cmd of cmds) {
            console.log(`║   L${cmd.lineNum.toString().padStart(4)}: Key: "${cmd.key.padEnd(8)}" | ${cmd.shortName}`);
        }
    }
}

console.log('╚' + '='.repeat(78) + '\n');

// Summary by File
console.log('\n' + '='.repeat(80));
console.log('Summary by File:');
console.log('─'.repeat(80));
console.log('File'.padEnd(40) + 'Migrated'.padEnd(12) + 'Pending');
console.log('─'.repeat(80));

const allFiles = new Set([...Object.keys(migratedByFile), ...Object.keys(notMigratedByFile)]);
for (const file of Array.from(allFiles).sort()) {
    const m = migratedByFile[file]?.length || 0;
    const n = notMigratedByFile[file]?.length || 0;
    console.log(`${file.padEnd(40)} ${m.toString().padEnd(12)} ${n}`);
}

// Summary by Mode
console.log('\n' + '='.repeat(80));
console.log('Summary by Mode:');
console.log('─'.repeat(80));
console.log('Mode'.padEnd(20) + 'Migrated'.padEnd(12) + 'Pending'.padEnd(12) + 'Total');
console.log('─'.repeat(80));

const modeBreakdown = {};
for (const cmd of migrated) {
    if (!modeBreakdown[cmd.mode]) modeBreakdown[cmd.mode] = { m: 0, n: 0 };
    modeBreakdown[cmd.mode].m++;
}
for (const cmd of notMigrated) {
    if (!modeBreakdown[cmd.mode]) modeBreakdown[cmd.mode] = { m: 0, n: 0 };
    modeBreakdown[cmd.mode].n++;
}

for (const [mode, counts] of Object.entries(modeBreakdown).sort()) {
    const total = counts.m + counts.n;
    const pct = total > 0 ? ((counts.m / total) * 100).toFixed(1) : 0;
    console.log(`${mode.padEnd(20)} ${counts.m.toString().padEnd(12)} ${counts.n.toString().padEnd(12)} ${total} (${pct}% done)`);
}

// Export as JSON for programmatic use
const jsonOutput = path.join(__dirname, '..', 'migrated-commands.json');
fs.writeFileSync(jsonOutput, JSON.stringify({ migrated, notMigrated, summary: { totalMigrated: migrated.length, totalNotMigrated: notMigrated.length } }, null, 2));
console.log(`\n✅ Detailed output saved to: migrated-commands.json`);

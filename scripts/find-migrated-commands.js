#!/usr/bin/env node
/**
 * Find all migrated and non-migrated commands
 * Reports exact locations via AST-like analysis
 * Usage: node scripts/find-migrated-commands.js
 */

const fs = require('fs');
const path = require('path');

function findAllCommands() {
    const srcDir = path.join(__dirname, '..', 'src');
    const migrated = [];
    const notMigrated = [];

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
                const lines = content.split('\n');

                // Find all self.mappings.add() calls
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const keyMatch = line.match(/self\.mappings\.add\s*\(\s*["']([^"']+)["']/);

                    if (keyMatch) {
                        const mappingKey = keyMatch[1];
                        let shortName = null;
                        let uniqueId = null;
                        let isMigrated = false;

                        // Look forward for annotation details (within next 30 lines)
                        for (let j = i; j <= Math.min(lines.length - 1, i + 30); j++) {
                            const searchLine = lines[j];

                            // Look for unique_id
                            const idMatch = searchLine.match(/unique_id\s*:\s*["'](cmd_[^"']+)["']/);
                            if (idMatch) {
                                uniqueId = idMatch[1];
                                isMigrated = true;
                            }

                            // Look for short name
                            if (!shortName) {
                                const shortMatch = searchLine.match(/short\s*:\s*["']([^"']+)["']/);
                                if (shortMatch) {
                                    shortName = shortMatch[1];
                                }
                            }

                            // Look for legacy string annotation (if not already migrated)
                            if (!isMigrated && !shortName) {
                                // Pattern: "description string"
                                const legacyMatch = searchLine.match(/self\.mappings\.add\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/);
                                if (legacyMatch && legacyMatch[2]) {
                                    shortName = legacyMatch[2];
                                }
                            }

                            // Stop if we found the closing of this mapping
                            if (j > i && searchLine.includes(');') && !searchLine.includes('self.mappings.add')) {
                                break;
                            }
                        }

                        const relPath = path.relative(srcDir, filepath);
                        const cmdInfo = {
                            file: relPath,
                            lineNum: i + 1,
                            key: mappingKey,
                            shortName: shortName || '(unnamed)',
                            uniqueId: uniqueId || null
                        };

                        if (isMigrated) {
                            migrated.push(cmdInfo);
                        } else {
                            notMigrated.push(cmdInfo);
                        }
                    }
                }
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

// Summary
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

// Export as JSON for programmatic use
const jsonOutput = path.join(__dirname, '..', 'migrated-commands.json');
fs.writeFileSync(jsonOutput, JSON.stringify({ migrated, notMigrated, summary: { totalMigrated: migrated.length, totalNotMigrated: notMigrated.length } }, null, 2));
console.log(`\n✅ Detailed output saved to: migrated-commands.json`);

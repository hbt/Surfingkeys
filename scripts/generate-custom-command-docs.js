#!/usr/bin/env node

/**
 * Generate custom command documentation from archive branch
 * Extracts amap() calls from config and CustomCommands from hbt.js
 */

const fs = require('fs');
const path = require('path');

// Parse section headers from config file comments
function extractSections(content) {
    const sections = [];
    const lines = content.split('\n');

    let currentSection = 'Uncategorized';

    lines.forEach((line, idx) => {
        // Match section headers: ////// followed by // Section Name
        const sectionMatch = line.match(/^\/+\s*$/);
        if (sectionMatch && idx + 1 < lines.length) {
            const nextLine = lines[idx + 1];
            const nameMatch = nextLine.match(/^\/\/\s*(.+)$/);
            if (nameMatch) {
                currentSection = nameMatch[1].trim();
                sections.push({ name: currentSection, startLine: idx });
            }
        }
    });

    return sections;
}

// Parse amap() calls from config file
function extractAmapCalls(content) {
    const mappings = [];

    // Regex to match: amap("keys", "annotation");
    const regex = /amap\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/g;

    let match;
    const lines = content.split('\n');

    while ((match = regex.exec(content)) !== null) {
        const keys = match[1];
        const annotation = match[2];

        // Find which line this match is on to determine section
        const matchIndex = match.index;
        const lineNumber = content.substring(0, matchIndex).split('\n').length - 1;

        // Find current section based on line number
        let section = 'Uncategorized';
        const sectionComment = lines.slice(0, lineNumber).reverse().find(line =>
            line.match(/^\/\/\s+[A-Z]/) && !line.includes('TODO') && !line.includes('disabled')
        );

        if (sectionComment) {
            const sectionMatch = sectionComment.match(/^\/\/\s+(.+)$/);
            if (sectionMatch) {
                section = sectionMatch[1].trim();
            }
        }

        // Check if this is commented out (disabled)
        const disabled = lines[lineNumber].trimStart().startsWith('//');

        mappings.push({
            keys,
            annotation,
            section,
            disabled,
            lineNumber: lineNumber + 1
        });
    }

    return mappings;
}

// Parse mapkey() calls (some custom commands use mapkey directly)
function extractMapkeyCalls(content) {
    const mappings = [];

    // Match: mapkey("keys", "annotation", CustomCommands.functionName)
    const regex = /mapkey\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,\s*CustomCommands\.(\w+)/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
        const keys = match[1];
        const annotation = match[2];
        const functionName = match[3];

        mappings.push({
            keys,
            annotation,
            functionName,
            section: 'Custom (mapkey)',
            disabled: false
        });
    }

    return mappings;
}

// Extract CustomCommands function definitions from hbt.js
function extractCustomCommands(content) {
    const commands = [];

    // Match: self.functionName = function(...) or self.functionName = async (...) =>
    const regex = /self\.(\w+)\s*=\s*(?:async\s+)?\(?(?:function\s*)?\([^)]*\)\s*(?:=>)?\s*\{/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
        const functionName = match[1];

        // Extract the full function to get comments
        const startIdx = match.index;
        const beforeFunc = content.substring(Math.max(0, startIdx - 200), startIdx);

        // Look for comments above function
        const commentMatch = beforeFunc.match(/\/\/\s*(.+)$/m);
        const comment = commentMatch ? commentMatch[1].trim() : null;

        commands.push({
            functionName,
            comment,
            lineNumber: content.substring(0, startIdx).split('\n').length
        });
    }

    return commands;
}

// Parse "magic" pattern references
function extractMagicCommands(content) {
    const magicCommands = [];

    // Find functions that use tabCheckMagicByKey
    const regex = /self\.(\w+)\s*=\s*async\s*\(k\)\s*=>\s*\{[^}]*tabCheckMagicByKey\(k\)/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
        magicCommands.push({
            functionName: match[1],
            isMagic: true
        });
    }

    return magicCommands;
}

// Format markdown table
function formatMarkdownTable(rows) {
    if (rows.length === 0) return '';

    const numCols = Math.max(...rows.map(r => r.length));
    const colWidths = new Array(numCols).fill(0);

    rows.forEach(row => {
        row.forEach((cell, i) => {
            colWidths[i] = Math.max(colWidths[i], cell.length);
        });
    });

    const formattedLines = rows.map(row => {
        const formattedCells = [];

        for (let i = 0; i < numCols; i++) {
            const cell = row[i] || '';
            const cellWidth = cell.length;
            const padding = colWidths[i] - cellWidth;

            let formattedCell;
            if (cell.match(/^-+$/)) {
                formattedCell = '-'.repeat(colWidths[i]);
            } else {
                formattedCell = cell + ' '.repeat(padding);
            }

            formattedCells.push(formattedCell);
        }

        return '| ' + formattedCells.join(' | ') + ' |';
    });

    return formattedLines.join('\n') + '\n';
}

// Generate markdown documentation
function generateMarkdown(amapMappings, mapkeyMappings, customCommands, magicCommands) {
    let md = '# Custom Commands Reference (Archive)\n\n';
    md += '<!-- Generated by scripts/generate-custom-command-docs.js from archive branch -->\n\n';
    md += `**Generated**: ${new Date().toISOString().split('T')[0]}\n\n`;
    md += '**Source Branch**: `archive/hbt-master-manifest-v2-fork-2018-2025`\n\n';

    md += '## Overview\n\n';
    md += 'This document catalogs all custom commands and keybindings from the 2018-2025 fork.\n\n';
    md += '**Command Sources**:\n';
    md += '- `content_scripts/hbt.js` - Custom command implementations\n';
    md += '- `~/.surfingkeysrc` - Keybinding mappings (via symlink)\n\n';
    md += '## Scope\n\n';
    md += 'This inventory covers **generic key mappings only** (`amap()` and `mapkey()` calls).\n\n';
    md += '**Excluded from analysis:**\n';
    md += '- Site-specific key overrides (YouTube, etc.)\n';
    md += '- Custom bookmark collections\n';
    md += '- URL-specific configurations\n';
    md += '- Private functions with hardcoded URLs\n\n';

    // Statistics
    const activeCommands = amapMappings.filter(m => !m.disabled);
    const disabledCommands = amapMappings.filter(m => m.disabled);

    md += '## Statistics\n\n';
    md += `- Total keybindings: ${amapMappings.length + mapkeyMappings.length}\n`;
    md += `  - Active: ${activeCommands.length + mapkeyMappings.length}\n`;
    md += `  - Disabled/Commented: ${disabledCommands.length}\n`;
    md += `- Custom implementations: ${customCommands.length}\n`;
    md += `- Magic pattern commands: ${magicCommands.length}\n\n`;

    md += '---\n\n';

    md += '## Table of Contents\n\n';

    // Get unique sections
    const sections = [...new Set(amapMappings.map(m => m.section))].sort();
    sections.forEach(section => {
        md += `- [${section}](#${section.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-')})\n`;
    });
    md += '- [Custom Commands (mapkey)](#custom-commands-mapkey)\n';
    md += '- [Magic Pattern Commands](#magic-pattern-commands)\n';
    md += '- [Disabled Commands](#disabled-commands)\n\n';

    md += '---\n\n';

    // Group by section
    sections.forEach(section => {
        const sectionMappings = amapMappings.filter(m => m.section === section && !m.disabled);
        if (sectionMappings.length === 0) return;

        md += `## ${section}\n\n`;

        const tableRows = [
            ['Keybinding', 'Description'],
            ['---', '---']
        ];

        sectionMappings.forEach(m => {
            const keys = '`' + m.keys.replace(/\|/g, '\\|') + '`';
            const desc = m.annotation.replace(/\|/g, '\\|');
            tableRows.push([keys, desc]);
        });

        md += formatMarkdownTable(tableRows);
        md += '\n';
    });

    // mapkey commands
    if (mapkeyMappings.length > 0) {
        md += '## Custom Commands (mapkey)\n\n';
        md += 'These commands are defined using `mapkey()` and call `CustomCommands` functions.\n\n';

        const tableRows = [
            ['Keybinding', 'Description', 'Function'],
            ['---', '---', '---']
        ];

        mapkeyMappings.forEach(m => {
            const keys = '`' + m.keys.replace(/\|/g, '\\|') + '`';
            const desc = m.annotation.replace(/\|/g, '\\|');
            const func = '`' + m.functionName + '`';
            tableRows.push([keys, desc, func]);
        });

        md += formatMarkdownTable(tableRows);
        md += '\n';
    }

    // Magic pattern commands
    if (magicCommands.length > 0) {
        md += '## Magic Pattern Commands\n\n';
        md += 'Commands that support directional/count modifiers (e.g., `2gt` for "2 tabs right").\n\n';
        md += 'See [Custom Glossary](custom-glossary.md#magic-navigation-pattern) for details.\n\n';

        const tableRows = [
            ['Function Name', 'Location'],
            ['---', '---']
        ];

        magicCommands.forEach(m => {
            const func = '`' + m.functionName + '`';
            const loc = '`content_scripts/hbt.js`';
            tableRows.push([func, loc]);
        });

        md += formatMarkdownTable(tableRows);
        md += '\n';
    }

    // Disabled commands
    if (disabledCommands.length > 0) {
        md += '## Disabled Commands\n\n';
        md += 'Commands that are commented out in the configuration.\n\n';

        const tableRows = [
            ['Keybinding', 'Description', 'Section'],
            ['---', '---', '---']
        ];

        disabledCommands.forEach(m => {
            const keys = '`' + m.keys.replace(/\|/g, '\\|') + '`';
            const desc = m.annotation.replace(/\|/g, '\\|');
            const section = m.section;
            tableRows.push([keys, desc, section]);
        });

        md += formatMarkdownTable(tableRows);
        md += '\n';
    }

    md += '---\n\n';
    md += '## Implementation Reference\n\n';
    md += 'All custom command implementations are in `content_scripts/hbt.js`.\n\n';
    md += '**Key files**:\n';
    md += '- `content_scripts/hbt.js` - Implementation (1,617 lines)\n';
    md += '- `surfingskeysrc-config-example.js` - Config example (737 lines)\n';
    md += '- `~/.surfingkeysrc` - User config (actual keybindings)\n\n';

    return md;
}

// Main execution
function main() {
    console.log('Extracting custom command definitions from archive branch...\n');

    // Read source files (archive paths)
    // Use symlink to actual .surfingkeysrc (not the old example file)
    const configPath = path.join(__dirname, '..', '.surfingkeysrc.js');
    const hbtPath = path.join(__dirname, '..', 'content_scripts', 'hbt.js');

    console.log(`Reading config: ${configPath}`);
    console.log('Note: Extracting only amap()/mapkey() calls, excluding site-specific configs and bookmarks\n');
    const configJs = fs.readFileSync(configPath, 'utf8');

    console.log(`Reading hbt.js: ${hbtPath}`);
    const hbtJs = fs.readFileSync(hbtPath, 'utf8');

    // Extract mappings
    console.log('\nExtracting amap() definitions...');
    const amapMappings = extractAmapCalls(configJs);
    console.log(`  Found ${amapMappings.length} amap() calls`);

    console.log('Extracting mapkey() definitions...');
    const mapkeyMappings = extractMapkeyCalls(configJs);
    console.log(`  Found ${mapkeyMappings.length} mapkey() calls`);

    console.log('Extracting CustomCommands implementations...');
    const customCommands = extractCustomCommands(hbtJs);
    console.log(`  Found ${customCommands.length} CustomCommands functions`);

    console.log('Extracting magic pattern commands...');
    const magicCommands = extractMagicCommands(hbtJs);
    console.log(`  Found ${magicCommands.length} magic pattern commands`);

    // Generate markdown
    console.log('\nGenerating markdown documentation...');
    const markdown = generateMarkdown(amapMappings, mapkeyMappings, customCommands, magicCommands);

    // Write to file
    const outputPath = path.join(__dirname, '..', 'docs', 'archive-analysis', 'custom-commands.md');
    fs.writeFileSync(outputPath, markdown, 'utf8');

    console.log(`\n✓ Documentation generated: ${outputPath}`);
    console.log(`\nSummary:`);
    console.log(`  - Total keybindings: ${amapMappings.length + mapkeyMappings.length}`);
    console.log(`  - Custom implementations: ${customCommands.length}`);
    console.log(`  - Magic pattern commands: ${magicCommands.length}`);
}

if (require.main === module) {
    main();
}

module.exports = { extractAmapCalls, extractMapkeyCalls, extractCustomCommands, extractMagicCommands, generateMarkdown };

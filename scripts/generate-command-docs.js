#!/usr/bin/env node

/**
 * Generate command documentation from source files
 * Extracts mapkey, vmapkey, imapkey, and command definitions
 */

const fs = require('fs');
const path = require('path');

// Feature group names based on annotation patterns
const FEATURE_GROUPS = {
    0: 'Help',
    1: 'Mouse Click',
    2: 'Scroll Page / Element',
    3: 'Tabs',
    4: 'Page Navigation',
    5: 'Sessions',
    6: 'Search selected with',
    7: 'Clipboard',
    8: 'Omnibar',
    9: 'Visual Mode',
    10: 'vim-like marks',
    11: 'Settings',
    12: 'Chrome URLs',
    13: 'Proxy',
    14: 'Misc',
    15: 'Insert Mode'
};

// Parse mapkey/vmapkey/imapkey calls
function extractMappings(content, type = 'mapkey') {
    const mappings = [];

    // Regex to match mapkey('key', 'annotation', function...) or mapkey('key', 'annotation', handler)
    // This handles multi-line definitions
    const regex = new RegExp(`${type}\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]\\s*,\\s*['"\`]([^'"\`]+)['"\`]`, 'g');

    let match;
    while ((match = regex.exec(content)) !== null) {
        const key = match[1];
        const annotation = match[2];

        // Parse annotation: #<group><description>
        const annotationMatch = annotation.match(/^#(\d+)(.*)$/);
        if (annotationMatch) {
            const featureGroup = parseInt(annotationMatch[1]);
            const description = annotationMatch[2].trim();

            mappings.push({
                key,
                description,
                featureGroup,
                mode: type === 'mapkey' ? 'Normal' :
                      type === 'vmapkey' ? 'Visual' :
                      type === 'imapkey' ? 'Insert' :
                      type === 'cmapkey' ? 'Omnibar' : 'Normal'
            });
        } else {
            // No feature group, use description as-is
            mappings.push({
                key,
                description: annotation,
                featureGroup: 14, // Misc
                mode: type === 'mapkey' ? 'Normal' :
                      type === 'vmapkey' ? 'Visual' :
                      type === 'imapkey' ? 'Insert' :
                      type === 'cmapkey' ? 'Omnibar' : 'Normal'
            });
        }
    }

    return mappings;
}

// Parse command definitions
function extractCommands(content) {
    const commands = [];

    // Match: command('name', 'description', function...)
    const regex = /command\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
        const name = match[1];
        const description = match[2];

        // Parse annotation if it has #<group>
        const annotationMatch = description.match(/^#(\d+)(.*)$/);
        if (annotationMatch) {
            const featureGroup = parseInt(annotationMatch[1]);
            const desc = annotationMatch[2].trim();
            commands.push({ name, description: desc, featureGroup });
        } else {
            commands.push({ name, description, featureGroup: 14 });
        }
    }

    return commands;
}

// Parse omnibar mappings
function extractOmnibarMappings(content) {
    const mappings = [];

    // Match: self.mappings.add(KeyboardUtils.encodeKeystroke("<Key>"), { ... })
    // We need to capture the entire add call including multiline
    const addRegex = /self\.mappings\.add\(KeyboardUtils\.encodeKeystroke\(['"`]([^'"`]+)['"`]\),\s*\{([^}]+)\}/gs;

    let match;
    while ((match = addRegex.exec(content)) !== null) {
        const key = match[1];
        const objectBody = match[2];

        // Extract annotation
        const annotationMatch = objectBody.match(/annotation:\s*['"`]([^'"`]+)['"`]/);
        const annotation = annotationMatch ? annotationMatch[1] : null;

        // Extract feature_group
        const featureGroupMatch = objectBody.match(/feature_group:\s*(\d+)/);
        const featureGroup = featureGroupMatch ? parseInt(featureGroupMatch[1]) : 14;

        if (annotation) {
            mappings.push({
                key,
                description: annotation,
                featureGroup,
                mode: 'Omnibar'
            });
        }
    }

    return mappings;
}

// Format markdown table with proper column alignment
function formatMarkdownTable(rows) {
    if (rows.length === 0) return '';

    // Calculate max width for each column based on actual string length
    const numCols = Math.max(...rows.map(r => r.length));
    const colWidths = new Array(numCols).fill(0);

    rows.forEach(row => {
        row.forEach((cell, i) => {
            // Use actual string length, not display length
            // This ensures HTML entities like &lt; (4 chars) are counted correctly
            colWidths[i] = Math.max(colWidths[i], cell.length);
        });
    });

    // Format each row
    const formattedLines = rows.map((row, rowIdx) => {
        const formattedCells = [];

        for (let i = 0; i < numCols; i++) {
            const cell = row[i] || '';
            const cellWidth = cell.length;
            const padding = colWidths[i] - cellWidth;

            let formattedCell;
            // Check if this is a separator row (contains only dashes)
            if (cell.match(/^-+$/)) {
                formattedCell = '-'.repeat(colWidths[i]);
            } else {
                // Left-align text with padding
                formattedCell = cell + ' '.repeat(padding);
            }

            formattedCells.push(formattedCell);
        }

        return '| ' + formattedCells.join(' | ') + ' |';
    });

    return formattedLines.join('\n') + '\n';
}

// Generate markdown documentation
function generateMarkdown(mappings, commands) {
    let md = '# Surfingkeys Commands Reference\n\n';
    md += '<!-- Generated by scripts/generate-command-docs.js. Update this documentation by running: npm run build:doc-cmds -->\n\n';
    md += `**Generated**: ${new Date().toISOString().split('T')[0]}\n\n`;

    md += '## Table of Contents\n\n';
    md += '- [Keyboard Mappings](#keyboard-mappings)\n';
    Object.entries(FEATURE_GROUPS).forEach(([id, name]) => {
        md += `  - [${name}](#${name.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '--')})\n`;
    });
    md += '- [Omnibar Commands](#omnibar-commands)\n\n';

    md += '---\n\n';
    md += '## Keyboard Mappings\n\n';

    // Group mappings by mode
    const modes = ['Normal', 'Visual', 'Insert'];

    modes.forEach(mode => {
        const modeMappings = mappings.filter(m => m.mode === mode);
        if (modeMappings.length === 0) return;

        md += `### ${mode} Mode\n\n`;

        // Group by feature group
        const byFeatureGroup = {};
        modeMappings.forEach(m => {
            if (!byFeatureGroup[m.featureGroup]) {
                byFeatureGroup[m.featureGroup] = [];
            }
            byFeatureGroup[m.featureGroup].push(m);
        });

        // Sort by feature group ID
        const sortedGroups = Object.keys(byFeatureGroup).sort((a, b) => parseInt(a) - parseInt(b));

        sortedGroups.forEach(groupId => {
            const groupName = FEATURE_GROUPS[groupId] || 'Misc';
            const items = byFeatureGroup[groupId];

            md += `#### ${groupName}\n\n`;

            // Build table rows
            const tableRows = [
                ['Key', 'Description'],
                ['---', '---']
            ];

            items.forEach(item => {
                const key = '`' + item.key.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|') + '`';
                const desc = item.description.replace(/\|/g, '\\|');
                tableRows.push([key, desc]);
            });

            md += formatMarkdownTable(tableRows);
            md += '\n';
        });
    });

    // Omnibar mappings
    const omnibarMappings = mappings.filter(m => m.mode === 'Omnibar');
    if (omnibarMappings.length > 0) {
        md += '### Omnibar Mode\n\n';
        md += 'These keys work when the Omnibar is open.\n\n';

        // Build table rows
        const tableRows = [
            ['Key', 'Description'],
            ['---', '---']
        ];

        omnibarMappings.forEach(item => {
            const key = '`' + item.key.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|') + '`';
            const desc = item.description.replace(/\|/g, '\\|');
            tableRows.push([key, desc]);
        });

        md += formatMarkdownTable(tableRows);
        md += '\n';
    }

    md += '---\n\n';
    md += '## Omnibar Commands\n\n';
    md += 'Commands are executed by pressing `:` to open the command omnibar, then typing the command name.\n\n';

    // Group commands by feature group
    const commandsByGroup = {};
    commands.forEach(cmd => {
        if (!commandsByGroup[cmd.featureGroup]) {
            commandsByGroup[cmd.featureGroup] = [];
        }
        commandsByGroup[cmd.featureGroup].push(cmd);
    });

    const sortedCommandGroups = Object.keys(commandsByGroup).sort((a, b) => parseInt(a) - parseInt(b));

    sortedCommandGroups.forEach(groupId => {
        const groupName = FEATURE_GROUPS[groupId] || 'Misc';
        const items = commandsByGroup[groupId];

        md += `### ${groupName}\n\n`;

        // Build table rows
        const tableRows = [
            ['Command', 'Description'],
            ['---', '---']
        ];

        items.forEach(cmd => {
            const name = '`' + cmd.name.replace(/\|/g, '\\|') + '`';
            const desc = cmd.description.replace(/\|/g, '\\|');
            tableRows.push([name, desc]);
        });

        md += formatMarkdownTable(tableRows);
        md += '\n';
    });

    md += '---\n\n';
    md += '**Note**: This documentation is auto-generated from source code. To update, run `npm run build:doc-cmds`.\n';

    return md;
}

// Main execution
function main() {
    const srcDir = path.join(__dirname, '..', 'src');

    console.log('Extracting command definitions from source files...\n');

    // Read source files
    const defaultJs = fs.readFileSync(path.join(srcDir, 'content_scripts/common/default.js'), 'utf8');
    const commandJs = fs.readFileSync(path.join(srcDir, 'content_scripts/ui/command.js'), 'utf8');
    const omnibarJs = fs.readFileSync(path.join(srcDir, 'content_scripts/ui/omnibar.js'), 'utf8');

    // Extract all mappings
    let allMappings = [];

    console.log('Extracting mapkey definitions...');
    allMappings = allMappings.concat(extractMappings(defaultJs, 'mapkey'));

    console.log('Extracting vmapkey definitions...');
    allMappings = allMappings.concat(extractMappings(defaultJs, 'vmapkey'));

    console.log('Extracting imapkey definitions...');
    allMappings = allMappings.concat(extractMappings(defaultJs, 'imapkey'));

    console.log('Extracting omnibar mappings...');
    allMappings = allMappings.concat(extractOmnibarMappings(omnibarJs));

    console.log('Extracting command definitions...');
    const commands = extractCommands(commandJs);

    console.log(`\nFound ${allMappings.length} keyboard mappings`);
    console.log(`Found ${commands.length} omnibar commands`);

    // Generate markdown
    console.log('\nGenerating markdown documentation...');
    const markdown = generateMarkdown(allMappings, commands);

    // Write to file
    const outputPath = path.join(__dirname, '..', 'docs', 'cmds.md');
    fs.writeFileSync(outputPath, markdown, 'utf8');

    console.log(`\n✓ Documentation generated: ${outputPath}`);
}

if (require.main === module) {
    main();
}

module.exports = { extractMappings, extractCommands, extractOmnibarMappings, generateMarkdown };

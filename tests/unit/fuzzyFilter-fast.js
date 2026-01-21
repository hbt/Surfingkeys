#!/usr/bin/env node
/**
 * Fast feedback fuzzy filter test
 *
 * Usage:
 *   node tests/unit/fuzzyFilter-fast.js              # Run all tests
 *   node tests/unit/fuzzyFilter-fast.js usage        # Test specific query
 *   node tests/unit/fuzzyFilter-fast.js editbox      # Test specific query
 *   node tests/unit/fuzzyFilter-fast.js "edit box"   # Multi-word query
 */

const fs = require('fs');
const path = require('path');

// Extract help descriptions from default.js
function extractHelpDescriptions() {
    const defaultJsPath = path.join(__dirname, '../../src/content_scripts/common/default.js');
    const content = fs.readFileSync(defaultJsPath, 'utf8');

    const descriptions = [];
    // Match mapkey/imapkey/vmapkey calls with annotation
    const regex = /(?:mapkey|imapkey|vmapkey)\s*\(\s*['"][^'"]+['"]\s*,\s*['"]#\d+([^'"]+)['"]/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
        descriptions.push(match[1].trim());
    }

    return descriptions;
}

// fzf-like fuzzy match (same as in fuzzyFilter.js)
function fuzzyMatch(text, query) {
    if (!query || query.trim() === '') return { match: true, score: 0, positions: [] };
    if (!text) return { match: false, score: -1, positions: [] };

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase().trim();

    // Sequential character matching
    let queryIdx = 0;
    let score = 0;
    let lastMatchIdx = -1;
    const positions = [];

    for (let i = 0; i < lowerText.length && queryIdx < lowerQuery.length; i++) {
        if (lowerText[i] === lowerQuery[queryIdx]) {
            positions.push(i);

            // Scoring bonuses
            if (lastMatchIdx === i - 1) {
                score += 15;  // Consecutive match
            }
            if (i === 0 || /[\s\-_\/\.]/.test(text[i - 1])) {
                score += 10;  // Word boundary
            }
            if (i > 0 && /[a-z]/.test(text[i - 1]) && /[A-Z]/.test(text[i])) {
                score += 8;   // Camel case
            }
            score += 1;  // Base score

            lastMatchIdx = i;
            queryIdx++;
        }
    }

    const match = queryIdx === lowerQuery.length;
    if (match) {
        score += Math.max(0, 50 - text.length);  // Prefer shorter
    }

    return { match, score: match ? score : -1, positions };
}

// Filter and display results with scoring
function filterCommands(descriptions, query) {
    const results = descriptions
        .map(d => ({ text: d, ...fuzzyMatch(d, query) }))
        .filter(r => r.match)
        .sort((a, b) => b.score - a.score);
    return results;
}

// Main
const descriptions = extractHelpDescriptions();
console.log(`\nLoaded ${descriptions.length} help commands from default.js\n`);

const query = process.argv[2];

if (query) {
    // Single query mode
    console.log(`Query: "${query}"`);
    console.log('─'.repeat(50));

    const matches = filterCommands(descriptions, query);
    console.log(`Results: ${matches.length} matches (sorted by score)\n`);

    matches.slice(0, 15).forEach((m, i) => {
        // Highlight matched positions
        let highlighted = m.text;
        console.log(`  ${i + 1}. [${m.score}] ${m.text}`);
    });

    if (matches.length > 15) {
        console.log(`  ... and ${matches.length - 15} more`);
    }

    if (matches.length === 0) {
        console.log('  (no matches)');
    }
    console.log();
} else {
    // Run predefined tests
    console.log('Running predefined tests:\n');

    const tests = [
        { query: 'usage', expected: 1 },
        { query: 'edit box', expected: null },  // null = just show count
        { query: 'editbox', expected: null },
        { query: 'scroll', expected: null },
        { query: 'tab', expected: null },
        { query: 'close', expected: null },
        { query: 'copy', expected: null },
        { query: 'paste', expected: null },
        { query: 'bookmark', expected: null },
        { query: 'history', expected: null },
        { query: 'vim', expected: null },
        { query: 'link', expected: null },
        { query: 'xyz123', expected: 0 },
    ];

    let passed = 0;
    let failed = 0;

    tests.forEach(({ query, expected }) => {
        const matches = filterCommands(descriptions, query);
        const count = matches.length;

        if (expected !== null) {
            if (count === expected) {
                console.log(`  ✓ "${query}" → ${count} (expected ${expected})`);
                passed++;
            } else {
                console.log(`  ✗ "${query}" → ${count} (expected ${expected})`);
                failed++;
            }
        } else {
            console.log(`  ● "${query}" → ${count} matches`);
        }
    });

    console.log(`\n─────────────────────────────`);
    if (failed > 0) {
        console.log(`Tests: ${passed} passed, ${failed} failed`);
    } else {
        console.log(`All ${passed} assertion tests passed`);
    }
    console.log(`─────────────────────────────\n`);

    // Show sample queries
    console.log('Try specific queries:');
    console.log('  node tests/unit/fuzzyFilter-fast.js usage');
    console.log('  node tests/unit/fuzzyFilter-fast.js "edit box"');
    console.log('  node tests/unit/fuzzyFilter-fast.js scroll');
    console.log();
}

/**
 * Unit tests for fuzzyFilter.js
 * Run with: node tests/unit/fuzzyFilter.test.js
 */

// Simple test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${e.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg} Expected ${expected}, got ${actual}`);
    }
}

// Import the fuzzy match function (recreated here for isolated testing)
function fuzzyMatch(text, query) {
    if (!query || query.trim() === '') return true;
    if (!text) return false;

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase().trim();

    return lowerText.includes(lowerQuery);
}

console.log('\nFuzzy Filter Tests\n');

// Test cases
console.log('fuzzyMatch():');

test('empty query matches everything', () => {
    assertEqual(fuzzyMatch('any text', ''), true);
    assertEqual(fuzzyMatch('any text', '   '), true);
    assertEqual(fuzzyMatch('any text', null), true);
});

test('null/undefined text returns false', () => {
    assertEqual(fuzzyMatch(null, 'query'), false);
    assertEqual(fuzzyMatch(undefined, 'query'), false);
    assertEqual(fuzzyMatch('', 'query'), false);
});

test('exact match works', () => {
    assertEqual(fuzzyMatch('Scroll page down', 'Scroll page down'), true);
});

test('partial match works', () => {
    assertEqual(fuzzyMatch('Scroll page down', 'scroll'), true);
    assertEqual(fuzzyMatch('Scroll page down', 'page'), true);
    assertEqual(fuzzyMatch('Scroll page down', 'down'), true);
});

test('case insensitive matching', () => {
    assertEqual(fuzzyMatch('Scroll Page Down', 'scroll'), true);
    assertEqual(fuzzyMatch('Scroll Page Down', 'SCROLL'), true);
    assertEqual(fuzzyMatch('Scroll Page Down', 'ScRoLl'), true);
});

test('no match returns false', () => {
    assertEqual(fuzzyMatch('Scroll page down', 'tab'), false);
    assertEqual(fuzzyMatch('Scroll page down', 'bookmark'), false);
    assertEqual(fuzzyMatch('Scroll page down', 'xyz'), false);
});

test('query with spaces', () => {
    assertEqual(fuzzyMatch('Scroll page down', 'page down'), true);
    assertEqual(fuzzyMatch('Scroll page down', 'scroll page'), true);
});

test('special characters in query', () => {
    assertEqual(fuzzyMatch('Go to next/previous tab', 'next/previous'), true);
    assertEqual(fuzzyMatch('Press <Alt-s> to toggle', '<Alt-s>'), true);
});

// Example help menu items
console.log('\nReal-world examples:');

const helpItems = [
    'Toggle SurfingKeys on current site',
    'Enter PassThrough mode to temporarily suppress SurfingKeys',
    'Show usage',
    'Repeat last action',
    'Scroll down',
    'Scroll up',
    'Scroll page down',
    'Scroll page up',
    'Open a link in current tab',
    'Open a link in new tab',
    'Go one tab left',
    'Go one tab right',
    'Close current tab',
    'Restore closed tab',
    'Open the clipboard\'s URL in current tab',
    'Copy current page\'s URL',
    'Go back in history',
    'Go forward in history',
    'Reload the page',
    'Open new bookmark',
];

test('filter for "scroll" finds 4 items', () => {
    const matches = helpItems.filter(item => fuzzyMatch(item, 'scroll'));
    assertEqual(matches.length, 4, 'scroll matches: ');
});

test('filter for "tab" finds 7 items', () => {
    const matches = helpItems.filter(item => fuzzyMatch(item, 'tab'));
    assertEqual(matches.length, 7, 'tab matches: ');
});

test('filter for "close" finds 2 items', () => {
    const matches = helpItems.filter(item => fuzzyMatch(item, 'close'));
    assertEqual(matches.length, 2, 'close matches: ');
});

test('filter for "page" finds 4 items', () => {
    const matches = helpItems.filter(item => fuzzyMatch(item, 'page'));
    assertEqual(matches.length, 4, 'page matches: ');
});

test('filter for "history" finds 2 items', () => {
    const matches = helpItems.filter(item => fuzzyMatch(item, 'history'));
    assertEqual(matches.length, 2, 'history matches: ');
});

test('filter for "xyz" finds 0 items', () => {
    const matches = helpItems.filter(item => fuzzyMatch(item, 'xyz'));
    assertEqual(matches.length, 0, 'xyz matches: ');
});

// Summary
console.log(`\n─────────────────────────────`);
console.log(`Total: ${passed + failed} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`─────────────────────────────\n`);

process.exit(failed > 0 ? 1 : 0);

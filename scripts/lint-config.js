#!/usr/bin/env node

/**
 * Lints the Surfingkeys config file (.surfingkeysrc.js)
 * Runs: syntax check, ESLint, and format validation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const configPath = path.join(process.env.HOME, 'workspace/surfingkeys/.surfingkeysrc.js');

if (!fs.existsSync(configPath)) {
    console.error(`❌ Config file not found: ${configPath}`);
    process.exit(1);
}

let hasErrors = false;

// 1. Syntax check
console.log('Checking syntax...');
try {
    execSync(`node --check "${configPath}"`, { stdio: 'inherit' });
    console.log('✓ Syntax check passed');
} catch (e) {
    console.error('✗ Syntax check failed');
    hasErrors = true;
}

// 2. ESLint
console.log('\nRunning ESLint...');
try {
    execSync(`npx eslint --config config/eslint.config.js "${configPath}" --ext .js`, {
        stdio: 'inherit',
        cwd: path.dirname(configPath).replace(/\/.surfingkeysrc\.js/, '')
    });
    console.log('✓ ESLint passed');
} catch (e) {
    console.error('✗ ESLint found issues');
    hasErrors = true;
}

// 3. Format check (basic spacing/indentation)
console.log('\nChecking format...');
const content = fs.readFileSync(configPath, 'utf8');
const lines = content.split('\n');
let formatErrors = false;

lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    // Check for tabs (should use spaces)
    if (line.includes('\t')) {
        console.error(`  Line ${lineNum}: Contains tabs (use spaces instead)`);
        formatErrors = true;
    }
    // Check for trailing whitespace
    if (line !== line.trimEnd()) {
        console.error(`  Line ${lineNum}: Trailing whitespace`);
        formatErrors = true;
    }
});

if (!formatErrors) {
    console.log('✓ Format check passed');
} else {
    hasErrors = true;
}

if (hasErrors) {
    process.exit(1);
}

console.log('\n✅ All checks passed!');

#!/usr/bin/env node

export {};

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(os.tmpdir(), `lint-${timestamp}.log`);

try {
  // Run linters with --fix to auto-correct fixable issues
  const eslintCmd = './node_modules/.bin/eslint --config config/eslint.config.js src tests scripts 2>&1';
  const stylelintCmd = './node_modules/.bin/stylelint --config config/stylelint.config.js \'src/**/*.css\' 2>&1';

  const jsOutput = execSync(eslintCmd, { encoding: 'utf8', stdio: 'pipe' });
  const cssOutput = execSync(stylelintCmd, { encoding: 'utf8', stdio: 'pipe' });
  const output = jsOutput + cssOutput;

  // Write full output to log file
  fs.writeFileSync(logFile, output);

  console.log('✅ Lint passed');
  process.exit(0);
} catch (error) {
  const e = error as { stdout?: string; stderr?: string; message?: string };
  const output = e.stdout || e.stderr || e.message || '';

  // Write full output to log file
  fs.writeFileSync(logFile, output);

  console.error('❌ Lint failed:');
  console.error(output);
  console.error(`Full lint output also logged to: ${logFile}`);
  process.exit(1);
}

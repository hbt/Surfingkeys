#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const logFile = path.join(os.tmpdir(), 'lint-output.log');
const timestamp = new Date().toISOString();

try {
  // Run linters with --fix to auto-correct fixable issues
  const eslintCmd = 'eslint --config config/eslint.config.js src tests debug scripts --ext .js,.ts --fix 2>&1';
  const stylelintCmd = 'stylelint --config config/stylelint.config.js \'src/**/*.css\' --fix 2>&1';

  const jsOutput = execSync(eslintCmd, { encoding: 'utf8', stdio: 'pipe' });
  const cssOutput = execSync(stylelintCmd, { encoding: 'utf8', stdio: 'pipe' });
  const output = jsOutput + cssOutput;

  // Write full output to log file
  fs.appendFileSync(logFile, `\n=== Lint run ${timestamp} ===\n${output}\n`);

  console.log('✅ Lint passed');
  process.exit(0);
} catch (error) {
  const output = error.stdout || error.stderr || error.message;

  // Write full output to log file
  fs.appendFileSync(logFile, `\n=== Lint run ${timestamp} (FAILED) ===\n${output}\n`);

  // Only show errors to console
  const lines = output.split('\n');
  const errors = lines.filter(line => line.includes('✖') || line.includes('error'));

  if (errors.length > 0) {
    console.error('❌ Lint failed. Errors:');
    errors.forEach(err => console.error(err));
  } else {
    console.error('❌ Lint failed. See full output in: ' + logFile);
  }

  console.error(`\nFull lint output logged to: ${logFile}`);
  process.exit(1);
}

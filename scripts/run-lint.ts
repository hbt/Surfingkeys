#!/usr/bin/env node

export {};

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(os.tmpdir(), `lint-${timestamp}.log`);

interface LintResult {
  name: string;
  output: string;
  exitCode: number;
}

function runLinter(name: string, cmd: string, args: string[]): Promise<LintResult> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { encoding: 'utf8' } as any);
    let output = '';

    proc.stdout?.on('data', (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    proc.stderr?.on('data', (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    proc.on('close', (exitCode: number | null) => {
      resolve({ name, output, exitCode: exitCode ?? 1 });
    });

    proc.on('error', (err: Error) => {
      resolve({ name, output: err.message, exitCode: 1 });
    });
  });
}

async function main() {
  const [jsResult, cssResult] = await Promise.all([
    runLinter('eslint', './node_modules/.bin/eslint', [
      '--config', 'config/eslint.config.js',
      'src', 'tests', 'scripts',
    ]),
    runLinter('stylelint', './node_modules/.bin/stylelint', [
      '--config', 'config/stylelint.config.js',
      'src/**/*.css',
    ]),
  ]);

  const combinedOutput = jsResult.output + cssResult.output;
  const anyFailed = jsResult.exitCode !== 0 || cssResult.exitCode !== 0;

  // Write full output to log file
  fs.writeFileSync(logFile, combinedOutput);

  if (anyFailed) {
    console.error('❌ Lint failed:');
    console.error(combinedOutput);
    console.error(`Full lint output also logged to: ${logFile}`);
    process.exit(1);
  } else {
    console.log('✅ Lint passed');
    process.exit(0);
  }
}

main();

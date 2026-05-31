#!/usr/bin/env node

export {};

import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function getStagedFiles(): string[] {
    const result = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' });
    if (result.status !== 0) return [];
    return result.stdout.trim().split('\n').filter(Boolean);
}

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
  const staged = getStagedFiles();
  const jsTargets = staged.length > 0
    ? staged.filter(f => /\.(ts|js)$/.test(f))
    : ['src', 'tests', 'scripts'];
  const cssTargets = staged.length > 0
    ? staged.filter(f => /\.css$/.test(f))
    : null; // null = use glob

  const runChecks: Promise<LintResult>[] = [];

  if (jsTargets.length > 0) {
    runChecks.push(runLinter('eslint', './node_modules/.bin/eslint', [
      '--config', 'config/eslint.config.js',
      ...jsTargets,
    ]));
  } else {
    runChecks.push(Promise.resolve({ name: 'eslint', output: '', exitCode: 0 }));
  }

  if (cssTargets === null) {
    runChecks.push(runLinter('stylelint', './node_modules/.bin/stylelint', [
      '--config', 'config/stylelint.config.js',
      'src/**/*.css',
    ]));
  } else if (cssTargets.length > 0) {
    runChecks.push(runLinter('stylelint', './node_modules/.bin/stylelint', [
      '--config', 'config/stylelint.config.js',
      ...cssTargets,
    ]));
  } else {
    runChecks.push(Promise.resolve({ name: 'stylelint', output: '', exitCode: 0 }));
  }

  const [jsResult, cssResult] = await Promise.all(runChecks);

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

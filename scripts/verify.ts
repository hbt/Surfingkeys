#!/usr/bin/env bun
/// <reference types="bun-types" />
export {};
/**
 * Unified verification runner.
 *
 * Usage:
 *   bun scripts/verify.ts              # fast checks: lint + integrity + validate
 *   bun scripts/verify.ts --tests      # fast + Playwright tests
 *   bun scripts/verify.ts --coverage   # fast + Playwright with V8 coverage
 *   bun scripts/verify.ts --full       # fast + coverage (subsumes tests)
 *   bun scripts/verify.ts --only lint  # single check by ID
 *   bun scripts/verify.ts --help       # usage
 */

interface Check {
    id: string;
    label: string;
    cmd: string[];
    group: 'fast' | 'slow';
}

interface CheckResult {
    id: string;
    label: string;
    passed: boolean;
    durationMs: number;
    output: string;
}

const CHECKS: Check[] = [
    {
        id: 'lint',
        label: 'ESLint + Stylelint',
        cmd: ['bun', 'scripts/run-lint.js'],
        group: 'fast',
    },
    {
        id: 'integrity',
        label: 'Mappings report schema',
        cmd: ['bun', 'scripts/mappings-json-report.ts', '--integrity'],
        group: 'fast',
    },
    {
        id: 'issues',
        label: 'Mappings issues',
        cmd: ['bun', 'scripts/check-issues.ts'],
        group: 'fast',
    },
    {
        id: 'tests',
        label: 'Playwright test suite',
        cmd: ['bun', 'scripts/test-parallel.ts'],
        group: 'slow',
    },
    {
        id: 'coverage',
        label: 'Playwright + V8 coverage',
        cmd: ['bun', 'scripts/cov-parallel.ts'],
        group: 'slow',
    },
];

function printHelp() {
    console.log(`
verify — unified verification runner

Usage:
  bun scripts/verify.ts [flags]

Flags:
  (none)          Run fast checks (default): lint, integrity, validate
  --fast    -f    Run fast checks: lint, integrity, validate
  --slow    -s    Run slow checks: tests, coverage
  --full          Run all checks: fast + slow
  --only <id>     Run a single check by ID
  --help    -h    Print this usage message

Check IDs:
`);
    const groups = ['fast', 'slow'] as const;
    for (const g of groups) {
        console.log(`  [${g}]`);
        for (const c of CHECKS.filter(x => x.group === g)) {
            console.log(`    ${c.id.padEnd(12)} ${c.label}`);
        }
    }
    console.log();
}

async function runCheck(check: Check): Promise<CheckResult> {
    const start = Date.now();
    const binPath = `${process.cwd()}/node_modules/.bin`;
    const env = { ...process.env, PATH: `${binPath}:${process.env.PATH}` };
    const proc = Bun.spawn({
        cmd: check.cmd,
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: process.cwd(),
        env,
    });

    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);

    const durationMs = Date.now() - start;
    const output = [stdout, stderr].filter(Boolean).join('\n').trim();

    return {
        id: check.id,
        label: check.label,
        passed: exitCode === 0,
        durationMs,
        output,
    };
}

function fmtDuration(ms: number): string {
    return (ms / 1000).toFixed(1) + 's';
}

function printResult(result: CheckResult) {
    const icon = result.passed ? '✅' : '❌';
    const label = result.label.padEnd(28);
    const dur = fmtDuration(result.durationMs);
    console.log(`  ${icon} ${label} ${dur}`);
}

async function runAll(checks: Check[]): Promise<CheckResult[]> {
    const fast = checks.filter(c => c.group === 'fast');
    const slow = checks.filter(c => c.group === 'slow');
    const results: CheckResult[] = [];

    if (fast.length > 0) {
        const fastResults = await Promise.all(fast.map(runCheck));
        for (const r of fastResults) {
            printResult(r);
            results.push(r);
        }
    }

    for (const check of slow) {
        const r = await runCheck(check);
        printResult(r);
        results.push(r);
    }

    return results;
}

function selectChecks(argv: string[]): Check[] | null {
    if (argv.includes('--help') || argv.includes('-h')) {
        printHelp();
        process.exit(0);
    }

    const onlyIdx = argv.indexOf('--only');
    if (onlyIdx !== -1) {
        const id = argv[onlyIdx + 1];
        if (!id) {
            console.error('Error: --only requires a check ID');
            process.exit(1);
        }
        const check = CHECKS.find(c => c.id === id);
        if (!check) {
            console.error(`Error: unknown check ID "${id}". Available: ${CHECKS.map(c => c.id).join(', ')}`);
            process.exit(1);
        }
        return [check];
    }

    const wantFull = argv.includes('--full');
    const wantSlow = argv.includes('--slow') || argv.includes('-s') || wantFull;
    const wantFast = !wantSlow || wantFull || argv.includes('--fast') || argv.includes('-f');

    return CHECKS.filter(c =>
        (c.group === 'fast' && wantFast) ||
        (c.group === 'slow' && wantSlow)
    );
}

async function main() {
    const argv = process.argv.slice(2);
    const checks = selectChecks(argv);
    if (!checks) return;

    console.log(`\n🔍 verify — running ${checks.length} check${checks.length === 1 ? '' : 's'}...\n`);

    const results = await runAll(checks);

    const failed = results.filter(r => !r.passed);
    const totalMs = results.reduce((s, r) => s + r.durationMs, 0);

    console.log('\n' + '═'.repeat(50));

    if (failed.length === 0) {
        console.log(`  ✅ All ${results.length} check${results.length === 1 ? '' : 's'} passed (${fmtDuration(totalMs)} total)\n`);
    } else {
        console.log(`  ❌ ${failed.length} of ${results.length} check${results.length === 1 ? '' : 's'} failed\n`);
        for (const r of failed) {
            console.log(`\n--- ${r.id} output ---`);
            console.log(r.output || '(no output)');
        }
        console.log();
    }

    process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

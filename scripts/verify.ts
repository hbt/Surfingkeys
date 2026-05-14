#!/usr/bin/env bun
/// <reference types="bun-types" />
export {};
/**
 * Unified verification runner.
 *
 * Usage:
 *   bun scripts/verify.ts              # fast checks: lint + integrity + issues + typecheck + build
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
    group: 'fast' | 'slow' | 'personal';
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
        cmd: ['bun', 'scripts/run-lint.ts'],
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
        id: 'typecheck',
        label: 'TypeScript (tsc --noEmit)',
        cmd: ['tsc', '--noEmit'],
        group: 'fast',
    },
    {
        id: 'build',
        label: 'Build (esbuild dev)',
        cmd: ['npm', 'run', 'build:dev'],
        group: 'fast',
    },
    {
        id: 'tests',
        // TODO(hbt) NEXT [verify] remove --grep-invert once capture tests Docker popup timing is fixed
        label: 'Playwright tests (Docker)',
        cmd: [
            'docker', 'compose', 'run', '--rm', 'tests',
            'npm', 'run', 'test:playwright:parallel', '--',
            '--grep-invert', 'cmd_capture_scrolling_element|cmd_capture_full_page',
        ],
        group: 'slow',
    },
    {
        id: 'coverage',
        label: 'Playwright + V8 coverage',
        cmd: ['bun', 'scripts/cov-parallel.ts'],
        group: 'slow',
    },
    {
        id: 'custom-mappings',
        label: 'Custom mappings audit',
        cmd: ['bun', 'scripts/audit-custom-mappings.ts'],
        group: 'personal',
    },
    {
        id: 'upstream',
        label: 'Upstream lag (brookhong)',
        cmd: ['bun', 'scripts/check-upstream.ts'],
        group: 'personal',
    },
    {
        id: 'config-lint',
        label: 'Config file lint',
        cmd: ['bun', 'scripts/lint-config.ts'],
        group: 'personal',
    },
];

function printHelp() {
    console.log(`
verify — unified verification runner

Usage:
  bun scripts/verify.ts [flags]

Flags:
  (none)            Run fast checks (default): lint, integrity, issues, typecheck, build
  --fast    -f      Run fast checks: lint, integrity, issues, typecheck, build
  --slow    -s      Run slow checks: tests, coverage
  --personal  -p    Run personal checks: custom-mappings, upstream, config-lint
  --full            Run all checks: fast + slow + personal
  --only <id>       Run a single check by ID
  --help    -h      Print this usage message

Check IDs:
`);
    const groups = ['fast', 'slow', 'personal'] as const;
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
    const proc = Bun.spawn(check.cmd, {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: process.cwd(),
        env,
    });

    const [stdout, stderr, exitCode] = await Promise.all([
        Bun.readableStreamToText(proc.stdout),
        Bun.readableStreamToText(proc.stderr),
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
    const fast = checks.filter(c => c.group === 'fast' || c.group === 'personal');
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
        if (!r.passed) break; // fail-fast: don't run subsequent slow checks
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
    const wantPersonal = argv.includes('--personal') || argv.includes('-p') || wantFull;
    const wantFast = (!wantSlow && !wantPersonal) || wantFull || argv.includes('--fast') || argv.includes('-f');

    return CHECKS.filter(c =>
        (c.group === 'fast' && wantFast) ||
        (c.group === 'slow' && wantSlow) ||
        (c.group === 'personal' && wantPersonal)
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

    // Personal checks are informational — always show their output, never count as failures
    const personalIds = new Set(checks.filter(c => c.group === 'personal').map(c => c.id));
    const personalResults = results.filter(r => personalIds.has(r.id));
    const blockingFailed = failed.filter(r => !personalIds.has(r.id));

    if (blockingFailed.length === 0) {
        console.log(`  ✅ All ${results.length} check${results.length === 1 ? '' : 's'} passed (${fmtDuration(totalMs)} total)\n`);
    } else {
        console.log(`  ❌ ${blockingFailed.length} of ${results.length} check${results.length === 1 ? '' : 's'} failed\n`);
        for (const r of blockingFailed) {
            const logPath = `/tmp/verify-${r.id}-${Date.now()}.log`;
            const logContent = r.output || '(no output)';
            await Bun.write(logPath, logContent);
            const lines = logContent.split('\n');
            const preview = lines.slice(0, 5).join('\n');
            const truncated = lines.length > 5;
            console.log(`\n--- ${r.id} (${lines.length} lines) ---`);
            console.log(preview);
            if (truncated) console.log(`  … (${lines.length - 5} more lines)`);
            console.log(`  Full log: ${logPath}`);
        }
        console.log();
    }

    // Always print personal check output (informational)
    for (const r of personalResults) {
        if (r.output) {
            console.log(r.output);
        }
    }

    process.exit(blockingFailed.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

import * as fs from 'fs';
import * as path from 'path';
import type { LastTestRun, TestRunSummary, CoverageRunSummary } from './types';
import { EXCLUDED_COMMANDS } from './constants';

// ============================================================================
// FILENAME PARSERS
// ============================================================================

/**
 * Parse a test-run report filename.
 * Formats observed:
 *   2026-06-05T03-15-21-770Z-local.json
 *   2026-06-05T02-23-06-429Z-ef708a1-docker.json
 *   2026-05-01T22-37-46-643Z-fd16de7.json   (no env suffix — treat as local)
 *   2026-05-01T11-40-04-507Z.json            (no sha, no env — treat as local)
 */
function parseRunFilename(basename: string): { date: string; sha: string | null; env: 'local' | 'docker' } | null {
    // Remove .json extension
    const name = basename.replace(/\.json$/, '');

    // Attempt to match: <iso-timestamp>[-<sha>][-<env>]
    // ISO timestamp portion: YYYY-MM-DDTHH-MM-SS-mmmZ
    const isoRe = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+Z)/;
    const m = name.match(isoRe);
    if (!m) return null;

    const isoRaw = m[1]; // e.g. "2026-06-05T03-15-21-770Z"
    // Convert to ISO 8601 by replacing hyphens in time part with colons/dots
    const date = isoRaw.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d+)Z$/, 'T$1:$2:$3.$4Z');

    const rest = name.slice(m[1].length); // e.g. "" | "-ef708a1" | "-ef708a1-docker" | "-local"
    const parts = rest.split('-').filter(Boolean);

    let sha: string | null = null;
    let env: 'local' | 'docker' = 'local';

    if (parts.length === 0) {
        // nothing extra
    } else if (parts[parts.length - 1] === 'docker') {
        env = 'docker';
        if (parts.length >= 2) sha = parts[0];
    } else if (parts[parts.length - 1] === 'local') {
        env = 'local';
        if (parts.length >= 2) sha = parts[0];
    } else {
        // Assume last token is sha
        sha = parts[parts.length - 1];
    }

    return { date, sha, env };
}

/**
 * Parse a coverage-manifest filename.
 * Formats observed:
 *   2026-06-05T03-15-21-770Z-local.json
 *   2026-06-05T03-14-03-723Z-local.json
 *   2026-06-03T14-27-50-655Z-83894cb-local.json
 *   2026-06-05T02-23-06-429Z-ef708a1-docker.json
 *   2026-05-07T02-56-00-518Z.json   (no env)
 */
function parseCoverageManifestFilename(basename: string): { date: string; sha: string | null; env: 'local' | 'docker' } | null {
    return parseRunFilename(basename); // same format
}

// ============================================================================
// SKIPPED TEST WALKER
// ============================================================================

function walkSuites(suites: any[]): Array<{ file: string; title: string }> {
    const skipped: Array<{ file: string; title: string }> = [];
    for (const s of suites) {
        for (const spec of (s.specs ?? [])) {
            const tests: any[] = spec.tests ?? [];
            if (tests.length > 0 && tests.every((t: any) => t.status === 'skipped')) {
                skipped.push({ file: spec.file ?? '', title: spec.title ?? '' });
            }
        }
        skipped.push(...walkSuites(s.suites ?? []));
    }
    return skipped;
}

// ============================================================================
// REPORT READERS
// ============================================================================

function readTestRunReport(filePath: string): {
    stats: { passed: number; failed: number; flaky: number; skipped: number };
    skipped_tests: Array<{ file: string; title: string }>;
    host: string | null;
} | null {
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const stats = raw.stats ?? {};
        return {
            stats: {
                passed: stats.expected ?? 0,
                failed: stats.unexpected ?? 0,
                flaky: stats.flaky ?? 0,
                skipped: stats.skipped ?? 0,
            },
            skipped_tests: walkSuites(raw.suites ?? []),
            host: null, // Playwright JSON reporter does not embed hostname
        };
    } catch {
        return null;
    }
}

function readCoverageManifest(filePath: string): {
    runId: string;
    startedAt: string;
    success: boolean;
    artifactCount: number;
    groupCount: number;
    testReportPath: string | null;
    execution: 'local' | 'docker' | null;
} | null {
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return {
            runId: raw.runId ?? '',
            startedAt: raw.startedAt ?? '',
            success: raw.success ?? false,
            artifactCount: raw.artifactCount ?? 0,
            groupCount: raw.groupCount ?? 0,
            testReportPath: raw.testReportPath ?? null,
            execution: raw.execution ?? null,
        };
    } catch {
        return null;
    }
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

export function buildLastTestRun(projectRoot: string): LastTestRun {
    const runsDir = path.join(projectRoot, 'test-artifacts/reports/runs');
    const manifestsDir = path.join(projectRoot, 'test-artifacts/coverage-manifests');

    // ── 1. Scan test run reports ──────────────────────────────────────────────

    type RunEntry = { basename: string; date: string; sha: string | null; env: 'local' | 'docker' };
    const runEntries: RunEntry[] = [];

    if (fs.existsSync(runsDir)) {
        for (const f of fs.readdirSync(runsDir)) {
            if (!f.endsWith('.json')) continue;
            const parsed = parseRunFilename(f);
            if (!parsed) continue;
            runEntries.push({ basename: f, ...parsed });
        }
    }

    runEntries.sort((a, b) => a.basename.localeCompare(b.basename));

    const latestLocal = [...runEntries].reverse().find(e => e.env === 'local');
    const latestDocker = [...runEntries].reverse().find(e => e.env === 'docker');

    function buildTestRunSummary(entry: RunEntry): TestRunSummary | null {
        const filePath = path.join(runsDir, entry.basename);
        const data = readTestRunReport(filePath);
        if (!data) return null;
        return {
            runId: entry.basename.replace(/\.json$/, ''),
            date: entry.date,
            sha: entry.sha,
            host: data.host,
            stats: data.stats,
            skipped_tests: data.skipped_tests,
            reportPath: path.relative(projectRoot, filePath),
        };
    }

    const localRun = latestLocal ? buildTestRunSummary(latestLocal) : null;
    const dockerRun = latestDocker ? buildTestRunSummary(latestDocker) : null;

    // ── 2. Scan coverage manifests ────────────────────────────────────────────

    type ManifestEntry = { basename: string; date: string; sha: string | null; env: 'local' | 'docker' };
    const manifestEntries: ManifestEntry[] = [];

    if (fs.existsSync(manifestsDir)) {
        for (const f of fs.readdirSync(manifestsDir)) {
            if (!f.endsWith('.json')) continue;
            const parsed = parseCoverageManifestFilename(f);
            if (!parsed) continue;
            manifestEntries.push({ basename: f, ...parsed });
        }
    }

    manifestEntries.sort((a, b) => a.basename.localeCompare(b.basename));

    const latestCovLocal = [...manifestEntries].reverse().find(e => e.env === 'local');
    const latestCovDocker = [...manifestEntries].reverse().find(e => e.env === 'docker');

    function buildCoverageRunSummary(entry: ManifestEntry): CoverageRunSummary | null {
        const filePath = path.join(manifestsDir, entry.basename);
        const manifest = readCoverageManifest(filePath);
        if (!manifest) return null;

        // Determine execution env — prefer manifest field, fall back to filename parse
        const execution: 'local' | 'docker' = (manifest.execution === 'local' || manifest.execution === 'docker')
            ? manifest.execution
            : entry.env;

        // Try to load linked test report for stats
        let stats: CoverageRunSummary['stats'] = null;
        if (manifest.testReportPath) {
            // testReportPath may be relative to projectRoot or an alternate path
            const candidates = [
                path.join(projectRoot, manifest.testReportPath),
                // Some old manifests used test-reports/ instead of test-artifacts/reports/
                path.join(projectRoot, manifest.testReportPath.replace('test-reports/', 'test-artifacts/reports/')),
            ];
            for (const candidate of candidates) {
                if (fs.existsSync(candidate)) {
                    const data = readTestRunReport(candidate);
                    if (data) { stats = data.stats; break; }
                }
            }
        }

        return {
            runId: manifest.runId,
            date: manifest.startedAt,
            success: manifest.success,
            execution,
            stats,
            artifactCount: manifest.artifactCount,
            groupCount: manifest.groupCount,
            manifestPath: path.relative(projectRoot, filePath),
        };
    }

    const localCov = latestCovLocal ? buildCoverageRunSummary(latestCovLocal) : null;
    const dockerCov = latestCovDocker ? buildCoverageRunSummary(latestCovDocker) : null;

    // ── 3. Excluded from testing ──────────────────────────────────────────────

    const excludedFromTesting = {
        count: EXCLUDED_COMMANDS.length,
        commands: EXCLUDED_COMMANDS.map(e => ({ unique_id: e.unique_id, reason: e.reason })),
    };

    // ── 4. Skipped test set-difference ───────────────────────────────────────

    let skippedComparison: LastTestRun['skipped_tests'] = null;

    if (localRun && dockerRun) {
        const localKeys = new Set(localRun.skipped_tests.map(t => `${t.file}::${t.title}`));
        const dockerKeys = new Set(dockerRun.skipped_tests.map(t => `${t.file}::${t.title}`));

        const dockerOnly = dockerRun.skipped_tests.filter(t => !localKeys.has(`${t.file}::${t.title}`));
        const localOnly = localRun.skipped_tests.filter(t => !dockerKeys.has(`${t.file}::${t.title}`));
        const always = localRun.skipped_tests.filter(t => dockerKeys.has(`${t.file}::${t.title}`));

        skippedComparison = {
            docker_only: { count: dockerOnly.length, tests: dockerOnly },
            local_only:  { count: localOnly.length,  tests: localOnly  },
            always:      { count: always.length,      tests: always     },
        };
    }

    return {
        local: localRun,
        docker: dockerRun,
        coverage: {
            local: localCov,
            docker: dockerCov,
        },
        excluded_from_testing: excludedFromTesting,
        skipped_tests: skippedComparison,
    };
}

import * as fs from 'fs';
import * as path from 'path';
import type { MappingEntry, TargetStats } from './types';

// ============================================================================
// CODE COVERAGE STATS
// ============================================================================

export function loadCoverageStats(uniqueId: string, coverageRawDir: string): {
    hasData: boolean;
    testCaseCount: number;
    targets: { content?: TargetStats; background?: TargetStats };
} {
    // Collect candidate idDirs: direct path + latest run/*/<uniqueId> only
    const candidateDirs: string[] = [];
    const directDir = path.join(coverageRawDir, uniqueId);
    if (fs.existsSync(directDir)) candidateDirs.push(directDir);
    const runsDir = path.join(coverageRawDir, 'runs');
    if (fs.existsSync(runsDir)) {
        const sortedRuns = fs.readdirSync(runsDir, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => e.name)
            .sort()
            .reverse(); // latest first (ISO timestamp dirs sort lexicographically)
        for (const runName of sortedRuns) {
            const runIdDir = path.join(runsDir, runName, uniqueId);
            if (fs.existsSync(runIdDir)) {
                candidateDirs.push(runIdDir);
                break; // use only the most recent run that has data for this id
            }
        }
    }
    if (candidateDirs.length === 0) {
        return { hasData: false, testCaseCount: 0, targets: {} };
    }

    // Collect all .v8.json files, grouped by target type and test case (first-level subdir)
    // Structure: <idDir>/<test_case>/<...>/<target_path>/<timestamp>.v8.json
    // Target is determined by path segment: "content" or "background"
    const contentFiles: Map<string, string[]> = new Map();
    const backgroundFiles: Map<string, string[]> = new Map();

    function walkDir(dir: string, idDir: string, testCaseKey: string): void {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fp = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walkDir(fp, idDir, testCaseKey);
            } else if (entry.name.endsWith('.v8.json')) {
                const rel = path.relative(idDir, fp);
                // Determine target from path segments
                if (rel.includes('/content/') || rel.startsWith('content/')) {
                    if (!contentFiles.has(testCaseKey)) contentFiles.set(testCaseKey, []);
                    contentFiles.get(testCaseKey)!.push(fp);
                } else if (rel.includes('/background/') || rel.startsWith('background/')) {
                    if (!backgroundFiles.has(testCaseKey)) backgroundFiles.set(testCaseKey, []);
                    backgroundFiles.get(testCaseKey)!.push(fp);
                }
            }
        }
    }

    // Walk each candidate dir
    for (const idDir of candidateDirs) {
        for (const entry of fs.readdirSync(idDir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                walkDir(path.join(idDir, entry.name), idDir, entry.name);
            }
        }
    }

    // Count distinct test cases (subdirs that have any v8.json)
    const allTestCaseDirs = new Set([...contentFiles.keys(), ...backgroundFiles.keys()]);
    const testCaseCount = allTestCaseDirs.size;

    if (testCaseCount === 0) {
        return { hasData: false, testCaseCount: 0, targets: {} };
    }

    // Helper: pick latest file per test case (sort by filename, take last)
    function pickLatest(filesMap: Map<string, string[]>): string[] {
        const result: string[] = [];
        for (const [, files] of filesMap) {
            const sorted = [...files].sort();
            result.push(sorted[sorted.length - 1]);
        }
        return result;
    }

    // Helper: parse V8 JSON and count functions
    function countFunctions(filePath: string): { total: number; covered: number } {
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw);
            // V8 coverage format: array of script coverage objects
            const scripts: any[] = Array.isArray(data) ? data : (data.result ?? []);
            let total = 0;
            let covered = 0;
            for (const script of scripts) {
                const functions: any[] = script.functions ?? [];
                for (const fn of functions) {
                    total++;
                    const ranges: any[] = fn.ranges ?? [];
                    if (ranges.length > 0 && ranges[0].count > 0) {
                        covered++;
                    }
                }
            }
            return { total, covered };
        } catch {
            return { total: 0, covered: 0 };
        }
    }

    // Helper: aggregate stats across files
    function aggregateStats(files: string[]): TargetStats | undefined {
        if (files.length === 0) return undefined;
        let totalFunctions = 0;
        let coveredFunctions = 0;
        for (const f of files) {
            const { total, covered } = countFunctions(f);
            totalFunctions += total;
            coveredFunctions += covered;
        }
        const pct = totalFunctions > 0
            ? `${((coveredFunctions / totalFunctions) * 100).toFixed(1)}%`
            : '0.0%';
        return { totalFunctions, coveredFunctions, pct };
    }

    const contentLatest = pickLatest(contentFiles);
    const backgroundLatest = pickLatest(backgroundFiles);

    const targets: { content?: TargetStats; background?: TargetStats } = {};
    const contentStats = aggregateStats(contentLatest);
    if (contentStats) targets.content = contentStats;
    const backgroundStats = aggregateStats(backgroundLatest);
    if (backgroundStats) targets.background = backgroundStats;

    return { hasData: true, testCaseCount, targets };
}

export function generateCoverageStats(mappings: MappingEntry[], coverageRawDir: string): {
    with_data: number;
    without_data: number;
    content_only: number;
    background_only: number;
    both: number;
} {
    let with_data = 0;
    let without_data = 0;
    let content_only = 0;
    let background_only = 0;
    let both = 0;

    for (const mapping of mappings) {
        const uniqueId = (mapping.annotation as any)?.unique_id;
        if (!uniqueId) continue;

        const stats = loadCoverageStats(uniqueId, coverageRawDir);
        mapping.code_coverage = {
            hasData: stats.hasData,
            testCaseCount: stats.testCaseCount,
            targets: stats.targets,
        };

        if (!stats.hasData) {
            without_data++;
        } else {
            with_data++;
            const hasContent = !!stats.targets.content;
            const hasBackground = !!stats.targets.background;
            if (hasContent && hasBackground) both++;
            else if (hasContent) content_only++;
            else if (hasBackground) background_only++;
        }
    }

    return { with_data, without_data, content_only, background_only, both };
}

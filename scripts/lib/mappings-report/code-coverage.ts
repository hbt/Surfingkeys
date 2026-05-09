import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore — source-map-js ships its own types
import { SourceMapConsumer } from 'source-map-js';
import type { MappingEntry, TargetStats } from './types';

// ============================================================================
// SOURCE MAP RESOLUTION
// ============================================================================

/** Build an index of byte offsets for each line start in `content`. */
function buildLineOffsetIndex(content: string): number[] {
    const offsets: number[] = [0];
    for (let i = 0; i < content.length; i++) {
        if (content[i] === '\n') offsets.push(i + 1);
    }
    return offsets;
}

/** Convert a byte offset to 1-based line + 0-based column using a line-offset index. */
function offsetToLineCol(offset: number, lineOffsets: number[]): { line: number; column: number } {
    let lo = 0;
    let hi = lineOffsets.length - 1;
    while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        if (lineOffsets[mid] <= offset) lo = mid;
        else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - lineOffsets[lo] };
}

/**
 * Returns a function that maps a bundle byte offset → original source file path,
 * or null if source maps are unavailable / the position cannot be resolved.
 * Paths are normalised to `src/...` relative form.
 */
function buildSourceResolver(
    bundlePath: string,
    mapPath: string,
): ((offset: number) => string | null) | null {
    if (!fs.existsSync(bundlePath) || !fs.existsSync(mapPath)) return null;
    try {
        const bundleContent = fs.readFileSync(bundlePath, 'utf-8');
        const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
        const consumer = new SourceMapConsumer(rawMap);
        const lineOffsets = buildLineOffsetIndex(bundleContent);

        return (offset: number): string | null => {
            const { line, column } = offsetToLineCol(offset, lineOffsets);
            const pos = consumer.originalPositionFor({ line, column });
            if (!pos.source) return null;
            // Normalise: keep only the src/... part of the path
            const src = pos.source.replace(/\\/g, '/');
            const idx = src.indexOf('src/');
            return idx !== -1 ? src.slice(idx) : src;
        };
    } catch {
        return null;
    }
}

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

    // Source resolvers (built once, reused across all files for this run)
    const projectRoot = path.resolve(coverageRawDir, '..');
    const distDir = path.join(projectRoot, 'dist', 'development', 'chrome-test');
    const bgResolver = buildSourceResolver(
        path.join(distDir, 'background.js'),
        path.join(distDir, 'background.js.map'),
    );
    const contentResolver = buildSourceResolver(
        path.join(distDir, 'content.js'),
        path.join(distDir, 'content.js.map'),
    );

    // Helper: pick latest file per test case (sort by filename, take last)
    function pickLatest(filesMap: Map<string, string[]>): string[] {
        const result: string[] = [];
        for (const [, files] of filesMap) {
            const sorted = [...files].sort();
            result.push(sorted[sorted.length - 1]);
        }
        return result;
    }

    // Helper: parse V8 JSON and count functions, optionally attributing to source files
    function countFunctions(
        filePath: string,
        resolver: ((offset: number) => string | null) | null,
    ): {
        total: number;
        covered: number;
        bySourceFile: Record<string, { total: number; covered: number }>;
    } {
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const scripts: any[] = Array.isArray(data) ? data : (data.result ?? []);
            let total = 0;
            let covered = 0;
            const bySourceFile: Record<string, { total: number; covered: number }> = {};

            for (const script of scripts) {
                const functions: any[] = script.functions ?? [];
                for (const fn of functions) {
                    total++;
                    const ranges: any[] = fn.ranges ?? [];
                    const isCovered = ranges.length > 0 && ranges[0].count > 0;
                    if (isCovered) covered++;

                    if (resolver) {
                        const startOffset: number = ranges[0]?.startOffset ?? 0;
                        const sourceFile = resolver(startOffset);
                        if (sourceFile) {
                            if (!bySourceFile[sourceFile]) bySourceFile[sourceFile] = { total: 0, covered: 0 };
                            bySourceFile[sourceFile].total++;
                            if (isCovered) bySourceFile[sourceFile].covered++;
                        }
                    }
                }
            }
            return { total, covered, bySourceFile };
        } catch {
            return { total: 0, covered: 0, bySourceFile: {} };
        }
    }

    // Helper: aggregate stats across files
    function aggregateStats(
        files: string[],
        resolver: ((offset: number) => string | null) | null,
    ): TargetStats | undefined {
        if (files.length === 0) return undefined;
        let totalFunctions = 0;
        let coveredFunctions = 0;
        const mergedByFile: Record<string, { total: number; covered: number }> = {};

        for (const f of files) {
            const { total, covered, bySourceFile } = countFunctions(f, resolver);
            totalFunctions += total;
            coveredFunctions += covered;
            for (const [src, stats] of Object.entries(bySourceFile)) {
                if (!mergedByFile[src]) mergedByFile[src] = { total: 0, covered: 0 };
                mergedByFile[src].total += stats.total;
                mergedByFile[src].covered += stats.covered;
            }
        }

        const pct = totalFunctions > 0
            ? `${((coveredFunctions / totalFunctions) * 100).toFixed(1)}%`
            : '0.0%';

        const result: TargetStats = { totalFunctions, coveredFunctions, pct };

        if (Object.keys(mergedByFile).length > 0) {
            result.bySourceFile = {};
            for (const [src, stats] of Object.entries(mergedByFile).sort(([a], [b]) => a.localeCompare(b))) {
                result.bySourceFile[src] = {
                    total: stats.total,
                    covered: stats.covered,
                    pct: stats.total > 0
                        ? `${((stats.covered / stats.total) * 100).toFixed(1)}%`
                        : '0.0%',
                };
            }
        }

        return result;
    }

    const contentLatest = pickLatest(contentFiles);
    const backgroundLatest = pickLatest(backgroundFiles);

    const targets: { content?: TargetStats; background?: TargetStats } = {};
    const contentStats = aggregateStats(contentLatest, contentResolver);
    if (contentStats) targets.content = contentStats;
    const backgroundStats = aggregateStats(backgroundLatest, bgResolver);
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

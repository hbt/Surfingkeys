import * as fs from 'fs';
import * as path from 'path';
import type { RelevantCoverage, RelevantCoverageTarget, RelevantFunction } from './types';
import { buildSourceResolver } from './code-coverage';

// ============================================================================
// RELEVANT COVERAGE — baseline-diffed function coverage per command
// ============================================================================

/** A single function entry from a V8 coverage file. */
interface V8Function {
    functionName: string;
    ranges: Array<{ startOffset: number; endOffset: number; count: number }>;
    isBlockCoverage: boolean;
}

/** A single script entry from a V8 coverage file. */
interface V8Script {
    functions?: V8Function[];
}

/** Parse a .v8.json file and return all (functionName, startOffset, count) tuples. */
function parseFunctions(filePath: string): Array<{ name: string; startOffset: number; count: number }> {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data: unknown = JSON.parse(raw);
        const scripts: V8Script[] = Array.isArray(data) ? (data as V8Script[]) : ((data as { result?: V8Script[] }).result ?? []);
        const result: Array<{ name: string; startOffset: number; count: number }> = [];
        for (const script of scripts) {
            const functions = script.functions ?? [];
            for (const fn of functions) {
                const count = fn.ranges.length > 0 ? fn.ranges[0].count : 0;
                const startOffset = fn.ranges.length > 0 ? fn.ranges[0].startOffset : 0;
                result.push({ name: fn.functionName, startOffset, count });
            }
        }
        return result;
    } catch {
        return [];
    }
}

/**
 * Build a baseline map from probe coverage files: Map<functionName, maxCount>.
 * We use the max count across all scripts for the same function name.
 */
function buildBaselineMap(baselineDir: string): Map<string, number> | null {
    if (!fs.existsSync(baselineDir)) return null;
    const files = fs.readdirSync(baselineDir).filter(f => f.endsWith('.v8.json'));
    if (files.length === 0) return null;

    const map = new Map<string, number>();
    for (const file of files) {
        const fns = parseFunctions(path.join(baselineDir, file));
        for (const { name, count } of fns) {
            const existing = map.get(name) ?? 0;
            map.set(name, Math.max(existing, count));
        }
    }
    return map;
}

/**
 * Walk a directory recursively, collecting .v8.json file paths grouped by
 * first-level subdirectory (test case) and target type (content or background).
 */
function collectCoverageFiles(
    idDir: string,
): { contentFiles: Map<string, string[]>; backgroundFiles: Map<string, string[]> } {
    const contentFiles: Map<string, string[]> = new Map();
    const backgroundFiles: Map<string, string[]> = new Map();

    function walk(dir: string, testCaseKey: string): void {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fp = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fp, testCaseKey);
            } else if (entry.name.endsWith('.v8.json')) {
                const rel = path.relative(idDir, fp);
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

    if (!fs.existsSync(idDir)) return { contentFiles, backgroundFiles };

    for (const entry of fs.readdirSync(idDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            walk(path.join(idDir, entry.name), entry.name);
        }
    }

    return { contentFiles, backgroundFiles };
}

/** Pick the latest file per test case (sort by filename, take last). */
function pickLatestFiles(filesMap: Map<string, string[]>): string[] {
    const result: string[] = [];
    for (const files of filesMap.values()) {
        const sorted = [...files].sort();
        result.push(sorted[sorted.length - 1]);
    }
    return result;
}

/**
 * Build a RelevantCoverageTarget from a list of V8 JSON files, optionally diffing
 * against a baseline Map. When baselineMap is null, all functions are included.
 */
function buildRelevantTarget(
    files: string[],
    baselineMap: Map<string, number> | null,
    resolver: ((offset: number) => string | null) | null,
): RelevantCoverageTarget | null {
    if (files.length === 0) return null;

    // Aggregate: for each (functionName, startOffset), take the max count across files.
    // Key by functionName + startOffset to distinguish overloaded names.
    const agg = new Map<string, { name: string; startOffset: number; count: number }>();

    for (const filePath of files) {
        const fns = parseFunctions(filePath);
        for (const { name, startOffset, count } of fns) {
            const key = `${name}:${startOffset}`;
            const existing = agg.get(key);
            if (!existing || count > existing.count) {
                agg.set(key, { name, startOffset, count });
            }
        }
    }

    const relevant: RelevantFunction[] = [];

    for (const { name, startOffset, count } of agg.values()) {
        let deltaCount: number;

        if (baselineMap !== null) {
            const baselineCount = baselineMap.get(name) ?? 0;
            if (count <= baselineCount) continue; // purely baseline noise — skip
            deltaCount = count - baselineCount;
        } else {
            // No baseline — include everything
            deltaCount = count;
        }

        const sourceFile = resolver ? resolver(startOffset) : null;
        relevant.push({ functionName: name, sourceFile, deltaCount });
    }

    if (relevant.length === 0) return null;

    // Group by source file
    const bySourceFile: Record<string, { functions: RelevantFunction[]; count: number }> = {};
    const nullKey = '__unresolved__';

    for (const fn of relevant) {
        const key = fn.sourceFile ?? nullKey;
        if (!bySourceFile[key]) bySourceFile[key] = { functions: [], count: 0 };
        bySourceFile[key].functions.push(fn);
        bySourceFile[key].count++;
    }

    return {
        totalFunctions: relevant.length,
        bySourceFile,
    };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Compute a derived content baseline by scanning all cmd_* coverage directories.
 *
 * A function that fires in the content script for >= threshold fraction of all
 * command tests is considered baseline noise (extension machinery, not command-specific).
 *
 * @param coverageRawDir - path to test-artifacts/coverage-raw/
 * @param threshold      - fraction of commands a function must appear in to be baseline (default 0.9)
 * @returns Map<functionName, medianCount> for functions meeting the threshold
 */
export function computeDerivedContentBaseline(
    coverageRawDir: string,
    threshold = 0.9,
): Map<string, number> {
    if (!fs.existsSync(coverageRawDir)) return new Map();

    // Find all cmd_* directories
    const cmdDirs = fs.readdirSync(coverageRawDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith('cmd_'))
        .map(e => e.name);

    const totalCommandCount = cmdDirs.length;
    if (totalCommandCount === 0) return new Map();

    // For each function name, track: how many distinct commands it appeared in,
    // and all counts observed across those commands
    const functionAppearances = new Map<string, { commandSet: Set<string>; totalCounts: number[] }>();

    for (const cmdName of cmdDirs) {
        const idDir = path.join(coverageRawDir, cmdName);
        const { contentFiles } = collectCoverageFiles(idDir);
        const latestFiles = pickLatestFiles(contentFiles);

        // Aggregate max count per function across all test cases in this command
        const cmdFunctions = new Map<string, number>();
        for (const filePath of latestFiles) {
            const fns = parseFunctions(filePath);
            for (const { name, count } of fns) {
                if (count > 0) {
                    const existing = cmdFunctions.get(name) ?? 0;
                    cmdFunctions.set(name, Math.max(existing, count));
                }
            }
        }

        // Record appearances
        for (const [name, count] of cmdFunctions) {
            if (!functionAppearances.has(name)) {
                functionAppearances.set(name, { commandSet: new Set(), totalCounts: [] });
            }
            const entry = functionAppearances.get(name)!;
            entry.commandSet.add(cmdName);
            entry.totalCounts.push(count);
        }
    }

    const minAppearances = Math.ceil(threshold * totalCommandCount);
    const result = new Map<string, number>();

    for (const [name, { commandSet, totalCounts }] of functionAppearances) {
        if (commandSet.size >= minAppearances) {
            // Compute median count
            const sorted = [...totalCounts].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 === 0
                ? Math.floor((sorted[mid - 1] + sorted[mid]) / 2)
                : sorted[mid];
            result.set(name, median);
        }
    }

    return result;
}

/**
 * Compute baseline-diffed relevant coverage for a single command.
 *
 * @param uniqueId               - e.g. "cmd_scroll_down"
 * @param coverageRawDir         - path to test-artifacts/coverage-raw/
 * @param projectRoot            - path to project root (for dist/ source maps)
 * @param derivedContentBaseline - pre-computed derived content baseline (optional, computed lazily if absent)
 */
export function computeRelevantCoverage(
    uniqueId: string,
    coverageRawDir: string,
    projectRoot: string,
    derivedContentBaseline?: Map<string, number>,
): RelevantCoverage | null {
    // Resolve command coverage directory (same logic as code-coverage.ts)
    const candidateDirs: string[] = [];
    const directDir = path.join(coverageRawDir, uniqueId);
    if (fs.existsSync(directDir)) candidateDirs.push(directDir);

    const runsDir = path.join(coverageRawDir, 'runs');
    if (fs.existsSync(runsDir)) {
        const sortedRuns = fs.readdirSync(runsDir, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => e.name)
            .sort()
            .reverse();
        for (const runName of sortedRuns) {
            const runIdDir = path.join(runsDir, runName, uniqueId);
            if (fs.existsSync(runIdDir)) {
                candidateDirs.push(runIdDir);
                break;
            }
        }
    }

    if (candidateDirs.length === 0) return null;

    // Collect all coverage files across candidate dirs
    const allContentFiles: Map<string, string[]> = new Map();
    const allBackgroundFiles: Map<string, string[]> = new Map();

    for (const idDir of candidateDirs) {
        const { contentFiles, backgroundFiles } = collectCoverageFiles(idDir);
        for (const [tc, files] of contentFiles) {
            if (!allContentFiles.has(tc)) allContentFiles.set(tc, []);
            allContentFiles.get(tc)!.push(...files);
        }
        for (const [tc, files] of backgroundFiles) {
            if (!allBackgroundFiles.has(tc)) allBackgroundFiles.set(tc, []);
            allBackgroundFiles.get(tc)!.push(...files);
        }
    }

    const contentLatest = pickLatestFiles(allContentFiles);
    const backgroundLatest = pickLatestFiles(allBackgroundFiles);

    if (contentLatest.length === 0 && backgroundLatest.length === 0) return null;

    // Build source resolvers
    const distDir = path.join(projectRoot, 'dist', 'development', 'chrome-test');
    const bgResolver = buildSourceResolver(
        path.join(distDir, 'background.js'),
        path.join(distDir, 'background.js.map'),
    );
    const contentResolver = buildSourceResolver(
        path.join(distDir, 'content.js'),
        path.join(distDir, 'content.js.map'),
    );

    // Load background baseline (probe/background/*.v8.json)
    const baselineBgDir = path.join(coverageRawDir, 'probe', 'background');
    const bgBaseline = buildBaselineMap(baselineBgDir);
    const hasBgBaseline = bgBaseline !== null;

    // Resolve content baseline: use pre-computed derived baseline if provided,
    // otherwise compute it lazily (only when not supplied by caller)
    const contentBaseline: Map<string, number> | null =
        derivedContentBaseline !== undefined
            ? (derivedContentBaseline.size > 0 ? derivedContentBaseline : null)
            : (computeDerivedContentBaseline(coverageRawDir).size > 0
                ? computeDerivedContentBaseline(coverageRawDir)
                : null);

    const hasContentBaseline = contentBaseline !== null;

    // Determine baselineSource
    let baselineSource: 'probe' | 'derived' | 'none';
    if (hasBgBaseline || hasContentBaseline) {
        // If the content baseline was derived (not probe), report 'derived'
        // Background always uses probe; if both present, 'probe' takes precedence for bg
        // but we report 'derived' when any derived baseline was used
        baselineSource = hasContentBaseline ? 'derived' : 'probe';
    } else {
        baselineSource = 'none';
    }

    const hasBaseline = hasBgBaseline || hasContentBaseline;

    // Build targets
    const backgroundTarget = buildRelevantTarget(backgroundLatest, bgBaseline, bgResolver);
    const contentTarget = buildRelevantTarget(contentLatest, contentBaseline, contentResolver);

    return {
        commandId: uniqueId,
        hasBaseline,
        baselineSource,
        content: contentTarget,
        background: backgroundTarget,
    };
}

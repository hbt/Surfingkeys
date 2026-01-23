/**
 * CDP Coverage Collection Utilities
 *
 * Provides reusable functions for V8 code coverage collection
 * during CDP integration tests.
 */

import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';

const COVERAGE_DIR = '/tmp/cdp-coverage';

// Message ID counter for CDP commands
let messageId = 0;

/**
 * Send a CDP command and wait for response
 * @param ws WebSocket connection
 * @param method CDP method name (e.g., 'Profiler.enable')
 * @param params Optional parameters
 * @returns Promise resolving to CDP response result
 */
export function sendCDPCommand(ws: WebSocket, method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = ++messageId;
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout waiting for CDP response for ${method}`));
        }, 10000);

        const handler = (data: any) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.id === id) {
                    clearTimeout(timeout);
                    ws.removeListener('message', handler);
                    if (msg.error) {
                        reject(new Error(`CDP error for ${method}: ${msg.error.message}`));
                    } else {
                        resolve(msg.result);
                    }
                }
            } catch (err) {
                // Ignore parsing errors for messages we're not waiting for
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

/**
 * Initialize coverage directory and start V8 coverage collection
 * @param targetWs WebSocket connection to the target (content page, frontend, etc.)
 * @param targetName Name of the target for logging
 */
export async function startCoverage(targetWs: WebSocket, targetName: string = 'page'): Promise<void> {
    // Create coverage directory if it doesn't exist
    if (!fs.existsSync(COVERAGE_DIR)) {
        fs.mkdirSync(COVERAGE_DIR, { recursive: true });
    }

    try {
        console.log(`✓ Starting V8 coverage collection for ${targetName}...`);
        await sendCDPCommand(targetWs, 'Profiler.enable');
        await sendCDPCommand(targetWs, 'Profiler.startPreciseCoverage', {
            callCount: true,
            detailed: true
        });
        console.log(`✓ V8 coverage collection started for ${targetName}`);
    } catch (err) {
        console.error(`Warning: Could not start coverage for ${targetName}:`, err);
    }
}

/**
 * Collect V8 coverage data and save to file
 * @param targetWs WebSocket connection to the target
 * @param testName Name of the test (used in filename)
 * @returns Path to the saved coverage file, or null if collection failed
 */
export async function collectCoverage(
    targetWs: WebSocket,
    testName: string = 'test'
): Promise<string | null> {
    try {
        console.log('✓ Collecting V8 coverage...');
        const coverage = await sendCDPCommand(targetWs, 'Profiler.takePreciseCoverage');
        await sendCDPCommand(targetWs, 'Profiler.stopPreciseCoverage');

        // Write coverage file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const coverageFileName = `page-${testName}-coverage-${timestamp}.json`;
        const coveragePath = path.join(COVERAGE_DIR, coverageFileName);
        fs.writeFileSync(coveragePath, JSON.stringify(coverage, null, 2));
        console.log(`✓ Coverage saved: ${coverageFileName}`);

        return coveragePath;
    } catch (err) {
        console.error('Warning: Could not collect coverage:', err);
        return null;
    }
}

/**
 * Find the latest coverage file for a specific test
 * @param testName Name of the test to find coverage for
 * @returns Path to the latest coverage file, or null if not found
 */
export function findLatestCoverageFile(testName: string): string | null {
    if (!fs.existsSync(COVERAGE_DIR)) {
        return null;
    }

    try {
        const files = fs.readdirSync(COVERAGE_DIR)
            .filter(f => f.includes(`-${testName}-coverage-`) && f.endsWith('.json'))
            .map(f => ({
                name: f,
                path: path.join(COVERAGE_DIR, f),
                time: fs.statSync(path.join(COVERAGE_DIR, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        return files.length > 0 ? files[0].path : null;
    } catch (err) {
        return null;
    }
}

/**
 * Analyze coverage data and generate function-level summary
 * @param coverage Raw V8 coverage data
 * @returns Function-level summary with execution counts and coverage percentage
 */
export function generateFunctionSummary(coverage: any): any {
    const functionSummary: any = {};

    coverage.result.forEach((script: any) => {
        script.functions.forEach((func: any) => {
            // Calculate total executions across all ranges
            const totalCount = func.ranges.reduce((sum: number, r: any) => sum + r.count, 0);

            // Count uncovered branches (count === 0)
            const uncoveredRanges = func.ranges.filter((r: any) => r.count === 0).length;
            const totalRanges = func.ranges.length;

            // Calculate coverage percentage
            const coveragePercent = totalRanges === 1
                ? (totalCount > 0 ? 100 : 0)
                : Math.round(((totalRanges - uncoveredRanges) / totalRanges) * 100);

            functionSummary[func.functionName || '<anonymous>'] = {
                scriptUrl: script.url,
                totalExecutions: totalCount,
                totalBranches: totalRanges,
                uncoveredBranches: uncoveredRanges,
                coveragePercent: coveragePercent,
                isBlockCoverage: func.isBlockCoverage
            };
        });
    });

    return functionSummary;
}

/**
 * Generate hot path and cold path analysis from coverage data
 * @param coverage Raw V8 coverage data
 * @returns Analysis object with hottest, coldest, and most uncovered functions
 */
export function generateHotPathAnalysis(coverage: any): any {
    const hotPaths: any[] = [];
    const coldPaths: any[] = [];
    const uncoveredStats: any[] = [];

    coverage.result.forEach((script: any) => {
        script.functions.forEach((func: any) => {
            const funcName = func.functionName || '<anonymous>';
            const totalCount = func.ranges.reduce((sum: number, r: any) => sum + r.count, 0);
            const uncoveredRanges = func.ranges.filter((r: any) => r.count === 0).length;
            const totalRanges = func.ranges.length;

            // Track hot paths (high execution count)
            hotPaths.push({
                functionName: funcName,
                scriptUrl: script.url,
                executionCount: totalCount,
                branches: totalRanges
            });

            // Track cold paths (count === 0)
            if (totalCount === 0) {
                coldPaths.push({
                    functionName: funcName,
                    scriptUrl: script.url,
                    branches: totalRanges,
                    reason: 'never executed'
                });
            }

            // Track functions with most uncovered branches
            if (uncoveredRanges > 0) {
                uncoveredStats.push({
                    functionName: funcName,
                    scriptUrl: script.url,
                    uncoveredBranches: uncoveredRanges,
                    totalBranches: totalRanges,
                    coveragePercent: Math.round(((totalRanges - uncoveredRanges) / totalRanges) * 100)
                });
            }
        });
    });

    // Sort and take top 10
    hotPaths.sort((a: any, b: any) => b.executionCount - a.executionCount);
    uncoveredStats.sort((a: any, b: any) => b.uncoveredBranches - a.uncoveredBranches);

    return {
        hottest: hotPaths.slice(0, 10),
        coldest: coldPaths.slice(0, 10),
        mostUncovered: uncoveredStats.slice(0, 10)
    };
}

/**
 * Collect V8 coverage and generate analysis reports
 * @param targetWs WebSocket connection to the target
 * @param testName Name of the test (used in filename)
 * @returns Path to the coverage file with analysis, or null if collection failed
 */
export async function collectCoverageWithAnalysis(
    targetWs: WebSocket,
    testName: string = 'test'
): Promise<string | null> {
    try {
        console.log('✓ Collecting V8 coverage with analysis...');
        const coverage = await sendCDPCommand(targetWs, 'Profiler.takePreciseCoverage');
        await sendCDPCommand(targetWs, 'Profiler.stopPreciseCoverage');

        // Generate analyses
        const functionSummary = generateFunctionSummary(coverage);
        const hotPathAnalysis = generateHotPathAnalysis(coverage);

        // Create enhanced coverage object
        const enhancedCoverage = {
            ...coverage,
            analysis: {
                functionSummary,
                hotPathAnalysis
            }
        };

        // Write coverage file with analysis
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const coverageFileName = `page-${testName}-coverage-${timestamp}.json`;
        const coveragePath = path.join(COVERAGE_DIR, coverageFileName);
        fs.writeFileSync(coveragePath, JSON.stringify(enhancedCoverage, null, 2));
        console.log(`✓ Coverage with analysis saved: ${coverageFileName}`);

        return coveragePath;
    } catch (err) {
        console.error('Warning: Could not collect coverage:', err);
        return null;
    }
}

/**
 * Extract coverage summary from V8 coverage data
 * Calculates function, statement, and byte coverage percentages
 * @param coverage Raw V8 coverage data
 * @returns Summary object with coverage percentages
 */
export function extractCoverageSummary(coverage: any): { functions: number; statements: number; bytes: number } {
    let totalFunctions = 0;
    let coveredFunctions = 0;
    let totalStatements = 0;
    let coveredStatements = 0;
    let totalBytes = 0;
    let coveredBytes = 0;

    coverage.result.forEach((script: any) => {
        script.functions.forEach((func: any) => {
            totalFunctions++;

            func.ranges.forEach((range: any) => {
                totalStatements++;
                const rangeBytes = range.endOffset - range.startOffset;
                totalBytes += rangeBytes;

                if (range.count > 0) {
                    coveredStatements++;
                    coveredBytes += rangeBytes;
                }
            });

            // Function is considered covered if at least one range has count > 0
            const isCovered = func.ranges.some((r: any) => r.count > 0);
            if (isCovered) {
                coveredFunctions++;
            }
        });
    });

    return {
        functions: totalFunctions === 0 ? 0 : Math.round((coveredFunctions / totalFunctions) * 100),
        statements: totalStatements === 0 ? 0 : Math.round((coveredStatements / totalStatements) * 100),
        bytes: totalBytes === 0 ? 0 : Math.round((coveredBytes / totalBytes) * 100)
    };
}

/**
 * Calculate delta between two coverage snapshots
 * @param beforeCoverage Coverage snapshot before test
 * @param afterCoverage Coverage snapshot after test
 * @returns Delta object with difference in coverage percentages
 */
export function calculateCoverageDelta(beforeCoverage: any, afterCoverage: any): { functions: number; statements: number; bytes: number } {
    const beforeSummary = extractCoverageSummary(beforeCoverage);
    const afterSummary = extractCoverageSummary(afterCoverage);

    return {
        functions: afterSummary.functions - beforeSummary.functions,
        statements: afterSummary.statements - beforeSummary.statements,
        bytes: afterSummary.bytes - beforeSummary.bytes
    };
}

/**
 * Capture coverage snapshot before test execution
 * @param ws WebSocket connection to the target
 * @returns Coverage snapshot data
 */
export async function captureBeforeCoverage(ws: WebSocket): Promise<any> {
    try {
        const coverage = await sendCDPCommand(ws, 'Profiler.takePreciseCoverage');
        return coverage;
    } catch (err) {
        console.error('Warning: Could not capture before coverage:', err);
        return null;
    }
}

/**
 * Capture coverage snapshot after test execution and save delta
 * @param ws WebSocket connection to the target
 * @param testName Name of the test (used in filename)
 * @param beforeCoverage Coverage snapshot captured before the test
 * @returns Path to the saved per-test coverage file, or null if collection failed
 */
export async function captureAfterCoverage(
    ws: WebSocket,
    testName: string,
    beforeCoverage: any
): Promise<string | null> {
    if (!beforeCoverage) {
        console.warn('Warning: No before coverage available for delta calculation');
        return null;
    }

    try {
        const afterCoverage = await sendCDPCommand(ws, 'Profiler.takePreciseCoverage');

        // Calculate delta
        const delta = calculateCoverageDelta(beforeCoverage, afterCoverage);

        // Generate analyses for after coverage
        const functionSummary = generateFunctionSummary(afterCoverage);
        const hotPathAnalysis = generateHotPathAnalysis(afterCoverage);

        // Create per-test coverage object with delta and analysis
        const perTestCoverage = {
            testName,
            delta,
            timestamp: new Date().toISOString(),
            coverage: afterCoverage,
            analysis: {
                functionSummary,
                hotPathAnalysis
            }
        };

        // Write per-test coverage file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedTestName = testName.replace(/[^a-zA-Z0-9-_]/g, '_');
        const coverageFileName = `page-${sanitizedTestName}-per-test-coverage-${timestamp}.json`;
        const coveragePath = path.join(COVERAGE_DIR, coverageFileName);
        fs.writeFileSync(coveragePath, JSON.stringify(perTestCoverage, null, 2));
        console.log(`✓ Per-test coverage saved: ${coverageFileName}`);

        return coveragePath;
    } catch (err) {
        console.error('Warning: Could not capture after coverage:', err);
        return null;
    }
}

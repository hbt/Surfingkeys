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

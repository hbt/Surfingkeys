/**
 * Proxy Log Verification Test
 *
 * Tests that proxy logging correctly captures console output from extension contexts.
 * Incrementally verifies what appears in the proxy logs.
 *
 * Each test logs to console and verifies the message appears in the captured proxy log.
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/infrastructure/proxy-log.test.ts
 */

import WebSocket from 'ws';
import * as fs from 'fs';
import * as readline from 'readline'; // Used in readProxyLog()
import {
    checkCDPAvailable,
    findExtensionBackground,
    connectToCDP,
    closeCDP,
    executeInTarget
} from '../utils/cdp-client';
import { CDP_PORT } from '../cdp-config';

interface ProxyLogEntry {
    timestamp: string;
    type: string;
    level?: string;
    message: string;
    targetUrl?: string;
    args?: any[];
    [key: string]: any;
}

/**
 * Find the most recently modified proxy log file
 * Returns the path or null if not found
 */
function findMostRecentProxyLog(): string | null {
    try {
        const files = fs.readdirSync('/tmp');
        const proxyLogFiles = files
            .filter(f => f.startsWith('dbg-proxy-test-') && f.endsWith('.jsonl'))
            .map(f => ({
                name: f,
                path: `/tmp/${f}`,
                mtime: fs.statSync(`/tmp/${f}`).mtimeMs
            }))
            .sort((a, b) => b.mtime - a.mtime);

        return proxyLogFiles.length > 0 ? proxyLogFiles[0].path : null;
    } catch (e) {
        return null;
    }
}

describe('Proxy Log Verification', () => {
    let bgWs: WebSocket;
    let proxyLogFile: string | null = null;

    beforeAll(async () => {
        // Check CDP is available
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        // Connect to background
        const bgInfo = await findExtensionBackground();
        bgWs = await connectToCDP(bgInfo.wsUrl);

        // Find the proxy log file (it's created by the proxy for this test)
        // Look for the most recently modified /tmp/dbg-proxy-test-*.jsonl file
        proxyLogFile = findMostRecentProxyLog();
    });

    afterAll(async () => {
        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    /**
     * Helper: Read proxy log file and parse JSON lines
     */
    async function readProxyLog(): Promise<ProxyLogEntry[]> {
        if (!proxyLogFile) {
            // Try to find it again in case it wasn't found initially
            proxyLogFile = findMostRecentProxyLog();
            if (!proxyLogFile) {
                throw new Error('PROXY_LOG_FILE not found');
            }
        }

        // Wait a moment to ensure file is flushed
        await new Promise(resolve => setTimeout(resolve, 200));

        const entries: ProxyLogEntry[] = [];

        // Check if file exists
        if (!fs.existsSync(proxyLogFile)) {
            throw new Error(`Proxy log file does not exist: ${proxyLogFile}`);
        }

        const fileStream = fs.createReadStream(proxyLogFile);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            if (line.trim()) {
                try {
                    entries.push(JSON.parse(line));
                } catch (e) {
                    // Skip malformed lines
                }
            }
        }

        return entries;
    }

    /**
     * Helper: Find console log entry with specific message
     */
    function findConsoleLog(
        entries: ProxyLogEntry[],
        messagePattern: string | RegExp,
        targetUrlPattern?: string | RegExp
    ): ProxyLogEntry | undefined {
        return entries.find((entry) => {
            if (entry.type !== 'CONSOLE') return false;
            if (entry.level !== 'LOG') return false;

            const messageMatch = typeof messagePattern === 'string'
                ? entry.message?.includes(messagePattern)
                : messagePattern.test(entry.message || '');

            if (!messageMatch) return false;

            if (targetUrlPattern) {
                const urlMatch = typeof targetUrlPattern === 'string'
                    ? entry.targetUrl?.includes(targetUrlPattern)
                    : targetUrlPattern.test(entry.targetUrl || '');
                return urlMatch;
            }

            return true;
        });
    }

    describe('Console Log Capture', () => {
        test('should capture simple console.log from background service worker', async () => {
            const testMessage = `TEST_MESSAGE_${Date.now()}`;

            // Execute console.log in background
            await executeInTarget(bgWs, `console.log('${testMessage}')`);

            // Wait for log to be written to proxy log file
            await new Promise(resolve => setTimeout(resolve, 500));

            // Read proxy log
            const logEntries = await readProxyLog();

            // Find the log entry
            const logEntry = findConsoleLog(logEntries, testMessage, 'background.js');

            expect(logEntry).toBeDefined();
            expect(logEntry?.message).toContain(testMessage);
            expect(logEntry?.level).toBe('LOG');
            expect(logEntry?.targetUrl).toContain('background.js');
        });

        test('should capture console.log with multiple arguments', async () => {
            const testId = `ID_${Date.now()}`;
            const testValue = 42;

            // Execute console.log with multiple args in background
            await executeInTarget(
                bgWs,
                `console.log('${testId}', ${testValue}, 'suffix')`
            );

            // Wait a moment for log to be written
            await new Promise(resolve => setTimeout(resolve, 100));

            // Read proxy log
            const logEntries = await readProxyLog();

            // Find the log entry
            const logEntry = findConsoleLog(logEntries, testId, 'background.js');

            expect(logEntry).toBeDefined();
            expect(logEntry?.message).toContain(testId);
            expect(logEntry?.args).toBeDefined();
            expect(logEntry?.args?.length).toBeGreaterThan(0);
        });

        test('should capture console.warn as WARNING level', async () => {
            const warnMessage = `WARN_MESSAGE_${Date.now()}`;

            // Execute console.warn in background
            await executeInTarget(bgWs, `console.warn('${warnMessage}')`);

            // Wait a moment for log to be written
            await new Promise(resolve => setTimeout(resolve, 100));

            // Read proxy log
            const logEntries = await readProxyLog();

            // Find warn entries
            const warnEntry = logEntries.find((entry) => {
                if (entry.type !== 'CONSOLE') return false;
                if (entry.level !== 'WARNING') return false;
                return entry.message?.includes(warnMessage);
            });

            expect(warnEntry).toBeDefined();
            expect(warnEntry?.level).toBe('WARNING');
            expect(warnEntry?.message).toContain(warnMessage);
        });

        test('should capture sequential logs in order', async () => {
            const log1 = `LOG1_${Date.now()}`;
            const log2 = `LOG2_${Date.now()}`;

            // Execute two sequential logs
            await executeInTarget(bgWs, `
                console.log('${log1}');
                console.log('${log2}');
            `);

            // Wait for logs to be written
            await new Promise(resolve => setTimeout(resolve, 100));

            // Read proxy log
            const logEntries = await readProxyLog();

            // Find both logs
            const log1Entry = findConsoleLog(logEntries, log1);
            const log2Entry = findConsoleLog(logEntries, log2);

            expect(log1Entry).toBeDefined();
            expect(log2Entry).toBeDefined();

            // Find indices
            const log1Index = logEntries.indexOf(log1Entry!);
            const log2Index = logEntries.indexOf(log2Entry!);

            // log2 should come after log1
            expect(log2Index).toBeGreaterThan(log1Index);
        });

        test('should include stack trace information in console logs', async () => {
            const testMessage = `STACK_TEST_${Date.now()}`;

            // Execute a console.log that will have stack trace info
            await executeInTarget(bgWs, `
                function testFunc() {
                    console.log('${testMessage}');
                }
                testFunc();
            `);

            // Wait for log to be written
            await new Promise(resolve => setTimeout(resolve, 100));

            // Read proxy log
            const logEntries = await readProxyLog();

            // Find the log entry
            const logEntry = findConsoleLog(logEntries, testMessage);

            expect(logEntry).toBeDefined();
            expect(logEntry?.stackTrace).toBeDefined();
            expect(logEntry?.stackTrace?.callFrames).toBeDefined();
            expect(Array.isArray(logEntry?.stackTrace?.callFrames)).toBe(true);
        });
    });
});

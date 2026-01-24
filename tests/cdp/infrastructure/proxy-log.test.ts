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
    findContentPage,
    connectToCDP,
    createTab,
    closeTab,
    closeCDP,
    executeInTarget
} from '../utils/cdp-client';
import { sendKey } from '../utils/browser-actions';
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
    let pageWs: WebSocket | null = null;
    let frontendWs: WebSocket | null = null;
    let tabId: number | null = null;
    let proxyLogFile: string | null = null;

    const FIXTURE_URL = 'http://127.0.0.1:9873/hackernews.html';

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
        // Close frontend
        if (frontendWs) {
            await closeCDP(frontendWs);
        }

        // Close content page
        if (pageWs) {
            await closeCDP(pageWs);
        }

        // Close tab
        if (tabId && bgWs) {
            await closeTab(bgWs, tabId);
        }

        // Close background
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

    /**
     * Helper: Get CDP targets and find frontend target
     */
    async function findFrontendTarget(): Promise<any | undefined> {
        const port = process.env.CDP_PORT || '9222';
        const cdpJsonUrl = `http://127.0.0.1:${port}/json/list`;

        const targets = await new Promise<any[]>((resolve, reject) => {
            const http = require('http');
            http.get(cdpJsonUrl, (res: any) => {
                let data = '';
                res.on('data', (chunk: any) => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });

        return targets.find(t => t.url?.includes('frontend.html') && t.webSocketDebuggerUrl);
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

    describe('Content Script Console Log Capture', () => {
        test('should capture console.log from content script', async () => {
            // Create tab with fixture URL
            tabId = await createTab(bgWs, FIXTURE_URL, true);

            // Find and connect to content page
            const pageWsUrl = await findContentPage(FIXTURE_URL);
            pageWs = await connectToCDP(pageWsUrl);

            const testMessage = `CONTENT_SCRIPT_LOG_${Date.now()}`;

            // Execute console.log in content script context
            await executeInTarget(pageWs, `console.log('${testMessage}')`);

            // Wait for log to be written
            await new Promise(resolve => setTimeout(resolve, 500));

            // Read proxy log
            const logEntries = await readProxyLog();

            // Find the log entry from content page
            const logEntry = logEntries.find((entry) => {
                if (entry.type !== 'CONSOLE') return false;
                if (entry.level !== 'LOG') return false;
                return entry.message?.includes(testMessage) && entry.targetUrl?.includes(FIXTURE_URL);
            });

            expect(logEntry).toBeDefined();
            expect(logEntry?.message).toContain(testMessage);
            expect(logEntry?.targetUrl).toContain(FIXTURE_URL);
            expect(logEntry?.targetUrl).not.toContain('background.js');
        });

        test('should capture console.log with multiple arguments from content script', async () => {
            if (!pageWs) throw new Error('Content page not connected');

            const testId = `CONTENT_ID_${Date.now()}`;
            const testValue = 999;

            // Execute console.log with multiple args in content script
            await executeInTarget(
                pageWs,
                `console.log('${testId}', ${testValue}, true, { key: 'value' })`
            );

            // Wait for log to be written
            await new Promise(resolve => setTimeout(resolve, 500));

            // Read proxy log
            const logEntries = await readProxyLog();

            // Find the log entry
            const logEntry = logEntries.find((entry) => {
                if (entry.type !== 'CONSOLE') return false;
                return entry.message?.includes(testId);
            });

            expect(logEntry).toBeDefined();
            expect(logEntry?.message).toContain(testId);
            expect(logEntry?.args).toBeDefined();
            expect(logEntry?.args?.length).toBeGreaterThan(0);
        });

        test('should distinguish between background and content script logs by targetUrl', async () => {
            if (!pageWs) throw new Error('Content page not connected');

            const bgMessage = `BG_${Date.now()}`;
            const contentMessage = `CONTENT_${Date.now()}`;

            // Log from background
            await executeInTarget(bgWs, `console.log('${bgMessage}')`);

            // Log from content script
            await executeInTarget(pageWs, `console.log('${contentMessage}')`);

            // Wait for logs to be written
            await new Promise(resolve => setTimeout(resolve, 500));

            // Read proxy log
            const logEntries = await readProxyLog();

            // Find both entries
            const bgEntry = logEntries.find(e =>
                e.type === 'CONSOLE' && e.message?.includes(bgMessage)
            );
            const contentEntry = logEntries.find(e =>
                e.type === 'CONSOLE' && e.message?.includes(contentMessage)
            );

            expect(bgEntry).toBeDefined();
            expect(contentEntry).toBeDefined();

            // Verify they have different targetUrls
            expect(bgEntry?.targetUrl).toContain('background.js');
            expect(contentEntry?.targetUrl).toContain(FIXTURE_URL);
            expect(bgEntry?.targetUrl).not.toBe(contentEntry?.targetUrl);
        });

        test('should list all CDP targets after tab creation (background, content, frontend)', async () => {
            if (!pageWs) throw new Error('Content page not connected');

            // Get CDP targets
            const port = process.env.CDP_PORT || '9222';
            const cdpJsonUrl = `http://127.0.0.1:${port}/json/list`;

            const targets = await new Promise<any[]>((resolve, reject) => {
                const http = require('http');
                http.get(cdpJsonUrl, (res: any) => {
                    let data = '';
                    res.on('data', (chunk: any) => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(e);
                        }
                    });
                }).on('error', reject);
            });

            // Should have multiple targets
            expect(targets.length).toBeGreaterThan(0);

            // Find different target types
            const backgroundTarget = targets.find(t => t.url?.includes('background.js'));
            const pageTarget = targets.find(t => t.url?.includes(FIXTURE_URL));
            const frontendTarget = targets.find(t => t.url?.includes('frontend.html'));

            expect(backgroundTarget).toBeDefined();
            expect(pageTarget).toBeDefined();

            console.log(`CDP Targets: ${targets.length} total`);
            console.log(`  ✓ background=${!!backgroundTarget}`);
            console.log(`  ✓ content=${!!pageTarget}`);
            console.log(`  ✓ frontend=${!!frontendTarget}`);
        });
    });

    describe('Frontend Console Log Capture', () => {
        test('should have frontend.html as target (already loaded as iframe)', async () => {
            if (!pageWs) throw new Error('Content page not connected');

            // Frontend is loaded as an iframe from the start, not on-demand
            const frontendTarget = await findFrontendTarget();
            expect(frontendTarget).toBeDefined();
            expect(frontendTarget?.webSocketDebuggerUrl).toBeDefined();
            expect(frontendTarget?.type).toBe('iframe');

            console.log(`✓ frontend.html found at: ${frontendTarget?.url?.substring(0, 70)}`);
        });

        test('should capture console.log from frontend context', async () => {
            if (!pageWs) throw new Error('Content page not connected');

            // Find and connect to frontend if not already connected
            if (!frontendWs) {
                const frontendTarget = await findFrontendTarget();
                if (!frontendTarget) {
                    throw new Error('Frontend target not found - press ? key first');
                }
                frontendWs = await connectToCDP(frontendTarget.webSocketDebuggerUrl);
            }

            const testMessage = `FRONTEND_LOG_${Date.now()}`;

            // Execute console.log in frontend context
            await executeInTarget(frontendWs, `console.log('${testMessage}')`);

            // Wait for log to be written
            await new Promise(resolve => setTimeout(resolve, 500));

            // Read proxy log
            const logEntries = await readProxyLog();

            // Find the log entry from frontend
            const logEntry = logEntries.find((entry) => {
                if (entry.type !== 'CONSOLE') return false;
                if (entry.level !== 'LOG') return false;
                return entry.message?.includes(testMessage) && entry.targetUrl?.includes('frontend.html');
            });

            expect(logEntry).toBeDefined();
            expect(logEntry?.message).toContain(testMessage);
            expect(logEntry?.targetUrl).toContain('frontend.html');
            expect(logEntry?.targetUrl).not.toContain('background.js');
            expect(logEntry?.targetUrl).not.toContain(FIXTURE_URL);

            console.log(`✓ frontend console.log captured in proxy log`);
        });

        test('should distinguish frontend logs by targetUrl from background and content', async () => {
            if (!pageWs || !frontendWs) throw new Error('Page or frontend not connected');

            const bgMsg = `BG_${Date.now()}`;
            const contentMsg = `CONTENT_${Date.now()}`;
            const frontendMsg = `FRONTEND_${Date.now()}`;

            // Log from each context
            await executeInTarget(bgWs, `console.log('${bgMsg}')`);
            await executeInTarget(pageWs, `console.log('${contentMsg}')`);
            await executeInTarget(frontendWs, `console.log('${frontendMsg}')`);

            // Wait for logs to be written
            await new Promise(resolve => setTimeout(resolve, 500));

            // Read proxy log
            const logEntries = await readProxyLog();

            // Find entries from each context
            const bgEntry = logEntries.find(e => e.type === 'CONSOLE' && e.message?.includes(bgMsg));
            const contentEntry = logEntries.find(e => e.type === 'CONSOLE' && e.message?.includes(contentMsg));
            const frontendEntry = logEntries.find(e => e.type === 'CONSOLE' && e.message?.includes(frontendMsg));

            expect(bgEntry).toBeDefined();
            expect(contentEntry).toBeDefined();
            expect(frontendEntry).toBeDefined();

            // Verify distinct targetUrls
            expect(bgEntry?.targetUrl).toContain('background.js');
            expect(contentEntry?.targetUrl).toContain(FIXTURE_URL);
            expect(frontendEntry?.targetUrl).toContain('frontend.html');

            // All three should be different
            const urls = [bgEntry?.targetUrl, contentEntry?.targetUrl, frontendEntry?.targetUrl];
            const uniqueUrls = new Set(urls);
            expect(uniqueUrls.size).toBe(3);

            console.log(`✓ All three contexts logged with distinct targetUrls`);
        });
    });
});

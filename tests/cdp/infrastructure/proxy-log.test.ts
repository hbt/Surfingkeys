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
import { sendKey, getScrollPosition, waitForScrollChange, enableInputDomain, waitForSurfingkeysReady } from '../utils/browser-actions';
import { runHeadlessConfigSet, clearHeadlessConfig } from '../utils/config-set-headless';
import { CDP_PORT } from '../cdp-config';
import { loadConfigAndOpenPage } from '../utils/config-test-helpers';

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

    describe('Proxy Target Attachment Diagnostics', () => {
        /**
         * DIAGNOSTIC TEST: Verify proxy attaches to new targets before checking logs
         *
         * This test helps identify timing issues by explicitly verifying:
         * 1. Proxy discovers the new tab
         * 2. Proxy successfully opens passive connection (attachment)
         * 3. Console logs are then captured
         *
         * If this test fails, it indicates a problem with target discovery timing.
         */
        test('[DIAGNOSTIC] should confirm proxy attaches to new tab before checking console logs', async () => {
            const diagTabId = await createTab(bgWs, FIXTURE_URL, true);
            const diagPageWsUrl = await findContentPage(FIXTURE_URL);
            const diagPageWs = await connectToCDP(diagPageWsUrl);

            // Verification Step 1: Check that proxy discovered and attached to the new tab
            // Poll the proxy logs for the "Passive connection opened" event for this tab's URL
            let attachmentConfirmed = false;
            let attachmentEntry: ProxyLogEntry | undefined;
            const maxWaitMs = 5000;  // Wait up to 5 seconds for attachment
            const pollIntervalMs = 200;
            const startTime = Date.now();

            while (Date.now() - startTime < maxWaitMs && !attachmentConfirmed) {
                const logEntries = await readProxyLog();

                // Look for proxy attachment message for this specific tab URL
                attachmentEntry = logEntries.find((entry) => {
                    if (entry.type !== 'PROXY') return false;
                    if (entry.message !== 'Passive connection opened') return false;
                    if (entry.status !== 'connected') return false;
                    // Match by URL pattern (should contain the fixture URL)
                    return entry.targetUrl?.includes(FIXTURE_URL);
                });

                if (attachmentEntry) {
                    attachmentConfirmed = true;
                    console.log(`✓ Pre-flight check PASSED: Proxy attached at ${attachmentEntry.timestamp}`);
                    console.log(`  - Target: ${attachmentEntry.targetUrl}`);
                    console.log(`  - Target ID: ${attachmentEntry.targetId}`);
                } else {
                    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                }
            }

            // Assert that proxy is attached before proceeding to console.log check
            expect(attachmentConfirmed).toBe(true);
            expect(attachmentEntry).toBeDefined();
            expect(attachmentEntry?.targetUrl).toContain(FIXTURE_URL);

            // Verification Step 2: Now that we confirmed attachment, send console.log
            const diagMessage = `DIAGNOSTIC_${Date.now()}`;
            await executeInTarget(diagPageWs, `console.log('${diagMessage}')`);

            // Verification Step 3: Verify the console.log was captured
            // Wait for logs to be written (proxy should already be attached)
            await new Promise(resolve => setTimeout(resolve, 500));

            const logEntries = await readProxyLog();
            const consoleLogEntry = logEntries.find((entry) => {
                if (entry.type !== 'CONSOLE') return false;
                if (entry.level !== 'LOG') return false;
                return entry.message?.includes(diagMessage);
            });

            expect(consoleLogEntry).toBeDefined();
            expect(consoleLogEntry?.message).toContain(diagMessage);
            expect(consoleLogEntry?.targetUrl).toContain(FIXTURE_URL);

            console.log(`✓ Console.log captured: ${consoleLogEntry?.message}`);

            // Verification Step 4: Check if api.mapcmdkey function was actually called
            // by looking at the call counter we increment inside it
            const callCountBefore = await executeInTarget(diagPageWs, 'window.__mapcmdkey_call_count || 0');
            console.log(`[STEP4] Call count before: ${callCountBefore}`);

            // Cleanup
            await closeCDP(diagPageWs);
            await closeTab(bgWs, diagTabId);
        });
    });

    describe('Config Execution Verification via Functional Behavior', () => {
        // Config fixture contains: api.mapcmdkey('w', 'cmd_scroll_down');
        // NOTE: Config code runs in MV3 isolated world (chrome.userScripts sandbox)
        const CONFIG_FIXTURE_PATH = 'data/fixtures/headless-config-sample.js';

        test('should load config file successfully', async () => {
            // Load config using signal-based verification (runHeadlessConfigSet waits for _isConfigReady)
            const configResult = await runHeadlessConfigSet({
                bgWs,
                configPath: CONFIG_FIXTURE_PATH,
                waitAfterSetMs: 5000,  // Timeout for config registration signal
                ensureAdvancedMode: false
            });

            expect(configResult.success).toBe(true);
            expect(configResult.validate.syntaxValid).toBe(true);
            expect(configResult.postValidation?.hashMatches).toBe(true);

            console.log(`✓ Config loaded: hash verified, path stored`);
        });

        test('should execute custom keybinding from config (w → scroll down)', async () => {
            const context = await loadConfigAndOpenPage({
                bgWs,
                configPath: CONFIG_FIXTURE_PATH,
                fixtureUrl: FIXTURE_URL
            });

            const configPageWs = context.pageWs;

            // Enable input domain for keyboard events
            enableInputDomain(configPageWs);

            // ===== STEP 1: Verify proxy is attached to this target =====
            let proxyAttachmentConfirmed = false;
            let attachmentEntry: ProxyLogEntry | undefined;
            const attachMaxWaitMs = 3000;
            const attachPollIntervalMs = 100;
            const attachStartTime = Date.now();

            while (Date.now() - attachStartTime < attachMaxWaitMs && !proxyAttachmentConfirmed) {
                const logEntries = await readProxyLog();
                attachmentEntry = logEntries.find((entry) => {
                    if (entry.type !== 'PROXY') return false;
                    if (entry.message !== 'Passive connection opened') return false;
                    if (entry.status !== 'connected') return false;
                    return entry.targetUrl?.includes(FIXTURE_URL);
                });

                if (attachmentEntry) {
                    proxyAttachmentConfirmed = true;
                    console.log(`✓ CONFIRMED: Proxy attached to config tab at ${attachmentEntry.timestamp}`);
                } else {
                    await new Promise(resolve => setTimeout(resolve, attachPollIntervalMs));
                }
            }

            expect(proxyAttachmentConfirmed).toBe(true);
            expect(attachmentEntry?.targetUrl).toContain(FIXTURE_URL);

            // ===== STEP 2: Issue console.log via CDP directly to verify proxy captures it =====
            const directLogMsg = `DIRECT_CDP_TEST_${Date.now()}`;
            await executeInTarget(configPageWs, `console.log('${directLogMsg}')`);
            await new Promise(resolve => setTimeout(resolve, 300));

            const directLogEntries = await readProxyLog();
            const directLogEntry = directLogEntries.find((entry) => {
                if (entry.type !== 'CONSOLE') return false;
                return entry.message?.includes(directLogMsg) && entry.targetUrl?.includes(FIXTURE_URL);
            });

            expect(directLogEntry).toBeDefined();
            console.log(`✓ CONFIRMED: Direct CDP console.log captured: "${directLogMsg}"`);

            // ===== STEP 3: Test actual keybinding (proves config executed) =====
            // Get initial scroll position (should be at top)
            const initialScroll = await getScrollPosition(configPageWs);
            expect(initialScroll).toBe(0);

            // Log call count before key press (to proxy logs for visibility)
            await executeInTarget(configPageWs, `
                const before = window.__mapcmdkey_call_count || 0;
                console.log('[MAPCMDKEY-COUNTER] Before key press: ' + before);
                window.__mapcmdkey_before = before;
            `);

            await new Promise(resolve => setTimeout(resolve, 100));

            // Send 'w' key (custom mapped to cmd_scroll_down by config)
            await sendKey(configPageWs, 'w');

            // Wait for scroll to change (using pattern from cmd-scroll-down.test.ts)
            const finalScroll = await waitForScrollChange(configPageWs, initialScroll, {
                direction: 'down',
                minDelta: 20
            });

            // Log call count after key press (to proxy logs for visibility)
            await new Promise(resolve => setTimeout(resolve, 500));

            // Assert scroll happened (proves custom config was executed)
            expect(finalScroll).toBeGreaterThan(initialScroll);

            console.log(`✓ Custom 'w' key works: scroll ${initialScroll}px → ${finalScroll}px (config executed!)`);

            await context.dispose();
        });

        test('should capture api.log output from config via proxy logs', async () => {
            const CONFIG_LOG_MARKER = `CONFIG-LOG-${Date.now()}`;
            const tempConfigPath = `/tmp/config-log-${CONFIG_LOG_MARKER}.js`;

            fs.writeFileSync(tempConfigPath, `
api.mapcmdkey('w', 'cmd_scroll_down');
console.log('direct console.log from config - ${CONFIG_LOG_MARKER}');
`);

            const context = await loadConfigAndOpenPage({
                bgWs,
                configPath: tempConfigPath,
                fixtureUrl: FIXTURE_URL
            });

            let configLogEntry: ProxyLogEntry | undefined;
            const waitStart = Date.now();
            const waitTimeout = 5000;

            while (!configLogEntry && Date.now() - waitStart < waitTimeout) {
                const logEntries = await readProxyLog();
                configLogEntry = logEntries.find((entry) => {
                    if (entry.type !== 'CONSOLE') return false;
                    if (entry.level !== 'LOG') return false;
                    return entry.message?.includes(CONFIG_LOG_MARKER);
                });

                if (!configLogEntry) {
                    await new Promise(resolve => setTimeout(resolve, 250));
                }
            }

            expect(configLogEntry).toBeDefined();
            expect(configLogEntry?.message).toContain('direct console.log from config');

            await context.dispose();
            fs.unlinkSync(tempConfigPath);
        });

        afterAll(async () => {
            if (bgWs) {
                await clearHeadlessConfig(bgWs).catch(() => undefined);
            }
        });
    });
});

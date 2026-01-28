/**
 * CDP Test: cmd_scroll_percentage
 *
 * Focused observability test for the scroll percentage command.
 * - Single command: cmd_scroll_percentage
 * - Single key: '%' (with numeric prefix)
 * - Single behavior: scroll to percentage
 * - Focus: verify command execution and scroll behavior without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-scroll-percentage.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-scroll-percentage.test.ts
 */

import WebSocket from 'ws';
import http from 'http';
import {
    checkCDPAvailable,
    findExtensionBackground,
    connectToCDP,
    closeCDP,
    executeInTarget
} from '../utils/cdp-client';
import { sendKey, getScrollPosition, enableInputDomain } from '../utils/browser-actions';
import { clearHeadlessConfig } from '../utils/config-set-headless';
import { loadConfigAndOpenPage, ConfigPageContext } from '../utils/config-test-helpers';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('cmd_scroll_percentage', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';
    const CONFIG_PATH = 'data/fixtures/cmd-scroll-percentage.js';

    let bgWs: WebSocket;
    let configContext: ConfigPageContext | null = null;
    let frontendWs: WebSocket | null = null;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    /**
     * Get list of all CDP targets
     */
    async function getCDPTargets(): Promise<any[]> {
        const port = process.env.CDP_PORT || CDP_PORT;
        const url = `http://127.0.0.1:${port}/json/list`;

        return new Promise((resolve, reject) => {
            const req = http.get(url, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(e);
                    }
                });
                res.on('error', reject);
            });
            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Timeout fetching CDP targets'));
            });
        });
    }

    /**
     * Connect to frontend iframe target
     */
    async function getFrontendWs(): Promise<WebSocket> {
        if (frontendWs && frontendWs.readyState === WebSocket.OPEN) {
            console.log(`[TEST] Reusing existing frontend connection`);
            return frontendWs;
        }

        console.log(`[TEST] Creating new frontend connection...`);
        const targets = await getCDPTargets();

        const frontendTarget = targets.find((t: any) =>
            t.url && (t.url.includes('frontend.html') ||
                      (t.type === 'page' && t.url.includes('chrome-extension://') && !t.url.includes('background')))
        );

        if (!frontendTarget || !frontendTarget.webSocketDebuggerUrl) {
            throw new Error(`Frontend target not found. Available: ${targets.map((t: any) => t.url).join(', ')}`);
        }

        frontendWs = new WebSocket(frontendTarget.webSocketDebuggerUrl);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Frontend WebSocket connection timeout'));
            }, 5000);

            frontendWs!.addEventListener('open', () => {
                clearTimeout(timeout);
                resolve(frontendWs!);
            }, { once: true });

            frontendWs!.addEventListener('error', (e) => {
                clearTimeout(timeout);
                reject(e);
            }, { once: true });
        });
    }

    beforeAll(async () => {
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        const bgInfo = await findExtensionBackground();
        bgWs = await connectToCDP(bgInfo.wsUrl);

        configContext = await loadConfigAndOpenPage({
            bgWs,
            configPath: CONFIG_PATH,
            fixtureUrl: FIXTURE_URL
        });

        enableInputDomain(configContext.pageWs);

        // Start V8 coverage collection for page
        await startCoverage(configContext.pageWs, 'content-page');
    });

    beforeEach(async () => {
        if (!configContext) throw new Error('Config context not initialized');
        await executeInTarget(configContext.pageWs, 'window.scrollTo(0, 0)');

        // Capture test name
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(configContext.pageWs);
    });

    afterEach(async () => {
        // Capture coverage snapshot after test and calculate delta
        if (configContext) {
            await captureAfterCoverage(configContext.pageWs, currentTestName, beforeCovData);
        }
    });

    afterAll(async () => {
        if (configContext) {
            await configContext.dispose();
        }

        if (frontendWs) {
            await closeCDP(frontendWs);
        }

        if (bgWs) {
            await clearHeadlessConfig(bgWs).catch(() => undefined);
            await closeCDP(bgWs);
        }
    });

    test('pressing 50% shows confirmation dialog', async () => {
        if (!configContext) throw new Error('Config context not initialized');
        const ws = configContext.pageWs;

        // Send '5', '0', then '%' to trigger 50% repeat (above threshold of 9)
        await sendKey(ws, '5', 200);
        await sendKey(ws, '0', 200);
        await sendKey(ws, '%', 200);

        // Wait for frontend to render dialog
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to frontend and query for confirmation dialog
        const frontend = await getFrontendWs();

        const dialogData = await executeInTarget(frontend, `
            (function() {
                const popup = document.getElementById('sk_popup');
                if (!popup) {
                    return { found: false, message: 'No popup element' };
                }

                const text = popup.textContent;
                const display = window.getComputedStyle(popup).display;

                return {
                    found: true,
                    text: text.substring(0, 150),
                    visible: display !== 'none' && popup.offsetHeight > 0,
                    hasConfirmationMessage: text.includes('really want to repeat')
                };
            })()
        `);

        console.log(`Dialog data: ${JSON.stringify(dialogData)}`);

        expect(dialogData.found).toBe(true);
        expect(dialogData.visible).toBe(true);
        expect(dialogData.hasConfirmationMessage).toBe(true);
    });

});

/**
 * CDP Test: cmd_nav_open_detected_link (Simplified)
 *
 * Simplified test for the open detected links command.
 * - Command: cmd_nav_open_detected_link
 * - Key: 'O'
 * - Behavior: detect URLs in plain text and show hints
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-nav-open-detected-link-simple.test.ts
 */

import WebSocket from 'ws';
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
import {
    sendKey,
    enableInputDomain,
    waitForSurfingkeysReady
} from '../utils/browser-actions';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('cmd_nav_open_detected_link (simple)', () => {
    const BASE_URL = 'http://127.0.0.1:9873';
    const FIXTURE_URL = `${BASE_URL}/detected-links-test.html`;

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    beforeAll(async () => {
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        const bgInfo = await findExtensionBackground();
        extensionId = bgInfo.extensionId;
        bgWs = await connectToCDP(bgInfo.wsUrl);

        tabId = await createTab(bgWs, FIXTURE_URL, true);

        const pageWsUrl = await findContentPage('127.0.0.1:9873/detected-links-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({ id: 999, method: 'Page.enable' }));
        pageWs.send(JSON.stringify({ id: 1000, method: 'Runtime.enable' }));

        await waitForSurfingkeysReady(pageWs);
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';
        beforeCovData = await captureBeforeCoverage(pageWs);
    });

    afterEach(async () => {
        try {
            await sendKey(pageWs, 'Escape');
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) {
            // Ignore
        }
        await captureAfterCoverage(pageWs, currentTestName, beforeCovData);
    });

    afterAll(async () => {
        if (tabId && bgWs) await closeTab(bgWs, tabId);
        if (pageWs) await closeCDP(pageWs);
        if (bgWs) await closeCDP(bgWs);
    });

    test('pressing O creates hints for detected URLs', async () => {
        // Press 'O' to trigger detected links mode
        await sendKey(pageWs, 'O');

        // Wait a moment for hints to render
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Check if hints host was created
        const hintsHostExists = await executeInTarget(pageWs, `
            document.querySelector('.surfingkeys_hints_host') !== null
        `);
        expect(hintsHostExists).toBe(true);

        // Check if shadow DOM has hints
        const hintsInfo = await executeInTarget(pageWs, `
            (function() {
                try {
                    const host = document.querySelector('.surfingkeys_hints_host');
                    if (!host || !host.shadowRoot) return {exists: false, count: 0, urls: []};

                    // Look for text mode holder specifically (for regex-based hints)
                    const holders = host.shadowRoot.querySelectorAll('[mode]');
                    const holderModes = Array.from(holders).map(h => h.getAttribute('mode'));

                    const holder = host.shadowRoot.querySelector('[mode="text"]') ||
                                   host.shadowRoot.querySelector('[mode]');
                    if (!holder) return {exists: true, hasHolder: false, count: 0, urls: [], modes: holderModes};

                    const allDivs = Array.from(holder.querySelectorAll('div'));
                    const hints = allDivs.filter(div => div.link);
                    const urls = hints.map(div => div.link && div.link[2] ? div.link[2] : null).filter(Boolean);

                    return {
                        exists: true,
                        hasHolder: true,
                        mode: holder.getAttribute('mode'),
                        totalDivs: allDivs.length,
                        divsWithLink: hints.length,
                        count: hints.length,
                        urls: urls,
                        sampleDiv: allDivs[0] ? {
                            hasLink: !!allDivs[0].link,
                            textContent: allDivs[0].textContent,
                            className: allDivs[0].className
                        } : null
                    };
                } catch (e) {
                    return {error: e.message, exists: false, count: 0, urls: []};
                }
            })()
        `, 10000);

        console.log(`Hints info:`, JSON.stringify(hintsInfo, null, 2));

        // Verify hintsInfo was returned
        expect(hintsInfo).toBeDefined();
        if (!hintsInfo) {
            console.error('Failed to get hints info - executeInTarget returned undefined');
            return;
        }

        // Verify hints were created
        expect(hintsInfo.exists).toBe(true);
        expect(hintsInfo.hasHolder).toBe(true);
        expect(hintsInfo.count).toBeGreaterThan(0);
        expect(hintsInfo.urls.length).toBeGreaterThan(0);

        // Verify we detected some HTTP URLs
        const hasHttp = hintsInfo.urls.some((url: string) => url.includes('http://'));
        expect(hasHttp).toBe(true);

        // Verify we detected some HTTPS URLs
        const hasHttps = hintsInfo.urls.some((url: string) => url.includes('https://'));
        expect(hasHttps).toBe(true);

        console.log(`Successfully detected ${hintsInfo.count} URLs including HTTP and HTTPS`);
    });
});

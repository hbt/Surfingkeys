/**
 * Minimal test to debug 'C' (gf alias) key binding
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
    clickAt,
    enableInputDomain,
    waitForSurfingkeysReady
} from '../utils/browser-actions';
import { CDP_PORT } from '../cdp-config';

describe('Minimal test for C key', () => {
    jest.setTimeout(60000);

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let tabId: number;

    const FIXTURE_URL = 'http://127.0.0.1:9873/hints-test.html';

    beforeAll(async () => {
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        const bgInfo = await findExtensionBackground();
        bgWs = await connectToCDP(bgInfo.wsUrl);

        tabId = await createTab(bgWs, FIXTURE_URL, true);

        const pageWsUrl = await findContentPage('127.0.0.1:9873/hints-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        enableInputDomain(pageWs);
        await waitForSurfingkeysReady(pageWs);
    });

    afterAll(async () => {
        if (tabId && bgWs) {
            await closeTab(bgWs, tabId);
        }
        if (pageWs) {
            await closeCDP(pageWs);
        }
        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('should test C key and check for hints', async () => {
        // Click to focus
        await clickAt(pageWs, 100, 100);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Press 'C' key
        await sendKey(pageWs, 'C');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if hints host exists
        const hintsHost = await executeInTarget(pageWs, `
            document.querySelector('.surfingkeys_hints_host')
        `);

        console.log('Hints host:', hintsHost);

        // Also check all elements with class containing 'hint'
        const hintElements = await executeInTarget(pageWs, `
            Array.from(document.querySelectorAll('[class*="hint"]')).map(el => ({
                class: el.className,
                tag: el.tagName
            }))
        `);

        console.log('Hint elements:', hintElements);

        // Check if we can see any hint-related elements in shadow DOM
        const shadowCheck = await executeInTarget(pageWs, `
            (() => {
                const host = document.querySelector('.surfingkeys_hints_host');
                if (!host) return { found: false, message: 'No hints host' };
                if (!host.shadowRoot) return { found: false, message: 'Host but no shadow root' };
                const divs = host.shadowRoot.querySelectorAll('div');
                return {
                    found: true,
                    divCount: divs.length,
                    sample: Array.from(divs).slice(0, 3).map(d => ({
                        text: d.textContent,
                        class: d.className
                    }))
                };
            })()
        `);

        console.log('Shadow DOM check:', shadowCheck);

        // Check if 'f' key works
        await sendKey(pageWs, 'f');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const fKeyCheck = await executeInTarget(pageWs, `
            (() => {
                const host = document.querySelector('.surfingkeys_hints_host');
                if (!host || !host.shadowRoot) return { found: false };
                const divs = host.shadowRoot.querySelectorAll('div');
                return {
                    found: true,
                    divCount: divs.length
                };
            })()
        `);

        console.log('After f key:', fKeyCheck);
    });
});

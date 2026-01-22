/**
 * Test: Reload tab AFTER setting config in storage
 *
 * Sequence:
 * 1. Set showAdvanced=true in storage
 * 2. Set localPath in storage
 * 3. Create tab
 * 4. RELOAD the tab (so it loads config)
 * 5. Press 'g' to test if config mapping works
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
} from './utils/cdp-client';
import {
    sendKey,
    getScrollPosition,
    enableInputDomain
} from './utils/browser-actions';
import {
    startConfigServer,
    stopConfigServer
} from './utils/config-server';
import { CDP_PORT } from './cdp-config';

describe('Config Test - Reload tab after setting storage', () => {
    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let tabId: number;
    let configServerUrl: string;

    const FIXTURE_URL = 'http://127.0.0.1:9873/hackernews.html';
    const CONFIG_SERVER_PORT = 9874;

    beforeAll(async () => {
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`CDP not available on port ${CDP_PORT}`);
        }

        // Start config server
        configServerUrl = await startConfigServer(CONFIG_SERVER_PORT, 'cdp-scrollstepsize-config.js');
        console.log(`✓ Config server: ${configServerUrl}`);

        // Connect to background
        const bgInfo = await findExtensionBackground();
        bgWs = await connectToCDP(bgInfo.wsUrl);

        // Helper to execute code
        let messageId = 1;
        const sendMsg = (expr: string) => new Promise<any>((resolve) => {
            const id = messageId++;
            const handler = (data: any) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.id === id) {
                        bgWs.removeListener('message', handler);
                        resolve(msg.result);
                    }
                } catch (e) {
                    // ignore
                }
            };
            bgWs.on('message', handler);
            bgWs.send(JSON.stringify({
                id,
                method: 'Runtime.evaluate',
                params: { expression: expr, returnByValue: true }
            }));
        });

        // Step 1: Set showAdvanced=true in storage
        await sendMsg(`chrome.storage.local.set({ showAdvanced: true })`);
        console.log(`✓ showAdvanced set to true`);

        // Step 2: Set localPath in storage
        await sendMsg(`chrome.storage.local.set({ localPath: '${configServerUrl}' })`);
        console.log(`✓ localPath set: ${configServerUrl}`);

        // Step 3: Create tab
        tabId = await createTab(bgWs, FIXTURE_URL, true);
        console.log(`✓ Tab created`);

        // Connect to page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/hackernews.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);

        // Wait for initial page load
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Step 4: RELOAD the tab (so it loads config from storage)
        console.log(`Reloading tab to load config...`);
        await executeInTarget(pageWs, `location.reload()`);

        // Wait for reload to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log(`✓ Tab reloaded`);
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
        await stopConfigServer();
    });

    test('pressing "g" should scroll down (config loaded after reload)', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        console.log(`Initial scroll: ${initialScroll}px`);

        // Step 5: Press 'g' - this is mapped in config
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 500));

        const newScroll = await getScrollPosition(pageWs);
        console.log(`After pressing 'g': ${newScroll}px`);

        const distance = newScroll - initialScroll;
        console.log(`Distance scrolled: ${distance}px`);

        if (distance > 0) {
            console.log(`✅ CONFIG LOADED: 'g' key mapped to scroll`);
        } else {
            console.log(`❌ CONFIG NOT LOADED: 'g' key did not scroll`);
        }

        expect(distance).toBeGreaterThan(0);
    });
});

/**
 * Config Loaded Verification Test
 *
 * Simple proof-of-concept: config file maps 'g' to scroll down
 * If pressing 'g' scrolls, the config was loaded and applied.
 */

import WebSocket from 'ws';
import {
    checkCDPAvailable,
    findExtensionBackground,
    findContentPage,
    connectToCDP,
    createTab,
    closeTab,
    closeCDP
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

describe('Config Loaded - Verify config.js is executed', () => {
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

        // Helper to execute code in background
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

        // Create tab first
        tabId = await createTab(bgWs, FIXTURE_URL, true);
        console.log(`✓ Tab created`);

        // Connect to page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/hackernews.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);

        // Wait for content scripts to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // NOW use updateSettings to apply config settings to the running extension
        // This broadcasts to all content scripts including the one we just created
        await sendMsg(`
            new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'updateSettings',
                    scope: 'test',
                    settings: {
                        scrollStepSize: 25,
                        smoothScroll: false
                    }
                }, () => resolve());
            })
        `);
        console.log(`✓ Settings applied via updateSettings`);

        // Wait for settings to propagate to content script
        await new Promise(resolve => setTimeout(resolve, 1000));
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

    test('pressing "g" should scroll down (proves config was loaded)', async () => {
        // Get initial scroll
        const initialScroll = await getScrollPosition(pageWs);
        console.log(`Initial scroll: ${initialScroll}px`);
        expect(initialScroll).toBe(0);

        // Press 'g' - this key is mapped in config to scroll down
        // By default, 'g' doesn't do this, so if it scrolls, config was loaded!
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get new scroll position
        const newScroll = await getScrollPosition(pageWs);
        console.log(`After pressing 'g': ${newScroll}px`);

        // The key assertion: if 'g' scrolls, config is loaded
        if (newScroll > initialScroll) {
            console.log(`✅ CONFIG LOADED: 'g' key scrolled by ${newScroll - initialScroll}px`);
            console.log(`   This proves cdp-scrollstepsize-config.js was loaded and executed`);
        } else {
            console.log(`❌ CONFIG NOT LOADED: 'g' key did not scroll`);
        }

        expect(newScroll).toBeGreaterThan(initialScroll);
    });
});

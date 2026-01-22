/**
 * Test: Wake Service Worker + Set Storage + Reload Tab
 *
 * Sequence:
 * 1. Set showAdvanced=true in storage
 * 2. Set localPath in storage
 * 3. Wake the service worker via Target.createTarget
 * 4. Create and reload tab
 * 5. Check if service worker is awake, wake again if needed
 * 6. Press 'g' to test if config mapping works
 */

import WebSocket from 'ws';
import http from 'http';
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

const CDP_ENDPOINT = `http://localhost:${CDP_PORT}`;

// Helper to fetch from CDP HTTP endpoint
function fetchJson(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
        http.get(`${CDP_ENDPOINT}${path}`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${error}`));
                }
            });
        }).on('error', reject);
    });
}

// Helper to send CDP command
let cmdId = 1000;
function sendCommand(ws: WebSocket, method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = cmdId++;
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout waiting for response to ${method}`));
        }, 10000);

        const handler = (data: any) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.id === id) {
                    clearTimeout(timeout);
                    ws.removeListener('message', handler);
                    if (msg.error) {
                        reject(new Error(msg.error.message));
                    } else {
                        resolve(msg.result);
                    }
                }
            } catch (e) {
                // parse error, ignore
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

// Wake service worker by creating target with extension page
async function wakeServiceWorker(extensionId: string): Promise<boolean> {
    console.log(`Waking service worker...`);

    try {
        const versionInfo = await fetchJson('/json/version');
        const browserWsUrl = versionInfo.webSocketDebuggerUrl;

        if (!browserWsUrl) {
            console.log(`❌ Could not get browser WebSocket URL`);
            return false;
        }

        const ws = new WebSocket(browserWsUrl);

        return new Promise((resolve) => {
            ws.on('open', async () => {
                try {
                    // Create target with extension options page to wake service worker
                    const optionsUrl = `chrome-extension://${extensionId}/pages/options.html`;
                    console.log(`Creating target: ${optionsUrl}`);

                    const result = await sendCommand(ws, 'Target.createTarget', {
                        url: optionsUrl
                    });

                    ws.close();

                    if (result.targetId) {
                        console.log(`✓ Created target to wake service worker`);
                        resolve(true);
                    } else {
                        console.log(`❌ Failed to create target`);
                        resolve(false);
                    }
                } catch (error: any) {
                    console.log(`❌ Error waking service worker: ${error.message}`);
                    ws.close();
                    resolve(false);
                }
            });

            ws.on('error', (error: any) => {
                console.log(`❌ WebSocket error: ${error.message}`);
                resolve(false);
            });

            setTimeout(() => {
                ws.close();
                resolve(false);
            }, 5000);
        });
    } catch (error: any) {
        console.log(`❌ Error: ${error.message}`);
        return false;
    }
}

describe('Wake Service Worker + Config', () => {
    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let tabId: number;
    let configServerUrl: string;
    let extensionId: string;

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
        extensionId = bgInfo.extensionId;
        bgWs = await connectToCDP(bgInfo.wsUrl);
        console.log(`✓ Connected to background, extension ID: ${extensionId}`);

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

        // Step 1: Set storage
        console.log(`\n=== Step 1: Set storage ===`);
        await sendMsg(`chrome.storage.local.set({ showAdvanced: true })`);
        console.log(`✓ showAdvanced set to true`);

        await sendMsg(`chrome.storage.local.set({ localPath: '${configServerUrl}' })`);
        console.log(`✓ localPath set: ${configServerUrl}`);

        // Step 2: Wake service worker
        console.log(`\n=== Step 2: Wake service worker ===`);
        const woken = await wakeServiceWorker(extensionId);
        if (!woken) {
            console.log(`⚠ Failed to wake, continuing anyway...`);
        }

        // Wait a bit after waking
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Step 3: Create tab
        console.log(`\n=== Step 3: Create tab ===`);
        tabId = await createTab(bgWs, FIXTURE_URL, true);
        console.log(`✓ Tab created`);

        // Connect to page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/hackernews.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);

        // Wait for page load
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Step 4: Call loadSettingsFromUrl to load config
        console.log(`\n=== Step 4: Load settings from URL ===`);

        // Helper for service worker messages
        let msgId = 9000;
        const sendBgMsg = (action: string, data: any = {}) => new Promise<any>((resolve) => {
            const id = msgId++;
            const handler = (msg: any) => {
                if (msg.action === `${action}_response_${id}`) {
                    bgWs.removeListener('message', handler);
                    resolve(msg.result);
                }
            };
            bgWs.on('message', handler);
            bgWs.send(JSON.stringify({
                id,
                method: 'Runtime.evaluate',
                params: {
                    expression: `
                        chrome.runtime.sendMessage({
                            action: '${action}',
                            url: '${configServerUrl}',
                            ...${JSON.stringify(data)}
                        }, (response) => {
                            console.log('Got response');
                        });
                    `,
                    returnByValue: true
                }
            }));
        });

        // Call loadSettingsFromUrl
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'loadSettingsFromUrl',
                    url: '${configServerUrl}'
                }, (response) => {
                    resolve(response);
                });
            })
        `);
        console.log(`✓ loadSettingsFromUrl called`);

        // Wait for settings to be loaded
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Also reload the page to pick up any user scripts
        console.log(`Reloading page to apply user scripts...`);
        await executeInTarget(pageWs, `location.reload()`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log(`✓ Page reloaded`);

        // Step 5: Check/wake service worker again
        console.log(`\n=== Step 5: Check service worker ===`);
        const woken2 = await wakeServiceWorker(extensionId);
        if (!woken2) {
            console.log(`⚠ Failed to wake again, continuing anyway...`);
        }

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

    test('pressing "g" should scroll down (after wake + reload)', async () => {
        console.log(`\n=== Step 6: Test 'g' key ===`);
        const initialScroll = await getScrollPosition(pageWs);
        console.log(`Initial scroll: ${initialScroll}px`);

        // Press 'g'
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 500));

        const newScroll = await getScrollPosition(pageWs);
        console.log(`After pressing 'g': ${newScroll}px`);

        const distance = newScroll - initialScroll;
        console.log(`Distance scrolled: ${distance}px`);

        if (distance > 0) {
            console.log(`✅ SUCCESS: Config loaded and 'g' key mapped to scroll`);
        } else {
            console.log(`❌ FAILED: 'g' key did not scroll`);
        }

        expect(distance).toBeGreaterThan(0);
    });
});

/**
 * CDP Reload Tabs Test - Ensures chrome://extensions tabs exist
 *
 * Tests the core functionality of dbg reload command: ensuring required
 * chrome://extensions tabs exist before attempting reload.
 *
 * This test verifies:
 * 1. We can detect if tabs exist
 * 2. We can create missing tabs via CDP
 * 3. Created tabs are accessible
 *
 * Usage:
 *   Headless mode:   npm run test:cdp:headless tests/cdp/cdp-reload-tabs.test.ts
 */

import WebSocket from 'ws';
import {
    checkCDPAvailable,
    findExtensionBackground,
    connectToCDP,
    closeCDP,
    executeInTarget
} from './utils/cdp-client';
import { CDP_PORT } from './cdp-config';
import http from 'http';

async function fetchJson(port: number, path: string): Promise<any> {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${port}${path}`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

describe('Reload Command - Tab Management', () => {
    let bgWs: WebSocket;
    let extensionId: string;

    beforeAll(async () => {
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        const bgInfo = await findExtensionBackground();
        extensionId = bgInfo.extensionId;
        bgWs = await connectToCDP(bgInfo.wsUrl);

        await new Promise(resolve => setTimeout(resolve, 500));
    });

    afterAll(async () => {
        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    describe('Ensure Tabs Exist', () => {
        test('should create missing chrome://extensions tabs', async () => {
            // This is the core logic from dbg reload - ensure tabs exist
            const result = await executeInTarget(bgWs, `
                (async function() {
                    const extensionsPageUrl = 'chrome://extensions/';
                    const errorsPageUrl = 'chrome://extensions/?errors=${extensionId}';

                    async function findTab(targetUrl) {
                        return new Promise((resolve) => {
                            chrome.tabs.query({}, (tabs) => {
                                const tab = tabs.find(t =>
                                    t.url === targetUrl ||
                                    t.pendingUrl === targetUrl ||
                                    (t.url && t.url.startsWith(targetUrl))
                                );
                                resolve(tab || null);
                            });
                        });
                    }

                    async function createTab(url) {
                        return new Promise((resolve, reject) => {
                            chrome.tabs.create({ url, active: false }, (tab) => {
                                if (chrome.runtime.lastError) {
                                    reject(new Error(chrome.runtime.lastError.message));
                                } else {
                                    resolve(tab);
                                }
                            });
                        });
                    }

                    const created = [];

                    // Ensure main extensions page exists
                    const extTab = await findTab(extensionsPageUrl);
                    if (!extTab) {
                        await createTab(extensionsPageUrl);
                        created.push('extensions');
                    }

                    // Ensure errors page exists
                    const errTab = await findTab(errorsPageUrl);
                    if (!errTab) {
                        await createTab(errorsPageUrl);
                        created.push('errors');
                    }

                    return { success: true, created };
                })()
            `);

            expect(result.success).toBe(true);
            expect(Array.isArray(result.created)).toBe(true);

            console.log(`\n✓ Tab management test passed`);
            console.log(`  Created: ${result.created.length > 0 ? result.created.join(', ') : 'none (already existed)'}\n`);
        });

        test('should verify tabs are accessible via CDP', async () => {
            // Verify the tabs actually exist and are accessible
            const targets = await fetchJson(CDP_PORT, '/json');

            const extensionsTab = targets.find((t: any) =>
                t.type === 'page' && t.url?.startsWith('chrome://extensions/')
            );

            const errorsTab = targets.find((t: any) =>
                t.type === 'page' && t.url?.includes(`chrome://extensions/?errors=${extensionId}`)
            );

            expect(extensionsTab).toBeDefined();
            expect(errorsTab).toBeDefined();

            console.log('\n✓ Both required tabs are accessible via CDP');
            console.log(`  chrome://extensions/`);
            console.log(`  chrome://extensions/?errors=${extensionId}\n`);
        });
    });
});

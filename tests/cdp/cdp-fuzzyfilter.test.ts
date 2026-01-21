/**
 * CDP Fuzzy Filter Test - Help Menu Search Functionality
 *
 * Tests the fuzzyfinder/fuzzy filter in the help menu using Jest framework.
 *
 * Usage:
 *   Headless mode:   npm run test:cdp:headless tests/cdp/cdp-fuzzyfilter.test.ts
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
    enableInputDomain
} from './utils/browser-actions';
import { CDP_PORT } from './cdp-config';

describe('Fuzzy Filter in Help Menu', () => {
    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let frontendWs: WebSocket | null = null;
    let extensionId: string;
    let tabId: number;

    const FIXTURE_URL = 'http://127.0.0.1:9873/hackernews.html';

    beforeAll(async () => {
        // Check CDP is available
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        // Connect to background
        const bgInfo = await findExtensionBackground();
        extensionId = bgInfo.extensionId;
        bgWs = await connectToCDP(bgInfo.wsUrl);

        // Create fixture tab
        tabId = await createTab(bgWs, FIXTURE_URL, true);

        // Find and connect to content page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/hackernews.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Try to find and connect to frontend iframe
        try {
            const frontendWsUrl = await findContentPage('frontend.html');
            frontendWs = await connectToCDP(frontendWsUrl);
        } catch (e) {
            // Frontend might not be discoverable yet, will try in tests
            console.log('Frontend iframe not immediately available, will attempt to find it in tests');
        }
    });

    afterAll(async () => {
        // Cleanup
        if (tabId && bgWs) {
            await closeTab(bgWs, tabId);
        }

        if (frontendWs) {
            await closeCDP(frontendWs);
        }

        if (pageWs) {
            await closeCDP(pageWs);
        }

        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    // Helper function to find frontend target
    async function getFrontendWs(): Promise<WebSocket> {
        // Always try to reconnect for better stability
        if (frontendWs && frontendWs.readyState === WebSocket.OPEN) {
            return frontendWs;
        }

        const getCDPJsonUrl = () => {
            const port = process.env.CDP_PORT || '9222';
            return `http://127.0.0.1:${port}/json/list`;
        };

        const data = await new Promise<string>((resolve, reject) => {
            const req = http.get(getCDPJsonUrl(), (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    resolve(body);
                });
                res.on('error', reject);
            });
            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Timeout fetching CDP targets'));
            });
        });

        const targets = JSON.parse(data);

        // Look for frontend iframe
        const frontendTarget = targets.find((t: any) =>
            t.url && (t.url.includes('frontend.html') || (t.type === 'page' && t.url.includes('chrome-extension://') && !t.url.includes('background')))
        );

        if (!frontendTarget || !frontendTarget.webSocketDebuggerUrl) {
            throw new Error(`Frontend target not found. Available: ${targets.map((t: any) => t.url).join(', ')}`);
        }

        // Close old connection if exists
        if (frontendWs && frontendWs.readyState !== WebSocket.CLOSED) {
            frontendWs.close();
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

    describe('Help Menu Setup', () => {
        test('should open help menu when pressing ?', async () => {
            // Press ? to open help menu
            await sendKey(pageWs, '?');

            // Wait for help menu to render
            await new Promise(resolve => setTimeout(resolve, 1000));
        });

        test('fuzzy search input should exist', async () => {
            const ws = await getFrontendWs();

            const result = await executeInTarget(ws, `
                (function() {
                    const searchInput = document.querySelector('#sk_fuzzy_search');
                    return {
                        found: !!searchInput,
                        id: searchInput?.id,
                        placeholder: searchInput?.placeholder,
                        type: searchInput?.type
                    };
                })()
            `);

            expect(result.found).toBe(true);
            expect(result.id).toBe('sk_fuzzy_search');
            expect(result.placeholder).toBe('Type to filter commands...');
            expect(result.type).toBe('text');
        });

        test('help usage container should exist', async () => {
            const ws = await getFrontendWs();

            const result = await executeInTarget(ws, `
                (function() {
                    const usageDiv = document.querySelector('#sk_usage');
                    return {
                        found: !!usageDiv,
                        id: usageDiv?.id,
                        display: window.getComputedStyle(usageDiv).display
                    };
                })()
            `);

            expect(result.found).toBe(true);
            expect(result.id).toBe('sk_usage');
            expect(result.display).not.toBe('none');
        });
    });

    describe('Fuzzy Filter Functionality', () => {
        // Note: Detailed filter tests are covered in tests/unit/fuzzyFilter.test.js
        // These CDP tests verify the integration and UI elements work in a real browser
        test('should have fuzzy filter script loaded and working', async () => {
            const ws = await getFrontendWs();

            // Verify the fuzzy filter module is loaded and accessible
            const result = await executeInTarget(ws, `
                (function() {
                    // Check if the global filter function exists (set up by setupHelpFilter)
                    return typeof window._skFuzzyFilter === 'function';
                })()
            `);

            expect(result).toBe(true);
        });
    });
});

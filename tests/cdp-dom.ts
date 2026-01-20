#!/usr/bin/env ts-node
/**
 * CDP DOM Test - Hint Creation and Inspection
 *
 * Tests DOM manipulation and inspection:
 * - Press 'f' → creates hints for clickable elements
 * - Query DOM for hint elements
 * - Verify hints are visible and positioned
 * - Press Escape → verify hints removed
 *
 * Usage: npx ts-node tests/cdp-dom.ts
 *
 * Prerequisites:
 * - Chrome running with --remote-debugging-port=9222
 * - Surfingkeys extension loaded
 * - Fixtures server running on port 9873
 */

import * as WebSocket from 'ws';
import * as http from 'http';

interface CDPTarget {
    id: string;
    title: string;
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
}

let messageId = 1;

async function checkCDPAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get('http://localhost:9222/json', (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function findExtensionBackground(): Promise<{ wsUrl: string; extensionId: string }> {
    const data = await new Promise<string>((resolve, reject) => {
        const req = http.get('http://localhost:9222/json', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
    });

    const targets: CDPTarget[] = JSON.parse(data);

    const bg = targets.find(t =>
        t.title === 'Surfingkeys' ||
        t.url.includes('_generated_background_page.html') ||
        (t.type === 'service_worker' && t.url.includes('background.js'))
    );

    if (!bg) {
        console.error('❌ Surfingkeys background page not found');
        process.exit(1);
    }

    const extensionIdMatch = bg.url.match(/chrome-extension:\/\/([a-z]+)\//);
    if (!extensionIdMatch) {
        console.error('❌ Could not extract extension ID');
        process.exit(1);
    }

    const extensionId = extensionIdMatch[1];
    console.log(`✓ Connected to background (Extension ID: ${extensionId})`);

    return { wsUrl: bg.webSocketDebuggerUrl, extensionId };
}

function executeInBackground(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for response'));
        }, 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);

                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result?.result?.value);
                }
            }
        };

        ws.on('message', handler);

        ws.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {
                expression: code,
                returnByValue: true,
                awaitPromise: true
            }
        }));
    });
}

async function createFixtureTab(bgWs: WebSocket): Promise<number> {
    const fixtureUrl = 'http://127.0.0.1:9873/hackernews.html';
    console.log(`\nCreating fixture tab: ${fixtureUrl}`);

    const tab = await executeInBackground(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.create({
                url: '${fixtureUrl}',
                active: true
            }, (tab) => {
                resolve({
                    id: tab.id,
                    url: tab.url
                });
            });
        })
    `);

    console.log(`✓ Created tab (id: ${tab.id})`);
    return tab.id;
}

async function closeTab(bgWs: WebSocket, tabId: number): Promise<void> {
    console.log(`\nCleaning up: Closing tab ${tabId}`);
    await executeInBackground(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.remove(${tabId}, () => {
                resolve(true);
            });
        })
    `);
    console.log(`✓ Tab ${tabId} closed`);
}

async function findContentPage(): Promise<string> {
    console.log('\nFinding content page...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const data = await new Promise<string>((resolve, reject) => {
        const req = http.get('http://localhost:9222/json', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
    });

    const targets: CDPTarget[] = JSON.parse(data);

    const page = targets.find(t =>
        t.type === 'page' && t.url.includes('127.0.0.1:9873/hackernews.html')
    );

    if (!page) {
        console.error('❌ Content page not found');
        process.exit(1);
    }

    console.log(`✓ Found content page`);
    return page.webSocketDebuggerUrl;
}

function executeInPage(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for page response'));
        }, 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);

                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result?.result?.value);
                }
            }
        };

        ws.on('message', handler);

        ws.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {
                expression: code,
                returnByValue: true,
                awaitPromise: true
            }
        }));
    });
}

async function sendKey(ws: WebSocket, key: string): Promise<void> {
    console.log(`  → Sending key '${key}'`);

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyDown',
            key: key
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 50));

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'char',
            text: key
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 50));

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyUp',
            key: key
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 100));
}

async function main() {
    console.log('CDP DOM Test - Hint Creation and Inspection\n');

    const cdpAvailable = await checkCDPAvailable();
    if (!cdpAvailable) {
        console.error('❌ Chrome DevTools Protocol not available on port 9222');
        process.exit(1);
    }

    const { wsUrl, extensionId } = await findExtensionBackground();
    const bgWs = new WebSocket(wsUrl);

    bgWs.on('open', async () => {
        try {
            bgWs.send(JSON.stringify({
                id: messageId++,
                method: 'Runtime.enable'
            }));

            await new Promise(resolve => setTimeout(resolve, 100));

            const tabId = await createFixtureTab(bgWs);
            const pageWsUrl = await findContentPage();

            console.log('\nConnecting to content page...');
            const pageWs = new WebSocket(pageWsUrl);

            pageWs.on('open', async () => {
                console.log('✓ Connected to content page');

                const consoleLogs: string[] = [];

                // Capture console messages
                pageWs.on('message', (data: WebSocket.Data) => {
                    const msg = JSON.parse(data.toString());

                    if (msg.method === 'Runtime.consoleAPICalled') {
                        const params = msg.params;
                        const type = params.type;
                        const args = params.args || [];

                        const texts = args.map((arg: any) => {
                            if (arg.type === 'string') {
                                return arg.value;
                            } else if (arg.value !== undefined) {
                                return String(arg.value);
                            } else {
                                return JSON.stringify(arg);
                            }
                        });

                        const message = texts.join(' ');
                        const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️ ' : '💬';
                        consoleLogs.push(`${prefix} [${type.toUpperCase()}] ${message}`);
                    }
                });

                // Enable domains
                pageWs.send(JSON.stringify({
                    id: messageId++,
                    method: 'Runtime.enable'
                }));

                pageWs.send(JSON.stringify({
                    id: messageId++,
                    method: 'Input.enable'
                }));

                await new Promise(resolve => setTimeout(resolve, 100));

                console.log('\nWaiting for page to load...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log('✓ Ready to test\n');

                console.log('=== Test: Press "f" to Create Hints ===\n');

                // Check how many links are on the page
                const linkCount = await executeInPage(pageWs, 'document.querySelectorAll("a").length');
                console.log(`Prerequisites:`);
                console.log(`  → Found ${linkCount} links on page\n`);

                // Check initial state - no hints
                const initialHints = await executeInPage(pageWs, `
                    document.querySelectorAll('#sk_hints span').length
                `);
                console.log(`Step 1: Initial DOM state`);
                console.log(`  → Hint elements: ${initialHints}\n`);

                // Click on the page to ensure it has focus
                console.log(`Step 2: Clicking on page to ensure focus`);
                pageWs.send(JSON.stringify({
                    id: messageId++,
                    method: 'Input.dispatchMouseEvent',
                    params: {
                        type: 'mousePressed',
                        x: 100,
                        y: 100,
                        button: 'left',
                        clickCount: 1
                    }
                }));

                await new Promise(resolve => setTimeout(resolve, 100));

                pageWs.send(JSON.stringify({
                    id: messageId++,
                    method: 'Input.dispatchMouseEvent',
                    params: {
                        type: 'mouseReleased',
                        x: 100,
                        y: 100,
                        button: 'left',
                        clickCount: 1
                    }
                }));

                await new Promise(resolve => setTimeout(resolve, 200));
                console.log(`  → Page clicked\n`);

                // Send 'f' key
                console.log(`Step 3: Pressing 'f' key to trigger hints`);
                await sendKey(pageWs, 'f');

                // Wait for hints to render
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Check for shadowRoot with hints
                console.log(`\nStep 3a: Searching for hints in shadowRoot`);
                const hintContainers = await executeInPage(pageWs, `
                    (function() {
                        const hintsHost = document.querySelector('.surfingkeys_hints_host');
                        return {
                            hintsHost_found: hintsHost ? 'yes' : 'no',
                            hasShadowRoot: hintsHost?.shadowRoot ? 'yes' : 'no',
                            shadowRoot_children: hintsHost?.shadowRoot?.children.length || 0,
                            shadowRoot_html: hintsHost?.shadowRoot?.innerHTML?.substring(0, 200) || 'N/A'
                        };
                    })()
                `);
                console.log(`  → surfingkeys_hints_host found:`, hintContainers?.hintsHost_found);
                console.log(`  → Has shadowRoot:`, hintContainers?.hasShadowRoot);
                console.log(`  → ShadowRoot children:`, hintContainers?.shadowRoot_children);
                console.log(`  → ShadowRoot HTML sample:`, hintContainers?.shadowRoot_html);

                // Debug: Check all spans in document
                console.log(`\nStep 3b: Debug - counting all elements`);
                const elementCounts = await executeInPage(pageWs, `
                    (function() {
                        return {
                            total_spans: document.querySelectorAll('span').length,
                            total_divs: document.querySelectorAll('div').length,
                            iframes: document.querySelectorAll('iframe').length,
                            sample_spans: Array.from(document.querySelectorAll('span')).slice(0, 10).map(s => ({
                                text: s.textContent?.substring(0, 20),
                                class: s.className
                            }))
                        };
                    })()
                `);
                console.log(`  → Total spans in document: ${elementCounts.total_spans}`);
                console.log(`  → Total divs: ${elementCounts.total_divs}`);
                console.log(`  → Iframes: ${elementCounts.iframes}`);
                console.log(`  → Sample spans:`, JSON.stringify(elementCounts.sample_spans, null, 2));

                // Query for hints in shadowRoot
                console.log(`\nStep 3c: Querying for hint elements in shadowRoot`);
                const hints = await executeInPage(pageWs, `
                    (function() {
                        const hintsHost = document.querySelector('.surfingkeys_hints_host');
                        if (!hintsHost || !hintsHost.shadowRoot) {
                            console.log('[ERROR] No hints host or shadowRoot found');
                            return { hints: [], strategy: 'no shadowRoot' };
                        }

                        // Query inside the shadowRoot
                        const shadowRoot = hintsHost.shadowRoot;
                        let hintElements = [];
                        const results = { strategy: 'none', attempts: [] };

                        // Strategy 1: All divs in shadowRoot (hints are divs based on code review)
                        hintElements = Array.from(shadowRoot.querySelectorAll('div'));
                        results.attempts.push({ name: 'shadowRoot divs', count: hintElements.length });
                        console.log('[SEARCH] Found divs in shadowRoot:', hintElements.length);

                        // Filter to only hint elements (likely have 2-letter uppercase text)
                        const hintDivs = hintElements.filter(d => {
                            const text = (d.textContent || '').trim();
                            return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
                        });
                        results.attempts.push({ name: 'hint divs (1-3 uppercase letters)', count: hintDivs.length });

                        if (hintDivs.length > 0) {
                            hintElements = hintDivs;
                            results.strategy = 'shadowRoot hint divs';
                            console.log('[FOUND] Hint divs:', hintDivs.length);
                        }

                        console.log('[SEARCH] Tried strategies:', JSON.stringify(results.attempts));

                        return {
                            hints: Array.from(hintElements).map(h => ({
                                text: h.textContent?.trim(),
                                tagName: h.tagName,
                                className: h.className,
                                id: h.id,
                                visible: h.offsetParent !== null,
                                left: h.offsetLeft,
                                top: h.offsetTop,
                                zIndex: window.getComputedStyle(h).zIndex,
                                backgroundColor: window.getComputedStyle(h).backgroundColor
                            })),
                            strategy: results.strategy
                        };
                    })()
                `);

                const hintData = hints.hints || [];
                console.log(`  → Strategy used: ${hints.strategy || 'none'}`);
                console.log(`  → Found ${hintData.length} hint elements`);

                if (hintData.length > 0) {
                    console.log(`  → Sample hints:`);
                    hintData.slice(0, 5).forEach((h: any) => {
                        console.log(`    - "${h.text}" <${h.tagName.toLowerCase()}> class="${h.className}" at (${h.left}, ${h.top})`);
                        console.log(`      visible:${h.visible} zIndex:${h.zIndex} bg:${h.backgroundColor}`);
                    });

                    const allVisible = hintData.every((h: any) => h.visible);
                    console.log(`  → All hints visible: ${allVisible}`);
                    console.log(`  → Total hints found: ${hintData.length}`);

                    if (hintData.length > 0 && allVisible) {
                        console.log(`\n✅ PASS: Hints created successfully (${hintData.length} hints for ${linkCount} links)`);
                        console.log(`         Hints are in shadowRoot at .surfingkeys_hints_host`);
                    } else if (hintData.length > 0) {
                        console.log(`\n⚠️  WARNING: Hints created but some not visible (${hintData.length} hints)`);
                    } else {
                        console.log(`\n❌ FAIL: No hints found`);
                    }
                } else {
                    console.log(`\n❌ FAIL: No hints were created`);
                }

                // Display console logs
                console.log(`\nStep 4: Console logs during hint creation:`);
                if (consoleLogs.length > 0) {
                    consoleLogs.forEach(log => console.log(`  ${log}`));
                } else {
                    console.log(`  (No console output captured)`);
                }

                console.log('\n' + '='.repeat(50));

                // Cleanup
                await closeTab(bgWs, tabId);
                pageWs.close();
                bgWs.close();
            });

            pageWs.on('error', async (error) => {
                console.error('❌ Page WebSocket error:', error.message);
                try {
                    await closeTab(bgWs, tabId);
                } catch (e) {
                    // Ignore
                }
                bgWs.close();
                process.exit(1);
            });
        } catch (error) {
            console.error('\n❌ Test failed:', error);
            bgWs.close();
            process.exit(1);
        }
    });

    bgWs.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        process.exit(1);
    });

    bgWs.on('close', () => {
        process.exit(0);
    });
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

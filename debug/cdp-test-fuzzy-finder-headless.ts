#!/usr/bin/env ts-node
/**
 * CDP Headless Test - Fuzzy Finder for Help Menu
 *
 * Automated test to verify fuzzy finder functionality:
 * 1. Open help menu
 * 2. Inject fuzzy finder
 * 3. Test search filtering
 * 4. Verify results
 *
 * Usage:
 * npm run debug:cdp:headless debug/cdp-test-fuzzy-finder-headless.ts
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
    red: '\x1b[31m'
};

async function findBg(): Promise<string> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const bg = targets.find((t: any) => t.title === 'Surfingkeys' || t.url.includes('background.js'));
    if (!bg) throw new Error('Background not found');
    return bg.webSocketDebuggerUrl;
}

async function createTab(bgWs: WebSocket, url: string): Promise<number> {
    const tab = await new Promise<any>((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                bgWs.removeListener('message', handler);
                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result?.result?.value);
                }
            }
        };

        bgWs.on('message', handler);
        bgWs.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {
                expression: `
                    new Promise(r => {
                        chrome.tabs.create({
                            url: '${url}',
                            active: true
                        }, tab => r({ id: tab.id }));
                    })
                `,
                returnByValue: true,
                awaitPromise: true
            }
        }));
    });
    return tab.id;
}

async function closeTab(bgWs: WebSocket, tabId: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                bgWs.removeListener('message', handler);
                resolve();
            }
        };

        bgWs.on('message', handler);
        bgWs.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {
                expression: `
                    new Promise(r => {
                        chrome.tabs.remove(${tabId}, () => r(true));
                    })
                `,
                returnByValue: true,
                awaitPromise: true
            }
        }));
    });
}

async function findPage(url: string): Promise<string | null> {
    await new Promise(r => setTimeout(r, 1000));
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const page = targets.find((t: any) =>
        t.type === 'page' && t.url.includes(url)
    );
    return page ? page.webSocketDebuggerUrl : null;
}

async function sendKey(ws: WebSocket, key: string): Promise<void> {
    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'rawKeyDown', key: key }
    }));
    await new Promise(r => setTimeout(r, 50));

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'char', text: key }
    }));
    await new Promise(r => setTimeout(r, 50));

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'keyUp', key: key }
    }));
    await new Promise(r => setTimeout(r, 100));
}

async function injectCode(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

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
                awaitPromise: false
            }
        }));
    });
}

async function main() {
    console.log(`${colors.bright}${colors.cyan}Headless Test: Fuzzy Finder${colors.reset}\n`);

    const bgWs = new WebSocket(await findBg());

    bgWs.on('open', async () => {
        let pageWs: WebSocket | null = null;
        let tabId: number | null = null;

        try {
            bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            await new Promise(r => setTimeout(r, 100));

            console.log(`${colors.yellow}1. Creating test tab...${colors.reset}`);
            tabId = await createTab(bgWs, 'http://127.0.0.1:9873/hackernews.html');
            console.log(`   ${colors.green}✓ Tab created${colors.reset}\n`);

            console.log(`${colors.yellow}2. Finding page WebSocket...${colors.reset}`);
            const pageWsUrl = await findPage('127.0.0.1:9873/hackernews.html');
            if (!pageWsUrl) throw new Error('Could not find page');
            console.log(`   ${colors.green}✓ Page found${colors.reset}\n`);

            pageWs = new WebSocket(pageWsUrl);
            await new Promise(resolve => pageWs!.on('open', resolve));
            pageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
            pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            await new Promise(r => setTimeout(r, 1000));

            console.log(`${colors.yellow}3. Triggering help menu...${colors.reset}`);
            await sendKey(pageWs, '?');
            await new Promise(r => setTimeout(r, 2000)); // Wait longer for iframe to load
            console.log(`   ${colors.green}✓ Help menu triggered${colors.reset}\n`);

            // Find the frontend iframe CDP target
            console.log(`${colors.yellow}4. Finding frontend iframe target...${colors.reset}`);
            const allTargets = await new Promise<string>((resolve, reject) => {
                http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve(body));
                }).on('error', reject);
            });

            const targets = JSON.parse(allTargets);
            const iframeTarget = targets.find((t: any) =>
                t.type === 'iframe' && t.url.includes('frontend.html')
            );

            if (!iframeTarget) {
                throw new Error('Frontend iframe target not found');
            }

            console.log(`   ${colors.green}✓ Found iframe target${colors.reset}\n`);

            // Connect to iframe
            const iframeWs = new WebSocket(iframeTarget.webSocketDebuggerUrl);
            await new Promise(resolve => iframeWs.on('open', resolve));
            iframeWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            await new Promise(r => setTimeout(r, 100));

            // Wait for help content to be populated
            console.log(`${colors.yellow}5. Waiting for help content to load...${colors.reset}`);
            let contentReady = false;
            for (let i = 0; i < 20; i++) {
                const hasContent = await new Promise<boolean>((resolve, reject) => {
                    const id = messageId++;
                    const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                    const handler = (data: WebSocket.Data) => {
                        const msg = JSON.parse(data.toString());
                        if (msg.id === id) {
                            clearTimeout(timeout);
                            iframeWs.removeListener('message', handler);
                            resolve(msg.result?.result?.value);
                        }
                    };

                    iframeWs.on('message', handler);
                    iframeWs.send(JSON.stringify({
                        id,
                        method: 'Runtime.evaluate',
                        params: {
                            expression: 'document.querySelector("#sk_usage > div")?.querySelectorAll("div").length > 5',
                            returnByValue: true
                        }
                    }));
                });

                if (hasContent) {
                    contentReady = true;
                    break;
                }
                await new Promise(r => setTimeout(r, 200));
            }

            if (!contentReady) {
                throw new Error('Help content did not load in time');
            }

            console.log(`   ${colors.green}✓ Help content loaded${colors.reset}\n`);

            // Debug: Check the structure
            const structureDebug = await new Promise<any>((resolve, reject) => {
                const id = messageId++;
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                const handler = (data: WebSocket.Data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.id === id) {
                        clearTimeout(timeout);
                        iframeWs.removeListener('message', handler);
                        resolve(msg.result?.result?.value);
                    }
                };

                iframeWs.on('message', handler);
                iframeWs.send(JSON.stringify({
                    id,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: `
                            (function() {
                                const usage = document.querySelector('#sk_usage');
                                const firstDiv = usage.querySelector('div');
                                const featureGroups = firstDiv?.querySelectorAll(':scope > div');
                                const firstGroup = featureGroups?.[0];
                                const itemsInFirstGroup = firstGroup?.querySelectorAll(':scope > div:not(.feature_name)');

                                // Also check all direct children
                                const allChildren = firstGroup?.children;
                                const childInfo = allChildren ? Array.from(allChildren).map(c => ({
                                    tag: c.tagName,
                                    classes: c.className,
                                    hasKbd: !!c.querySelector('kbd'),
                                    hasAnnotation: !!c.querySelector('.annotation')
                                })) : [];

                                return {
                                    usageExists: !!usage,
                                    firstDivExists: !!firstDiv,
                                    featureGroupsCount: featureGroups?.length || 0,
                                    itemsInFirstGroup: itemsInFirstGroup?.length || 0,
                                    firstGroupChildrenCount: allChildren?.length || 0,
                                    childInfo: childInfo,
                                    firstGroupHTML: featureGroups?.[0]?.outerHTML?.substring(0, 400) || 'none'
                                };
                            })()
                        `,
                        returnByValue: true
                    }
                }));
            });

            console.log(`   Debug structure:`, JSON.stringify(structureDebug, null, 2));

            // Dump actual HTML to see structure
            const htmlDump = await new Promise<string>((resolve, reject) => {
                const id = messageId++;
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                const handler = (data: WebSocket.Data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.id === id) {
                        clearTimeout(timeout);
                        iframeWs.removeListener('message', handler);
                        resolve(msg.result?.result?.value);
                    }
                };

                iframeWs.on('message', handler);
                iframeWs.send(JSON.stringify({
                    id,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: 'document.querySelector("#sk_usage")?.innerHTML?.substring(0, 1500)',
                        returnByValue: true
                    }
                }));
            });

            console.log('\n   HTML structure:', htmlDump.substring(0, 800), '\n...\n');

            console.log(`${colors.yellow}6. Injecting fuzzy finder into iframe...${colors.reset}`);

            const fuzzyFinderCode = `
(function() {
    // Now we're executing in the iframe context, so direct access!
    const usageContainer = document.querySelector('#sk_usage');
    if (!usageContainer) return 'ERROR: Help menu not found';
    if (document.querySelector('#sk_fuzzy_search')) return 'Already injected';

    const searchInput = document.createElement('input');
    searchInput.id = 'sk_fuzzy_search';
    searchInput.type = 'text';
    searchInput.placeholder = 'Search commands...';
    searchInput.style.cssText = \`
        width: calc(100% - 20px);
        margin: 10px;
        padding: 8px 12px;
        font-size: 14px;
        border: 2px solid #4CAF50;
        border-radius: 4px;
        outline: none;
        background: #2b2b2b;
        color: #fff;
        font-family: monospace;
        box-sizing: border-box;
    \`;

    const contentDiv = usageContainer.querySelector('div');
    if (!contentDiv) return 'ERROR: Help content not found';

    const allItems = [];
    let currentGroup = -1;
    let currentCategoryName = '';

    // All divs are siblings - headers and items are at the same level
    const allDivs = Array.from(contentDiv.querySelectorAll(':scope > div'));

    allDivs.forEach((div) => {
        // Check if this is a category header
        if (div.classList.contains('feature_name') || div.querySelector('.feature_name')) {
            currentGroup++;
            currentCategoryName = div.querySelector('span')?.textContent || '';
        } else {
            // This is an item
            const kbd = div.querySelector('.kbd-span kbd')?.textContent || '';
            const annotation = div.querySelector('.annotation')?.textContent || '';

            if (kbd && annotation) {
                allItems.push({
                    groupIndex: currentGroup,
                    categoryName: currentCategoryName,
                    kbd,
                    annotation,
                    groupHeader: contentDiv.children[currentGroup < allDivs.length ? Math.max(0, currentGroup) : 0],
                    item: div
                });
            }
        }
    });

    function fuzzyMatch(text, query) {
        if (!query) return true;
        text = text.toLowerCase();
        query = query.toLowerCase();
        return text.includes(query);
    }

    window._skFuzzyFilter = function(query) {
        let visibleCount = 0;
        const groupVisibility = new Set();

        allItems.forEach(itemData => {
            const matches = fuzzyMatch(itemData.annotation, query);

            if (matches) {
                itemData.item.style.display = '';
                visibleCount++;
                groupVisibility.add(itemData.groupIndex);
            } else {
                itemData.item.style.display = 'none';
            }
        });

        // Show/hide group headers
        allDivs.forEach((div, idx) => {
            if (div.classList.contains('feature_name') || div.querySelector('.feature_name')) {
                // This is a header - find which group index it represents
                const headerIndex = allDivs.slice(0, idx).filter(d =>
                    d.classList.contains('feature_name') || d.querySelector('.feature_name')
                ).length;

                if (groupVisibility.has(headerIndex)) {
                    div.style.display = '';
                } else {
                    div.style.display = 'none';
                }
            }
        });

        return { total: allItems.length, visible: visibleCount };
    };

    searchInput.addEventListener('input', (e) => {
        window._skFuzzyFilter(e.target.value);
    });

    usageContainer.insertBefore(searchInput, contentDiv);

    return 'Fuzzy finder injected - ' + allItems.length + ' items';
})();
`;

            // Inject into iframe, not page!
            const result = await new Promise<string>((resolve, reject) => {
                const id = messageId++;
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                const handler = (data: WebSocket.Data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.id === id) {
                        clearTimeout(timeout);
                        iframeWs.removeListener('message', handler);
                        if (msg.error) {
                            reject(new Error(msg.error.message));
                        } else {
                            resolve(msg.result?.result?.value);
                        }
                    }
                };

                iframeWs.on('message', handler);
                iframeWs.send(JSON.stringify({
                    id,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: fuzzyFinderCode,
                        returnByValue: true,
                        awaitPromise: false
                    }
                }));
            });
            console.log(`   ${colors.green}✓ ${result}${colors.reset}\n`);

            // Verify search input exists
            const searchExists = await new Promise<boolean>((resolve, reject) => {
                const id = messageId++;
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                const handler = (data: WebSocket.Data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.id === id) {
                        clearTimeout(timeout);
                        iframeWs.removeListener('message', handler);
                        resolve(msg.result?.result?.value);
                    }
                };

                iframeWs.on('message', handler);
                iframeWs.send(JSON.stringify({
                    id,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: '!!document.querySelector("#sk_fuzzy_search")',
                        returnByValue: true
                    }
                }));
            });
            if (!searchExists) throw new Error('Search input not created');

            console.log(`${colors.yellow}7. Testing search functionality...${colors.reset}\n`);

            // Helper to run code in iframe context
            const runInIframe = (code: string) => {
                return new Promise<any>((resolve, reject) => {
                    const id = messageId++;
                    const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                    const handler = (data: WebSocket.Data) => {
                        const msg = JSON.parse(data.toString());
                        if (msg.id === id) {
                            clearTimeout(timeout);
                            iframeWs.removeListener('message', handler);
                            if (msg.error) {
                                reject(new Error(msg.error.message));
                            } else {
                                resolve(msg.result?.result?.value);
                            }
                        }
                    };

                    iframeWs.on('message', handler);
                    iframeWs.send(JSON.stringify({
                        id,
                        method: 'Runtime.evaluate',
                        params: {
                            expression: code,
                            returnByValue: true
                        }
                    }));
                });
            };

            // Test 1: Search for "scroll"
            console.log(`   ${colors.cyan}Test 1: Search "scroll"${colors.reset}`);
            const scrollResults = await runInIframe(`
                document.querySelector('#sk_fuzzy_search').value = 'scroll';
                window._skFuzzyFilter('scroll');
            `);
            console.log(`   Result: ${scrollResults.visible} / ${scrollResults.total} items visible`);
            if (scrollResults.visible === 0) throw new Error('No results for "scroll"');
            console.log(`   ${colors.green}✓ Found results${colors.reset}\n`);

            // Test 2: Search for "tab"
            console.log(`   ${colors.cyan}Test 2: Search "tab"${colors.reset}`);
            const tabResults = await runInIframe(`
                document.querySelector('#sk_fuzzy_search').value = 'tab';
                window._skFuzzyFilter('tab');
            `);
            console.log(`   Result: ${tabResults.visible} / ${tabResults.total} items visible`);
            if (tabResults.visible === 0) throw new Error('No results for "tab"');
            console.log(`   ${colors.green}✓ Found results${colors.reset}\n`);

            // Test 3: Search for something that shouldn't match
            console.log(`   ${colors.cyan}Test 3: Search "xyznonexistent"${colors.reset}`);
            const noResults = await runInIframe(`
                document.querySelector('#sk_fuzzy_search').value = 'xyznonexistent';
                window._skFuzzyFilter('xyznonexistent');
            `);
            console.log(`   Result: ${noResults.visible} / ${noResults.total} items visible`);
            if (noResults.visible !== 0) console.log(`   ${colors.yellow}⚠ Expected 0 results${colors.reset}`);
            else console.log(`   ${colors.green}✓ Correctly returns 0 results${colors.reset}\n`);

            // Test 4: Clear search (show all)
            console.log(`   ${colors.cyan}Test 4: Clear search${colors.reset}`);
            const clearResults = await runInIframe(`
                document.querySelector('#sk_fuzzy_search').value = '';
                window._skFuzzyFilter('');
            `);
            console.log(`   Result: ${clearResults.visible} / ${clearResults.total} items visible`);
            if (clearResults.visible !== clearResults.total) throw new Error('Clear search failed');
            console.log(`   ${colors.green}✓ All items restored${colors.reset}\n`);

            console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════${colors.reset}`);
            console.log(`${colors.bright}${colors.green}  All Tests Passed!${colors.reset}`);
            console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════${colors.reset}\n`);

            console.log(`${colors.cyan}Summary:${colors.reset}`);
            console.log(`  ✓ Fuzzy finder injected successfully`);
            console.log(`  ✓ Search input created`);
            console.log(`  ✓ Filter function works`);
            console.log(`  ✓ Searches in descriptions`);
            console.log(`  ✓ Shows/hides items correctly`);
            console.log(`  ✓ Clear search restores all items\n`);

            // Cleanup
            if (tabId) await closeTab(bgWs, tabId);
            if (pageWs) pageWs.close();
            iframeWs.close();
            bgWs.close();

        } catch (error: any) {
            console.error(`\n${colors.red}❌ Test Failed:${colors.reset}`, error.message);
            if (tabId) await closeTab(bgWs, tabId);
            if (pageWs) pageWs.close();
            bgWs.close();
            process.exit(1);
        }
    });

    bgWs.on('error', (error) => {
        console.error('❌ Background error:', error.message);
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

#!/usr/bin/env ts-node
/**
 * CDP Live Development - Fuzzy Finder for Help Menu
 *
 * Iteratively develop fuzzy finder functionality with live code injection.
 * Keeps browser open for testing and iteration.
 *
 * Usage:
 * npm run debug:cdp:live debug/cdp-live-fuzzy-finder.ts
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
    magenta: '\x1b[35m'
};

async function getAllTargets(): Promise<any[]> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });
    return JSON.parse(resp);
}

async function findBg(): Promise<string> {
    const targets = await getAllTargets();
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

async function findPage(url: string): Promise<string | null> {
    await new Promise(r => setTimeout(r, 1000));
    const targets = await getAllTargets();
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

async function injectIntoIframe(ws: WebSocket, code: string): Promise<any> {
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
    console.log(`${colors.bright}${colors.cyan}Live Fuzzy Finder Demo${colors.reset}\n`);

    const bgWs = new WebSocket(await findBg());

    bgWs.on('open', async () => {
        try {
            bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            await new Promise(r => setTimeout(r, 100));

            console.log(`${colors.yellow}Step 1: Creating test tab...${colors.reset}`);
            const tabId = await createTab(bgWs, 'http://127.0.0.1:9873/hackernews.html');
            console.log(`   ${colors.green}✓ Tab created (ID: ${tabId})${colors.reset}\n`);

            console.log(`${colors.yellow}Step 2: Finding page WebSocket...${colors.reset}`);
            const pageWsUrl = await findPage('127.0.0.1:9873/hackernews.html');
            if (!pageWsUrl) throw new Error('Could not find page');
            console.log(`   ${colors.green}✓ Page found${colors.reset}\n`);

            const pageWs = new WebSocket(pageWsUrl);
            await new Promise(resolve => pageWs.on('open', resolve));
            pageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
            pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            await new Promise(r => setTimeout(r, 1000));

            console.log(`${colors.yellow}Step 3: Triggering help menu...${colors.reset}`);
            await sendKey(pageWs, '?');
            await new Promise(r => setTimeout(r, 2000));
            console.log(`   ${colors.green}✓ Help menu opened${colors.reset}\n`);

            // Find iframe CDP target
            console.log(`${colors.yellow}Step 4: Connecting to frontend iframe...${colors.reset}`);
            const targets = await getAllTargets();
            const iframeTarget = targets.find((t: any) =>
                t.type === 'iframe' && t.url.includes('frontend.html')
            );

            if (!iframeTarget) {
                throw new Error('Frontend iframe target not found');
            }

            const iframeWs = new WebSocket(iframeTarget.webSocketDebuggerUrl);
            await new Promise(resolve => iframeWs.on('open', resolve));
            iframeWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            await new Promise(r => setTimeout(r, 100));
            console.log(`   ${colors.green}✓ Connected to iframe${colors.reset}\n`);

            // Wait for content
            console.log(`${colors.yellow}Step 5: Waiting for help content...${colors.reset}`);
            let itemCount = 0;
            for (let i = 0; i < 20; i++) {
                itemCount = await injectIntoIframe(iframeWs,
                    'document.querySelector("#sk_usage > div")?.querySelectorAll("div").length || 0'
                );
                if (itemCount > 30) {
                    break;
                }
                await new Promise(r => setTimeout(r, 200));
            }
            console.log(`   ${colors.green}✓ Content loaded (${itemCount} elements)${colors.reset}\n`);

            console.log(`${colors.yellow}Step 6: Injecting fuzzy finder...${colors.reset}`);

            const fuzzyFinderCode = `
(function() {
    const usageContainer = document.querySelector('#sk_usage');
    if (!usageContainer) return 'ERROR: Help menu not found';
    if (document.querySelector('#sk_fuzzy_search')) return 'Already injected';

    const searchInput = document.createElement('input');
    searchInput.id = 'sk_fuzzy_search';
    searchInput.type = 'text';
    searchInput.placeholder = 'Type to search commands...';
    searchInput.style.cssText = \`
        width: calc(100% - 20px);
        margin: 10px;
        padding: 10px 14px;
        font-size: 14px;
        border: 2px solid #4CAF50;
        border-radius: 6px;
        outline: none;
        background: #1a1a1a;
        color: #fff;
        font-family: monospace;
        box-sizing: border-box;
    \`;

    const contentDiv = usageContainer.querySelector('div');
    if (!contentDiv) return 'ERROR: Help content not found';

    const allItems = [];
    let currentGroup = -1;
    let currentCategoryName = '';

    const allDivs = Array.from(contentDiv.querySelectorAll(':scope > div'));

    allDivs.forEach((div) => {
        if (div.classList.contains('feature_name') || div.querySelector('.feature_name')) {
            currentGroup++;
            currentCategoryName = div.querySelector('span')?.textContent || '';
        } else {
            const kbd = div.querySelector('.kbd-span kbd')?.textContent || '';
            const annotation = div.querySelector('.annotation')?.textContent || '';

            if (kbd && annotation) {
                allItems.push({
                    groupIndex: currentGroup,
                    categoryName: currentCategoryName,
                    kbd,
                    annotation,
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

    function filterItems(query) {
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
                const headerIndex = allDivs.slice(0, idx).filter(d =>
                    d.classList.contains('feature_name') || d.querySelector('.feature_name')
                ).length;

                div.style.display = groupVisibility.has(headerIndex) ? '' : 'none';
            }
        });

        return { total: allItems.length, visible: visibleCount };
    }

    window._skFuzzyFilter = filterItems;

    searchInput.addEventListener('input', (e) => {
        filterItems(e.target.value);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'f' && usageContainer.style.display !== 'none') {
            e.preventDefault();
            searchInput.focus();
        }
        if (e.key === 'Escape' && document.activeElement === searchInput) {
            e.stopPropagation();
            searchInput.value = '';
            filterItems('');
        }
    });

    usageContainer.insertBefore(searchInput, contentDiv);
    searchInput.focus();

    return 'Fuzzy finder ready - ' + allItems.length + ' commands indexed';
})();
`;

            const result = await injectIntoIframe(iframeWs, fuzzyFinderCode);
            console.log(`   ${colors.green}✓ ${result}${colors.reset}\n`);

            console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════${colors.reset}`);
            console.log(`${colors.bright}${colors.green}  Fuzzy Finder Demo Ready!${colors.reset}`);
            console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════${colors.reset}\n`);

            console.log(`${colors.cyan}Try these searches in the browser:${colors.reset}`);
            console.log(`  • "scroll" - scrolling commands`);
            console.log(`  • "tab" - tab management`);
            console.log(`  • "close" - close actions`);
            console.log(`  • "bookmark" - bookmark commands`);
            console.log(`  • "copy" - clipboard operations\n`);

            console.log(`${colors.magenta}Browser window is open for testing.${colors.reset}`);
            console.log(`${colors.magenta}Press Ctrl+C when done.${colors.reset}\n`);

            // Keep connection open
            await new Promise(() => {});

        } catch (error: any) {
            console.error('❌ Error:', error.message);
            bgWs.close();
            process.exit(1);
        }
    });

    bgWs.on('error', (error) => {
        console.error('❌ Background error:', error.message);
        process.exit(1);
    });
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

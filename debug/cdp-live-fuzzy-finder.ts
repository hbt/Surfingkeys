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
    console.log(`${colors.bright}${colors.cyan}Live Fuzzy Finder Development${colors.reset}\n`);

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
            await new Promise(r => setTimeout(r, 500));
            console.log(`   ${colors.green}✓ Help menu opened${colors.reset}\n`);

            console.log(`${colors.yellow}Step 4: Injecting fuzzy finder...${colors.reset}`);

            const fuzzyFinderCode = `
(function() {
    // Find the UI iframe in shadow root
    const uiHostDivs = Array.from(document.querySelectorAll('div')).filter(div => div.shadowRoot);
    if (uiHostDivs.length === 0) {
        console.error('No shadow root found!');
        return 'ERROR: No shadow root';
    }

    const shadowRoot = uiHostDivs[0].shadowRoot;
    const iframe = shadowRoot.querySelector('iframe.sk_ui');
    if (!iframe) {
        console.error('UI iframe not found!');
        return 'ERROR: No iframe';
    }

    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const usageContainer = iframeDoc.querySelector('#sk_usage');
    if (!usageContainer) {
        console.error('Help menu not found in iframe!');
        return 'ERROR: Help menu not found';
    }

    // Check if fuzzy finder already exists
    if (iframeDoc.querySelector('#sk_fuzzy_search')) {
        console.log('Fuzzy finder already injected');
        return 'Already injected';
    }

    // Create search input in iframe document
    const searchInput = iframeDoc.createElement('input');
    const iframeWin = iframe.contentWindow;
    searchInput.id = 'sk_fuzzy_search';
    searchInput.type = 'text';
    searchInput.placeholder = 'Search commands... (Ctrl+F to focus)';
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

    // Store original content for filtering
    const contentDiv = usageContainer.querySelector('div');
    if (!contentDiv) {
        console.error('Help content not found!');
        return;
    }

    // Parse all help items
    const allItems = [];
    const featureGroups = contentDiv.querySelectorAll(':scope > div');

    featureGroups.forEach((group, groupIndex) => {
        const categoryName = group.querySelector('.feature_name span')?.textContent || '';
        const items = group.querySelectorAll(':scope > div:not(.feature_name)');

        items.forEach(item => {
            const kbd = item.querySelector('.kbd-span kbd')?.textContent || '';
            const annotation = item.querySelector('.annotation')?.textContent || '';

            allItems.push({
                groupIndex,
                categoryName,
                kbd,
                annotation,
                element: item.parentElement,
                item: item
            });
        });
    });

    console.log('Parsed ' + allItems.length + ' help items');

    // Simple fuzzy match function (searches in description only)
    function fuzzyMatch(text, query) {
        if (!query) return true;

        text = text.toLowerCase();
        query = query.toLowerCase();

        // Simple substring match for now
        return text.includes(query);
    }

    // Filter function
    function filterItems(query) {
        let visibleCount = 0;
        const groupVisibility = {};

        allItems.forEach(itemData => {
            // Search only in annotation (description)
            const matches = fuzzyMatch(itemData.annotation, query);

            if (matches) {
                itemData.item.style.display = '';
                visibleCount++;
                groupVisibility[itemData.groupIndex] = true;
            } else {
                itemData.item.style.display = 'none';
            }
        });

        // Show/hide group headers
        featureGroups.forEach((group, idx) => {
            if (groupVisibility[idx]) {
                group.style.display = '';
            } else {
                group.style.display = 'none';
            }
        });

        console.log('Filtered: ' + visibleCount + ' / ' + allItems.length + ' items visible');
    }

    // Store filter function in iframe window
    iframeWin._skFuzzyFilter = filterItems;

    // Add event listener
    searchInput.addEventListener('input', (e) => {
        filterItems(e.target.value);
    });

    // Add keyboard shortcut (Ctrl+F) to focus search
    iframeDoc.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'f' && usageContainer.style.display !== 'none') {
            e.preventDefault();
            searchInput.focus();
        }
        // ESC clears search
        if (e.key === 'Escape' && iframeDoc.activeElement === searchInput) {
            e.stopPropagation();
            searchInput.value = '';
            filterItems('');
            searchInput.blur();
        }
    });

    // Insert search input at the top
    usageContainer.insertBefore(searchInput, contentDiv);

    // Auto-focus the search input
    searchInput.focus();

    console.log('✓ Fuzzy finder injected successfully!');
    return 'Fuzzy finder ready';
})();
`;

            const result = await injectCode(pageWs, fuzzyFinderCode);
            console.log(`   ${colors.green}✓ ${result || 'Fuzzy finder injected'}${colors.reset}\n`);

            console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════${colors.reset}`);
            console.log(`${colors.bright}${colors.green}  Fuzzy Finder is Now Active!${colors.reset}`);
            console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════${colors.reset}\n`);

            console.log(`${colors.cyan}Features:${colors.reset}`);
            console.log(`  • Search input at top of help menu`);
            console.log(`  • Searches in descriptions only`);
            console.log(`  • Real-time filtering as you type`);
            console.log(`  • Ctrl+F to focus search`);
            console.log(`  • ESC to clear search\n`);

            console.log(`${colors.magenta}Try typing:${colors.reset}`);
            console.log(`  • "scroll" - find scrolling commands`);
            console.log(`  • "tab" - find tab-related commands`);
            console.log(`  • "bookmark" - find bookmark commands\n`);

            console.log(`${colors.yellow}Browser stays open for testing.${colors.reset}`);
            console.log(`${colors.yellow}Press Ctrl+C when ready to iterate or finish.${colors.reset}\n`);

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

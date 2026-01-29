#!/usr/bin/env ts-node
/**
 * Omnibar DOM Structure Debug Script
 *
 * This script opens a page, triggers the omnibar with 't' key,
 * and dumps the complete DOM structure to understand where the omnibar lives.
 *
 * Goal: Find exact path to #sk_omnibar element and understand differences
 * between working and failing test approaches.
 *
 * Usage:
 *   npm run debug:cdp:headless debug/omnibar-dom-debug.ts
 */

import * as WebSocket from 'ws';
import * as http from 'http';

const CDP_PORT = process.env.CDP_PORT ? parseInt(process.env.CDP_PORT, 10) : 9222;

let messageId = 1;

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

async function checkCDPAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${CDP_PORT}/json`, (res) => {
            res.resume();
            req.destroy();
            resolve(res.statusCode === 200);
        });
        req.on('error', () => {
            req.destroy();
            resolve(false);
        });
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function getCDPTargets(): Promise<any[]> {
    const data = await new Promise<string>((resolve, reject) => {
        const req = http.get(`http://localhost:${CDP_PORT}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
    });
    return JSON.parse(data);
}

async function findExtensionBackground(): Promise<{ wsUrl: string; extensionId: string }> {
    const targets = await getCDPTargets();

    const bg = targets.find(t =>
        t.title === 'Surfingkeys' ||
        t.url.includes('_generated_background_page.html') ||
        (t.type === 'service_worker' && t.url.includes('background.js'))
    );

    if (!bg) {
        throw new Error('Surfingkeys background page not found');
    }

    const extensionIdMatch = bg.url.match(/chrome-extension:\/\/([a-z]+)\//);
    if (!extensionIdMatch) {
        throw new Error('Could not extract extension ID from URL: ' + bg.url);
    }

    return {
        wsUrl: bg.webSocketDebuggerUrl,
        extensionId: extensionIdMatch[1]
    };
}

async function findContentPage(urlPattern: string): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const targets = await getCDPTargets();

    const page = targets.find(t =>
        t.type === 'page' && t.url.includes(urlPattern)
    );

    if (!page) {
        throw new Error(`Content page not found. Looking for URL containing: ${urlPattern}`);
    }

    return page.webSocketDebuggerUrl;
}

async function findFrontendTarget(): Promise<any> {
    const targets = await getCDPTargets();
    const frontendTarget = targets.find((t: any) =>
        t.url && t.url.includes('frontend.html') && t.webSocketDebuggerUrl
    );
    if (!frontendTarget) {
        throw new Error('Frontend target not found');
    }
    return frontendTarget;
}

async function connectToWebSocket(wsUrl: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            ws.send(JSON.stringify({
                id: messageId++,
                method: 'Runtime.enable'
            }));
            resolve(ws);
        });

        ws.on('error', (error: Error) => {
            reject(error);
        });
    });
}

async function executeInTarget(ws: WebSocket, code: string): Promise<any> {
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

async function createTab(bgWs: WebSocket, url: string): Promise<number> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.create({
                url: '${url}',
                active: true
            }, (tab) => {
                resolve({ id: tab.id });
            });
        })
    `);
    return result.id;
}

async function closeTab(bgWs: WebSocket, tabId: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.remove(${tabId}, () => {
                resolve(true);
            });
        })
    `);
}

async function sendKey(ws: WebSocket, key: string): Promise<void> {
    const id = messageId++;

    // Enable Input domain first
    ws.send(JSON.stringify({
        id: id,
        method: 'Input.enable'
    }));
    await new Promise(resolve => setTimeout(resolve, 50));

    // keyDown
    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyDown',
            key: key
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 50));

    // keyUp
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

async function waitForSurfingkeysReady(ws: WebSocket): Promise<void> {
    // Wait for document to be complete
    for (let i = 0; i < 80; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const ready = await executeInTarget(ws, `document.readyState === 'complete'`);
            if (ready) {
                // Give Surfingkeys time to settle
                await new Promise(resolve => setTimeout(resolve, 500));
                return;
            }
        } catch {
            // Continue waiting
        }
    }
    throw new Error('Surfingkeys not ready after timeout');
}

async function main() {
    console.log(`${colors.bright}${colors.cyan}Omnibar DOM Structure Investigation${colors.reset}\n`);

    // Check CDP availability
    const cdpAvailable = await checkCDPAvailable();
    if (!cdpAvailable) {
        throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
    }
    console.log(`${colors.green}✓ CDP available on port ${CDP_PORT}${colors.reset}`);

    // Connect to background
    const bgInfo = await findExtensionBackground();
    const bgWs = await connectToWebSocket(bgInfo.wsUrl);
    console.log(`${colors.green}✓ Connected to background${colors.reset}`);

    // Create test tab
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';
    const tabId = await createTab(bgWs, FIXTURE_URL);
    console.log(`${colors.green}✓ Created tab ${tabId}${colors.reset}`);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Connect to content page
    const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
    const pageWs = await connectToWebSocket(pageWsUrl);
    await waitForSurfingkeysReady(pageWs);
    console.log(`${colors.green}✓ Connected to content page and Surfingkeys ready${colors.reset}\n`);

    // STEP 1: Check initial state (before opening omnibar)
    console.log(`${colors.yellow}=== STEP 1: Initial DOM State (before omnibar) ===${colors.reset}`);

    const initialState = await executeInTarget(pageWs, `
        (() => {
            const result = {
                shadowHosts: [],
                frontendIframe: null
            };

            const allElements = document.querySelectorAll('*');
            allElements.forEach(el => {
                if (el.shadowRoot) {
                    const info = {
                        tagName: el.tagName.toLowerCase(),
                        id: el.id || '(no id)',
                        shadowChildren: Array.from(el.shadowRoot.children).map(child => ({
                            tagName: child.tagName.toLowerCase(),
                            id: child.id || '(no id)',
                            isIframe: child.tagName === 'IFRAME',
                            iframeSrc: child.tagName === 'IFRAME' ? child.src : null,
                            iframeHeight: child.tagName === 'IFRAME' ? child.style.height : null
                        }))
                    };
                    result.shadowHosts.push(info);

                    const iframe = el.shadowRoot.querySelector('iframe.sk_ui');
                    if (iframe) {
                        result.frontendIframe = {
                            found: true,
                            src: iframe.src,
                            height: iframe.style.height
                        };
                    }
                }
            });

            return result;
        })()
    `);

    console.log(`Shadow hosts found: ${initialState.shadowHosts.length}`);
    console.log(JSON.stringify(initialState, null, 2));
    console.log();

    // STEP 2: Press 't' to open tabs omnibar
    console.log(`${colors.yellow}=== STEP 2: Opening omnibar with 't' key ===${colors.reset}`);
    await sendKey(pageWs, 't');
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`${colors.green}✓ Sent 't' key${colors.reset}\n`);

    // STEP 3: Check state after opening omnibar (from page context)
    console.log(`${colors.yellow}=== STEP 3: DOM State after omnibar opened (page context) ===${colors.reset}`);

    const afterState = await executeInTarget(pageWs, `
        (() => {
            const result = {
                shadowHosts: [],
                frontendIframe: null,
                iframeHeight: null
            };

            const allElements = document.querySelectorAll('*');
            allElements.forEach(el => {
                if (el.shadowRoot) {
                    const info = {
                        tagName: el.tagName.toLowerCase(),
                        id: el.id || '(no id)',
                        shadowChildren: Array.from(el.shadowRoot.children).map(child => ({
                            tagName: child.tagName.toLowerCase(),
                            id: child.id || '(no id)',
                            isIframe: child.tagName === 'IFRAME',
                            iframeSrc: child.tagName === 'IFRAME' ? child.src : null,
                            iframeHeight: child.tagName === 'IFRAME' ? child.style.height : null
                        }))
                    };
                    result.shadowHosts.push(info);

                    const iframe = el.shadowRoot.querySelector('iframe.sk_ui');
                    if (iframe) {
                        result.frontendIframe = {
                            found: true,
                            src: iframe.src,
                            height: iframe.style.height
                        };
                        result.iframeHeight = iframe.style.height;
                    }
                }
            });

            return result;
        })()
    `);

    console.log(`Frontend iframe height: ${afterState.iframeHeight}`);
    console.log(JSON.stringify(afterState, null, 2));
    console.log();

    // STEP 4: Connect to frontend iframe and inspect its contents
    console.log(`${colors.yellow}=== STEP 4: Inspecting frontend iframe contents ===${colors.reset}`);

    let frontendWs: WebSocket | null = null;
    try {
        const frontendTarget = await findFrontendTarget();
        frontendWs = await connectToWebSocket(frontendTarget.webSocketDebuggerUrl);
        console.log(`${colors.green}✓ Connected to frontend iframe${colors.reset}`);

        // Check omnibar in frontend
        const omnibarState = await executeInTarget(frontendWs, `
            (() => {
                const omnibar = document.getElementById('sk_omnibar');
                if (!omnibar) {
                    return { found: false };
                }

                const style = window.getComputedStyle(omnibar);
                const input = omnibar.querySelector('#sk_omnibarSearchArea input');
                const prompt = omnibar.querySelector('#sk_omnibarSearchArea>span.prompt');

                return {
                    found: true,
                    id: omnibar.id,
                    display: style.display,
                    visibility: style.visibility,
                    offsetHeight: omnibar.offsetHeight,
                    offsetWidth: omnibar.offsetWidth,
                    children: {
                        input: input ? {
                            found: true,
                            value: input.value,
                            placeholder: input.placeholder
                        } : { found: false },
                        prompt: prompt ? {
                            found: true,
                            text: prompt.textContent
                        } : { found: false }
                    }
                };
            })()
        `);

        console.log(`Omnibar state in frontend:`);
        console.log(JSON.stringify(omnibarState, null, 2));
        console.log();

        // Get full document structure in frontend
        const frontendStructure = await executeInTarget(frontendWs, `
            (() => {
                const bodyChildren = Array.from(document.body.children).map(el => ({
                    tagName: el.tagName.toLowerCase(),
                    id: el.id || '(no id)'
                }));

                return {
                    documentTitle: document.title,
                    documentUrl: document.location.href,
                    bodyChildren: bodyChildren
                };
            })()
        `);

        console.log(`Frontend document structure:`);
        console.log(JSON.stringify(frontendStructure, null, 2));

    } catch (error: any) {
        console.log(`${colors.red}✗ Failed to connect to frontend: ${error?.message || error}${colors.reset}`);
    }

    // STEP 5: List all CDP targets
    console.log(`\n${colors.yellow}=== STEP 5: All CDP Targets ===${colors.reset}`);

    const targets = await getCDPTargets();
    targets.forEach((t: any) => {
        console.log(`  - ${t.type}: ${t.title || '(no title)'}`);
        console.log(`    URL: ${t.url}`);
        console.log();
    });

    // STEP 6: Summary and recommendations
    console.log(`${colors.bright}${colors.cyan}=== SUMMARY ===${colors.reset}`);
    console.log();
    console.log(`${colors.yellow}Path to omnibar:${colors.reset}`);
    console.log(`  1. From page context: document → shadow root → iframe.sk_ui → CANNOT ACCESS`);
    console.log(`  2. From frontend iframe: document.getElementById('sk_omnibar') → DIRECT ACCESS`);
    console.log();
    console.log(`${colors.yellow}Key findings:${colors.reset}`);
    console.log(`  - Omnibar exists in frontend.html iframe, NOT in main page`);
    console.log(`  - Frontend iframe is inside a shadow root`);
    console.log(`  - Must connect to frontend via CDP to access omnibar DOM`);
    console.log(`  - Cannot query omnibar from page context due to iframe boundary`);
    console.log();
    console.log(`${colors.yellow}Working test approach (cmd-omnibar-url.test.ts):${colors.reset}`);
    console.log(`  ✓ Calls findFrontendTarget() to get frontend iframe target`);
    console.log(`  ✓ Calls connectToFrontend() to establish CDP connection`);
    console.log(`  ✓ Uses pollForOmnibarVisible(frontendWs) with frontend connection`);
    console.log(`  ✓ Queries document.getElementById('sk_omnibar') in frontend context`);
    console.log();
    console.log(`${colors.yellow}Failing test approach (cmd-omnibar-close.test.ts):${colors.reset}`);
    console.log(`  ✗ Uses isOmnibarVisible(pageWs) with page connection`);
    console.log(`  ✗ Tries to check iframe.style.height from page context`);
    console.log(`  ✗ Cannot access omnibar DOM directly - wrong context`);
    console.log();

    // Cleanup
    if (frontendWs) {
        frontendWs.close();
    }
    await closeTab(bgWs, tabId);
    pageWs.close();
    bgWs.close();

    console.log(`${colors.green}✓ Cleanup complete${colors.reset}`);
    process.exit(0);
}

main().catch(error => {
    console.error(`${colors.red}❌ Fatal error:${colors.reset}`, error);
    process.exit(1);
});

#!/usr/bin/env ts-node
/**
 * Test: Trigger reload button on chrome://extensions page via CDP
 *
 * Instead of keyboard shortcut or chrome.developerPrivate.reload(),
 * directly click the reload button in the chrome://extensions UI.
 *
 * This should work even when the extension has errors.
 *
 * Usage:
 *   npm run debug:cdp:live debug/test-reload-button-click.ts
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
    red: '\x1b[31m'
};

async function fetchJson(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}${path}`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error: any) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
            });
        }).on('error', reject);
    });
}

function sendCommand(ws: WebSocket, method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

        const handler = (data: WebSocket.Data) => {
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
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluateCode(ws: WebSocket, expression: string): Promise<any> {
    const result = await sendCommand(ws, 'Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
    });

    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || 'Evaluation failed');
    }

    return result.result?.value;
}

async function findExtensionsTab(extensionId: string): Promise<string | null> {
    const targets = await fetchJson('/json');

    // Try exact match first
    let tab = targets.find((t: any) =>
        t.type === 'page' && t.url?.includes(`chrome://extensions/?errors=${extensionId}`)
    );

    // Fall back to any chrome://extensions page
    if (!tab) {
        tab = targets.find((t: any) =>
            t.type === 'page' && t.url?.startsWith('chrome://extensions')
        );
    }

    return tab ? tab.webSocketDebuggerUrl : null;
}

async function detectExtensionId(): Promise<string | null> {
    const targets = await fetchJson('/json');

    const sw = targets.find((t: any) =>
        t.type === 'service_worker' &&
        t.url?.includes('background.js')
    );

    if (sw && sw.url) {
        const match = sw.url.match(/chrome-extension:\/\/([a-z]+)/);
        if (match) {
            return match[1];
        }
    }

    return null;
}

async function testReloadButtonClick(extensionId: string) {
    console.log(`${colors.bright}Test: Click Reload Button on chrome://extensions${colors.reset}\n`);

    // Find chrome://extensions tab
    console.log(`${colors.cyan}Finding chrome://extensions tab...${colors.reset}`);
    const tabWsUrl = await findExtensionsTab(extensionId);

    if (!tabWsUrl) {
        console.error(`${colors.red}❌ chrome://extensions tab not found${colors.reset}`);
        console.error(`Please open: ${colors.cyan}chrome://extensions/?id=${extensionId}${colors.reset}\n`);
        process.exit(1);
    }

    console.log(`${colors.green}✓ Found tab${colors.reset}\n`);

    // Connect to tab
    const ws = new WebSocket(tabWsUrl);

    ws.on('open', async () => {
        try {
            await sendCommand(ws, 'Runtime.enable');
            await sendCommand(ws, 'DOM.enable');

            console.log(`${colors.cyan}Searching for reload button in Shadow DOM...${colors.reset}\n`);

            // Search for reload button
            const buttonInfo = await evaluateCode(ws, `
                (function() {
                    // Helper to search in shadow DOM recursively
                    function findInShadowDOM(root, test) {
                        const results = [];

                        function search(element) {
                            // Test current element
                            if (test(element)) {
                                results.push(element);
                            }

                            // Search in shadow root
                            if (element.shadowRoot) {
                                Array.from(element.shadowRoot.querySelectorAll('*')).forEach(search);
                            }

                            // Search in children
                            Array.from(element.children).forEach(search);
                        }

                        search(root);
                        return results;
                    }

                    // Search for reload button (by ID or content)
                    const reloadButtons = findInShadowDOM(document.body, (el) => {
                        const tag = el.tagName?.toLowerCase();
                        const id = el.id?.toLowerCase() || '';
                        const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
                        const title = el.title?.toLowerCase() || '';

                        // Look for reload-specific identifiers
                        return (
                            (tag === 'button' || tag === 'cr-button' || tag === 'cr-icon-button') &&
                            (id.includes('reload') ||
                             ariaLabel.includes('reload') ||
                             title.includes('reload'))
                        );
                    });

                    if (reloadButtons.length > 0) {
                        const button = reloadButtons[0];
                        return {
                            found: true,
                            tagName: button.tagName,
                            id: button.id,
                            ariaLabel: button.getAttribute('aria-label'),
                            title: button.title,
                            disabled: button.disabled || button.hasAttribute('disabled'),
                            inShadowDOM: button.getRootNode() !== document
                        };
                    }

                    // Also report all buttons found for debugging
                    const allButtons = findInShadowDOM(document.body, (el) => {
                        const tag = el.tagName?.toLowerCase();
                        return tag === 'button' || tag === 'cr-button' || tag === 'cr-icon-button';
                    });

                    return {
                        found: false,
                        allButtons: allButtons.slice(0, 20).map(b => ({
                            id: b.id,
                            tag: b.tagName,
                            ariaLabel: b.getAttribute('aria-label'),
                            title: b.title,
                            inShadow: b.getRootNode() !== document
                        }))
                    };
                })()
            `);

            if (buttonInfo.found) {
                console.log(`${colors.green}✓ Found reload button!${colors.reset}`);
                console.log(`  Tag: ${buttonInfo.tagName}`);
                console.log(`  ID: ${buttonInfo.id || '(none)'}`);
                console.log(`  Aria-Label: ${buttonInfo.ariaLabel || '(none)'}`);
                console.log(`  Title: ${buttonInfo.title || '(none)'}`);
                console.log(`  Disabled: ${buttonInfo.disabled}`);
                console.log(`  In Shadow DOM: ${buttonInfo.inShadowDOM}\n`);

                // Click the button
                console.log(`${colors.yellow}Clicking reload button...${colors.reset}\n`);
                const clickResult = await evaluateCode(ws, `
                    (function() {
                        function findInShadowDOM(root, test) {
                            const results = [];
                            function search(element) {
                                if (test(element)) results.push(element);
                                if (element.shadowRoot) {
                                    Array.from(element.shadowRoot.querySelectorAll('*')).forEach(search);
                                }
                                Array.from(element.children).forEach(search);
                            }
                            search(root);
                            return results;
                        }

                        const reloadButtons = findInShadowDOM(document.body, (el) => {
                            const tag = el.tagName?.toLowerCase();
                            const id = el.id?.toLowerCase() || '';
                            const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
                            const title = el.title?.toLowerCase() || '';
                            return (
                                (tag === 'button' || tag === 'cr-button' || tag === 'cr-icon-button') &&
                                (id.includes('reload') || ariaLabel.includes('reload') || title.includes('reload'))
                            );
                        });

                        if (reloadButtons.length > 0) {
                            reloadButtons[0].click();
                            return { clicked: true, method: 'click() on reload button' };
                        }

                        return { clicked: false, error: 'Reload button not found' };
                    })()
                `);

                if (clickResult.clicked) {
                    console.log(`${colors.green}✅ SUCCESS - Reload button clicked!${colors.reset}`);
                    console.log(`  Method: ${clickResult.method}\n`);
                    console.log(`${colors.cyan}Extension should be reloading now...${colors.reset}\n`);
                } else {
                    console.log(`${colors.red}✗ Failed to click: ${clickResult.error}${colors.reset}\n`);
                }
            } else {
                console.log(`${colors.red}✗ Reload button not found${colors.reset}\n`);
                console.log(`  All buttons found on page (first 20):`);
                if (buttonInfo.allButtons && buttonInfo.allButtons.length > 0) {
                    buttonInfo.allButtons.forEach((btn: any) => {
                        console.log(`    - ${btn.tag} id="${btn.id}" aria-label="${btn.ariaLabel}" title="${btn.title}"`);
                    });
                } else {
                    console.log(`    (no buttons found)`);
                }
            }

            ws.close();
            process.exit(0);

        } catch (error: any) {
            console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}\n`);
            ws.close();
            process.exit(1);
        }
    });

    ws.on('error', (error) => {
        console.error(`${colors.red}❌ WebSocket error: ${error.message}${colors.reset}\n`);
        process.exit(1);
    });
}

async function main() {
    const extensionId = await detectExtensionId();

    if (!extensionId) {
        console.error(`${colors.red}❌ Could not detect extension ID${colors.reset}\n`);
        process.exit(1);
    }

    console.log(`Extension ID: ${colors.bright}${extensionId}${colors.reset}\n`);

    await testReloadButtonClick(extensionId);
}

main();

#!/usr/bin/env ts-node
/**
 * Test: Clear extension errors using CDP + DOM manipulation
 *
 * Attempts to find and click the "Clear all" button on chrome://extensions/?errors=<id>
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

async function findExtensionsErrorTab(extensionId: string): Promise<string | null> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const tab = targets.find((t: any) =>
        t.type === 'page' && t.url && t.url.includes(`chrome://extensions/?errors=${extensionId}`)
    );
    return tab ? tab.webSocketDebuggerUrl : null;
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

async function main() {
    const extensionId = 'aajlcoiaogpknhgninhopncaldipjdnp';

    console.log(`${colors.bright}Testing: Clear Extension Errors via CDP${colors.reset}\n`);

    const tabWsUrl = await findExtensionsErrorTab(extensionId);
    if (!tabWsUrl) {
        console.error(`${colors.red}❌ chrome://extensions/?errors=${extensionId} tab not found${colors.reset}`);
        console.error(`Please open: chrome://extensions/?errors=${extensionId}`);
        process.exit(1);
    }

    const ws = new WebSocket(tabWsUrl);

    ws.on('open', async () => {
        try {
            await sendCommand(ws, 'Runtime.enable');
            await sendCommand(ws, 'DOM.enable');
            console.log(`${colors.green}✓ Connected to chrome://extensions tab${colors.reset}\n`);

            // Step 1: Get error count before clearing
            console.log(`${colors.yellow}Step 1: Count errors before clearing${colors.reset}`);
            const errorsBefore = await evaluateCode(ws, `
                (function() {
                    // Try to find error elements
                    const errorItems = document.querySelectorAll('extensions-error-page extensions-runtime-host-permissions, extensions-error-page .error-item, [class*="error"]');
                    return {
                        errorElements: errorItems.length,
                        html: document.body.innerHTML.substring(0, 500)
                    };
                })()
            `);
            console.log(`   Error elements found: ${errorsBefore.errorElements}`);
            console.log();

            // Step 2: Find "Clear all" button (including Shadow DOM)
            console.log(`${colors.yellow}Step 2: Search for "Clear all" button (including Shadow DOM)${colors.reset}`);
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

                    // Search for clear button
                    const clearButtons = findInShadowDOM(document.body, (el) => {
                        const tag = el.tagName?.toLowerCase();
                        const text = el.textContent?.toLowerCase() || '';
                        const id = el.id?.toLowerCase() || '';

                        return (
                            (tag === 'button' || tag === 'cr-button' || tag === 'paper-button') &&
                            (text.includes('clear') || id.includes('clear'))
                        );
                    });

                    if (clearButtons.length > 0) {
                        const button = clearButtons[0];
                        return {
                            found: true,
                            text: button.textContent.trim(),
                            tagName: button.tagName,
                            id: button.id,
                            className: button.className,
                            disabled: button.disabled || button.hasAttribute('disabled'),
                            inShadowDOM: button.getRootNode() !== document
                        };
                    }

                    // Also report all buttons found
                    const allButtons = findInShadowDOM(document.body, (el) => {
                        const tag = el.tagName?.toLowerCase();
                        return tag === 'button' || tag === 'cr-button' || tag === 'paper-button';
                    });

                    return {
                        found: false,
                        allButtons: allButtons.slice(0, 10).map(b => ({
                            text: b.textContent.trim().substring(0, 50),
                            id: b.id,
                            tag: b.tagName,
                            inShadow: b.getRootNode() !== document
                        }))
                    };
                })()
            `);

            if (buttonInfo.found) {
                console.log(`   ${colors.green}✓ Found button!${colors.reset}`);
                console.log(`   Text: "${buttonInfo.text}"`);
                console.log(`   Tag: ${buttonInfo.tagName}`);
                console.log(`   ID: ${buttonInfo.id || '(none)'}`);
                console.log(`   Class: ${buttonInfo.className || '(none)'}`);
                console.log(`   Disabled: ${buttonInfo.disabled}`);
                console.log(`   In Shadow DOM: ${buttonInfo.inShadowDOM}`);
                console.log();

                // Step 3: Click the button
                console.log(`${colors.yellow}Step 3: Click "Clear all" button${colors.reset}`);
                const clickResult = await evaluateCode(ws, `
                    (function() {
                        // Search in shadow DOM
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

                        const clearButtons = findInShadowDOM(document.body, (el) => {
                            const tag = el.tagName?.toLowerCase();
                            const text = el.textContent?.toLowerCase() || '';
                            const id = el.id?.toLowerCase() || '';
                            return (
                                (tag === 'button' || tag === 'cr-button' || tag === 'paper-button') &&
                                (text.includes('clear') || id.includes('clear'))
                            );
                        });

                        if (clearButtons.length > 0) {
                            clearButtons[0].click();
                            return { clicked: true, method: 'click() via Shadow DOM search' };
                        }

                        return { clicked: false, error: 'Button not found in Shadow DOM' };
                    })()
                `);

                if (clickResult.clicked) {
                    console.log(`   ${colors.green}✓ Clicked button using ${clickResult.method}${colors.reset}`);
                    console.log();

                    // Wait for UI update
                    await new Promise(r => setTimeout(r, 1000));

                    // Step 4: Verify errors cleared
                    console.log(`${colors.yellow}Step 4: Verify errors cleared${colors.reset}`);
                    const errorsAfter = await evaluateCode(ws, `
                        (function() {
                            const errorItems = document.querySelectorAll('extensions-error-page extensions-runtime-host-permissions, extensions-error-page .error-item, [class*="error"]');
                            return {
                                errorElements: errorItems.length
                            };
                        })()
                    `);
                    console.log(`   Error elements after clear: ${errorsAfter.errorElements}`);
                    console.log();

                    if (errorsAfter.errorElements < errorsBefore.errorElements) {
                        console.log(`${colors.green}✅ SUCCESS - Errors cleared!${colors.reset}`);
                        console.log(`   Before: ${errorsBefore.errorElements}`);
                        console.log(`   After:  ${errorsAfter.errorElements}`);
                    } else {
                        console.log(`${colors.yellow}⚠️  No change in error count${colors.reset}`);
                        console.log(`   Errors might already be cleared, or button click didn't work`);
                    }
                } else {
                    console.log(`   ${colors.red}✗ Failed to click: ${clickResult.error}${colors.reset}`);
                }
            } else {
                console.log(`   ${colors.red}✗ "Clear all" button not found${colors.reset}`);
                console.log();
                console.log(`   All buttons found on page:`);
                if (buttonInfo.allButtons && buttonInfo.allButtons.length > 0) {
                    buttonInfo.allButtons.forEach((btn: any) => {
                        console.log(`     - "${btn.text}" (${btn.tag}, id: ${btn.id || 'none'})`);
                    });
                } else {
                    console.log(`     (no buttons found)`);
                }
            }

            ws.close();
            process.exit(0);

        } catch (error: any) {
            console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
            ws.close();
            process.exit(1);
        }
    });

    ws.on('error', (error) => {
        console.error(`${colors.red}❌ WebSocket error: ${error.message}${colors.reset}`);
        process.exit(1);
    });
}

main();

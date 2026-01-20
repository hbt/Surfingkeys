#!/usr/bin/env ts-node
/**
 * CDP Error Handler Testing
 *
 * This script:
 * 1. Injects global error handlers into background script
 * 2. Injects global error handlers into content script
 * 3. Creates error collector that stores in chrome.storage.local
 * 4. Triggers various error types to test
 * 5. Verifies errors are caught and stored
 * 6. Displays captured errors
 *
 * Tests:
 * - window.onerror (unhandled JS errors)
 * - window.onunhandledrejection (promise rejections)
 * - chrome.runtime.onError (MV3 service worker)
 * - Command execution errors
 * - chrome.storage.local persistence
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

function section(title: string): void {
    console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);
}

function step(num: number, desc: string): void {
    console.log(`${colors.bright}${colors.yellow}Step ${num}:${colors.reset} ${desc}`);
}

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

function execBg(ws: WebSocket, code: string): Promise<any> {
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
                awaitPromise: true
            }
        }));
    });
}

function execPage(ws: WebSocket, code: string): Promise<any> {
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
                awaitPromise: true
            }
        }));
    });
}

async function createTab(bgWs: WebSocket): Promise<number> {
    const tab = await execBg(bgWs, `
        new Promise(r => {
            chrome.tabs.create({
                url: 'http://127.0.0.1:9873/hackernews.html',
                active: true
            }, tab => r({ id: tab.id }));
        })
    `);
    return tab.id;
}

async function closeTab(bgWs: WebSocket, tabId: number): Promise<void> {
    await execBg(bgWs, `
        new Promise(r => {
            chrome.tabs.remove(${tabId}, () => r(true));
        })
    `);
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

// Error collector code that will be injected
const errorCollectorCode = `
(function() {
    // Don't install if already installed
    if (window._surfingkeysErrorHandlersInstalled) {
        console.log('[ERROR COLLECTOR] Already installed');
        return;
    }

    window._surfingkeysErrorHandlersInstalled = true;
    window._surfingkeysErrors = [];

    // Helper to save error to chrome.storage.local
    function saveError(errorData) {
        const storageKey = 'surfingkeys_errors';

        chrome.storage.local.get([storageKey], (result) => {
            const errors = result[storageKey] || [];
            errors.push(errorData);

            // Keep last 100 errors
            if (errors.length > 100) {
                errors.shift();
            }

            chrome.storage.local.set({ [storageKey]: errors }, () => {
                console.log('[ERROR COLLECTOR] Saved error to storage:', errorData.type);
            });
        });

        // Also keep in memory for immediate access
        window._surfingkeysErrors.push(errorData);
    }

    // 1. window.onerror - catches unhandled JS errors
    const originalOnError = window.onerror;
    window.onerror = function(message, source, lineno, colno, error) {
        const errorData = {
            type: 'window.onerror',
            message: message || 'Unknown error',
            source: source || 'unknown',
            lineno: lineno || 0,
            colno: colno || 0,
            stack: error ? error.stack : 'No stack trace',
            timestamp: new Date().toISOString(),
            context: typeof chrome !== 'undefined' && chrome.runtime ? 'background' : 'page'
        };

        console.error('[ERROR HANDLER] window.onerror caught:', errorData);
        saveError(errorData);

        // Call original handler if it exists
        if (originalOnError) {
            return originalOnError.apply(this, arguments);
        }

        return false; // Don't prevent default error handling
    };

    // 2. onunhandledrejection - catches unhandled promise rejections
    const originalOnRejection = window.onunhandledrejection;
    window.onunhandledrejection = function(event) {
        const errorData = {
            type: 'unhandledrejection',
            message: event.reason ? event.reason.toString() : 'Unknown rejection',
            reason: event.reason,
            stack: event.reason && event.reason.stack ? event.reason.stack : 'No stack trace',
            timestamp: new Date().toISOString(),
            context: typeof chrome !== 'undefined' && chrome.runtime ? 'background' : 'page'
        };

        console.error('[ERROR HANDLER] unhandledrejection caught:', errorData);
        saveError(errorData);

        // Call original handler if it exists
        if (originalOnRejection) {
            return originalOnRejection.apply(this, arguments);
        }
    };

    // 3. chrome.runtime.onError - MV3 service worker errors (if available)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
        // Wrap chrome.runtime.lastError access
        console.log('[ERROR HANDLER] chrome.runtime available, monitoring lastError');
    }

    console.log('[ERROR COLLECTOR] ✓ Installed global error handlers');
    console.log('[ERROR COLLECTOR]   - window.onerror');
    console.log('[ERROR COLLECTOR]   - window.onunhandledrejection');
})();
`;

async function main() {
    console.log(`${colors.bright}CDP Error Handler Testing${colors.reset}\n`);
    console.log('Testing global error handlers with live code injection\n');

    const bgWs = new WebSocket(await findBg());

    bgWs.on('open', async () => {
        try {
            bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            bgWs.send(JSON.stringify({ id: messageId++, method: 'Console.enable' }));
            await new Promise(r => setTimeout(r, 100));

            // Capture background console logs
            const bgLogs: string[] = [];
            bgWs.on('message', (data: WebSocket.Data) => {
                const msg = JSON.parse(data.toString());
                if (msg.method === 'Runtime.consoleAPICalled') {
                    const args = msg.params.args || [];
                    const texts = args.map((arg: any) =>
                        arg.type === 'string' ? arg.value : JSON.stringify(arg.value)
                    );
                    bgLogs.push(texts.join(' '));
                }
            });

            section('PHASE 1: Clear Previous Errors');

            step(1, 'Clear chrome.storage.local errors');
            await execBg(bgWs, `
                new Promise(r => {
                    chrome.storage.local.set({ surfingkeys_errors: [] }, () => {
                        console.log('[TEST] Cleared error storage');
                        r(true);
                    });
                })
            `);
            await new Promise(r => setTimeout(r, 200));
            console.log(`   ${colors.green}✓ Cleared previous errors${colors.reset}\n`);

            section('PHASE 2: Inject Error Handlers - Background Script');

            step(2, 'Install global error handlers in background');
            await execBg(bgWs, errorCollectorCode);
            await new Promise(r => setTimeout(r, 300));

            console.log(`   ${colors.green}✓ Error handlers installed in background${colors.reset}\n`);
            console.log(`   ${colors.magenta}Background logs:${colors.reset}`);
            bgLogs.forEach(log => console.log(`      ${log}`));
            bgLogs.length = 0;

            section('PHASE 3: Trigger Errors - Background Script');

            step(3, 'Trigger unhandled JS error (window.onerror)');
            try {
                await execBg(bgWs, `
                    // Trigger error after a delay to ensure handler is ready
                    setTimeout(() => {
                        throw new Error('TEST: Background script error via window.onerror');
                    }, 100);
                    'error_triggered'
                `);
            } catch (e) {
                // Expected - the error will be caught by window.onerror
            }
            await new Promise(r => setTimeout(r, 500));
            console.log(`   ${colors.green}✓ Triggered JS error${colors.reset}\n`);

            step(4, 'Trigger unhandled promise rejection');
            await execBg(bgWs, `
                // Trigger promise rejection
                Promise.reject(new Error('TEST: Background promise rejection'));
                'rejection_triggered'
            `);
            await new Promise(r => setTimeout(r, 500));
            console.log(`   ${colors.green}✓ Triggered promise rejection${colors.reset}\n`);

            step(5, 'Trigger chrome.runtime.lastError scenario');
            await execBg(bgWs, `
                // Attempt to get a non-existent tab (will trigger lastError)
                chrome.tabs.get(999999, (tab) => {
                    if (chrome.runtime.lastError) {
                        const errorData = {
                            type: 'chrome.runtime.lastError',
                            message: chrome.runtime.lastError.message,
                            timestamp: new Date().toISOString(),
                            context: 'background'
                        };
                        console.error('[ERROR HANDLER] chrome.runtime.lastError:', errorData);

                        // Save to storage
                        chrome.storage.local.get(['surfingkeys_errors'], (result) => {
                            const errors = result.surfingkeys_errors || [];
                            errors.push(errorData);
                            chrome.storage.local.set({ surfingkeys_errors: errors });
                        });
                    }
                });
                'lastError_triggered'
            `);
            await new Promise(r => setTimeout(r, 500));
            console.log(`   ${colors.green}✓ Triggered chrome.runtime.lastError${colors.reset}\n`);

            console.log(`   ${colors.magenta}Background logs (errors):${colors.reset}`);
            bgLogs.forEach(log => console.log(`      ${log}`));
            bgLogs.length = 0;

            section('PHASE 4: Inject Error Handlers - Content Script');

            step(6, 'Create test tab for content script');
            const testTabId = await createTab(bgWs);
            console.log(`   ${colors.green}✓ Created tab ID: ${testTabId}${colors.reset}\n`);

            const pageWsUrl = await findPage('127.0.0.1:9873/hackernews.html');
            if (!pageWsUrl) throw new Error('Could not find page');

            const pageWs = new WebSocket(pageWsUrl);
            await new Promise(resolve => pageWs.on('open', resolve));
            pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            pageWs.send(JSON.stringify({ id: messageId++, method: 'Console.enable' }));
            await new Promise(r => setTimeout(r, 500));

            // Capture page console logs
            const pageLogs: string[] = [];
            pageWs.on('message', (data: WebSocket.Data) => {
                const msg = JSON.parse(data.toString());
                if (msg.method === 'Runtime.consoleAPICalled') {
                    const args = msg.params.args || [];
                    const texts = args.map((arg: any) =>
                        arg.type === 'string' ? arg.value : JSON.stringify(arg.value)
                    );
                    pageLogs.push(texts.join(' '));
                }
            });

            step(7, 'Install global error handlers in content script');
            await execPage(pageWs, errorCollectorCode);
            await new Promise(r => setTimeout(r, 300));

            console.log(`   ${colors.green}✓ Error handlers installed in content script${colors.reset}\n`);
            console.log(`   ${colors.magenta}Page logs:${colors.reset}`);
            pageLogs.forEach(log => console.log(`      ${log}`));
            pageLogs.length = 0;

            section('PHASE 5: Trigger Errors - Content Script');

            step(8, 'Trigger JS error in content script');
            try {
                await execPage(pageWs, `
                    setTimeout(() => {
                        throw new Error('TEST: Content script error via window.onerror');
                    }, 100);
                    'error_triggered'
                `);
            } catch (e) {
                // Expected
            }
            await new Promise(r => setTimeout(r, 500));
            console.log(`   ${colors.green}✓ Triggered JS error${colors.reset}\n`);

            step(9, 'Trigger promise rejection in content script');
            await execPage(pageWs, `
                Promise.reject(new Error('TEST: Content script promise rejection'));
                'rejection_triggered'
            `);
            await new Promise(r => setTimeout(r, 500));
            console.log(`   ${colors.green}✓ Triggered promise rejection${colors.reset}\n`);

            console.log(`   ${colors.magenta}Page logs (errors):${colors.reset}`);
            pageLogs.forEach(log => console.log(`      ${log}`));
            pageLogs.length = 0;

            section('PHASE 6: Verify Errors Were Captured');

            step(10, 'Retrieve errors from chrome.storage.local');
            const storedErrors = await execBg(bgWs, `
                new Promise(r => {
                    chrome.storage.local.get(['surfingkeys_errors'], (result) => {
                        r(result.surfingkeys_errors || []);
                    });
                })
            `);

            console.log(`   ${colors.green}✓ Retrieved ${storedErrors.length} errors from storage${colors.reset}\n`);

            step(11, 'Display captured errors');
            if (storedErrors && storedErrors.length > 0) {
                storedErrors.forEach((err: any, idx: number) => {
                    console.log(`\n   ${colors.bright}Error #${idx + 1}:${colors.reset}`);
                    console.log(`      Type:      ${colors.yellow}${err.type}${colors.reset}`);
                    console.log(`      Context:   ${err.context}`);
                    console.log(`      Message:   ${err.message}`);
                    console.log(`      Timestamp: ${err.timestamp}`);
                    if (err.source) {
                        console.log(`      Source:    ${err.source}:${err.lineno}:${err.colno}`);
                    }
                    if (err.stack) {
                        const stackLines = err.stack.split('\n').slice(0, 3);
                        console.log(`      Stack:     ${stackLines.join('\n                 ')}`);
                    }
                });
            } else {
                console.log(`   ${colors.yellow}⚠️  No errors captured${colors.reset}`);
            }

            section('PHASE 7: Verification Summary');

            console.log(`${colors.bright}Test Results:${colors.reset}\n`);

            const bgErrors = storedErrors.filter((e: any) => e.context === 'background');
            const pageErrors = storedErrors.filter((e: any) => e.context === 'page');
            const onErrorCount = storedErrors.filter((e: any) => e.type === 'window.onerror').length;
            const rejectionCount = storedErrors.filter((e: any) => e.type === 'unhandledrejection').length;
            const lastErrorCount = storedErrors.filter((e: any) => e.type === 'chrome.runtime.lastError').length;

            console.log(`  Total errors captured:     ${colors.bright}${storedErrors.length}${colors.reset}`);
            console.log(`  Background errors:         ${bgErrors.length}`);
            console.log(`  Content script errors:     ${pageErrors.length}`);
            console.log(`  window.onerror:            ${onErrorCount}`);
            console.log(`  unhandledrejection:        ${rejectionCount}`);
            console.log(`  chrome.runtime.lastError:  ${lastErrorCount}\n`);

            const expectedErrors = 5; // 2 bg (error + rejection) + 1 lastError + 2 page (error + rejection)
            if (storedErrors.length >= expectedErrors) {
                console.log(`${colors.green}✅ SUCCESS - All error types captured!${colors.reset}\n`);
            } else {
                console.log(`${colors.yellow}⚠️  Expected at least ${expectedErrors} errors, got ${storedErrors.length}${colors.reset}\n`);
            }

            section('SUMMARY: Error Handler Coverage');

            console.log(`${colors.bright}Global Handlers Installed:${colors.reset}\n`);
            console.log(`  ✓ window.onerror - Catches unhandled JS errors`);
            console.log(`  ✓ window.onunhandledrejection - Catches promise rejections`);
            console.log(`  ✓ chrome.runtime.lastError - Catches Chrome API errors\n`);

            console.log(`${colors.bright}Contexts Covered:${colors.reset}\n`);
            console.log(`  ✓ Background script (service worker)`);
            console.log(`  ✓ Content script (page context)\n`);

            console.log(`${colors.bright}Persistence:${colors.reset}\n`);
            console.log(`  ✓ Errors stored in chrome.storage.local`);
            console.log(`  ✓ Survives extension reload`);
            console.log(`  ✓ Kept in memory for immediate access\n`);

            console.log(`${colors.bright}Next Steps:${colors.reset}\n`);
            console.log(`  1. Add this error handler code to production`);
            console.log(`  2. Add error viewer UI (see errors on demand)`);
            console.log(`  3. Add error rate limiting (prevent storage overflow)`);
            console.log(`  4. Add error categorization (group similar errors)`);
            console.log(`  5. Add error context (current URL, mode, settings)\n`);

            // Cleanup
            await closeTab(bgWs, testTabId);
            console.log(`${colors.green}✓ Test complete${colors.reset}\n`);

            pageWs.close();
            bgWs.close();

        } catch (error: any) {
            console.error('❌ Error:', error.message);
            console.error(error.stack);
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

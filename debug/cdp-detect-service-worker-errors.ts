#!/usr/bin/env ts-node
/**
 * Service Worker Error Detector
 *
 * Detects service worker registration failures and runtime errors.
 * This is critical because:
 * 1. Chrome doesn't log service worker errors to files
 * 2. They only show in chrome://extensions/?errors=<id>
 * 3. Our error collector can't catch its own initialization errors
 *
 * Detection methods:
 * 1. Check if service worker is registered via CDP
 * 2. Monitor console for registration errors
 * 3. Check error handler installation (chicken-egg test)
 * 4. Query chrome.runtime.lastError
 *
 * Usage:
 *   CDP_PORT=9222 npx ts-node debug/cdp-detect-service-worker-errors.ts
 *   Exit code: 0 = no errors, 1 = errors detected
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

interface DetectionResult {
    check: string;
    status: 'PASS' | 'FAIL' | 'WARN';
    message: string;
    details?: any;
}

const results: DetectionResult[] = [];

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

async function exec(ws: WebSocket, code: string, timeout: number = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeoutHandle = setTimeout(() => reject(new Error('Timeout')), timeout);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeoutHandle);
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

async function checkServiceWorkerRegistration(targets: any[]): Promise<void> {
    const serviceWorker = targets.find(t => t.type === 'service_worker');

    if (serviceWorker) {
        results.push({
            check: 'Service Worker Registration',
            status: 'PASS',
            message: 'Service worker is registered and active',
            details: { title: serviceWorker.title, url: serviceWorker.url }
        });
    } else {
        // Check if it's MV2 background page
        const backgroundPage = targets.find(t =>
            t.type === 'background_page' ||
            (t.url && t.url.includes('background.js'))
        );

        if (backgroundPage) {
            results.push({
                check: 'Service Worker Registration',
                status: 'PASS',
                message: 'MV2 background page found (not using service worker)',
                details: { title: backgroundPage.title, url: backgroundPage.url }
            });
        } else {
            results.push({
                check: 'Service Worker Registration',
                status: 'FAIL',
                message: 'Service worker not found in CDP targets (may be inactive or failed to register)',
                details: { available_types: targets.map(t => t.type).filter((v, i, a) => a.indexOf(v) === i) }
            });
        }
    }
}

async function checkErrorHandlerInstallation(targets: any[]): Promise<void> {
    // Try to find any extension context with chrome API access
    const extensionTargets = targets.filter(t =>
        t.url && t.url.includes('chrome-extension://') && t.webSocketDebuggerUrl
    );

    if (extensionTargets.length === 0) {
        results.push({
            check: 'Error Handler Installation',
            status: 'FAIL',
            message: 'No extension contexts available to check error handler installation'
        });
        return;
    }

    for (const target of extensionTargets) {
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise(resolve => ws.on('open', resolve));

        ws.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
        await new Promise(r => setTimeout(r, 500));

        try {
            const installed = await exec(ws, `
                (function() {
                    // Check all possible global contexts
                    const globalScope = typeof globalThis !== 'undefined' ? globalThis :
                                       typeof self !== 'undefined' ? self :
                                       typeof window !== 'undefined' ? window : null;

                    if (!globalScope) return false;
                    return globalScope._surfingkeysErrorHandlersInstalled === true;
                })();
            `);

            results.push({
                check: 'Error Handler Installation',
                status: installed ? 'PASS' : 'FAIL',
                message: installed ?
                    `Error handlers installed in ${target.title || 'extension context'}` :
                    `Error handlers NOT installed in ${target.title || 'extension context'}`,
                details: { target: target.url, context: target.type }
            });

            ws.close();

            // If we found one installed, that's good enough
            if (installed) break;
        } catch (e: any) {
            results.push({
                check: 'Error Handler Installation',
                status: 'WARN',
                message: `Could not check error handlers in ${target.title || 'extension context'}: ${e.message}`,
                details: { target: target.url }
            });
            ws.close();
        }
    }
}

async function checkConsoleErrors(targets: any[]): Promise<void> {
    const extensionTargets = targets.filter(t =>
        t.url && t.url.includes('chrome-extension://') && t.webSocketDebuggerUrl
    );

    if (extensionTargets.length === 0) {
        results.push({
            check: 'Console Errors',
            status: 'WARN',
            message: 'No extension contexts available to monitor console'
        });
        return;
    }

    const errors: any[] = [];

    for (const target of extensionTargets) {
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise(resolve => ws.on('open', resolve));

        ws.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
        ws.send(JSON.stringify({ id: messageId++, method: 'Log.enable' }));
        ws.send(JSON.stringify({ id: messageId++, method: 'Console.enable' }));

        ws.on('message', (data: any) => {
            const msg = JSON.parse(data.toString());

            // Capture runtime exceptions
            if (msg.method === 'Runtime.exceptionThrown') {
                const exception = msg.params.exceptionDetails;
                errors.push({
                    target: target.title || target.url,
                    type: 'Exception',
                    message: exception.exception?.description || exception.text,
                    url: exception.url,
                    line: exception.lineNumber,
                    col: exception.columnNumber
                });
            }

            // Capture console errors
            if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
                const args = msg.params.args || [];
                const message = args.map((arg: any) =>
                    arg.value || arg.description || JSON.stringify(arg)
                ).join(' ');

                errors.push({
                    target: target.title || target.url,
                    type: 'Console Error',
                    message: message
                });
            }
        });
    }

    // Wait for errors to accumulate
    await new Promise(r => setTimeout(r, 2000));

    if (errors.length > 0) {
        results.push({
            check: 'Console Errors',
            status: 'FAIL',
            message: `Found ${errors.length} console error(s) in extension contexts`,
            details: errors
        });
    } else {
        results.push({
            check: 'Console Errors',
            status: 'PASS',
            message: 'No console errors detected'
        });
    }
}

async function checkStorageErrors(targets: any[]): Promise<void> {
    const extensionTarget = targets.find(t =>
        t.url && t.url.includes('chrome-extension://') && t.webSocketDebuggerUrl
    );

    if (!extensionTarget) {
        results.push({
            check: 'Storage Errors',
            status: 'WARN',
            message: 'No extension context available to check storage'
        });
        return;
    }

    const ws = new WebSocket(extensionTarget.webSocketDebuggerUrl);
    await new Promise(resolve => ws.on('open', resolve));

    ws.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 500));

    try {
        const storageErrors = await exec(ws, `
            new Promise(r => {
                chrome.storage.local.get(['surfingkeys_errors'], (result) => {
                    if (chrome.runtime.lastError) {
                        r({ error: chrome.runtime.lastError.message });
                    } else {
                        r({ errors: result.surfingkeys_errors || [] });
                    }
                });
            })
        `);

        if (storageErrors.error) {
            results.push({
                check: 'Storage Errors',
                status: 'FAIL',
                message: `chrome.storage.local error: ${storageErrors.error}`,
                details: storageErrors
            });
        } else {
            results.push({
                check: 'Storage Errors',
                status: 'PASS',
                message: `chrome.storage.local accessible (${storageErrors.errors.length} stored errors)`,
                details: { count: storageErrors.errors.length }
            });
        }

        ws.close();
    } catch (e: any) {
        results.push({
            check: 'Storage Errors',
            status: 'FAIL',
            message: `Failed to access chrome.storage.local: ${e.message}`
        });
        ws.close();
    }
}

async function main() {
    console.log('Service Worker Error Detection\n');
    console.log('Checking extension for errors that prevent proper initialization...\n');

    const targets = await getAllTargets();

    // Run all checks
    await checkServiceWorkerRegistration(targets);
    await checkErrorHandlerInstallation(targets);
    await checkConsoleErrors(targets);
    await checkStorageErrors(targets);

    // Display results
    console.log('='.repeat(70));
    console.log('DETECTION RESULTS');
    console.log('='.repeat(70));

    let hasFailures = false;
    let hasWarnings = false;

    results.forEach((result, idx) => {
        const symbol = result.status === 'PASS' ? '✓' :
                      result.status === 'FAIL' ? '✗' : '⚠';
        const color = result.status === 'PASS' ? '\x1b[32m' :
                     result.status === 'FAIL' ? '\x1b[31m' : '\x1b[33m';

        console.log(`\n${color}${symbol}\x1b[0m ${result.check}`);
        console.log(`  ${result.message}`);

        if (result.details) {
            console.log(`  Details: ${JSON.stringify(result.details, null, 2).split('\n').join('\n  ')}`);
        }

        if (result.status === 'FAIL') hasFailures = true;
        if (result.status === 'WARN') hasWarnings = true;
    });

    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const warned = results.filter(r => r.status === 'WARN').length;

    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Warnings: ${warned}`);
    console.log();

    if (hasFailures) {
        console.log('\x1b[31m✗ DETECTION FAILED - Extension has errors\x1b[0m');
        console.log('\nTo see full error details, visit:');
        console.log('  chrome://extensions/?errors=<extension-id>');
        process.exit(1);
    } else if (hasWarnings) {
        console.log('\x1b[33m⚠ DETECTION PASSED WITH WARNINGS\x1b[0m');
        process.exit(0);
    } else {
        console.log('\x1b[32m✓ DETECTION PASSED - No errors found\x1b[0m');
        process.exit(0);
    }
}

main().catch(error => {
    console.error('\x1b[31m✗ Detection script failed:\x1b[0m', error.message);
    process.exit(1);
});

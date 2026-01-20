#!/usr/bin/env ts-node
/**
 * CDP Interactive Debugging Session
 *
 * Demonstrates advanced debugging capabilities through CDP:
 * - Runtime inspection and evaluation
 * - Breakpoint-like debugging with step execution
 * - Variable inspection across contexts
 * - Call stack analysis
 * - Live code modification
 * - Network monitoring
 * - Performance profiling
 *
 * Usage: npx ts-node tests/cdp-debug-interactive.ts
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

// ANSI colors for better output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function section(title: string): void {
    console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

function step(num: number, desc: string): void {
    console.log(`${colors.bright}${colors.yellow}Step ${num}:${colors.reset} ${desc}`);
}

function result(label: string, value: any): void {
    const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    console.log(`${colors.green}  ✓ ${label}:${colors.reset} ${valueStr}`);
}

function debug(label: string, value: any): void {
    const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    console.log(`${colors.magenta}  🔍 ${label}:${colors.reset} ${valueStr}`);
}

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
    const extensionId = extensionIdMatch ? extensionIdMatch[1] : 'unknown';

    result('Connected to background', `Extension ID: ${extensionId}`);
    return { wsUrl: bg.webSocketDebuggerUrl, extensionId };
}

function executeInContext(ws: WebSocket, code: string, contextDescription: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout waiting for response in ${contextDescription}`));
        }, 5000);

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

        ws.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {
                expression: code,
                returnByValue: true,
                awaitPromise: true,
                generatePreview: true
            }
        }));
    });
}

async function inspectObject(ws: WebSocket, objectId: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => {
            reject(new Error('Timeout inspecting object'));
        }, 5000);

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

        ws.send(JSON.stringify({
            id,
            method: 'Runtime.getProperties',
            params: {
                objectId: objectId,
                ownProperties: true,
                generatePreview: true
            }
        }));
    });
}

async function createTab(bgWs: WebSocket): Promise<number> {
    const fixtureUrl = 'http://127.0.0.1:9873/hackernews.html';

    const tab = await executeInContext(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.create({
                url: '${fixtureUrl}',
                active: true
            }, (tab) => {
                resolve({ id: tab.id, url: tab.url });
            });
        })
    `, 'background');

    result('Created tab', `ID: ${tab.result.value.id}`);
    return tab.result.value.id;
}

async function closeTab(bgWs: WebSocket, tabId: number): Promise<void> {
    await executeInContext(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.remove(${tabId}, () => resolve(true));
        })
    `, 'background');
    result('Closed tab', tabId);
}

async function findContentPage(): Promise<string> {
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
        throw new Error('Content page not found');
    }

    result('Found content page', page.url);
    return page.webSocketDebuggerUrl;
}

async function demoRuntimeInspection(pageWs: WebSocket): Promise<void> {
    section('1. RUNTIME INSPECTION - Exploring JavaScript Environment');

    step(1, 'Inspecting global objects and properties');

    // Get window properties
    const windowProps = await executeInContext(pageWs, `
        Object.keys(window).filter(k => k.toLowerCase().includes('surfing')).slice(0, 5)
    `, 'page');

    debug('Surfingkeys-related globals', windowProps.result.value);

    step(2, 'Deep object inspection - Reading Surfingkeys state');

    const skState = await executeInContext(pageWs, `
        (function() {
            return {
                hasFront: typeof window.Front !== 'undefined',
                hasNormal: typeof window.Normal !== 'undefined',
                hasHints: typeof window.Hints !== 'undefined',
                documentReady: document.readyState,
                surfingkeysReady: typeof window.runtime !== 'undefined'
            };
        })()
    `, 'page');

    debug('Surfingkeys state', skState.result.value);

    step(3, 'Inspecting function signatures');

    const funcSigs = await executeInContext(pageWs, `
        (function() {
            const funcs = [];
            if (typeof window.Front !== 'undefined' && window.Front.showBanner) {
                funcs.push({
                    name: 'Front.showBanner',
                    args: window.Front.showBanner.length,
                    source: window.Front.showBanner.toString().substring(0, 100)
                });
            }
            return funcs;
        })()
    `, 'page');

    if (funcSigs.result.value && funcSigs.result.value.length > 0) {
        debug('Function signatures', funcSigs.result.value);
    }
}

async function demoVariableInspection(pageWs: WebSocket): Promise<void> {
    section('2. VARIABLE INSPECTION - Reading and Modifying State');

    step(1, 'Creating test variables in page context');

    await executeInContext(pageWs, `
        window.debugTest = {
            counter: 0,
            messages: [],
            config: {
                enabled: true,
                debugLevel: 2
            }
        };
        console.log('[DEBUG TEST] Test object created');
    `, 'page');

    result('Created test object', 'window.debugTest');

    step(2, 'Reading variable values');

    const testObj = await executeInContext(pageWs, `
        window.debugTest
    `, 'page');

    debug('window.debugTest', testObj.result.value);

    step(3, 'Modifying variables live');

    await executeInContext(pageWs, `
        window.debugTest.counter = 42;
        window.debugTest.messages.push('Modified from CDP');
        window.debugTest.config.debugLevel = 5;
    `, 'page');

    const modified = await executeInContext(pageWs, `window.debugTest`, 'page');
    debug('After modification', modified.result.value);
}

async function demoCallStackAnalysis(pageWs: WebSocket): Promise<void> {
    section('3. CALL STACK ANALYSIS - Understanding Execution Flow');

    step(1, 'Creating nested function calls to analyze stack');

    await executeInContext(pageWs, `
        window.debugFunctions = {
            level1: function() {
                console.log('[STACK] Level 1 called');
                return this.level2();
            },
            level2: function() {
                console.log('[STACK] Level 2 called');
                return this.level3();
            },
            level3: function() {
                console.log('[STACK] Level 3 called');
                // Capture stack trace
                const stack = new Error().stack;
                return { stack: stack, timestamp: Date.now() };
            }
        };
    `, 'page');

    step(2, 'Executing nested calls and capturing stack');

    const stackResult = await executeInContext(pageWs, `
        window.debugFunctions.level1()
    `, 'page');

    if (stackResult.result.value && stackResult.result.value.stack) {
        const stackLines = stackResult.result.value.stack.split('\n').slice(0, 7);
        debug('Call stack', stackLines.join('\n       '));
    }
}

async function demoLiveCodeModification(pageWs: WebSocket): Promise<void> {
    section('4. LIVE CODE MODIFICATION - Runtime Monkey Patching');

    step(1, 'Reading original scroll position');

    const beforeScroll = await executeInContext(pageWs, `window.scrollY`, 'page');
    debug('Initial scroll position', beforeScroll.result.value);

    step(2, 'Intercepting and modifying console.log behavior');

    await executeInContext(pageWs, `
        window.originalConsoleLog = console.log;
        window.interceptedLogs = [];

        console.log = function(...args) {
            window.interceptedLogs.push({
                timestamp: Date.now(),
                args: args
            });
            window.originalConsoleLog.apply(console, ['[INTERCEPTED]', ...args]);
        };
    `, 'page');

    result('Installed console.log interceptor', 'Active');

    step(3, 'Testing interceptor');

    await executeInContext(pageWs, `
        console.log('Test message 1');
        console.log('Test message 2', { foo: 'bar' });
    `, 'page');

    const intercepted = await executeInContext(pageWs, `window.interceptedLogs`, 'page');
    debug('Intercepted logs', intercepted.result.value);

    step(4, 'Injecting custom scrolling behavior');

    await executeInContext(pageWs, `
        window.customScroll = function(amount) {
            console.log('[CUSTOM SCROLL] Scrolling by', amount);
            window.scrollBy(0, amount);
            return {
                before: window.scrollY - amount,
                after: window.scrollY,
                delta: amount
            };
        };
    `, 'page');

    const scrollResult = await executeInContext(pageWs, `window.customScroll(100)`, 'page');
    debug('Custom scroll result', scrollResult.result.value);
}

async function demoNetworkMonitoring(pageWs: WebSocket): Promise<void> {
    section('5. NETWORK MONITORING - Tracking HTTP Activity');

    step(1, 'Enabling Network domain');

    pageWs.send(JSON.stringify({
        id: messageId++,
        method: 'Network.enable'
    }));

    await new Promise(resolve => setTimeout(resolve, 100));
    result('Network monitoring', 'Enabled');

    const networkEvents: any[] = [];

    const networkHandler = (data: WebSocket.Data) => {
        const msg = JSON.parse(data.toString());

        if (msg.method && msg.method.startsWith('Network.')) {
            networkEvents.push({
                method: msg.method,
                params: msg.params
            });
        }
    };

    pageWs.on('message', networkHandler);

    step(2, 'Triggering network request via fetch');

    await executeInContext(pageWs, `
        fetch('http://127.0.0.1:9873/hackernews.html', { method: 'HEAD' })
            .then(() => console.log('[NETWORK] Fetch completed'))
            .catch(e => console.error('[NETWORK] Fetch failed:', e));
    `, 'page');

    await new Promise(resolve => setTimeout(resolve, 1000));

    pageWs.removeListener('message', networkHandler);

    step(3, 'Analyzing captured network events');

    const requestEvents = networkEvents.filter(e =>
        e.method === 'Network.requestWillBeSent' ||
        e.method === 'Network.responseReceived'
    );

    debug('Network events captured', `${requestEvents.length} events`);

    if (requestEvents.length > 0) {
        requestEvents.slice(0, 3).forEach((evt, idx) => {
            debug(`Event ${idx + 1}`, {
                type: evt.method,
                url: evt.params?.request?.url || evt.params?.response?.url
            });
        });
    }
}

async function demoPerformanceProfiling(pageWs: WebSocket): Promise<void> {
    section('6. PERFORMANCE PROFILING - Measuring Execution Time');

    step(1, 'Measuring DOM query performance');

    const perfTest = await executeInContext(pageWs, `
        (function() {
            const results = [];

            // Test 1: querySelectorAll performance
            const start1 = performance.now();
            const links = document.querySelectorAll('a');
            const end1 = performance.now();
            results.push({
                test: 'querySelectorAll("a")',
                time: (end1 - start1).toFixed(3) + 'ms',
                count: links.length
            });

            // Test 2: getElementsByTagName performance
            const start2 = performance.now();
            const divs = document.getElementsByTagName('div');
            const end2 = performance.now();
            results.push({
                test: 'getElementsByTagName("div")',
                time: (end2 - start2).toFixed(3) + 'ms',
                count: divs.length
            });

            // Test 3: Complex selector
            const start3 = performance.now();
            const complex = document.querySelectorAll('div > a[href]');
            const end3 = performance.now();
            results.push({
                test: 'querySelectorAll("div > a[href]")',
                time: (end3 - start3).toFixed(3) + 'ms',
                count: complex.length
            });

            return results;
        })()
    `, 'page');

    debug('DOM Query Performance', perfTest.result.value);

    step(2, 'Getting memory usage');

    const memory = await executeInContext(pageWs, `
        (function() {
            if (performance.memory) {
                return {
                    used: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
                    total: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
                    limit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
                };
            }
            return { error: 'performance.memory not available' };
        })()
    `, 'page');

    debug('Memory Usage', memory.result.value);
}

async function demoDebuggerCommands(pageWs: WebSocket): Promise<void> {
    section('7. DEBUGGER DOMAIN - Advanced Debugging Features');

    step(1, 'Enabling Debugger domain');

    await new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                pageWs.removeListener('message', handler);
                resolve(msg);
            }
        };

        pageWs.on('message', handler);

        pageWs.send(JSON.stringify({
            id,
            method: 'Debugger.enable'
        }));
    });

    result('Debugger domain', 'Enabled');

    step(2, 'Listing all loaded scripts');

    const scripts: any[] = [];
    let scriptsParsedCount = 0;

    const scriptHandler = (data: WebSocket.Data) => {
        const msg = JSON.parse(data.toString());

        if (msg.method === 'Debugger.scriptParsed') {
            scriptsParsedCount++;
            const script = msg.params;
            if (!script.url.startsWith('chrome-extension://') && script.url !== '') {
                scripts.push({
                    scriptId: script.scriptId,
                    url: script.url,
                    length: script.length
                });
            }
        }
    };

    pageWs.on('message', scriptHandler);

    await new Promise(resolve => setTimeout(resolve, 1000));

    pageWs.removeListener('message', scriptHandler);

    debug('Scripts parsed events', scriptsParsedCount);
    debug('External scripts', scripts.slice(0, 5));

    step(3, 'Getting execution contexts');

    const contexts = await new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                pageWs.removeListener('message', handler);
                resolve(msg.result);
            }
        };

        pageWs.on('message', handler);

        pageWs.send(JSON.stringify({
            id,
            method: 'Runtime.getIsolatedContexts'
        }));
    }).catch(() => null);

    if (contexts) {
        debug('Execution contexts', contexts);
    }
}

async function main() {
    console.log(`${colors.bright}CDP Interactive Debugging Session${colors.reset}\n`);

    const cdpAvailable = await checkCDPAvailable();
    if (!cdpAvailable) {
        console.error('❌ Chrome DevTools Protocol not available on port 9222');
        console.error('Start Chrome with: google-chrome-stable --remote-debugging-port=9222');
        process.exit(1);
    }

    const { wsUrl, extensionId } = await findExtensionBackground();
    const bgWs = new WebSocket(wsUrl);

    bgWs.on('open', async () => {
        try {
            // Enable Runtime domain
            bgWs.send(JSON.stringify({
                id: messageId++,
                method: 'Runtime.enable'
            }));

            await new Promise(resolve => setTimeout(resolve, 100));

            // Create test tab
            const tabId = await createTab(bgWs);
            const pageWsUrl = await findContentPage();

            // Connect to page
            const pageWs = new WebSocket(pageWsUrl);

            pageWs.on('open', async () => {
                result('Connected to content page', 'Ready');

                // Enable domains
                pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
                pageWs.send(JSON.stringify({ id: messageId++, method: 'Console.enable' }));
                await new Promise(resolve => setTimeout(resolve, 2000));

                try {
                    // Run all debugging demos
                    await demoRuntimeInspection(pageWs);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    await demoVariableInspection(pageWs);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    await demoCallStackAnalysis(pageWs);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    await demoLiveCodeModification(pageWs);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    await demoNetworkMonitoring(pageWs);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    await demoPerformanceProfiling(pageWs);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    await demoDebuggerCommands(pageWs);

                    section('SUMMARY');
                    console.log(`${colors.green}✅ All debugging demonstrations completed successfully${colors.reset}\n`);
                    console.log('Capabilities demonstrated:');
                    console.log('  • Runtime object inspection');
                    console.log('  • Variable reading and modification');
                    console.log('  • Call stack analysis');
                    console.log('  • Live code monkey-patching');
                    console.log('  • Network activity monitoring');
                    console.log('  • Performance profiling');
                    console.log('  • Debugger domain features');
                    console.log('');

                } catch (error) {
                    console.error(`${colors.red}❌ Demo error:${colors.reset}`, error);
                } finally {
                    // Cleanup
                    await closeTab(bgWs, tabId);
                    pageWs.close();
                    bgWs.close();
                }
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

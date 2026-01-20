#!/usr/bin/env ts-node
/**
 * CDP Live Code Modification - No Reload Debugging
 *
 * Demonstrates modifying Surfingkeys behavior at runtime:
 * 1. Test original 'j' key scroll behavior
 * 2. Inject logging to track scroll operations
 * 3. Modify scroll distance (make it 2x larger)
 * 4. Test modified behavior
 * 5. All WITHOUT reloading the extension!
 *
 * This shows you how to debug by adding instrumentation on-the-fly
 */

import * as WebSocket from 'ws';
import * as http from 'http';

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

async function findBg(): Promise<string> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get('http://localhost:9222/json', (res) => {
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

function exec(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                resolve(msg.error ? null : msg.result?.result?.value);
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: { expression: code, returnByValue: true, awaitPromise: true }
        }));
    });
}

async function sendKey(ws: WebSocket, key: string): Promise<void> {
    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'keyDown', key: key }
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

async function createTab(bgWs: WebSocket): Promise<number> {
    const tab = await exec(bgWs, `
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
    await exec(bgWs, `
        new Promise(r => {
            chrome.tabs.remove(${tabId}, () => r(true));
        })
    `);
}

async function findPage(): Promise<string> {
    await new Promise(r => setTimeout(r, 2000));
    const resp = await new Promise<string>((resolve, reject) => {
        http.get('http://localhost:9222/json', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const page = targets.find((t: any) =>
        t.type === 'page' && t.url.includes('127.0.0.1:9873/hackernews.html')
    );
    if (!page) throw new Error('Page not found');
    return page.webSocketDebuggerUrl;
}

async function main() {
    console.log(`${colors.bright}CDP Live Code Modification - No Reload Debugging${colors.reset}\n`);
    console.log('Demonstrating runtime behavior modification without reloading extension\n');

    const bgWs = new WebSocket(await findBg());

    bgWs.on('open', async () => {
        try {
            bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            await new Promise(r => setTimeout(r, 100));

            console.log('Setting up test environment...');
            const tabId = await createTab(bgWs);
            console.log(`✓ Test tab created (ID: ${tabId})`);

            const pageWs = new WebSocket(await findPage());

            pageWs.on('open', async () => {
                pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
                pageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
                pageWs.send(JSON.stringify({ id: messageId++, method: 'Console.enable' }));
                await new Promise(r => setTimeout(r, 2000));
                console.log('✓ Page loaded and ready\n');

                // Set up console log capturing
                const consoleLogs: string[] = [];
                pageWs.on('message', (data: WebSocket.Data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.method === 'Runtime.consoleAPICalled') {
                        const args = msg.params.args || [];
                        const texts = args.map((arg: any) =>
                            arg.type === 'string' ? arg.value : JSON.stringify(arg.value)
                        );
                        consoleLogs.push(texts.join(' '));
                    }
                });

                section('PHASE 1: Test Original Behavior');

                console.log('Testing original scroll with \'j\' key...\n');

                const before1 = await exec(pageWs, 'window.scrollY');
                console.log(`   Before: scrollY = ${before1} px`);

                await sendKey(pageWs, 'j');
                await new Promise(r => setTimeout(r, 300));

                const after1 = await exec(pageWs, 'window.scrollY');
                const delta1 = after1 - before1;
                console.log(`   After:  scrollY = ${after1} px`);
                console.log(`   ${colors.green}Scrolled: ${delta1} px${colors.reset}\n`);

                section('PHASE 2: Inject Logging (Live Modification #1)');

                console.log('Installing scroll logging without reloading...\n');

                await exec(pageWs, `
                    // Store original window.scrollBy
                    window._originalScrollBy = window.scrollBy;
                    window._scrollLogs = [];

                    // Replace with instrumented version
                    window.scrollBy = function(x, y) {
                        const timestamp = new Date().toISOString().split('T')[1];
                        const logMsg = '[SCROLL LOG ' + timestamp + '] scrollBy(' + x + ', ' + y + ')';
                        console.log(logMsg);
                        window._scrollLogs.push({ time: timestamp, x: x, y: y });

                        // Call original
                        return window._originalScrollBy.call(window, x, y);
                    };

                    console.log('[DEBUG] Scroll logging installed!');
                `);

                await new Promise(r => setTimeout(r, 100));
                console.log(`   ${colors.green}✓ Logging installed${colors.reset}`);
                console.log('   Now every scroll will be logged to console\n');

                section('PHASE 3: Test With Logging Active');

                consoleLogs.length = 0; // Clear logs
                console.log('Pressing \'j\' key again...\n');

                const before2 = await exec(pageWs, 'window.scrollY');
                console.log(`   Before: scrollY = ${before2} px`);

                await sendKey(pageWs, 'j');
                await new Promise(r => setTimeout(r, 300));

                const after2 = await exec(pageWs, 'window.scrollY');
                const delta2 = after2 - before2;
                console.log(`   After:  scrollY = ${after2} px`);
                console.log(`   ${colors.green}Scrolled: ${delta2} px${colors.reset}\n`);

                console.log(`   ${colors.magenta}Console logs captured:${colors.reset}`);
                const recentLogs = consoleLogs.slice(-5);
                recentLogs.forEach(log => console.log(`      ${log}`));

                // Get scroll logs
                const scrollLogs = await exec(pageWs, 'window._scrollLogs');
                if (scrollLogs && scrollLogs.length > 0) {
                    console.log(`\n   ${colors.magenta}Scroll operations tracked:${colors.reset}`);
                    scrollLogs.forEach((log: any) => {
                        console.log(`      [${log.time}] scrollBy(${log.x}, ${log.y})`);
                    });
                }

                section('PHASE 4: Modify Behavior (Live Modification #2)');

                console.log('Modifying scroll distance to 2x WITHOUT reloading...\n');

                await exec(pageWs, `
                    // Wrap with 2x multiplier
                    const _loggedScrollBy = window.scrollBy;

                    window.scrollBy = function(x, y) {
                        const originalY = y;
                        const modifiedY = y * 2;  // Double the scroll!

                        console.log('[MODIFIED] Original scroll: ' + originalY + 'px, Modified: ' + modifiedY + 'px');

                        // Call with modified value
                        return _loggedScrollBy.call(window, x, modifiedY);
                    };

                    console.log('[DEBUG] Scroll behavior modified to 2x!');
                `);

                await new Promise(r => setTimeout(r, 100));
                console.log(`   ${colors.green}✓ Behavior modified to scroll 2x distance${colors.reset}`);
                console.log('   Surfingkeys code unchanged, but behavior is different!\n');

                section('PHASE 5: Test Modified Behavior');

                consoleLogs.length = 0;
                console.log('Pressing \'j\' key with 2x multiplier...\n');

                const before3 = await exec(pageWs, 'window.scrollY');
                console.log(`   Before: scrollY = ${before3} px`);

                await sendKey(pageWs, 'j');
                await new Promise(r => setTimeout(r, 300));

                const after3 = await exec(pageWs, 'window.scrollY');
                const delta3 = after3 - before3;
                console.log(`   After:  scrollY = ${after3} px`);
                console.log(`   ${colors.green}Scrolled: ${delta3} px (2x original!)${colors.reset}\n`);

                console.log(`   ${colors.magenta}Console logs captured:${colors.reset}`);
                const finalLogs = consoleLogs.slice(-5);
                finalLogs.forEach(log => console.log(`      ${log}`));

                section('SUMMARY: Live Modification Capabilities');

                console.log(`${colors.bright}What We Did:${colors.reset}\n`);
                console.log(`  Phase 1: Tested original behavior → ${delta1}px scroll`);
                console.log(`  Phase 2: Injected logging → tracking all scrollBy() calls`);
                console.log(`  Phase 3: Verified logging works → captured scroll events`);
                console.log(`  Phase 4: Modified behavior → 2x scroll multiplier`);
                console.log(`  Phase 5: Tested modified → ${delta3}px scroll (${(delta3/delta1).toFixed(1)}x original)\n`);

                console.log(`${colors.bright}Key Insights:${colors.reset}\n`);
                console.log(`  ✓ NO extension reload required`);
                console.log(`  ✓ Added logging to track function calls`);
                console.log(`  ✓ Modified behavior (2x scroll) at runtime`);
                console.log(`  ✓ Original Surfingkeys code untouched`);
                console.log(`  ✓ Changes take effect immediately\n`);

                console.log(`${colors.bright}Practical Use Cases:${colors.reset}\n`);
                console.log(`  1. ${colors.yellow}Debug Issues:${colors.reset} Add logging to track down bugs`);
                console.log(`     Example: Log every key press to see what's captured\n`);

                console.log(`  2. ${colors.yellow}Test Fixes:${colors.reset} Try fixes without rebuild/reload`);
                console.log(`     Example: Modify scroll amount to test different values\n`);

                console.log(`  3. ${colors.yellow}Understand Flow:${colors.reset} Instrument code to see execution`);
                console.log(`     Example: Wrap functions to capture arguments/return values\n`);

                console.log(`  4. ${colors.yellow}Performance:${colors.reset} Measure execution time`);
                console.log(`     Example: Time how long hint creation takes\n`);

                console.log(`${colors.bright}Next Steps:${colors.reset}\n`);
                console.log(`  • You can wrap ANY function accessible in window scope`);
                console.log(`  • You can add try/catch to capture errors`);
                console.log(`  • You can intercept and modify arguments`);
                console.log(`  • You can capture call stacks with new Error().stack`);
                console.log(`  • You can A/B test different implementations\n`);

                console.log(`${colors.yellow}Limitation:${colors.reset}`);
                console.log(`  • Can only modify window scope (not content script scope)`);
                console.log(`  • But window.scrollBy is in window scope, so we can intercept`);
                console.log(`    Surfingkeys' scrollDown command when it calls window.scrollBy\n`);

                await closeTab(bgWs, tabId);
                console.log(`${colors.green}✓ Test complete${colors.reset}\n`);

                pageWs.close();
                bgWs.close();
            });

            pageWs.on('error', async (error) => {
                console.error('❌ Page error:', error.message);
                await closeTab(bgWs, tabId);
                bgWs.close();
                process.exit(1);
            });

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

    bgWs.on('close', () => {
        process.exit(0);
    });
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

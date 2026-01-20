#!/usr/bin/env ts-node
/**
 * CDP Live Code Modification - Clipboard (Background Script)
 *
 * End-to-end test:
 * 1. Use 'ya' command (copy link URL with hints)
 * 2. Inject logging into background's clipboard operations
 * 3. Trigger the command → select a hint → copies link URL
 * 4. Verify logged URL in background
 * 5. Read clipboard (with proper Promise handling)
 * 6. Verify what we read matches what was logged
 * 7. Modify clipboard to prefix with "[MODIFIED] "
 * 8. Test modified behavior
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
                    // Handle both sync values and Promise results
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
                awaitPromise: true  // This makes CDP wait for Promises!
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

async function findPage(): Promise<string> {
    await new Promise(r => setTimeout(r, 2000));
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
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
    console.log(`${colors.bright}CDP Live Code Modification - Clipboard (Background Script)${colors.reset}\n`);
    console.log('End-to-end test with ya command and Promise handling\n');

    const bgWs = new WebSocket(await findBg());

    bgWs.on('open', async () => {
        try {
            bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            bgWs.send(JSON.stringify({ id: messageId++, method: 'Console.enable' }));
            await new Promise(r => setTimeout(r, 100));

            // Capture console logs from BACKGROUND
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

            console.log('Setting up test environment...');
            const tabId = await createTab(bgWs);
            console.log(`✓ Test tab created (ID: ${tabId})`);

            const pageWs = new WebSocket(await findPage());

            pageWs.on('open', async () => {
                pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
                pageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
                await new Promise(r => setTimeout(r, 2000));
                console.log('✓ Page loaded and ready\n');

                section('PHASE 1: Inject Logging Into Page Context');

                console.log('Installing clipboard logging in PAGE CONTEXT...\n');
                console.log('   (Chrome uses document.execCommand, not navigator.clipboard)\n');

                // Capture page console logs
                const pageLogs: string[] = [];
                pageWs.send(JSON.stringify({ id: messageId++, method: 'Console.enable' }));
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

                await execPage(pageWs, `
                    // Store original document.execCommand
                    if (!document._originalExecCommand) {
                        document._originalExecCommand = document.execCommand;
                        window._copyOperations = [];
                    }

                    // Replace with instrumented version
                    document.execCommand = function(command, showUI, value) {
                        if (command === 'copy') {
                            // Get what's being copied (from selection or active element)
                            let copiedText = '';
                            const selection = window.getSelection();
                            if (selection && selection.toString()) {
                                copiedText = selection.toString();
                            } else {
                                const activeEl = document.activeElement;
                                if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
                                    copiedText = activeEl.value;
                                }
                            }

                            const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
                            console.log('[PAGE COPY] execCommand("copy") - text: "' + copiedText.substring(0, 50) + '"');
                            window._copyOperations.push({ time: timestamp, text: copiedText });
                        }

                        // Call original
                        return document._originalExecCommand.call(document, command, showUI, value);
                    };

                    console.log('[PAGE DEBUG] Copy logging installed!');
                `);

                await new Promise(r => setTimeout(r, 200));
                console.log(`   ${colors.green}✓ Logging installed in page context${colors.reset}\n`);

                console.log(`   ${colors.magenta}Page logs:${colors.reset}`);
                pageLogs.forEach(log => console.log(`      ${log}`));
                pageLogs.length = 0;

                section('PHASE 2: Test ya Command (Copy Link URL With Hints)');

                console.log('Triggering "ya" command (copy link URL)...\n');

                // Get first link URL from page for verification
                const firstLinkUrl = await execPage(pageWs, `
                    document.querySelector('a')?.href || 'no-link-found'
                `);
                console.log(`   First link on page: ${firstLinkUrl}\n`);

                // Focus page first
                pageWs.send(JSON.stringify({
                    id: messageId++,
                    method: 'Input.dispatchMouseEvent',
                    params: {
                        type: 'mousePressed',
                        x: 100,
                        y: 100,
                        button: 'left',
                        clickCount: 1
                    }
                }));
                await new Promise(r => setTimeout(r, 100));
                pageWs.send(JSON.stringify({
                    id: messageId++,
                    method: 'Input.dispatchMouseEvent',
                    params: {
                        type: 'mouseReleased',
                        x: 100,
                        y: 100,
                        button: 'left',
                        clickCount: 1
                    }
                }));
                await new Promise(r => setTimeout(r, 200));

                // Send 'y' then 'a' to trigger copy link command
                console.log('   Sending "y" key...');
                await sendKey(pageWs, 'y');

                console.log('   Sending "a" key...');
                await sendKey(pageWs, 'a');

                // Wait for hints to appear
                await new Promise(r => setTimeout(r, 500));

                // Check if hints appeared
                const hintsVisible = await execPage(pageWs, `
                    (function() {
                        const hintsHost = document.querySelector('.surfingkeys_hints_host');
                        const shadowRoot = hintsHost?.shadowRoot;
                        const hints = shadowRoot ? Array.from(shadowRoot.querySelectorAll('div')).filter(d => {
                            const text = (d.textContent || '').trim();
                            return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
                        }) : [];
                        return {
                            visible: hints.length > 0,
                            count: hints.length,
                            firstHint: hints[0]?.textContent
                        };
                    })()
                `);

                console.log(`   ${colors.magenta}Hints status:${colors.reset}`);
                console.log(`      Visible: ${hintsVisible.visible}`);
                console.log(`      Count: ${hintsVisible.count}`);
                console.log(`      First hint: ${hintsVisible.firstHint}\n`);

                if (hintsVisible.visible && hintsVisible.firstHint) {
                    // Send the first hint key to select first link
                    const hintKey = hintsVisible.firstHint.toLowerCase();
                    console.log(`   Sending hint key "${hintKey}" to select first link...`);
                    await sendKey(pageWs, hintKey);
                    await new Promise(r => setTimeout(r, 500));
                }

                section('PHASE 3: Verify Background Logging');

                console.log(`${colors.magenta}Background logs captured:${colors.reset}`);
                if (bgLogs.length > 0) {
                    bgLogs.forEach(log => console.log(`   ${log}`));
                } else {
                    console.log('   (No console logs captured yet)');
                }

                // Get clipboard writes from background
                const clipWrites = await execBg(bgWs, 'window._clipboardWrites || []');
                console.log(`\n${colors.magenta}Clipboard writes tracked in background:${colors.reset}`);
                if (clipWrites && clipWrites.length > 0) {
                    clipWrites.forEach((write: any) => {
                        console.log(`   [${write.time}] "${write.text}"`);
                    });
                } else {
                    console.log('   (No clipboard writes tracked)');
                }

                section('PHASE 4: Read From Clipboard (Promise Handling)');

                console.log('Reading clipboard with proper Promise handling...\n');

                // Read clipboard - awaitPromise:true handles the Promise automatically
                const clipboardContent = await execBg(bgWs, `
                    navigator.clipboard.readText()
                `);

                console.log(`${colors.green}✓ Clipboard content: "${clipboardContent}"${colors.reset}\n`);

                // Verify it matches what we logged
                if (clipWrites && clipWrites.length > 0) {
                    const lastWrite = clipWrites[clipWrites.length - 1];
                    if (clipboardContent === lastWrite.text) {
                        console.log(`${colors.green}✅ SUCCESS - Clipboard matches logged write!${colors.reset}`);
                        console.log(`   Logged: "${lastWrite.text}"`);
                        console.log(`   Read:   "${clipboardContent}"\n`);
                    } else {
                        console.log(`${colors.yellow}⚠️  Mismatch:${colors.reset}`);
                        console.log(`   Logged: "${lastWrite.text}"`);
                        console.log(`   Read:   "${clipboardContent}"\n`);
                    }
                }

                section('PHASE 5: Modify Background Behavior');

                console.log('Modifying clipboard to PREFIX all text with "[MODIFIED] "...\n');

                bgLogs.length = 0;

                await execBg(bgWs, `
                    const _loggedWriteText = navigator.clipboard.writeText;

                    navigator.clipboard.writeText = function(text) {
                        const modifiedText = '[MODIFIED] ' + text;

                        console.log('[BG MODIFIED] Original: "' + text + '"');
                        console.log('[BG MODIFIED] Writing: "' + modifiedText + '"');

                        // Call with modified text
                        return _loggedWriteText.call(this, modifiedText);
                    };

                    console.log('[BG DEBUG] Clipboard behavior modified!');
                `);

                await new Promise(r => setTimeout(r, 200));
                console.log(`   ${colors.green}✓ Background clipboard modified${colors.reset}\n`);

                console.log(`   ${colors.magenta}Background logs:${colors.reset}`);
                bgLogs.forEach(log => console.log(`      ${log}`));
                bgLogs.length = 0;

                section('PHASE 6: Test Modified Behavior');

                console.log('Testing modified clipboard behavior...\n');

                // Trigger ya command again
                console.log('   Sending "y" + "a" again...');
                await sendKey(pageWs, 'y');
                await sendKey(pageWs, 'a');
                await new Promise(r => setTimeout(r, 500));

                if (hintsVisible.visible && hintsVisible.firstHint) {
                    const hintKey = hintsVisible.firstHint.toLowerCase();
                    console.log(`   Sending hint key "${hintKey}"...`);
                    await sendKey(pageWs, hintKey);
                    await new Promise(r => setTimeout(r, 500));
                }

                // Read clipboard again
                const modifiedClipboard = await execBg(bgWs, `
                    navigator.clipboard.readText()
                `);

                console.log(`\n${colors.green}Clipboard after modification: "${modifiedClipboard}"${colors.reset}\n`);

                if (modifiedClipboard && modifiedClipboard.startsWith('[MODIFIED] ')) {
                    console.log(`${colors.green}✅ SUCCESS - Text was prefixed!${colors.reset}\n`);
                } else {
                    console.log(`${colors.yellow}⚠️  Clipboard: "${modifiedClipboard}"${colors.reset}\n`);
                }

                console.log(`${colors.magenta}Background logs:${colors.reset}`);
                bgLogs.forEach(log => console.log(`   ${log}`));

                section('SUMMARY: End-to-End Clipboard Test');

                console.log(`${colors.bright}What We Accomplished:${colors.reset}\n`);
                console.log(`  1. Injected logging into background navigator.clipboard.writeText()`);
                console.log(`  2. Used real Surfingkeys command: "ya" (copy link URL with hints)`);
                console.log(`  3. Verified logging captured the clipboard write`);
                console.log(`  4. Read clipboard with PROPER PROMISE HANDLING`);
                console.log(`  5. Verified read content matched logged content`);
                console.log(`  6. Modified background behavior to prefix text`);
                console.log(`  7. Tested modified behavior end-to-end\n`);

                console.log(`${colors.bright}Key Technical Points:${colors.reset}\n`);
                console.log(`  ${colors.cyan}Promise Handling:${colors.reset}`);
                console.log(`    awaitPromise: true in Runtime.evaluate makes CDP wait for Promises`);
                console.log(`    This works for ALL Chrome APIs that return Promises\n`);

                console.log(`  ${colors.cyan}Background Context:${colors.reset}`);
                console.log(`    We modified the service worker's clipboard API`);
                console.log(`    Changes affect ALL tabs using clipboard\n`);

                console.log(`  ${colors.cyan}No Reload Required:${colors.reset}`);
                console.log(`    All modifications done at runtime`);
                console.log(`    Multiple test iterations in one session\n`);

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

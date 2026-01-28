/**
 * Simple test to verify zoom command works at all
 */

import {
    findExtensionBackground,
    findContentPage,
    connectToCDP,
    createTab,
    executeInTarget,
    closeTab,
    closeCDP
} from '../tests/cdp/utils/cdp-client';
import { sendKey, enableInputDomain, waitForSurfingkeysReady } from '../tests/cdp/utils/browser-actions';

async function getZoom(bgWs: any, tabId: number): Promise<number> {
    return await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.getZoom(${tabId}, (z) => resolve(z));
        })
    `);
}

async function main() {
    console.log('=== Testing zi command ===\n');

    // Connect to background
    const bgInfo = await findExtensionBackground();
    const bgWs = await connectToCDP(bgInfo.wsUrl);
    console.log('Connected to background');

    // Create tab
    const tabId = await createTab(bgWs, 'http://127.0.0.1:9873/scroll-test.html', true);
    console.log('Created tab:', tabId);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get initial zoom
    const initialZoom = await getZoom(bgWs, tabId);
    console.log('Initial zoom:', initialZoom);

    // Connect to page
    const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
    const pageWs = await connectToCDP(pageWsUrl);
    enableInputDomain(pageWs);
    await waitForSurfingkeysReady(pageWs);
    console.log('Page ready');

    // Check RUNTIME
    const hasRuntime = await executeInTarget(pageWs, 'typeof RUNTIME !== "undefined"');
    console.log('Has RUNTIME:', hasRuntime);

    if (hasRuntime) {
        const runtimeRepeats = await executeInTarget(pageWs, 'RUNTIME.repeats || "not set"');
        console.log('RUNTIME.repeats:', runtimeRepeats);
    }

    // Send zi command
    console.log('\nSending zi command...');
    await sendKey(pageWs, 'z', 50);
    await sendKey(pageWs, 'i');
    console.log('Keys sent');

    // Wait and check
    await new Promise(resolve => setTimeout(resolve, 1000));

    const afterZoom = await getZoom(bgWs, tabId);
    console.log('After zi:', afterZoom);
    console.log('Changed:', afterZoom !== initialZoom);
    console.log('Difference:', afterZoom - initialZoom);

    // Cleanup
    await closeTab(bgWs, tabId);
    await closeCDP(pageWs);
    await closeCDP(bgWs);
}

main().catch(console.error);

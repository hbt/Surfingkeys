/**
 * Debug script to test ;di command manually
 */

import WebSocket from 'ws';
import {
    checkCDPAvailable,
    findExtensionBackground,
    findContentPage,
    connectToCDP,
    createTab,
    closeTab,
    closeCDP,
    executeInTarget
} from '../tests/cdp/utils/cdp-client';
import {
    sendKey,
    clickAt,
    enableInputDomain,
    waitForSurfingkeysReady,
    waitFor
} from '../tests/cdp/utils/browser-actions';
import { CDP_PORT } from '../tests/cdp/cdp-config';

async function main() {
    // Check CDP
    const cdpAvailable = await checkCDPAvailable();
    if (!cdpAvailable) {
        throw new Error(`CDP not available on port ${CDP_PORT}`);
    }

    // Connect to background
    const bgInfo = await findExtensionBackground();
    const bgWs = await connectToCDP(bgInfo.wsUrl);

    // Create tab
    const tabId = await createTab(bgWs, 'http://127.0.0.1:9873/image-test.html', true);
    console.log('Created tab:', tabId);

    // Find and connect to page
    await new Promise(resolve => setTimeout(resolve, 1000));
    const pageWsUrl = await findContentPage('127.0.0.1:9873/image-test.html');
    const pageWs = await connectToCDP(pageWsUrl);

    // Enable Input
    enableInputDomain(pageWs);

    // Wait for page
    await waitForSurfingkeysReady(pageWs);

    // Check images
    const imgCount = await executeInTarget(pageWs, `document.querySelectorAll('img').length`);
    console.log('Image count:', imgCount);

    // Click and send keys
    await clickAt(pageWs, 100, 100);
    console.log('Clicked at 100,100');

    await sendKey(pageWs, ';', 50);
    console.log('Sent ;');
    await new Promise(resolve => setTimeout(resolve, 200));

    await sendKey(pageWs, 'd', 50);
    console.log('Sent d');
    await new Promise(resolve => setTimeout(resolve, 200));

    await sendKey(pageWs, 'i', 50);
    console.log('Sent i');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check for hints
    const hintsHost = await executeInTarget(pageWs, `
        (function() {
            const hintsHost = document.querySelector('.surfingkeys_hints_host');
            if (!hintsHost) return { found: false };
            if (!hintsHost.shadowRoot) return { found: true, hasShadowRoot: false };
            const divs = Array.from(hintsHost.shadowRoot.querySelectorAll('div'));
            return {
                found: true,
                hasShadowRoot: true,
                divCount: divs.length,
                sample: divs.slice(0, 5).map(d => d.textContent?.trim())
            };
        })()
    `);

    console.log('Hints result:', JSON.stringify(hintsHost, null, 2));

    // Cleanup
    await closeTab(bgWs, tabId);
    await closeCDP(pageWs);
    await closeCDP(bgWs);
}

main().catch(console.error);

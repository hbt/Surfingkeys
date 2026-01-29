/**
 * Debug script to test mouseout hints creation
 */

import WebSocket from 'ws';
import {
    checkCDPAvailable,
    findExtensionBackground,
    findContentPage,
    connectToCDP,
    createTab,
    executeInTarget
} from '../tests/cdp/utils/cdp-client';
import { sendKey, enableInputDomain, waitForSurfingkeysReady } from '../tests/cdp/utils/browser-actions';
import { CDP_PORT } from '../tests/cdp/cdp-config';

async function main() {
    console.log('Starting mouseout hints debug...');

    // Check CDP
    const cdpAvailable = await checkCDPAvailable();
    if (!cdpAvailable) {
        throw new Error(`CDP not available on port ${CDP_PORT}`);
    }

    // Connect to background
    const bgInfo = await findExtensionBackground();
    const bgWs = await connectToCDP(bgInfo.wsUrl);

    // Create tab
    const tabId = await createTab(bgWs, 'http://127.0.0.1:9873/mouseout-test.html', true);
    console.log(`Created tab: ${tabId}`);

    // Connect to page
    const pageWsUrl = await findContentPage('127.0.0.1:9873/mouseout-test.html');
    const pageWs = await connectToCDP(pageWsUrl);

    // Enable Input
    enableInputDomain(pageWs);

    // Wait for Surfingkeys
    await waitForSurfingkeysReady(pageWs);
    console.log('Surfingkeys ready');

    // Click page to focus
    await executeInTarget(pageWs, `
        document.elementFromPoint(100, 100).click();
    `);

    console.log('Sending Control+j...');
    await sendKey(pageWs, 'Control+j');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check for hints
    const result = await executeInTarget(pageWs, `
        (function() {
            const hintsHost = document.querySelector('.surfingkeys_hints_host');
            if (!hintsHost || !hintsHost.shadowRoot) {
                return { found: false, error: 'No hints host or shadowRoot' };
            }

            const hintDivs = Array.from(hintsHost.shadowRoot.querySelectorAll('div'));
            return {
                found: true,
                totalDivs: hintDivs.length,
                hintsHostExists: !!hintsHost,
                shadowRootExists: !!hintsHost.shadowRoot,
                shadowRootChildCount: hintsHost.shadowRoot.children.length
            };
        })()
    `);

    console.log('Result:', JSON.stringify(result, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

/**
 * Debug script: Test visual mode click functionality
 *
 * Purpose: Diagnose why visual mode click tests are failing
 *
 * Usage:
 *   npm run debug:cdp:live debug/test-visual-click.ts
 */

import {
    findExtensionBackground,
    findContentPage,
    connectToCDP,
    createTab,
    closeTab,
    closeCDP,
    executeInTarget
} from '../tests/cdp/utils/cdp-client';
import { sendKey, enableInputDomain, waitForSurfingkeysReady } from '../tests/cdp/utils/browser-actions';

async function main() {
    console.log('=== Visual Click Debug Script ===\n');

    // Connect to background
    const bgInfo = await findExtensionBackground();
    const bgWs = await connectToCDP(bgInfo.wsUrl);

    // Create test tab
    const FIXTURE_URL = 'http://127.0.0.1:9873/visual-test.html';
    const tabId = await createTab(bgWs, FIXTURE_URL, true);
    console.log(`Created tab ${tabId} with ${FIXTURE_URL}`);

    // Connect to page
    const pageWsUrl = await findContentPage('127.0.0.1:9873/visual-test.html');
    const pageWs = await connectToCDP(pageWsUrl);
    enableInputDomain(pageWs);
    await waitForSurfingkeysReady(pageWs);
    console.log('Connected to page and Surfingkeys ready\n');

    // Check if text exists
    console.log('Step 1: Finding text "Click this link"...');
    const found = await executeInTarget(pageWs, `
        (function() {
            const found = window.find('Click this link', false, false, false, false, true, false);
            console.log('[DEBUG] window.find result:', found);
            const sel = window.getSelection();
            console.log('[DEBUG] Selection after find:', {
                type: sel.type,
                text: sel.toString(),
                rangeCount: sel.rangeCount,
                focusNode: sel.focusNode ? sel.focusNode.textContent.substring(0, 30) : null
            });
            return found;
        })()
    `);
    console.log(`  window.find() result: ${found}\n`);

    await new Promise(resolve => setTimeout(resolve, 200));

    // Enter visual mode
    console.log('Step 2: Entering visual mode with "v" key...');
    await sendKey(pageWs, 'v');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check visual mode state
    const visualState = await executeInTarget(pageWs, `
        (function() {
            const sel = window.getSelection();
            const cursor = document.querySelector('.surfingkeys_cursor');
            return {
                hasSelection: sel.rangeCount > 0,
                selectionType: sel.type,
                selectionText: sel.toString(),
                cursorExists: cursor !== null,
                focusNode: sel.focusNode ? {
                    text: sel.focusNode.textContent ? sel.focusNode.textContent.substring(0, 50) : null,
                    nodeType: sel.focusNode.nodeType,
                    nodeName: sel.focusNode.nodeName,
                    parentNodeName: sel.focusNode.parentNode ? sel.focusNode.parentNode.nodeName : null
                } : null
            };
        })()
    `);
    console.log('  Visual mode state:', JSON.stringify(visualState, null, 2), '\n');

    // Send Enter key
    console.log('Step 3: Sending Enter key...');
    await sendKey(pageWs, 'Enter');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check hash
    const hash = await executeInTarget(pageWs, 'window.location.hash');
    console.log(`  Hash after Enter: "${hash}"`);

    // Check if any navigation occurred
    const url = await executeInTarget(pageWs, 'window.location.href');
    console.log(`  Current URL: ${url}\n`);

    // Cleanup
    await closeTab(bgWs, tabId);
    await closeCDP(pageWs);
    await closeCDP(bgWs);

    console.log('=== Debug Complete ===');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

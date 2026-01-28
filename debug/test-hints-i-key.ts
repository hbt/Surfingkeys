/**
 * Debug script to test if 'I' key creates hints for input elements
 */

import * as WebSocket from 'ws';
import {
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

async function main() {
    console.log('=== Testing I key for hints ===\n');

    // Connect to background
    const bgInfo = await findExtensionBackground();
    const bgWs = await connectToCDP(bgInfo.wsUrl);
    console.log('Connected to background:', bgInfo.extensionId);

    // Create test tab
    const FIXTURE_URL = 'http://127.0.0.1:9873/input-test.html';
    const tabId = await createTab(bgWs, FIXTURE_URL, true);
    console.log('Created tab:', tabId, FIXTURE_URL);

    // Wait a bit for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Find and connect to content page
    const pageWsUrl = await findContentPage('127.0.0.1:9873/input-test.html');
    const pageWs = await connectToCDP(pageWsUrl);
    console.log('Connected to page');

    // Enable Input domain
    enableInputDomain(pageWs);

    // Wait for Surfingkeys to be ready
    await waitForSurfingkeysReady(pageWs);
    console.log('Surfingkeys ready');

    // Count input elements
    const inputCount = await executeInTarget(pageWs, `
        document.querySelectorAll('input:not([type=submit]):not([disabled]):not([readonly])').length
    `);
    console.log('Input elements on page:', inputCount);

    // Test 1: Press 'f' key to see if hints work at all
    console.log('\nTest 1: Pressing "f" key...');
    await clickAt(pageWs, 100, 100);
    await sendKey(pageWs, 'f');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const fHints = await executeInTarget(pageWs, `
        (function() {
            const hintsHost = document.querySelector('.surfingkeys_hints_host');
            if (!hintsHost || !hintsHost.shadowRoot) {
                return { found: false, count: 0 };
            }
            const hintElements = Array.from(hintsHost.shadowRoot.querySelectorAll('div'));
            const hintDivs = hintElements.filter(d => {
                const text = (d.textContent || '').trim();
                return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
            });
            return { found: true, count: hintDivs.length };
        })()
    `);
    console.log('Hints after "f":', fHints);

    // Clear hints
    await sendKey(pageWs, 'Escape');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 2: Press 'I' key
    console.log('\nTest 2: Pressing "I" key...');
    await clickAt(pageWs, 100, 100);
    await sendKey(pageWs, 'I');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const iHints = await executeInTarget(pageWs, `
        (function() {
            const hintsHost = document.querySelector('.surfingkeys_hints_host');
            if (!hintsHost || !hintsHost.shadowRoot) {
                return { found: false, count: 0 };
            }
            const hintElements = Array.from(hintsHost.shadowRoot.querySelectorAll('div'));
            const hintDivs = hintElements.filter(d => {
                const text = (d.textContent || '').trim();
                return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
            });
            return { found: true, count: hintDivs.length };
        })()
    `);
    console.log('Hints after "I":', iHints);

    // Test 3: Try lowercase 'i' for comparison
    await sendKey(pageWs, 'Escape');
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('\nTest 3: Pressing "i" key...');
    await clickAt(pageWs, 100, 100);
    await sendKey(pageWs, 'i');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const loweriHints = await executeInTarget(pageWs, `
        (function() {
            const hintsHost = document.querySelector('.surfingkeys_hints_host');
            if (!hintsHost || !hintsHost.shadowRoot) {
                return { found: false, count: 0 };
            }
            const hintElements = Array.from(hintsHost.shadowRoot.querySelectorAll('div'));
            const hintDivs = hintElements.filter(d => {
                const text = (d.textContent || '').trim();
                return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
            });
            return { found: true, count: hintDivs.length };
        })()
    `);
    console.log('Hints after "i":', loweriHints);

    // Cleanup
    await closeTab(bgWs, tabId);
    await closeCDP(pageWs);
    await closeCDP(bgWs);

    console.log('\n=== Test complete ===');
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});

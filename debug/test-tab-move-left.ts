/**
 * Quick debug script to test << (move tab left) command
 */

import WebSocket from 'ws';
import {
    checkCDPAvailable,
    findExtensionBackground,
    findContentPage,
    connectToCDP,
    createTab,
    executeInTarget,
    closeCDP
} from '../tests/cdp/utils/cdp-client';
import {
    sendKey,
    enableInputDomain,
    waitForSurfingkeysReady
} from '../tests/cdp/utils/browser-actions';

async function main() {
    console.log('=== Testing << (move tab left) command ===\n');

    // Connect to background
    const bgInfo = await findExtensionBackground();
    const bgWs = await connectToCDP(bgInfo.wsUrl);

    // Create 3 tabs
    const tabIds: number[] = [];
    for (let i = 0; i < 3; i++) {
        const tabId = await createTab(bgWs, 'http://127.0.0.1:9873/scroll-test.html', i === 1);
        tabIds.push(tabId);
        console.log(`Created tab ${i}: id=${tabId}`);
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Connect to active tab
    const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
    const pageWs = await connectToCDP(pageWsUrl);
    enableInputDomain(pageWs);
    await waitForSurfingkeysReady(pageWs);

    // Get initial tab state
    const initialTab = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve({ id: tabs[0].id, index: tabs[0].index });
            });
        })
    `);
    console.log(`\nInitial active tab: id=${initialTab.id}, index=${initialTab.index}`);

    // Send << command
    console.log('\nSending << command...');
    await sendKey(pageWs, '<', 50);
    await sendKey(pageWs, '<');
    console.log('Command sent');

    // Wait and check
    await new Promise(resolve => setTimeout(resolve, 1000));

    const finalTab = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.get(${initialTab.id}, (tab) => {
                resolve({ id: tab.id, index: tab.index });
            });
        })
    `);
    console.log(`\nFinal tab state: id=${finalTab.id}, index=${finalTab.index}`);
    console.log(`Index changed: ${initialTab.index} -> ${finalTab.index}`);
    console.log(`Expected: ${initialTab.index - 1}, Actual: ${finalTab.index}`);

    if (finalTab.index === initialTab.index - 1) {
        console.log('\n✓ SUCCESS: Tab moved left by 1 position');
    } else {
        console.log('\n✗ FAILED: Tab did not move as expected');
    }

    await closeCDP(pageWs);
    await closeCDP(bgWs);
}

main().catch(console.error);

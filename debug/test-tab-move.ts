/**
 * Debug script to test tab move functionality
 */

import {
    checkCDPAvailable,
    findExtensionBackground,
    connectToCDP,
    executeInTarget,
    createTab,
    closeCDP
} from '../tests/cdp/utils/cdp-client';

async function main() {
    console.log('[DEBUG] Testing tab move functionality...');

    // Connect to background
    const bgInfo = await findExtensionBackground();
    const bgWs = await connectToCDP(bgInfo.wsUrl);

    // Create 3 test tabs
    console.log('[DEBUG] Creating test tabs...');
    const tab1 = await createTab(bgWs, 'http://127.0.0.1:9873/scroll-test.html', false);
    await new Promise(resolve => setTimeout(resolve, 200));
    const tab2 = await createTab(bgWs, 'http://127.0.0.1:9873/scroll-test.html', true); // Active
    await new Promise(resolve => setTimeout(resolve, 200));
    const tab3 = await createTab(bgWs, 'http://127.0.0.1:9873/scroll-test.html', false);
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`[DEBUG] Created tabs: ${tab1}, ${tab2}, ${tab3}`);

    // Get initial state
    const initialState = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.map(t => ({ id: t.id, index: t.index, active: t.active })));
            });
        })
    `);
    console.log('[DEBUG] Initial tab state:', JSON.stringify(initialState, null, 2));

    // Manually call moveTab action
    console.log('[DEBUG] Calling moveTab action with step=1, repeats=1...');
    const moveResult = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            const message = { action: 'moveTab', step: 1, repeats: 1 };
            const sender = { tab: { id: ${tab2}, index: ${initialState.find((t: any) => t.id === tab2).index}, windowId: chrome.windows.WINDOW_ID_CURRENT } };

            chrome.tabs.get(${tab2}, (tab) => {
                sender.tab.windowId = tab.windowId;
                sender.tab.index = tab.index;

                chrome.tabs.query({ windowId: tab.windowId }, (tabs) => {
                    const to = Math.min(Math.max(0, sender.tab.index + message.step * message.repeats), tabs.length);
                    console.log('Moving tab', sender.tab.id, 'from index', sender.tab.index, 'to index', to);
                    chrome.tabs.move(sender.tab.id, { index: to }, (movedTab) => {
                        resolve({ success: true, movedTab: movedTab ? { id: movedTab.id, index: movedTab.index } : null });
                    });
                });
            });
        })
    `);
    console.log('[DEBUG] Move result:', JSON.stringify(moveResult, null, 2));

    // Wait for move to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get final state
    const finalState = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.map(t => ({ id: t.id, index: t.index, active: t.active })));
            });
        })
    `);
    console.log('[DEBUG] Final tab state:', JSON.stringify(finalState, null, 2));

    // Cleanup
    await closeCDP(bgWs);
    console.log('[DEBUG] Test complete');
}

main().catch(console.error);

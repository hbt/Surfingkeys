/**
 * Test: Can we read/write chrome.storage.local in headless CDP?
 *
 * Simple verification that storage read/write works
 */

import WebSocket from 'ws';
import {
    checkCDPAvailable,
    findExtensionBackground,
    connectToCDP,
    closeCDP,
    executeInTarget
} from '../utils/cdp-client';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('Storage Read/Write Test', () => {
    let bgWs: WebSocket;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    beforeAll(async () => {
        console.log('[storage-test] beforeAll: Starting...');
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`CDP not available on port ${CDP_PORT}`);
        }

        const bgInfo = await findExtensionBackground();
        console.log('[storage-test] beforeAll: Found background service worker');
        bgWs = await connectToCDP(bgInfo.wsUrl);
        console.log('[storage-test] beforeAll: Connected to background via CDP');

        // Start V8 coverage collection
        try {
            await startCoverage(bgWs, 'background');
            console.log('[storage-test] beforeAll: Coverage started successfully');
        } catch (e) {
            console.log('[storage-test] beforeAll: Coverage start failed (will continue):', e);
        }
    });

    beforeEach(async () => {
        // Capture test name
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(bgWs);
    });

    afterEach(async () => {
        // Capture coverage snapshot after test and calculate delta
        await captureAfterCoverage(bgWs, currentTestName, beforeCovData);
    });

    afterAll(async () => {
        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('write showAdvanced=true to storage', async () => {
        console.log('[storage-test] Test 1 START: write showAdvanced=true');
        try {
            const result = await executeInTarget(bgWs, `
                new Promise((resolve, reject) => {
                    chrome.storage.local.set({ showAdvanced: true }, () => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve({ success: true });
                        }
                    });
                })
            `);

            console.log(`[storage-test] Test 1 SUCCESS: Write result: ${JSON.stringify(result)}`);
            expect(result.success).toBe(true);
        } catch (e) {
            console.log(`[storage-test] Test 1 FAILED: ${e}`);
            throw e;
        }
    });

    test('read showAdvanced from storage', async () => {
        console.log('[storage-test] Test 2 START: read showAdvanced');
        try {
            const result = await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.storage.local.get('showAdvanced', (data) => {
                        resolve({
                            stored: data.showAdvanced,
                            type: typeof data.showAdvanced
                        });
                    });
                })
            `);

            console.log(`[storage-test] Test 2 SUCCESS: Read result: ${JSON.stringify(result)}`);
            expect(result.stored).toBe(true);
            console.log(`✓ showAdvanced value: ${result.stored}`);
        } catch (e) {
            console.log(`[storage-test] Test 2 FAILED: ${e}`);
            throw e;
        }
    });

    test('write and read localPath', async () => {
        console.log('[storage-test] Test 3 START: write and read localPath');
        const testUrl = 'http://127.0.0.1:9874/test-config.js';

        try {
            // Write
            console.log('[storage-test] Test 3: Writing localPath...');
            const writeResult = await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.storage.local.set({ localPath: '${testUrl}' }, () => {
                        resolve({ success: true });
                    });
                })
            `);
            console.log(`[storage-test] Test 3: Write localPath: ${JSON.stringify(writeResult)}`);
            expect(writeResult.success).toBe(true);

            // Read
            console.log('[storage-test] Test 3: Reading localPath...');
            const readResult = await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.storage.local.get('localPath', (data) => {
                        resolve({
                            stored: data.localPath
                        });
                    });
                })
            `);
            console.log(`[storage-test] Test 3 SUCCESS: Read localPath: ${JSON.stringify(readResult)}`);
            expect(readResult.stored).toBe(testUrl);
            console.log(`✓ localPath value: ${readResult.stored}`);
        } catch (e) {
            console.log(`[storage-test] Test 3 FAILED: ${e}`);
            throw e;
        }
    });
});

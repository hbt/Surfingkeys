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
import { CDP_PORT } from '../cdp-config';

describe('Storage Read/Write Test', () => {
    let bgWs: WebSocket;

    beforeAll(async () => {
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`CDP not available on port ${CDP_PORT}`);
        }

        const bgInfo = await findExtensionBackground();
        bgWs = await connectToCDP(bgInfo.wsUrl);
    });

    afterAll(async () => {
        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('write showAdvanced=true to storage', async () => {
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

        console.log(`Write result: ${JSON.stringify(result)}`);
        expect(result.success).toBe(true);
    });

    test('read showAdvanced from storage', async () => {
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

        console.log(`Read result: ${JSON.stringify(result)}`);
        expect(result.stored).toBe(true);
        console.log(`✓ showAdvanced value: ${result.stored}`);
    });

    test('write and read localPath', async () => {
        const testUrl = 'http://127.0.0.1:9874/test-config.js';

        // Write
        const writeResult = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.storage.local.set({ localPath: '${testUrl}' }, () => {
                    resolve({ success: true });
                });
            })
        `);
        console.log(`Write localPath: ${JSON.stringify(writeResult)}`);
        expect(writeResult.success).toBe(true);

        // Read
        const readResult = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.storage.local.get('localPath', (data) => {
                    resolve({
                        stored: data.localPath
                    });
                });
            })
        `);
        console.log(`Read localPath: ${JSON.stringify(readResult)}`);
        expect(readResult.stored).toBe(testUrl);
        console.log(`✓ localPath value: ${readResult.stored}`);
    });
});

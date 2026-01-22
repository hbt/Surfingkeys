/**
 * Config Injection Debug Test
 *
 * Simple test to verify config injection mechanism works
 */

import WebSocket from 'ws';
import {
    checkCDPAvailable,
    findExtensionBackground,
    connectToCDP,
    closeCDP,
    executeInTarget
} from './utils/cdp-client';
import { injectSettings } from './utils/config-injector';
import { CDP_PORT } from './cdp-config';

describe('Config Injection Debug', () => {
    let bgWs: WebSocket;

    beforeAll(async () => {
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`CDP not available on port ${CDP_PORT}`);
        }

        const bgInfo = await findExtensionBackground();
        bgWs = await connectToCDP(bgInfo.wsUrl);
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    afterAll(async () => {
        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('should read default scrollStepSize via getSettings', async () => {
        const result = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'getSettings',
                    key: 'RAW'
                }, (response) => {
                    resolve(response.conf?.scrollStepSize);
                });
            })
        `);
        console.log('Default scrollStepSize:', result);
        expect(result).toBe(70);
    });

    test('should inject scrollStepSize=25', async () => {
        const result = await injectSettings(bgWs, {
            scrollStepSize: 25
        });
        console.log('Injection result:', JSON.stringify(result, null, 2));
        expect(result.success).toBe(true);
        expect(result.applied).toBe(true);
    });

    test('should verify injected value', async () => {
        const scrollStepSize = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'getSettings',
                    key: 'RAW'
                }, (response) => {
                    resolve(response.conf?.scrollStepSize);
                });
            })
        `);
        console.log('After injection scrollStepSize:', scrollStepSize);
        expect(scrollStepSize).toBe(25);
    });
});

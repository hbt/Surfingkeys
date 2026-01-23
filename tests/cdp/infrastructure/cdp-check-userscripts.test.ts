/**
 * Check if chrome.userScripts API is available in headless mode
 *
 * This API is required for showAdvanced mode and config file execution
 */

import WebSocket from 'ws';
import {
    checkCDPAvailable,
    findExtensionBackground,
    connectToCDP,
    closeCDP,
    executeInTarget
} from '../utils/cdp-client';
import { setupPerTestCoverageHooks } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('chrome.userScripts API Check', () => {
    let bgWs: WebSocket;

    beforeAll(async () => {
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`CDP not available on port ${CDP_PORT}`);
        }

        const bgInfo = await findExtensionBackground();
        bgWs = await connectToCDP(bgInfo.wsUrl);
    });

    const coverageHooks = setupPerTestCoverageHooks(bgWs);
    beforeEach(coverageHooks.beforeEach);
    afterEach(coverageHooks.afterEach);

    afterAll(async () => {
        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('check if chrome.userScripts exists', async () => {
        const result = await executeInTarget(bgWs, `
            (typeof chrome.userScripts !== 'undefined') ? 'available' : 'not_available'
        `);

        console.log(`chrome.userScripts: ${result}`);

        if (result === 'not_available') {
            console.log(`❌ chrome.userScripts NOT available`);
            console.log(`This means Developer mode is NOT enabled in headless Chrome`);
            console.log(`Config files cannot be executed without this API`);
        } else {
            console.log(`✓ chrome.userScripts IS available`);
            console.log(`Developer mode appears to be enabled`);
        }

        expect(result).toBe('available');
    });

    test('check isUserScriptsAvailable function', async () => {
        const result = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                try {
                    if (chrome.userScripts) {
                        resolve('available');
                    } else {
                        resolve('not_available');
                    }
                } catch {
                    resolve('error');
                }
            })
        `);

        console.log(`isUserScriptsAvailable check: ${result}`);
        expect(result).toBe('available');
    });
});

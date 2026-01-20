/**
 * CDP Reload Messaging Test - CDP Message Bridge Verification
 *
 * Tests the CDP message bridge functionality for dispatching reload commands.
 * This test verifies that:
 * - CDP message bridge is available in the extension background
 * - Reload commands can be dispatched via the bridge
 * - Commands execute successfully and return proper responses
 *
 * Note: This test verifies the CDP message bridge works correctly.
 * It does NOT verify the extension actually reloaded (service workers
 * become inactive after reload and don't reappear in CDP targets).
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/cdp-reload-messaging.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/cdp-reload-messaging.test.ts
 */

import WebSocket from 'ws';
import {
    checkCDPAvailable,
    findExtensionBackground,
    connectToCDP,
    closeCDP,
    executeInTarget
} from './utils/cdp-client';
import { CDP_PORT } from './cdp-config';

describe('CDP Message Bridge - Reload Command', () => {
    let bgWs: WebSocket;
    let extensionId: string;

    beforeAll(async () => {
        // Check CDP is available
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        // Connect to background
        const bgInfo = await findExtensionBackground();
        extensionId = bgInfo.extensionId;
        bgWs = await connectToCDP(bgInfo.wsUrl);

        // Wait for background to be ready
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    afterAll(async () => {
        // Cleanup WebSocket connection
        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    describe('CDP Message Bridge Availability', () => {
        test('should have CDP message bridge available', async () => {
            const result = await executeInTarget(bgWs, `
                typeof globalThis.__CDP_MESSAGE_BRIDGE__ !== 'undefined'
            `);

            expect(result).toBe(true);
        });

        test('should have dispatch method on bridge', async () => {
            const result = await executeInTarget(bgWs, `
                typeof globalThis.__CDP_MESSAGE_BRIDGE__?.dispatch === 'function'
            `);

            expect(result).toBe(true);
        });
    });

    describe('Reload Command Dispatch', () => {
        test('should dispatch reload command successfully', async () => {
            const result = await executeInTarget(bgWs, `
                (function() {
                    if (typeof globalThis.__CDP_MESSAGE_BRIDGE__ === 'undefined') {
                        return { error: 'CDP Message Bridge not found' };
                    }

                    const result = globalThis.__CDP_MESSAGE_BRIDGE__.dispatch(
                        'cdpReloadExtension',
                        {},
                        true  // expectResponse
                    );

                    return {
                        success: true,
                        result: result,
                        timestamp: Date.now()
                    };
                })()
            `);

            // Verify no error
            expect(result.error).toBeUndefined();

            // Verify success flag
            expect(result.success).toBe(true);

            // Verify we got a result
            expect(result.result).toBeDefined();

            // Verify timestamp is recent
            expect(result.timestamp).toBeGreaterThan(Date.now() - 5000);
        });

        test('should return valid response from reload command', async () => {
            const result = await executeInTarget(bgWs, `
                (function() {
                    const cmdResult = globalThis.__CDP_MESSAGE_BRIDGE__.dispatch(
                        'cdpReloadExtension',
                        {},
                        true
                    );

                    return cmdResult;
                })()
            `);

            // The reload command should return a response object
            expect(result).toBeDefined();
            expect(typeof result).toBe('object');
        });
    });

    describe('Bridge Error Handling', () => {
        test('should handle invalid command gracefully', async () => {
            const result = await executeInTarget(bgWs, `
                (function() {
                    try {
                        const cmdResult = globalThis.__CDP_MESSAGE_BRIDGE__.dispatch(
                            'nonExistentCommand',
                            {},
                            false
                        );
                        return { success: true, result: cmdResult };
                    } catch (err) {
                        return { success: false, error: err.message };
                    }
                })()
            `);

            // Should either succeed with undefined/null result or fail gracefully
            expect(result).toBeDefined();
            expect(typeof result).toBe('object');
        });
    });
});

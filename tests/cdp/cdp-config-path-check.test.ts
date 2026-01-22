/**
 * Simple test to check if config server can find fixture files
 */

import { startConfigServer, stopConfigServer } from './utils/config-server';

describe('Config Server Path Check', () => {
    test('should find cdp-scrollstepsize-config.js fixture', async () => {
        try {
            const url = await startConfigServer(9874, 'cdp-scrollstepsize-config.js');
            console.log(`✓ Config server started: ${url}`);
            await stopConfigServer();
        } catch (error: any) {
            console.error(`✗ Error: ${error.message}`);
            throw error;
        }
    });
});

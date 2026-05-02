import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/playwright',
    reporter: [
        ['dot'],
        ...(process.env.PLAYWRIGHT_JSON_OUTPUT
            ? ([['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT }]] as const)
            : []),
    ],
    workers: 1,
    retries: 2,
    timeout: 30_000,
    use: {
        trace: 'off',
    },
    webServer: [
        {
            command: 'node tests/fixtures-server.js',
            port: 9873,
            reuseExistingServer: true,
        },
        // Set CONFIG_SERVER=false to test the server-down path (e.g. banner warning)
        ...(process.env.CONFIG_SERVER !== 'false' ? [{
            command: 'bun scripts/server.ts',
            port: 9600,
            reuseExistingServer: true,
        }] : []),
    ],
});

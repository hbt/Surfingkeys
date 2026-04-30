import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/playwright',
    workers: 1,
    retries: 2,
    timeout: 30_000,
    use: {
        trace: 'off',
    },
    webServer: {
        command: 'node tests/fixtures-server.js',
        port: 9873,
        reuseExistingServer: true,
    },
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/playwright/scratch',
    outputDir: 'test-artifacts/results',
    reporter: [['dot']],
    workers: 1,
    projects: [{ name: '' }],
    retries: 0,
    timeout: 30_000,
    use: { trace: 'off' },
    webServer: [
        {
            command: 'node tests/fixtures-server.js',
            port: 9873,
            reuseExistingServer: true,
        },
        {
            command: 'PORT=9602 CONFIG_FILE=data/fixtures/test-config-server.js bun scripts/server.ts',
            port: 9602,
            reuseExistingServer: true,
        },
        {
            command: 'PORT=9601 bun scripts/server.ts',
            port: 9601,
            reuseExistingServer: true,
        },
    ],
});

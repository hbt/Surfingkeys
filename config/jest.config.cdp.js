/**
 * Jest Configuration for CDP Tests
 *
 * Separate config for CDP/integration tests that run against live Chrome instances.
 * Unlike the main jest.config.js (jsdom), these tests run in Node environment
 * and interact with real Chrome via CDP.
 */

module.exports = {
    // Set root directory to project root (one level up from config/)
    rootDir: '..',

    // Use node environment (not jsdom)
    testEnvironment: 'node',

    // Match CDP test files
    testMatch: [
        '<rootDir>/tests/cdp/**/*.test.ts'
    ],

    // TypeScript support
    preset: 'ts-jest',
    globals: {
        'ts-jest': {
            tsconfig: {
                esModuleInterop: true,
                allowSyntheticDefaultImports: true,
                types: ['jest', 'node']
            }
        }
    },

    // Longer timeouts for browser operations
    testTimeout: 30000,

    // Clear mocks between tests
    clearMocks: true,

    // No coverage for now (CDP tests are integration tests)
    collectCoverage: false,

    // Setup files
    setupFilesAfterEnv: ['<rootDir>/tests/cdp/jest.setup.js'],

    // Module paths
    moduleDirectories: ['node_modules', '<rootDir>'],

    // Verbose output
    verbose: true,

    // Run tests serially (not parallel) to avoid port conflicts
    maxWorkers: 1,

    // Detect open handles (helps catch unclosed WebSocket connections)
    detectOpenHandles: true,

    // Force exit after tests complete
    forceExit: true
};

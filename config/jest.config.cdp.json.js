/**
 * Jest Configuration for CDP Tests with JSON Reporter
 *
 * This is a variant of jest.config.cdp.js that uses our custom JSON reporter
 * for structured test output.
 *
 * Usage:
 *   jest --config=config/jest.config.cdp.json.js tests/cdp/commands/cdp-create-hints.test.ts
 */

const baseConfig = require('./jest.config.cdp.js');
const path = require('path');

module.exports = {
    ...baseConfig,

    // Use our custom JSON reporter instead of default reporters
    reporters: [
        path.join(__dirname, '../tests/reporters/json-reporter.js')
    ],

    // Disable verbose output since JSON reporter handles it
    verbose: false
};

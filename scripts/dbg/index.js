#!/usr/bin/env node
/**
 * Debug Command Controller
 *
 * Provides a clean interface for common debugging operations.
 * Actions are independent and self-contained (no dependencies on debug/ directory).
 *
 * Usage:
 *   bin/dbg <action> [options]
 *   bin/dbg                       (show help)
 *
 * Actions:
 *   reload              Reload the extension using multiple fallback methods
 *   clear-errors        Clear all stored extension errors
 *   errors-clear        Clear all stored extension errors (alias)
 *   errors-list         List all stored extension errors
 *   open-background     Open background service worker DevTools console
 *
 * Examples:
 *   bin/dbg reload
 *   bin/dbg reload | jq .
 *   bin/dbg errors-list
 *   bin/dbg errors-clear
 */

const fs = require('fs');
const path = require('path');

// Color utilities
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m'
};

// Available actions with descriptions
const ACTIONS = {
    'reload': 'Reload the extension using multiple fallback methods',
    'config-set': 'Set external config file path in chrome.storage.local',
    'clear-errors': 'Clear all stored extension errors',
    'errors-clear': 'Clear all stored extension errors (alias)',
    'errors-list': 'List all stored extension errors',
    'open-background': 'Open background service worker DevTools console'
};

/**
 * Display help message
 */
function showHelp() {
    console.log(`${colors.bright}Debug Command Controller${colors.reset}\n`);
    console.log(`${colors.dim}Provides a clean interface for common debugging operations.${colors.reset}\n`);

    console.log(`${colors.cyan}Usage:${colors.reset}`);
    console.log(`  bin/dbg <action> [options]`);
    console.log(`  bin/dbg                  ${colors.dim}(show this help)${colors.reset}\n`);

    console.log(`${colors.cyan}Actions:${colors.reset}`);
    Object.entries(ACTIONS).forEach(([action, description]) => {
        console.log(`  ${colors.green}${action.padEnd(20)}${colors.reset} ${description}`);
    });

    console.log(`\n${colors.cyan}Examples:${colors.reset}`);
    console.log(`  bin/dbg reload`);
    console.log(`  bin/dbg reload | jq .    ${colors.dim}(JSON output)${colors.reset}`);
    console.log(`  bin/dbg errors-list`);
    console.log(`  bin/dbg errors-clear\n`);
}

/**
 * Main controller
 */
async function main() {
    const args = process.argv.slice(2);

    // Show help if requested or no arguments
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        showHelp();
        process.exit(0);
    }

    const action = args[0];

    // Validate action
    if (!ACTIONS[action]) {
        console.error(`${colors.red}Error: Unknown action "${action}"${colors.reset}\n`);
        console.log(`Available actions: ${Object.keys(ACTIONS).join(', ')}\n`);
        console.log(`Run ${colors.cyan}npm run dbg --help${colors.reset} for more information.\n`);
        process.exit(1);
    }

    // Load and execute action
    const actionPath = path.join(__dirname, 'actions', `${action}.js`);

    if (!fs.existsSync(actionPath)) {
        console.error(`${colors.red}Error: Action file not found: ${actionPath}${colors.reset}\n`);
        process.exit(1);
    }

    try {
        const actionModule = require(actionPath);
        const actionArgs = args.slice(1);
        await actionModule.run(actionArgs);
    } catch (error) {
        // Actions output JSON on their own, so just exit with error code
        console.error(JSON.stringify({
            success: false,
            error: `Failed to execute action: ${error.message}`
        }));
        process.exit(1);
    }
}

// Run controller
main();

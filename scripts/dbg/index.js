#!/usr/bin/env node
/**
 * Debug Command Controller
 *
 * Provides a clean interface for common debugging operations.
 * Actions are independent and self-contained (no dependencies on debug/ directory).
 *
 * Usage:
 *   npm run dbg <action> [options]
 *   npm run dbg                       (show help)
 *
 * Actions:
 *   reload              Reload the extension using multiple fallback methods
 *   clear-errors        Clear all stored extension errors
 *   open-background     Open background service worker DevTools console
 *
 * Examples:
 *   npm run dbg reload
 *   npm run dbg clear-errors
 *   npm run dbg open-background
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
    'clear-errors': 'Clear all stored extension errors',
    'open-background': 'Open background service worker DevTools console'
};

/**
 * Display help message
 */
function showHelp() {
    console.log(`${colors.bright}Debug Command Controller${colors.reset}\n`);
    console.log(`${colors.dim}Provides a clean interface for common debugging operations.${colors.reset}\n`);

    console.log(`${colors.cyan}Usage:${colors.reset}`);
    console.log(`  npm run dbg <action> [options]`);
    console.log(`  npm run dbg              ${colors.dim}(show this help)${colors.reset}\n`);

    console.log(`${colors.cyan}Actions:${colors.reset}`);
    Object.entries(ACTIONS).forEach(([action, description]) => {
        console.log(`  ${colors.green}${action.padEnd(20)}${colors.reset} ${description}`);
    });

    console.log(`\n${colors.cyan}Examples:${colors.reset}`);
    console.log(`  npm run dbg reload`);
    console.log(`  npm run dbg clear-errors`);
    console.log(`  npm run dbg open-background\n`);
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

    console.log(`${colors.dim}[dbg] Running action: ${colors.bright}${action}${colors.reset}\n`);

    try {
        const actionModule = require(actionPath);
        const actionArgs = args.slice(1);
        await actionModule.run(actionArgs);
    } catch (error) {
        console.error(`${colors.red}Error executing action "${action}":${colors.reset}`);
        console.error(error);
        process.exit(1);
    }
}

// Run controller
main();

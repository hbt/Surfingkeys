/**
 * CDP Proxy Configuration
 *
 * Shared configuration for all proxy actions.
 * Loads .env silently from project root.
 */

const fs = require('fs');
const path = require('path');

// Load .env from project root before anything else (quietly)
const envPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, quiet: true });
}

// Exported configuration
const config = {
  CDP_HOST: process.env.CDP_HOST || '127.0.0.1',
  CDP_PORT: parseInt(process.env.CDP_PORT, 10) || 9222,
  PROXY_PORT: parseInt(process.env.CDP_PROXY_PORT, 10) || 9623,
  PID_FILE: '/tmp/dbg-proxy.pid',
  LOG_FILE: '/tmp/dbg-proxy.log'
};

/**
 * Output JSON result and optionally exit
 */
function outputJSON(data, exitCode = null) {
  console.log(JSON.stringify(data, null, 2));
  if (exitCode !== null) {
    process.exit(exitCode);
  }
}

/**
 * Check if proxy is already running
 */
function isProxyRunning() {
  if (!fs.existsSync(config.PID_FILE)) {
    return { running: false };
  }

  try {
    const pid = parseInt(fs.readFileSync(config.PID_FILE, 'utf8').trim(), 10);
    // Check if process exists
    process.kill(pid, 0);
    return { running: true, pid };
  } catch (err) {
    // Process doesn't exist, clean up stale PID file
    fs.unlinkSync(config.PID_FILE);
    return { running: false };
  }
}

module.exports = { config, outputJSON, isProxyRunning };

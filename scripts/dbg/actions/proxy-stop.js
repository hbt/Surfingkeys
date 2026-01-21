/**
 * CDP Proxy Stop Action
 *
 * Stops the running CDP proxy server.
 * Output: JSON only to stdout
 */

const fs = require('fs');
const { config, outputJSON } = require('./proxy-config');

/**
 * Main action runner
 */
async function run(args) {
  if (!fs.existsSync(config.PID_FILE)) {
    outputJSON({
      success: false,
      error: 'Proxy is not running',
      hint: 'Start it with "bin/dbg proxy-start"'
    }, 1);
    return;
  }

  try {
    const pid = parseInt(fs.readFileSync(config.PID_FILE, 'utf8').trim(), 10);

    // Check if process exists
    try {
      process.kill(pid, 0);
    } catch (err) {
      // Process doesn't exist, clean up stale PID file
      fs.unlinkSync(config.PID_FILE);
      outputJSON({
        success: true,
        message: 'Cleaned up stale PID file (proxy was not running)'
      }, 0);
      return;
    }

    // Send SIGTERM to gracefully stop
    process.kill(pid, 'SIGTERM');

    // Wait briefly for process to exit
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify it's stopped
    try {
      process.kill(pid, 0);
      // Still running, try SIGKILL
      process.kill(pid, 'SIGKILL');
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (err) {
      // Process is gone, good
    }

    // Clean up PID file if still exists
    if (fs.existsSync(config.PID_FILE)) {
      fs.unlinkSync(config.PID_FILE);
    }

    outputJSON({
      success: true,
      message: 'Proxy stopped',
      pid: pid,
      port: config.PROXY_PORT
    }, 0);

  } catch (error) {
    outputJSON({
      success: false,
      error: error.message
    }, 1);
  }
}

module.exports = { run };

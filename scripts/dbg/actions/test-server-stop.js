/**
 * Test Server Stop Action
 *
 * Stops the running fixtures server.
 * Output: JSON only to stdout
 */

const fs = require('fs');

const TEST_SERVER_PID_FILE = '/tmp/surfingkeys-test-server.pid';

function outputJSON(data, exitCode = 0) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(exitCode);
}

/**
 * Main action runner
 */
async function run(args) {
  if (!fs.existsSync(TEST_SERVER_PID_FILE)) {
    outputJSON({
      success: false,
      error: 'Test server is not running',
      hint: 'Start it with "bin/dbg test-server-start"'
    }, 1);
    return;
  }

  try {
    const pid = parseInt(fs.readFileSync(TEST_SERVER_PID_FILE, 'utf8').trim(), 10);

    // Check if process exists
    try {
      process.kill(pid, 0);
    } catch (err) {
      // Process doesn't exist, clean up stale PID file
      fs.unlinkSync(TEST_SERVER_PID_FILE);
      outputJSON({
        success: true,
        message: 'Cleaned up stale PID file (test server was not running)'
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
    if (fs.existsSync(TEST_SERVER_PID_FILE)) {
      fs.unlinkSync(TEST_SERVER_PID_FILE);
    }

    outputJSON({
      success: true,
      message: 'Test server stopped',
      pid: pid,
      port: 9873
    }, 0);

  } catch (error) {
    outputJSON({
      success: false,
      error: error.message
    }, 1);
  }
}

module.exports = { run };

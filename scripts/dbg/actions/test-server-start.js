/**
 * Test Server Start Action
 *
 * Starts the fixtures server for CDP tests on port 9873.
 * Serves files from data/fixtures/
 *
 * Output: JSON only to stdout
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TEST_SERVER_PID_FILE = '/tmp/surfingkeys-test-server.pid';
const TEST_SERVER_LOG_FILE = '/tmp/surfingkeys-test-server.log';
const FIXTURES_DIR = path.join(__dirname, '../../../data/fixtures');
const FIXTURES_SERVER = path.join(__dirname, '../../../tests/fixtures-server.js');

function outputJSON(data, exitCode = 0) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(exitCode);
}

/**
 * Main action runner
 */
async function run(args) {
  // Check if already running
  if (fs.existsSync(TEST_SERVER_PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(TEST_SERVER_PID_FILE, 'utf8').trim(), 10);
      process.kill(pid, 0); // Check if process exists
      outputJSON({
        success: false,
        error: 'Test server is already running',
        pid: pid,
        port: 9873,
        hint: 'Use "bin/dbg test-server-stop" to stop it first'
      }, 1);
      return;
    } catch (err) {
      // PID file exists but process doesn't, clean it up
      fs.unlinkSync(TEST_SERVER_PID_FILE);
    }
  }

  try {
    // Start the server
    const logStream = fs.createWriteStream(TEST_SERVER_LOG_FILE, { flags: 'a' });

    const server = spawn('node', [FIXTURES_SERVER], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Redirect stdout/stderr to log file
    server.stdout.pipe(logStream);
    server.stderr.pipe(logStream);

    // Store PID
    fs.writeFileSync(TEST_SERVER_PID_FILE, String(server.pid));

    // Detach from parent process
    server.unref();

    // Give it a moment to start
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify it started
    try {
      process.kill(server.pid, 0);
      outputJSON({
        success: true,
        message: 'Test server started',
        pid: server.pid,
        port: 9873,
        directory: FIXTURES_DIR,
        url: 'http://127.0.0.1:9873/',
        log: TEST_SERVER_LOG_FILE
      }, 0);
    } catch (err) {
      fs.unlinkSync(TEST_SERVER_PID_FILE);
      outputJSON({
        success: false,
        error: 'Test server failed to start',
        log: TEST_SERVER_LOG_FILE
      }, 1);
    }

  } catch (error) {
    outputJSON({
      success: false,
      error: error.message
    }, 1);
  }
}

module.exports = { run };

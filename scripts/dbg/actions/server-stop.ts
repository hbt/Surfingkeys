/**
 * Config Server Stop Action
 *
 * Stops the running local config HTTP server.
 * Output: JSON only to stdout
 */

import fs from 'fs';

const CONFIG_SERVER_PID_FILE = '/tmp/sk-config-server-9600.pid';
const PORT = 9600;

function outputJSON(data: unknown, exitCode = 0) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(exitCode);
}

async function run(args: unknown[]) {
  if (!fs.existsSync(CONFIG_SERVER_PID_FILE)) {
    outputJSON({
      success: false,
      error: 'Config server is not running',
      hint: 'Start it with "bin/dbg server-start"'
    }, 1);
    return;
  }

  try {
    const pid = parseInt(fs.readFileSync(CONFIG_SERVER_PID_FILE, 'utf8').trim(), 10);

    try {
      process.kill(pid, 0);
    } catch (err) {
      // Process doesn't exist, clean up stale PID file
      fs.unlinkSync(CONFIG_SERVER_PID_FILE);
      outputJSON({
        success: true,
        message: 'Cleaned up stale PID file (config server was not running)'
      }, 0);
      return;
    }

    process.kill(pid, 'SIGTERM');

    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      process.kill(pid, 0);
      process.kill(pid, 'SIGKILL');
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (_) {
      // Process is gone, good
    }

    if (fs.existsSync(CONFIG_SERVER_PID_FILE)) {
      fs.unlinkSync(CONFIG_SERVER_PID_FILE);
    }

    outputJSON({
      success: true,
      message: 'Config server stopped',
      pid,
      port: PORT
    }, 0);

  } catch (error) {
    outputJSON({
      success: false,
      error: (error as Error).message
    }, 1);
  }
}

export { run };

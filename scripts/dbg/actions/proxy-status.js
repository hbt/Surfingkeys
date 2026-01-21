/**
 * CDP Proxy Status Action
 *
 * Checks if the CDP proxy server is running.
 * Output: JSON only to stdout
 */

const fs = require('fs');
const { config, outputJSON, isProxyRunning } = require('./proxy-config');

/**
 * Main action runner
 */
async function run(args) {
  const status = isProxyRunning();

  if (!status.running) {
    outputJSON({
      running: false,
      port: config.PROXY_PORT,
      hint: 'Start with "bin/dbg proxy-start"'
    }, 0);
    return;
  }

  // Get log file size for info
  let logSize = null;
  if (fs.existsSync(config.LOG_FILE)) {
    const stats = fs.statSync(config.LOG_FILE);
    logSize = stats.size;
  }

  outputJSON({
    running: true,
    pid: status.pid,
    port: config.PROXY_PORT,
    url: `ws://127.0.0.1:${config.PROXY_PORT}`,
    log: config.LOG_FILE,
    logSize: logSize
  }, 0);
}

module.exports = { run };

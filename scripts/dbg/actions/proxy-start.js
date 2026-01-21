/**
 * CDP Proxy Start Action
 *
 * Starts a WebSocket proxy for stateless CDP communication.
 * See docs/cdp/proxy.md for usage instructions.
 *
 * Output: JSON only to stdout
 * Logs: Written to /tmp/dbg-proxy.log
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const { config, outputJSON, isProxyRunning } = require('./proxy-config');

let globalMessageId = 1;
const cdpConnections = new Map();
const logStream = fs.createWriteStream(config.LOG_FILE, { flags: 'a' });

// Log utilities
const log = {
  info: (msg) => logStream.write(`[${new Date().toISOString()}] [PROXY] ${msg}\n`),
  request: (msg) => logStream.write(`[${new Date().toISOString()}]   → ${msg}\n`),
  response: (msg) => logStream.write(`[${new Date().toISOString()}]   ← ${msg}\n`),
  error: (msg) => logStream.write(`[${new Date().toISOString()}] [ERROR] ${msg}\n`)
};

/**
 * Ensure CDP connection exists and is open
 */
function ensureCDPConnection(targetId) {
  return new Promise((resolve, reject) => {
    if (cdpConnections.has(targetId)) {
      const conn = cdpConnections.get(targetId);
      if (conn.ws.readyState === WebSocket.OPEN) {
        resolve(conn);
        return;
      }
    }

    const wsUrl = `ws://${config.CDP_HOST}:${config.CDP_PORT}/devtools/page/${targetId}`;
    log.info(`Connecting to CDP target: ${targetId}`);

    const ws = new WebSocket(wsUrl);
    const connObj = { ws, pendingRequests: new Map() };

    ws.on('open', () => {
      log.info(`Connected to CDP target ${targetId.substring(0, 8)}... ✓`);
      cdpConnections.set(targetId, connObj);

      // Subscribe to console and exception events
      ws.send(JSON.stringify({
        id: globalMessageId++,
        method: 'Runtime.enable',
      }));

      resolve(connObj);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.id && connObj.pendingRequests.has(msg.id)) {
          const pending = connObj.pendingRequests.get(msg.id);
          log.response(`[${targetId.substring(0, 8)}...] Response ID ${msg.id}`);

          clearTimeout(pending.timeout);
          pending.resolve(msg);
          connObj.pendingRequests.delete(msg.id);
        } else if (msg.method === 'Runtime.consoleAPICalled') {
          // Capture console messages
          const params = msg.params || {};
          const level = params.type || 'log';
          const args = params.args || [];
          const message = args
            .map(arg => {
              if (arg.type === 'string') return arg.value;
              if (arg.type === 'number') return String(arg.value);
              if (arg.type === 'boolean') return String(arg.value);
              if (arg.type === 'object' && arg.description) return arg.description;
              return String(arg);
            })
            .join(' ');
          log.response(`[${targetId.substring(0, 8)}...] [${level.toUpperCase()}] ${message}`);
        } else if (msg.method === 'Runtime.exceptionThrown') {
          // Capture exceptions
          const exception = (msg.params || {}).exceptionDetails || {};
          const message = exception.text || exception.description || 'Unknown exception';
          log.response(`[${targetId.substring(0, 8)}...] [EXCEPTION] ${message}`);
        } else if (msg.method) {
          log.response(`[${targetId.substring(0, 8)}...] Event: ${msg.method}`);
        }
      } catch (err) {
        log.error(`Failed to parse CDP message: ${err.message}`);
      }
    });

    ws.on('error', (err) => {
      log.error(`CDP connection error (${targetId.substring(0, 8)}...): ${err.message}`);
      cdpConnections.delete(targetId);
      reject(err);
    });

    ws.on('close', () => {
      log.info(`CDP connection closed (${targetId.substring(0, 8)}...)`);
      cdpConnections.delete(targetId);
    });

    setTimeout(() => {
      reject(new Error(`CDP connection timeout for ${targetId}`));
    }, 5000);
  });
}

/**
 * Send CDP command via pooled connection
 */
function sendToCDP(targetId, method, params) {
  return new Promise((resolve, reject) => {
    ensureCDPConnection(targetId)
      .then((connObj) => {
        const id = globalMessageId++;
        const timeout = setTimeout(() => {
          connObj.pendingRequests.delete(id);
          reject(new Error(`Timeout waiting for response to ID ${id}`));
        }, 10000);

        connObj.pendingRequests.set(id, { resolve, timeout });

        const request = { id, method, ...(params && { params }) };
        log.request(`[${targetId.substring(0, 8)}...] Sending to CDP: ID ${id}, method ${method}`);

        connObj.ws.send(JSON.stringify(request), (err) => {
          if (err) {
            clearTimeout(timeout);
            connObj.pendingRequests.delete(id);
            reject(err);
          }
        });
      })
      .catch(reject);
  });
}

/**
 * Start the proxy server
 */
function startProxy() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (clientWs) => {
      log.info('Client connected');
      let clientConnected = true;

      clientWs.on('message', async (data) => {
        try {
          const request = JSON.parse(data.toString());
          const targetId = request.targetId;

          if (!targetId) {
            throw new Error('No targetId provided in request');
          }

          log.request(`Client request: ${request.method} (target: ${targetId.substring(0, 8)}...)`);

          const response = await sendToCDP(targetId, request.method, request.params);

          const clientResponse = {
            result: response.result,
            ...(response.error && { error: response.error })
          };

          if (clientConnected && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(clientResponse));
            log.response('Sent response to client');
          }
        } catch (err) {
          log.error(`Request error: ${err.message}`);
          if (clientConnected && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ error: { message: err.message } }));
          }
        }
      });

      clientWs.on('close', () => {
        clientConnected = false;
        log.info('Client disconnected');
      });

      clientWs.on('error', (err) => {
        log.error(`Client error: ${err.message}`);
        clientConnected = false;
      });
    });

    server.on('error', (err) => {
      reject(err);
    });

    server.listen(config.PROXY_PORT, () => {
      log.info(`Proxy listening on ws://127.0.0.1:${config.PROXY_PORT}`);
      log.info(`Forwarding to CDP at ws://${config.CDP_HOST}:${config.CDP_PORT}`);
      resolve(server);
    });
  });
}

/**
 * Main action runner
 */
async function run(args) {
  // Check if already running
  const status = isProxyRunning();
  if (status.running) {
    outputJSON({
      success: false,
      error: 'Proxy already running',
      pid: status.pid,
      port: config.PROXY_PORT,
      hint: 'Use "bin/dbg proxy-stop" to stop it first',
      docs: 'docs/cdp/proxy.md'
    }, 1);
    return;
  }

  try {
    const server = await startProxy();

    // Write PID file
    fs.writeFileSync(config.PID_FILE, process.pid.toString());

    log.info('=== CDP Proxy Started ===');

    // Setup graceful shutdown
    const shutdown = () => {
      log.info('Shutting down gracefully...');
      if (fs.existsSync(config.PID_FILE)) {
        fs.unlinkSync(config.PID_FILE);
      }
      server.close();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Output success JSON
    outputJSON({
      success: true,
      pid: process.pid,
      proxy: {
        host: '127.0.0.1',
        port: config.PROXY_PORT,
        url: `ws://127.0.0.1:${config.PROXY_PORT}`
      },
      cdp: {
        host: config.CDP_HOST,
        port: config.CDP_PORT
      },
      log: config.LOG_FILE,
      docs: 'docs/cdp/proxy.md'
    });

    // Keep process alive - server will handle connections

  } catch (error) {
    log.error(`Fatal: ${error.message}`);

    if (error.code === 'EADDRINUSE') {
      outputJSON({
        success: false,
        error: `Port ${config.PROXY_PORT} is already in use`,
        port: config.PROXY_PORT,
        hint: 'Check if proxy is running: "bin/dbg proxy-status"',
        docs: 'docs/cdp/proxy.md'
      }, 1);
    } else {
      outputJSON({
        success: false,
        error: error.message,
        docs: 'docs/cdp/proxy.md'
      }, 1);
    }
  }
}

module.exports = { run };

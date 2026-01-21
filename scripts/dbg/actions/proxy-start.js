/**
 * CDP Proxy Start Action
 *
 * Starts a WebSocket proxy that provides:
 * - Connection pooling to multiple CDP targets
 * - Stateless REST-like interface via websocat
 * - Persistent CDP connections managed transparently
 *
 * Output: JSON only to stdout
 * Logs: Written to /tmp/dbg-proxy-<timestamp>.log
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const CDP_HOST = '127.0.0.1';
const CDP_PORT = process.env.CDP_PORT || 9222;
const PROXY_PORT = process.env.PROXY_PORT || 9223;
const DEFAULT_TARGET_ID = process.env.DEFAULT_TARGET_ID || '';

let globalMessageId = 1;
const cdpConnections = new Map();

// Create log file
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = `/tmp/dbg-proxy-${timestamp}.log`;
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// Log utilities
const log = {
  info: (msg) => logStream.write(`[PROXY] ${msg}\n`),
  request: (msg) => logStream.write(`  → ${msg}\n`),
  response: (msg) => logStream.write(`  ← ${msg}\n`),
  error: (msg) => logStream.write(`[ERROR] ${msg}\n`)
};

/**
 * Ensure CDP connection exists and is open
 */
function ensureCDPConnection(targetId) {
  return new Promise((resolve, reject) => {
    // Check if we already have a connection
    if (cdpConnections.has(targetId)) {
      const conn = cdpConnections.get(targetId);
      if (conn.ws.readyState === WebSocket.OPEN) {
        resolve(conn);
        return;
      }
    }

    // Create new connection
    const wsUrl = `ws://${CDP_HOST}:${CDP_PORT}/devtools/page/${targetId}`;
    log.info(`Connecting to CDP target: ${targetId}`);

    const ws = new WebSocket(wsUrl);
    const connObj = { ws, pendingRequests: new Map() };

    ws.on('open', () => {
      log.info(`Connected to CDP target ${targetId.substring(0, 8)}... ✓`);
      cdpConnections.set(targetId, connObj);
      resolve(connObj);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.id && connObj.pendingRequests.has(msg.id)) {
          // This is a response to one of our requests
          const pending = connObj.pendingRequests.get(msg.id);
          log.response(`[${targetId.substring(0, 8)}...] Response ID ${msg.id}`);

          clearTimeout(pending.timeout);
          pending.resolve(msg);
          connObj.pendingRequests.delete(msg.id);
        } else if (msg.method) {
          // This is an unsolicited event from CDP
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
  return new Promise((resolve) => {
    const server = http.createServer();
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (clientWs) => {
      log.info('Client connected');
      let clientConnected = true;

      clientWs.on('message', async (data) => {
        try {
          const request = JSON.parse(data.toString());
          const targetId = request.targetId || DEFAULT_TARGET_ID;

          if (!targetId) {
            throw new Error('No targetId provided and no DEFAULT_TARGET_ID set');
          }

          log.request(`Client request: ${request.method} (target: ${targetId.substring(0, 8)}...)`);

          const response = await sendToCDP(targetId, request.method, request.params);

          // Send back to client (without ID, to look stateless)
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

    server.listen(PROXY_PORT, () => {
      log.info(`Proxy listening on ws://127.0.0.1:${PROXY_PORT}`);
      log.info(`Forwarding to CDP at ws://${CDP_HOST}:${CDP_PORT}`);
      log.info('Connection pooling enabled');
      if (DEFAULT_TARGET_ID) {
        log.info(`Default target: ${DEFAULT_TARGET_ID}`);
      }
      resolve();
    });
  });
}

/**
 * Main action runner
 */
async function run(args) {
  try {
    // Start proxy server (non-blocking)
    startProxy().then(() => {
      log.info('=== CDP Proxy Started ===');

      // Keep process alive
      process.on('SIGTERM', () => {
        log.info('SIGTERM received, shutting down gracefully...');
        process.exit(0);
      });

      process.on('SIGINT', () => {
        log.info('SIGINT received, shutting down gracefully...');
        process.exit(0);
      });
    }).catch((err) => {
      log.error(`Failed to start proxy: ${err.message}`);
      process.exit(1);
    });

    // Give server a moment to start, then output JSON and exit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Output JSON response to stdout (then exit)
    console.log(
      JSON.stringify({
        success: true,
        message: 'CDP Proxy started in background',
        proxy: {
          host: '127.0.0.1',
          port: PROXY_PORT,
          url: `ws://127.0.0.1:${PROXY_PORT}`
        },
        cdp: {
          host: CDP_HOST,
          port: CDP_PORT
        },
        pid: process.pid,
        log: LOG_FILE,
        usage: {
          default: `echo '{"method":"Runtime.enable"}' | websocat ws://127.0.0.1:${PROXY_PORT}`,
          custom: `echo '{"targetId":"TARGET_ID","method":"Runtime.enable"}' | websocat ws://127.0.0.1:${PROXY_PORT}`
        }
      })
    );

    // Return without exiting - let the server keep running
    // The HTTP/WebSocket server will keep Node alive
  } catch (error) {
    log.error(`Fatal: ${error.message}`);
    logStream.end();

    console.log(
      JSON.stringify({
        success: false,
        error: error.message,
        log: LOG_FILE
      })
    );

    process.exit(1);
  }
}

module.exports = { run };

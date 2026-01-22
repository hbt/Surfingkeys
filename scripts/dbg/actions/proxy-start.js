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
const cdpConnections = new Map();  // Client-initiated connections
const passiveConnections = new Map();  // Passively monitored targets
const targetMap = new Map();  // Track discovered targets: { targetId: { id, url, type, timestamp } }
const logStream = fs.createWriteStream(config.LOG_FILE, { flags: 'a' });

const DISCOVERY_INTERVAL = 2000;  // Poll for new targets every 2 seconds
let discoveryLoopHandle = null;

// Log utilities
const log = {
  info: (msg) => logStream.write(`[${new Date().toISOString()}] [PROXY] ${msg}\n`),
  request: (msg) => logStream.write(`[${new Date().toISOString()}]   → ${msg}\n`),
  response: (msg) => logStream.write(`[${new Date().toISOString()}]   ← ${msg}\n`),
  error: (msg) => logStream.write(`[${new Date().toISOString()}] [ERROR] ${msg}\n`)
};

/**
 * Extract stack trace location from stackTrace object
 */
function getStackLocation(stackTrace) {
  if (!stackTrace || !stackTrace.callFrames || stackTrace.callFrames.length === 0) {
    return null;
  }
  const frame = stackTrace.callFrames[0];
  if (frame.url && frame.lineNumber !== undefined) {
    return `${frame.url}:${frame.lineNumber}${frame.columnNumber !== undefined ? ':' + frame.columnNumber : ''}`;
  }
  return null;
}

/**
 * Handle CDP message from any target (client or passive)
 */
function handleCDPMessage(msg, targetId, targetUrl) {
  try {
    if (msg.method === 'Runtime.consoleAPICalled') {
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

      // Extract location from stackTrace if available
      const stackLocation = getStackLocation(params.stackTrace);
      const locationPart = stackLocation ? ` at ${stackLocation}` : '';

      const shortTarget = targetId.substring(0, 8);
      const urlPart = targetUrl ? ` {${targetUrl}}` : '';
      log.response(`[${shortTarget}...]${urlPart} [${level.toUpperCase()}] ${message}${locationPart}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      // Capture exceptions
      const exception = (msg.params || {}).exceptionDetails || {};
      const message = exception.text || exception.description || 'Unknown exception';
      const location = `${exception.url || '?'}:${exception.lineNumber || '?'}:${exception.columnNumber || '?'}`;
      const scriptInfo = exception.scriptId ? ` [scriptId: ${exception.scriptId}]` : '';

      // Also try to extract from stackTrace if location fields are missing
      let stackTraceLocation = '';
      if ((!exception.url || exception.lineNumber === undefined) && exception.stackTrace) {
        const stackLoc = getStackLocation(exception.stackTrace);
        if (stackLoc) {
          stackTraceLocation = ` | Stack: ${stackLoc}`;
        }
      }

      const shortTarget = targetId.substring(0, 8);
      const urlPart = targetUrl ? ` {${targetUrl}}` : '';
      log.response(`[${shortTarget}...]${urlPart} [EXCEPTION] ${message} at ${location}${scriptInfo}${stackTraceLocation}`);
    } else if (msg.method) {
      const shortTarget = targetId.substring(0, 8);
      const urlPart = targetUrl ? ` {${targetUrl}}` : '';
      log.response(`[${shortTarget}...]${urlPart} Event: ${msg.method}`);
    }
  } catch (err) {
    log.error(`Failed to handle CDP message: ${err.message}`);
  }
}

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
        } else {
          // Handle events (console, exceptions, etc.)
          handleCDPMessage(msg, targetId, connObj.targetUrl);
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
 * Discover all available CDP targets
 */
function discoverTargets() {
  return new Promise((resolve) => {
    http.get(`http://${config.CDP_HOST}:${config.CDP_PORT}/json`, (res) => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        try {
          const targets = JSON.parse(body);
          const currentIds = new Set();

          targets.forEach(target => {
            if (target.id) {
              currentIds.add(target.id);
              targetMap.set(target.id, {
                id: target.id,
                url: target.url,
                type: target.type,
                title: target.title,
                timestamp: Date.now()
              });
            }
          });

          // Prune disappeared targets
          const disappearedIds = [];
          targetMap.forEach((_, id) => {
            if (!currentIds.has(id)) {
              disappearedIds.push(id);
            }
          });

          disappearedIds.forEach(id => {
            log.info(`Target disappeared: ${id.substring(0, 8)}...`);
            targetMap.delete(id);

            // Close passive connection if exists
            if (passiveConnections.has(id)) {
              const conn = passiveConnections.get(id);
              if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.close();
              }
              passiveConnections.delete(id);
            }
          });

          resolve(targets);
        } catch (err) {
          log.error(`Failed to parse targets JSON: ${err.message}`);
          resolve([]);
        }
      });
    }).on('error', (err) => {
      log.error(`Failed to discover targets: ${err.message}`);
      resolve([]);
    });
  });
}

/**
 * Auto-attach to a target for passive event monitoring
 */
function autoAttachTarget(targetId, targetUrl) {
  return new Promise((resolve) => {
    if (passiveConnections.has(targetId)) {
      const conn = passiveConnections.get(targetId);
      if (conn.ws.readyState === WebSocket.OPEN) {
        resolve(conn);
        return;
      }
    }

    const wsUrl = `ws://${config.CDP_HOST}:${config.CDP_PORT}/devtools/page/${targetId}`;
    const ws = new WebSocket(wsUrl);
    const connObj = { ws, targetUrl, isPasive: true };

    ws.on('open', () => {
      log.info(`Passive connection opened: ${targetId.substring(0, 8)}... {${targetUrl}}`);
      passiveConnections.set(targetId, connObj);

      // Subscribe to events
      ws.send(JSON.stringify({
        id: globalMessageId++,
        method: 'Runtime.enable',
      }));

      resolve(connObj);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleCDPMessage(msg, targetId, targetUrl);
      } catch (err) {
        log.error(`Failed to parse passive message: ${err.message}`);
      }
    });

    ws.on('error', (err) => {
      log.error(`Passive connection error (${targetId.substring(0, 8)}...): ${err.message}`);
      passiveConnections.delete(targetId);
      resolve(null);
    });

    ws.on('close', () => {
      log.info(`Passive connection closed: ${targetId.substring(0, 8)}...`);
      passiveConnections.delete(targetId);
    });

    setTimeout(() => {
      resolve(null);
    }, 5000);
  });
}

/**
 * Start the target discovery loop
 */
function startDiscoveryLoop() {
  discoveryLoopHandle = setInterval(async () => {
    const targets = await discoverTargets();

    // Auto-attach to new targets
    targets.forEach(target => {
      if (target.id && !passiveConnections.has(target.id) && !cdpConnections.has(target.id)) {
        // Skip if already connected via client or passive
        autoAttachTarget(target.id, target.url);
      }
    });
  }, DISCOVERY_INTERVAL);

  log.info(`Discovery loop started (interval: ${DISCOVERY_INTERVAL}ms)`);
}

/**
 * Stop the target discovery loop
 */
function stopDiscoveryLoop() {
  if (discoveryLoopHandle) {
    clearInterval(discoveryLoopHandle);
    log.info('Discovery loop stopped');
  }
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

    // Start passive target discovery loop
    startDiscoveryLoop();

    // Setup graceful shutdown
    const shutdown = () => {
      log.info('Shutting down gracefully...');
      stopDiscoveryLoop();

      // Close all passive connections
      passiveConnections.forEach((conn) => {
        if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.close();
        }
      });
      passiveConnections.clear();

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

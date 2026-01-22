/**
 * CDP Proxy Start Action
 *
 * Starts a WebSocket proxy for stateless CDP communication.
 * See docs/cdp/proxy.md for usage instructions.
 *
 * Output: JSON only to stdout
 * Logs: Written to /tmp/dbg-proxy.jsonl (JSONL format, one JSON object per line)
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

/**
 * Write a single-line JSON entry to the log file
 */
function logEntry(type, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    ...data
  };
  logStream.write(JSON.stringify(entry) + '\n');
}

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
function handleCDPMessage(msg, targetId, targetUrl, isPassive = false) {
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

      logEntry('CONSOLE', {
        targetId,
        targetUrl,
        isPassive,
        level: level.toUpperCase(),
        message,
        stackTrace: params.stackTrace || null,
        args: params.args || []
      });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      // Capture exceptions
      const exception = (msg.params || {}).exceptionDetails || {};

      logEntry('EXCEPTION', {
        targetId,
        targetUrl,
        isPassive,
        message: exception.text || exception.description || 'Unknown exception',
        exceptionDetails: exception
      });
    } else if (msg.method) {
      logEntry('EVENT', {
        targetId,
        targetUrl,
        isPassive,
        method: msg.method
      });
    }
  } catch (err) {
    logEntry('ERROR', {
      message: `Failed to handle CDP message: ${err.message}`
    });
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
    logEntry('PROXY', {
      message: `Connecting to CDP target`,
      targetId
    });

    const ws = new WebSocket(wsUrl);
    const connObj = { ws, pendingRequests: new Map() };

    ws.on('open', () => {
      logEntry('PROXY', {
        message: `Connected to CDP target`,
        targetId,
        status: 'connected'
      });
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
          logEntry('RESPONSE', {
            targetId,
            requestId: msg.id
          });

          clearTimeout(pending.timeout);
          pending.resolve(msg);
          connObj.pendingRequests.delete(msg.id);
        } else {
          // Handle events (console, exceptions, etc.)
          handleCDPMessage(msg, targetId, connObj.targetUrl, false);
        }
      } catch (err) {
        logEntry('ERROR', {
          message: `Failed to parse CDP message: ${err.message}`,
          targetId
        });
      }
    });

    ws.on('error', (err) => {
      logEntry('ERROR', {
        message: `CDP connection error: ${err.message}`,
        targetId
      });
      cdpConnections.delete(targetId);
      reject(err);
    });

    ws.on('close', () => {
      logEntry('PROXY', {
        message: `CDP connection closed`,
        targetId,
        status: 'closed'
      });
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
        logEntry('REQUEST', {
          targetId,
          requestId: id,
          cdpMethod: method
        });

        connObj.ws.send(JSON.stringify(request), (err) => {
          if (err) {
            clearTimeout(timeout);
            connObj.pendingRequests.delete(id);
            logEntry('ERROR', {
              message: `Failed to send CDP request: ${err.message}`,
              targetId,
              requestId: id
            });
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
            logEntry('PROXY', {
              message: `Target disappeared`,
              targetId: id,
              status: 'disappeared'
            });
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
          logEntry('ERROR', {
            message: `Failed to parse targets JSON: ${err.message}`
          });
          resolve([]);
        }
      });
    }).on('error', (err) => {
      logEntry('ERROR', {
        message: `Failed to discover targets: ${err.message}`
      });
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
      logEntry('PROXY', {
        message: `Passive connection opened`,
        targetId,
        targetUrl,
        status: 'connected',
        isPassive: true
      });
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
        handleCDPMessage(msg, targetId, targetUrl, true);
      } catch (err) {
        logEntry('ERROR', {
          message: `Failed to parse passive message: ${err.message}`,
          targetId,
          targetUrl
        });
      }
    });

    ws.on('error', (err) => {
      logEntry('ERROR', {
        message: `Passive connection error: ${err.message}`,
        targetId,
        targetUrl
      });
      passiveConnections.delete(targetId);
      resolve(null);
    });

    ws.on('close', () => {
      logEntry('PROXY', {
        message: `Passive connection closed`,
        targetId,
        targetUrl,
        status: 'closed',
        isPassive: true
      });
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

  logEntry('PROXY', {
    message: `Discovery loop started`,
    discoveryInterval: DISCOVERY_INTERVAL
  });
}

/**
 * Stop the target discovery loop
 */
function stopDiscoveryLoop() {
  if (discoveryLoopHandle) {
    clearInterval(discoveryLoopHandle);
    logEntry('PROXY', {
      message: `Discovery loop stopped`
    });
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
      logEntry('PROXY', {
        message: 'Client connected',
        status: 'connected'
      });
      let clientConnected = true;

      clientWs.on('message', async (data) => {
        try {
          const request = JSON.parse(data.toString());
          const targetId = request.targetId;

          if (!targetId) {
            throw new Error('No targetId provided in request');
          }

          logEntry('REQUEST', {
            message: 'Client request',
            targetId,
            cdpMethod: request.method
          });

          const response = await sendToCDP(targetId, request.method, request.params);

          const clientResponse = {
            result: response.result,
            ...(response.error && { error: response.error })
          };

          if (clientConnected && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(clientResponse));
            logEntry('RESPONSE', {
              message: 'Sent response to client'
            });
          }
        } catch (err) {
          logEntry('ERROR', {
            message: `Request error: ${err.message}`
          });
          if (clientConnected && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ error: { message: err.message } }));
          }
        }
      });

      clientWs.on('close', () => {
        clientConnected = false;
        logEntry('PROXY', {
          message: 'Client disconnected',
          status: 'disconnected'
        });
      });

      clientWs.on('error', (err) => {
        logEntry('ERROR', {
          message: `Client error: ${err.message}`
        });
        clientConnected = false;
      });
    });

    server.on('error', (err) => {
      reject(err);
    });

    server.listen(config.PROXY_PORT, () => {
      logEntry('PROXY', {
        message: `Proxy listening`,
        proxyUrl: `ws://127.0.0.1:${config.PROXY_PORT}`,
        cdpHost: config.CDP_HOST,
        cdpPort: config.CDP_PORT,
        status: 'listening'
      });
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

    logEntry('PROXY', {
      message: 'CDP Proxy Started',
      pid: process.pid,
      status: 'started'
    });

    // Start passive target discovery loop
    startDiscoveryLoop();

    // Setup graceful shutdown
    const shutdown = () => {
      logEntry('PROXY', {
        message: 'Shutting down gracefully',
        status: 'shutting_down'
      });
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
    logEntry('ERROR', {
      message: `Fatal: ${error.message}`,
      errorCode: error.code
    });

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

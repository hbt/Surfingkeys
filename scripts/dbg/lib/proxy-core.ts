/**
 * CDP Proxy Core Module
 *
 * Reusable proxy implementation that can be instantiated with custom ports and log files.
 * Supports both static (interactive) and dynamic (test) modes.
 *
 * Usage:
 *   const { createProxy } = require('./proxy-core');
 *   const result = await createProxy({
 *     port: 9623,
 *     logFile: '/tmp/dbg-proxy.jsonl',
 *     cdpPort: 9222,
 *     cdpHost: '127.0.0.1'
 *   });
 *   // result.server - HTTP server instance
 *   // result.port - Actual listening port
 *   // result.logFile - Path to JSONL log file
 *   // result.shutdown - Function to gracefully shutdown
 */

import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';

/**
 * Create and start a proxy instance
 * Returns promise resolving to { server, port, logFile, shutdown }
 */
interface ProxyOptions {
  port?: number;
  logFile?: string;
  cdpPort?: number;
  cdpHost?: string;
}

async function createProxy(options: ProxyOptions = {}) {
  const {
    port = 9623,
    logFile = '/tmp/dbg-proxy.jsonl',
    cdpPort = 9222,
    cdpHost = '127.0.0.1'
  } = options;

  // Instance-specific state (not global)
  let globalMessageId = 1;
  const cdpConnections = new Map();
  const passiveConnections = new Map();
  const targetMap = new Map();
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  const DISCOVERY_INTERVAL = 2000;
  let discoveryLoopHandle: ReturnType<typeof setInterval> | null = null;
  let serverShutdown = false;

  /**
   * Write a single-line JSON entry to the log file
   */
  function logEntry(type: string, data: Record<string, unknown>) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      ...data
    };
    try {
      logStream.write(JSON.stringify(entry) + '\n');
    } catch (err) {
      // Silently fail if log stream is closed
    }
  }

  /**
   * Handle CDP message from any target (client or passive)
   */
  function handleCDPMessage(msg: Record<string, unknown>, targetId: string, targetUrl: string, isPassive = false) {
    try {
      if (msg.method === 'Runtime.consoleAPICalled') {
        const params = (msg.params || {}) as Record<string, unknown>;
        const level = (params['type'] as string) || 'log';
        const args = (params['args'] as Array<Record<string, unknown>>) || [];
        const message = args
          .map((arg: Record<string, unknown>) => {
            if (arg['type'] === 'string') return arg['value'];
            if (arg['type'] === 'number') return String(arg['value']);
            if (arg['type'] === 'boolean') return String(arg['value']);
            if (arg['type'] === 'object' && arg['description']) return arg['description'];
            return String(arg);
          })
          .join(' ');

        logEntry('CONSOLE', {
          targetId,
          targetUrl,
          isPassive,
          level: level.toUpperCase(),
          message: String(message),
          stackTrace: (params['stackTrace'] as unknown) || null,
          args: (params['args'] as unknown) || []
        });
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const exception = ((msg.params || {}) as Record<string, unknown>)['exceptionDetails'] as Record<string, unknown> || {};

        logEntry('EXCEPTION', {
          targetId,
          targetUrl,
          isPassive,
          message: (exception['text'] as string) || (exception['description'] as string) || 'Unknown exception',
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
        message: `Failed to handle CDP message: ${(err as Error).message}`
      });
    }
  }

  /**
   * Ensure CDP connection exists and is open
   */
  function ensureCDPConnection(targetId: string) {
    return new Promise((resolve, reject) => {
      if (cdpConnections.has(targetId)) {
        const conn = cdpConnections.get(targetId) as { ws: { readyState: number }; pendingRequests: Map<number, unknown> } | undefined;
        if (conn?.ws.readyState === WebSocket.OPEN) {
          resolve(conn);
          return;
        }
      }

      const wsUrl = `ws://${cdpHost}:${cdpPort}/devtools/page/${targetId}`;
      logEntry('PROXY', {
        message: `Connecting to CDP target`,
        targetId
      });

      const ws = new WebSocket(wsUrl);
      interface PendingRequest { resolve: (value: unknown) => void; timeout: ReturnType<typeof setTimeout> }
      const connObj: { ws: unknown; pendingRequests: Map<number, PendingRequest>; targetUrl?: string } = { ws, pendingRequests: new Map() };

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

      ws.on('message', (data: unknown) => {
        try {
          const msg = JSON.parse((data as Buffer).toString());

          if (msg.id && connObj.pendingRequests.has(msg.id)) {
            const pending = connObj.pendingRequests.get(msg.id)!;
            logEntry('RESPONSE', {
              targetId,
              requestId: msg.id
            });

            clearTimeout(pending.timeout);
            pending.resolve(msg);
            connObj.pendingRequests.delete(msg.id);
          } else {
            handleCDPMessage(msg, targetId, connObj.targetUrl || '', false);
          }
        } catch (err) {
          logEntry('ERROR', {
            message: `Failed to parse CDP message: ${(err as Error).message}`,
            targetId
          });
        }
      });

      ws.on('error', (err: Error) => {
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
  function sendToCDP(targetId: string, method: string, params: unknown) {
    return new Promise((resolve, reject) => {
      ensureCDPConnection(targetId)
        .then((connObjUnknown) => {
          interface PendingReq { resolve: (value: unknown) => void; timeout: ReturnType<typeof setTimeout> }
          interface ConnObj { ws: { send: (data: string, cb: (err?: Error) => void) => void; readyState: number }; pendingRequests: Map<number, PendingReq>; targetUrl?: string }
          const connObj = connObjUnknown as ConnObj;
          const id = globalMessageId++;
          const timeout = setTimeout(() => {
            connObj.pendingRequests.delete(id);
            reject(new Error(`Timeout waiting for response to ID ${id}`));
          }, 10000);

          connObj.pendingRequests.set(id, { resolve, timeout });

          const request: Record<string, unknown> = { id, method };
          if (params) request['params'] = params;
          logEntry('REQUEST', {
            targetId,
            requestId: id,
            cdpMethod: method
          });

          connObj.ws.send(JSON.stringify(request), (err?: Error) => {
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
      http.get(`http://${cdpHost}:${cdpPort}/json`, (res: unknown) => {
        const r = res as { on: (event: string, cb: (...args: unknown[]) => void) => void };
        let body = '';
        r.on('data', (chunk: unknown) => (body += String(chunk)));
        r.on('end', () => {
          try {
            const targets = JSON.parse(body) as Array<Record<string, unknown>>;
            const currentIds = new Set<string>();

            targets.forEach((target: Record<string, unknown>) => {
              if (target.id) {
                currentIds.add(target['id'] as string);
                targetMap.set(target['id'] as string, {
                  id: target['id'],
                  url: target['url'],
                  type: target['type'],
                  title: target['title'],
                  timestamp: Date.now()
                });
              }
            });

            // Prune disappeared targets
            const disappearedIds: string[] = [];
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

              if (passiveConnections.has(id)) {
                const conn = passiveConnections.get(id) as { ws?: { readyState: number; close: () => void } } | undefined;
                if (conn?.ws && conn.ws.readyState === WebSocket.OPEN) {
                  conn.ws.close();
                }
                passiveConnections.delete(id);
              }
            });

            resolve(targets);
          } catch (err) {
            logEntry('ERROR', {
              message: `Failed to parse targets JSON: ${(err as Error).message}`
            });
            resolve([]);
          }
        });
      }).on('error', (err: Error) => {
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
  function autoAttachTarget(targetId: string, targetUrl: string) {
    return new Promise((resolve) => {
      if (passiveConnections.has(targetId)) {
        const conn = passiveConnections.get(targetId) as { ws: { readyState: number }; targetUrl: string; isPassive: boolean } | undefined;
        if (conn?.ws.readyState === WebSocket.OPEN) {
          resolve(conn);
          return;
        }
      }

      const wsUrl = `ws://${cdpHost}:${cdpPort}/devtools/page/${targetId}`;
      const ws = new WebSocket(wsUrl);
      const connObj = { ws, targetUrl, isPassive: true };

      ws.on('open', () => {
        logEntry('PROXY', {
          message: `Passive connection opened`,
          targetId,
          targetUrl,
          status: 'connected',
          isPassive: true
        });
        passiveConnections.set(targetId, connObj);

        ws.send(JSON.stringify({
          id: globalMessageId++,
          method: 'Runtime.enable',
        }));

        resolve(connObj);
      });

      ws.on('message', (data: unknown) => {
        try {
          const msg = JSON.parse((data as Buffer).toString());
          handleCDPMessage(msg, targetId, targetUrl, true);
        } catch (err) {
          logEntry('ERROR', {
            message: `Failed to parse passive message: ${(err as Error).message}`,
            targetId,
            targetUrl
          });
        }
      });

      ws.on('error', (err: Error) => {
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
      const targets = await discoverTargets() as Array<Record<string, unknown>>;

      targets.forEach((target: Record<string, unknown>) => {
        if (target['id'] && !passiveConnections.has(target['id'] as string) && !cdpConnections.has(target['id'] as string)) {
          autoAttachTarget(target['id'] as string, target['url'] as string);
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
   * Start the WebSocket proxy server
   */
  function startProxyServer() {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      const wss = new WebSocketServer({ server });

      wss.on('connection', (clientWs: unknown) => {
        const cws = clientWs as { on: (event: string, cb: unknown) => void; send: (data: string) => void; readyState: number };
        logEntry('PROXY', {
          message: 'Client connected',
          status: 'connected'
        });
        let clientConnected = true;

        cws.on('message', async (data: unknown) => {
          try {
            const request = JSON.parse((data as Buffer).toString());
            const targetId = request.targetId;

            if (!targetId) {
              throw new Error('No targetId provided in request');
            }

            logEntry('REQUEST', {
              message: 'Client request',
              targetId,
              cdpMethod: request.method
            });

            const response = await sendToCDP(targetId, request.method, request.params) as Record<string, unknown>;

            const clientResponse: Record<string, unknown> = {
              result: response['result']
            };
            if (response['error']) clientResponse['error'] = response['error'];

            if (clientConnected && cws.readyState === WebSocket.OPEN) {
              cws.send(JSON.stringify(clientResponse));
              logEntry('RESPONSE', {
                message: 'Sent response to client'
              });
            }
          } catch (err) {
            logEntry('ERROR', {
              message: `Request error: ${(err as Error).message}`
            });
            if (clientConnected && cws.readyState === WebSocket.OPEN) {
              cws.send(JSON.stringify({ error: { message: (err as Error).message } }));
            }
          }
        });

        cws.on('close', () => {
          clientConnected = false;
          logEntry('PROXY', {
            message: 'Client disconnected',
            status: 'disconnected'
          });
        });

        cws.on('error', (err: Error) => {
          logEntry('ERROR', {
            message: `Client error: ${err.message}`
          });
          clientConnected = false;
        });
      });

      server.on('error', reject);

      server.listen(port, '127.0.0.1', () => {
        logEntry('PROXY', {
          message: `Proxy listening`,
          proxyUrl: `ws://127.0.0.1:${port}`,
          cdpHost,
          cdpPort,
          status: 'listening'
        });
        resolve(server);
      });
    });
  }

  // Start the proxy server
  try {
    const server = await startProxyServer() as { close: () => void; listen: unknown };

    logEntry('PROXY', {
      message: 'CDP Proxy started',
      pid: process.pid,
      status: 'started',
      port
    });

    // Start discovery loop
    startDiscoveryLoop();

    // Return shutdown function
    const shutdown = () => {
      if (serverShutdown) return;
      serverShutdown = true;

      logEntry('PROXY', {
        message: 'Shutting down gracefully',
        status: 'shutting_down'
      });

      stopDiscoveryLoop();

      // Close all passive connections
      passiveConnections.forEach((conn: unknown) => {
        const c = conn as { ws?: { readyState: number; close: () => void } };
        if (c.ws && c.ws.readyState === WebSocket.OPEN) {
          c.ws.close();
        }
      });
      passiveConnections.clear();

      // Close all CDP connections
      cdpConnections.forEach((conn: unknown) => {
        const c = conn as { ws?: { readyState: number; close: () => void } };
        if (c.ws && c.ws.readyState === WebSocket.OPEN) {
          c.ws.close();
        }
      });
      cdpConnections.clear();

      logEntry('PROXY', {
        message: 'All connections closed',
        status: 'shutdown_complete'
      });

      logStream.end();
      server.close();
    };

    return {
      server,
      port,
      logFile,
      shutdown,
      cdpPort,
      cdpHost
    };
  } catch (error) {
    logStream.end();
    throw error;
  }
}

export { createProxy };

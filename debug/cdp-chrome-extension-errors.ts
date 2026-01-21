#!/usr/bin/env ts-node
/**
 * Fetch extension manifest/runtime errors via chrome://extensions using CDP.
 *
 * Usage:
 *   node debug/run-headless.js debug/cdp-chrome-extension-errors.ts --name Surfingkeys
 *   CDP_PORT=9222 npx ts-node debug/cdp-chrome-extension-errors.ts --id=<extensionId>
 */

import { WebSocket, RawData } from 'ws';
import * as http from 'http';
import { getCDPVersionUrl } from '../tests/cdp/cdp-config';

interface Options {
    extensionId?: string;
    extensionName: string;
    forceReload: boolean;
    waitForErrorsMs: number;
    pollIntervalMs: number;
    startServiceWorker: boolean;
}

interface ExtensionErrorSummary {
    id: string;
    name: string;
    version?: string;
    enabled?: boolean;
    manifestErrors: any[];
    runtimeErrors: any[];
    installWarnings?: any[];
    timedOut?: boolean;
    pollAttempts?: number;
    waitedMs?: number;
    serviceWorkerStartError?: string | null;
}

let messageId = 0;

function parseArgs(): Options {
    const args = process.argv.slice(2);
    let extensionName = process.env.EXTENSION_NAME || 'Surfingkeys';
    let extensionId = process.env.EXTENSION_ID;
    let forceReload = (process.env.EXT_ERRORS_RELOAD || 'true') !== 'false';
    let startServiceWorker = (process.env.EXT_ERRORS_START_SW || 'true') !== 'false';
    const waitEnv = parseInt(process.env.EXT_ERRORS_WAIT_MS || '4000', 10);
    const pollEnv = parseInt(process.env.EXT_ERRORS_POLL_MS || '400', 10);
    let waitForErrorsMs = Number.isFinite(waitEnv) ? waitEnv : 4000;
    let pollIntervalMs = Number.isFinite(pollEnv) ? pollEnv : 400;

    args.forEach(arg => {
        if (arg.startsWith('--id=')) {
            extensionId = arg.slice('--id='.length);
        } else if (arg.startsWith('--name=')) {
            extensionName = arg.slice('--name='.length);
        } else if (arg === '--reload') {
            forceReload = true;
        } else if (arg === '--no-reload') {
            forceReload = false;
        } else if (arg === '--start-sw') {
            startServiceWorker = true;
        } else if (arg === '--no-start-sw') {
            startServiceWorker = false;
        } else if (arg.startsWith('--wait=')) {
            const parsed = parseInt(arg.slice('--wait='.length), 10);
            if (Number.isFinite(parsed)) {
                waitForErrorsMs = parsed;
            }
        } else if (arg.startsWith('--poll=')) {
            const parsed = parseInt(arg.slice('--poll='.length), 10);
            if (Number.isFinite(parsed)) {
                pollIntervalMs = parsed;
            }
        } else if (!arg.startsWith('--')) {
            extensionName = arg;
        }
    });

    waitForErrorsMs = Math.max(0, waitForErrorsMs);
    pollIntervalMs = Math.max(50, pollIntervalMs || 50);

    return { extensionId, extensionName, forceReload, waitForErrorsMs, pollIntervalMs, startServiceWorker };
}

function fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                res.resume();
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (err: any) {
                    reject(new Error(`Failed to parse JSON from ${url}: ${err.message}`));
                }
            });
        }).on('error', reject);
    });
}

async function getBrowserWebSocketUrl(): Promise<string> {
    const versionInfo = await fetchJson(getCDPVersionUrl());
    if (!versionInfo.webSocketDebuggerUrl) {
        throw new Error('CDP did not return a browser WebSocket endpoint');
    }
    return versionInfo.webSocketDebuggerUrl;
}

async function connectBrowser(): Promise<WebSocket> {
    const browserWsUrl = await getBrowserWebSocketUrl();
    return connectWebSocket(browserWsUrl);
}

function connectWebSocket(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
    });
}

function sendCommand<T = any>(ws: WebSocket, method: string, params: Record<string, any> = {}, sessionId?: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const id = ++messageId;
        const message: any = { id, method, params };
        if (sessionId) {
            message.sessionId = sessionId;
        }

        const handleMessage = (data: RawData) => {
            const payload = JSON.parse(data.toString());
            if (payload.id !== id) {
                return;
            }

            ws.removeListener('message', handleMessage);

            if (payload.error) {
                reject(new Error(payload.error.message || `CDP error for ${method}`));
                return;
            }

            resolve(payload.result as T);
        };

        ws.on('message', handleMessage);
        ws.send(JSON.stringify(message));
    });
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForSessionEvent(ws: WebSocket, sessionId: string, method: string, timeout = 2000): Promise<any> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            ws.removeListener('message', handler);
            reject(new Error(`Timeout waiting for ${method}`));
        }, timeout);

        const handler = (data: RawData) => {
            const payload = JSON.parse(data.toString());
            if (payload.sessionId === sessionId && payload.method === method) {
                clearTimeout(timer);
                ws.removeListener('message', handler);
                resolve(payload.params);
            }
        };

        ws.on('message', handler);
    });
}

function formatErrorList(label: string, errors: any[]): string {
    if (!errors || errors.length === 0) {
        return `${label}: none`;
    }

    const lines = errors.map((err, index) => {
        const location = err.source || err.pageUrl || err.contextUrl || 'unknown';
        const message = err.message || err.errorMessage || 'Unknown error';
        const stack = err.stackTrace ? `\n      stack: ${JSON.stringify(err.stackTrace)}` : '';
        return `  [${index + 1}] ${message}\n      at ${location}${stack}`;
    });

    return `${label}:\n${lines.join('\n')}`;
}

function hasDetectedErrors(summary: ExtensionErrorSummary): boolean {
    const manifestCount = summary.manifestErrors ? summary.manifestErrors.length : 0;
    const runtimeCount = summary.runtimeErrors ? summary.runtimeErrors.length : 0;
    return manifestCount > 0 || runtimeCount > 0;
}

async function readExtensionErrors(browserWs: WebSocket, options: Options): Promise<ExtensionErrorSummary> {
    let createdTargetId: string | null = null;

    try {
        const { targetId } = await sendCommand<{ targetId: string }>(browserWs, 'Target.createTarget', {
            url: 'chrome://extensions/'
        });
        createdTargetId = targetId;

        const { sessionId } = await sendCommand<{ sessionId: string }>(browserWs, 'Target.attachToTarget', {
            targetId,
            flatten: true
        });

        await sendCommand(browserWs, 'Runtime.enable', {}, sessionId);
        await delay(500); // Give the page a moment to finish loading scripts

        const evalResult = await sendCommand<any>(browserWs, 'Runtime.evaluate', {
            expression: buildEvaluationScript(options),
            awaitPromise: true,
            returnByValue: true
        }, sessionId);

        if (evalResult.exceptionDetails) {
            throw new Error(evalResult.exceptionDetails.text || 'Runtime evaluation failed');
        }

        const payload = evalResult.result?.value;
        if (!payload) {
            throw new Error('chrome://extensions evaluation returned empty payload');
        }

        if (payload.error) {
            const details = payload.available ? ` Available: ${payload.available.map((i: any) => `${i.name} (${i.id})`).join(', ')}` : '';
            throw new Error(`developerPrivate error: ${payload.error}.${details}`);
        }

        return {
            id: payload.id,
            name: payload.name,
            version: payload.version,
            installWarnings: payload.installWarnings || [],
            manifestErrors: payload.manifestErrors || [],
            runtimeErrors: payload.runtimeErrors || [],
            timedOut: payload.timedOut,
            pollAttempts: payload.pollAttempts,
            waitedMs: payload.waitedMs
        };
    } finally {
        if (createdTargetId) {
            try {
                await sendCommand(browserWs, 'Target.closeTarget', { targetId: createdTargetId });
            } catch (err) {
                // ignore cleanup errors
            }
        }
    }
}

async function activateExtensionContext(browserWs: WebSocket, extensionId: string): Promise<void> {
    let targetId: string | null = null;
    try {
        const createResult = await sendCommand<{ targetId: string }>(browserWs, 'Target.createTarget', {
            url: 'about:blank'
        });
        targetId = createResult.targetId;

        const { sessionId } = await sendCommand<{ sessionId: string }>(browserWs, 'Target.attachToTarget', {
            targetId,
            flatten: true
        });

        await sendCommand(browserWs, 'Runtime.enable', {}, sessionId);
        await sendCommand(browserWs, 'Page.enable', {}, sessionId);
        await sendCommand(browserWs, 'Page.navigate', {
            url: `chrome-extension://${extensionId}/pages/frontend.html`
        }, sessionId);

        await waitForSessionEvent(browserWs, sessionId, 'Page.loadEventFired', 2000).catch(() => delay(500));

        const evalResult = await sendCommand<any>(browserWs, 'Runtime.evaluate', {
            expression: `(() => {
                if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
                    return { error: 'chrome.runtime.sendMessage unavailable' };
                }
                return new Promise(resolve => {
                    chrome.runtime.sendMessage({ type: 'cdp-error-probe', time: Date.now() }, () => {
                        const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
                        resolve({ acknowledged: true, lastError: err });
                    });
                });
            })();`,
            awaitPromise: true,
            returnByValue: true
        }, sessionId);

        if (evalResult?.result?.value) {
            console.log('Extension ping response:', JSON.stringify(evalResult.result.value));
        }

        await delay(500);
    } catch (error) {
        console.warn('Warning: Failed to ping extension context:', (error as Error).message);
    } finally {
        if (targetId) {
            try {
                await sendCommand(browserWs, 'Target.closeTarget', { targetId });
            } catch (err) {
                // ignore cleanup errors
            }
        }
    }
}

function buildEvaluationScript(options: Options): string {
    const { extensionId, extensionName } = options;
    const maxAttempts = Math.max(1, Math.round(options.waitForErrorsMs / options.pollIntervalMs) || 1);
    return `(() => {
        const forcedId = ${extensionId ? JSON.stringify(extensionId) : 'null'};
        const targetName = ${JSON.stringify(extensionName)};
        const normalizedName = targetName.toLowerCase();
        const pollInterval = ${options.pollIntervalMs};
        const maxAttempts = ${maxAttempts};
        const forceReload = ${options.forceReload ? 'true' : 'false'};
        const shouldStartServiceWorker = ${options.startServiceWorker ? 'true' : 'false'};

        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        function selectTarget(list) {
            if (!Array.isArray(list)) return null;
            if (forcedId) {
                return list.find(info => info.id === forcedId) || null;
            }
            return list.find(info => (info.name || '').toLowerCase() === normalizedName) || null;
        }

        function lastError() {
            return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError)
                ? chrome.runtime.lastError.message
                : null;
        }

        if (typeof chrome === 'undefined' || !chrome.developerPrivate) {
            return { error: 'chrome.developerPrivate is unavailable in this context' };
        }

        return (async () => {
            const infos = await new Promise(resolve => {
                chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true }, resolve);
            });

            const infoError = lastError();
            if (infoError) {
                return { error: infoError, stage: 'getExtensionsInfo' };
            }

            const target = selectTarget(infos);
            if (!target) {
                return {
                    error: 'Extension not found',
                    extensionName: targetName,
                    extensionId: forcedId,
                    available: (infos || []).map(info => ({ id: info.id, name: info.name }))
                };
            }

            if (forceReload) {
                await new Promise(resolve => {
                    chrome.developerPrivate.reload(target.id, {}, () => resolve(true));
                });
                const reloadError = lastError();
                if (reloadError) {
                    return { error: reloadError, stage: 'reload', extensionId: target.id };
                }
            }

            let serviceWorkerStartError = null;
            if (shouldStartServiceWorker) {
                await new Promise(resolve => {
                    chrome.developerPrivate.openDevTools({
                        extensionId: target.id,
                        renderProcessId: -1,
                        renderViewId: -1,
                        isServiceWorker: true
                    }, () => resolve(true));
                });
                const devtoolsError = lastError();
                if (devtoolsError) {
                    serviceWorkerStartError = devtoolsError;
                }
            }

            let lastDetails = null;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                lastDetails = await new Promise(resolve => {
                    chrome.developerPrivate.getExtensionInfo(target.id, resolve);
                });

                const detailError = lastError();
                if (detailError) {
                    return { error: detailError, stage: 'getExtensionInfo', extensionId: target.id };
                }

                const manifestErrors = lastDetails?.manifestErrors || [];
                const runtimeErrors = lastDetails?.runtimeErrors || [];
                if (manifestErrors.length > 0 || runtimeErrors.length > 0) {
                    return {
                        id: lastDetails.id,
                        name: lastDetails.name,
                        version: lastDetails.version,
                        enabled: lastDetails.enabled,
                        installWarnings: lastDetails.installWarnings || [],
                        manifestErrors,
                        runtimeErrors,
                        pollAttempts: attempt + 1,
                        waitedMs: attempt * pollInterval,
                        timedOut: false,
                        serviceWorkerStartError
                    };
                }

                if (attempt < maxAttempts - 1) {
                    await delay(pollInterval);
                }
            }

            if (!lastDetails) {
                return { error: 'Failed to retrieve extension details' };
            }

            return {
                id: lastDetails.id,
                name: lastDetails.name,
                version: lastDetails.version,
                enabled: lastDetails.enabled,
                installWarnings: lastDetails.installWarnings || [],
                manifestErrors: lastDetails.manifestErrors || [],
                runtimeErrors: lastDetails.runtimeErrors || [],
                pollAttempts: maxAttempts,
                waitedMs: (maxAttempts - 1) * pollInterval,
                timedOut: true,
                serviceWorkerStartError
            };
        })();
    })();`;
}

async function main() {
    const options = parseArgs();
    console.log(`Checking chrome://extensions errors for ${options.extensionId || options.extensionName}...`);

    const browserWs = await connectBrowser();

    try {
        let summary = await readExtensionErrors(browserWs, options);

        if (!hasDetectedErrors(summary)) {
            console.log('\nNo errors reported yet. Pinging extension context to trigger service worker...');
            if (!summary.id) {
                throw new Error('Extension ID unavailable for activation');
            }
            await activateExtensionContext(browserWs, summary.id);

            // Re-check without forcing another reload to capture fresh runtime errors
            const retryOptions = { ...options, forceReload: false, startServiceWorker: false };
            summary = await readExtensionErrors(browserWs, retryOptions);
        }

        console.log(`\nExtension: ${summary.name} (${summary.id})`);
        if (summary.version) {
            console.log(`Version: ${summary.version}`);
        }
        if (typeof (summary as any).enabled !== 'undefined') {
            console.log(`Enabled: ${summary.enabled ? 'yes' : 'no'}`);
        }
        if (summary.pollAttempts || summary.waitedMs) {
            const waited = summary.waitedMs ?? 0;
            const attempts = summary.pollAttempts ?? '?';
            const suffix = summary.timedOut ? ' (timed out waiting for errors)' : '';
            console.log(`Polled: ${attempts} attempt(s) over ${waited}ms${suffix}`);
        }
        if (summary.serviceWorkerStartError) {
            console.warn(`Service worker start attempt error: ${summary.serviceWorkerStartError}`);
        }

        console.log(formatErrorList('Manifest errors', summary.manifestErrors));
        console.log();
        console.log(formatErrorList('Runtime errors', summary.runtimeErrors));

        if (hasDetectedErrors(summary)) {
            console.error('\n✗ Extension has errors (see details above)');
            process.exit(1);
        }

        if (summary.timedOut) {
            console.warn('\n⚠ No errors detected, but polling timed out before any appeared.');
        } else {
            console.log('\n✓ No manifest/runtime errors reported by chrome://extensions');
        }
        process.exit(0);
    } finally {
        if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.close();
        }
    }
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});

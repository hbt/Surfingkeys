import WebSocket from 'ws';

export interface CoverageTarget {
    id: string;
    type: string;
    title?: string;
    url?: string;
    webSocketDebuggerUrl?: string;
}

export interface CoverageData {
    scriptId: string;
    url: string;
    ranges: Array<{ startOffset: number; endOffset: number; count: number }>;
}

interface CDPMessage {
    id: number;
    method?: string;
    params?: any;
    result?: any;
    error?: { message: string };
}

/**
 * Send a CDP command and wait for response
 */
function sendCDPCommand(ws: WebSocket, id: number, method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout waiting for response to ${method}`));
        }, 5000);

        const handler = (data: Buffer) => {
            try {
                const msg: CDPMessage = JSON.parse(data.toString());
                if (msg.id === id) {
                    clearTimeout(timeout);
                    ws.removeListener('message', handler);

                    if (msg.error) {
                        reject(new Error(msg.error.message));
                    } else {
                        resolve(msg.result);
                    }
                }
            } catch (err) {
                console.error('Error parsing CDP response:', err);
                reject(err);
            }
        };

        ws.on('message', handler);
        const cmd = { id, method, ...(params ? { params } : {}) };
        console.log(`[CDP] Sending: ${method}`);
        ws.send(JSON.stringify(cmd));
    });
}

/**
 * Get list of scripts in a target context
 */
export async function getScriptsInTarget(wsUrl: string): Promise<any[]> {
    return new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        let scriptList: any[] = [];
        let messageId = 1;
        const scripts: any[] = [];

        const timeout = setTimeout(() => {
            console.log('Timeout getting scripts');
            ws.close();
            resolve(scripts);
        }, 5000);

        ws.on('open', async () => {
            try {
                // Enable Debugger domain
                console.log('Enabling Debugger domain...');
                await sendCDPCommand(ws, messageId++, 'Debugger.enable');

                console.log('✅ Debugger enabled - waiting for Debugger.scriptParsed events...');

                // Set up listener for script parsed events
                const scriptListener = (data: Buffer) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.method === 'Debugger.scriptParsed') {
                        const script = msg.params;
                        console.log(`  Found script: ${script.url}`);
                        scripts.push(script);
                    }
                };

                ws.on('message', scriptListener);

                // Wait for any parsed scripts to be reported
                await new Promise(r => setTimeout(r, 500));

                clearTimeout(timeout);
                ws.close();
                resolve(scripts);
            } catch (err) {
                console.error('Error getting scripts:', err);
                clearTimeout(timeout);
                ws.close();
                resolve(scripts);
            }
        });

        ws.on('error', (err) => {
            console.error('WebSocket error:', err);
            clearTimeout(timeout);
            resolve(scripts);
        });
    });
}

/**
 * Collect V8 coverage data via CDP from a remote debugging port
 */
export async function collectV8Coverage(wsUrl: string, timeoutMs = 15000): Promise<CoverageData[] | null> {
    return new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        let coverage: CoverageData[] = [];
        let messageId = 1;

        const timeoutHandle = setTimeout(() => {
            console.log('Coverage collection timeout');
            ws.close();
            resolve(null);
        }, timeoutMs);

        ws.on('open', async () => {
            try {
                console.log('CDP WebSocket connected');

                // Enable Debugger domain
                console.log('[Step 1] Enabling Debugger...');
                await sendCDPCommand(ws, messageId++, 'Debugger.enable');

                // Enable Profiler domain
                console.log('[Step 2] Enabling Profiler...');
                await sendCDPCommand(ws, messageId++, 'Profiler.enable');

                // Enable Runtime to monitor code execution
                console.log('[Step 3] Enabling Runtime...');
                await sendCDPCommand(ws, messageId++, 'Runtime.enable');

                // Start precise coverage
                console.log('[Step 4] Starting precise coverage...');
                await sendCDPCommand(ws, messageId++, 'Profiler.startPreciseCoverage', {
                    callCount: true,
                    detailed: true,
                });

                // Wait for code to execute during coverage collection
                console.log('[Step 5] Waiting for code execution (coverage active)...');
                await new Promise(r => setTimeout(r, 1000));

                // Take coverage
                console.log('[Step 6] Taking coverage...');
                const coverageResult = await sendCDPCommand(ws, messageId++, 'Profiler.takePreciseCoverage');
                coverage = coverageResult?.result || [];

                console.log(`Collected coverage for ${coverage.length} scripts`);
                if (coverage.length > 0) {
                    console.log('\nCoverage summary:');
                    coverage.forEach((c: any, idx: number) => {
                        console.log(`  Script ${idx + 1}: url=${c.url || '(anonymous)'}, scriptId=${c.scriptId}, functions=${c.functions?.length || 0}`);
                    });
                }
                clearTimeout(timeoutHandle);
                ws.close();
                resolve(coverage.length > 0 ? coverage : null);
            } catch (err) {
                console.error('Coverage collection error:', err);
                clearTimeout(timeoutHandle);
                ws.close();
                resolve(null);
            }
        });

        ws.on('error', (err) => {
            console.error('CDP WebSocket error:', err);
            clearTimeout(timeoutHandle);
            resolve(null);
        });
    });
}

/**
 * Calculate coverage statistics from collected data
 */
export function calculateCoverageStats(coverage: any[]) {
    let totalBytes = 0;
    let coveredBytes = 0;
    const byUrl: Map<string, { total: number; covered: number }> = new Map();

    coverage.forEach((script: any) => {
        let scriptBytes = 0;
        let scriptCovered = 0;

        // Handle function-based coverage (Profiler.takePreciseCoverage format)
        if (script.functions && Array.isArray(script.functions)) {
            script.functions.forEach((func: any) => {
                if (func.ranges && Array.isArray(func.ranges)) {
                    func.ranges.forEach((range: any) => {
                        const bytes = range.endOffset - range.startOffset;
                        scriptBytes += bytes;
                        if (range.count > 0) {
                            scriptCovered += bytes;
                        }
                    });
                }
            });
        }
        // Handle direct ranges (other coverage formats)
        else if (script.ranges && Array.isArray(script.ranges)) {
            script.ranges.forEach((range: any) => {
                const bytes = range.endOffset - range.startOffset;
                scriptBytes += bytes;
                if (range.count > 0) {
                    scriptCovered += bytes;
                }
            });
        }

        totalBytes += scriptBytes;
        coveredBytes += scriptCovered;

        const url = script.url || '(anonymous)';
        const existing = byUrl.get(url) || { total: 0, covered: 0 };
        existing.total += scriptBytes;
        existing.covered += scriptCovered;
        byUrl.set(url, existing);
    });

    const percent = totalBytes > 0 ? (coveredBytes / totalBytes) * 100 : 0;

    return {
        totalBytes,
        coveredBytes,
        percentage: parseFloat(percent.toFixed(2)),
        byUrl: Object.fromEntries(byUrl.entries()),
    };
}

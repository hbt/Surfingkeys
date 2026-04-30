import WebSocket from 'ws';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// ─── Service Worker Coverage ──────────────────────────────────────────────────

type FuncKey = string; // `${scriptId}:${startOffset}`

export interface CoverageDeltaEntry {
    url: string;
    name: string;
    calls: number;
}

export interface CoverageDelta {
    functions: CoverageDeltaEntry[];
    scriptUrl: string | null;
}

/**
 * Stateful V8 coverage session connected to the extension service worker.
 *
 * Usage:
 *   const cov = new ServiceWorkerCoverage();
 *   await cov.init(cdpPort);          // connect + start profiler
 *
 *   await cov.snapshot();             // baseline before action
 *   await invokeCommand(...);
 *   const delta = await cov.delta();  // functions hit during action
 *   printCoverageDelta(delta);
 *
 *   await cov.close();                // cleanup
 */
export class ServiceWorkerCoverage {
    private ws: WebSocket | null = null;
    private msgId = 0;
    private baseline = new Map<FuncKey, number>();
    private swUrl: string | null = null;

    /**
     * @param cdpPort  Remote debugging port Chrome was started with.
     * @param targetFilter  Optional predicate to select the CDP target.
     *   Defaults to the extension service worker (background.js).
     *   Pass a custom predicate to profile content scripts on a specific page:
     *     (t) => t.type === 'page' && t.url.includes('scroll-test.html')
     */
    async init(cdpPort: number, targetFilter?: (t: any) => boolean): Promise<boolean> {
        const filter = targetFilter ??
            ((t: any) => t.type === 'service_worker' && t.url?.includes('background.js'));
        try {
            const targets = await this.fetchTargets(cdpPort);
            const sw = targets.find(filter);
            if (!sw?.webSocketDebuggerUrl) {
                console.warn(
                    '[Coverage] Target not found. Available targets:\n' +
                        targets.map((t: any) => `  ${t.type}: ${t.url}`).join('\n'),
                );
                return false;
            }
            this.swUrl = sw.url;

            await this.connect(sw.webSocketDebuggerUrl);
            await this.cmd('Profiler.enable');
            await this.cmd('Profiler.startPreciseCoverage', { callCount: true, detailed: true });

            // Establish baseline so the first delta() is relative to startup state
            await this.snapshot();
            return true;
        } catch (err) {
            console.error('[Coverage] init failed:', err);
            return false;
        }
    }

    /** Capture current call counts as the baseline for the next delta(). */
    async snapshot(): Promise<void> {
        if (!this.ws) return;
        const result = await this.cmd('Profiler.takePreciseCoverage');
        this.baseline = this.buildCountMap(result);
    }

    /**
     * Take a fresh snapshot and return only the functions whose call count
     * increased since the last snapshot() call (i.e., what ran during the action).
     * Advances the baseline to now so successive delta() calls don't accumulate.
     */
    async delta(): Promise<CoverageDelta> {
        if (!this.ws) return { functions: [], scriptUrl: null };

        const result = await this.cmd('Profiler.takePreciseCoverage');
        const hit: CoverageDeltaEntry[] = [];

        for (const script of result?.result ?? []) {
            for (const func of script.functions ?? []) {
                const key: FuncKey = `${script.scriptId}:${func.ranges?.[0]?.startOffset ?? 0}`;
                const before = this.baseline.get(key) ?? 0;
                const after: number = func.ranges?.[0]?.count ?? 0;
                const diff = after - before;
                if (diff > 0) {
                    hit.push({ url: script.url, name: func.functionName || '<anonymous>', calls: diff });
                }
            }
        }

        this.baseline = this.buildCountMap(result);
        return { functions: hit.sort((a, b) => b.calls - a.calls), scriptUrl: this.swUrl };
    }

    /**
     * Take a final coverage snapshot and write raw V8 JSON to disk.
     * Replaces console-heavy printCoverageDelta for file-based persistence.
     *
     * Output: `<outputDir>/<label>/<ISO-timestamp>.v8.json`
     * Schema: { spec, target, scriptUrl, timestamp, result: ScriptCoverage[] }
     *
     * Prints a single line to stdout: [Coverage:<label>] saved → <path>
     * Returns the file path, or null if not connected / COVERAGE not set.
     */
    async flush(label: string, outputDir: string = 'coverage-raw'): Promise<string | null> {
        if (!this.ws) return null;
        const raw = await this.cmd('Profiler.takePreciseCoverage');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dir = path.join(outputDir, label);
        fs.mkdirSync(dir, { recursive: true });

        // Subtract baseline so counts reflect only what ran during the test,
        // not extension startup or page-load initialization.
        const result = (raw?.result ?? []).map((script: any) => ({
            ...script,
            functions: (script.functions ?? []).map((func: any) => ({
                ...func,
                ranges: (func.ranges ?? []).map((range: any) => {
                    const base = this.baseline.get(`${script.scriptId}:${range.startOffset}`) ?? 0;
                    return { ...range, count: Math.max(0, range.count - base) };
                }),
            })),
        }));

        const filePath = path.join(dir, `${timestamp}.v8.json`);
        const payload = {
            spec: label,
            target: this.swUrl?.includes('background.js') ? 'service_worker' : 'page',
            scriptUrl: this.swUrl,
            timestamp: new Date().toISOString(),
            result,
        };
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
        console.log(`[Coverage:${label}] saved → ${filePath}`);
        return filePath;
    }

    async close(): Promise<void> {
        if (!this.ws) return;
        try { await this.cmd('Profiler.stopPreciseCoverage'); } catch {}
        this.ws.close();
        this.ws = null;
    }

    private fetchTargets(cdpPort: number): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const req = http.request(
                { hostname: 'localhost', port: cdpPort, path: '/json/list', method: 'GET', timeout: 3000 },
                (res) => {
                    let data = '';
                    res.on('data', (c) => (data += c));
                    res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
                },
            );
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('CDP target list timeout')); });
            req.end();
        });
    }

    private connect(wsUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(wsUrl);
            const timer = setTimeout(() => reject(new Error('WebSocket connect timeout')), 5000);
            ws.once('open', () => { clearTimeout(timer); this.ws = ws; resolve(); });
            ws.once('error', (e) => { clearTimeout(timer); reject(e); });
        });
    }

    private cmd(method: string, params?: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.ws) return reject(new Error('Not connected'));
            const id = ++this.msgId;
            const timer = setTimeout(() => {
                this.ws?.removeListener('message', handler);
                reject(new Error(`CDP timeout: ${method}`));
            }, 8000);
            const handler = (data: Buffer) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.id !== id) return;
                    clearTimeout(timer);
                    this.ws?.removeListener('message', handler);
                    if (msg.error) { reject(new Error(msg.error.message)); } else { resolve(msg.result); }
                } catch {}
            };
            this.ws.on('message', handler);
            this.ws.send(JSON.stringify({ id, method, ...(params ? { params } : {}) }));
        });
    }

    private buildCountMap(result: any): Map<FuncKey, number> {
        const map = new Map<FuncKey, number>();
        for (const script of result?.result ?? []) {
            for (const func of script.functions ?? []) {
                for (const range of func.ranges ?? []) {
                    const key: FuncKey = `${script.scriptId}:${range.startOffset}`;
                    map.set(key, range.count);
                }
            }
        }
        return map;
    }
}

/**
 * Print a coverage delta to stdout in a compact, human-readable format.
 * Shows only functions that were actually called, sorted by call count.
 * If the data is meaningful, you will see extension-specific function names.
 */
export function printCoverageDelta(delta: CoverageDelta, label: string): void {
    if (delta.functions.length === 0) {
        console.log(`[Coverage:${label}] ⚠ No service worker functions executed`);
        return;
    }
    // Show script URL once (truncated to extension ID + filename)
    const scriptLabel = delta.scriptUrl
        ? delta.scriptUrl.replace(/chrome-extension:\/\/[^/]+\//, 'ext://')
        : 'unknown';
    console.log(`\n[Coverage:${label}] ${delta.functions.length} functions hit — ${scriptLabel}`);
    delta.functions.slice(0, 30).forEach((f) => {
        console.log(`  x${String(f.calls).padStart(3)}  ${f.name}`);
    });
}

// ─── Legacy helpers (kept for compatibility) ──────────────────────────────────


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

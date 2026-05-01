/**
 * Shared Playwright helpers for Chrome extension (MV3) tests.
 * Used by all spec files under tests/playwright/commands/.
 */

import { chromium, BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';

async function findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as net.AddressInfo;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

export const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/development/chrome');
export const FIXTURE_BASE = 'http://127.0.0.1:9873';

/**
 * Launch a persistent Chrome context with the Surfingkeys extension loaded.
 * Creates a temp user-data dir with developer_mode enabled.
 */
export async function launchExtensionContext(opts?: { headless?: boolean; enableCoverage?: boolean }): Promise<{
    context: BrowserContext;
    userDataDir: string;
    cdpPort?: number;
}> {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-test-'));
    const defaultDir = path.join(userDataDir, 'Default');
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.writeFileSync(
        path.join(defaultDir, 'Preferences'),
        JSON.stringify({ extensions: { ui: { developer_mode: true } } }),
    );

    const headless = opts?.headless ?? true;
    const enableCoverage = opts?.enableCoverage ?? false;

    // Find an available port for remote debugging
    let cdpPort: number | undefined;
    if (enableCoverage) {
        cdpPort = await findFreePort();
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            ...(headless ? ['--headless=new'] : []),
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--enable-experimental-extension-apis',
            '--enable-features=UserScriptsAPI',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-background-networking',
            '--disable-sync',
            '--no-pings',
            '--metrics-recording-only',
            ...(enableCoverage ? [`--remote-debugging-port=${cdpPort}`] : []),
        ],
    });

    return { context, userDataDir, cdpPort };
}

/**
 * Invoke a SurfingKeys command directly by unique_id, bypassing keybinding dispatch.
 *
 * Uses the __sk_invoke DOM CustomEvent bridge: content scripts run in an isolated
 * world but share the DOM. page.evaluate() runs in the main world and dispatches
 * the event; the content script listener fires synchronously and writes the result
 * to a dataset attribute that the main world reads back.
 *
 * Usage:
 *   await invokeCommand(page, 'cmd_tab_close_magic_right');
 */
export async function invokeCommand(
    page: import('@playwright/test').Page,
    unique_id: string,
): Promise<boolean> {
    await page.waitForFunction(
        () => (document.documentElement.dataset as any).skInvokeReady === 'true',
        { timeout: 10000 },
    );

    for (let i = 0; i < 3; i++) {
        const ok = await page.evaluate((uid) => {
            delete (document.documentElement.dataset as any).skInvokeResult;
            document.dispatchEvent(new CustomEvent('__sk_invoke', { detail: uid }));
            return (document.documentElement.dataset as any).skInvokeResult === 'true';
        }, unique_id);
        if (ok) {
            return true;
        }
        await page.waitForTimeout(50);
    }
    return false;
}

/**
 * Wait for the command invocation bridge to be ready in content script.
 */
export async function waitForInvokeReady(
    page: import('@playwright/test').Page,
    timeoutMs = 10000,
): Promise<void> {
    await page.waitForFunction(
        () => (document.documentElement.dataset as any).skInvokeReady === 'true',
        { timeout: timeoutMs },
    );
}

export async function invokeCommandRaw(
    page: import('@playwright/test').Page,
    unique_id: string,
): Promise<boolean> {
    return page.evaluate((uid) => {
        delete (document.documentElement.dataset as any).skInvokeResult;
        document.dispatchEvent(new CustomEvent('__sk_invoke', { detail: uid }));
        return (document.documentElement.dataset as any).skInvokeResult === 'true';
    }, unique_id);
}

/**
 * Override a runtime.conf value in the content script via the __sk_conf_override DOM bridge.
 * Returns true if the key existed and was set, false otherwise.
 */
export async function setSkConf(page: import('@playwright/test').Page, key: string, value: unknown): Promise<boolean> {
    return page.evaluate(({ key, value }) => {
        delete (document.documentElement.dataset as any).skConfOverrideResult;
        document.dispatchEvent(new CustomEvent('__sk_conf_override', { detail: { key, value } }));
        return (document.documentElement.dataset as any).skConfOverrideResult === 'true';
    }, { key, value });
}

/**
 * Navigate to a URL and wait for Surfingkeys content script to settle.
 */
export async function waitForSKReady(page: import('@playwright/test').Page, settleMs = 500): Promise<void> {
    await page.waitForTimeout(settleMs);
}

/**
 * Wait for the page to reach load state.
 */
export async function waitForPageNavigation(
    page: import('@playwright/test').Page,
    timeoutMs = 10000,
): Promise<void> {
    await page.waitForLoadState('load', { timeout: timeoutMs });
}

/**
 * Send a key press and wait for a scroll event that moves at least `minDelta` px
 * in the given direction.  Returns { baseline, final, delta }.
 */
export async function sendKeyAndWaitForScroll(
    page: import('@playwright/test').Page,
    key: string,
    opts: {
        direction: 'up' | 'down' | 'left' | 'right';
        minDelta: number;
        timeoutMs?: number;
    },
): Promise<{ baseline: number; final: number; delta: number }> {
    const timeoutMs = opts.timeoutMs ?? 5000;
    const isHorizontal = opts.direction === 'left' || opts.direction === 'right';

    const scrollPromise = page.evaluate(
        ({ direction, minDelta, timeoutMs, isHorizontal }) => {
            return new Promise<{ baseline: number; final: number }>((resolve) => {
                const baseline = isHorizontal ? window.scrollX : window.scrollY;
                let resolved = false;

                const listener = () => {
                    if (resolved) return;
                    const current = isHorizontal ? window.scrollX : window.scrollY;
                    const delta =
                        direction === 'up' || direction === 'left'
                            ? baseline - current
                            : current - baseline;
                    if (delta >= minDelta) {
                        resolved = true;
                        window.removeEventListener('scroll', listener);
                        resolve({ baseline, final: current });
                    }
                };

                window.addEventListener('scroll', listener);

                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        window.removeEventListener('scroll', listener);
                        resolve({ baseline, final: isHorizontal ? window.scrollX : window.scrollY });
                    }
                }, timeoutMs);
            });
        },
        { direction: opts.direction, minDelta: opts.minDelta, timeoutMs, isHorizontal },
    );

    await page.keyboard.press(key);

    const { baseline, final: finalPos } = await scrollPromise;

    const delta =
        opts.direction === 'up' || opts.direction === 'left'
            ? baseline - finalPos
            : finalPos - baseline;

    return { baseline, final: finalPos, delta };
}

/**
 * Fetch CDP debugger list from remote debugging port
 */
export async function testCDPConnectivity(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port,
            path: '/json/list',
            method: 'GET',
            timeout: 2000,
        };

        const req = require('http').request(options, (res: any) => {
            resolve(res.statusCode === 200);
        });

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.end();
    });
}

/**
 * Collect list of CDP targets from remote debugging port
 */
export async function collectCDPCoverage(port: number): Promise<any> {
    try {
        const targets = await new Promise<any>((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port,
                path: '/json/list',
                method: 'GET',
            };

            const req = require('http').request(options, (res: any) => {
                let data = '';
                res.on('data', (chunk: string) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });

        return Array.isArray(targets) ? targets : [];
    } catch (err) {
        console.error('Failed to collect CDP targets:', err);
        return [];
    }
}

/**
 * Drop-in replacement for launchExtensionContext that also initialises a
 * ServiceWorkerCoverage session when COVERAGE=true.
 *
 * @param fixtureUrl  Optional fixture page URL substring (e.g. FIXTURE_BASE + '/scroll-test.html').
 *   When provided, coverage is NOT connected at launch time (the page doesn't exist yet).
 *   Instead, call `await covInit()` after `page.goto()` to connect the profiler.
 *   When omitted, coverage connects immediately to the extension service worker.
 *
 * Usage — background commands (SW target, init at launch):
 *   const { context, cov } = await launchWithCoverage();
 *
 * Usage — content-script commands (page target, init after navigation):
 *   const { context, cov, covInit } = await launchWithCoverage(FIXTURE_URL);
 *   await page.goto(FIXTURE_URL);
 *   await covInit();   // connects profiler to the now-existing page target
 */
export async function launchWithCoverage(fixtureUrl?: string): Promise<{
    context: BrowserContext;
    userDataDir: string;
    cov: import('./cdp-coverage').ServiceWorkerCoverage | undefined;
    /** Call after page.goto() when fixtureUrl was supplied, to connect the page-target profiler. */
    covInit: () => Promise<import('./cdp-coverage').ServiceWorkerCoverage | undefined>;
}> {
    const isCoverage = process.env.COVERAGE === 'true';
    const result = await launchExtensionContext({ enableCoverage: isCoverage });

    let cov: import('./cdp-coverage').ServiceWorkerCoverage | undefined;

    if (isCoverage && result.cdpPort && !fixtureUrl) {
        // SW target: page exists at launch — init immediately.
        const { ServiceWorkerCoverage } = require('./cdp-coverage');
        cov = new ServiceWorkerCoverage();
        const filter = (t: any) => t.type === 'service_worker' && t.url?.includes('background.js');
        const ok = await cov!.init(result.cdpPort, filter);
        if (!ok) cov = undefined;
    }

    // For page targets the fixture page doesn't exist yet; return a deferred init closure.
    // covInit() returns the connected ServiceWorkerCoverage (or undefined on failure).
    const covInit = async (): Promise<import('./cdp-coverage').ServiceWorkerCoverage | undefined> => {
        if (!isCoverage || !result.cdpPort || !fixtureUrl) return undefined;
        const { ServiceWorkerCoverage } = require('./cdp-coverage');
        const instance: import('./cdp-coverage').ServiceWorkerCoverage = new ServiceWorkerCoverage();
        const filter = (t: any) => t.type === 'page' && t.url?.includes(fixtureUrl);
        const ok = await instance.init(result.cdpPort, filter);
        return ok ? instance : undefined;
    };

    return { context: result.context, userDataDir: result.userDataDir, cov, covInit };
}

/**
 * Launch with dual coverage sessions:
 * - Background/service worker target (connected immediately)
 * - Content/page target (connect via covContentInit() after page.goto)
 */
export async function launchWithDualCoverage(fixtureUrl: string): Promise<{
    context: BrowserContext;
    userDataDir: string;
    covBg: import('./cdp-coverage').ServiceWorkerCoverage | undefined;
    covContentInit: () => Promise<import('./cdp-coverage').ServiceWorkerCoverage | undefined>;
    covForPageUrl: (url: string) => Promise<import('./cdp-coverage').ServiceWorkerCoverage | undefined>;
}> {
    const isCoverage = process.env.COVERAGE === 'true';
    const result = await launchExtensionContext({ enableCoverage: isCoverage });

    let covBg: import('./cdp-coverage').ServiceWorkerCoverage | undefined;
    if (isCoverage && result.cdpPort) {
        const { ServiceWorkerCoverage } = require('./cdp-coverage');
        covBg = new ServiceWorkerCoverage();
        const filter = (t: any) => t.type === 'service_worker' && t.url?.includes('background.js');
        const ok = await covBg.init(result.cdpPort, filter);
        if (!ok) covBg = undefined;
    }

    const covContentInit = async (): Promise<import('./cdp-coverage').ServiceWorkerCoverage | undefined> => {
        if (!isCoverage || !result.cdpPort) return undefined;
        const { ServiceWorkerCoverage } = require('./cdp-coverage');
        const covContent: import('./cdp-coverage').ServiceWorkerCoverage = new ServiceWorkerCoverage();
        const filter = (t: any) => t.type === 'page' && t.url === fixtureUrl;
        const ok = await covContent.init(result.cdpPort, filter);
        return ok ? covContent : undefined;
    };

    const covForPageUrl = async (url: string): Promise<import('./cdp-coverage').ServiceWorkerCoverage | undefined> => {
        if (!isCoverage || !result.cdpPort) return undefined;
        const { ServiceWorkerCoverage } = require('./cdp-coverage');
        const covContent: import('./cdp-coverage').ServiceWorkerCoverage = new ServiceWorkerCoverage();
        const filter = (t: any) => t.type === 'page' && t.url === url;
        const ok = await covContent.init(result.cdpPort, filter);
        return ok ? covContent : undefined;
    };

    return { context: result.context, userDataDir: result.userDataDir, covBg, covContentInit, covForPageUrl };
}

/**
 * Optionally collect and report V8 coverage if COVERAGE=true environment variable is set.
 * This helper encapsulates coverage collection logic so tests don't need separate implementations.
 *
 * Usage:
 *   await collectOptionalCoverage(cdpPort, page);
 *
 * Run with coverage:
 *   COVERAGE=true bunx playwright test <test-file>
 *
 * Run without coverage (default):
 *   bunx playwright test <test-file>
 */
export async function collectOptionalCoverage(
    cdpPort?: number,
    page?: import('@playwright/test').Page,
): Promise<void> {
    const shouldCollect = process.env.COVERAGE === 'true';
    const DEBUG = !!process.env.DEBUG;

    if (!shouldCollect || !cdpPort || !page) {
        return;
    }

    try {
        // Lazy import to avoid circular dependencies and overhead when not needed
        const cdpCoverage = require('./cdp-coverage');
        const { collectV8Coverage, calculateCoverageStats } = cdpCoverage;

        const targets = await collectCDPCoverage(cdpPort);
        const swTarget = targets.find(
            (t: any) => t.type === 'service_worker' && t.url?.includes('background.js'),
        );

        if (!swTarget?.webSocketDebuggerUrl) {
            return;
        }

        // Collect coverage from service worker (where commands execute)
        const coverage = await collectV8Coverage(swTarget.webSocketDebuggerUrl, 10000);

        if (!coverage || coverage.length === 0) {
            return;
        }

        // Report coverage
        const stats = calculateCoverageStats(coverage);
        if (DEBUG) {
            console.log('\n--- V8 Coverage Report ---');
            console.log(`Coverage: ${stats.percentage}% (${stats.coveredBytes}/${stats.totalBytes} bytes)`);
            Object.entries(stats.byUrl).forEach(([url, data]: any) => {
                const pct = data.total > 0 ? ((data.covered / data.total) * 100).toFixed(1) : '0';
                console.log(`  ${pct}% | ${url.substring(0, 70)}`);
            });
        }
    } catch (err) {
        if (DEBUG) {
            console.error('Failed to collect coverage:', err);
        }
    }
}

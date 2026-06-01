/**
 * Error Server Reporter — ships extension errors to the local config server.
 *
 * Additive: uses addEventListener (not onerror/onunhandledrejection assignment),
 * so it coexists with errorCollector.ts without conflict.
 *
 * Feature-flagged: only active when errorReportToServer is set in chrome.storage.local.
 * Enable in .surfingkeys-2026.js:
 *   settings.errorReportToServer = true;
 */

export function installErrorServerReporter(context: 'background' | 'content_script') {
    const globalScope: any = globalThis;
    if (globalScope._skErrorServerReporterInstalled) return;
    globalScope._skErrorServerReporterInstalled = true;

    let _enabled: boolean | null = null;  // null = not yet checked

    async function isEnabled(): Promise<boolean> {
        if (_enabled !== null) return _enabled;
        return new Promise(resolve => {
            chrome.storage.local.get(['errorReportToServer'], (r) => {
                _enabled = !!(r.errorReportToServer);
                resolve(_enabled);
            });
        });
    }

    // Invalidate cache when settings change
    chrome.storage.onChanged.addListener(() => { _enabled = null; });

    function isExtensionSource(source?: string, stack?: string): boolean {
        if (context === 'background') return true;  // all SW errors are extension errors
        const s = source || stack || '';
        return s.includes('chrome-extension://');
    }

    function ship(payload: object) {
        fetch(`http://localhost:${__CONFIG_SERVER_PORT__}/errors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(() => {});
    }

    globalScope.addEventListener('error', async (event: ErrorEvent) => {
        if (!await isEnabled()) return;
        if (!isExtensionSource(event.filename, event.error?.stack)) return;
        ship({
            ts: new Date().toISOString(),
            context,
            type: 'onerror',
            message: event.message,
            source: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            stack: event.error?.stack ?? 'no stack',
            pageUrl: globalScope.location?.href ?? 'unknown',
            extensionId: chrome.runtime.id
        });
    });

    globalScope.addEventListener('unhandledrejection', async (event: PromiseRejectionEvent) => {
        if (!await isEnabled()) return;
        const reason = event.reason;
        const stack = reason?.stack ?? '';
        if (!isExtensionSource(undefined, stack)) return;
        ship({
            ts: new Date().toISOString(),
            context,
            type: 'unhandledrejection',
            message: reason?.toString() ?? 'unknown rejection',
            stack,
            pageUrl: globalScope.location?.href ?? 'unknown',
            extensionId: chrome.runtime.id
        });
    });
}

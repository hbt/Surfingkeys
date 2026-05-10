/**
 * Global Error Collector for Surfingkeys
 *
 * Catches and stores all unhandled errors and promise rejections.
 * Stores errors in chrome.storage.local for persistence across reloads.
 *
 * Works in both window contexts (content scripts) and service worker contexts (background).
 *
 * Usage:
 * - In background.js: import and call installErrorHandlers('background')
 * - In content.js: import and call installErrorHandlers('content_script')
 */

export type ErrorContext = 'background' | 'content_script' | 'page' | 'manual';

export interface ErrorData {
    context: ErrorContext | string;
    type: string;
    message: string;
    url: string;
    userAgent: string;
    timestamp: string;
    source?: string;
    lineno?: number;
    colno?: number;
    stack?: string;
    reason?: string;
    details?: Record<string, unknown>;
}

/** Extended globalThis with surfingkeys error tracking properties */
interface SurfingkeysGlobalScope {
    _surfingkeysErrorHandlersInstalled?: boolean;
    _surfingkeysErrors?: ErrorData[];
    location?: Location;
    onerror?: OnErrorEventHandler;
    onunhandledrejection?: ((event: PromiseRejectionEvent) => void) | null;
}

const STORAGE_KEY = 'surfingkeys_errors';
const MAX_ERRORS = 100;

function getGlobalScope(): SurfingkeysGlobalScope {
    return (globalThis as unknown as SurfingkeysGlobalScope);
}

/**
 * Install global error handlers
 * @param context - 'background' or 'content_script' or 'page'
 */
function installErrorHandlers(context: ErrorContext | string): void {
    // Use globalThis for compatibility with both window and service worker contexts
    // Service workers don't have 'window', they have 'self'
    const globalScope = getGlobalScope();

    // Don't install if already installed
    if (globalScope._surfingkeysErrorHandlersInstalled) {
        console.log('[ERROR COLLECTOR] Already installed in', context);
        return;
    }

    globalScope._surfingkeysErrorHandlersInstalled = true;
    globalScope._surfingkeysErrors = [];

    /**
     * Save error to chrome.storage.local
     */
    function saveError(errorData: ErrorData): void {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            const errors: ErrorData[] = (result[STORAGE_KEY] as ErrorData[]) || [];
            errors.push(errorData);

            // Keep last MAX_ERRORS errors
            while (errors.length > MAX_ERRORS) {
                errors.shift();
            }

            chrome.storage.local.set({ [STORAGE_KEY]: errors }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[ERROR COLLECTOR] Failed to save error:', chrome.runtime.lastError.message);
                } else {
                    console.log('[ERROR COLLECTOR] Saved error:', errorData.type, '-', errorData.message);
                }
            });
        });

        // Also keep in memory for immediate access
        globalScope._surfingkeysErrors!.push(errorData);

        // Limit in-memory errors too
        if (globalScope._surfingkeysErrors!.length > MAX_ERRORS) {
            globalScope._surfingkeysErrors!.shift();
        }
    }

    /**
     * Get context information
     */
    function getContextInfo(): Pick<ErrorData, 'context' | 'url' | 'userAgent' | 'timestamp'> {
        return {
            context: context,
            url: globalScope.location ? globalScope.location.href : 'unknown',
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        };
    }

    // 1. onerror - catches unhandled JS errors
    const originalOnError = (globalThis as Window).onerror;
    (globalThis as Window).onerror = function(message, source, lineno, colno, error) {
        const errorData: ErrorData = {
            ...getContextInfo(),
            type: 'onerror',
            message: (typeof message === 'string' ? message : String(message)) || 'Unknown error',
            source: source || 'unknown',
            lineno: lineno || 0,
            colno: colno || 0,
            stack: error && error.stack ? error.stack : 'No stack trace'
        };

        console.error('[ERROR HANDLER] onerror caught:', errorData.message);
        console.error('  Source:', errorData.source, 'Line:', errorData.lineno, 'Col:', errorData.colno);
        console.error('  Stack:', errorData.stack);

        saveError(errorData);

        // Call original handler if it exists
        if (originalOnError) {
            return originalOnError.apply(this, [message, source, lineno, colno, error]);
        }

        return false; // Don't prevent default error handling
    };

    // 2. onunhandledrejection - catches unhandled promise rejections
    const originalOnRejection = (globalThis as Window).onunhandledrejection;
    (globalThis as Window).onunhandledrejection = function(event: PromiseRejectionEvent) {
        const reason: unknown = event.reason;
        const errorData: ErrorData = {
            ...getContextInfo(),
            type: 'unhandledrejection',
            message: reason ? String(reason) : 'Unknown rejection',
            reason: reason && typeof reason === 'object' ? JSON.stringify(reason, null, 2) : String(reason),
            stack: reason && typeof reason === 'object' && (reason as Error).stack
                ? (reason as Error).stack
                : 'No stack trace'
        };

        console.error('[ERROR HANDLER] unhandledrejection caught:', errorData.message);
        console.error('  Reason:', errorData.reason);
        console.error('  Stack:', errorData.stack);

        saveError(errorData);

        // Call original handler if it exists
        if (originalOnRejection) {
            return originalOnRejection.apply(this, [event]);
        }
    };
}

/**
 * Get all stored errors
 */
function getStoredErrors(): Promise<ErrorData[]> {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            resolve((result[STORAGE_KEY] as ErrorData[]) || []);
        });
    });
}

/**
 * Clear all stored errors
 */
function clearStoredErrors(): Promise<void> {
    const globalScope = getGlobalScope();

    return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: [] }, () => {
            console.log('[ERROR COLLECTOR] Cleared all stored errors');
            if (globalScope._surfingkeysErrors) {
                globalScope._surfingkeysErrors = [];
            }
            resolve();
        });
    });
}

/**
 * Get errors from memory (current session only)
 */
function getMemoryErrors(): ErrorData[] {
    const globalScope = getGlobalScope();
    return globalScope._surfingkeysErrors || [];
}

/**
 * Manually report an error
 * @param type - Error type
 * @param message - Error message
 * @param details - Additional details
 */
function reportError(type: string, message: string, details: Record<string, unknown> = {}): void {
    const globalScope = getGlobalScope();

    const errorData: ErrorData = {
        context: 'manual',
        type: type,
        message: message,
        details: details,
        url: globalScope.location ? globalScope.location.href : 'unknown',
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
    };

    console.error('[ERROR COLLECTOR] Manual error report:', errorData.message);

    chrome.storage.local.get([STORAGE_KEY], (result) => {
        const errors: ErrorData[] = (result[STORAGE_KEY] as ErrorData[]) || [];
        errors.push(errorData);

        // Keep last 100 errors
        if (errors.length > 100) {
            errors.shift();
        }

        chrome.storage.local.set({ [STORAGE_KEY]: errors });
    });

    if (globalScope._surfingkeysErrors) {
        globalScope._surfingkeysErrors.push(errorData);
    }
}

export {
    installErrorHandlers,
    getStoredErrors,
    clearStoredErrors,
    getMemoryErrors,
    reportError
};

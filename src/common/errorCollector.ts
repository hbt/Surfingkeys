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

/**
 * Install global error handlers
 * @param {string} context - 'background' or 'content_script' or 'page'
 */
function installErrorHandlers(context) {
    // Use globalThis for compatibility with both window and service worker contexts
    // Service workers don't have 'window', they have 'self'
    const globalScope = typeof globalThis !== 'undefined' ? globalThis :
                       typeof self !== 'undefined' ? self :
                       typeof window !== 'undefined' ? window :
                       this;

    // Don't install if already installed
    if (globalScope._surfingkeysErrorHandlersInstalled) {
        console.log('[ERROR COLLECTOR] Already installed in', context);
        return;
    }

    globalScope._surfingkeysErrorHandlersInstalled = true;
    globalScope._surfingkeysErrors = [];

    const STORAGE_KEY = 'surfingkeys_errors';
    const MAX_ERRORS = 100;

    /**
     * Save error to chrome.storage.local
     * @param {object} errorData - Error data to save
     */
    function saveError(errorData) {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            const errors = result[STORAGE_KEY] || [];
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
        globalScope._surfingkeysErrors.push(errorData);

        // Limit in-memory errors too
        if (globalScope._surfingkeysErrors.length > MAX_ERRORS) {
            globalScope._surfingkeysErrors.shift();
        }
    }

    /**
     * Get context information
     * @returns {object} Context info
     */
    function getContext() {
        return {
            context: context,
            url: globalScope.location ? globalScope.location.href : 'unknown',
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        };
    }

    // 1. onerror - catches unhandled JS errors
    const originalOnError = globalScope.onerror;
    globalScope.onerror = function(message, source, lineno, colno, error) {
        const errorData = {
            ...getContext(),
            type: 'onerror',
            message: message || 'Unknown error',
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
            return originalOnError.apply(this, arguments);
        }

        return false; // Don't prevent default error handling
    };

    // 2. onunhandledrejection - catches unhandled promise rejections
    const originalOnRejection = globalScope.onunhandledrejection;
    globalScope.onunhandledrejection = function(event) {
        const reason = event.reason;
        const errorData = {
            ...getContext(),
            type: 'unhandledrejection',
            message: reason ? reason.toString() : 'Unknown rejection',
            reason: reason && typeof reason === 'object' ? JSON.stringify(reason, null, 2) : String(reason),
            stack: reason && reason.stack ? reason.stack : 'No stack trace'
        };

        console.error('[ERROR HANDLER] unhandledrejection caught:', errorData.message);
        console.error('  Reason:', errorData.reason);
        console.error('  Stack:', errorData.stack);

        saveError(errorData);

        // Call original handler if it exists
        if (originalOnRejection) {
            return originalOnRejection.apply(this, arguments);
        }
    };
}

/**
 * Get all stored errors
 * @returns {Promise<Array>} Array of error objects
 */
function getStoredErrors() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['surfingkeys_errors'], (result) => {
            resolve(result.surfingkeys_errors || []);
        });
    });
}

/**
 * Clear all stored errors
 * @returns {Promise<void>}
 */
function clearStoredErrors() {
    const globalScope = typeof globalThis !== 'undefined' ? globalThis :
                       typeof self !== 'undefined' ? self :
                       typeof window !== 'undefined' ? window :
                       this;

    return new Promise((resolve) => {
        chrome.storage.local.set({ surfingkeys_errors: [] }, () => {
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
 * @returns {Array} Array of error objects
 */
function getMemoryErrors() {
    const globalScope = typeof globalThis !== 'undefined' ? globalThis :
                       typeof self !== 'undefined' ? self :
                       typeof window !== 'undefined' ? window :
                       this;

    return globalScope._surfingkeysErrors || [];
}

/**
 * Manually report an error
 * @param {string} type - Error type
 * @param {string} message - Error message
 * @param {object} details - Additional details
 */
function reportError(type, message, details = {}) {
    const globalScope = typeof globalThis !== 'undefined' ? globalThis :
                       typeof self !== 'undefined' ? self :
                       typeof window !== 'undefined' ? window :
                       this;

    const errorData = {
        context: 'manual',
        type: type,
        message: message,
        details: details,
        url: globalScope.location ? globalScope.location.href : 'unknown',
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
    };

    console.error('[ERROR COLLECTOR] Manual error report:', errorData.message);

    chrome.storage.local.get(['surfingkeys_errors'], (result) => {
        const errors = result.surfingkeys_errors || [];
        errors.push(errorData);

        // Keep last 100 errors
        if (errors.length > 100) {
            errors.shift();
        }

        chrome.storage.local.set({ surfingkeys_errors: errors });
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

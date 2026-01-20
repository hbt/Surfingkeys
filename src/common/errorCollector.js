/**
 * Global Error Collector for Surfingkeys
 *
 * Catches and stores all unhandled errors and promise rejections.
 * Stores errors in chrome.storage.local for persistence across reloads.
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
    // Don't install if already installed
    if (window._surfingkeysErrorHandlersInstalled) {
        console.log('[ERROR COLLECTOR] Already installed in', context);
        return;
    }

    window._surfingkeysErrorHandlersInstalled = true;
    window._surfingkeysErrors = [];

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
        window._surfingkeysErrors.push(errorData);

        // Limit in-memory errors too
        if (window._surfingkeysErrors.length > MAX_ERRORS) {
            window._surfingkeysErrors.shift();
        }
    }

    /**
     * Get context information
     * @returns {object} Context info
     */
    function getContext() {
        return {
            context: context,
            url: typeof window !== 'undefined' && window.location ? window.location.href : 'unknown',
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        };
    }

    // 1. window.onerror - catches unhandled JS errors
    const originalOnError = window.onerror;
    window.onerror = function(message, source, lineno, colno, error) {
        const errorData = {
            ...getContext(),
            type: 'window.onerror',
            message: message || 'Unknown error',
            source: source || 'unknown',
            lineno: lineno || 0,
            colno: colno || 0,
            stack: error && error.stack ? error.stack : 'No stack trace'
        };

        console.error('[ERROR HANDLER] window.onerror caught:', errorData.message);
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
    const originalOnRejection = window.onunhandledrejection;
    window.onunhandledrejection = function(event) {
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

    console.log('[ERROR COLLECTOR] ✓ Installed global error handlers in', context);
    console.log('[ERROR COLLECTOR]   - window.onerror');
    console.log('[ERROR COLLECTOR]   - window.onunhandledrejection');
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
    return new Promise((resolve) => {
        chrome.storage.local.set({ surfingkeys_errors: [] }, () => {
            console.log('[ERROR COLLECTOR] Cleared all stored errors');
            if (window._surfingkeysErrors) {
                window._surfingkeysErrors = [];
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
    return window._surfingkeysErrors || [];
}

/**
 * Manually report an error
 * @param {string} type - Error type
 * @param {string} message - Error message
 * @param {object} details - Additional details
 */
function reportError(type, message, details = {}) {
    const errorData = {
        context: 'manual',
        type: type,
        message: message,
        details: details,
        url: typeof window !== 'undefined' && window.location ? window.location.href : 'unknown',
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

    if (window._surfingkeysErrors) {
        window._surfingkeysErrors.push(errorData);
    }
}

export {
    installErrorHandlers,
    getStoredErrors,
    clearStoredErrors,
    getMemoryErrors,
    reportError
};

/**
 * Browser Actions Utilities
 *
 * Helper functions for interacting with pages via CDP:
 * keyboard input, mouse clicks, scrolling, etc.
 */

import WebSocket from 'ws';
import { executeInTarget } from './cdp-client';

let globalMessageId = 1000;

interface WaitOptions {
    timeoutMs?: number;
    intervalMs?: number;
    postReadyDelayMs?: number;
}

interface ScrollWaitOptions extends WaitOptions {
    direction: 'up' | 'down' | 'left' | 'right';
    minDelta?: number;
}

/**
 * Send a key press to the page
 * Supports modifier key notation: "Control+d", "Alt+x", "Shift+Enter", etc.
 */
export async function sendKey(ws: WebSocket, key: string, delayMs: number = 50): Promise<void> {
    // Map of special characters that require Shift modifier
    const specialCharMap: { [key: string]: { baseKey: string; code: string } } = {
        '!': { baseKey: '1', code: 'Digit1' },
        '@': { baseKey: '2', code: 'Digit2' },
        '#': { baseKey: '3', code: 'Digit3' },
        '$': { baseKey: '4', code: 'Digit4' },
        '%': { baseKey: '5', code: 'Digit5' },
        '^': { baseKey: '6', code: 'Digit6' },
        '&': { baseKey: '7', code: 'Digit7' },
        '*': { baseKey: '8', code: 'Digit8' },
        '(': { baseKey: '9', code: 'Digit9' },
        ')': { baseKey: '0', code: 'Digit0' },
        '_': { baseKey: '-', code: 'Minus' },
        '+': { baseKey: '=', code: 'Equal' },
        '{': { baseKey: '[', code: 'BracketLeft' },
        '}': { baseKey: ']', code: 'BracketRight' },
        '|': { baseKey: '\\', code: 'Backslash' },
        ':': { baseKey: ';', code: 'Semicolon' },
        '"': { baseKey: "'", code: 'Quote' },
        '<': { baseKey: ',', code: 'Comma' },
        '>': { baseKey: '.', code: 'Period' },
        '?': { baseKey: '/', code: 'Slash' },
        '~': { baseKey: '`', code: 'Backquote' }
    };

    // Parse modifier keys (e.g., "Control+d", "Alt+x")
    let modifiers = 0;
    let actualKey = key;
    let charText = key; // The character to send in 'char' event
    let code: string | undefined;
    let windowsVirtualKeyCode: number | undefined;

    if (key.includes('+')) {
        const parts = key.split('+');
        const modifierPart = parts[0];
        actualKey = parts[1];
        charText = actualKey;

        // CDP modifier values: Alt=1, Control=2, Meta=4, Shift=8
        if (modifierPart === 'Control' || modifierPart === 'Ctrl') {
            modifiers = 2;
        } else if (modifierPart === 'Alt') {
            modifiers = 1;
        } else if (modifierPart === 'Meta' || modifierPart === 'Cmd') {
            modifiers = 4;
        } else if (modifierPart === 'Shift') {
            modifiers = 8;
        }
    }

    // Check if it's a special character that needs Shift modifier
    const specialChar = specialCharMap[actualKey];
    const isSpecialChar = modifiers === 0 && specialChar;
    if (isSpecialChar && specialChar) {
        charText = actualKey; // Keep original special character for 'char' event
        actualKey = actualKey; // Use shifted character as key
        code = specialChar.code; // Set the physical key code
        modifiers = 8; // Shift modifier

        // For shifted digits, use the digit's virtual key code (0x30 + digit)
        const baseKey = specialChar.baseKey;
        if (baseKey >= '0' && baseKey <= '9') {
            windowsVirtualKeyCode = 0x30 + parseInt(baseKey, 10);
        }
    }

    // Check if uppercase letter that needs Shift modifier (if not already set)
    const needsShift = modifiers === 0 && actualKey.length === 1 && actualKey >= 'A' && actualKey <= 'Z';
    if (needsShift) {
        modifiers = 8; // Shift modifier = 8
    }

    // keyDown
    ws.send(JSON.stringify({
        id: globalMessageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyDown',
            key: actualKey,
            ...(modifiers && { modifiers }),
            ...(code && { code }),
            ...(windowsVirtualKeyCode && { windowsVirtualKeyCode })
        }
    }));

    await new Promise(resolve => setTimeout(resolve, delayMs));

    // For modifier key combinations, skip the 'char' event
    if (modifiers === 0 || needsShift || isSpecialChar) {
        // char
        ws.send(JSON.stringify({
            id: globalMessageId++,
            method: 'Input.dispatchKeyEvent',
            params: {
                type: 'char',
                text: charText,
                ...(modifiers && { modifiers }),
                ...(code && { code }),
                ...(windowsVirtualKeyCode && { windowsVirtualKeyCode })
            }
        }));

        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // keyUp
    ws.send(JSON.stringify({
        id: globalMessageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyUp',
            key: actualKey,
            ...(modifiers && { modifiers }),
            ...(code && { code }),
            ...(windowsVirtualKeyCode && { windowsVirtualKeyCode })
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Click at a specific position on the page
 */
export async function clickAt(ws: WebSocket, x: number, y: number): Promise<void> {
    // mousePressed
    ws.send(JSON.stringify({
        id: globalMessageId++,
        method: 'Input.dispatchMouseEvent',
        params: {
            type: 'mousePressed',
            x,
            y,
            button: 'left',
            clickCount: 1
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 100));

    // mouseReleased
    ws.send(JSON.stringify({
        id: globalMessageId++,
        method: 'Input.dispatchMouseEvent',
        params: {
            type: 'mouseReleased',
            x,
            y,
            button: 'left',
            clickCount: 1
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 200));
}

/**
 * Get scroll position (vertical)
 */
export async function getScrollPosition(ws: WebSocket): Promise<number> {
    return executeInTarget(ws, 'window.scrollY');
}

/**
 * Get horizontal scroll position
 */
export async function getScrollPositionX(ws: WebSocket): Promise<number> {
    return executeInTarget(ws, 'window.scrollX');
}

/**
 * Get page title
 */
export async function getPageTitle(ws: WebSocket): Promise<string> {
    return executeInTarget(ws, 'document.title');
}

/**
 * Get page URL
 */
export async function getPageURL(ws: WebSocket): Promise<string> {
    return executeInTarget(ws, 'window.location.href');
}

/**
 * Count elements matching a selector
 */
export async function countElements(ws: WebSocket, selector: string): Promise<number> {
    return executeInTarget(ws, `document.querySelectorAll('${selector}').length`);
}

/**
 * Query elements in shadowRoot
 */
export async function queryShadowRoot(ws: WebSocket, hostSelector: string, query: string): Promise<any> {
    return executeInTarget(ws, `
        (function() {
            const host = document.querySelector('${hostSelector}');
            if (!host || !host.shadowRoot) {
                return null;
            }
            return ${query};
        })()
    `);
}

/**
 * Enable Input domain (required for keyboard/mouse events)
 */
export function enableInputDomain(ws: WebSocket): void {
    ws.send(JSON.stringify({
        id: globalMessageId++,
        method: 'Input.enable'
    }));
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
    condition: () => Promise<boolean>,
    timeoutMs: number = 5000,
    intervalMs: number = 100
): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        if (await condition()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Timeout waiting for condition (${timeoutMs}ms)`);
}

/**
 * Wait until Surfingkeys runtime is injected and ready.
 */
export async function waitForSurfingkeysReady(
    ws: WebSocket,
    options: WaitOptions = {}
): Promise<void> {
    const timeout = options.timeoutMs ?? 8000;
    const interval = options.intervalMs ?? 200;
    await waitFor(async () => {
        try {
            return Boolean(await executeInTarget(ws, `document.readyState === 'complete'`));
        } catch {
            return false;
        }
    }, timeout, interval);

    const settleDelay = options.postReadyDelayMs ?? 500;
    if (settleDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, settleDelay));
    }
}

/**
 * Wait until scroll position moves at least minDelta in a direction.
 * Returns the new scroll position once the condition is met.
 */
export async function waitForScrollChange(
    ws: WebSocket,
    baseline: number,
    options: ScrollWaitOptions
): Promise<number> {
    const timeout = options.timeoutMs ?? 4000;
    const interval = options.intervalMs ?? 100;
    const minDelta = options.minDelta ?? 1;

    await waitFor(async () => {
        const current = await getScrollPosition(ws);
        if (options.direction === 'down') {
            return current - baseline >= minDelta;
        }
        return baseline - current >= minDelta;
    }, timeout, interval);

    return getScrollPosition(ws);
}

/**
 * Wait until horizontal scroll position moves at least minDelta in a direction.
 * Returns the new scroll position once the condition is met.
 */
export async function waitForScrollChangeX(
    ws: WebSocket,
    baseline: number,
    options: ScrollWaitOptions
): Promise<number> {
    const timeout = options.timeoutMs ?? 4000;
    const interval = options.intervalMs ?? 100;
    const minDelta = options.minDelta ?? 1;

    await waitFor(async () => {
        const current = await getScrollPositionX(ws);
        if (options.direction === 'right') {
            return current - baseline >= minDelta;
        }
        return baseline - current >= minDelta;
    }, timeout, interval);

    return getScrollPositionX(ws);
}

/**
 * Send a function key (F1-F12)
 * Function keys require windowsVirtualKeyCode and special handling
 */
export async function sendFunctionKey(ws: WebSocket, fKey: string, delayMs: number = 50): Promise<void> {
    // F1=112, F2=113, ... F12=123
    const fNum = parseInt(fKey.replace('F', ''), 10);
    if (isNaN(fNum) || fNum < 1 || fNum > 12) {
        throw new Error(`Invalid function key: ${fKey}`);
    }
    const windowsVirtualKeyCode = 111 + fNum;

    // keyDown
    ws.send(JSON.stringify({
        id: globalMessageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyDown',
            key: fKey,
            code: fKey,
            windowsVirtualKeyCode
        }
    }));

    await new Promise(resolve => setTimeout(resolve, delayMs));

    // keyUp
    ws.send(JSON.stringify({
        id: globalMessageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyUp',
            key: fKey,
            code: fKey,
            windowsVirtualKeyCode
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Capture a screenshot of the page
 */
export async function captureScreenshot(ws: WebSocket, format: 'png' | 'jpeg' = 'png'): Promise<string> {
    return new Promise((resolve, reject) => {
        const id = globalMessageId++;
        const timeout = setTimeout(() => reject(new Error('Screenshot timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result.data);
                }
            }
        };

        ws.on('message', handler);

        // Enable Page domain first
        ws.send(JSON.stringify({
            id: globalMessageId++,
            method: 'Page.enable'
        }));

        setTimeout(() => {
            ws.send(JSON.stringify({
                id,
                method: 'Page.captureScreenshot',
                params: {
                    format,
                    captureBeyondViewport: false
                }
            }));
        }, 100);
    });
}

/**
 * Get settings value from background service worker
 */
export async function getSettingValue(ws: WebSocket, settingKey: string): Promise<any> {
    return executeInTarget(ws, `(globalThis.runtime?.conf?.${settingKey} !== undefined ? globalThis.runtime.conf.${settingKey} : 'UNDEFINED')`);
}

/**
 * Wait for config snippets to be fully registered in MV3 userScripts.
 *
 * Polls globalThis._isConfigReady() in the background service worker until config loading completes.
 * Eliminates the need for arbitrary waitAfterSetMs delays in tests.
 *
 * @param ws WebSocket connection to background service worker
 * @param timeoutMs Maximum time to wait (default: 5000ms)
 * @returns Promise that resolves when config is ready, rejects on timeout
 */
export async function waitForConfigReady(
    ws: WebSocket,
    timeoutMs: number = 5000
): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            const isReady = await executeInTarget(ws, `
                (async () => {
                    if (!globalThis._isConfigReady) return false;
                    return await globalThis._isConfigReady();
                })()
            `);

            if (isReady) {
                return;
            }
        } catch (error) {
            // Not ready yet, continue polling
        }

        // Poll every 100ms
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Timeout - try to get error details
    let errorDetails = 'No error details available';
    try {
        errorDetails = await executeInTarget(ws, `globalThis._configLoadError?.message || 'No error captured'`);
    } catch {
        // Ignore
    }

    throw new Error(`Config not ready after ${timeoutMs}ms. Error: ${errorDetails}`);
}

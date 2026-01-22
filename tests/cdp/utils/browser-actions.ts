/**
 * Browser Actions Utilities
 *
 * Helper functions for interacting with pages via CDP:
 * keyboard input, mouse clicks, scrolling, etc.
 */

import WebSocket from 'ws';
import { executeInTarget } from './cdp-client';

let globalMessageId = 1000;

/**
 * Send a key press to the page
 */
export async function sendKey(ws: WebSocket, key: string, delayMs: number = 50): Promise<void> {
    // keyDown
    ws.send(JSON.stringify({
        id: globalMessageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyDown',
            key: key
        }
    }));

    await new Promise(resolve => setTimeout(resolve, delayMs));

    // char
    ws.send(JSON.stringify({
        id: globalMessageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'char',
            text: key
        }
    }));

    await new Promise(resolve => setTimeout(resolve, delayMs));

    // keyUp
    ws.send(JSON.stringify({
        id: globalMessageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyUp',
            key: key
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
 * Get scroll position
 */
export async function getScrollPosition(ws: WebSocket): Promise<number> {
    return executeInTarget(ws, 'window.scrollY');
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

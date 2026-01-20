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

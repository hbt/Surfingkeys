/**
 * Event-Driven Wait Infrastructure
 *
 * Replaces arbitrary timeouts and polling with CDP event listeners.
 * Allows tests to wait for actual page events instead of guessing timing.
 *
 * Usage:
 *   // Wait for scroll to complete by listening to scroll events
 *   await waitForScrollCompleteViaEvent(pageWs, 'down', { minDelta: 300, timeoutMs: 5000 });
 *
 *   // Wait for custom CDP event
 *   await waitForCDPEvent(pageWs, msg => msg.method === 'Runtime.consoleAPICalled');
 */

import WebSocket from 'ws';
import { executeInTarget } from './cdp-client';

/**
 * Wait for a CDP event matching a predicate
 * Returns Promise that resolves with the event message
 */
export function waitForCDPEvent(
    ws: WebSocket,
    eventFilter: (msg: any) => boolean,
    timeoutMs: number = 5000
): Promise<any> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.removeListener('message', handler);
            reject(new Error(`Timeout waiting for CDP event (${timeoutMs}ms)`));
        }, timeoutMs);

        const handler = (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (eventFilter(msg)) {
                    clearTimeout(timeout);
                    ws.removeListener('message', handler);
                    resolve(msg);
                }
            } catch (e) {
                // Ignore parse errors, continue listening
            }
        };

        ws.on('message', handler);
    });
}

/**
 * Wait for a console.log signal with a specific marker
 * Used to signal completion from injected page code
 */
export function waitForConsoleSignal(
    ws: WebSocket,
    signalMarker: string,
    timeoutMs: number = 5000
): Promise<any> {
    return waitForCDPEvent(
        ws,
        (msg) => {
            if (msg.method !== 'Runtime.consoleAPICalled') return false;
            const args = msg.params?.args;
            if (!Array.isArray(args) || args.length === 0) return false;
            const value = args[0]?.value;
            return value && value.includes(signalMarker);
        },
        timeoutMs
    );
}

interface ScrollListenerOptions {
    minDelta?: number;
    timeoutMs?: number;
    direction: 'up' | 'down' | 'left' | 'right';
    baseline?: number;  // Optional: captured scroll position before scroll started
}

/**
 * Wait for scroll event to fire on page
 * Injects an event listener that waits for actual scroll event (not polling)
 * Returns the final scroll position
 *
 * NOTE: Baseline is captured at listener attachment time. If called after scroll
 * has started, baseline will be the current position, not the pre-scroll position.
 * To avoid this, ensure listener is set up BEFORE triggering scroll.
 */
export async function waitForScrollCompleteViaEvent(
    ws: WebSocket,
    direction: 'up' | 'down' | 'left' | 'right',
    options: ScrollListenerOptions = { direction: 'down', minDelta: 1, timeoutMs: 5000 }
): Promise<number> {
    const minDelta = options.minDelta ?? 1;
    const timeoutMs = options.timeoutMs ?? 5000;
    const isHorizontal = direction === 'left' || direction === 'right';
    const scrollProp = isHorizontal ? 'scrollX' : 'scrollY';

    // Generate unique signal marker for this scroll
    const signalMarker = `__SCROLL_COMPLETE_${Date.now()}_${Math.random()}__`;

    // If baseline not provided, it will be captured when listener code executes
    // (which may be inaccurate under high CPU load)
    const capturedBaseline = options.baseline;

    // Inject scroll listener that waits for actual scroll event
    // Use provided baseline if available, otherwise capture when listener attaches
    const baselineCode = capturedBaseline !== undefined
        ? `${capturedBaseline}`
        : `window.${scrollProp}`;

    const listenerCode = `
        (async () => {
            return new Promise((resolve) => {
                // Baseline: either passed in (accurate) or captured now (may be inaccurate under load)
                const baseline = ${baselineCode};
                let resolved = false;
                let firstEventPos = null;
                let lastEventPos = null;

                const listener = () => {
                    if (resolved) return;

                    const current = window.${scrollProp};
                    if (firstEventPos === null) firstEventPos = current;
                    lastEventPos = current;

                    // Calculate delta from baseline
                    let delta;
                    if ('${direction}' === 'down' || '${direction}' === 'right') {
                        delta = current - baseline;
                    } else {
                        delta = baseline - current;
                    }

                    // Resolve if we've moved enough
                    if (delta >= ${minDelta}) {
                        resolved = true;
                        window.removeEventListener('scroll', listener);
                        // Use the last scroll position we saw
                        console.log('${signalMarker}:' + lastEventPos);
                        resolve(lastEventPos);
                    }
                };

                window.addEventListener('scroll', listener);

                // Failsafe: timeout after timeoutMs
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        window.removeEventListener('scroll', listener);
                        const final = window.${scrollProp};
                        console.log('${signalMarker}:' + final);
                        resolve(final);
                    }
                }, ${timeoutMs});
            });
        })()
    `;

    // Start listening for console signal BEFORE executing the listener code
    const signalPromise = waitForConsoleSignal(ws, signalMarker, timeoutMs + 1000);

    // Execute the listener code
    try {
        await executeInTarget(ws, listenerCode, timeoutMs + 2000);
    } catch (e) {
        // If executeInTarget times out, that's ok - the listener is already running
        // Just wait for the console signal
    }

    // Wait for the signal from the listener
    const signal = await signalPromise;
    const args = signal.params?.args;
    const value = args?.[0]?.value || '';

    // Extract scroll position from signal
    const match = value.match(new RegExp(`${signalMarker}:(\\d+)`));
    if (match) {
        return parseInt(match[1], 10);
    }

    throw new Error(`Failed to parse scroll position from signal: ${value}`);
}

/**
 * Wait for DOM element to exist/change
 * Useful for waiting for specific DOM state changes
 */
export async function waitForDOMState(
    ws: WebSocket,
    selector: string,
    stateCheck: string = 'element.offsetHeight > 0',
    timeoutMs: number = 5000
): Promise<void> {
    const signalMarker = `__DOM_STATE_${Date.now()}_${Math.random()}__`;

    const code = `
        (async () => {
            return new Promise((resolve) => {
                const check = () => {
                    const element = document.querySelector('${selector}');
                    if (!element) return false;
                    return ${stateCheck};
                };

                if (check()) {
                    console.log('${signalMarker}');
                    resolve();
                    return;
                }

                const observer = new MutationObserver(() => {
                    if (check()) {
                        observer.disconnect();
                        console.log('${signalMarker}');
                        resolve();
                    }
                });

                observer.observe(document.body, { subtree: true, attributes: true, childList: true });

                setTimeout(() => {
                    observer.disconnect();
                    console.log('${signalMarker}');
                    resolve();
                }, ${timeoutMs});
            });
        })()
    `;

    const signalPromise = waitForConsoleSignal(ws, signalMarker, timeoutMs + 1000);

    try {
        await executeInTarget(ws, code, timeoutMs + 2000);
    } catch (e) {
        // Listener is running, wait for signal
    }

    await signalPromise;
}

/**
 * Wait for keyboard event on page
 * Injects listener that signals when keyup fires
 */
export async function waitForKeyEventViaListener(
    ws: WebSocket,
    timeoutMs: number = 1000
): Promise<void> {
    const signalMarker = `__KEY_EVENT_${Date.now()}_${Math.random()}__`;

    const code = `
        (async () => {
            return new Promise((resolve) => {
                let fired = false;

                const listener = () => {
                    if (fired) return;
                    fired = true;
                    window.removeEventListener('keyup', listener);
                    console.log('${signalMarker}');
                    resolve();
                };

                window.addEventListener('keyup', listener, { once: true });

                setTimeout(() => {
                    if (!fired) {
                        fired = true;
                        window.removeEventListener('keyup', listener);
                        console.log('${signalMarker}');
                        resolve();
                    }
                }, ${timeoutMs});
            });
        })()
    `;

    const signalPromise = waitForConsoleSignal(ws, signalMarker, timeoutMs + 1000);

    try {
        await executeInTarget(ws, code, timeoutMs + 2000);
    } catch (e) {
        // Listener is running
    }

    await signalPromise;
}

/**
 * Send key and wait for keyup event (replaces arbitrary 100ms waits)
 */
export async function sendKeyWithEventWait(
    ws: WebSocket,
    key: string,
    keyEventTimeoutMs: number = 1000
): Promise<void> {
    // First, set up the keyup listener
    const keyupPromise = waitForKeyEventViaListener(ws, keyEventTimeoutMs);

    // Send the key
    const messageId = Math.floor(Math.random() * 100000);

    // keyDown
    ws.send(JSON.stringify({
        id: messageId,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyDown',
            key: key
        }
    }));

    // char
    ws.send(JSON.stringify({
        id: messageId + 1,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'char',
            text: key
        }
    }));

    // keyUp
    ws.send(JSON.stringify({
        id: messageId + 2,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyUp',
            key: key
        }
    }));

    // Wait for keyup event to fire
    await keyupPromise;
}

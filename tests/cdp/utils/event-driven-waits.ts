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

/**
 * Wait for scroll position to reach a target value.
 * Used in beforeEach to ensure starting position is correct before tests run.
 */
export async function waitForScrollPosition(
    ws: WebSocket,
    targetX: number,
    targetY: number,
    options: { timeoutMs?: number; tolerancePx?: number } = {}
): Promise<{ x: number; y: number }> {
    const timeoutMs = options.timeoutMs ?? 3000;
    const tolerance = options.tolerancePx ?? 5;

    const result = await executeInTarget(ws, `
        (async () => {
            const targetX = ${targetX};
            const targetY = ${targetY};
            const tolerance = ${tolerance};
            const timeout = ${timeoutMs};

            // First scroll to target
            window.scrollTo(targetX, targetY);

            // Wait for position to be reached
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const x = window.scrollX;
                const y = window.scrollY;
                if (Math.abs(x - targetX) <= tolerance && Math.abs(y - targetY) <= tolerance) {
                    return { x, y, success: true };
                }
                await new Promise(r => setTimeout(r, 50));
            }

            // Timeout - return current position
            return { x: window.scrollX, y: window.scrollY, success: false };
        })()
    `, timeoutMs + 1000);

    return { x: result.x, y: result.y };
}

/**
 * Scroll to top (0,0) and wait for position to be reached.
 * More robust than scrollTo(0,0) + arbitrary wait.
 * Forces instant scroll (no animation) to avoid interference from previous animations.
 */
export async function scrollToTopAndWait(
    ws: WebSocket,
    options: { timeoutMs?: number } = {}
): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 3000;

    // Force instant scroll with scrollTo behavior: 'instant'
    await executeInTarget(ws, `
        (async () => {
            // Cancel any ongoing smooth scroll by doing instant scroll
            window.scrollTo({ left: 0, top: 0, behavior: 'instant' });

            // Wait for position to stabilize
            const timeout = ${timeoutMs};
            const start = Date.now();
            while (Date.now() - start < timeout) {
                if (window.scrollX === 0 && window.scrollY === 0) {
                    return { x: 0, y: 0, success: true };
                }
                // Force position again in case of lingering animation
                window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
                await new Promise(r => setTimeout(r, 50));
            }
            return { x: window.scrollX, y: window.scrollY, success: false };
        })()
    `, timeoutMs + 1000);
}

/**
 * Scroll to bottom and wait for position to be reached.
 * Forces instant scroll to avoid animation issues.
 */
export async function scrollToBottomAndWait(
    ws: WebSocket,
    options: { timeoutMs?: number } = {}
): Promise<number> {
    const timeoutMs = options.timeoutMs ?? 3000;

    const result = await executeInTarget(ws, `
        (async () => {
            const targetY = document.documentElement.scrollHeight - window.innerHeight;
            // Force instant scroll
            window.scrollTo({ left: 0, top: targetY, behavior: 'instant' });

            // Wait for position
            const timeout = ${timeoutMs};
            const start = Date.now();
            while (Date.now() - start < timeout) {
                if (Math.abs(window.scrollY - targetY) <= 10) {
                    return window.scrollY;
                }
                // Force position again
                window.scrollTo({ left: 0, top: targetY, behavior: 'instant' });
                await new Promise(r => setTimeout(r, 50));
            }
            return window.scrollY;
        })()
    `, timeoutMs + 1000);

    return result;
}

/**
 * Scroll to right edge and wait for position to be reached.
 */
export async function scrollToRightAndWait(
    ws: WebSocket,
    options: { timeoutMs?: number } = {}
): Promise<number> {
    const result = await executeInTarget(ws, `
        (async () => {
            const targetX = document.documentElement.scrollWidth - window.innerWidth;
            window.scrollTo(targetX, 0);

            // Wait for position
            const timeout = ${options.timeoutMs ?? 3000};
            const start = Date.now();
            while (Date.now() - start < timeout) {
                if (Math.abs(window.scrollX - targetX) <= 10) {
                    return window.scrollX;
                }
                await new Promise(r => setTimeout(r, 50));
            }
            return window.scrollX;
        })()
    `, (options.timeoutMs ?? 3000) + 1000);

    return result;
}

interface PreparedScrollWait {
    /** Promise that resolves with final scroll position when scroll completes */
    promise: Promise<number>;
    /** The baseline scroll position captured when listener was attached */
    baseline: number;
}

interface PrepareScrollOptions {
    direction: 'up' | 'down' | 'left' | 'right';
    minDelta?: number;
    timeoutMs?: number;
}

/**
 * Prepare a scroll listener BEFORE triggering an action.
 *
 * This is the correct pattern for reliable scroll detection under parallel load:
 * 1. Call prepareScrollWait() - attaches listener and captures baseline
 * 2. Trigger the scroll action (sendKey, etc.)
 * 3. Await the returned promise
 *
 * This ensures the listener is in place BEFORE the scroll starts, eliminating
 * race conditions where the scroll completes before listener attachment.
 *
 * Usage:
 *   const { promise, baseline } = await prepareScrollWait(ws, { direction: 'down', minDelta: 20 });
 *   await sendKey(ws, 'j');
 *   const finalScroll = await promise;
 */
export async function prepareScrollWait(
    ws: WebSocket,
    options: PrepareScrollOptions
): Promise<PreparedScrollWait> {
    const minDelta = options.minDelta ?? 1;
    const timeoutMs = options.timeoutMs ?? 5000;
    const direction = options.direction;
    const isHorizontal = direction === 'left' || direction === 'right';
    const scrollProp = isHorizontal ? 'scrollX' : 'scrollY';

    // Generate unique signal marker
    const signalMarker = `__SCROLL_READY_${Date.now()}_${Math.random().toString(36).slice(2)}__`;

    // Inject listener and get baseline in a single atomic operation
    // The listener signals readiness immediately, then signals completion when scroll happens
    const listenerCode = `
        (function() {
            const baseline = window.${scrollProp};
            let resolved = false;

            const listener = () => {
                if (resolved) return;

                const current = window.${scrollProp};
                let delta;
                if ('${direction}' === 'down' || '${direction}' === 'right') {
                    delta = current - baseline;
                } else {
                    delta = baseline - current;
                }

                if (delta >= ${minDelta}) {
                    resolved = true;
                    window.removeEventListener('scroll', listener);
                    console.log('${signalMarker}:DONE:' + current);
                }
            };

            window.addEventListener('scroll', listener);

            // Failsafe timeout
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    window.removeEventListener('scroll', listener);
                    console.log('${signalMarker}:TIMEOUT:' + window.${scrollProp});
                }
            }, ${timeoutMs});

            // Return baseline immediately so caller knows listener is attached
            return baseline;
        })()
    `;

    // Start listening for the completion signal BEFORE injecting the code
    const completionPromise = waitForCDPEvent(
        ws,
        (msg) => {
            if (msg.method !== 'Runtime.consoleAPICalled') return false;
            const args = msg.params?.args;
            if (!Array.isArray(args) || args.length === 0) return false;
            const value = args[0]?.value;
            return value && value.includes(signalMarker);
        },
        timeoutMs + 2000
    );

    // Inject the listener and get baseline synchronously
    const baseline = await executeInTarget(ws, listenerCode, 5000);

    // Create promise that resolves with final scroll position
    const promise = completionPromise.then((signal) => {
        const value = signal.params?.args?.[0]?.value || '';
        const match = value.match(new RegExp(`${signalMarker}:(DONE|TIMEOUT):(\\d+)`));
        if (match) {
            return parseInt(match[2], 10);
        }
        throw new Error(`Failed to parse scroll completion signal: ${value}`);
    });

    return { promise, baseline };
}

/**
 * Atomic scroll action: prepares listener, sends key, waits for scroll.
 *
 * This combines all steps into a single function for maximum reliability:
 * 1. Attaches scroll listener and captures baseline
 * 2. Sends the key press
 * 3. Waits for scroll to complete
 * 4. Returns { baseline, final, delta }
 *
 * Usage:
 *   const result = await sendKeyAndWaitForScroll(ws, 'j', { direction: 'down', minDelta: 20 });
 *   expect(result.delta).toBeGreaterThan(0);
 */
export async function sendKeyAndWaitForScroll(
    ws: WebSocket,
    key: string,
    options: PrepareScrollOptions & { keyDelayMs?: number }
): Promise<{ baseline: number; final: number; delta: number }> {
    // 1. Prepare listener FIRST
    const { promise, baseline } = await prepareScrollWait(ws, options);

    // 2. Send key (minimal delay to reduce overhead)
    const keyDelayMs = options.keyDelayMs ?? 30;
    const messageId = Math.floor(Math.random() * 100000);

    // Map special shifted characters to their physical keys and codes
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

    // Parse modifier keys (e.g., "Shift+4", "Control+d")
    let modifiers = 0;
    let actualKey = key;
    let charText = key;
    let code: string | undefined;

    if (key.includes('+')) {
        const parts = key.split('+');
        const modifierPart = parts[0];
        actualKey = parts[1];

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
    } else {
        // Check if this is a special character that needs shift
        const specialChar = specialCharMap[key];
        if (specialChar) {
            modifiers = 8;
            actualKey = key;  // Use the shifted character as the key
            code = specialChar.code;  // Set the physical key code
        } else if (key.length === 1 && key >= 'A' && key <= 'Z') {
            // Uppercase letters need shift
            modifiers = 8;
        }
    }

    // For special characters, we need to set windowsVirtualKeyCode
    // This helps Chrome properly synthesize the key event
    let windowsVirtualKeyCode: number | undefined;
    if (specialCharMap[key]) {
        // For shifted digits, use the digit's virtual key code (0x30 + digit)
        const baseKey = specialCharMap[key].baseKey;
        if (baseKey >= '0' && baseKey <= '9') {
            windowsVirtualKeyCode = 0x30 + parseInt(baseKey, 10);
        }
    }

    const keyDownParams: any = {
        type: 'keyDown',
        key: actualKey,
        ...(modifiers && { modifiers }),
        ...(code && { code }),
        ...(windowsVirtualKeyCode && { windowsVirtualKeyCode })
    };

    ws.send(JSON.stringify({
        id: messageId,
        method: 'Input.dispatchKeyEvent',
        params: keyDownParams
    }));

    await new Promise(r => setTimeout(r, keyDelayMs));

    ws.send(JSON.stringify({
        id: messageId + 1,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'char',
            text: charText,
            ...(modifiers && { modifiers }),
            ...(code && { code }),
            ...(windowsVirtualKeyCode && { windowsVirtualKeyCode })
        }
    }));

    await new Promise(r => setTimeout(r, keyDelayMs));

    ws.send(JSON.stringify({
        id: messageId + 2,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyUp',
            key: actualKey,
            ...(modifiers && { modifiers }),
            ...(code && { code }),
            ...(windowsVirtualKeyCode && { windowsVirtualKeyCode })
        }
    }));

    // 3. Wait for scroll to complete
    const final = await promise;

    // 4. Calculate delta based on direction
    let delta: number;
    if (options.direction === 'down' || options.direction === 'right') {
        delta = final - baseline;
    } else {
        delta = baseline - final;
    }

    return { baseline, final, delta };
}

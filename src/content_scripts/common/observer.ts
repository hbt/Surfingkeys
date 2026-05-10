import {
    getVisibleElements,
    initSKFunctionListener,
} from './utils.js';

import Mode from './mode';

function isElementPositionRelative(elm: Element): boolean {
    let current: Element | null = elm;
    while (current !== null && current !== document.body) {
        if (getComputedStyle(current).position === "relative") {
            return true;
        }
        current = current.parentElement;
    }
    return false;
}

interface NormalMode {
    addScrollableElement: (el: Element) => void;
}

type ExtendedElement = Element & { fromSurfingKeys?: boolean; newlyCreated?: boolean };
type ExtendedMutationObserver = MutationObserver & { isConnected: boolean };

function startScrollNodeObserver(normal: NormalMode): void {
    let pendingUpdater: ReturnType<typeof setTimeout> | undefined;
    const DOMObserver = new MutationObserver(function (mutations) {
        const addedNodes: Element[] = [];
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (n.nodeType === Node.ELEMENT_NODE && !(n as ExtendedElement).fromSurfingKeys) {
                    (n as ExtendedElement).newlyCreated = true;
                    addedNodes.push(n as Element);
                }
            }
        }

        if (addedNodes.length) {
            if (pendingUpdater) {
                clearTimeout(pendingUpdater);
                pendingUpdater = undefined;
            }
            pendingUpdater = setTimeout(function() {
                const possibleModalElements = getVisibleElements(function(e: Element, v: Element[]) {
                    const br = e.getBoundingClientRect();
                    if (br.width > 300 && br.height > 300
                        && br.width <= window.innerWidth && br.height <= window.innerHeight
                        && br.top >= 0 && br.left >= 0
                        && Mode.hasScroll(e, 'y', 16)
                        && isElementPositionRelative(e)
                    ) {
                        v.push(e);
                    }
                });

                if (possibleModalElements.length) {
                    normal.addScrollableElement(possibleModalElements[0]);
                }
            }, 200);
        }
    }) as ExtendedMutationObserver;
    DOMObserver.isConnected = false;

    initSKFunctionListener("observer", {
        turnOn: () => {
            if (!DOMObserver.isConnected) {
                DOMObserver.observe(document, { childList: true, subtree:true });
                DOMObserver.isConnected = true;
            }
        },
        turnOff: () => {
            if (DOMObserver.isConnected) {
                DOMObserver.disconnect();
                DOMObserver.isConnected = false;
            }
        },
    });
}

export default startScrollNodeObserver;

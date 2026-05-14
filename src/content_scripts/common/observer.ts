import {
    getVisibleElements,
    initSKFunctionListener,
} from './utils.js';

import Mode from './mode';

function isElementPositionRelative(elm: Element) {
    while (elm !== document.body) {
        if (getComputedStyle(elm).position === "relative") {
            return true;
        }
        elm = elm.parentElement!;
    }
    return false;
}

interface NormalModeObserver {
    addScrollableElement(el: Element): void;
}

function startScrollNodeObserver(normal: NormalModeObserver) {
    var pendingUpdater: ReturnType<typeof setTimeout> | undefined = undefined, DOMObserver = new MutationObserver(function (mutations) {
        var addedNodes: Node[] = [];
        for (var m of mutations) {
            for (var n of m.addedNodes) {
                if (n.nodeType === Node.ELEMENT_NODE && !(n as unknown as { fromSurfingKeys?: boolean }).fromSurfingKeys) {
                    (n as unknown as { newlyCreated: boolean }).newlyCreated = true;
                    addedNodes.push(n);
                }
            }
        }

        if (addedNodes.length) {
            if (pendingUpdater) {
                clearTimeout(pendingUpdater);
                pendingUpdater = undefined;
            }
            pendingUpdater = setTimeout(function() {
                var possibleModalElements = getVisibleElements(function(e: Element, v: Element[]) {
                    var br = e.getBoundingClientRect();
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
    });
    const DOMObserverExt = DOMObserver as MutationObserver & { isConnected: boolean };
    DOMObserverExt.isConnected = false;

    initSKFunctionListener("observer", {
        turnOn: () => {
            if (!DOMObserverExt.isConnected) {
                DOMObserver.observe(document, { childList: true, subtree:true });
                DOMObserverExt.isConnected = true;
            }
        },
        turnOff: () => {
            if (DOMObserverExt.isConnected) {
                DOMObserver.disconnect();
                DOMObserverExt.isConnected = false;
            }
        },
    });
}

export default startScrollNodeObserver;

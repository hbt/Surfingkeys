import {
    getVisibleElements,
    initSKFunctionListener,
} from './utils.js';

import Mode from './mode';

function isElementPositionRelative(elm: any) {
    while (elm !== document.body) {
        if (getComputedStyle(elm).position === "relative") {
            return true;
        }
        elm = elm.parentElement;
    }
    return false;
}

function startScrollNodeObserver(normal: any) {
    var pendingUpdater: ReturnType<typeof setTimeout> | undefined = undefined, DOMObserver = new MutationObserver(function (mutations) {
        var addedNodes: Node[] = [];
        for (var m of mutations) {
            for (var n of m.addedNodes) {
                if (n.nodeType === Node.ELEMENT_NODE && !(n as any).fromSurfingKeys) {
                    (n as any).newlyCreated = true;
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
                var possibleModalElements = getVisibleElements(function(e: any, v: any) {
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
    (DOMObserver as any).isConnected = false;

    initSKFunctionListener("observer", {
        turnOn: () => {
            if (!(DOMObserver as any).isConnected) {
                DOMObserver.observe(document, { childList: true, subtree:true });
                (DOMObserver as any).isConnected = true;
            }
        },
        turnOff: () => {
            if ((DOMObserver as any).isConnected) {
                DOMObserver.disconnect();
                (DOMObserver as any).isConnected = false;
            }
        },
    });
}

export default startScrollNodeObserver;

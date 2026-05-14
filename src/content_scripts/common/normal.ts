import Trie from './trie';
import { RUNTIME, dispatchSKEvent, runtime } from './runtime.js';
import Mode from './mode';
import KeyboardUtils from './keyboardUtils';
import {
    getRealEdit,
    isEditable,
    isElementClickable,
    isElementPartiallyInViewport,
    isInUIFrame,
    mapInMode,
    scrollIntoViewIfNeeded,
    showBanner,
    showPopup,
} from './utils.js';
import type { ModeConstructor, ModeInstance, SKKeyboardEvent, TrieConstructor } from '../../../@types/surfingkeys';

// Scroll node: Element augmented with sk scroll helpers
interface SKScrollNode extends Element {
    skScrollBy?(x: number, y: number): void;
    smoothScrollBy?(x: number, y: number, d: number): void;
    safeScroll_?(prop: string, value: number, increasing: boolean): boolean;
    lastScrollTop?: number;
    lastScrollLeft?: number;
    dataset: DOMStringMap;
    style: CSSStyleDeclaration;
}

interface DisabledModeInstance extends ModeInstance {
    activatedOnElement: boolean;
}

interface LurkModeInstance extends ModeInstance {
    enter(priority?: number, reentrant?: boolean): number;
}

interface PassThroughModeInstance extends ModeInstance {
    setTimeout(timeout: number): void;
    statusLine: string;
}

interface NormalModeInstance extends ModeInstance {
    passFocus(pf: boolean): void;
    startLurk(): string;
    revertToLurk(): void;
    getLurkMode(): LurkModeInstance | undefined;
    addLurkMap(new_keystroke: string, old_keystroke: string): void;
    toggleBlocklist(): void;
    passThrough(timeout?: number): PassThroughModeInstance;
    once(): void;
    scroll(type: string): void;
    refreshScrollableElements(): SKScrollNode[] | null;
    addScrollableElement(elm: SKScrollNode): void;
    rotateFrame(): void;
    feedkeys(keys: string): void;
    setLastKeys(key: string): void;
    appendKeysForRepeat(mode: string, keys: string): void;
    addVIMark(mark: string, url?: string): void;
    jumpVIMark(mark: string): void;
    moveTab(pos: number): void;
    captureElement(elm: Element | null): void;
    highlightElement(elm: SKScrollNode): void;
    disable(onElement: boolean): void;
    enable(): void;
    isScrollKeyInHints(key: string): boolean;
    repeats: string;
    statusLine: string;
}

type HandleMapKeyFn = (this: unknown, event: SKKeyboardEvent, onNoMatched?: () => void) => boolean;

function createDisabled(normal: NormalModeInstance) {
    const self = new (Mode as unknown as ModeConstructor)("Disabled") as DisabledModeInstance;

    // hide status line for Disabled mode
    self.statusLine = "";

    // Disabled has higher priority than others.
    self.priority = 99;

    self.activatedOnElement = false;
    self.addEventListener('keydown', function(event: SKKeyboardEvent) {
        // prevent this event to be handled by Surfingkeys' other listeners
        event.sk_suppressed = true;
        if (self.activatedOnElement && !document.activeElement!.matches(runtime.conf.disabledOnActiveElementPattern as unknown as string)) {
            normal.enable();
            self.activatedOnElement = false;
        } else if (Mode.isSpecialKeyOf("<Alt-s>", event.sk_keyName)) {
            normal.toggleBlocklist();
            self.exit();
            event.sk_stopPropagation = true;
        }
    });

    return self;
}

function createLurk(normal: NormalModeInstance) {
    const self = new (Mode as unknown as ModeConstructor)("Lurk") as LurkModeInstance;

    function enterNormal() {
        normal.enter();
        if (window === top) {
            RUNTIME('setSurfingkeysIcon', {
                status: "enabled"
            });
        }
    }

    self.mappings = new (Trie as unknown as TrieConstructor)();
    self.map_node = self.mappings;
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Alt-i>"), {
        annotation: {
            short: "Enter normal mode",
            unique_id: "cmd_lurk_enter_normal",
            category: "modes",
            description: "Exit Lurk mode and enter Normal mode to enable SurfingKeys",
            tags: ["modes", "lurk"]
        },
        feature_group: 16,
        code: enterNormal
    });
    self.mappings.add("p", {
        annotation: {
            short: "Ephemeral normal mode",
            unique_id: "cmd_lurk_ephemeral_normal",
            category: "modes",
            description: "Temporarily enter Normal mode for 1 second then return to Lurk mode",
            tags: ["modes", "lurk", "ephemeral"]
        },
        feature_group: 16,
        code: function() {
            enterNormal();
            setTimeout(() => {
                normal.revertToLurk();
            }, 1000);
        }
    });

    // Lurk and Disabled should be mutually exclusive.
    self.addEventListener('keydown', function(event: SKKeyboardEvent) {
        var realTarget = getRealEdit(event);
        if (!isEditable(realTarget) && event.sk_keyName.length) {
            (Mode.handleMapKey as unknown as HandleMapKeyFn).call(self, event);
            if (event.sk_stopPropagation) {
                // keyup event also needs to be suppressed for the key whose keydown has been suppressed.
                Mode.suppressKeyUp(event.keyCode);
            }
        }
    });
    return self;
}

function createPassThrough() {
    var self = new (Mode as unknown as ModeConstructor)("PassThrough") as PassThroughModeInstance;
    var _autoExit: ReturnType<typeof setTimeout> | undefined, _timeout: number = 0;

    self.addEventListener('keydown', function(event: SKKeyboardEvent) {
        // prevent this event to be handled by Surfingkeys' other listeners
        event.sk_suppressed = true;
        if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
            self.exit();
            event.sk_stopPropagation = true;
        } else if (_timeout > 0) {
            if (_autoExit) {
                clearTimeout(_autoExit);
                _autoExit = undefined;
            }
            _autoExit = setTimeout(function() {
                self.exit();
            }, _timeout);
        }
    }).addEventListener('mousedown', function(event: SKKeyboardEvent) {
        event.sk_suppressed = true;
    });
    self.addEventListener('focus', function(event: SKKeyboardEvent) {
        event.sk_suppressed = true;
    });

    self.onEnter = function() {
        if (_timeout > 0) {
            _autoExit = setTimeout(function() {
                self.exit();
            }, _timeout);
            self.statusLine = `ephemeral(${_timeout}ms) pass through`;
        } else {
            self.statusLine = "pass through";
        }
    };

    self.setTimeout = function(timeout: number) {
        _timeout = timeout;
    };

    return self;
}

function createNormal(insert: ModeInstance) {
    var self = new (Mode as unknown as ModeConstructor)("Normal") as NormalModeInstance;

    self.mappings = new (Trie as unknown as TrieConstructor)();
    self.map_node = self.mappings;

    // let next focus event pass
    var _passFocus = false;
    self.passFocus = function(pf: boolean) {
        _passFocus = pf;
    };

    let _lurk: LurkModeInstance | undefined = undefined;
    self.startLurk = () => {
        let state = "lurking";
        if (!_lurk) {
            self.exit();
            _lurk = createLurk(self);
            _lurkMaps!.forEach((keymap) => {
                mapInMode(_lurk! as unknown as Parameters<typeof mapInMode>[0], keymap[0], keymap[1]);
                _lurk!.mappings.remove(KeyboardUtils.encodeKeystroke(keymap[1]));
            });
            _lurkMaps = undefined;
            _lurk.enter(0, true);
        } else if (Mode.getCurrent() !== _lurk) {
            state = "enabled";
        }
        return state;
    };
    self.revertToLurk = () => {
        // peeking exit to keep modes such hints above normal.
        self.exit(true);
        if (window === top) {
            RUNTIME('setSurfingkeysIcon', {
                status: "lurking"
            });
        }
    };
    self.getLurkMode = () => {
        return _lurk;
    };
    let _lurkMaps: [string, string][] | undefined = [];
    self.addLurkMap = (new_keystroke: string, old_keystroke: string) => {
        _lurkMaps!.push([new_keystroke, old_keystroke]);
    };

    var _once = false;
    self.addEventListener('keydown', function(event: SKKeyboardEvent) {
        var realTarget = getRealEdit(event);
        if (isEditable(realTarget) && event.isTrusted) {
            if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
                realTarget.blur();
                insert.exit();
            } else {
                if (runtime.conf.editableBodyCare && realTarget === document.body && event.key !== "i") {
                    self.statusLine = "Press i to enter Insert mode";
                    runtime.conf.showModeStatus = true;
                    if (event.sk_keyName.length) {
                        (Mode.handleMapKey as unknown as HandleMapKeyFn).call(self, event);
                    }
                } else {
                    event.sk_stopPropagation = (runtime.conf.editableBodyCare
                        && realTarget === document.body && event.key === "i");
                    if (event.sk_stopPropagation) {
                        self.passFocus(true);
                        realTarget.focus();
                    }

                    var stealFocus = false;
                    var n: Element = realTarget;
                    if (!isElementPartiallyInViewport(realTarget)) {
                        while (n !== document.documentElement && !n.newlyCreated) {
                            n = n.parentElement ?? n;
                        }
                        stealFocus = n !== document.documentElement && !!n.newlyCreated;
                    }
                    if (stealFocus) {
                        // steal focus from dynamically created input widget
                        realTarget.blur();
                        delete n.newlyCreated;
                        (Mode.handleMapKey as unknown as HandleMapKeyFn).call(self, event);
                    } else {
                        // keep cursor where it is
                        (insert as unknown as { enter: (elm: Element, keepCursor: boolean) => void }).enter(realTarget, true);
                    }

                }
            }
        } else if (Mode.isSpecialKeyOf("<Alt-s>", event.sk_keyName)) {
            self.toggleBlocklist();
            Mode.finish(self as unknown as Parameters<typeof Mode.finish>[0]);
            event.sk_stopPropagation = true;
        } else if (event.sk_keyName.length) {
            var done = (Mode.handleMapKey as unknown as HandleMapKeyFn).call(self, event, () => {
                // revert to lurk only when Esc is not handled and lurk mode available.
                if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName) && _lurk) {
                    self.revertToLurk();
                }
            });
            if (_once && done) {
                _once = false;
                self.exit();
            }
        }
        if (event.sk_stopPropagation) {
            // keyup event also needs to be suppressed for the key whose keydown has been suppressed.
            Mode.suppressKeyUp(event.keyCode);
        }
    });
    self.addEventListener('blur', function(_event: SKKeyboardEvent) {
        keyHeld = 0;
    });
    self.addEventListener('focus', function(event: SKKeyboardEvent) {
        Mode.showStatus();
        if (runtime.conf.stealFocusOnLoad && !isInUIFrame()) {
            var elm = getRealEdit(event);
            if (isEditable(elm)) {
                if (_passFocus || elm.enableAutoFocus) {
                    if (!runtime.conf.enableAutoFocus) {
                        // prevent focus on input only when enableAutoFocus is turned off.
                        _passFocus = false;
                    }
                } else {
                    elm.blur();
                    event.sk_stopPropagation = true;
                }
            }
        }
    });
    self.addEventListener('keyup', function(_event: SKKeyboardEvent) {
        setTimeout(function() {
            keyHeld = 0;
        }, 0);
    });
    self.addEventListener('mousedown', function(event: SKKeyboardEvent) {
        // The isTrusted read-only property of the Event interface is a boolean
        // that is true when the event was generated by a user action, and false
        // when the event was created or modified by a script or dispatched via dispatchEvent.

        // enable only mouse click from human being to focus input
        if (runtime.conf.enableAutoFocus) {
            self.passFocus(true);
        } else {
            self.passFocus(event.isTrusted);
        }

        var realTarget = getRealEdit(event);
        if (isEditable(realTarget)) {
            // keep cursor where it is
            (insert as unknown as { enter: (elm: Element, keepCursor: boolean) => void }).enter(realTarget, true);
        } else {
            insert.exit();
        }

        if (document.activeElement!.matches(runtime.conf.disabledOnActiveElementPattern as unknown as string)) {
            setTimeout(() => {
                self.disable(true);
            }, 100);
        }
    });

    self.toggleBlocklist = function() {
        if (document.location.href.indexOf(chrome.runtime.getURL("/")) !== 0) {
            RUNTIME('toggleBlocklist', {
                blocklistPattern: (runtime.conf.blocklistPattern ? runtime.conf.blocklistPattern : "")
            }, function(resp) {
                const r = resp as { state: string; url: string; blocklist: Record<string, unknown> };
                if (r.state === "disabled") {
                    if (r.blocklist.hasOwnProperty(".*")) {
                        showBanner('Surfingkeys is globally disabled, please enable it globally from popup menu.', 3000);
                    } else {
                        showBanner('Surfingkeys turned OFF for ' + r.url, 3000);
                    }
                } else {
                    showBanner('Surfingkeys turned ON for ' + r.url, 3000);
                }
            });
        } else {
            showBanner('You could not toggle Surfingkeys on its own pages.', 3000);
        }
    };

    const _passThrough = createPassThrough();
    /**
     * Enter PassThrough mode.
     *
     * @param {number} [timeout] how many milliseconds to linger in PassThrough mode, to ignore it will stay in PassThrough mode until an Escape key is pressed.
     * @name Normal.passThrough
     *
     */
    self.passThrough = function(timeout?: number) {
        _passThrough.setTimeout(timeout ?? 0);
        _passThrough.enter();
        return _passThrough;
    };
    self.once = () => {
        _once = true;
        self.enter();
    };
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Alt-i>"), {
        annotation: {
            short: "Enter PassThrough mode",
            unique_id: "cmd_passthrough_enter",
            category: "modes",
            description: "Enter PassThrough mode to temporarily suppress SurfingKeys and pass all keys to the page",
            tags: ["modes", "passthrough"]
        },
        feature_group: 0,
        code: function() {
            self.passThrough();
        }
    });
    self.mappings.add("p", {
        annotation: {
            short: "Ephemeral PassThrough mode",
            unique_id: "cmd_passthrough_ephemeral",
            category: "modes",
            description: "Temporarily enter PassThrough mode for 1 second then return to Normal mode",
            tags: ["modes", "passthrough", "ephemeral"]
        },
        feature_group: 0,
        code: function() {
            self.passThrough(1000);
        }
    });

    self.repeats = "";
    var keyHeld = 0;

    var scrollNodes: SKScrollNode[] | null, scrollIndex = 0,
        lastKeys: string[];

    function _easeFn(t: number, b: number, c: number, d: number) {
        // t: current time, b: begInnIng value, c: change In value, d: duration
        return (t === d) ? b + c : c * (-Math.pow(2, -10 * t / d) + 1) + b;
    }

    var _nodesHasSKScroll: SKScrollNode[] = [];
    function initScroll(elm: SKScrollNode) {
        elm.skScrollBy = function(x: number, y: number) {
            if (runtime.conf.smartPageBoundary && ((this === document.scrollingElement)
                || scrollNodes!.length === 1 && this === scrollNodes![0])) {
                if (this.scrollTop === 0 && y < 0) {
                    return dispatchSKEvent("hints", ['topBoundaryHit']);
                }
                if (this.scrollHeight - this.scrollTop <= this.clientHeight + 1 && y > 0) {
                    return dispatchSKEvent("hints", ['bottomBoundaryHit']);
                }
            }
            if ((RUNTIME as unknown as { repeats: number }).repeats > 1) {
                x = (RUNTIME as unknown as { repeats: number }).repeats * x;
                y = (RUNTIME as unknown as { repeats: number }).repeats * y;
                (RUNTIME as unknown as { repeats: number }).repeats = 0;
            }
            if (runtime.conf.smoothScroll) {
                var d = Math.max(100, 20 * Math.log(Math.abs( x || y)));
                elm.smoothScrollBy!(x, y, d);
            } else {
                dispatchSKEvent("hints", ['scrollStarted']);
                elm.scrollBy({
                    'behavior': 'instant',
                    'left': x,
                    'top': y,
                });
                dispatchSKEvent("hints", ['scrollDone']);
            }
        };
        elm.safeScroll_ = (prop: string, value: number, increasing: boolean) => {
            const clientHeight = elm === document.scrollingElement ? window.innerHeight : elm.clientHeight;
            const clientWidth = elm === document.scrollingElement ? window.innerWidth : elm.clientWidth;
            const range = prop === "scrollTop" ? [0, elm.scrollHeight - clientHeight] : [0, elm.scrollWidth - clientWidth];
            const boundary = increasing ? range[1] : range[0];
            const elmAsRecord = elm as unknown as Record<string, number>;
            if (value >= range[0] && value <= range[1]) {
                elmAsRecord[prop] = value;
                return false;
            } else {
                elmAsRecord[prop] = boundary;
                return true;
            }
        };
        elm.smoothScrollBy = function(x: number, y: number, d: number) {
            if (!keyHeld) {
                var [prop, distance] = y ? ['scrollTop', y] : ['scrollLeft', x],
                    duration = d,
                    previousTimestamp = 0,
                    originValue = (elm as unknown as Record<string, number>)[prop],
                    stepCompleted = false;
                keyHeld = 1;
                function step(t: number) {
                    if (previousTimestamp === 0) {
                        // init previousTimestamp in first step
                        previousTimestamp = t;
                        dispatchSKEvent("hints", ['scrollStarted']);
                        return window.requestAnimationFrame(step);
                    }
                    const elmRec = elm as unknown as Record<string, number>;
                    var old = elmRec[prop], delta = (t - previousTimestamp) * distance / duration;
                    let boundaryHit = false;
                    if (Math.abs(old + delta - originValue) >= Math.abs(distance)) {
                        stepCompleted = true;
                        if (keyHeld > runtime.conf.scrollFriction) {
                            boundaryHit = elm.safeScroll_!(prop, old + delta, distance > 0);
                            originValue = elmRec[prop];
                        } else if (keyHeld > 0) {
                            keyHeld ++;
                        } else {
                            boundaryHit = elm.safeScroll_!(prop, originValue + distance, distance > 0);
                        }
                    } else {
                        boundaryHit = elm.safeScroll_!(prop, old + delta, distance > 0);
                    }
                    previousTimestamp = t;

                    if (!keyHeld && (boundaryHit
                        || stepCompleted )// distance completed
                    ) {
                        elm.style.scrollBehavior = '';
                        dispatchSKEvent("hints", ['scrollDone']);
                    } else {
                        window.requestAnimationFrame(step);
                    }
                }
                elm.style.scrollBehavior = 'auto';
                window.requestAnimationFrame(step);
            }
        };
        _nodesHasSKScroll.push(elm);
    }

    // set scrollIndex to the highest node
    function initScrollIndex() {
        if (!scrollNodes || scrollNodes.length === 0) {
            scrollNodes = Mode.getScrollableElements() as SKScrollNode[];
            scrollNodes.forEach(function (n: SKScrollNode) {
                n.removeEventListener('mousedown', scrollableMousedownHandler as EventListener);
                n.addEventListener('mousedown', scrollableMousedownHandler as EventListener);
                n.dataset.hint_scrollable = "true";
            });
            scrollIndex = 0;
        }
    }

    function scrollableMousedownHandler(e: MouseEvent) {
        const n = e.currentTarget as Node | null;
        if (!n || !n.contains(e.target as Node)) return;
        var index = scrollNodes!.lastIndexOf(e.target as SKScrollNode);
        for (var i = scrollNodes!.length - 1; i >= 0 && index === -1; i--) {
            if (scrollNodes![i] !== document.body && scrollNodes![i].contains(e.target as Node)) {
                index = i;
            }
        }
        if (index !== -1) {
            scrollIndex = index;
        }
    }

    self.highlightElement = function(elm: SKScrollNode) {
        var rc;
        if (document.scrollingElement === elm) {
            rc = {
                top: 0,
                left: 0,
                width: window.innerWidth,
                height: window.innerHeight
            };
        } else {
            rc = elm.getBoundingClientRect();
        }
        dispatchSKEvent("front", ['highlightElement', {
            duration: 200,
            rect: {
                top: rc.top,
                left: rc.left,
                width: rc.width,
                height: rc.height
            }
        }]);
    };
    function changeScrollTarget(silent?: boolean) {
        scrollNodes = Mode.getScrollableElements() as SKScrollNode[];
        if (scrollNodes!.length > 0) {
            scrollIndex = (scrollIndex + 1) % scrollNodes!.length;
            var sn = scrollNodes![scrollIndex];
            scrollIntoViewIfNeeded(sn);
            if (!silent) {
                self.highlightElement(sn);
            }
        }
    }

    const scrollTypeDirections = new Map([
        ['down', 'vertical'],
        ['up', 'vertical'],
        ['pageDown', 'vertical'],
        ['fullPageDown', 'vertical'],
        ['pageUp', 'vertical'],
        ['fullPageUp', 'vertical'],
        ['top', 'vertical'],
        ['bottom', 'vertical'],
        ['byRatio', 'vertical'],
        ['left', 'horizontal'],
        ['right', 'horizontal'],
        ['leftmost', 'horizontal'],
        ['rightmost', 'horizontal']
    ]);

    function canScrollInDirection(elm: SKScrollNode, direction: string) {
        const isMainPage = elm === document.scrollingElement || elm === document.body;
        const clientHeight = isMainPage ? window.innerHeight : elm.clientHeight;
        const clientWidth = isMainPage ? window.innerWidth : elm.clientWidth;

        switch (direction) {
            case 'vertical':
                return elm.scrollHeight > clientHeight + 1;
            case 'horizontal':
                return elm.scrollWidth > clientWidth + 1;
            default:
                return false;
        }
    }

    /**
     * Scroll within current target.
     *
     * @param {string} type down | up | pageDown | fullPageDown | pageUp | fullPageUp | top | bottom | left | right | leftmost | rightmost | byRatio
     * @name Normal.scroll
     *
     */
    self.scroll = function(type: string) {
        initScrollIndex();
        var scrollNode: SKScrollNode | null = document.scrollingElement as SKScrollNode | null;
        if (scrollNodes && scrollNodes.length > 0) {
            scrollNode = scrollNodes[scrollIndex];
            if (scrollNode !== document.scrollingElement && scrollNode !== document.body) {
                var br = scrollNode.getBoundingClientRect();
                if (br.width === 0 || br.height === 0 || !isElementPartiallyInViewport(scrollNode)
                    || !Mode.hasScroll(scrollNode, 'x', 16) && !Mode.hasScroll(scrollNode, 'y', 16)) {
                    // Recompute scrollable elements, the webpage has changed.
                    self.refreshScrollableElements();
                    scrollNode = scrollNodes ? scrollNodes[scrollIndex] : null;
                }
            }
        }
        if (!scrollNode && !document.scrollingElement && document.body) {
            // to set document.body.style.overflow auto will make document.scrollingElement null
            // set visible to bring it back.
            document.body.style.overflow = 'visible';
            scrollNode = document.scrollingElement as SKScrollNode | null;
        }
        if (!scrollNode) {
            // scrollNode could be null on a page with frameset as its body.
            return;
        }

        // Fall back to document scrolling if enabled and current element can't scroll in requested direction
        if (runtime.conf.scrollFallback &&
            scrollNode !== document.scrollingElement &&
            scrollNode !== document.body) {
            const direction = scrollTypeDirections.get(type);

            if (direction && !canScrollInDirection(scrollNode, direction)) {
                scrollNode = document.scrollingElement as SKScrollNode | null;
                if (!scrollNode && document.body) {
                    document.body.style.overflow = 'visible';
                    scrollNode = document.scrollingElement as SKScrollNode | null;
                }
            }
        }

        if (!scrollNode) return;
        if (!scrollNode.skScrollBy) {
            initScroll(scrollNode);
        }
        var size = (scrollNode === document.scrollingElement) ? [window.innerWidth, window.innerHeight] : [scrollNode.offsetWidth, scrollNode.offsetHeight];
        scrollNode.lastScrollTop = scrollNode.scrollTop;
        scrollNode.lastScrollLeft = scrollNode.scrollLeft;
        switch (type) {
            case 'down':
                scrollNode.skScrollBy!(0, runtime.conf.scrollStepSize);
                break;
            case 'up':
                scrollNode.skScrollBy!(0, -runtime.conf.scrollStepSize);
                break;
            case 'pageDown':
                scrollNode.skScrollBy!(0, Math.round(size[1] / 2));
                break;
            case 'fullPageDown':
                scrollNode.skScrollBy!(0, size[1]);
                break;
            case 'pageUp':
                scrollNode.skScrollBy!(0, -Math.round(size[1] / 2));
                break;
            case 'fullPageUp':
                scrollNode.skScrollBy!(0, -size[1]);
                break;
            case 'top':
                scrollNode.skScrollBy!(0, -scrollNode.scrollTop);
                break;
            case 'bottom':
                scrollNode.skScrollBy!(scrollNode.scrollLeft, scrollNode.scrollHeight - scrollNode.scrollTop);
                break;
            case 'left':
                scrollNode.skScrollBy!(-Math.round(runtime.conf.scrollStepSize / 2), 0);
                break;
            case 'right':
                scrollNode.skScrollBy!(Math.round(runtime.conf.scrollStepSize / 2), 0);
                break;
            case 'leftmost':
                scrollNode.skScrollBy!(-scrollNode.scrollLeft - 10, 0);
                break;
            case 'rightmost':
                scrollNode.skScrollBy!(scrollNode.scrollWidth - scrollNode.scrollLeft - size[0] + 20, 0);
                break;
            case 'byRatio':
                var y = Math.floor((RUNTIME as unknown as { repeats: number }).repeats * scrollNode.scrollHeight / 100) - size[1] / 2 - scrollNode.scrollTop;
                (RUNTIME as unknown as { repeats: number }).repeats = 0;
                scrollNode.skScrollBy!(0, y);
                break;
            default:
                break;
        }
        dispatchSKEvent("observer", ['turnOff']);
    };

    self.refreshScrollableElements = function () {
        scrollNodes = null;
        initScrollIndex();
        return scrollNodes;
    };

    self.addScrollableElement = function(elm: SKScrollNode) {
        if (!scrollNodes || !elm.contains(scrollNodes[scrollIndex]) && scrollNodes.indexOf(elm) === -1) {
            initScrollIndex();
            scrollNodes!.push(elm);
            scrollIndex = scrollNodes!.length - 1;
        }
    };

    self.rotateFrame = function() {
        RUNTIME('nextFrame', {
            frameId: (window as unknown as { frameId: number }).frameId
        });
    };

    /**
     * Feed keys into Normal mode.
     *
     * @param {string} keys the keys to be fed into Normal mode.
     * @name Normal.feedkeys
     *
     */
    self.feedkeys = function(keys: string) {
        setTimeout(function() {
            var evt = new Event("keydown");
            for (var i = 0; i < keys.length; i ++) {
                (evt as unknown as SKKeyboardEvent).sk_keyName = keys[i];
                (Mode.handleMapKey as unknown as HandleMapKeyFn).call(self, evt as unknown as SKKeyboardEvent);
            }
        }, 1);
    };

    self.setLastKeys = function(key: string) {
        if (!this.map_node.meta?.repeatIgnore && key.length > 1) {
            lastKeys = [key];
            saveLastKeys();
        }
    };

    function saveLastKeys() {
        RUNTIME('localData', {
            data: {
                lastKeys: lastKeys
            }
        });
    }

    self.appendKeysForRepeat = function(mode: string, keys: string) {
        if (lastKeys && lastKeys.length > 0) {
            // keys for normal mode must be pushed.
            lastKeys.push('{0}\t{1}'.format(mode, keys));
            saveLastKeys();
        }
    };

    self.addVIMark = function(mark: string, url?: string) {
        url = url || window.location.href;
        var mo: Record<string, { url: string; scrollLeft: number; scrollTop: number }> = {};
        mo[mark] = {
            url: url,
            scrollLeft: document.scrollingElement!.scrollLeft,
            scrollTop: document.scrollingElement!.scrollTop
        };
        RUNTIME('addVIMark', {mark: mo});
        showBanner("Mark '{0}' added for: {1}.".format(mark, url));
    };

    /**
     * Jump to a vim-like mark.
     *
     * @param {string} mark a vim-like mark.
     * @name Normal.jumpVIMark
     *
     */
    self.jumpVIMark = function(mark: string) {
        if (mark === "'") {
            let scrollNode: SKScrollNode | null = document.scrollingElement as SKScrollNode | null;
            initScrollIndex();
            if (scrollNodes && scrollNodes.length > 0) {
                scrollNode = scrollNodes![scrollIndex];
                if (scrollNode.lastScrollTop !== undefined && scrollNode.lastScrollLeft !== undefined) {
                    const lt = scrollNode.scrollTop;
                    const ll = scrollNode.scrollLeft;
                    scrollNode.scrollTop = scrollNode.lastScrollTop;
                    scrollNode.scrollLeft = scrollNode.lastScrollLeft;
                    scrollNode.lastScrollTop = lt;
                    scrollNode.lastScrollLeft = ll;
                }
            }
        } else {
            RUNTIME('jumpVIMark', {
                mark: mark
            });
        }
    };

    self.moveTab = function(pos: number) {
        RUNTIME('moveTab', {
            position: pos
        });
    };

    self.captureElement = function(elm: Element | null) {
        if (!elm) return;
        const elmS = elm as HTMLElement;
        RUNTIME('getCaptureSize', null, function(response) {
            const capSize = response as { width: number };
            var scale = capSize.width / window.innerWidth;

            elmS.scrollTop = 0;
            elmS.scrollLeft = 0;
            var lastScrollTop = -1, lastScrollLeft = -1;
            // hide scrollbars
            var overflowY = elmS.style.overflowY;
            elmS.style.overflowY = "hidden";
            var overflowX = elmS.style.overflowX;
            elmS.style.overflowX = "hidden";
            // hide borders
            var borderStyle = elmS.style.borderStyle;
            elmS.style.borderStyle = "none";
            dispatchSKEvent("front", ['toggleStatus', false]);

            var dx = 0, dy = 0, sx: number, sy: number, sw: number, sh: number, ww: number, wh: number, dh = elmS.scrollHeight, dw = elmS.scrollWidth;
            if (elmS === document.scrollingElement) {
                ww = window.innerWidth;
                wh = window.innerHeight;
                sx = 0;
                sy = 0;
            } else {
                var br = elmS.getBoundingClientRect();
                // visible rectangle
                var rc = [
                    Math.max(br.left, 0),
                    Math.max(br.top, 0),
                    Math.min(br.right, window.innerWidth),
                    Math.min(br.bottom, window.innerHeight)
                ];
                ww = rc[2] - rc[0];
                wh = rc[3] - rc[1];
                sx = rc[0] * scale;
                sy = rc[1] * scale;
            }
            sw = ww * scale;
            sh = wh * scale;

            var canvas = document.createElement( "canvas" );
            canvas.width = dw * scale;
            canvas.height = dh * scale;
            var ctx = canvas.getContext( "2d" );

            var br = elmS.getBoundingClientRect();
            var img = document.createElement( "img" );

            img.onload = function() {
                ctx!.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);
                if (lastScrollTop === elmS.scrollTop) {
                    if (lastScrollLeft === elmS.scrollLeft) {
                        // done
                        dispatchSKEvent("front", ['toggleStatus', true]);
                        showPopup("<img src='{0}' />".format(canvas.toDataURL( "image/png" )));
                        // restore overflow
                        elmS.style.overflowY = overflowY;
                        elmS.style.overflowX = overflowX;
                        // restore borders
                        elmS.style.borderStyle = borderStyle;
                    } else {
                        lastScrollTop = -1;
                        elmS.scrollTop = 0;
                        dy = 0;
                        lastScrollLeft = elmS.scrollLeft;
                        if (elmS.scrollLeft + 2 * ww < dw) {
                            elmS.scrollLeft += ww;
                            dx += ww * scale;
                        } else {
                            elmS.scrollLeft += dw % ww;
                            dx = elmS.scrollLeft * scale;
                        }
                        setTimeout(function() {
                            RUNTIME('captureVisibleTab', null, function(response) {
                                img.src = (response as { dataUrl: string }).dataUrl;
                            });
                        }, 1000);
                    }
                } else {
                    lastScrollTop = elmS.scrollTop;
                    if (elmS.scrollTop + 2 * wh < dh) {
                        elmS.scrollTop += wh;
                        dy += wh * scale;
                    } else {
                        elmS.scrollTop += dh % wh;
                        dy = elmS.scrollTop * scale;
                    }
                    setTimeout(function() {
                        RUNTIME('captureVisibleTab', null, function(response) {
                            img.src = (response as { dataUrl: string }).dataUrl;
                        });
                    }, 1000);
                }
            };

            // wait 500 millisecond for keystrokes of Surfingkeys to hide
            setTimeout(function() {
                RUNTIME('captureVisibleTab', null, function(response) {
                    img.src = (response as { dataUrl: string }).dataUrl;
                });
            }, 500);

        });
    };

    self.mappings.add("yG", {
        annotation: {
            short: "Capture full page",
            unique_id: "cmd_capture_full_page",
            category: "clipboard",
            description: "Capture a screenshot of the entire current page",
            tags: ["capture", "screenshot", "clipboard"]
        },
        feature_group: 7,
        code: function() {
            self.captureElement(document.scrollingElement);
        }
    });
    self.mappings.add("yS", {
        annotation: {
            short: "Capture scrolling element",
            unique_id: "cmd_capture_scrolling_element",
            category: "clipboard",
            description: "Capture a screenshot of the current scrolling element",
            tags: ["capture", "screenshot", "clipboard", "scroll"]
        },
        feature_group: 7,
        code: function() {
            var scrollNode = document.scrollingElement;
            initScrollIndex();
            if (scrollNodes && scrollNodes.length > 0) {
                scrollNode = scrollNodes![scrollIndex];
            }
            self.captureElement(scrollNode);
        }
    });

    self.mappings.add("cS", {
        annotation: {
            short: "Reset scroll target",
            unique_id: "cmd_scroll_reset_target",
            category: "scroll",
            description: "Reset the scroll target to document body",
            tags: ["scroll", "target"]
        },
        feature_group: 2,
        code: function() {
            scrollNodes = null;
            initScrollIndex();
            if (scrollNodes != null && (scrollNodes as SKScrollNode[]).length > 0) {
                var scrollNode = (scrollNodes as SKScrollNode[])[scrollIndex];
                self.highlightElement(scrollNode);
            }
        }
    });

    type ScrollFn = ((this: NormalModeInstance, type: string) => void) & { isSKScrollInHints?: boolean };
    const bindScrollForHints = (action: string): ScrollFn => {
        const f: ScrollFn = self.scroll.bind(self, action) as ScrollFn;
        // indicate that the key bound with this function is a key to scroll page and can be used to scroll in Hints mode.
        f.isSKScrollInHints = true;
        return f;
    };
    self.isScrollKeyInHints = (key: string) => {
        const bound = self.mappings[key] as { meta?: { code?: { isSKScrollInHints?: boolean } } } | undefined;
        return !!(bound && bound.meta && bound.meta.code && bound.meta.code.isSKScrollInHints);
    };

    self.mappings.add("e", {
        annotation: {
            short: "Scroll half page up",
            unique_id: "cmd_scroll_half_page_up",
            category: "scroll",
            description: "Scroll the page up by half a page",
            tags: ["scroll", "page", "vim"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: self.scroll.bind(self, "pageUp")
    });
    self.mappings.add("U", {
        annotation: {
            short: "Scroll full page up",
            unique_id: "cmd_scroll_full_page_up",
            category: "scroll",
            description: "Scroll the page up by one full page",
            tags: ["scroll", "page", "vim"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: self.scroll.bind(self, "fullPageUp")
    });
    self.mappings.add("d", {
        annotation: {
            short: "Scroll half page down",
            unique_id: "cmd_scroll_half_page_down",
            category: "scroll",
            description: "Scroll the page down by half a page",
            tags: ["scroll", "page", "vim"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: self.scroll.bind(self, "pageDown")
    });
    self.mappings.add("P", {
        annotation: {
            short: "Scroll full page down",
            unique_id: "cmd_scroll_full_page_down",
            category: "scroll",
            description: "Scroll the page down by one full page",
            tags: ["scroll", "page", "vim"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: self.scroll.bind(self, "fullPageDown")
    });
    self.mappings.add("gg", {
        annotation: {
            short: "Scroll to the top of the page",
            unique_id: "cmd_scroll_top",
            category: "scroll",
            description: "Scroll to the very top of the page",
            tags: ["scroll", "vim", "navigation"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: self.scroll.bind(self, "top")
    });
    self.mappings.add("G", {
        annotation: {
            short: "Scroll to the bottom of the page",
            unique_id: "cmd_scroll_bottom",
            category: "scroll",
            description: "Scroll to the very bottom of the page",
            tags: ["scroll", "vim", "navigation"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("bottom")
    });
    self.mappings.add("j", {
        annotation: {
            short: "Scroll down",
            unique_id: "cmd_scroll_down",
            category: "scroll",
            description: "Scroll the page down by one line",
            tags: ["scroll", "vim", "movement"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("down")
    });
    self.mappings.add("k", {
        annotation: {
            short: "Scroll up",
            unique_id: "cmd_scroll_up",
            category: "scroll",
            description: "Scroll the page up by one line",
            tags: ["scroll", "vim", "movement"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("up")
    });
    self.mappings.add("h", {
        annotation: {
            short: "Scroll left",
            unique_id: "cmd_scroll_left",
            category: "scroll",
            description: "Scroll the page left by one line",
            tags: ["scroll", "vim", "movement"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("left")
    });
    self.mappings.add("l", {
        annotation: {
            short: "Scroll right",
            unique_id: "cmd_scroll_right",
            category: "scroll",
            description: "Scroll the page right by one line",
            tags: ["scroll", "vim", "movement"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("right")
    });
    self.mappings.add("0", {
        annotation: {
            short: "Scroll all the way to the left",
            unique_id: "cmd_scroll_leftmost",
            category: "scroll",
            description: "Scroll to the leftmost position of the page",
            tags: ["scroll", "navigation"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("leftmost")
    });
    self.mappings.add("$", {
        annotation: {
            short: "Scroll all the way to the right",
            unique_id: "cmd_scroll_rightmost",
            category: "scroll",
            description: "Scroll to the rightmost position of the page",
            tags: ["scroll", "navigation"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: bindScrollForHints("rightmost")
    });
    self.mappings.add("%", {
        annotation: {
            short: "Scroll to percentage of current page",
            unique_id: "cmd_scroll_percentage",
            category: "scroll",
            description: "Scroll to a percentage of the current page (requires numeric prefix)",
            tags: ["scroll", "navigation"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: self.scroll.bind(self, "byRatio")
    });
    self.mappings.add("cs", {
        annotation: {
            short: "Change scroll target",
            unique_id: "cmd_scroll_change_target",
            category: "scroll",
            description: "Change the scroll target between main page and nested scrollable elements",
            tags: ["scroll", "target"]
        },
        feature_group: 2,
        repeatIgnore: true,
        code: function() {
            changeScrollTarget();
        }
    });

    self.mappings.add("/", {
        annotation: {
            short: "Find in page",
            unique_id: "cmd_find_in_page",
            category: "search",
            description: "Open the find interface to search for text in the current page",
            tags: ["search", "find", "vim"]
        },
        feature_group: 9,
        repeatIgnore: true,
        code: function() {
            dispatchSKEvent("front", ['openFinder']);
        }
    });

    self.mappings.add("E", {
        annotation: {
            short: "Go to previous tab",
            unique_id: "cmd_tab_previous",
            category: "navigation",
            description: "Switch to the tab to the left of the current tab",
            tags: ["tabs", "navigation", "vim"]
        },
        feature_group: 3,
        repeatIgnore: true,
        code: function() {
            RUNTIME("previousTab");
        }
    });
    self.mappings.add("g-035", {
        annotation: {
            short: "Go to next tab",
            unique_id: "cmd_tab_next",
            category: "navigation",
            description: "Switch to the tab to the right of the current tab",
            tags: ["tabs", "navigation", "vim"]
        },
        feature_group: 3,
        repeatIgnore: true,
        code: function() {
            RUNTIME("nextTab");
        }
    });
    self.mappings.add("g-036", {
        annotation: {
            short: "Go to tab by index",
            unique_id: "cmd_tab_goto_index",
            category: "navigation",
            description: "Switch to the tab at the given 1-based position (e.g. 3tg → tab 3). Clamps to last tab if index exceeds tab count.",
            tags: ["tabs", "navigation"]
        },
        feature_group: 3,
        code: function() {
            RUNTIME("tabGotoIndex");
        }
    });

    function _onMouseUp(event: MouseEvent) {
        const target = event.target as Element | null;
        if (runtime.conf.mouseSelectToQuery.indexOf(window.origin) !== -1
            && !isElementClickable(target as Element)
            && !target?.matches(".cm-matchhighlight")) {
            // perform inline query after 1 ms
            // to avoid calling on selection collapse
            setTimeout(() => {
                dispatchSKEvent("front", ['querySelectedWord']);
            }, 1);
        }
    }

    var _disabled: DisabledModeInstance | null = null;
    self.disable = function(onElement: boolean) {
        if (!_disabled) {
            _disabled = createDisabled(self);
            _disabled.enter(0, true);
        }
        _disabled.activatedOnElement = onElement;
        dispatchSKEvent("observer", ['turnOff']);
        document.removeEventListener("mouseup", _onMouseUp);
    };

    self.enable = function() {
        if (_disabled) {
            _disabled.exit();
            _disabled = null;
        }
        document.addEventListener("mouseup", _onMouseUp);
    };
    self.enable();

    self.onExit = function() {
        dispatchSKEvent("observer", ['turnOff']);
        _nodesHasSKScroll.forEach(function(n) {
            delete n.skScrollBy;
            delete n.smoothScrollBy;
        });
    };

    return self;
}

export default createNormal;

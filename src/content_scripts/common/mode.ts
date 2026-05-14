import type { ModeInstance, SKKeyboardEvent } from '../../../@types/surfingkeys';
import {
    listElements,
    isInUIFrame,
    reportIssue,
} from './utils.js';
import { RUNTIME, dispatchSKEvent, runtime } from './runtime.js';
import KeyboardUtils from './keyboardUtils';
import { trackCommandUsage } from '../../common/usageTracker.js';
import { getAnnotationString } from '../../common/commandMetadata.js';

var mode_stack: ModeInstance[] = [];

const Mode = function(this: ModeInstance, name: string, statusLine?: string) {
    this.name = name;
    this.statusLine = statusLine ?? "";
    (this as ModeInstance & { eventListeners: Record<string, (event: SKKeyboardEvent) => void> }).eventListeners = {};
    this.addEventListener = function(evtName: string, handler: (event: SKKeyboardEvent) => void): ModeInstance {
        const self = this as ModeInstance & { eventListeners: Record<string, (event: SKKeyboardEvent) => void> };
        self.eventListeners[evtName] = handler;

        if (!_listenedEvents.hasOwnProperty(evtName)) {
            (_listenedEvents as Record<string, (event: Event) => void>)[evtName] = function(event: Event) {
                handleStack(evtName, event as SKKeyboardEvent);
            };
            window.addEventListener(evtName, (_listenedEvents as Record<string, EventListenerOrEventListenerObject>)[evtName], true);
        }

        return this;
    };

    this.enter = function(priority?: number, reentrant?: boolean): number {
        var pos = mode_stack.indexOf(this);
        if (!this.priority) {
            this.priority = priority || mode_stack.length;
        }

        if (pos === -1) {
            // push this mode into stack
            mode_stack.unshift(this);
        } else if (pos > 0) {
            if (reentrant) {
                // pop up all the modes over this
                mode_stack = mode_stack.slice(pos);
            } else {
                var modeList = mode_stack.map(function(u) { return u.name; }).join(',');
                reportIssue("Mode {0} pushed into mode stack again.".format(this.name), "Modes in stack: {0}".format(modeList));
            }
            // stackTrace();
        }

        mode_stack.sort(function(a,b) {
            return (a.priority < b.priority) ? 1 : ((b.priority < a.priority) ? -1 : 0);
        } );
        // var modes = mode_stack.map(function(m) {
        // return m.name;
        // }).join('->');
        // console.log('enter {0}, {1}'.format(this.name, modes));

        if (this.onEnter) {
            this.onEnter();
        }

        Mode.showStatus();
        return pos;
    };

    this.exit = function(peek?: boolean): void {
        var pos = mode_stack.indexOf(this);
        if (pos !== -1) {
            this.priority = 0;
            if (peek) {
                // for peek exit, we need push modes above this back to the stack.
                mode_stack.splice(pos, 1);
            } else {
                // otherwise, we just pop all modes above this inclusively.
                pos++;
                var _popup = mode_stack.slice(0, pos);
                mode_stack = mode_stack.slice(pos);
            }

            // var modes = mode_stack.map(function(m) {
            // return m.name;
            // }).join('->');
            // console.log('exit {0}, {1}'.format(this.name, modes));
        }
        Mode.showStatus();
        if (this.onExit) {
            this.onExit(pos);
        }
    };
};

Mode.getCurrent = (): ModeInstance | undefined => {
    return mode_stack[0] as ModeInstance | undefined;
};

Mode.specialKeys = ({
    "<Alt-s>": ["<Alt-s>"],       // hotkey to toggleBlocklist
    "<Esc>": ["<Esc>"]
} as Record<string, string[]>);

Mode.isSpecialKeyOf = function(specialKey: string, keyToCheck: string): boolean {
    return (-1 !== Mode.specialKeys[specialKey].indexOf(KeyboardUtils.decodeKeystroke(keyToCheck)));
};

// Enable to stop propagation of the event whose keydown handler has been triggered
// Why we need this?
// For example, there is keyup event handler of `s` on some site to set focus on an input box,
// Now user presses `sg` to search with google, Surfingkeys got `s` and triggered its keydown handler.
// But keyup handler of the site also got triggered, then `g` was swallowed by the input box.
// This setting now is only turned on for Normal.
// For Hints, we could not turn on it, as keyup should be propagated to Normal
// to stop scrolling when holding a key.
var keysNeedKeyupSuppressed: number[] = [];
Mode.suppressKeyUp = function(keyCode: number) {
    if (keysNeedKeyupSuppressed.indexOf(keyCode) === -1) {
        keysNeedKeyupSuppressed.push(keyCode);
    }
};

function onAfterHandler(mode: ModeInstance, event: SKKeyboardEvent) {
    if (event.sk_stopPropagation) {
        event.stopImmediatePropagation();
        event.preventDefault();
    }
}

function handleStack(eventName: string, event: SKKeyboardEvent, cb?: (m: ModeInstance) => void) {
    for (var i = 0; i < mode_stack.length && !event.sk_stopPropagation; i++) {
        var m = mode_stack[i];
        const mWithListeners = m as ModeInstance & { eventListeners: Record<string, (event: SKKeyboardEvent) => void> };
        if (!event.sk_suppressed && mWithListeners.eventListeners.hasOwnProperty(eventName)) {
            var handler = mWithListeners.eventListeners[eventName];
            handler(event);
            onAfterHandler(m, event);
        }
        if (m.name === "Disabled") {
            break;
        }
        if (cb) {
            cb(m);
        }
    }
}

let eventListenerBeats = 0;
var suppressScrollEvent = 0, _listenedEvents: Record<string, EventListenerOrEventListenerObject> = {
    "sentinel": (_event: Event) => {
        eventListenerBeats ++;
    },
    "keydown": function (event: Event) {
        const keyEvent = event as SKKeyboardEvent;
        keyEvent.sk_keyName = KeyboardUtils.getKeyChar(keyEvent);
        if (mode_stack.length === 0 && window !== top) {
            // automatically boots iframe on demand
            dispatchSKEvent('iframeBoot');
            document.addEventListener("surfingkeys:userSettingsLoaded", () => {
                // proceed to handle the key event after userSettingsLoaded.
                handleStack("keydown", keyEvent);
            }, {once: true});
            return;
        }
        handleStack("keydown", keyEvent);
    },
    "keyup": function (event: Event) {
        const keyEvent = event as SKKeyboardEvent;
        handleStack("keyup", keyEvent, function (_m: ModeInstance) {
            var i = keysNeedKeyupSuppressed.indexOf(keyEvent.keyCode);
            if (i !== -1) {
                keyEvent.stopImmediatePropagation();
                keysNeedKeyupSuppressed.splice(i, 1);
            }
        });
    },
    "scroll": function (event: Event) {
        const scrollEvent = event as SKKeyboardEvent;
        handleStack("scroll", scrollEvent);
        if (suppressScrollEvent > 0) {
            event.stopImmediatePropagation();
            event.preventDefault();
            suppressScrollEvent--;
        }
    }
};

function init(cb?: () => void) {
    mode_stack = [];
    for (var evtName in _listenedEvents) {
        window.addEventListener(evtName, _listenedEvents[evtName], true);
    }
    if (cb) {
        cb();
    }
}

Mode.hasScroll = function (el: Element, direction: string, barSize: number) {
    var offset = (direction === 'y') ? ['scrollTop', 'height'] : ['scrollLeft', 'width'];
    const elAny = el as unknown as Record<string, number>;
    var result = elAny[offset[0]];

    if (result < barSize) {
        // set scroll offset to barSize, and verify if we can get scroll offset as barSize
        var originOffset = elAny[offset[0]];
        elAny[offset[0]] = (el.getBoundingClientRect() as unknown as Record<string, number>)[offset[1]];
        result = elAny[offset[0]];
        if (result !== originOffset) {
            // this is valid for some site such as http://mail.live.com/
            suppressScrollEvent++;
        }
        elAny[offset[0]] = originOffset;
    }
    return result >= barSize;
};

Mode.getScrollableElements = function () {
    var nodes = listElements(document.body, NodeFilter.SHOW_ELEMENT, function(n: Node) {
        return (Mode.hasScroll(n as Element, 'y', 16) && (n as Element).scrollHeight > 200 ) || (Mode.hasScroll(n as Element, 'x', 16) && (n as Element).scrollWidth > 200);
    });
    nodes.sort(function(a, b) {
        if (b.contains(a)) return 1;
        else if (a.contains(b)) return -1;
        return (b as Element).scrollHeight * (b as Element).scrollWidth - (a as Element).scrollHeight * (a as Element).scrollWidth;
    });
    // document.scrollingElement will be null when document.body.tagName === "FRAMESET", for example http://www.knoppix.org/
    if (document.scrollingElement && (document.scrollingElement.scrollHeight > window.innerHeight
        || document.scrollingElement.scrollWidth > window.innerWidth)) {
        nodes.unshift(document.scrollingElement);
    }
    return nodes;
};

Mode.init = (cb?: () => void)=> {
    // For blank page in frames, we defer init to page loaded
    // as document.write will clear added eventListeners.
    if (window.location.href === "about:blank" && window.frameElement &&
        (!document.body || document.body.childElementCount === 0)) {
        window.frameElement.addEventListener("load", function(_evt) {
            try {
                init(cb);
            } catch (e) {
                console.log("Error on blank iframe loaded: " + e);
            }
        });
    } else {
        init(cb);
    }
};


Mode.showStatus = function() {
    if (document.hasFocus() && mode_stack.length) {
        var cm = mode_stack[0];
        var sl = cm.statusLine || (runtime.conf.showModeStatus ? cm.name : "");
        if (sl !== "" && window !== top && !isInUIFrame()) {
            var pathname = window.location.pathname.split('/');
            if (pathname.length) {
                sl += " - frame: " + pathname[pathname.length - 1];
            }
        }
        dispatchSKEvent("front", ['showStatus', [sl]]);
    }
};

// Internal type for mode with map/key state (not extending ModeInstance to avoid property conflicts)
interface ModeWithMapState {
    name: string;
    map_node: { meta: MapMeta; find(key: string): ModeWithMapState['map_node'] | null; getWords(): string[]; } | null;
    mappings: ModeWithMapState['map_node'];
    pendingMap: ((key: string) => void) | null;
    repeats: string;
    isTrustedEvent: boolean;
    __trust_all_events__: boolean;
    setLastKeys?: (keys: string) => void;
}

interface MapMeta {
    word: string;
    annotation: unknown;
    code: Array<() => void>;
    stopPropagation?: (key: string) => boolean;
    feature_group?: number;
    repeatIgnore?: boolean;
}

Mode.finish = function (mode: ModeWithMapState) {
    var ret = false;
    if (mode.map_node !== mode.mappings || mode.pendingMap != null || mode.repeats) {
        mode.map_node = mode.mappings;
        mode.pendingMap = null;
        if (mode.isTrustedEvent) {
            dispatchSKEvent("front", ['hideKeystroke']);
        }
        if (mode.repeats) {
            mode.repeats = "";
        }
        ret = true;
    }
    return ret;
};

Mode.handleMapKey = function(this: ModeWithMapState, event: SKKeyboardEvent, onNoMatched?: (last: ModeWithMapState['map_node']) => void) {
    var key = event.sk_keyName;
    this.isTrustedEvent = this.__trust_all_events__ || event.isTrusted;

    var isEscKey = Mode.isSpecialKeyOf("<Esc>", key);
    if (isEscKey) {
        key = KeyboardUtils.encodeKeystroke("<Esc>");
    }

    var actionDone = false;
    if (isEscKey && Mode.finish(this)) {
        event.sk_stopPropagation = true;
        event.sk_suppressed = true;
        actionDone = true;
    } else if (this.pendingMap) {
        if (this.setLastKeys) {
            this.setLastKeys(this.map_node!.meta.word + key);
        }
        // Track command usage for statistics (pendingMap commands)
        trackCommandUsage(
            this.map_node!.meta.word + key,
            this.map_node!.meta.annotation,
            this.name
        );
        var pf = this.pendingMap.bind(this);
        event.sk_stopPropagation = (!this.map_node!.meta.stopPropagation
            || this.map_node!.meta.stopPropagation(key));
        pf(key);
        actionDone = Mode.finish(this);
    } else if (this.repeats !== undefined &&
        this.map_node === this.mappings &&
        runtime.conf.digitForRepeat &&
        (key >= "1" || (this.repeats !== "" && key >= "0")) && key <= "9" &&
        this.map_node!.getWords().length > 0
    ) {
        // reset only after target action executed or cancelled
        this.repeats += key;
        if (this.isTrustedEvent) {
            dispatchSKEvent("front", ['showKeystroke', key, this]);
        }
        event.sk_stopPropagation = true;
    } else {
        var last = this.map_node;
        this.map_node = this.map_node!.find(key);
        if (!this.map_node) {
            if (onNoMatched) {
                onNoMatched(last);
            }
            event.sk_suppressed = (last !== this.mappings);
            actionDone = Mode.finish(this);
        } else {
            if (this.map_node.meta) {
                var code = this.map_node.meta.code;
                if (code.length) {
                    // bound function needs arguments
                    this.pendingMap = code as unknown as (key: string) => void;
                    if (this.isTrustedEvent) {
                        dispatchSKEvent("front", ['showKeystroke', key, this]);
                    }
                    event.sk_stopPropagation = true;
                } else {
                    if (this.setLastKeys) {
                        this.setLastKeys(this.map_node.meta.word);
                    }
                    // Track command usage for statistics
                    trackCommandUsage(
                        this.map_node.meta.word,
                        this.map_node.meta.annotation,
                        this.name
                    );
                    (RUNTIME as unknown as { repeats: number }).repeats = parseInt(this.repeats) || 1;
                    event.sk_stopPropagation = (!this.map_node.meta.stopPropagation
                        || this.map_node.meta.stopPropagation(key));
                    if ((RUNTIME as unknown as { repeats: number }).repeats > runtime.conf.repeatThreshold) {
                        const annotationStr = getAnnotationString(this.map_node.meta.annotation);
                        dispatchSKEvent("front", ['showDialog', `Do you really want to repeat this action (${annotationStr}) ${(RUNTIME as unknown as { repeats: number }).repeats} times?`, () => {
                            while((RUNTIME as unknown as { repeats: number }).repeats > 0) {
                                code[0]();
                                (RUNTIME as unknown as { repeats: number }).repeats--;
                            }
                        }]);
                    } else {
                        while((RUNTIME as unknown as { repeats: number }).repeats > 0) {
                            code[0]();
                            (RUNTIME as unknown as { repeats: number }).repeats--;
                        }
                    }
                    actionDone = Mode.finish(this);
                }
            } else {
                if (this.isTrustedEvent) {
                    dispatchSKEvent("front", ['showKeystroke', key, this]);
                }
                event.sk_stopPropagation = true;
            }
        }
    }
    return actionDone;
};

Mode.checkEventListener = (onMissing: () => void) => {
    const previousState = eventListenerBeats;
    window.dispatchEvent(new CustomEvent("sentinel"));
    if (previousState === eventListenerBeats) {
        init();
        onMissing();
    }
};

export default Mode;

import type { ModeInstance } from '../../../@types/surfingkeys';
import {
    listElements,
    isInUIFrame,
    reportIssue,
} from './utils.js';
import { RUNTIME, dispatchSKEvent, runtime } from './runtime.js';
import KeyboardUtils from './keyboardUtils';
import { trackCommandUsage } from '../../common/usageTracker.js';
import { getAnnotationString } from '../../common/commandMetadata.js';

var mode_stack: any[] = [];

const Mode = function(this: any, name: string, statusLine?: string) {
    this.name = name;
    this.statusLine = statusLine;
    this.eventListeners = {};
    this.addEventListener = function(evtName: any, handler: any) {
        this.eventListeners[evtName] = handler;

        if (!_listenedEvents.hasOwnProperty(evtName)) {
            (_listenedEvents as any)[evtName] = function(event: any) {
                handleStack(evtName, event);
            };
            window.addEventListener(evtName, (_listenedEvents as any)[evtName], true);
        }

        return this;
    };

    this.enter = function(priority: any, reentrant: any) {
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

    this.exit = function(peek: any) {
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
var keysNeedKeyupSuppressed: any[] = [];
Mode.suppressKeyUp = function(keyCode: any) {
    if (keysNeedKeyupSuppressed.indexOf(keyCode) === -1) {
        keysNeedKeyupSuppressed.push(keyCode);
    }
};

// FF_CUSTOM_CONFIG_APPLY_SPEED: on the top frame, normal.enter() pushes default
// mappings onto mode_stack synchronously, well before RUNTIME('getSettings')
// resolves and the user's snippets (custom mappings) run. Without this guard,
// keys pressed in that window are handled with default bindings instead of the
// user's. userSettingsLoaded fires once per frame after settings/snippets apply.
//
// In MV3, snippets aren't applied inline — they run in a separately-registered
// chrome.userScripts script (see src/user_scripts/index.ts), which is a second
// race independent of the getSettings round trip above. That script signals
// completion via surfingkeys:snippetUserScriptApplied. expectingSnippetUserScript
// (derived from the settings payload) tells us whether to wait for it at all —
// pages without advanced/snippets never get that event, and the timeout below
// is a safety net in case userScripts registration didn't happen for some reason.
var settingsApplied = false;
var expectingSnippetUserScript = false;
var snippetUserScriptApplied = false;
document.addEventListener("surfingkeys:userSettingsLoaded", (evt: any) => {
    settingsApplied = true;
    var rs = evt.detail && evt.detail[0] && evt.detail[0].settings;
    expectingSnippetUserScript = !!(rs && rs.isMV3 && rs.showAdvanced && rs.snippets && rs.snippets.trim().length > 0);
}, {once: true});
document.addEventListener("surfingkeys:snippetUserScriptApplied", () => {
    snippetUserScriptApplied = true;
}, {once: true});

function isCustomConfigFullyApplied() {
    return settingsApplied && (!expectingSnippetUserScript || snippetUserScriptApplied);
}

function onAfterHandler(mode: any, event: any) {
    if (event.sk_stopPropagation) {
        event.stopImmediatePropagation();
        event.preventDefault();
    }
}

function handleStack(eventName: any, event: any, cb?: any) {
    for (var i = 0; i < mode_stack.length && !event.sk_stopPropagation; i++) {
        var m = mode_stack[i];
        if (!event.sk_suppressed && m.eventListeners.hasOwnProperty(eventName)) {
            var handler = m.eventListeners[eventName];
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
var suppressScrollEvent = 0, _listenedEvents = {
    "sentinel": (_event: any) => {
        eventListenerBeats ++;
    },
    "keydown": function (event: any) {
        event.sk_keyName = KeyboardUtils.getKeyChar(event);
        if (mode_stack.length === 0 && window !== top) {
            // automatically boots iframe on demand
            dispatchSKEvent('iframeBoot');
            document.addEventListener("surfingkeys:userSettingsLoaded", () => {
                // proceed to handle the key event after userSettingsLoaded.
                handleStack("keydown", event);
            }, {once: true});
            return;
        }
        if (runtime.conf.FF_CUSTOM_CONFIG_APPLY_SPEED && !isCustomConfigFullyApplied()) {
            // top frame: default mappings are live but the user's custom
            // mappings (getSettings round trip, and — in MV3 — the separately
            // registered snippet userScript) haven't applied yet. Wait so this
            // key isn't handled with stale (default) bindings.
            var handled = false;
            var replayIfReady = () => {
                if (handled || !isCustomConfigFullyApplied()) return;
                handled = true;
                clearTimeout(timeoutId);
                handleStack("keydown", event);
            };
            document.addEventListener("surfingkeys:userSettingsLoaded", replayIfReady, {once: true});
            document.addEventListener("surfingkeys:snippetUserScriptApplied", replayIfReady, {once: true});
            // Safety net: expectingSnippetUserScript can be true on a page where
            // the snippet userScript never actually runs (e.g. its registration
            // itself is still in flight on this very navigation — MV3
            // chrome.userScripts.register only takes effect on the NEXT
            // navigation). Rather than dropping the key forever waiting for an
            // event that may never come, give up and handle it with whatever
            // mappings exist once the timeout elapses.
            var timeoutId = setTimeout(() => {
                if (handled) return;
                handled = true;
                handleStack("keydown", event);
            }, 1500);
            return;
        }
        handleStack("keydown", event);
    },
    "keyup": function (event: any) {
        handleStack("keyup", event, function (_m: any) {
            var i = keysNeedKeyupSuppressed.indexOf(event.keyCode);
            if (i !== -1) {
                event.stopImmediatePropagation();
                keysNeedKeyupSuppressed.splice(i, 1);
            }
        });
    },
    "scroll": function (event: any) {
        handleStack("scroll", event);
        if (suppressScrollEvent > 0) {
            event.stopImmediatePropagation();
            event.preventDefault();
            suppressScrollEvent--;
        }
    }
};

function init(cb?: any) {
    mode_stack = [];
    for (var evtName in _listenedEvents) {
        window.addEventListener(evtName, (_listenedEvents as any)[evtName], true);
    }
    if (cb) {
        cb();
    }
}

Mode.hasScroll = function (el: any, direction: any, barSize: any) {
    var offset = (direction === 'y') ? ['scrollTop', 'height'] : ['scrollLeft', 'width'];
    var result = el[offset[0]];

    if (result < barSize) {
        // set scroll offset to barSize, and verify if we can get scroll offset as barSize
        var originOffset = el[offset[0]];
        el[offset[0]] = el.getBoundingClientRect()[offset[1]];
        result = el[offset[0]];
        if (result !== originOffset) {
            // this is valid for some site such as http://mail.live.com/
            suppressScrollEvent++;
        }
        el[offset[0]] = originOffset;
    }
    return result >= barSize;
};

Mode.getScrollableElements = function () {
    var nodes = listElements(document.body, NodeFilter.SHOW_ELEMENT, function(n: any) {
        return (Mode.hasScroll(n, 'y', 16) && n.scrollHeight > 200 ) || (Mode.hasScroll(n, 'x', 16) && n.scrollWidth > 200);
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

Mode.init = (cb?: any)=> {
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

Mode.finish = function (mode: any) {
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

Mode.handleMapKey = function(this: any, event: any, onNoMatched?: any) {
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
            this.setLastKeys(this.map_node.meta.word + key);
        }
        // Track command usage for statistics (pendingMap commands)
        trackCommandUsage(
            this.map_node.meta.word + key,
            this.map_node.meta.annotation,
            this.name
        );
        var pf = this.pendingMap.bind(this);
        event.sk_stopPropagation = (!this.map_node.meta.stopPropagation
            || this.map_node.meta.stopPropagation(key));
        this.pendingMap = null;
        pf(key);
        if (this.pendingMap !== null) {
            if (this.isTrustedEvent) {
                dispatchSKEvent("front", ['showKeystroke', key, this]);
            }
            actionDone = true;
            event.sk_stopPropagation = true;
        } else {
            actionDone = Mode.finish(this);
        }
    } else if (this.repeats !== undefined &&
        this.map_node === this.mappings &&
        runtime.conf.digitForRepeat &&
        (key >= "1" || (this.repeats !== "" && key >= "0")) && key <= "9" &&
        this.map_node.getWords().length > 0
    ) {
        // reset only after target action executed or cancelled
        this.repeats += key;
        if (this.isTrustedEvent) {
            dispatchSKEvent("front", ['showKeystroke', key, this]);
        }
        event.sk_stopPropagation = true;
    } else {
        var last = this.map_node;
        this.map_node = this.map_node.find(key);
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
                    this.pendingMap = code;
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
                    (RUNTIME as any).repeats = parseInt(this.repeats) || 1;
                    event.sk_stopPropagation = (!this.map_node.meta.stopPropagation
                        || this.map_node.meta.stopPropagation(key));
                    if ((RUNTIME as any).repeats > runtime.conf.repeatThreshold) {
                        const annotationStr = getAnnotationString(this.map_node.meta.annotation);
                        dispatchSKEvent("front", ['showDialog', `Do you really want to repeat this action (${annotationStr}) ${(RUNTIME as any).repeats} times?`, () => {
                            while((RUNTIME as any).repeats > 0) {
                                code();
                                (RUNTIME as any).repeats--;
                            }
                        }]);
                    } else {
                        while((RUNTIME as any).repeats > 0) {
                            code();
                            (RUNTIME as any).repeats--;
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

Mode.checkEventListener = (onMissing: any) => {
    const previousState = eventListenerBeats;
    window.dispatchEvent(new CustomEvent("sentinel"));
    if (previousState === eventListenerBeats) {
        init();
        onMissing();
    }
};

export default Mode;

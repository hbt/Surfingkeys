import { RUNTIME, dispatchSKEvent, runtime } from './runtime.js';
import Mode from './mode';
import KeyboardUtils from './keyboardUtils';
import Trie from './trie';
import { getAnnotationString } from '../../common/commandMetadata.js';
import {
    createElementWithContent,
    dispatchMouseEvent,
    filterInvisibleElements,
    filterOverlapElements,
    flashPressedLink,
    getAnnotations,
    getBrowserName,
    getClickableElements,
    getColor,
    getCssSelectorsOfEditable,
    getRealRect,
    getTextNodePos,
    getVisibleElements,
    htmlEncode,
    initSKFunctionListener,
    isEditable,
    isElementClickable,
    isElementDrawn,
    openOmnibar,
    refreshHints,
    setSanitizedContent,
} from './utils.js';
import type { ModeConstructor, ModeInstance, SKKeyboardEvent, ClipboardManager, TrieConstructor } from '../../../@types/surfingkeys';

// Hint overlay element: div with extra SK properties
interface HintElement extends HTMLDivElement {
    link: Element | [Node, number, string];
    zIndex: string;
    label: string;
    skColorIndex: number;
}

// Mask element: created via document.createElement('mask')
interface MaskElement extends Element {
    link: Element;
    style: CSSStyleDeclaration;
    classList: DOMTokenList;
}

interface RegionalHintsModeInstance extends ModeInstance {
    attach(elm: HintElement): void;
    onScrollStarted(): void;
    onScrollDone(): void;
}

interface HintsModeInstance extends ModeInstance {
    setNumeric(): void;
    setCharacters(chars: string): void;
    getCharacters(): string;
    dispatchMouseClick(element: Element, shiftKey?: boolean): void;
    click(links: string | Element[], force?: boolean): void;
    previousPage(): boolean;
    nextPage(): boolean;
    onScrollStarted(): void;
    onScrollDone(): void;
    genLabels(total: number): string[];
    coordinate(): { top: number; left: number };
    createInputLayer(): void;
    getSelector(): string | RegExp | Element[];
    create(cssSelector: string | RegExp | Element[], onHintKey: ((elm: Element | [Node, number, string], shiftKey?: boolean) => void) | null, attrs?: Record<string, unknown>): Promise<number>;
    mouseoutLastElement(): void;
    style(css: string, mode?: string): void;
    feedkeys(keys: string): void;
    isScrollKeyInHints(key: string): boolean;
    passFocus(pf: boolean): void;
    appendKeysForRepeat(mode: string, keys: string): void;
    statusLine: string;
}

type HandleMapKeyFn = (this: unknown, event: SKKeyboardEvent) => boolean;

// NormalModeInstance subset used by hints
interface NormalModeSubset {
    isScrollKeyInHints(key: string): boolean;
    passFocus(pf: boolean): void;
    appendKeysForRepeat(mode: string, keys: string): void;
    disable(onElement: boolean): void;
}

// InsertModeInstance subset used by hints
interface InsertModeSubset {
    enter(elm: Element, keepCursor?: boolean): void;
    exit(): void;
}

function placeHintsHost(host: Element) {
    let topLayerElement: Element | null = document.querySelector("dialog");
    if (!topLayerElement || !isElementDrawn(topLayerElement)) {
        topLayerElement = document.documentElement;
    }
    topLayerElement.appendChild(host);
}

function createRegionalHints(clipboard: ClipboardManager) {
    const self = new (Mode as unknown as ModeConstructor)("RegionalHints") as RegionalHintsModeInstance;

    self.mappings = new (Trie as unknown as TrieConstructor)();
    self.map_node = self.mappings;

    const regionalHintsHost = document.createElement("div");
    regionalHintsHost.className = "surfingkeys_hints_host";
    regionalHintsHost.attachShadow({ mode: 'open' });
    const hintsStyle = createElementWithContent('style', `
div.menu {
    font-size: 14px;
    color: #fff;
}
div.menu-item {
    display: inline-block;
    padding: 4px;
    margin: 4px;
    background: #454545;
    box-shadow: inset 0 -1px 0 #bbb;
    border-radius: 3px;
    font-size: 14px;
}
kbd {
    white-space: nowrap;
    display: inline-block;
    padding: 3px 5px;
    font: 14px Consolas, "Liberation Mono", Menlo, Courier, monospace;
    line-height: 10px;
    vertical-align: middle;
    border: solid 1px #ccc;
    border-bottom-color: #bbb;
    border-radius: 3px;
    box-shadow: inset 0 -1px 0 #bbb;
    margin-right: 4px;
}
`);
    regionalHintsHost!.shadowRoot!.appendChild(hintsStyle);

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Esc>"), {
        annotation: {
            short: "Exit regional hints mode",
            unique_id: "cmd_hints_exit_regional",
            category: "hints",
            description: "Exit regional hints mode and return to normal mode",
            tags: ["hints", "exit", "regional"]
        },
        feature_group: 17,
        code: function() {
            self.exit();
        }
    });

    self.mappings.add("ct", {
        annotation: {
            short: "Copy text from element",
            unique_id: "cmd_hints_copy_text",
            category: "hints",
            description: "Copy text from target element in regional hints mode",
            tags: ["hints", "clipboard", "copy", "text"]
        },
        feature_group: 17,
        code: function() {
            clipboard.write((overlay!.link as HTMLElement).innerText);
        }
    });

    self.mappings.add("ch", {
        annotation: {
            short: "Copy HTML from element",
            unique_id: "cmd_hints_copy_html",
            category: "hints",
            description: "Copy HTML from target element in regional hints mode",
            tags: ["hints", "clipboard", "copy", "html"]
        },
        feature_group: 17,
        code: function() {
            clipboard.write((overlay!.link as HTMLElement).innerHTML);
        }
    });

    self.mappings.add("d", {
        annotation: {
            short: "Delete target element",
            unique_id: "cmd_hints_delete_element",
            category: "hints",
            description: "Delete target element in regional hints mode",
            tags: ["hints", "delete", "dom"]
        },
        feature_group: 17,
        code: function() {
            (overlay!.link as Element).remove();
            self.exit();
        }
    });

    self.mappings.add("l", {
        annotation: {
            short: "Learn about element",
            unique_id: "cmd_hints_learn_element",
            category: "hints",
            description: "Learn more about target element using LLM chat in hints mode",
            tags: ["hints", "llm", "learn", "ai"]
        },
        feature_group: 17,
        code: function() {
            const system = (overlay!.link as HTMLElement).innerText;
            openOmnibar({type: "LLMChat", extra: {system}});
            self.exit();
        }
    });

    const menu = createElementWithContent('div', "", {class: "menu"});
    getAnnotations(self.mappings as unknown as Parameters<typeof getAnnotations>[0]).forEach((b: { word: string; annotation: unknown }) => {
        const menuItem = createElementWithContent('div', "", {class: "menu-item"});
        menuItem.appendChild(createElementWithContent('kbd', htmlEncode(KeyboardUtils.decodeKeystroke(b.word))));
        const annotationStr = getAnnotationString(b.annotation);
        menuItem.appendChild(createElementWithContent('span', annotationStr));
        menu.appendChild(menuItem);
    });

    self.addEventListener('keydown', function(event: SKKeyboardEvent) {
        (Mode.handleMapKey as unknown as HandleMapKeyFn).call(self, event);
    });

    let overlay: HintElement | null = null;
    self.onExit = function() {
        overlay!.remove();
        regionalHintsHost.remove();
    };
    self.attach = (elm: HintElement) => {
        if (overlay) overlay.remove();
        overlay = elm;
        regionalHintsHost!.shadowRoot!.appendChild(overlay);
        placeHintsHost(regionalHintsHost);
        overlay.appendChild(menu);
        self.enter();
    };
    self.onScrollStarted = () => {
        if (!document.documentElement.contains(regionalHintsHost)) {
            return;
        }
        overlay!.style.display = "none";
    };
    self.onScrollDone = () => {
        const be = (overlay!.link as Element).getBoundingClientRect();
        overlay!.style.top = be.top + "px";
        overlay!.style.left = be.left + "px";
        overlay!.style.display = "";
    };
    return self;
}

function createHints(insert: ModeInstance, normal: NormalModeSubset, clipboard: ClipboardManager) {
    const self = new (Mode as unknown as ModeConstructor)("Hints") as HintsModeInstance;
    const hintsHost = document.createElement("div");
    hintsHost.className = "surfingkeys_hints_host";
    hintsHost.attachShadow({ mode: 'open' });
    const hintsStyle = createElementWithContent('style', `
div {
    position: absolute;
    display: block;
    font-size: 8pt;
    font-weight: bold;
    padding: 0px 2px 0px 2px;
    background: -webkit-gradient(linear, left top, left bottom, color-stop(0%,#FFF785), color-stop(100%,#FFC542));
    color: #000;
    border: solid 1px #C38A22;
    border-radius: 3px;
    box-shadow: 0px 3px 7px 0px rgba(0, 0, 0, 0.3);
    width: auto;
}
div:empty {
    display: none;
}
[mode=text] div {
    background: -webkit-gradient(linear, left top, left bottom, color-stop(0%,#aaa), color-stop(100%,#fff));
}
div.hint-scrollable {
    background: rgba(170, 170, 255, 0.85);
}
[mode=text] div.begin {
    color: #00f;
}
[mode=input] mask {
    background: rgba(255, 217, 0, 0.25);
}
[mode=input] mask.activeInput {
    background: rgba(0, 0, 255, 0.25);
}`);
    /* When the <style> loaded, set hints host's size */
    hintsStyle.onload = () => {
        /* Get height and width in integers */
        const height = Math.floor(document.documentElement.scrollTop +
            document.documentElement.clientHeight) - 1;
        const width = Math.floor(document.documentElement.scrollLeft +
            document.documentElement.clientWidth) - 1;

        /* Set height and width */
        hintsHost.style.height = `${height}px`;
        hintsHost.style.width = `${width}px`;
    };

    hintsHost!.shadowRoot!.appendChild(hintsStyle);
    const regionalHints = createRegionalHints(clipboard);

    let numeric = false;
    /**
     * Use digits as hint label, with it set you could type text to filter links, this API is to replace original setting like `Hints.numericHints = true;`.
     *
     * @name Hints.setNumeric
     *
     * @example
     * Hints.setNumeric();
     */
    self.setNumeric = function() {
        numeric = true;
    };
    let characters = "asdfgqwertzxcvb";
    /**
     * Set characters for generating hints, this API is to replace original setting like `Hints.characters = "asdgqwertzxcvb";`.
     *
     * @param {string} characters the characters for generating hints.
     * @name Hints.setCharacters
     *
     * @example
     * Hints.setCharacters("asdgqwertzxcvb");
     */
    let excludedScrollKeys: string[] = [];
    self.setCharacters = function(chars: string) {
        characters = chars;
        for (const c of chars) {
            if (normal.isScrollKeyInHints(c)) {
                excludedScrollKeys.push(c);
            }
        }
    };
    self.getCharacters = () => {
        return characters;
    };

    self.addEventListener('keydown', function(event: SKKeyboardEvent) {
        event.sk_stopPropagation = true;

        let ai = holder.querySelector('[mode=input]>mask.activeInput');
        if (ai !== null) {
            const masks = holder.querySelectorAll('mask');
            var elm = ai.link as Element;
            if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
                elm.blur();
                hide();
            } else if (event.keyCode === KeyboardUtils.keyCodes.tab) {
                ai.classList.remove('activeInput');
                _lastCreateAttrs.activeInput = ((_lastCreateAttrs.activeInput ?? 0) + (event.shiftKey ? -1 : 1 )) % masks.length;
                ai = masks[_lastCreateAttrs.activeInput];
                ai.classList.add('activeInput');

                elm = ai.link as Element;
                elm.focus();
            } else if (event.keyCode !== KeyboardUtils.keyCodes.shiftKey) {
                event.sk_stopPropagation = false;
                hide();
                (insert as unknown as InsertModeSubset).enter(elm);
            }
            return;
        }

        const hints = holder.querySelectorAll('div');
        if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
            hide();
        } else if (event.keyCode === KeyboardUtils.keyCodes.space) {
            holder.style.display = "none";
        } else if (event.keyCode === KeyboardUtils.keyCodes.shiftKey) {
            flip();
        } else if (hints.length > 0) {
            if (event.keyCode === KeyboardUtils.keyCodes.backspace) {
                if (prefix.length > 0) {
                    prefix = prefix.substr(0, prefix.length - 1);
                    handleHint(event);
                } else if (textFilter.length > 0) {
                    textFilter = textFilter.substr(0, textFilter.length - 1);
                    refreshByTextFilter();
                }
            } else {
                var key = event.sk_keyName;
                if (isCapital(key)) {
                    shiftKey = true;
                }
                if (key !== '') {
                    if (numeric) {
                        if (key >= "0" && key <= "9") {
                            prefix += key;
                        } else {
                            textFilter += key;
                            refreshByTextFilter();
                        }
                        handleHint(event);
                    } else if (characters.toLowerCase().indexOf(key.toLowerCase()) !== -1) {
                        prefix = prefix + key.toUpperCase();
                        handleHint(event);
                    } else {
                        if (normal.isScrollKeyInHints(key) && excludedScrollKeys.indexOf(key) === -1) {
                            // pass on the key to normal mode to scroll page.
                            event.sk_stopPropagation = false;
                        } else {
                            // quit hints if user presses non-hint key and no keys for scrolling
                            hide();
                        }
                    }
                }
            }
        }
    });
    self.addEventListener('keyup', function(event: SKKeyboardEvent) {
        if (event.keyCode === KeyboardUtils.keyCodes.space) {
            holder.style.display = "";
        }
    });

    /**
     * The default `onHintKey` implementation.
     *
     * @param {HTMLElement} element the element for which the pressed hint is targeted.
     * @name Hints.dispatchMouseClick
     * @see Hints.create
     *
     * @example
     * mapkey('q', 'click on images', function() {
     *     Hints.create("div.media_box img", Hints.dispatchMouseClick);
     * }, {domain: /weibo.com/i});
     */
    self.dispatchMouseClick = function(element: Element) {
        if (isEditable(element)) {
            self.exit();
            normal.passFocus(true);
            (element as HTMLElement).focus();
            (insert as unknown as InsertModeSubset).enter(element);
        } else {
            if (!behaviours.multipleHits) {
                self.exit();
            }
            let tabbed = behaviours.tabbed, active = behaviours.active;
            if (behaviours.multipleHits) {
                const href = element.getAttribute('href');
                if (href !== null && href !== "#") {
                    tabbed = true;
                    active = false;
                }
            }

            const mouseEventModifiers = {shiftKey: shiftKey || active};
            if (shiftKey && runtime.conf.hintShiftNonActive) {
                tabbed = true;
                mouseEventModifiers.shiftKey = false;
            }
            if (tabbed) {
                const modKey = (navigator.platform.indexOf("Mac") !== -1) ? "metaKey" : "ctrlKey";
                (mouseEventModifiers as Record<string, unknown>)[modKey] = true;
            }
            flashPressedLink(element,() => {
                if (tabbed && getBrowserName().startsWith("Safari")) {
                    RUNTIME("openLink", {
                        tab: {
                            tabbed: tabbed,
                            active: mouseEventModifiers.shiftKey
                        },
                        url: getHref(element)
                    });
                } else {
                    self.mouseoutLastElement();
                    dispatchMouseEvent(element, behaviours.mouseEvents ?? MOUSE_EVENTS, mouseEventModifiers);
                    dispatchSKEvent("observer", ['turnOn']);
                    lastMouseTarget = element;
                    if (document.activeElement!.matches(runtime.conf.disabledOnActiveElementPattern as unknown as string)) {
                        setTimeout(() => {
                            normal.disable(true);
                        }, 100);
                    }
                }

                if (behaviours.multipleHits) {
                    setTimeout(resetHints, 300);
                }
            });
        }
        element.classList.remove("surfingkeys--hints--clicking");
    };

    const MOUSE_EVENTS = ['mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'focus', 'focusin'];
    interface Behaviours {
        mouseEvents?: string[];
        multipleHits?: boolean;
        tabbed?: boolean;
        active?: boolean;
        regionalHints?: boolean;
        statusLine?: string;
        activeInput?: number;
        [key: string]: unknown;
    }
    var prefix = "",
        textFilter = "",
        lastMouseTarget: Element | null = null,
        behaviours: Behaviours = {
            mouseEvents: MOUSE_EVENTS
        },
        holder = createElementWithContent('section', '', {style: "display: block; opacity: 1;"}),
        shiftKey = false;
    var _lastCreateAttrs: Behaviours = {},
        _onHintKey: ((elm: Element | [Node, number, string]) => void) | null = self.dispatchMouseClick as unknown as (elm: Element | [Node, number, string]) => void,
        _cssSelector: string | RegExp | Element[] = "";

    function isCapital(key: string) {
        return key === key.toUpperCase() &&
            key !== key.toLowerCase(); // in case key is a symbol or special character
    }

    function getZIndex(node: Node | null) {
        var z = 0;
        let cur: Node | null = node;
        do {
            if (cur && cur.nodeType === Node.ELEMENT_NODE) {
                var i = parseInt(getComputedStyle(cur as Element).getPropertyValue('z-index'));
                z += (isNaN(i) || i < 0) ? 0 : i;
            }
            cur = cur ? cur.parentNode : null;
        } while (cur && cur !== document.body && cur !== document && cur.nodeType !== cur.DOCUMENT_FRAGMENT_NODE);
        return z;
    }

    function handleHint(evt?: SKKeyboardEvent | Event) {
        const hints = Array.from(holder.querySelectorAll('div:not(:empty)'));
        const hintState = refreshHints(hints, prefix);
        const elm = hintState.matched;
        if (elm) {
            normal.appendKeysForRepeat("Hints", prefix);
            if (typeof(_onHintKey) === 'function') {
                if (behaviours.regionalHints) {
                    setTimeout(() => {
                        const overlay = createOverlay(elm as Element, elm.skColorIndex, "99") as HintElement;
                        overlay.link = elm;
                        regionalHints.attach(overlay);
                    }, 10);
                } else {
                    _onHintKey(elm);
                }
            } else {
                if (elm.constructor.name === "Array") {
                    const elmArr = elm as unknown as Element[];
                    const target = elmArr[0];
                    // remove Text Node from elm as it cannot be transitted across JS scope
                    (elmArr as unknown as string[])[0] = "__EVENT_TARGET__";
                    dispatchSKEvent('user', ["onHintClicked", elmArr], target);
                } else {
                    dispatchSKEvent('user', ["onHintClicked", shiftKey], elm);
                }
            }
            if (behaviours.multipleHits) {
                prefix = "";
                refreshHints(hints, prefix);
            } else {
                hide();
            }
        } else if (hintState.candidates === 0) {
            hide();
        }
        // suppress future key handler since the event has been treated as a hint
        if (evt) {
            Mode.suppressKeyUp((evt as KeyboardEvent).keyCode);
            evt.stopImmediatePropagation();
            evt.preventDefault();
        }
    }

    function refreshByTextFilter() {
        var hints: HTMLDivElement[] = Array.from(holder.querySelectorAll('div'));
        if (textFilter.length > 0) {
            hints = hints.filter(function(hint) {
                (hint as HintElement).label = "";
                setSanitizedContent(hint, "");
                var e = (hint as HintElement).link;
                var text = (e as Element).innerText;
                if (text === undefined) {
                    const ea = e as unknown as Element[];
                    text = ea[0] ? (ea[0].textContent ?? "") : "";
                }
                return text.indexOf(textFilter) !== -1;
            });
        }
        var hintLabels = self.genLabels(hints.length);
        hints.forEach(function(e, i) {
            (e as HintElement).label = hintLabels[i];
            setSanitizedContent(e, hintLabels[i]);
        });
    }

    function hide() {
        // To reset default behaviours here is necessary, as some hint my be hit without creation.
        behaviours = {
            mouseEvents: MOUSE_EVENTS
        };
        // Clean up temporary class added for array-based hint creation
        document.querySelectorAll('.surfingkeys--hints--creating').forEach(function(el) {
            el.classList.remove('surfingkeys--hints--creating');
        });
        setSanitizedContent(holder, "");
        holder.remove();
        hintsHost.remove();
        prefix = "";
        textFilter = "";
        shiftKey = false;
        self.exit();
    }

    function flip() {
        var hints = holder.querySelectorAll('div');
        if (hints[0].style.zIndex == hints[0].zIndex) {
            hints.forEach(function(hint, i) {
                var z = parseInt((hint as HintElement).style.zIndex);
                (hint as HintElement).style.zIndex = String(hints.length - i + 2147483000 - z);
            });
        } else {
            hints.forEach(function(hint) {
                (hint as HintElement).style.zIndex = (hint as HintElement).zIndex;
            });
        }
    }

    function resetHints() {
        if (Mode.getCurrent() !== self || !document.documentElement.contains(hintsHost)) {
            return;
        }
        var start = new Date().getTime();
        var found = createHints(_cssSelector, _lastCreateAttrs);
        if (found > 0) {
            self.statusLine += " - " + (new Date().getTime() - start) + "ms / " + found;
            Mode.showStatus();
        }
    }

    function getHref(elm: Element): string {
        var href = (elm as HTMLAnchorElement).href;
        let cur: Element | null = elm;
        while (!href && cur) {
            cur = cur.parentElement;
            href = cur ? (cur as HTMLAnchorElement).href : "";
        }
        return href || "";
    }


    function walkPageUrl(step: number) {
        for (var i = 0; i < runtime.conf.pageUrlRegex.length; i++) {
            var numbers = window.location.href.match(runtime.conf.pageUrlRegex[i]);
            if (numbers && numbers.length === 4) {
                var cp = parseInt(numbers[2]);
                if (cp < 0xffffffff) {
                    window.location.href = numbers[1] + (cp + step) + numbers[3];
                    return true;
                }
            }
        }
        return false;
    }

    function uniqueLinks(links: Element[]) {
        let unique: Record<string, Element> = {};
        links.forEach(function(link: Element) {
            let href = link.getAttribute('href');
            if (href !== null && !unique[href]) {
                unique[href] = link;
            }
        });
        return Object.values(unique);
    }

    /**
     * Click element or create hints for elements to click.
     *
     * @param links `string or array of HTMLElement`, click on it if there is only one in the array or `force` parameter is true, otherwise hints will be generated for them. If `links` is a string, it will be used as css selector for `getClickableElements`.
     * @param {boolean} [force=false] force to click the first input element whether there are more than one elements in `links` or not.
     * @name Hints.click
     *
     * @example
     * mapkey('zz', 'Hide replies', function() {
     *     Hints.click(document.querySelectorAll("#less-replies:not([hidden])"), true);
     * });
     */
    self.click = function(links: string | Element[], force?: boolean) {
        if (typeof(links) === 'string') {
            links = getClickableElements(links);
        }
        if ((links as Element[]).length > 1) {
            if (force) {
                (links as Element[]).forEach(function(u: Element) {
                    self.dispatchMouseClick(u);
                });
            } else {
                self.create(links as Element[], self.dispatchMouseClick as (elm: Element | [Node, number, string], shiftKey?: boolean) => void);
            }
        } else if ((links as Element[]).length === 1) {
            self.dispatchMouseClick((links as Element[])[0]);
        }
    };

    self.previousPage = function () {
        var prevLinks = uniqueLinks(getClickableElements("[rel=prev]", runtime.conf.prevLinkRegex));
        if (prevLinks.length) {
            self.click(prevLinks);
            return true;
        } else {
            return walkPageUrl(-1);
        }
    };

    self.nextPage = function () {
        var nextLinks = uniqueLinks(getClickableElements("[rel=next]", runtime.conf.nextLinkRegex));
        if (nextLinks.length) {
            self.click(nextLinks);
            return true;
        } else {
            return walkPageUrl(1);
        }
    };

    self.onScrollStarted = () => {
        if (!document.documentElement.contains(hintsHost)) {
            return;
        }
        setSanitizedContent(holder, "");
        holder.remove();
        prefix = "";
    };

    self.onScrollDone = resetHints;

    initSKFunctionListener("hints", {
        scrollStarted: () => {
            const mode = Mode.getCurrent() as { onScrollStarted?: () => void } | undefined;
            if (mode?.onScrollStarted) mode.onScrollStarted();
        },
        scrollDone: () => {
            const mode = Mode.getCurrent() as { onScrollDone?: () => void } | undefined;
            if (mode?.onScrollDone) mode.onScrollDone();
        },
        topBoundaryHit: self.previousPage,
        bottomBoundaryHit: self.nextPage,
        dispatchMouseClick: self.dispatchMouseClick,
    }, true);

    self.genLabels = function(total: number) {
        let chars = characters.toUpperCase();
        var hints = [""], offset = 0;
        while (hints.length - offset < total || offset == 0) {
            var prefix = hints[offset++];
            for (var i = 0; i < chars.length; i++) {
                hints.push(prefix + chars[i]);
            }
        }
        hints = hints.slice(offset, offset + total);
        return hints;
    };

    self.coordinate = function() {
        // a hack to get co-ordinate
        var link = createElementWithContent('div', 'A', {style: "top: 0; left: 0;"});
        holder.prepend(link);
        hintsHost!.shadowRoot!.appendChild(holder);
        var br = link.getBoundingClientRect();
        var ret = {
            top: br.top + window.pageYOffset - document.documentElement.clientTop,
            left: br.left + window.pageXOffset - document.documentElement.clientLeft
        };
        setSanitizedContent(holder, "");
        holder.remove();
        return ret;
    };

    function _initHolder(mode: string) {
        setSanitizedContent(holder, "");
        holder.setAttribute('mode', mode);
        holder.style.display = "";
    }

    function createOverlay(e: Element, i: number, alpha: string) {
        e.skColorIndex = i;

        const be = e.getBoundingClientRect();
        const z = getZIndex(e);

        const frame = document.createElement('mask');
        frame.style.position = "fixed";
        frame.style.top = be.top + "px";
        frame.style.left = be.left + "px";
        frame.style.width = be.width - 4 + "px";
        frame.style.height = be.height - 4 + "px";
        frame.style.zIndex = String(z + 9999);
        frame.style.background = getColor(i) + alpha;
        frame.style.border = `2px solid ${getColor(i)}`;
        return frame;
    }

    function placeHints(elements: Element[]) {
        _initHolder('click');
        const hintLabels = self.genLabels(elements.length);
        const bof = self.coordinate();
        const style = createElementWithContent("style", _styleForClick);
        holder.prepend(style);
        if (behaviours.regionalHints) {
            elements.forEach(function(e: Element, i: number) {
                holder.append(createOverlay(e, i, "33"));
            });
        }

        let lastTop = -1, lastLeft = -1;
        var links = elements.map(function(elm: Element, i: number) {
            var r = getRealRect(elm),
                z = getZIndex(elm);
            var left, width = Math.min(r.width, window.innerWidth);
            if (runtime.conf.hintAlign === "right") {
                left = window.pageXOffset + r.left - bof.left + width;
            } else if (runtime.conf.hintAlign === "left") {
                left = window.pageXOffset + r.left - bof.left;
            } else {
                left = window.pageXOffset + r.left - bof.left + width / 2;
            }
            if (left < window.pageXOffset) {
                left = window.pageXOffset;
            } else if (left + 32 > window.pageXOffset + window.innerWidth) {
                left = window.pageXOffset + window.innerWidth - 32;
            }
            var linkEl = createElementWithContent('div', hintLabels[i]);
            const link = linkEl as unknown as HintElement;
            if ((elm as HTMLElement).dataset.hint_scrollable) { link.classList.add('hint-scrollable'); }
            let lTop = Math.max(r.top + window.pageYOffset - bof.top, 0);
            if (lTop === lastTop && Math.abs(left - lastLeft) < 20) {
                left += 20 - Math.abs(left - lastLeft);
            } else if (left === lastLeft && Math.abs(lTop - lastTop) < 20) {
                lTop += 20 - Math.abs(lTop - lastTop);
            }
            link.style.top = lTop + "px";
            link.style.left = left + "px";
            link.style.zIndex = String(z + 9999);
            if (behaviours.regionalHints) {
                link.style.background = getColor(i);
            }
            link.zIndex = link.style.zIndex;
            link.label = hintLabels[i];
            link.link = elm;

            lastTop = lTop;
            lastLeft = left;
            return link;
        }) as HintElement[];
        links.forEach(function(link: HintElement) {
            holder.appendChild(link);
        });
        var hints = holder.querySelectorAll('div');
        var bcr = getRealRect(hints[0]);
        for (var i = 1; i < hints.length; i++) {
            var h = hints[i];
            var tcr = getRealRect(h);
            if (tcr.top === bcr.top && Math.abs(tcr.left - bcr.left) < bcr.width) {
                h.style.top = h.offsetTop + h.offsetHeight + "px";
            }
            bcr = getRealRect(h);
        }
        hintsHost!.shadowRoot!.appendChild(holder);
    }

    function createHintsForElements(elements: Element[], attrs: Record<string, unknown>) {
        attrs = attrs || {};
        for (var attr in attrs) {
            behaviours[attr] = attrs[attr];
        }
        self.statusLine = (attrs && typeof attrs.statusLine === 'string' ? attrs.statusLine : null) || "Hints to click";

        elements = filterInvisibleElements(elements);
        if (elements.length > 0) {
            placeHints(elements);
        }
        return elements.length;
    }

    function createHintsForClick(cssSelector: string | Element[], attrs: Record<string, unknown>) {
        self.statusLine = "Hints to click";

        attrs = attrs || {};
        for (var attr in attrs) {
            behaviours[attr] = attrs[attr];
        }
        let elements: Element[];
        if (cssSelector === "" || (Array.isArray(cssSelector) && (cssSelector as Element[]).length === 0)) {
            elements = getVisibleElements(function(e: Element, v: Element[]) {
                if (isElementClickable(e)) {
                    v.push(e);
                }
            });
            elements = filterOverlapElements(elements);
        } else if (Array.isArray(cssSelector)) {
            elements = filterInvisibleElements(cssSelector as Element[]);
        } else {
            elements = getVisibleElements(function (e: Element, v: Element[]) {
                if (e.matches(cssSelector as string) && !e.disabled && !e.readOnly) {
                    v.push(e);
                }
            });
            elements = filterInvisibleElements(elements);
            elements = filterOverlapElements(elements);
        }

        if (elements.length > 0) {
            placeHints(elements);
        }

        return elements.length;
    }

    function createHintsForTextNode(rxp: RegExp, attrs: Record<string, unknown>) {
        for (var attr in attrs) {
            behaviours[attr] = attrs[attr];
        }
        self.statusLine = (attrs && typeof attrs.statusLine === 'string' ? attrs.statusLine : null) || "Hints to select text";

        var textElements = getVisibleElements(function(e: Element, v: Element[]) {
            var aa = e.childNodes;
            for (var i = 0, len = aa.length; i < len; i++) {
                if (aa[i].nodeType == Node.TEXT_NODE && (aa[i] as Text).data.length > 0) {
                    v.push(e);
                    break;
                }
            }
        });
        const textNodes = textElements.flatMap(function (e: Element) {
            var aa = e.childNodes;
            var bb: Text[] = [];
            for (var i = 0, len = aa.length; i < len; i++) {
                if (aa[i].nodeType == Node.TEXT_NODE && (aa[i] as Text).data.trim().length > 1) {
                    bb.push(aa[i] as Text);
                }
            }
            return bb;
        });

        type TextPosition = [Text, number, string];
        var positions: TextPosition[];
        if (rxp.flags.indexOf('g') === -1) {
            positions = textNodes.map(function(e: Text) {
                return [e, 0, ""] as TextPosition;
            });
        } else {
            positions = [];
            for (var i = 0, length = textNodes.length; i < length; i++) {
                var e = textNodes[i], match;
                while ((match = rxp.exec(e.data)) != null) {
                    positions.push([e, match.index, match[0]]);
                }
            }
        }

        const elements = positions.map(function(e: TextPosition) {
            var pos = getTextNodePos(e[0], e[1]);
            var caretViewport = [0, 0, window.innerHeight, window.innerWidth];
            if (runtime.conf.caretViewport && runtime.conf.caretViewport.length === 4) {
                caretViewport = runtime.conf.caretViewport;
            }
            if (e[0].data.trim().length === 0
                || pos.top < caretViewport[0]
                || pos.left < caretViewport[1]
                || pos.top > caretViewport[2]
                || pos.left > caretViewport[3]) {
                return null;
            } else {
                var z = getZIndex(e[0].parentNode);
                var link = document.createElement('div') as unknown as HintElement;
                if (e[1] === 0) {
                    link.className = "begin";
                }
                link.style.position = "fixed";
                link.style.top = pos.top + "px";
                link.style.left = pos.left + "px";
                link.style.zIndex = String(z + 9999);
                link.zIndex = link.style.zIndex;
                link.link = e;
                return link;
            }
        }).filter(function(e) {
            return e !== null;
        });
        if (document.getSelection()!.anchorNode) {
            document.getSelection()!.collapseToStart();
        }

        if (elements.length > 0) {
            _initHolder('text');
            var hintLabels = self.genLabels(elements.length);
            elements.forEach(function(e, i) {
                (e as HintElement).label = hintLabels[i];
                setSanitizedContent(e as Element, hintLabels[i]);
                holder.append(e as Element);
            });

            var style = createElementWithContent('style', _styleForText);
            holder.prepend(style);
            hintsHost!.shadowRoot!.appendChild(holder);
        }

        return elements.length;
    }

    function createHints(cssSelector: string | RegExp | Element[], attrs: Record<string, unknown>) {
        placeHintsHost(hintsHost);
        if (cssSelector instanceof RegExp || (cssSelector as unknown as { constructor: { name: string } }).constructor.name === "RegExp") {
            return createHintsForTextNode(cssSelector as RegExp, attrs);
        } else if (Array.isArray(cssSelector)) {
            return createHintsForElements(cssSelector as Element[], attrs);
        }
        return createHintsForClick(cssSelector as string, attrs);
    }

    self.createInputLayer = function() {
        placeHintsHost(hintsHost);
        const cssSelector = getCssSelectorsOfEditable();

        var elements = getVisibleElements(function(e: Element, v: Element[]) {
            if (e.matches(cssSelector) && !e.disabled && !e.readOnly
                && (e.type === "text" || e.type === "email" || e.type === "search" || e.type === "password")) {
                v.push(e);
            }
        });

        if (elements.length === 0 && document.querySelector(cssSelector) !== null) {
            document.querySelector(cssSelector)!.scrollIntoView();
            elements = getVisibleElements(function(e: Element, v: Element[]) {
                if (e.matches(cssSelector) && !e.disabled && !e.readOnly) {
                    v.push(e);
                }
            });
        }

        if (elements.length > 1) {
            self.enter();
            _initHolder('input');
            elements.forEach(function(e, _i) {
                var be = e.getBoundingClientRect();
                var z = getZIndex(e);

                var mask = document.createElement('mask') as unknown as MaskElement;
                mask.style.position = "fixed";
                mask.style.top = be.top + "px";
                mask.style.left = be.left + "px";
                mask.style.width = be.width + "px";
                mask.style.height = be.height + "px";
                mask.style.zIndex = String(z + 9999);
                mask.link = e;
                holder.append(mask as unknown as Element);
            });
            hintsHost!.shadowRoot!.appendChild(holder);
            _lastCreateAttrs.activeInput = 0;
            const ai = holder.querySelector('[mode=input]>mask');
            if (ai) {
                ai.classList.add("activeInput");
                normal.passFocus(true);
                (ai.link as Element).focus();
            }
        } else if (elements.length === 1) {
            normal.passFocus(true);
            (elements[0] as HTMLElement).focus();
            (insert as unknown as InsertModeSubset).enter(elements[0]);
        }
    };

    self.getSelector = function() {
        return _cssSelector;
    };

    /**
     * Create hints for elements to click.
     *
     * @param cssSelector `string or array of HTMLElement`, if `links` is a string, it will be used as css selector.
     * @param {function} onHintKey a callback function on hint keys pressed.
     * @param {object} [attrs=null] `active`: whether to activate the new tab when a link is opened, `tabbed`: whether to open a link in a new tab, `multipleHits`: whether to stay in hints mode after one hint is triggered.
     * @name Hints.create
     * @returns {Promise} which will be resolved how many hints are created.
     * @see Hints.dispatchMouseClick
     *
     * @example
     * mapkey('yA', '#7Copy a link URL to the clipboard', function() {
     *     Hints.create('*[href]', function(element) {
     *         Clipboard.write('[' + element.innerText + '](' + element.href + ')');
     *     });
     * });
     */
    self.create = function(cssSelector: string | RegExp | Element[], onHintKey: ((elm: Element | [Node, number, string]) => void) | null, attrs?: Record<string, unknown>) {
        if (numeric) {
            characters = "1234567890";
        }

        // save last used attributes, which will be reused if the user scrolls while the hints are still open
        _cssSelector = cssSelector;
        _onHintKey = onHintKey;
        _lastCreateAttrs = (attrs || {}) as Behaviours;

        var start = new Date().getTime();
        var found = createHints(cssSelector, attrs || {});
        if (found > (runtime.conf.hintExplicit ? 0 : 1)) {
            self.statusLine += " - " + (new Date().getTime() - start) + "ms / " + found;
            self.enter();
        } else {
            handleHint();
        }
        dispatchSKEvent('user', ["onHintCreated", found]);
        const promise = new Promise<number>((resolve, _reject) => {
            resolve(found);
        });
        return promise;
    };

    self.mouseoutLastElement = function() {
        if (lastMouseTarget) {
            dispatchMouseEvent(lastMouseTarget, ['mouseout'], {});
            lastMouseTarget = null;
        }
    };

    var _styleForText = "", _styleForClick = "";
    /**
     * Set styles for hints.
     *
     * @param {string} css styles for hints.
     * @param {string} [mode=null] sub mode for hints, use `text` for hints mode to enter visual mode.
     * @name Hints.style
     *
     * @example
     * Hints.style('border: solid 3px #552a48; color:#efe1eb; background: none; background-color: #552a48;');
     * Hints.style("div{border: solid 3px #707070; color:#efe1eb; background: none; background-color: #707070;} div.begin{color:red;}", "text");
     */
    self.style = function(css: string, mode?: string) {
        if (!/^div\b/.test(css)) {
            css = `div{${css}}`;
        }

        if (mode === "text") {
            _styleForText = css.replace(/\bdiv\b/g, "[mode='text'] div");
        } else {
            _styleForClick = css.replace(/\bdiv\b/g, "div");
        }
    };

    self.feedkeys = function(keys: string) {
        setTimeout(function() {
            prefix = keys.toUpperCase();
            handleHint();
        }, 1);
    };

    return self;
}

export default createHints;

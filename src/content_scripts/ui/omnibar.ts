import Trie from '../common/trie';
import KeyboardUtils from '../common/keyboardUtils';
import Mode from '../common/mode';

declare const Normal: { addVIMark(mark: string, url: string): void };
import { debounce } from 'lodash';
import {
    filterByTitleOrUrl,
    regexFromString,
} from '../../common/utils.js';
import {
    attachFaviconToImgSrc,
    constructSearchURL,
    createElementWithContent,
    getBrowserName,
    htmlEncode,
    parseAnnotation,
    safeDecodeURI,
    safeDecodeURIComponent,
    scrollIntoViewIfNeeded,
    setSanitizedContent,
    showBanner,
    tabOpenLink,
    timeStampString,
    toggleQuote,
} from '../common/utils.js';
import { getAnnotationString } from '../../common/commandMetadata.js';
import { RUNTIME, runtime } from '../common/runtime.js';
import LLMChat from './llmchat';
import { ModeConstructor, SKKeyboardEvent, TrieConstructor } from '../../../@types/surfingkeys';

// Internal omnibar handler interface — extends the public OmnibarHandler with optional lifecycle hooks
interface OmnibarHandlerInternal {
    prompt?: string;
    omnibarPosition?: string;
    focusFirstCandidate?: boolean;
    onOpen?(args?: unknown): void;
    onInput?(): void;
    onEnter(): boolean | void;
    onClose?(): void;
    onTabKey?(): void;
    onKeydown?(event: KeyboardEvent): boolean;
    onReset?(): void;
    onResponse?(response: unknown): void;
    getResults?(): void;
    rotateInput?(backward: boolean): void;
    tabbed?: boolean;
    activeTab?: boolean;
    aliases?: Record<string, unknown>;
    url?: string;
    suggestionURL?: string;
    inFolder?: unknown[];
    [key: string]: unknown;
}

// Front API as seen from omnibar
interface OmnibarFront {
    hidePopup(): void;
    showEditor(args: Record<string, unknown>): void;
    openOmnibar(args: Record<string, unknown>): void;
    contentCommand(args: Record<string, unknown>, cb?: (result: unknown) => void): void;
    postMessage(args: Record<string, unknown>): void;
    addDestroyListener(fn: () => void): void;
    _actions: Record<string, (message: Record<string, unknown>) => unknown>;
    topOrigin: string;
}

// Clipboard API as seen from omnibar
interface OmnibarClipboard {
    write(text: string): void;
}

// Self object type for createOmnibar (ModeInstance + dynamic omnibar properties)
// Using a loose structural type to allow dynamic property access
type OmnibarSelf = InstanceType<ModeConstructor> & {
    input: HTMLInputElement;
    promptSpan: Element;
    resultsDiv: Element;
    tabbed: boolean;
    activeTab?: boolean;
    collapsingPoint?: string;
    cachedPromise?: Promise<unknown>;
    command(cmd: string, annotation: unknown, jscode: (args: string[]) => boolean | void): void;
    triggerInput(): void;
    expandAlias(alias: string, val: string): boolean;
    collapseAlias(): boolean;
    focusItem(fi: string | Element): void;
    openFocused(this: OmnibarHandlerInternal): boolean;
    listResults(items: unknown[], renderItem: (item: unknown) => Element | null): void;
    listWords(words: string[]): void;
    listURLs(items: unknown[], showFolder: boolean): void;
    getItems(): unknown[] | null;
    getPageSize(): number;
    getHistoryCacheSize(): number;
    detectAndInsertURLItem(str: string, toList: unknown[]): void;
    createURLItem(b: Record<string, unknown>, rxp: RegExp | null): Element;
    createItemFromRawHtml(args: { html: string; props?: Record<string, unknown> }): Element;
    listBookmarkFolders(cb: (response: unknown, folders: unknown) => void): void;
    addHandler(name: string, hdl: OmnibarHandlerInternal): void;
    html(content: string): void;
    highlight(rxp: RegExp | null, str: string): string;
    isUrl(input: string): RegExpMatchArray | null;
    getCharacters?(): string;
    [key: string]: unknown;
};

const separator = '➤';
const separatorHtml = `<span class='separator'>${separator}</span>`;

function createOmnibar(front: OmnibarFront, clipboard: OmnibarClipboard) {
    var self = new (Mode as unknown as ModeConstructor)("Omnibar") as unknown as OmnibarSelf;

    self.addEventListener('keydown', function(event: SKKeyboardEvent) {
        if (event.sk_keyName.length) {
            (Mode.handleMapKey as unknown as (this: OmnibarSelf, event: SKKeyboardEvent) => void).call(self, event);
        }
        event.sk_suppressed = true;
    }).addEventListener('mousedown', function(event: SKKeyboardEvent) {
        if (!ui.contains((event as unknown as MouseEvent).target)) {
            front.hidePopup();
        }
        event.sk_suppressed = true;
    });

    self.mappings = new (Trie as unknown as TrieConstructor)();
    self.map_node = self.mappings;

    function getPosition() {
        let p = runtime.conf.omnibarPosition;
        if (handler && handler.omnibarPosition) {
            p = handler.omnibarPosition;
        }
        return p;
    }

    var savedFocused = -1;
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-d>"), {
        annotation: {
            short: "Delete focused item",
            unique_id: "cmd_omnibar_delete_focused",
            category: "omnibar",
            description: "Delete focused item from bookmark or history",
            tags: ["omnibar", "deletion", "bookmarks", "history"]
        },
        feature_group: 8,
        code: function () {
            var fi = self.resultsDiv.querySelector('li.focused') as (Element & Record<string, unknown>) | null;
            if (fi && fi.uid) {
                RUNTIME("removeURL", {
                    uid: fi.uid
                }, function(ret) {
                    if (ret.response === "Done") {
                        var newFI = (getPosition() !== "bottom") ? fi!.nextElementSibling : fi!.previousElementSibling;
                        fi!.remove();
                        if (newFI) {
                            self.focusItem(newFI);
                        } else {
                            savedFocused = (getPosition() !== "bottom") ?
                                self.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li').length : 0;
                            self.input.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                });
            }
        }
    });

    function reopen(cb: () => void) {
        front.hidePopup();
        setTimeout(cb, 100);
    }

    const searchEngine = SearchEngine(self, front);
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-i>"), {
        annotation: {
            short: "Edit selected URL",
            unique_id: "cmd_omnibar_edit_url",
            category: "omnibar",
            description: "Edit selected URL with vim editor, then open",
            tags: ["omnibar", "editing", "url"]
        },
        feature_group: 8,
        code: function () {
            var fi = self.resultsDiv.querySelector('li.focused') as (Element & Record<string, unknown>) | null;
            if (fi && fi.url) {
                const fiUrl = fi.url as string;
                reopen(function () {
                    front.showEditor({
                        initial_line: 1,
                        type: "url",
                        content: fiUrl,
                        onEditorSaved: function(data: string) {
                            if (data) {
                                tabOpenLink(data);
                            }
                        }
                    });
                });
            } else if (handler === searchEngine) {
                var query = self.input.value;
                var url = searchEngine.url as string;
                reopen(function () {
                    front.showEditor({
                        initial_line: 1,
                        type: "url",
                        content: query,
                        onEditorSaved: function(data: string) {
                            tabOpenLink(constructSearchURL(url, encodeURIComponent(data)));
                        }
                    });
                });
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-j>"), {
        annotation: {
            short: "Toggle Omnibar position",
            unique_id: "cmd_omnibar_toggle_position",
            category: "omnibar",
            description: "Toggle Omnibar's position between middle and bottom",
            tags: ["omnibar", "position", "toggle"]
        },
        feature_group: 8,
        code: function () {
            const savedInput = self.input.value;
            if (runtime.conf.omnibarPosition === "bottom") {
                runtime.conf.omnibarPosition = "middle";
            } else {
                runtime.conf.omnibarPosition = "bottom";
            }
            reopen(function() {
                _savedAargs.pref = savedInput;
                front.openOmnibar(_savedAargs);
            });
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-.>"), {
        annotation: {
            short: "Show next page",
            unique_id: "cmd_omnibar_next_page",
            category: "omnibar",
            description: "Show results of next page",
            tags: ["omnibar", "pagination", "navigation"]
        },
        feature_group: 8,
        code: function () {
            if (_items) {
                if (_start * runtime.conf.omnibarMaxResults < _items.length) {
                    _start ++;
                } else {
                    _start = 1;
                }
                _listResultPage();
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-,>"), {
        annotation: {
            short: "Show previous page",
            unique_id: "cmd_omnibar_previous_page",
            category: "omnibar",
            description: "Show results of previous page",
            tags: ["omnibar", "pagination", "navigation"]
        },
        feature_group: 8,
        code: function () {
            if (_items) {
                if (_start > 1) {
                    _start --;
                } else {
                    _start = Math.ceil(_items.length / runtime.conf.omnibarMaxResults);
                }
                _listResultPage();
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-c>"), {
        annotation: {
            short: "Copy item URLs",
            unique_id: "cmd_omnibar_copy_urls",
            category: "omnibar",
            description: "Copy selected item url or all listed item urls",
            tags: ["omnibar", "copy", "clipboard"]
        },
        feature_group: 8,
        code: function () {
            // hide Omnibar.input, so that we could use clipboard_holder to make copy
            self.input.style.display = "none";

            const fi = self.resultsDiv.querySelector('li.focused') as (Element & Record<string, unknown>) | null;
            let text;
            if (fi && fi.copy) {
                text = fi.copy as string;
            } else if (fi && fi.url) {
                text = fi.url as string;
            } else if (_page) {
                text = _page.map((p: unknown) => {
                    return (p as { url?: string }).url ?? "";
                }).join("\n");
            }
            clipboard.write(text ?? "");

            self.input.style.display = "";
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-D>"), {
        annotation: {
            short: "Delete all items",
            unique_id: "cmd_omnibar_delete_all",
            category: "omnibar",
            description: "Delete all listed items from bookmark or history",
            tags: ["omnibar", "deletion", "bookmarks", "history"]
        },
        feature_group: 8,
        code: function () {
            var uids = Array.from(self.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li')).map(function(li: Element) {
                return (li as Element & { uid?: string }).uid;
            }).filter(function(u) {
                return u;
            });
            if (uids.length) {
                RUNTIME("removeURL", {
                    uid: uids
                }, function(ret) {
                    if (ret.response === "Done") {
                        if (handler && handler.getResults) {
                            handler.getResults();
                        }
                        self.triggerInput();
                    }
                });
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-r>"), {
        annotation: {
            short: "Re-sort history",
            unique_id: "cmd_omnibar_resort_history",
            category: "omnibar",
            description: "Re-sort history by visitCount or lastVisitTime",
            tags: ["omnibar", "sorting", "history"]
        },
        feature_group: 8,
        code: function () {
            if (handler && handler.onReset) {
                handler.onReset();
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Esc>"), {
        annotation: {
            short: "Close Omnibar",
            unique_id: "cmd_omnibar_close",
            category: "omnibar",
            description: "Close Omnibar",
            tags: ["omnibar", "close"]
        },
        feature_group: 8,
        code: function () {
            front.hidePopup();
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-m>"), {
        annotation: {
            short: "Create vim mark",
            unique_id: "cmd_omnibar_create_mark",
            category: "omnibar",
            description: "Create vim-like mark for selected item",
            tags: ["omnibar", "marks", "vim"]
        },
        feature_group: 8,
        code: function (mark: string) {
            var fi = self.resultsDiv.querySelector('li.focused');
            if (fi) {
                Normal.addVIMark(mark, (fi as Element & { url: string }).url);
            }
        }
    });

    var handlers: Record<string, OmnibarHandlerInternal> = {},
        bookmarkFolders: Record<string, { id: string; title: string }> | null = null;

    var lastInput = "", handler: OmnibarHandlerInternal = null as unknown as OmnibarHandlerInternal, lastHandler: OmnibarHandlerInternal | null = null;
    var ui = document.getElementById('sk_omnibar') as unknown as Element & {
        onShow(args: Record<string, unknown>): void;
        onHide(): void;
        scrollTop: number;
        classList: DOMTokenList;
        insertBefore(node: Element, ref: Element | null): Element;
        append(...nodes: Node[]): void;
        contains(target: EventTarget | null): boolean;
    };

    self.triggerInput = function() {
        var event = new Event('input', {
            'bubbles': true,
            'cancelable': true
        });
        self.input.dispatchEvent(event);
    };

    self.expandAlias = function(alias: string, val: string) {
        var eaten = false;
        if (handler !== searchEngine && alias.length && searchEngine.aliases && searchEngine.aliases.hasOwnProperty(alias)) {
            lastHandler = handler;
            handler = searchEngine;
            Object.assign(searchEngine, searchEngine.aliases[alias]);
            setSanitizedContent(self.resultsDiv, "");
            setSanitizedContent(self.promptSpan, handler.prompt ?? "");
            setSanitizedContent(resultPageSpan, "");
            _items = null;
            self.collapsingPoint = val;
            self.input.value = val;
            if (val.length) {
                self.triggerInput();
            }
            eaten = true;
        }
        return eaten;
    };

    self.collapseAlias = function() {
        var eaten = false, val = self.input.value;
        if (lastHandler && handler !== lastHandler && (val === self.collapsingPoint || val === "")) {
            handler = lastHandler;
            lastHandler = null;
            setSanitizedContent(self.promptSpan, handler.prompt ?? "");
            if (val.length) {
                self.input.value = val.substr(0, val.length - 1);
            }
            self.triggerInput();
            eaten = true;
        }
        return eaten;
    };

    self.focusItem = function(fi: string | Element) {
        let elem: Element | null;
        if (typeof(fi) === 'string') {
            elem = self.resultsDiv.querySelector(fi);
        } else {
            elem = fi;
        }
        if (elem) {
            elem.classList.add('focused');
            const fiRect = elem.getBoundingClientRect();
            const resultsRect = self.resultsDiv.getBoundingClientRect();
            if (fiRect.top < resultsRect.top || fiRect.bottom > resultsRect.bottom) {
              const alignToTop = fiRect.top < resultsRect.top;
              elem.scrollIntoView(alignToTop);
            }
        }
    };

    function rotateResult(backward: boolean) {
        var items = Array.from(self.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li'));
        var total = items.length;
        if (total > 0) {
            var fi = self.resultsDiv.querySelector('li.focused');
            if (fi) {
                fi.classList.remove('focused');
            }
            var lastFocused = items.indexOf(fi as Element);
            lastFocused = (lastFocused === -1) ? total : lastFocused;
            var toFocus = (backward ? (lastFocused + total) : (lastFocused + total + 2)) % (total + 1);
            if (toFocus < total) {
                self.focusItem(items[toFocus]);
                if (handler.onTabKey) {
                    handler.onTabKey();
                }
            } else {
                self.input.value = lastInput;
            }
        }
    }

    self.promptSpan = ui.querySelector('#sk_omnibarSearchArea>span.prompt') as Element;
    var resultPageSpan = ui.querySelector('#sk_omnibarSearchArea>span.resultPage') as Element;
    self.resultsDiv = ui.querySelector('#sk_omnibarSearchResult') as Element;

    function _onIput() {
        if (lastInput !== self.input.value) {
            lastInput = self.input.value;
        }
        if (handler.onInput) {
            handler.onInput.call(self.input);
        }
    }
    function _onKeyDown(evt: KeyboardEvent & Partial<SKKeyboardEvent>) {
        if (handler && handler.onKeydown && handler.onKeydown.call(evt.target, evt)) {
            return;
        }
        if (Mode.isSpecialKeyOf("<Esc>", evt.sk_keyName ?? "")) {
            front.hidePopup();
            evt.preventDefault();
        } else if (evt.keyCode === KeyboardUtils.keyCodes.enter) {
            handler.activeTab = !evt.ctrlKey;
            handler.tabbed = self.tabbed !== evt.shiftKey;
            if (handler.onEnter()) {
                front.hidePopup();
            }
        } else if (evt.keyCode === KeyboardUtils.keyCodes.space) {
            const cursor = self.input.selectionStart ?? 0;
            const textBeforeCursor = self.input.value.substring(0, cursor);
            const newQuery = self.input.value.substring(cursor);
            if (self.expandAlias(textBeforeCursor, newQuery)) {
                evt.preventDefault();
            }
        } else if (evt.keyCode === KeyboardUtils.keyCodes.backspace) {
            if (self.collapseAlias()) {
                evt.preventDefault();
            }
        }
    }
    function _createInput() {
        var _input = document.createElement("input");
        _input.oninput = _onIput;
        _input.onkeydown = _onKeyDown as (this: GlobalEventHandlers, ev: Event) => void;
        _input.addEventListener('compositionstart', function(_evt) {
            _input.oninput = null;
            _input.onkeydown = null;
        });
        _input.addEventListener('compositionend', function(_evt) {
            _input.oninput = _onIput;
            _input.onkeydown = _onKeyDown as (this: GlobalEventHandlers, ev: Event) => void;
            _onIput();
        });
        return _input;
    }

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Tab>"), {
        annotation: {
            short: "Cycle forward",
            unique_id: "cmd_omnibar_cycle_forward",
            category: "omnibar",
            description: "Forward cycle through the candidates",
            tags: ["omnibar", "navigation", "selection"]
        },
        feature_group: 8,
        code: function () {
            rotateResult(getPosition() === "bottom");
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Shift-Tab>"), {
        annotation: {
            short: "Cycle backward",
            unique_id: "cmd_omnibar_cycle_backward",
            category: "omnibar",
            description: "Backward cycle through the candidates",
            tags: ["omnibar", "navigation", "selection"]
        },
        feature_group: 8,
        code: function () {
            rotateResult(getPosition() !== "bottom");
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-n>"), {
        annotation: {
            short: "Cycle input history forward",
            unique_id: "cmd_omnibar_history_forward",
            category: "omnibar",
            description: "Forward cycle through the input history",
            tags: ["omnibar", "history", "navigation"]
        },
        feature_group: 8,
        code: function () {
            if (handler && handler.rotateInput) {
                handler.rotateInput(getPosition() === "bottom");
            } else {
                rotateResult(getPosition() === "bottom");
            }
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-p>"), {
        annotation: {
            short: "Cycle input history backward",
            unique_id: "cmd_omnibar_history_backward",
            category: "omnibar",
            description: "Backward cycle through the input history",
            tags: ["omnibar", "history", "navigation"]
        },
        feature_group: 8,
        code: function () {
            if (handler && handler.rotateInput) {
                handler.rotateInput(getPosition() !== "bottom");
            } else {
                rotateResult(getPosition() !== "bottom");
            }
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-'>"), {
        annotation: {
            short: "Toggle quotes",
            unique_id: "cmd_omnibar_toggle_quotes",
            category: "omnibar",
            description: "Toggle quotes in an input element",
            tags: ["omnibar", "editing", "quotes"]
        },
        feature_group: 8,
        code: toggleQuote
    });

    self.highlight = function(rxp: RegExp | null, str: string) {
        if (str.substr(0, 11) === "data:image/") {
            str = str.substr(0, 1024);
        }
        return (rxp === null) ? str : str.replace(rxp, function(m: string) {
            return "<span class=omnibar_highlight>" + m + "</span>";
        });
    };

    self.createURLItem = function(b: Record<string, unknown>, rxp: RegExp | null) {
        b.title = (b.title && b.title !== "") ? b.title : safeDecodeURI(b.url as string);
        var type = "🔥", additional = "", uid: unknown = b.uid;
        if (b.hasOwnProperty('lastVisitTime')) {
            type = "🕜";
            additional = `<span class=omnibar_timestamp># ${timeStampString(b.lastVisitTime as number)}</span>`;
            additional += `<span class=omnibar_visitcount> (${b.visitCount})</span>`;
            uid = "H" + b.url;
        } else if(b.hasOwnProperty('dateAdded')) {
            type = "⭐";
            const folder = bookmarkFolders ? bookmarkFolders[b.parentId as string] : null;
            additional = `<span class=omnibar_folder>@ ${folder?.title || ""}</span> <span class=omnibar_timestamp># ${timeStampString(b.dateAdded as number)}</span>`;
            uid = "B" + b.id;
        } else if(b.hasOwnProperty('width')) {
            type = "🔖";
            uid = "T" + b.windowId + ":" + b.id;
            // } else if(b.type && /^\p{Emoji}$/u.test(b.type)) {
        } else if(b.type && (b.type as string).length === 2 && (b.type as string).charCodeAt(0) > 255) {
            type = b.type as string;
        }
        var li = createElementWithContent('li', `<div class="icon">${type}</div>`);
        if (b.hasOwnProperty('favIconUrl')) {
            li = createElementWithContent('li', `<img class="icon"/>`);
            attachFaviconToImgSrc(b as { url: string; favIconUrl: string }, li.querySelector('img')!);
        }
        li.appendChild(createElementWithContent('div',
            `<div class="title">${self.highlight(rxp, htmlEncode(b.title as string))} ${additional}</div><div class="url">${self.highlight(rxp, htmlEncode(safeDecodeURIComponent(b.url as string)))}</div>`, { "class": "text-container" }));
        li.uid = uid as string;
        li.url = b.url as string;
        li._item = b;
        return li;
    };

    self.createItemFromRawHtml = function({ html, props }: { html: string; props?: Record<string, unknown> }) {
        const li = createElementWithContent('li', html);
        if (typeof props === "object") {
            Object.assign(li, props);
        }
        return li;
    };

    self.detectAndInsertURLItem = function(str: string, toList: unknown[]) {
        var urlPat = /^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/\n\s]+)\.([^:\/\n\s]+)/i,
            urlPat1 = /^https?:\/\/(?:[^@\/\n]+@)?([^:\/\n\s]+)/i;
        if (urlPat.test(str)) {
            var url = str;
            if (! /^https?:\/\//.test(str)) {
                url = "http://" + str;
            }
            toList.unshift({
                title: str,
                url: url
            });
        } else if (urlPat1.test(str)) {
            toList.unshift({
                title: str,
                url: str
            });
        }
    };

    var _start: number, _items: unknown[] | null, _showFolder: boolean, _page: unknown[];

    self.getPageSize = () => {
        return runtime.conf.omnibarMaxResults;
    };

    self.getHistoryCacheSize = () => {
        return runtime.conf.omnibarHistoryCacheSize;
    };

    self.listURLs = function(items: unknown[], showFolder: boolean) {
        _start = 1;
        _items = items;
        _showFolder = showFolder;
        _listResultPage();
        if (savedFocused !== -1) {
            const items = self.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li');
            self.focusItem(items[savedFocused]);
            savedFocused = -1;
        }

    };
    self.getItems = function() {
        return _items;
    };

    function _listResultPage() {
        var si = (_start - 1) * runtime.conf.omnibarMaxResults;
        var ei = si + runtime.conf.omnibarMaxResults;
        ei = ei > _items!.length ? _items!.length : ei;
        var total: number | string = _items!.length;
        if (total === runtime.conf.omnibarHistoryCacheSize) {
            total = total + "+";
        }
        setSanitizedContent(resultPageSpan, `${si + 1} - ${ei} / ${total}`);
        _page = _items!.slice(si, ei);
        var query = self.input.value.trim();
        var rxp: RegExp | null = null;
        if (query.length) {
            rxp = regexFromString(query, runtime.getCaseSensitive(query), true);
        }
        self.listResults(_page, function(b: unknown) {
            var li;
            const br = b as Record<string, unknown>;
            if (br.hasOwnProperty('html')) {
                li = self.createItemFromRawHtml(br as { html: string; props?: Record<string, unknown> });
            } else if (br.hasOwnProperty('url') && br.url !== undefined) {
                if (getBrowserName() === "Firefox" && /^(place|data):/i.test(br.url as string)) {
                    return null;
                }
                li = self.createURLItem(br, rxp);
            } else if (_showFolder) {
                li = createElementWithContent('li', `<div class="title">▷ ${self.highlight(rxp, br.title as string)}</div>`);
                li.folder_name = br.title as string;
                li.folderId = br.id as string;
            }
            return li ?? null;
        });
    }

    var _savedAargs: Record<string, unknown>;
    ui.onShow = function(args: Record<string, unknown>) {
        handler = handlers[args.type as string];
        if (!self.input) {
            self.input = _createInput();
            document.querySelector("#sk_omnibarSearchArea")!.insertBefore(self.input, resultPageSpan);
        }
        _savedAargs = args;
        ui.classList.remove("sk_omnibar_middle");
        ui.classList.remove("sk_omnibar_bottom");
        if (getBrowserName() === "Safari-iOS") {
            runtime.conf.omnibarPosition = "bottom";
        }
        ui.classList.add("sk_omnibar_" + getPosition());
        if (getPosition() === "bottom") {
            self.resultsDiv.remove();
            ui.insertBefore(self.resultsDiv, document.querySelector("#sk_omnibarSearchArea"));
        } else {
            self.resultsDiv.remove();
            ui.append(self.resultsDiv);
        }

        self.tabbed = (args.tabbed !== undefined) ? args.tabbed as boolean : true;
        self.input.focus();
        self.enter();
        if (args.pref) {
            self.input.value = args.pref as string;
        }
        self.resultsDiv.className = "";
        if (handler.onOpen) {
            handler.onOpen(args.extra);
        }
        lastHandler = handler;
        handler = handler;
        setSanitizedContent(self.promptSpan, handler.prompt ?? "");
        setSanitizedContent(resultPageSpan, "");
        ui.scrollTop = 0;
    };

    ui.onHide = function() {
        // clear cache
        delete self.cachedPromise;
        // delete only deletes properties of an object and
        // cannot normally delete a variable declared using var, whatever the scope.
        _items = null;
        bookmarkFolders = null;

        lastInput = "";
        self.input.value = "";
        self.input.placeholder = "";
        setSanitizedContent(self.resultsDiv, "");
        lastHandler = null;
        if (handler.onClose) {
            handler.onClose();
        }
        self.exit();
        handler = null as unknown as OmnibarHandlerInternal;
    };

    self.isUrl = function (input: string): RegExpMatchArray | null {
      if (input.match(/\s+/)) {
        return null;
      }

      if (input.match(/^https?:\/\//)) {
        return [] as unknown as RegExpMatchArray;
      }

      var regex = /^(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/;

      return input.match(regex);
    };

    self.openFocused = function() {
        var _ret = false, fi = self.resultsDiv.querySelector('li.focused') as (Element & Record<string, unknown>) | null;
        var url: string | undefined;
        if (fi) {
            url = fi.url as string | undefined;
        } else {
            url = self.input.value;
            if (!self.isUrl(url)) {
                const aliases = searchEngine.aliases;
                const defaultEngine = runtime.conf.defaultSearchEngine;
                if (aliases && defaultEngine) {
                    url = (aliases[defaultEngine as string] as Record<string, unknown>)?.url as string + url;
                }
            }
        }
        var type = "", uid: string | undefined;
        if (fi && fi.uid) {
            uid = fi.uid as string;
            type = uid[0];
            uid = uid.substr(1);
        }
        if (type === 'T' && uid) {
            const parts = uid.split(":");
            RUNTIME('focusTab', {
                windowId: parseInt(parts[0]),
                tabId: parseInt(parts[1])
            });
        } else if (url && url.length) {
            RUNTIME("openLink", {
                tab: {
                    tabbed: this.tabbed,
                    active: this.activeTab
                },
                url: url
            });
        }
        return this.activeTab ?? false;
    };

    self.listResults = function (items: unknown[], renderItem: (item: unknown) => Element | null) {
        setSanitizedContent(self.resultsDiv, "");
        if (!items || items.length === 0) {
            return;
        }
        if (getPosition() === "bottom") {
            items.reverse();
        }
        var ul = document.createElement("ul");
        items.forEach(function(b: unknown) {
            var li = renderItem(b);
            if (li) {
                ul.append(li);
                const liExt = li as Element & Record<string, unknown>;
                li.onclick = () => {
                    if (liExt.url) {
                        RUNTIME("openLink", {
                            tab: {
                                tabbed: true,
                                active: true,
                            },
                            url: liExt.url as string
                        });
                    } else {
                        self.input.value = liExt.query as string;
                        self.input.focus();
                    }
                };
            }
        });
        self.resultsDiv.append(ul);
        const liItems = self.resultsDiv.querySelectorAll("#sk_omnibarSearchResult>ul>li");
        if (runtime.conf.focusFirstCandidate || handler.focusFirstCandidate) {
            var fi = (getPosition() === "bottom") ? liItems.length - 1 : 0;
            liItems[fi].classList.add('focused');
        }
        if (getPosition() === "bottom" && liItems.length > 0) {
            scrollIntoViewIfNeeded(liItems[liItems.length-1]);
        }
    };

    self.listWords = function(words: string[]) {
        self.listResults(words, function(w: unknown) {
            var li = createElementWithContent('li', `⌕ ${w as string}`);
            li.query = w as string;
            return li;
        });
    };

    self.html = function(content: string) {
        setSanitizedContent(self.resultsDiv, content);
    };

    self.addHandler = function(name: string, hdl: OmnibarHandlerInternal) {
        if (!hdl.onEnter) {
            hdl.onEnter = self.openFocused.bind(hdl);
        }
        handlers[name] = hdl;
    };

    self.listBookmarkFolders = function(cb: (response: unknown, folders: unknown) => void) {
        RUNTIME('getBookmarkFolders', null, function(response) {
            type BookmarkFolder = { id: string; title: string };
            bookmarkFolders = {};
            const bfMap = bookmarkFolders;
            (response.folders as BookmarkFolder[]).forEach(function(f) {
                bfMap[f.id] = f;
            });
            if (cb) {
                cb(response, bookmarkFolders);
            }
        });
    };

    self.addHandler('Bookmarks', OpenBookmarks(self));
    self.addHandler('AddBookmark', AddBookmark(self));
    self.addHandler('History', OpenURLs(`history${separatorHtml}`, self, () => {
        return new Promise((resolve, _reject) => {
            RUNTIME('getHistory', {
                maxResults: self.getHistoryCacheSize(),
                query: self.input.value,
                sortByMostUsed: runtime.conf.historyMUOrder
            }, function(response) {
                resolve(response.history as unknown[]);
            });
        });
    }));
    self.addHandler('URLs', OpenURLs(separatorHtml, self, () => {
        return new Promise((resolve, _reject) => {
            RUNTIME('getTabs', {
                queryInfo: runtime.conf.omnibarTabsQuery
            }, function(response) {
                var results = response.tabs as unknown[];
                RUNTIME("getTopSites", null, function(response) {
                    results = results.concat(response.urls as unknown[]);
                    results = filterByTitleOrUrl(results, self.input.value, runtime.getCaseSensitive(self.input.value));
                    self.listBookmarkFolders(function() {
                        RUNTIME('getAllURLs', {
                            maxResults: self.getHistoryCacheSize() - results.length,
                            query: self.input.value
                        } , function(response) {
                            results = results.concat(response.urls as unknown[]);
                            resolve(results);
                        });
                    });
                });
            });
        });
    }));
    self.addHandler('RecentlyClosed', OpenURLs(`Recently closed${separatorHtml}`, self, () => {
        return new Promise((resolve, _reject) => {
            RUNTIME('getRecentlyClosed', null, function(response) {
                resolve(filterByTitleOrUrl(response.urls, self.input.value, runtime.getCaseSensitive(self.input.value)));
            });
        });
    }));
    self.addHandler('TabURLs', OpenURLs(`Tab History${separatorHtml}`, self, () => {
        return new Promise((resolve, _reject) => {
            RUNTIME('getTabURLs', null, function(response) {
                resolve(filterByTitleOrUrl(response.urls, self.input.value, runtime.getCaseSensitive(self.input.value)));
            });
        });
    }));
    self.addHandler('Tabs', OpenTabs(self));
    self.addHandler('CloseTabs', CloseTabs(self));
    self.addHandler('Windows', OpenWindows(self, front));
    self.addHandler('VIMarks', OpenVIMarks(self));
    self.addHandler('SearchEngine', searchEngine);
    self.addHandler('Commands', Commands(self, front));
    self.addHandler('OmniQuery', OmniQuery(self, front));
    self.addHandler('UserURLs', OpenUserURLs(self, front));
    self.addHandler('LLMChat', LLMChat(self, front) as unknown as OmnibarHandlerInternal);

    front._actions['updateOmnibarResult'] = function(message: Record<string, unknown>) {
        self.listWords(message.words as string[]);
    };
    return self;
}

function OpenBookmarks(omnibar: OmnibarSelf) {
    type FolderEntry = { folderId: string | undefined; prompt: string | undefined; focused: number };
    var inFolder: FolderEntry[] = [];
    var self: OmnibarHandlerInternal = {
        prompt: `bookmark${separatorHtml}`,
        onEnter: function() { return false; }
    };

    var folderOnly = false,
        currentFolderId: string | undefined,
        lastFocused = 0;

    function onFolderUp() {
        var fl = inFolder.pop();
        if (fl && fl.folderId) {
            currentFolderId = fl.folderId;
            RUNTIME('getBookmarks', {
                parentId: currentFolderId
            }, self.onResponse);
        } else {
            currentFolderId = undefined;
            RUNTIME('getBookmarks', null, self.onResponse);
        }
        if (fl) {
            self.prompt = fl.prompt;
            setSanitizedContent(omnibar.promptSpan, self.prompt ?? "");
            lastFocused = fl.focused;
        }
    }

    self.onEnter = function() {
        var items = Array.from(omnibar.resultsDiv.querySelectorAll("#sk_omnibarSearchResult>ul>li"));
        var ret = false,
            fi = omnibar.resultsDiv.querySelector('li.focused') as (Element & Record<string, unknown>) | null;
        var folderId = fi?.folderId as string | undefined;
        if (folderId && !this.activeTab){
            RUNTIME('getBookmarks', {
                parentId: folderId
            }, function(response){
                type BookmarkItem = { url?: string };
                var subItems = response.bookmarks as BookmarkItem[];
                for ( var m of subItems){
                    if (m.url){
                        RUNTIME("openLink", {
                            tab: {
                                tabbed: true,
                                active: false
                            },
                            url: m.url
                        });
                    }
                }
            });
            inFolder.push({
                prompt: self.prompt,
                folderId: currentFolderId,
                focused: items.indexOf(fi as Element)
            });
            localStorage.setItem("surfingkeys.lastOpenBookmark", JSON.stringify(inFolder));
        } else if (folderId) {
            inFolder.push({
                prompt: self.prompt,
                folderId: currentFolderId,
                focused: items.indexOf(fi as Element)
            });
            self.prompt = (fi?.folder_name as string ?? "") + separator;
            setSanitizedContent(omnibar.promptSpan, self.prompt);
            omnibar.input.value = "";
            currentFolderId = folderId;
            lastFocused = 0;
            RUNTIME('getBookmarks', {
                parentId: currentFolderId
            }, self.onResponse);
        } else {
            ret = omnibar.openFocused.call(self);
            if (ret) {
                inFolder.push({
                    prompt: self.prompt,
                    folderId: currentFolderId,
                    focused: items.indexOf(fi as Element)
                });
                localStorage.setItem("surfingkeys.lastOpenBookmark", JSON.stringify(inFolder));
            }
        }
        return ret;
    };

    self.onOpen = function() {
        omnibar.listBookmarkFolders(function() {
            var lastBookmarkFolder = localStorage.getItem("surfingkeys.lastOpenBookmark");
            if (lastBookmarkFolder) {
                inFolder = JSON.parse(lastBookmarkFolder) as FolderEntry[];
                onFolderUp();
            } else {
                RUNTIME('getBookmarks', null, self.onResponse);
            }
            if (omnibar.input.value !== "") {
                self.onInput?.();
            }
        });
    };

    self.onClose = function() {
        inFolder = [];
        self.prompt = `bookmark${separatorHtml}`;
        currentFolderId = undefined;
    };

    self.onKeydown = function(event: KeyboardEvent) {
        var eaten = false;
        if (event.keyCode === KeyboardUtils.keyCodes.comma) {
            folderOnly = !folderOnly;
            self.prompt = folderOnly ? `bookmark folder${separator}` : `bookmark${separator}`;
            setSanitizedContent(omnibar.promptSpan, self.prompt ?? "");
            RUNTIME('getBookmarks', {
                parentId: currentFolderId,
                query: omnibar.input.value
            }, self.onResponse);
            eaten = true;
        } else if (event.keyCode === KeyboardUtils.keyCodes.backspace && inFolder.length && !omnibar.input.value.length) {
            onFolderUp();
            eaten = true;
        } else if (event.ctrlKey && event.shiftKey && KeyboardUtils.isWordChar(event)) {
            var fi = omnibar.resultsDiv.querySelector('li.focused');
            if (fi) {
                var mark_char = String.fromCharCode(event.keyCode);
                Normal.addVIMark(mark_char, (fi as Element & { url: string }).url);
                eaten = true;
            }
        }
        return eaten;
    };
    self.onInput = function() {
        var query = omnibar.input.value;
        RUNTIME('getBookmarks', {
            parentId: currentFolderId,
            caseSensitive: runtime.getCaseSensitive(query),
            query
        }, self.onResponse);
    };
    self.onResponse = function(response: unknown) {
        const resp = response as { bookmarks: Array<Record<string, unknown>> };
        var items = resp.bookmarks;
        if (folderOnly) {
            items = items.filter(function(b: Record<string, unknown>) {
                return !b.hasOwnProperty('url') || b.url === undefined;
            });
        }
        omnibar.listURLs(items, true);

        if (!omnibar.resultsDiv.querySelector('li.focused')) {
            var liItems = omnibar.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li');
            omnibar.focusItem(liItems[lastFocused]);
        }
    };

    return self;
}

function AddBookmark(omnibar: OmnibarSelf) {
    type FolderEntry = { id: string; title: string };
    var self: OmnibarHandlerInternal = {
        focusFirstCandidate: true,
        prompt: `add bookmark${separatorHtml}`,
        onEnter: function() { return false; }
    };
    var folders: FolderEntry[] = [];

    self.onOpen = function(arg: unknown) {
        self['page'] = arg;
        omnibar.listBookmarkFolders(function(response: unknown) {
            folders = (response as { folders: FolderEntry[] }).folders;
            omnibar.listResults(folders.slice(), function(f: unknown) {
                const folder = f as FolderEntry;
                return createElementWithContent('li', `▷ ${folder.title}`, {folder: folder.id});
            });
            RUNTIME("getBookmark", null, function(resp) {
                type BookmarkEntry = { parentId: string };
                const bookmarks = resp.bookmarks as BookmarkEntry[];
                if (bookmarks.length) {
                    var b = bookmarks[0];
                    setSanitizedContent(omnibar.promptSpan, `edit bookmark${separatorHtml}`);
                    omnibar.resultsDiv.querySelector('li.focused')?.classList.remove('focused');
                    omnibar.focusItem(`li[folder="${b.parentId}"]`);
                }

                //restore the last used bookmark folder input
                var lastBookmarkFolder = localStorage.getItem("surfingkeys.lastAddedBookmark");
                if (lastBookmarkFolder) {
                    omnibar.input.value = lastBookmarkFolder;

                    //make the input selected, so if user don't want to use it,
                    //just input to overwrite the previous value
                    omnibar.input.select();

                    // trigger omnibar input matching
                    self.onInput?.();
                }
            });
        });
    };

    self.onTabKey = function() {
        var fi = omnibar.resultsDiv.querySelector('li.focused');
        if (fi) {
            omnibar.input.value = fi.innerHTML.substr(2);
        }
    };

    self.onEnter = function() {
        const page = self['page'] as Record<string, unknown>;
        page.path = [];
        var fi = omnibar.resultsDiv.querySelector('li.focused');
        var folderName: string | undefined;
        if (fi) {
            page.folder = fi.getAttribute('folder');
            folderName = (fi as HTMLElement).innerHTML.substr(2);
        } else {
            var pathStr = omnibar.input.value;
            var path = pathStr.split('/');
            var title = path.pop();
            if (title && title.length) {
                page.title = title;
            }
            path = path.filter(function(p: string) {
                return p.length > 0;
            });
            for (var l = path.length; l > 0; l--) {
                var targetFolder = folders.filter(function(f: FolderEntry) {
                    return f.title === `/${path.slice(0, l).join("/")}/`;
                });
                if (targetFolder.length) {
                    page.folder = targetFolder[0].id;
                    page.path = path.slice(l);
                    folderName = "/" + path.join("/");
                    break;
                }
            }
            if (page.folder === undefined) {
                page.folder = folders[0].id;
                page.path = path;
                folderName = `${folders[0].title}${path.join("/")}`;
            }
        }
        RUNTIME('createBookmark', {
            page
        }, function(_response) {
            showBanner("Bookmark created at {0}.".format(folderName ?? ""), 3000);
        });
        localStorage.setItem("surfingkeys.lastAddedBookmark", omnibar.input.value);
        return true;
    };

    self.onInput = function() {
        var query = omnibar.input.value;
        var caseSensitive = runtime.getCaseSensitive(query);
        var matches = folders.filter(function(b: FolderEntry) {
            if (caseSensitive)
              return b.title.indexOf(query) !== -1;
            else
              return b.title.toLowerCase().indexOf(query.toLowerCase()) !== -1;
        });
        omnibar.listResults(matches, function(f: unknown) {
            const folder = f as FolderEntry;
            return createElementWithContent('li', `▷ ${folder.title}`, {folder: folder.id});
        });
    };

    return self;
}

function OpenURLs(prompt: string, omnibar: OmnibarSelf, queryFn: () => Promise<unknown[]>) {
    var self: OmnibarHandlerInternal = { prompt, onEnter: function() { return false; } };
    var sequenceNumber = 0;

    const queryAndList = () => {
        let myseq = ++sequenceNumber;
        queryFn().then((urls: unknown[]) => {
            if (myseq === sequenceNumber) {
                var val = omnibar.input.value;
                omnibar.detectAndInsertURLItem(val, urls);
                omnibar.listURLs(urls, false);
            }
        });
    };
    self.onOpen = function(arg: unknown) {
        if (arg) {
            omnibar.input.value = arg as string;
        }
        sequenceNumber = 0;
        queryAndList();
    };
    const debouncedQueryAndList = debounce(queryAndList, 200);
    self.onInput = debouncedQueryAndList;
    self.onClose = function() {
        debouncedQueryAndList.cancel();
    };

    self.onReset = function() {
        runtime.conf.historyMUOrder = !runtime.conf.historyMUOrder;
        queryFn().then((historyItems: unknown[]) => {
            type HistoryItem = { visitCount?: number; lastVisitTime?: number };
            if (runtime.conf.historyMUOrder) {
                historyItems = historyItems.sort(function(a: unknown, b: unknown) {
                    return ((b as HistoryItem).visitCount ?? 0) - ((a as HistoryItem).visitCount ?? 0);
                });
            } else {
                historyItems = historyItems.sort(function(a: unknown, b: unknown) {
                    return ((b as HistoryItem).lastVisitTime ?? 0) - ((a as HistoryItem).lastVisitTime ?? 0);
                });
            }
            omnibar.listURLs(historyItems, false);
        });
    };
    return self;
}

function OpenTabs(omnibar: OmnibarSelf) {
    var self: OmnibarHandlerInternal = {
        focusFirstCandidate: true,
        onEnter: function() { return false; }
    };

    var getTabsArgs: Record<string, unknown> = {};
    self.getResults = function () {
        omnibar.cachedPromise = new Promise(function(resolve, _reject) {
            getTabsArgs.tabsThreshold = Math.min(runtime.conf.tabsThreshold, Math.ceil(window.innerWidth / 26));
            RUNTIME('getTabs', getTabsArgs, function(response) {
                resolve(response.tabs as unknown[]);
            });
        });
    };
    self.onOpen = function(args: unknown) {
        const argsObj = args as Record<string, unknown> | null | undefined;
        if (argsObj && argsObj.action === "gather") {
            self.prompt = `Gather filtered tabs into current window${separatorHtml}`;
            self.onEnter = function() {
                RUNTIME('gatherTabs', {
                    tabs: omnibar.getItems()
                });
                return true;
            };
            getTabsArgs = {queryInfo: {currentWindow: false}};
        } else {
            self.prompt = `tabs${separatorHtml}`;
            self.onEnter = omnibar.openFocused.bind(self);
            getTabsArgs = {};
            if (argsObj && typeof(argsObj.filter) === 'string') {
                getTabsArgs.filter = argsObj.filter;
            }
        }
        self.getResults!();
        self.onInput!();
    };
    self.onInput = function() {
        omnibar.cachedPromise!.then(function(cached: unknown) {
            var filtered = filterByTitleOrUrl(cached as unknown[], omnibar.input.value, runtime.getCaseSensitive(omnibar.input.value));
            omnibar.listURLs(filtered, false);
        });
    };
    return self;
}

function CloseTabs(omnibar: OmnibarSelf) {
    var self: OmnibarHandlerInternal = {
        focusFirstCandidate: true,
        onEnter: function() { return true; }
    };

    self.onOpen = function() {
        self.prompt = `close tabs${separatorHtml}`;
        omnibar.cachedPromise = new Promise(function(resolve) {
            RUNTIME('getTabs', {queryInfo: {currentWindow: true}}, function(response) {
                resolve(response.tabs as unknown[]);
            });
        });
        self.onInput!();
    };
    self.onInput = function() {
        omnibar.cachedPromise!.then(function(cached: unknown) {
            type TabItem = { url: string };
            var filtered = filterByTitleOrUrl(cached as unknown[], omnibar.input.value, runtime.getCaseSensitive(omnibar.input.value));
            filtered.forEach(function(tab: unknown) {
                const t = tab as TabItem;
                try {
                    var u = new URL(t.url);
                    t.url = u.origin + u.pathname;
                } catch (_e) {}
            });
            omnibar.listURLs(filtered, false);
        });
    };
    self.onEnter = function() {
        var items = omnibar.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li');
        var tabIds: number[] = [];
        items.forEach(function(li: Element) {
            const liEl = li as Element & { uid?: string };
            if (liEl.uid && liEl.uid[0] === 'T') {
                var parts = liEl.uid.substr(1).split(":");
                tabIds.push(parseInt(parts[1]));
            }
        });
        if (tabIds.length > 0) {
            RUNTIME('closeTabByIds', {tabIds: tabIds});
        }
        return true;
    };
    return self;
}

function OpenWindows(omnibar: OmnibarSelf, front: OmnibarFront) {
    type WindowItem = { id: number | string; isPreviousChoice?: boolean; tabs: Array<{ title: string; url: string }> };
    const self: OmnibarHandlerInternal = {
        prompt: `Move current tab to window${separatorHtml}`,
        onEnter: function() { return true; }
    };

    self.getResults = function () {
        omnibar.cachedPromise = new Promise(function(resolve, _reject) {
            RUNTIME('getWindows', {
                query: ''
            }, function(response) {
                resolve(response.windows as unknown[]);
            });
        });
    };
    self.onEnter = function() {
        const fi = omnibar.resultsDiv.querySelector('li.focused');
        let windowId = -1;
        if (fi && (fi as Element & { windowId?: number }).windowId !== undefined) {
            windowId = (fi as Element & { windowId: number }).windowId;
        }
        RUNTIME('moveToWindow', { windowId });
        return true;
    };
    self.onOpen = function() {
        omnibar.input.placeholder = "Press enter without focusing an item to move to a new window.";
        self.getResults!();
        self.onInput!();
    };
    self.onInput = function() {
        omnibar.cachedPromise!.then(function(cached: unknown) {
            const windows = cached as WindowItem[];
            if (windows.length === 0) {
                RUNTIME('moveToWindow', { windowId: -1 });
                front.hidePopup();
            }
            let filtered: WindowItem[] = windows;
            const query = omnibar.input.value;
            let rxp: RegExp | null = null;
            if (query && query.length) {
                rxp = regexFromString(query, runtime.getCaseSensitive(query), false);
                filtered = windows.filter(function(w: WindowItem) {
                    for (const t of w.tabs) {
                        if (rxp!.test(t.title) || rxp!.test(t.url)) {
                            return true;
                        }
                    }
                    return false;
                });
            }
            rxp = regexFromString(query, runtime.getCaseSensitive(query), true);
            omnibar.listResults(filtered, function(w: unknown) {
                const win = w as WindowItem;
                const li = createElementWithContent('li');
                li.windowId = parseInt(String(win.id));
                li.classList.add('window');
                if (win.isPreviousChoice) {
                    li.classList.add('focused');
                }
                win.tabs.forEach((t: { title: string; url: string }) => {
                    const div = createElementWithContent('div', '', {class: "tab_in_window"});
                    div.appendChild(createElementWithContent('div', omnibar.highlight(rxp, t.title), {class: "title"}));
                    div.appendChild(createElementWithContent('div', omnibar.highlight(rxp, new URL(t.url).origin), {class: "url"}));
                    li.appendChild(div);
                });
                // set url so that we can copy all URLs of tabs in this window.
                li.url = win.tabs.map((t: { url: string }) => {
                    return t.url;
                }).join("\n");
                return li;
            });
        });
    };
    return self;
}

function OpenVIMarks(omnibar: OmnibarSelf) {
    var self: OmnibarHandlerInternal = {
        focusFirstCandidate: true,
        prompt: `VIMarks${separatorHtml}`,
        onEnter: function() { return false; }
    };

    self.onOpen = function() {
        var query = omnibar.input.value;
        var urls: Array<{ title: string; type: string; uid: string; url: string }> = [];
        RUNTIME('getSettings', {
            key: 'marks'
        }, function(response) {
            type MarkInfo = { url: string; scrollLeft: number; scrollTop: number };
            const marks = (response.settings as { marks: Record<string, MarkInfo | string> }).marks;
            for (var m in marks) {
                var markInfo: MarkInfo | string = marks[m];
                if (typeof(markInfo) === "string") {
                    markInfo = {
                        url: markInfo,
                        scrollLeft: 0,
                        scrollTop: 0
                    };
                }
                if (query === "" || markInfo.url.indexOf(query) !== -1) {
                    urls.push({
                        title: m,
                        type: '🔗',
                        uid: 'M' + m,
                        url: markInfo.url
                    });
                }
            }
            omnibar.listURLs(urls, false);
        });
    };
    self.onInput = self.onOpen;
    return self;
}

function SearchEngine(omnibar: OmnibarSelf, front: OmnibarFront) {
    var self: OmnibarHandlerInternal = { onEnter: function() { return false; } };
    self.aliases = {};

    var _pendingRequest: ReturnType<typeof setTimeout> | undefined = undefined; // timeout ID
    function clearPendingRequest() {
        if (_pendingRequest) {
            clearTimeout(_pendingRequest);
            _pendingRequest = undefined;
        }
    }
    self.onOpen = function(arg: unknown) {
        Object.assign(self, (self.aliases as Record<string, unknown>)[arg as string]);
        var q = omnibar.input.value;
        if (q.length) {
            var b = q.match(/^(site:\S+\s*).*/);
            if (b) {
                omnibar.input.setSelectionRange(b[1].length, q.length);
            }
            omnibar.triggerInput();
        }
    };
    self.onClose = function() {
        clearPendingRequest();
        self.prompt = undefined;
        self.url = undefined;
        self.suggestionURL = undefined;
    };
    self.onTabKey = function() {
        var fi = omnibar.resultsDiv.querySelector('li.focused') as (Element & Record<string, unknown>) | null;
        if (fi && fi.query) {
            omnibar.input.value = fi.query as string;
        }
    };
    self.onEnter = function() {
        var fi = omnibar.resultsDiv.querySelector('li.focused') as (Element & Record<string, unknown>) | null, url: string;
        if (fi) {
            url = (fi.url as string) || constructSearchURL(self.url ?? "", encodeURIComponent((fi.query as string) || omnibar.input.value));
        } else {
            url = constructSearchURL(self.url ?? "", encodeURIComponent(omnibar.input.value));
        }
        RUNTIME("openLink", {
            tab: {
                tabbed: this.tabbed,
                active: this.activeTab
            },
            url: url
        });
        return this.activeTab ?? false;
    };
    function listSuggestions(suggestions: unknown[]) {
        omnibar.detectAndInsertURLItem(omnibar.input.value, suggestions);
        const query = encodeURIComponent(omnibar.input.value);
        var rxp = regexFromString(query, runtime.getCaseSensitive(query), true);
        omnibar.listResults(suggestions, function (w: unknown) {
            const wr = w as Record<string, unknown>;
            if (wr.hasOwnProperty('html')) {
                return omnibar.createItemFromRawHtml(wr as { html: string; props?: Record<string, unknown> });
            } else if (wr.hasOwnProperty('url')) {
                return omnibar.createURLItem(wr, rxp);
            } else {
                var li = createElementWithContent('li', `⌕ ${w as string}`) as unknown as Element & Record<string, unknown>;
                li.query = w as string;
                return li;
            }
        });
    }
    self.onInput = function () {
        var canSuggest = self.suggestionURL;
        var showSuggestions = canSuggest && runtime.conf.omnibarSuggestion;

        if (!showSuggestions) {
            listSuggestions([]);
            return;
        }

        clearPendingRequest();
        // Set a timeout before the request is dispatched so that it can be canceled if necessary.
        // This helps prevent rate-limits when typing a long query.
        // E.g. github.com's API rate-limits after only 10 unauthenticated requests.
        _pendingRequest = setTimeout(function() {
            const requestUrl = constructSearchURL(self.suggestionURL ?? "", encodeURIComponent(omnibar.input.value));
            RUNTIME('request', {
                method: 'get',
                url: requestUrl
            }, function (resp) {
                front.contentCommand({
                    action: 'getSearchSuggestions',
                    url: self.suggestionURL ?? "",
                    query: omnibar.input.value,
                    requestUrl,
                    response: resp
                }, function(resp: unknown) {
                    let data = (resp as { data?: unknown }).data;
                    if (!Array.isArray(data)) {
                        data = [];
                    }
                    listSuggestions(data as unknown[]);
                });
            });
        }, runtime.conf.omnibarSuggestionTimeout);
    };

    front._actions['addSearchAlias'] = function (message: Record<string, unknown>) {
        if (!self.aliases) self.aliases = {};
        const aliasKey = message.alias as string;
        self.aliases[aliasKey] = {
            prompt: '' + message.prompt + separatorHtml,
            url: message.url,
            suggestionURL: message.suggestionURL
        };
        const searchEngineIconStorageKey = `surfingkeys.searchEngineIcon.${message.prompt}`;
        const searchEngineIcon = localStorage.getItem(searchEngineIconStorageKey);
        if (searchEngineIcon) {
            (self.aliases[aliasKey] as Record<string, unknown>).prompt = `<img src="${searchEngineIcon}" alt="${message.prompt}" style="width: 20px;" />`;
        } else if (front.topOrigin.startsWith("http")){
            let iconUrl;
            const msgOptions = message.options as Record<string, unknown> | undefined;
            if (msgOptions?.favicon_url) {
              iconUrl = new URL(msgOptions.favicon_url as string);
            } else {
              iconUrl = new URL(message.url as string);
              iconUrl.pathname = "favicon.ico";
              iconUrl.search = "";
              iconUrl.hash = "";
            }
            RUNTIME('requestImage', {
                url: iconUrl.href,
            }, function(response) {
                if (response) {
                    const text = response.text as string;
                    localStorage.setItem(searchEngineIconStorageKey, text);
                    if (self.aliases) (self.aliases[aliasKey] as Record<string, unknown>).prompt = `<img src="${text}" alt="${message.prompt}" style="width: 20px;" />`;
                }
            });
        }
    };
    front._actions['removeSearchAlias'] = function (message: Record<string, unknown>) {
        delete (self.aliases as Record<string, unknown>)[message.alias as string];
    };
    front._actions['getSearchAliases'] = function (message: Record<string, unknown>) {
        front.postMessage({
            aliases: self.aliases,
            toContent: true,
            id: message.id
        });
    };

    return self;
}

function Commands(omnibar: OmnibarSelf, front: OmnibarFront) {
    type CommandMeta = { code: (args: string[]) => boolean | void; feature_group?: number; annotation?: unknown };
    var self: OmnibarHandlerInternal = {
        focusFirstCandidate: false,
        prompt: ':',
        onEnter: function() { return false; }
    };
    var items: Record<string, CommandMeta> = {};

    var _historyInc = 0;

    self.onOpen = function() {
        omnibar.resultsDiv.className = "commands";

        if (omnibar.input.value.length) {
            omnibar.triggerInput();
            return;
        }

        _historyInc = -1;
        RUNTIME('getSettings', {
            key: 'cmdHistory'
        }, function(response) {
            var candidates = (response.settings as { cmdHistory: string[] }).cmdHistory;
            if (candidates.length) {
                omnibar.listResults(candidates, function(c: unknown) {
                    var li = createElementWithContent('li', c as string);
                    li.cmd = c as string;
                    return li;
                });
            }
        });
    };

    self.onReset = self.onOpen;

    self.onInput = function() {
        var cmd = omnibar.input.value;
        var candidates = Object.keys(items).filter(function(c) {
            return cmd === "" || c.indexOf(cmd) !== -1;
        });
        if (candidates.length) {
            omnibar.listResults(candidates, function(c: unknown) {
                const key = c as string;
                const annotationStr = getAnnotationString(items[key].annotation);
                var li = createElementWithContent('li', `${key}<span class=annotation>${htmlEncode(annotationStr)}</span>`);
                li.cmd = key;
                return li;
            });
        }
    };

    self.onTabKey = function() {
        omnibar.input.value = (omnibar.resultsDiv.querySelector('li.focused') as Element & { cmd: string }).cmd;
    };

    self.onEnter = function() {
        var ret = false;
        var cmdline = omnibar.input.value;
        if (cmdline.length) {
            RUNTIME('updateInputHistory', { cmd: cmdline });
            execute(cmdline);
            omnibar.input.value = "";
        }
        return ret;
    };

    function parseCommand(cmdline: string): string[] {
        var cl = cmdline.trim();
        var tokens: string[] = [];
        var pendingToken = false;
        var part = '';
        for (var i = 0; i < cl.length; i++) {
            if (cl.charAt(i) === ' ' && !pendingToken) {
                tokens.push(part);
                part = '';
            } else {
                if (cl.charAt(i) === '\"') {
                    pendingToken = !pendingToken;
                } else {
                    part += cl.charAt(i);
                }
            }
        }
        tokens.push(part);
        return tokens;
    }

    function execute(cmdline: string) {
        var args = parseCommand(cmdline);
        var cmd = args.shift()!;
        if (items.hasOwnProperty(cmd)) {
            var meta = items[cmd];
            meta.code.call(meta.code, args);
        } else {
            showBanner(`Unsupported command: ${cmdline}.`, 3000);
        }
    }

    front._actions['executeCommand'] = function (message: Record<string, unknown>) {
        execute(message.cmdline as string);
    };

    omnibar.command = function (cmd: string, annotation: unknown, jscode: (args: string[]) => boolean | void) {
        var cmd_code: CommandMeta = {
            code: jscode
        };
        var ag = parseAnnotation({annotation: annotation, feature_group: 14});
        cmd_code.feature_group = ag.feature_group as number;
        cmd_code.annotation = ag.annotation;
        items[cmd] = cmd_code;
    };

    return self;
}

function OmniQuery(omnibar: OmnibarSelf, front: OmnibarFront) {
    var self: OmnibarHandlerInternal = {
        prompt: 'ǭ',
        onEnter: function() {}
    };

    function onlyUnique(value: string, index: number, arr: string[]) {
        return arr.indexOf(value) === index;
    }
    var _words: string[] = [];
    self.onOpen = function(arg: unknown) {
        if (arg && (document as Document & { dictEnabled?: boolean }).dictEnabled === undefined) {
            omnibar.input.value = arg as string;
            front.contentCommand({
                action: 'omnibar_query_entered',
                query: arg as string
            });
        }
        front.contentCommand({
            action: 'getPageText'
        }, function(message: unknown) {
            var splitRegex = /[^a-zA-Z]+/;
            _words = (message as { data: string }).data.toLowerCase().split(splitRegex).filter(onlyUnique);
        });
    };

    self.onInput = function() {
        var iw = omnibar.input.value;
        var candidates = _words.filter(function(w: string) {
            return w.indexOf(iw) !== -1;
        });
        if (candidates.length) {
            omnibar.listResults(candidates, function(w: unknown) {
                return createElementWithContent('li', w as string);
            });
        }
    };

    self.onTabKey = function() {
        omnibar.input.value = (omnibar.resultsDiv.querySelector('li.focused') as HTMLElement).innerText;
    };

    self.onEnter = function() {
        front.contentCommand({
            action: 'omnibar_query_entered',
            query: omnibar.input.value
        });
    };

    return self;
}

function OpenUserURLs(omnibar: OmnibarSelf, front: OmnibarFront) {
    var self: OmnibarHandlerInternal = {
        focusFirstCandidate: true,
        prompt: `UserURLs${separatorHtml}`,
        onEnter: function() { return false; }
    };

    var _items: unknown[];
    self.onOpen = function(args: unknown) {
        _items = args as unknown[];
        self.onInput!();
    };

    self.onInput = function() {
        var query = omnibar.input.value;
        var urls = filterByTitleOrUrl(_items, query, runtime.getCaseSensitive(query));
        omnibar.listURLs(urls, false);
    };
    self.onEnter = function() {
        var fi = omnibar.resultsDiv.querySelector('li.focused');
        front.contentCommand({
            action: 'userURLs_entered',
            item: fi ? (fi as Element & { _item: unknown })._item : { url: omnibar.input.value },
            tabbed: this.tabbed,
            ctrlKey: !this.activeTab,
            shiftKey: (omnibar.tabbed ? 1 : 0) ^ (this.tabbed ? 1 : 0),
        });
        return this.activeTab;
    };
    return self;
}

export default createOmnibar;

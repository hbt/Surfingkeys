import Mode from './common/mode.js';
import {
    createElementWithContent,
    flashPressedLink,
    generateQuickGuid,
    getAnnotations,
    getBrowserName,
    getDocumentOrigin,
    getElements,
    initSKFunctionListener,
    isEditable,
    isInUIFrame,
    scrollIntoViewIfNeeded,
    tabOpenLink,
} from './common/utils.js';
import { RUNTIME, dispatchSKEvent, runtime } from './common/runtime.js';
import createUiHost from './uiframe.js';
import type { ModeInstance, FrontCommand, BrowserAdapter } from '../../@types/surfingkeys';

interface FrontInstance {
    command(args: FrontCommand, successById?: (msg: FrontCommand) => boolean | void): void;
    showEditor(element: string | Element, onWrite?: ((data: string) => void) | null, type?: string, useNeovim?: boolean): void;
    showBanner(msg: string, timeout?: number): void;
    showPopup(content: string): void;
    hidePopup(): void;
    showUsage(): void;
    getUsage(cb: (data: unknown) => void): void;
    chooseTab(): void;
    groupTab(): void;
    openOmnibar(args: Record<string, unknown>): void;
    openOmniquery(args: { query: string; style?: string }): void;
    registerInlineQuery(): void;
    addSearchAlias(alias: string, prompt: string, url: string, suggestionURL?: string, listSuggestion?: ((response: string, request: Record<string, string>) => Promise<string[]>) | null, options?: Record<string, unknown>): void;
    removeSearchAlias(alias: string): void;
    setHintsCharacters(chars: string): void;
    performInlineQuery(query: string, pos: Record<string, number>, showQueryResult: (pos: Record<string, number>, result: unknown) => void): void;
    performInlineQueryOnSelection(word: string): void;
    showStatus(msgs: string[], duration?: number): void;
    toggleStatus(visible: boolean): void;
    executeCommand(cmd: string): void;
    attach(): void;
    detach(): void;
    _actions?: Record<string, (message: FrontCommand) => unknown>;
    [key: string]: unknown;
}

function createFront(insert: ModeInstance, normal: ModeInstance, hints: ModeInstance & { getSelector?: () => string | RegExp | Element[] }, visual: ModeInstance, browser: BrowserAdapter) {
    var self: FrontInstance = {} as FrontInstance;
    // The agent is a front stub to talk with pages/frontend.html
    // that will live in all content window except the frontend.html
    // as there is no need to make this object live in frontend.html.

    var _uiUserSettings: FrontCommand[] = [];
    function applyUserSettings() {
        for (var cmd of _uiUserSettings) {
            self.command(cmd);
        }
    }

    var frontendPromise: Promise<unknown> | undefined;

    function newFrontEnd() {
        frontendPromise = new Promise(function (resolve, _reject) {
            createUiHost(browser as unknown as Record<string, unknown>, (res: unknown) => {
                resolve(res);
                applyUserSettings();
            });
        });
    }

    var _callbacks: Record<string, (msg: FrontCommand) => boolean | void> = {};
    self.command = function(args: FrontCommand, successById?: (msg: FrontCommand) => boolean | void) {
        args.toFrontend = true;
        args.origin = getDocumentOrigin();
        args.id = generateQuickGuid();
        if (successById) {
            args.ack = true;
            _callbacks[args.id!] = successById;
        }
        if (window !== top) {
            runtime.postTopMessage({surfingkeys_uihost_data: args} as unknown as FrontCommand);
        } else {
            if (!frontendPromise) {
                // no need to create frontend iframe if the action is to hide key stroke
                // and frontend UI must be created after document.body is ready(#2132)
                if (args.action === "hideKeystroke" || document.body === null) {
                    return;
                }
                newFrontEnd();
            }
            frontendPromise!.then(function() {
                runtime.postTopMessage({surfingkeys_uihost_data: args} as unknown as FrontCommand);
            });
        }
    };

    function applyUICommand(cmd: FrontCommand) {
        _uiUserSettings.push(cmd);
        if (frontendPromise) {
            frontendPromise.then(function() {
                self.command(cmd);
            });
        }
    }

    var _listSuggestions: Record<string, ((response: string, request: Record<string, string>) => Promise<string[]>) | null> = {};
    self.addSearchAlias = function (alias: string, prompt: string, url: string, suggestionURL?: string, listSuggestion?: ((response: string, request: Record<string, string>) => Promise<string[]>) | null, options?: Record<string, unknown>) {
        if (suggestionURL && listSuggestion) {
            _listSuggestions[suggestionURL] = listSuggestion;
        }
        applyUICommand({
            action: 'addSearchAlias',
            alias: alias,
            prompt: prompt,
            url: url,
            suggestionURL: suggestionURL,
            options: options,
        });
    };
    self.removeSearchAlias = function (alias: string) {
        applyUICommand({
            action: 'removeSearchAlias',
            alias: alias
        });
    };
    self.setHintsCharacters = function (chars: string) {
        applyUICommand({
            action: 'setHintsCharacters',
            characters: chars
        });
    };

    var _actions: Record<string, (message: FrontCommand) => unknown> = {};
    var skCallbacks: Record<string, (...args: unknown[]) => unknown> = {};

    self.performInlineQueryOnSelection = function(word: string) {
        var b = document.getSelection()!.getRangeAt(0).getClientRects()[0];
        self.performInlineQuery(word, b as unknown as Record<string, number>, function(pos: Record<string, number>, queryResult: unknown) {
            if (queryResult) {
                dispatchSKEvent("front", ['showBubble', {
                    top: pos.top,
                    left: pos.left,
                    height: pos.height,
                    width: pos.width
                }, queryResult, false]);
            }
        });
    };
    function querySelectedWord() {
        var selection = document.getSelection()!;
        var word = selection.toString().trim();
        if (word && !/[\W_]/.test(word) && word.length && selection.type === "Range") {
            self.performInlineQueryOnSelection(word);
        }
    }

    _actions["updateInlineQuery"] = function (message: FrontCommand) {
        if (message.word) {
            self.performInlineQueryOnSelection(message.word as string);
        } else {
            querySelectedWord();
        }
    };

    _actions["getSearchSuggestions"] = function (message: FrontCommand) {
        var ret: Promise<unknown> | null = null;
        if (_listSuggestions.hasOwnProperty(message.url as string)) {
            const listSuggestion = _listSuggestions[message.url as string];
            if (typeof listSuggestion === "function") {
                ret = listSuggestion(message.response as string, {
                    url: message.requestUrl as string,
                    query: message.query as string,
                });
            } else {
                ret = new Promise((resolve, _reject) => {
                    const callbackId = generateQuickGuid();
                    skCallbacks[callbackId] = (res: unknown) => {
                        resolve(res);
                    };

                    dispatchSKEvent('user', ["getSearchSuggestions", message.url, message.response, {
                        url: message.requestUrl,
                        query: message.query,
                    }, callbackId]);
                });
            }
        }
        return ret;
    };

    self.executeCommand = function (cmd: string) {
        self.command({
            action: 'executeCommand',
            cmdline: cmd
        });
    };

    var frameElement = createElementWithContent('div', 'Hi, I\'m here now!', {id: "sk_frame"});
    frameElement.fromSurfingKeys = true;
    function highlightElement(sn: { rect: { top: number; left: number; width: number; height: number }; duration: number }) {
        document.documentElement.append(frameElement);
        var rect = sn.rect;
        frameElement.style.top = rect.top + "px";
        frameElement.style.left = rect.left + "px";
        frameElement.style.width = rect.width + "px";
        frameElement.style.height = rect.height + "px";
        frameElement.style.display = "";
        setTimeout(function() {
            frameElement.remove();
        }, sn.duration);
    }

    function getAllAnnotations() {
        let mappings = [ normal.mappings,
            visual.mappings,
            insert.mappings
        ];
        const lurk = (normal as unknown as { getLurkMode: () => ModeInstance | null }).getLurkMode();
        if (lurk) {
            mappings.unshift(lurk.mappings);
        }
        return mappings.map(getAnnotations).reduce(function(a, b) {
            return a.concat(b);
        });
    }

    self.showUsage = function() {
        self.command({
            action: 'showUsage',
            metas: getAllAnnotations()
        });
    };

    self.getUsage = function(cb: (data: unknown) => void) {
        self.command({
            action: 'getUsage',
            metas: getAllAnnotations()
        }, function(response: FrontCommand) {
            cb(response.data);
            return false;
        });
    };

    function hidePopup() {
        self.command({
            action: 'hidePopup'
        });
    }

    function updateElementBehindEditor(data: string) {
        // setEditorText and setValueWithEventDispatched are experimental APIs from Brook Build of Chromium
        // https://brookhong.github.io/2021/04/18/brook-build-of-chromium.html
        if (elementBehindEditor.nodeName === "DIV") {
            if (elementBehindEditor.className === "CodeMirror-code") {
                window.getSelection()!.selectAllChildren(elementBehindEditor);
                let dataTransfer = new DataTransfer();
                dataTransfer.items.add(data, 'text/plain');
                elementBehindEditor.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dataTransfer}));
            } else {
                data = data.replace(/\n+$/, '');

                if (typeof (elementBehindEditor as unknown as { setEditorText?: (d: string) => void }).setEditorText === "function") {
                    (elementBehindEditor as unknown as { setEditorText: (d: string) => void }).setEditorText(data);
                } else {
                    elementBehindEditor.innerText = data;
                }
            }
        } else {
            if (typeof (elementBehindEditor as unknown as { setValueWithEventDispatched?: (d: string) => void }).setValueWithEventDispatched === "function") {
                (elementBehindEditor as unknown as { setValueWithEventDispatched: (d: string) => void }).setValueWithEventDispatched(data);
            } else {
                elementBehindEditor.value = data;
                var evt = document.createEvent("HTMLEvents");
                evt.initEvent("change", false, true);
                elementBehindEditor.dispatchEvent(evt);
            }
        }
    }

    var onEditorSaved: (data: string) => void;
    var elementBehindEditor: Element;

    /**
     * Launch the vim editor.
     *
     * @param {HTMLElement} element the target element which the vim editor is launched for, this parameter can also be a string, which will be used as default content in vim editor.
     * @param {function} onWrite a callback function to be executed on written back from vim editor.
     * @param {string} [type=null] the type for the vim editor, which can be `url`, if not provided, it will be tag name of the target element.
     * @param {boolean} [useNeovim=false] the vim editor will be the embeded JS implementation, if `useNeovim` is true, neovim will be used through natvie messaging.
     * @name Front.showEditor
     *
     * @example
     * mapkey(';U', '#4Edit current URL with vim editor, and reload', function() {
     *     Front.showEditor(window.location.href, function(data) {
     *         window.location.href = data;
     *     }, 'url');
     * });
     */
    self.showEditor = function(element: string | Element, onWrite?: ((data: string) => void) | null, type?: string, useNeovim?: boolean) {
        var content: string,
            initialType = type || (typeof element === 'string' ? undefined : (element as Element).localName),
            initial_line = 0;
        if (typeof(element) === "string") {
            content = element;
            elementBehindEditor = document.body;
        } else if (initialType === 'select') {
            var selected = element.value;
            content = Array.from(element.querySelectorAll('option')).map(function(n, i) {
                if (n.value === selected) {
                    initial_line = i;
                }
                return n.innerText.trim() + " >< " + n.value;
            }).join('\n');
            elementBehindEditor = element;
        } else {
            elementBehindEditor = element;
            if (elementBehindEditor.nodeName === "DIV") {
                if (elementBehindEditor.className === "CodeMirror-code") {
                    let codeMirrorLines = elementBehindEditor.querySelectorAll(".CodeMirror-line");
                    content = Array.from(codeMirrorLines).map((el) => (el as Element).innerText).join("\n");
                    // Remove the red dot (char code 8226) that CodeMirror uses to visualize the zero-width space.
                    content = content.replace(/\u200B/g, "");

                } else {
                    content = elementBehindEditor.innerText;
                }
            } else {
                content = elementBehindEditor.value;
            }
        }
        onEditorSaved = onWrite || updateElementBehindEditor;
        const cmd: FrontCommand & { initial_line?: number; content?: string; file_name?: string } = {
            action: 'showEditor',
            type: initialType || "textarea",
            initial_line: initial_line,
            content: content!
        };
        if (useNeovim || runtime.conf.useNeovim) {
            cmd.file_name = `${new URL(window.location.origin).host}/${elementBehindEditor.nodeName.toLowerCase()}`;
        }
        self.command(cmd);
    };

    self.chooseTab = function() {
        if ((normal as unknown as { repeats: string }).repeats !== "") {
            RUNTIME('focusTabByIndex');
        } else {
            self.command({
                action: 'chooseTab'
            });
        }
    };

    self.groupTab = function() {
        self.command({
            action: 'groupTab'
        });
    };

    /**
     * Open the omnibar.
     *
     * @param {object} args `type` the sub type for the omnibar, which can be `Bookmarks`, `AddBookmark`, `History`, `URLs`, `RecentlyClosed`, `TabURLs`, `Tabs`, `Windows`, `VIMarks`, `SearchEngine`, `Commands`, `OmniQuery` and `UserURLs`.
     * @name Front.openOmnibar
     *
     * @example
     * mapkey('ou', '#8Open AWS services', function() {
     *     var services = Array.from(top.document.querySelectorAll('#awsc-services-container li[data-service-href]')).map(function(li) {
     *         return {
     *             title: li.querySelector("span.service-label").textContent,
     *             url: li.getAttribute('data-service-href')
     *         };
     *     });
     *     if (services.length === 0) {
     *         services = Array.from(top.document.querySelectorAll('div[data-testid="awsc-nav-service-list"] li[data-testid]>a')).map(function(a) {
     *             return {
     *                 title: a.innerText,
     *                 url: a.href
     *             };
     *         });
     *     }
     *     Front.openOmnibar({type: "UserURLs", extra: services});
     * }, {domain: /console.amazonaws|console.aws.amazon.com/i});
     */
    var _userURLsHasCustomOnEnter = false;
    self.openOmnibar = function(args: Record<string, unknown>) {
        const cmd = args as FrontCommand;
        cmd.action = 'openOmnibar';
        _userURLsHasCustomOnEnter = false;
        if (args.type === "LLMChat") {
            args.extra = args.extra || {};
            (args.extra as Record<string, unknown>).url = window.location.href.replace(/\#[^\#]*$/, '');
        }
        if (args._hasCustomOnEnter) {
            _userURLsHasCustomOnEnter = true;
            delete args._hasCustomOnEnter;
        }
        self.command(cmd);
    };

    _actions['userURLs_entered'] = function(message: FrontCommand) {
        if (_userURLsHasCustomOnEnter) {
            _userURLsHasCustomOnEnter = false;
            dispatchSKEvent('user', ['userURLs_onEnter', message.item, message.ctrlKey, message.shiftKey]);
        } else {
            RUNTIME('openLink', {
                tab: { tabbed: message.tabbed, active: !message.ctrlKey },
                url: (message.item as Record<string, unknown>).url
            });
        }
    };

    var _inlineQuery = false;
    var _showQueryResult: ((pos: Record<string, number>, result: unknown) => void) | undefined;
    self.performInlineQuery = function (query: string, pos: Record<string, number>, showQueryResult: (pos: Record<string, number>, result: unknown) => void) {
        if ((document as unknown as { dictEnabled?: boolean }).dictEnabled !== undefined) {
            if (window.location.href.startsWith("chrome://dictorium-query/")) {
                if (window === top) {
                    window.location.href = `chrome://dictorium-query/${query}`;
                } else {
                    window.postMessage({dictorium_data: { type: 'DictoriumReload', word: query }});
                }
            } else {
                window.postMessage({dictorium_data: {
                    type: "OpenDictoriumQuery",
                    word: query,
                    sentence: "",
                    pos: pos,
                    source: window.location.href
                }});
            }
            hidePopup();
        } else if (_inlineQuery) {
            if (runtime.conf.autoSpeakOnInlineQuery) {
                browser.readText(query);
            }
            query = query.toLocaleLowerCase();
            RUNTIME('updateInputHistory', { OmniQuery: query });

            const callbackId = generateQuickGuid();
            skCallbacks[callbackId] = (res: unknown) => {
                showQueryResult(pos, res);
            };
            dispatchSKEvent('user', ["performInlineQuery", query, callbackId]);
        } else if (isInUIFrame()) {
            _showQueryResult = function(result: unknown) {
                showQueryResult(pos, result);
            };
            (document.getElementById("proxyFrame") as HTMLIFrameElement).contentWindow!.postMessage({surfingkeys_content_data: {
                action: "performInlineQuery",
                pos: pos,
                query: query
            }}, "*");
        } else {
            tabOpenLink("https://github.com/brookhong/Surfingkeys/wiki/Register-inline-query");
            hidePopup();
        }
    };

    /**
     * Register an inline query.
     *
     * @param {object} args `url`: string or function, the dictionary service url or a function to return the dictionary service url, `parseResult`: function, a function to parse result from dictionary service and return a HTML string to render explanation, `headers`: object[optional], in case your dictionary service needs authentication.
     * @name Front.registerInlineQuery
     *
     * @see [example](https://github.com/brookhong/Surfingkeys/wiki/Register-inline-query).
     */
    self.registerInlineQuery = function() {
        _inlineQuery = true;
    };
    self.openOmniquery = function(args: { query: string; style?: string }) {
        self.openOmnibar(({type: "OmniQuery", extra: args.query, style: args.style}));
    };

    var _keyHints: { accumulated: string; candidates: Record<string, { annotation: unknown }>; key?: string } = {
        accumulated: "",
        candidates: {},
        key: ""
    };

    self.showStatus = function (msgs: string[], duration?: number) {
        // when showModeStatus is on, showStatus will cause uiHost injected too early
        // which could break some host scripts from sites in Firefox.
        const waitForHostScripts = (getBrowserName() === "Firefox") ? 1000 : 0;
        setTimeout(() => {
            self.command({
                action: "showStatus",
                contents: msgs,
                duration: duration
            });
        }, waitForHostScripts);
    };
    self.toggleStatus = function (visible: boolean) {
        self.command({
            action: "toggleStatus",
            visible: visible
        });
    };

    let onDialogResponseOk: (() => void) | null = null;
    _actions["dialogResponse"] = function (message: FrontCommand) {
        if (message.result === "Ok" && onDialogResponseOk) {
            onDialogResponseOk();
        } else {
            onDialogResponseOk = null;
        }
    };

    skCallbacks = initSKFunctionListener("front", {
        showPopup: (content: unknown) => {
            self.command({
                action: 'showPopup',
                content
            });
        },
        showImagePopup: (dataUrl: unknown) => {
            self.command({
                action: 'showImagePopup',
                dataUrl
            });
        },
        showDialog: (question: unknown, onOk: unknown) => {
            self.command({
                action: 'showDialog',
                question
            });
            onDialogResponseOk = onOk as (() => void);
        },
        applySettingsFromSnippets: (us: unknown) => {
            applyUICommand({
                action: 'applyUserSettings',
                userSettings: us
            });
            const cloneUS = JSON.parse(JSON.stringify(us));
            // overrides local settings from snippets
            for (var k in cloneUS) {
                if (runtime.conf.hasOwnProperty(k)) {
                    (runtime.conf as unknown as Record<string, unknown>)[k] = cloneUS[k];
                    delete cloneUS[k];
                }
           }

            if (Object.keys(cloneUS).length > 0 && window === top) {
                // left settings are for background, need not broadcast the update, neither persist into storage
                RUNTIME('updateSettings', {
                    scope: "snippets",
                    settings: cloneUS
                });
            }
            dispatchSKEvent('settingsFromSnippetsLoaded');
        },
        querySelectedWord,
        addMapkey: (mode: unknown, new_keystroke: unknown, old_keystroke: unknown) => {
            applyUICommand({
                action: 'addMapkey',
                mode: mode,
                new_keystroke: new_keystroke,
                old_keystroke: old_keystroke
            });
        },
        addVimMap: (lhs: unknown, rhs: unknown, ctx: unknown) => {
            applyUICommand({
                action: 'addVimMap',
                lhs: lhs,
                rhs: rhs,
                ctx: ctx
            });
        },
        addVimKeyMap: (vimKeyMap: unknown) => {
            applyUICommand({
                action: 'addVimKeyMap',
                vimKeyMap
            });
        },
        addCommand: (name: unknown, description: unknown) => {
            applyUICommand({
                action: 'addCommand',
                name: name,
                description: description
            });
        },
        highlightElement: (sn: unknown) => highlightElement(sn as { rect: { top: number; left: number; width: number; height: number }; duration: number }),
        hidePopup,
        openFinder: () => {
            self.command({
                action: "openFinder"
            });
        },
        showBanner: (msg: unknown, linger_time: unknown) => {
            self.command({
                action: "showBanner",
                content: msg,
                linger_time: linger_time
            });
        },
        showBubble: (pos: unknown, msg: unknown, noPointerEvents: unknown) => {
            if ((msg as string).length > 0) {
                const p = pos as Record<string, number>;
                p.winWidth = window.innerWidth;
                p.winHeight = window.innerHeight;
                p.winX = 0;
                p.winY = 0;
                if (window.frameElement) {
                    p.winX = (window.frameElement as HTMLElement).offsetLeft;
                    p.winY = (window.frameElement as HTMLElement).offsetTop;
                }
                self.command({
                    action: "showBubble",
                    content: msg,
                    position: p,
                    noPointerEvents: noPointerEvents
                });
            }
        },
        hideBubble: () => {
            self.command({
                action: 'hideBubble'
            });
        },
        hideKeystroke: () => {
            _keyHints.accumulated = "";
            _keyHints.candidates = {};
            self.command({
                action: 'hideKeystroke'
            });
        },
        showKeystroke: (key: unknown, mode: unknown) => {
            _keyHints.accumulated += key as string;
            _keyHints.key = key as string;
            _keyHints.candidates = {};

            const modeInstance = mode as ModeInstance;
            var root = modeInstance.mappings.find(_keyHints.accumulated);
            if (root) {
                const getMetas = (root as Record<string, unknown>).getMetas as ((f: () => boolean) => Array<Record<string, unknown>>) | undefined;
                if (getMetas) {
                    getMetas(function() { return true; }).forEach(function(m) {
                        _keyHints.candidates[m.word as string] = {
                            annotation: m.annotation
                        };
                    });
                }
            }

            self.command({
                action: 'showKeystroke',
                keyHints: _keyHints
            });
        },
        openOmnibar: (args: unknown) => self.openOmnibar(args as Record<string, unknown>),
        showStatus: (msgs: unknown, duration: unknown) => self.showStatus(msgs as string[], duration as number),
        toggleStatus: (visible: unknown) => self.toggleStatus(visible as boolean),
    }) as Record<string, (...args: unknown[]) => unknown>;

    _actions["ace_editor_saved"] = function(response: FrontCommand) {
        if (response.data !== undefined) {
            onEditorSaved(response.data as string);
        }
        if (runtime.conf.focusOnSaved && isEditable(elementBehindEditor)) {
            (normal as unknown as { passFocus: (v: boolean) => void }).passFocus(true);
            elementBehindEditor.focus();
            (insert as unknown as { enter: (el: Element) => void }).enter(elementBehindEditor);
        }
    };
    _actions["nextEdit"] = function(response: FrontCommand) {
        var sel = hints.getSelector?.() || "input, textarea, *[contenteditable=true], select";
        const selStr = typeof sel === 'string' ? sel : "input, textarea, *[contenteditable=true], select";
        var elements = getElements(selStr) as Element[];
        if (elements.length) {
            var i = elements.indexOf(elementBehindEditor);
            i = (i + (response.backward ? -1 : 1)) % elements.length;
            const nextEl = elements[i];
            scrollIntoViewIfNeeded(nextEl);
            flashPressedLink(nextEl, () => {
                self.showEditor(nextEl);
            });
        }
    };

    _actions["omnibar_query_entered"] = function(response: FrontCommand) {
        RUNTIME('updateInputHistory', { OmniQuery: response.query });
        self.performInlineQuery(response.query as string, {
            top: 0,
            left: 80,
            height: 0,
            width: 100
        }, function(pos: Record<string, number>, queryResult: unknown) {
            let result = queryResult;
            if ((result as { constructor: { name: string } }).constructor.name !== "Array") {
                result = [result];
            }
            if (getBrowserName() === "Chrome") {
                var sentence = (visual as unknown as { findSentenceOf: (q: string) => string }).findSentenceOf(response.query as string);
                if (sentence.length > 0) {
                    (result as unknown[]).push(sentence);
                }
            }

            self.command({
                action: 'updateOmnibarResult',
                words: result
            });
        });
    };

    _actions["getBackFocus"] = function(_response: FrontCommand) {
        window.focus();
        if (window === top && frontendPromise) {
            frontendPromise.then((uiHost: unknown) => {
                const host = uiHost as { shadowRoot: ShadowRoot };
                if (host.shadowRoot.contains(document.activeElement)) {
                    // fix for Firefox, blur from iframe for frontend after Omnibar closed.
                    (document.activeElement as HTMLElement).blur();
                }
            });
        }
    };

    _actions["getPageText"] = function(_response: FrontCommand) {
        return document.body.innerText;
    };

    var _pendingQuery: ReturnType<typeof setTimeout> | undefined;
    function clearPendingQuery() {
        if (_pendingQuery) {
            clearTimeout(_pendingQuery);
            _pendingQuery = undefined;
        }
    }

    _actions["visualUpdate"] = function(message: FrontCommand) {
        clearPendingQuery();
        _pendingQuery = setTimeout(function() {
            (visual as unknown as { visualUpdate: (q: string) => void }).visualUpdate(message.query as string);
            self.command({
                action: "visualUpdated"
            });
        }, 500);
    };

    _actions["visualClear"] = function(_message: FrontCommand) {
        clearPendingQuery();
        (visual as unknown as { visualClear: () => void }).visualClear();
    };

    _actions["visualEnter"] = function(message: FrontCommand) {
        clearPendingQuery();
        (visual as unknown as { visualEnter: (q: string) => void }).visualEnter(message.query as string);
    };

    _actions["emptySelection"] = function(_message: FrontCommand) {
        (visual as unknown as { emptySelection: () => void }).emptySelection();
    };

    _actions["executeUserCommand"] = function(message: FrontCommand) {
        dispatchSKEvent('user', ['executeUserCommand', message.name, message.args]);
    };

    var _active = window === top;
    _actions['deactivated'] = function(_message: FrontCommand) {
        _active = false;
    };

    _actions['activated'] = function(_message: FrontCommand) {
        _active = true;
    };

    runtime.on('focusFrame', function(msg, _sender, _response) {
        if ((msg as FrontCommand).frameId === (window as unknown as { frameId: number }).frameId) {
            window.focus();
            document.body.scrollIntoView({
                behavior: 'auto',
                block: 'center',
                inline: 'center'
            });
            highlightElement({
                duration: 500,
                rect: {
                    top: 0,
                    left: 0,
                    width: window.innerWidth,
                    height: window.innerHeight
                }
            });
        }
    });

    window.addEventListener('message', function (event) {
        var _message = event.data && (event.data.surfingkeys_content_data || event.data.dictorium_data) as FrontCommand | undefined;
        if (_message === undefined) {
            return;
        }
        if (_message.action === "performInlineQuery") {
            self.performInlineQuery(_message.query as string, _message.pos as Record<string, number>, function (pos: Record<string, number>, queryResult: unknown) {
                (event.source as Window).postMessage({surfingkeys_content_data: {
                    action: "performInlineQueryResult",
                    pos: pos,
                    result: queryResult
                }}, event.origin);
            });
        } else if (_message.action === "performInlineQueryResult") {
            _showQueryResult?.(_message.pos as Record<string, number>, _message.result);
        } else if (_message.action === "frontendDestroyed") {
            frontendPromise = undefined;
        } else if (_active) {
            if (_message.id && _callbacks[_message.id]) {
                var f = _callbacks[_message.id];
                // returns true to make callback stay for coming response.
                if (!f(_message)) {
                    delete _callbacks[_message.id];
                }
            } else if (_message.action && _actions.hasOwnProperty(_message.action)) {
                var ret = _actions[_message.action](_message);
                if (_message.ack && ret) {
                    let retPromise: Promise<unknown>;
                    if (!(ret as Promise<unknown>).then) {
                        retPromise = Promise.resolve(ret);
                    } else {
                        retPromise = ret as Promise<unknown>;
                    }
                    retPromise.then((data: unknown) =>
                      runtime.postTopMessage({surfingkeys_uihost_data: {
                          data,
                          toFrontend: true,
                          origin: _message!.origin,
                          id: _message!.id
                      }} as unknown as FrontCommand));
                }
            }
        } else if (_message.action === "activated") {
            _actions['activated'](_message);
        } else if (_message.type === "DictoriumViewReady") {
            // make inline query also work on dictorium frame continuously
            _actions['activated'](_message);
        }
        if (!event.data.dictorium_data) {
            event.stopImmediatePropagation();
        }
    }, true);

    var uiHostDetaching: ReturnType<typeof setTimeout> | undefined;
    self.attach = function() {
        if (uiHostDetaching) {
            clearTimeout(uiHostDetaching);
            uiHostDetaching = undefined;
        }
        if (!frontendPromise) {
            newFrontEnd();
        }
        Mode.showStatus();
    };

    self.detach = function() {
        if (frontendPromise) {
            frontendPromise.then((uiHost: unknown) => {
                uiHostDetaching = setTimeout(function() {
                    (uiHost as { tryDetach: () => void }).tryDetach();
                }, 3000);
            });
        }
    };

    return self;
}

export default createFront;

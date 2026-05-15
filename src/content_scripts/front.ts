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

function createFront(insert: any, normal: any, hints: any, visual: any, browser: any) {
    var self: any = {};
    // The agent is a front stub to talk with pages/frontend.html
    // that will live in all content window except the frontend.html
    // as there is no need to make this object live in frontend.html.

    var _uiUserSettings: any[] = [];
    function applyUserSettings() {
        for (var cmd of _uiUserSettings) {
            self.command(cmd);
        }
    }

    var frontendPromise: any;

    function newFrontEnd() {
        frontendPromise = new Promise(function (resolve, _reject) {
            createUiHost(browser, (res: any) => {
                resolve(res);
                applyUserSettings();
            });
        });
    }

    var _callbacks: Record<string, any> = {};
    self.command = function(args: any, successById: any) {
        args.toFrontend = true;
        args.origin = getDocumentOrigin();
        args.id = generateQuickGuid();
        if (successById) {
            args.ack = true;
            _callbacks[args.id] = successById;
        }
        if (window !== top) {
            runtime.postTopMessage({surfingkeys_uihost_data: args} as any);
        } else {
            if (!frontendPromise) {
                // no need to create frontend iframe if the action is to hide key stroke
                // and frontend UI must be created after document.body is ready(#2132)
                if (args.action === "hideKeystroke" || document.body === null) {
                    return;
                }
                newFrontEnd();
            }
            frontendPromise.then(function() {
                runtime.postTopMessage({surfingkeys_uihost_data: args} as any);
            });
        }
    };

    function applyUICommand(cmd: any) {
        _uiUserSettings.push(cmd);
        if (frontendPromise) {
            frontendPromise.then(function() {
                self.command(cmd);
            });
        }
    }

    var _listSuggestions: Record<string, any> = {};
    self.addSearchAlias = function (alias: any, prompt: any, url: any, suggestionURL: any, listSuggestion: any, options: any) {
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
    self.removeSearchAlias = function (alias: any) {
        applyUICommand({
            action: 'removeSearchAlias',
            alias: alias
        });
    };
    self.setHintsCharacters = function (chars: any) {
        applyUICommand({
            action: 'setHintsCharacters',
            characters: chars
        });
    };

    var _actions: Record<string, any> = {};
    var skCallbacks: Record<string, any> = {};

    self.performInlineQueryOnSelection = function(word: any) {
        var b = document.getSelection()!.getRangeAt(0).getClientRects()[0];
        self.performInlineQuery(word, b, function(pos: any, queryResult: any) {
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

    _actions["updateInlineQuery"] = function (message: any) {
        if (message.word) {
            self.performInlineQueryOnSelection(message.word);
        } else {
            querySelectedWord();
        }
    };

    _actions["getSearchSuggestions"] = function (message: any) {
        var ret: Promise<unknown> | null = null;
        if (_listSuggestions.hasOwnProperty(message.url)) {
            const listSuggestion = _listSuggestions[message.url];
            if (typeof listSuggestion === "function") {
                ret = listSuggestion(message.response, {
                    url: message.requestUrl,
                    query: message.query,
                });
            } else {
                ret = new Promise((resolve, _reject) => {
                    const callbackId = generateQuickGuid();
                    skCallbacks[callbackId] = (res: any) => {
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

    self.executeCommand = function (cmd: any) {
        self.command({
            action: 'executeCommand',
            cmdline: cmd
        });
    };

    var frameElement = createElementWithContent('div', 'Hi, I\'m here now!', {id: "sk_frame"});
    frameElement.fromSurfingKeys = true;
    function highlightElement(sn: any) {
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
        const lurk = normal.getLurkMode();
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

    self.getUsage = function(cb: any) {
        self.command({
            action: 'getUsage',
            metas: getAllAnnotations()
        }, function(response: any) {
            cb(response.data);
        });
    };

    function hidePopup() {
        self.command({
            action: 'hidePopup'
        });
    }

    function updateElementBehindEditor(data: any) {
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

                if (typeof elementBehindEditor.setEditorText === "function") {
                    elementBehindEditor.setEditorText(data);
                } else {
                    elementBehindEditor.innerText = data;
                }
            }
        } else {
            if (typeof elementBehindEditor.setValueWithEventDispatched === "function") {
                elementBehindEditor.setValueWithEventDispatched(data);
            } else {
                elementBehindEditor.value = data;
                var evt = document.createEvent("HTMLEvents");
                evt.initEvent("change", false, true);
                elementBehindEditor.dispatchEvent(evt);
            }
        }
    }

    var onEditorSaved: any, elementBehindEditor: any;

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
    self.showEditor = function(element: any, onWrite: any, type: any, useNeovim: any) {
        var content,
            type = type || element.localName,
            initial_line = 0;
        if (typeof(element) === "string") {
            content = element;
            elementBehindEditor = document.body;
        } else if (type === 'select') {
            var selected = element.value;
            content = Array.from(element.querySelectorAll('option')).map(function(n: any, i) {
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
                    content = Array.from(codeMirrorLines).map((el: any) => el.innerText).join("\n");
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
        const cmd: {
            action: string;
            type: any;
            initial_line: number;
            content: any;
            file_name?: string;
        } = {
            action: 'showEditor',
            type: type || "textarea",
            initial_line: initial_line,
            content: content
        };
        if (useNeovim || runtime.conf.useNeovim) {
            cmd.file_name = `${new URL(window.location.origin).host}/${elementBehindEditor.nodeName.toLowerCase()}`;
        }
        self.command(cmd);
    };

    self.chooseTab = function() {
        if (normal.repeats !== "") {
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
    self.openOmnibar = function(args: any) {
        args.action = 'openOmnibar';
        _userURLsHasCustomOnEnter = false;
        if (args.type === "LLMChat") {
            args.extra = args.extra || {};
            args.extra.url = window.location.href.replace(/\#[^\#]*$/, '');
        }
        if (args._hasCustomOnEnter) {
            _userURLsHasCustomOnEnter = true;
            delete args._hasCustomOnEnter;
        }
        self.command(args);
    };

    _actions['userURLs_entered'] = function(message: any) {
        if (_userURLsHasCustomOnEnter) {
            _userURLsHasCustomOnEnter = false;
            dispatchSKEvent('user', ['userURLs_onEnter', message.item, message.ctrlKey, message.shiftKey]);
        } else {
            RUNTIME('openLink', {
                tab: { tabbed: message.tabbed, active: !message.ctrlKey },
                url: message.item.url
            });
        }
    };

    var _inlineQuery = false;
    var _showQueryResult: any;
    self.performInlineQuery = function (query: any, pos: any, showQueryResult: any) {
        if ((document as any).dictEnabled !== undefined) {
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
            skCallbacks[callbackId] = (res: any) => {
                showQueryResult(pos, res);
            };
            dispatchSKEvent('user', ["performInlineQuery", query, callbackId]);
        } else if (isInUIFrame()) {
            _showQueryResult = function(result: any) {
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
    self.openOmniquery = function(args: any) {
        self.openOmnibar(({type: "OmniQuery", extra: args.query, style: args.style}));
    };

    var _keyHints: { accumulated: string; candidates: Record<string, any>; key?: any } = {
        accumulated: "",
        candidates: {},
        key: ""
    };

    self.showStatus = function (msgs: any, duration: any) {
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
    self.toggleStatus = function (visible: any) {
        self.command({
            action: "toggleStatus",
            visible: visible
        });
    };

    let onDialogResponseOk: (() => void) | null = null;
    _actions["dialogResponse"] = function (message: any) {
        if (message.result === "Ok" && onDialogResponseOk) {
            onDialogResponseOk();
        } else {
            onDialogResponseOk = null;
        }
    };

    skCallbacks = initSKFunctionListener("front", {
        showPopup: (content: any) => {
            self.command({
                action: 'showPopup',
                content
            });
        },
        showImagePopup: (dataUrl: any) => {
            self.command({
                action: 'showImagePopup',
                dataUrl
            });
        },
        showDialog: (question: any, onOk: any) => {
            self.command({
                action: 'showDialog',
                question
            });
            onDialogResponseOk = onOk;
        },
        applySettingsFromSnippets: (us: any) => {
            applyUICommand({
                action: 'applyUserSettings',
                userSettings: us
            });
            const cloneUS = JSON.parse(JSON.stringify(us));
            // overrides local settings from snippets
            for (var k in cloneUS) {
                if (runtime.conf.hasOwnProperty(k)) {
                    (runtime.conf as any)[k] = cloneUS[k];
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
        addMapkey: (mode: any, new_keystroke: any, old_keystroke: any) => {
            applyUICommand({
                action: 'addMapkey',
                mode: mode,
                new_keystroke: new_keystroke,
                old_keystroke: old_keystroke
            });
        },
        addVimMap: (lhs: any, rhs: any, ctx: any) => {
            applyUICommand({
                action: 'addVimMap',
                lhs: lhs,
                rhs: rhs,
                ctx: ctx
            });
        },
        addVimKeyMap: (vimKeyMap: any) => {
            applyUICommand({
                action: 'addVimKeyMap',
                vimKeyMap
            });
        },
        addCommand: (name: any, description: any) => {
            applyUICommand({
                action: 'addCommand',
                name: name,
                description: description
            });
        },
        highlightElement,
        hidePopup,
        openFinder: () => {
            self.command({
                action: "openFinder"
            });
        },
        showBanner: (msg: any, linger_time: any) => {
            self.command({
                action: "showBanner",
                content: msg,
                linger_time: linger_time
            });
        },
        showBubble: (pos: any, msg: any, noPointerEvents: any) => {
            if (msg.length > 0) {
                pos.winWidth = window.innerWidth;
                pos.winHeight = window.innerHeight;
                pos.winX = 0;
                pos.winY = 0;
                if (window.frameElement) {
                    pos.winX = (window.frameElement as HTMLElement).offsetLeft;
                    pos.winY = (window.frameElement as HTMLElement).offsetTop;
                }
                self.command({
                    action: "showBubble",
                    content: msg,
                    position: pos,
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
        showKeystroke: (key: any, mode: any) => {
            _keyHints.accumulated += key;
            _keyHints.key = key;
            _keyHints.candidates = {};

            var root = mode.mappings.find(_keyHints.accumulated);
            if (root) {
                root.getMetas(function(_m: any) {
                    return true;
                }).forEach(function(m: any) {
                    _keyHints.candidates[m.word] = {
                        annotation: m.annotation
                    };
                });
            }

            self.command({
                action: 'showKeystroke',
                keyHints: _keyHints
            });
        },
        openOmnibar: self.openOmnibar,
        showStatus: self.showStatus,
        toggleStatus: self.toggleStatus,
    });

    _actions["ace_editor_saved"] = function(response: any) {
        if (response.data !== undefined) {
            onEditorSaved(response.data);
        }
        if (runtime.conf.focusOnSaved && isEditable(elementBehindEditor)) {
            normal.passFocus(true);
            elementBehindEditor.focus();
            insert.enter(elementBehindEditor);
        }
    };
    _actions["nextEdit"] = function(response: any) {
        var sel = hints.getSelector() || "input, textarea, *[contenteditable=true], select";
        sel = getElements(sel);
        if (sel.length) {
            var i = sel.indexOf(elementBehindEditor);
            i = (i + (response.backward ? -1 : 1)) % sel.length;
            sel = sel[i];
            scrollIntoViewIfNeeded(sel);
            flashPressedLink(sel, () => {
                self.showEditor(sel);
            });
        }
    };

    _actions["omnibar_query_entered"] = function(response: any) {
        RUNTIME('updateInputHistory', { OmniQuery: response.query });
        self.performInlineQuery(response.query, {
            top: 0,
            left: 80,
            height: 0,
            width: 100
        },function(pos: any, queryResult: any) {
            if (queryResult.constructor.name !== "Array") {
                queryResult = [queryResult];
            }
            if (getBrowserName() === "Chrome") {
                var sentence = visual.findSentenceOf(response.query);
                if (sentence.length > 0) {
                    queryResult.push(sentence);
                }
            }

            self.command({
                action: 'updateOmnibarResult',
                words: queryResult
            });
        });
    };

    _actions["getBackFocus"] = function(_response: any) {
        window.focus();
        if (window === top && frontendPromise) {
            frontendPromise.then((uiHost: any) => {
                if (uiHost.shadowRoot.contains(document.activeElement)) {
                    // fix for Firefox, blur from iframe for frontend after Omnibar closed.
                    (document.activeElement as HTMLElement).blur();
                }
            });
        }
    };

    _actions["getPageText"] = function(_response: any) {
        return document.body.innerText;
    };

    var _pendingQuery: any;
    function clearPendingQuery() {
        if (_pendingQuery) {
            clearTimeout(_pendingQuery);
            _pendingQuery = undefined;
        }
    }

    _actions["visualUpdate"] = function(message: any) {
        clearPendingQuery();
        _pendingQuery = setTimeout(function() {
            visual.visualUpdate(message.query);
            self.command({
                action: "visualUpdated"
            });
        }, 500);
    };

    _actions["visualClear"] = function(_message: any) {
        clearPendingQuery();
        visual.visualClear();
    };

    _actions["visualEnter"] = function(message: any) {
        clearPendingQuery();
        visual.visualEnter(message.query);
    };

    _actions["emptySelection"] = function(_message: any) {
        visual.emptySelection();
    };

    _actions["executeUserCommand"] = function(message: any) {
        dispatchSKEvent('user', ['executeUserCommand', message.name, message.args]);
    };

    var _active = window === top;
    _actions['deactivated'] = function(_message: any) {
        _active = false;
    };

    _actions['activated'] = function(_message: any) {
        _active = true;
    };

    runtime.on('focusFrame', function(msg, _sender, _response) {
        if (msg.frameId === (window as any).frameId) {
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
        var _message = event.data && (event.data.surfingkeys_content_data || event.data.dictorium_data);
        if (_message === undefined) {
            return;
        }
        if (_message.action === "performInlineQuery") {
            self.performInlineQuery(_message.query, _message.pos, function (pos: any, queryResult: any) {
                (event.source as Window).postMessage({surfingkeys_content_data: {
                    action: "performInlineQueryResult",
                    pos: pos,
                    result: queryResult
                }}, event.origin);
            });
        } else if (_message.action === "performInlineQueryResult") {
            _showQueryResult(_message.pos, _message.result);
        } else if (_message.action === "frontendDestroyed") {
            frontendPromise = undefined;
        } else if (_active) {
            if (_callbacks[_message.id]) {
                var f = _callbacks[_message.id];
                // returns true to make callback stay for coming response.
                if (!f(_message)) {
                    delete _callbacks[_message.id];
                }
            } else if (_message.action && _actions.hasOwnProperty(_message.action)) {
                var ret = _actions[_message.action](_message);
                if (_message.ack && ret) {
                    if (!ret.then) {
                        ret = Promise.resolve(ret);
                    }
                    ret.then((data: any) =>
                      runtime.postTopMessage({surfingkeys_uihost_data: {
                          data,
                          toFrontend: true,
                          origin: _message.origin,
                          id: _message.id
                      }} as any));
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

    var uiHostDetaching: any;
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
            frontendPromise.then((uiHost: any) => {
                uiHostDetaching = setTimeout(function() {
                    uiHost.tryDetach();
                }, 3000);
            });
        }
    };

    return self;
}

export default createFront;

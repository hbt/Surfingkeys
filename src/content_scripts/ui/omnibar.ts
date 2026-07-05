import Trie from '../common/trie';
import KeyboardUtils from '../common/keyboardUtils';
import Mode from '../common/mode';

declare const Normal: any;
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
import { fuzzyMatch } from './fuzzyFilter';

const separator = '➤';
const separatorHtml = `<span class='separator'>${separator}</span>`;

function createOmnibar(front: any, clipboard: any) {
    var self = new (Mode as any)("Omnibar");

    self.addEventListener('keydown', function(event: any) {
        if (event.sk_keyName.length) {
            Mode.handleMapKey.call(self, event);
        }
        event.sk_suppressed = true;
    }).addEventListener('mousedown', function(event: any) {
        if (!ui.contains(event.target)) {
            front.hidePopup();
        }
        event.sk_suppressed = true;
    });

    self.mappings = new (Trie as any)();
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
            var fi = self.resultsDiv.querySelector('li.focused');
            if (fi && fi.uid) {
                RUNTIME("removeURL", {
                    uid: fi.uid
                }, function(ret) {
                    if (ret.response === "Done") {
                        var newFI = (getPosition() !== "bottom") ? fi.nextElementSibling : fi.previousElementSibling;
                        fi.remove();
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

    function reopen(cb: any) {
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
            var fi = self.resultsDiv.querySelector('li.focused');
            if (fi && fi.url) {
                reopen(function () {
                    front.showEditor({
                        initial_line: 1,
                        type: "url",
                        content: fi.url,
                        onEditorSaved: function(data: any) {
                            if (data) {
                                tabOpenLink(data);
                            }
                        }
                    });
                });
            } else if (handler === searchEngine) {
                var query = self.input.value;
                var url = searchEngine.url;
                reopen(function () {
                    front.showEditor({
                        initial_line: 1,
                        type: "url",
                        content: query,
                        onEditorSaved: function(data: any) {
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

            const fi = self.resultsDiv.querySelector('li.focused');
            let text;
            if (fi && fi.copy) {
                text = fi.copy;
            } else if (fi && fi.url) {
                text = fi.url;
            } else if (_page) {
                text = _page.map((p: any) => {
                    return p.url;
                }).join("\n");
            }
            clipboard.write(text);

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
            var uids = Array.from(self.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li')).map(function(li: any) {
                return li.uid;
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
        code: function (mark: any) {
            var fi = self.resultsDiv.querySelector('li.focused');
            if (fi) {
                Normal.addVIMark(mark, fi.url);
            }
        }
    });

    var handlers: Record<string, any> = {},
        bookmarkFolders: any;

    var lastInput = "", handler: any, lastHandler: any = null;
    var ui: any = document.getElementById('sk_omnibar');

    self.triggerInput = function() {
        var event = new Event('input', {
            'bubbles': true,
            'cancelable': true
        });
        self.input.dispatchEvent(event);
    };

    self.expandAlias = function(alias: any, val: any) {
        var eaten = false;
        if (handler !== searchEngine && alias.length && searchEngine.aliases.hasOwnProperty(alias)) {
            lastHandler = handler;
            handler = searchEngine;
            Object.assign(searchEngine, searchEngine.aliases[alias]);
            setSanitizedContent(self.resultsDiv, "");
            setSanitizedContent(self.promptSpan, handler.prompt);
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
            setSanitizedContent(self.promptSpan, handler.prompt);
            if (val.length) {
                self.input.value = val.substr(0, val.length - 1);
            }
            self.triggerInput();
            eaten = true;
        }
        return eaten;
    };

    self.focusItem = function(fi: any) {
        if (typeof(fi) === 'string') {
            fi = self.resultsDiv.querySelector(fi);
        }
        if (fi) {
            fi.classList.add('focused');
            const fiRect = fi.getBoundingClientRect();
            const resultsRect = self.resultsDiv.getBoundingClientRect();
            if (fiRect.top < resultsRect.top || fiRect.bottom > resultsRect.bottom) {
              const alignToTop = fiRect.top < resultsRect.top;
              fi.scrollIntoView(alignToTop);
            }
        }
    };

    function rotateResult(backward: any) {
        var items = Array.from(self.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li'));
        var total = items.length;
        if (total > 0) {
            var fi = self.resultsDiv.querySelector('li.focused');
            if (fi) {
                fi.classList.remove('focused');
            }
            var lastFocused = items.indexOf(fi);
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

    self.promptSpan = ui.querySelector('#sk_omnibarSearchArea>span.prompt');
    var resultPageSpan = ui.querySelector('#sk_omnibarSearchArea>span.resultPage');
    self.resultsDiv = ui.querySelector('#sk_omnibarSearchResult');

    function _onIput(this: any) {
        if (lastInput !== self.input.value) {
            lastInput = self.input.value;
        }
        if (handler.onInput) {
            handler.onInput.call(this as any);
        }
    }
    function _onKeyDown(evt: any) {
        if (handler && handler.onKeydown && handler.onKeydown.call(evt.target, evt)) {
            return;
        }
        if (Mode.isSpecialKeyOf("<Esc>", evt.sk_keyName)) {
            front.hidePopup();
            evt.preventDefault();
        } else if (evt.keyCode === KeyboardUtils.keyCodes.enter) {
            handler.activeTab = !evt.ctrlKey;
            handler.tabbed = self.tabbed ^ evt.shiftKey;
            if (handler.onEnter()) {
                front.hidePopup();
            }
        } else if (evt.keyCode === KeyboardUtils.keyCodes.space) {
            const cursor = self.input.selectionStart;
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
        _input.onkeydown = _onKeyDown;
        _input.addEventListener('compositionstart', function(_evt) {
            _input.oninput = null;
            _input.onkeydown = null;
        });
        _input.addEventListener('compositionend', function(_evt) {
            _input.oninput = _onIput;
            _input.onkeydown = _onKeyDown;
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

    self.highlight = function(rxp: any, str: any) {
        if (str.substr(0, 11) === "data:image/") {
            str = str.substr(0, 1024);
        }
        return (rxp === null) ? str : str.replace(rxp, function(m: any) {
            return "<span class=omnibar_highlight>" + m + "</span>";
        });
    };

    self.createURLItem = function(b: any, rxp: any) {
        b.title = (b.title && b.title !== "") ? b.title : safeDecodeURI(b.url);
        var type = "🔥", additional = "", uid = b.uid;
        if (b.hasOwnProperty('lastVisitTime')) {
            type = "🕜";
            additional = `<span class=omnibar_timestamp># ${timeStampString(b.lastVisitTime)}</span>`;
            additional += `<span class=omnibar_visitcount> (${b.visitCount})</span>`;
            uid = "H" + b.url;
        } else if(b.hasOwnProperty('dateAdded')) {
            type = "⭐";
            additional = `<span class=omnibar_folder>@ ${bookmarkFolders[b.parentId].title || ""}</span> <span class=omnibar_timestamp># ${timeStampString(b.dateAdded)}</span>`;
            uid = "B" + b.id;
        } else if(b.hasOwnProperty('width')) {
            type = "🔖";
            uid = "T" + b.windowId + ":" + b.id;
            // } else if(b.type && /^\p{Emoji}$/u.test(b.type)) {
        } else if(b.type && b.type.length === 2 && b.type.charCodeAt(0) > 255) {
            type = b.type;
        }
        var li = createElementWithContent('li', `<div class="icon">${type}</div>`);
        if (b.hasOwnProperty('favIconUrl')) {
            li = createElementWithContent('li', `<img class="icon"/>`);
            attachFaviconToImgSrc(b, li.querySelector('img'));
        }
        li.appendChild(createElementWithContent('div',
            `<div class="title">${self.highlight(rxp, htmlEncode(b.title))} ${additional}</div><div class="url">${self.highlight(rxp, htmlEncode(safeDecodeURIComponent(b.url)))}</div>`, { "class": "text-container" }));
        li.uid = uid;
        li.url = b.url;
        li._item = b;
        return li;
    };

    self.createItemFromRawHtml = function({ html, props }: any) {
        const li = createElementWithContent('li', html);
        if (typeof props === "object") {
            Object.assign(li, props);
        }
        return li;
    };

    self.detectAndInsertURLItem = function(str: any, toList: any) {
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

    var _start: any, _items: any, _showFolder: any, _page: any;

    self.getPageSize = () => {
        return runtime.conf.omnibarMaxResults;
    };

    self.getHistoryCacheSize = () => {
        return runtime.conf.omnibarHistoryCacheSize;
    };

    self.listURLs = function(items: any, showFolder: any) {
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
        var ei: any = si + runtime.conf.omnibarMaxResults;
        ei = ei > _items.length ? _items.length : ei;
        var total: any = _items.length;
        if (total === runtime.conf.omnibarHistoryCacheSize) {
            total = total + "+";
        }
        setSanitizedContent(resultPageSpan, `${si + 1} - ${ei} / ${total}`);
        _page = _items.slice(si, ei);
        var query = self.input.value.trim();
        var rxp: RegExp | null = null;
        if (query.length) {
            rxp = regexFromString(query, runtime.getCaseSensitive(query), true);
        }
        self.listResults(_page, function(b: any) {
            var li;
            if (b.hasOwnProperty('html')) {
                li = self.createItemFromRawHtml(b);
            } else if (b.hasOwnProperty('url') && b.url !== undefined) {
                if (getBrowserName() === "Firefox" && /^(place|data):/i.test(b.url)) {
                    return null;
                }
                li = self.createURLItem(b, rxp);
            } else if (_showFolder) {
                li = createElementWithContent('li', `<div class="title">▷ ${self.highlight(rxp, b.title)}</div>`);
                li.folder_name = b.title;
                li.folderId = b.id;
            }
            return li;
        });
    }

    var _savedAargs: any;
    ui.onShow = function(args: any) {
        handler = handlers[args.type];
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

        self.tabbed = (args.tabbed !== undefined) ? args.tabbed : true;
        self.input.focus();
        self.enter();
        if (args.pref) {
            self.input.value = args.pref;
        }
        self.resultsDiv.className = "";
        if (handler.onOpen) {
            handler.onOpen(args.extra);
        }
        lastHandler = handler;
        handler = handler;
        setSanitizedContent(self.promptSpan, handler.prompt);
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
        handler = null;
    };

    self.isUrl = function (input: any) {
      if (input.match(/\s+/)) {
        return false;
      }

      if (input.match(/^https?:\/\//)) {
        return true;
      }

      var regex = /^(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/;

      return input.match(regex);
    };

    self.openFocused = function() {
        var _ret = false, fi = self.resultsDiv.querySelector('li.focused');
        var url;
        if (fi) {
            url = fi.url;
        } else {
            url = self.input.value;
            if (!self.isUrl(url)) {
                url = searchEngine.aliases[runtime.conf.defaultSearchEngine].url + url;
            }
        }
        var type = "", uid;
        if (fi && fi.uid) {
            uid = fi.uid;
            type = uid[0];
            uid = uid.substr(1);
        }
        if (type === 'T') {
            uid = uid.split(":");
            RUNTIME('focusTab', {
                windowId: parseInt(uid[0]),
                tabId: parseInt(uid[1])
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
        return this.activeTab;
    };

    self.listResults = function (items: any, renderItem: any) {
        setSanitizedContent(self.resultsDiv, "");
        if (!items || items.length === 0) {
            return;
        }
        if (getPosition() === "bottom") {
            items.reverse();
        }
        var ul = document.createElement("ul");
        items.forEach(function(b: any) {
            var li = renderItem(b);
            if (li) {
                ul.append(li);
                li.onclick = () => {
                    if (li.url) {
                        RUNTIME("openLink", {
                            tab: {
                                tabbed: true,
                                active: true,
                            },
                            url: li.url
                        });
                    } else {
                        self.input.value = li.query;
                        self.input.focus();
                    }
                };
            }
        });
        self.resultsDiv.append(ul);
        items = self.resultsDiv.querySelectorAll("#sk_omnibarSearchResult>ul>li");
        if (runtime.conf.focusFirstCandidate || handler.focusFirstCandidate) {
            var fi = (getPosition() === "bottom") ? items.length - 1 : 0;
            items[fi].classList.add('focused');
        }
        if (getPosition() === "bottom" && items.length > 0) {
            scrollIntoViewIfNeeded(items[items.length-1]);
        }
    };

    self.listWords = function(words: any) {
        self.listResults(words, function(w: any) {
            var li = createElementWithContent('li', `⌕ ${w}`);
            li.query = w;
            return li;
        });
    };

    self.html = function(content: any) {
        setSanitizedContent(self.resultsDiv, content);
    };

    self.addHandler = function(name: any, hdl: any) {
        if (!hdl.onEnter) {
            hdl.onEnter = self.openFocused.bind(hdl);
        }
        handlers[name] = hdl;
    };

    self.listBookmarkFolders = function(cb: any) {
        RUNTIME('getBookmarkFolders', null, function(response) {
            bookmarkFolders = {};
            response.folders.forEach(function(f: any) {
                bookmarkFolders[f.id] = f;
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
                resolve(response.history);
            });
        });
    }));
    self.addHandler('URLs', OpenURLs(separatorHtml, self, () => {
        return new Promise((resolve, _reject) => {
            RUNTIME('getTabs', {
                queryInfo: runtime.conf.omnibarTabsQuery
            }, function(response) {
                var results = response.tabs;
                RUNTIME("getTopSites", null, function(response) {
                    results = results.concat(response.urls);
                    results = filterByTitleOrUrl(results, self.input.value, runtime.getCaseSensitive(self.input.value));
                    self.listBookmarkFolders(function() {
                        RUNTIME('getAllURLs', {
                            maxResults: self.getHistoryCacheSize() - results.length,
                            query: self.input.value
                        } , function(response) {
                            results = results.concat(response.urls);
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
    self.addHandler('PageEntities', PageEntities(self, clipboard));
    self.addHandler('OmniQuery', OmniQuery(self, front));
    self.addHandler('UserURLs', OpenUserURLs(self, front));
    self.addHandler('LLMChat', LLMChat(self, front));

    front._actions['updateOmnibarResult'] = function(message: any) {
        self.listWords(message.words);
    };
    return self;
}

function OpenBookmarks(omnibar: any) {
    var self: any = {
        prompt: `bookmark${separatorHtml}`,
        inFolder: []
    };

    var folderOnly = false,
        currentFolderId: any,
        lastFocused = 0;

    function onFolderUp() {
        var fl = self.inFolder.pop();
        if (fl.folderId) {
            currentFolderId = fl.folderId;
            RUNTIME('getBookmarks', {
                parentId: currentFolderId
            }, self.onResponse);
        } else {
            currentFolderId = undefined;
            RUNTIME('getBookmarks', null, self.onResponse);
        }
        self.prompt = fl.prompt;
        setSanitizedContent(omnibar.promptSpan, self.prompt);
        lastFocused = fl.focused;
    }

    self.onEnter = function() {
        var items = Array.from(omnibar.resultsDiv.querySelectorAll("#sk_omnibarSearchResult>ul>li"));
        var ret = false,
            fi = omnibar.resultsDiv.querySelector('li.focused');
        var folderId = fi.folderId;
        if (folderId && !this.activeTab){
            RUNTIME('getBookmarks', {
                parentId: folderId
            }, function(response){
                var subItems = response.bookmarks;
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
            self.inFolder.push({
                prompt: self.prompt,
                folderId: currentFolderId,
                focused: items.indexOf(fi)
            });
            localStorage.setItem("surfingkeys.lastOpenBookmark", JSON.stringify(self.inFolder));
        } else if (folderId) {
            self.inFolder.push({
                prompt: self.prompt,
                folderId: currentFolderId,
                focused: items.indexOf(fi)
            });
            self.prompt = fi.folder_name + separator;
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
                self.inFolder.push({
                    prompt: self.prompt,
                    folderId: currentFolderId,
                    focused: items.indexOf(fi)
                });
                localStorage.setItem("surfingkeys.lastOpenBookmark", JSON.stringify(self.inFolder));
            }
        }
        return ret;
    };

    self.onOpen = function() {
        omnibar.listBookmarkFolders(function() {
            var lastBookmarkFolder = localStorage.getItem("surfingkeys.lastOpenBookmark");
            if (lastBookmarkFolder) {
                self.inFolder = JSON.parse(lastBookmarkFolder);
                onFolderUp();
            } else {
                RUNTIME('getBookmarks', null, self.onResponse);
            }
            if (omnibar.input.value !== "") {
                self.onInput();
            }
        });
    };

    self.onClose = function() {
        self.inFolder = [];
        self.prompt = `bookmark${separatorHtml}`;
        currentFolderId = undefined;
    };

    self.onKeydown = function(event: any) {
        var eaten = false;
        if (event.keyCode === KeyboardUtils.keyCodes.comma) {
            folderOnly = !folderOnly;
            self.prompt = folderOnly ? `bookmark folder${separator}` : `bookmark${separator}`;
            setSanitizedContent(omnibar.promptSpan, self.prompt);
            RUNTIME('getBookmarks', {
                parentId: currentFolderId,
                query: omnibar.input.value
            }, self.onResponse);
            eaten = true;
        } else if (event.keyCode === KeyboardUtils.keyCodes.backspace && self.inFolder.length && !omnibar.input.value.length) {
            onFolderUp();
            eaten = true;
        } else if (event.ctrlKey && event.shiftKey && KeyboardUtils.isWordChar(event)) {
            var fi = omnibar.resultsDiv.querySelector('li.focused');
            if (fi) {
                var mark_char = String.fromCharCode(event.keyCode);
                Normal.addVIMark(mark_char, fi.url);
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
    self.onResponse = function(response: any) {
        var items = response.bookmarks;
        if (folderOnly) {
            items = items.filter(function(b: any) {
                return !b.hasOwnProperty('url') || b.url === undefined;
            });
        }
        omnibar.listURLs(items, true);

        if (!omnibar.resultsDiv.querySelector('li.focused')) {
            var items = omnibar.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li');
            omnibar.focusItem(items[lastFocused]);
        }
    };

    return self;
}

function AddBookmark(omnibar: any) {
    var self: any = {
        focusFirstCandidate: true,
        prompt: `add bookmark${separatorHtml}`
    }, folders: any, _origFFC;

    self.onOpen = function(arg: any) {
        self.page = arg;
        omnibar.listBookmarkFolders(function(response: any) {
            folders = response.folders;
            omnibar.listResults(folders.slice(), function(f: any) {
                return createElementWithContent('li', `▷ ${f.title}`, {folder: f.id});
            });
            RUNTIME("getBookmark", null, function(resp) {
                if (resp.bookmarks.length) {
                    var b = resp.bookmarks[0];
                    setSanitizedContent(omnibar.promptSpan, `edit bookmark${separatorHtml}`);
                    omnibar.resultsDiv.querySelector('li.focused').classList.remove('focused');
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
                    self.onInput();
                }
            });
        });
    };

    self.onTabKey = function() {
        var fi = omnibar.resultsDiv.querySelector('li.focused');
        omnibar.input.value = fi.innerHTML.substr(2);
    };

    self.onEnter = function() {
        self.page.path = [];
        var fi = omnibar.resultsDiv.querySelector('li.focused');
        var folderName: any;
        if (fi) {
            self.page.folder = fi.getAttribute('folder');
            folderName = fi.innerHTML.substr(2);
        } else {
            var path = omnibar.input.value;
            path = path.split('/');
            var title = path.pop();
            if (title.length) {
                self.page.title = title;
            }
            path = path.filter(function(p: any) {
                return p.length > 0;
            });
            for (var l = path.length; l > 0; l--) {
                var targetFolder = folders.filter(function(f: any) {
                    return f.title === `/${path.slice(0, l).join("/")}/`;
                });
                if (targetFolder.length) {
                    self.page.folder = targetFolder[0].id;
                    self.page.path = path.slice(l);
                    folderName = "/" + path.join("/");
                    break;
                }
            }
            if (self.page.folder === undefined) {
                self.page.folder = folders[0].id;
                self.page.path = path;
                folderName = `${folders[0].title}${path.join("/")}`;
            }
        }
        RUNTIME('createBookmark', {
            page: self.page
        }, function(_response) {
            showBanner("Bookmark created at {0}.".format(folderName), 3000);
        });
        localStorage.setItem("surfingkeys.lastAddedBookmark", omnibar.input.value);
        return true;
    };

    self.onInput = function() {
        var query = omnibar.input.value;
        var caseSensitive = runtime.getCaseSensitive(query);
        var matches = folders.filter(function(b: any) {
            if (caseSensitive)
              return b.title.indexOf(query) !== -1;
            else
              return b.title.toLowerCase().indexOf(query.toLowerCase()) !== -1;
        });
        omnibar.listResults(matches, function(f: any) {
            return createElementWithContent('li', `▷ ${f.title}`, {folder: f.id});
        });
    };

    return self;
}

function OpenURLs(prompt: any, omnibar: any, queryFn: any) {
    var self: any = { prompt }, sequenceNumber: any;

    const queryAndList = () => {
        let myseq = ++sequenceNumber;
        queryFn().then((urls: any) => {
            if (myseq === sequenceNumber) {
                var val = omnibar.input.value;
                omnibar.detectAndInsertURLItem(val, urls);
                omnibar.listURLs(urls, false);
            }
        });
    };
    self.onOpen = function(arg: any) {
        if (arg) {
            omnibar.input.value = arg;
        }
        sequenceNumber = 0;
        queryAndList();
    };
    self.onInput = debounce(queryAndList, 200);
    self.onClose = function() {
        self.onInput.cancel();
    };

    self.onReset = function() {
        runtime.conf.historyMUOrder = !runtime.conf.historyMUOrder;
        queryFn().then((historyItems: any) => {
            if (runtime.conf.historyMUOrder) {
                historyItems = historyItems.sort(function(a: any, b: any) {
                    return b.visitCount - a.visitCount;
                });
            } else {
                historyItems = historyItems.sort(function(a: any, b: any) {
                    return b.lastVisitTime - a.lastVisitTime;
                });
            }
            omnibar.listURLs(historyItems, false);
        });
    };
    return self;
}

function OpenTabs(omnibar: any) {
    var self: any = {
        focusFirstCandidate: true,
    };

    var getTabsArgs: any = {};
    self.getResults = function () {
        omnibar.cachedPromise = new Promise(function(resolve, _reject) {
            getTabsArgs.tabsThreshold = Math.min(runtime.conf.tabsThreshold, Math.ceil(window.innerWidth / 26));
            RUNTIME('getTabs', getTabsArgs, function(response) {
                resolve(response.tabs);
            });
        });
    };
    self.onOpen = function(args: any) {
        if (args && args.action === "gather") {
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
            if (args && typeof(args.filter) === 'string') {
                getTabsArgs.filter = args.filter;
            }
        }
        self.getResults();
        self.onInput();
    };
    self.onInput = function() {
        omnibar.cachedPromise.then(function(cached: any) {
            var filtered = filterByTitleOrUrl(cached, omnibar.input.value, runtime.getCaseSensitive(omnibar.input.value));
            omnibar.listURLs(filtered, false);
        });
    };
    return self;
}

function CloseTabs(omnibar: any) {
    var self: any = {
        focusFirstCandidate: true,
    };

    self.onOpen = function() {
        self.prompt = `close tabs${separatorHtml}`;
        omnibar.cachedPromise = new Promise(function(resolve) {
            RUNTIME('getTabs', {queryInfo: {currentWindow: true}}, function(response) {
                resolve(response.tabs);
            });
        });
        self.onInput();
    };
    self.onInput = function() {
        omnibar.cachedPromise.then(function(cached: any) {
            var filtered = filterByTitleOrUrl(cached, omnibar.input.value, runtime.getCaseSensitive(omnibar.input.value));
            filtered.forEach(function(tab: any) {
                try {
                    var u = new URL(tab.url);
                    tab.url = u.origin + u.pathname;
                } catch (_e) {}
            });
            omnibar.listURLs(filtered, false);
        });
    };
    self.onEnter = function() {
        var items = omnibar.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li');
        var tabIds: number[] = [];
        items.forEach(function(li: any) {
            if ((li as any).uid && (li as any).uid[0] === 'T') {
                var parts = (li as any).uid.substr(1).split(":");
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

function OpenWindows(omnibar: any, front: any) {
    const self: any = {
        prompt: `Move current tab to window${separatorHtml}`
    };

    self.getResults = function () {
        omnibar.cachedPromise = new Promise(function(resolve, _reject) {
            RUNTIME('getWindows', {
                query: ''
            }, function(response) {
                resolve(response.windows);
            });
        });
    };
    self.onEnter = function() {
        const fi = omnibar.resultsDiv.querySelector('li.focused');
        let windowId = -1;
        if (fi && fi.windowId !== undefined) {
            windowId = fi.windowId;
        }
        RUNTIME('moveToWindow', { windowId });
        return true;
    };
    self.onOpen = function() {
        omnibar.input.placeholder = "Press enter without focusing an item to move to a new window.";
        self.getResults();
        self.onInput();
    };
    self.onInput = function() {
        omnibar.cachedPromise.then(function(cached: any) {
            if (cached.length === 0) {
                RUNTIME('moveToWindow', { windowId: -1 });
                front.hidePopup();
            }
            let filtered = cached;
            const query = omnibar.input.value;
            let rxp: RegExp | null = null;
            if (query && query.length) {
                rxp = regexFromString(query, runtime.getCaseSensitive(query), false);
                filtered = cached.filter(function(w: any) {
                    for (const t of w.tabs) {
                        if (rxp!.test(t.title) || rxp!.test(t.url)) {
                            return true;
                        }
                    }
                    return false;
                });
            }
            rxp = regexFromString(query, runtime.getCaseSensitive(query), true);
            omnibar.listResults(filtered, function(w: any) {
                const li = createElementWithContent('li');
                li.windowId = parseInt(w.id);
                li.classList.add('window');
                if (w.isPreviousChoice) {
                    li.classList.add('focused');
                }
                w.tabs.forEach((t: any) => {
                    const div = createElementWithContent('div', '', {class: "tab_in_window"});
                    div.appendChild(createElementWithContent('div', omnibar.highlight(rxp, t.title), {class: "title"}));
                    div.appendChild(createElementWithContent('div', omnibar.highlight(rxp, new URL(t.url).origin), {class: "url"}));
                    li.appendChild(div);
                });
                // set url so that we can copy all URls of tabs in this window.
                li.url = w.tabs.map((t: any) => {
                    return t.url;
                }).join("\n");
                return li;
            });
        });
    };
    return self;
}

function OpenVIMarks(omnibar: any) {
    var self: any = {
        focusFirstCandidate: true,
        prompt: `VIMarks${separatorHtml}`
    };

    self.onOpen = function() {
        var query = omnibar.input.value;
        var urls: any[] = [];
        RUNTIME('getSettings', {
            key: 'marks'
        }, function(response) {
            for (var m in response.settings.marks) {
                var markInfo = response.settings.marks[m];
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

function SearchEngine(omnibar: any, front: any) {
    var self: any = {};
    self.aliases = {};

    var _pendingRequest: ReturnType<typeof setTimeout> | undefined = undefined; // timeout ID
    function clearPendingRequest() {
        if (_pendingRequest) {
            clearTimeout(_pendingRequest);
            _pendingRequest = undefined;
        }
    }
    self.onOpen = function(arg: any) {
        Object.assign(self, self.aliases[arg]);
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
        var fi = omnibar.resultsDiv.querySelector('li.focused');
        if (fi && fi.query) {
            omnibar.input.value = fi.query;
        }
    };
    self.onEnter = function() {
        var fi = omnibar.resultsDiv.querySelector('li.focused'), url;
        if (fi) {
            url = fi.url || constructSearchURL(self.url, encodeURIComponent(fi.query || omnibar.input.value));
        } else {
            url = constructSearchURL(self.url, encodeURIComponent(omnibar.input.value));
        }
        RUNTIME("openLink", {
            tab: {
                tabbed: this.tabbed,
                active: this.activeTab
            },
            url: url
        });
        return this.activeTab;
    };
    function listSuggestions(suggestions: any) {
        omnibar.detectAndInsertURLItem(omnibar.input.value, suggestions);
        const query = encodeURIComponent(omnibar.input.value);
        var rxp = regexFromString(query, runtime.getCaseSensitive(query), true);
        omnibar.listResults(suggestions, function (w: any) {
            if (w.hasOwnProperty('html')) {
                return omnibar.createItemFromRawHtml(w);
            } else if (w.hasOwnProperty('url')) {
                return omnibar.createURLItem(w, rxp);
            } else {
                var li = createElementWithContent('li', `⌕ ${w}`);
                li.query = w;
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
            const requestUrl = constructSearchURL(self.suggestionURL, encodeURIComponent(omnibar.input.value));
            RUNTIME('request', {
                method: 'get',
                url: requestUrl
            }, function (resp) {
                front.contentCommand({
                    action: 'getSearchSuggestions',
                    url: self.suggestionURL,
                    query: omnibar.input.value,
                    requestUrl,
                    response: resp
                }, function(resp: any) {
                    resp = resp.data;
                    if (!Array.isArray(resp)) {
                        resp = [];
                    }
                    listSuggestions(resp);
                });
            });
        }, runtime.conf.omnibarSuggestionTimeout);
    };

    front._actions['addSearchAlias'] = function (message: any) {
        self.aliases[message.alias] = {
            prompt: '' + message.prompt + separatorHtml,
            url: message.url,
            suggestionURL: message.suggestionURL
        };
        const searchEngineIconStorageKey = `surfingkeys.searchEngineIcon.${message.prompt}`;
        const searchEngineIcon = localStorage.getItem(searchEngineIconStorageKey);
        if (searchEngineIcon) {
            self.aliases[message.alias].prompt = `<img src="${searchEngineIcon}" alt="${message.prompt}" style="width: 20px;" />`;
        } else if (front.topOrigin.startsWith("http")){
            let iconUrl;
            if (message.options?.favicon_url) {
              iconUrl = new URL(message.options.favicon_url);
            } else {
              iconUrl = new URL(message.url);
              iconUrl.pathname = "favicon.ico";
              iconUrl.search = "";
              iconUrl.hash = "";
            }
            RUNTIME('requestImage', {
                url: iconUrl.href,
            }, function(response) {
                if (response) {
                    localStorage.setItem(searchEngineIconStorageKey, response.text);
                    self.aliases[message.alias].prompt = `<img src="${response.text}" alt="${message.prompt}" style="width: 20px;" />`;
                }
            });
        }
    };
    front._actions['removeSearchAlias'] = function (message: any) {
        delete self.aliases[message.alias];
    };
    front._actions['getSearchAliases'] = function (message: any) {
        front.postMessage({
            aliases: self.aliases,
            toContent: true,
            id: message.id
        });
    };

    return self;
}

function Commands(omnibar: any, front: any) {
    var self: any = {
        focusFirstCandidate: false,
        prompt: ':',
    }, items: Record<string, any> = {};

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
            var candidates = response.settings.cmdHistory;
            if (candidates.length) {
                omnibar.listResults(candidates, function(c: any) {
                    var li = createElementWithContent('li', c);
                    li.cmd = c;
                    return li;
                });
            }
        });
    };

    self.onReset = self.onOpen;

    function highlightPositions(text: string, positions: number[]): string {
        if (!positions.length) return text;
        const posSet = new Set(positions);
        return text.split('').map((ch, i) =>
            posSet.has(i) ? `<span class=omnibar_highlight>${ch}</span>` : ch
        ).join('');
    }

    self.onInput = function() {
        var cmd = omnibar.input.value.trim();
        if (cmd === "") {
            self.onOpen();
            return;
        }

        type Scored = { key: string; score: number; positions: number[] };
        var scored: Scored[] = [];
        for (const key of Object.keys(items)) {
            const nameResult = fuzzyMatch(key, cmd);
            const annotationStr = getAnnotationString(items[key].annotation);
            const descResult = fuzzyMatch(annotationStr, cmd);
            if (nameResult.match || descResult.match) {
                const best = nameResult.score >= descResult.score ? nameResult : descResult;
                scored.push({
                    key,
                    score: best.score,
                    positions: nameResult.match ? nameResult.positions : [],
                });
            }
        }
        scored.sort((a, b) => b.score - a.score);

        if (scored.length) {
            const scoredMap = new Map(scored.map(s => [s.key, s]));
            omnibar.listResults(scored.map(s => s.key), function(c: any) {
                const annotationStr = getAnnotationString(items[c].annotation);
                const s = scoredMap.get(c)!;
                const highlighted = highlightPositions(htmlEncode(c), s.positions);
                var li = createElementWithContent('li', `<span>${highlighted}</span><span class=annotation>${htmlEncode(annotationStr)}</span>`);
                li.cmd = c;
                return li;
            });
        }
    };

    self.onTabKey = function() {
        omnibar.input.value = omnibar.resultsDiv.querySelector('li.focused').cmd;
    };

    self.onEnter = function() {
        var cmdline = omnibar.input.value;
        if (cmdline.length) {
            RUNTIME('updateInputHistory', { cmd: cmdline });
            var ret = !!execute(cmdline);
            omnibar.input.value = "";
            return ret;
        }
        return false;
    };

    function parseCommand(cmdline: any) {
        var cmdline = cmdline.trim();
        var tokens: string[] = [];
        var pendingToken = false;
        var part = '';
        for (var i = 0; i < cmdline.length; i++) {
            if (cmdline.charAt(i) === ' ' && !pendingToken) {
                tokens.push(part);
                part = '';
            } else {
                if (cmdline.charAt(i) === '\"') {
                    pendingToken = !pendingToken;
                } else {
                    part += cmdline.charAt(i);
                }
            }
        }
        tokens.push(part);
        return tokens;
    }

    function execute(cmdline: any) {
        var args = parseCommand(cmdline);
        var cmd = args.shift()!;
        if (items.hasOwnProperty(cmd)) {
            var meta = items[cmd];
            return meta.code.call(meta.code, args);
        } else {
            showBanner(`Unsupported command: ${cmdline}.`, 3000);
        }
    }

    front._actions['executeCommand'] = function (message: any) {
        execute(message.cmdline);
    };

    omnibar.command = function (cmd: any, annotation: any, jscode: any) {
        var cmd_code: any = {
            code: jscode
        };
        var ag = parseAnnotation({annotation: annotation, feature_group: 14});
        cmd_code.feature_group = ag.feature_group;
        cmd_code.annotation = ag.annotation;
        items[cmd] = cmd_code;
    };

    omnibar.listCommands = function(): Array<{ name: string; description: string }> {
        return Object.keys(items).map(k => ({
            name: k,
            description: getAnnotationString(items[k].annotation),
        }));
    };

    return self;
}

function PageEntities(omnibar: any, clipboard: any) {
    const ALIASES: Record<string, string> = { u: 'url', em: 'email', ip: 'ip', p: 'path', w: 'word' };
    const CATEGORY_WEIGHT: Record<string, number> = { url: 40, email: 30, ip: 20, path: 10, word: 0 };
    var self: any = {
        focusFirstCandidate: true,
        prompt: `extract${separatorHtml}`,
    };
    var _candidates: {text: string; category: string}[] = [];

    function parseQuery(raw: string): { text: string; category: string | null } {
        const m = raw.match(/(?:^|\s)([a-zA-Z]+)$/);
        if (m && ALIASES[m[1].toLowerCase()]) {
            return { text: raw.slice(0, m.index).trim(), category: ALIASES[m[1].toLowerCase()] };
        }
        return { text: raw, category: null };
    }

    function renderList(list: any[]) {
        omnibar.listResults(list, function(c: any) {
            var li = createElementWithContent('li',
                `<span class="sk_extract_cat">[${c.category}]</span> <span class="sk_extract_text">${htmlEncode(c.text)}</span>`);
            li.matchText = c.text;
            li.query = c.text;
            return li;
        });
    }

    self.onOpen = function(extra: any) {
        _candidates = extra || [];
        renderList(_candidates);
    };

    self.onInput = function() {
        const { text: query, category } = parseQuery(omnibar.input.value);
        var pool = category ? _candidates.filter(c => c.category === category) : _candidates;
        if (query === "") { renderList(pool); return; }
        const scored = pool.map(c => {
            const r = fuzzyMatch(c.text, query);
            return r.match ? { text: c.text, category: c.category, score: r.score + CATEGORY_WEIGHT[c.category] } : null;
        }).filter(Boolean) as any[];
        scored.sort((a, b) => b.score - a.score);
        renderList(scored);
    };

    self.onEnter = function() {
        var fi = omnibar.resultsDiv.querySelector('li.focused');
        if (fi && fi.matchText) {
            clipboard.write(fi.matchText);
            return true;
        }
        return false;
    };

    return self;
}

function OmniQuery(omnibar: any, front: any) {
    var self: any = {
        prompt: 'ǭ'
    };

    function onlyUnique(value: any, index: any, self: any) {
        return self.indexOf(value) === index;
    }
    var _words: any;
    self.onOpen = function(arg: any) {
        if (arg && (document as any).dictEnabled === undefined) {
            omnibar.input.value = arg;
            front.contentCommand({
                action: 'omnibar_query_entered',
                query: arg
            });
        }
        front.contentCommand({
            action: 'getPageText'
        }, function(message: any) {
            var splitRegex = /[^a-zA-Z]+/;
            _words = message.data.toLowerCase().split(splitRegex).filter(onlyUnique);
        });
    };

    self.onInput = function() {
        var iw = omnibar.input.value;
        var candidates = _words.filter(function(w: any) {
            return w.indexOf(iw) !== -1;
        });
        if (candidates.length) {
            omnibar.listResults(candidates, function(w: any) {
                return createElementWithContent('li', w);
            });
        }
    };

    self.onTabKey = function() {
        omnibar.input.value = omnibar.resultsDiv.querySelector('li.focused').innerText;
    };

    self.onEnter = function() {
        front.contentCommand({
            action: 'omnibar_query_entered',
            query: omnibar.input.value
        });
    };

    return self;
}

function OpenUserURLs(omnibar: any, front: any) {
    var self: any = {
        focusFirstCandidate: true,
        prompt: `UserURLs${separatorHtml}`
    };

    var _items: any;
    self.onOpen = function(args: any) {
        _items = args;
        self.onInput();
    };

    self.onInput = function() {
        var query = omnibar.input.value;
        var urls = [];

        urls = filterByTitleOrUrl(_items, query, runtime.getCaseSensitive(query));
        omnibar.listURLs(urls, false);
    };
    self.onEnter = function() {
        var fi = omnibar.resultsDiv.querySelector('li.focused');
        front.contentCommand({
            action: 'userURLs_entered',
            item: fi ? fi._item : { url: omnibar.input.value },
            tabbed: this.tabbed,
            ctrlKey: !this.activeTab,
            shiftKey: omnibar.tabbed ^ this.tabbed,
        });
        return this.activeTab;
    };
    return self;
}

export default createOmnibar;

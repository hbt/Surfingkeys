import { RUNTIME, dispatchSKEvent, runtime } from './runtime.js';
import KeyboardUtils from './keyboardUtils';
import {
    actionWithSelectionPreserved,
    getBrowserName,
    getCssSelectorsOfEditable,
    getLargeElements,
    getRealEdit,
    getTextNodePos,
    getWordUnderCursor,
    htmlEncode,
    setSanitizedContent,
    showBanner,
    showPopup,
    tabOpenLink,
    toggleQuote,
} from './utils.js';

export default function(api, clipboard, insert, normal, hints, visual, front, browser) {
    const {
        addSearchAlias,
        cmap,
        map,
        mapkey,
        imapkey,
        readText,
        vmapkey,
        searchSelectedWith,
    } = api;

    mapkey('[[', {
        short: "Click previous link",
        unique_id: "cmd_nav_previous_link",
        feature_group: 1,
        category: "navigation",
        description: "Click on the previous page link on current page",
        tags: ["navigation", "links", "previous"]
    }, hints.previousPage);
    mapkey(']]', {
        short: "Click next link",
        unique_id: "cmd_nav_next_link",
        feature_group: 1,
        category: "navigation",
        description: "Click on the next page link on current page",
        tags: ["navigation", "links", "next"]
    }, hints.nextPage);
    mapkey('T', '#3Choose a tab', function() {
        front.chooseTab();
    });
    mapkey(';G', '#3Group this tab', function() {
        front.groupTab();
    });
    mapkey('?', {
        short: "Show usage",
        unique_id: "cmd_show_usage",
        feature_group: 0,
        category: "help",
        description: "Display help showing all available keyboard shortcuts",
        tags: ["help", "usage", "keyboard"]
    }, function() {
        front.showUsage();
    });
    mapkey('Q', {
        short: "Open omnibar for translation",
        unique_id: "cmd_omnibar_translate",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar to translate word under cursor",
        tags: ["omnibar", "translation", "query"]
    }, function() {
        front.openOmniquery({query: getWordUnderCursor(), style: "opacity: 0.8;"});
    });
    imapkey("<Ctrl-'>", {
        short: "Toggle quotes in input",
        unique_id: "cmd_insert_toggle_quotes",
        feature_group: 15,
        category: "insert",
        description: "Toggle quotes around selected text in input field",
        tags: ["insert", "input", "editing"]
    }, toggleQuote);
    function openVim(useNeovim) {
        var element = getRealEdit();
        element.blur();
        insert.exit();
        front.showEditor(element, null, null, useNeovim);
    }
    imapkey('<Ctrl-i>', {
        short: "Open vim editor for input",
        unique_id: "cmd_insert_vim_editor",
        feature_group: 15,
        category: "insert",
        description: "Open vim editor to edit content of current input field",
        tags: ["insert", "input", "vim"]
    }, function() {
        openVim(false);
    });
    const browserName = getBrowserName();
    if (browserName === "Chrome") {
        imapkey('<Ctrl-Alt-i>', {
            short: "Open neovim for input",
            unique_id: "cmd_insert_neovim_editor",
            feature_group: 15,
            category: "insert",
            description: "Open neovim editor to edit content of current input field",
            tags: ["insert", "input", "neovim"]
        }, function() {
            openVim(true);
        });
        mapkey(';s', 'Toggle PDF viewer from SurfingKeys', function() {
            var pdfUrl = window.location.href;
            if (pdfUrl.indexOf(chrome.runtime.getURL("/pages/pdf_viewer.html")) === 0) {
                const filePos = window.location.search.indexOf("=") + 1;
                pdfUrl = window.location.search.substr(filePos);
                RUNTIME('updateSettings', {
                    settings: {
                        "noPdfViewer": 1
                    }
                }, (resp) => {
                    window.location.replace(pdfUrl);
                });
            } else {
                if (document.querySelector("EMBED") && document.querySelector("EMBED").getAttribute("type") === "application/pdf") {
                    RUNTIME('updateSettings', {
                        settings: {
                            "noPdfViewer": 0
                        }
                    }, (resp) => {
                        window.location.replace(pdfUrl);
                    });
                } else {
                    RUNTIME('getSettings', {
                        key: 'noPdfViewer'
                    }, function(resp) {
                        const info = resp.settings.noPdfViewer ? "PDF viewer enabled." : "PDF viewer disabled.";
                        RUNTIME('updateSettings', {
                            settings: {
                                "noPdfViewer": !resp.settings.noPdfViewer
                            }
                        }, (r) => {
                            showBanner(info);
                        });
                    });
                }
            }
        });
    }

    mapkey(";ql", '#0Show last action', function() {
        showPopup(htmlEncode(runtime.conf.lastKeys.map(function(k) {
            return KeyboardUtils.decodeKeystroke(k);
        }).join(' → ')));
    }, {repeatIgnore: true});

    mapkey('gi', {
        short: "Go to first edit box",
        unique_id: "cmd_hints_first_input",
        feature_group: 1,
        category: "hints",
        description: "Focus the first input field on the page",
        tags: ["hints", "input", "focus"]
    }, function() {
        hints.createInputLayer();
    });
    mapkey('i', {
        short: "Go to edit box",
        unique_id: "cmd_hints_select_input",
        feature_group: 1,
        category: "hints",
        description: "Show hints to select and focus an input field",
        tags: ["hints", "input", "selection"]
    }, function() {
        hints.create(getCssSelectorsOfEditable(), hints.dispatchMouseClick);
    });
    mapkey('I', {
        short: "Go to edit box with vim",
        unique_id: "cmd_hints_input_vim",
        feature_group: 1,
        category: "hints",
        description: "Show hints to select an input and open it in vim editor",
        tags: ["hints", "input", "vim"]
    }, function() {
        hints.create(getCssSelectorsOfEditable(), function(element) {
            front.showEditor(element);
        });
    });
    mapkey('L', {
        short: "Regional hints mode",
        unique_id: "cmd_hints_regional",
        feature_group: 1,
        category: "hints",
        description: "Enter hints mode for large page regions",
        tags: ["hints", "regional", "navigation"]
    }, function() {
        hints.create(getLargeElements(), (e) => { }, { regionalHints: true });
    });

    mapkey('zv', {
        short: "Enter visual mode, and select whole element",
        unique_id: "cmd_visual_select_element",
        feature_group: 9,
        category: "visual",
        description: "Enter visual mode and select entire element",
        tags: ["visual", "element", "selection"]
    }, function() {
        visual.toggle("z");
    });
    mapkey('yv', '#7Yank text of an element', function() {
        hints.create(runtime.conf.textAnchorPat, function (element) {
            clipboard.write(element[1] === 0 ? element[0].data.trim() : element[2].trim());
        });
    });
    mapkey('ymv', '#7Yank text of multiple elements', function() {
        var textToYank = [];
        hints.create(runtime.conf.textAnchorPat, function (element) {
            textToYank.push(element[1] === 0 ? element[0].data.trim() : element[2].trim());
            clipboard.write(textToYank.join('\n'));
        }, { multipleHits: true });
    });

    mapkey('V', {
        short: "Restore visual mode",
        unique_id: "cmd_visual_restore",
        feature_group: 9,
        category: "visual",
        description: "Restore previous visual mode selection",
        tags: ["visual", "restore", "selection"]
    }, function() {
        visual.restore();
    });
    mapkey('*', {
        short: "Find selected text in current page",
        unique_id: "cmd_visual_find_selected",
        feature_group: 9,
        category: "visual",
        description: "Search for currently selected text in the page",
        tags: ["visual", "search", "find"]
    }, function() {
        visual.star();
        visual.toggle();
    });

    vmapkey('<Ctrl-u>', {
        short: "Backward 20 lines",
        unique_id: "cmd_visual_backward_lines",
        feature_group: 9,
        category: "visual",
        description: "Move selection backward 20 lines in visual mode",
        tags: ["visual", "navigation", "backward"]
    }, function() {
        visual.feedkeys('20k');
    });
    vmapkey('<Ctrl-d>', {
        short: "Forward 20 lines",
        unique_id: "cmd_visual_forward_lines",
        feature_group: 9,
        category: "visual",
        description: "Move selection forward 20 lines in visual mode",
        tags: ["visual", "navigation", "forward"]
    }, function() {
        visual.feedkeys('20j');
    });

    mapkey('m', {
        short: "Add vim-like mark",
        unique_id: "cmd_marks_add",
        feature_group: 10,
        category: "marks",
        description: "Save current URL as a vim-like mark for quick access",
        tags: ["marks", "vim", "save"]
    }, normal.addVIMark);
    mapkey("'", {
        short: "Jump to vim mark",
        unique_id: "cmd_marks_jump",
        feature_group: 10,
        category: "marks",
        description: "Jump to a saved vim-like mark in current tab",
        tags: ["marks", "vim", "navigation"]
    }, normal.jumpVIMark);
    mapkey("<Ctrl-'>", {
        short: "Jump to vim mark in new tab",
        unique_id: "cmd_marks_jump_new_tab",
        feature_group: 10,
        category: "marks",
        description: "Jump to a saved vim-like mark in a new tab",
        tags: ["marks", "vim", "tab"]
    }, function(mark) {
        normal.jumpVIMark(mark);
    });

    mapkey('w', {
        short: "Switch frames",
        unique_id: "cmd_frame_switch",
        feature_group: 2,
        category: "frames",
        description: "Switch focus between page frames and iframes",
        tags: ["frames", "iframe", "navigation"]
    }, function() {
        // ensure frontend ready so that ui related actions can be available in iframes.
        dispatchSKEvent('ensureFrontEnd');
        if (window === top) {
            hints.create("iframe", function(element) {
                element.scrollIntoView({
                    behavior: 'auto',
                    block: 'center',
                    inline: 'center'
                });
                normal.highlightElement(element);
                element.contentWindow.focus();
            }).then((hintsTotal) => {
                if (hintsTotal === 0) {
                    normal.rotateFrame();
                }
            });
        } else {
            normal.rotateFrame();
        }
    });

    mapkey('yg', '#7Capture current page', function() {
        front.toggleStatus(false);
        setTimeout(function() {
            RUNTIME('captureVisibleTab', null, function(response) {
                front.toggleStatus(true);
                showPopup("<img src='{0}' />".format(response.dataUrl));
            });
        }, 500);
    });

    mapkey('gu', {
        short: "Go up one path",
        unique_id: "cmd_nav_url_up",
        feature_group: 4,
        category: "navigation",
        description: "Navigate up one level in the URL path hierarchy",
        tags: ["navigation", "url", "path"]
    }, function() {
        var pathname = location.pathname;
        if (pathname.length > 1) {
            pathname = pathname.endsWith('/') ? pathname.substr(0, pathname.length - 1) : pathname;
            var last = pathname.lastIndexOf('/'), repeats = RUNTIME.repeats;
            RUNTIME.repeats = 1;
            while (repeats-- > 1) {
                var p = pathname.lastIndexOf('/', last - 1);
                if (p === -1) {
                    break;
                } else {
                    last = p;
                }
            }
            pathname = pathname.substr(0, last);
        }
        window.location.href = location.origin + pathname;
    });

    mapkey(';m', {
        short: "Mouse out last element",
        unique_id: "cmd_hints_mouseout_last",
        feature_group: 1,
        category: "hints",
        description: "Trigger mouseout event on the last hinted element",
        tags: ["hints", "mouse", "event"]
    }, function() {
        hints.mouseoutLastElement();
    });

    mapkey(';pp', {
        short: "Paste html on page",
        unique_id: "cmd_paste_html",
        feature_group: 7,
        category: "clipboard",
        description: "Replace current page content with HTML from clipboard",
        tags: ["clipboard", "paste", "html"]
    }, function() {
        clipboard.read(function(response) {
            document.documentElement.removeAttributes();
            document.body.removeAttributes();
            setSanitizedContent(document.head, "<title>" + new Date() +" updated by Surfingkeys</title>");
            setSanitizedContent(document.body, response.data);
        });
    });

    function openGoogleTranslate() {
        if (window.getSelection().toString()) {
            searchSelectedWith('https://translate.google.com/?hl=en#auto/en/', false, false, '');
        } else {
            tabOpenLink("https://translate.google.com/translate?js=n&sl=auto&tl=zh-CN&u=" + window.location.href);
        }
    }
    mapkey(';t', 'Translate selected text with google', () => {
        if (chrome.surfingkeys) {
            chrome.surfingkeys.translateCurrentPage();
        } else {
            openGoogleTranslate();
        }
    });
    vmapkey('t', {
        short: "Translate selected text with google",
        unique_id: "cmd_visual_translate",
        feature_group: 9,
        category: "visual",
        description: "Translate selected text using Google Translate",
        tags: ["visual", "translation", "google"]
    }, openGoogleTranslate);

    mapkey('O', {
        short: "Open detected links",
        unique_id: "cmd_nav_open_detected_link",
        feature_group: 1,
        category: "navigation",
        description: "Open URLs detected in text content",
        tags: ["navigation", "links", "detection"]
    }, function() {
        hints.create(runtime.conf.clickablePat, function(element) {
            window.location.assign(element[2]);
        }, {statusLine: "Open detected links from text"});
    });

    mapkey(".", '#0Repeat last action', function() {
        // lastKeys in format: <keys in normal mode>[,(<mode name>\t<keys in this mode>)*], examples
        // ['se']
        // ['f', 'Hints\tBA']
        const lastKeys = runtime.conf.lastKeys;
        normal.feedkeys(lastKeys[0]);
        var modeKeys = lastKeys.slice(1);
        for (var i = 0; i < modeKeys.length; i++) {
            var modeKey = modeKeys[i].split('\t');
            if (modeKey[0] === 'Hints') {
                function closureWrapper() {
                    var hintKeys = modeKey[1];
                    return function() {
                        hints.feedkeys(hintKeys);
                    };
                }
                setTimeout(closureWrapper(), 120 + i*100);
            }
        }
    }, {repeatIgnore: true});

    mapkey("f", {
        short: "Open link",
        unique_id: "cmd_hints_open_link",
        feature_group: 1,
        category: "hints",
        description: "Show hints to click on links and interactive elements",
        tags: ["hints", "link", "click"]
    }, function() {
        hints.create("", hints.dispatchMouseClick);
    }, {repeatIgnore: true});

    mapkey("v", {
        short: "Toggle visual mode",
        unique_id: "cmd_visual_toggle",
        feature_group: 9,
        category: "visual",
        description: "Toggle visual mode for text selection",
        tags: ["visual", "mode", "selection"]
    }, function() {
        visual.toggle();
    }, {repeatIgnore: true});

    mapkey("n", {
        short: "Next found text",
        unique_id: "cmd_visual_next",
        feature_group: 9,
        category: "visual",
        description: "Jump to next occurrence of found text",
        tags: ["visual", "search", "next"]
    }, function() {
        visual.next(false);
    }, {repeatIgnore: true});

    mapkey("N", {
        short: "Previous found text",
        unique_id: "cmd_visual_previous",
        feature_group: 9,
        category: "visual",
        description: "Jump to previous occurrence of found text",
        tags: ["visual", "search", "previous"]
    }, function() {
        visual.next(true);
    }, {repeatIgnore: true});

    mapkey(";fs", {
        short: "Focus scrollable elements",
        unique_id: "cmd_hints_scrollable",
        feature_group: 1,
        category: "hints",
        description: "Show hints to focus elements with scrollable content",
        tags: ["hints", "scroll", "focus"]
    }, function() {
        hints.create(normal.refreshScrollableElements(), hints.dispatchMouseClick);
    });

    vmapkey("q", {
        short: "Translate word under cursor",
        unique_id: "cmd_visual_translate_word",
        feature_group: 9,
        category: "visual",
        description: "Show inline translation for word under cursor",
        tags: ["visual", "translation", "word"]
    }, function() {
        var w = getWordUnderCursor();
        browser.readText(w);
        var b = visual.getCursorPixelPos();
        front.performInlineQuery(w, {
            top: b.top,
            left: b.left,
            height: b.height,
            width: b.width
        }, function(pos, queryResult) {
            dispatchSKEvent("front", ['showBubble', pos, queryResult, true]);
        });
    });

    function getSentence(textNode, offset) {
        var sentence = "";

        actionWithSelectionPreserved(function(sel) {
            sel.setPosition(textNode, offset);
            sel.modify("extend", "backward", "sentence");
            sel.collapseToStart();
            sel.modify("extend", "forward", "sentence");

            sentence = sel.toString();
        });

        return sentence.replace(/\n/g, '');
    }

    mapkey("cq", {
        short: "Query word with hints",
        unique_id: "cmd_hints_query_word",
        feature_group: 7,
        category: "hints",
        description: "Show hints to select and query a word for translation",
        tags: ["hints", "query", "translation"]
    }, function() {
        hints.create(runtime.conf.textAnchorPat, function (element) {
            var word = element[2].trim().replace(/[^A-z].*$/, "");
            var b = getTextNodePos(element[0], element[1], element[2].length);
            front.performInlineQuery(word, {
                top: b.top,
                left: b.left,
                height: b.height,
                width: b.width
            }, function (pos, queryResult) {
                dispatchSKEvent("front", ['showBubble', pos, queryResult, false]);
            });
        });
    });


    map('g0', ':feedkeys 99E', 0, "#3Go to the first tab");
    map('g$', ':feedkeys 99R', 0, "#3Go to the last tab");
    mapkey('zr', '#3zoom reset', function() {
        RUNTIME('setZoom', {
            zoomFactor: 0
        });
    });
    mapkey('zi', '#3zoom in', function() {
        RUNTIME('setZoom', {
            zoomFactor: 0.1
        });
    });
    mapkey('zo', '#3zoom out', function() {
        RUNTIME('setZoom', {
            zoomFactor: -0.1
        });
    });

    map('ZQ', ':quit');
    mapkey('ZZ', {
        short: "Save session and quit",
        unique_id: "cmd_session_save_quit",
        feature_group: 5,
        category: "session",
        description: "Save current session and close all tabs",
        tags: ["session", "save", "quit"]
    }, function() {
        RUNTIME('createSession', {
            name: 'LAST',
            quitAfterSaved: true
        });
    });
    mapkey('ZR', {
        short: "Restore last session",
        unique_id: "cmd_session_restore",
        feature_group: 5,
        category: "session",
        description: "Restore previously saved session",
        tags: ["session", "restore", "open"]
    }, function() {
        RUNTIME('openSession', {
            name: 'LAST'
        });
    });
    map('u', 'e');
    mapkey('af', {
        short: "Open link in active tab",
        unique_id: "cmd_hints_link_active_tab",
        feature_group: 1,
        category: "hints",
        description: "Show hints to open link in a new active tab",
        tags: ["hints", "link", "tab"]
    }, function() {
        hints.create("", hints.dispatchMouseClick, {tabbed: true, active: true});
    });
    mapkey('gf', {
        short: "Open link in background tab",
        unique_id: "cmd_hints_link_background_tab",
        feature_group: 1,
        category: "hints",
        description: "Show hints to open link in a new background tab",
        tags: ["hints", "link", "background"]
    }, function() {
        hints.create("", hints.dispatchMouseClick, {tabbed: true, active: false});
    });
    mapkey('cf', {
        short: "Open multiple links",
        unique_id: "cmd_hints_multiple_links",
        feature_group: 1,
        category: "hints",
        description: "Show hints to open multiple links in new tabs",
        tags: ["hints", "link", "multiple"]
    }, function() {
        hints.create("", hints.dispatchMouseClick, {multipleHits: true});
    });
    map('C', 'gf');
    mapkey('<Ctrl-h>', {
        short: "Mouse over elements",
        unique_id: "cmd_hints_mouseover",
        feature_group: 1,
        category: "hints",
        description: "Show hints to trigger mouseover event on elements",
        tags: ["hints", "mouse", "event"]
    }, function() {
        hints.create("", (element, event) => {
            if (chrome.surfingkeys) {
                const r = element.getClientRects()[0];
                chrome.surfingkeys.sendMouseEvent(2, Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2), 0);
            } else {
                hints.dispatchMouseClick(element, event);
            }
        }, {mouseEvents: ["mouseover"]});
    });
    mapkey('<Ctrl-j>', {
        short: "Mouse out elements",
        unique_id: "cmd_hints_mouseout",
        feature_group: 1,
        category: "hints",
        description: "Show hints to trigger mouseout event on elements",
        tags: ["hints", "mouse", "event"]
    }, function() {
        hints.create("", hints.dispatchMouseClick, {mouseEvents: ["mouseout"]});
    });
    mapkey('ya', '#7Copy a link URL to the clipboard', function() {
        hints.create('*[href]', function(element) {
            clipboard.write(element.href);
        });
    });
    mapkey('yma', '#7Copy multiple link URLs to the clipboard', function() {
        var linksToYank = [];
        hints.create('*[href]', function(element) {
            linksToYank.push(element.href);
            clipboard.write(linksToYank.join('\n'));
        }, {multipleHits: true});
    });
    function getTableColumnHeads() {
        var tds = [];
        document.querySelectorAll("table").forEach(function(t) {
            var tr = t.querySelector("tr");
            if (tr) {
                tds.push(...tr.children);
            }
        });
        return tds;
    }
    mapkey('yc', '#7Copy a column of a table', function() {
        hints.create(getTableColumnHeads(), function(element) {
            var column = Array.from(element.closest("table").querySelectorAll("tr")).map(function(tr) {
                return tr.children.length > element.cellIndex ? tr.children[element.cellIndex].innerText : "";
            });
            clipboard.write(column.join("\n"));
        });
    });
    mapkey('ymc', '#7Copy multiple columns of a table', function() {
        var rows = null;
        hints.create(getTableColumnHeads(), function(element) {
            var column = Array.from(element.closest("table").querySelectorAll("tr")).map(function(tr) {
                return tr.children.length > element.cellIndex ? tr.children[element.cellIndex].innerText : "";
            });
            if (!rows) {
                rows = column;
            } else {
                column.forEach(function(c, i) {
                    rows[i] += "\t" + c;
                });
            }
            clipboard.write(rows.join("\n"));
        }, {multipleHits: true});
    });
    mapkey('yq', '#7Copy pre text', function() {
        hints.create("pre", function(element) {
            clipboard.write(element.innerText);
        });
    });

    map('<Ctrl-i>', 'I');
    cmap('<ArrowDown>', '<Ctrl-n>');
    cmap('<ArrowUp>', '<Ctrl-p>');
    mapkey('q', {
        short: "Click image or button",
        unique_id: "cmd_hints_image_button",
        feature_group: 1,
        category: "hints",
        description: "Show hints to click on images or buttons",
        tags: ["hints", "image", "button"]
    }, function() {
        hints.create("img, button", hints.dispatchMouseClick);
    });
    mapkey('<Alt-p>', '#3pin/unpin current tab', function() {
        RUNTIME("togglePinTab");
    });
    mapkey('<Alt-m>', '#3mute/unmute current tab', function() {
        RUNTIME("muteTab");
    });
    mapkey('B', {
        short: "Tab history back",
        unique_id: "cmd_nav_tab_history_back",
        feature_group: 4,
        category: "navigation",
        description: "Go back one step in tab-specific history",
        tags: ["navigation", "history", "back"]
    }, function() {
        RUNTIME("historyTab", {backward: true});
    }, {repeatIgnore: true});
    mapkey('F', {
        short: "Tab history forward",
        unique_id: "cmd_nav_tab_history_forward",
        feature_group: 4,
        category: "navigation",
        description: "Go forward one step in tab-specific history",
        tags: ["navigation", "history", "forward"]
    }, function() {
        RUNTIME("historyTab", {backward: false});
    }, {repeatIgnore: true});
    mapkey('<Ctrl-6>', {
        short: "Go to last used tab",
        unique_id: "cmd_nav_last_tab",
        feature_group: 4,
        category: "navigation",
        description: "Switch to the previously focused tab",
        tags: ["navigation", "tabs", "history"]
    }, function() {
        RUNTIME("goToLastTab");
    });
    mapkey('gT', '#4Go to first activated tab', function() {
        RUNTIME("historyTab", {index: 0});
    }, {repeatIgnore: true});
    mapkey('gt', '#4Go to last activated tab', function() {
        RUNTIME("historyTab", {index: -1});
    }, {repeatIgnore: true});
    mapkey('gp', '#4Go to the playing tab', function() {
        RUNTIME('getTabs', { queryInfo: {audible: true}}, response => {
            if (response.tabs?.at(0)) {
                const tab = response.tabs[0];
                RUNTIME('focusTab', {
                    windowId: tab.windowId,
                    tabId: tab.id
                });
            }
        });
    }, { repeatIgnore: true });
    mapkey('S', {
        short: "Page history back",
        unique_id: "cmd_nav_history_back",
        feature_group: 4,
        category: "navigation",
        description: "Go back one page in browser history",
        tags: ["navigation", "history", "back"]
    }, function() {
        history.go(-1);
    }, {repeatIgnore: true});
    mapkey('D', {
        short: "Page history forward",
        unique_id: "cmd_nav_history_forward",
        feature_group: 4,
        category: "navigation",
        description: "Go forward one page in browser history",
        tags: ["navigation", "history", "forward"]
    }, function() {
        history.go(1);
    }, {repeatIgnore: true});
    mapkey('r', {
        short: "Reload page",
        unique_id: "cmd_nav_reload",
        feature_group: 4,
        category: "navigation",
        description: "Reload the current page from cache",
        tags: ["navigation", "reload", "refresh"]
    }, function() {
        RUNTIME("reloadTab", { nocache: false });
    });
    mapkey('oi', {
        short: "Open incognito window",
        unique_id: "cmd_nav_incognito",
        feature_group: 8,
        category: "navigation",
        description: "Open current URL in a new incognito window",
        tags: ["navigation", "incognito", "privacy"]
    }, function() {
        RUNTIME('openIncognito', {
            url: window.location.href
        });
    });

    mapkey('H', {
        short: "Open tab URLs omnibar",
        unique_id: "cmd_omnibar_tab_urls",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar showing URLs from open tabs",
        tags: ["omnibar", "tabs", "urls"]
    }, function() {
        front.openOmnibar({type: "TabURLs"});
    });
    mapkey('om', {
        short: "Open vim marks omnibar",
        unique_id: "cmd_omnibar_vim_marks",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar to select from saved vim-like marks",
        tags: ["omnibar", "marks", "vim"]
    }, function() {
        front.openOmnibar({type: "VIMarks"});
    });
    mapkey(':', {
        short: "Open commands omnibar",
        unique_id: "cmd_omnibar_commands",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar to execute SurfingKeys commands",
        tags: ["omnibar", "commands", "execute"]
    }, function() {
        front.openOmnibar({type: "Commands"});
    });
    mapkey('A', {
        short: "Open LLM chat",
        unique_id: "cmd_omnibar_llm_chat",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar for LLM chat interface",
        tags: ["omnibar", "llm", "ai"]
    }, function() {
        front.openOmnibar({type: "LLMChat"});
    });
    vmapkey('A', {
        short: "Open llm chat",
        unique_id: "cmd_visual_llm_chat",
        feature_group: 8,
        category: "visual",
        description: "Open LLM chat with selected text as context",
        tags: ["visual", "llm", "ai"]
    }, function() {
        const sel = window.getSelection().toString();
        front.openOmnibar({type: "LLMChat", extra: {
            system: sel
        }});
    });
    mapkey('yi', '#7Yank text of an input', function() {
        hints.create("input, textarea, select", function(element) {
            clipboard.write(element.value);
        });
    });
    mapkey('x', '#3Close current tab', function() {
        RUNTIME("closeTab");
    });
    mapkey(';w', {
        short: "Focus top window",
        unique_id: "cmd_frame_focus_top",
        feature_group: 2,
        category: "frames",
        description: "Focus the top-level window from an iframe",
        tags: ["frames", "window", "focus"]
    }, function() {
        top.focus();
    });
    mapkey('cc', {
        short: "Open selected link",
        unique_id: "cmd_nav_open_clipboard",
        feature_group: 7,
        category: "navigation",
        description: "Open selected text or clipboard content as URL",
        tags: ["navigation", "clipboard", "link"]
    }, function() {
        if (window.getSelection().toString()) {
            tabOpenLink(window.getSelection().toString());
        } else {
            clipboard.read(function(response) {
                tabOpenLink(response.data);
            });
        }
    });
    mapkey(';cq', '#7Clear all URLs in queue to be opened', function() {
        RUNTIME('clearQueueURLs');
    });
    mapkey('ys', "#7Copy current page's source", function() {
        var aa = document.documentElement.cloneNode(true);
        clipboard.write(aa.outerHTML);
    });
    mapkey('yj', "#7Copy current settings", function() {
        RUNTIME('getSettings', {
            key: "RAW"
        }, function(response) {
            clipboard.write(JSON.stringify(response.settings, null, 4));
        });
    });
    mapkey(';pj', {
        short: "Restore settings from clipboard",
        unique_id: "cmd_paste_settings",
        feature_group: 7,
        category: "clipboard",
        description: "Restore SurfingKeys settings from JSON in clipboard",
        tags: ["clipboard", "paste", "settings"]
    }, function() {
        clipboard.read(function(response) {
            RUNTIME('updateSettings', {
                settings: JSON.parse(response.data.trim())
            });
        });
    });
    mapkey('yt', '#3Duplicate current tab', function() {
        RUNTIME("duplicateTab");
    });
    mapkey('yT', '#3Duplicate current tab in background', function() {
        RUNTIME("duplicateTab", {active: false});
    });
    mapkey('yy', "#7Copy current page's URL", function() {
        var url = window.location.href;
        if (url.indexOf(chrome.runtime.getURL("/pages/pdf_viewer.html")) === 0) {
            const filePos = window.location.search.indexOf("=") + 1;
            url = window.location.search.substr(filePos);
        }
        clipboard.write(url);
    });
    mapkey('yY', "#7Copy all tabs's url", function() {
        RUNTIME('getTabs', null, function (response) {
            clipboard.write(response.tabs.map(tab => tab.url).join('\n'));
        });
    });
    mapkey('yh', "#7Copy current page's host", function() {
        var url = new URL(window.location.href);
        clipboard.write(url.host);
    });
    mapkey('yl', "#7Copy current page's title", function() {
        clipboard.write(document.title);
    });
    mapkey('yQ', '#7Copy all query history of OmniQuery.', function() {
        RUNTIME('getSettings', {
            key: 'OmniQueryHistory'
        }, function(response) {
            clipboard.write(response.settings.OmniQueryHistory.join("\n"));
        });
    });

    function getFormData(form, format) {
        var formData = new FormData(form);
        if (format === "json") {
            var obj = {};

            formData.forEach(function (value, key) {
                if (obj.hasOwnProperty(key)) {
                    if (value.length) {
                        var p = obj[key];
                        if (p.constructor.name === "Array") {
                            p.push(value);
                        } else {
                            obj[key] = [];
                            if (p.length) {
                                obj[key].push(p);
                            }
                            obj[key].push(value);
                        }
                    }
                } else {
                    obj[key] = value;
                }
            });

            return obj;
        } else {
            return new URLSearchParams(formData).toString();
        }
    }
    function generateFormKey(form) {
        return (form.method || "get") + "::" + new URL(form.action).pathname;
    }
    mapkey('yf', '#7Copy form data in JSON on current page', function() {
        var fd = {};
        document.querySelectorAll('form').forEach(function(form) {
            fd[generateFormKey(form)] = getFormData(form, "json");
        });
        clipboard.write(JSON.stringify(fd, null, 4));
    });
    mapkey(';pf', {
        short: "Fill form from clipboard",
        unique_id: "cmd_paste_form",
        feature_group: 7,
        category: "clipboard",
        description: "Fill form fields with data from clipboard",
        tags: ["clipboard", "paste", "form"]
    }, function() {
        hints.create('form', function(element, event) {
            var formKey = generateFormKey(element);
            clipboard.read(function(response) {
                var forms = JSON.parse(response.data.trim());
                if (forms.hasOwnProperty(formKey)) {
                    var fd = forms[formKey];
                    element.querySelectorAll('input, textarea').forEach(function(ip) {
                        if (fd.hasOwnProperty(ip.name) && ip.type !== "hidden") {
                            if (ip.type === "radio") {
                                var op = element.querySelector(`input[name='${ip.name}'][value='${fd[ip.name}']`);
                                if (op) {
                                    op.checked = true;
                                }
                            } else if (Array.isArray(fd[ip.name])) {
                                element.querySelectorAll(`input[name='${ip.name}']`).forEach(function(ip) {
                                    ip.checked = false;
                                });
                                var vals = fd[ip.name];
                                vals.forEach(function(v) {
                                    var op = element.querySelector(`input[name='${ip.name}'][value='${v}']`);
                                    if (op) {
                                        op.checked = true;
                                    }
                                });
                            } else if (typeof(fd[ip.name]) === "string") {
                                ip.value = fd[ip.name];
                            }
                        }
                    });
                } else {
                    showBanner("No form data found for your selection from clipboard.");
                }
            });
        });
    });
    mapkey('yp', '#7Copy form data for POST on current page', function() {
        var aa = [];
        document.querySelectorAll('form').forEach(function(form) {
            var fd = {};
            fd[(form.method || "get") + "::" + form.action] = getFormData(form);
            aa.push(fd);
        });
        clipboard.write(JSON.stringify(aa, null, 4));
    });

    mapkey('g?', {
        short: "Remove query string",
        unique_id: "cmd_nav_remove_query",
        feature_group: 4,
        category: "navigation",
        description: "Reload page after removing query string from URL",
        tags: ["navigation", "url", "query"]
    }, function() {
        window.location.href = window.location.href.replace(/\?[^\?]*$/, '');
    });
    mapkey('g#', {
        short: "Remove hash fragment",
        unique_id: "cmd_nav_remove_hash",
        feature_group: 4,
        category: "navigation",
        description: "Reload page after removing hash fragment from URL",
        tags: ["navigation", "url", "hash"]
    }, function() {
        window.location.href = window.location.href.replace(/\#[^\#]*$/, '');
    });
    mapkey('gU', {
        short: "Go to URL root",
        unique_id: "cmd_nav_url_root",
        feature_group: 4,
        category: "navigation",
        description: "Navigate to the root of current URL (origin only)",
        tags: ["navigation", "url", "root"]
    }, function() {
        window.location.href = window.location.origin;
    });
    mapkey('gxt', '#3Close tab on left', function() {
        RUNTIME("closeTabLeft");
    });
    mapkey('gxT', '#3Close tab on right', function() {
        RUNTIME("closeTabRight");
    });
    mapkey('gx0', '#3Close all tabs on left', function() {
        RUNTIME("closeTabsToLeft");
    });
    mapkey('gx$', '#3Close all tabs on right', function() {
        RUNTIME("closeTabsToRight");
    });
    mapkey('gxx', '#3Close all tabs except current one', function() {
        RUNTIME("tabOnly");
    });
    mapkey('gxp', '#3Close playing tab', function() {
        RUNTIME("closeAudibleTab");
    });
    mapkey(';e', '#11Edit Settings', function() {
        tabOpenLink("/pages/options.html");
    });
    mapkey(';u', '#4Edit current URL with vim editor, and open in new tab', function() {
        front.showEditor(window.location.href, function(data) {
            tabOpenLink(data);
        }, 'url');
    });
    mapkey(';U', '#4Edit current URL with vim editor, and reload', function() {
        front.showEditor(window.location.href, function(data) {
            window.location.href = data;
        }, 'url');
    });

    addSearchAlias('g', 'google', 'https://www.google.com/search?q=', 's', 'https://www.google.com/complete/search?client=chrome-omni&gs_ri=chrome-ext&oit=1&cp=1&pgcl=7&q=', function(response) {
        var res = JSON.parse(response.text);
        return res[1];
    });
    addSearchAlias('d', 'duckduckgo', 'https://duckduckgo.com/?q=', 's', 'https://duckduckgo.com/ac/?q=', function(response) {
        var res = JSON.parse(response.text);
        return res.map(function(r){
            return r.phrase;
        });
    });
    addSearchAlias('b', 'baidu', 'https://www.baidu.com/s?wd=', 's', 'https://suggestion.baidu.com/su?cb=&wd=', function(response) {
        var res = response.text.match(/,s:\[("[^\]]+")]}/);
        return res ? res[1].replace(/"/g, '').split(",") : [];
    });

    addSearchAlias('e', 'wikipedia', 'https://en.wikipedia.org/wiki/', 's', 'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&formatversion=2&namespace=0&limit=40&search=', function(response) {
        return JSON.parse(response.text)[1];
    });
    addSearchAlias('w', 'bing', 'https://www.bing.com/search?setmkt=en-us&setlang=en-us&q=', 's', 'https://api.bing.com/osjson.aspx?query=', function(response) {
        var res = JSON.parse(response.text);
        return res[1];
    });
    addSearchAlias('s', 'stackoverflow', 'https://stackoverflow.com/search?q=');
    addSearchAlias('h', 'github', 'https://github.com/search?q=', 's', 'https://api.github.com/search/repositories?order=desc&q=', function(response) {
        var res = JSON.parse(response.text)['items'];
        return res ? res.map(function(r){
            return {
                title: r.description,
                url: r.html_url
            };
        }) : [];
    });
    addSearchAlias('y', 'youtube', 'https://www.youtube.com/results?search_query=', 's',
    'https://clients1.google.com/complete/search?client=youtube&ds=yt&callback=cb&q=', function(response) {
        var res = JSON.parse(response.text.substr(9, response.text.length-10));
        return res[1].map(function(d) {
            return d[0];
        });
    });

    const bn = getBrowserName();
    if (bn === "Firefox") {
        mapkey('on', '#3Open newtab', function() {
            tabOpenLink("about:blank");
        });
    } else if (bn === "Chrome") {
        mapkey('cp', {
            short: "Toggle proxy for site",
            unique_id: "cmd_proxy_toggle_site",
            feature_group: 13,
            category: "proxy",
            description: "Toggle proxy usage for current site's hostname",
            tags: ["proxy", "network", "toggle"]
        }, function() {
            var host = window.location.host.replace(/:\d+/,'');
            if (host && host.length) {
                RUNTIME('updateProxy', {
                    host: host,
                    operation: "toggle"
                });
            }
        });
        mapkey(';cp', {
            short: "Copy proxy info",
            unique_id: "cmd_proxy_copy_info",
            feature_group: 13,
            category: "proxy",
            description: "Copy current proxy configuration to clipboard as JSON",
            tags: ["proxy", "network", "clipboard"]
        }, function() {
            RUNTIME('getSettings', {
                key: ['proxyMode', 'proxy', 'autoproxy_hosts']
            }, function(response) {
                clipboard.write(JSON.stringify(response.settings, null, 4));
            });
        });
        mapkey(';ap', {
            short: "Apply proxy from clipboard",
            unique_id: "cmd_paste_proxy",
            feature_group: 13,
            category: "clipboard",
            description: "Apply proxy configuration from JSON in clipboard",
            tags: ["clipboard", "paste", "proxy"]
        }, function() {
            clipboard.read(function(response) {
                var proxyConf = JSON.parse(response.data);
                RUNTIME('updateProxy', {
                    operation: 'set',
                    host: proxyConf.autoproxy_hosts,
                    proxy: proxyConf.proxy,
                    mode: proxyConf.proxyMode
                });
            });
        });
        // create shortcuts for the command with different parameters
        map(';pa', ':setProxyMode always', 0, {
            short: "Set proxy mode always",
            unique_id: "cmd_proxy_mode_always",
            feature_group: 13,
            category: "proxy",
            description: "Set proxy mode to always use proxy for all sites",
            tags: ["proxy", "network", "mode"]
        });
        map(';pb', ':setProxyMode byhost', 0, {
            short: "Set proxy mode byhost",
            unique_id: "cmd_proxy_mode_byhost",
            feature_group: 13,
            category: "proxy",
            description: "Set proxy mode to use proxy based on hostname rules",
            tags: ["proxy", "network", "mode"]
        });
        map(';pd', ':setProxyMode direct', 0, {
            short: "Set proxy mode direct",
            unique_id: "cmd_proxy_mode_direct",
            feature_group: 13,
            category: "proxy",
            description: "Set proxy mode to direct connection without proxy",
            tags: ["proxy", "network", "mode"]
        });
        map(';ps', ':setProxyMode system', 0, {
            short: "Set proxy mode system",
            unique_id: "cmd_proxy_mode_system",
            feature_group: 13,
            category: "proxy",
            description: "Set proxy mode to use system proxy settings",
            tags: ["proxy", "network", "mode"]
        });
        map(';pc', ':setProxyMode clear', 0, {
            short: "Set proxy mode clear",
            unique_id: "cmd_proxy_mode_clear",
            feature_group: 13,
            category: "proxy",
            description: "Clear proxy configuration and disable proxy",
            tags: ["proxy", "network", "mode"]
        });
        mapkey('gr', '#14Read selected text or text from clipboard', function() {
            clipboard.read(function(response) {
                readText(window.getSelection().toString() || response.data, {verbose: true});
            });
        });
        vmapkey('gr', {
            short: "Read selected text",
            unique_id: "cmd_visual_read_text",
            feature_group: 9,
            category: "visual",
            description: "Read selected text aloud using text-to-speech",
            tags: ["visual", "tts", "accessibility"]
        }, function() {
            readText(window.getSelection().toString(), {verbose: true});
        });

        mapkey('on', '#3Open newtab', function() {
            RUNTIME('openNewtab');
        });
        mapkey('ga', {
            short: "Open Chrome About",
            unique_id: "cmd_chrome_about",
            feature_group: 12,
            category: "chrome",
            description: "Open Chrome about page showing version information",
            tags: ["chrome", "internal", "about"]
        }, function() {
            tabOpenLink("chrome://help/");
        });
        mapkey('gb', {
            short: "Open Chrome Bookmarks",
            unique_id: "cmd_chrome_bookmarks",
            feature_group: 12,
            category: "chrome",
            description: "Open Chrome bookmarks manager page",
            tags: ["chrome", "internal", "bookmarks"]
        }, function() {
            tabOpenLink("chrome://bookmarks/");
        });
        mapkey('gc', {
            short: "Open Chrome Cache",
            unique_id: "cmd_chrome_cache",
            feature_group: 12,
            category: "chrome",
            description: "Open Chrome cache viewer page",
            tags: ["chrome", "internal", "cache"]
        }, function() {
            tabOpenLink("chrome://cache/");
        });
        mapkey('gd', {
            short: "Open Chrome Downloads",
            unique_id: "cmd_chrome_downloads",
            feature_group: 12,
            category: "chrome",
            description: "Open Chrome downloads page",
            tags: ["chrome", "internal", "downloads"]
        }, function() {
            tabOpenLink("chrome://downloads/");
        });
        mapkey('gh', {
            short: "Open Chrome History",
            unique_id: "cmd_chrome_history",
            feature_group: 12,
            category: "chrome",
            description: "Open Chrome browsing history page",
            tags: ["chrome", "internal", "history"]
        }, function() {
            tabOpenLink("chrome://history/");
        });
        mapkey('gk', {
            short: "Open Chrome Cookies",
            unique_id: "cmd_chrome_cookies",
            feature_group: 12,
            category: "chrome",
            description: "Open Chrome cookies settings page",
            tags: ["chrome", "internal", "cookies"]
        }, function() {
            tabOpenLink("chrome://settings/cookies");
        });
        mapkey('ge', {
            short: "Open Chrome Extensions",
            unique_id: "cmd_chrome_extensions",
            feature_group: 12,
            category: "chrome",
            description: "Open Chrome extensions management page",
            tags: ["chrome", "internal", "extensions"]
        }, function() {
            tabOpenLink("chrome://extensions/");
        });
        mapkey('gn', {
            short: "Open Chrome Net Internals",
            unique_id: "cmd_chrome_net_internals",
            feature_group: 12,
            category: "chrome",
            description: "Open Chrome network internals diagnostic page",
            tags: ["chrome", "internal", "network"]
        }, function() {
            tabOpenLink("chrome://net-internals/#proxy");
        });
        mapkey(';i', {
            short: "Open Chrome Inspect",
            unique_id: "cmd_chrome_inspect",
            feature_group: 12,
            category: "chrome",
            description: "Open Chrome device inspection page for debugging",
            tags: ["chrome", "internal", "inspect"]
        }, function() {
            tabOpenLink("chrome://inspect/#devices");
        });
        mapkey(';v', '#11Open neovim', function() {
            tabOpenLink("/pages/neovim.html");
        });
    }

    mapkey('X', '#3Restore closed tab', function() {
        RUNTIME("openLast");
    });

    if (!getBrowserName().startsWith("Safari")) {
        mapkey('t', {
            short: "Open URL omnibar",
            unique_id: "cmd_omnibar_url",
            feature_group: 8,
            category: "omnibar",
            description: "Open omnibar to enter URL in new tab",
            tags: ["omnibar", "url", "navigation"]
        }, function() {
            front.openOmnibar({type: "URLs"});
        });
        mapkey('go', {
            short: "Open URL in current tab",
            unique_id: "cmd_omnibar_url_current",
            feature_group: 8,
            category: "omnibar",
            description: "Open omnibar to enter URL in current tab",
            tags: ["omnibar", "url", "navigation"]
        }, function() {
            front.openOmnibar({type: "URLs", tabbed: false});
        });
        mapkey('ox', {
            short: "Open recently closed omnibar",
            unique_id: "cmd_omnibar_recent_closed",
            feature_group: 8,
            category: "omnibar",
            description: "Open omnibar showing recently closed tabs",
            tags: ["omnibar", "history", "tabs"]
        }, function() {
            front.openOmnibar({type: "RecentlyClosed"});
        });
        mapkey('b', {
            short: "Open bookmarks omnibar",
            unique_id: "cmd_omnibar_bookmarks",
            feature_group: 8,
            category: "omnibar",
            description: "Open omnibar to select and open a bookmark",
            tags: ["omnibar", "bookmarks", "navigation"]
        }, function() {
            front.openOmnibar(({type: "Bookmarks"}));
        });
        mapkey('ab', {
            short: "Add bookmark omnibar",
            unique_id: "cmd_omnibar_add_bookmark",
            feature_group: 8,
            category: "omnibar",
            description: "Open omnibar to save current page to a bookmark folder",
            tags: ["omnibar", "bookmarks", "save"]
        }, function() {
            var page = {
                url: window.location.href,
                title: document.title
            };
            front.openOmnibar(({type: "AddBookmark", extra: page}));
        });
        mapkey('oh', {
            short: "Open history omnibar",
            unique_id: "cmd_omnibar_history",
            feature_group: 8,
            category: "omnibar",
            description: "Open omnibar to select URL from browser history",
            tags: ["omnibar", "history", "navigation"]
        }, function() {
            front.openOmnibar({type: "History"});
        });
        mapkey('W', {
            short: "Open windows omnibar",
            unique_id: "cmd_omnibar_windows",
            feature_group: 3,
            category: "omnibar",
            description: "Open omnibar to move tab to another window",
            tags: ["omnibar", "windows", "tabs"]
        }, function() {
            front.openOmnibar(({type: "Windows"}));
        });
        mapkey(';gt', '#3Gather filtered tabs into current window', function() {
            front.openOmnibar({type: "Tabs", extra: {
                action: "gather"
            }});
        });
        mapkey(';gw', '#3Gather all tabs into current window',  function() {
            RUNTIME("gatherWindows");
        });
        mapkey('<<', '#3Move current tab to left', function() {
            RUNTIME('moveTab', {
                step: -1
            });
        });
        mapkey('>>', '#3Move current tab to right', function() {
            RUNTIME('moveTab', {
                step: 1
            });
        });
        mapkey('yd', "#7Copy current downloading URL", function() {
            RUNTIME('getDownloads', {
                query: {state: "in_progress"}
            }, function(response) {
                var items = response.downloads.map(function(o) {
                    return o.url;
                });
                clipboard.write(items.join(','));
            });
        });
        mapkey('gs', {
            short: "View page source",
            unique_id: "cmd_chrome_view_source",
            feature_group: 12,
            category: "chrome",
            description: "View HTML source code of current page",
            tags: ["chrome", "source", "view"]
        }, function() {
            RUNTIME("viewSource", { tab: { tabbed: true }});
        });
        mapkey(';pm', '#11Preview markdown', function() {
            tabOpenLink("/pages/markdown.html");
        });
        mapkey(';di', {
            short: "Download image",
            unique_id: "cmd_hints_download_image",
            feature_group: 1,
            category: "hints",
            description: "Show hints to select and download an image",
            tags: ["hints", "download", "image"]
        }, function() {
            hints.create('img', function(element) {
                RUNTIME('download', {
                    url: element.src
                });
            });
        });
        mapkey(';j', {
            short: "Close downloads shelf",
            unique_id: "cmd_chrome_close_downloads_shelf",
            feature_group: 12,
            category: "chrome",
            description: "Close the downloads shelf at bottom of browser",
            tags: ["chrome", "downloads", "ui"]
        }, function() {
            RUNTIME("closeDownloadsShelf", {clearHistory: true});
        });
        mapkey(';dh', '#14Delete history older than 30 days', function() {
            RUNTIME('deleteHistoryOlderThan', {
                days: 30
            });
        });
        mapkey(';yh', '#14Yank histories', function() {
            RUNTIME('getHistory', {}, function(response) {
                clipboard.write(response.history.map(h => h.url).join("\n"));
            });
        });
        mapkey(';ph', {
            short: "Put histories from clipboard",
            unique_id: "cmd_paste_history",
            feature_group: 14,
            category: "clipboard",
            description: "Import browser history URLs from clipboard",
            tags: ["clipboard", "paste", "history"]
        }, function() {
            clipboard.read(function(response) {
                RUNTIME('addHistories', {history: response.data.split("\n")});
            });
        });
        mapkey(';db', '#14Remove bookmark for current page', function() {
            RUNTIME('removeBookmark');
        });
    }
}

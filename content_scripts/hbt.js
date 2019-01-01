var DOMUtils = {
    mouseEvent: function(type, element) {
        var events;
        switch (type) {
            case "hover":
                events = ["mouseover", "mouseenter"];
                break;
            case "unhover":
                events = ["mouseout", "mouseleave"];
                break;
            case "click":
                events = ["mouseover", "mousedown", "mouseup", "click"];
                break;
        }
        events.forEach(function(eventName) {
            var event = document.createEvent("MouseEvents");
            event.initMouseEvent(eventName, true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
            element.dispatchEvent(event);
        });
    },

    hasAttributes: function(node) {
        if (arguments.length < 2) return false;
        for (var i = 1; i < arguments.length; i++) {
            if (node.hasAttribute(arguments[i])) return true;
        }
        return false;
    },

    traverseDOM: function(root, accept) {
        var nodes = [root];
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            node = node.firstChild;
            while (node !== null) {
                nodes.push(node);
                node = node.nextSibling;
            }
        }
        nodes.shift();
        return nodes.filter(accept);
    },

    getLinkableElements: function() {
        var visible = function(node) {
            var cs = getComputedStyle(node, null);
            return cs.opacity !== "0" && cs.visibility === "visible" && cs.display !== "none";
        };
        return function() {
            return DOMUtils.traverseDOM(document.body, function(node) {
                if (node.nodeType !== Node.ELEMENT_NODE || !visible(node)) return false;
                switch (node.localName.toLowerCase()) {
                    case "a":
                    case "button":
                        return true;
                    default:
                        return DOMUtils.hasAttributes(node, "jsaction", "onclick");
                }
            });
        };
    },

    findFirstOf: function(array, callback) {
        for (var i = 0; i < array.length; i++) {
            if (callback(array[i], i, array)) return array[i];
        }
        return null;
    },
    compressArray: function(array) {
        var result = [];
        // faster than using [].filter
        for (var i = 0; i < array.length; i++) {
            if (array[i]) result.push(array[i]);
        }
        return result;
    },

    matchLocation: function(url, pattern) {
        // Uses @match syntax
        // See https://code.google.com/p/chromium/codesearch#chromium/src/extensions/common/url_pattern.h&sq=package:chromium
        if (typeof pattern !== "string" || !pattern.trim()) {
            return false;
        }
        var protocol = (pattern.match(/.*:\/\//) || [""])[0].slice(0, -2),
            hostname,
            path,
            pathMatch,
            hostMatch;
        url = new URL(url);
        if (/\*\*/.test(pattern)) {
            console.error('cVim Error: Invalid pattern: "%s"', pattern);
            return false;
        }
        if (!protocol.length) {
            console.error('cVim Error: Invalid protocol in pattern: "%s"', pattern);
            return false;
        }
        pattern = pattern.replace(/.*:\/\//, "");
        if (protocol !== "*:" && url.protocol !== protocol) {
            return false;
        }
        if (url.protocol !== "file:") {
            hostname = pattern.match(/^[^\/]+/g);
            if (!hostname) {
                console.error('cVim Error: Invalid host in pattern: "%s"', pattern);
                return false;
            }
            var origHostname = hostname;
            hostname = hostname[0].replace(/([.])/g, "\\$1").replace(/\*/g, ".*");
            hostMatch = url.hostname.match(new RegExp(hostname, "i"));
            if (!hostMatch || hostMatch[0].length !== url.hostname.length) {
                return false;
            }
            pattern = pattern.slice(origHostname[0].length);
        }
        if (pattern.length) {
            path = pattern.replace(/([.&\\\/\(\)\[\]!?])/g, "\\$1").replace(/\*/g, ".*");
            pathMatch = url.pathname.match(new RegExp(path));
            if (!pathMatch || pathMatch[0].length !== url.pathname.length) {
                return false;
            }
        }
        return true;
    },
    isSubmittable: function(element) {
        if (!element) {
            return false;
        }
        if (element.localName !== "input") return false;
        if (element.hasAttribute("submit")) return true;
        while ((element = element.parentElement)) {
            if (element.localName === "form") return true;
        }
        return false;
    },

    /**
     * Checks if an element is visible (not necessarily on-screen)
     */
    isVisible: function(element) {
        if (!(element instanceof Element)) return false;
        return (
            element.offsetParent &&
            !element.disabled &&
            element.getAttribute("type") !== "hidden" &&
            getComputedStyle(element).visibility !== "hidden" &&
            element.getAttribute("display") !== "none"
        );
    },

    isEditable: function(element) {
        if (!element) {
            return false;
        }
        if (element.localName === "textarea" || element.localName === "select" || element.hasAttribute("contenteditable")) return true;
        if (element.localName !== "input") return false;
        var type = element.getAttribute("type");
        switch (type) {
            case "button":
            case "checkbox":
            case "color":
            case "file":
            case "hidden":
            case "image":
            case "radio":
            case "reset":
            case "submit":
            case "week":
                return false;
        }
        return true;
    }
};

var InsertUtils = (function() {
    var self = {};
    self.selection = document.getSelection();
    function modify() {
        if (arguments.length === 3) {
            self.selection.modify.apply(self.selection, arguments);
            return;
        }
        self.selection.modify.bind(self.selection, self.selection.type === "Range" ? "extend" : "move").apply(null, arguments);
    }

    function deleteSelection() {
        if (self.selection.type === "Range" && self.selection.toString().length !== 0) {
            document.execCommand("delete", false, 0);
            return true;
        }
        return false;
    }
    self.deleteWord = function() {
        self.selection = document.getSelection();
        modify("extend", "left", "word");
        deleteSelection();
    };
    return self;
})();

let _commandsIndexedByAnnotation = new Map();
class MyCustomMapping {
    static get acmds() {
        return _commandsIndexedByAnnotation;
    }

    static set acmds(v) {
        return (_commandsIndexedByAnnotation = v);
    }

    init() {
        function mapCommandsByAnnotations(modes) {
            function mapCommandsFromTrieToFlatArray(modes) {
                {
                    let ret = [];
                    modes.forEach(mode => {
                        function extractMappingRecursively(mapTrie) {
                            console.assert(mapTrie instanceof Trie);
                            Object.getOwnPropertyNames(mapTrie).forEach(pKey => {
                                if (mapTrie[pKey] instanceof Trie) {
                                    extractMappingRecursively(mapTrie[pKey]);
                                } else if (pKey === "meta") {
                                    let mapping = mapTrie;
                                    mapping.mode = mode.name;
                                    ret.push(mapping);
                                }
                            });
                        }

                        let mappings = mode.mappings;
                        extractMappingRecursively(mappings);
                    });
                    return ret;
                }
            }

            function indexByAnnotation(commands) {
                function fixSearchAliasBug(key, v) {
                    // removeSearchAlias(); is not properly implemented and lacks annotations
                    let ret = key;
                    if (v.meta.word.startsWith("so") || (v.meta.code && v.meta.code.toString().indexOf("ssw") !== -1)) {
                        ret = `${v.mode} Search Selected ${v.meta.word}`;
                    }
                    return ret;
                }

                function fixMissingAnnotation(v) {
                    let ret = v;
                    if (!v.meta.hasOwnProperty("annotation")) {
                        ret.meta.annotation = `${v.mode} Search Selected ${v.meta.word}`;
                    }
                    return ret;
                }

                {
                    console.assert(commands.length > 0);
                    let ret = new Map();
                    commands.forEach(v => {
                        v = fixMissingAnnotation(v);
                        console.assert(v.meta.hasOwnProperty("annotation"), v);
                        let key = v.meta.annotation;
                        key = key.toLowerCase();
                        key = fixSearchAliasBug(key, v);
                        console.assert(key.length > 0, key);

                        if (ret.has(key)) {
                            key = v.mode + v.meta.annotation;

                            console.assert(ret.has(key) === false, `Annotation duplicated ${key} for shortcut ${v.meta.word}`);
                        }
                        ret.set(key, v);
                    });
                    console.assert(commands.length == ret.size);
                    console.assert(ret.has("duplicate current tab"));
                    return ret;
                }
            }

            {
                let flatCommands = mapCommandsFromTrieToFlatArray(modes);
                let ret = indexByAnnotation(flatCommands);
                return ret;
            }
        }

        {
            // let modes = [Disabled, Normal, PassThrough, Insert, Hints, Find, AceEditor, Front, Visual, Omnibar, mappingsEditor, KeyPicker]
            let modes = [Normal, Insert, Visual];
            let commands = mapCommandsByAnnotations(modes);
            MyCustomMapping.acmds = commands;
        }
    }
}

/**
 * produces mapping in docs/commands-list.txt
 */
function printAllCommands() {
    // for (var key of MyCustomMapping.acmds.keys()) {
    //     console.log(`Mode: ${MyCustomMapping.acmds.get(key).mode}, Shortcut: ${MyCustomMapping.acmds.get(key).meta.word}, Annotation: ${key}`);
    // }

    for (var key of MyCustomMapping.acmds.keys()) {
        console.log(`amap("${MyCustomMapping.acmds.get(key).meta.word}", "${key}");`);
    }
}

/**
 * map keys by annotation
 *
 * Example:
 *
 * unmapAllExcept([]);
 * amap("Zr", "zoom reset");
 *
 * Rationale: allows better organization of config file
 *
 * @param keys
 * @param annotation
 */
function amap(keys, annotation) {
    let acmds = MyCustomMapping.acmds;
    console.assert(acmds.has(annotation), `Annotation not found "${annotation}" for keys "${keys}"`);
    let mapping = MyCustomMapping.acmds.get(annotation);

    _mapkey(window[mapping.mode], keys, mapping.meta.annotation, mapping.meta.code, mapping.meta.options);
}

var CustomCommands = (function() {
    let self = {};

    function shouldSkipOtherRepeats() {
        return !isNaN(parseInt(Normal.repeats)) && RUNTIME.repeats !== parseInt(Normal.repeats);
    }

    runtime.conf.disabledDomainKeys = [];

    self.testMyPort = async () => {
        return await aruntime({ action: "testMyPort" });
    };

    async function aruntime(obj) {
        return new Promise(resolve => {
            runtime.command(obj, resolve);
        });
    }

    self.copyTopURL = () => {
        runtime.command(
            {
                action: "copyTopURL"
            },
            function(res) {
                Front.showBanner(res.url);
            }
        );
    };

    self.tabReloadM = async k => {
        let magic = tabCheckMagicByKey(k);
        if (!magic) {
            return;
        }

        let res = await aruntime({
            action: "tabReloadM",
            repeats: Normal.repeats || -1,
            magic: magic
        });
    };

    self.copyTabURLsM = async k => {
        let magic = tabCheckMagicByKey(k);
        if (!magic) {
            return;
        }

        let res = await aruntime({
            action: "copyTabURLsM",
            repeats: Normal.repeats || -1,
            magic: magic
        });
        Front.showBanner(`Copied ${res.count} URLs ${res.data}`, 2000);
    };

    self.copyAllTabsURLsInCurrentWindow = () => {
        runtime.command(
            {
                action: "copyAllTabsURLsInCurrentWindow"
            },
            function(res) {
                Front.showBanner(`Copied ${res.count} URLs ${res.data}`, 2000);
            }
        );
    };

    self.copyRootURL = async () => {
        const res = await aruntime({ action: "copyTopURL" });
        Front.showBanner(res.url);
    };

    self.openLinkIncognito = function(url) {
        runtime.command(
            {
                action: "openLinkIncognito",
                url: url
            },
            function(res) {}
        );
    };

    self.passSingleKey = function() {
        if (Mode.stack()[0].name === "Visual") {
            Visual.toggle();
        } else {
            PassThrough.enter();
            PassThrough.addEventListener("keydown", function(event) {
                event.sk_suppressed = true;
                event.ignore_stop_propgation_hack = true;
                PassThrough.exit();
            });
        }
    };

    self.pasteFromClipboard = function() {
        Clipboard.read(v => {
            runtime.command(
                {
                    action: "pasteFromClipboard",
                    data: v
                },
                function(res) {}
            );
        });
    };

    self.pasteFromClipboardNewTab = function() {
        Clipboard.read(v => {
            runtime.command(
                {
                    action: "pasteFromClipboardNewTab",
                    data: v
                },
                function(res) {}
            );
        });
    };

    self.handleCtrlWFeature = function(msg, sender, cb) {
        if (!document.location.href.endsWith("pages/frontend.html") && !document.location.href.startsWith("chrome-extension://")) {
            let el = document.activeElement;
            if (DOMUtils.isEditable(el)) {
                InsertUtils.deleteWord();
            } else {
                if (document.activeElement && document.activeElement.shadowRoot !== null) {
                    // TODO(hbt) ENHANCE add shortcut in AceEditor
                    // InsertUtils.deleteWord()
                } else {
                    // TODO(hbt) FIXME not working on google

                    if (window.location.href.indexOf("google") === -1) {
                        runtime.command(
                            {
                                action: "tabClose"
                            },
                            function(res) {}
                        );
                    }
                }
            }
        }
    };

    self.debug = function(msg) {};

    /**
     * HACK for sites like youtube where the window object is the same despite switching URLs.
     * that means surfingkeys:defaultSettingsLoaded is executed once and custom scripts only once (regardless of the number of URLs we browse)
     *
     * This is also useful for Apps
     * Note: check popstate event on widnow to capture  history/hash changes
     * @param msg
     */
    self.tabDoneLoading = function(msg) {
        if (window === top) {
            window.document.dispatchEvent(new CustomEvent("surfingkeys:hbt:tabcomplete"));
        }
    };

    self.exampleWithRepeatAndDirection = function(e) {
        console.log(e, Normal.repeats);
    };

    self.handleKeyPropagation = function(mode, event) {
        // Note(hbt) experimental to prevent lightboxes in JS and sites with existing shortcuts from being triggered
        let ret = event;
        // console.log(mode.name, event.key, event.sk_stopPropagation);
        // console.log(event);
        // ret.sk_stopPropagation = true;
        if (mode.name === "Normal" && event.key === "Escape") {
            if (event.altKey || event.ctrlKey) {
            } else {
                ret.sk_stopPropagation = true;
                document.activeElement && document.activeElement.blur();
            }
        }

        // hack:  Some events still being passed to the page when unmapped keys are triggered e.g map s to scroll press s on github; it goes to search
        // Note(hbt) it works but there is no focus. i.e will trigger site action but focus stays (for the first time only)
        let settings = runtime.conf;
        if (
            settings.disabledDomainKeys &&
            settings.disabledDomainKeys.length > 0 &&
            mode.name === "Normal" &&
            !DOMUtils.isEditable(document.activeElement) &&
            settings.disabledDomainKeys.includes(event.key) &&
            !event.ignore_stop_propgation_hack
        ) {
            ret.sk_stopPropagation = true;
        }

        return ret;
    };

    self.insertGoToFirstInput = function() {
        if (RUNTIME.repeats !== 1 && RUNTIME.repeats !== parseInt(Normal.repeats)) {
            return;
        }
        let stealFocusOnLoad = runtime.conf.stealFocusOnLoad;
        runtime.conf.stealFocusOnLoad = false;
        let repeats = Normal.repeats || 0;

        this.inputElements = [];
        var allInput = document.querySelectorAll("input,textarea,*[contenteditable]");
        for (var i = 0, l = allInput.length; i < l; i++) {
            if (DOMUtils.isEditable(allInput[i]) && DOMUtils.isVisible(allInput[i]) && allInput[i].id !== "cVim-command-bar-input") {
                this.inputElements.push(allInput[i]);
            }
        }
        if (this.inputElements.length === 0) {
            return false;
        }
        this.inputElementsIndex = (repeats % this.inputElements.length) - 1;
        if (this.inputElementsIndex < 0) {
            this.inputElementsIndex = 0;
        }

        // TODO(hbt) INVESTIGATE this makes inputElementsIndex always = 0
        // for (i = 0, l = this.inputElements.length; i < l; i++) {
        //     var br = this.inputElements[i].getBoundingClientRect();
        //     if (br.top + br.height >= 0 &&
        //         br.left + br.width >= 0 &&
        //         br.right - br.width <= window.innerWidth &&
        //         br.top < window.innerHeight) {
        //         this.inputElementsIndex = i;
        //         break;
        //     }
        // }

        this.inputFocused = true;
        this.inputElements[this.inputElementsIndex].focus();

        if (document.activeElement.select) {
            document.activeElement.select();
        }
        if (!document.activeElement.hasAttribute("readonly")) {
            document.getSelection().modify("move", "right", "lineboundary");
        }

        runtime.conf.stealFocusOnLoad = stealFocusOnLoad;
    };

    chrome.runtime.onMessage.addListener(function(msg, sender, cb) {
        if (msg.action && typeof self[msg.action] === "function") {
            try {
                self[msg.action](msg, sender, cb);
            } catch (e) {
                console.error(e);
            }
        }
    });

    self.hintOpenLinkIncognito = function() {
        Hints.create("*[href]", function(element) {
            CustomCommands.openLinkIncognito(element.href);
        });
    };

    self.hintSimulateMiddleClickBackground = function(element) {
        var event = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            view: window,
            button: 1
        });
        element.dispatchEvent(event);
    };

    self.hintDetectNewTab = function(element) {
        Hints.create(
            runtime.conf.clickablePat,
            function(element) {
                createElement(`<a href=${element[2]} target="_blank">`).click();
            },
            { statusLine: "Open detected links from text" }
        );
    };

    self.hintMatchPatterns = function(pattern, direction) {
        function tryGooglePattern(forward) {
            if (location.hostname.indexOf("www.google.")) return false;
            var target = document.getElementById(forward ? "pnnext" : "pnprev");
            if (target) target.click();
            return !!target;
        }

        let matchPatternFilters = {
            "*://*.ebay.com/*": {
                next: "td a.next",
                prev: "td a.prev"
            },
            "*://mail.google.com/*": {
                next: 'div[role="button"][data-tooltip="Older"]:not([aria-disabled="true"])',
                prev: 'div[role="button"][data-tooltip="Newer"]:not([aria-disabled="true"])'
            },
            "*://*.reddit.com/*": {
                next: 'a[rel$="next"]',
                prev: 'a[rel$="prev"]'
            }
        };
        var applicableFilters = Object.keys(matchPatternFilters)
            .filter(function(key) {
                return DOMUtils.matchLocation(document.URL, key);
            })
            .map(function(key) {
                return matchPatternFilters[key][direction];
            });
        applicableFilters = DOMUtils.compressArray(applicableFilters);

        var link = null;
        for (var i = 0; i < applicableFilters.length; i++) {
            link = DOMUtils.findFirstOf(document.querySelectorAll(applicableFilters[i]), function(e) {
                return DOMUtils.isVisible(e);
            });
            if (link !== null) break;
        }
        if (link === null) {
            if (tryGooglePattern(direction == "next")) return;
            if (typeof pattern === "string") pattern = new RegExp("^" + pattern + "$", "i");
            let els = getElements("a[href]:not([href^=javascript])");
            els = filterInvisibleElements(els);
            link = DOMUtils.findFirstOf(els, function(e) {
                let b = e.textContent.trim() && (pattern.test(e.textContent) || pattern.test(e.getAttribute("value")));
                if (b) {
                    // console.log(e.textContent)
                }
                return b;
            });
        }
        if (link) {
            DOMUtils.mouseEvent("hover", link);
            DOMUtils.mouseEvent("click", link);
        }
    };

    self.hintHandleClickNewTabBackground = function(element, event) {
        Hints.flashPressedLink(element);
        if (isEditable(element)) {
            Hints.exit();
            Normal.passFocus(true);
            element.focus();
            Insert.enter(element);
        } else {
            Hints.mouseoutLastElement();
            CustomCommands.hintSimulateMiddleClickBackground(element);
        }
    };

    self.hintNewTab = async () => {
        Hints.create("", CustomCommands.hintHandleClickNewTabBackground);
    };

    self.hintFocusElement = async () => {
        Hints.create("", function(element) {
            element.focus();
        });
    };

    self.tabDetach = function() {
        runtime.command(
            {
                action: "tabDetach"
            },
            function(res) {}
        );
    };

    self.tabCloseLeft = function() {
        self.tabClose("closeLeft");
    };

    self.tabCloseRight = function() {
        self.tabClose("closeRight");
    };

    // tcc
    self.tabCloseOthersInWindow = function() {
        self.tabClose("closeOther");
    };

    // tcw
    self.windowCloseOtherWindows = function() {
        // self.tabClose('otherWindows', {otherWindows: true,})
        self.tabClose("otherWindows");
    };

    // tcg
    self.tabCloseOthersInAllWindows = function() {
        self.tabCloseOthersInWindow();
        self.windowCloseOtherWindows();
    };

    self.tabUndo = function() {
        if (shouldSkipOtherRepeats()) {
            return;
        }
        let repeats = parseInt(Normal.repeats) || 1;

        runtime.command(
            {
                action: "tabUndo",
                repeats: repeats
            },
            function(res) {}
        );
    };
    self.tabClose = function(type) {
        runtime.command(
            {
                action: "tabClose",
                msg: {
                    type: type
                }
            },
            function(res) {}
        );
    };

    self.tabTogglePinAll = function() {
        runtime.command(
            {
                action: "tabUnpinAll"
            },
            function(res) {}
        );
    };

    self.windowsTogglePinAll = function() {
        runtime.command(
            {
                action: "tabUnpinAll",
                msg: {
                    allWindows: true
                }
            },
            function(res) {}
        );
    };

    self.tabGotoParent = function() {
        aruntime({
            action: "tabGotoParent"
        });
    };

    self.tabGoto = function() {
        // ignore other repeats and pass the value instead
        if (RUNTIME.repeats !== parseInt(Normal.repeats)) {
            return;
        }
        runtime.command(
            {
                action: "tabGoto",
                request: {
                    index: RUNTIME.repeats - 1
                }
            },
            function(res) {}
        );
    };

    self.tabReverseM = async function(k) {
        let magic = tabCheckMagicByKey(k);
        if (!magic) {
            return;
        }

        let ret = await aruntime({
            action: "tabReverseM",
            repeats: Normal.repeats || -1,
            magic: magic
        });
    };

    self.tabToggleHighlightM = async function(k) {
        let magic = tabCheckMagicByKey(k);
        if (!magic) {
            return;
        }

        let ret = await aruntime({
            action: "tabToggleHighlightM",
            repeats: Normal.repeats || -1,
            magic: magic
        });
        let msg = `Highlighted: ${ret.state.add} \n Removed! : ${ret.state.rm} \n Total: ${ret.count}`;
        Front.showBanner(msg, 3000);
    };

    self.tabToggleHighlight = function() {
        runtime.command(
            {
                action: "tabToggleHighlight"
            },
            function(res) {
                let msg = res.state ? "*Highlighted*" : "Removed! Highlight";
                msg = `${msg} - ${res.count} Highlighted Tabs`;
                Front.showBanner(msg, 3000);
            }
        );
    };

    self.tabMoveHighlighted = function() {
        runtime.command(
            {
                action: "tabMoveHighlighted"
            },
            function(res) {}
        );
    };

    self.tabHighlightClearAll = function() {
        runtime.command(
            {
                action: "tabHighlightClearAll"
            },
            function(res) {
                Front.showBanner(`Cleared Highlighted tabs. Total: ${res.count} `, 3000);
            }
        );
    };

    self.pageStylesheetToggleByDomain = function(fileURL) {
        runtime.command(
            {
                action: "pageStylesheetToggleByDomain",
                url: fileURL
            },
            function(res) {}
        );
    };

    self.addVIMark2 = function(mark, url) {
        if (/^[a-z]$/.test(mark)) {
            // local mark
            var localMarks = JSON.parse(localStorage["sklocalMarks"] || "{}");
            let href = CustomCommands.getHostname();
            localMarks[href] = localMarks[href] || {};

            localMarks[href][mark] = {
                scrollLeft: document.scrollingElement.scrollLeft,
                scrollTop: document.scrollingElement.scrollTop
            };
            localStorage["sklocalMarks"] = JSON.stringify(localMarks);
        } else {
            Normal.addVIMark(mark, url);
        }
    };

    self.jumpVIMark = function(mark, newTab) {
        function saveLastPosition(href) {
            var localMarks = JSON.parse(localStorage["sklocalMarks"] || "{}");
            localMarks[href]["last"] = {
                scrollLeft: document.scrollingElement.scrollLeft,
                scrollTop: document.scrollingElement.scrollTop
            };
            localStorage["sklocalMarks"] = JSON.stringify(localMarks);
        }

        function gotoPosition(scrollLeft, scrollTop) {
            document.scrollingElement.scrollLeft = scrollLeft;
            document.scrollingElement.scrollTop = scrollTop;
        }

        var localMarks = JSON.parse(localStorage["sklocalMarks"] || "{}");

        let href = CustomCommands.getHostname();
        if (localMarks.hasOwnProperty(href) && localMarks[href].hasOwnProperty(mark)) {
            var markInfo = localMarks[href][mark];
            saveLastPosition(href);
            gotoPosition(markInfo.scrollLeft, markInfo.scrollTop);
        } else {
            if (mark === "'") {
                var markInfo = localMarks[href]["last"];
                saveLastPosition(href);
                gotoPosition(markInfo.scrollLeft, markInfo.scrollTop);
            } else {
                Normal.jumpVIMark(mark, newTab);
            }
        }
    };

    self.getHostname = function(url) {
        let href = url || window.top.location.href;
        var res = window.location.host || "file";

        if (href) {
            var a = document.createElement("a");
            a.href = href;
            res = a.host;
        }

        return res;
    };

    /**
     *  WIP
     */
    self.tabToggleSwitchTabNewPosition = function() {
        // Note(hbt) skipping idea for now. low ROI

        //     runtime.command(
        //     {
        //         action: "tabToggleSwitchTabNewPosition",
        //     },
        //     function(res) {}
        // );

        let settings = {
            snippets: 'settings.newTabPosition = "default"'
        };
        applySettings(settings);
    };

    /**
     * opens in external editor using mouseless python server
     */
    self.insertOpenExternalEditor = function() {
        var element = document.activeElement;
        var value = element.value || element.innerHTML;
        var text = value.substr(0, element.selectionStart);
        var line = 1 + text.replace(/[^\n]/g, "").length;
        var column = 1 + text.replace(/[^]*\n/, "").length;
        var __ = window._;
        var mid = "mouseless_sfk_" + generateQuickGuid();
        element.classList.add(mid);

        runtime.command(
            {
                action: "insertOpenExternalEditor",
                text: value,
                line: line,
                column: column,
                elementId: mid
            },
            function(res) {
                var lastInputElement = element;
                lastInputElement[lastInputElement.value !== void 0 ? "value" : "innerHTML"] = res.text.replace(/\n$/, ""); // remove trailing line left by vim
                // element.value = res.text;

                if (!DOMUtils.isSubmittable(element)) {
                    element.blur();
                }
            }
        );
    };

    self.urlEditExternalEditor = function() {
        runtime.command(
            {
                action: "urlEditExternalEditor"
            },
            function(res) {
                if (res.text) {
                    window.location.href = res.text;
                }
            }
        );
    };

    self.urlReplaceNumber2 = function(inc, repeats) {
        let matches = document.location.href.match(/\d+/g);
        if (matches.length < 0) {
            return;
        }

        let url = document.location.href;
        let posi = url.length;
        matches = matches.reverse();
        for (var i = 0; i < matches.length; i++) {
            posi = url.lastIndexOf(matches[i], posi);
            if (i === repeats - 1) {
                break;
            }
        }

        let nurl = url.substr(0, posi);
        let ninc = parseInt(url.substr(posi, matches[i].length)) + inc;
        nurl += ninc;
        nurl += url.substr(posi + matches[i].length);

        window.location.href = nurl;
    };

    self.urlReplaceNumber = function(inc) {
        if (document.location.href.match(/(.*?)(\d+)(\D*)$/)) {
            var pre = RegExp.$1,
                number = RegExp.$2,
                post = RegExp.$3;
            var newNumber = parseInt(number, 10) + inc;
            var newNumberStr = String(newNumber > 0 ? newNumber : 0);
            if (number.match(/^0/)) {
                // add 0009<C-a> should become 0010
                while (newNumberStr.length < number.length) {
                    newNumberStr = "0" + newNumberStr;
                }
            }

            var url = pre + newNumberStr + post;
            window.location.href = url;
        }
    };

    self.urlDecrementLastPath = function(inc) {
        // self.urlReplaceNumber(parseInt(inc) * -1);

        if (isNaN(inc)) {
            inc = 1;
        }
        let repeats = Normal.repeats === "" ? 1 : Normal.repeats;
        self.urlReplaceNumber2(parseInt(inc) * -1, repeats);
    };

    self.urlIncrementLastPath = function(inc) {
        // self.urlReplaceNumber(parseInt(inc))

        if (isNaN(inc)) {
            inc = 1;
        }
        let repeats = Normal.repeats === "" ? 1 : Normal.repeats;
        self.urlReplaceNumber2(parseInt(inc), repeats);
    };

    self.downloadShowLastFile = function() {
        runtime.command(
            {
                action: "downloadShowLastFile"
            },
            function(res) {}
        );
    };

    self.downloadOpenLastFile = function() {
        runtime.command(
            {
                action: "downloadOpenLastFile"
            },
            function(res) {}
        );
    };

    self.bookmarkToggle = function(folder) {
        runtime.command(
            {
                action: "bookmarkToggle",
                folder: folder
            },
            function(res) {
                Front.showBanner(res.msg, 3000);
            }
        );
    };

    self.bookmarkCopyFolder = function(folder) {
        runtime.command(
            {
                action: "bookmarkCopyFolder",
                folder: folder
            },
            function(res) {
                Front.showBanner(res.msg, 3000);
            }
        );
    };

    self.bookmarkEmptyFolder = function(folder) {
        runtime.command(
            {
                action: "bookmarkEmptyFolder",
                folder: folder
            },
            function(res) {
                Front.showBanner(res.msg, 3000);
            }
        );
    };

    self.bookmarkDumpFolder = function(folder) {
        runtime.command(
            {
                action: "bookmarkDumpFolder",
                folder: folder
            },
            function(res) {
                Front.showBanner(res.msg, 3000);
            }
        );
    };

    self.bookmarkLoadFolder = function(folder) {
        runtime.command(
            {
                action: "bookmarkLoadFolder",
                folder: folder
            },
            function(res) {
                Front.showBanner(res.msg, 3000);
            }
        );
    };

    self.tabUnique = async () => {
        return await aruntime({ action: "tabUnique" });
    };

    self.tabShowIndexPosition = async () => {
        let ret = await aruntime({ action: "tabShowIndexPosition" });
        Front.showBanner(`Tab Position: ${ret.data}`, 3000);
    };

    self.tabQuickMarkSave = async m => {
        let ret = await aruntime({ action: "tabQuickMarkSave", mark: m });
        Front.showBanner(`${ret.msg}`, 3000);
    };

    self.tabQuickMarkJump = async m => {
        if (m === "`") {
            RUNTIME("goToLastTab");
        } else {
            let ret = await aruntime({ action: "tabQuickMarkJump", mark: m });
        }
    };

    function tabCheckMagicByKey(k) {
        function mapKeyToName() {
            let ret = new Map();
            let magics = CustomCommonConfig.tabMagic;
            let okeys = Object.keys(magics);
            okeys.forEach(k => {
                console.assert(magics[k].hasOwnProperty("key"));
                ret.set(magics[k].key, k);
            });
            return ret;
        }

        let map = mapKeyToName();
        console.assert(map.has(k));

        return map.get(k);
    }

    self.tabCloseM = async k => {
        let magic = tabCheckMagicByKey(k);
        if (magic) {
            let ret = await aruntime({
                action: "tabCloseM",
                repeats: Normal.repeats || -1,
                magic: magic
            });
        }
    };

    self.showBanner = function(banner, content, time) {
        let timems = (time || 1600) / 1000;
        var banner = document.getElementById("sk_banner");
        banner.classList.remove("slideInBanner");
        banner.style.display = "";
        setInnerHTML(banner, htmlEncode(content));
        Front.flush();

        banner.style.cssText = `animation: ${timems}s ease-in-out 1 both slideInBanner;`;
        // banner.classList.add("slideInBanner");
        banner.one("animationend", function() {
            banner.classList.remove("slideInBanner");
            banner.style.display = "none";
            Front.flush();
        });
    };

    return self;
})();

// setTimeout(CustomCommands.debug, 2000)

var DOMUtils = {
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

var CustomCommands = (function() {
    let self = {};

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

    self.copyAllTabsURLsInCurrentWindow = () => {
        runtime.command(
            {
                action: "copyAllTabsURLsInCurrentWindow"
            },
            function(res) {
                Front.showBanner(`Copied ${res.count} URLs ${res.data}`);
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
        var cssSelector = "input";

        var elements = getVisibleElements(function(e, v) {
            if (e.matches(cssSelector) && !e.disabled && !e.readOnly && (e.type === "text" || e.type === "password")) {
                v.push(e);
            }
        });

        if (elements.length === 0 && document.querySelector(cssSelector) !== null) {
            document.querySelector(cssSelector).scrollIntoView();
            elements = getVisibleElements(function(e, v) {
                if (e.matches(cssSelector) && !e.disabled && !e.readOnly) {
                    v.push(e);
                }
            });
        }

        if (elements.length > 0) {
            Normal.passFocus(true);
            elements[0].focus();
            Insert.enter(elements[0]);
        }
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

    self.tabToggleHighlight = function() {
        runtime.command(
            {
                action: "tabToggleHighlight"
            },
            function(res) {
                let msg = res.state ? "*Highlighted*" : "Removed! Highlight";
                msg = `${msg} - ${res.count} Highlighted Tabs`;
                Front.showBanner(msg);
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
                Front.showBanner(`${res.count} Highlighted Tabs`);
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

    self.addVIMark = function(mark, url) {
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
        var localMarks = JSON.parse(localStorage["sklocalMarks"] || "{}");

        let href = CustomCommands.getHostname();
        if (localMarks.hasOwnProperty(href) && localMarks[href].hasOwnProperty(mark)) {
            var markInfo = localMarks[href][mark];
            document.scrollingElement.scrollLeft = markInfo.scrollLeft;
            document.scrollingElement.scrollTop = markInfo.scrollTop;
        } else {
            Normal.jumpVIMark(mark, newTab);
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

    return self;
})();

// setTimeout(CustomCommands.debug, 2000)

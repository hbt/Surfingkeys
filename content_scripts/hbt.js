var DOMUtils = {
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
                    runtime.command(
                        {
                            action: "tabClose"
                        },
                        function(res) {}
                    );
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
        if (window.location.href === window.top.location.href) {
            document.dispatchEvent(new CustomEvent("surfingkeys:hbt:tabcomplete"));
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
            self[msg.action](msg, sender, cb);
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
    return self;
})();

// setTimeout(CustomCommands.debug, 2000)

var CustomCommands = (function() {
    let self = {};

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
                Front.showBanner(`Copied ${res.count} URLs<br/> ${res.data}`);
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
        // TODO(hbt) INVESTIGATE view #117  https://github.com/hbt/mouseless/commit/68ec42755f7619ca47b4f5253f5197cf557e0137
        // Note(hbt) issue is with extension frontend.html and the page. Message gets passed to both
        // for now, prevent C-w from closing the tab during editing since I tend to use it as a reflex when editing
        // return !domain || domain.test(document.location.href) || domain.test(window.origin);
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
        self.tabCloseOthersInAllWindows();
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

    return self;
})();

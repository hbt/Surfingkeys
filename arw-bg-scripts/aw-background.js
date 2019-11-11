
var State = {//{{{
//     tabsMarked: new Map(),
    tabsQuickMarks: new Map(),
    tabsSettings: new Map(),
    tabUrls: new Map(),
    // Note(hbt) tracks openerTabId because the id is lost when the tab is moved
    tabOpenerIds: new Map(),
    tabsRemoved: []
    // globalSettings: {
    //     focusAfterClosed: "right",
    //     repeatThreshold: 99,
    //     tabsMRUOrder: true,
    //     newTabPosition: 'default',
    //     showTabIndices: false,
    //     interceptedErrors: []
    // }
};//}}}

class ARWBackground {
    init() {//{{{
        this.registerListeners();
    }

    registerListeners() {
        chrome.runtime.onMessage.addListener((_message, _sender, _sendResponse, _port) => {
            this.handlePortMessage(_message, _sender, _sendResponse, _port);
        });

        chrome.runtime.onConnect.addListener(port => {
            var sender = port.sender;
            port.onMessage.addListener((message, port) => {
                return this.handlePortMessage(
                    message,
                    port.sender,
                    function(resp) {
                        try {
                            if (!port.isDisconnected) {
                                port.postMessage(resp);
                            }
                        } catch (e) {
                            console.error(message.action + ": " + e);
                            console.error(port, e);
                        }
                    },
                    port
                );
            });
        });

        chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
            ARWBackground.tabSendMessageOnWhenDoneLoading(changeInfo, tab);
            ARWBackground.tabUpdateInternalState(tab);
        });

        chrome.tabs.onCreated.addListener(function(tab) {
            ARWBackground.tabsOnCreatedHandler(tab);
        });

        chrome.tabs.onRemoved.addListener(function(tab) {
            ARWBackground.tabsOnRemovedSave(tab);
        });
    }

    static async tabUpdateInternalState(tab) {
        State.tabUrls.set(tab.id, tab);
    }

    static async tabsOnRemovedSave(tabId) {
        State.tabsRemoved.push(tabId);
    }

    static async tabsOnCreatedHandler(tab) {
        if (tab.openerTabId) {
            State.tabOpenerIds.set(tab.id, tab.openerTabId);
            const otab = await chrome.tabs.get(tab.openerTabId);
            if (State.tabsSettings.has(otab.id)) {
                if (State.tabsSettings.get(otab.id).newTabPosition === "right") {
                    chrome.tabs.get(tab.openerTabId, ot => {
                        chrome.tabs.move(tab.id, {
                            index: ot.index + 1
                        });
                    });
                }
            }
        }
    }

    static async tabSendMessageOnWhenDoneLoading(changeInfo, tab) {
        if (changeInfo.status === "complete") {
            chrome.tabs.sendMessage(tab.id, {
                action: "tabDoneLoading"
            });
        }
    }

    sendResponse(message, sendResponse, result) {
        result.action = message.action;
        result.id = message.id;
        sendResponse(result);
    }

    handlePortMessage(_message, _sender, _sendResponse, _port) {
        if (_message && _message.target !== "content_runtime") {
            if (this[_message.action] instanceof Function) {
                try {
                    this[_message.action](_message, _sender, _sendResponse);
                } catch (e) {
                    console.log(_message.action + ": " + e);
                    console.error(e);
                }
            }
        }
    }//}}}

    async adamBackground(_message, _sender, _sendResponse) {
			let tabs = await chrome.tabs.query({currentWindow: true});;
      this.sendResponse(_message, _sendResponse, { data: tabs, count: tabs.length });
    }

}

{
    let cc = new ARWBackground();
    cc.init();
}

(async () => {})();

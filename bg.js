{
    var Clipboard = {};

    Clipboard.createTextArea = function() {
        var t = document.createElement("textarea");
        t.style.position = "absolute";
        t.style.left = "-100%";
        return t;
    };

    Clipboard.copy = function(text) {
        var t = this.createTextArea();
        t.value = text;
        document.body.appendChild(t);
        t.select();
        document.execCommand("Copy");
        document.body.removeChild(t);
    };

    Clipboard.paste = function() {
        var t = this.createTextArea();
        document.body.appendChild(t);
        t.focus();
        document.execCommand("Paste");
        var text = t.value;
        document.body.removeChild(t);
        return text;
    };
}

class CustomBackground {
    conf() {}
    init() {
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
                            console.error(port);
                        }
                    },
                    port
                );
            });
        });
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
                }
            }
        }
    }

    testMyPort(_message, _sender, _sendResponse) {
        this.sendResponse(_message, _sendResponse, { test: "works" });
    }

    copyTopURL(_message, _sender, _sendResponse) {
        let url = _sender.tab ? _sender.tab.url : "";
        Clipboard.copy(url);
        this.sendResponse(_message, _sendResponse, { url: url });
    }
}

{
    let cc = new CustomBackground();
    cc.init();
}

// // example with async/await chrome api
// (async function() {
//     const ww = await chrome.windows.getAll()
//     console.log(ww)
//     for(var w of ww) {
//             const  tabs = await chrome.tabs.getAllInWindow(w.id)
//             console.log(tabs)
//     }
// })()

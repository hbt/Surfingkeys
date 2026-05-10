export interface RuntimeConf {
    autoSpeakOnInlineQuery: boolean;
    lastKeys: string;
    // local part from settings
    blocklistPattern: RegExp | undefined;
    lurkingPattern: RegExp | undefined;
    disabledOnActiveElementPattern: RegExp | undefined;
    smartCase: boolean;
    caseSensitive: boolean;
    clickablePat: RegExp;
    clickableSelector: string;
    editableSelector: string;
    cursorAtEndOfInput: boolean;
    defaultLLMProvider: string;
    defaultSearchEngine: string;
    defaultVoice: string;
    editableBodyCare: boolean;
    enableAutoFocus: boolean;
    enableEmojiInsertion: boolean;
    experiment: boolean;
    focusFirstCandidate: boolean;
    focusOnSaved: boolean;
    hintAlign: string;
    hintExplicit: boolean;
    hintShiftNonActive: boolean;
    historyMUOrder: boolean;
    language: string | undefined;
    lastQuery: string;
    modeAfterYank: string;
    nextLinkRegex: RegExp;
    digitForRepeat: boolean;
    omnibarMaxResults: number;
    omnibarHistoryCacheSize: number;
    omnibarPosition: string;
    omnibarSuggestion: boolean;
    omnibarSuggestionTimeout: number;
    omnibarTabsQuery: Record<string, unknown>;
    pageUrlRegex: RegExp[];
    prevLinkRegex: RegExp;
    repeatThreshold: number;
    richHintsForKeystroke: number;
    colorfulKeystrokeHints: boolean;
    scrollFallback: boolean;
    scrollStepSize: number;
    showModeStatus: boolean;
    showProxyInStatusBar: boolean;
    smartPageBoundary: boolean;
    smoothScroll: boolean;
    startToShowEmoji: number;
    stealFocusOnLoad: boolean;
    tabIndicesSeparator: string;
    tabsThreshold: number;
    verticalTabs: boolean;
    textAnchorPat: RegExp;
    ignoredFrameHosts: string[];
    scrollFriction: number;
    aceKeybindings: string;
    caretViewport: unknown;
    mouseSelectToQuery: unknown[];
    useNeovim: boolean;
    useLocalMarkdownAPI: boolean;
}

type MessageHandler = (msg: chrome.runtime.MessageSender, sender: chrome.runtime.MessageSender, response: (response?: unknown) => void) => void;

export interface Runtime {
    conf: RuntimeConf;
    on(message: string, cb: MessageHandler): void;
    bookMessage(message: string, cb: MessageHandler): boolean;
    releaseMessage(message: string): void;
    getTopURL(cb: (url: string) => void): void;
    postTopMessage(msg: unknown): void;
    getCaseSensitive(query: string): boolean;
}

function dispatchSKEvent(type: string, args: unknown, target?: EventTarget): void {
    if (target === undefined) {
        target = document;
    }
    target.dispatchEvent(new CustomEvent(`surfingkeys:${type}`, { 'detail': args }));
}

/** Actions that handle their own repeat logic in the background */
const actionsRepeatBackground: string[] = [
    'closeTab', 'nextTab', 'previousTab', 'moveTab', 'moveToWindowMagic',
    'copyTabUrlsMagic', 'reloadTab', 'setZoom', 'focusTabByIndex',
    'closeTabMagic', 'reloadTabMagic', 'tabGotoIndex'
];

/**
 * Call background `action` with `args`, the `callback` will be executed with response from background.
 *
 * @param action a background action to be called.
 * @param args the parameters to be passed to the background action.
 * @param callback a function to be executed with the result from the background action.
 *
 * @example
 *
 * RUNTIME('getTabs', {queryInfo: {currentWindow: true}}, response => {
 *   console.log(response);
 * });
 */
function RUNTIME(action: string, args?: Record<string, unknown> | null, callback?: (response: unknown) => void): void {
    const msgArgs: Record<string, unknown> = args || {};
    msgArgs.action = action;
    if (actionsRepeatBackground.indexOf(action) !== -1) {
        // if the action can only be repeated in background, pass repeats to background with args,
        // and set RUNTIME.repeats 1, so that it won't be repeated in foreground's _handleMapKey
        msgArgs.repeats = RUNTIME.repeats;
        RUNTIME.repeats = 1;
    }
    try {
        msgArgs.needResponse = callback !== undefined;
        chrome.runtime.sendMessage(msgArgs, callback);
        if (action === 'read') {
            runtime.on('onTtsEvent', callback as MessageHandler);
        }
    } catch (e) {
        dispatchSKEvent("front", ['showPopup', '[runtime exception] ' + e]);
    }
}

RUNTIME.repeats = 1;

const runtime: Runtime = (function() {
    const self: Runtime = {
        conf: {
            autoSpeakOnInlineQuery: false,
            lastKeys: "",
            // local part from settings
            blocklistPattern: undefined,
            lurkingPattern: undefined,
            disabledOnActiveElementPattern: undefined,
            smartCase: true,
            caseSensitive: false,
            clickablePat: /(https?:\/\/|thunder:\/\/|magnet:)\S+/ig,
            clickableSelector: "",
            editableSelector: "div.CodeMirror-scroll,div.ace_content",
            cursorAtEndOfInput: true,
            defaultLLMProvider: "ollama",
            defaultSearchEngine: "g",
            defaultVoice: "Daniel",
            editableBodyCare: true,
            enableAutoFocus: true,
            enableEmojiInsertion: false,
            experiment: false,
            focusFirstCandidate: false,
            focusOnSaved: true,
            hintAlign: "center",
            hintExplicit: false,
            hintShiftNonActive: false,
            historyMUOrder: true,
            language: undefined,
            lastQuery: "",
            modeAfterYank: "",
            nextLinkRegex: /(\b(next)\b)|下页|下一页|后页|下頁|下一頁|後頁|>>|»/i,
            digitForRepeat: true,
            omnibarMaxResults: 10,
            omnibarHistoryCacheSize: 100,
            omnibarPosition: "middle",
            omnibarSuggestion: true,
            omnibarSuggestionTimeout: 200,
            omnibarTabsQuery: {},
            pageUrlRegex: [],
            prevLinkRegex: /(\b(prev|previous)\b)|上页|上一页|前页|上頁|上一頁|前頁|<<|«/i,
            repeatThreshold: 9,
            richHintsForKeystroke: 1000,
            colorfulKeystrokeHints: true,
            scrollFallback: false,
            scrollStepSize: 70,
            showModeStatus: false,
            showProxyInStatusBar: false,
            smartPageBoundary: false,
            smoothScroll: true,
            startToShowEmoji: 2,
            stealFocusOnLoad: true,
            tabIndicesSeparator: "|",
            tabsThreshold: 100,
            verticalTabs: true,
            textAnchorPat: /(^[\n\r\s]*\S{3,}|\b\S{4,})/g,
            ignoredFrameHosts: ["https://tpc.googlesyndication.com"],
            scrollFriction: 0,
            aceKeybindings: "vim",
            caretViewport: null,
            mouseSelectToQuery: [],
            useNeovim: false,
            useLocalMarkdownAPI: true
        },
    } as unknown as Runtime;

    const _handlers: Record<string, MessageHandler> = {};

    const getTopURLPromise = new Promise<string>(function(resolve) {
        if (window === top) {
            resolve(window.location.href);
        } else {
            RUNTIME("getTopURL", null, function(rs) {
                resolve((rs as { url: string }).url);
            });
        }
    });

    self.on = function(message: string, cb: MessageHandler): void {
        _handlers[message] = cb;
    };
    self.bookMessage = function(message: string, cb: MessageHandler): boolean {
        if (_handlers[message]) {
            return false;
        } else {
            _handlers[message] = cb;
            return true;
        }
    };
    self.releaseMessage = function(message: string): void {
        delete _handlers[message];
    };

    chrome.runtime.onMessage.addListener(function(msg, sender, response) {
        if (_handlers[msg.subject]) {
            _handlers[msg.subject](msg, sender, response);
        }
    });

    self.getTopURL = function(cb: (url: string) => void): void {
        getTopURLPromise.then(function(url) {
            cb(url);
        });
    };

    self.postTopMessage = function(msg: unknown): void {
        getTopURLPromise.then(function(topUrl) {
            let resolvedUrl = topUrl;
            if (window === top) {
                // Firefox use "resource://pdf.js" as window.origin for pdf viewer
                resolvedUrl = window.location.origin;
            }
            if (resolvedUrl === "null" || new URL(resolvedUrl).origin === "file://") {
                resolvedUrl = "*";
            }
            top!.postMessage(msg, resolvedUrl);
        });
    };

    self.getCaseSensitive = function(query: string): boolean {
        return self.conf.caseSensitive || (self.conf.smartCase && /[A-Z]/.test(query));
    };

    return self;
})();

export {
    RUNTIME,
    dispatchSKEvent,
    runtime
};

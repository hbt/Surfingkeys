import type { SurfingKeysConf, RuntimeMessage, MagicDirection } from '../../../@types/surfingkeys';
import { CONF_DEFAULTS } from '../../shared/conf-defaults.js';

function dispatchSKEvent(type: string, args?: unknown[], target?: EventTarget): void {
    if (target === undefined) {
        target = document;
    }
    target.dispatchEvent(new CustomEvent(`surfingkeys:${type}`, { 'detail': args }));
}

/**
 * Call background `action` with `args`, the `callback` will be executed with response from background.
 *
 * @param {string} action a background action to be called.
 * @param {object} args the parameters to be passed to the background action.
 * @param {function} callback a function to be executed with the result from the background action.
 *
 * @example
 *
 * RUNTIME('getTabs', {queryInfo: {currentWindow: true}}, response => {
 *   console.log(response);
 * });
 */
function RUNTIME(action: string, args?: Record<string, unknown> | null, callback?: (response: any) => void): void {
    var actionsRepeatBackground = ['closeTab', 'nextTab', 'previousTab', 'moveTab', 'moveToWindowMagic', 'copyTabUrlsMagic', 'reloadTab', 'setZoom', 'focusTabByIndex', 'closeTabMagic', 'reloadTabMagic', 'pinTabMagic', 'printTabMagic', 'tabGotoIndex'];
    (args = args || {}).action = action;
    if (actionsRepeatBackground.indexOf(action) !== -1) {
        // if the action can only be repeated in background, pass repeats to background with args,
        // and set RUNTIME.repeats 1, so that it won't be repeated in foreground's _handleMapKey
        args.repeats = (RUNTIME as any).repeats;
        (RUNTIME as any).repeats = 1;
    }
    try {
        args.needResponse = callback !== undefined;
        chrome.runtime.sendMessage(args as any, callback as any);
        if (action === 'read') {
            runtime.on('onTtsEvent', callback as any);
        }
    } catch (e) {
        dispatchSKEvent("front", ['showPopup', '[runtime exception] ' + e]);
    }
}

const runtime = (function() {
    const self: {
        conf: SurfingKeysConf;
        on(message: string, cb: (msg: RuntimeMessage, sender: chrome.runtime.MessageSender, response: (r: unknown) => void) => void): void;
        bookMessage(message: string, cb: (msg: RuntimeMessage, sender: chrome.runtime.MessageSender, response: (r: unknown) => void) => void): boolean;
        releaseMessage(message: string): void;
        getTopURL(cb: (url: string) => void): void;
        postTopMessage(msg: RuntimeMessage): void;
        getCaseSensitive(query: string): boolean;
    } = {
        // Methods are assigned below
        on: null as any,
        bookMessage: null as any,
        releaseMessage: null as any,
        getTopURL: null as any,
        postTopMessage: null as any,
        getCaseSensitive: null as any,
        conf: {
            // SW-shared defaults — must match start.ts via src/shared/conf-defaults.ts
            ...CONF_DEFAULTS,
            autoSpeakOnInlineQuery: false,
            lastKeys: [] as string[],
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
            stealFocusOnLoad: true,
            tabIndicesSeparator: "|",
            tabsThreshold: 100,
            tabOpenLinkThreshold: 30,
            verticalTabs: true,
            textAnchorPat: /(^[\n\r\s]*\S{3,}|\b\S{4,})/g,
            ignoredFrameHosts: ["https://tpc.googlesyndication.com"],
            scrollFriction: 0,
            aceKeybindings: "vim",
            caretViewport: [] as number[],
            mouseSelectToQuery: [],
            useNeovim: false,
            defaultExternalEditor: '' as string,
            useLocalMarkdownAPI: true,
            bookmarkFolders: undefined,
            magicKeys: {
                'q': 'DirectionLeft',
                'e': 'DirectionRight',
                'Q': 'DirectionLeftInclusive',
                'E': 'DirectionRightInclusive',
                't': 'CurrentTab',
                'C': 'AllInWindow',
                'g': 'AllExceptActiveAllWindows',
                'c': 'AllExceptActive',
                'k': 'ChildrenTabs',
                'K': 'ChildrenTabsRecursively',
                'w': 'OtherWindowsNoPinned',
                'W': 'AllOtherWindowsTabs',
                'o': 'AllIncognitoTabs',
                'd': 'SameDomain',
            } as Record<string, MagicDirection>
        },
    }, _handlers = {};

    const getTopURLPromise = new Promise(function(resolve, _reject) {
        if (window === top) {
            resolve(window.location.href);
        } else {
            RUNTIME("getTopURL", null, function(rs) {
                resolve(rs.url);
            });
        }
    });

    self.on = function(message, cb) {
        (_handlers as any)[message] = cb;
    };
    self.bookMessage = function(message, cb) {
        if ((_handlers as any)[message]) {
            return false;
        } else {
            (_handlers as any)[message] = cb;
            return true;
        }
    };
    self.releaseMessage = function(message) {
        delete (_handlers as any)[message];
    };

    chrome.runtime.onMessage.addListener(function(msg, sender, response) {
        if ((_handlers as any)[msg.subject]) {
            (_handlers as any)[msg.subject](msg, sender, response);
        }
        return undefined;
    });

    self.getTopURL = function(cb) {
        getTopURLPromise.then(function(url) {
            cb(url as string);
        });
    };

    self.postTopMessage = function(msg) {
        getTopURLPromise.then(function(topUrlRaw) {
            let topUrl: string = topUrlRaw as string;
            if (window === top) {
                // Firefox use "resource://pdf.js" as window.origin for pdf viewer
                topUrl = window.location.origin;
            }
            if (topUrl === "null" || new URL(topUrl).origin === "file://") {
                topUrl = "*";
            }
            top!.postMessage(msg, topUrl);
        });
    };

    self.getCaseSensitive = function(query) {
        return self.conf.caseSensitive || (self.conf.smartCase && /[A-Z]/.test(query));
    };

    return self;
})();

export {
    RUNTIME,
    dispatchSKEvent,
    runtime
};

import {
    extendObject,
    getSubSettings,
    start
} from './start.js';

declare const browser: {
    contextualIdentities: {
        get(cookieStoreId: string): Promise<{ name: string }>;
    };
};

function loadRawSettings(keys: string | string[] | null, cb: (data: Record<string, unknown>) => void, defaultSet: Record<string, unknown>) {
    var rawSet = defaultSet || {};
    chrome.storage.local.get(null, function(localSet) {
        var _localSavedAt = localSet.savedAt || 0;
        extendObject(rawSet, localSet);
        var subset = getSubSettings(rawSet, keys);
        if (chrome.runtime.lastError) {
            subset.error = "Settings sync may not work thoroughly because of: " + chrome.runtime.lastError.message;
        }
        cb(subset);
    });
}

function _applyProxySettings(_proxyConf: unknown) {
}

function _setNewTabUrl(){
    return "about:newtab";
}

type ResponseFn = (message: unknown, sendResponse: (response: unknown) => void, extra: { name: string | null }) => void;

function _getContainerName(self: unknown, _response: ResponseFn) {
    return function (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void){
        const cookieStoreId = (sender.tab as unknown as { cookieStoreId?: string } | undefined)?.cookieStoreId ?? '';
        browser.contextualIdentities.get(cookieStoreId).then(function(container: { name: string }){
            _response(message, sendResponse, {
                name : container.name
            });
        }, function(_err: unknown){
            _response(message, sendResponse, {
                name : null
            });});
    };
}

function getLatestHistoryItem(text: string, maxResults: number, cb: (items: chrome.history.HistoryItem[]) => void) {
    chrome.history.search({
        startTime: 0,
        text,
        maxResults
    }, function(items) {
        cb(items);
    });
}

start({
    name: "Firefox",
    detectTabTitleChange: true,
    getLatestHistoryItem,
    loadRawSettings,
    _applyProxySettings,
    _setNewTabUrl,
    _getContainerName
});

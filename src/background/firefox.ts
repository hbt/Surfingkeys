import {
    extendObject,
    getSubSettings,
    start
} from './start.js';

declare const browser: any;

function loadRawSettings(keys: any, cb: any, defaultSet: any) {
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

function _applyProxySettings(_proxyConf: any) {
}

function _setNewTabUrl(){
    return "about:newtab";
}

function _getContainerName(self: any, _response: any) {
    return function (message: any, sender: any, sendResponse: any){
        var cookieStoreId = sender.tab.cookieStoreId;
        browser.contextualIdentities.get(cookieStoreId).then(function(container: any){
            _response(message, sendResponse, {
                name : container.name
            });
        }, function(_err: any){
            _response(message, sendResponse, {
                name : null
            });});
    };
}

function getLatestHistoryItem(text: any, maxResults: any, cb: any) {
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

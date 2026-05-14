import {
    _save,
    extendObject,
    getSubSettings,
    start
} from './start.js';

function loadRawSettings(keys: any, cb: any, defaultSet: any) {
    var rawSet = defaultSet || {};
    chrome.storage.local.get(null, function(localSet) {
        var localSavedAt = localSet.savedAt || 0;
        chrome.storage.sync.get(null, function(syncSet) {
            var syncSavedAt = syncSet.savedAt || 0;
            if (localSavedAt > syncSavedAt) {
                extendObject(rawSet, localSet);
                _save(chrome.storage.sync, localSet, function() {
                    var subset = getSubSettings(rawSet, keys);
                    if (chrome.runtime.lastError) {
                        subset.error = "Settings sync may not work thoroughly because of: " + chrome.runtime.lastError.message;
                    }
                    cb(subset);
                });
            } else if (localSavedAt < syncSavedAt) {
                extendObject(rawSet, syncSet);
                cb(getSubSettings(rawSet, keys));
                _save(chrome.storage.local, syncSet);
            } else {
                extendObject(rawSet, localSet);
                cb(getSubSettings(rawSet, keys));
            }
        });
    });
}

function _applyProxySettings(_proxyConf: any) {
}

function _setNewTabUrl(){
    return  "favorites://";
}

function _getContainerName(_self: any, _response: any){
}

function getLatestHistoryItem(_text: any, _maxResults: any, _cb: any) {
}

start({
    name: "Safari",
    getLatestHistoryItem,
    loadRawSettings,
    _applyProxySettings,
    _setNewTabUrl,
    _getContainerName
});

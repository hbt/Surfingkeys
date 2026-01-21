import {
    LOG,
    filterByTitleOrUrl,
} from '../common/utils.js';
import {
    _save,
    dictFromArray,
    extendObject,
    getSubSettings,
    start
} from './start.js';
import { installErrorHandlers } from '../common/errorCollector.js';

// Install global error handlers for background script
installErrorHandlers('background');

/**
 * Debug Mode Helper: Opens chrome://extensions tabs when browser is in debug mode
 *
 * This function:
 * 1. Detects if browser is running with remote debugging enabled (CDP on port 9222)
 * 2. Checks if chrome://extensions tabs already exist (avoids duplicates on reload)
 * 3. Opens both required tabs when in debug mode and tabs don't exist:
 *    - chrome://extensions/ (for reload button access)
 *    - chrome://extensions/?errors=<id> (for error extraction)
 *
 * Use case: During development, automatically show extension errors without manual navigation
 */
(async function openExtensionTabsInDebugMode() {
    const extensionId = chrome.runtime.id;

    // 1. Detect debug mode by checking if CDP is available
    const isDebugMode = await detectDebugMode();

    if (!isDebugMode) {
        console.log('[DEBUG HELPER] Not in debug mode, skipping extension tabs');
        return;
    }

    console.log('[DEBUG HELPER] Debug mode detected, checking for existing extension tabs');

    // Open both required tabs
    await openRequiredExtensionTabs(extensionId);
})();

/**
 * Opens both required chrome://extensions tabs if they don't exist
 * @param {string} extensionId - The extension ID
 * @returns {Promise<void>}
 */
async function openRequiredExtensionTabs(extensionId) {
    const extensionsPageUrl = 'chrome://extensions/';
    const errorsPageUrl = `chrome://extensions/?errors=${extensionId}`;

    const promises = [];

    // Check if main extensions page exists
    const existingExtensionsTab = await findExtensionTab(extensionsPageUrl);

    if (!existingExtensionsTab) {
        console.log('[DEBUG HELPER] Creating chrome://extensions tab');
        promises.push(new Promise((resolve, reject) => {
            chrome.tabs.create({ url: extensionsPageUrl, active: false }, (tab) => {
                if (chrome.runtime.lastError) {
                    console.error('[DEBUG HELPER] Failed to open chrome://extensions:', chrome.runtime.lastError.message);
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    console.log('[DEBUG HELPER] Successfully created chrome://extensions tab, ID:', tab?.id);
                    resolve(tab);
                }
            });
        }));
    } else {
        console.log('[DEBUG HELPER] chrome://extensions tab already exists (tab ID:', existingExtensionsTab.id, ')');
    }

    // Check if errors page exists
    const existingErrorsTab = await findExtensionTab(errorsPageUrl);

    if (!existingErrorsTab) {
        console.log('[DEBUG HELPER] Creating chrome://extensions/?errors tab');
        promises.push(new Promise((resolve, reject) => {
            chrome.tabs.create({ url: errorsPageUrl, active: false }, (tab) => {
                if (chrome.runtime.lastError) {
                    console.error('[DEBUG HELPER] Failed to open chrome://extensions/?errors:', chrome.runtime.lastError.message);
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    console.log('[DEBUG HELPER] Successfully created chrome://extensions/?errors tab, ID:', tab?.id);
                    resolve(tab);
                }
            });
        }));
    } else {
        console.log('[DEBUG HELPER] chrome://extensions/?errors tab already exists (tab ID:', existingErrorsTab.id, ')');
    }

    // Wait for all tab creation operations to complete
    await Promise.all(promises);
}

/**
 * Detects if browser is running in debug mode (with remote debugging enabled)
 * Checks if Chrome DevTools Protocol (CDP) is available on port 9222
 *
 * Note: Only checks port 9222 to avoid false positives from headless modes
 *
 * @returns {Promise<boolean>} True if debug mode is detected
 */
async function detectDebugMode() {
    try {
        const response = await fetch('http://localhost:9222/json/version', {
            method: 'GET',
            signal: AbortSignal.timeout(500) // 500ms timeout
        });

        if (response.ok) {
            const data = await response.json();
            console.log('[DEBUG HELPER] CDP detected on port 9222 - Browser:', data.Browser);
            return true;
        }
    } catch (error) {
        // Expected when not in debug mode or port not accessible
    }

    return false;
}

/**
 * Finds existing chrome://extensions tab for a given URL
 *
 * @param {string} targetUrl - The chrome://extensions URL to search for
 * @returns {Promise<chrome.tabs.Tab|null>} Existing tab or null
 */
async function findExtensionTab(targetUrl) {
    return new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => {
            // Chrome doesn't allow extensions to see chrome:// URLs in tab.url
            // So we look for tabs with matching pendingUrl or check if it starts with the target
            const matchingTab = tabs.find(tab =>
                tab.url === targetUrl ||
                tab.pendingUrl === targetUrl ||
                (tab.url && tab.url.startsWith(targetUrl))
            );

            resolve(matchingTab || null);
        });
    });
}

function loadRawSettings(keys, cb, defaultSet) {
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
                // don't sync local path
                delete syncSet.localPath;
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

function _applyProxySettings(proxyConf) {
    if (!proxyConf.proxyMode || proxyConf.proxyMode === 'clear') {
        chrome.proxy.settings.clear({scope: 'regular'});
    } else {
        var autoproxy_pattern = proxyConf.autoproxy_hosts.map(function(h) {
            return h.filter(function(a) {
                return a.indexOf('*') !== -1;
            }).join('|');
        });
        var autoproxy_hosts = proxyConf.autoproxy_hosts.map(function(h) {
            return dictFromArray(h.filter(function(a) {
                return a.indexOf('*') === -1;
            }), 1);
        });
        var config = {
            mode: (["always", "byhost", "bypass"].indexOf(proxyConf.proxyMode) !== -1) ? "pac_script" : proxyConf.proxyMode,
            pacScript: {
                data: `var pacGlobal = {
                        hosts: ${JSON.stringify(autoproxy_hosts)},
                        autoproxy_pattern: ${JSON.stringify(autoproxy_pattern)},
                        proxyMode: '${proxyConf.proxyMode}',
                        proxy: ${JSON.stringify(proxyConf.proxy)}
                    };
                    function FindProxyForURL(url, host) {
                        var lastPos;
                        if (pacGlobal.proxyMode === "always") {
                            return pacGlobal.proxy[0];
                        } else if (pacGlobal.proxyMode === "bypass") {
                            var pp = new RegExp(pacGlobal.autoproxy_pattern[0]);
                            do {
                                if (pacGlobal.hosts[0].hasOwnProperty(host)
                                    || (pacGlobal.autoproxy_pattern[0].length && pp.test(host))) {
                                    return "DIRECT";
                                }
                                lastPos = host.indexOf('.') + 1;
                                host = host.slice(lastPos);
                            } while (lastPos >= 1);
                            return pacGlobal.proxy[0];
                        } else {
                            for (var i = 0; i < pacGlobal.proxy.length; i++) {
                                var pp = new RegExp(pacGlobal.autoproxy_pattern[i]);
                                var ahost = host;
                                do {
                                    if (pacGlobal.hosts[i].hasOwnProperty(ahost)
                                        || (pacGlobal.autoproxy_pattern[i].length && pp.test(ahost))) {
                                        return pacGlobal.proxy[i];
                                    }
                                    lastPos = ahost.indexOf('.') + 1;
                                    ahost = ahost.slice(lastPos);
                                } while (lastPos >= 1);
                            }
                            return "DIRECT";
                        }
                    }`
            }
        };
        chrome.proxy.settings.set( {value: config, scope: 'regular'}, function() {
        });
    }
}

function _setNewTabUrl(){
    return  "chrome://newtab/";
}

function _getContainerName(self, _response){
}

function getLatestHistoryItem(text, maxResults, cb) {
    const caseSensitive = text.toLowerCase() !== text;
    let endTime = new Date().getTime();
    let results = [];
    const impl = (endTime, maxResults, cb) => {
        const prefetch = maxResults * Math.pow(10, Math.min(2, text.length));
        chrome.history.search({
            startTime: 0,
            endTime,
            text: "",
            maxResults: prefetch
        }, function(items) {
            const filtered = filterByTitleOrUrl(items, text, false);
            results = [...results, ...filtered];
            if (items.length < maxResults || results.length >= maxResults) {
                // all items are scanned or we have got what we want
                cb(results.slice(0, maxResults));
            } else {
                endTime = items[items.length-1].lastVisitTime - 0.01;
                impl(endTime, maxResults, cb);
            }
        });
    };

    impl(endTime, maxResults, cb);
}

// Register command listener at top level for Manifest v3 service worker
chrome.commands.onCommand.addListener(function(command) {
    console.log('[COMMAND RECEIVED]', command);
    switch (command) {
        case 'restartext':
            console.log('[RESTARTEXT] Reloading extension in 2 seconds...');
            chrome.tabs.query({}, function(tabs) {
                console.log('[RESTARTEXT] Reloading', tabs.length, 'tabs');
                tabs.forEach(function(tab) {
                    chrome.tabs.reload(tab.id);
                });

                // Delay reload so logs are visible
                console.log('[RESTARTEXT] Extension reload in 2s (check console!)');
                setTimeout(() => {
                    console.log('[RESTARTEXT] Reloading NOW');
                    chrome.runtime.reload();
                }, 2000);
            });
            break;
        case 'previousTab':
        case 'nextTab':
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length > 0) {
                    const tab = tabs[0];
                    const index = (command === 'previousTab') ? tab.index - 1 : tab.index + 1;
                    chrome.tabs.query({ windowId: tab.windowId }, function(tabs) {
                        const newIndex = ((index % tabs.length) + tabs.length) % tabs.length;
                        chrome.tabs.update(tabs[newIndex].id, { active: true });
                    });
                }
            });
            break;
        case 'closeTab':
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.remove(tabs[0].id);
                }
            });
            break;
    }
});

function generatePassword() {
    const random = new Uint32Array(8);
    self.crypto.getRandomValues(random);
    return Array.from(random).join("");
}

let nativeConnected = false;
const nvimServer = {};
function startNative() {
    return new Promise((resolve, reject) => {
        const nm = chrome.runtime.connectNative("surfingkeys");
        const password = generatePassword();
        nm.onDisconnect.addListener((evt) => {
            if (chrome.runtime.lastError) {
                var error = chrome.runtime.lastError.message;
            }
            if (nativeConnected) {
                nvimServer.instance = startNative();
            } else {
                delete nvimServer.instance;
                LOG("warn", "Failed to connect neovim, please make sure your neovim version 0.5 or above.");
            }
        });
        nm.onMessage.addListener(async (resp) => {
            if (resp.status === true) {
                nativeConnected = true;
                if (resp.res.event === "serverStarted") {
                    const url = `127.0.0.1:${resp.res.port}/${password}`;
                    resolve({url, nm});
                }
            } else if (resp.err) {
                LOG("error", resp.err);
            }
        });
        nm.postMessage({
            startServer: true,
            password
        });
    });
}
nvimServer.instance = startNative();

start({
    name: "Chrome",
    detectTabTitleChange: true,
    getLatestHistoryItem,
    loadRawSettings,
    nvimServer,
    _applyProxySettings,
    _setNewTabUrl,
    _getContainerName
});

import {
    filterByTitleOrUrl,
} from '../common/utils.js';
import llmClientsRaw from './llm.js';
const llmClients: any = llmClientsRaw;
import type { RuntimeAction } from '../../@types/surfingkeys';

// TEMPORARY ERROR FOR TESTING RELOAD EDGE CASE
// throw new Error('TEST ERROR: Simulating background script failure');

function request(url: any, onReady: any, headers?: any, data?: any, onException?: any) {
    headers = headers || {};
    const CHARTSET_RE = /(?:charset|encoding)\s*=\s*['"]? *([\w\-]+)/i;

    fetch(url, {
        method: (data !== undefined) ? "POST" : "GET",
        headers,
        body: data,
    }).then(res => {
        const cs = res.headers.get('content-type') ? res.headers.get('content-type')!.match(CHARTSET_RE) : [];

        return Promise.all([
            Promise.resolve(cs && cs.length > 1 ? cs[1] : "utf-8"),
            res.arrayBuffer()
        ]);
    }).then(res => {
        const decoder = new TextDecoder(res[0]);
        const content = decoder.decode(res[1]);
        onReady(content);
    }).catch(exp => {
        if (onException) {
            onException(exp);
        }
    });
}

function dictFromArray(arry: any, val: any) {
    var dict: Record<string, any> = {};
    arry.forEach(function(h: any) {
        dict[h] = val;
    });
    return dict;
}

function extendObject(target: any, ss: any) {
    for (var k in ss) {
        target[k] = ss[k];
    }
}

function getSubSettings(set: any, keys: any) {
    var subset;
    if (!keys) {
        // if null/undefined/""
        subset = set;
    } else {
        if ( !(keys instanceof Array) ) {
            keys = [ keys ];
        }
        subset = {};
        keys.forEach(function(k: any) {
            subset[k] = set[k];
        });
    }
    return subset;
}

function _save(storage: any, data: any, cb?: any) {
    if (storage === chrome.storage.sync) {
        // don't store snippets from localPath into sync storage, since sync storage has its quota.
        if (data.localPath) {
            delete data.snippets;
            delete data.localPath;
        }
        if (Object.keys(data).length > 1) {
            storage.set(data, cb);
        }
    } else {
        if (data.localPath) {
            delete data.snippets;
            // try to fetch snippets from localPath and cache it in local storage.
            request(data.localPath, function(resp: any) {
                data.snippets = resp;
                storage.set(data, cb);
            });
        } else {
            storage.set(data, cb);
        }
    }
}

var Gist = (function() {
    var self: any = {};

    function _initGist(token: any, magic_word: any, onGistReady: any) {
        request("https://api.github.com/gists", function(res: any) {
            var gists = JSON.parse(res);
            var gist = "";
            gists.forEach(function(g: any) {
                if (g.hasOwnProperty('description') && g['description'] === magic_word && g.files.hasOwnProperty(magic_word)) {
                    gist = g.id;
                }
            });
            if (gist === "") {
                request("https://api.github.com/gists", function(res: any) {
                    var ng = JSON.parse(res);
                    onGistReady(ng.id);
                }, {
                    'Authorization': 'token ' + token
                }, `{ "description": "${magic_word}", "public": false, "files": { "${magic_word}": { "content": "${magic_word}" } } }`);
            } else {
                onGistReady(gist);
            }
        }, {
            'Authorization': 'token ' + token
        });
    }

    var _token: any, _gist = "", _comments: any[] = [];
    self.initGist = function(token: any, onGistReady: any) {
        if (_token === token && _gist !== "") {
            return _gist;
        } else {
            _token = token;
            _initGist(_token, "cloudboard", function(gist: any) {
                _gist = gist;
                if (onGistReady) {
                    onGistReady(_gist);
                }
            });
        }
    };

    function _newComment(text: any, cb: any) {
        request(`https://api.github.com/gists/${_gist}/comments`, function(res: any) {
            if (cb) {
                cb(res);
            }
        }, {
            'Authorization': 'token ' + _token
        }, `{"body": "${encodeURIComponent(text)}"}`);
    }
    function _readComment(cid: any, cb: any) {
        request(`https://api.github.com/gists/${_gist}/comments/${cid}`, function(res: any) {
            var comment = JSON.parse(res);
            cb({status: 0, content: decodeURIComponent(comment.body)});
        }, {
            'Authorization': 'token ' + _token
        });
    }
    function _listComment(cb: any) {
        request(`https://api.github.com/gists/${_gist}/comments`, function(res: any) {
            _comments = JSON.parse(res).map(function(c: any) {
                return c.id;
            });
            cb(_comments);
        }, {
            'Authorization': 'token ' + _token
        });
    }
    function _writeComment(cid: any, clip: any, cb: any) {
        request(`https://api.github.com/gists/${_gist}/comments/${cid}`, function(res: any) {
            if (cb) {
                cb(res);
            }
        }, {
            'Authorization': 'token ' + _token
        }, `{"body": "${encodeURIComponent(clip)}"}`);
    }
    self.readComment = function(nr: any, cb: any) {
        if (_gist === "") {
            cb({status: 1, content: "Please call initGist first!"});
        } else if (nr >= _comments.length) {
            _listComment(function(cmts: any) {
                if (nr < cmts.length) {
                    _readComment(cmts[nr], cb);
                } else {
                    cb({status: 1, content: "Register not exists!"});
                }
            });
        } else {
            _readComment(_comments[nr], cb);
        }
    };
    self.editComment = function(nr: any, clip: any, cb: any) {
        if (_gist === "") {
            cb({status: 1, content: "Please call initGist first!"});
        } else if (nr >= _comments.length) {
            _listComment(function(cmts: any) {
                if (nr < cmts.length) {
                    _writeComment(cmts[nr], clip, cb);
                } else {
                    var toCreate = nr - cmts.length + 1;
                    function cbAfterCreated() {
                        toCreate --;
                        if (toCreate > 0) {
                            _newComment(".", cbAfterCreated);
                        } else if (toCreate === 0) {
                            _newComment(clip, cb);
                        }
                    }
                    cbAfterCreated();
                }
            });
        } else {
            _writeComment(_comments[nr], clip, cb);
        }
    };

    return self;
})();

function start(browser: any) {
    var self: any = {};

    const isMV3 = chrome.runtime.getManifest().manifest_version === 3;
    const SETTINGS_SNIPPET_SCRIPT_ID = 'settingsSnippets';
    const extensionRootUrl = chrome.runtime.getURL("/");
    let userScriptsWorldConfigured = false;
    let snippetScriptCodeCache: string | null | undefined = undefined;
    let snippetSyncChain = Promise.resolve();

    // Expose snippet sync chain for testing/debugging (eliminates arbitrary waitAfterSetMs delays in tests)
    if (typeof globalThis !== 'undefined') {
        Object.defineProperty(globalThis, '_snippetSyncChain', {
            get: () => snippetSyncChain,
            configurable: false,
            enumerable: false
        });

        (globalThis as any)._isConfigReady = async function() {
            try {
                await snippetSyncChain;
                return true;
            } catch (error) {
                console.error('[CONFIG] Snippet sync failed:', error);
                (globalThis as any)._configLoadError = error;
                return false;
            }
        };
    }

    // Cache the most recent advanced/snippet settings so we can diff across async callers.
    const snippetSettingsSnapshot = {
        showAdvanced: false,
        snippets: ''
    };

    function rememberSnippetSettings(partial: any) {
        if (!partial) {
            return;
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'showAdvanced')) {
            snippetSettingsSnapshot.showAdvanced = partial.showAdvanced;
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'snippets')) {
            snippetSettingsSnapshot.snippets = partial.snippets || '';
        }
    }

    function ensureSettingsSnippetRegistration(partial: any) {
        if (!isMV3) {
            return Promise.resolve();
        }
        debugLog('snippet-reg', `started showAdvanced=${partial && partial.showAdvanced}`); console.log(`[snippet-reg] started showAdvanced=${partial && partial.showAdvanced}`);
        rememberSnippetSettings(partial);
        const userScriptsAvailable = isUserScriptsAvailable();
        debugLog('snippet-reg', `userScripts available: ${userScriptsAvailable}`); console.log(`[snippet-reg] userScripts available: ${userScriptsAvailable}`);
        if (!userScriptsAvailable) {
            snippetScriptCodeCache = null;
            return Promise.resolve();
        }
        snippetSyncChain = snippetSyncChain.then(() => syncSettingsSnippets()).catch((error) => {
            console.warn('[userScripts] Failed to sync settings snippets', error);
            throw error;  // Re-throw to propagate to globalThis._isConfigReady()
        });

        // Log completion for debugging (helps verify timing in tests)
        if (typeof globalThis !== 'undefined' && (globalThis as any)._snippetSyncChain) {
            snippetSyncChain.then(() => {
                console.log('[CONFIG] Snippet registration complete');
            }).catch(() => {
                // Error already logged above
            });
        }

        return snippetSyncChain;
    }

    function callUserScriptsApi(method: any, ...args: any[]): Promise<any> {
        if (!chrome.userScripts || typeof (chrome.userScripts as any)[method] !== 'function') {
            return Promise.reject(new Error('chrome.userScripts API unavailable'));
        }
        return new Promise((resolve, reject) => {
            try {
                (chrome.userScripts as any)[method](...args, (result: any) => {
                    const lastError = chrome.runtime.lastError;
                    if (lastError) {
                        reject(new Error(lastError.message));
                    } else {
                        resolve(result);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async function ensureUserScriptsWorldConfigured() {
        if (userScriptsWorldConfigured) {
            return;
        }
        await callUserScriptsApi('configureWorld', {
            csp: "script-src 'self' 'unsafe-eval'",
            messaging: true
        });
        userScriptsWorldConfigured = true;
    }

    function buildSettingsSnippetCode(snippets: any) {
        return `import('./api.js').then((module) => {module.default("${extensionRootUrl}", (api, settings) => {${snippets}\n})});`;
    }

    async function readRegisteredSnippetCode() {
        try {
            const scripts = await callUserScriptsApi('getScripts', { ids: [SETTINGS_SNIPPET_SCRIPT_ID] });
            if (scripts && scripts.length > 0 && scripts[0].js && scripts[0].js.length > 0) {
                return scripts[0].js[0].code || null;
            }
        } catch (error) {
            console.warn('[userScripts] Failed to inspect existing settings snippet', error);
        }
        return null;
    }

    async function unregisterSettingsSnippet() {
        try {
            await callUserScriptsApi('unregister', { ids: [SETTINGS_SNIPPET_SCRIPT_ID] });
        } catch (error) {
            // Ignore attempts to unregister non-existent scripts; log others.
            if (!/not found|exists/i.test((error as Error).message)) {
                console.warn('[userScripts] Failed to unregister settings snippet', error);
            }
        }
    }

    async function registerSettingsSnippet(code: any) {
        await callUserScriptsApi('register', [{
            allFrames: true,
            id: SETTINGS_SNIPPET_SCRIPT_ID,
            matches: ['*://*/*', 'file:///*'],
            js: [{ code }]
        }]);
    }

    async function syncSettingsSnippets() {
        debugLog('sync-snippets', 'started'); console.log('[sync-snippets] started');
        if (!isUserScriptsAvailable()) {
            snippetScriptCodeCache = null;
            return;
        }

        if (typeof snippetScriptCodeCache === 'undefined') {
            snippetScriptCodeCache = await readRegisteredSnippetCode();
        }

        const snippets = typeof snippetSettingsSnapshot.snippets === 'string' ? snippetSettingsSnapshot.snippets : '';
        const hasSnippets = snippets.trim().length > 0;
        const shouldRegister = snippetSettingsSnapshot.showAdvanced && hasSnippets;

        if (!shouldRegister) {
            if (snippetScriptCodeCache) {
                await unregisterSettingsSnippet();
            }
            snippetScriptCodeCache = null;
            return;
        }

        await ensureUserScriptsWorldConfigured();

        const desiredCode = buildSettingsSnippetCode(snippets);
        debugLog('sync-snippets', `code built length=${desiredCode.length}`); console.log(`[sync-snippets] code built length=${desiredCode.length}`);
        if (snippetScriptCodeCache === desiredCode) {
            return;
        }

        if (snippetScriptCodeCache) {
            await unregisterSettingsSnippet();
        }
        try {
            await registerSettingsSnippet(desiredCode);
            snippetScriptCodeCache = desiredCode;
            debugLog('sync-snippets', 'registered ok'); console.log('[sync-snippets] registered ok');
        } catch (err) {
            debugLog('sync-snippets', `register error: ${err && (err as Error).message}`); console.log(`[sync-snippets] register error: ${err && (err as Error).message}`);
            throw err;
        }
    }

    var tabHistory: number[] = [],
        tabHistoryIndex = 0,
        chromelikeNewTabPosition = 0,
        historyTabAction = false;

    // data by tab id
    var tabActivated: Record<string, any> = {},
        tabMessages = {},
        tabURLs = {};

    var conf: any = {
        llm: { },
        focusAfterClosed: "right",
        tabsMRUOrder: true,
        newTabPosition: 'default',
        newTabUrl: browser._setNewTabUrl(),
        showTabIndices: true,
        interceptedErrors: []
    };

    var bookmarkFolders: { id: any; title: string }[] = [];
    function getFolders(tree: any, root: any) {
        var cd = root;
        if (tree.title !== "" && (!tree.hasOwnProperty('url') || tree.url === undefined)) {
            cd += "/" + tree.title;
            bookmarkFolders.push({id: tree.id, title: cd + "/"});
        }
        if (tree.hasOwnProperty('children')) {
            for (var i = 0; i < tree.children.length; ++i) {
                getFolders(tree.children[i], cd);
            }
        }
    }

    function createBookmark(page: any, onCreated: any) {
        if (page.path.length) {
            chrome.bookmarks.create({
                'parentId': page.folder,
                'title': page.path.shift()
            }, function(newFolder) {
                page.folder = newFolder.id;
                createBookmark(page, onCreated);
            });
        } else {
            chrome.bookmarks.create({
                'parentId': page.folder,
                'title': page.title,
                'url': page.url
            }, function(ret) {
                onCreated(ret);
            });
        }
    }

    function debugLog(context: any, message: any, data?: any) {
        fetch(`http://localhost:${__CONFIG_SERVER_PORT__}/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context, message, data, timestamp: Date.now() })
        }).catch(() => {});
    }

    function loadSettings(keys: any, cb: any) {
        debugLog('loadSettings', 'started'); console.log('[loadSettings] started');
        var tmpSet = {
            blocklist: {},
            marks: {},
            findHistory: [],
            cmdHistory: [],
            sessions: {},
            proxyMode: 'clear',
            autoproxy_hosts: [],
            proxy: []
        };

        browser.loadRawSettings(keys, async function(set: any) {
            if (typeof(set.proxy) === "string") {
                set.proxy = [set.proxy];
                set.autoproxy_hosts = [set.autoproxy_hosts];
            }

            const LOCAL_SERVER = `http://localhost:${__CONFIG_SERVER_PORT__}/config`;
            try {
                const resp = await fetch(LOCAL_SERVER);
                if (!resp.ok) {
                    debugLog('config-fetch', `failed status=${resp.status}`); console.log(`[config-fetch] failed status=${resp.status}`);
                }
                if (resp.ok) {
                    const snippets = await resp.text();
                    debugLog('config-fetch', `ok snippetsLength=${snippets.length}`); console.log(`[config-fetch] ok snippetsLength=${snippets.length}`);
                    cb({ ...set, snippets, localPath: LOCAL_SERVER, showAdvanced: true });
                    // Confirm delivery to server (fire-and-forget, non-blocking)
                    fetch(`http://localhost:${__CONFIG_SERVER_PORT__}/loaded`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ snippetsLength: snippets.length })
                    }).catch(() => {});
                    return;
                }
            } catch (_) {
                console.warn('[config-server] Server unreachable at', LOCAL_SERVER, '— user config not loaded');
                // Try to send the banner to the currently active tab immediately.
                // _tabActivated may have already fired before this catch ran (race condition),
                // so we can't rely solely on the deferred flag.
                chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                    if (tabs && tabs.length > 0) {
                        sendTabMessage(tabs[0].id, 0, {
                            subject: 'showBanner',
                            message: `Config server unreachable (localhost:${__CONFIG_SERVER_PORT__}) — user config not loaded. Run: ./bin/dbg server-start`,
                        });
                    } else {
                        _configServerWarningPending = true;
                    }
                });
                // server not running, fall through to normal localPath handling
            }

            if (set.localPath) {
                request(appendNonce(set.localPath), function(resp: any) {
                    set.snippets = resp;
                    cb(set);
                }, undefined, undefined, function (_po: any) {
                    // failed to read snippets from localPath
                    set.error = "Failed to read snippets from " + set.localPath;
                    cb(set);
                });
            } else {
                cb(set);
            }
        }, tmpSet);
    }

    loadSettings(null, function(initialSettings: any) {
        browser._applyProxySettings(initialSettings);
        ensureSettingsSnippetRegistration({
            showAdvanced: Boolean(initialSettings && initialSettings.showAdvanced),
            snippets: (initialSettings && typeof initialSettings.snippets === 'string') ? initialSettings.snippets : ''
        });
    });

    function removeTab(tabId: any) {
        delete tabActivated[tabId];
        delete (tabMessages as any)[tabId];
        delete (tabURLs as any)[tabId];
        tabHistory = tabHistory.filter(function(e) {
            return e !== tabId;
        });
        if (_queueURLs.length) {
            chrome.tabs.create({
                active: false,
                url: _queueURLs.shift()
            });
        }

        _updateTabIndices();
    }
    chrome.tabs.onRemoved.addListener(removeTab);
    function _setScrollPos_bg(tabId: any) {
        if (tabMessages.hasOwnProperty(tabId)) {
            const message = (tabMessages as any)[tabId];
            sendTabMessage(tabId, 0, {
                subject: "setScrollPos",
                scrollLeft: message.scrollLeft,
                scrollTop: message.scrollTop
            });
            delete (tabMessages as any)[tabId];
        }
    }

    function sendTabMessage(tabId: any, frameId: any, message: any) {
        const opts = (frameId === -1) ? undefined : {frameId: frameId};
        // use catch to suppress Uncaught (in promise) Error on sending message to unsupported tabs like chrome://
        const p = chrome.tabs.sendMessage(tabId, message, opts);
        if (p) {
            p.catch((_e) => {});
        }
    }
    var _lastActiveTabId: any = null;
    let _configServerWarningPending = false;
    function _tabActivated(tabId: any) {
        if (_configServerWarningPending) {
            _configServerWarningPending = false;
            sendTabMessage(tabId, 0, {
                subject: 'showBanner',
                message: `Config server unreachable (localhost:${__CONFIG_SERVER_PORT__}) — user config not loaded. Run: ./bin/dbg server-start`,
            });
        }
        if (_lastActiveTabId !== tabId) {
            if (_lastActiveTabId !== null) {
                sendTabMessage(_lastActiveTabId, 0, {
                    subject: 'tabDeactivated'
                });
            }
            sendTabMessage(tabId, 0, {
                subject: 'tabActivated'
            });
            _lastActiveTabId = tabId;
        }
    }

    // Track tabs redirected from newtab to focus page content after load
    const newTabRedirectedTabs = new Set();

    chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
        if (changeInfo.status === "complete") {
            if (tab.active) {
                _tabActivated(tabId);
            }
            // Focus page content for redirected newtab tabs
            if (newTabRedirectedTabs.has(tabId)) {
                newTabRedirectedTabs.delete(tabId);
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: () => document.body.focus()
                }).catch(() => {});
            }
        }
        if (browser.detectTabTitleChange && changeInfo.title) {
            sendTabMessage(tabId, 0, {
                subject: 'titleChanged',
                changeInfo
            });
        }
    });
    chrome.windows.onFocusChanged.addListener(function(_w) {
        getActiveTab(function(tab: any) {
            _tabActivated(tab.id);
        });
    });

    chrome.tabs.onCreated.addListener(function(tab) {
        _updateTabIndices();
        // Redirect chrome://newtab/ to configured newTabUrl (e.g., google.com)
        const tabUrl = tab.pendingUrl || tab.url;
        if (tabUrl === "chrome://newtab/") {
            // Check storage for user-configured newTabUrl, fall back to conf.newTabUrl
            chrome.storage.local.get('newTabUrl', function(data) {
                const targetUrl = data.newTabUrl || conf.newTabUrl;
                if (targetUrl !== "chrome://newtab/") {
                    newTabRedirectedTabs.add(tab.id);
                    chrome.tabs.update(tab.id, { url: targetUrl });
                }
            });
        }
    });
    chrome.tabs.onMoved.addListener(function() {
        _updateTabIndices();
    });
    chrome.tabs.onActivated.addListener(function(activeInfo) {
        if (!historyTabAction && activeInfo.tabId != tabHistory[tabHistory.length - 1]) {
            if (tabHistory.length > 10) {
                tabHistory.shift();
            }
            if (tabHistoryIndex != tabHistory.length - 1) {
                tabHistory.splice(tabHistoryIndex + 1, tabHistory.length - 1);
            }
            tabHistory.push(activeInfo.tabId);
            tabHistoryIndex = tabHistory.length - 1;
        }
        tabActivated[activeInfo.tabId] = new Date().getTime();
        _tabActivated(activeInfo.tabId);
        historyTabAction = false;
        chromelikeNewTabPosition = 0;

        _updateTabIndices();
    });
    chrome.tabs.onDetached.addListener(function() {
        _updateTabIndices();
    });
    chrome.tabs.onAttached.addListener(function() {
        _updateTabIndices();
    });

    function getActiveTab(cb: any) {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs.length > 0) {
                cb(tabs[0]);
            }
        });
    }
    chrome.commands.onCommand.addListener(function(command) {
        console.log('[COMMAND RECEIVED]', command);
        switch (command) {
            case 'restartext':
                console.log('[RESTARTEXT] Reloading extension...');
                chrome.tabs.query({}, function(tabs) {
                    console.log('[RESTARTEXT] Reloading', tabs.length, 'tabs');
                    tabs.forEach(function(tab) {
                        chrome.tabs.reload(tab.id!);
                    });
                    chrome.runtime.reload();
                });
                break;
            case 'previousTab':
            case 'nextTab':
                getActiveTab(function(tab: any) {
                    var index = (command === 'previousTab') ? tab.index - 1 : tab.index + 1;
                    chrome.tabs.query({ windowId: tab.windowId }, function(tabs) {
                        index = ((index % tabs.length) + tabs.length) % tabs.length;
                        chrome.tabs.update(tabs[index].id, { active: true });
                    });
                });
                break;
            case 'closeTab':
                getActiveTab(function(tab: any) {
                    chrome.tabs.remove(tab.id);
                });
                break;
            case 'proxyThis':
                getActiveTab(function(tab: any) {
                    var host = new URL(tab.url || tab.pendingUrl).host;
                    updateProxy({
                        host: host,
                        operation: "toggle"
                    }, function() {
                        chrome.tabs.reload(tab.id, {
                            bypassCache: true
                        });
                    });
                });
                break;
            default:
                break;
        }
    });

    self.pendingPorts = [];
    function _response(message: any, sendResponse: any, result: any) {
        var idx = self.pendingPorts.indexOf(message);
        if (idx !== -1) {
            self.pendingPorts.splice(idx, 1);
        }
        sendResponse(result);
    }
    function handleMessage(_message: RuntimeAction, _sender: chrome.runtime.MessageSender, _sendResponse: (response?: unknown) => void) {
        if (self.hasOwnProperty(_message.action)) {
            var result = self[_message.action](_message, _sender, _sendResponse);
            if (_message.needResponse) {
                if (result) {
                    _sendResponse(result);
                    _message.needResponse = false;
                } else {
                    self.pendingPorts.push(_message);
                    // An asynchronous response will be sent using sendResponse later.
                }
                return _message.needResponse;
            }
        } else {
            console.log("[unexpected runtime message] " + JSON.stringify(_message));
        }
    }
    chrome.runtime.onMessage.addListener(handleMessage);
    if (isMV3) {
        chrome.runtime.onUserScriptMessage.addListener((m, s, r) => {
            m.fromUserScript = true;
            handleMessage(m, s, r);
        });
        chrome.runtime.onInstalled.addListener((_e) => {
            if (isUserScriptsAvailable()) {
                chrome.userScripts.configureWorld({
                    csp: 'script-src \'self\' \'unsafe-eval\'',
                    messaging: true
                });
            }
        });
    }

    // CDP Message Bridge - Exposes message dispatch for testing
    // This allows CDP to send messages through the same infrastructure
    // that chrome.runtime.sendMessage uses, but accessible from global scope
    if (typeof globalThis !== 'undefined') {
        (globalThis as any).__CDP_MESSAGE_BRIDGE__ = {
            /**
             * Send a message through the extension's message handling system
             * @param {string} action - The action/handler name (e.g., 'cdpReloadExtension')
             * @param {object} payload - Additional message data
             * @param {boolean} expectResponse - Whether to wait for a response
             * @returns {*} The handler's return value
             */
            dispatch: function(action: any, payload: any, expectResponse: any) {
                console.log('[CDP-BRIDGE] Dispatching action:', action);

                if (!self.hasOwnProperty(action)) {
                    console.error('[CDP-BRIDGE] No handler registered for action:', action);
                    console.log('[CDP-BRIDGE] Available actions:', Object.keys(self).filter(k => typeof self[k] === 'function'));
                    return { error: 'Handler not found', action: action };
                }

                // Create message object matching the extension's message format
                var message = {
                    action: action,
                    needResponse: expectResponse || false
                };

                // Merge payload into message
                if (payload) {
                    for (var key in payload) {
                        if (payload.hasOwnProperty(key)) {
                            (message as any)[key] = payload[key];
                        }
                    }
                }

                // Create mock sender (represents CDP as sender)
                var sender = {
                    id: chrome.runtime.id,
                    url: 'cdp://testing',
                    origin: 'cdp'
                };

                // Create response handler
                var responseData = null;
                var sendResponse = function(response: any) {
                    responseData = response;
                    console.log('[CDP-BRIDGE] Handler response:', JSON.stringify(response));
                };

                // Dispatch through the normal message handler
                try {
                    var result = handleMessage(message, sender, sendResponse);
                    console.log('[CDP-BRIDGE] Dispatch complete');
                    return responseData || result;
                } catch (error) {
                    console.error('[CDP-BRIDGE] Error during dispatch:', error);
                    return { error: (error as Error).message, action: action };
                }
            },

            /**
             * List all available message handlers
             * @returns {string[]} Array of handler names
             */
            listActions: function() {
                return Object.keys(self).filter(function(key) {
                    return typeof self[key] === 'function';
                });
            }
        };

        console.log('[CDP-BRIDGE] Message bridge initialized');
        console.log('[CDP-BRIDGE] Available actions:', (globalThis as any).__CDP_MESSAGE_BRIDGE__.listActions().length);
    }

    function _updateSettings(diffSettings: any, afterSet: any) {
        diffSettings.savedAt = new Date().getTime();
        _save(chrome.storage.local, diffSettings, function() {
            _save(chrome.storage.sync, diffSettings, function() {
                if (chrome.runtime.lastError) {
                    var _error = chrome.runtime.lastError.message;
                }
            });
            if (afterSet) {
                afterSet();
            }
        });
    }

    function _broadcastSettings(data: any) {
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(function(tab) {
                sendTabMessage(tab.id, -1, {
                    subject: 'settingsUpdated',
                    settings: data
                });
            });
        });
    }

    function _updateAndPostSettings(diffSettings: any, afterSet?: any) {
        _broadcastSettings(diffSettings);
        if (isMV3 && diffSettings && (Object.prototype.hasOwnProperty.call(diffSettings, 'snippets')
            || Object.prototype.hasOwnProperty.call(diffSettings, 'showAdvanced'))) {
            ensureSettingsSnippetRegistration(diffSettings);
        }
        _updateSettings(diffSettings, afterSet);
    }

    function _updateTabIndices() {
        if (conf.showTabIndices) {
            chrome.tabs.query({currentWindow: true}, function(tabs) {
                tabs.forEach(function(tab) {
                    sendTabMessage(tab.id, 0, {
                        subject: "tabIndexChange",
                        index: tab.index + 1
                    });
                });
            });
        }
    }

    function getSenderUrl(sender: any) {
        // use the tab's url if sender is a frame with blank url.
        return (sender.frameId !== 0 && sender.url === "about:blank") ? sender.tab.url : sender.url;
    }
    function _getState(set: any, url: any, blocklistPattern: any, lurkingPattern: any) {
        if (set.blocklist['.*']) {
            return "disabled";
        }
        if (url) {
            if (set.blocklist[url.origin]) {
                return "disabled";
            }
            if (blocklistPattern) {
                blocklistPattern = new RegExp(blocklistPattern.source, blocklistPattern.flags);
                if (blocklistPattern.test(url.href)) {
                    return "disabled";
                }
            }
            if (lurkingPattern) {
                lurkingPattern = new RegExp(lurkingPattern.source, lurkingPattern.flags);
                if (lurkingPattern.test(url.href)) {
                    return "lurking";
                }
            }
        }
        return "enabled";
    }
    self.toggleBlocklist = function(message: any, sender: any, sendResponse: any) {
        loadSettings('blocklist', function(data: any) {
            var origin = ".*";
            var senderOrigin = sender.origin || new URL(getSenderUrl(sender)).origin;
            if (chrome.runtime.getURL("/").indexOf(senderOrigin) !== 0 && senderOrigin !== "null") {
                origin = senderOrigin;
            }
            if (data.blocklist.hasOwnProperty(origin)) {
                delete data.blocklist[origin];
            } else {
                data.blocklist[origin] = 1;
            }
            _updateAndPostSettings({blocklist: data.blocklist}, function() {
                sendResponse({
                    state: _getState(data, sender.tab ? new URL(getSenderUrl(sender)) : null, message.blocklistPattern, message.lurkingPattern),
                    blocklist: data.blocklist,
                    url: origin
                });
            });
        });
    };
    self.restoreFocusHack = function(_message: any, _sender: any, _sendResponse: any) {
        // Tab switch hack to restore focus to page content
        // Quick switch to another tab and back forces Chrome to focus page
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs.length === 0) return;
            var currentTab = tabs[0];
            chrome.tabs.query({ windowId: currentTab.windowId }, function(allTabs) {
                if (allTabs.length > 1) {
                    var otherTab = allTabs.find(function(t) { return t.id !== currentTab.id; });
                    if (otherTab) {
                        chrome.tabs.update(otherTab.id, { active: true }, function() {
                            chrome.tabs.update(currentTab.id, { active: true });
                        });
                    }
                }
            });
        });
    };
    self.toggleMouseQuery = function(message: any, sender: any, _sendResponse: any) {
        loadSettings('mouseSelectToQuery', function(data: any) {
            if (sender.tab && sender.tab.url.indexOf(chrome.runtime.getURL("/")) !== 0) {
                var mouseSelectToQuery = data.mouseSelectToQuery || [];
                var idx = mouseSelectToQuery.indexOf(message.origin);
                if (idx === -1) {
                    mouseSelectToQuery.push(message.origin);
                } else {
                    mouseSelectToQuery.splice(idx, 1);
                }
                _updateAndPostSettings({mouseSelectToQuery: mouseSelectToQuery});
            }
        });
    };
    self.getState = function(message: any, sender: any, sendResponse: any) {
        loadSettings(['blocklist', 'noPdfViewer', 'proxyMode', 'proxy'], function(data: any) {
            if (sender.tab) {
                _response(message, sendResponse, {
                    noPdfViewer: data.noPdfViewer,
                    proxyMode: data.proxyMode,
                    proxy: data.proxy,
                    state: _getState(data, new URL(getSenderUrl(sender)), message.blocklistPattern, message.lurkingPattern)
                });
            }
        });
    };

    self.addVIMark = function(message: any, _sender: any, _sendResponse: any) {
        loadSettings('marks', function(data: any) {
            extendObject(data.marks, message.mark);
            _updateAndPostSettings({marks: data.marks});
        });
    };
    self.jumpVIMark = function(message: any, sender: any, sendResponse: any) {
        loadSettings("marks", function(data: any) {
            var marks = data.marks;
            if (marks.hasOwnProperty(message.mark)) {
                var markInfo = marks[message.mark];
                chrome.tabs.query({}, function(tabs) {
                    tabs = tabs.filter(function(t) {
                        return t.url === markInfo.url;
                    });

                    if (tabs.length === 0) {
                        markInfo.tab = {
                            tabbed: true,
                            active: true
                        };
                        self.openLink(markInfo, sender, sendResponse);
                    } else {
                        if (markInfo.scrollLeft || markInfo.scrollTop) {
                            (tabMessages as any)[tabs[0].id!] = {
                                scrollLeft: markInfo.scrollLeft,
                                scrollTop: markInfo.scrollTop
                            };
                        }
                        if (tabs[0].id === sender.tab.id) {
                            _setScrollPos_bg(tabs[0].id!);
                        } else {
                            chrome.tabs.update(tabs[0].id!, {
                                active: true
                            });
                        }
                    }
                });
            }
        });
    };

    function appendNonce(url: any) {
        if (/https?:\/\//.test(url)) {
            url = url.replace(/\?$/, "");
            let u = new URL(url);
            let con = u.search ? "&" : "?";
            url = `${url}${con}nonce=${new Date().getTime()}`;
        }
        return url;
    }

    function _loadSettingsFromUrl(url: any, cb: any) {
        request(appendNonce(url), function(resp: any) {
            _updateAndPostSettings({localPath: url, snippets: resp});
            cb({status: "Succeeded", snippets: resp});
        }, undefined, undefined, function (_po: any) {
            cb({status: "Failed"});
        });
    };

    self.resetSettings = function(message: any, sender: any, sendResponse: any) {
        chrome.storage.local.clear();
        chrome.storage.sync.clear();
        loadSettings(null, function(data: any) {
            browser._applyProxySettings(data);
            _response(message, sendResponse, {
                settings: data
            });
            _broadcastSettings(data);
            ensureSettingsSnippetRegistration({
                showAdvanced: Boolean(data && data.showAdvanced),
                snippets: (data && typeof data.snippets === 'string') ? data.snippets : ''
            });
        });
    };
    self.cdpReloadExtension = function(message: any, sender: any, sendResponse: any) {
        console.log('[CDP-RELOAD] Reload request received via message');
        // Send response immediately before reload
        _response(message, sendResponse, {
            status: 'reload_initiated',
            timestamp: Date.now()
        });
        // Trigger reload after a short delay to ensure response is sent
        setTimeout(function() {
            console.log('[CDP-RELOAD] Triggering chrome.runtime.reload()');
            chrome.runtime.reload();
        }, 100);
    };
    self.userLog = function(message: any, sender: any, sendResponse: any) {
        const prefix = message.fromUserScript ? '[USER-SCRIPT]' : '[CONTENT]';
        console.log(prefix, message.msg);
        if (message.needResponse) {
            sendResponse({ logged: true, timestamp: Date.now() });
        }
    };
    self.loadSettingsFromUrl = function(message: any, sender: any, sendResponse: any) {
        _loadSettingsFromUrl(message.url, function(status: any) {
            _response(message, sendResponse, status);
        });
    };
    function _filterByTitleOrUrl(tabs: any, query: any) {
        tabs = tabs.filter(function(b: any) {
            return b.url;
        });
        return filterByTitleOrUrl(tabs, query, false);
    }
    self.getRecentlyClosed = function(message: any, sender: any, sendResponse: any) {
        chrome.sessions.getRecentlyClosed({}, function(sessions) {
            var tabs: any[] = [];
            for (var i = 0; i < sessions.length; i ++) {
                var s = sessions[i];
                if (s.hasOwnProperty('window')) {
                    tabs = tabs.concat(s.window!.tabs);
                } else if (s.hasOwnProperty('tab')) {
                    tabs.push(s.tab!);
                }
            }
            tabs = _filterByTitleOrUrl(tabs, message.query);
            _response(message, sendResponse, {
                urls: tabs
            });
        });
    };
    self.getTopSites = function(message: any, sender: any, sendResponse: any) {
        if (chrome.topSites) {
            chrome.topSites.get(function(urls) {
                urls = _filterByTitleOrUrl(urls, message.query);
                _response(message, sendResponse, {
                    urls: urls
                });
            });
        } else {
            _response(message, sendResponse, {
                urls: []
            });
        }
    };


    function _getHistory(text: any, maxResults: any, cb: any, sortByMostUsed: any) {
        browser.getLatestHistoryItem(text, maxResults, (items: any) => {
            if (sortByMostUsed) {
                items = items.sort(function(a: any, b: any) {
                    return b.visitCount - a.visitCount;
                });
            }
            cb(items);
        });
    }
    self.getAllURLs = function(message: any, sender: any, sendResponse: any) {
        chrome.bookmarks.search(message.query || {}, function(bmItems) {
            var urls = bmItems,
                requestCount = message.maxResults || 100;
            var maxResults = requestCount - urls.length;
            if (maxResults > 0) {
                _getHistory(message.query || "", maxResults,  function(historyItems: any) {
                    urls = urls.concat(historyItems);
                    _response(message, sendResponse, {
                        urls: urls
                    });
                }, true);
            } else {
                _response(message, sendResponse, {
                    urls: urls.slice(0, requestCount)
                });
            }
        });
    };
    self.getTabs = function(message: any, sender: any, sendResponse: any) {
        var tab = sender.tab;
        var queryInfo = message.queryInfo || {};
        chrome.tabs.query(queryInfo, function(tabs) {
            tabs = _filterByTitleOrUrl(tabs, message.filter);
            if (tabs.length > message.tabsThreshold && conf.tabsMRUOrder) {
                // only remove current tab when tabsMRUOrder is enabled.
                tabs = tabs.filter(function(b) {
                    return b.id !== tab.id;
                });
                tabs.sort(function(x, y) {
                    // Shift tabs without "last access" data to the end
                    var a = x.lastAccessed || tabActivated[x.id!];
                    var b = y.lastAccessed || tabActivated[y.id!];

                    if (!isFinite(a) && !isFinite(b)) {
                        return 0;
                    }

                    if (!isFinite(a)) {
                        return 1;
                    }

                    if (!isFinite(b)) {
                        return -1;
                    }

                    return b - a;
                });
            }
            _response(message, sendResponse, {
                tabs: tabs
            });
        });
    };
    self.createTabGroup = function(message: any, sender: any, _sendResponse: any) {
        chrome.tabs.group({tabIds: [sender.tab.id], groupId: message.groupId}, function(groupId) {
            if (message.title || message.color) {
                chrome.tabGroups.update(groupId, {
                    title: message.title,
                    color: message.color
                });
            }
        });
    };
    self.ungroupTab = function(message: any, sender: any, _sendResponse: any) {
        chrome.tabs.ungroup([sender.tab.id]);
    };
    self.collapseGroup = function(message: any, _sender: any, _sendResponse: any) {
        chrome.tabGroups.update(message.groupId, {collapsed: message.collapsed});
    };
    self.getTabGroups = function(message: any, sender: any, sendResponse: any) {
        chrome.tabGroups.query({}, function(groups: any[]) {
            let activeGroup = -1;
            // retrieve all tabs of each group
            chrome.tabs.query({}, function(tabs) {
                const tabsInGroup: Record<string, any> = {};
                tabs.forEach(function(tab) {
                    if (tab.groupId && tab.groupId !== (chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1)) {
                        if (!tabsInGroup[tab.groupId]) {
                            tabsInGroup[tab.groupId] = [];
                        }
                        if (tab.id === sender.tab.id) {
                            activeGroup = tab.groupId;
                        }
                        tabsInGroup[tab.groupId].push({
                            id: tab.id,
                            title: tab.title,
                            url: tab.url,
                            favIconUrl: tab.favIconUrl,
                            active: tab.active,
                            index: tab.index
                        });
                    }
                });

                groups = groups.filter((g) => !g.hermit);
                groups.forEach(function(group) {
                    group.tabs = tabsInGroup[group.id] || [];
                    group.active = group.id === activeGroup;
                });

                _response(message, sendResponse, {
                    groups: groups
                });
            });
        });
    };
    self.togglePinTab = function(_message: any, _sender: any, _sendResponse: any) {
        getActiveTab(function(tab: any) {
            return chrome.tabs.update(tab.id, {
                pinned: !tab.pinned
            });
        });
    };
    self.closeTabByIds = function(message: any, _sender: any, _sendResponse: any) {
        chrome.tabs.remove(message.tabIds);
    };
    function focusTab(windowId: any, tabId: any) {
        chrome.windows.update(windowId, {
            focused: true
        }, function() {
            chrome.tabs.update(tabId, {
                active: true
            });
        });
    }
    self.focusTab = function(message: any, sender: any, _sendResponse: any) {
        if (message.windowId !== undefined && sender.tab.windowId !== message.windowId) {
            focusTab(message.windowId, message.tabId);
        } else {
            chrome.tabs.update(message.tabId, {
                active: true
            });
        }
    };
    self.focusTabByIndex = function(message: any, _sender: any, _sendResponse: any) {
        var queryInfo = message.queryInfo || {currentWindow: true};
        chrome.tabs.query(queryInfo, function(tabs) {
            if (message.repeats > 0 && message.repeats <= tabs.length) {
                chrome.tabs.update(tabs[message.repeats - 1].id, {
                    active: true
                });
            }
        });
    };
    self.goToLastTab = function(_message: any, _sender: any, _sendResponse: any) {
        if (tabHistory.length > 1) {
            var lastTab = tabHistory[tabHistory.length - 2];
            chrome.tabs.update(lastTab, {
                active: true
            });
        }
    };
    self.historyTab = function(message: any, _sender: any, _sendResponse: any) {
        if (tabHistory.length > 0) {
            historyTabAction = true;
            if (message.hasOwnProperty("index")) {
                tabHistoryIndex = (parseInt(message.index) + tabHistory.length) % tabHistory.length;
            } else {
                tabHistoryIndex += message.backward ? -1 : 1;
                if (tabHistoryIndex < 0) {
                    tabHistoryIndex = 0;
                } else if (tabHistoryIndex >= tabHistory.length) {
                    tabHistoryIndex = tabHistory.length - 1;
                }
            }
            const tabId = tabHistory[tabHistoryIndex];
            chrome.tabs.update(tabId, {
                active: true
            });
        }
    };
    // limit to between 0 and length
    function _fixTo(to: any, length: any) {
        if (to < 0) {
            to = 0;
        } else if (to >= length){
            to = length;
        }
        return to;
    }
    // round base ahead if repeats reaches length
    function _roundBase(base: any, repeats: any, length: any) {
        if (repeats > length - base) {
            base -= repeats - (length - base);
        }
        return base;
    }
    function _nextTab(tab: any, step: any) {
        if (tab) {
            chrome.tabs.query({
                windowId: tab.windowId
            }, function(tabs) {
                if (tab.index == 0 && step == -1) {
                    step = tabs.length -1 ;
                } else if (tab.index == tabs.length -1 && step == 1 ) {
                    step = 1 - tabs.length ;
                }
                var to = _fixTo(tab.index + step, tabs.length - 1);
                chrome.tabs.update(tabs[to].id, {
                    active: true
                });
            });
        } else {
            getActiveTab(function(t: any) {
                _nextTab(t, step);
            });
        }
    }
    self.nextTab = function(message: any, sender: any, _sendResponse: any) {
        _nextTab(sender.tab, message.repeats || 1);
    };
    self.previousTab = function(message: any, sender: any, _sendResponse: any) {
        _nextTab(sender.tab, -(message.repeats || 1));
    };
    self.tabGotoIndex = function(message: any, _sender: any, _sendResponse: any) {
        var index = (message.repeats || 1) - 1;
        chrome.tabs.query({ currentWindow: true }, function(tabs) {
            var target = tabs[index] || tabs[tabs.length - 1];
            if (target) {
                chrome.tabs.update(target.id, { active: true });
            }
        });
    };
    function _roundRepeatTabs(tab: any, repeats: any, operation: any) {
        if (tab) {
            chrome.tabs.query({
                windowId: tab.windowId
            }, function(tabs) {
                var tabIds = tabs.map(function(e) {
                    return e.id;
                });
                repeats = _fixTo(repeats, tabs.length);
                var base = _roundBase(tab.index, repeats, tabs.length);
                operation(tabIds.slice(base, base + repeats));
            });
        } else {
            getActiveTab(function(t: any) {
                _roundRepeatTabs(t, repeats, operation);
            });
        }
    }
    self.reloadTab = function(message: any, sender: any, _sendResponse: any) {
        _roundRepeatTabs(sender.tab, message.repeats, function(tabIds: any) {
            tabIds.forEach(function(tabId: any) {
                chrome.tabs.reload(tabId, {
                    bypassCache: message.nocache
                });
            });
        });
    };
    self.closeTab = function(message: any, sender: any, _sendResponse: any) {
        _roundRepeatTabs(sender.tab, message.repeats, function(tabIds: any) {
            chrome.tabs.remove(tabIds, function() {
                if ( conf.focusAfterClosed === "left" ) {
                    _nextTab(sender.tab, -1);
                } else if ( conf.focusAfterClosed === "last" ) {
                    self.historyTab({backward: true});
                }
            });
        });
    };
    function getChildrenTabsRecursively(tabId: any, allTabs: any) {
        var direct = allTabs.filter(function(t: any) { return t.openerTabId === tabId; });
        var result = direct.slice();
        direct.forEach(function(child: any) {
            result = result.concat(getChildrenTabsRecursively(child.id, allTabs));
        });
        return result;
    }

    function tabHandleMagic(magic: any, currentTab: any, repeats: any, windowTabs: any, allTabs?: any) {
        switch (magic) {
            case 'DirectionRight': {
                var right = windowTabs.filter(function(t: any) { return t.index > currentTab.index; });
                if (repeats > 1) return right.slice(0, repeats).map(function(t: any) { return t.id; });
                return right.map(function(t: any) { return t.id; });
            }
            case 'DirectionRightInclusive': {
                var right = windowTabs.filter(function(t: any) { return t.index >= currentTab.index; });
                // no repeat = all inclusive; explicit N > 1 = current + N to the right
                if (repeats > 1) return right.slice(0, repeats + 1).map(function(t: any) { return t.id; });
                return right.map(function(t: any) { return t.id; });
            }
            case 'DirectionLeft': {
                var left = windowTabs.filter(function(t: any) { return t.index < currentTab.index; });
                left.reverse();
                if (repeats > 1) return left.slice(0, repeats).map(function(t: any) { return t.id; });
                return left.map(function(t: any) { return t.id; });
            }
            case 'DirectionLeftInclusive': {
                var left = windowTabs.filter(function(t: any) { return t.index <= currentTab.index; });
                left.reverse();
                // no repeat = all inclusive; explicit N > 1 = current + N to the left
                if (repeats > 1) return left.slice(0, repeats + 1).map(function(t: any) { return t.id; });
                return left.map(function(t: any) { return t.id; });
            }
            case 'AllExceptActive':
                return windowTabs.filter(function(t: any) { return t.id !== currentTab.id; }).map(function(t: any) { return t.id; });
            case 'AllInWindow':
                return windowTabs.map(function(t: any) { return t.id; });
            case 'AllExceptActiveAllWindows':
                return allTabs.filter(function(t: any) { return t.id !== currentTab.id; }).map(function(t: any) { return t.id; });
            case 'ChildrenTabs':
                return windowTabs.filter(function(t: any) { return t.openerTabId === currentTab.id; }).map(function(t: any) { return t.id; });
            case 'ChildrenTabsRecursively':
                return getChildrenTabsRecursively(currentTab.id, allTabs).map(function(t: any) { return t.id; });
            case 'AllOtherWindowsTabs':
                return allTabs.filter(function(t: any) { return t.windowId !== currentTab.windowId; }).map(function(t: any) { return t.id; });
            case 'OtherWindowsNoPinned': {
                var otherWindows = [...new Set(
                    allTabs.filter(function(t: any) { return t.windowId !== currentTab.windowId; }).map(function(t: any) { return t.windowId; })
                )];
                var windowsWithPinned = new Set(
                    allTabs.filter(function(t: any) { return t.pinned; }).map(function(t: any) { return t.windowId; })
                );
                var eligibleWindows = new Set(otherWindows.filter(function(wid) { return !windowsWithPinned.has(wid); }));
                return allTabs.filter(function(t: any) { return eligibleWindows.has(t.windowId); }).map(function(t: any) { return t.id; });
            }
            case 'AllIncognitoTabs':
                return allTabs.filter(function(t: any) { return t.incognito; }).map(function(t: any) { return t.id; });
            case 'CurrentTab':
                return [currentTab.id];
            default:
                return [];
        }
    }

    self.closeTabMagic = function(message: any, sender: any, _sendResponse: any) {
        chrome.tabs.query({}, function(allTabs) {
            var windowTabs = allTabs.filter(function(t) { return t.windowId === sender.tab.windowId; });
            var repeats = message.repeats;
            var tabIds = tabHandleMagic(message.magic, sender.tab, repeats, windowTabs, allTabs);
            var pinnedIds = new Set(allTabs.filter(function(t) { return t.pinned; }).map(function(t) { return t.id; }));
            tabIds = tabIds.filter(function(id: any) { return !pinnedIds.has(id); });
            if (tabIds.length) {
                chrome.tabs.remove(tabIds);
            }
        });
    };

    self.goToParentTab = function(message: any, sender: any, _sendResponse: any) {
        chrome.tabs.get(sender.tab.id, function(tab) {
            if (tab && tab.openerTabId) {
                chrome.tabs.update(tab.openerTabId, { active: true });
            }
        });
    };

    self.reloadTabMagic = function(message: any, sender: any, _sendResponse: any) {
        chrome.tabs.query({}, function(allTabs) {
            var windowTabs = allTabs.filter(function(t) { return t.windowId === sender.tab.windowId; });
            var repeats = message.repeats;
            var tabIds = tabHandleMagic(message.magic, sender.tab, repeats, windowTabs, allTabs);
            tabIds.forEach(function(id: any) {
                chrome.tabs.reload(id, { bypassCache: false });
            });
        });
    };

    self.copyTabUrlsMagic = function(message: any, sender: any, sendResponse: any) {
        chrome.tabs.query({}, function(allTabs) {
            var windowTabs = allTabs.filter(function(t) { return t.windowId === sender.tab.windowId; });
            var repeats = message.repeats;
            if (repeats == null && (message.magic === 'DirectionRight' || message.magic === 'DirectionLeft')) {
                repeats = 1;
            }
            var tabIds = tabHandleMagic(message.magic, sender.tab, repeats, windowTabs, allTabs);
            var tabMap: Record<string, any> = {};
            allTabs.forEach(function(t) {
                tabMap[t.id!] = t;
            });
            var urls = tabIds.map(function(id: any) {
                var tab = tabMap[id];
                return tab && tab.url;
            }).filter(Boolean);
            _response(message, sendResponse, {
                urls: urls
            });
        });
    };

    self.pinTabMagic = function(message: any, sender: any, _sendResponse: any) {
        chrome.tabs.query({currentWindow: true}, function(tabs) {
            var repeats = message.repeats || 1;
            var tabIds = tabHandleMagic(message.magic, sender.tab, repeats, tabs);
            var pinStateMap: Record<string, any> = {};
            tabs.forEach(function(t) { pinStateMap[t.id!] = t.pinned; });
            tabIds.forEach(function(id: any) {
                chrome.tabs.update(id, { pinned: !pinStateMap[id] });
            });
        });
    };

    self.bookmarkTabsMagic = function(message: any, sender: any, _sendResponse: any) {
        chrome.tabs.query({currentWindow: true}, function(tabs) {
            var repeats = message.repeats || 1;
            var tabIds = tabHandleMagic(message.magic, sender.tab, repeats, tabs);
            var idSet = new Set(tabIds);
            tabs.filter(function(t) { return idSet.has(t.id); }).forEach(function(t) {
                chrome.bookmarks.create({ parentId: "1", title: t.title, url: t.url });
            });
        });
    };

    self.unbookmarkTabsMagic = function(message: any, sender: any, _sendResponse: any) {
        chrome.tabs.query({currentWindow: true}, function(tabs) {
            var repeats = message.repeats || 1;
            var tabIds = tabHandleMagic(message.magic, sender.tab, repeats, tabs);
            var idSet = new Set(tabIds);
            tabs.filter(function(t) { return idSet.has(t.id); }).forEach(function(t) {
                removeBookmark(t.url);
            });
        });
    };

    self.closeAudibleTab = function(_message: any, _sender: any, _sendResponse: any) {
        chrome.tabs.query({audible: true}, function(tabs) {
            if (tabs) {
                chrome.tabs.remove(tabs[0].id!);
            }
        });
    };
    self.muteTab = function(message: any, sender: any, _sendResponse: any) {
        var tab = sender.tab;
        chrome.tabs.update(tab.id, {
            muted: ! tab.mutedInfo.muted
        });
    };
    self.openLast = function(message: any, sender: any, sendResponse: any) {
        if (browser.name === "Safari") {
            chrome.runtime.sendNativeMessage("application.id", {command: "reopenLastTab"}, function(response) {
                _response(message, sendResponse, response);
            });
        } else {
            chrome.sessions.restore();
        }
    };
    self.duplicateTab = function(message: any, sender: any, _sendResponse: any) {
        if (message.active === false) {
            // For background duplication: create duplicate then immediately reactivate original
            // Note: Chrome's tabs.duplicate() always activates the new tab, so we must
            // switch back to the original tab after duplication completes
            chrome.tabs.duplicate(sender.tab.id, function(_duplicatedTab) {
                // Immediately reactivate the original tab
                chrome.tabs.update(sender.tab.id, { active: true });
            });
        } else {
            // For foreground duplication: default behavior (duplicate becomes active)
            chrome.tabs.duplicate(sender.tab.id);
        }
    };
    let previousWindowChoice = -1;
    self.getWindows = function (message: any, sender: any, sendResponse: any) {
        chrome.tabs.query({currentWindow: false}, function(tabs) {
            const windows: Record<string, any> = {};
            tabs.forEach(t => {
                const tabsInWindow = windows[t.windowId] || [];
                tabsInWindow.push({title: t.title, url: t.url});
                windows[t.windowId] = tabsInWindow;
            });
            _response(message, sendResponse, {
                windows: Object.keys(windows).map(w => {
                    return {
                        id: w,
                        tabs: windows[w],
                        isPreviousChoice: (parseInt(w) === previousWindowChoice)
                    };
                })
            });
        });
    };
    self.moveToWindow = function(message: any, sender: any, _sendResponse: any) {
        if (message.windowId === -1) {
            chrome.windows.create({tabId: sender.tab.id});
        } else {
            chrome.tabs.move(sender.tab.id, {windowId: message.windowId, index: -1}, () => {
                focusTab(message.windowId, sender.tab.id);
            });
        }
        previousWindowChoice = message.windowId;
    };
    self.moveToWindowMagic = function(message: any, sender: any, _sendResponse: any) {
        chrome.tabs.query({}, function(allTabs) {
            var windowTabs = allTabs.filter(function(t) { return t.windowId === sender.tab.windowId; });
            var repeats = message.repeats;
            var tabIds = tabHandleMagic(message.magic, sender.tab, repeats, windowTabs, allTabs);
            if (!tabIds.length) return;
            chrome.windows.create({tabId: tabIds[0]}, function(newWindow) {
                if (!newWindow || !newWindow.id) return;
                tabIds.slice(1).forEach(function(tabId: any) {
                    chrome.tabs.move(tabId, {windowId: newWindow.id, index: -1});
                });
            });
        });
    };
    self.gatherWindows = function(message: any, sender: any, _sendResponse: any) {
        const windowId = sender.tab.windowId;
        chrome.tabs.query({currentWindow: false}, function(tabs) {
            tabs.forEach(function(tab) {
                chrome.tabs.move(tab.id!, {windowId, index: -1});
            });
        });
    };
    self.gatherTabs = function(message: any, sender: any, _sendResponse: any) {
        const windowId = sender.tab.windowId;
        message.tabs.forEach(function(tab: any) {
            chrome.tabs.move(tab.id, {windowId, index: -1});
        });
    };
    self.getBookmarkFolders = function(message: any, sender: any, sendResponse: any) {
        chrome.bookmarks.getTree(function(tree) {
            bookmarkFolders = [];
            getFolders(tree[0], "");
            _response(message, sendResponse, {
                folders: bookmarkFolders
            });
        });
    };
    self.createBookmark = function(message: any, sender: any, sendResponse: any) {
        removeBookmark(message.page.url, function() {
            createBookmark(message.page, function(ret: any) {
                _response(message, sendResponse, {
                    bookmark: ret
                });
            });
        });
    };
    function filterBookmarksByQuery(bookmarks: any, query: any, caseSensitive: any) {
        return bookmarks.filter(function(b: any) {
            var title = b.title, url = b.url;
            if (!caseSensitive) {
                title = title.toLowerCase();
                url = url && url.toLowerCase();
                query = query.toLowerCase();
            }
            return title.indexOf(query) !== -1 || (url && url.indexOf(query) !== -1);
        });
    }
    self.getBookmarks = function(message: any, sender: any, sendResponse: any) {
        if (message.parentId) {
            chrome.bookmarks.getSubTree(message.parentId, function(tree) {
                var bookmarks = tree[0].children;
                if (message.query && message.query.length) {
                    bookmarks = filterBookmarksByQuery(bookmarks, message.query, message.caseSensitive);
                }
                _response(message, sendResponse, {
                    bookmarks: bookmarks
                });
            });
        } else {
            if (message.query && message.query.length) {
                chrome.bookmarks.search(message.query, function(tree) {
                    _response(message, sendResponse, {
                        bookmarks: filterBookmarksByQuery(tree, message.query, message.caseSensitive)
                    });
                });
            } else {
                chrome.bookmarks.getTree(function(tree) {
                    _response(message, sendResponse, {
                        bookmarks: tree[0].children
                    });
                });
            }
        }
    };
    self.getHistory = function(message: any, sender: any, sendResponse: any) {
        _getHistory(message.query || "", message.maxResults || 100, function(tree: any) {
            _response(message, sendResponse, {
                history: tree
            });
        }, message.sortByMostUsed);
    };
    self.addHistories = function(message: any, _sender: any, _sendResponse: any) {
        message.history.forEach((h: any) => {
            chrome.history.addUrl({url: h});
        });
    };
    function normalizeURL(url: any) {
        if (!/^view-source:|^javascript:/.test(url) && /^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/\n]+)/im.test(url)) {
            if (/^[\w-]+?:/i.test(url)) {
                url = url;
            } else {
                url = "http://" + url;
            }
        }
        return url;
    }

    function openUrlInNewTab(currentTab: any, url: any, message: any) {
        var newTabPosition;
        if (currentTab) {
            switch (conf.newTabPosition) {
                case 'left':
                    newTabPosition = currentTab.index;
                    break;
                case 'right':
                    newTabPosition = currentTab.index + 1;
                    break;
                case 'first':
                    newTabPosition = 0;
                    break;
                case 'last':
                    break;
                default:
                    newTabPosition = currentTab.index + 1 + chromelikeNewTabPosition;
                    chromelikeNewTabPosition++;
                    break;
            }
        }
        chrome.tabs.create({
            url: url,
            active: message.tab.active,
            index: newTabPosition,
            pinned: message.tab.pinned,
            openerTabId: currentTab.id
        }, function(tab) {
            if (message.scrollLeft || message.scrollTop) {
                (tabMessages as any)[tab!.id!] = {
                    scrollLeft: message.scrollLeft,
                    scrollTop: message.scrollTop
                };
            }
        });
    }

    self.openLink = function(message: any, sender: any, _sendResponse: any) {
        var url = normalizeURL(message.url);
        if (url.startsWith("javascript:")) {
            sendTabMessage(sender.tab.id, 0, {
                subject: "showBanner",
                message: "JavaScript URLs are not allowed in such operation."
            });
        } else {
            if (message.tab.tabbed) {
                if (sender.frameId !== 0 && chrome.runtime.getURL("pages/frontend.html") === sender.url
                    || !sender.tab) {
                    // if current call was made from Omnibar, the sender.tab may be stale,
                    // as sender was bound when port was created.
                    getActiveTab(function(tab: any) {
                        openUrlInNewTab(tab, url, message);
                    });
                } else {
                    openUrlInNewTab(sender.tab, url, message);
                }
            } else {
                chrome.tabs.update({
                    url: url,
                    pinned: message.tab.pinned || sender.tab.pinned
                }, function(tab) {
                    if (message.scrollLeft || message.scrollTop) {
                        (tabMessages as any)[tab!.id!] = {
                            scrollLeft: message.scrollLeft,
                            scrollTop: message.scrollTop
                        };
                    }
                });
            }
        }
    };
    self.viewSource = function(message: any, sender: any, sendResponse: any) {
        message.url = 'view-source:' + sender.tab.url;
        self.openLink(message, sender, sendResponse);
    };
    self.openNewtab = function(message: any, sender: any, sendResponse: any) {
        message.url = conf.newTabUrl;
        message.tab = { tabbed: true };
        self.openLink(message, sender, sendResponse);
    };
    function onFullSettingsRequested(data: any) {
        data.isMV3 = isMV3;
        data.useNeovim = browser.nvimServer && browser.nvimServer.instance;
        data.isUserScriptsAvailable = isUserScriptsAvailable();
        if (isMV3) {
            data.showAdvanced = data.isUserScriptsAvailable && data.showAdvanced;
        }

        ensureSettingsSnippetRegistration({
            showAdvanced: Boolean(data && data.showAdvanced),
            snippets: (data && typeof data.snippets === 'string') ? data.snippets : ''
        });
    }
    self.getSettings = function(message: any, sender: any, sendResponse: any) {
        var pf = loadSettings;
        if (message.key === "RAW") {
            pf = browser.loadRawSettings;
            message.key = "";
        }
        pf(message.key, function(data: any) {
            if (message.key === undefined) {
                onFullSettingsRequested(data);
            }

            _response(message, sendResponse, {
                settings: data
            });
        });
    };
    function isUserScriptsAvailable() {
        try {
            if (chrome.userScripts) {
                return true;
            }
        } catch {
            return false;
        }
        return false;
    }
    self.updateSettings = function(message: any, _sender: any, _sendResponse: any) {
        let error = "";
        if (message.scope === "snippets") {
            // For settings from snippets, don't broadcast the update
            // neither persist into storage (except newTabUrl which needs storage for onCreated)
            for (var k in message.settings) {
                if (conf.hasOwnProperty(k)) {
                    conf[k] = message.settings[k];
                    // Persist newTabUrl to storage for onCreated listener
                    if (k === 'newTabUrl') {
                        chrome.storage.local.set({ newTabUrl: message.settings[k] });
                    }
                }
            }
            const llmConf = conf.llm;
            if (llmConf.ollama && llmConf.ollama.model) {
                llmClients.ollama.model = llmConf.ollama.model;
            }
            if (llmConf.deepseek && llmConf.deepseek.apiKey) {
                llmClients.deepseek.apiKey = llmConf.deepseek.apiKey;
                llmClients.deepseek.model = llmConf.deepseek.model;
                delete message.settings.llm.deepseek;
            }
            if (llmConf.gemini && llmConf.gemini.apiKey) {
                llmClients.gemini.apiKey = llmConf.gemini.apiKey;
                llmClients.gemini.model = llmConf.gemini.model;
                delete message.settings.llm.gemini;
            }
            if (llmConf.bedrock
                && llmConf.bedrock.accessKeyId
                && llmConf.bedrock.secretAccessKey
                && llmConf.bedrock.model) {
                llmClients.bedrock.init(llmConf.bedrock);
                delete message.settings.llm.bedrock;
            }
            if (llmConf.custom && llmConf.custom.serviceUrl && llmConf.custom.apiKey && llmConf.custom.model) {
                llmClients.custom.serviceUrl = llmConf.custom.serviceUrl;
                llmClients.custom.apiKey = llmConf.custom.apiKey;
                llmClients.custom.model = llmConf.custom.model;
                delete message.settings.llm.custom;
            }
        } else {
            if (message.settings.showAdvanced && isMV3) {
                if (isUserScriptsAvailable()) {
                    chrome.userScripts.configureWorld({
                        csp: 'script-src \'self\' \'unsafe-eval\'',
                        messaging: true
                    });
                    _updateAndPostSettings(message.settings);
                } else {
                    error = "Advanced mode is only available when Developer mode is turned on from chrome://extensions/.";
                }
            } else {
                _updateAndPostSettings(message.settings);
            }
        }
        return { error };
    };
    self.updateInputHistory = function(message: any, sender: any, sendResponse: any) {
        let key: string | undefined = undefined, value: any;
        for (var k in message) {
            key = k + "History";
            value = message[k];
            break;
        }
        if (key) {
            loadSettings(key, function(data: any) {
                let curr = data[key!] || [];
                let toUpdate: Record<string, any> = {};
                if (value.constructor.name === "Array") {
                    toUpdate[key] = value;
                    _updateAndPostSettings(toUpdate);
                } else if (value.trim().length && value !== ".") {
                    curr = curr.filter(function(c: any) {
                        return c.trim().length && c !== value && c !== ".";
                    });
                    curr.unshift(value);
                    if (curr.length > 50) {
                        curr.pop();
                    }
                    toUpdate[key] = curr;
                    _updateAndPostSettings(toUpdate);
                }
                _response(message, sendResponse, {
                    history: curr
                });
            });
        }
    };
    self.setSurfingkeysIcon = function(message: any, sender: any, _sendResponse: any) {
        let icon = "icons/48.png";
        if (message.status === "disabled") {
            icon = "icons/48-x.png";
        } else if (message.status === "lurking") {
            icon = "icons/48-l.png";
        }
        const browserAction = isMV3 ? chrome.action : chrome.browserAction;
        browserAction.setIcon({
            path: icon,
            tabId: (sender.tab ? sender.tab.id : undefined)
        });
    };
    self.request = function(message: any, sender: any, sendResponse: any) {
        request(message.url, function(res: any) {
            _response(message, sendResponse, {
                text: res
            });
        }, message.headers, message.data, (e: any) => {
            _response(message, sendResponse, {
                error: e.toString()
            });
        });
    };
    self.requestImage = function(message: any, sender: any, sendResponse: any) {
        fetch(message.url, {
            method: "GET"
        }).then(res => {
            return res.blob();
        }).then(blob => {
            return createImageBitmap(blob);
        }).then(img => {
            const canvas = new OffscreenCanvas(img.width, img.height);
            const ctx = canvas.getContext('2d');
            ctx!.drawImage(img, 0,0, canvas.width, canvas.height);
            canvas.convertToBlob().then(blob => {
                const fr = new FileReader();
                fr.onload = function(e) {
                    _response(message, sendResponse, {
                        text: e.target!.result
                    });
                };
                fr.readAsDataURL(blob);
            });
        }).catch(_exp => {
            _response(message, sendResponse, {
                text: ""
            });
        });
    };
    self.nextFrame = function(message: any, sender: any, _sendResponse: any) {
        const tid = sender.tab.id;
        chrome.scripting.executeScript({
            target: {
                allFrames: true,
                tabId: tid,
            },
            func: () => {
                // getFrameId is injected by content scripts into the page context
                // @ts-ignore
                return typeof(getFrameId) === 'function' ? getFrameId() : 0;
            },
        }, function(framesInTab) {
            framesInTab = framesInTab.map((res) => {
                return res.result;
            }).filter((frameId) => {
                return frameId;
            });

            if (framesInTab.length > 0) {
                let i = 0;
                for (i = 0; i < framesInTab.length; i++) {
                    if (framesInTab[i] === message.frameId) {
                        break;
                    }
                }
                i = (i === framesInTab.length - 1) ? 0 : i + 1;
                sendTabMessage(tid, -1, {
                    subject: "focusFrame",
                    frameId: framesInTab[i]
                });
            }
        });
    };
    self.moveTab = function(message: any, sender: any, _sendResponse: any) {
        chrome.tabs.query({
            windowId: sender.tab.windowId
        }, function(tabs) {
            var to = _fixTo(sender.tab.index + message.step * message.repeats, tabs.length);
            chrome.tabs.move(sender.tab.id, {
                index: to
            });
        });
    };
    function _quit() {
        chrome.windows.getAll({
            populate: false
        }, function(windows) {
            windows.forEach(function(w) {
                chrome.windows.remove(w.id!);
            });
        });
    }
    self.quit = function(_message: any, _sender: any, _sendResponse: any) {
        _quit();
    };
    self.createSession = function(message: any, _sender: any, _sendResponse: any) {
        loadSettings('sessions', function(data: any) {
            chrome.tabs.query({}, function(tabs) {
                var tabGroup: Record<string, any> = {};
                tabs.forEach(function(tab) {
                    if (tab && tab.index !== void 0) {
                        if (!tabGroup.hasOwnProperty(tab.windowId)) {
                            tabGroup[tab.windowId] = [];
                        }
                        if (tab.url !== conf.newTabUrl) {
                            tabGroup[tab.windowId].push(tab.url);
                        }
                    }
                });
                var tabg: any[] = [];
                for (var k in tabGroup) {
                    if ((tabGroup as any)[k].length) {
                        tabg.push((tabGroup as any)[k]);
                    }
                }
                data.sessions[message.name] = {};
                data.sessions[message.name]['tabs'] = tabg;
                _updateAndPostSettings({
                    sessions: data.sessions
                }, (message.quitAfterSaved ? _quit : undefined));
            });
        });
    };
    self.openSession = function(message: any, _sender: any, _sendResponse: any) {
        loadSettings('sessions', function(data: any) {
            if (data.sessions.hasOwnProperty(message.name)) {
                var urls = data.sessions[message.name]['tabs'];
                urls[0].forEach(function(url: any) {
                    chrome.tabs.create({
                        url: url,
                        active: false,
                        pinned: false
                    });
                });
                for (var i = 1; i < urls.length; i++) {
                    var a = urls[i];
                    chrome.windows.create({}, function(win) {
                        a.forEach(function(url: any) {
                            chrome.tabs.create({
                                windowId: win!.id,
                                url: url,
                                active: false,
                                pinned: false
                            });
                        });
                    });
                }
                chrome.tabs.query({
                    url: conf.newTabUrl
                }, function(tabs) {
                    chrome.tabs.remove(tabs.map(function(t) {
                        return t.id!;
                    }));
                });
            }
        });
    };
    self.deleteSession = function(message: any, _sender: any, _sendResponse: any) {
        loadSettings('sessions', function(data: any) {
            delete data.sessions[message.name];
            _updateAndPostSettings({
                sessions: data.sessions
            });
        });
    };
    self.closeDownloadsShelf = function(message: any, _sender: any, _sendResponse: any) {
        if (message.clearHistory) {
            chrome.downloads.erase({"urlRegex": ".*"});
        } else {
            chrome.downloads.setShelfEnabled(false);
            chrome.downloads.setShelfEnabled(true);
        }
    };
    self.getDownloads = function(message: any, sender: any, sendResponse: any) {
        chrome.downloads.search(message.query, function(items) {
            _response(message, sendResponse, {
                downloads: items
            });
        });
    };
    self.download = function(message: any, _sender: any, _sendResponse: any) {
        chrome.downloads.download({
            url: message.url,
            filename: message.filename,
            saveAs: message.saveAs
        });
    };
    self.tabURLAccessed = function(message: any, sender: any, _sendResponse: any) {
        if (sender.tab) {
            var tabId = sender.tab.id;
            _setScrollPos_bg(tabId);
            if (!tabURLs.hasOwnProperty(tabId)) {
                (tabURLs as any)[tabId] = {};
            }
            (tabURLs as any)[tabId][message.url] = message.title;
            return {
                active: sender.tab.active,
                index: conf.showTabIndices ? sender.tab.index + 1 : 0
            };
        } else {
            return {};
        }
    };
    self.getTabURLs = function(message: any, sender: any, _sendResponse: any) {
        var tabURL = (tabURLs as any)[sender.tab.id] || {};
        tabURL = Object.keys(tabURL).map(function(u) {
            return {
                url: u,
                title: tabURL[u]
            };
        });
        return {
            urls: tabURL
        };
    };
    self.getTopURL = function(message: any, sender: any, _sendResponse: any) {
        return {
            url: sender.tab ? sender.tab.url : ""
        };
    };

    function updateProxy(message: any, cb: any) {
        loadSettings(['proxyMode', 'proxy', 'autoproxy_hosts'], function(proxyConf: any) {
            if (message.operation === "deleteProxyPair") {
                proxyConf.proxy.splice(message.number, 1);
                proxyConf.autoproxy_hosts.splice(message.number, 1);
            } else if (message.operation === "set") {
                proxyConf.proxyMode = message.mode;
                proxyConf.proxy = message.proxy;
                proxyConf.autoproxy_hosts = message.host;
            } else {
                if (message.mode) {
                    proxyConf.proxyMode = message.mode;
                }
                if (!message.number) {
                    message.number = 0;
                }
                if (message.proxy) {
                    proxyConf.proxy[message.number] = message.proxy;
                    if (proxyConf.autoproxy_hosts.length <= message.number) {
                        proxyConf.autoproxy_hosts[message.number] = [];
                    }
                }
                if (message.host) {
                    var hostsDict = dictFromArray(proxyConf.autoproxy_hosts[message.number], 1);
                    var hosts = message.host.split(/\s*[ ,\n]\s*/);
                    if (message.operation === "toggle") {
                        hosts.forEach(function(host: any) {
                            if (hostsDict.hasOwnProperty(host)) {
                                delete hostsDict[host];
                            } else {
                                hostsDict[host] = 1;
                            }
                        });
                    } else if (message.operation === "add") {
                        hosts.forEach(function(host: any) {
                            hostsDict[host] = 1;
                        });
                    } else {
                        hosts.forEach(function(host: any) {
                            delete hostsDict[host];
                        });
                    }
                    proxyConf.autoproxy_hosts[message.number] = Object.keys(hostsDict);
                }
            }
            var diffSet = {
                autoproxy_hosts: proxyConf.autoproxy_hosts,
                proxyMode: proxyConf.proxyMode,
                proxy: proxyConf.proxy
            };
            _updateAndPostSettings(diffSet);
            browser._applyProxySettings(proxyConf);
            if (cb) {
                cb(diffSet);
            }
        });
    }
    self.updateProxy = function(message: any, sender: any, sendResponse: any) {
        updateProxy(message, function(diffSet: any) {
            _response(message, sendResponse, diffSet);
        });
    };
    self.setZoom = function(message: any, sender: any, _sendResponse: any) {
        var tabId = sender.tab.id;
        var zoomFactor = message.zoomFactor * (message.repeats || 1);
        if (zoomFactor == 0) {
            chrome.tabs.getZoomSettings(tabId, function(settings) {
                const defaultZoom = settings.defaultZoomFactor ?
                    settings.defaultZoomFactor : 1;
                chrome.tabs.setZoom(tabId, defaultZoom);
            });
        } else {
            chrome.tabs.getZoom(tabId, function(zf) {
                chrome.tabs.setZoom(tabId, zf + zoomFactor);
            });
        }
    };
    function _removeURL(uid: any, cb: any) {
        var type = uid[0], uid = uid.substr(1);
        if (type === 'B') {
            chrome.bookmarks.remove(uid, cb);
        } else if (type === 'H') {
            chrome.history.deleteUrl({url: uid}, cb);
        } else if (type === 'T') {
            uid = uid.split(":").map(function(u: any) {
                return parseInt(u);
            });
            chrome.windows.update(uid[0], {
                focused: true
            }, function() {
                chrome.tabs.remove(uid[1], cb);
            });
        } else if (type === 'M') {
            loadSettings('marks', function(data: any) {
                delete data.marks[uid];
                _updateAndPostSettings({marks: data.marks}, cb);
            });
        }
    }
    self.removeURL = function(message: any, sender: any, sendResponse: any) {
        var removed = 0,
            totalToRemoved = message.uid.length,
            uid = message.uid;
        if (typeof(message.uid) === "string") {
            totalToRemoved = 1;
            uid = [ message.uid ];
        }
        function _done() {
            removed ++;
            if (removed === totalToRemoved) {
                _response(message, sendResponse, {
                    response: "Done"
                });
            }
        }
        uid.forEach(function(u: any) {
            _removeURL(u, _done);
        });

    };
    self.localData = function(message: any, sender: any, sendResponse: any) {
        if (message.data.constructor === Object) {
            chrome.storage.local.set(message.data, function() {
            });
            // broadcast the change also, such as lastKeys
            // we would set lastKeys in sync to avoid breaching chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_MINUTE
            _broadcastSettings(message.data);
        } else {
            // string or array of string keys
            chrome.storage.local.get(message.data, function(data) {
                _response(message, sendResponse, {
                    data: data
                });
            });
        }
    };
    self.captureVisibleTab = function(message: any, sender: any, sendResponse: any) {
        chrome.tabs.captureVisibleTab({format: "png"}, function(dataUrl) {
            if (chrome.runtime.lastError || !dataUrl) {
                console.error("[capture] captureVisibleTab failed:", chrome.runtime.lastError?.message);
                _response(message, sendResponse, { dataUrl: null });
                return;
            }
            _response(message, sendResponse, {
                dataUrl: dataUrl
            });
        });
    };
    self.getCaptureSize = function(message: any, sender: any, sendResponse: any) {
        chrome.tabs.captureVisibleTab({format: "png"}, function(dataUrl) {
            if (chrome.runtime.lastError || !dataUrl) {
                _response(message, sendResponse, { width: 0, height: 0 });
                return;
            }
            // Use fetch + createImageBitmap (SW-compatible; no document required)
            fetch(dataUrl)
                .then(function(res) { return res.blob(); })
                .then(function(blob) { return createImageBitmap(blob); })
                .then(function(bitmap) {
                    _response(message, sendResponse, {
                        width: bitmap.width,
                        height: bitmap.height
                    });
                    bitmap.close();
                })
                .catch(function() {
                    _response(message, sendResponse, { width: 0, height: 0 });
                });
        });
    };
    self.deleteHistoryOlderThan = function(message: any, _sender: any, _sendResponse: any) {
        var days = message.days || 0, hours = message.hours || 0;
        chrome.history.deleteRange({
            startTime: 0,
            endTime: new Date().getTime() - (days * 86400 + hours * 3600) * 1000
        }, function() {
        });
    };
    function removeBookmark(url: any, cb?: any) {
        chrome.bookmarks.search({
            url: url
        }, function(bookmarks) {
            bookmarks.forEach(function(b) {
                chrome.bookmarks.remove(b.id);
            });
            if (cb) {
                cb();
            }
        });
    }
    self.removeBookmark = function(message: any, sender: any, _sendResponse: any) {
        removeBookmark(sender.tab.url);
    };
    self.getBookmark = function(message: any, sender: any, sendResponse: any) {
        chrome.bookmarks.search({
            url: sender.tab.url
        }, function(bookmarks) {
            _response(message, sendResponse, {
                bookmarks: bookmarks
            });
        });
    };

    self.initGist = function(message: any, sender: any, sendResponse: any) {
        return Gist.initGist(message.token, function(gist: any) {
            _response(message, sendResponse, {
                gist: gist
            });
        });
    };
    self.readComment = function(message: any, sender: any, sendResponse: any) {
        Gist.readComment(message.index, function(resp: any) {
            _response(message, sendResponse, resp);
        });
    };
    self.editComment = function(message: any, sender: any, sendResponse: any) {
        Gist.editComment(message.index, message.content, function(resp: any) {
            _response(message, sendResponse, {gistResp: resp});
        });
    };

    var _queueURLs: any[] = [];
    self.queueURLs = function(message: any, _sender: any, _sendResponse: any) {
        _queueURLs = _queueURLs.concat(message.urls);
    };
    self.getQueueURLs = function(_message: any, _sender: any, _sendResponse: any) {
        return {
            queueURLs: _queueURLs
        };
    };
    self.clearQueueURLs = function(_message: any, _sender: any, _sendResponse: any) {
        _queueURLs = [];
    };

    self.getVoices = function(message: any, sender: any, sendResponse: any) {
        chrome.tts.getVoices(function(voices) {
            _response(message, sendResponse, {
                voices: voices
            });
        });
    };

    self.read = function(message: any, sender: any, sendResponse: any) {
        var options = message.options || {};
        options.onEvent = function(ttsEvent: any) {
            // https://developer.chrome.com/docs/extensions/mv2/messaging/
            // If multiple pages are listening for onMessage events, only the first to call sendResponse()
            // for a particular event will succeed in sending the response. All other responses to that event will be ignored.
            //
            // Thus for the later events after `start` we will send them in sendTabMessage.
            if (ttsEvent.type === "start") {
                _response(message, sendResponse, {
                    ttsEvent: ttsEvent
                });
            } else {
                sendTabMessage(sender.tab.id, -1, {
                    subject: 'onTtsEvent',
                    ttsEvent: ttsEvent
                });
            }
        };
        chrome.tts.speak(message.content, options);
    };
    self.stopReading = function(_message: any, _sender: any, _sendResponse: any) {
        chrome.tts.stop();
    };

    self.openIncognito = function(message: any, _sender: any, _sendResponse: any) {
        chrome.windows.create({"url": message.url, "incognito": true});
    };

    var userAgent: any;
    function _onBeforeSendHeaders(details: any) {
        for (var i = 0; i < details.requestHeaders.length; ++i) {
            if (details.requestHeaders[i].name === 'User-Agent') {
                details.requestHeaders[i].value = userAgent;
                break;
            }
        }
        return {requestHeaders: details.requestHeaders};
    }

    self.writeClipboard = function (message: any, _sender: any, _sendResponse: any) {
        navigator.clipboard.writeText(message.text);
    };
    self.readClipboard = function (message: any, sender: any, sendResponse: any) {
        // only for Safari
        chrome.runtime.sendNativeMessage("application.id", {command: "Clipboard.read"}, function(response) {
            _response(message, sendResponse, response);
        });
    };
    function toUTF8(str: any) {
        try {
            return decodeURIComponent(escape(str));
        } catch {
            return str;
        }
    }
    let clientInLLMRequest = {tabId: 0, frameId: 0};
    const sendLLMessage = (tabId: any, frameId: any, message: any) => {
        if (browser.name === "Safari") {
            chrome.runtime.sendMessage(message);
        } else {
            sendTabMessage(tabId, frameId, message);
        }
    };

    self.llmRequest = function (message: any, sender: any, _sendResponse: any) {
        clientInLLMRequest.tabId = sender.tab.id;
        clientInLLMRequest.frameId = sender.frameId;

        const _decoder = new TextDecoder();

        const provider = message.provider;
        if (llmClients.hasOwnProperty(provider)) {
            const llmClient = llmClients[provider];
            llmClient(message, {
                onComplete: (message: any) => {
                    if (message.content && message.content.constructor.name === "Array") {
                        message.content = message.content.map((c: any) => {
                            return c.type === "text" ? { type: "text", text: toUTF8(c.text) } : c;
                        });
                    }
                    sendLLMessage(clientInLLMRequest.tabId, clientInLLMRequest.frameId, {
                        subject: 'llmResponse',
                        message,
                        done: true
                    });
                },
                onChunk: (chunk: any) => {
                    sendLLMessage(clientInLLMRequest.tabId, clientInLLMRequest.frameId, {
                        subject: 'llmResponse',
                        chunk: toUTF8(chunk)
                    });
                },
            });
        } else {
            sendLLMessage(clientInLLMRequest.tabId, clientInLLMRequest.frameId, {
                subject: 'llmResponse',
                chunk: `**Warning:** There is no LLM provider ${provider} implemented.`
            });
        }
    };
    self.getAllLlmProviders = function (message: any, sender: any, sendResponse: any) {
        _response(message, sendResponse, {
            providers: Object.keys(llmClients)
        });
    };

    self.getContainerName = browser._getContainerName(self, _response);
    chrome.runtime.setUninstallURL("http://brookhong.github.io/2018/01/30/why-did-you-uninstall-surfingkeys.html");

    self.connectNative = function (message: any, sender: any, sendResponse: any) {
        if (browser.nvimServer && browser.nvimServer.instance) {
            browser.nvimServer.instance.then(({url, nm}: any) => {
                nm.postMessage({
                    mode: message.mode
                });
                _response(message, sendResponse, {
                    url,
                });
            }).catch((error: any) => {
                _response(message, sendResponse, {
                    error,
                });
            });
        }
    };
}

// sk-devtools: keep port open for the DevTools panel.
// Eval is handled in the panel via chrome.debugger (Runtime.evaluate) — no eval in SW needed.
chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'sk-devtools') return;
});

export {
    _save,
    dictFromArray,
    extendObject,
    getSubSettings,
    start
};

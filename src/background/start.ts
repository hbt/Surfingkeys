import {
    filterByTitleOrUrl,
    type TitleUrlItem,
} from '../common/utils.js';
import llmClientsRaw from './llm.js';
import type { RuntimeAction, LLMClientsMap, TabURLMap, TabMessageMap, BookmarkFolder } from '../../@types/surfingkeys';
// Convenience type for message handlers that access arbitrary message properties
type Msg = RuntimeAction & { [key: string]: unknown };
type MessageHandler = (
    message: Msg,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
) => unknown;
const llmClients: LLMClientsMap = llmClientsRaw as unknown as LLMClientsMap;

// TEMPORARY ERROR FOR TESTING RELOAD EDGE CASE
// throw new Error('TEST ERROR: Simulating background script failure');

function request(url: string, onReady: (content: string) => void, headers?: Record<string, string>, data?: string, onException?: (error: Error) => void) {
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

function dictFromArray(arry: string[], val: number): Record<string, number> {
    var dict: Record<string, number> = {};
    arry.forEach(function(h: string) {
        dict[h] = val;
    });
    return dict;
}

function extendObject(target: Record<string, unknown>, ss: Record<string, unknown>) {
    for (var k in ss) {
        target[k] = ss[k];
    }
}

function getSubSettings(set: Record<string, unknown>, keys: string | string[] | null | undefined): Record<string, unknown> {
    var subset: Record<string, unknown>;
    if (!keys) {
        // if null/undefined/""
        subset = set;
    } else {
        if ( !(keys instanceof Array) ) {
            keys = [ keys ];
        }
        subset = {};
        keys.forEach(function(k: string) {
            subset[k] = set[k];
        });
    }
    return subset;
}

function _save(storage: chrome.storage.StorageArea, data: Record<string, unknown>, cb?: () => void) {
    if (storage === chrome.storage.sync) {
        // don't store snippets from localPath into sync storage, since sync storage has its quota.
        if (data.localPath) {
            delete data.snippets;
            delete data.localPath;
        }
        if (Object.keys(data).length > 1) {
            if (cb) storage.set(data, cb); else storage.set(data);
        }
    } else {
        if (data.localPath) {
            delete data.snippets;
            // try to fetch snippets from localPath and cache it in local storage.
            request(data.localPath as string, function(resp: string) {
                data.snippets = resp;
                if (cb) storage.set(data, cb); else storage.set(data);
            });
        } else {
            if (cb) storage.set(data, cb); else storage.set(data);
        }
    }
}

interface GistCommentResponse { status: number; content: string; }

var Gist = (function() {
    var self: {
        initGist: (token: string, onGistReady: ((gist: string) => void) | null) => string | undefined;
        readComment: (nr: number, cb: (resp: GistCommentResponse) => void) => void;
        editComment: (nr: number, clip: string, cb: ((arg?: unknown) => void) | null) => void;
    } = {} as {
        initGist: (token: string, onGistReady: ((gist: string) => void) | null) => string | undefined;
        readComment: (nr: number, cb: (resp: GistCommentResponse) => void) => void;
        editComment: (nr: number, clip: string, cb: ((arg?: unknown) => void) | null) => void;
    };

    function _initGist(token: string, magic_word: string, onGistReady: (gist: string) => void) {
        request("https://api.github.com/gists", function(res: string) {
            var gists: Array<{ id: string; description?: string; files: Record<string, unknown> }> = JSON.parse(res);
            var gist = "";
            gists.forEach(function(g) {
                if (g.hasOwnProperty('description') && g['description'] === magic_word && g.files.hasOwnProperty(magic_word)) {
                    gist = g.id;
                }
            });
            if (gist === "") {
                request("https://api.github.com/gists", function(res: string) {
                    var ng: { id: string } = JSON.parse(res);
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

    var _token: string, _gist = "", _comments: number[] = [];
    self.initGist = function(token: string, onGistReady: ((gist: string) => void) | null) {
        if (_token === token && _gist !== "") {
            return _gist;
        } else {
            _token = token;
            _initGist(_token, "cloudboard", function(gist: string) {
                _gist = gist;
                if (onGistReady) {
                    onGistReady(_gist);
                }
            });
        }
    };

    function _newComment(text: string, cb: ((arg?: unknown) => void) | null) {
        request(`https://api.github.com/gists/${_gist}/comments`, function(_res: string) {
            if (cb) {
                cb();
            }
        }, {
            'Authorization': 'token ' + _token
        }, `{"body": "${encodeURIComponent(text)}"}`);
    }
    function _readComment(cid: number, cb: (resp: GistCommentResponse) => void) {
        request(`https://api.github.com/gists/${_gist}/comments/${cid}`, function(res: string) {
            var comment: { body: string } = JSON.parse(res);
            cb({status: 0, content: decodeURIComponent(comment.body)});
        }, {
            'Authorization': 'token ' + _token
        });
    }
    function _listComment(cb: (cmts: number[]) => void) {
        request(`https://api.github.com/gists/${_gist}/comments`, function(res: string) {
            _comments = JSON.parse(res).map(function(c: { id: number }) {
                return c.id;
            });
            cb(_comments);
        }, {
            'Authorization': 'token ' + _token
        });
    }
    function _writeComment(cid: number, clip: string, cb: ((arg?: unknown) => void) | null) {
        request(`https://api.github.com/gists/${_gist}/comments/${cid}`, function(res: string) {
            if (cb) {
                cb(res);
            }
        }, {
            'Authorization': 'token ' + _token
        }, `{"body": "${encodeURIComponent(clip)}"}`);
    }
    self.readComment = function(nr: number, cb: (resp: GistCommentResponse) => void) {
        if (_gist === "") {
            cb({status: 1, content: "Please call initGist first!"});
        } else if (nr >= _comments.length) {
            _listComment(function(cmts: number[]) {
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
    self.editComment = function(nr: number, clip: string, cb: ((arg?: unknown) => void) | null) {
        if (_gist === "") {
            cb?.({status: 1, content: "Please call initGist first!"});
        } else if (nr >= _comments.length) {
            _listComment(function(cmts: number[]) {
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

function start(browser: Record<string, unknown>) {
    var self: Record<string, unknown> = {};

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

        globalThis._isConfigReady = async function() {
            try {
                await snippetSyncChain;
                return true;
            } catch (error) {
                console.error('[CONFIG] Snippet sync failed:', error);
                globalThis._configLoadError = error as Error;
                return false;
            }
        };
    }

    // Cache the most recent advanced/snippet settings so we can diff across async callers.
    const snippetSettingsSnapshot = {
        showAdvanced: false,
        snippets: ''
    };

    function rememberSnippetSettings(partial: Record<string, unknown> | null | undefined) {
        if (!partial) {
            return;
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'showAdvanced')) {
            snippetSettingsSnapshot.showAdvanced = Boolean(partial.showAdvanced);
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'snippets')) {
            snippetSettingsSnapshot.snippets = (partial.snippets as string) || '';
        }
    }

    function ensureSettingsSnippetRegistration(partial: Record<string, unknown> | null | undefined) {
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
        if (typeof globalThis !== 'undefined' && globalThis._snippetSyncChain) {
            snippetSyncChain.then(() => {
                console.log('[CONFIG] Snippet registration complete');
            }).catch(() => {
                // Error already logged above
            });
        }

        return snippetSyncChain;
    }

    function callUserScriptsApi(method: string, ...args: unknown[]): Promise<unknown> {
        const api = chrome.userScripts as unknown as Record<string, unknown>;
        if (!chrome.userScripts || typeof api[method] !== 'function') {
            return Promise.reject(new Error('chrome.userScripts API unavailable'));
        }
        return new Promise((resolve, reject) => {
            try {
                (api[method] as (...a: unknown[]) => void)(...args, (result: unknown) => {
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

    function buildSettingsSnippetCode(snippets: string) {
        return `import('./api.js').then((module) => {module.default("${extensionRootUrl}", (api, settings) => {${snippets}\n})});`;
    }

    async function readRegisteredSnippetCode() {
        try {
            const scripts = await callUserScriptsApi('getScripts', { ids: [SETTINGS_SNIPPET_SCRIPT_ID] }) as Array<{js?: Array<{code?: string}>}>;
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

    async function registerSettingsSnippet(code: string) {
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
    var tabActivated: Record<number, number> = {},
        tabMessages: TabMessageMap = {},
        tabURLs: TabURLMap = {};

    var conf: Record<string, unknown> = {
        llm: { },
        focusAfterClosed: "right",
        tabsMRUOrder: true,
        newTabPosition: 'default',
        newTabUrl: (browser._setNewTabUrl as () => string)(),
        showTabIndices: true,
        interceptedErrors: []
    };

    var bookmarkFolders: BookmarkFolder[] = [];
    function getFolders(tree: chrome.bookmarks.BookmarkTreeNode, root: string) {
        var cd = root;
        if (tree.title !== "" && (!tree.hasOwnProperty('url') || tree.url === undefined)) {
            cd += "/" + tree.title;
            bookmarkFolders.push({id: tree.id, title: cd + "/"});
        }
        if (tree.children) {
            for (var i = 0; i < tree.children.length; ++i) {
                getFolders(tree.children[i], cd);
            }
        }
    }

    function createBookmark(page: { path: string[]; folder: string; title: string; url: string }, onCreated: (result: chrome.bookmarks.BookmarkTreeNode) => void) {
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

    function debugLog(context: string, message: string, data?: unknown) {
        fetch(`http://localhost:${__CONFIG_SERVER_PORT__}/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context, message, data, timestamp: Date.now() })
        }).catch(() => {});
    }

    function loadSettings(keys: string | string[] | null, cb: (data: Record<string, unknown>) => void) {
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

        (browser.loadRawSettings as (keys: string | string[] | null, cb: (data: Record<string, unknown>) => void, defaults: Record<string, unknown>) => void)(keys, async function(set: Record<string, unknown>) {
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
                request(appendNonce(set.localPath as string), function(resp: string) {
                    set.snippets = resp;
                    cb(set);
                }, undefined, undefined, function (_po: Error) {
                    // failed to read snippets from localPath
                    set.error = "Failed to read snippets from " + set.localPath;
                    cb(set);
                });
            } else {
                cb(set);
            }
        }, tmpSet);
    }

    loadSettings(null, function(initialSettings: Record<string, unknown>) {
        (browser._applyProxySettings as (settings: Record<string, unknown>) => void)(initialSettings);
        ensureSettingsSnippetRegistration({
            showAdvanced: Boolean(initialSettings && initialSettings.showAdvanced),
            snippets: (initialSettings && typeof initialSettings.snippets === 'string') ? initialSettings.snippets : ''
        });
    });

    function removeTab(tabId: number) {
        delete tabActivated[tabId];
        delete tabMessages[tabId];
        delete tabURLs[tabId];
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
    function _setScrollPos_bg(tabId: number) {
        if (Object.prototype.hasOwnProperty.call(tabMessages, tabId)) {
            const message = tabMessages[tabId];
            sendTabMessage(tabId, 0, {
                subject: "setScrollPos",
                scrollLeft: message.scrollLeft,
                scrollTop: message.scrollTop
            });
            delete tabMessages[tabId];
        }
    }

    function sendTabMessage(tabId: number | undefined, frameId: number, message: Record<string, unknown>) {
        if (tabId === undefined) return;
        const opts = (frameId === -1) ? undefined : {frameId: frameId};
        // use catch to suppress Uncaught (in promise) Error on sending message to unsupported tabs like chrome://
        const p = chrome.tabs.sendMessage(tabId, message, opts);
        if (p) {
            p.catch((_e) => {});
        }
    }
    var _lastActiveTabId: number | null = null;
    let _configServerWarningPending = false;
    function _tabActivated(tabId: number) {
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
        getActiveTab(function(tab: chrome.tabs.Tab) {
            _tabActivated(tab.id!);
        });
    });

    chrome.tabs.onCreated.addListener(function(tab) {
        _updateTabIndices();
        // Redirect chrome://newtab/ to configured newTabUrl (e.g., google.com)
        const tabUrl = tab.pendingUrl || tab.url;
        if (tabUrl === "chrome://newtab/") {
            // Check storage for user-configured newTabUrl, fall back to conf.newTabUrl
            chrome.storage.local.get('newTabUrl', function(data) {
                const targetUrl = (data.newTabUrl || conf.newTabUrl) as string;
                if (targetUrl !== "chrome://newtab/") {
                    newTabRedirectedTabs.add(tab.id);
                    chrome.tabs.update(tab.id!, { url: targetUrl });
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

    function getActiveTab(cb: (tab: chrome.tabs.Tab) => void) {
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
                getActiveTab(function(tab: chrome.tabs.Tab) {
                    var index = (command === 'previousTab') ? tab.index - 1 : tab.index + 1;
                    chrome.tabs.query({ windowId: tab.windowId }, function(tabs) {
                        index = ((index % tabs.length) + tabs.length) % tabs.length;
                        chrome.tabs.update(tabs[index].id, { active: true });
                    });
                });
                break;
            case 'closeTab':
                getActiveTab(function(tab: chrome.tabs.Tab) {
                    chrome.tabs.remove(tab.id!);
                });
                break;
            case 'proxyThis':
                getActiveTab(function(tab: chrome.tabs.Tab) {
                    var host = new URL(tab.url ?? tab.pendingUrl!).host;
                    updateProxy({
                        action: 'updateProxy',
                        host: host,
                        operation: "toggle"
                    } as Msg, function() {
                        chrome.tabs.reload(tab.id!, {
                            bypassCache: true
                        });
                    });
                });
                break;
            default:
                break;
        }
    });

    var pendingPorts: Msg[] = [];
    self.pendingPorts = pendingPorts;
    function _response(message: Msg, sendResponse: (response: unknown) => void, result: unknown) {
        var idx = pendingPorts.indexOf(message);
        if (idx !== -1) {
            pendingPorts.splice(idx, 1);
        }
        sendResponse(result);
    }
    function handleMessage(_message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response?: unknown) => void) {
        if (Object.prototype.hasOwnProperty.call(self, _message.action)) {
            var result = (self[_message.action] as MessageHandler)(_message, _sender, _sendResponse);
            if (_message.needResponse) {
                if (result) {
                    _sendResponse(result);
                    _message.needResponse = false;
                } else {
                    pendingPorts.push(_message);
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
        globalThis.__CDP_MESSAGE_BRIDGE__ = {
            /**
             * Send a message through the extension's message handling system
             * @param {string} action - The action/handler name (e.g., 'cdpReloadExtension')
             * @param {object} payload - Additional message data
             * @param {boolean} expectResponse - Whether to wait for a response
             * @returns {*} The handler's return value
             */
            dispatch: function(action: string, payload?: unknown, expectResponse?: boolean) {
                console.log('[CDP-BRIDGE] Dispatching action:', action);

                if (!Object.prototype.hasOwnProperty.call(self, action) || typeof self[action] !== 'function') {
                    console.error('[CDP-BRIDGE] No handler registered for action:', action);
                    console.log('[CDP-BRIDGE] Available actions:', Object.keys(self).filter(k => typeof self[k] === 'function'));
                    return { error: 'Handler not found', action: action };
                }

                // Create message object matching the extension's message format
                var message: Msg = Object.assign(
                    { action: action, needResponse: expectResponse || false },
                    payload && typeof payload === 'object' ? payload : {}
                ) as Msg;

                // Create mock sender (represents CDP as sender)
                var sender: chrome.runtime.MessageSender = {
                    id: chrome.runtime.id,
                    url: 'cdp://testing',
                    origin: 'cdp'
                };

                // Create response handler
                var responseData: unknown = null;
                var sendResponse = function(response: unknown) {
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
        console.log('[CDP-BRIDGE] Available actions:', globalThis.__CDP_MESSAGE_BRIDGE__!.listActions().length);
    }

    function _updateSettings(diffSettings: Record<string, unknown>, afterSet: (() => void) | null | undefined) {
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

    function _broadcastSettings(data: Record<string, unknown>) {
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(function(tab) {
                sendTabMessage(tab.id, -1, {
                    subject: 'settingsUpdated',
                    settings: data
                });
            });
        });
    }

    function _updateAndPostSettings(diffSettings: Record<string, unknown>, afterSet?: (() => void) | null) {
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

    function getSenderUrl(sender: chrome.runtime.MessageSender) {
        // use the tab's url if sender is a frame with blank url.
        return (sender.frameId !== 0 && sender.url === "about:blank") ? sender.tab?.url : sender.url;
    }
    function _getState(set: Record<string, unknown>, url: URL | null, blocklistPattern: RegExp | null | undefined, lurkingPattern: RegExp | null | undefined) {
        const blocklist = set.blocklist as Record<string, unknown>;
        if (blocklist['.*']) {
            return "disabled";
        }
        if (url) {
            if (blocklist[url.origin]) {
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
    self.toggleBlocklist = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        loadSettings('blocklist', function(data: Record<string, unknown>) {
            var origin = ".*";
            var senderOrigin = sender.origin || new URL(getSenderUrl(sender) ?? '').origin;
            if (chrome.runtime.getURL("/").indexOf(senderOrigin) !== 0 && senderOrigin !== "null") {
                origin = senderOrigin;
            }
            const blocklist = data.blocklist as Record<string, unknown>;
            if (Object.prototype.hasOwnProperty.call(blocklist, origin)) {
                delete blocklist[origin];
            } else {
                blocklist[origin] = 1;
            }
            _updateAndPostSettings({blocklist: blocklist}, function() {
                sendResponse({
                    state: _getState(data, sender.tab ? new URL(getSenderUrl(sender) ?? '') : null, message.blocklistPattern as RegExp | null | undefined, message.lurkingPattern as RegExp | null | undefined),
                    blocklist: blocklist,
                    url: origin
                });
            });
        });
    };
    self.restoreFocusHack = function(_message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
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
    self.toggleMouseQuery = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        loadSettings('mouseSelectToQuery', function(data: Record<string, unknown>) {
            if (sender.tab && sender.tab.url && sender.tab.url.indexOf(chrome.runtime.getURL("/")) !== 0) {
                var mouseSelectToQuery = (data.mouseSelectToQuery as string[]) || [];
                var origin = message.origin as string;
                var idx = mouseSelectToQuery.indexOf(origin);
                if (idx === -1) {
                    mouseSelectToQuery.push(origin);
                } else {
                    mouseSelectToQuery.splice(idx, 1);
                }
                _updateAndPostSettings({mouseSelectToQuery: mouseSelectToQuery});
            }
        });
    };
    self.getState = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        loadSettings(['blocklist', 'noPdfViewer', 'proxyMode', 'proxy'], function(data: Record<string, unknown>) {
            if (sender.tab) {
                _response(message, sendResponse, {
                    noPdfViewer: data.noPdfViewer,
                    proxyMode: data.proxyMode,
                    proxy: data.proxy,
                    state: _getState(data, new URL(getSenderUrl(sender) ?? ''), message.blocklistPattern as RegExp | null | undefined, message.lurkingPattern as RegExp | null | undefined)
                });
            }
        });
    };

    self.addVIMark = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        loadSettings('marks', function(data: Record<string, unknown>) {
            extendObject(data.marks as Record<string, unknown>, message.mark as Record<string, unknown>);
            _updateAndPostSettings({marks: data.marks});
        });
    };
    self.jumpVIMark = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        loadSettings("marks", function(data: Record<string, unknown>) {
            var marks = data.marks as Record<string, Record<string, unknown>>;
            var markKey = message.mark as string;
            if (Object.prototype.hasOwnProperty.call(marks, markKey)) {
                var markInfo = marks[markKey];
                chrome.tabs.query({}, function(tabs) {
                    tabs = tabs.filter(function(t) {
                        return t.url === markInfo.url;
                    });

                    if (tabs.length === 0) {
                        markInfo.tab = {
                            tabbed: true,
                            active: true
                        };
                        (self.openLink as MessageHandler)(markInfo as unknown as Msg, sender, sendResponse);
                    } else {
                        if (markInfo.scrollLeft || markInfo.scrollTop) {
                            tabMessages[tabs[0].id!] = {
                                scrollLeft: markInfo.scrollLeft as number,
                                scrollTop: markInfo.scrollTop as number
                            };
                        }
                        if (tabs[0].id === sender.tab?.id) {
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

    function appendNonce(url: string) {
        if (/https?:\/\//.test(url)) {
            url = url.replace(/\?$/, "");
            let u = new URL(url);
            let con = u.search ? "&" : "?";
            url = `${url}${con}nonce=${new Date().getTime()}`;
        }
        return url;
    }

    function _loadSettingsFromUrl(url: string, cb: (status: Record<string, unknown>) => void) {
        request(appendNonce(url), function(resp: string) {
            _updateAndPostSettings({localPath: url, snippets: resp});
            cb({status: "Succeeded", snippets: resp});
        }, undefined, undefined, function (_po: Error) {
            cb({status: "Failed"});
        });
    }

    self.resetSettings = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        chrome.storage.local.clear();
        chrome.storage.sync.clear();
        loadSettings(null, function(data: Record<string, unknown>) {
            (browser._applyProxySettings as (d: Record<string, unknown>) => void)(data);
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
    self.cdpReloadExtension = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
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
    self.userLog = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        const prefix = message.fromUserScript ? '[USER-SCRIPT]' : '[CONTENT]';
        console.log(prefix, message.msg);
        if (message.needResponse) {
            sendResponse({ logged: true, timestamp: Date.now() });
        }
    };
    self.loadSettingsFromUrl = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        _loadSettingsFromUrl(message.url as string, function(status: Record<string, unknown>) {
            _response(message, sendResponse, status);
        });
    };
    function _filterByTitleOrUrl(tabs: Array<{url?: string; title?: string}>, query: string) {
        tabs = tabs.filter(function(b) {
            return b.url;
        });
        return filterByTitleOrUrl(tabs as TitleUrlItem[], query, false) as unknown as chrome.tabs.Tab[];
    }
    self.getRecentlyClosed = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        chrome.sessions.getRecentlyClosed({}, function(sessions) {
            var tabs: chrome.tabs.Tab[] = [];
            for (var i = 0; i < sessions.length; i ++) {
                var s = sessions[i];
                if (s.hasOwnProperty('window')) {
                    tabs = tabs.concat(s.window!.tabs ?? []);
                } else if (s.hasOwnProperty('tab')) {
                    tabs.push(s.tab! as chrome.tabs.Tab);
                }
            }
            tabs = _filterByTitleOrUrl(tabs, message.query as string);
            _response(message, sendResponse, {
                urls: tabs
            });
        });
    };
    self.getTopSites = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        if (chrome.topSites) {
            chrome.topSites.get(function(urls) {
                urls = _filterByTitleOrUrl(urls, message.query as string) as chrome.topSites.MostVisitedURL[];
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


    function _getHistory(text: string, maxResults: number, cb: (items: chrome.history.HistoryItem[]) => void, sortByMostUsed: boolean) {
        (browser.getLatestHistoryItem as (text: string, maxResults: number, cb: (items: chrome.history.HistoryItem[]) => void) => void)(text, maxResults, (items: chrome.history.HistoryItem[]) => {
            if (sortByMostUsed) {
                items = items.sort(function(a: chrome.history.HistoryItem, b: chrome.history.HistoryItem) {
                    return (b.visitCount ?? 0) - (a.visitCount ?? 0);
                });
            }
            cb(items);
        });
    }
    self.getAllURLs = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        chrome.bookmarks.search(message.query as string || {}, function(bmItems) {
            var urls: Array<chrome.bookmarks.BookmarkTreeNode | chrome.history.HistoryItem> = bmItems,
                requestCount = (message.maxResults as number) || 100;
            var maxResults = requestCount - urls.length;
            if (maxResults > 0) {
                _getHistory(message.query as string || "", maxResults,  function(historyItems: chrome.history.HistoryItem[]) {
                    urls = (urls as chrome.history.HistoryItem[]).concat(historyItems);
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
    self.getTabs = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        var tab = sender.tab;
        var queryInfo = (message.queryInfo as chrome.tabs.QueryInfo) || {};
        chrome.tabs.query(queryInfo, function(tabs) {
            tabs = _filterByTitleOrUrl(tabs, message.filter as string) as chrome.tabs.Tab[];
            if (tabs.length > (message.tabsThreshold as number) && conf.tabsMRUOrder) {
                // only remove current tab when tabsMRUOrder is enabled.
                tabs = tabs.filter(function(b) {
                    return b.id !== tab?.id;
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
    self.createTabGroup = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tabs.group({tabIds: [sender.tab!.id!], groupId: message.groupId as number | undefined}, function(groupId) {
            if (message.title || message.color) {
                chrome.tabGroups.update(groupId, {
                    title: message.title as string | undefined,
                    color: message.color as chrome.tabGroups.Color | undefined
                });
            }
        });
    };
    self.ungroupTab = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tabs.ungroup([sender.tab!.id!]);
    };
    self.collapseGroup = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tabGroups.update(message.groupId as number, {collapsed: message.collapsed as boolean});
    };
    self.getTabGroups = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        type TabGroupExtended = chrome.tabGroups.TabGroup & { hermit?: boolean; tabs?: chrome.tabs.Tab[]; active?: boolean };
        chrome.tabGroups.query({}, function(rawGroups: chrome.tabGroups.TabGroup[]) {
            var groups = rawGroups as TabGroupExtended[];
            let activeGroup = -1;
            // retrieve all tabs of each group
            chrome.tabs.query({}, function(tabs) {
                const tabsInGroup: Record<number, chrome.tabs.Tab[]> = {};
                tabs.forEach(function(tab) {
                    if (tab.groupId && tab.groupId !== (chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1)) {
                        if (!tabsInGroup[tab.groupId]) {
                            tabsInGroup[tab.groupId] = [];
                        }
                        if (tab.id === sender.tab?.id) {
                            activeGroup = tab.groupId;
                        }
                        tabsInGroup[tab.groupId].push(tab);
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
    self.togglePinTab = function(_message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        getActiveTab(function(tab: chrome.tabs.Tab) {
            return chrome.tabs.update(tab.id!, {
                pinned: !tab.pinned
            });
        });
    };
    self.closeTabByIds = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tabs.remove(message.tabIds as number[]);
    };
    function focusTab(windowId: number, tabId: number) {
        chrome.windows.update(windowId, {
            focused: true
        }, function() {
            chrome.tabs.update(tabId, {
                active: true
            });
        });
    }
    self.focusTab = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        if (message.windowId !== undefined && sender.tab?.windowId !== (message.windowId as number)) {
            focusTab(message.windowId as number, message.tabId as number);
        } else {
            chrome.tabs.update(message.tabId as number, {
                active: true
            });
        }
    };
    self.focusTabByIndex = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        var queryInfo = (message.queryInfo as chrome.tabs.QueryInfo) || {currentWindow: true};
        chrome.tabs.query(queryInfo, function(tabs) {
            const repeats = message.repeats as number;
            if (repeats > 0 && repeats <= tabs.length) {
                chrome.tabs.update(tabs[repeats - 1].id!, {
                    active: true
                });
            }
        });
    };
    self.goToLastTab = function(_message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        if (tabHistory.length > 1) {
            var lastTab = tabHistory[tabHistory.length - 2];
            chrome.tabs.update(lastTab, {
                active: true
            });
        }
    };
    self.historyTab = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        if (tabHistory.length > 0) {
            historyTabAction = true;
            if (message.hasOwnProperty("index")) {
                tabHistoryIndex = (parseInt(message.index as string) + tabHistory.length) % tabHistory.length;
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
    function _fixTo(to: number, length: number) {
        if (to < 0) {
            to = 0;
        } else if (to >= length){
            to = length;
        }
        return to;
    }
    // round base ahead if repeats reaches length
    function _roundBase(base: number, repeats: number, length: number) {
        if (repeats > length - base) {
            base -= repeats - (length - base);
        }
        return base;
    }
    function _nextTab(tab: chrome.tabs.Tab | null | undefined, step: number) {
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
            getActiveTab(function(t: chrome.tabs.Tab) {
                _nextTab(t, step);
            });
        }
    }
    self.nextTab = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        _nextTab(sender.tab, message.repeats || 1);
    };
    self.previousTab = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        _nextTab(sender.tab, -(message.repeats || 1));
    };
    self.tabGotoIndex = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        var index = (message.repeats || 1) - 1;
        chrome.tabs.query({ currentWindow: true }, function(tabs) {
            var target = tabs[index] || tabs[tabs.length - 1];
            if (target) {
                chrome.tabs.update(target.id, { active: true });
            }
        });
    };
    function _roundRepeatTabs(tab: chrome.tabs.Tab | null | undefined, repeats: number, operation: (tabIds: number[]) => void) {
        if (tab) {
            chrome.tabs.query({
                windowId: tab.windowId
            }, function(tabs) {
                var tabIds = tabs.map(function(e) {
                    return e.id!;
                });
                repeats = _fixTo(repeats, tabs.length);
                var base = _roundBase(tab.index, repeats, tabs.length);
                operation(tabIds.slice(base, base + repeats));
            });
        } else {
            getActiveTab(function(t: chrome.tabs.Tab) {
                _roundRepeatTabs(t, repeats, operation);
            });
        }
    }
    self.reloadTab = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        _roundRepeatTabs(sender.tab, message.repeats as number, function(tabIds: number[]) {
            tabIds.forEach(function(tabId: number) {
                chrome.tabs.reload(tabId, {
                    bypassCache: message.nocache as boolean | undefined
                });
            });
        });
    };
    self.closeTab = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        _roundRepeatTabs(sender.tab, message.repeats as number, function(tabIds: number[]) {
            chrome.tabs.remove(tabIds, function() {
                if ( conf.focusAfterClosed === "left" ) {
                    _nextTab(sender.tab, -1);
                } else if ( conf.focusAfterClosed === "last" ) {
                    (self.historyTab as MessageHandler)({action: 'historyTab', backward: true} as Msg, {} as chrome.runtime.MessageSender, () => {});
                }
            });
        });
    };
    function getChildrenTabsRecursively(tabId: number, allTabs: chrome.tabs.Tab[]): chrome.tabs.Tab[] {
        var direct = allTabs.filter(function(t: chrome.tabs.Tab) { return t.openerTabId === tabId; });
        var result = direct.slice();
        direct.forEach(function(child: chrome.tabs.Tab) {
            result = result.concat(getChildrenTabsRecursively(child.id!, allTabs));
        });
        return result;
    }

    function tabHandleMagic(magic: string, currentTab: chrome.tabs.Tab, repeats: number, windowTabs: chrome.tabs.Tab[], allTabs?: chrome.tabs.Tab[]): number[] {
        switch (magic) {
            case 'DirectionRight': {
                var right = windowTabs.filter(function(t: chrome.tabs.Tab) { return t.index > currentTab.index; });
                if (repeats > 1) return right.slice(0, repeats).map(function(t: chrome.tabs.Tab) { return t.id!; });
                return right.map(function(t: chrome.tabs.Tab) { return t.id!; });
            }
            case 'DirectionRightInclusive': {
                var right = windowTabs.filter(function(t: chrome.tabs.Tab) { return t.index >= currentTab.index; });
                // no repeat = all inclusive; explicit N > 1 = current + N to the right
                if (repeats > 1) return right.slice(0, repeats + 1).map(function(t: chrome.tabs.Tab) { return t.id!; });
                return right.map(function(t: chrome.tabs.Tab) { return t.id!; });
            }
            case 'DirectionLeft': {
                var left = windowTabs.filter(function(t: chrome.tabs.Tab) { return t.index < currentTab.index; });
                left.reverse();
                if (repeats > 1) return left.slice(0, repeats).map(function(t: chrome.tabs.Tab) { return t.id!; });
                return left.map(function(t: chrome.tabs.Tab) { return t.id!; });
            }
            case 'DirectionLeftInclusive': {
                var left = windowTabs.filter(function(t: chrome.tabs.Tab) { return t.index <= currentTab.index; });
                left.reverse();
                // no repeat = all inclusive; explicit N > 1 = current + N to the left
                if (repeats > 1) return left.slice(0, repeats + 1).map(function(t: chrome.tabs.Tab) { return t.id!; });
                return left.map(function(t: chrome.tabs.Tab) { return t.id!; });
            }
            case 'AllExceptActive':
                return windowTabs.filter(function(t: chrome.tabs.Tab) { return t.id !== currentTab.id; }).map(function(t: chrome.tabs.Tab) { return t.id!; });
            case 'AllInWindow':
                return windowTabs.map(function(t: chrome.tabs.Tab) { return t.id!; });
            case 'AllExceptActiveAllWindows':
                return (allTabs || []).filter(function(t: chrome.tabs.Tab) { return t.id !== currentTab.id; }).map(function(t: chrome.tabs.Tab) { return t.id!; });
            case 'ChildrenTabs':
                return windowTabs.filter(function(t: chrome.tabs.Tab) { return t.openerTabId === currentTab.id; }).map(function(t: chrome.tabs.Tab) { return t.id!; });
            case 'ChildrenTabsRecursively':
                return getChildrenTabsRecursively(currentTab.id!, allTabs || []).map(function(t: chrome.tabs.Tab) { return t.id!; });
            case 'AllOtherWindowsTabs':
                return (allTabs || []).filter(function(t: chrome.tabs.Tab) { return t.windowId !== currentTab.windowId; }).map(function(t: chrome.tabs.Tab) { return t.id!; });
            case 'OtherWindowsNoPinned': {
                var otherWindows = [...new Set(
                    (allTabs || []).filter(function(t: chrome.tabs.Tab) { return t.windowId !== currentTab.windowId; }).map(function(t: chrome.tabs.Tab) { return t.windowId; })
                )];
                var windowsWithPinned = new Set(
                    (allTabs || []).filter(function(t: chrome.tabs.Tab) { return t.pinned; }).map(function(t: chrome.tabs.Tab) { return t.windowId; })
                );
                var eligibleWindows = new Set(otherWindows.filter(function(wid) { return !windowsWithPinned.has(wid); }));
                return (allTabs || []).filter(function(t: chrome.tabs.Tab) { return eligibleWindows.has(t.windowId); }).map(function(t: chrome.tabs.Tab) { return t.id!; });
            }
            case 'AllIncognitoTabs':
                return (allTabs || []).filter(function(t: chrome.tabs.Tab) { return t.incognito; }).map(function(t: chrome.tabs.Tab) { return t.id!; });
            case 'CurrentTab':
                return [currentTab.id!];
            default:
                return [];
        }
    }

    self.closeTabMagic = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tabs.query({}, function(allTabs) {
            var windowTabs = allTabs.filter(function(t) { return t.windowId === sender.tab?.windowId; });
            var repeats = message.repeats as number;
            var tabIds = tabHandleMagic(message.magic as string, sender.tab!, repeats, windowTabs, allTabs);
            var pinnedIds = new Set(allTabs.filter(function(t) { return t.pinned; }).map(function(t) { return t.id; }));
            tabIds = tabIds.filter(function(id: number) { return !pinnedIds.has(id); });
            if (tabIds.length) {
                chrome.tabs.remove(tabIds);
            }
        });
    };

    self.goToParentTab = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tabs.get(sender.tab!.id!, function(tab) {
            if (tab && tab.openerTabId) {
                chrome.tabs.update(tab.openerTabId, { active: true });
            }
        });
    };

    self.reloadTabMagic = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tabs.query({}, function(allTabs) {
            var windowTabs = allTabs.filter(function(t) { return t.windowId === sender.tab?.windowId; });
            var repeats = message.repeats as number;
            var tabIds = tabHandleMagic(message.magic as string, sender.tab!, repeats, windowTabs, allTabs);
            tabIds.forEach(function(id: number) {
                chrome.tabs.reload(id, { bypassCache: false });
            });
        });
    };

    self.copyTabUrlsMagic = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        chrome.tabs.query({}, function(allTabs) {
            var windowTabs = allTabs.filter(function(t) { return t.windowId === sender.tab?.windowId; });
            var repeats = message.repeats as number;
            if (repeats == null && (message.magic === 'DirectionRight' || message.magic === 'DirectionLeft')) {
                repeats = 1;
            }
            var tabIds = tabHandleMagic(message.magic as string, sender.tab!, repeats, windowTabs, allTabs);
            var tabMap: Record<number, chrome.tabs.Tab> = {};
            allTabs.forEach(function(t) {
                tabMap[t.id!] = t;
            });
            var urls = tabIds.map(function(id: number) {
                var tab = tabMap[id];
                return tab && tab.url;
            }).filter(Boolean);
            _response(message, sendResponse, {
                urls: urls
            });
        });
    };

    self.pinTabMagic = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tabs.query({currentWindow: true}, function(tabs) {
            var repeats = (message.repeats as number) || 1;
            var tabIds = tabHandleMagic(message.magic as string, sender.tab!, repeats, tabs);
            var pinStateMap: Record<number, boolean | undefined> = {};
            tabs.forEach(function(t) { pinStateMap[t.id!] = t.pinned; });
            tabIds.forEach(function(id: number) {
                chrome.tabs.update(id, { pinned: !pinStateMap[id] });
            });
        });
    };

    self.bookmarkTabsMagic = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tabs.query({currentWindow: true}, function(tabs) {
            var repeats = (message.repeats as number) || 1;
            var tabIds = tabHandleMagic(message.magic as string, sender.tab!, repeats, tabs);
            var idSet = new Set(tabIds);
            tabs.filter(function(t) { return idSet.has(t.id!); }).forEach(function(t) {
                chrome.bookmarks.create({ parentId: "1", title: t.title, url: t.url });
            });
        });
    };

    self.unbookmarkTabsMagic = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tabs.query({currentWindow: true}, function(tabs) {
            var repeats = (message.repeats as number) || 1;
            var tabIds = tabHandleMagic(message.magic as string, sender.tab!, repeats, tabs);
            var idSet = new Set(tabIds);
            tabs.filter(function(t) { return idSet.has(t.id!); }).forEach(function(t) {
                if (t.url) removeBookmark(t.url);
            });
        });
    };

    self.closeAudibleTab = function(_message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tabs.query({audible: true}, function(tabs) {
            if (tabs) {
                chrome.tabs.remove(tabs[0].id!);
            }
        });
    };
    self.muteTab = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        var tab = sender.tab!;
        chrome.tabs.update(tab.id!, {
            muted: ! tab.mutedInfo!.muted
        });
    };
    self.openLast = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        if (browser.name === "Safari") {
            chrome.runtime.sendNativeMessage("application.id", {command: "reopenLastTab"}, function(response) {
                _response(message, sendResponse, response);
            });
        } else {
            chrome.sessions.restore();
        }
    };
    self.duplicateTab = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        if (message.active === false) {
            // For background duplication: create duplicate then immediately reactivate original
            // Note: Chrome's tabs.duplicate() always activates the new tab, so we must
            // switch back to the original tab after duplication completes
            chrome.tabs.duplicate(sender.tab!.id!, function(_duplicatedTab) {
                // Immediately reactivate the original tab
                chrome.tabs.update(sender.tab!.id!, { active: true });
            });
        } else {
            // For foreground duplication: default behavior (duplicate becomes active)
            chrome.tabs.duplicate(sender.tab!.id!);
        }
    };
    let previousWindowChoice = -1;
    self.getWindows = function (message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        chrome.tabs.query({currentWindow: false}, function(tabs) {
            const windows: Record<number, {title: string | undefined; url: string | undefined}[]> = {};
            tabs.forEach(t => {
                const tabsInWindow = windows[t.windowId] || [];
                tabsInWindow.push({title: t.title, url: t.url});
                windows[t.windowId] = tabsInWindow;
            });
            _response(message, sendResponse, {
                windows: Object.keys(windows).map(w => {
                    return {
                        id: w,
                        tabs: windows[Number(w)],
                        isPreviousChoice: (parseInt(w) === previousWindowChoice)
                    };
                })
            });
        });
    };
    self.moveToWindow = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        const windowId = message.windowId as number;
        if (windowId === -1) {
            chrome.windows.create({tabId: sender.tab!.id});
        } else {
            chrome.tabs.move(sender.tab!.id!, {windowId, index: -1}, () => {
                focusTab(windowId, sender.tab!.id!);
            });
        }
        previousWindowChoice = windowId;
    };
    self.moveToWindowMagic = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tabs.query({}, function(allTabs) {
            var windowTabs = allTabs.filter(function(t) { return t.windowId === sender.tab!.windowId; });
            var repeats = message.repeats as number;
            var tabIds = tabHandleMagic(message.magic as string, sender.tab!, repeats, windowTabs, allTabs);
            if (!tabIds.length) return;
            chrome.windows.create({tabId: tabIds[0]}, function(newWindow) {
                if (!newWindow || !newWindow.id) return;
                tabIds.slice(1).forEach(function(tabId: number) {
                    chrome.tabs.move(tabId, {windowId: newWindow.id, index: -1});
                });
            });
        });
    };
    self.gatherWindows = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        const windowId = sender.tab!.windowId;
        chrome.tabs.query({currentWindow: false}, function(tabs) {
            tabs.forEach(function(tab) {
                chrome.tabs.move(tab.id!, {windowId, index: -1});
            });
        });
    };
    self.gatherTabs = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        const windowId = sender.tab!.windowId;
        (message.tabs as chrome.tabs.Tab[]).forEach(function(tab: chrome.tabs.Tab) {
            chrome.tabs.move(tab.id!, {windowId, index: -1});
        });
    };
    self.getBookmarkFolders = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        chrome.bookmarks.getTree(function(tree) {
            bookmarkFolders = [];
            getFolders(tree[0], "");
            _response(message, sendResponse, {
                folders: bookmarkFolders
            });
        });
    };
    self.createBookmark = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        const page = message.page as { path: string[]; folder: string; title: string; url: string };
        removeBookmark(page.url, function() {
            createBookmark(page, function(ret: chrome.bookmarks.BookmarkTreeNode) {
                _response(message, sendResponse, {
                    bookmark: ret
                });
            });
        });
    };
    function filterBookmarksByQuery(bookmarks: chrome.bookmarks.BookmarkTreeNode[] | undefined, query: string, caseSensitive: boolean | undefined) {
        return (bookmarks || []).filter(function(b: chrome.bookmarks.BookmarkTreeNode) {
            var title = b.title, url = b.url;
            if (!caseSensitive) {
                title = title.toLowerCase();
                url = url && url.toLowerCase();
                query = query.toLowerCase();
            }
            return title.indexOf(query) !== -1 || (url && url.indexOf(query) !== -1);
        });
    }
    self.getBookmarks = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        const parentId = message.parentId as string | undefined;
        const query = message.query as string | undefined;
        const caseSensitive = message.caseSensitive as boolean | undefined;
        if (parentId) {
            chrome.bookmarks.getSubTree(parentId, function(tree) {
                var bookmarks = tree[0].children;
                if (query && query.length) {
                    bookmarks = filterBookmarksByQuery(bookmarks, query, caseSensitive);
                }
                _response(message, sendResponse, {
                    bookmarks: bookmarks
                });
            });
        } else {
            if (query && query.length) {
                chrome.bookmarks.search(query, function(tree) {
                    _response(message, sendResponse, {
                        bookmarks: filterBookmarksByQuery(tree, query, caseSensitive)
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
    self.getHistory = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        _getHistory(message.query as string || "", message.maxResults as number || 100, function(tree: chrome.history.HistoryItem[]) {
            _response(message, sendResponse, {
                history: tree
            });
        }, message.sortByMostUsed as boolean);
    };
    self.addHistories = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        (message.history as string[]).forEach((h: string) => {
            chrome.history.addUrl({url: h});
        });
    };
    function normalizeURL(url: string) {
        if (!/^view-source:|^javascript:/.test(url) && /^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/\n]+)/im.test(url)) {
            if (/^[\w-]+?:/i.test(url)) {
                url = url;
            } else {
                url = "http://" + url;
            }
        }
        return url;
    }

    function openUrlInNewTab(currentTab: chrome.tabs.Tab, url: string, message: Msg) {
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
        const tabOpts = message.tab as { active?: boolean; pinned?: boolean } | undefined;
        chrome.tabs.create({
            url: url,
            active: tabOpts?.active,
            index: newTabPosition,
            pinned: tabOpts?.pinned,
            openerTabId: currentTab.id
        }, function(tab) {
            if (message.scrollLeft || message.scrollTop) {
                tabMessages[tab!.id!] = {
                    scrollLeft: message.scrollLeft as number,
                    scrollTop: message.scrollTop as number
                };
            }
        });
    }

    self.openLink = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        var url = normalizeURL(message.url as string);
        const msgTab = message.tab as { tabbed?: boolean; active?: boolean; pinned?: boolean } | undefined;
        if (url.startsWith("javascript:")) {
            sendTabMessage(sender.tab?.id, 0, {
                subject: "showBanner",
                message: "JavaScript URLs are not allowed in such operation."
            });
        } else {
            if (msgTab?.tabbed) {
                if (sender.frameId !== 0 && chrome.runtime.getURL("pages/frontend.html") === sender.url
                    || !sender.tab) {
                    // if current call was made from Omnibar, the sender.tab may be stale,
                    // as sender was bound when port was created.
                    getActiveTab(function(tab: chrome.tabs.Tab) {
                        openUrlInNewTab(tab, url, message);
                    });
                } else {
                    openUrlInNewTab(sender.tab, url, message);
                }
            } else {
                chrome.tabs.update({
                    url: url,
                    pinned: msgTab?.pinned || sender.tab?.pinned
                }, function(tab) {
                    if (message.scrollLeft || message.scrollTop) {
                        tabMessages[tab!.id!] = {
                            scrollLeft: message.scrollLeft as number,
                            scrollTop: message.scrollTop as number
                        };
                    }
                });
            }
        }
    };
    self.viewSource = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        message.url = 'view-source:' + sender.tab?.url;
        (self.openLink as MessageHandler)(message, sender, sendResponse);
    };
    self.openNewtab = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        message.url = conf.newTabUrl;
        message.tab = { tabbed: true };
        (self.openLink as MessageHandler)(message, sender, sendResponse);
    };
    function onFullSettingsRequested(data: Record<string, unknown>) {
        data.isMV3 = isMV3;
        data.useNeovim = browser.nvimServer && (browser.nvimServer as Record<string, unknown>).instance;
        data.isUserScriptsAvailable = isUserScriptsAvailable();
        if (isMV3) {
            data.showAdvanced = data.isUserScriptsAvailable && data.showAdvanced;
        }

        ensureSettingsSnippetRegistration({
            showAdvanced: Boolean(data && data.showAdvanced),
            snippets: (data && typeof data.snippets === 'string') ? data.snippets : ''
        });
    }
    self.getSettings = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        var pf: (keys: string | string[] | null, cb: (data: Record<string, unknown>) => void) => void = loadSettings;
        if (message.key === "RAW") {
            pf = browser.loadRawSettings as typeof pf;
            message.key = "";
        }
        pf(message.key as string, function(data: Record<string, unknown>) {
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
    self.updateSettings = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        let error = "";
        const settings = message.settings as Record<string, unknown>;
        if (message.scope === "snippets") {
            // For settings from snippets, don't broadcast the update
            // neither persist into storage (except newTabUrl which needs storage for onCreated)
            for (var k in settings) {
                if (conf.hasOwnProperty(k)) {
                    conf[k] = settings[k];
                    // Persist newTabUrl to storage for onCreated listener
                    if (k === 'newTabUrl') {
                        chrome.storage.local.set({ newTabUrl: settings[k] as string });
                    }
                }
            }
            const llmConf = conf.llm as Record<string, Record<string, string>> | undefined;
            const settingsLlm = settings.llm as Record<string, unknown> | undefined;
            if (llmConf?.ollama?.model) {
                (llmClients.ollama as unknown as Record<string, unknown>).model = llmConf.ollama.model;
            }
            if (llmConf?.deepseek?.apiKey) {
                (llmClients.deepseek as unknown as Record<string, unknown>).apiKey = llmConf.deepseek.apiKey;
                (llmClients.deepseek as unknown as Record<string, unknown>).model = llmConf.deepseek.model;
                if (settingsLlm) delete (settingsLlm as Record<string, unknown>).deepseek;
            }
            if (llmConf?.gemini?.apiKey) {
                (llmClients.gemini as unknown as Record<string, unknown>).apiKey = llmConf.gemini.apiKey;
                (llmClients.gemini as unknown as Record<string, unknown>).model = llmConf.gemini.model;
                if (settingsLlm) delete (settingsLlm as Record<string, unknown>).gemini;
            }
            if (llmConf?.bedrock?.accessKeyId
                && llmConf.bedrock.secretAccessKey
                && llmConf.bedrock.model) {
                ((llmClients.bedrock as unknown as { init: (cfg: unknown) => void }).init)(llmConf.bedrock);
                if (settingsLlm) delete (settingsLlm as Record<string, unknown>).bedrock;
            }
            if (llmConf?.custom?.serviceUrl && llmConf.custom.apiKey && llmConf.custom.model) {
                (llmClients.custom as unknown as Record<string, unknown>).serviceUrl = llmConf.custom.serviceUrl;
                (llmClients.custom as unknown as Record<string, unknown>).apiKey = llmConf.custom.apiKey;
                (llmClients.custom as unknown as Record<string, unknown>).model = llmConf.custom.model;
                if (settingsLlm) delete (settingsLlm as Record<string, unknown>).custom;
            }
        } else {
            if (settings.showAdvanced && isMV3) {
                if (isUserScriptsAvailable()) {
                    chrome.userScripts.configureWorld({
                        csp: 'script-src \'self\' \'unsafe-eval\'',
                        messaging: true
                    });
                    _updateAndPostSettings(settings);
                } else {
                    error = "Advanced mode is only available when Developer mode is turned on from chrome://extensions/.";
                }
            } else {
                _updateAndPostSettings(settings);
            }
        }
        return { error };
    };
    self.updateInputHistory = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        let key: string | undefined = undefined, value: unknown;
        for (var k in message) {
            key = k + "History";
            value = message[k];
            break;
        }
        if (key) {
            loadSettings(key, function(data: Record<string, unknown>) {
                let curr = (data[key!] as string[]) || [];
                let toUpdate: Record<string, unknown> = {};
                if (Array.isArray(value)) {
                    toUpdate[key!] = value;
                    _updateAndPostSettings(toUpdate);
                } else if (typeof value === 'string' && value.trim().length && value !== ".") {
                    curr = curr.filter(function(c: string) {
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
    self.setSurfingkeysIcon = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
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
    self.request = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        request(message.url as string, function(res: string) {
            _response(message, sendResponse, {
                text: res
            });
        }, message.headers as Record<string, string> | undefined, message.data as string | undefined, (e: Error) => {
            _response(message, sendResponse, {
                error: e.toString()
            });
        });
    };
    self.requestImage = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        fetch(message.url as string, {
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
    self.nextFrame = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        const tid = sender.tab!.id!;
        chrome.scripting.executeScript({
            target: {
                allFrames: true,
                tabId: tid,
            },
            func: () => {
                // getFrameId is injected by content scripts into the page context
                // @ts-expect-error -- getFrameId is injected at runtime
                return typeof(getFrameId) === 'function' ? getFrameId() : 0;
            },
        }, function(framesInTabRaw) {
            const framesInTab = framesInTabRaw.map((res) => {
                return res.result as number | undefined;
            }).filter((frameId): frameId is number => {
                return !!frameId;
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
    self.moveTab = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tabs.query({
            windowId: sender.tab!.windowId
        }, function(tabs) {
            var to = _fixTo(sender.tab!.index + (message.step as number) * (message.repeats as number), tabs.length);
            chrome.tabs.move(sender.tab!.id!, {
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
    self.quit = function(_message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        _quit();
    };
    self.createSession = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        loadSettings('sessions', function(data: Record<string, unknown>) {
            chrome.tabs.query({}, function(tabs) {
                var tabGroup: Record<number, string[]> = {};
                tabs.forEach(function(tab) {
                    if (tab && tab.index !== void 0) {
                        if (!tabGroup.hasOwnProperty(tab.windowId)) {
                            tabGroup[tab.windowId] = [];
                        }
                        if (tab.url && tab.url !== conf.newTabUrl) {
                            tabGroup[tab.windowId].push(tab.url);
                        }
                    }
                });
                var tabg: string[][] = [];
                for (var k in tabGroup) {
                    if (tabGroup[Number(k)].length) {
                        tabg.push(tabGroup[Number(k)]);
                    }
                }
                const sessions = data.sessions as Record<string, Record<string, unknown>>;
                sessions[message.name as string] = {};
                sessions[message.name as string]['tabs'] = tabg;
                _updateAndPostSettings({
                    sessions: data.sessions
                }, (message.quitAfterSaved ? _quit : undefined));
            });
        });
    };
    self.openSession = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        loadSettings('sessions', function(data: Record<string, unknown>) {
            const sessions = data.sessions as Record<string, Record<string, string[][]>>;
            if (sessions.hasOwnProperty(message.name as string)) {
                var urls = sessions[message.name as string]['tabs'];
                urls[0].forEach(function(url: string) {
                    chrome.tabs.create({
                        url: url,
                        active: false,
                        pinned: false
                    });
                });
                for (var i = 1; i < urls.length; i++) {
                    var a = urls[i];
                    chrome.windows.create({}, function(win) {
                        a.forEach(function(url: string) {
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
                    url: conf.newTabUrl as string
                }, function(tabs) {
                    chrome.tabs.remove(tabs.map(function(t) {
                        return t.id!;
                    }));
                });
            }
        });
    };
    self.deleteSession = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        loadSettings('sessions', function(data: Record<string, unknown>) {
            const sessions = data.sessions as Record<string, unknown>;
            delete sessions[message.name as string];
            _updateAndPostSettings({
                sessions: data.sessions
            });
        });
    };
    self.closeDownloadsShelf = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        if (message.clearHistory) {
            chrome.downloads.erase({"urlRegex": ".*"});
        } else {
            chrome.downloads.setShelfEnabled(false);
            chrome.downloads.setShelfEnabled(true);
        }
    };
    self.getDownloads = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        chrome.downloads.search(message.query as chrome.downloads.DownloadQuery, function(items) {
            _response(message, sendResponse, {
                downloads: items
            });
        });
    };
    self.download = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.downloads.download({
            url: message.url as string,
            filename: message.filename as string | undefined,
            saveAs: message.saveAs as boolean | undefined
        });
    };
    self.tabURLAccessed = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        if (sender.tab) {
            var tabId = sender.tab.id!;
            _setScrollPos_bg(tabId);
            if (!tabURLs.hasOwnProperty(tabId)) {
                tabURLs[tabId] = {};
            }
            tabURLs[tabId][message.url as string] = message.title as string;
            return {
                active: sender.tab.active,
                index: conf.showTabIndices ? sender.tab.index + 1 : 0
            };
        } else {
            return {};
        }
    };
    self.getTabURLs = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        const tabURLMap = tabURLs[sender.tab!.id!] || {};
        const tabURLList = Object.keys(tabURLMap).map(function(u) {
            return {
                url: u,
                title: tabURLMap[u]
            };
        });
        return {
            urls: tabURLList
        };
    };
    self.getTopURL = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        return {
            url: sender.tab ? sender.tab.url : ""
        };
    };

    function updateProxy(message: Msg, cb: ((diffSet: Record<string, unknown>) => void) | null | undefined) {
        loadSettings(['proxyMode', 'proxy', 'autoproxy_hosts'], function(proxyConf: Record<string, unknown>) {
            const proxyList = proxyConf.proxy as string[];
            const autoproxyHosts = proxyConf.autoproxy_hosts as string[][];
            const msgNumber = message.number as number | undefined;
            if (message.operation === "deleteProxyPair") {
                proxyList.splice(msgNumber!, 1);
                autoproxyHosts.splice(msgNumber!, 1);
            } else if (message.operation === "set") {
                proxyConf.proxyMode = message.mode;
                proxyConf.proxy = message.proxy;
                proxyConf.autoproxy_hosts = message.host;
            } else {
                if (message.mode) {
                    proxyConf.proxyMode = message.mode;
                }
                const num = (msgNumber !== undefined ? msgNumber : 0);
                if (!message.number) {
                    message.number = 0;
                }
                if (message.proxy) {
                    proxyList[num] = message.proxy as string;
                    if (autoproxyHosts.length <= num) {
                        autoproxyHosts[num] = [];
                    }
                }
                if (message.host) {
                    var hostsDict = dictFromArray(autoproxyHosts[num], 1);
                    var hosts = (message.host as string).split(/\s*[ ,\n]\s*/);
                    if (message.operation === "toggle") {
                        hosts.forEach(function(host: string) {
                            if (hostsDict.hasOwnProperty(host)) {
                                delete hostsDict[host];
                            } else {
                                hostsDict[host] = 1;
                            }
                        });
                    } else if (message.operation === "add") {
                        hosts.forEach(function(host: string) {
                            hostsDict[host] = 1;
                        });
                    } else {
                        hosts.forEach(function(host: string) {
                            delete hostsDict[host];
                        });
                    }
                    autoproxyHosts[num] = Object.keys(hostsDict);
                }
            }
            var diffSet = {
                autoproxy_hosts: proxyConf.autoproxy_hosts,
                proxyMode: proxyConf.proxyMode,
                proxy: proxyConf.proxy
            };
            _updateAndPostSettings(diffSet);
            (browser._applyProxySettings as (conf: Record<string, unknown>) => void)(proxyConf);
            if (cb) {
                cb(diffSet);
            }
        });
    }
    self.updateProxy = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        updateProxy(message, function(diffSet: Record<string, unknown>) {
            _response(message, sendResponse, diffSet);
        });
    };
    self.setZoom = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        var tabId = sender.tab!.id;
        var zoomFactor = (message.zoomFactor as number) * ((message.repeats as number) || 1);
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
    function _removeURL(uid: string, cb: (() => void) | undefined) {
        var type = uid[0];
        var uidStr = uid.substr(1);
        if (type === 'B') {
            if (cb) chrome.bookmarks.remove(uidStr, cb); else chrome.bookmarks.remove(uidStr);
        } else if (type === 'H') {
            if (cb) chrome.history.deleteUrl({url: uidStr}, cb); else chrome.history.deleteUrl({url: uidStr});
        } else if (type === 'T') {
            var uidParts = uidStr.split(":").map(function(u: string) {
                return parseInt(u);
            });
            chrome.windows.update(uidParts[0], {
                focused: true
            }, function() {
                if (cb) chrome.tabs.remove(uidParts[1], cb); else chrome.tabs.remove(uidParts[1]);
            });
        } else if (type === 'M') {
            loadSettings('marks', function(data: Record<string, unknown>) {
                const marks = data.marks as Record<string, unknown>;
                delete marks[uidStr];
                _updateAndPostSettings({marks: marks}, cb);
            });
        }
    }
    self.removeURL = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        const msgUid = message.uid as string | string[];
        var uid: string[];
        var removed = 0, totalToRemoved: number;
        if (typeof(msgUid) === "string") {
            totalToRemoved = 1;
            uid = [ msgUid ];
        } else {
            uid = msgUid;
            totalToRemoved = uid.length;
        }
        function _done() {
            removed ++;
            if (removed === totalToRemoved) {
                _response(message, sendResponse, {
                    response: "Done"
                });
            }
        }
        uid.forEach(function(u: string) {
            _removeURL(u, _done);
        });

    };
    self.localData = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        const msgData = message.data as Record<string, unknown> | string | string[];
        if (typeof msgData === 'object' && !Array.isArray(msgData) && msgData !== null) {
            chrome.storage.local.set(msgData, function() {
            });
            // broadcast the change also, such as lastKeys
            // we would set lastKeys in sync to avoid breaching chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_MINUTE
            _broadcastSettings(msgData);
        } else {
            // string or array of string keys
            chrome.storage.local.get(msgData as string | string[], function(data) {
                _response(message, sendResponse, {
                    data: data
                });
            });
        }
    };
    self.captureVisibleTab = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
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
    self.getCaptureSize = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
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
    self.deleteHistoryOlderThan = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        var days = (message.days as number) || 0, hours = (message.hours as number) || 0;
        chrome.history.deleteRange({
            startTime: 0,
            endTime: new Date().getTime() - (days * 86400 + hours * 3600) * 1000
        }, function() {
        });
    };
    function removeBookmark(url: string, cb?: () => void) {
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
    self.removeBookmark = function(message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        removeBookmark(sender.tab!.url!);
    };
    self.getBookmark = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        chrome.bookmarks.search({
            url: sender.tab!.url
        }, function(bookmarks) {
            _response(message, sendResponse, {
                bookmarks: bookmarks
            });
        });
    };

    self.initGist = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        return Gist.initGist(message.token as string, function(gist: string) {
            _response(message, sendResponse, {
                gist: gist
            });
        });
    };
    self.readComment = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        Gist.readComment(message.index as number, function(resp: GistCommentResponse) {
            _response(message, sendResponse, resp);
        });
    };
    self.editComment = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        Gist.editComment(message.index as number, message.content as string, function(resp: unknown) {
            _response(message, sendResponse, {gistResp: resp});
        });
    };

    var _queueURLs: string[] = [];
    self.queueURLs = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        _queueURLs = _queueURLs.concat(message.urls as string[]);
    };
    self.getQueueURLs = function(_message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        return {
            queueURLs: _queueURLs
        };
    };
    self.clearQueueURLs = function(_message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        _queueURLs = [];
    };

    self.getVoices = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        chrome.tts.getVoices(function(voices) {
            _response(message, sendResponse, {
                voices: voices
            });
        });
    };

    self.read = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        var options = (message.options || {}) as chrome.tts.TtsOptions;
        options.onEvent = function(ttsEvent: chrome.tts.TtsEvent) {
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
                sendTabMessage(sender.tab?.id, -1, {
                    subject: 'onTtsEvent',
                    ttsEvent: ttsEvent
                });
            }
        };
        chrome.tts.speak(message.content as string, options);
    };
    self.stopReading = function(_message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.tts.stop();
    };

    self.openIncognito = function(message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        chrome.windows.create({"url": message.url as string, "incognito": true});
    };

    var userAgent: string;
    function _onBeforeSendHeaders(details: chrome.webRequest.OnBeforeSendHeadersDetails) {
        const requestHeaders = details.requestHeaders || [];
        for (var i = 0; i < requestHeaders.length; ++i) {
            if (requestHeaders[i].name === 'User-Agent') {
                requestHeaders[i].value = userAgent;
                break;
            }
        }
        return {requestHeaders};
    }

    self.writeClipboard = function (message: Msg, _sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        navigator.clipboard.writeText(message.text as string);
    };
    self.readClipboard = function (message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        // only for Safari
        chrome.runtime.sendNativeMessage("application.id", {command: "Clipboard.read"}, function(response) {
            _response(message, sendResponse, response);
        });
    };
    function toUTF8(str: string) {
        try {
            return decodeURIComponent(escape(str));
        } catch {
            return str;
        }
    }
    let clientInLLMRequest = {tabId: 0, frameId: 0};
    const sendLLMessage = (tabId: number, frameId: number, message: Record<string, unknown>) => {
        if (browser.name === "Safari") {
            chrome.runtime.sendMessage(message);
        } else {
            sendTabMessage(tabId, frameId, message);
        }
    };

    self.llmRequest = function (message: Msg, sender: chrome.runtime.MessageSender, _sendResponse: (response: unknown) => void) {
        clientInLLMRequest.tabId = sender.tab!.id!;
        clientInLLMRequest.frameId = sender.frameId!;

        const _decoder = new TextDecoder();

        const provider = message.provider as string;
        if (llmClients.hasOwnProperty(provider)) {
            const llmClient = llmClients[provider];
            llmClient(message as Record<string, unknown>, {
                onComplete: (msg: Record<string, unknown>) => {
                    if (msg.content && Array.isArray(msg.content)) {
                        msg.content = (msg.content as Array<{type: string; text?: string}>).map((c) => {
                            return c.type === "text" ? { type: "text", text: toUTF8(c.text ?? '') } : c;
                        });
                    }
                    sendLLMessage(clientInLLMRequest.tabId, clientInLLMRequest.frameId, {
                        subject: 'llmResponse',
                        message: msg,
                        done: true
                    });
                },
                onChunk: (chunk: string) => {
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
    self.getAllLlmProviders = function (message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        _response(message, sendResponse, {
            providers: Object.keys(llmClients)
        });
    };

    self.getContainerName = (browser._getContainerName as (self: Record<string, unknown>, _response: unknown) => unknown)(self, _response);
    chrome.runtime.setUninstallURL("http://brookhong.github.io/2018/01/30/why-did-you-uninstall-surfingkeys.html");

    self.connectNative = function (message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
        const nvimServer = browser.nvimServer as { instance?: Promise<{url: string; nm: {postMessage: (msg: Record<string, unknown>) => void}}> } | undefined;
        if (nvimServer && nvimServer.instance) {
            nvimServer.instance.then(({url, nm}: {url: string; nm: {postMessage: (msg: Record<string, unknown>) => void}}) => {
                nm.postMessage({
                    mode: message.mode
                });
                _response(message, sendResponse, {
                    url,
                });
            }).catch((error: Error) => {
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

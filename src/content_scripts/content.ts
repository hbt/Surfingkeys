import { RUNTIME, dispatchSKEvent, runtime } from './common/runtime.js';
import Mode from './common/mode.js';
import createNormal from './common/normal.js';
import startScrollNodeObserver from './common/observer.js';
import createInsert from './common/insert.js';
import createVisual from './common/visual.js';
import createHints from './common/hints.js';
import createClipboard from './common/clipboard.js';
import {
    applyUserSettings,
    createElementWithContent,
    generateQuickGuid,
    getBrowserName,
    getRealEdit,
    htmlEncode,
    initL10n,
    isInUIFrame,
    reportIssue,
    setSanitizedContent,
    showBanner,
} from './common/utils.js';
import createFront from './front.js';
import createAPI from './common/api.js';
import createDefaultMappings from './common/default.js';

import KeyboardUtils from './common/keyboardUtils';

import type { CommandAPI, ModeInstance, SurfingKeysConf, BrowserAdapter } from '../../@types/surfingkeys';

interface NormalModeInstance extends ModeInstance {
    disable(onElement?: boolean): void;
    enable(): void;
    startLurk(): string;
}

/*
 * Apply custom key mappings for basic users, the input is like
 * {"a": "b", "b": "a", "c": "d"}
 */
function applyBasicMappings(api: CommandAPI, normal: NormalModeInstance, mappings: Record<string, string>) {
    const originKeys = new Set(Object.keys(mappings));
    const originMappings: Record<string, unknown> = {};
    for (const originKey in mappings) {
        const newKey = mappings[originKey];
        // current new key is one original key that will be overrode later
        // we need save it some where first, since current map will lose it,
        // such as the `a` in above example.
        if (originKeys.has(newKey)) {
            const target = normal.mappings.find(newKey);
            if (target) {
                originMappings[newKey] = target.meta;
            }
        }
        if (newKey === "") {
            normal.mappings.remove(originKey);
        } else if (originMappings.hasOwnProperty(originKey)) {
            normal.mappings.add(newKey, originMappings[originKey]);
        } else {
            api.map(newKey, originKey);
        }
    }
}

function ensureRegex(regexName: keyof SurfingKeysConf) {
    const confAny = runtime.conf as unknown as Record<string, unknown>;
    const r = confAny[regexName];
    if (r && typeof r === 'object' && 'source' in r && !(r instanceof RegExp)) {
        confAny[regexName] = new RegExp((r as { source: string; flags: string }).source, (r as { source: string; flags: string }).flags);
    }
}

function applyRuntimeConf(normal: NormalModeInstance) {
    ensureRegex("prevLinkRegex");
    ensureRegex("nextLinkRegex");
    ensureRegex("clickablePat");
    RUNTIME('getState', {
        blocklistPattern: runtime.conf.blocklistPattern ? runtime.conf.blocklistPattern : undefined,
        lurkingPattern: runtime.conf.lurkingPattern ? runtime.conf.lurkingPattern : undefined
    }, function (resp) {
        const r = resp as { state: string; noPdfViewer?: boolean; proxyMode?: string; proxy?: string };
        let state = r.state;
        if (state === "disabled") {
            normal.disable();
            dispatchSKEvent("front", ['showStatus', [undefined, undefined, undefined, ""]]);
        } else if (state === "lurking") {
            state = normal.startLurk();
        } else {
            if (document.contentType === "application/pdf" && !r.noPdfViewer) {
                _browser.usePdfViewer?.();
            } else {
                normal.enable();
            }
            Mode.showStatus();
        }

        if (window === top) {
            RUNTIME('setSurfingkeysIcon', {
                status: state
            });
            var proxyMode = "";
            if (state === "enabled" && runtime.conf.showProxyInStatusBar && r.proxyMode) {
                proxyMode = r.proxyMode;
                if (["byhost", "always"].indexOf(r.proxyMode) !== -1) {
                    proxyMode = "{0}: {1}".format(r.proxyMode, r.proxy ?? "");
                }
            }
            dispatchSKEvent("front", ['showStatus', [undefined, undefined, undefined, proxyMode]]);
        }
    });
}


function applySettings(api: CommandAPI, normal: NormalModeInstance, rs: Record<string, unknown>) {
    for (var k in rs) {
        if (runtime.conf.hasOwnProperty(k)) {
            (runtime.conf as unknown as Record<string, unknown>)[k] = rs[k];
        }
    }
    if ('findHistory' in rs) {
        const fh = rs.findHistory as string[];
        runtime.conf.lastQuery = fh.length ? fh[0] : "";
    }
    if (!rs.showAdvanced) {
        if (rs.basicMappings) {
            applyBasicMappings(api, normal, rs.basicMappings as Record<string, string>);
        }
        if (rs.disabledSearchAliases) {
            for (const key in rs.disabledSearchAliases as Record<string, unknown>) {
                (api as CommandAPI & { removeSearchAlias?: (key: string) => void }).removeSearchAlias?.(key);
            }
        }
    } else if (!rs.isMV3 && rs.snippets && !document.location.href.startsWith(chrome.runtime.getURL("/"))) {
        var settings: Record<string, unknown> = {}, error = "";
        try {
            (new Function('settings', 'api', rs.snippets as string))(settings, api);
        } catch (e) {
            error = (e as Error).toString();
        }
        applyUserSettings({settings, error});
    }

    applyRuntimeConf(normal);
    document.addEventListener("surfingkeys:settingsFromSnippetsLoaded", () => {
        applyRuntimeConf(normal);
    }, {once: true});
}

/**
 * Build command registry from all mode mappings with unique_id
 * @param {Object} modes - Object containing mode instances {normal, insert, visual, hints}
 * @returns {Map} Registry mapping unique_id -> command metadata
 */
function buildCommandRegistry(modes: Record<string, ModeInstance | null>) {
    const registry = new Map();
    const modesToScan = [modes.normal, modes.insert, modes.visual, modes.hints];

    modesToScan.forEach(mode => {
        if (!mode || !mode.mappings) return;

        // getMetas requires a criterion function, we use it to collect all metas
        const getMetas = mode.mappings.getMetas as ((filter: () => boolean) => Array<Record<string, unknown>>) | undefined;
        if (!getMetas) return;
        const allMetas = getMetas(() => true);

        allMetas.forEach((meta: Record<string, unknown>) => {
            // Check if annotation has unique_id
            const annotation = meta.annotation;
            let unique_id = null;

            if (typeof annotation === 'object' && annotation !== null && !Array.isArray(annotation)) {
                unique_id = (annotation as Record<string, unknown>).unique_id;
            }

            if (unique_id) {
                if (registry.has(unique_id)) {
                    console.warn(`Duplicate unique_id detected: ${unique_id} (existing: ${registry.get(unique_id).originalKey}, new: ${meta.word})`);
                }
                registry.set(unique_id, {
                    code: meta.code,
                    annotation: meta.annotation,
                    feature_group: meta.feature_group,
                    originalKey: meta.word,
                    mode: mode.name,
                    modeRef: mode,
                    repeatIgnore: meta.repeatIgnore
                });
            }
        });
    });

    return registry;
}

function _initModules() {
    const clipboard = createClipboard();
    const insert = createInsert();
    const normal = createNormal(insert);
    normal.enter();
    startScrollNodeObserver(normal);
    const hints = createHints(insert, normal, clipboard);
    const visual = createVisual(clipboard, hints);
    const front = createFront(insert, normal, hints, visual, _browser);

    const api = createAPI(clipboard, insert, normal, hints, visual, front, _browser);
    const apiCmd = api as unknown as CommandAPI;
    createDefaultMappings(api, clipboard, insert, normal, hints, visual, front, _browser);

    // Build and inject command registry after all default mappings are loaded
    const commandRegistry = buildCommandRegistry({ normal, insert, visual, hints });
    api._setCommandRegistry(commandRegistry);

    // Test hook: invoke any registered command by unique_id via DOM CustomEvent.
    // Content scripts run in an isolated world; DOM events bridge to the main world.
    // Usage from main world (CDP eval):
    //   document.dispatchEvent(new CustomEvent('__sk_invoke', {detail: 'cmd_insert_cursor_end'}))
    //   document.documentElement.dataset.skInvokeResult  // 'true' | 'false'
    document.addEventListener('__sk_invoke', (e) => {
        const detail = (e as CustomEvent).detail;
        const unique_id = typeof detail === 'string' ? detail : detail.unique_id;
        const repeatsOverride = typeof detail === 'object' && detail.repeats !== undefined ? detail.repeats : undefined;
        const cmd = commandRegistry.get(unique_id);
        if (cmd && typeof cmd.code === 'function') {
            try {
                // Some commands (for example visual selection commands) read mode.map_node meta.
                // Reconstruct map context from registered key sequence before invoking directly.
                const mode = cmd.modeRef;
                const previousMapNode = mode?.map_node;
                if (mode?.mappings && cmd.originalKey) {
                    let node = mode.mappings;
                    for (const ch of cmd.originalKey) {
                        node = node?.find(ch);
                    }
                    if (node) {
                        mode.map_node = node;
                    }
                }

                // Mirror _handleMapKey: ensure RUNTIME.repeats defaults to 1
                // so background actions (reloadTab, closeTab, etc.) get a valid repeat count.
                const runtimeWithRepeats = RUNTIME as unknown as { repeats: number };
                if (repeatsOverride !== undefined) {
                    runtimeWithRepeats.repeats = repeatsOverride;
                } else if (runtimeWithRepeats.repeats === undefined || runtimeWithRepeats.repeats === null) {
                    runtimeWithRepeats.repeats = 1;
                }
                cmd.code();
                document.documentElement.dataset.skInvokeResult = 'true';

                if (mode && previousMapNode) {
                    mode.map_node = previousMapNode;
                }
            } catch (_) {
                document.documentElement.dataset.skInvokeResult = 'false';
            }
        } else {
            document.documentElement.dataset.skInvokeResult = 'false';
        }
    });

    // Test hook: override runtime.conf values from main world via DOM CustomEvent.
    // Usage: document.dispatchEvent(new CustomEvent('__sk_conf_override', { detail: { key: 'digitForRepeat', value: false } }))
    document.addEventListener('__sk_conf_override', (e) => {
        const { key, value } = (e as CustomEvent).detail;
        if (Object.prototype.hasOwnProperty.call(runtime.conf, key)) {
            (runtime.conf as unknown as Record<string, unknown>)[key] = value;
            document.documentElement.dataset.skConfOverrideResult = 'true';
        } else {
            document.documentElement.dataset.skConfOverrideResult = 'false';
        }
    });

    document.documentElement.dataset.skInvokeReady = 'true';

    if (typeof(_browser.plugin) === "function") {
        _browser.plugin({ front });
    }

    dispatchSKEvent('defaultSettingsLoaded', [{normal, api: apiCmd}] as unknown[]);
    RUNTIME('getSettings', null, function(response) {
        var rs = (response as { settings: Record<string, unknown> }).settings;
        applySettings(apiCmd, normal, rs);
        const disabledSearchAliases = rs['disabledSearchAliases'];
        const getUsage = front.getUsage;
        const frontCommand = front.command;
        dispatchSKEvent('userSettingsLoaded', [{settings: rs, disabledSearchAliases, getUsage, frontCommand}] as unknown[]);
    });
    return {
        normal: normal as NormalModeInstance,
        front: front as unknown as FrontModule,
        api: apiCmd,
    };
}


type WindowWithSKExtras = Window & typeof globalThis & { frameId?: string; getFrameId?: () => string | undefined };

interface FrontModule {
    attach(): void;
    detach(): void;
    getUsage?: unknown;
    command?: unknown;
    [key: string]: unknown;
}

interface ModesResult {
    normal: NormalModeInstance;
    front: FrontModule;
    api: CommandAPI;
}

function _initContent(modes: ModesResult) {
    (window as WindowWithSKExtras).frameId = generateQuickGuid();
    runtime.on('settingsUpdated', response => {
        var rs = response.settings as Record<string, unknown>;
        applySettings(modes.api, modes.normal, rs);
    });

    if (runtime.conf.stealFocusOnLoad && !isInUIFrame()
        && document.body && document.body.childElementCount > 1) {
        var elm = getRealEdit();
        if (elm) {
            elm.blur();
        }
    }
}

(window as WindowWithSKExtras).getFrameId = function () {
    if (!(window as WindowWithSKExtras).frameId && window.innerWidth > 16 && window.innerHeight > 16
        && document.body && document.body.childElementCount > 0
        && runtime.conf.ignoredFrameHosts.indexOf(window.origin) === -1
        && (!window.frameElement || (parseInt("0" + getComputedStyle(window.frameElement).zIndex) >= 0
            && (window.frameElement as HTMLElement).offsetWidth > 16 && (window.frameElement as HTMLElement).offsetWidth > 16))
    ) {
        _initContent(_initModules());

        // Only used to load user script for iframes in MV3
        setTimeout(() => {
            dispatchSKEvent('user', ["runUserScript"]);
        }, 100);
    }
    return (window as WindowWithSKExtras).frameId;
};
Mode.init(window === top ? undefined : ()=> {
    window.addEventListener("focus", () => {
        (window as WindowWithSKExtras).getFrameId?.();
    }, {once: true});
});

type BrowserModule = { RUNTIME: BrowserAdapter['RUNTIME']; readText: BrowserAdapter['readText']; usePdfViewer?: () => void; plugin?: (opts: Record<string, unknown>) => void; [key: string]: unknown };
let _browser: BrowserModule;
function start(browser?: Record<string, unknown>) {
    _browser = (browser as BrowserModule | undefined) || {
        RUNTIME: (action: string, args?: Record<string, unknown> | null, callback?: (response: unknown) => void) => {
            RUNTIME(action, args, callback as ((response: Record<string, unknown>) => void) | undefined);
        },
        readText: () => {},
        usePdfViewer: () => {},
    };
    if (window === top) {
        new Promise<ModesResult>((r, _j) => {
            if (window.location.href === chrome.runtime.getURL("/pages/options.html")) {
                // @ts-expect-error — dynamic import of generated file, no type declarations
                import(/* webpackIgnore: true */ './pages/options.js').then((optionsLib) => {
                    optionsLib.default(
                        RUNTIME,
                        KeyboardUtils,
                        Mode,
                        createElementWithContent,
                        getBrowserName,
                        htmlEncode,
                        initL10n,
                        reportIssue,
                        setSanitizedContent,
                        showBanner);
                    r(_initModules());
                });
            } else {
                r(_initModules());
            }
        }).then((modes) => {
            _initContent(modes);
            runtime.on('titleChanged', function() {
                Mode.checkEventListener(() => {
                    modes.front.detach();
                    modes = _initModules();
                    _initContent(modes);
                    modes.front.attach();
                });
            });
            runtime.on('tabActivated', function() {
                modes.front.attach();
            });
            runtime.on('tabDeactivated', function() {
                modes.front.detach();
            });
            runtime.on('setScrollPos', function(msg: Record<string, unknown>, _sender, _response) {
                setTimeout(() => {
                    document.scrollingElement!.scrollLeft = msg.scrollLeft as number;
                    document.scrollingElement!.scrollTop = msg.scrollTop as number;
                }, 1000);
            });
            runtime.on('showBanner', function(msg, _sender, _response) {
                showBanner(msg.message as string, 3000);
            });
            document.addEventListener("surfingkeys:ensureFrontEnd", function(_evt) {
                modes.front.attach();
            });

            RUNTIME('tabURLAccessed', {
                title: document.title,
                url: window.location.href
            }, function (resp) {
                const r = resp as { index: number };
                if (r.index > 0) {
                    var showTabIndexInTitle = function () {
                        skipObserver = true;
                        document.title = '[' + myTabIndex + '] ' + originalTitle;
                    };

                    var myTabIndex = r.index,
                        skipObserver = false,
                        originalTitle = document.title;

                    new MutationObserver(function (_mutationsList) {
                        if (skipObserver) {
                            skipObserver = false;
                        } else {
                            originalTitle = document.title;
                            showTabIndexInTitle();
                        }
                    }).observe(document.querySelector("title")!, { childList: true });;

                    showTabIndexInTitle();

                    runtime.on('tabIndexChange', function(msg, _sender, _response) {
                        const tabIndex = msg.index as number;
                        if (tabIndex !== myTabIndex) {
                            myTabIndex = tabIndex;
                            showTabIndexInTitle();
                        }
                    });
                }
            });

        });
    } else {
        document.addEventListener("surfingkeys:iframeBoot", () => {
            _initContent(_initModules());
        }, {once: true});
    }
}

export { start };

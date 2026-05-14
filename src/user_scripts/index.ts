import { RUNTIME, dispatchSKEvent } from '../content_scripts/common/runtime.js';
import {
    aceVimMap,
    addVimMapKey,
    applyUserSettings,
    getBrowserName,
    getClickableElements,
    httpRequest,
    initSKFunctionListener,
    isElementPartiallyInViewport,
    showBanner,
    showPopup,
    tabOpenLink,
} from '../content_scripts/common/utils.js';
import type { MapKeyAnnotation, MapKeyOptions, InlineQueryConfig } from '../../@types/surfingkeys';

var EXTENSION_ROOT_URL = "";
function isInUIFrame() {
    return !document.location.href.startsWith("chrome://") && document.location.href.indexOf(EXTENSION_ROOT_URL) === 0;
}

    function _isDomainApplicable(domain: RegExp | undefined | null) {
        return !domain || domain.test(document.location.href) || domain.test(window.origin);
    }

    function cmap(new_keystroke: string, old_keystroke: string, domain?: RegExp | null, _new_annotation?: string | MapKeyAnnotation) {
        if (_isDomainApplicable(domain)) {
            dispatchSKEvent("front", ['addMapkey', "Omnibar", new_keystroke, old_keystroke]);
        }
    }

const userDefinedFunctions: Record<string, (...args: unknown[]) => void> = {};
function mapkey(keys: string, annotation: MapKeyAnnotation | string, jscode: (...args: unknown[]) => void, options?: MapKeyOptions) {
    if (!options || _isDomainApplicable(options.domain)) {
        const opt: MapKeyOptions & { codeHasParameter?: number } = options || {};
        userDefinedFunctions[`normal:${keys}`] = jscode;
        opt.codeHasParameter = jscode.length;
        dispatchSKEvent('api', ['mapkey', keys, annotation, opt]);
    }
}
function mapcmdkey(keys: string, unique_id: string, options?: MapKeyOptions) {
    if (!options || _isDomainApplicable(options.domain)) {
        dispatchSKEvent('api', ['mapcmdkey', keys, unique_id, options]);
    }
}
function imapkey(keys: string, annotation: MapKeyAnnotation | string, jscode: (...args: unknown[]) => void, options?: MapKeyOptions) {
    if (!options || _isDomainApplicable(options.domain)) {
        userDefinedFunctions[`insert:${keys}`] = jscode;
        dispatchSKEvent('api', ['imapkey', keys, annotation, options]);
    }
}
function vmapkey(keys: string, annotation: MapKeyAnnotation | string, jscode: (...args: unknown[]) => void, options?: MapKeyOptions) {
    if (!options || _isDomainApplicable(options.domain)) {
        userDefinedFunctions[`visual:${keys}`] = jscode;
        dispatchSKEvent('api', ['vmapkey', keys, annotation, options]);
   }
}

const userDefinedCommands: Record<string, (...args: unknown[]) => void> = {};
function addCommand(name: string, description: string, action: (...args: unknown[]) => void) {
    userDefinedCommands[name] = action;
    dispatchSKEvent('front', ['addCommand', name, description]);
}

function map(new_keystroke: string, old_keystroke: string, domain?: RegExp | null, new_annotation?: string | MapKeyAnnotation) {
    dispatchSKEvent('api', ['map', new_keystroke, old_keystroke, domain, new_annotation]);
}
function imap(new_keystroke: string, old_keystroke: string, domain?: RegExp | null, new_annotation?: string | MapKeyAnnotation) {
    dispatchSKEvent('api', ['imap', new_keystroke, old_keystroke, domain, new_annotation]);
}
function lmap(new_keystroke: string, old_keystroke: string, domain?: RegExp | null, new_annotation?: string | MapKeyAnnotation) {
    dispatchSKEvent('api', ['lmap', new_keystroke, old_keystroke, domain, new_annotation]);
}
function vmap(new_keystroke: string, old_keystroke: string, domain?: RegExp | null, new_annotation?: string | MapKeyAnnotation) {
    dispatchSKEvent('api', ['vmap', new_keystroke, old_keystroke, domain, new_annotation]);
}

const functionsToListSuggestions: Record<string, (response: string, request: Record<string, string>) => Promise<string[]> | string[]> = {};

let inlineQuery: InlineQueryConfig | undefined;
let hintsFunction: ((element: Element, shiftKey: boolean) => void) | undefined;
let onClipboardReadFn: ((text: string) => void) | undefined;
let onEditorWriteFn: ((data: string) => void) | undefined;
let userScriptTask = () => {};
let hintsCreationResolve: ((found: unknown) => void) | null = null;
let _pendingOnEnter: ((item: unknown, ctrlKey: boolean, shiftKey: boolean) => void) | null = null;
initSKFunctionListener("user", {
    callUserFunction: (keys: unknown, para: unknown) => {
        if (userDefinedFunctions.hasOwnProperty(keys as string)) {
            userDefinedFunctions[keys as string](para);
        }
    },
    executeUserCommand: (name: unknown, args: unknown) => {
        if (userDefinedCommands.hasOwnProperty(name as string)) {
            userDefinedCommands[name as string](...(args as unknown[]));
        }
    },
    getSearchSuggestions: async (url: unknown, response: unknown, request: unknown, callbackId: unknown, _origin: unknown) => {
        if (functionsToListSuggestions.hasOwnProperty(url as string)) {
            try {
                const ret = await functionsToListSuggestions[url as string](response as string, request as Record<string, string>);
                dispatchSKEvent("front", [callbackId, ret]);
            } catch (e) {
                console.error("Search suggestion callback error:", e);
                dispatchSKEvent("front", [callbackId, []]);
            }
        }
    },
    performInlineQuery: (query: unknown, callbackId: unknown, _origin: unknown) => {
        const url = (typeof(inlineQuery!.url) === "function") ? inlineQuery!.url(query as string) : inlineQuery!.url + query;
        httpRequest({
            url,
            headers: inlineQuery!.headers
        }, function(res: { error?: string; [key: string]: unknown }) {
            if (res.error) {
                dispatchSKEvent("front", [callbackId, `${res.error} on ${url}`]);
            } else {
                dispatchSKEvent("front", [callbackId, inlineQuery!.parseResult(res as unknown as string)]);
            }
        });
    },
    runUserScript: () => {
        userScriptTask();
    },
    onClipboardRead: (resp: unknown) => {
        onClipboardReadFn?.(resp as string);
    },
    onEditorWrite: (data: unknown) => {
        onEditorWriteFn?.(data as string);
    },
    onHintClicked: (shiftKey: unknown, element: unknown) => {
        if (typeof(hintsFunction) === 'function') {
            hintsFunction(element as Element, shiftKey as boolean);
        }
    },
    onHintCreated: (found: unknown) => {
        if (hintsCreationResolve) {
            hintsCreationResolve(found);
            hintsCreationResolve = null;
        }
    },
    userURLs_onEnter: (item: unknown, ctrlKey: unknown, shiftKey: unknown) => {
        if (_pendingOnEnter) {
            _pendingOnEnter(item, ctrlKey as boolean, shiftKey as boolean);
            _pendingOnEnter = null;
        }
    },
}, true);

function addSearchAlias(alias: string, prompt: string, search_url: string, search_leader_key?: string, suggestion_url?: string, callback_to_parse_suggestion?: (response: string, request: Record<string, string>) => Promise<string[]> | string[], only_this_site_key?: string, options?: Record<string, unknown>) {
    if (!/^[\u0000-\u007f]*$/.test(alias)) {
        throw `Invalid alias ${alias}, which must be ASCII characters.`;
    }
    if (suggestion_url) {
        functionsToListSuggestions[suggestion_url] = callback_to_parse_suggestion ?? (() => []);
    }
    dispatchSKEvent('api', ['addSearchAlias', alias, prompt, search_url, search_leader_key, suggestion_url, "user", only_this_site_key, options]);
}

function createCssSelectorForElements(cssSelector: string, elements: unknown) {
    let els: HTMLElement[];
    if (elements instanceof HTMLElement) {
        els = [elements];
    } else if (Array.isArray(elements)) {
        els = (elements as unknown[]).filter((m) => m instanceof HTMLElement) as HTMLElement[];
    } else {
        els = [];
    }
    els.forEach((m: HTMLElement) => {
        m.classList.add(cssSelector);
    });
    return els.length;
}

const api = {
    RUNTIME,
    aceVimMap,
    addVimMapKey,
    addSearchAlias,
    addCommand,
    cmap,
    imap,
    imapkey,
    isElementPartiallyInViewport,
    getBrowserName,
    getClickableElements,
    lmap,
    vmap,
    vmapkey,
    map,
    mapcmdkey,
    mapkey,
    unmap: (keystroke: string, domain?: RegExp) => {
        dispatchSKEvent('api', ['unmap', keystroke, domain]);
    },
    iunmap: (keystroke: string, domain?: RegExp) => {
        dispatchSKEvent('api', ['iunmap', keystroke, domain]);
    },
    vunmap: (keystroke: string, domain?: RegExp) => {
        dispatchSKEvent('api', ['vunmap', keystroke, domain]);
    },
    unmapAllExcept: (keystrokes: string[], domain?: RegExp) => {
        dispatchSKEvent('api', ['unmapAllExcept', keystrokes, domain]);
    },
    readText: (text: string, options?: Record<string, unknown>) => {
        dispatchSKEvent('api', ['readText', text, options]);
    },
    removeSearchAlias: (alias: string, search_leader_key?: string, only_this_site_key?: string) => {
        dispatchSKEvent('api', ['removeSearchAlias', alias, search_leader_key, only_this_site_key]);
    },
    searchSelectedWith: (se: string, onlyThisSite?: boolean, interactive?: boolean, alias?: string) => {
        dispatchSKEvent('api', ['searchSelectedWith', se, onlyThisSite, interactive, alias]);
    },
    tabOpenLink,
    Clipboard: {
        write: (text: string) => {
            dispatchSKEvent('api', ['clipboard:write', text]);
        },
        read: (cb: (text: string) => void) => {
            onClipboardReadFn = cb;
            dispatchSKEvent('api', ['clipboard:read']);
        },
    },
    Hints: {
        click: (links: string | unknown[], force?: boolean) => {
            if (typeof(links) !== 'string') {
                const hintsClicking = "surfingkeys--hints--clicking";
                if (createCssSelectorForElements(hintsClicking, links) === 0) {
                    return;
                }
                links = `.${hintsClicking}`;
            }
            dispatchSKEvent('api', ['hints:click', links, force]);
        },
        create: (cssSelector: string | unknown[], onHintKey: (element: Element, shiftKey: boolean) => void, attrs?: Record<string, unknown>) => {
            if (typeof(cssSelector) !== 'string') {
                const hintsCreating = "surfingkeys--hints--creating";
                if (createCssSelectorForElements(hintsCreating, cssSelector) === 0) {
                    return false;
                }
                cssSelector = `.${hintsCreating}`;
            }
            hintsFunction = onHintKey;
            const promise = new Promise((resolve, _reject) => {
                hintsCreationResolve = resolve;
            });
            dispatchSKEvent('api', ['hints:create', cssSelector, "user", attrs]);
            return promise;
        },
        dispatchMouseClick: (element: Element) => {
            dispatchSKEvent('hints', ['dispatchMouseClick'], element);
        },
        style: (css: string, mode?: string) => {
            dispatchSKEvent('api', ['hints:style', css, mode]);
        },
        setCharacters: (chars: string) => {
            dispatchSKEvent('api', ['hints:setCharacters', chars]);
        },
        setNumeric: () => {
            dispatchSKEvent('api', ['hints:setNumeric']);
        },
    },
    Normal: {
        feedkeys: (keys: string) => {
            dispatchSKEvent('api', ['normal:feedkeys', keys]);
        },
        jumpVIMark: (mark: string) => {
            dispatchSKEvent('api', ['normal:jumpVIMark', mark]);
        },
        passThrough: (timeout?: number) => {
            dispatchSKEvent('api', ['normal:passThrough', timeout]);
        },
        scroll: (type: string) => {
            dispatchSKEvent('api', ['normal:scroll', type]);
        },
    },
    Visual: {
        style: (element: string, style: string) => {
            dispatchSKEvent('api', ['visual:style', element, style]);
        },
    },
    log: function(msg: unknown) {
        dispatchSKEvent('api', ['log', msg]);
    },
    Front: {
        registerInlineQuery: (args: InlineQueryConfig) => {
            inlineQuery = args;
            dispatchSKEvent('api', ['front:registerInlineQuery']);
        },
        showEditor: (element: string | Element, onWrite: (data: string) => void, type?: string, useNeovim?: boolean) => {
            if (typeof(element) !== 'string') {
                const elementEditing = "surfingkeys--element--editing";
                if (createCssSelectorForElements(elementEditing, element) === 0) {
                    return;
                }
                element = `.${elementEditing}`;
            }
            onEditorWriteFn = onWrite;
            dispatchSKEvent('api', ['front:showEditor', element, type, useNeovim]);
        },
        openOmnibar: (args: Record<string, unknown> & { onEnter?: (item: unknown, ctrlKey: boolean, shiftKey: boolean) => void }) => {
            _pendingOnEnter = null;
            if (typeof args.onEnter === 'function') {
                _pendingOnEnter = args.onEnter;
                args = Object.assign({}, args, { _hasCustomOnEnter: true });
                delete args.onEnter;
            }
            dispatchSKEvent('api', ['front:openOmnibar', args]);
        },
        showUsage: () => {
            dispatchSKEvent('api', ['front:showUsage']);
        },
        showBanner,
        showPopup
    },
};

export default (extensionRootUrl: string, uf: (api: Record<string, unknown>, settings: Record<string, unknown>) => void) => {
    EXTENSION_ROOT_URL = extensionRootUrl;
    if (isInUIFrame()) return;
    userScriptTask = () => {
        var settings: Record<string, unknown> = {}, error = "";
        try {
            uf(api, settings);
        } catch(e) {
            error = (e as Error).toString();
            console.error(e);
        }
        applyUserSettings({settings, error});
    };
    if (window === top) {
        userScriptTask();
    }
};

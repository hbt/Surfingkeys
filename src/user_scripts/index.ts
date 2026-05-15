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

var EXTENSION_ROOT_URL = "";
function isInUIFrame() {
    return !document.location.href.startsWith("chrome://") && document.location.href.indexOf(EXTENSION_ROOT_URL) === 0;
}

    function _isDomainApplicable(domain: any) {
        return !domain || domain.test(document.location.href) || domain.test(window.origin);
    }

    function cmap(new_keystroke: any, old_keystroke: any, domain: any, _new_annotation: any) {
        if (_isDomainApplicable(domain)) {
            dispatchSKEvent("front", ['addMapkey', "Omnibar", new_keystroke, old_keystroke]);
        }
    }

const userDefinedFunctions: Record<string, any> = {};
function mapkey(keys: any, annotation: any, jscode: any, options: any) {
    if (!options || _isDomainApplicable(options.domain)) {
        const opt = options || {};
        userDefinedFunctions[`normal:${keys}`] = jscode;
        opt.codeHasParameter = jscode.length;
        dispatchSKEvent('api', ['mapkey', keys, annotation, opt]);
    }
}
function mapcmdkey(keys: any, unique_id: any, options: any) {
    if (!options || _isDomainApplicable(options.domain)) {
        dispatchSKEvent('api', ['mapcmdkey', keys, unique_id, options]);
    }
}
function imapkey(keys: any, annotation: any, jscode: any, options: any) {
    if (!options || _isDomainApplicable(options.domain)) {
        userDefinedFunctions[`insert:${keys}`] = jscode;
        dispatchSKEvent('api', ['imapkey', keys, annotation, options]);
    }
}
function vmapkey(keys: any, annotation: any, jscode: any, options: any) {
    if (!options || _isDomainApplicable(options.domain)) {
        userDefinedFunctions[`visual:${keys}`] = jscode;
        dispatchSKEvent('api', ['vmapkey', keys, annotation, options]);
   }
}

const userDefinedCommands: Record<string, any> = {};
function addCommand(name: any, description: any, action: any) {
    userDefinedCommands[name] = action;
    dispatchSKEvent('front', ['addCommand', name, description]);
}

function map(new_keystroke: any, old_keystroke: any, domain: any, new_annotation: any) {
    dispatchSKEvent('api', ['map', new_keystroke, old_keystroke, domain, new_annotation]);
}
function imap(new_keystroke: any, old_keystroke: any, domain: any, new_annotation: any) {
    dispatchSKEvent('api', ['imap', new_keystroke, old_keystroke, domain, new_annotation]);
}
function lmap(new_keystroke: any, old_keystroke: any, domain: any, new_annotation: any) {
    dispatchSKEvent('api', ['lmap', new_keystroke, old_keystroke, domain, new_annotation]);
}
function vmap(new_keystroke: any, old_keystroke: any, domain: any, new_annotation: any) {
    dispatchSKEvent('api', ['vmap', new_keystroke, old_keystroke, domain, new_annotation]);
}

const functionsToListSuggestions: Record<string, any> = {};

let inlineQuery: any;
let hintsFunction: any;
let onClipboardReadFn: any;
let onEditorWriteFn: any;
let userScriptTask = () => {};
let hintsCreationResolve: any;
let _pendingOnEnter: ((...args: any[]) => void) | null = null;
initSKFunctionListener("user", {
    callUserFunction: (keys: any, para: any) => {
        if (userDefinedFunctions.hasOwnProperty(keys)) {
            userDefinedFunctions[keys](para);
        }
    },
    executeUserCommand: (name: any, args: any) => {
        if (userDefinedCommands.hasOwnProperty(name)) {
            userDefinedCommands[name](...args);
        }
    },
    getSearchSuggestions: async (url: any, response: any, request: any, callbackId: any, _origin: any) => {
        if (functionsToListSuggestions.hasOwnProperty(url)) {
            try {
                const ret = await functionsToListSuggestions[url](response, request);
                dispatchSKEvent("front", [callbackId, ret]);
            } catch (e) {
                console.error("Search suggestion callback error:", e);
                dispatchSKEvent("front", [callbackId, []]);
            }
        }
    },
    performInlineQuery: (query: any, callbackId: any, _origin: any) => {
        const url = (typeof(inlineQuery.url) === "function") ? inlineQuery.url(query) : inlineQuery.url + query;
        httpRequest({
            url,
            headers: inlineQuery.headers
        }, function(res: any) {
            if (res.error) {
                dispatchSKEvent("front", [callbackId, `${res.error} on ${url}`]);
            } else {
                dispatchSKEvent("front", [callbackId, inlineQuery.parseResult(res)]);
            }
        });
    },
    runUserScript: () => {
        userScriptTask();
    },
    onClipboardRead: (resp: any) => {
        onClipboardReadFn(resp);
    },
    onEditorWrite: (data: any) => {
        onEditorWriteFn(data);
    },
    onHintClicked: (shiftKey: any, element: any) => {
        if (typeof(hintsFunction) === 'function') {
            hintsFunction(element, shiftKey);
        }
    },
    onHintCreated: (found: any) => {
        if (hintsCreationResolve) {
            hintsCreationResolve(found);
            hintsCreationResolve = null;
        }
    },
    userURLs_onEnter: (item: any, ctrlKey: any, shiftKey: any) => {
        if (_pendingOnEnter) {
            _pendingOnEnter(item, ctrlKey, shiftKey);
            _pendingOnEnter = null;
        }
    },
}, true);

function addSearchAlias(alias: any, prompt: any, search_url: any, search_leader_key: any, suggestion_url: any, callback_to_parse_suggestion: any, only_this_site_key: any, options: any) {
    if (!/^[\u0000-\u007f]*$/.test(alias)) {
        throw `Invalid alias ${alias}, which must be ASCII characters.`;
    }
    functionsToListSuggestions[suggestion_url] = callback_to_parse_suggestion;
    dispatchSKEvent('api', ['addSearchAlias', alias, prompt, search_url, search_leader_key, suggestion_url, "user", only_this_site_key, options]);
}

function createCssSelectorForElements(cssSelector: any, elements: any) {
    if (elements instanceof HTMLElement) {
        elements = [elements];
    } else if (elements instanceof Array) {
        elements = elements.filter((m) => m instanceof HTMLElement);
    } else {
        elements = [];
    }
    elements.forEach((m: any) => {
        m.classList.add(cssSelector);
    });
    return elements.length;
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
    unmap: (keystroke: any, domain: any) => {
        dispatchSKEvent('api', ['unmap', keystroke, domain]);
    },
    iunmap: (keystroke: any, domain: any) => {
        dispatchSKEvent('api', ['iunmap', keystroke, domain]);
    },
    vunmap: (keystroke: any, domain: any) => {
        dispatchSKEvent('api', ['vunmap', keystroke, domain]);
    },
    unmapAllExcept: (keystrokes: any, domain: any) => {
        dispatchSKEvent('api', ['unmapAllExcept', keystrokes, domain]);
    },
    readText: (text: any, options: any) => {
        dispatchSKEvent('api', ['readText', text, options]);
    },
    removeSearchAlias: (alias: any, search_leader_key: any, only_this_site_key: any) => {
        dispatchSKEvent('api', ['removeSearchAlias', alias, search_leader_key, only_this_site_key]);
    },
    searchSelectedWith: (se: any, onlyThisSite: any, interactive: any, alias: any) => {
        dispatchSKEvent('api', ['searchSelectedWith', se, onlyThisSite, interactive, alias]);
    },
    tabOpenLink,
    Clipboard: {
        write: (text: any) => {
            dispatchSKEvent('api', ['clipboard:write', text]);
        },
        read: (cb: any) => {
            onClipboardReadFn = cb;
            dispatchSKEvent('api', ['clipboard:read']);
        },
    },
    Hints: {
        click: (links: any, force: any) => {
            if (typeof(links) !== 'string') {
                const hintsClicking = "surfingkeys--hints--clicking";
                if (createCssSelectorForElements(hintsClicking, links) === 0) {
                    return;
                }
                links = `.${hintsClicking}`;
            }
            dispatchSKEvent('api', ['hints:click', links, force]);
        },
        create: (cssSelector: any, onHintKey: any, attrs: any) => {
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
        dispatchMouseClick: (element: any) => {
            dispatchSKEvent('hints', ['dispatchMouseClick'], element);
        },
        style: (css: any, mode: any) => {
            dispatchSKEvent('api', ['hints:style', css, mode]);
        },
        setCharacters: (chars: any) => {
            dispatchSKEvent('api', ['hints:setCharacters', chars]);
        },
        setNumeric: () => {
            dispatchSKEvent('api', ['hints:setNumeric']);
        },
    },
    Normal: {
        feedkeys: (keys: any) => {
            dispatchSKEvent('api', ['normal:feedkeys', keys]);
        },
        jumpVIMark: (mark: any) => {
            dispatchSKEvent('api', ['normal:jumpVIMark', mark]);
        },
        passFocus: (pf: any) => {
            dispatchSKEvent('api', ['normal:passFocus', pf]);
        },
        passThrough: (timeout: any) => {
            dispatchSKEvent('api', ['normal:passThrough', timeout]);
        },
        scroll: (type: any) => {
            dispatchSKEvent('api', ['normal:scroll', type]);
        },
    },
    Visual: {
        style: (element: any, style: any) => {
            dispatchSKEvent('api', ['visual:style', element, style]);
        },
    },
    log: function(msg: any) {
        dispatchSKEvent('api', ['log', msg]);
    },
    Front: {
        registerInlineQuery: (args: any) => {
            inlineQuery = args;
            dispatchSKEvent('api', ['front:registerInlineQuery']);
        },
        showEditor: (element: any, onWrite: any, type: any, useNeovim: any) => {
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
        openOmnibar: (args: any) => {
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

export default (extensionRootUrl: any, uf: any) => {
    EXTENSION_ROOT_URL = extensionRootUrl;
    if (isInUIFrame()) return;
    userScriptTask = () => {
        var settings = {}, error = "";
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

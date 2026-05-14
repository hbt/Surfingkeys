import { RUNTIME, runtime } from '../runtime.js';
import { tabOpenLink } from '../utils.js';
import type { CommandAPI, ClipboardManager, HintsModule } from '../../../../@types/surfingkeys';

type RTWithRepeats = typeof RUNTIME & { repeats: number };

export default function registerNavigation(
    api: CommandAPI,
    clipboard: unknown,
    _insert: unknown,
    _normal: unknown,
    hints: unknown,
    _visual: unknown,
    _front: unknown,
    _browser: unknown
): void {
    const cb = clipboard as ClipboardManager;
    const hn = hints as HintsModule;
    const { mapkey } = api;

    mapkey('[[', {
        short: "Click previous link",
        unique_id: "cmd_nav_previous_link",
        feature_group: 1,
        category: "navigation",
        description: "Click on the previous page link on current page",
        tags: ["navigation", "links", "previous"]
    }, (hn as HintsModule & { previousPage(): void }).previousPage);
    mapkey(']]', {
        short: "Click next link",
        unique_id: "cmd_nav_next_link",
        feature_group: 1,
        category: "navigation",
        description: "Click on the next page link on current page",
        tags: ["navigation", "links", "next"]
    }, (hn as HintsModule & { nextPage(): void }).nextPage);

    mapkey('gu', {
        short: "Go up one path",
        unique_id: "cmd_nav_url_up",
        feature_group: 4,
        category: "navigation",
        description: "Navigate up one level in the URL path hierarchy",
        tags: ["navigation", "url", "path"]
    }, function() {
        var pathname = location.pathname;
        if (pathname.length > 1) {
            pathname = pathname.endsWith('/') ? pathname.substr(0, pathname.length - 1) : pathname;
            var last = pathname.lastIndexOf('/'), repeats = (RUNTIME as RTWithRepeats).repeats;
            (RUNTIME as RTWithRepeats).repeats = 1;
            while (repeats-- > 1) {
                var p = pathname.lastIndexOf('/', last - 1);
                if (p === -1) {
                    break;
                } else {
                    last = p;
                }
            }
            pathname = pathname.substr(0, last);
        }
        window.location.href = location.origin + pathname;
    });

    mapkey('B', {
        short: "Tab history back",
        unique_id: "cmd_nav_tab_history_back",
        feature_group: 4,
        category: "navigation",
        description: "Go back one step in tab-specific history",
        tags: ["navigation", "history", "back"]
    }, function() {
        RUNTIME("historyTab", {backward: true});
    }, {repeatIgnore: true});
    mapkey('F', {
        short: "Tab history forward",
        unique_id: "cmd_nav_tab_history_forward",
        feature_group: 4,
        category: "navigation",
        description: "Go forward one step in tab-specific history",
        tags: ["navigation", "history", "forward"]
    }, function() {
        RUNTIME("historyTab", {backward: false});
    }, {repeatIgnore: true});
    mapkey('<Ctrl-6>', {
        short: "Go to last used tab",
        unique_id: "cmd_nav_last_tab",
        feature_group: 4,
        category: "navigation",
        description: "Switch to the previously focused tab",
        tags: ["navigation", "tabs", "history"]
    }, function() {
        RUNTIME("goToLastTab");
    });
    mapkey('S', {
        short: "Page history back",
        unique_id: "cmd_nav_history_back",
        feature_group: 4,
        category: "navigation",
        description: "Go back one page in browser history",
        tags: ["navigation", "history", "back"]
    }, function() {
        history.go(-1);
    }, {repeatIgnore: true});
    mapkey('D', {
        short: "Page history forward",
        unique_id: "cmd_nav_history_forward",
        feature_group: 4,
        category: "navigation",
        description: "Go forward one page in browser history",
        tags: ["navigation", "history", "forward"]
    }, function() {
        history.go(1);
    }, {repeatIgnore: true});
    mapkey('r', {
        short: "Reload page",
        unique_id: "cmd_nav_reload",
        feature_group: 4,
        category: "navigation",
        description: "Reload the current page from cache",
        tags: ["navigation", "reload", "refresh"]
    }, function() {
        RUNTIME("reloadTab", { nocache: false });
    });
    mapkey('R', {
        short: "Hard reload page",
        unique_id: "cmd_nav_reload_hard",
        feature_group: 4,
        category: "navigation",
        description: "Hard reload the current page, bypassing cache",
        tags: ["navigation", "reload", "refresh", "cache"]
    }, function() {
        RUNTIME("reloadTab", { nocache: true });
    });
    mapkey('oi', {
        short: "Open incognito window",
        unique_id: "cmd_nav_incognito",
        feature_group: 8,
        category: "navigation",
        description: "Open current URL in a new incognito window",
        tags: ["navigation", "incognito", "privacy"]
    }, function() {
        RUNTIME('openIncognito', {
            url: window.location.href
        });
    });

    mapkey('cc', {
        short: "Open selected link",
        unique_id: "cmd_nav_open_clipboard",
        feature_group: 7,
        category: "navigation",
        description: "Open selected text or clipboard content as URL",
        tags: ["navigation", "clipboard", "link"]
    }, function() {
        if (window.getSelection()?.toString()) {
            tabOpenLink(window.getSelection()!.toString());
        } else {
            cb.read(function(response) {
                tabOpenLink(response.data);
            });
        }
    });

    mapkey('g?', {
        short: "Remove query string",
        unique_id: "cmd_nav_remove_query",
        feature_group: 4,
        category: "navigation",
        description: "Reload page after removing query string from URL",
        tags: ["navigation", "url", "query"]
    }, function() {
        window.location.href = window.location.href.replace(/\?[^\?]*$/, '');
    });
    mapkey('g#', {
        short: "Remove hash fragment",
        unique_id: "cmd_nav_remove_hash",
        feature_group: 4,
        category: "navigation",
        description: "Reload page after removing hash fragment from URL",
        tags: ["navigation", "url", "hash"]
    }, function() {
        window.location.href = window.location.href.replace(/\#[^\#]*$/, '');
    });
    mapkey('gU', {
        short: "Go to URL root",
        unique_id: "cmd_nav_url_root",
        feature_group: 4,
        category: "navigation",
        description: "Navigate to root of current URL hierarchy, supports count prefix",
        tags: ["navigation", "url", "root"]
    }, function() {
        window.location.href = window.location.href.replace(new RegExp('(://([^/]+/){' + (RUNTIME as RTWithRepeats).repeats + '}).*'), '$1');
        (RUNTIME as RTWithRepeats).repeats = 1;
    });

    mapkey('O', {
        short: "Open detected links",
        unique_id: "cmd_nav_open_detected_link",
        feature_group: 1,
        category: "navigation",
        description: "Open URLs detected in text content",
        tags: ["navigation", "links", "detection"]
    }, function() {
        hn.create(runtime.conf.clickablePat, function(element) {
            window.location.assign((element as [Node, number, string])[2]);
        }, {statusLine: "Open detected links from text"});
    });
}

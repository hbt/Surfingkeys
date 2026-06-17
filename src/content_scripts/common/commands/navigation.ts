import { RUNTIME, runtime } from '../runtime.js';
import { tabOpenLink } from '../utils.js';
import type { CommandAPI } from '../../../../@types/surfingkeys';
import type { GKey } from '../g-keys.js';

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
    const { mapkey } = api;

    mapkey('[[', {
        short: "Click previous link",
        unique_id: "cmd_nav_previous_link",
        feature_group: 1,
        category: "navigation",
        description: "Click on the previous page link on current page",
        tags: ["navigation", "links", "previous"]
    }, (hints as any).previousPage);
    mapkey(']]', {
        short: "Click next link",
        unique_id: "cmd_nav_next_link",
        feature_group: 1,
        category: "navigation",
        description: "Click on the next page link on current page",
        tags: ["navigation", "links", "next"]
    }, (hints as any).nextPage);

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
            var last = pathname.lastIndexOf('/'), repeats = (RUNTIME as any).repeats;
            (RUNTIME as any).repeats = 1;
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

    mapkey('g-004' satisfies GKey, {
        short: "Open new window",
        unique_id: "cmd_nav_new_window",
        feature_group: 8,
        category: "navigation",
        description: "Open a new browser window",
        tags: ["navigation", "window"]
    }, function() {
        RUNTIME('openNewWindow');
    });

    mapkey('g-005' satisfies GKey, {
        short: "Open new incognito window",
        unique_id: "cmd_nav_new_incognito_window",
        feature_group: 8,
        category: "navigation",
        description: "Open a new incognito browser window",
        tags: ["navigation", "window", "incognito", "privacy"]
    }, function() {
        RUNTIME('openNewIncognitoWindow');
    });

    mapkey('cc', {
        short: "Open selected link",
        unique_id: "cmd_nav_open_clipboard",
        feature_group: 7,
        category: "navigation",
        description: "Open selected text or clipboard content as URL",
        tags: ["navigation", "clipboard", "link"]
    }, function() {
        const n = (RUNTIME as any).repeats;
        (RUNTIME as any).repeats = 1;
        if (window.getSelection()?.toString()) {
            let urls = window.getSelection()!.toString().split('\n').filter((u: string) => u.trim().length > 0);
            if (n > 1) urls = urls.slice(0, n);
            tabOpenLink(urls.join('\n'));
        } else {
            (clipboard as any).read(function(response: any) {
                let urls = response.data.split('\n').filter((u: string) => u.trim().length > 0);
                if (n > 1) urls = urls.slice(0, n);
                tabOpenLink(urls.join('\n'));
            });
        }
    });

    mapkey('g-015' satisfies GKey, {
        short: "Navigate to clipboard URL",
        unique_id: "cmd_nav_clipboard_navigate",
        feature_group: 7,
        category: "navigation",
        description: "Navigate current tab to URL from clipboard",
        tags: ["navigation", "clipboard", "url"]
    }, function() {
        (clipboard as any).read(function(response: any) {
            const url = response.data.trim();
            if (url) window.location.href = url;
        });
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
    function urlStepNumber(delta: number): void {
        const url = window.location.href;
        const matches = url.match(/\d+/g);
        if (!matches || matches.length === 0) return;
        const repeats = (RUNTIME as any).repeats as number;
        (RUNTIME as any).repeats = 1;
        const reversed = [...matches].reverse();
        const idx = Math.min(repeats - 1, reversed.length - 1);
        let pos = url.length;
        for (let i = 0; i <= idx; i++) {
            pos = url.lastIndexOf(reversed[i], pos);
        }
        const numStr = reversed[idx];
        const newNum = parseInt(numStr, 10) + delta;
        window.location.href = url.slice(0, pos) + newNum + url.slice(pos + numStr.length);
    }

    mapkey('g-040' satisfies GKey, {
        short: "Increment URL number",
        unique_id: "cmd_nav_url_increment",
        feature_group: 4,
        category: "navigation",
        description: "Increment the last number in the URL; use count prefix to target Nth-from-last number",
        tags: ["navigation", "url", "number"]
    }, function() {
        urlStepNumber(1);
    });
    mapkey('g-041' satisfies GKey, {
        short: "Decrement URL number",
        unique_id: "cmd_nav_url_decrement",
        feature_group: 4,
        category: "navigation",
        description: "Decrement the last number in the URL; use count prefix to target Nth-from-last number",
        tags: ["navigation", "url", "number"]
    }, function() {
        urlStepNumber(-1);
    });

    mapkey('gU', {
        short: "Go to URL root",
        unique_id: "cmd_nav_url_root",
        feature_group: 4,
        category: "navigation",
        description: "Navigate to root of current URL hierarchy, supports count prefix",
        tags: ["navigation", "url", "root"]
    }, function() {
        window.location.href = window.location.href.replace(new RegExp('(://([^/]+/){'+(RUNTIME as any).repeats+'}).*'), '$1');
        (RUNTIME as any).repeats = 1;
    });

    mapkey('O', {
        short: "Open detected links",
        unique_id: "cmd_nav_open_detected_link",
        feature_group: 1,
        category: "navigation",
        description: "Open URLs detected in text content",
        tags: ["navigation", "links", "detection"]
    }, function() {
        (hints as any).create(runtime.conf.clickablePat, function(element: any) {
            window.location.assign(element[2]);
        }, {statusLine: "Open detected links from text"});
    });
}

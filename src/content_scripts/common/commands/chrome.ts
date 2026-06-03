import { RUNTIME } from '../runtime.js';
import { getBrowserName, tabOpenLink } from '../utils.js';
import type { CommandAPI } from '../../../../@types/surfingkeys';
import type { GKey } from '../g-keys.js';

export default function registerChrome(
    api: CommandAPI,
    _clipboard: unknown,
    _insert: unknown,
    _normal: unknown,
    _hints: unknown,
    _visual: unknown,
    _front: unknown,
    _browser: unknown
): void {
    const { mapkey } = api;

    if (getBrowserName() !== "Chrome") return;

    mapkey('ga', {
        short: "Open Chrome About",
        unique_id: "cmd_chrome_about",
        feature_group: 12,
        category: "chrome",
        description: "Open Chrome about page showing version information",
        tags: ["chrome", "internal", "about"]
    }, function() {
        tabOpenLink("chrome://help/");
    });
    mapkey('gb', {
        short: "Open Chrome Bookmarks",
        unique_id: "cmd_chrome_bookmarks",
        feature_group: 12,
        category: "chrome",
        description: "Open Chrome bookmarks manager page",
        tags: ["chrome", "internal", "bookmarks"]
    }, function() {
        tabOpenLink("chrome://bookmarks/");
    });
    mapkey('gc', {
        short: "Open Chrome Cache",
        unique_id: "cmd_chrome_cache",
        feature_group: 12,
        category: "chrome",
        description: "Open Chrome cache viewer page",
        tags: ["chrome", "internal", "cache"]
    }, function() {
        tabOpenLink("chrome://cache/");
    });
    mapkey('gd', {
        short: "Open Chrome Downloads",
        unique_id: "cmd_chrome_downloads",
        feature_group: 12,
        category: "chrome",
        description: "Open Chrome downloads page",
        tags: ["chrome", "internal", "downloads"]
    }, function() {
        tabOpenLink("chrome://downloads/");
    });
    mapkey('gh', {
        short: "Open Chrome History",
        unique_id: "cmd_chrome_history",
        feature_group: 12,
        category: "chrome",
        description: "Open Chrome browsing history page",
        tags: ["chrome", "internal", "history"]
    }, function() {
        tabOpenLink("chrome://history/");
    });
    mapkey('gk', {
        short: "Open Chrome Cookies",
        unique_id: "cmd_chrome_cookies",
        feature_group: 12,
        category: "chrome",
        description: "Open Chrome cookies settings page",
        tags: ["chrome", "internal", "cookies"]
    }, function() {
        tabOpenLink("chrome://settings/cookies");
    });
    mapkey('ge', {
        short: "Open Chrome Extensions",
        unique_id: "cmd_chrome_extensions",
        feature_group: 12,
        category: "chrome",
        description: "Open Chrome extensions management page",
        tags: ["chrome", "internal", "extensions"]
    }, function() {
        tabOpenLink("chrome://extensions/");
    });
    mapkey('gn', {
        short: "Open Chrome Net Internals",
        unique_id: "cmd_chrome_net_internals",
        feature_group: 12,
        category: "chrome",
        description: "Open Chrome network internals diagnostic page",
        tags: ["chrome", "internal", "network"]
    }, function() {
        tabOpenLink("chrome://net-internals/#proxy");
    });
    mapkey(';i', {
        short: "Open Chrome Inspect",
        unique_id: "cmd_chrome_inspect",
        feature_group: 12,
        category: "chrome",
        description: "Open Chrome device inspection page for debugging",
        tags: ["chrome", "internal", "inspect"]
    }, function() {
        tabOpenLink("chrome://inspect/#devices");
    });

    if (!getBrowserName().startsWith("Safari")) {
    mapkey('gs', {
        short: "View page source",
        unique_id: "cmd_chrome_view_source",
        feature_group: 12,
        category: "chrome",
        description: "View HTML source code of current page",
        tags: ["chrome", "source", "view"]
    }, function() {
        RUNTIME("viewSource", { tab: { tabbed: true }});
    });
    mapkey(';j', {
        short: "Close downloads shelf",
        unique_id: "cmd_chrome_close_downloads_shelf",
        feature_group: 12,
        category: "chrome",
        description: "Close the downloads shelf at bottom of browser",
        tags: ["chrome", "downloads", "ui"]
    }, function() {
        RUNTIME("closeDownloadsShelf", {clearHistory: true});
    });
    mapkey('g-033' satisfies GKey, {
        short: "Open last downloaded file",
        unique_id: "cmd_download_open_last",
        feature_group: 12,
        category: "chrome",
        description: "Open the last completed download with its default application",
        tags: ["chrome", "downloads", "file"]
    }, function() {
        RUNTIME('downloadOpenLastFile');
    });
    mapkey('g-034' satisfies GKey, {
        short: "Show last downloaded file in folder",
        unique_id: "cmd_download_show_last",
        feature_group: 12,
        category: "chrome",
        description: "Reveal the last completed download in the OS file manager",
        tags: ["chrome", "downloads", "file"]
    }, function() {
        RUNTIME('downloadShowLastFile');
    });
    } // end !Safari guard
}

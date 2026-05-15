import { getWordUnderCursor, getBrowserName } from '../utils.js';
import type { CommandAPI } from '../../../../@types/surfingkeys';

export default function registerOmnibar(
    api: CommandAPI,
    _clipboard: unknown,
    _insert: unknown,
    _normal: unknown,
    _hints: unknown,
    _visual: unknown,
    front: unknown,
    _browser: unknown
): void {
    const { mapkey, addSearchAlias } = api;

    mapkey('Q', {
        short: "Open omnibar for translation",
        unique_id: "cmd_omnibar_translate",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar to translate word under cursor",
        tags: ["omnibar", "translation", "query"]
    }, function() {
        (front as any).openOmniquery({query: getWordUnderCursor(), style: "opacity: 0.8;"});
    });

    mapkey('H', {
        short: "Open tab URLs omnibar",
        unique_id: "cmd_omnibar_tab_urls",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar showing URLs from open tabs",
        tags: ["omnibar", "tabs", "urls"]
    }, function() {
        (front as any).openOmnibar({type: "TabURLs"});
    });
    mapkey('om', {
        short: "Open vim marks omnibar",
        unique_id: "cmd_omnibar_vim_marks",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar to select from saved vim-like marks",
        tags: ["omnibar", "marks", "vim"]
    }, function() {
        (front as any).openOmnibar({type: "VIMarks"});
    });
    mapkey(':', {
        short: "Open commands omnibar",
        unique_id: "cmd_omnibar_commands",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar to execute SurfingKeys commands",
        tags: ["omnibar", "commands", "execute"]
    }, function() {
        (front as any).openOmnibar({type: "Commands"});
    });
    mapkey('A', {
        short: "Open LLM chat",
        unique_id: "cmd_omnibar_llm_chat",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar for LLM chat interface",
        tags: ["omnibar", "llm", "ai"]
    }, function() {
        (front as any).openOmnibar({type: "LLMChat"});
    });

    if (!getBrowserName().startsWith("Safari")) {
    mapkey('t', {
        short: "Open URL omnibar",
        unique_id: "cmd_omnibar_url",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar to enter URL in new tab",
        tags: ["omnibar", "url", "navigation"]
    }, function() {
        (front as any).openOmnibar({type: "URLs"});
    });
    mapkey('go', {
        short: "Open URL in current tab",
        unique_id: "cmd_omnibar_url_current",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar to enter URL in current tab",
        tags: ["omnibar", "url", "navigation"]
    }, function() {
        (front as any).openOmnibar({type: "URLs", tabbed: false});
    });
    mapkey('ox', {
        short: "Open recently closed omnibar",
        unique_id: "cmd_omnibar_recent_closed",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar showing recently closed tabs",
        tags: ["omnibar", "history", "tabs"]
    }, function() {
        (front as any).openOmnibar({type: "RecentlyClosed"});
    });
    mapkey('b', {
        short: "Open bookmarks omnibar",
        unique_id: "cmd_omnibar_bookmarks",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar to select and open a bookmark",
        tags: ["omnibar", "bookmarks", "navigation"]
    }, function() {
        (front as any).openOmnibar(({type: "Bookmarks"}));
    });
    mapkey(';x', {
        short: "Close tabs by URL",
        unique_id: "cmd_close_tabs_by_url",
        category: "omnibar",
        description: "Open omnibar to close tabs whose URL matches a pattern",
        tags: ["omnibar", "tabs"],
    }, function() {
        (front as any).openOmnibar({type: "CloseTabs"});
    });
    mapkey('ab', {
        short: "Add bookmark omnibar",
        unique_id: "cmd_omnibar_add_bookmark",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar to save current page to a bookmark folder",
        tags: ["omnibar", "bookmarks", "save"]
    }, function() {
        var page = {
            url: window.location.href,
            title: document.title
        };
        (front as any).openOmnibar(({type: "AddBookmark", extra: page}));
    });
    mapkey('oh', {
        short: "Open history omnibar",
        unique_id: "cmd_omnibar_history",
        feature_group: 8,
        category: "omnibar",
        description: "Open omnibar to select URL from browser history",
        tags: ["omnibar", "history", "navigation"]
    }, function() {
        (front as any).openOmnibar({type: "History"});
    });
    } // end !Safari guard

    addSearchAlias('g', 'google', 'https://www.google.com/search?q=', 's', 'https://www.google.com/complete/search?client=chrome-omni&gs_ri=chrome-ext&oit=1&cp=1&pgcl=7&q=', function(response: any) {
        var res = JSON.parse(response.text);
        return res[1];
    });
    addSearchAlias('d', 'duckduckgo', 'https://duckduckgo.com/?q=', 's', 'https://duckduckgo.com/ac/?q=', function(response: any) {
        var res = JSON.parse(response.text);
        return res.map(function(r: any){
            return r.phrase;
        });
    });
    addSearchAlias('b', 'baidu', 'https://www.baidu.com/s?wd=', 's', 'https://suggestion.baidu.com/su?cb=&wd=', function(response: any) {
        var res = response.text.match(/,s:\[("[^\]]+")]}/);
        return res ? res[1].replace(/"/g, '').split(",") : [];
    });
    addSearchAlias('e', 'wikipedia', 'https://en.wikipedia.org/wiki/', 's', 'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&formatversion=2&namespace=0&limit=40&search=', function(response: any) {
        return JSON.parse(response.text)[1];
    });
    addSearchAlias('w', 'bing', 'https://www.bing.com/search?setmkt=en-us&setlang=en-us&q=', 's', 'https://api.bing.com/osjson.aspx?query=', function(response: any) {
        var res = JSON.parse(response.text);
        return res[1];
    });
    addSearchAlias('s', 'stackoverflow', 'https://stackoverflow.com/search?q=');
    addSearchAlias('h', 'github', 'https://github.com/search?q=', 's', 'https://api.github.com/search/repositories?order=desc&q=', function(response: any) {
        var res = JSON.parse(response.text)['items'];
        return res ? res.map(function(r: any){
            return {
                title: r.description,
                url: r.html_url
            };
        }) : [];
    });
    addSearchAlias('y', 'youtube', 'https://www.youtube.com/results?search_query=', 's',
    'https://clients1.google.com/complete/search?client=youtube&ds=yt&callback=cb&q=', function(response: any) {
        var res = JSON.parse(response.text.substr(9, response.text.length-10));
        return res[1].map(function(d: any) {
            return d[0];
        });
    });
}

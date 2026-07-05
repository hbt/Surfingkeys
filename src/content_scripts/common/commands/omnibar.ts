import { getWordUnderCursor, getBrowserName, getTextNodes, startOtelSpan } from '../utils.js';
import type { CommandAPI } from '../../../../@types/surfingkeys';

const ENTITY_URL_RE = /\b(?:https?:\/\/|ftp:\/\/|file:\/\/\/|git@|git:\/\/|ssh:\/\/)[^\s<>"')\]]+/gi;
const ENTITY_EMAIL_RE = /\b[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+\b/g;
const ENTITY_IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;
const ENTITY_PATH_ABS_RE = /(?:~|\.{1,2})?\/[\w.-]+(?:\/[\w.-]+)*\/?/g;
const ENTITY_PATH_REL_RE = /\b[\w-]+(?:\/[\w-]+)+\.[A-Za-z0-9]{1,8}\b/g;
const ENTITY_WORD_RE = /\b[A-Za-z][A-Za-z0-9_'-]{3,}\b/g;
const ENTITY_WORD_CAP = 200;
const ENTITY_TOTAL_CAP = 700;

function trimTrailingPunct(s: string): string {
    return s.replace(/[.,;:!?)\]}'"]+$/, '');
}

function extractPageEntities(): {text: string; category: string}[] {
    const span = startOtelSpan('oE.extractPageEntities', {
        host: window.location.hostname,
        docElementCount: document.getElementsByTagName('*').length,
    });

    const nodes = getTextNodes(document.body, /\S/);
    span.addEvent('textNodes.gathered', { count: nodes.length });
    let working = nodes.map((n: any) => n.data).join(' ');
    const results: {text: string; category: string}[] = [];

    function extractAndMask(regex: RegExp, category: string, trim = false) {
        const seen = new Set<string>();
        for (const m of Array.from(working.matchAll(regex)) as RegExpMatchArray[]) {
            const text = trim ? trimTrailingPunct(m[0]) : m[0];
            if (!seen.has(text)) { seen.add(text); results.push({ text, category }); }
            working = working.slice(0, m.index!) + ' '.repeat(m[0].length) + working.slice(m.index! + m[0].length);
        }
    }

    extractAndMask(ENTITY_URL_RE, 'url', true);
    extractAndMask(ENTITY_EMAIL_RE, 'email');
    extractAndMask(ENTITY_IP_RE, 'ip');
    extractAndMask(ENTITY_PATH_ABS_RE, 'path', true);
    extractAndMask(ENTITY_PATH_REL_RE, 'path');

    const wordSeen = new Map<string, string>();
    for (const m of Array.from(working.matchAll(ENTITY_WORD_RE)) as RegExpMatchArray[]) {
        if (wordSeen.size >= ENTITY_WORD_CAP) break;
        const key = m[0].toLowerCase();
        if (!wordSeen.has(key)) wordSeen.set(key, m[0]);
    }
    for (const text of wordSeen.values()) results.push({ text, category: 'word' });

    const capped = results.slice(0, ENTITY_TOTAL_CAP);
    const counts: Record<string, number> = {};
    for (const r of capped) counts[r.category] = (counts[r.category] || 0) + 1;
    span.end({ totalCount: capped.length, ...counts });
    return capped;
}

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
    mapkey('oE', {
        short: "Open extracted page entities",
        unique_id: "cmd_omnibar_extract_entities",
        feature_group: 8,
        category: "omnibar",
        description: "Scan visible page text for emails, IPs, URLs, filepaths and words; fuzzy-search and copy selection to clipboard",
        tags: ["omnibar", "extract", "fuzzy", "clipboard", "extrakto"]
    }, function() {
        const span = startOtelSpan('oE.keyTriggered', { host: window.location.hostname });
        const extra = extractPageEntities();
        span.addEvent('openOmnibar.call', { candidateCount: extra.length });
        span.end();
        (front as any).openOmnibar({ type: "PageEntities", extra });
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

    // Register cmd_omnibar_history AFTER addSearchAlias('h', ...) because addSearchAlias maps 'oh'
    // to github search (overriding the earlier key registration). By registering last, 'oh' stays
    // bound to the history omnibar and cmd_omnibar_history appears in the commandRegistry when
    // buildCommandRegistry scans the trie after all default mappings load.
    if (!getBrowserName().startsWith("Safari")) {
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
}

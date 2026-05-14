import { RUNTIME, runtime, dispatchSKEvent } from '../runtime.js';
import { getBrowserName, getCssSelectorsOfEditable, getLargeElements, getTextNodePos } from '../utils.js';
import type { CommandAPI, HintsModule, NormalModule, FrontendAPI, ChromeSurfingkeysAPI } from '../../../../@types/surfingkeys';

type ChromeWithSK = typeof chrome & { surfingkeys?: ChromeSurfingkeysAPI };

export default function registerHints(
    api: CommandAPI,
    _clipboard: unknown,
    _insert: unknown,
    normal: unknown,
    hints: unknown,
    _visual: unknown,
    front: unknown,
    _browser: unknown
): void {
    const hn = hints as HintsModule;
    const nm = normal as NormalModule;
    const fr = front as FrontendAPI;
    const { mapkey } = api;

    mapkey('gi', {
        short: "Go to first edit box",
        unique_id: "cmd_hints_first_input",
        feature_group: 1,
        category: "hints",
        description: "Focus the first input field on the page",
        tags: ["hints", "input", "focus"]
    }, function() {
        hn.createInputLayer();
    });
    mapkey('i', {
        short: "Go to edit box",
        unique_id: "cmd_hints_select_input",
        feature_group: 1,
        category: "hints",
        description: "Show hints to select and focus an input field",
        tags: ["hints", "input", "selection"]
    }, function() {
        hn.create(getCssSelectorsOfEditable(), hn.dispatchMouseClick);
    });
    mapkey('I', {
        short: "Go to edit box with vim",
        unique_id: "cmd_hints_input_vim",
        feature_group: 1,
        category: "hints",
        description: "Show hints to select an input and open it in vim editor",
        tags: ["hints", "input", "vim"]
    }, function() {
        hn.create(getCssSelectorsOfEditable(), function(element) {
            fr.showEditor(element as Element);
        });
    });
    mapkey('L', {
        short: "Regional hints mode",
        unique_id: "cmd_hints_regional",
        feature_group: 1,
        category: "hints",
        description: "Enter hints mode for large page regions",
        tags: ["hints", "regional", "navigation"]
    }, function() {
        hn.create(getLargeElements(), (_e) => { }, { regionalHints: true });
    });

    mapkey(';m', {
        short: "Mouse out last element",
        unique_id: "cmd_hints_mouseout_last",
        feature_group: 1,
        category: "hints",
        description: "Trigger mouseout event on the last hinted element",
        tags: ["hints", "mouse", "event"]
    }, function() {
        (hn as HintsModule & { mouseoutLastElement(): void }).mouseoutLastElement();
    });

    mapkey(';fs', {
        short: "Focus scrollable elements",
        unique_id: "cmd_hints_scrollable",
        feature_group: 1,
        category: "hints",
        description: "Show hints to focus elements with scrollable content",
        tags: ["hints", "scroll", "focus"]
    }, function() {
        hn.create(nm.refreshScrollableElements(), hn.dispatchMouseClick);
    });

    mapkey("f", {
        short: "Open link",
        unique_id: "cmd_hints_open_link",
        feature_group: 1,
        category: "hints",
        description: "Show hints to click on links and interactive elements",
        tags: ["hints", "link", "click"]
    }, function() {
        hn.create("", hn.dispatchMouseClick);
    }, {repeatIgnore: true});

    mapkey('af', {
        short: "Open link in active tab",
        unique_id: "cmd_hints_link_active_tab",
        feature_group: 1,
        category: "hints",
        description: "Show hints to open link in a new active tab",
        tags: ["hints", "link", "tab"]
    }, function() {
        hn.create("", hn.dispatchMouseClick, {tabbed: true, active: true});
    });
    mapkey('gf', {
        short: "Open link in background tab",
        unique_id: "cmd_hints_link_background_tab",
        feature_group: 1,
        category: "hints",
        description: "Show hints to open link in a new background tab",
        tags: ["hints", "link", "background"]
    }, function() {
        hn.create("", hn.dispatchMouseClick, {tabbed: true, active: false});
    });
    mapkey('cf', {
        short: "Open multiple links",
        unique_id: "cmd_hints_multiple_links",
        feature_group: 1,
        category: "hints",
        description: "Show hints to open multiple links in new tabs",
        tags: ["hints", "link", "multiple"]
    }, function() {
        hn.create("", hn.dispatchMouseClick, {multipleHits: true});
    });

    mapkey('<Ctrl-h>', {
        short: "Mouse over elements",
        unique_id: "cmd_hints_mouseover",
        feature_group: 1,
        category: "hints",
        description: "Show hints to trigger mouseover event on elements",
        tags: ["hints", "mouse", "event"]
    }, function() {
        hn.create("", (element, shiftKey) => {
            const skChrome = chrome as ChromeWithSK;
            if (skChrome.surfingkeys) {
                const r = (element as Element).getClientRects()[0];
                skChrome.surfingkeys.sendMouseEvent(2, Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2), 0);
            } else {
                hn.dispatchMouseClick(element as Element, shiftKey);
            }
        }, {mouseEvents: ["mouseover"]});
    });
    mapkey('<Ctrl-j>', {
        short: "Mouse out elements",
        unique_id: "cmd_hints_mouseout",
        feature_group: 1,
        category: "hints",
        description: "Show hints to trigger mouseout event on elements",
        tags: ["hints", "mouse", "event"]
    }, function() {
        hn.create("", hn.dispatchMouseClick, {mouseEvents: ["mouseout"]});
    });

    mapkey('q', {
        short: "Click image or button",
        unique_id: "cmd_hints_image_button",
        feature_group: 1,
        category: "hints",
        description: "Show hints to click on images or buttons",
        tags: ["hints", "image", "button"]
    }, function() {
        hn.create("img, button", hn.dispatchMouseClick);
    });

    mapkey("cq", {
        short: "Query word with hints",
        unique_id: "cmd_hints_query_word",
        feature_group: 7,
        category: "hints",
        description: "Show hints to select and query a word for translation",
        tags: ["hints", "query", "translation"]
    }, function() {
        hn.create(runtime.conf.textAnchorPat, function (element) {
            const el = element as [Node, number, string];
            var word = el[2].trim().replace(/[^A-z].*$/, "");
            var b = getTextNodePos(el[0], el[1], el[2].length);
            fr.performInlineQuery(word, {
                top: b.top,
                left: b.left,
                height: b.height ?? 0,
                width: b.width ?? 0
            }, function (pos, queryResult) {
                dispatchSKEvent("front", ['showBubble', pos, queryResult, false]);
            });
        });
    });

    if (!getBrowserName().startsWith("Safari")) {
        mapkey(';di', {
            short: "Download image",
            unique_id: "cmd_hints_download_image",
            feature_group: 1,
            category: "hints",
            description: "Show hints to select and download an image",
            tags: ["hints", "download", "image"]
        }, function() {
            hn.create('img', function(element) {
                RUNTIME('download', {
                    url: (element as HTMLImageElement).src
                });
            });
        });
    }
}

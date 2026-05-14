import { RUNTIME, runtime, dispatchSKEvent } from '../runtime.js';
import { getBrowserName, getCssSelectorsOfEditable, getLargeElements, getTextNodePos } from '../utils.js';
import type { CommandAPI } from '../../../../@types/surfingkeys';

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
    const { mapkey } = api;

    mapkey('gi', {
        short: "Go to first edit box",
        unique_id: "cmd_hints_first_input",
        feature_group: 1,
        category: "hints",
        description: "Focus the first input field on the page",
        tags: ["hints", "input", "focus"]
    }, function() {
        (hints as any).createInputLayer();
    });
    mapkey('i', {
        short: "Go to edit box",
        unique_id: "cmd_hints_select_input",
        feature_group: 1,
        category: "hints",
        description: "Show hints to select and focus an input field",
        tags: ["hints", "input", "selection"]
    }, function() {
        (hints as any).create(getCssSelectorsOfEditable(), (hints as any).dispatchMouseClick);
    });
    mapkey('I', {
        short: "Go to edit box with vim",
        unique_id: "cmd_hints_input_vim",
        feature_group: 1,
        category: "hints",
        description: "Show hints to select an input and open it in vim editor",
        tags: ["hints", "input", "vim"]
    }, function() {
        (hints as any).create(getCssSelectorsOfEditable(), function(element: any) {
            (front as any).showEditor(element);
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
        (hints as any).create(getLargeElements(), (_e: any) => { }, { regionalHints: true });
    });

    mapkey(';m', {
        short: "Mouse out last element",
        unique_id: "cmd_hints_mouseout_last",
        feature_group: 1,
        category: "hints",
        description: "Trigger mouseout event on the last hinted element",
        tags: ["hints", "mouse", "event"]
    }, function() {
        (hints as any).mouseoutLastElement();
    });

    mapkey(';fs', {
        short: "Focus scrollable elements",
        unique_id: "cmd_hints_scrollable",
        feature_group: 1,
        category: "hints",
        description: "Show hints to focus elements with scrollable content",
        tags: ["hints", "scroll", "focus"]
    }, function() {
        (hints as any).create((normal as any).refreshScrollableElements(), (hints as any).dispatchMouseClick);
    });

    mapkey("f", {
        short: "Open link",
        unique_id: "cmd_hints_open_link",
        feature_group: 1,
        category: "hints",
        description: "Show hints to click on links and interactive elements",
        tags: ["hints", "link", "click"]
    }, function() {
        (hints as any).create("", (hints as any).dispatchMouseClick);
    }, {repeatIgnore: true});

    mapkey('af', {
        short: "Open link in active tab",
        unique_id: "cmd_hints_link_active_tab",
        feature_group: 1,
        category: "hints",
        description: "Show hints to open link in a new active tab",
        tags: ["hints", "link", "tab"]
    }, function() {
        (hints as any).create("", (hints as any).dispatchMouseClick, {tabbed: true, active: true});
    });
    mapkey('gf', {
        short: "Open link in background tab",
        unique_id: "cmd_hints_link_background_tab",
        feature_group: 1,
        category: "hints",
        description: "Show hints to open link in a new background tab",
        tags: ["hints", "link", "background"]
    }, function() {
        (hints as any).create("", (hints as any).dispatchMouseClick, {tabbed: true, active: false});
    });
    mapkey('cf', {
        short: "Open multiple links",
        unique_id: "cmd_hints_multiple_links",
        feature_group: 1,
        category: "hints",
        description: "Show hints to open multiple links in new tabs",
        tags: ["hints", "link", "multiple"]
    }, function() {
        (hints as any).create("", (hints as any).dispatchMouseClick, {multipleHits: true});
    });

    mapkey('<Ctrl-h>', {
        short: "Mouse over elements",
        unique_id: "cmd_hints_mouseover",
        feature_group: 1,
        category: "hints",
        description: "Show hints to trigger mouseover event on elements",
        tags: ["hints", "mouse", "event"]
    }, function() {
        (hints as any).create("", (element: any, event: any) => {
            if (chrome.surfingkeys) {
                const r = element.getClientRects()[0];
                chrome.surfingkeys.sendMouseEvent(2, Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2), 0);
            } else {
                (hints as any).dispatchMouseClick(element, event);
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
        (hints as any).create("", (hints as any).dispatchMouseClick, {mouseEvents: ["mouseout"]});
    });

    mapkey('q', {
        short: "Click image or button",
        unique_id: "cmd_hints_image_button",
        feature_group: 1,
        category: "hints",
        description: "Show hints to click on images or buttons",
        tags: ["hints", "image", "button"]
    }, function() {
        (hints as any).create("img, button", (hints as any).dispatchMouseClick);
    });

    mapkey("cq", {
        short: "Query word with hints",
        unique_id: "cmd_hints_query_word",
        feature_group: 7,
        category: "hints",
        description: "Show hints to select and query a word for translation",
        tags: ["hints", "query", "translation"]
    }, function() {
        (hints as any).create(runtime.conf.textAnchorPat, function (element: any) {
            var word = element[2].trim().replace(/[^A-z].*$/, "");
            var b = getTextNodePos(element[0], element[1], element[2].length);
            (front as any).performInlineQuery(word, {
                top: b.top,
                left: b.left,
                height: b.height,
                width: b.width
            }, function (pos: any, queryResult: any) {
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
            (hints as any).create('img', function(element: any) {
                RUNTIME('download', {
                    url: element.src
                });
            });
        });
    }
}

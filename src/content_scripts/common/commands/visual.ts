import { dispatchSKEvent } from '../runtime.js';
import { actionWithSelectionPreserved, getBrowserName, getWordUnderCursor, tabOpenLink } from '../utils.js';
import type { CommandAPI } from '../../../../@types/surfingkeys';

function _getSentence(textNode: Text, offset: number): string {
    var sentence = "";

    actionWithSelectionPreserved(function(sel: any) {
        sel.setPosition(textNode, offset);
        sel.modify("extend", "backward", "sentence");
        sel.collapseToStart();
        sel.modify("extend", "forward", "sentence");

        sentence = sel.toString();
    });

    return sentence.replace(/\n/g, '');
}

function openGoogleTranslate(searchSelectedWith: CommandAPI['searchSelectedWith']): void {
    if (window.getSelection()?.toString()) {
        (searchSelectedWith as any)('https://translate.google.com/?hl=en#auto/en/', false, false, '');
    } else {
        tabOpenLink("https://translate.google.com/translate?js=n&sl=auto&tl=zh-CN&u=" + window.location.href);
    }
}

export default function registerVisual(
    api: CommandAPI,
    _clipboard: unknown,
    _insert: unknown,
    _normal: unknown,
    _hints: unknown,
    visual: unknown,
    front: unknown,
    browser: unknown
): void {
    const { mapkey, vmapkey, searchSelectedWith, readText } = api;

    mapkey('zv', {
        short: "Enter visual mode, and select whole element",
        unique_id: "cmd_visual_select_element",
        feature_group: 9,
        category: "visual",
        description: "Enter visual mode and select entire element",
        tags: ["visual", "element", "selection"]
    }, function() {
        (visual as any).toggle("z");
    });

    mapkey('V', {
        short: "Restore visual mode",
        unique_id: "cmd_visual_restore",
        feature_group: 9,
        category: "visual",
        description: "Restore previous visual mode selection",
        tags: ["visual", "restore", "selection"]
    }, function() {
        (visual as any).restore();
    });
    mapkey('*', {
        short: "Find selected text in current page",
        unique_id: "cmd_visual_find_selected",
        feature_group: 9,
        category: "visual",
        description: "Search for currently selected text in the page",
        tags: ["visual", "search", "find"]
    }, function() {
        (visual as any).star();
        (visual as any).toggle();
    });

    vmapkey('<Ctrl-u>', {
        short: "Backward 20 lines",
        unique_id: "cmd_visual_backward_lines",
        feature_group: 9,
        category: "visual",
        description: "Move selection backward 20 lines in visual mode",
        tags: ["visual", "navigation", "backward"]
    }, function() {
        (visual as any).feedkeys('20k');
    });
    vmapkey('<Ctrl-d>', {
        short: "Forward 20 lines",
        unique_id: "cmd_visual_forward_lines",
        feature_group: 9,
        category: "visual",
        description: "Move selection forward 20 lines in visual mode",
        tags: ["visual", "navigation", "forward"]
    }, function() {
        (visual as any).feedkeys('20j');
    });

    mapkey("v", {
        short: "Toggle visual mode",
        unique_id: "cmd_visual_toggle",
        feature_group: 9,
        category: "visual",
        description: "Toggle visual mode for text selection",
        tags: ["visual", "mode", "selection"]
    }, function() {
        (visual as any).toggle();
    }, {repeatIgnore: true});

    mapkey("n", {
        short: "Next found text",
        unique_id: "cmd_visual_next",
        feature_group: 9,
        category: "visual",
        description: "Jump to next occurrence of found text",
        tags: ["visual", "search", "next"]
    }, function() {
        (visual as any).next(false);
    }, {repeatIgnore: true});

    mapkey("N", {
        short: "Previous found text",
        unique_id: "cmd_visual_previous",
        feature_group: 9,
        category: "visual",
        description: "Jump to previous occurrence of found text",
        tags: ["visual", "search", "previous"]
    }, function() {
        (visual as any).next(true);
    }, {repeatIgnore: true});

    vmapkey("q", {
        short: "Translate word under cursor",
        unique_id: "cmd_visual_translate_word",
        feature_group: 9,
        category: "visual",
        description: "Show inline translation for word under cursor",
        tags: ["visual", "translation", "word"]
    }, function() {
        var w = getWordUnderCursor();
        (browser as any).readText(w);
        var b = (visual as any).getCursorPixelPos();
        (front as any).performInlineQuery(w, {
            top: b.top,
            left: b.left,
            height: b.height,
            width: b.width
        }, function(pos: any, queryResult: any) {
            dispatchSKEvent("front", ['showBubble', pos, queryResult, true]);
        });
    });

    mapkey(';t', {
        short: "Translate with Google",
        unique_id: "cmd_tools_translate_google",
        feature_group: 0,
        category: "settings",
        description: "Translate selected text or entire page with Google Translate",
        tags: ["settings", "translation", "google"]
    }, () => {
        if ((chrome as any).surfingkeys) {
            (chrome as any).surfingkeys.translateCurrentPage();
        } else {
            openGoogleTranslate(searchSelectedWith);
        }
    });
    vmapkey('t', {
        short: "Translate selected text with google",
        unique_id: "cmd_visual_translate",
        feature_group: 9,
        category: "visual",
        description: "Translate selected text using Google Translate",
        tags: ["visual", "translation", "google"]
    }, () => openGoogleTranslate(searchSelectedWith));

    vmapkey('A', {
        short: "Open llm chat",
        unique_id: "cmd_visual_llm_chat",
        feature_group: 8,
        category: "visual",
        description: "Open LLM chat with selected text as context",
        tags: ["visual", "llm", "ai"]
    }, function() {
        const sel = window.getSelection()?.toString() ?? '';
        (front as any).openOmnibar({type: "LLMChat", extra: {
            system: sel
        }});
    });

    if (getBrowserName() === "Chrome") {
        vmapkey('gr', {
            short: "Read selected text",
            unique_id: "cmd_visual_read_text",
            feature_group: 9,
            category: "visual",
            description: "Read selected text aloud using text-to-speech",
            tags: ["visual", "tts", "accessibility"]
        }, function() {
            readText(window.getSelection()?.toString() ?? '', {verbose: true} as any);
        });
    }
}

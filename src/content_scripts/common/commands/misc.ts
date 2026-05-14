import { RUNTIME } from '../runtime.js';
import { getBrowserName, showBanner } from '../utils.js';
import type { CommandAPI } from '../../../../@types/surfingkeys';

export default function registerMisc(
    api: CommandAPI,
    _clipboard: unknown,
    _insert: unknown,
    _normal: unknown,
    _hints: unknown,
    _visual: unknown,
    _front: unknown,
    _browser: unknown
): void {
    const { mapkey, map, cmap } = api;

    map('ZQ', ':quit', null as unknown as RegExp, {
        short: "Quit without saving",
        unique_id: "cmd_misc_quit",
        feature_group: 16,
        category: "misc",
        description: "Quit and close all tabs without saving session",
        tags: ["misc", "quit", "session"]
    });
    map('u', 'e', null as unknown as RegExp, {
        short: "Alias for e",
        unique_id: "cmd_misc_alias_u",
        feature_group: 16,
        category: "misc",
        description: "Alias for 'e' - scroll up half page",
        tags: ["misc", "alias", "scroll"]
    });
    map('C', 'gf', null as unknown as RegExp, {
        short: "Alias for gf",
        unique_id: "cmd_misc_alias_c",
        feature_group: 16,
        category: "misc",
        description: "Alias for 'gf' - open link in non-active new tab",
        tags: ["misc", "alias", "hints"]
    });
    map('<Ctrl-i>', 'I', null as unknown as RegExp, {
        short: "Alias for I",
        unique_id: "cmd_misc_alias_ctrl_i",
        feature_group: 16,
        category: "misc",
        description: "Alias for 'I' - go to edit box with vim editor",
        tags: ["misc", "alias", "input"]
    });

    cmap('<ArrowDown>', '<Ctrl-n>');
    cmap('<ArrowUp>', '<Ctrl-p>');

    if (getBrowserName() === "Chrome") {
        mapkey(';s', {
            short: "Toggle PDF viewer",
            unique_id: "cmd_misc_toggle_pdf_viewer",
            feature_group: 16,
            category: "misc",
            description: "Toggle between SurfingKeys PDF viewer and native Chrome PDF viewer",
            tags: ["misc", "pdf", "viewer"]
        }, function() {
            var pdfUrl = window.location.href;
            if (pdfUrl.indexOf(chrome.runtime.getURL("/pages/pdf_viewer.html")) === 0) {
                const filePos = window.location.search.indexOf("=") + 1;
                pdfUrl = window.location.search.substr(filePos);
                RUNTIME('updateSettings', {
                    settings: {
                        "noPdfViewer": 1
                    }
                }, (_resp) => {
                    window.location.replace(pdfUrl);
                });
            } else {
                if (document.querySelector("EMBED") && document.querySelector("EMBED")!.getAttribute("type") === "application/pdf") {
                    RUNTIME('updateSettings', {
                        settings: {
                            "noPdfViewer": 0
                        }
                    }, (_resp) => {
                        window.location.replace(pdfUrl);
                    });
                } else {
                    RUNTIME('getSettings', {
                        key: 'noPdfViewer'
                    }, function(resp) {
                        const settings = (resp as { settings: { noPdfViewer: boolean | number } }).settings;
                        const info = settings.noPdfViewer ? "PDF viewer enabled." : "PDF viewer disabled.";
                        RUNTIME('updateSettings', {
                            settings: {
                                "noPdfViewer": !settings.noPdfViewer
                            }
                        }, (_r) => {
                            showBanner(info);
                        });
                    });
                }
            }
        });
    }
}

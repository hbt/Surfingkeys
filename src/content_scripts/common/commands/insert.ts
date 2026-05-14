import { getBrowserName, getRealEdit, toggleQuote } from '../utils.js';
import type { CommandAPI, InsertModule, FrontendAPI } from '../../../../@types/surfingkeys';

export default function registerInsert(
    api: CommandAPI,
    _clipboard: unknown,
    insert: unknown,
    _normal: unknown,
    _hints: unknown,
    _visual: unknown,
    front: unknown,
    _browser: unknown
): void {
    const ins = insert as InsertModule;
    const fr = front as FrontendAPI;
    const { imapkey } = api;

    function openVim(useNeovim: boolean): void {
        var element = getRealEdit();
        element.blur();
        ins.exit();
        fr.showEditor(element, null, null, useNeovim);
    }

    imapkey("<Ctrl-'>", {
        short: "Toggle quotes in input",
        unique_id: "cmd_insert_toggle_quotes",
        feature_group: 15,
        category: "insert",
        description: "Toggle quotes around selected text in input field",
        tags: ["insert", "input", "editing"]
    }, toggleQuote);
    imapkey('<Ctrl-i>', {
        short: "Open vim editor for input",
        unique_id: "cmd_insert_vim_editor",
        feature_group: 15,
        category: "insert",
        description: "Open vim editor to edit content of current input field",
        tags: ["insert", "input", "vim"]
    }, function() {
        openVim(false);
    });

    const browserName = getBrowserName();
    if (browserName === "Chrome") {
        imapkey('<Ctrl-Alt-i>', {
            short: "Open neovim for input",
            unique_id: "cmd_insert_neovim_editor",
            feature_group: 15,
            category: "insert",
            description: "Open neovim editor to edit content of current input field",
            tags: ["insert", "input", "neovim"]
        }, function() {
            openVim(true);
        });
    }
}

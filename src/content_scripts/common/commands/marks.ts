import type { CommandAPI, NormalModule } from '../../../../@types/surfingkeys';

export default function registerMarks(
    api: CommandAPI,
    _clipboard: unknown,
    _insert: unknown,
    normal: unknown,
    _hints: unknown,
    _visual: unknown,
    _front: unknown,
    _browser: unknown
): void {
    const nm = normal as NormalModule;
    const { mapkey } = api;

    mapkey('m', {
        short: "Add vim-like mark",
        unique_id: "cmd_marks_add",
        feature_group: 10,
        category: "marks",
        description: "Save current URL as a vim-like mark for quick access",
        tags: ["marks", "vim", "save"]
    }, nm.addVIMark);
    mapkey("'", {
        short: "Jump to vim mark",
        unique_id: "cmd_marks_jump",
        feature_group: 10,
        category: "marks",
        description: "Jump to a saved vim-like mark in current tab",
        tags: ["marks", "vim", "navigation"]
    }, nm.jumpVIMark);
    mapkey("<Ctrl-'>", {
        short: "Jump to vim mark in new tab",
        unique_id: "cmd_marks_jump_new_tab",
        feature_group: 10,
        category: "marks",
        description: "Jump to a saved vim-like mark in a new tab",
        tags: ["marks", "vim", "tab"]
    }, function(mark: string) {
        nm.jumpVIMark(mark);
    });
}

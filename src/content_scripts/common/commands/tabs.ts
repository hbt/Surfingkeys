import { RUNTIME, runtime } from '../runtime.js';
import { tabOpenLink, getBrowserName } from '../utils.js';
import type { CommandAPI, MagicDirection } from '../../../../@types/surfingkeys';
import type { GKey } from '../g-keys.js';

function resolveMagic(magicKey: string): MagicDirection {
    return (runtime.conf.magicKeys as Record<string, MagicDirection>)?.[magicKey] ?? 'CurrentTab';
}

function copyTabUrlsMagic(magic: string, clipboard: unknown): void {
    RUNTIME("copyTabUrlsMagic", {magic: magic}, function(response: any) {
        if (response && response.urls && response.urls.length) {
            (clipboard as any).write(response.urls.join('\n'));
        }
    });
}

export default function registerTabs(
    api: CommandAPI,
    clipboard: unknown,
    _insert: unknown,
    _normal: unknown,
    _hints: unknown,
    _visual: unknown,
    front: unknown,
    _browser: unknown
): void {
    const { mapkey, map } = api;

    mapkey('T', {
        short: "Choose a tab",
        unique_id: "cmd_tab_choose",
        feature_group: 3,
        category: "tabs",
        description: "Choose and switch to a tab from a list",
        tags: ["tabs", "navigation", "switch"]
    }, function() {
        (front as any).chooseTab();
    });
    mapkey(';G', {
        short: "Group this tab",
        unique_id: "cmd_tab_group",
        feature_group: 3,
        category: "tabs",
        description: "Group current tab into a tab group",
        tags: ["tabs", "organization", "group"]
    }, function() {
        (front as any).groupTab();
    });
    mapkey('g-023' satisfies GKey, {
        short: "Collapse current tab's group",
        unique_id: "cmd_tab_group_collapse",
        feature_group: 3,
        category: "tabs",
        description: "Collapse the tab group containing the current tab",
        tags: ["tabs", "group", "collapse"]
    }, function() {
        RUNTIME('collapseCurrentGroup');
    });
    mapkey('g-024' satisfies GKey, {
        short: "Collapse all tab groups",
        unique_id: "cmd_tab_group_collapse_all",
        feature_group: 3,
        category: "tabs",
        description: "Collapse all tab groups in the current window",
        tags: ["tabs", "group", "collapse"]
    }, function() {
        RUNTIME('collapseAllGroups');
    });
    mapkey('g-025' satisfies GKey, {
        short: "Expand all tab groups",
        unique_id: "cmd_tab_group_expand_all",
        feature_group: 3,
        category: "tabs",
        description: "Expand all tab groups in the current window",
        tags: ["tabs", "group", "expand"]
    }, function() {
        RUNTIME('expandAllGroups');
    });
    mapkey('g-028' satisfies GKey, {
        short: "Create new tab group (magic)",
        unique_id: "cmd_tab_group_new_magic",
        feature_group: 3,
        category: "tabs",
        description: "Create a new (unnamed) tab group from tabs matching a magic direction",
        tags: ["tabs", "group", "organization", "magic"]
    }, function(magicKey: string) {
        // TODO(hbt) NEXT [tabs] add name prompt for createTabGroupMagic
        RUNTIME('createTabGroupMagic', { magic: resolveMagic(magicKey) });
    });
    mapkey('g-029' satisfies GKey, {
        short: "Rename current tab group",
        unique_id: "cmd_tab_group_edit_name",
        feature_group: 3,
        category: "tabs",
        description: "Open prompt to rename the tab group the current tab belongs to. No-op if the tab is not in a group.",
        tags: ["tabs", "group", "rename"]
    }, function() {
        RUNTIME('getActiveTabGroupInfo', {}, function(response: any) {
            if (!response || response.groupId < 0) return;
            (front as any).openOmnibar({
                type: "Commands",
                pref: `renameTabGroup ${response.title || ''}`
            });
        });
    });

    map('g0', ':feedkeys 99E', null as any, {
        short: "Go to first tab",
        unique_id: "cmd_tab_first",
        feature_group: 3,
        category: "tabs",
        description: "Go to the first tab in the tab bar",
        tags: ["tabs", "navigation", "jump"]
    });
    map('g$', ':feedkeys 99R', null as any, {
        short: "Go to last tab",
        unique_id: "cmd_tab_last",
        feature_group: 3,
        category: "tabs",
        description: "Go to the last tab in the tab bar",
        tags: ["tabs", "navigation", "jump"]
    });

    mapkey('zr', {
        short: "Zoom reset",
        unique_id: "cmd_tab_zoom_reset",
        feature_group: 3,
        category: "tabs",
        description: "Reset page zoom to default level",
        tags: ["tabs", "zoom", "reset"]
    }, function() {
        RUNTIME('setZoom', {
            zoomFactor: 0
        });
    });
    mapkey('zi', {
        short: "Zoom in",
        unique_id: "cmd_tab_zoom_in",
        feature_group: 3,
        category: "tabs",
        description: "Zoom in on current page",
        tags: ["tabs", "zoom", "increase"]
    }, function() {
        RUNTIME('setZoom', {
            zoomFactor: 0.1
        });
    });
    mapkey('zo', {
        short: "Zoom out",
        unique_id: "cmd_tab_zoom_out",
        feature_group: 3,
        category: "tabs",
        description: "Zoom out on current page",
        tags: ["tabs", "zoom", "decrease"]
    }, function() {
        RUNTIME('setZoom', {
            zoomFactor: -0.1
        });
    });

    mapkey('<Alt-p>', {
        short: "Pin/unpin tab",
        unique_id: "cmd_tab_pin_toggle",
        feature_group: 3,
        category: "tabs",
        description: "Toggle pin status of current tab",
        tags: ["tabs", "pin", "toggle"]
    }, function() {
        RUNTIME("togglePinTab");
    });
    mapkey('<Alt-m>', {
        short: "Mute/unmute tab",
        unique_id: "cmd_tab_mute_toggle",
        feature_group: 3,
        category: "tabs",
        description: "Toggle audio mute status of current tab",
        tags: ["tabs", "mute", "audio"]
    }, function() {
        RUNTIME("muteTab");
    });

    mapkey('gT', {
        short: "Go to first activated tab",
        unique_id: "cmd_tab_history_first",
        feature_group: 4,
        category: "tabs",
        description: "Go to the first tab in activation history",
        tags: ["tabs", "history", "navigation"]
    }, function() {
        RUNTIME("historyTab", {index: 0});
    }, {repeatIgnore: true});
    mapkey('gt', {
        short: "Go to last activated tab",
        unique_id: "cmd_tab_history_last",
        feature_group: 4,
        category: "tabs",
        description: "Go to the last activated tab in history",
        tags: ["tabs", "history", "navigation"]
    }, function() {
        RUNTIME("historyTab", {index: -1});
    }, {repeatIgnore: true});
    mapkey('gp', {
        short: "Go to playing tab",
        unique_id: "cmd_tab_playing",
        feature_group: 4,
        category: "tabs",
        description: "Switch to the tab that is currently playing audio",
        tags: ["tabs", "audio", "navigation"]
    }, function() {
        RUNTIME('getTabs', { queryInfo: {audible: true}}, (response: any) => {
            if (response.tabs?.at(0)) {
                const tab = response.tabs[0];
                RUNTIME('focusTab', {
                    windowId: tab.windowId,
                    tabId: tab.id
                });
            }
        });
    }, { repeatIgnore: true });

    mapkey('x', {
        short: "Close current tab",
        unique_id: "cmd_tab_close",
        feature_group: 3,
        category: "tabs",
        description: "Close the current tab",
        tags: ["tabs", "close", "management"]
    }, function() {
        RUNTIME("closeTab");
    });

    mapkey('yt', {
        short: "Duplicate tab",
        unique_id: "cmd_tab_duplicate",
        feature_group: 3,
        category: "tabs",
        description: "Duplicate current tab and switch to it",
        tags: ["tabs", "duplicate", "copy"]
    }, function() {
        RUNTIME("duplicateTab");
    });
    mapkey('yT', {
        short: "Duplicate tab in background",
        unique_id: "cmd_tab_duplicate_background",
        feature_group: 3,
        category: "tabs",
        description: "Duplicate current tab without switching to it",
        tags: ["tabs", "duplicate", "background"]
    }, function() {
        RUNTIME("duplicateTab", {active: false});
    });

    mapkey('gxp', {
        short: "Close playing tab",
        unique_id: "cmd_tab_close_playing",
        feature_group: 3,
        category: "tabs",
        description: "Close the tab that is currently playing audio",
        tags: ["tabs", "close", "audio"]
    }, function() {
        RUNTIME("closeAudibleTab");
    });

    mapkey('gK', {
        short: "Go to parent tab",
        unique_id: "cmd_tab_parent",
        feature_group: 3,
        category: "tabs",
        description: "Switch to the tab that opened the current tab",
        tags: ["tabs", "navigation", "parent"]
    }, function() {
        RUNTIME("goToParentTab");
    });

    mapkey('g-001' satisfies GKey, {
        short: "Detach current tab to new window",
        unique_id: "cmd_tab_detach",
        feature_group: 3,
        category: "tabs",
        description: "Move current tab to a new window",
        tags: ["tabs", "detach", "window"]
    }, function() {
        RUNTIME("moveToWindow", {windowId: -1});
    });



    // Group M — Pending-key magic tab commands
    mapkey('gX', {
        short: "Close tab(s) via magic key",
        unique_id: "cmd_tab_close_m",
        feature_group: 3,
        category: "tabs",
        description: "Close tab(s): next key selects magic direction (magicKeys config). Pinned tabs skipped.",
        tags: ["tabs", "close", "magic"]
    }, function(magicKey: string): void {
        RUNTIME('closeTabMagic', { magic: resolveMagic(magicKey) });
    });
    mapkey('gR', {
        short: "Reload tab(s) via magic key",
        unique_id: "cmd_tab_reload_m",
        feature_group: 3,
        category: "tabs",
        description: "Reload tab(s): next key selects magic direction (magicKeys config).",
        tags: ["tabs", "reload", "magic"]
    }, function(magicKey: string): void {
        RUNTIME('reloadTabMagic', { magic: resolveMagic(magicKey) });
    });
    mapkey('gY', {
        short: "Copy tab URL(s) via magic key",
        unique_id: "cmd_tab_copy_urls_m",
        feature_group: 3,
        category: "tabs",
        description: "Copy tab URL(s) to clipboard: next key selects magic direction (magicKeys config).",
        tags: ["tabs", "copy", "url", "magic"]
    }, function(magicKey: string): void {
        copyTabUrlsMagic(resolveMagic(magicKey), clipboard);
    });
    mapkey('gP', {
        short: "Pin/unpin tab(s) via magic key",
        unique_id: "cmd_tab_pin_m",
        feature_group: 3,
        category: "tabs",
        description: "Toggle pin on tab(s): next key selects magic direction (magicKeys config).",
        tags: ["tabs", "pin", "magic"]
    }, function(magicKey: string): void {
        RUNTIME('pinTabMagic', { magic: resolveMagic(magicKey) });
    });
    mapkey('gD', {
        short: "Detach tab(s) to new window via magic key",
        unique_id: "cmd_tab_detach_m",
        feature_group: 3,
        category: "tabs",
        description: "Move tab(s) to a new window: next key selects magic direction (magicKeys config).",
        tags: ["tabs", "detach", "window", "magic"]
    }, function(magicKey: string): void {
        RUNTIME('moveToWindowMagic', { magic: resolveMagic(magicKey) });
    });
    mapkey('g-022' satisfies GKey, {
        short: "Print tab(s) via magic key",
        unique_id: "cmd_tab_print_m",
        feature_group: 3,
        category: "tabs",
        description: "Print tab(s): next key selects magic direction (magicKeys config). Opens system print dialog (use 'Save as PDF').",
        tags: ["tabs", "print", "pdf", "magic"]
    }, function(magicKey: string): void {
        RUNTIME('printTabMagic', { magic: resolveMagic(magicKey) });
    });

    mapkey('g-030' satisfies GKey, {
        short: "Save tab(s) as MHTML archive",
        unique_id: "cmd_tab_capture_mhtml",
        feature_group: 3,
        category: "tabs",
        description: "Save tab(s) as MHTML archive: next key selects magic direction (magicKeys config). Downloads a .mhtml file per tab.",
        tags: ["tabs", "capture", "mhtml", "download", "magic"]
    }, function(magicKey: string): void {
        RUNTIME('captureTabMagic', { magic: resolveMagic(magicKey) });
    });

    mapkey('g-036' satisfies GKey, {
        short: "Deduplicate tabs by URL",
        unique_id: "cmd_tab_unique",
        feature_group: 3,
        category: "tabs",
        description: "Close all duplicate tabs in the current window, keeping the first occurrence of each URL.",
        tags: ["tabs", "dedup", "close", "unique"]
    }, function() {
        RUNTIME('tabUnique');
    });

    mapkey('g-035' satisfies GKey, {
        short: "Pre-warm all cold tabs",
        unique_id: "cmd_tab_warmup",
        feature_group: 3,
        category: "tabs",
        description: "Briefly activates each tab that has never been focused since the extension loaded, then restores focus. Forces Chrome to unfreeze frozen background tabs, eliminating lag on manual tab switch.",
        tags: ["tabs", "warmup", "performance"]
    }, function() {
        RUNTIME('tabWarmup');
    });

    mapkey('g-026' satisfies GKey, {
        short: "Save tab quick mark",
        unique_id: "cmd_tab_quick_mark_save",
        feature_group: 3,
        category: "tabs",
        description: "Save current tab to a named quick mark",
        tags: ["tabs", "marks", "save"]
    }, function(mark: string) {
        RUNTIME('tabQuickMarkSave', {mark});
    });

    mapkey('g-027' satisfies GKey, {
        short: "Jump to tab quick mark",
        unique_id: "cmd_tab_quick_mark_jump",
        feature_group: 3,
        category: "tabs",
        description: "Jump to a named tab quick mark; backtick-backtick toggles to last tab",
        tags: ["tabs", "marks", "navigation"]
    }, function(mark: string) {
        if (mark === '`') {
            RUNTIME('goToLastTab');
        } else {
            RUNTIME('tabQuickMarkJump', {mark});
        }
    });

    mapkey('X', {
        short: "Restore closed tab",
        unique_id: "cmd_tab_restore",
        feature_group: 3,
        category: "tabs",
        description: "Restore the most recently closed tab",
        tags: ["tabs", "restore", "undo"]
    }, function() {
        RUNTIME("openLast");
    });

    if (!getBrowserName().startsWith("Safari")) {
    mapkey('W', {
        short: "Move tab to another window",
        unique_id: "cmd_tab_move_window",
        feature_group: 3,
        category: "tabs",
        description: "Move current tab to a different browser window",
        tags: ["tabs", "move", "window"]
    }, function() {
        (front as any).openOmnibar(({type: "Windows"}));
    });
    mapkey(';gt', {
        short: "Gather filtered tabs",
        unique_id: "cmd_tab_gather_filtered",
        feature_group: 3,
        category: "tabs",
        description: "Gather selected tabs from other windows into current window",
        tags: ["tabs", "gather", "window"]
    }, function() {
        (front as any).openOmnibar({type: "Tabs", extra: {
            action: "gather"
        }});
    });
    mapkey(';gw', {
        short: "Gather all tabs",
        unique_id: "cmd_tab_gather_all",
        feature_group: 3,
        category: "tabs",
        description: "Gather all tabs from all windows into current window",
        tags: ["tabs", "gather", "window"]
    }, function() {
        RUNTIME("gatherWindows");
    });
    mapkey('<<', {
        short: "Move tab to left",
        unique_id: "cmd_tab_move_left",
        feature_group: 3,
        category: "tabs",
        description: "Move current tab one position to the left",
        tags: ["tabs", "move", "position"]
    }, function() {
        RUNTIME('moveTab', {
            step: -1
        });
    });
    mapkey('>>', {
        short: "Move tab to right",
        unique_id: "cmd_tab_move_right",
        feature_group: 3,
        category: "tabs",
        description: "Move current tab one position to the right",
        tags: ["tabs", "move", "position"]
    }, function() {
        RUNTIME('moveTab', {
            step: 1
        });
    });
    } // end !Safari guard

    const bn = getBrowserName();
    if (bn === "Firefox") {
        mapkey('on', {
            short: "Open newtab",
            unique_id: "cmd_tab_new",
            feature_group: 3,
            category: "tabs",
            description: "Open a new tab",
            tags: ["tabs", "new", "create"]
        }, function() {
            tabOpenLink("about:blank");
        });
    } else if (bn === "Chrome") {
        mapkey('on', {
            short: "Open newtab",
            unique_id: "cmd_tab_new",
            feature_group: 3,
            category: "tabs",
            description: "Open a new tab",
            tags: ["tabs", "new", "create"]
        }, function() {
            RUNTIME('openNewtab');
        });
    }

    mapkey('g-016' satisfies GKey, {
        short: "Save YouTube playback position",
        unique_id: "cmd_bookmark_save_youtube_position",
        feature_group: 3,
        category: "tabs",
        description: "Bookmark current YouTube video at current playback position",
        tags: ["bookmark", "youtube", "playback"]
    }, function() {
        const el = document.querySelector('.ytp-time-current') as HTMLElement | null;
        if (!el) return;
        const parts = el.innerText.split(':').map(Number).reverse();
        const seconds = (parts[0] || 0) + (parts[1] || 0) * 60 + (parts[2] || 0) * 3600;
        RUNTIME('bookmarkSaveYoutubePosition', { seconds, folder: 'playback' });
    });
}

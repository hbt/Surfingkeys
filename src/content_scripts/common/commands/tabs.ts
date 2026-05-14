import { RUNTIME } from '../runtime.js';
import { tabOpenLink, getBrowserName } from '../utils.js';
import type { CommandAPI, ClipboardManager, FrontendAPI } from '../../../../@types/surfingkeys';

function copyTabUrlsMagic(magic: string, clipboard: ClipboardManager): void {
    RUNTIME("copyTabUrlsMagic", {magic: magic}, function(response) {
        const res = response as { urls?: string[] };
        if (res && res.urls && res.urls.length) {
            clipboard.write(res.urls.join('\n'));
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
    const cb = clipboard as ClipboardManager;
    const fr = front as FrontendAPI;
    const { mapkey, map } = api;

    mapkey('T', {
        short: "Choose a tab",
        unique_id: "cmd_tab_choose",
        feature_group: 3,
        category: "tabs",
        description: "Choose and switch to a tab from a list",
        tags: ["tabs", "navigation", "switch"]
    }, function() {
        fr.chooseTab();
    });
    mapkey(';G', {
        short: "Group this tab",
        unique_id: "cmd_tab_group",
        feature_group: 3,
        category: "tabs",
        description: "Group current tab into a tab group",
        tags: ["tabs", "organization", "group"]
    }, function() {
        fr.groupTab();
    });

    map('g0', ':feedkeys 99E', null as unknown as RegExp, {
        short: "Go to first tab",
        unique_id: "cmd_tab_first",
        feature_group: 3,
        category: "tabs",
        description: "Go to the first tab in the tab bar",
        tags: ["tabs", "navigation", "jump"]
    });
    map('g$', ':feedkeys 99R', null as unknown as RegExp, {
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
        RUNTIME('getTabs', { queryInfo: {audible: true}}, (response) => {
            const res = response as { tabs?: { windowId: number; id: number }[] };
            if (res.tabs?.at(0)) {
                const tab = res.tabs[0];
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

    mapkey('gxt', {
        short: "Close current tab",
        unique_id: "cmd_tab_close_current",
        feature_group: 3,
        category: "tabs",
        description: "Close the current tab",
        tags: ["tabs", "close", "magic"]
    }, function() {
        RUNTIME("closeTabMagic", {magic: 'CurrentTab'});
    });
    mapkey('gxe', {
        short: "Close tabs to the right",
        unique_id: "cmd_tab_close_magic_right",
        feature_group: 3,
        category: "tabs",
        description: "Close tabs to the right (all by default, N with repeat)",
        tags: ["tabs", "close", "magic"]
    }, function() {
        RUNTIME("closeTabMagic", {magic: 'DirectionRight'});
    });
    mapkey('gxq', {
        short: "Close tabs to the left",
        unique_id: "cmd_tab_close_magic_left",
        feature_group: 3,
        category: "tabs",
        description: "Close tabs to the left (all by default, N with repeat)",
        tags: ["tabs", "close", "magic"]
    }, function() {
        RUNTIME("closeTabMagic", {magic: 'DirectionLeft'});
    });
    mapkey('gxc', {
        short: "Close all tabs except current",
        unique_id: "cmd_tab_close_magic_except_active",
        feature_group: 3,
        category: "tabs",
        description: "Close all tabs in current window except the active tab",
        tags: ["tabs", "close", "magic"]
    }, function() {
        RUNTIME("closeTabMagic", {magic: 'AllExceptActive'});
    });
    mapkey('gxC', {
        short: "Close all tabs in window",
        unique_id: "cmd_tab_close_magic_all_window",
        feature_group: 3,
        category: "tabs",
        description: "Close all tabs in current window including the active tab",
        tags: ["tabs", "close", "magic"]
    }, function() {
        RUNTIME("closeTabMagic", {magic: 'AllInWindow'});
    });
    mapkey('gxg', {
        short: "Close all tabs in all windows except current",
        unique_id: "cmd_tab_close_magic_all_windows",
        feature_group: 3,
        category: "tabs",
        description: "Close all tabs in all windows except the active tab",
        tags: ["tabs", "close", "magic"]
    }, function() {
        RUNTIME("closeTabMagic", {magic: 'AllExceptActiveAllWindows'});
    });
    mapkey('gxk', {
        short: "Close child tabs",
        unique_id: "cmd_tab_close_magic_children",
        feature_group: 3,
        category: "tabs",
        description: "Close tabs opened directly from the current tab",
        tags: ["tabs", "close", "magic"]
    }, function() {
        RUNTIME("closeTabMagic", {magic: 'ChildrenTabs'});
    });
    mapkey('gxE', {
        short: "Close current tab and all to the right",
        unique_id: "cmd_tab_close_magic_right_inclusive",
        feature_group: 3,
        category: "tabs",
        description: "Close the current tab and all tabs to its right",
        tags: ["tabs", "close", "magic"]
    }, function() {
        RUNTIME("closeTabMagic", {magic: 'DirectionRightInclusive'});
    });
    mapkey('gxQ', {
        short: "Close current tab and all to the left",
        unique_id: "cmd_tab_close_magic_left_inclusive",
        feature_group: 3,
        category: "tabs",
        description: "Close the current tab and all tabs to its left",
        tags: ["tabs", "close", "magic"]
    }, function() {
        RUNTIME("closeTabMagic", {magic: 'DirectionLeftInclusive'});
    });
    mapkey('gxK', {
        short: "Close descendant tabs recursively",
        unique_id: "cmd_tab_close_magic_children_recursive",
        feature_group: 3,
        category: "tabs",
        description: "Close all descendant tabs opened from the current tab (recursive)",
        tags: ["tabs", "close", "magic"]
    }, function() {
        RUNTIME("closeTabMagic", {magic: 'ChildrenTabsRecursively'});
    });
    mapkey('gxW', {
        short: "Close all tabs in other windows",
        unique_id: "cmd_tab_close_magic_other_windows",
        feature_group: 3,
        category: "tabs",
        description: "Close all tabs in windows other than the current window",
        tags: ["tabs", "close", "magic"]
    }, function() {
        RUNTIME("closeTabMagic", {magic: 'AllOtherWindowsTabs'});
    });
    mapkey('gxw', {
        short: "Close other windows without pinned tabs",
        unique_id: "cmd_tab_close_magic_other_windows_no_pinned",
        feature_group: 3,
        category: "tabs",
        description: "Close all tabs in other windows that contain no pinned tabs",
        tags: ["tabs", "close", "magic"]
    }, function() {
        RUNTIME("closeTabMagic", {magic: 'OtherWindowsNoPinned'});
    });
    mapkey('gxo', {
        short: "Close all incognito tabs",
        unique_id: "cmd_tab_close_magic_incognito",
        feature_group: 3,
        category: "tabs",
        description: "Close all tabs across all incognito windows",
        tags: ["tabs", "close", "magic"]
    }, function() {
        RUNTIME("closeTabMagic", {magic: 'AllIncognitoTabs'});
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

    mapkey('g-001', {
        short: "Detach current tab to new window",
        unique_id: "cmd_tab_detach",
        feature_group: 3,
        category: "tabs",
        description: "Move current tab to a new window",
        tags: ["tabs", "detach", "window"]
    }, function() {
        RUNTIME("moveToWindow", {windowId: -1});
    });
    mapkey('g-004', {
        short: "Detach tabs except current into new window",
        unique_id: "cmd_tab_detach_magic_except_active",
        feature_group: 3,
        category: "tabs",
        description: "Move all tabs in current window except the active tab into a new window",
        tags: ["tabs", "detach", "magic", "window"]
    }, function() {
        RUNTIME("moveToWindowMagic", {magic: 'AllExceptActive'});
    });
    mapkey('g-005', {
        short: "Detach all tabs in current window into new window",
        unique_id: "cmd_tab_detach_magic_all_window",
        feature_group: 3,
        category: "tabs",
        description: "Move all tabs in current window into a new window",
        tags: ["tabs", "detach", "magic", "window"]
    }, function() {
        RUNTIME("moveToWindowMagic", {magic: 'AllInWindow'});
    });
    mapkey('g-006', {
        short: "Detach child tabs",
        unique_id: "cmd_tab_detach_magic_children",
        feature_group: 3,
        category: "tabs",
        description: "Move tabs opened directly from the current tab into a new window",
        tags: ["tabs", "detach", "magic", "window"]
    }, function() {
        RUNTIME("moveToWindowMagic", {magic: 'ChildrenTabs'});
    });
    mapkey('g-002', {
        short: "Detach tabs to the right into new window",
        unique_id: "cmd_tab_detach_magic_right",
        feature_group: 3,
        category: "tabs",
        description: "Move tabs to the right of the current tab into a new window",
        tags: ["tabs", "detach", "magic", "window"]
    }, function() {
        RUNTIME("moveToWindowMagic", {magic: 'DirectionRight'});
    });
    mapkey('g-007', {
        short: "Detach tabs to the right and current into new window",
        unique_id: "cmd_tab_detach_magic_right_inclusive",
        feature_group: 3,
        category: "tabs",
        description: "Move the current tab and all tabs to the right into a new window",
        tags: ["tabs", "detach", "magic", "window"]
    }, function() {
        RUNTIME("moveToWindowMagic", {magic: 'DirectionRightInclusive'});
    });
    mapkey('g-003', {
        short: "Detach tabs to the left into new window",
        unique_id: "cmd_tab_detach_magic_left",
        feature_group: 3,
        category: "tabs",
        description: "Move tabs to the left of the current tab into a new window",
        tags: ["tabs", "detach", "magic", "window"]
    }, function() {
        RUNTIME("moveToWindowMagic", {magic: 'DirectionLeft'});
    });
    mapkey('g-008', {
        short: "Detach tabs to the left and current into new window",
        unique_id: "cmd_tab_detach_magic_left_inclusive",
        feature_group: 3,
        category: "tabs",
        description: "Move the current tab and all tabs to the left into a new window",
        tags: ["tabs", "detach", "magic", "window"]
    }, function() {
        RUNTIME("moveToWindowMagic", {magic: 'DirectionLeftInclusive'});
    });
    mapkey('g-009', {
        short: "Detach descendant tabs recursively",
        unique_id: "cmd_tab_detach_magic_children_recursive",
        feature_group: 3,
        category: "tabs",
        description: "Move all descendant tabs opened from the current tab into a new window",
        tags: ["tabs", "detach", "magic", "window"]
    }, function() {
        RUNTIME("moveToWindowMagic", {magic: 'ChildrenTabsRecursively'});
    });
    mapkey('g-010', {
        short: "Detach all tabs in other windows",
        unique_id: "cmd_tab_detach_magic_other_windows",
        feature_group: 3,
        category: "tabs",
        description: "Move all tabs in windows other than the current window into a new window",
        tags: ["tabs", "detach", "magic", "window"]
    }, function() {
        RUNTIME("moveToWindowMagic", {magic: 'AllOtherWindowsTabs'});
    });
    mapkey('g-011', {
        short: "Detach other windows without pinned tabs",
        unique_id: "cmd_tab_detach_magic_other_windows_no_pinned",
        feature_group: 3,
        category: "tabs",
        description: "Move tabs in other windows that contain no pinned tabs into a new window",
        tags: ["tabs", "detach", "magic", "window"]
    }, function() {
        RUNTIME("moveToWindowMagic", {magic: 'OtherWindowsNoPinned'});
    });
    mapkey('g-012', {
        short: "Detach all incognito tabs",
        unique_id: "cmd_tab_detach_magic_incognito",
        feature_group: 3,
        category: "tabs",
        description: "Move all tabs across all incognito windows into a new window",
        tags: ["tabs", "detach", "magic", "window"]
    }, function() {
        RUNTIME("moveToWindowMagic", {magic: 'AllIncognitoTabs'});
    });

    // Group D — Copy Tab URLs Magic
    mapkey('gyce', {
        short: "Copy URLs of tabs to the right",
        unique_id: "cmd_tab_copy_urls_magic_right",
        feature_group: 3,
        category: "tabs",
        description: "Copy URLs of 1 tab to the right of current tab to clipboard",
        tags: ["tabs", "copy", "magic"]
    }, function() {
        copyTabUrlsMagic('DirectionRight', cb);
    });
    mapkey('gycc', {
        short: "Copy URLs of all tabs except active",
        unique_id: "cmd_tab_copy_urls_magic_except_active",
        feature_group: 3,
        category: "tabs",
        description: "Copy URLs of all tabs in current window except the active tab to clipboard",
        tags: ["tabs", "copy", "magic"]
    }, function() {
        copyTabUrlsMagic('AllExceptActive', cb);
    });
    mapkey('gyck', {
        short: "Copy URLs of children tabs",
        unique_id: "cmd_tab_copy_urls_magic_children",
        feature_group: 3,
        category: "tabs",
        description: "Copy URLs of tabs opened directly from the current tab to clipboard",
        tags: ["tabs", "copy", "magic"]
    }, function() {
        copyTabUrlsMagic('ChildrenTabs', cb);
    });
    mapkey('g-013', {
        short: "Copy current tab URL",
        unique_id: "cmd_tab_copy_urls_magic_current",
        feature_group: 3,
        category: "tabs",
        description: "Copy the current tab URL to the clipboard",
        tags: ["tabs", "copy", "magic"]
    }, function() {
        copyTabUrlsMagic('CurrentTab', cb);
    });
    mapkey('g-014', {
        short: "Copy URLs of all tabs in current window",
        unique_id: "cmd_tab_copy_urls_magic_all_window",
        feature_group: 3,
        category: "tabs",
        description: "Copy URLs of all tabs in the current window to the clipboard",
        tags: ["tabs", "copy", "magic"]
    }, function() {
        copyTabUrlsMagic('AllInWindow', cb);
    });
    mapkey('g-015', {
        short: "Copy URLs of all tabs except current across all windows",
        unique_id: "cmd_tab_copy_urls_magic_all_windows",
        feature_group: 3,
        category: "tabs",
        description: "Copy URLs of all tabs in all windows except the active tab to the clipboard",
        tags: ["tabs", "copy", "magic"]
    }, function() {
        copyTabUrlsMagic('AllExceptActiveAllWindows', cb);
    });
    mapkey('g-016', {
        short: "Copy URLs of tabs to the left",
        unique_id: "cmd_tab_copy_urls_magic_left",
        feature_group: 3,
        category: "tabs",
        description: "Copy URLs of tabs to the left of the current tab to the clipboard",
        tags: ["tabs", "copy", "magic"]
    }, function() {
        copyTabUrlsMagic('DirectionLeft', cb);
    });
    mapkey('g-017', {
        short: "Copy URLs of current tab and tabs to the left",
        unique_id: "cmd_tab_copy_urls_magic_left_inclusive",
        feature_group: 3,
        category: "tabs",
        description: "Copy URLs of the current tab and tabs to the left to the clipboard",
        tags: ["tabs", "copy", "magic"]
    }, function() {
        copyTabUrlsMagic('DirectionLeftInclusive', cb);
    });
    mapkey('g-018', {
        short: "Copy URLs of current tab and tabs to the right",
        unique_id: "cmd_tab_copy_urls_magic_right_inclusive",
        feature_group: 3,
        category: "tabs",
        description: "Copy URLs of the current tab and tabs to the right to the clipboard",
        tags: ["tabs", "copy", "magic"]
    }, function() {
        copyTabUrlsMagic('DirectionRightInclusive', cb);
    });
    mapkey('g-019', {
        short: "Copy URLs of descendant tabs recursively",
        unique_id: "cmd_tab_copy_urls_magic_children_recursive",
        feature_group: 3,
        category: "tabs",
        description: "Copy URLs of all descendant tabs opened from the current tab to the clipboard",
        tags: ["tabs", "copy", "magic"]
    }, function() {
        copyTabUrlsMagic('ChildrenTabsRecursively', cb);
    });
    mapkey('g-020', {
        short: "Copy URLs of all tabs in other windows",
        unique_id: "cmd_tab_copy_urls_magic_other_windows",
        feature_group: 3,
        category: "tabs",
        description: "Copy URLs of all tabs in windows other than the current window to the clipboard",
        tags: ["tabs", "copy", "magic"]
    }, function() {
        copyTabUrlsMagic('AllOtherWindowsTabs', cb);
    });
    mapkey('g-021', {
        short: "Copy URLs from other windows without pinned tabs",
        unique_id: "cmd_tab_copy_urls_magic_other_windows_no_pinned",
        feature_group: 3,
        category: "tabs",
        description: "Copy URLs of tabs in other windows that contain no pinned tabs to the clipboard",
        tags: ["tabs", "copy", "magic"]
    }, function() {
        copyTabUrlsMagic('OtherWindowsNoPinned', cb);
    });
    mapkey('g-022', {
        short: "Copy URLs of all incognito tabs",
        unique_id: "cmd_tab_copy_urls_magic_incognito",
        feature_group: 3,
        category: "tabs",
        description: "Copy URLs of all incognito tabs across all windows to the clipboard",
        tags: ["tabs", "copy", "magic"]
    }, function() {
        copyTabUrlsMagic('AllIncognitoTabs', cb);
    });

    // Group G — Reload Magic
    mapkey('g-023', {
        short: "Reload tabs to the right",
        unique_id: "cmd_tab_reload_magic_right",
        feature_group: 3,
        category: "tabs",
        description: "Reload all tabs to the right of the current tab",
        tags: ["tabs", "reload", "magic"]
    }, function() {
        RUNTIME("reloadTabMagic", {magic: 'DirectionRight'});
    });
    mapkey('g-024', {
        short: "Reload tabs to the left",
        unique_id: "cmd_tab_reload_magic_left",
        feature_group: 3,
        category: "tabs",
        description: "Reload all tabs to the left of the current tab",
        tags: ["tabs", "reload", "magic"]
    }, function() {
        RUNTIME("reloadTabMagic", {magic: 'DirectionLeft'});
    });
    mapkey('g-025', {
        short: "Reload all except current",
        unique_id: "cmd_tab_reload_magic_except_active",
        feature_group: 3,
        category: "tabs",
        description: "Reload all tabs in current window except the active tab",
        tags: ["tabs", "reload", "magic"]
    }, function() {
        RUNTIME("reloadTabMagic", {magic: 'AllExceptActive'});
    });
    mapkey('g-026', {
        short: "Reload all tabs in window",
        unique_id: "cmd_tab_reload_magic_all_window",
        feature_group: 3,
        category: "tabs",
        description: "Reload all tabs in current window including the active tab",
        tags: ["tabs", "reload", "magic"]
    }, function() {
        RUNTIME("reloadTabMagic", {magic: 'AllInWindow'});
    });
    mapkey('g-027', {
        short: "Reload all tabs in all windows except current",
        unique_id: "cmd_tab_reload_magic_all_windows",
        feature_group: 3,
        category: "tabs",
        description: "Reload all tabs in all windows except the active tab",
        tags: ["tabs", "reload", "magic"]
    }, function() {
        RUNTIME("reloadTabMagic", {magic: 'AllExceptActiveAllWindows'});
    });
    mapkey('g-028', {
        short: "Reload child tabs",
        unique_id: "cmd_tab_reload_magic_children",
        feature_group: 3,
        category: "tabs",
        description: "Reload tabs opened directly from the current tab",
        tags: ["tabs", "reload", "magic"]
    }, function() {
        RUNTIME("reloadTabMagic", {magic: 'ChildrenTabs'});
    });
    mapkey('g-029', {
        short: "Reload current and all to the right",
        unique_id: "cmd_tab_reload_magic_right_inclusive",
        feature_group: 3,
        category: "tabs",
        description: "Reload the current tab and all tabs to its right",
        tags: ["tabs", "reload", "magic"]
    }, function() {
        RUNTIME("reloadTabMagic", {magic: 'DirectionRightInclusive'});
    });
    mapkey('g-030', {
        short: "Reload current and all to the left",
        unique_id: "cmd_tab_reload_magic_left_inclusive",
        feature_group: 3,
        category: "tabs",
        description: "Reload the current tab and all tabs to its left",
        tags: ["tabs", "reload", "magic"]
    }, function() {
        RUNTIME("reloadTabMagic", {magic: 'DirectionLeftInclusive'});
    });
    mapkey('g-031', {
        short: "Reload descendant tabs recursively",
        unique_id: "cmd_tab_reload_magic_children_recursive",
        feature_group: 3,
        category: "tabs",
        description: "Reload all descendant tabs opened from the current tab (recursive)",
        tags: ["tabs", "reload", "magic"]
    }, function() {
        RUNTIME("reloadTabMagic", {magic: 'ChildrenTabsRecursively'});
    });
    mapkey('g-032', {
        short: "Reload all tabs in other windows",
        unique_id: "cmd_tab_reload_magic_other_windows",
        feature_group: 3,
        category: "tabs",
        description: "Reload all tabs in windows other than the current window",
        tags: ["tabs", "reload", "magic"]
    }, function() {
        RUNTIME("reloadTabMagic", {magic: 'AllOtherWindowsTabs'});
    });
    mapkey('g-033', {
        short: "Reload other windows without pinned tabs",
        unique_id: "cmd_tab_reload_magic_other_windows_no_pinned",
        feature_group: 3,
        category: "tabs",
        description: "Reload all tabs in other windows that contain no pinned tabs",
        tags: ["tabs", "reload", "magic"]
    }, function() {
        RUNTIME("reloadTabMagic", {magic: 'OtherWindowsNoPinned'});
    });
    mapkey('g-034', {
        short: "Reload all incognito tabs",
        unique_id: "cmd_tab_reload_magic_incognito",
        feature_group: 3,
        category: "tabs",
        description: "Reload all tabs across all incognito windows",
        tags: ["tabs", "reload", "magic"]
    }, function() {
        RUNTIME("reloadTabMagic", {magic: 'AllIncognitoTabs'});
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
        fr.openOmnibar({type: "Windows"});
    });
    mapkey(';gt', {
        short: "Gather filtered tabs",
        unique_id: "cmd_tab_gather_filtered",
        feature_group: 3,
        category: "tabs",
        description: "Gather selected tabs from other windows into current window",
        tags: ["tabs", "gather", "window"]
    }, function() {
        fr.openOmnibar({type: "Tabs", extra: {
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
}

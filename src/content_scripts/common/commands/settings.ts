import { RUNTIME, runtime } from '../runtime.js';
import KeyboardUtils from '../keyboardUtils.js';
import { getBrowserName, htmlEncode, showPopup, tabOpenLink } from '../utils.js';
import type { CommandAPI } from '../../../../@types/surfingkeys';

export default function registerSettings(
    api: CommandAPI,
    clipboard: unknown,
    _insert: unknown,
    normal: unknown,
    hints: unknown,
    _visual: unknown,
    front: unknown,
    _browser: unknown
): void {
    const { mapkey, readText } = api;

    mapkey(";ql", {
        short: "Show last action",
        unique_id: "cmd_tools_show_last_action",
        feature_group: 0,
        category: "settings",
        description: "Display the last executed keyboard action",
        tags: ["settings", "debug", "history"]
    }, function() {
        showPopup(htmlEncode(runtime.conf.lastKeys.map(function(k: string) {
            return KeyboardUtils.decodeKeystroke(k);
        }).join(' → ')));
    }, {repeatIgnore: true});

    mapkey(".", {
        short: "Repeat last action",
        unique_id: "cmd_tools_repeat_action",
        feature_group: 0,
        category: "settings",
        description: "Repeat the last executed keyboard action",
        tags: ["settings", "repeat", "action"]
    }, function() {
        // lastKeys in format: <keys in normal mode>[,(<mode name>\t<keys in this mode>)*], examples
        // ['se']
        // ['f', 'Hints\tBA']
        const lastKeys = runtime.conf.lastKeys;
        (normal as any).feedkeys(lastKeys[0]);
        var modeKeys = lastKeys.slice(1);
        for (var i = 0; i < modeKeys.length; i++) {
            var modeKey = modeKeys[i].split('\t');
            if (modeKey[0] === 'Hints') {
                function closureWrapper() {
                    var hintKeys = modeKey[1];
                    return function() {
                        (hints as any).feedkeys(hintKeys);
                    };
                }
                setTimeout(closureWrapper(), 120 + i*100);
            }
        }
    }, {repeatIgnore: true});

    mapkey(';e', {
        short: "Edit settings",
        unique_id: "cmd_tools_edit_settings",
        feature_group: 11,
        category: "settings",
        description: "Open SurfingKeys settings page for configuration",
        tags: ["settings", "edit", "configuration"]
    }, function() {
        tabOpenLink("/pages/options.html");
    });
    mapkey(';u', {
        short: "Edit URL and open",
        unique_id: "cmd_tools_edit_url_new_tab",
        feature_group: 4,
        category: "settings",
        description: "Edit current URL in vim editor and open result in new tab",
        tags: ["settings", "vim", "url"]
    }, function() {
        (front as any).showEditor(window.location.href, function(data: string) {
            tabOpenLink(data);
        }, 'url');
    });
    mapkey(';U', {
        short: "Edit URL and reload",
        unique_id: "cmd_tools_edit_url_reload",
        feature_group: 4,
        category: "settings",
        description: "Edit current URL in vim editor and reload to result",
        tags: ["settings", "vim", "url"]
    }, function() {
        (front as any).showEditor(window.location.href, function(data: string) {
            window.location.href = data;
        }, 'url');
    });

    if (getBrowserName() === "Chrome") {
        mapkey(';nu', {
            short: "Edit URL in neovim",
            unique_id: "cmd_tools_edit_url_neovim",
            feature_group: 4,
            category: "settings",
            description: "Edit current URL in neovim and open result in new tab",
            tags: ["settings", "neovim", "url"]
        }, function() {
            (front as any).showEditor(window.location.href, function(data: string) {
                tabOpenLink(data);
            }, 'url', true);
        });
        mapkey(';ns', {
            short: "View page source in neovim",
            unique_id: "cmd_tools_source_neovim",
            feature_group: 11,
            category: "settings",
            description: "Open current page HTML source in a neovim scratch buffer",
            tags: ["settings", "neovim", "source", "html"]
        }, function() {
            const source = document.documentElement.outerHTML;
            (front as any).showEditor(source, null, 'html', true);
        });

        mapkey('gr', {
            short: "Read text from clipboard",
            unique_id: "cmd_tools_read_text",
            feature_group: 14,
            category: "settings",
            description: "Read selected text or clipboard content aloud using TTS",
            tags: ["settings", "tts", "accessibility"]
        }, function() {
            (clipboard as any).read(function(response: any) {
                readText(window.getSelection()?.toString() || response.data, {verbose: true} as any);
            });
        });

        mapkey(';v', {
            short: "Open neovim",
            unique_id: "cmd_tools_neovim",
            feature_group: 11,
            category: "settings",
            description: "Open neovim editor in a new tab",
            tags: ["settings", "neovim", "editor"]
        }, function() {
            tabOpenLink("/pages/neovim.html");
        });
    }

    mapkey(';cq', {
        short: "Clear queue URLs",
        unique_id: "cmd_tools_clear_queue",
        feature_group: 7,
        category: "settings",
        description: "Clear all URLs queued for opening",
        tags: ["settings", "queue", "clear"]
    }, function() {
        RUNTIME('clearQueueURLs');
    });

    if (!getBrowserName().startsWith("Safari")) {
    mapkey(';pm', {
        short: "Preview markdown",
        unique_id: "cmd_tools_preview_markdown",
        feature_group: 11,
        category: "settings",
        description: "Open markdown preview page",
        tags: ["settings", "markdown", "preview"]
    }, function() {
        tabOpenLink("/pages/markdown.html");
    });

    mapkey(';dh', {
        short: "Delete old history",
        unique_id: "cmd_tools_delete_history",
        feature_group: 14,
        category: "settings",
        description: "Delete browser history entries older than 30 days",
        tags: ["settings", "history", "delete"]
    }, function() {
        RUNTIME('deleteHistoryOlderThan', {
            days: 30
        });
    });
    mapkey(';yh', {
        short: "Yank histories",
        unique_id: "cmd_tools_yank_history",
        feature_group: 14,
        category: "settings",
        description: "Copy all browser history URLs to clipboard",
        tags: ["settings", "history", "yank"]
    }, function() {
        RUNTIME('getHistory', {}, function(response: any) {
            (clipboard as any).write(response.history.map((h: any) => h.url).join("\n"));
        });
    });

    mapkey(';db', {
        short: "Remove bookmark",
        unique_id: "cmd_tools_remove_bookmark",
        feature_group: 14,
        category: "settings",
        description: "Remove bookmark for current page if it exists",
        tags: ["settings", "bookmarks", "delete"]
    }, function() {
        RUNTIME('removeBookmark');
    });

    mapkey('g-006', {
        short: "Toggle bookmark in folder",
        unique_id: "cmd_bookmark_toggle_folder",
        feature_group: 14,
        category: "settings",
        description: "Toggle current page in bookmark folder (next key selects folder from bookmarkFolders config)",
        tags: ["settings", "bookmarks", "toggle"]
    }, function(key: string) {
        const folder = runtime.conf.bookmarkFolders?.[key];
        if (folder) RUNTIME('bookmarkToggleFolder', { folder });
    });
    mapkey('g-007', {
        short: "Empty bookmark folder",
        unique_id: "cmd_bookmark_empty_folder",
        feature_group: 14,
        category: "settings",
        description: "Remove all bookmarks from folder (next key selects folder from bookmarkFolders config)",
        tags: ["settings", "bookmarks", "empty"]
    }, function(key: string) {
        const folder = runtime.conf.bookmarkFolders?.[key];
        if (folder) RUNTIME('bookmarkEmptyFolder', { folder });
    });

    mapkey('g-008', {
        short: "Lookup URL in bookmark folders",
        unique_id: "cmd_bookmark_lookup_url",
        feature_group: 14,
        category: "settings",
        description: "Show which bookmark folders contain the current URL",
        tags: ["settings", "bookmarks", "lookup"]
    }, function() {
        RUNTIME('bookmarkLookupCurrentURL', {}, function(r: any) {
            showPopup(r.msg);
        });
    });

    mapkey('g-009', {
        short: "Copy bookmark folder URLs (reversed)",
        unique_id: "cmd_bookmark_copy_folder_reversed",
        feature_group: 14,
        category: "settings",
        description: "Copy all URLs from bookmark folder to clipboard in reverse order (next key selects folder)",
        tags: ["settings", "bookmarks", "copy"]
    }, function(this: any, key: string) {
        const folder = runtime.conf.bookmarkFolders?.[key];
        const r = parseInt(this.repeats) || 1;
        if (folder) RUNTIME('bookmarkCopyFolder', { folder, reverse: true, repeats: r > 1 ? r : -1 });
    });

    mapkey('g-010', {
        short: "Copy bookmark folder URLs (ordered)",
        unique_id: "cmd_bookmark_copy_folder_ordered",
        feature_group: 14,
        category: "settings",
        description: "Copy all URLs from bookmark folder to clipboard in order (next key selects folder)",
        tags: ["settings", "bookmarks", "copy"]
    }, function(this: any, key: string) {
        const folder = runtime.conf.bookmarkFolders?.[key];
        const r = parseInt(this.repeats) || 1;
        if (folder) RUNTIME('bookmarkCopyFolder', { folder, reverse: false, repeats: r > 1 ? r : -1 });
    });

    mapkey('g-011', {
        short: "Add tab(s) to bookmark folder (magic)",
        unique_id: "cmd_bookmark_add_m",
        feature_group: 14,
        category: "settings",
        description: "Bookmark tab(s) in folder: next key = folder (bookmarkFolders), then key = magic direction (magicKeys)",
        tags: ["settings", "bookmarks", "add", "magic"]
    }, function(this: any, folderKey: string) {
        const folder = runtime.conf.bookmarkFolders?.[folderKey];
        if (!folder) return;
        this.pendingMap = function(magicKey: string) {
            const magic = (runtime.conf.magicKeys as Record<string, string>)?.[magicKey] ?? 'CurrentTab';
            RUNTIME('bookmarkAddM', { folder, magic, repeats: 1 });
        };
    });

    mapkey('g-012', {
        short: "Remove tab(s) from bookmark folder (magic)",
        unique_id: "cmd_bookmark_remove_m",
        feature_group: 14,
        category: "settings",
        description: "Remove tab(s) from bookmark folder: next key = folder (bookmarkFolders), then key = magic direction (magicKeys)",
        tags: ["settings", "bookmarks", "remove", "magic"]
    }, function(this: any, folderKey: string) {
        const folder = runtime.conf.bookmarkFolders?.[folderKey];
        if (!folder) return;
        this.pendingMap = function(magicKey: string) {
            const magic = (runtime.conf.magicKeys as Record<string, string>)?.[magicKey] ?? 'CurrentTab';
            RUNTIME('bookmarkRemoveM', { folder, magic, repeats: 1 });
        };
    });

    mapkey('g-013', {
        short: "Cut bookmark folder URLs (reversed)",
        unique_id: "cmd_bookmark_cut_folder_reversed",
        feature_group: 14,
        category: "settings",
        description: "Copy then remove URLs from bookmark folder in reverse order (next key selects folder)",
        tags: ["settings", "bookmarks", "cut"]
    }, function(this: any, key: string) {
        const folder = runtime.conf.bookmarkFolders?.[key];
        if (folder) RUNTIME('bookmarkCutFromFolder', { folder, reverse: true, repeats: parseInt(this.repeats) || 1 });
    });

    mapkey('g-014', {
        short: "Cut bookmark folder URLs (ordered)",
        unique_id: "cmd_bookmark_cut_folder_ordered",
        feature_group: 14,
        category: "settings",
        description: "Copy then remove URLs from bookmark folder in order (next key selects folder)",
        tags: ["settings", "bookmarks", "cut"]
    }, function(this: any, key: string) {
        const folder = runtime.conf.bookmarkFolders?.[key];
        if (folder) RUNTIME('bookmarkCutFromFolder', { folder, reverse: false, repeats: parseInt(this.repeats) || 1 });
    });

    } // end !Safari guard

}


// All g-NNN placeholder keys. TypeScript errors (TS1117) on duplicate keys.
// To add a new key: append the next sequential entry here first, then use
// `"g-NNN" satisfies GKey` at every mapkey/mappings.add call site.
export const G_KEYS = {
    "g-001": "cmd_tab_detach",
    "g-002": "cmd_tab_next",
    "g-003": "cmd_tab_goto_index",
    "g-004": "cmd_nav_new_window",
    "g-005": "cmd_nav_new_incognito_window",
    "g-006": "cmd_bookmark_toggle_folder",
    "g-007": "cmd_bookmark_empty_folder",
    "g-008": "cmd_bookmark_lookup_url",
    "g-009": "cmd_bookmark_copy_folder_reversed",
    "g-010": "cmd_bookmark_copy_folder_ordered",
    "g-011": "cmd_bookmark_add_m",
    "g-012": "cmd_bookmark_remove_m",
    "g-013": "cmd_bookmark_cut_folder_reversed",
    "g-014": "cmd_bookmark_cut_folder_ordered",
    "g-015": "cmd_nav_clipboard_navigate",
    "g-016": "cmd_bookmark_save_youtube_position",
    "g-017": "cmd_bookmark_youtube_playlist",
    "g-018": "cmd_page_linkify",
    "g-019": "cmd_show_help",
    "g-020": "cmd_inspect_element",
    "g-021": "cmd_hints_open_incognito",
    "g-022": "cmd_tab_print_m",
} as const;

export type GKey = keyof typeof G_KEYS;

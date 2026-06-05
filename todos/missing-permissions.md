# Missing Chrome Extension Permissions — JTBD Command Descriptions

> Each entry: unique_id, Surfingkeys description (matching the `short` field for existing commands), and a Jobs-to-Be-Done story.
> Permissions marked **"used but not declared"** are actively called in the codebase — these entries document the "why" behind already-working features.


## webRequest / webRequestBlocking

> Not declared. Not yet used. Enables observing and modifying network requests.

- [ ] `cmd_network_toggle_block` — Toggle blocking all requests for the current tab's domain — **When** I visit a site that abuses tracking or ads, **I want** to instantly block all further requests from that domain **so that** I stop sending data to servers I don't trust without leaving the page.
- [ ] `cmd_network_block_type` — Block specific resource types (images, scripts, fonts) on current site — **When** a page is heavy or distracting due to certain resource types (e.g. images on a slow connection), **I want** to selectively block that resource type for just this domain **so that** the page loads faster or becomes less cluttered.
- [ ] `cmd_network_show_blocked` — Show an overlay listing requests blocked on the current page — **When** I have blocking rules active and a page looks broken, **I want** to see which requests were blocked **so that** I can diagnose and whitelist the specific resource causing the breakage.
- [ ] `cmd_network_clear_rules` — Clear all active network rules — **When** I've accumulated ad-hoc blocks and redirects that I no longer need, **I want** to reset all network rules at once **so that** I get a clean slate without manually removing each rule.
- [ ] `cmd_network_redirect` — Redirect the current domain to a different domain — **When** I land on a site that has a privacy-respecting or lighter-weight alternative (e.g. twitter.com → nitter.net), **I want** to set a redirect rule from the keyboard **so that** all future visits to this domain go to the alternative automatically.
- [ ] `cmd_network_redirect_hint` — Hint a link to set as the redirect target for its domain — **When** I see a link to an alternative frontend or mirror on a page, **I want** to hint that link and set a redirect rule in one step **so that** I don't have to manually type the destination URL.
- [ ] `cmd_network_toggle_referer` — Toggle stripping the Referer header on the current site — **When** I navigate from one site to another, **I want** to control whether the destination sees where I came from **so that** I can limit cross-site tracking on a per-domain basis.
- [ ] `cmd_network_spoof_ua` — Set a custom User-Agent for the current domain — **When** a site serves a degraded experience or blocks my browser, **I want** to present a different User-Agent string for just this domain **so that** the site works without changing my global UA.
- [ ] `cmd_network_strip_tracking` — Toggle automatic stripping of tracking query params (utm_*, fbclid, gclid) — **When** I click links that carry tracking identifiers in the URL, **I want** those parameters to be stripped before the request is sent **so that** my browsing isn't tagged with campaign metadata.
- [ ] `cmd_network_yank_urls` — Yank all request URLs from the current page into clipboard — **When** I need to extract all resource URLs loaded by a page (images, scripts, APIs), **I want** to copy them to clipboard in one keystroke **so that** I can inspect or reuse them in another tool.
- [ ] `cmd_network_inspect` — Log all outgoing requests from the current tab to the console — **When** I'm debugging a page or curious about what it loads, **I want** to tail all network requests in the console with a single command **so that** I don't have to open DevTools and the Network tab.


## tabGroups

> Used but not declared. All commands are live in `src/content_scripts/common/commands/tabs.ts` and `src/content_scripts/ui/command.ts`.

- [ ] `cmd_tab_group` — Group this tab — **When** I have a cluster of related tabs open, **I want** to group the current tab into a named group **so that** my tab strip stays organized and I can collapse/hide the group later.
- [ ] `cmd_tab_group_collapse` — Collapse current tab's group — **When** a tab group is open and taking up space in the tab strip, **I want** to collapse just that group from the keyboard **so that** I reclaim horizontal tab space without reaching for the mouse.
- [ ] `cmd_tab_group_collapse_all` — Collapse all tab groups — **When** I have many expanded tab groups cluttering the strip, **I want** to collapse all of them with one keystroke **so that** I can see only the group headers and navigate by category.
- [ ] `cmd_tab_group_expand_all` — Expand all tab groups — **When** I need to see every open tab across all groups, **I want** to expand every group at once **so that** I can visually scan all tabs without clicking each group header.
- [ ] `cmd_tab_group_new_magic` — Create new tab group (magic) — **When** I want to group a batch of neighboring tabs by direction, **I want** to use a magic key to select the range and group them **so that** I don't have to select tabs one by one.
- [ ] `cmd_tab_group_edit_name` — Rename current tab group — **When** a group's auto-generated name doesn't describe its purpose, **I want** to rename it from the keyboard **so that** the label reflects what the tabs actually contain.
- [ ] `cmd_rename_tab_group` — Rename current tab group — **When** I'm in command mode and want to change a group's title, **I want** to type `:renameTabGroup new name` **so that** I can rename without taking my hands off the keyboard.
- [ ] `cmd_create_tab_group` — Group tabs by domain — **When** I have tabs from multiple domains scattered across my window, **I want** to auto-group them by domain in one command **so that** all github tabs, all gmail tabs, etc. are clustered without manual sorting.


## tts (Text-to-Speech)

> Used but not declared. Commands live in `src/content_scripts/ui/command.ts`.

- [ ] `cmd_list_voices` — List text-to-speech voices — **When** I want to use TTS but am not sure which voices are installed, **I want** to list all available voices with their language and gender **so that** I can pick the right voice before reading.
- [ ] `cmd_test_voices` — Test TTS voices — **When** I'm configuring TTS and want to hear samples, **I want** to test each voice with a short utterance **so that** I can choose by sound rather than by name alone.
- [ ] `cmd_stop_reading` — Stop text-to-speech reading — **When** TTS is reading a long page and I've heard enough, **I want** to stop it immediately from the keyboard **so that** I don't have to find and click a stop button.
- [ ] `cmd_tts_read_selection` — Read selected text aloud — **When** I encounter a dense paragraph or foreign-language text I want to hear pronounced, **I want** to select it and trigger TTS reading **so that** I can listen without the full-page read-aloud feature.


## debugger

> Used but not declared (DevTools panel eval relay in `src/pages/devtools-panel.ts`). Currently infrastructure-only — these would be new keyboard commands.

- [ ] `cmd_debug_eval_bg` — Evaluate JS in the extension service worker — **When** I'm debugging my Surfingkeys config or the extension itself, **I want** to run arbitrary JS in the background context from a keyboard command **so that** I can inspect state without opening DevTools and the Surfingkeys panel.
- [ ] `cmd_debug_eval_page` — Evaluate JS in the inspected page — **When** I need to run a one-liner against the current page, **I want** to type an expression and have it evaluated in-page **so that** I don't have to switch to the console tab.


## proxy

> Partially declared (code calls `chrome.proxy.settings` in `src/background/chrome.ts`, but `proxy` permission is not in the manifest). Commands live in `src/content_scripts/ui/command.ts` and `src/content_scripts/common/commands/proxy.ts`.

- [ ] `cmd_set_proxy` — Configure HTTP proxy settings — **When** I need to route my traffic through a specific proxy, **I want** to configure the proxy URL and port from a command **so that** I can switch networks without digging into Chrome settings.
- [ ] `cmd_set_proxy_mode` — Set proxy mode — **When** I need to change how the proxy applies (system/direct/byhost/always/clear), **I want** to set the mode from a command **so that** I can switch between proxied and direct browsing in one keystroke.
- [ ] `cmd_proxy_toggle_site` — Toggle proxy for site — **When** a specific site needs to bypass (or use) the proxy, **I want** to toggle the current site in the proxy host list **so that** I can make per-domain exceptions without editing config.
- [ ] `cmd_proxy_copy_info` — Copy proxy info — **When** I need to check or share my current proxy configuration, **I want** to copy the proxy settings to clipboard **so that** I can paste them into a terminal or share with a colleague.
- [ ] `cmd_proxy_mode_always` — Set proxy mode always — **When** I want all traffic to go through the proxy regardless of host rules, **I want** to set the mode to "always" with one key **so that** I don't type the full `:setProxyMode` command.
- [ ] `cmd_proxy_mode_byhost` — Set proxy mode byhost — **When** I want the proxy to apply only to hosts in the autoproxy list, **I want** to switch to byhost mode instantly **so that** my configured rules take effect.
- [ ] `cmd_proxy_mode_direct` — Set proxy mode direct — **When** I need to bypass the proxy entirely, **I want** to switch to direct mode with one key **so that** all connections go straight to the internet without proxy overhead.
- [ ] `cmd_proxy_mode_system` — Set proxy mode system — **When** I want to defer to the OS-level proxy settings, **I want** to switch to system mode **so that** Surfingkeys stops overriding my system proxy configuration.
- [ ] `cmd_proxy_mode_clear` — Set proxy mode clear — **When** I want to remove all proxy configuration and browse directly, **I want** to clear the proxy settings entirely **so that** no residual rules interfere with my connection.


## contextMenus

> Not declared. Not yet used. Enables custom right-click context menu items.

- [ ] `cmd_context_open_sk_menu` — Open Surfingkeys actions in right-click menu — **When** I right-click on a page and want quick access to Surfingkeys commands, **I want** to see a custom context menu with my most-used actions **so that** I can trigger them with the mouse when my hands are off the keyboard.
- [ ] `cmd_context_search_selection` — Search selected text via context menu — **When** I've selected text with the mouse, **I want** to right-click and search that text with my configured search engine **so that** I can look things up without copying, opening a new tab, and pasting.
- [ ] `cmd_context_yank_link` — Yank link URL via context menu — **When** I right-click a link, **I want** a "Copy link URL" menu item that yanks it to Surfingkeys clipboard **so that** I can paste it later with a keyboard command.
- [ ] `cmd_context_inspect` — Inspect element via context menu — **When** I right-click an element, **I want** a context menu entry to open Chrome DevTools on that element **so that** I can inspect it without using the built-in "Inspect" button buried in Chrome's menu.


## notifications

> Not declared. Not yet used. Enables system-level notification popups.

- [ ] `cmd_notify_show` — Show a system notification with custom message — **When** I want to set a quick reminder or display a note to myself, **I want** to trigger a system notification with arbitrary text from the keyboard **so that** it appears even if I switch away from the browser.
- [ ] `cmd_notify_download_complete` — Notify when download completes — **When** I start a large download and switch tabs to keep working, **I want** a system notification when the download finishes **so that** I know it's ready without polling the downloads bar.
- [ ] `cmd_notify_alarm` — Notify when a timer fires — **When** I set a timer via Surfingkeys, **I want** a system notification to pop up when the timer expires **so that** I don't miss the alert if Chrome is in the background.


## alarms

> Not declared. Not yet used. Enables scheduled and recurring background tasks.

- [ ] `cmd_alarm_create` — Create a one-shot or periodic timer — **When** I need a countdown (e.g. "remind me to check the deploy in 10 minutes"), **I want** to create an alarm from a keyboard command **so that** I stay on task without switching to a separate timer app.
- [ ] `cmd_alarm_list` — List all active alarms — **When** I've created several alarms and can't remember what's pending, **I want** to list them all **so that** I can see what's scheduled and decide if I still need each one.
- [ ] `cmd_alarm_cancel` — Cancel an alarm — **When** a task I set a reminder for is already done, **I want** to cancel the alarm **so that** I don't get a stale notification for something that no longer matters.
- [ ] `cmd_alarm_auto_session` — Auto-save session on a periodic alarm — **When** I'm deep in a browsing session and might crash or close the browser unexpectedly, **I want** Surfingkeys to auto-save my session every N minutes **so that** I can restore my tabs even if I didn't manually save.


## browsingData

> Not declared. Not yet used. Enables clearing browser cache, cookies, history, and other data.

- [ ] `cmd_privacy_clear_cache` — Clear browser cache for a time range — **When** a site shows stale content or behaves oddly, **I want** to clear the cache from the keyboard **so that** I get a fresh load without opening Chrome's settings.
- [ ] `cmd_privacy_clear_cookies` — Clear cookies for a time range — **When** I want to reset my logged-in state or clear tracking cookies, **I want** to wipe cookies from the keyboard **so that** I can start a clean session without navigating settings dialogs.
- [ ] `cmd_privacy_clear_history` — Clear browsing history for a time range — **When** I want to remove traces of recent browsing, **I want** to clear history for a chosen time range in one command **so that** my omnibox suggestions and history are scrubbed.
- [ ] `cmd_privacy_clear_all` — Clear all browsing data — **When** I want a full wipe (cache + cookies + history + downloads + form data), **I want** one command to clear everything **so that** I don't have to check individual checkboxes in Chrome's dialog.


## privacy

> Not declared. Not yet used. Enables toggling Chrome privacy settings (DNT, network prediction, hyperlink auditing).

Enables toggling Chrome privacy settings via `chrome.privacy.*` API.

- [ ] `cmd_privacy_toggle_dnt` — Toggle "Do Not Track" request header — **When** I want to signal to websites that I prefer not to be tracked, **I want** to toggle the DNT header on or off from the keyboard **so that** I can change my preference without digging through Chrome's advanced settings.
- [ ] `cmd_privacy_toggle_prediction` — Toggle network prediction and pre-rendering — **When** I'm on a metered connection or want to minimize bandwidth usage, **I want** to toggle Chrome's speculative preloading **so that** pages I might visit aren't fetched in the background.
- [ ] `cmd_privacy_toggle_hyperlink` — Toggle hyperlink auditing — **When** I click links, **I want** to disable the `ping` attribute that sends click-tracking pings **so that** sites can't silently report which links I followed.


## search

> Not declared. Not yet used. Enables omnibox keyword integration (`chrome.omnibox`).

- [ ] `cmd_search_omnibox_keyword` — Set omnibox keyword for current site — **When** I frequently search a specific site (e.g. Wikipedia, GitHub), **I want** to register an omnibox keyword so that I can type `gh surfkeys` in the address bar **so that** I search the site without visiting it first.
- [ ] `cmd_search_register_engine` — Register a custom search engine from the current page — **When** a site provides an OpenSearch descriptor, **I want** to register it as a search engine from the keyboard **so that** I can use `Tab`-to-search for that site in the omnibox.
- [ ] `cmd_search_open_keyword` — Open search with specified keyword — **When** I have keywords configured, **I want** to pick a keyword from a list and type a query **so that** I can search any engine without using the mouse or the address bar.


## fontSettings

> Not declared. Not yet used. Enables per-script font family and size configuration via `chrome.fontSettings`.

- [ ] `cmd_font_list` — List configurable font settings — **When** I want to see what fonts Chrome is currently using for serif/sans-serif/fixed-width, **I want** to list the current font configuration **so that** I know what to change before making adjustments.
- [ ] `cmd_font_set_size` — Set minimum font size for current domain — **When** a site uses tiny text that strains my eyes, **I want** to bump the minimum font size per-domain from the keyboard **so that** the text is readable without zooming the whole page.
- [ ] `cmd_font_set_family` — Set default font family for a script — **When** I prefer a specific font for readability (e.g. a coding font for monospace or a serif for reading), **I want** to switch the default font family from a command **so that** all sites use my preferred typeface.
- [ ] `cmd_font_reset_site` — Reset font settings for current site — **When** I've adjusted fonts for a site and the layout breaks, **I want** to reset to the defaults for just that domain **so that** I can undo my changes without affecting other sites.


## idle

> Not declared. Not yet used. Enables detecting when the user is away via `chrome.idle`.

- [ ] `cmd_idle_show` — Show current idle detection state — **When** I'm setting up idle-based automation and want to verify detection works, **I want** to query the current idle state **so that** I can confirm the threshold and state before relying on it.
- [ ] `cmd_idle_auto_pause` — Auto-pause media when idle — **When** I'm watching a video and get called away from my desk, **I want** media to auto-pause after I've been idle for N minutes **so that** I don't miss content while I'm away.
- [ ] `cmd_idle_auto_lock` — Lock sensitive commands when idle — **When** I step away from my desk, **I want** sensitive Surfingkeys commands (like clearing history or deleting bookmarks) to require re-confirmation after I return **so that** someone walking by can't trigger destructive actions.

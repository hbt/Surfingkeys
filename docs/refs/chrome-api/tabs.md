# chrome.tabs

**Source:** https://developer.chrome.com/docs/extensions/reference/api/tabs

---

Description
-----------

Use the `chrome.tabs` API to interact with the browser's tab system. You can use this API to create, modify, and rearrange tabs in the browser.

The Tabs API not only offers features for manipulating and managing tabs, but can also detect the [language](#method-detectLanguage) of the tab, take a [screenshot](#method-captureVisibleTab), and [communicate](#method-sendMessage) with a tab's content scripts.

Permissions
-----------

Most features don't require any permissions to use. For example: [creating](#method-create) a new tab, [reloading](#method-reload) a tab, [navigating](#method-update) to another URL, etc.

There are three permissions developers should be aware of when working with the Tabs API.

The "tabs" permission

This permission does not give access to the `chrome.tabs` namespace. Instead, it grants an extension the ability to call [`tabs.query()`](#method-query) against four sensitive properties on [`tabs.Tab`](#type-Tab) instances: `url`, `pendingUrl`, `title`, and `favIconUrl`.

{
      "name": "My extension",
      ...
      "permissions": [
        "tabs"
      ],
      ...
    }

Host permissions

[Host permissions](/docs/extensions/develop/concepts/declare-permissions) allow an extension to read and query a matching tab's four sensitive `tabs.Tab` properties. They can also interact directly with the matching tabs using methods such as [`tabs.captureVisibleTab()`](#method-captureVisibleTab), [`scripting.executeScript()`](/docs/extensions/reference/api/scripting#method-executeScript), [`scripting.insertCSS()`](/docs/extensions/reference/api/scripting#method-insertCSS), and [`scripting.removeCSS()`](/docs/extensions/reference/api/scripting#method-removeCSS).

{
      "name": "My extension",
      ...
      "host_permissions": [
        "http://*/*",
        "https://*/*"
      ],
      ...
    }

The "activeTab" permission

[`activeTab`](/docs/extensions/develop/concepts/activeTab) grants an extension temporary host permission for the current tab in response to a user invocation. Unlike host permissions, `activeTab` does not trigger any warnings.

{
      "name": "My extension",
      ...
      "permissions": [
        "activeTab"
      ],
      ...
    }

Use cases
---------

The following sections demonstrate some common use cases.

### Open an extension page in a new tab

A common pattern for extensions is to open an onboarding page in a new tab when the extension is installed. The following example shows how to do this.

background.js:

chrome.runtime.onInstalled.addListener(({reason}) => {
      if (reason === 'install') {
        chrome.tabs.create({
          url: "onboarding.html"
        });
      }
    });

**Note:** This example doesn't require any [permissions](#perms).

### Get the current tab

This example demonstrates how an extension's service worker can retrieve the active tab from the currently-focused window (or most recently-focused window, if no Chrome windows are focused). This can usually be thought of as the user's current tab.

  async function getCurrentTab() {
        let queryOptions = { active: true, lastFocusedWindow: true };
        // `tab` will either be a `tabs.Tab` instance or `undefined`.
        let [tab] = await chrome.tabs.query(queryOptions);
        return tab;
      }

  function getCurrentTab(callback) {
        let queryOptions = { active: true, lastFocusedWindow: true };
        chrome.tabs.query(queryOptions, ([tab]) => {
          if (chrome.runtime.lastError)
          console.error(chrome.runtime.lastError);
          // `tab` will either be a `tabs.Tab` instance or `undefined`.
          callback(tab);
        });
      }

### Mute the specified tab

This example shows how an extension can toggle the muted state for a given tab.

  async function toggleMuteState(tabId) {
        const tab = await chrome.tabs.get(tabId);
        const muted = !tab.mutedInfo.muted;
        await chrome.tabs.update(tabId, {muted});
        console.log(`Tab ${tab.id} is ${muted ? "muted" : "unmuted"}`);
      }

  function toggleMuteState(tabId) {
        chrome.tabs.get(tabId, async (tab) => {
          let muted = !tab.mutedInfo.muted;
          await chrome.tabs.update(tabId, { muted });
          console.log(`Tab ${tab.id} is ${ muted ? "muted" : "unmuted" }`);
        });
      }

### Move the current tab to the first position when clicked

This example shows how to move a tab while a drag may or may not be in progress. While this example uses `chrome.tabs.move`, you can use the same waiting pattern for other calls that modify tabs while a drag is in progress.

  chrome.tabs.onActivated.addListener(moveToFirstPosition);
    
      async function moveToFirstPosition(activeInfo) {
        try {
          await chrome.tabs.move(activeInfo.tabId, {index: 0});
          console.log("Success.");
        } catch (error) {
          if (error == "Error: Tabs cannot be edited right now (user may be dragging a tab).") {
            setTimeout(() => moveToFirstPosition(activeInfo), 50);
          } else {
            console.error(error);
          }
        }
      }

**Important:** Using catch(error) in a Promise is a way to ensure that an error that otherwise populates \`chrome.runtime.lastError\` is not unchecked.

  chrome.tabs.onActivated.addListener(moveToFirstPositionMV2);
    
      function moveToFirstPositionMV2(activeInfo) {
        chrome.tabs.move(activeInfo.tabId, { index: 0 }, () => {
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError;
            if (error == "Error: Tabs cannot be edited right now (user may be dragging a tab).") {
              setTimeout(() => moveToFirstPositionMV2(activeInfo), 50);
            } else {
              console.error(error);
            }
          } else {
            console.log("Success.");
          }
        });
      }

### Pass a message to a selected tab's content script

This example demonstrates how an extension's service worker can communicate with content scripts in specific browser tabs using `tabs.sendMessage()`.

function sendMessageToActiveTab(message) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, message);
      // TODO: Do something with the response.
    }

Extension examples
------------------

For more Tabs API extensions demos, explore any of the following:

*   [Manifest V2 - Tabs API extensions](https://github.com/GoogleChrome/chrome-extensions-samples/tree/master/_archive/mv2/api/tabs/).
*   [Manifest V3 - Tabs Manager](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/tutorial.tabs-manager).

Types
-----

### MutedInfo

Chrome 46+

The tab's muted state and the reason for the last state change.

#### Properties

*   extensionId
    
    string optional
    
    The ID of the extension that changed the muted state. Not set if an extension was not the reason the muted state last changed.
    
*   muted
    
    boolean
    
    Whether the tab is muted (prevented from playing sound). The tab may be muted even if it has not played or is not currently playing sound. Equivalent to whether the 'muted' audio indicator is showing.
    
*   reason
    
    [MutedInfoReason](#type-MutedInfoReason) optional
    
    The reason the tab was muted or unmuted. Not set if the tab's mute state has never been changed.
    

### MutedInfoReason

Chrome 46+

An event that caused a muted state change.

#### Enum

"user"  
A user input action set the muted state.

"capture"  
Tab capture was started, forcing a muted state change.

"extension"  
An extension, identified by the extensionId field, set the muted state.

### Tab

#### Properties

*   active
    
    boolean
    
    Whether the tab is active in its window. Does not necessarily mean the window is focused.
    
*   audible
    
    boolean optional
    
    Chrome 45+
    
    Whether the tab has produced sound over the past couple of seconds (but it might not be heard if also muted). Equivalent to whether the 'speaker audio' indicator is showing.
    
*   autoDiscardable
    
    boolean
    
    Chrome 54+
    
    Whether the tab can be discarded automatically by the browser when resources are low.
    
*   discarded
    
    boolean
    
    Chrome 54+
    
    Whether the tab is discarded. A discarded tab is one whose content has been unloaded from memory, but is still visible in the tab strip. Its content is reloaded the next time it is activated.
    
*   favIconUrl
    
    string optional
    
    The URL of the tab's favicon. This property is only present if the extension has the `"tabs"` permission or has host permissions for the page. It may also be an empty string if the tab is loading.
    
*   frozen
    
    boolean
    
    Chrome 132+
    
    Whether the tab is frozen. A frozen tab cannot execute tasks, including event handlers or timers. It is visible in the tab strip and its content is loaded in memory. It is unfrozen on activation.
    
*   groupId
    
    number
    
    Chrome 88+
    
    The ID of the group that the tab belongs to.
    
*   height
    
    number optional
    
    The height of the tab in pixels.
    
*   highlighted
    
    boolean
    
    Whether the tab is highlighted.
    
*   id
    
    number optional
    
    The ID of the tab. Tab IDs are unique within a browser session. Under some circumstances a tab may not be assigned an ID; for example, when querying foreign tabs using the [`sessions`](https://developer.chrome.com/docs/extensions/reference/sessions/) API, in which case a session ID may be present. Tab ID can also be set to `chrome.tabs.TAB_ID_NONE` for apps and devtools windows.
    
*   incognito
    
    boolean
    
    Whether the tab is in an incognito window.
    
*   index
    
    number
    
    The zero-based index of the tab within its window.
    
*   lastAccessed
    
    number
    
    Chrome 121+
    
    The last time the tab became active in its window as the number of milliseconds since epoch.
    
*   mutedInfo
    
    [MutedInfo](#type-MutedInfo) optional
    
    Chrome 46+
    
    The tab's muted state and the reason for the last state change.
    
*   openerTabId
    
    number optional
    
    The ID of the tab that opened this tab, if any. This property is only present if the opener tab still exists.
    
*   pendingUrl
    
    string optional
    
    Chrome 79+
    
    The URL the tab is navigating to, before it has committed. This property is only present if the extension has the `"tabs"` permission or has host permissions for the page and there is a pending navigation.
    
*   pinned
    
    boolean
    
    Whether the tab is pinned.
    
*   selected
    
    boolean
    
    Deprecated
    
    Please use [`tabs.Tab.highlighted`](#property-Tab-highlighted).
    
    Whether the tab is selected.
    
*   sessionId
    
    string optional
    
    The session ID used to uniquely identify a tab obtained from the [`sessions`](https://developer.chrome.com/docs/extensions/reference/sessions/) API.
    
*   splitViewId
    
    number optional
    
    Pending
    
    The ID of the Split View that the tab belongs to.
    
*   status
    
    [TabStatus](#type-TabStatus) optional
    
    The tab's loading status.
    
*   title
    
    string optional
    
    The title of the tab. This property is only present if the extension has the `"tabs"` permission or has host permissions for the page.
    
*   url
    
    string optional
    
    The last committed URL of the main frame of the tab. This property is only present if the extension has the `"tabs"` permission or has host permissions for the page. May be an empty string if the tab has not yet committed. See also [`Tab.pendingUrl`](#property-Tab-pendingUrl).
    
*   width
    
    number optional
    
    The width of the tab in pixels.
    
*   windowId
    
    number
    
    The ID of the window that contains the tab.
    

### TabStatus

Chrome 44+

The tab's loading status.

#### Enum

"unloaded"  

"loading"  

"complete"  

### WindowType

Chrome 44+

The type of window.

#### Enum

"normal"  

"popup"  

"panel"  

"app"  

"devtools"  

### ZoomSettings

Defines how zoom changes in a tab are handled and at what scope.

#### Properties

*   defaultZoomFactor
    
    number optional
    
    Chrome 43+
    
    Used to return the default zoom level for the current tab in calls to tabs.getZoomSettings.
    
*   mode
    
    [ZoomSettingsMode](#type-ZoomSettingsMode) optional
    
    Defines how zoom changes are handled, i.e., which entity is responsible for the actual scaling of the page; defaults to `automatic`.
    
*   scope
    
    [ZoomSettingsScope](#type-ZoomSettingsScope) optional
    
    Defines whether zoom changes persist for the page's origin, or only take effect in this tab; defaults to `per-origin` when in `automatic` mode, and `per-tab` otherwise.
    

### ZoomSettingsMode

Chrome 44+

Defines how zoom changes are handled, i.e., which entity is responsible for the actual scaling of the page; defaults to `automatic`.

#### Enum

"automatic"  
Zoom changes are handled automatically by the browser.

"manual"  
Overrides the automatic handling of zoom changes. The `onZoomChange` event will still be dispatched, and it is the extension's responsibility to listen for this event and manually scale the page. This mode does not support `per-origin` zooming, and thus ignores the `scope` zoom setting and assumes `per-tab`.

"disabled"  
Disables all zooming in the tab. The tab reverts to the default zoom level, and all attempted zoom changes are ignored.

### ZoomSettingsScope

Chrome 44+

Defines whether zoom changes persist for the page's origin, or only take effect in this tab; defaults to `per-origin` when in `automatic` mode, and `per-tab` otherwise.

#### Enum

"per-origin"  
Zoom changes persist in the zoomed page's origin, i.e., all other tabs navigated to that same origin are zoomed as well. Moreover, `per-origin` zoom changes are saved with the origin, meaning that when navigating to other pages in the same origin, they are all zoomed to the same zoom factor. The `per-origin` scope is only available in the `automatic` mode.

"per-tab"  
Zoom changes only take effect in this tab, and zoom changes in other tabs do not affect the zooming of this tab. Also, `per-tab` zoom changes are reset on navigation; navigating a tab always loads pages with their `per-origin` zoom factors.

Properties
----------

### MAX\_CAPTURE\_VISIBLE\_TAB\_CALLS\_PER\_SECOND

Chrome 92+

The maximum number of times that [`captureVisibleTab`](#method-captureVisibleTab) can be called per second. [`captureVisibleTab`](#method-captureVisibleTab) is expensive and should not be called too often.

#### Value

2  

### SPLIT\_VIEW\_ID\_NONE

Pending

An ID that represents the absence of a split tab.

#### Value

\-1  

### TAB\_ID\_NONE

Chrome 46+

An ID that represents the absence of a browser tab.

#### Value

\-1  

### TAB\_INDEX\_NONE

Chrome 123+

An index that represents the absence of a tab index in a tab\_strip.

#### Value

\-1  

Methods
-------

### captureVisibleTab()

chrome.tabs.captureVisibleTab(  
  windowId?: number,  
  options?: [ImageDetails](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-ImageDetails),  
): Promise<string>

Captures the visible area of the currently active tab in the specified window. In order to call this method, the extension must have either the [<all\_urls>](https://developer.chrome.com/extensions/develop/concepts/declare-permissions) permission or the [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) permission. In addition to sites that extensions can normally access, this method allows extensions to capture sensitive sites that are otherwise restricted, including chrome:-scheme pages, other extensions' pages, and data: URLs. These sensitive sites can only be captured with the activeTab permission. File URLs may be captured only if the extension has been granted file access.

#### Parameters

*   windowId
    
    number optional
    
    The target window. Defaults to the [current window](https://developer.chrome.com/docs/extensions/reference/windows/#current-window).
    
*   options
    
    [ImageDetails](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-ImageDetails) optional
    

#### Returns

*   Promise<string>
    
    Chrome 88+
    

### connect()

chrome.tabs.connect(  
  tabId: number,  
  connectInfo?: object,  
): [runtime.Port](https://developer.chrome.com/docs/extensions/reference/runtime/#type-Port)

Connects to the content script(s) in the specified tab. The [`runtime.onConnect`](https://developer.chrome.com/docs/extensions/reference/runtime/#event-onConnect) event is fired in each content script running in the specified tab for the current extension. For more details, see [Content Script Messaging](https://developer.chrome.com/docs/extensions/messaging).

#### Parameters

*   tabId
    
    number
    
*   connectInfo
    
    object optional
    
    *   documentId
        
        string optional
        
        Chrome 106+
        
        Open a port to a specific [document](https://developer.chrome.com/docs/extensions/reference/webNavigation/#document_ids) identified by `documentId` instead of all frames in the tab.
        
    *   frameId
        
        number optional
        
        Open a port to a specific [frame](https://developer.chrome.com/docs/extensions/reference/webNavigation/#frame_ids) identified by `frameId` instead of all frames in the tab.
        
    *   name
        
        string optional
        
        Is passed into onConnect for content scripts that are listening for the connection event.
        
    

#### Returns

*   [runtime.Port](https://developer.chrome.com/docs/extensions/reference/runtime/#type-Port)
    
    A port that can be used to communicate with the content scripts running in the specified tab. The port's [`runtime.Port`](https://developer.chrome.com/docs/extensions/reference/runtime/#type-Port) event is fired if the tab closes or does not exist.
    

### create()

chrome.tabs.create(  
  createProperties: object,  
): Promise<[Tab](#type-Tab)\>

Creates a new tab.

#### Parameters

*   createProperties
    
    object
    
    *   active
        
        boolean optional
        
        Whether the tab should become the active tab in the window. Does not affect whether the window is focused (see [`windows.update`](https://developer.chrome.com/docs/extensions/reference/windows/#method-update)). Defaults to `true`.
        
    *   index
        
        number optional
        
        The position the tab should take in the window. The provided value is clamped to between zero and the number of tabs in the window.
        
    *   openerTabId
        
        number optional
        
        The ID of the tab that opened this tab. If specified, the opener tab must be in the same window as the newly created tab.
        
    *   pinned
        
        boolean optional
        
        Whether the tab should be pinned. Defaults to `false`
        
    *   selected
        
        boolean optional
        
        Deprecated
        
        Please use _active_.
        
        Whether the tab should become the selected tab in the window. Defaults to `true`
        
    *   url
        
        string optional
        
        The URL to initially navigate the tab to. Fully-qualified URLs must include a scheme (i.e., 'http://www.google.com', not 'www.google.com'). Relative URLs are relative to the current page within the extension. Defaults to the New Tab Page.
        
    *   windowId
        
        number optional
        
        The window in which to create the new tab. Defaults to the [current window](https://developer.chrome.com/docs/extensions/reference/windows/#current-window).
        
    

#### Returns

*   Promise<[Tab](#type-Tab)\>
    
    Chrome 88+
    

### detectLanguage()

chrome.tabs.detectLanguage(  
  tabId?: number,  
): Promise<string>

Detects the primary language of the content in a tab.

#### Parameters

*   tabId
    
    number optional
    
    Defaults to the active tab of the [current window](https://developer.chrome.com/docs/extensions/reference/windows/#current-window).
    

#### Returns

*   Promise<string>
    
    Chrome 88+
    

### discard()

Chrome 54+

chrome.tabs.discard(  
  tabId?: number,  
): Promise<[Tab](#type-Tab) | undefined\>

Discards a tab from memory. Discarded tabs are still visible on the tab strip and are reloaded when activated.

#### Parameters

*   tabId
    
    number optional
    
    The ID of the tab to be discarded. If specified, the tab is discarded unless it is active or already discarded. If omitted, the browser discards the least important tab. This can fail if no discardable tabs exist.
    

#### Returns

*   Promise<[Tab](#type-Tab) | undefined>
    
    Chrome 88+
    
    Resolves after the operation is completed.
    

### duplicate()

chrome.tabs.duplicate(  
  tabId: number,  
): Promise<[Tab](#type-Tab) | undefined\>

Duplicates a tab.

#### Parameters

*   tabId
    
    number
    
    The ID of the tab to duplicate.
    

#### Returns

*   Promise<[Tab](#type-Tab) | undefined>
    
    Chrome 88+
    

### get()

chrome.tabs.get(  
  tabId: number,  
): Promise<[Tab](#type-Tab)\>

Retrieves details about the specified tab.

#### Parameters

*   tabId
    
    number
    

#### Returns

*   Promise<[Tab](#type-Tab)\>
    
    Chrome 88+
    

### getCurrent()

chrome.tabs.getCurrent(): Promise<[Tab](#type-Tab) | undefined\>

Gets the tab that this script call is being made from. Returns `undefined` if called from a non-tab context (for example, a background page or popup view).

#### Returns

*   Promise<[Tab](#type-Tab) | undefined>
    
    Chrome 88+
    

### getZoom()

chrome.tabs.getZoom(  
  tabId?: number,  
): Promise<number>

Gets the current zoom factor of a specified tab.

#### Parameters

*   tabId
    
    number optional
    
    The ID of the tab to get the current zoom factor from; defaults to the active tab of the current window.
    

#### Returns

*   Promise<number>
    
    Chrome 88+
    
    Resolves with the tab's current zoom factor after it has been fetched.
    

### getZoomSettings()

chrome.tabs.getZoomSettings(  
  tabId?: number,  
): Promise<[ZoomSettings](#type-ZoomSettings)\>

Gets the current zoom settings of a specified tab.

#### Parameters

*   tabId
    
    number optional
    
    The ID of the tab to get the current zoom settings from; defaults to the active tab of the current window.
    

#### Returns

*   Promise<[ZoomSettings](#type-ZoomSettings)\>
    
    Chrome 88+
    
    Resolves with the tab's current zoom settings.
    

### goBack()

Chrome 72+

chrome.tabs.goBack(  
  tabId?: number,  
): Promise<void>

Go back to the previous page, if one is available.

#### Parameters

*   tabId
    
    number optional
    
    The ID of the tab to navigate back; defaults to the selected tab of the current window.
    

#### Returns

*   Promise<void>
    
    Chrome 88+
    

### goForward()

Chrome 72+

chrome.tabs.goForward(  
  tabId?: number,  
): Promise<void>

Go foward to the next page, if one is available.

#### Parameters

*   tabId
    
    number optional
    
    The ID of the tab to navigate forward; defaults to the selected tab of the current window.
    

#### Returns

*   Promise<void>
    
    Chrome 88+
    

### group()

Chrome 88+

chrome.tabs.group(  
  options: object,  
): Promise<number>

Adds one or more tabs to a specified group, or if no group is specified, adds the given tabs to a newly created group.

#### Parameters

*   options
    
    object
    
    *   createProperties
        
        object optional
        
        Configurations for creating a group. Cannot be used if groupId is already specified.
        
        *   windowId
            
            number optional
            
            The window of the new group. Defaults to the current window.
            
        
    *   groupId
        
        number optional
        
        The ID of the group to add the tabs to. If not specified, a new group will be created.
        
    *   tabIds
        
        number | \[number, ...number\[\]\]
        
        The tab ID or list of tab IDs to add to the specified group.
        
    

#### Returns

*   Promise<number>
    

### highlight()

chrome.tabs.highlight(  
  highlightInfo: object,  
): Promise<[windows](https://developer.chrome.com/docs/extensions/reference/windows/#type-Window)[.Window](https://developer.chrome.com/docs/extensions/reference/windows/#type-Window)\>

Highlights the given tabs and focuses on the first of group. Will appear to do nothing if the specified tab is currently active.

#### Parameters

*   highlightInfo
    
    object
    
    *   tabs
        
        number | number\[\]
        
        One or more tab indices to highlight.
        
    *   windowId
        
        number optional
        
        The window that contains the tabs.
        
    

#### Returns

*   Promise<[windows.Window](https://developer.chrome.com/docs/extensions/reference/windows/#type-Window)\>
    
    Chrome 88+
    

### move()

chrome.tabs.move(  
  tabIds: number | number\[\],  
  moveProperties: object,  
): Promise<[Tab](#type-Tab) | [Tab](#type-Tab)\[\]\>

Moves one or more tabs to a new position within its window, or to a new window. Note that tabs can only be moved to and from normal (window.type === "normal") windows.

#### Parameters

*   tabIds
    
    number | number\[\]
    
    The tab ID or list of tab IDs to move.
    
*   moveProperties
    
    object
    
    *   index
        
        number
        
        The position to move the window to. Use `-1` to place the tab at the end of the window.
        
    *   windowId
        
        number optional
        
        Defaults to the window the tab is currently in.
        
    

#### Returns

*   Promise<[Tab](#type-Tab) | [Tab](#type-Tab)\[\]>
    
    Chrome 88+
    

### query()

chrome.tabs.query(  
  queryInfo: object,  
): Promise<[Tab](#type-Tab)\[\]\>

Gets all tabs that have the specified properties, or all tabs if no properties are specified.

#### Parameters

*   queryInfo
    
    object
    
    *   active
        
        boolean optional
        
        Whether the tabs are active in their windows.
        
    *   audible
        
        boolean optional
        
        Chrome 45+
        
        Whether the tabs are audible.
        
    *   autoDiscardable
        
        boolean optional
        
        Chrome 54+
        
        Whether the tabs can be discarded automatically by the browser when resources are low.
        
    *   currentWindow
        
        boolean optional
        
        Whether the tabs are in the [current window](https://developer.chrome.com/docs/extensions/reference/windows/#current-window).
        
    *   discarded
        
        boolean optional
        
        Chrome 54+
        
        Whether the tabs are discarded. A discarded tab is one whose content has been unloaded from memory, but is still visible in the tab strip. Its content is reloaded the next time it is activated.
        
    *   frozen
        
        boolean optional
        
        Chrome 132+
        
        Whether the tabs are frozen. A frozen tab cannot execute tasks, including event handlers or timers. It is visible in the tab strip and its content is loaded in memory. It is unfrozen on activation.
        
    *   groupId
        
        number optional
        
        Chrome 88+
        
        The ID of the group that the tabs are in, or [`tabGroups.TAB_GROUP_ID_NONE`](https://developer.chrome.com/docs/extensions/reference/tabGroups/#property-TAB_GROUP_ID_NONE) for ungrouped tabs.
        
    *   highlighted
        
        boolean optional
        
        Whether the tabs are highlighted.
        
    *   index
        
        number optional
        
        The position of the tabs within their windows.
        
    *   lastFocusedWindow
        
        boolean optional
        
        Whether the tabs are in the last focused window.
        
    *   muted
        
        boolean optional
        
        Chrome 45+
        
        Whether the tabs are muted.
        
    *   pinned
        
        boolean optional
        
        Whether the tabs are pinned.
        
    *   splitViewId
        
        number optional
        
        Chrome 140+
        
        The ID of the Split View that the tabs are in, or [`tabs.SPLIT_VIEW_ID_NONE`](#property-SPLIT_VIEW_ID_NONE) for tabs that aren't in a Split View.
        
    *   status
        
        [TabStatus](#type-TabStatus) optional
        
        The tab loading status.
        
    *   title
        
        string optional
        
        Match page titles against a pattern. This property is ignored if the extension does not have the `"tabs"` permission or host permissions for the page.
        
    *   url
        
        string | string\[\] optional
        
        Match tabs against one or more [URL patterns](https://developer.chrome.com/docs/extensions/match_patterns). Fragment identifiers are not matched. This property is ignored if the extension does not have the `"tabs"` permission or host permissions for the page.
        
    *   windowId
        
        number optional
        
        The ID of the parent window, or [`windows.WINDOW_ID_CURRENT`](https://developer.chrome.com/docs/extensions/reference/windows/#property-WINDOW_ID_CURRENT) for the [current window](https://developer.chrome.com/docs/extensions/reference/windows/#current-window).
        
    *   windowType
        
        [WindowType](#type-WindowType) optional
        
        The type of window the tabs are in.
        
    

#### Returns

*   Promise<[Tab](#type-Tab)\[\]>
    
    Chrome 88+
    

### reload()

chrome.tabs.reload(  
  tabId?: number,  
  reloadProperties?: object,  
): Promise<void>

Reload a tab.

#### Parameters

*   tabId
    
    number optional
    
    The ID of the tab to reload; defaults to the selected tab of the current window.
    
*   reloadProperties
    
    object optional
    
    *   bypassCache
        
        boolean optional
        
        Whether to bypass local caching. Defaults to `false`.
        
    

#### Returns

*   Promise<void>
    
    Chrome 88+
    

### remove()

chrome.tabs.remove(  
  tabIds: number | number\[\],  
): Promise<void>

Closes one or more tabs.

#### Parameters

*   tabIds
    
    number | number\[\]
    
    The tab ID or list of tab IDs to close.
    

#### Returns

*   Promise<void>
    
    Chrome 88+
    

### sendMessage()

chrome.tabs.sendMessage(  
  tabId: number,  
  message: any,  
  options?: object,  
): Promise<any>

Sends a single message to the content script(s) in the specified tab, with an optional callback to run when a response is sent back. The [`runtime.onMessage`](https://developer.chrome.com/docs/extensions/reference/runtime/#event-onMessage) event is fired in each content script running in the specified tab for the current extension.

#### Parameters

*   tabId
    
    number
    
*   message
    
    any
    
    The message to send. This message should be a JSON-ifiable object.
    
*   options
    
    object optional
    
    *   documentId
        
        string optional
        
        Chrome 106+
        
        Send a message to a specific [document](https://developer.chrome.com/docs/extensions/reference/webNavigation/#document_ids) identified by `documentId` instead of all frames in the tab.
        
    *   frameId
        
        number optional
        
        Send a message to a specific [frame](https://developer.chrome.com/docs/extensions/reference/webNavigation/#frame_ids) identified by `frameId` instead of all frames in the tab.
        
    

#### Returns

*   Promise<any>
    
    Chrome 99+
    

### setZoom()

chrome.tabs.setZoom(  
  tabId?: number,  
  zoomFactor: number,  
): Promise<void>

Zooms a specified tab.

#### Parameters

*   tabId
    
    number optional
    
    The ID of the tab to zoom; defaults to the active tab of the current window.
    
*   zoomFactor
    
    number
    
    The new zoom factor. A value of `0` sets the tab to its current default zoom factor. Values greater than `0` specify a (possibly non-default) zoom factor for the tab.
    

#### Returns

*   Promise<void>
    
    Chrome 88+
    
    Resolves after the zoom factor has been changed.
    

### setZoomSettings()

chrome.tabs.setZoomSettings(  
  tabId?: number,  
  zoomSettings: [ZoomSettings](#type-ZoomSettings),  
): Promise<void>

Sets the zoom settings for a specified tab, which define how zoom changes are handled. These settings are reset to defaults upon navigating the tab.

#### Parameters

*   tabId
    
    number optional
    
    The ID of the tab to change the zoom settings for; defaults to the active tab of the current window.
    
*   zoomSettings
    
    [ZoomSettings](#type-ZoomSettings)
    
    Defines how zoom changes are handled and at what scope.
    

#### Returns

*   Promise<void>
    
    Chrome 88+
    
    Resolves after the zoom settings are changed.
    

### ungroup()

Chrome 88+

chrome.tabs.ungroup(  
  tabIds: number | \[number, ...number\[\]\],  
): Promise<void>

Removes one or more tabs from their respective groups. If any groups become empty, they are deleted.

#### Parameters

*   tabIds
    
    number | \[number, ...number\[\]\]
    
    The tab ID or list of tab IDs to remove from their respective groups.
    

#### Returns

*   Promise<void>
    

### update()

chrome.tabs.update(  
  tabId?: number,  
  updateProperties: object,  
): Promise<[Tab](#type-Tab) | undefined\>

Modifies the properties of a tab. Properties that are not specified in `updateProperties` are not modified.

#### Parameters

*   tabId
    
    number optional
    
    Defaults to the selected tab of the [current window](https://developer.chrome.com/docs/extensions/reference/windows/#current-window).
    
*   updateProperties
    
    object
    
    *   active
        
        boolean optional
        
        Whether the tab should be active. Does not affect whether the window is focused (see [`windows.update`](https://developer.chrome.com/docs/extensions/reference/windows/#method-update)).
        
    *   autoDiscardable
        
        boolean optional
        
        Chrome 54+
        
        Whether the tab should be discarded automatically by the browser when resources are low.
        
    *   highlighted
        
        boolean optional
        
        Adds or removes the tab from the current selection.
        
    *   muted
        
        boolean optional
        
        Chrome 45+
        
        Whether the tab should be muted.
        
    *   openerTabId
        
        number optional
        
        The ID of the tab that opened this tab. If specified, the opener tab must be in the same window as this tab.
        
    *   pinned
        
        boolean optional
        
        Whether the tab should be pinned.
        
    *   selected
        
        boolean optional
        
        Deprecated
        
        Please use _highlighted_.
        
        Whether the tab should be selected.
        
    *   url
        
        string optional
        
        A URL to navigate the tab to. JavaScript URLs are not supported; use [`scripting.executeScript`](https://developer.chrome.com/docs/extensions/reference/scripting/#method-executeScript) instead.
        
    

#### Returns

*   Promise<[Tab](#type-Tab) | undefined>
    
    Chrome 88+
    

Events
------

### onActivated

chrome.tabs.onActivated.addListener(  
  callback: function,  
)

Fires when the active tab in a window changes. Note that the tab's URL may not be set at the time this event fired, but you can listen to onUpdated events so as to be notified when a URL is set.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (activeInfo: object) => void
    
    *   activeInfo
        
        object
        
        *   tabId
            
            number
            
            The ID of the tab that has become active.
            
        *   windowId
            
            number
            
            The ID of the window the active tab changed inside of.
            
        
    

### onAttached

chrome.tabs.onAttached.addListener(  
  callback: function,  
)

Fired when a tab is attached to a window; for example, because it was moved between windows.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (tabId: number, attachInfo: object) => void
    
    *   tabId
        
        number
        
    *   attachInfo
        
        object
        
        *   newPosition
            
            number
            
        *   newWindowId
            
            number
            
        
    

### onCreated

chrome.tabs.onCreated.addListener(  
  callback: function,  
)

Fired when a tab is created. Note that the tab's URL and tab group membership may not be set at the time this event is fired, but you can listen to onUpdated events so as to be notified when a URL is set or the tab is added to a tab group.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (tab: [Tab](#type-Tab)) => void
    
    *   tab
        
        [Tab](#type-Tab)
        
    

### onDetached

chrome.tabs.onDetached.addListener(  
  callback: function,  
)

Fired when a tab is detached from a window; for example, because it was moved between windows.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (tabId: number, detachInfo: object) => void
    
    *   tabId
        
        number
        
    *   detachInfo
        
        object
        
        *   oldPosition
            
            number
            
        *   oldWindowId
            
            number
            
        
    

### onHighlighted

chrome.tabs.onHighlighted.addListener(  
  callback: function,  
)

Fired when the highlighted or selected tabs in a window changes.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (highlightInfo: object) => void
    
    *   highlightInfo
        
        object
        
        *   tabIds
            
            number\[\]
            
            All highlighted tabs in the window.
            
        *   windowId
            
            number
            
            The window whose tabs changed.
            
        
    

### onMoved

chrome.tabs.onMoved.addListener(  
  callback: function,  
)

Fired when a tab is moved within a window. Only one move event is fired, representing the tab the user directly moved. Move events are not fired for the other tabs that must move in response to the manually-moved tab. This event is not fired when a tab is moved between windows; for details, see [`tabs.onDetached`](#event-onDetached).

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (tabId: number, moveInfo: object) => void
    
    *   tabId
        
        number
        
    *   moveInfo
        
        object
        
        *   fromIndex
            
            number
            
        *   toIndex
            
            number
            
        *   windowId
            
            number
            
        
    

### onRemoved

chrome.tabs.onRemoved.addListener(  
  callback: function,  
)

Fired when a tab is closed.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (tabId: number, removeInfo: object) => void
    
    *   tabId
        
        number
        
    *   removeInfo
        
        object
        
        *   isWindowClosing
            
            boolean
            
            True when the tab was closed because its parent window was closed.
            
        *   windowId
            
            number
            
            The window whose tab is closed.
            
        
    

### onReplaced

chrome.tabs.onReplaced.addListener(  
  callback: function,  
)

Fired when a tab is replaced with another tab due to prerendering or instant.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (addedTabId: number, removedTabId: number) => void
    
    *   addedTabId
        
        number
        
    *   removedTabId
        
        number
        
    

### onUpdated

chrome.tabs.onUpdated.addListener(  
  callback: function,  
)

Fired when a tab is updated.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (tabId: number, changeInfo: object, tab: [Tab](#type-Tab)) => void
    
    *   tabId
        
        number
        
    *   changeInfo
        
        object
        
        *   audible
            
            boolean optional
            
            Chrome 45+
            
            The tab's new audible state.
            
        *   autoDiscardable
            
            boolean optional
            
            Chrome 54+
            
            The tab's new auto-discardable state.
            
        *   discarded
            
            boolean optional
            
            Chrome 54+
            
            The tab's new discarded state.
            
        *   favIconUrl
            
            string optional
            
            The tab's new favicon URL.
            
        *   frozen
            
            boolean optional
            
            Chrome 132+
            
            The tab's new frozen state.
            
        *   groupId
            
            number optional
            
            Chrome 88+
            
            The tab's new group.
            
        *   mutedInfo
            
            [MutedInfo](#type-MutedInfo) optional
            
            Chrome 46+
            
            The tab's new muted state and the reason for the change.
            
        *   pinned
            
            boolean optional
            
            The tab's new pinned state.
            
        *   splitViewId
            
            number optional
            
            Chrome 140+
            
            The tab's new Split View.
            
        *   status
            
            [TabStatus](#type-TabStatus) optional
            
            The tab's loading status.
            
        *   title
            
            string optional
            
            Chrome 48+
            
            The tab's new title.
            
        *   url
            
            string optional
            
            The tab's URL if it has changed.
            
        
    *   tab
        
        [Tab](#type-Tab)
        
    

### onZoomChange

chrome.tabs.onZoomChange.addListener(  
  callback: function,  
)

Fired when a tab is zoomed.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (ZoomChangeInfo: object) => void
    
    *   ZoomChangeInfo
        
        object
        
        *   newZoomFactor
            
            number
            
        *   oldZoomFactor
            
            number
            
        *   tabId
            
            number
            
        *   zoomSettings
            
            [ZoomSettings](#type-ZoomSettings)
            
        
    

Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2026-01-07 UTC.

*   ### Contribute
    
    *   [File a bug](https://issuetracker.google.com/issues/new?component=1400036&template=1897236)
    *   [See open issues](https://issuetracker.google.com/issues?q=status:open%20componentid:1400036&s=created_time:desc)
*   ### Related content
    
    *   [Chromium updates](https://blog.chromium.org/)
    *   [Case studies](/case-studies)
    *   [Archive](/deprecated)
    *   [Podcasts & shows](https://web.dev/shows)
*   ### Follow
    
    *   [@ChromiumDev on X](https://twitter.com/ChromiumDev)
    *   [YouTube](https://www.youtube.com/user/ChromeDevelopers)
    *   [Chrome for Developers on LinkedIn](https://www.linkedin.com/showcase/chrome-for-developers)
    *   [RSS](/static/blog/feed.xml)

*   [Terms](//policies.google.com/terms)
*   [Privacy](//policies.google.com/privacy)
*   [Manage cookies](#)

*   English
*   Deutsch
*   Español – América Latina
*   Français
*   Indonesia
*   Italiano
*   Nederlands
*   Polski
*   Português – Brasil
*   Tiếng Việt
*   Türkçe
*   Русский
*   עברית
*   العربيّة
*   فارسی
*   हिंदी
*   বাংলা
*   ภาษาไทย
*   中文 – 简体
*   中文 – 繁體
*   日本語
*   한국어

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,116,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["Profiles\_\_enable\_join\_program\_group\_endpoint","Analytics\_\_enable\_clearcut\_logging","SignIn\_\_enable\_l1\_signup\_flow","MiscFeatureFlags\_\_developers\_footer\_dark\_image","DevPro\_\_enable\_code\_assist","Search\_\_enable\_suggestions\_from\_borg","MiscFeatureFlags\_\_developers\_footer\_image","Search\_\_enable\_page\_map","TpcFeatures\_\_proxy\_prod\_host","DevPro\_\_remove\_eu\_tax\_intake\_form","MiscFeatureFlags\_\_enable\_llms\_txt","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","CloudShell\_\_cloud\_shell\_button","DevPro\_\_enable\_devpro\_offers","Profiles\_\_enable\_purchase\_prompts","EngEduTelemetry\_\_enable\_engedu\_telemetry","Cloud\_\_enable\_cloud\_shell","Cloud\_\_enable\_cloud\_dlp\_service","Profiles\_\_enable\_awarding\_url","DevPro\_\_enable\_cloud\_innovators\_plus","MiscFeatureFlags\_\_enable\_firebase\_utm","DevPro\_\_enable\_google\_payments\_buyflow","Search\_\_enable\_ai\_eligibility\_checks","MiscFeatureFlags\_\_emergency\_css","Concierge\_\_enable\_pushui","DevPro\_\_enable\_embed\_profile\_creation","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","Profiles\_\_enable\_user\_type","Profiles\_\_enable\_completecodelab\_endpoint","Profiles\_\_enable\_dashboard\_curated\_recommendations","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","MiscFeatureFlags\_\_enable\_view\_transitions","MiscFeatureFlags\_\_enable\_variable\_operator","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","MiscFeatureFlags\_\_enable\_explain\_this\_code","Profiles\_\_enable\_profile\_collections","Profiles\_\_enable\_release\_notes\_notifications","DevPro\_\_enable\_vertex\_credit\_card","Search\_\_enable\_dynamic\_content\_confidential\_banner","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","Cloud\_\_cache\_serialized\_dynamic\_content","OnSwitch\_\_enable","Experiments\_\_reqs\_query\_experiments","DevPro\_\_enable\_enterprise","DevPro\_\_enable\_nvidia\_credits\_card","Profiles\_\_enable\_playlist\_community\_acl","DevPro\_\_enable\_google\_one\_card","Profiles\_\_enable\_auto\_apply\_credits","DevPro\_\_enable\_firebase\_workspaces\_card","MiscFeatureFlags\_\_enable\_project\_variables","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","Concierge\_\_enable\_actions\_menu","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","DevPro\_\_enable\_developer\_subscriptions","Profiles\_\_enable\_public\_developer\_profiles","Profiles\_\_enable\_page\_saving","Profiles\_\_enable\_completequiz\_endpoint","Cloud\_\_enable\_cloudx\_experiment\_ids","Cloud\_\_enable\_llm\_concierge\_chat","DevPro\_\_enable\_payments\_first\_batch","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","Profiles\_\_enable\_stripe\_subscription\_management","Concierge\_\_enable\_remove\_info\_panel\_tags","Profiles\_\_require\_profile\_eligibility\_for\_signin","Search\_\_enable\_ai\_search\_summaries\_for\_all","Profiles\_\_enable\_callout\_notifications","Profiles\_\_enable\_recognition\_badges","Cloud\_\_fast\_free\_trial","MiscFeatureFlags\_\_enable\_appearance\_cookies","Cloud\_\_enable\_legacy\_calculator\_redirect","Profiles\_\_enable\_developer\_profiles\_callout","DevPro\_\_enable\_free\_benefits","Cloud\_\_enable\_free\_trial\_server\_call","BookNav\_\_enable\_tenant\_cache\_key","CloudShell\_\_cloud\_code\_overflow\_menu","Profiles\_\_enable\_complete\_playlist\_endpoint","Concierge\_\_enable\_devsite\_llm\_tools"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

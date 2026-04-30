# chrome.windows

**Source:** https://developer.chrome.com/docs/extensions/reference/api/windows

---

Description
-----------

Use the `chrome.windows` API to interact with browser windows. You can use this API to create, modify, and rearrange windows in the browser.

Permissions
-----------

When requested, a [`windows.Window`](#type-Window) contains an array of [`tabs.Tab`](/docs/extensions/reference/api/tabs#type-Tab) objects. You must declare the `"tabs"` permission in your [manifest](/docs/extensions/reference/api/tabs#manifest) if you need access to the [`url`](/docs/extensions/reference/api/tabs#property-Tab-url), [`pendingUrl`](/docs/extensions/reference/api/tabs#property-Tab-pendingUrl), [`title`](/docs/extensions/reference/api/tabs#property-Tab-title), or [`favIconUrl`](/docs/extensions/reference/api/tabs#property-Tab-favIconUrl) properties of [`tabs.Tab`](/docs/extensions/reference/api/tabs#type-Tab). For example:

{
      "name": "My extension",
      ...
      "permissions": ["tabs"],
      ...
    }

Concepts and usage
------------------

### The current window

Many functions in the extension system take an optional `windowId` argument, which defaults to the current window.

The _current window_ is the window that contains the code that is currently executing. It's important to realize that this can be different from the topmost or focused window.

For example, say an extension creates a few tabs or windows from a single HTML file, and that the HTML file contains a call to [`tabs.query()`](/docs/extensions/reference/api/tabs#method-query). The current window is the window that contains the page that made the call, no matter what the topmost window is.

In the case of [service workers](/docs/extensions/develop/concepts/service-workers), the value of the current window falls back to the last active window. Under some circumstances, there may be no current window for background pages.

Examples
--------

To try this API, install the [windows API example](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/windows) from the [chrome-extension-samples](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples) repository.

![Two windows, each with one tab](/static/docs/extensions/reference/api/windows/images/windows.png)

Two windows, each with one tab.

Types
-----

### CreateType

Chrome 44+

Specifies what type of browser window to create. 'panel' is deprecated and is available only to existing allowlisted extensions on Chrome OS.

#### Enum

"normal"  
Specifies the window as a standard window.

"popup"  
Specifies the window as a popup window.

"panel"  
Specifies the window as a panel.

### QueryOptions

Chrome 88+

#### Properties

*   populate
    
    boolean optional
    
    If true, the [`windows.Window`](#type-Window) object has a `tabs` property that contains a list of the [`tabs.Tab`](https://developer.chrome.com/docs/extensions/reference/api/tabs/#type-Tab) objects. The `Tab` objects only contain the `url`, `pendingUrl`, `title`, and `favIconUrl` properties if the extension's manifest file includes the `"tabs"` permission.
    
*   windowTypes
    
    [WindowType](#type-WindowType)\[\] optional
    
    If set, the [`windows.Window`](#type-Window) returned is filtered based on its type. If unset, the default filter is set to `['normal', 'popup']`.
    

### Window

#### Properties

*   alwaysOnTop
    
    boolean
    
    Whether the window is set to be always on top.
    
*   focused
    
    boolean
    
    Whether the window is currently the focused window.
    
*   height
    
    number optional
    
    The height of the window, including the frame, in pixels. In some circumstances a window may not be assigned a `height` property; for example, when querying closed windows from the [`sessions`](https://developer.chrome.com/docs/extensions/reference/api/sessions/) API.
    
*   id
    
    number optional
    
    The ID of the window. Window IDs are unique within a browser session. In some circumstances a window may not be assigned an `ID` property; for example, when querying windows using the [`sessions`](https://developer.chrome.com/docs/extensions/reference/api/sessions/) API, in which case a session ID may be present.
    
*   incognito
    
    boolean
    
    Whether the window is incognito.
    
*   left
    
    number optional
    
    The offset of the window from the left edge of the screen in pixels. In some circumstances a window may not be assigned a `left` property; for example, when querying closed windows from the [`sessions`](https://developer.chrome.com/docs/extensions/reference/api/sessions/) API.
    
*   sessionId
    
    string optional
    
    The session ID used to uniquely identify a window, obtained from the [`sessions`](https://developer.chrome.com/docs/extensions/reference/api/sessions/) API.
    
*   state
    
    [WindowState](#type-WindowState) optional
    
    The state of this browser window.
    
*   tabs
    
    [Tab](https://developer.chrome.com/docs/extensions/reference/api/tabs/#type-Tab)\[\] optional
    
    Array of [`tabs.Tab`](https://developer.chrome.com/docs/extensions/reference/api/tabs/#type-Tab) objects representing the current tabs in the window.
    
*   top
    
    number optional
    
    The offset of the window from the top edge of the screen in pixels. In some circumstances a window may not be assigned a `top` property; for example, when querying closed windows from the [`sessions`](https://developer.chrome.com/docs/extensions/reference/api/sessions/) API.
    
*   type
    
    [WindowType](#type-WindowType) optional
    
    The type of browser window this is.
    
*   width
    
    number optional
    
    The width of the window, including the frame, in pixels. In some circumstances a window may not be assigned a `width` property; for example, when querying closed windows from the [`sessions`](https://developer.chrome.com/docs/extensions/reference/api/sessions/) API.
    

### WindowState

Chrome 44+

The state of this browser window. In some circumstances a window may not be assigned a `state` property; for example, when querying closed windows from the [`sessions`](https://developer.chrome.com/docs/extensions/reference/api/sessions/) API.

#### Enum

"normal"  
Normal window state (not minimized, maximized, or fullscreen).

"minimized"  
Minimized window state.

"maximized"  
Maximized window state.

"fullscreen"  
Fullscreen window state.

"locked-fullscreen"  
Locked fullscreen window state. This fullscreen state cannot be exited by user action and is available only to allowlisted extensions on Chrome OS.

### WindowType

Chrome 44+

The type of browser window this is. In some circumstances a window may not be assigned a `type` property; for example, when querying closed windows from the [`sessions`](https://developer.chrome.com/docs/extensions/reference/api/sessions/) API.

#### Enum

"normal"  
A normal browser window.

"popup"  
A browser popup.

"panel"  
_Deprecated in this API._ A Chrome App panel-style window. Extensions can only see their own panel windows.

"app"  
_Deprecated in this API._ A Chrome App window. Extensions can only see their app own windows.

"devtools"  
A Developer Tools window.

Properties
----------

### WINDOW\_ID\_CURRENT

The windowId value that represents the [current window](https://developer.chrome.com/docs/extensions/reference/windows/#the_current_window).

#### Value

\-2  

### WINDOW\_ID\_NONE

The windowId value that represents the absence of a Chrome browser window.

#### Value

\-1  

Methods
-------

### create()

chrome.windows.create(  
  createData?: object,  
): Promise<[Window](#type-Window) | undefined\>

Creates (opens) a new browser window with any optional sizing, position, or default URL provided.

#### Parameters

*   createData
    
    object optional
    
    *   focused
        
        boolean optional
        
        If `true`, opens an active window. If `false`, opens an inactive window.
        
    *   height
        
        number optional
        
        The height in pixels of the new window, including the frame. If not specified, defaults to a natural height.
        
    *   incognito
        
        boolean optional
        
        Whether the new window should be an incognito window.
        
    *   left
        
        number optional
        
        The number of pixels to position the new window from the left edge of the screen. If not specified, the new window is offset naturally from the last focused window. This value is ignored for panels.
        
    *   setSelfAsOpener
        
        boolean optional
        
        Chrome 64+
        
        If `true`, the newly-created window's 'window.opener' is set to the caller and is in the same [unit of related browsing contexts](https://www.w3.org/TR/html51/browsers.html#unit-of-related-browsing-contexts) as the caller.
        
    *   state
        
        [WindowState](#type-WindowState) optional
        
        Chrome 44+
        
        The initial state of the window. The `minimized`, `maximized`, and `fullscreen` states cannot be combined with `left`, `top`, `width`, or `height`.
        
    *   tabId
        
        number optional
        
        The ID of the tab to add to the new window.
        
    *   top
        
        number optional
        
        The number of pixels to position the new window from the top edge of the screen. If not specified, the new window is offset naturally from the last focused window. This value is ignored for panels.
        
    *   type
        
        [CreateType](#type-CreateType) optional
        
        Specifies what type of browser window to create.
        
    *   url
        
        string | string\[\] optional
        
        A URL or array of URLs to open as tabs in the window. Fully-qualified URLs must include a scheme, e.g., 'http://www.google.com', not 'www.google.com'. Non-fully-qualified URLs are considered relative within the extension. Defaults to the New Tab Page.
        
    *   width
        
        number optional
        
        The width in pixels of the new window, including the frame. If not specified, defaults to a natural width.
        
    

#### Returns

*   Promise<[Window](#type-Window) | undefined>
    
    Chrome 88+
    

### get()

chrome.windows.get(  
  windowId: number,  
  queryOptions?: [QueryOptions](#type-QueryOptions),  
): Promise<[Window](#type-Window)\>

Gets details about a window.

#### Parameters

*   windowId
    
    number
    
*   queryOptions
    
    [QueryOptions](#type-QueryOptions) optional
    
    Chrome 88+
    

#### Returns

*   Promise<[Window](#type-Window)\>
    
    Chrome 88+
    

### getAll()

chrome.windows.getAll(  
  queryOptions?: [QueryOptions](#type-QueryOptions),  
): Promise<[Window](#type-Window)\[\]\>

Gets all windows.

#### Parameters

*   queryOptions
    
    [QueryOptions](#type-QueryOptions) optional
    
    Chrome 88+
    

#### Returns

*   Promise<[Window](#type-Window)\[\]>
    
    Chrome 88+
    

### getCurrent()

chrome.windows.getCurrent(  
  queryOptions?: [QueryOptions](#type-QueryOptions),  
): Promise<[Window](#type-Window)\>

Gets the [current window](https://developer.chrome.com/docs/extensions/reference/windows/#current-window).

#### Parameters

*   queryOptions
    
    [QueryOptions](#type-QueryOptions) optional
    
    Chrome 88+
    

#### Returns

*   Promise<[Window](#type-Window)\>
    
    Chrome 88+
    

### getLastFocused()

chrome.windows.getLastFocused(  
  queryOptions?: [QueryOptions](#type-QueryOptions),  
): Promise<[Window](#type-Window)\>

Gets the window that was most recently focused — typically the window 'on top'.

#### Parameters

*   queryOptions
    
    [QueryOptions](#type-QueryOptions) optional
    
    Chrome 88+
    

#### Returns

*   Promise<[Window](#type-Window)\>
    
    Chrome 88+
    

### remove()

chrome.windows.remove(  
  windowId: number,  
): Promise<void>

Removes (closes) a window and all the tabs inside it.

#### Parameters

*   windowId
    
    number
    

#### Returns

*   Promise<void>
    
    Chrome 88+
    

### update()

chrome.windows.update(  
  windowId: number,  
  updateInfo: object,  
): Promise<[Window](#type-Window)\>

Updates the properties of a window. Specify only the properties that to be changed; unspecified properties are unchanged.

#### Parameters

*   windowId
    
    number
    
*   updateInfo
    
    object
    
    *   drawAttention
        
        boolean optional
        
        If `true`, causes the window to be displayed in a manner that draws the user's attention to the window, without changing the focused window. The effect lasts until the user changes focus to the window. This option has no effect if the window already has focus. Set to `false` to cancel a previous `drawAttention` request.
        
    *   focused
        
        boolean optional
        
        If `true`, brings the window to the front; cannot be combined with the state 'minimized'. If `false`, brings the next window in the z-order to the front; cannot be combined with the state 'fullscreen' or 'maximized'.
        
    *   height
        
        number optional
        
        The height to resize the window to in pixels. This value is ignored for panels.
        
    *   left
        
        number optional
        
        The offset from the left edge of the screen to move the window to in pixels. This value is ignored for panels.
        
    *   state
        
        [WindowState](#type-WindowState) optional
        
        The new state of the window. The 'minimized', 'maximized', and 'fullscreen' states cannot be combined with 'left', 'top', 'width', or 'height'.
        
    *   top
        
        number optional
        
        The offset from the top edge of the screen to move the window to in pixels. This value is ignored for panels.
        
    *   width
        
        number optional
        
        The width to resize the window to in pixels. This value is ignored for panels.
        
    

#### Returns

*   Promise<[Window](#type-Window)\>
    
    Chrome 88+
    

Events
------

### onBoundsChanged

Chrome 86+

chrome.windows.onBoundsChanged.addListener(  
  callback: function,  
)

Fired when a window has been resized; this event is only dispatched when the new bounds are committed, and not for in-progress changes.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (window: [Window](#type-Window)) => void
    
    *   window
        
        [Window](#type-Window)
        
    

### onCreated

chrome.windows.onCreated.addListener(  
  callback: function,  
  filters?: object,  
)

Fired when a window is created.

#### Parameters

*   callback
    
    function
    
    Chrome 46+
    
    The `callback` parameter looks like:
    
    (window: [Window](#type-Window)) => void
    
    *   window
        
        [Window](#type-Window)
        
        Details of the created window.
        
    
*   filters
    
    object optional
    
    *   windowTypes
        
        [WindowType](#type-WindowType)\[\]
        
        Conditions that the window's type being created must satisfy. By default it satisfies `['normal', 'popup']`.
        
    

### onFocusChanged

chrome.windows.onFocusChanged.addListener(  
  callback: function,  
  filters?: object,  
)

Fired when the currently focused window changes. Returns `chrome.windows.WINDOW_ID_NONE` if all Chrome windows have lost focus. **Note:** On some Linux window managers, `WINDOW_ID_NONE` is always sent immediately preceding a switch from one Chrome window to another.

#### Parameters

*   callback
    
    function
    
    Chrome 46+
    
    The `callback` parameter looks like:
    
    (windowId: number) => void
    
    *   windowId
        
        number
        
        ID of the newly-focused window.
        
    
*   filters
    
    object optional
    
    *   windowTypes
        
        [WindowType](#type-WindowType)\[\]
        
        Conditions that the window's type being removed must satisfy. By default it satisfies `['normal', 'popup']`.
        
    

### onRemoved

chrome.windows.onRemoved.addListener(  
  callback: function,  
  filters?: object,  
)

Fired when a window is removed (closed).

#### Parameters

*   callback
    
    function
    
    Chrome 46+
    
    The `callback` parameter looks like:
    
    (windowId: number) => void
    
    *   windowId
        
        number
        
        ID of the removed window.
        
    
*   filters
    
    object optional
    
    *   windowTypes
        
        [WindowType](#type-WindowType)\[\]
        
        Conditions that the window's type being removed must satisfy. By default it satisfies `['normal', 'popup']`.
        
    

Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2025-08-11 UTC.

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",1,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,116,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["OnSwitch\_\_enable","DevPro\_\_enable\_vertex\_credit\_card","Profiles\_\_enable\_recognition\_badges","BookNav\_\_enable\_tenant\_cache\_key","DevPro\_\_enable\_free\_benefits","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","MiscFeatureFlags\_\_developers\_footer\_image","Profiles\_\_enable\_complete\_playlist\_endpoint","DevPro\_\_enable\_firebase\_workspaces\_card","Concierge\_\_enable\_devsite\_llm\_tools","Profiles\_\_enable\_playlist\_community\_acl","Profiles\_\_enable\_stripe\_subscription\_management","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","Search\_\_enable\_ai\_search\_summaries\_for\_all","MiscFeatureFlags\_\_enable\_firebase\_utm","DevPro\_\_enable\_payments\_first\_batch","MiscFeatureFlags\_\_enable\_appearance\_cookies","DevPro\_\_enable\_code\_assist","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","DevPro\_\_remove\_eu\_tax\_intake\_form","Profiles\_\_enable\_callout\_notifications","Profiles\_\_enable\_purchase\_prompts","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","Cloud\_\_enable\_free\_trial\_server\_call","Cloud\_\_fast\_free\_trial","CloudShell\_\_cloud\_shell\_button","Experiments\_\_reqs\_query\_experiments","EngEduTelemetry\_\_enable\_engedu\_telemetry","Profiles\_\_enable\_completecodelab\_endpoint","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","Search\_\_enable\_page\_map","CloudShell\_\_cloud\_code\_overflow\_menu","MiscFeatureFlags\_\_emergency\_css","Profiles\_\_enable\_developer\_profiles\_callout","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","SignIn\_\_enable\_l1\_signup\_flow","Profiles\_\_enable\_profile\_collections","Concierge\_\_enable\_actions\_menu","MiscFeatureFlags\_\_developers\_footer\_dark\_image","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","Cloud\_\_enable\_cloudx\_experiment\_ids","Profiles\_\_enable\_release\_notes\_notifications","Profiles\_\_enable\_dashboard\_curated\_recommendations","Profiles\_\_enable\_auto\_apply\_credits","Cloud\_\_enable\_cloud\_shell","DevPro\_\_enable\_cloud\_innovators\_plus","Cloud\_\_cache\_serialized\_dynamic\_content","Analytics\_\_enable\_clearcut\_logging","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","Profiles\_\_enable\_public\_developer\_profiles","DevPro\_\_enable\_embed\_profile\_creation","Cloud\_\_enable\_llm\_concierge\_chat","DevPro\_\_enable\_enterprise","DevPro\_\_enable\_devpro\_offers","Concierge\_\_enable\_pushui","Search\_\_enable\_dynamic\_content\_confidential\_banner","Search\_\_enable\_ai\_eligibility\_checks","Profiles\_\_enable\_page\_saving","TpcFeatures\_\_proxy\_prod\_host","DevPro\_\_enable\_google\_one\_card","MiscFeatureFlags\_\_enable\_project\_variables","DevPro\_\_enable\_developer\_subscriptions","Profiles\_\_enable\_completequiz\_endpoint","Profiles\_\_require\_profile\_eligibility\_for\_signin","DevPro\_\_enable\_nvidia\_credits\_card","MiscFeatureFlags\_\_enable\_llms\_txt","Profiles\_\_enable\_join\_program\_group\_endpoint","MiscFeatureFlags\_\_enable\_variable\_operator","Search\_\_enable\_suggestions\_from\_borg","Concierge\_\_enable\_remove\_info\_panel\_tags","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","MiscFeatureFlags\_\_enable\_view\_transitions","Cloud\_\_enable\_legacy\_calculator\_redirect","MiscFeatureFlags\_\_enable\_explain\_this\_code","Cloud\_\_enable\_cloud\_dlp\_service","Profiles\_\_enable\_awarding\_url","Profiles\_\_enable\_user\_type","DevPro\_\_enable\_google\_payments\_buyflow"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

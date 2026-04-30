# chrome.sidePanel

**Source:** https://developer.chrome.com/docs/extensions/reference/api/sidePanel

---

Description
-----------

Use the `chrome.sidePanel` API to host content in the browser's side panel alongside the main content of a webpage.

Permissions
-----------

`sidePanel`  

To use the Side Panel API, add the `"sidePanel"` permission in the extension [manifest](/docs/extensions/reference/manifest) file:

manifest.json:

{
      "name": "My side panel extension",
      ...
      "permissions": [
        "sidePanel"
      ]
    }

Availability
------------

Chrome 114+ MV3+

Concepts and usage
------------------

The Side Panel API allows extensions to display their own UI in the side panel, enabling persistent experiences that complement the user's browsing journey.

![Side panel drop-down menu](/static/docs/extensions/reference/api/sidePanel/images/example-side-panel.png)

Chrome browser side panel UI.

Some features include:

*   The side panel remains open when navigating between tabs (if set to do so).
*   It can be available only on specific websites.
*   As an extension page, side panels have access to all Chrome APIs.
*   Within Chrome's settings, users can specify which side the panel should be displayed on.

### Use cases

The following sections demonstrate some common use cases for the Side Panel API. See [Extension samples](#examples) for complete extension examples.

#### Display the same side panel on every site

The side panel can be set initially from the `"default_path"` property in the `"side_panel"` key of the manifest to display the same side panel on every site. This should point to a relative path within the extension directory.

manifest.json:

{
      "name": "My side panel extension",
      ...
      "side_panel": {
        "default_path": "sidepanel.html"
      }
      ...
    }

sidepanel.html:

<!DOCTYPE html>
    <html>
      <head>
        <title>My Sidepanel</title>
      </head>
      <body>
        <h1>All sites sidepanel extension</h1>
        <p>This side panel is enabled on all sites</p>
      </body>
    </html>

#### Enable a side panel on a specific site

An extension can use [`sidepanel.setOptions()`](#method-setOptions) to enable a side panel on a specific tab. This example uses [`chrome.tabs.onUpdated()`](/docs/extensions/reference/api/tabs#event-onUpdated) to listen for any updates made to the tab. It checks if the URL is [www.google.com](https://www.google.com) and enables the side panel. Otherwise, it disables it.

service-worker.js:

const GOOGLE_ORIGIN = 'https://www.google.com';
    
    chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
      if (!tab.url) return;
      const url = new URL(tab.url);
      // Enables the side panel on google.com
      if (url.origin === GOOGLE_ORIGIN) {
        await chrome.sidePanel.setOptions({
          tabId,
          path: 'sidepanel.html',
          enabled: true
        });
      } else {
        // Disables the side panel on all other sites
        await chrome.sidePanel.setOptions({
          tabId,
          enabled: false
        });
      }
    });

When a user temporarily switches to a tab where the side panel is not enabled, the side panel will be hidden. It will automatically show again when the user switches to a tab where it was previously open.

When the user navigates to a site where the side panel is not enabled, the side panel will close, and the extension won't show in the side panel drop-down menu.

For a complete example, see the [Tab-specific side panel](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/cookbook.sidepanel-site-specific) sample.

#### Open the side panel by clicking the toolbar icon

Developers can allow users to open the side panel when they click the action toolbar icon with [`sidePanel.setPanelBehavior()`](#method-setPanelBehavior). First, declare the `"action"` key in the manifest:

manifest.json:

{
      "name": "My side panel extension",
      ...
      "action": {
        "default_title": "Click to open panel"
      },
      ...
    }

Now, add this code to the previous example:

service-worker.js:

const GOOGLE_ORIGIN = 'https://www.google.com';
    
    // Allows users to open the side panel by clicking on the action toolbar icon
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error(error));
    ...

#### Programmatically open the side panel on user interaction

Chrome 116 introduces [`sidePanel.open()`](#method-open). It allows extensions to open the side panel through an extension user gesture, such as [clicking on the action icon](/docs/extensions/reference/api/action). Or a user interaction on an extension page or [content script](/docs/extensions/develop/concepts/content-scripts), such as clicking a button. For a complete demo, see the [Open Side Panel](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/cookbook.sidepanel-open) sample extension.

The following code shows how to open a global side panel on the current window when the user clicks on a context menu. When using [`sidePanel.open()`](#method-open), you must choose the context in which it should open. Use [`windowId`](#property-OpenOptions-windowId) to open a global side panel. Alternatively, set the [`tabId`](#property-OpenOptions-tabId) to open the side panel only on a specific tab.

service-worker.js:

chrome.runtime.onInstalled.addListener(() => {
      chrome.contextMenus.create({
        id: 'openSidePanel',
        title: 'Open side panel',
        contexts: ['all']
      });
    });
    
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'openSidePanel') {
        // This will open the panel in all the pages on the current window.
        chrome.sidePanel.open({ windowId: tab.windowId });
      }
    });

**Key point:** Remember to design your side panel as a useful companion tool for users, improving their browsing experience without unnecessary distractions. Check the [Quality Guidelines](/docs/webstore/program-policies/quality-guidelines) in the Program Policies for more info.

#### Switch to a different panel

Extensions can use [`sidepanel.getOptions()`](#method-getOptions) to retrieve the current side panel. The following example sets a welcome side panel on [`runtime.onInstalled()`](/docs/extensions/reference/api/runtime#event-onInstalled). Then when the user navigates to a different tab, it replaces it with the main side panel.

service-worker.js:

const welcomePage = 'sidepanels/welcome-sp.html';
    const mainPage = 'sidepanels/main-sp.html';
    
    chrome.runtime.onInstalled.addListener(() => {
      chrome.sidePanel.setOptions({ path: welcomePage });
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    });
    
    chrome.tabs.onActivated.addListener(async ({ tabId }) => {
      const { path } = await chrome.sidePanel.getOptions({ tabId });
      if (path === welcomePage) {
        chrome.sidePanel.setOptions({ path: mainPage });
      }
    });

See the [Multiple side panels](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/cookbook.sidepanel-multiple) sample for the full code.

### Side panel user experience

Users will see Chrome's built-in side panels first. Each side panel displays the extension's icon in the side panel menu. If no icons are included, it will show a placeholder icon with the first letter of the extension's name.

#### Open the side panel

To allow users to open the side panel, use an action icon in combination with [`sidePanel.setPanelBehavior()`](#open-action-icon). Alternatively, make a call to [`sidePanel.open()`](#user-interaction) following a user interaction, such as:

*   An [action click](/docs/extensions/reference/api/action)
*   A [keyboard shortcut](/docs/extensions/reference/api/commands)
*   A [context menu](/docs/extensions/reference/api/contextMenus)
*   A [user gesture](#user-interaction) on an extension page or content script.

#### Pin the side panel

![Pin icon in side panel UI.](/static/docs/extensions/reference/api/sidePanel/images/side-panel-pin.png)

Pin icon in side panel UI.

The side panel toolbar displays a pin icon when your side panel is open. Clicking the icon pins your extension's action icon. Clicking the action icon once pinned will perform the default action for your action icon and will only open the side panel if this has been explicitly configured.

Examples
--------

For more Side Panel API extensions demos, explore any of the following extensions:

*   [Dictionary side panel](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/sample.sidepanel-dictionary).
*   [Global side panel](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/cookbook.sidepanel-global).
*   [Multiple side panels](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/cookbook.sidepanel-multiple).
*   [Open Side panel](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/cookbook.sidepanel-open).
*   [Site-specific side panel](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/cookbook.sidepanel-site-specific).

Types
-----

### CloseOptions

Chrome 141+

#### Properties

*   tabId
    
    number optional
    
    The tab in which to close the side panel. If a tab-specific side panel is open in the specified tab, it will be closed for that tab. If only the global side panel is open, the promise returned by the call to `close()` will reject with an error. This behavior was changed in Chrome 145, with prior versions falling back to closing the global panel. At least one of this or `windowId` must be provided.
    
*   windowId
    
    number optional
    
    The window in which to close the side panel. If a global side panel is open in the specified window, it will be closed for all tabs in that window where no tab-specific panel is active. At least one of this or `tabId` must be provided.
    

### GetPanelOptions

#### Properties

*   tabId
    
    number optional
    
    If specified, the side panel options for the given tab will be returned. Otherwise, returns the default side panel options (used for any tab that doesn't have specific settings).
    

### OpenOptions

Chrome 116+

#### Properties

*   tabId
    
    number optional
    
    The tab in which to open the side panel. If the corresponding tab has a tab-specific side panel, the panel will only be open for that tab. If there is not a tab-specific panel, the global panel will be open in the specified tab and any other tabs without a currently-open tab- specific panel. This will override any currently-active side panel (global or tab-specific) in the corresponding tab. At least one of this or `windowId` must be provided.
    
*   windowId
    
    number optional
    
    The window in which to open the side panel. This is only applicable if the extension has a global (non-tab-specific) side panel or `tabId` is also specified. This will override any currently-active global side panel the user has open in the given window. At least one of this or `tabId` must be provided.
    

### PanelBehavior

#### Properties

*   openPanelOnActionClick
    
    boolean optional
    
    Whether clicking the extension's icon will toggle showing the extension's entry in the side panel. Defaults to false.
    

### PanelClosedInfo

Chrome 142+

#### Properties

*   path
    
    string
    
    The path of the local resource within the extension package whose content is displayed in the panel.
    
*   tabId
    
    number optional
    
    The optional ID of the tab where the side panel was closed. This is provided only when the panel is tab-specific.
    
*   windowId
    
    number
    
    The ID of the window where the side panel was closed. This is available for both global and tab-specific panels.
    

### PanelLayout

Chrome 140+

#### Properties

*   side
    
    [Side](#type-Side)
    

### PanelOpenedInfo

Chrome 141+

#### Properties

*   path
    
    string
    
    The path of the local resource within the extension package whose content is displayed in the panel.
    
*   tabId
    
    number optional
    
    The optional ID of the tab where the side panel is opened. This is provided only when the panel is tab-specific.
    
*   windowId
    
    number
    
    The ID of the window where the side panel is opened. This is available for both global and tab-specific panels.
    

### PanelOptions

#### Properties

*   enabled
    
    boolean optional
    
    Whether the side panel should be enabled. This is optional. The default value is true.
    
*   path
    
    string optional
    
    The path to the side panel HTML file to use. This must be a local resource within the extension package.
    
*   tabId
    
    number optional
    
    If specified, the side panel options will only apply to the tab with this id. If omitted, these options set the default behavior (used for any tab that doesn't have specific settings). Note: if the same path is set for this tabId and the default tabId, then the panel for this tabId will be a different instance than the panel for the default tabId.
    

### Side

Chrome 140+

Defines the possible alignment for the side panel in the browser UI.

#### Enum

"left"  

"right"  

### SidePanel

#### Properties

*   default\_path
    
    string
    
    Developer specified path for side panel display.
    

Methods
-------

### close()

Chrome 141+

chrome.sidePanel.close(  
  options: [CloseOptions](#type-CloseOptions),  
): Promise<void>

Closes the extension's side panel. This is a no-op if the panel is already closed.

#### Parameters

*   options
    
    [CloseOptions](#type-CloseOptions)
    
    Specifies the context in which to close the side panel.
    

#### Returns

*   Promise<void>
    
    Returns a Promise which resolves when the side panel has been closed.
    

### getLayout()

Chrome 140+

chrome.sidePanel.getLayout(): Promise<[PanelLayout](#type-PanelLayout)\>

Returns the side panel's current layout.

#### Returns

*   Promise<[PanelLayout](#type-PanelLayout)\>
    
    Returns a Promise which resolves with a [`PanelLayout`](#type-PanelLayout).
    

### getOptions()

chrome.sidePanel.getOptions(  
  options: [GetPanelOptions](#type-GetPanelOptions),  
): Promise<[PanelOptions](#type-PanelOptions)\>

Returns the active panel configuration.

#### Parameters

*   options
    
    [GetPanelOptions](#type-GetPanelOptions)
    
    Specifies the context to return the configuration for.
    

#### Returns

*   Promise<[PanelOptions](#type-PanelOptions)\>
    
    Returns a Promise which resolves with the active panel configuration.
    

### getPanelBehavior()

chrome.sidePanel.getPanelBehavior(): Promise<[PanelBehavior](#type-PanelBehavior)\>

Returns the extension's current side panel behavior.

#### Returns

*   Promise<[PanelBehavior](#type-PanelBehavior)\>
    
    Returns a Promise which resolves with the extension's side panel behavior.
    

### open()

Chrome 116+

chrome.sidePanel.open(  
  options: [OpenOptions](#type-OpenOptions),  
): Promise<void>

Opens the side panel for the extension. This may only be called in response to a user action.

#### Parameters

*   options
    
    [OpenOptions](#type-OpenOptions)
    
    Specifies the context in which to open the side panel.
    

#### Returns

*   Promise<void>
    
    Returns a Promise which resolves when the side panel has been opened.
    

### setOptions()

chrome.sidePanel.setOptions(  
  options: [PanelOptions](#type-PanelOptions),  
): Promise<void>

Configures the side panel.

#### Parameters

*   options
    
    [PanelOptions](#type-PanelOptions)
    
    The configuration options to apply to the panel.
    

#### Returns

*   Promise<void>
    
    Returns a Promise which resolves when the options have been set.
    

### setPanelBehavior()

chrome.sidePanel.setPanelBehavior(  
  behavior: [PanelBehavior](#type-PanelBehavior),  
): Promise<void>

Configures the extension's side panel behavior. This is an upsert operation.

#### Parameters

*   behavior
    
    [PanelBehavior](#type-PanelBehavior)
    
    The new behavior to be set.
    

#### Returns

*   Promise<void>
    
    Returns a Promise which resolves when the new behavior has been set.
    

Events
------

### onClosed

Chrome 142+

chrome.sidePanel.onClosed.addListener(  
  callback: function,  
)

Fired when the extension's side panel is closed.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (info: [PanelClosedInfo](#type-PanelClosedInfo)) => void
    
    *   info
        
        [PanelClosedInfo](#type-PanelClosedInfo)
        
    

### onOpened

Chrome 141+

chrome.sidePanel.onOpened.addListener(  
  callback: function,  
)

Fired when the extension's side panel is opened.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (info: [PanelOpenedInfo](#type-PanelOpenedInfo)) => void
    
    *   info
        
        [PanelOpenedInfo](#type-PanelOpenedInfo)
        
    

Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2026-01-19 UTC.

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",1,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,116,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["BookNav\_\_enable\_tenant\_cache\_key","MiscFeatureFlags\_\_enable\_variable\_operator","Cloud\_\_enable\_free\_trial\_server\_call","Profiles\_\_enable\_page\_saving","Experiments\_\_reqs\_query\_experiments","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","EngEduTelemetry\_\_enable\_engedu\_telemetry","MiscFeatureFlags\_\_enable\_explain\_this\_code","Search\_\_enable\_suggestions\_from\_borg","Search\_\_enable\_ai\_search\_summaries\_for\_all","OnSwitch\_\_enable","Cloud\_\_enable\_cloud\_dlp\_service","DevPro\_\_enable\_devpro\_offers","MiscFeatureFlags\_\_developers\_footer\_dark\_image","DevPro\_\_enable\_payments\_first\_batch","CloudShell\_\_cloud\_code\_overflow\_menu","Profiles\_\_enable\_awarding\_url","Profiles\_\_require\_profile\_eligibility\_for\_signin","Profiles\_\_enable\_join\_program\_group\_endpoint","Profiles\_\_enable\_stripe\_subscription\_management","Concierge\_\_enable\_remove\_info\_panel\_tags","Search\_\_enable\_ai\_eligibility\_checks","Profiles\_\_enable\_playlist\_community\_acl","TpcFeatures\_\_proxy\_prod\_host","Profiles\_\_enable\_release\_notes\_notifications","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","MiscFeatureFlags\_\_enable\_project\_variables","DevPro\_\_enable\_embed\_profile\_creation","DevPro\_\_enable\_cloud\_innovators\_plus","Profiles\_\_enable\_purchase\_prompts","MiscFeatureFlags\_\_enable\_view\_transitions","DevPro\_\_remove\_eu\_tax\_intake\_form","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","Search\_\_enable\_page\_map","Profiles\_\_enable\_callout\_notifications","Cloud\_\_enable\_cloudx\_experiment\_ids","Cloud\_\_cache\_serialized\_dynamic\_content","Profiles\_\_enable\_recognition\_badges","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","MiscFeatureFlags\_\_emergency\_css","Cloud\_\_enable\_legacy\_calculator\_redirect","Profiles\_\_enable\_profile\_collections","Concierge\_\_enable\_actions\_menu","Profiles\_\_enable\_developer\_profiles\_callout","Cloud\_\_fast\_free\_trial","DevPro\_\_enable\_code\_assist","DevPro\_\_enable\_enterprise","MiscFeatureFlags\_\_enable\_firebase\_utm","Concierge\_\_enable\_devsite\_llm\_tools","DevPro\_\_enable\_developer\_subscriptions","MiscFeatureFlags\_\_developers\_footer\_image","Concierge\_\_enable\_pushui","Search\_\_enable\_dynamic\_content\_confidential\_banner","MiscFeatureFlags\_\_enable\_appearance\_cookies","DevPro\_\_enable\_google\_one\_card","Profiles\_\_enable\_completecodelab\_endpoint","Profiles\_\_enable\_auto\_apply\_credits","DevPro\_\_enable\_free\_benefits","MiscFeatureFlags\_\_enable\_llms\_txt","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","Cloud\_\_enable\_llm\_concierge\_chat","Profiles\_\_enable\_completequiz\_endpoint","DevPro\_\_enable\_nvidia\_credits\_card","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","CloudShell\_\_cloud\_shell\_button","DevPro\_\_enable\_google\_payments\_buyflow","Profiles\_\_enable\_public\_developer\_profiles","DevPro\_\_enable\_vertex\_credit\_card","DevPro\_\_enable\_firebase\_workspaces\_card","Analytics\_\_enable\_clearcut\_logging","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","Cloud\_\_enable\_cloud\_shell","SignIn\_\_enable\_l1\_signup\_flow","Profiles\_\_enable\_dashboard\_curated\_recommendations","Profiles\_\_enable\_user\_type","Profiles\_\_enable\_complete\_playlist\_endpoint"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

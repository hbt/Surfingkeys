# chrome.contextMenus

**Source:** https://developer.chrome.com/docs/extensions/reference/api/contextMenus

---

Description
-----------

Use the `chrome.contextMenus` API to add items to Google Chrome's context menu. You can choose what types of objects your context menu additions apply to, such as images, hyperlinks, and pages.

Permissions
-----------

`contextMenus`  

You must declare the `"contextMenus"` permission in your extension's manifest to use the API. Also, you should specify a 16 by 16-pixel icon for display next to your menu item. For example:

{
      "name": "My extension",
      ...
      "permissions": [
        "contextMenus"
      ],
      "icons": {
        "16": "icon-bitty.png",
        "48": "icon-small.png",
        "128": "icon-large.png"
      },
      ...
    }

Concepts and usage
------------------

Context menu items can appear in any document (or frame within a document), even those with file:// or chrome:// URLs. To control which documents your items can appear in, specify the `documentUrlPatterns` field when you call the `create()` or `update()` methods.

You can create as many context menu items as you need, but if more than one from your extension is visible at once, Google Chrome automatically collapses them into a single parent menu.

Examples
--------

To try this API, install the [contextMenus API example](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/contextMenus) from the [chrome-extension-samples](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples) repository.

Types
-----

### ContextType

Chrome 44+

The different contexts a menu can appear in. Specifying 'all' is equivalent to the combination of all other contexts except for 'launcher'. The 'launcher' context is only supported by apps and is used to add menu items to the context menu that appears when clicking the app icon in the launcher/taskbar/dock/etc. Different platforms might put limitations on what is actually supported in a launcher context menu.

#### Enum

"all"  

"page"  

"frame"  

"selection"  

"link"  

"editable"  

"image"  

"video"  

"audio"  

"launcher"  

"browser\_action"  

"page\_action"  

"action"  

### CreateProperties

Chrome 123+

Properties of the new context menu item.

#### Properties

*   checked
    
    boolean optional
    
    The initial state of a checkbox or radio button: `true` for selected, `false` for unselected. Only one radio button can be selected at a time in a given group.
    
*   contexts
    
    \[[ContextType](#type-ContextType), ...[ContextType](#type-ContextType)\[\]\] optional
    
    List of contexts this menu item will appear in. Defaults to `['page']`.
    
*   documentUrlPatterns
    
    string\[\] optional
    
    Restricts the item to apply only to documents or frames whose URL matches one of the given patterns. For details on pattern formats, see [Match Patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns).
    
*   enabled
    
    boolean optional
    
    Whether this context menu item is enabled or disabled. Defaults to `true`.
    
*   id
    
    string optional
    
    The unique ID to assign to this item. Mandatory for event pages. Cannot be the same as another ID for this extension.
    
*   parentId
    
    string | number optional
    
    The ID of a parent menu item; this makes the item a child of a previously added item.
    
*   targetUrlPatterns
    
    string\[\] optional
    
    Similar to `documentUrlPatterns`, filters based on the `src` attribute of `img`, `audio`, and `video` tags and the `href` attribute of `a` tags.
    
*   title
    
    string optional
    
    The text to display in the item; this is _required_ unless `type` is `separator`. When the context is `selection`, use `%s` within the string to show the selected text. For example, if this parameter's value is "Translate '%s' to Pig Latin" and the user selects the word "cool", the context menu item for the selection is "Translate 'cool' to Pig Latin".
    
*   type
    
    [ItemType](#type-ItemType) optional
    
    The type of menu item. Defaults to `normal`.
    
*   visible
    
    boolean optional
    
    Whether the item is visible in the menu.
    
*   onclick
    
    void optional
    
    A function that is called back when the menu item is clicked. This is not available inside of a service worker; instead, you should register a listener for [`contextMenus.onClicked`](#event-onClicked).
    
    The `onclick` function looks like:
    
    (info: [OnClickData](#type-OnClickData), tab: [Tab](https://developer.chrome.com/docs/extensions/reference/tabs/#type-Tab)) => {...}
    
    *   info
        
        [OnClickData](#type-OnClickData)
        
        Information about the item clicked and the context where the click happened.
        
    *   tab
        
        [Tab](https://developer.chrome.com/docs/extensions/reference/tabs/#type-Tab)
        
        The details of the tab where the click took place. This parameter is not present for platform apps.
        
    

### ItemType

Chrome 44+

The type of menu item.

#### Enum

"normal"  

"checkbox"  

"radio"  

"separator"  

### OnClickData

Information sent when a context menu item is clicked.

#### Properties

*   checked
    
    boolean optional
    
    A flag indicating the state of a checkbox or radio item after it is clicked.
    
*   editable
    
    boolean
    
    A flag indicating whether the element is editable (text input, textarea, etc.).
    
*   frameId
    
    number optional
    
    Chrome 51+
    
    The [ID of the frame](https://developer.chrome.com/docs/extensions/reference/webNavigation/#frame_ids) of the element where the context menu was clicked, if it was in a frame.
    
*   frameUrl
    
    string optional
    
    The URL of the frame of the element where the context menu was clicked, if it was in a frame.
    
*   linkUrl
    
    string optional
    
    If the element is a link, the URL it points to.
    
*   mediaType
    
    string optional
    
    One of 'image', 'video', or 'audio' if the context menu was activated on one of these types of elements.
    
*   menuItemId
    
    string | number
    
    The ID of the menu item that was clicked.
    
*   pageUrl
    
    string optional
    
    The URL of the page where the menu item was clicked. This property is not set if the click occured in a context where there is no current page, such as in a launcher context menu.
    
*   parentMenuItemId
    
    string | number optional
    
    The parent ID, if any, for the item clicked.
    
*   selectionText
    
    string optional
    
    The text for the context selection, if any.
    
*   srcUrl
    
    string optional
    
    Will be present for elements with a 'src' URL.
    
*   wasChecked
    
    boolean optional
    
    A flag indicating the state of a checkbox or radio item before it was clicked.
    

Properties
----------

### ACTION\_MENU\_TOP\_LEVEL\_LIMIT

The maximum number of top level extension items that can be added to an extension action context menu. Any items beyond this limit will be ignored.

#### Value

6  

Methods
-------

### create()

chrome.contextMenus.create(  
  createProperties: [CreateProperties](#type-CreateProperties),  
  callback?: function,  
): number | string

Creates a new context menu item. If an error occurs during creation, it may not be detected until the creation callback fires; details will be in [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/runtime/#property-lastError).

#### Parameters

*   createProperties
    
    [CreateProperties](#type-CreateProperties)
    
*   callback
    
    function optional
    
    The `callback` parameter looks like:
    
    () => void
    

#### Returns

*   number | string
    
    The ID of the newly created item.
    

### remove()

chrome.contextMenus.remove(  
  menuItemId: string | number,  
): Promise<void>

Removes a context menu item.

#### Parameters

*   menuItemId
    
    string | number
    
    The ID of the context menu item to remove.
    

#### Returns

*   Promise<void>
    
    Chrome 123+
    
    Resolves when the context menu has been removed.
    

### removeAll()

chrome.contextMenus.removeAll(): Promise<void>

Removes all context menu items added by this extension.

#### Returns

*   Promise<void>
    
    Chrome 123+
    
    Resolves when removal is complete.
    

### update()

chrome.contextMenus.update(  
  id: string | number,  
  updateProperties: object,  
): Promise<void>

Updates a previously created context menu item.

#### Parameters

*   id
    
    string | number
    
    The ID of the item to update.
    
*   updateProperties
    
    object
    
    The properties to update. Accepts the same values as the [`contextMenus.create`](#method-create) function.
    
    *   checked
        
        boolean optional
        
    *   contexts
        
        \[[ContextType](#type-ContextType), ...[ContextType](#type-ContextType)\[\]\] optional
        
    *   documentUrlPatterns
        
        string\[\] optional
        
    *   enabled
        
        boolean optional
        
    *   parentId
        
        string | number optional
        
        The ID of the item to be made this item's parent. Note: You cannot set an item to become a child of its own descendant.
        
    *   targetUrlPatterns
        
        string\[\] optional
        
    *   title
        
        string optional
        
    *   type
        
        [ItemType](#type-ItemType) optional
        
    *   visible
        
        boolean optional
        
        Chrome 62+
        
        Whether the item is visible in the menu.
        
    *   onclick
        
        void optional
        
        The `onclick` function looks like:
        
        (info: [OnClickData](#type-OnClickData), tab: [Tab](https://developer.chrome.com/docs/extensions/reference/tabs/#type-Tab)) => {...}
        
        *   info
            
            [OnClickData](#type-OnClickData)
            
            Chrome 44+
            
        *   tab
            
            [Tab](https://developer.chrome.com/docs/extensions/reference/tabs/#type-Tab)
            
            Chrome 44+
            
            The details of the tab where the click took place. This parameter is not present for platform apps.
            
        
    

#### Returns

*   Promise<void>
    
    Chrome 123+
    
    Resolves when the context menu has been updated.
    

Events
------

### onClicked

chrome.contextMenus.onClicked.addListener(  
  callback: function,  
)

Fired when a context menu item is clicked.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (info: [OnClickData](#type-OnClickData), tab?: [tabs.Tab](https://developer.chrome.com/docs/extensions/reference/tabs/#type-Tab)) => void
    
    *   info
        
        [OnClickData](#type-OnClickData)
        
    *   tab
        
        [tabs.Tab](https://developer.chrome.com/docs/extensions/reference/tabs/#type-Tab) optional
        
    

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,116,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["Cloud\_\_enable\_llm\_concierge\_chat","Search\_\_enable\_ai\_eligibility\_checks","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","MiscFeatureFlags\_\_enable\_project\_variables","Profiles\_\_enable\_user\_type","MiscFeatureFlags\_\_emergency\_css","MiscFeatureFlags\_\_developers\_footer\_image","Cloud\_\_enable\_free\_trial\_server\_call","Profiles\_\_enable\_profile\_collections","Cloud\_\_fast\_free\_trial","Cloud\_\_cache\_serialized\_dynamic\_content","DevPro\_\_enable\_payments\_first\_batch","DevPro\_\_enable\_code\_assist","Profiles\_\_enable\_completecodelab\_endpoint","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","Concierge\_\_enable\_pushui","Experiments\_\_reqs\_query\_experiments","Profiles\_\_enable\_playlist\_community\_acl","OnSwitch\_\_enable","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","Search\_\_enable\_suggestions\_from\_borg","SignIn\_\_enable\_l1\_signup\_flow","Search\_\_enable\_page\_map","Profiles\_\_enable\_developer\_profiles\_callout","DevPro\_\_enable\_cloud\_innovators\_plus","MiscFeatureFlags\_\_enable\_llms\_txt","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","TpcFeatures\_\_proxy\_prod\_host","Concierge\_\_enable\_remove\_info\_panel\_tags","Profiles\_\_enable\_dashboard\_curated\_recommendations","DevPro\_\_enable\_enterprise","Profiles\_\_enable\_join\_program\_group\_endpoint","Concierge\_\_enable\_devsite\_llm\_tools","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","Search\_\_enable\_dynamic\_content\_confidential\_banner","Profiles\_\_enable\_awarding\_url","Profiles\_\_require\_profile\_eligibility\_for\_signin","Profiles\_\_enable\_release\_notes\_notifications","MiscFeatureFlags\_\_developers\_footer\_dark\_image","Cloud\_\_enable\_cloudx\_experiment\_ids","DevPro\_\_remove\_eu\_tax\_intake\_form","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","CloudShell\_\_cloud\_shell\_button","Profiles\_\_enable\_callout\_notifications","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","Search\_\_enable\_ai\_search\_summaries\_for\_all","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","Profiles\_\_enable\_completequiz\_endpoint","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","Cloud\_\_enable\_legacy\_calculator\_redirect","DevPro\_\_enable\_devpro\_offers","DevPro\_\_enable\_free\_benefits","Profiles\_\_enable\_complete\_playlist\_endpoint","MiscFeatureFlags\_\_enable\_explain\_this\_code","Concierge\_\_enable\_actions\_menu","Profiles\_\_enable\_recognition\_badges","Profiles\_\_enable\_public\_developer\_profiles","DevPro\_\_enable\_vertex\_credit\_card","DevPro\_\_enable\_google\_payments\_buyflow","Cloud\_\_enable\_cloud\_shell","DevPro\_\_enable\_nvidia\_credits\_card","MiscFeatureFlags\_\_enable\_firebase\_utm","Profiles\_\_enable\_page\_saving","MiscFeatureFlags\_\_enable\_variable\_operator","CloudShell\_\_cloud\_code\_overflow\_menu","Cloud\_\_enable\_cloud\_dlp\_service","Analytics\_\_enable\_clearcut\_logging","MiscFeatureFlags\_\_enable\_view\_transitions","DevPro\_\_enable\_google\_one\_card","DevPro\_\_enable\_firebase\_workspaces\_card","EngEduTelemetry\_\_enable\_engedu\_telemetry","DevPro\_\_enable\_developer\_subscriptions","Profiles\_\_enable\_auto\_apply\_credits","Profiles\_\_enable\_purchase\_prompts","BookNav\_\_enable\_tenant\_cache\_key","DevPro\_\_enable\_embed\_profile\_creation","Profiles\_\_enable\_stripe\_subscription\_management","MiscFeatureFlags\_\_enable\_appearance\_cookies"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

# chrome.history

**Source:** https://developer.chrome.com/docs/extensions/reference/api/history

---

Description
-----------

Use the `chrome.history` API to interact with the browser's record of visited pages. You can add, remove, and query for URLs in the browser's history. To override the history page with your own version, see [Override Pages](https://developer.chrome.com/extensions/develop/ui/override-chrome-pages).

Permissions
-----------

`history`  

To interact with the user's browser history, use the history API.

To use the history API, declare the `"history"` permission in the [extension manifest](/docs/extensions/mv3/manifest). For example:

{
      "name": "My extension",
      ...
      "permissions": [
        "history"
      ],
      ...
    }

Concepts and usage
------------------

### Transition types

The history API uses transition types to describe how the browser navigated to a particular URL on a particular visit. For example, if a user visits a page by clicking a link on another page, the transition type is "link". See the [reference content](#type-TransitionType) for a list of transition types.

Examples
--------

To try this API, install the [history API example](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/history) from the [chrome-extension-samples](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples) repository.

Types
-----

### HistoryItem

An object encapsulating one result of a history query.

#### Properties

*   id
    
    string
    
    The unique identifier for the item.
    
*   lastVisitTime
    
    number optional
    
    When this page was last loaded, represented in milliseconds since the epoch.
    
*   title
    
    string optional
    
    The title of the page when it was last loaded.
    
*   typedCount
    
    number optional
    
    The number of times the user has navigated to this page by typing in the address.
    
*   url
    
    string optional
    
    The URL navigated to by a user.
    
*   visitCount
    
    number optional
    
    The number of times the user has navigated to this page.
    

### TransitionType

Chrome 44+

The [transition type](https://developer.chrome.com/docs/extensions/reference/history/#transition_types) for this visit from its referrer.

#### Enum

"link"  
The user arrived at this page by clicking a link on another page.

"typed"  
The user arrived at this page by typing the URL in the address bar. This is also used for other explicit navigation actions.

"auto\_bookmark"  
The user arrived at this page through a suggestion in the UI, for example, through a menu item.

"auto\_subframe"  
The user arrived at this page through subframe navigation that they didn't request, such as through an ad loading in a frame on the previous page. These don't always generate new navigation entries in the back and forward menus.

"manual\_subframe"  
The user arrived at this page by selecting something in a subframe.

"generated"  
The user arrived at this page by typing in the address bar and selecting an entry that didn't look like a URL, such as a Google Search suggestion. For example, a match might have the URL of a Google Search result page, but it might appear to the user as "Search Google for ...". These are different from typed navigations because the user didn't type or see the destination URL. They're also related to keyword navigations.

"auto\_toplevel"  
The page was specified in the command line or is the start page.

"form\_submit"  
The user arrived at this page by filling out values in a form and submitting the form. Not all form submissions use this transition type.

"reload"  
The user reloaded the page, either by clicking the reload button or by pressing Enter in the address bar. Session restore and Reopen closed tab also use this transition type.

"keyword"  
The URL for this page was generated from a replaceable keyword other than the default search provider.

"keyword\_generated"  
Corresponds to a visit generated for a keyword.

### UrlDetails

Chrome 88+

#### Properties

*   url
    
    string
    
    The URL for the operation. It must be in the format as returned from a call to `history.search()`.
    

### VisitItem

An object encapsulating one visit to a URL.

#### Properties

*   id
    
    string
    
    The unique identifier for the corresponding [`history.HistoryItem`](#type-HistoryItem).
    
*   isLocal
    
    boolean
    
    Chrome 115+
    
    True if the visit originated on this device. False if it was synced from a different device.
    
*   referringVisitId
    
    string
    
    The visit ID of the referrer.
    
*   transition
    
    [TransitionType](#type-TransitionType)
    
    The [transition type](https://developer.chrome.com/docs/extensions/reference/history/#transition_types) for this visit from its referrer.
    
*   visitId
    
    string
    
    The unique identifier for this visit.
    
*   visitTime
    
    number optional
    
    When this visit occurred, represented in milliseconds since the epoch.
    

Methods
-------

### addUrl()

chrome.history.addUrl(  
  details: [UrlDetails](#type-UrlDetails),  
): Promise<void>

Adds a URL to the history at the current time with a [transition type](https://developer.chrome.com/docs/extensions/reference/history/#transition_types) of "link".

#### Parameters

*   details
    
    [UrlDetails](#type-UrlDetails)
    

#### Returns

*   Promise<void>
    
    Chrome 96+
    

### deleteAll()

chrome.history.deleteAll(): Promise<void>

Deletes all items from the history.

#### Returns

*   Promise<void>
    
    Chrome 96+
    

### deleteRange()

chrome.history.deleteRange(  
  range: object,  
): Promise<void>

Removes all items within the specified date range from the history. Pages will not be removed from the history unless all visits fall within the range.

#### Parameters

*   range
    
    object
    
    *   endTime
        
        number
        
        Items added to history before this date, represented in milliseconds since the epoch.
        
    *   startTime
        
        number
        
        Items added to history after this date, represented in milliseconds since the epoch.
        
    

#### Returns

*   Promise<void>
    
    Chrome 96+
    

### deleteUrl()

chrome.history.deleteUrl(  
  details: [UrlDetails](#type-UrlDetails),  
): Promise<void>

Removes all occurrences of the given URL from the history.

#### Parameters

*   details
    
    [UrlDetails](#type-UrlDetails)
    

#### Returns

*   Promise<void>
    
    Chrome 96+
    

### getVisits()

chrome.history.getVisits(  
  details: [UrlDetails](#type-UrlDetails),  
): Promise<[VisitItem](#type-VisitItem)\[\]\>

Retrieves information about visits to a URL.

#### Parameters

*   details
    
    [UrlDetails](#type-UrlDetails)
    

#### Returns

*   Promise<[VisitItem](#type-VisitItem)\[\]>
    
    Chrome 96+
    

### search()

chrome.history.search(  
  query: object,  
): Promise<[HistoryItem](#type-HistoryItem)\[\]\>

Searches the history for the last visit time of each page matching the query.

#### Parameters

*   query
    
    object
    
    *   endTime
        
        number optional
        
        Limit results to those visited before this date, represented in milliseconds since the epoch.
        
    *   maxResults
        
        number optional
        
        The maximum number of results to retrieve. Defaults to 100.
        
    *   startTime
        
        number optional
        
        Limit results to those visited after this date, represented in milliseconds since the epoch. If property is not specified, it will default to 24 hours.
        
    *   text
        
        string
        
        A free-text query to the history service. Leave this empty to retrieve all pages.
        
    

#### Returns

*   Promise<[HistoryItem](#type-HistoryItem)\[\]>
    
    Chrome 96+
    

Events
------

### onVisited

chrome.history.onVisited.addListener(  
  callback: function,  
)

Fired when a URL is visited, providing the `HistoryItem` data for that URL. This event fires before the page has loaded.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (result: [HistoryItem](#type-HistoryItem)) => void
    
    *   result
        
        [HistoryItem](#type-HistoryItem)
        
    

### onVisitRemoved

chrome.history.onVisitRemoved.addListener(  
  callback: function,  
)

Fired when one or more URLs are removed from history. When all visits have been removed the URL is purged from history.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (removed: object) => void
    
    *   removed
        
        object
        
        *   allHistory
            
            boolean
            
            True if all history was removed. If true, then urls will be empty.
            
        *   urls
            
            string\[\] optional
            
        
    

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["Concierge\_\_enable\_pushui","Experiments\_\_reqs\_query\_experiments","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","OnSwitch\_\_enable","Profiles\_\_enable\_complete\_playlist\_endpoint","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","Search\_\_enable\_dynamic\_content\_confidential\_banner","DevPro\_\_enable\_code\_assist","MiscFeatureFlags\_\_enable\_view\_transitions","Profiles\_\_enable\_completequiz\_endpoint","MiscFeatureFlags\_\_emergency\_css","MiscFeatureFlags\_\_developers\_footer\_dark\_image","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","MiscFeatureFlags\_\_enable\_explain\_this\_code","DevPro\_\_enable\_nvidia\_credits\_card","Profiles\_\_enable\_auto\_apply\_credits","Cloud\_\_enable\_cloudx\_experiment\_ids","DevPro\_\_enable\_firebase\_workspaces\_card","Search\_\_enable\_suggestions\_from\_borg","DevPro\_\_enable\_devpro\_offers","MiscFeatureFlags\_\_enable\_llms\_txt","Profiles\_\_enable\_developer\_profiles\_callout","SignIn\_\_enable\_l1\_signup\_flow","DevPro\_\_enable\_cloud\_innovators\_plus","Cloud\_\_enable\_cloud\_dlp\_service","BookNav\_\_enable\_tenant\_cache\_key","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","Profiles\_\_enable\_page\_saving","DevPro\_\_enable\_google\_one\_card","Profiles\_\_enable\_join\_program\_group\_endpoint","MiscFeatureFlags\_\_enable\_appearance\_cookies","Profiles\_\_enable\_purchase\_prompts","Profiles\_\_enable\_recognition\_badges","Concierge\_\_enable\_remove\_info\_panel\_tags","Cloud\_\_enable\_free\_trial\_server\_call","DevPro\_\_enable\_payments\_first\_batch","EngEduTelemetry\_\_enable\_engedu\_telemetry","Cloud\_\_enable\_legacy\_calculator\_redirect","MiscFeatureFlags\_\_enable\_variable\_operator","DevPro\_\_remove\_eu\_tax\_intake\_form","MiscFeatureFlags\_\_enable\_project\_variables","Cloud\_\_cache\_serialized\_dynamic\_content","Cloud\_\_enable\_llm\_concierge\_chat","Concierge\_\_enable\_devsite\_llm\_tools","Search\_\_enable\_ai\_search\_summaries\_for\_all","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","Analytics\_\_enable\_clearcut\_logging","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","Concierge\_\_enable\_actions\_menu","MiscFeatureFlags\_\_enable\_firebase\_utm","CloudShell\_\_cloud\_shell\_button","DevPro\_\_enable\_free\_benefits","DevPro\_\_enable\_enterprise","TpcFeatures\_\_proxy\_prod\_host","Search\_\_enable\_page\_map","MiscFeatureFlags\_\_developers\_footer\_image","DevPro\_\_enable\_google\_payments\_buyflow","Profiles\_\_enable\_profile\_collections","Profiles\_\_enable\_public\_developer\_profiles","Profiles\_\_enable\_user\_type","Profiles\_\_enable\_release\_notes\_notifications","CloudShell\_\_cloud\_code\_overflow\_menu","Profiles\_\_enable\_dashboard\_curated\_recommendations","Cloud\_\_enable\_cloud\_shell","Profiles\_\_enable\_awarding\_url","Profiles\_\_enable\_completecodelab\_endpoint","Profiles\_\_require\_profile\_eligibility\_for\_signin","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","Profiles\_\_enable\_playlist\_community\_acl","Profiles\_\_enable\_stripe\_subscription\_management","Cloud\_\_fast\_free\_trial","Profiles\_\_enable\_callout\_notifications","DevPro\_\_enable\_embed\_profile\_creation","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","DevPro\_\_enable\_vertex\_credit\_card","Search\_\_enable\_ai\_eligibility\_checks","DevPro\_\_enable\_developer\_subscriptions"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

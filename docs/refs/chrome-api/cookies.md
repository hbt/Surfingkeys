# chrome.cookies

**Source:** https://developer.chrome.com/docs/extensions/reference/api/cookies

---

Description
-----------

Use the `chrome.cookies` API to query and modify cookies, and to be notified when they change.

Permissions
-----------

`cookies`  

To use the cookies API, declare the `"cookies"` permission in your manifest along with [host permissions](/docs/extensions/develop/concepts/declare-permissions) for any hosts whose cookies you want to access. For example:

{
      "name": "My extension",
      ...
      "host_permissions": [
        "*://*.google.com/"
      ],
      &quo

Partitioning
------------

[Partitioned cookies](/docs/privacy-sandbox/chips) allow a site to mark that certain cookies should be keyed against the origin of the top-level frame. This means that, for example, if site A is embedded using an iframe in site B and site C, the embedded versions of a partitioned cookie from A can have different values on B and C.

By default, all API methods operate on unpartitioned cookies. The [`partitionKey`](#type-CookiePartitionKey) property can be used to override this behavior.

For details on the general impact of partitioning for extensions, see [Storage and Cookies](/docs/extensions/develop/concepts/storage-and-cookies#cookies-partitioning).

Examples
--------

You can find a simple example of using the cookies API in the [examples/api/cookies](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/cookies/cookie-clearer) directory. For other examples and for help in viewing the source code, see [Samples](/docs/extensions/samples).

Types
-----

### Cookie

Represents information about an HTTP cookie.

#### Properties

*   domain
    
    string
    
    The domain of the cookie (e.g. "www.google.com", "example.com").
    
*   expirationDate
    
    number optional
    
    The expiration date of the cookie as the number of seconds since the UNIX epoch. Not provided for session cookies.
    
*   hostOnly
    
    boolean
    
    True if the cookie is a host-only cookie (i.e. a request's host must exactly match the domain of the cookie).
    
*   httpOnly
    
    boolean
    
    True if the cookie is marked as HttpOnly (i.e. the cookie is inaccessible to client-side scripts).
    
*   name
    
    string
    
    The name of the cookie.
    
*   partitionKey
    
    [CookiePartitionKey](#type-CookiePartitionKey) optional
    
    Chrome 119+
    
    The partition key for reading or modifying cookies with the Partitioned attribute.
    
*   path
    
    string
    
    The path of the cookie.
    
*   sameSite
    
    [SameSiteStatus](#type-SameSiteStatus)
    
    Chrome 51+
    
    The cookie's same-site status (i.e. whether the cookie is sent with cross-site requests).
    
*   secure
    
    boolean
    
    True if the cookie is marked as Secure (i.e. its scope is limited to secure channels, typically HTTPS).
    
*   session
    
    boolean
    
    True if the cookie is a session cookie, as opposed to a persistent cookie with an expiration date.
    
*   storeId
    
    string
    
    The ID of the cookie store containing this cookie, as provided in getAllCookieStores().
    
*   value
    
    string
    
    The value of the cookie.
    

### CookieDetails

Chrome 88+

Details to identify the cookie.

#### Properties

*   name
    
    string
    
    The name of the cookie to access.
    
*   partitionKey
    
    [CookiePartitionKey](#type-CookiePartitionKey) optional
    
    Chrome 119+
    
    The partition key for reading or modifying cookies with the Partitioned attribute.
    
*   storeId
    
    string optional
    
    The ID of the cookie store in which to look for the cookie. By default, the current execution context's cookie store will be used.
    
*   url
    
    string
    
    The URL with which the cookie to access is associated. This argument may be a full URL, in which case any data following the URL path (e.g. the query string) is simply ignored. If host permissions for this URL are not specified in the manifest file, the API call will fail.
    

### CookiePartitionKey

Chrome 119+

Represents a partitioned cookie's partition key.

#### Properties

*   hasCrossSiteAncestor
    
    boolean optional
    
    Chrome 130+
    
    Indicates if the cookie was set in a cross-cross site context. This prevents a top-level site embedded in a cross-site context from accessing cookies set by the top-level site in a same-site context.
    
*   topLevelSite
    
    string optional
    
    The top-level site the partitioned cookie is available in.
    

### CookieStore

Represents a cookie store in the browser. An incognito mode window, for instance, uses a separate cookie store from a non-incognito window.

#### Properties

*   id
    
    string
    
    The unique identifier for the cookie store.
    
*   tabIds
    
    number\[\]
    
    Identifiers of all the browser tabs that share this cookie store.
    

### FrameDetails

Chrome 132+

Details to identify the frame.

#### Properties

*   documentId
    
    string optional
    
    The unique identifier for the document. If the frameId and/or tabId are provided they will be validated to match the document found by provided document ID.
    
*   frameId
    
    number optional
    
    The unique identifier for the frame within the tab.
    
*   tabId
    
    number optional
    
    The unique identifier for the tab containing the frame.
    

### OnChangedCause

Chrome 44+

The underlying reason behind the cookie's change. If a cookie was inserted, or removed via an explicit call to "chrome.cookies.remove", "cause" will be "explicit". If a cookie was automatically removed due to expiry, "cause" will be "expired". If a cookie was removed due to being overwritten with an already-expired expiration date, "cause" will be set to "expired\_overwrite". If a cookie was automatically removed due to garbage collection, "cause" will be "evicted". If a cookie was automatically removed due to a "set" call that overwrote it, "cause" will be "overwrite". Plan your response accordingly.

#### Enum

"evicted"  

"expired"  

"explicit"  

"expired\_overwrite"  

"overwrite"  

### SameSiteStatus

Chrome 51+

A cookie's 'SameSite' state (https://tools.ietf.org/html/draft-west-first-party-cookies). 'no\_restriction' corresponds to a cookie set with 'SameSite=None', 'lax' to 'SameSite=Lax', and 'strict' to 'SameSite=Strict'. 'unspecified' corresponds to a cookie set without the SameSite attribute.

#### Enum

"no\_restriction"  

"lax"  

"strict"  

"unspecified"  

Methods
-------

### get()

chrome.cookies.get(  
  details: [CookieDetails](#type-CookieDetails),  
): Promise<[Cookie](#type-Cookie) | undefined\>

Retrieves information about a single cookie. If more than one cookie of the same name exists for the given URL, the one with the longest path will be returned. For cookies with the same path length, the cookie with the earliest creation time will be returned.

#### Parameters

*   details
    
    [CookieDetails](#type-CookieDetails)
    

#### Returns

*   Promise<[Cookie](#type-Cookie) | undefined>
    
    Chrome 88+
    

### getAll()

chrome.cookies.getAll(  
  details: object,  
): Promise<[Cookie](#type-Cookie)\[\]\>

Retrieves all cookies from a single cookie store that match the given information. The cookies returned will be sorted, with those with the longest path first. If multiple cookies have the same path length, those with the earliest creation time will be first. This method only retrieves cookies for domains that the extension has host permissions to.

#### Parameters

*   details
    
    object
    
    Information to filter the cookies being retrieved.
    
    *   domain
        
        string optional
        
        Restricts the retrieved cookies to those whose domains match or are subdomains of this one.
        
    *   name
        
        string optional
        
        Filters the cookies by name.
        
    *   partitionKey
        
        [CookiePartitionKey](#type-CookiePartitionKey) optional
        
        Chrome 119+
        
        The partition key for reading or modifying cookies with the Partitioned attribute.
        
    *   path
        
        string optional
        
        Restricts the retrieved cookies to those whose path exactly matches this string.
        
    *   secure
        
        boolean optional
        
        Filters the cookies by their Secure property.
        
    *   session
        
        boolean optional
        
        Filters out session vs. persistent cookies.
        
    *   storeId
        
        string optional
        
        The cookie store to retrieve cookies from. If omitted, the current execution context's cookie store will be used.
        
    *   url
        
        string optional
        
        Restricts the retrieved cookies to those that would match the given URL.
        
    

#### Returns

*   Promise<[Cookie](#type-Cookie)\[\]>
    
    Chrome 88+
    

### getAllCookieStores()

chrome.cookies.getAllCookieStores(): Promise<[CookieStore](#type-CookieStore)\[\]\>

Lists all existing cookie stores.

#### Returns

*   Promise<[CookieStore](#type-CookieStore)\[\]>
    
    Chrome 88+
    

### getPartitionKey()

Chrome 132+

chrome.cookies.getPartitionKey(  
  details: [FrameDetails](#type-FrameDetails),  
): Promise<object>

The partition key for the frame indicated.

#### Parameters

*   details
    
    [FrameDetails](#type-FrameDetails)
    

#### Returns

*   Promise<object>
    

### remove()

chrome.cookies.remove(  
  details: [CookieDetails](#type-CookieDetails),  
): Promise<object | undefined\>

Deletes a cookie by name.

#### Parameters

*   details
    
    [CookieDetails](#type-CookieDetails)
    

#### Returns

*   Promise<object | undefined>
    
    Chrome 88+
    

### set()

chrome.cookies.set(  
  details: object,  
): Promise<[Cookie](#type-Cookie) | undefined\>

Sets a cookie with the given cookie data; may overwrite equivalent cookies if they exist.

#### Parameters

*   details
    
    object
    
    Details about the cookie being set.
    
    *   domain
        
        string optional
        
        The domain of the cookie. If omitted, the cookie becomes a host-only cookie.
        
    *   expirationDate
        
        number optional
        
        The expiration date of the cookie as the number of seconds since the UNIX epoch. If omitted, the cookie becomes a session cookie.
        
    *   httpOnly
        
        boolean optional
        
        Whether the cookie should be marked as HttpOnly. Defaults to false.
        
    *   name
        
        string optional
        
        The name of the cookie. Empty by default if omitted.
        
    *   partitionKey
        
        [CookiePartitionKey](#type-CookiePartitionKey) optional
        
        Chrome 119+
        
        The partition key for reading or modifying cookies with the Partitioned attribute.
        
    *   path
        
        string optional
        
        The path of the cookie. Defaults to the path portion of the url parameter.
        
    *   sameSite
        
        [SameSiteStatus](#type-SameSiteStatus) optional
        
        Chrome 51+
        
        The cookie's same-site status. Defaults to "unspecified", i.e., if omitted, the cookie is set without specifying a SameSite attribute.
        
    *   secure
        
        boolean optional
        
        Whether the cookie should be marked as Secure. Defaults to false.
        
    *   storeId
        
        string optional
        
        The ID of the cookie store in which to set the cookie. By default, the cookie is set in the current execution context's cookie store.
        
    *   url
        
        string
        
        The request-URI to associate with the setting of the cookie. This value can affect the default domain and path values of the created cookie. If host permissions for this URL are not specified in the manifest file, the API call will fail.
        
    *   value
        
        string optional
        
        The value of the cookie. Empty by default if omitted.
        
    

#### Returns

*   Promise<[Cookie](#type-Cookie) | undefined>
    
    Chrome 88+
    

Events
------

### onChanged

chrome.cookies.onChanged.addListener(  
  callback: function,  
)

Fired when a cookie is set or removed. As a special case, note that updating a cookie's properties is implemented as a two step process: the cookie to be updated is first removed entirely, generating a notification with "cause" of "overwrite" . Afterwards, a new cookie is written with the updated values, generating a second notification with "cause" "explicit".

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (changeInfo: object) =& gt;void
    
    *   changeInfo
        
        object
        
        *   cause
            
            [OnChangedCause](#type-OnChangedCause)
            
            The underlying reason behind the cookie's change.
            
        *   cookie
            
            [Cookie](#type-Cookie)
            
            Information about the cookie that was set or removed.
            
        *   removed
            
            boolean
            
            True if a cookie was removed.
            
        
    

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["Cloud\_\_enable\_cloudx\_experiment\_ids","Profiles\_\_enable\_developer\_profiles\_callout","DevPro\_\_enable\_devpro\_offers","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","MiscFeatureFlags\_\_developers\_footer\_dark\_image","Profiles\_\_enable\_callout\_notifications","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","MiscFeatureFlags\_\_enable\_view\_transitions","DevPro\_\_enable\_google\_payments\_buyflow","Cloud\_\_cache\_serialized\_dynamic\_content","Cloud\_\_enable\_cloud\_dlp\_service","DevPro\_\_remove\_eu\_tax\_intake\_form","TpcFeatures\_\_proxy\_prod\_host","Search\_\_enable\_ai\_eligibility\_checks","SignIn\_\_enable\_l1\_signup\_flow","MiscFeatureFlags\_\_developers\_footer\_image","Profiles\_\_enable\_dashboard\_curated\_recommendations","BookNav\_\_enable\_tenant\_cache\_key","MiscFeatureFlags\_\_enable\_firebase\_utm","Profiles\_\_enable\_join\_program\_group\_endpoint","Concierge\_\_enable\_pushui","Profiles\_\_enable\_purchase\_prompts","Search\_\_enable\_suggestions\_from\_borg","Cloud\_\_enable\_llm\_concierge\_chat","Concierge\_\_enable\_actions\_menu","DevPro\_\_enable\_enterprise","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","CloudShell\_\_cloud\_shell\_button","MiscFeatureFlags\_\_emergency\_css","Profiles\_\_enable\_profile\_collections","Cloud\_\_enable\_legacy\_calculator\_redirect","DevPro\_\_enable\_code\_assist","Profiles\_\_enable\_playlist\_community\_acl","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","DevPro\_\_enable\_cloud\_innovators\_plus","MiscFeatureFlags\_\_enable\_explain\_this\_code","Concierge\_\_enable\_remove\_info\_panel\_tags","Cloud\_\_fast\_free\_trial","Profiles\_\_enable\_auto\_apply\_credits","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","Search\_\_enable\_page\_map","Analytics\_\_enable\_clearcut\_logging","Profiles\_\_enable\_complete\_playlist\_endpoint","Profiles\_\_enable\_release\_notes\_notifications","DevPro\_\_enable\_embed\_profile\_creation","Profiles\_\_enable\_user\_type","Concierge\_\_enable\_devsite\_llm\_tools","Search\_\_enable\_dynamic\_content\_confidential\_banner","DevPro\_\_enable\_free\_benefits","Experiments\_\_reqs\_query\_experiments","Profiles\_\_enable\_stripe\_subscription\_management","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","Profiles\_\_enable\_completecodelab\_endpoint","MiscFeatureFlags\_\_enable\_llms\_txt","Cloud\_\_enable\_free\_trial\_server\_call","DevPro\_\_enable\_google\_one\_card","MiscFeatureFlags\_\_enable\_project\_variables","Cloud\_\_enable\_cloud\_shell","MiscFeatureFlags\_\_enable\_variable\_operator","DevPro\_\_enable\_firebase\_workspaces\_card","Profiles\_\_enable\_completequiz\_endpoint","Profiles\_\_enable\_public\_developer\_profiles","OnSwitch\_\_enable","CloudShell\_\_cloud\_code\_overflow\_menu","Search\_\_enable\_ai\_search\_summaries\_for\_all","MiscFeatureFlags\_\_enable\_appearance\_cookies","DevPro\_\_enable\_developer\_subscriptions","Profiles\_\_require\_profile\_eligibility\_for\_signin","Profiles\_\_enable\_awarding\_url","EngEduTelemetry\_\_enable\_engedu\_telemetry","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","DevPro\_\_enable\_nvidia\_credits\_card","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","Profiles\_\_enable\_page\_saving","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","DevPro\_\_enable\_vertex\_credit\_card","DevPro\_\_enable\_payments\_first\_batch","Profiles\_\_enable\_recognition\_badges"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

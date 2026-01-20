# chrome.permissions

**Source:** https://developer.chrome.com/docs/extensions/reference/api/permissions

---

Description
-----------

Use the `chrome.permissions` API to request [declared optional permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) at run time rather than install time, so users understand why the permissions are needed and grant only those that are necessary.

Concepts and usage
------------------

Permission warnings exist to describe the capabilities granted by an API, but some of these warnings may not be obvious. The Permissions API allows developers to explain permission warnings and introduce new features gradually which gives users a risk-free introduction to the extension. This way, users can specify how much access they are willing to grant and which features they want to enable.

For example, the [optional permissions extension's](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/sample.optional_permissions) core functionality is overriding the new tab page. One feature is displaying the user's goal of the day. This feature only requires the [storage](/docs/extensions/reference/api/storage) permission, which does not include a warning. The extension has an additional feature, that users can enable by clicking the following button:

![An extension button that enables additional features.](/static/docs/extensions/reference/api/permissions/images/extension-button-enables-c53fe17733b8f.png)

An extension button that enables additional features.

Displaying the user's top sites requires the [topSites](/docs/extensions/reference/api/topSites) permission, which has the following warning.

![Axtension warning for topSites API.](/static/docs/extensions/reference/api/permissions/images/extension-warning-topsit-8927d6b7cb863.png)

An extension warning for `topSites` API

### Implement optional permissions

#### Step 1: Decide which permissions are required and which are optional

An extension can declare both required and optional permissions. In general, you should:

*   Use required permissions when they are needed for your extension's basic functionality.
*   Use optional permissions when they are needed for optional features in your extension.

Advantages of _required_ permissions:

*   **Fewer prompts:** An extension can prompt the user once to accept all permissions.
*   **Simpler development:** Required permissions are guaranteed to be present.

Advantages of _optional_ permissions:

*   **Better security:** Extensions run with fewer permissions since users only enable permissions that are needed.
*   **Better information for users:** An extension can explain why it needs a particular permission when the user enables the relevant feature.
*   **Easier upgrades:** When you upgrade your extension, Chrome won't disable it for your users if the upgrade adds optional rather than required permissions.

#### Step 2: Declare optional permissions in the manifest

Declare optional permissions in your [extension manifest](/docs/extensions/reference/manifest) with the `optional_permissions` key, using the same format as the [permissions](/docs/extensions/develop/concepts/declare-permissions) field:

{
      "name": "My extension",
      ...
      "optional_permissions": ["tabs"],
      "optional_host_permissions": ["https://www.google.com/"],
      ...
    }

If you want to request hosts that you only discover at runtime, include `"https://*/*"` in your extension's `optional_host_permissions` field. This lets you specify any origin in [`"Permissions.origins"`](#property-Permissions-origins) as long as it has a matching scheme.

**Permissions that can _not_ be specified as optional**

Most Chrome extension permissions can be specified as optional, with the following exceptions.

Permission

Description

`"debugger"`

The [chrome.debugger](/docs/extensions/reference/api/debugger) API serves as an alternate transport for Chrome's [remote debugging protocol](https://chromedevtools.github.io/devtools-protocol/).

`"declarativeNetRequest"`

Grants the extension access to the [chrome.declarativeNetRequest](/docs/extensions/reference/api/declarativeNetRequest) API.

`"devtools"`

Allows extension to expand [Chrome DevTools](/docs/extensions/how-to/devtools/extend-devtools) functionality.

`"geolocation"`

Allows the extension to use the HTML5 [geolocation](https://w3c.github.io/geolocation-api/) API.

`"mdns"`

Grants the extension access to the [chrome.mdns](/docs/apps/reference/mdns) API.

`"proxy"`

Grants the extension access to the [chrome.proxy](/docs/extensions/reference/api/proxy) API to manage Chrome's proxy settings.

`"tts"`

The [chrome.tts](/docs/extensions/reference/api/tts) API plays synthesized text-to-speech (TTS).

`"ttsEngine"`

The [chrome.ttsEngine](/docs/extensions/reference/api/ttsEngine) API implements a text-to-speech (TTS) engine using an extension.

`"wallpaper"`

**ChromeOS only**. Use the [chrome.wallpaper](/docs/extensions/reference/api/wallpaper) API change the ChromeOS wallpaper.

View [Declare Permissions](/docs/extensions/develop/concepts/declare-permissions) for further information on available permissions and their warnings.

#### Step 3: Request optional permissions

Request the permissions from within a user gesture using `permissions.request()`:

document.querySelector('#my-button').addEventListener('click', (event) => {
      // Permissions must be requested from inside a user gesture, like a button's
      // click handler.
      chrome.permissions.request({
        permissions: ['tabs'],
        origins: ['https://www.google.com/']
      }, (granted) => {
        // The callback argument will be true if the user granted the permissions.
        if (granted) {
          doSomething();
        } else {
          doSomethingElse();
        }
      });
    });

Chrome prompts the user if adding the permissions results in different [warning messages](/docs/extensions/develop/concepts/declare-permissions) than the user has already seen and accepted. For example, the previous code might result in a prompt like this:

![An example permission confirmation prompt.](/static/docs/extensions/reference/api/permissions/images/perms-optional.png)

An example permission confirmation prompt.

#### Step 4: Check the extension's current permissions

To check whether your extension has a specific permission or set of permissions, use `permission.contains()`:

chrome.permissions.contains({
      permissions: ['tabs'],
      origins: ['https://www.google.com/']
    }, (result) => {
      if (result) {
        // The extension has the permissions.
      } else {
        // The extension doesn't have the permissions.
      }
    });

#### Step 5: Remove the permissions

You should remove permissions when you no longer need them. After a permission has been removed, calling `permissions.request()` usually adds the permission back without prompting the user.

chrome.permissions.remove({
      permissions: ['tabs'],
      origins: ['https://www.google.com/']
    }, (removed) => {
      if (removed) {
        // The permissions have been removed.
      } else {
        // The permissions have not been removed (e.g., you tried to remove
        // required permissions).
      }
    });

Types
-----

### Permissions

#### Properties

*   origins
    
    string\[\] optional
    
    The list of host permissions, including those specified in the `optional_permissions` or `permissions` keys in the manifest, and those associated with [Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
    
*   permissions
    
    string\[\] optional
    
    List of named permissions (does not include hosts or origins).
    

Methods
-------

### addHostAccessRequest()

Chrome 133+ MV3+

chrome.permissions.addHostAccessRequest(  
  request: object,  
): Promise<void>

Adds a host access request. Request will only be signaled to the user if extension can be granted access to the host in the request. Request will be reset on cross-origin navigation. When accepted, grants persistent access to the site’s top origin

#### Parameters

*   request
    
    object
    
    *   documentId
        
        string optional
        
        The id of a document where host access requests can be shown. Must be the top-level document within a tab. If provided, the request is shown on the tab of the specified document and is removed when the document navigates to a new origin. Adding a new request will override any existent request for `tabId`. This or `tabId` must be specified.
        
    *   pattern
        
        string optional
        
        The URL pattern where host access requests can be shown. If provided, host access requests will only be shown on URLs that match this pattern.
        
    *   tabId
        
        number optional
        
        The id of the tab where host access requests can be shown. If provided, the request is shown on the specified tab and is removed when the tab navigates to a new origin. Adding a new request will override an existent request for `documentId`. This or `documentId` must be specified.
        
    

#### Returns

*   Promise<void>
    

### contains()

chrome.permissions.contains(  
  permissions: [Permissions](#type-Permissions),  
): Promise<boolean>

Checks if the extension has the specified permissions.

#### Parameters

*   permissions
    
    [Permissions](#type-Permissions)
    

#### Returns

*   Promise<boolean>
    
    Chrome 96+
    

### getAll()

chrome.permissions.getAll(): Promise<[Permissions](#type-Permissions)\>

Gets the extension's current set of permissions.

#### Returns

*   Promise<[Permissions](#type-Permissions)\>
    
    Chrome 96+
    

### remove()

chrome.permissions.remove(  
  permissions: [Permissions](#type-Permissions),  
): Promise<boolean>

Removes access to the specified permissions. If there are any problems removing the permissions, the promise will be rejected.

#### Parameters

*   permissions
    
    [Permissions](#type-Permissions)
    

#### Returns

*   Promise<boolean>
    
    Chrome 96+
    

### removeHostAccessRequest()

Chrome 133+ MV3+

chrome.permissions.removeHostAccessRequest(  
  request: object,  
): Promise<void>

Removes a host access request, if existent.

#### Parameters

*   request
    
    object
    
    *   documentId
        
        string optional
        
        The id of a document where host access request will be removed. Must be the top-level document within a tab. This or `tabId` must be specified.
        
    *   pattern
        
        string optional
        
        The URL pattern where host access request will be removed. If provided, this must exactly match the pattern of an existing host access request.
        
    *   tabId
        
        number optional
        
        The id of the tab where host access request will be removed. This or `documentId` must be specified.
        
    

#### Returns

*   Promise<void>
    

### request()

chrome.permissions.request(  
  permissions: [Permissions](#type-Permissions),  
): Promise<boolean>

Requests access to the specified permissions, displaying a prompt to the user if necessary. These permissions must either be defined in the `optional_permissions` field of the manifest or be required permissions that were withheld by the user. Paths on origin patterns will be ignored. You can request subsets of optional origin permissions; for example, if you specify `*://*\/*` in the `optional_permissions` section of the manifest, you can request `http://example.com/`. If there are any problems requesting the permissions, the promise will be rejected.

#### Parameters

*   permissions
    
    [Permissions](#type-Permissions)
    

#### Returns

*   Promise<boolean>
    
    Chrome 96+
    

Events
------

### onAdded

chrome.permissions.onAdded.addListener(  
  callback: function,  
)

Fired when the extension acquires new permissions.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (permissions: [Permissions](#type-Permissions)) => void
    
    *   permissions
        
        [Permissions](#type-Permissions)
        
    

### onRemoved

chrome.permissions.onRemoved.addListener(  
  callback: function,  
)

Fired when access to permissions has been removed from the extension.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (permissions: [Permissions](#type-Permissions)) => void
    
    *   permissions
        
        [Permissions](#type-Permissions)
        
    

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",1,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["DevPro\_\_enable\_code\_assist","MiscFeatureFlags\_\_enable\_view\_transitions","Profiles\_\_enable\_user\_type","DevPro\_\_enable\_developer\_subscriptions","MiscFeatureFlags\_\_enable\_explain\_this\_code","DevPro\_\_enable\_devpro\_offers","DevPro\_\_enable\_free\_benefits","OnSwitch\_\_enable","Profiles\_\_enable\_public\_developer\_profiles","Profiles\_\_enable\_recognition\_badges","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","Cloud\_\_enable\_cloud\_dlp\_service","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","Concierge\_\_enable\_devsite\_llm\_tools","Cloud\_\_fast\_free\_trial","Profiles\_\_enable\_page\_saving","DevPro\_\_remove\_eu\_tax\_intake\_form","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","DevPro\_\_enable\_nvidia\_credits\_card","Profiles\_\_enable\_playlist\_community\_acl","DevPro\_\_enable\_vertex\_credit\_card","Profiles\_\_enable\_dashboard\_curated\_recommendations","DevPro\_\_enable\_firebase\_workspaces\_card","Search\_\_enable\_ai\_eligibility\_checks","MiscFeatureFlags\_\_enable\_project\_variables","Cloud\_\_cache\_serialized\_dynamic\_content","Concierge\_\_enable\_actions\_menu","Profiles\_\_enable\_completecodelab\_endpoint","DevPro\_\_enable\_google\_payments\_buyflow","Cloud\_\_enable\_cloudx\_experiment\_ids","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","Experiments\_\_reqs\_query\_experiments","Search\_\_enable\_ai\_search\_summaries\_for\_all","Search\_\_enable\_suggestions\_from\_borg","Cloud\_\_enable\_llm\_concierge\_chat","DevPro\_\_enable\_google\_one\_card","Profiles\_\_enable\_developer\_profiles\_callout","Profiles\_\_enable\_release\_notes\_notifications","MiscFeatureFlags\_\_developers\_footer\_dark\_image","DevPro\_\_enable\_cloud\_innovators\_plus","MiscFeatureFlags\_\_enable\_llms\_txt","Profiles\_\_enable\_join\_program\_group\_endpoint","Profiles\_\_enable\_auto\_apply\_credits","CloudShell\_\_cloud\_shell\_button","Analytics\_\_enable\_clearcut\_logging","MiscFeatureFlags\_\_enable\_appearance\_cookies","Profiles\_\_enable\_purchase\_prompts","DevPro\_\_enable\_enterprise","Cloud\_\_enable\_free\_trial\_server\_call","Profiles\_\_enable\_profile\_collections","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","BookNav\_\_enable\_tenant\_cache\_key","SignIn\_\_enable\_l1\_signup\_flow","Concierge\_\_enable\_pushui","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","Search\_\_enable\_dynamic\_content\_confidential\_banner","Profiles\_\_enable\_stripe\_subscription\_management","MiscFeatureFlags\_\_enable\_variable\_operator","Concierge\_\_enable\_remove\_info\_panel\_tags","Cloud\_\_enable\_cloud\_shell","CloudShell\_\_cloud\_code\_overflow\_menu","Profiles\_\_enable\_awarding\_url","Profiles\_\_require\_profile\_eligibility\_for\_signin","DevPro\_\_enable\_payments\_first\_batch","DevPro\_\_enable\_embed\_profile\_creation","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","Cloud\_\_enable\_legacy\_calculator\_redirect","EngEduTelemetry\_\_enable\_engedu\_telemetry","MiscFeatureFlags\_\_enable\_firebase\_utm","Profiles\_\_enable\_callout\_notifications","TpcFeatures\_\_proxy\_prod\_host","Profiles\_\_enable\_completequiz\_endpoint","Profiles\_\_enable\_complete\_playlist\_endpoint","MiscFeatureFlags\_\_developers\_footer\_image","MiscFeatureFlags\_\_emergency\_css","Search\_\_enable\_page\_map"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

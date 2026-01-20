# chrome.devtools.network

**Source:** https://developer.chrome.com/docs/extensions/reference/api/devtools.network

---

Description
-----------

Use the `chrome.devtools.network` API to retrieve the information about network requests displayed by the Developer Tools in the Network panel.

Network requests information is represented in the HTTP Archive format (_HAR_). The description of HAR is outside of scope of this document, refer to [HAR v1.2 Specification](http://www.softwareishard.com/blog/har-12-spec/).

In terms of HAR, the `chrome.devtools.network.getHAR()` method returns entire _HAR log_, while `chrome.devtools.network.onRequestFinished` event provides _HAR entry_ as an argument to the event callback.

Note that request content is not provided as part of HAR for efficiency reasons. You may call request's `getContent()` method to retrieve content.

If the Developer Tools window is opened after the page is loaded, some requests may be missing in the array of entries returned by `getHAR()`. Reload the page to get all requests. In general, the list of requests returned by `getHAR()` should match that displayed in the Network panel.

See [DevTools APIs summary](/docs/extensions/how-to/devtools/extend-devtools) for general introduction to using Developer Tools APIs.

Manifest
--------

The following keys must be declared [in the manifest](/docs/extensions/mv3/manifest) to use this API.

`"devtools_page"`  

Examples
--------

The following code logs URLs of all images larger than 40KB as they are loaded:

chrome.devtools.network.onRequestFinished.addListener(
      function(request) {
        if (request.response.bodySize > 40*1024) {
          chrome.devtools.inspectedWindow.eval(
              'console.log("Large image: " + unescape("' +
              escape(request.request.url) + '"))');
        }
      }
    );

To try this API, install the [devtools API examples](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/devtools) from the [chrome-extension-samples](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples) repository.

Types
-----

### Request

Represents a network request for a document resource (script, image and so on). See HAR Specification for reference.

#### Properties

*   getContent
    
    void
    
    Returns content of the response body.
    
    The `getContent` function looks like:
    
    (callback: function) => {...}
    
    *   callback
        
        function
        
        The `callback` parameter looks like:
        
        (content: string, encoding: string) => void
        
        *   content
            
            string
            
            Content of the response body (potentially encoded).
            
        *   encoding
            
            string
            
            Empty if content is not encoded, encoding name otherwise. Currently, only base64 is supported.
            
        
    

Methods
-------

### getHAR()

chrome.devtools.network.getHAR(  
  callback: function,  
): void

Returns HAR log that contains all known network requests.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (harLog: object) => void
    
    *   harLog
        
        object
        
        A HAR log. See HAR specification for details.
        
    

Events
------

### onNavigated

chrome.devtools.network.onNavigated.addListener(  
  callback: function,  
)

Fired when the inspected window navigates to a new page.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (url: string) => void
    
    *   url
        
        string
        
    

### onRequestFinished

chrome.devtools.network.onRequestFinished.addListener(  
  callback: function,  
)

Fired when a network request is finished and all request data are available.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (request: [Request](#type-Request)) => void
    
    *   request
        
        [Request](#type-Request)
        
    

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["Analytics\_\_enable\_clearcut\_logging","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","DevPro\_\_enable\_enterprise","MiscFeatureFlags\_\_developers\_footer\_dark\_image","Profiles\_\_enable\_purchase\_prompts","Profiles\_\_enable\_stripe\_subscription\_management","Search\_\_enable\_suggestions\_from\_borg","Cloud\_\_enable\_cloud\_dlp\_service","Profiles\_\_enable\_dashboard\_curated\_recommendations","Search\_\_enable\_page\_map","DevPro\_\_remove\_eu\_tax\_intake\_form","MiscFeatureFlags\_\_emergency\_css","MiscFeatureFlags\_\_enable\_view\_transitions","Profiles\_\_enable\_awarding\_url","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","Profiles\_\_enable\_developer\_profiles\_callout","Profiles\_\_enable\_auto\_apply\_credits","MiscFeatureFlags\_\_enable\_firebase\_utm","CloudShell\_\_cloud\_shell\_button","DevPro\_\_enable\_firebase\_workspaces\_card","Concierge\_\_enable\_remove\_info\_panel\_tags","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","Profiles\_\_enable\_page\_saving","Profiles\_\_enable\_user\_type","TpcFeatures\_\_proxy\_prod\_host","DevPro\_\_enable\_devpro\_offers","Profiles\_\_enable\_callout\_notifications","DevPro\_\_enable\_cloud\_innovators\_plus","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","Cloud\_\_enable\_cloud\_shell","Profiles\_\_enable\_profile\_collections","Cloud\_\_fast\_free\_trial","Experiments\_\_reqs\_query\_experiments","SignIn\_\_enable\_l1\_signup\_flow","DevPro\_\_enable\_nvidia\_credits\_card","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","OnSwitch\_\_enable","Profiles\_\_require\_profile\_eligibility\_for\_signin","Cloud\_\_enable\_legacy\_calculator\_redirect","Profiles\_\_enable\_completecodelab\_endpoint","Concierge\_\_enable\_actions\_menu","Cloud\_\_enable\_cloudx\_experiment\_ids","Profiles\_\_enable\_playlist\_community\_acl","MiscFeatureFlags\_\_enable\_llms\_txt","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","Cloud\_\_enable\_free\_trial\_server\_call","Cloud\_\_cache\_serialized\_dynamic\_content","Profiles\_\_enable\_join\_program\_group\_endpoint","EngEduTelemetry\_\_enable\_engedu\_telemetry","Concierge\_\_enable\_devsite\_llm\_tools","BookNav\_\_enable\_tenant\_cache\_key","DevPro\_\_enable\_google\_one\_card","MiscFeatureFlags\_\_enable\_project\_variables","MiscFeatureFlags\_\_enable\_appearance\_cookies","Profiles\_\_enable\_release\_notes\_notifications","CloudShell\_\_cloud\_code\_overflow\_menu","Concierge\_\_enable\_pushui","DevPro\_\_enable\_payments\_first\_batch","MiscFeatureFlags\_\_enable\_explain\_this\_code","Profiles\_\_enable\_recognition\_badges","Profiles\_\_enable\_public\_developer\_profiles","Search\_\_enable\_dynamic\_content\_confidential\_banner","MiscFeatureFlags\_\_developers\_footer\_image","DevPro\_\_enable\_google\_payments\_buyflow","MiscFeatureFlags\_\_enable\_variable\_operator","DevPro\_\_enable\_free\_benefits","Profiles\_\_enable\_completequiz\_endpoint","DevPro\_\_enable\_vertex\_credit\_card","Search\_\_enable\_ai\_eligibility\_checks","DevPro\_\_enable\_developer\_subscriptions","Profiles\_\_enable\_complete\_playlist\_endpoint","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","DevPro\_\_enable\_embed\_profile\_creation","Cloud\_\_enable\_llm\_concierge\_chat","Search\_\_enable\_ai\_search\_summaries\_for\_all","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","DevPro\_\_enable\_code\_assist"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

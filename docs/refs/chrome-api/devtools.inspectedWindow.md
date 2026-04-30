# chrome.devtools.inspectedWindow

**Source:** https://developer.chrome.com/docs/extensions/reference/api/devtools.inspectedWindow

---

Description
-----------

Use the `chrome.devtools.inspectedWindow` API to interact with the inspected window: obtain the tab ID for the inspected page, evaluate the code in the context of the inspected window, reload the page, or obtain the list of resources within the page.

See [DevTools APIs summary](/docs/extensions/how-to/devtools/extend-devtools) for general introduction to using Developer Tools APIs.

The [`tabId`](#property-tabId) property provides the tab identifier that you can use with the [`chrome.tabs.*`](/docs/extensions/reference/api/tabs) API calls. However, please note that `chrome.tabs.*` API is not exposed to the Developer Tools extension pages due to security considerations—you will need to pass the tab ID to the background page and invoke the `chrome.tabs.*` API functions from there.

The `reload` method may be used to reload the inspected page. Additionally, the caller can specify an override for the user agent string, a script that will be injected early upon page load, or an option to force reload of cached resources.

Use the `getResources` call and the `onResourceContent` event to obtain the list of resources (documents, stylesheets, scripts, images etc) within the inspected page. The `getContent` and `setContent` methods of the `Resource` class along with the `onResourceContentCommitted` event may be used to support modification of the resource content, for example, by an external editor.

Manifest
--------

The following keys must be declared [in the manifest](/docs/extensions/mv3/manifest) to use this API.

`"devtools_page"`  

Execute code in the inspected window
------------------------------------

The `eval` method provides the ability for extensions to execute JavaScript code in the context of the inspected page. This method is powerful when used in the right context and dangerous when used inappropriately. Use the [`tabs.executeScript`](/docs/extensions/reference/api/tabs#method-executeScript) method unless you need the specific functionality that the `eval` method provides.

Here are the main differences between the `eval` and `tabs.executeScript` methods:

*   The `eval` method does not use an isolated world for the code being evaluated, so the JavaScript state of the inspected window is accessible to the code. Use this method when access to the JavaScript state of the inspected page is required.
*   The execution context of the code being evaluated includes the [Developer Tools console API](https://developers.google.com/web/tools/chrome-devtools/). For example, the code can use `inspect` and `$0`.
*   The evaluated code may return a value that is passed to the extension callback. The returned value has to be a valid JSON object (it may contain only primitive JavaScript types and acyclic references to other JSON objects). _Please observe extra care while processing the data received from the inspected page—the execution context is essentially controlled by the inspected page; a malicious page may affect the data being returned to the extension._

**Caution:** Due to the security considerations explained above, the [`scripting.executeScript`](/docs/extensions/reference/api/scripting#method-executeScript) method is the preferred way for an extension to access DOM data of the inspected page in cases where the access to JavaScript state of the inspected page is not required.

Note that a page can include multiple different JavaScript execution contexts. Each frame has its own context, plus an additional context for each extension that has content scripts running in that frame.

By default, the `eval` method executes in the context of the main frame of the inspected page.

The `eval` method takes an optional second argument that you can use to specify the context in which the code is evaluated. This _options_ object can contain one or more of the following keys:

`frameURL`

Use to specify a frame other than the inspected page's main frame.

`contextSecurityOrigin`

Use to select a context within the specified frame according to its [web origin](https://www.ietf.org/rfc/rfc6454.txt).

`useContentScriptContext`

If true, execute the script in the same context as the extensions's content scripts. (Equivalent to specifying the extensions's own web orgin as the context security origin.) This can be used to exchange data with the content script.

Examples
--------

The following code checks for the version of jQuery used by the inspected page:

chrome.devtools.inspectedWindow.eval(
      "jQuery.fn.jquery",
      function(result, isException) {
        if (isException) {
          console.log("the page is not using jQuery");
        } else {
          console.log("The page is using jQuery v" + result);
        }
      }
    );

To try this API, install the [devtools API examples](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/devtools) from the [chrome-extension-samples](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples) repository.

Types
-----

### Resource

A resource within the inspected page, such as a document, a script, or an image.

#### Properties

*   url
    
    string
    
    The URL of the resource.
    
*   getContent
    
    void
    
    Gets the content of the resource.
    
    The `getContent` function looks like:
    
    (callback: function) => {...}
    
    *   callback
        
        function
        
        The `callback` parameter looks like:
        
        (content: string, encoding: string) => void
        
        *   content
            
            string
            
            Content of the resource (potentially encoded).
            
        *   encoding
            
            string
            
            Empty if the content is not encoded, encoding name otherwise. Currently, only base64 is supported.
            
        
    
*   setContent
    
    void
    
    Sets the content of the resource.
    
    The `setContent` function looks like:
    
    (content: string, commit: boolean, callback?: function) => {...}
    
    *   content
        
        string
        
        New content of the resource. Only resources with the text type are currently supported.
        
    *   commit
        
        boolean
        
        True if the user has finished editing the resource, and the new content of the resource should be persisted; false if this is a minor change sent in progress of the user editing the resource.
        
    *   callback
        
        function optional
        
        The `callback` parameter looks like:
        
        (error?: object) => void
        
        *   error
            
            object optional
            
            Set to undefined if the resource content was set successfully; describes error otherwise.
            
        
    

Properties
----------

### tabId

The ID of the tab being inspected. This ID may be used with chrome.tabs.\* API.

#### Type

number

Methods
-------

### eval()

chrome.devtools.inspectedWindow.eval(  
  expression: string,  
  options?: object,  
  callback?: function,  
): void

Evaluates a JavaScript expression in the context of the main frame of the inspected page. The expression must evaluate to a JSON-compliant object, otherwise an exception is thrown. The eval function can report either a DevTools-side error or a JavaScript exception that occurs during evaluation. In either case, the `result` parameter of the callback is `undefined`. In the case of a DevTools-side error, the `isException` parameter is non-null and has `isError` set to true and `code` set to an error code. In the case of a JavaScript error, `isException` is set to true and `value` is set to the string value of thrown object.

#### Parameters

*   expression
    
    string
    
    An expression to evaluate.
    
*   options
    
    object optional
    
    The options parameter can contain one or more options.
    
    *   frameURL
        
        string optional
        
        If specified, the expression is evaluated on the iframe whose URL matches the one specified. By default, the expression is evaluated in the top frame of the inspected page.
        
    *   scriptExecutionContext
        
        string optional
        
        Chrome 107+
        
        Evaluate the expression in the context of a content script of an extension that matches the specified origin. If given, scriptExecutionContext overrides the 'true' setting on useContentScriptContext.
        
    *   useContentScriptContext
        
        boolean optional
        
        Evaluate the expression in the context of the content script of the calling extension, provided that the content script is already injected into the inspected page. If not, the expression is not evaluated and the callback is invoked with the exception parameter set to an object that has the `isError` field set to true and the `code` field set to `E_NOTFOUND`.
        
    
*   callback
    
    function optional
    
    The `callback` parameter looks like:
    
    (result: object, exceptionInfo: object) => void
    
    *   result
        
        object
        
        The result of evaluation.
        
    *   exceptionInfo
        
        object
        
        An object providing details if an exception occurred while evaluating the expression.
        
        *   code
            
            string
            
            Set if the error occurred on the DevTools side before the expression is evaluated.
            
        *   description
            
            string
            
            Set if the error occurred on the DevTools side before the expression is evaluated.
            
        *   details
            
            any\[\]
            
            Set if the error occurred on the DevTools side before the expression is evaluated, contains the array of the values that may be substituted into the description string to provide more information about the cause of the error.
            
        *   isError
            
            boolean
            
            Set if the error occurred on the DevTools side before the expression is evaluated.
            
        *   isException
            
            boolean
            
            Set if the evaluated code produces an unhandled exception.
            
        *   value
            
            string
            
            Set if the evaluated code produces an unhandled exception.
            
        
    

### getResources()

chrome.devtools.inspectedWindow.getResources(  
  callback: function,  
): void

Retrieves the list of resources from the inspected page.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (resources: [Resource](#type-Resource)\[\]) => void
    
    *   resources
        
        [Resource](#type-Resource)\[\]
        
        The resources within the page.
        
    

### reload()

chrome.devtools.inspectedWindow.reload(  
  reloadOptions?: object,  
): void

Reloads the inspected page.

#### Parameters

*   reloadOptions
    
    object optional
    
    *   ignoreCache
        
        boolean optional
        
        When true, the loader will bypass the cache for all inspected page resources loaded before the `load` event is fired. The effect is similar to pressing Ctrl+Shift+R in the inspected window or within the Developer Tools window.
        
    *   injectedScript
        
        string optional
        
        If specified, the script will be injected into every frame of the inspected page immediately upon load, before any of the frame's scripts. The script will not be injected after subsequent reloads—for example, if the user presses Ctrl+R.
        
    *   userAgent
        
        string optional
        
        If specified, the string will override the value of the `User-Agent` HTTP header that's sent while loading the resources of the inspected page. The string will also override the value of the `navigator.userAgent` property that's returned to any scripts that are running within the inspected page.
        
    

Events
------

### onResourceAdded

chrome.devtools.inspectedWindow.onResourceAdded.addListener(  
  callback: function,  
)

Fired when a new resource is added to the inspected page.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (resource: [Resource](#type-Resource)) => void
    
    *   resource
        
        [Resource](#type-Resource)
        
    

### onResourceContentCommitted

chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(  
  callback: function,  
)

Fired when a new revision of the resource is committed (e.g. user saves an edited version of the resource in the Developer Tools).

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (resource: [Resource](#type-Resource), content: string) => void
    
    *   resource
        
        [Resource](#type-Resource)
        
    *   content
        
        string
        
    

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,116,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["Search\_\_enable\_page\_map","BookNav\_\_enable\_tenant\_cache\_key","EngEduTelemetry\_\_enable\_engedu\_telemetry","Profiles\_\_enable\_completecodelab\_endpoint","Profiles\_\_enable\_profile\_collections","Profiles\_\_enable\_dashboard\_curated\_recommendations","CloudShell\_\_cloud\_code\_overflow\_menu","Cloud\_\_enable\_cloud\_dlp\_service","Profiles\_\_enable\_complete\_playlist\_endpoint","Profiles\_\_enable\_join\_program\_group\_endpoint","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","MiscFeatureFlags\_\_enable\_project\_variables","DevPro\_\_enable\_payments\_first\_batch","Profiles\_\_enable\_developer\_profiles\_callout","Concierge\_\_enable\_actions\_menu","CloudShell\_\_cloud\_shell\_button","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","MiscFeatureFlags\_\_enable\_llms\_txt","Profiles\_\_enable\_completequiz\_endpoint","Profiles\_\_enable\_playlist\_community\_acl","Cloud\_\_enable\_cloudx\_experiment\_ids","DevPro\_\_remove\_eu\_tax\_intake\_form","MiscFeatureFlags\_\_enable\_variable\_operator","Profiles\_\_enable\_stripe\_subscription\_management","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","SignIn\_\_enable\_l1\_signup\_flow","DevPro\_\_enable\_embed\_profile\_creation","DevPro\_\_enable\_code\_assist","Concierge\_\_enable\_devsite\_llm\_tools","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","Profiles\_\_enable\_awarding\_url","Concierge\_\_enable\_remove\_info\_panel\_tags","Cloud\_\_enable\_llm\_concierge\_chat","Search\_\_enable\_ai\_search\_summaries\_for\_all","DevPro\_\_enable\_google\_payments\_buyflow","DevPro\_\_enable\_cloud\_innovators\_plus","Profiles\_\_enable\_user\_type","MiscFeatureFlags\_\_enable\_explain\_this\_code","MiscFeatureFlags\_\_emergency\_css","DevPro\_\_enable\_nvidia\_credits\_card","Cloud\_\_enable\_free\_trial\_server\_call","Analytics\_\_enable\_clearcut\_logging","Profiles\_\_enable\_recognition\_badges","Profiles\_\_enable\_auto\_apply\_credits","DevPro\_\_enable\_free\_benefits","DevPro\_\_enable\_devpro\_offers","Cloud\_\_cache\_serialized\_dynamic\_content","MiscFeatureFlags\_\_enable\_appearance\_cookies","Concierge\_\_enable\_pushui","Search\_\_enable\_ai\_eligibility\_checks","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","DevPro\_\_enable\_vertex\_credit\_card","Profiles\_\_require\_profile\_eligibility\_for\_signin","DevPro\_\_enable\_enterprise","MiscFeatureFlags\_\_developers\_footer\_dark\_image","TpcFeatures\_\_proxy\_prod\_host","DevPro\_\_enable\_google\_one\_card","DevPro\_\_enable\_firebase\_workspaces\_card","MiscFeatureFlags\_\_developers\_footer\_image","MiscFeatureFlags\_\_enable\_firebase\_utm","Experiments\_\_reqs\_query\_experiments","Cloud\_\_enable\_legacy\_calculator\_redirect","Profiles\_\_enable\_public\_developer\_profiles","Profiles\_\_enable\_callout\_notifications","Cloud\_\_fast\_free\_trial","Profiles\_\_enable\_page\_saving","Search\_\_enable\_suggestions\_from\_borg","OnSwitch\_\_enable","Profiles\_\_enable\_purchase\_prompts","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","Search\_\_enable\_dynamic\_content\_confidential\_banner","Cloud\_\_enable\_cloud\_shell","MiscFeatureFlags\_\_enable\_view\_transitions","DevPro\_\_enable\_developer\_subscriptions","Profiles\_\_enable\_release\_notes\_notifications"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

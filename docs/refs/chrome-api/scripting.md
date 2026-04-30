# chrome.scripting

**Source:** https://developer.chrome.com/docs/extensions/reference/api/scripting

---

Description
-----------

Use the `chrome.scripting` API to execute script in different contexts.

Permissions
-----------

`scripting`  

Availability
------------

Chrome 88+ MV3+

Manifest
--------

To use the `chrome.scripting` API, declare the `"scripting"` permission in the [manifest](/docs/extensions/reference/manifest) plus the host permissions for the pages to inject scripts into. Use the [`"host_permissions"`](/docs/extensions/develop/concepts/declare-permissions) key or the [`"activeTab"`](/docs/extensions/develop/concepts/activeTab) permission, which grants temporary host permissions. The following example uses the activeTab permission.

{
      "name": "Scripting Extension",
      "manifest_version": 3,
      "permissions": ["scripting", "activeTab"],
      ...
    }

Concepts and usage
------------------

You can use the `chrome.scripting` API to inject JavaScript and CSS into websites. This is similar to what you can do with [content scripts](/docs/extensions/develop/concepts/content-scripts). But by using the [`chrome.scripting`](/docs/extensions/reference/scripting) namespace, extensions can make decisions at runtime.

### Injection targets

You can use the `target` parameter to specify a target to inject JavaScript or CSS into.

The only required field is `tabId`. By default, an injection will run in the main frame of the specified tab.

function getTabId() { ... }
    
    chrome.scripting
        .executeScript({
          target : {tabId : getTabId()},
          files : [ "script.js" ],
        })
        .then(() => console.log("script injected"));

To run in all frames of the specified tab, you can set the `allFrames` boolean to `true`.

function getTabId() { ... }
    
    chrome.scripting
        .executeScript({
          target : {tabId : getTabId(), allFrames : true},
          files : [ "script.js" ],
        })
        .then(() => console.log("script injected in all frames"));

You can also inject into specific frames of a tab by specifying individual frame IDs. For more information on frame IDs, see the [`chrome.webNavigation` API](/docs/extensions/reference/api/webNavigation).

function getTabId() { ... }
    
    chrome.scripting
        .executeScript({
          target : {tabId : getTabId(), frameIds : [ frameId1, frameId2 ]},
          files : [ "script.js" ],
        })
        .then(() => console.log("script injected on target frames"));

**Note:** You cannot specify both the `"frameIds"` and `"allFrames"` properties.

### Injected code

Extensions can specify the code to be injected either via an external file or a runtime variable.

#### Files

Files are specified as strings that are paths relative to the extension's root directory. The following code will inject the file `script.js` into the main frame of the tab.

function getTabId() { ... }
    
    chrome.scripting
        .executeScript({
          target : {tabId : getTabId()},
          files : [ "script.js" ],
        })
        .then(() => console.log("injected script file"));

#### Runtime functions

When injecting JavaScript with `scripting.executeScript()`, you can specify a function to be executed instead of a file. This function should be a function variable available to the current extension context.

function getTabId() { ... }
    function getTitle() { return document.title; }
    
    chrome.scripting
        .executeScript({
          target : {tabId : getTabId()},
          func : getTitle,
        })
        .then(() => console.log("injected a function"));

function getTabId() { ... }
    function getUserColor() { ... }
    
    function changeBackgroundColor() {
      document.body.style.backgroundColor = getUserColor();
    }
    
    chrome.scripting
        .executeScript({
          target : {tabId : getTabId()},
          func : changeBackgroundColor,
        })
        .then(() => console.log("injected a function"));

You can work around this by using the `args` property:

function getTabId() { ... }
    function getUserColor() { ... }
    function changeBackgroundColor(backgroundColor) {
      document.body.style.backgroundColor = backgroundColor;
    }
    
    chrome.scripting
        .executeScript({
          target : {tabId : getTabId()},
          func : changeBackgroundColor,
          args : [ getUserColor() ],
        })
        .then(() => console.log("injected a function"));

#### Runtime strings

If injecting CSS within a page, you can also specify a string to be used in the `css` property. This option is only available for `scripting.insertCSS()`; you can't execute a string using `scripting.executeScript()`.

function getTabId() { ... }
    const css = "body { background-color: red; }";
    
    chrome.scripting
        .insertCSS({
          target : {tabId : getTabId()},
          css : css,
        })
        .then(() => console.log("CSS injected"));

### Handle the results

The results of executing JavaScript are passed to the extension. A single result is included per-frame. The main frame is guaranteed to be the first index in the resulting array; all other frames are in a non-deterministic order.

function getTabId() { ... }
    function getTitle() { return document.title; }
    
    chrome.scripting
        .executeScript({
          target : {tabId : getTabId(), allFrames : true},
          func : getTitle,
        })
        .then(injectionResults => {
          for (const {frameId, result} of injectionResults) {
            console.log(`Frame ${frameId} result:`, result);
          }
        });

`scripting.insertCSS()` does not return any results.

#### Promises

If the resulting value of the script execution is a promise, Chrome will wait for the promise to settle and return the resulting value.

function getTabId() { ... }
    async function addIframe() {
      const iframe = document.createElement("iframe");
      const loadComplete =
          new Promise(resolve => iframe.addEventListener("load", resolve));
      iframe.src = "https://example.com";
      document.body.appendChild(iframe);
      await loadComplete;
      return iframe.contentWindow.document.title;
    }
    
    chrome.scripting
        .executeScript({
          target : {tabId : getTabId(), allFrames : true},
          func : addIframe,
        })
        .then(injectionResults => {
          for (const frameResult of injectionResults) {
            const {frameId, result} = frameResult;
            console.log(`Frame ${frameId} result:`, result);
          }
        });

Examples
--------

### Unregister all dynamic content scripts

The following snippet contains a function that unregisters all dynamic content scripts the extension has previously registered.

async function unregisterAllDynamicContentScripts() {
      try {
        const scripts = await chrome.scripting.getRegisteredContentScripts();
        const scriptIds = scripts.map(script => script.id);
        return chrome.scripting.unregisterContentScripts({ ids: scriptIds });
      } catch (error) {
        const message = [
          "An unexpected error occurred while",
          "unregistering dynamic content scripts.",
        ].join(" ");
        throw new Error(message, {cause : error});
      }
    }

**Key point:** Unregistering content scripts will not remove scripts or styles that have already been injected.

To try the `chrome.scripting` API, install the [scripting sample](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/scripting) from the [Chrome extension samples](https://github.com/GoogleChrome/chrome-extensions-samples) repository.

Types
-----

### ContentScriptFilter

Chrome 96+

#### Properties

*   ids
    
    string\[\] optional
    
    If specified, [`getRegisteredContentScripts`](#method-getRegisteredContentScripts) will only return scripts with an id specified in this list.
    

### CSSInjection

#### Properties

*   css
    
    string optional
    
    A string containing the CSS to inject. Exactly one of `files` and `css` must be specified.
    
*   files
    
    string\[\] optional
    
    The path of the CSS files to inject, relative to the extension's root directory. Exactly one of `files` and `css` must be specified.
    
*   origin
    
    [StyleOrigin](#type-StyleOrigin) optional
    
    The style origin for the injection. Defaults to `'AUTHOR'`.
    
*   target
    
    [InjectionTarget](#type-InjectionTarget)
    
    Details specifying the target into which to insert the CSS.
    

### ExecutionWorld

Chrome 95+

The JavaScript world for a script to execute within.

#### Enum

"ISOLATED"  
Specifies the isolated world, which is the execution environment unique to this extension.

"MAIN"  
Specifies the main world of the DOM, which is the execution environment shared with the host page's JavaScript.

### InjectionResult

#### Properties

*   documentId
    
    string
    
    Chrome 106+
    
    The document associated with the injection.
    
*   frameId
    
    number
    
    Chrome 90+
    
    The frame associated with the injection.
    
*   result
    
    any optional
    
    The result of the script execution.
    

### InjectionTarget

#### Properties

*   allFrames
    
    boolean optional
    
    Whether the script should inject into all frames within the tab. Defaults to false. This must not be true if `frameIds` is specified.
    
*   documentIds
    
    string\[\] optional
    
    Chrome 106+
    
    The [IDs](https://developer.chrome.com/docs/extensions/reference/webNavigation/#document_ids) of specific documentIds to inject into. This must not be set if `frameIds` is set.
    
*   frameIds
    
    number\[\] optional
    
    The [IDs](https://developer.chrome.com/docs/extensions/reference/webNavigation/#frame_ids) of specific frames to inject into.
    
*   tabId
    
    number
    
    The ID of the tab into which to inject.
    

### RegisteredContentScript

Chrome 96+

#### Properties

*   allFrames
    
    boolean optional
    
    If specified true, it will inject into all frames, even if the frame is not the top-most frame in the tab. Each frame is checked independently for URL requirements; it will not inject into child frames if the URL requirements are not met. Defaults to false, meaning that only the top frame is matched.
    
*   css
    
    string\[\] optional
    
    The list of CSS files to be injected into matching pages. These are injected in the order they appear in this array, before any DOM is constructed or displayed for the page.
    
*   excludeMatches
    
    string\[\] optional
    
    Excludes pages that this content script would otherwise be injected into. See [Match Patterns](https://developer.chrome.com/extensions/develop/concepts/match-patterns) for more details on the syntax of these strings.
    
*   id
    
    string
    
    The id of the content script, specified in the API call. Must not start with a '\_' as it's reserved as a prefix for generated script IDs.
    
*   js
    
    string\[\] optional
    
    The list of JavaScript files to be injected into matching pages. These are injected in the order they appear in this array.
    
*   matchOriginAsFallback
    
    boolean optional
    
    Chrome 119+
    
    Indicates whether the script can be injected into frames where the URL contains an unsupported scheme; specifically: about:, data:, blob:, or filesystem:. In these cases, the URL's origin is checked to determine if the script should be injected. If the origin is `null` (as is the case for data: URLs) then the used origin is either the frame that created the current frame or the frame that initiated the navigation to this frame. Note that this may not be the parent frame.
    
*   matches
    
    string\[\] optional
    
    Specifies which pages this content script will be injected into. See [Match Patterns](https://developer.chrome.com/extensions/develop/concepts/match-patterns) for more details on the syntax of these strings. Must be specified for [`registerContentScripts`](#method-registerContentScripts).
    
*   persistAcrossSessions
    
    boolean optional
    
    Specifies if this content script will persist into future sessions. The default is true.
    
*   runAt
    
    [RunAt](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-RunAt) optional
    
    Specifies when JavaScript files are injected into the web page. The preferred and default value is `document_idle`.
    
*   world
    
    [ExecutionWorld](#type-ExecutionWorld) optional
    
    Chrome 102+
    
    The JavaScript "world" to run the script in. Defaults to `ISOLATED`.
    

### ScriptInjection

#### Properties

*   args
    
    any\[\] optional
    
    Chrome 92+
    
    The arguments to pass to the provided function. This is only valid if the `func` parameter is specified. These arguments must be JSON-serializable.
    
*   files
    
    string\[\] optional
    
    The path of the JS or CSS files to inject, relative to the extension's root directory. Exactly one of `files` or `func` must be specified.
    
*   injectImmediately
    
    boolean optional
    
    Chrome 102+
    
    Whether the injection should be triggered in the target as soon as possible. Note that this is not a guarantee that injection will occur prior to page load, as the page may have already loaded by the time the script reaches the target.
    
*   target
    
    [InjectionTarget](#type-InjectionTarget)
    
    Details specifying the target into which to inject the script.
    
*   world
    
    [ExecutionWorld](#type-ExecutionWorld) optional
    
    Chrome 95+
    
    The JavaScript "world" to run the script in. Defaults to `ISOLATED`.
    
*   func
    
    void optional
    
    Chrome 92+
    
    A JavaScript function to inject. This function will be serialized, and then deserialized for injection. This means that any bound parameters and execution context will be lost. Exactly one of `files` or `func` must be specified.
    
    The `func` function looks like:
    
    () => {...}
    

### StyleOrigin

The origin for a style change. See [style origins](https://developer.mozilla.org/en-US/docs/Glossary/Style_origin) for more info.

#### Enum

"AUTHOR"  

"USER"  

Methods
-------

### executeScript()

chrome.scripting.executeScript(  
  injection: [ScriptInjection](#type-ScriptInjection),  
): Promise<[InjectionResult](#type-InjectionResult)\[\]\>

Injects a script into a target context. By default, the script will be run at `document_idle`, or immediately if the page has already loaded. If the `injectImmediately` property is set, the script will inject without waiting, even if the page has not finished loading. If the script evaluates to a promise, the browser will wait for the promise to settle and return the resulting value.

#### Parameters

*   injection
    
    [ScriptInjection](#type-ScriptInjection)
    
    The details of the script which to inject.
    

#### Returns

*   Promise<[InjectionResult](#type-InjectionResult)\[\]>
    
    Chrome 90+
    
    Returns a Promise which resolves upon completion of the injection. The resulting array contains the result of execution for each frame where the injection succeeded.
    

### getRegisteredContentScripts()

Chrome 96+

chrome.scripting.getRegisteredContentScripts(  
  filter?: [ContentScriptFilter](#type-ContentScriptFilter),  
): Promise<[RegisteredContentScript](#type-RegisteredContentScript)\[\]\>

Returns all dynamically registered content scripts for this extension that match the given filter.

#### Parameters

*   filter
    
    [ContentScriptFilter](#type-ContentScriptFilter) optional
    
    An object to filter the extension's dynamically registered scripts.
    

#### Returns

*   Promise<[RegisteredContentScript](#type-RegisteredContentScript)\[\]>
    

### insertCSS()

chrome.scripting.insertCSS(  
  injection: [CSSInjection](#type-CSSInjection),  
): Promise<void>

Inserts a CSS stylesheet into a target context. If multiple frames are specified, unsuccessful injections are ignored.

#### Parameters

*   injection
    
    [CSSInjection](#type-CSSInjection)
    
    The details of the styles to insert.
    

#### Returns

*   Promise<void>
    
    Chrome 90+
    
    Returns a Promise which resolves upon completion of the insertion.
    

### registerContentScripts()

Chrome 96+

chrome.scripting.registerContentScripts(  
  scripts: [RegisteredContentScript](#type-RegisteredContentScript)\[\],  
): Promise<void>

Registers one or more content scripts for this extension.

#### Parameters

*   scripts
    
    [RegisteredContentScript](#type-RegisteredContentScript)\[\]
    
    Contains a list of scripts to be registered. If there are errors during script parsing/file validation, or if the IDs specified already exist, then no scripts are registered.
    

#### Returns

*   Promise<void>
    
    Returns a Promise which resolves once scripts have been fully registered or rejects if an error has occurred.
    

### removeCSS()

Chrome 90+

chrome.scripting.removeCSS(  
  injection: [CSSInjection](#type-CSSInjection),  
): Promise<void>

Removes a CSS stylesheet that was previously inserted by this extension from a target context.

#### Parameters

*   injection
    
    [CSSInjection](#type-CSSInjection)
    
    The details of the styles to remove. Note that the `css`, `files`, and `origin` properties must exactly match the stylesheet inserted through [`insertCSS`](#method-insertCSS). Attempting to remove a non-existent stylesheet is a no-op.
    

#### Returns

*   Promise<void>
    
    Returns a Promise which resolves upon the completion of the removal.
    

### unregisterContentScripts()

Chrome 96+

chrome.scripting.unregisterContentScripts(  
  filter?: [ContentScriptFilter](#type-ContentScriptFilter),  
): Promise<void>

Unregisters content scripts for this extension.

#### Parameters

*   filter
    
    [ContentScriptFilter](#type-ContentScriptFilter) optional
    
    If specified, only unregisters dynamic content scripts which match the filter. Otherwise, all of the extension's dynamic content scripts are unregistered.
    

#### Returns

*   Promise<void>
    
    Returns a Promise which resolves once scripts have been unregistered or rejects if an error has occurred.
    

### updateContentScripts()

Chrome 96+

chrome.scripting.updateContentScripts(  
  scripts: [RegisteredContentScript](#type-RegisteredContentScript)\[\],  
): Promise<void>

Updates one or more content scripts for this extension.

#### Parameters

*   scripts
    
    [RegisteredContentScript](#type-RegisteredContentScript)\[\]
    
    Contains a list of scripts to be updated. A property is only updated for the existing script if it is specified in this object. If there are errors during script parsing/file validation, or if the IDs specified do not correspond to a fully registered script, then no scripts are updated.
    

#### Returns

*   Promise<void>
    
    Returns a Promise which resolves once scripts have been updated or rejects if an error has occurred.
    

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,116,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["Cloud\_\_enable\_cloud\_dlp\_service","DevPro\_\_enable\_devpro\_offers","Profiles\_\_enable\_join\_program\_group\_endpoint","DevPro\_\_enable\_firebase\_workspaces\_card","Profiles\_\_enable\_complete\_playlist\_endpoint","DevPro\_\_enable\_google\_one\_card","Analytics\_\_enable\_clearcut\_logging","Concierge\_\_enable\_actions\_menu","Search\_\_enable\_page\_map","EngEduTelemetry\_\_enable\_engedu\_telemetry","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","MiscFeatureFlags\_\_enable\_variable\_operator","CloudShell\_\_cloud\_shell\_button","Profiles\_\_enable\_developer\_profiles\_callout","CloudShell\_\_cloud\_code\_overflow\_menu","SignIn\_\_enable\_l1\_signup\_flow","Profiles\_\_enable\_completequiz\_endpoint","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","Profiles\_\_enable\_awarding\_url","MiscFeatureFlags\_\_enable\_firebase\_utm","MiscFeatureFlags\_\_enable\_project\_variables","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","Profiles\_\_enable\_purchase\_prompts","Profiles\_\_enable\_stripe\_subscription\_management","DevPro\_\_enable\_nvidia\_credits\_card","Search\_\_enable\_ai\_search\_summaries\_for\_all","Cloud\_\_fast\_free\_trial","MiscFeatureFlags\_\_enable\_explain\_this\_code","Profiles\_\_enable\_playlist\_community\_acl","DevPro\_\_enable\_cloud\_innovators\_plus","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","MiscFeatureFlags\_\_enable\_view\_transitions","Cloud\_\_enable\_free\_trial\_server\_call","DevPro\_\_enable\_vertex\_credit\_card","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","Profiles\_\_enable\_completecodelab\_endpoint","Cloud\_\_enable\_llm\_concierge\_chat","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","MiscFeatureFlags\_\_developers\_footer\_dark\_image","Profiles\_\_enable\_callout\_notifications","MiscFeatureFlags\_\_emergency\_css","OnSwitch\_\_enable","DevPro\_\_enable\_developer\_subscriptions","DevPro\_\_enable\_code\_assist","TpcFeatures\_\_proxy\_prod\_host","DevPro\_\_enable\_free\_benefits","Profiles\_\_enable\_auto\_apply\_credits","Search\_\_enable\_suggestions\_from\_borg","Cloud\_\_cache\_serialized\_dynamic\_content","Profiles\_\_enable\_release\_notes\_notifications","Concierge\_\_enable\_remove\_info\_panel\_tags","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","MiscFeatureFlags\_\_enable\_llms\_txt","Search\_\_enable\_dynamic\_content\_confidential\_banner","DevPro\_\_remove\_eu\_tax\_intake\_form","DevPro\_\_enable\_google\_payments\_buyflow","DevPro\_\_enable\_payments\_first\_batch","MiscFeatureFlags\_\_developers\_footer\_image","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","Profiles\_\_enable\_recognition\_badges","Cloud\_\_enable\_legacy\_calculator\_redirect","Concierge\_\_enable\_pushui","Profiles\_\_enable\_public\_developer\_profiles","Profiles\_\_enable\_dashboard\_curated\_recommendations","Profiles\_\_require\_profile\_eligibility\_for\_signin","Cloud\_\_enable\_cloudx\_experiment\_ids","Cloud\_\_enable\_cloud\_shell","Profiles\_\_enable\_page\_saving","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","Search\_\_enable\_ai\_eligibility\_checks","DevPro\_\_enable\_enterprise","DevPro\_\_enable\_embed\_profile\_creation","Profiles\_\_enable\_user\_type","Experiments\_\_reqs\_query\_experiments","Concierge\_\_enable\_devsite\_llm\_tools","Profiles\_\_enable\_profile\_collections","MiscFeatureFlags\_\_enable\_appearance\_cookies","BookNav\_\_enable\_tenant\_cache\_key"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

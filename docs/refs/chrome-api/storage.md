# chrome.storage

**Source:** https://developer.chrome.com/docs/extensions/reference/api/storage

---

Description
-----------

Use the `chrome.storage` API to store, retrieve, and track changes to user data.

Permissions
-----------

`storage`  

To use the storage API, declare the `"storage"` permission in the extension [manifest](/docs/extensions/reference/manifest). For example:

{
      "name": "My extension",
      ...
      "permissions": [
        "storage"
      ],
      ...
    }

Examples
--------

The following samples demonstrate the `local`, `sync`, and `session` storage areas:

### Example (Local)

chrome.storage.local.set({ key: value }).then(() => {
      console.log("Value is set");
    });
    
    chrome.storage.local.get(["key"]).then((result) => {
      console.log("Value is " + result.key);
    });

### Example (Sync)

chrome.storage.sync.set({ key: value }).then(() => {
      console.log("Value is set");
    });
    
    chrome.storage.sync.get(["key"]).then((result) => {
      console.log("Value is " + result.key);
    });

### Example (Session)

chrome.storage.session.set({ key: value }).then(() => {
      console.log("Value is set");
    });
    
    chrome.storage.session.get(["key"]).then((result) => {
      console.log("Value is " + result.key);
    });

To see other demos of the Storage API, explore any of the following samples:

*   [Global search extension](https://github.com/GoogleChrome/chrome-extensions-samples/tree/17956f44b6f04d28407a4b7eee428611affd4fab/api/contextMenus/global_context_search).
*   [Water alarm extension](https://github.com/GoogleChrome/chrome-extensions-samples/tree/17956f44b6f04d28407a4b7eee428611affd4fab/examples/water_alarm_notification).

Concepts and usage
------------------

The Storage API provides an extension-specific way to persist user data and state. It's similar to the web platform's storage APIs ([IndexedDB](https://developer.mozilla.org/docs/Web/API/Window/indexeddb), and [Storage](https://developer.mozilla.org/docs/Web/API/Storage)), but was designed to meet the storage needs of extensions. The following are a few key features:

*   All extension contexts, including the extension service worker and content scripts have access to the Storage API.
*   The JSON serializable values are stored as object properties.
*   The Storage API is asynchronous with bulk read and write operations.
*   Even if the user clears the cache and browsing history, the data persists.
*   Stored settings persist even when using [split incognito](/docs/extensions/reference/manifest/incognito).
*   Includes an exclusive read-only [managed storage area](#property-managed) for enterprise policies.

### Can extensions use web storage APIs?

While extensions can use the [`Storage`](https://developer.mozilla.org/docs/Web/API/Storage) interface (accessible from `window.localStorage`) in some contexts (popup and other HTML pages), we don't recommend it for the following reasons:

*   Extension service workers can't use the Web Storage API.
*   Content scripts share storage with the host page.
*   Data saved using the Web Storage API is lost when the user clears their browsing history.

To move data from web storage APIs to extension storage APIs from a service worker:

1.  Prepare an offscreen document html page and script file. The script file should contain a conversion routine and an [`onMessage`](/docs/extensions/reference/api/runtime#event-onMessage) handler.
2.  In the extension service worker, check `chrome.storage` for your data.
3.  If your data isn't found, call [`createDocument()`](/docs/extensions/reference/api/offscreen#method-createDocument).
4.  After the returned Promise resolves, call [`sendMessage()`](/docs/extensions/reference/api/runtime#method-sendMessage) to start the conversion routine.
5.  Inside the offscreen document's `onMessage` handler, call the conversion routine.

There are also some nuances to how web storage APIs work in extensions. Learn more in the [Storage and Cookies](/docs/extensions/develop/concepts/storage-and-cookies) article.

### Storage and throttling limits

The Storage API has usage limitations:

*   Storing data has performance costs, and the API includes storage quotas. Plan the data you intend to store, so you maintain storage space.
*   Storage can take time to complete. Structure your code to account for that time.

For details on storage area limitations and what happens when they're exceeded, see the quota information for [`sync`](#property-sync), [`local`](#property-local), and [`session`](#property-session).

Storage areas
-------------

The Storage API is divided into the following storage areas:

### Local

Data is stored locally and cleared when the extension is removed. The storage limit is 10 MB (5 MB in Chrome 113 and earlier), but can be increased by requesting the `"unlimitedStorage"` permission. We recommend using `storage.local` to store larger amounts of data. By default, it's exposed to content scripts, but this behavior can be changed by calling [`chrome.storage.local.setAccessLevel()`](/docs/extensions/reference/api/storage/StorageArea#method-StorageArea-setAccessLevel).

### Managed

Managed storage is read-only for policy-installed extensions. It's managed by system administrators, using a developer-defined schema and enterprise policies. Policies are similar to options but are configured by a system administrator, instead of the user. This allows the extension to be preconfigured for all users of an organization.

By default, `storage.managed` is exposed to content scripts, but this behavior can be changed by calling [`chrome.storage.managed.setAccessLevel()`](/docs/extensions/reference/api/storage/StorageArea#method-StorageArea-setAccessLevel). For information on policies, see [Documentation for Administrators](https://www.chromium.org/administrators/). To learn more about the `managed` storage area, see [Manifest for storage areas](/docs/extensions/reference/api/storage).

### Session

Session storage holds data in memory while an extension is loaded. The storage is cleared if the extension is disabled, reloaded, updated, and when the browser restarts. By default, it's not exposed to content scripts, but this behavior can be changed by calling [`chrome.storage.session.setAccessLevel()`](/docs/extensions/reference/api/storage/StorageArea#method-StorageArea-setAccessLevel). The storage limit is 10 MB (1 MB in Chrome 111 and earlier).

The`storage.session` interface is one of several [we recommend for service workers](/docs/extensions/mv3/service_workers/service-worker-lifecycle#persist-data).

### Sync

If the user enables syncing, the data syncs with every Chrome browser that the user is logged into. If disabled, it behaves like `storage.local`. Chrome stores the data locally when the browser is offline and resumes syncing when it's back online. The quota limitation is approximately 100 KB, 8 KB per item.

We recommend using `storage.sync` to preserve user settings across synced browsers. If you're working with sensitive user data, instead use `storage.session`. By default, `storage.sync` is exposed to content scripts, but this behavior can be changed by calling [`chrome.storage.sync.setAccessLevel()`](/docs/extensions/reference/api/storage/StorageArea#method-StorageArea-setAccessLevel).

Methods and events
------------------

All storage areas implement the [`StorageArea`](/docs/extensions/reference/api/storage/StorageArea) interface.

### get()

The [`get()`](/docs/extensions/reference/api/storage/StorageArea#method-StorageArea-get) method lets you read one or more keys from a `StorageArea`.

### getBytesInUse()

The [`getBytesInUse()`](/docs/extensions/reference/api/storage/StorageArea#method-StorageArea-getBytesInUse) method lets you see the quota used by a `StorageArea`.

### getKeys()

The [`getKeys()`](/docs/extensions/reference/api/storage/StorageArea#method-StorageArea-getKeys) method lets you get all keys stored in a `StorageArea`.

### remove()

The [`remove()`](/docs/extensions/reference/api/storage/StorageArea#method-StorageArea-remove) method lets you remove an item from a `StorageArea`.

### set()

The [`set()`](/docs/extensions/reference/api/storage/StorageArea#method-StorageArea-set) method lets you set an item in a `StorageArea`.

### setAccessLevel()

The [`setAccessLevel()`](/docs/extensions/reference/api/storage/StorageArea#method-StorageArea-setAccessLevel) method lets you control access to a `StorageArea`.

### clear()

The [`clear()`](/docs/extensions/reference/api/storage/StorageArea#method-StorageArea-clear) method lets you clear all data from a `StorageArea`.

### onChanged

The [`onChanged`](/docs/extensions/reference/api/storage/StorageArea#event-StorageArea-onChanged) event lets you monitor changes to a `StorageArea`.

Use cases
---------

The following sections demonstrate common use cases for the Storage API.

### Respond to storage updates

To track changes made to storage, add a listener to its `onChanged` event. When anything changes in storage, that event fires. The sample code listens for these changes:

background.js:

chrome.storage.onChanged.addListener((changes, namespace) => {
      for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        console.log(
          `Storage key "${key}" in namespace "${namespace}" changed.`,
          `Old value was "${oldValue}", new value is "${newValue}".`
        );
      }
    });

We can take this idea even further. In this example, we have an [options page](/docs/extensions/develop/ui/options-page) that allows the user to toggle a "debug mode" (implementation not shown here). The options page immediately saves the new settings to `storage.sync`, and the service worker uses `storage.onChanged` to apply the setting as soon as possible.

options.html:

<!-- type="module" allows you to use top level await -->
    <script defer src="options.js" type="module"></script>
    <form id="optionsForm">
      <label for="debug">
        <input type="checkbox" name="debug" id="debug">
        Enable debug mode
      </label>
    </form>

options.js:

// In-page cache of the user's options
    const options = {};
    const optionsForm = document.getElementById("optionsForm");
    
    // Immediately persist options changes
    optionsForm.debug.addEventListener("change", (event) => {
      options.debug = event.target.checked;
      chrome.storage.sync.set({ options });
    });
    
    // Initialize the form with the user's option settings
    const data = await chrome.storage.sync.get("options");
    Object.assign(options, data.options);
    optionsForm.debug.checked = Boolean(options.debug);

background.js:

function setDebugMode() { /* ... */ }
    
    // Watch for changes to the user's options & apply them
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.options?.newValue) {
        const debugMode = Boolean(changes.options.newValue.debug);
        console.log('enable debug mode?', debugMode);
        setDebugMode(debugMode);
      }
    });

### Asynchronous preload from storage

Because service workers don't run all the time, Manifest V3 extensions sometimes need to asynchronously load data from storage before they execute their event handlers. To do this, the following snippet uses an async `action.onClicked` event handler that waits for the `storageCache` global to be populated before executing its logic.

background.js:

// Where we will expose all the data we retrieve from storage.sync.
    const storageCache = { count: 0 };
    // Asynchronously retrieve data from storage.sync, then cache it.
    const initStorageCache = chrome.storage.sync.get().then((items) => {
      // Copy the data retrieved from storage into storageCache.
      Object.assign(storageCache, items);
    });
    
    chrome.action.onClicked.addListener(async (tab) => {
      try {
        await initStorageCache;
      } catch (e) {
        // Handle error that occurred during storage initialization.
      }
    
      // Normal action handler logic.
      storageCache.count++;
      storageCache.lastTabId = tab.id;
      chrome.storage.sync.set(storageCache);
    });

DevTools
--------

You can view and edit data stored using the API in DevTools. To learn more, see the [View and edit extension storage](/docs/devtools/storage/extensionstorage) page in the DevTools documentation.

Types
-----

### AccessLevel

Chrome 102+

The storage area's access level.

#### Enum

"TRUSTED\_CONTEXTS"  
Specifies contexts originating from the extension itself.

"TRUSTED\_AND\_UNTRUSTED\_CONTEXTS"  
Specifies contexts originating from outside the extension.

### StorageChange

#### Properties

*   newValue
    
    any optional
    
    The new value of the item, if there is a new value.
    
*   oldValue
    
    any optional
    
    The old value of the item, if there was an old value.
    

Properties
----------

### local

Items in the `local` storage area are local to each machine.

#### Type

[StorageArea](https://developer.chrome.com/docs/extensions/reference/api/storage/StorageArea/#type-StorageArea) & object

#### Properties

*   QUOTA\_BYTES
    
    10485760  
    
    The maximum amount (in bytes) of data that can be stored in local storage, as measured by the JSON stringification of every value plus every key's length. This value will be ignored if the extension has the `unlimitedStorage` permission. Updates that would cause this limit to be exceeded fail immediately and set [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/api/runtime/#property-lastError) when using a callback, or a rejected Promise if using async/await.
    

### managed

Items in the `managed` storage area are set by an enterprise policy configured by the domain administrator, and are read-only for the extension; trying to modify this namespace results in an error. For information on configuring a policy, see [Manifest for storage areas](https://developer.chrome.com/docs/extensions/reference/manifest/storage).

#### Type

[StorageArea](https://developer.chrome.com/docs/extensions/reference/api/storage/StorageArea/#type-StorageArea)

### session

Chrome 102+ MV3+

Items in the `session` storage area are stored in-memory and will not be persisted to disk.

#### Type

[StorageArea](https://developer.chrome.com/docs/extensions/reference/api/storage/StorageArea/#type-StorageArea) & object

#### Properties

*   QUOTA\_BYTES
    
    10485760  
    
    The maximum amount (in bytes) of data that can be stored in memory, as measured by estimating the dynamically allocated memory usage of every value and key. Updates that would cause this limit to be exceeded fail immediately and set [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/api/runtime/#property-lastError) when using a callback, or when a Promise is rejected.
    

### sync

Items in the `sync` storage area are synced using Chrome Sync.

#### Type

[StorageArea](https://developer.chrome.com/docs/extensions/reference/api/storage/StorageArea/#type-StorageArea) & object

#### Properties

*   MAX\_ITEMS
    
    512  
    
    The maximum number of items that can be stored in sync storage. Updates that would cause this limit to be exceeded will fail immediately and set [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/api/runtime/#property-lastError) when using a callback, or when a Promise is rejected.
    
*   MAX\_SUSTAINED\_WRITE\_OPERATIONS\_PER\_MINUTE
    
    1000000  
    
    Deprecated
    
    The storage.sync API no longer has a sustained write operation quota.
    
*   MAX\_WRITE\_OPERATIONS\_PER\_HOUR
    
    1800  
    
    The maximum number of `set`, `remove`, or `clear` operations that can be performed each hour. This is 1 every 2 seconds, a lower ceiling than the short term higher writes-per-minute limit.
    
    Updates that would cause this limit to be exceeded fail immediately and set [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/api/runtime/#property-lastError) when using a callback, or when a Promise is rejected.
    
*   MAX\_WRITE\_OPERATIONS\_PER\_MINUTE
    
    120  
    
    The maximum number of `set`, `remove`, or `clear` operations that can be performed each minute. This is 2 per second, providing higher throughput than writes-per-hour over a shorter period of time.
    
    Updates that would cause this limit to be exceeded fail immediately and set [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/api/runtime/#property-lastError) when using a callback, or when a Promise is rejected.
    
*   QUOTA\_BYTES
    
    102400  
    
    The maximum total amount (in bytes) of data that can be stored in sync storage, as measured by the JSON stringification of every value plus every key's length. Updates that would cause this limit to be exceeded fail immediately and set [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/api/runtime/#property-lastError) when using a callback, or when a Promise is rejected.
    
*   QUOTA\_BYTES\_PER\_ITEM
    
    8192  
    
    The maximum size (in bytes) of each individual item in sync storage, as measured by the JSON stringification of its value plus its key length. Updates containing items larger than this limit will fail immediately and set [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/api/runtime/#property-lastError) when using a callback, or when a Promise is rejected.
    

Events
------

### onChanged

chrome.storage.onChanged.addListener(  
  callback: function,  
)

Fired when one or more items change.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (changes: object, areaName: string) => void
    
    *   changes
        
        object
        
    *   areaName
        
        string
        
    

Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2025-12-19 UTC.

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",1,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["Search\_\_enable\_page\_map","DevPro\_\_enable\_enterprise","Cloud\_\_enable\_cloud\_shell","OnSwitch\_\_enable","SignIn\_\_enable\_l1\_signup\_flow","DevPro\_\_remove\_eu\_tax\_intake\_form","Profiles\_\_enable\_completequiz\_endpoint","Cloud\_\_enable\_legacy\_calculator\_redirect","Profiles\_\_enable\_public\_developer\_profiles","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","Cloud\_\_enable\_cloud\_dlp\_service","Profiles\_\_enable\_page\_saving","MiscFeatureFlags\_\_developers\_footer\_image","MiscFeatureFlags\_\_enable\_firebase\_utm","Cloud\_\_enable\_free\_trial\_server\_call","MiscFeatureFlags\_\_enable\_explain\_this\_code","Profiles\_\_enable\_complete\_playlist\_endpoint","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","MiscFeatureFlags\_\_emergency\_css","CloudShell\_\_cloud\_shell\_button","DevPro\_\_enable\_devpro\_offers","DevPro\_\_enable\_developer\_subscriptions","Cloud\_\_enable\_llm\_concierge\_chat","DevPro\_\_enable\_code\_assist","DevPro\_\_enable\_embed\_profile\_creation","Search\_\_enable\_ai\_search\_summaries\_for\_all","Concierge\_\_enable\_remove\_info\_panel\_tags","DevPro\_\_enable\_free\_benefits","Analytics\_\_enable\_clearcut\_logging","Profiles\_\_enable\_developer\_profiles\_callout","Profiles\_\_enable\_playlist\_community\_acl","Search\_\_enable\_ai\_eligibility\_checks","Profiles\_\_enable\_stripe\_subscription\_management","Profiles\_\_enable\_auto\_apply\_credits","MiscFeatureFlags\_\_enable\_llms\_txt","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","Profiles\_\_enable\_purchase\_prompts","Concierge\_\_enable\_devsite\_llm\_tools","DevPro\_\_enable\_cloud\_innovators\_plus","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","Profiles\_\_require\_profile\_eligibility\_for\_signin","Profiles\_\_enable\_user\_type","Experiments\_\_reqs\_query\_experiments","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","Profiles\_\_enable\_dashboard\_curated\_recommendations","CloudShell\_\_cloud\_code\_overflow\_menu","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","Concierge\_\_enable\_pushui","BookNav\_\_enable\_tenant\_cache\_key","Profiles\_\_enable\_awarding\_url","Profiles\_\_enable\_recognition\_badges","Concierge\_\_enable\_actions\_menu","MiscFeatureFlags\_\_enable\_variable\_operator","MiscFeatureFlags\_\_enable\_project\_variables","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","MiscFeatureFlags\_\_enable\_view\_transitions","DevPro\_\_enable\_google\_payments\_buyflow","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","TpcFeatures\_\_proxy\_prod\_host","Search\_\_enable\_dynamic\_content\_confidential\_banner","MiscFeatureFlags\_\_developers\_footer\_dark\_image","Search\_\_enable\_suggestions\_from\_borg","Cloud\_\_fast\_free\_trial","DevPro\_\_enable\_payments\_first\_batch","MiscFeatureFlags\_\_enable\_appearance\_cookies","Profiles\_\_enable\_release\_notes\_notifications","DevPro\_\_enable\_firebase\_workspaces\_card","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","Profiles\_\_enable\_profile\_collections","Profiles\_\_enable\_callout\_notifications","Cloud\_\_enable\_cloudx\_experiment\_ids","Profiles\_\_enable\_completecodelab\_endpoint","Profiles\_\_enable\_join\_program\_group\_endpoint","DevPro\_\_enable\_nvidia\_credits\_card","EngEduTelemetry\_\_enable\_engedu\_telemetry","DevPro\_\_enable\_google\_one\_card","Cloud\_\_cache\_serialized\_dynamic\_content","DevPro\_\_enable\_vertex\_credit\_card"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

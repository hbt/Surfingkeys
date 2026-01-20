# chrome.notifications

**Source:** https://developer.chrome.com/docs/extensions/reference/api/notifications

---

Description
-----------

Use the `chrome.notifications` API to create rich notifications using templates and show these notifications to users in the system tray.

Permissions
-----------

`notifications`  

Types
-----

### NotificationBitmap

### NotificationButton

#### Properties

*   iconUrl
    
    string optional
    
    Deprecated since Chrome 59
    
    Button icons not visible for Mac OS X users.
    
*   title
    
    string
    

### NotificationItem

#### Properties

*   message
    
    string
    
    Additional details about this item.
    
*   title
    
    string
    
    Title of one item of a list notification.
    

### NotificationOptions

#### Properties

*   appIconMaskUrl
    
    string optional
    
    Deprecated since Chrome 59
    
    The app icon mask is not visible for Mac OS X users.
    
    A URL to the app icon mask. URLs have the same restrictions as [iconUrl](#property-NotificationOptions-iconUrl).
    
    The app icon mask should be in alpha channel, as only the alpha channel of the image will be considered.
    
*   buttons
    
    [NotificationButton](#type-NotificationButton)\[\] optional
    
    Text and icons for up to two notification action buttons.
    
*   contextMessage
    
    string optional
    
    Alternate notification content with a lower-weight font.
    
*   eventTime
    
    number optional
    
    A timestamp associated with the notification, in milliseconds past the epoch (e.g. `Date.now() + n`).
    
*   iconUrl
    
    string optional
    
    A URL to the sender's avatar, app icon, or a thumbnail for image notifications.
    
    URLs can be a data URL, a blob URL, or a URL relative to a resource within this extension's .crx file
    
    \*\*Note:\*\*This value is required for the [`notifications.create`](#method-create)`()` method.
    
*   imageUrl
    
    string optional
    
    Deprecated since Chrome 59
    
    The image is not visible for Mac OS X users.
    
    A URL to the image thumbnail for image-type notifications. URLs have the same restrictions as [iconUrl](#property-NotificationOptions-iconUrl).
    
*   isClickable
    
    boolean optional
    
    Deprecated since Chrome 67
    
    This UI hint is ignored as of Chrome 67
    
*   items
    
    [NotificationItem](#type-NotificationItem)\[\] optional
    
    Items for multi-item notifications. Users on Mac OS X only see the first item.
    
*   message
    
    string optional
    
    Main notification content.
    
    \*\*Note:\*\*This value is required for the [`notifications.create`](#method-create)`()` method.
    
*   priority
    
    number optional
    
    Priority ranges from -2 to 2. -2 is lowest priority. 2 is highest. Zero is default. On platforms that don't support a notification center (Windows, Linux & Mac), -2 and -1 result in an error as notifications with those priorities will not be shown at all.
    
*   progress
    
    number optional
    
    Current progress ranges from 0 to 100.
    
*   requireInteraction
    
    boolean optional
    
    Chrome 50+
    
    Indicates that the notification should remain visible on screen until the user activates or dismisses the notification. This defaults to false.
    
*   silent
    
    boolean optional
    
    Chrome 70+
    
    Indicates that no sounds or vibrations should be made when the notification is being shown. This defaults to false.
    
*   title
    
    string optional
    
    Title of the notification (e.g. sender name for email).
    
    \*\*Note:\*\*This value is required for the [`notifications.create`](#method-create)`()` method.
    
*   type
    
    [TemplateType](#type-TemplateType) optional
    
    Which type of notification to display. _Required for [`notifications.create`](#method-create)_ method.
    

### PermissionLevel

#### Enum

"granted"  
Specifies that the user has elected to show notifications from the app or extension. This is the default at install time.

"denied"  
Specifies that the user has elected not to show notifications from the app or extension.

### TemplateType

#### Enum

"basic"  
Contains an icon, title, message, expandedMessage, and up to two buttons.

"image"  
Contains an icon, title, message, expandedMessage, image, and up to two buttons.

"list"  
Contains an icon, title, message, items, and up to two buttons. Users on Mac OS X only see the first item.

"progress"  
Contains an icon, title, message, progress, and up to two buttons.

Methods
-------

### clear()

chrome.notifications.clear(  
  notificationId: string,  
): Promise<boolean>

Clears the specified notification.

#### Parameters

*   notificationId
    
    string
    
    The id of the notification to be cleared. This is returned by [`notifications.create`](#method-create) method.
    

#### Returns

*   Promise<boolean>
    
    Chrome 116+
    
    Returns a Promise which resolves to indicate whether a matching notification existed.
    

### create()

chrome.notifications.create(  
  notificationId?: string,  
  options: [NotificationOptions](#type-NotificationOptions),  
): Promise<string>

Creates and displays a notification.

#### Parameters

*   notificationId
    
    string optional
    
    Identifier of the notification. If not set or empty, an ID will automatically be generated. If it matches an existing notification, this method first clears that notification before proceeding with the create operation. The identifier may not be longer than 500 characters.
    
    The `notificationId` parameter is required before Chrome 42.
    
*   options
    
    [NotificationOptions](#type-NotificationOptions)
    
    Contents of the notification.
    

#### Returns

*   Promise<string>
    
    Chrome 116+
    
    Returns a Promise which resolves with the notification id (either supplied or generated) that represents the created notification.
    

### getAll()

chrome.notifications.getAll(): Promise<object>

Retrieves all the notifications of this app or extension.

#### Returns

*   Promise<object>
    
    Chrome 116+
    
    Returns a Promise which resolves with the set of notification\_ids currently in the system.
    

### getPermissionLevel()

chrome.notifications.getPermissionLevel(): Promise<[PermissionLevel](#type-PermissionLevel)\>

Retrieves whether the user has enabled notifications from this app or extension.

#### Returns

*   Promise<[PermissionLevel](#type-PermissionLevel)\>
    
    Chrome 116+
    
    Returns a Promise which resolves with the current permission level.
    

### update()

chrome.notifications.update(  
  notificationId: string,  
  options: [NotificationOptions](#type-NotificationOptions),  
): Promise<boolean>

Updates an existing notification.

#### Parameters

*   notificationId
    
    string
    
    The id of the notification to be updated. This is returned by [`notifications.create`](#method-create) method.
    
*   options
    
    [NotificationOptions](#type-NotificationOptions)
    
    Contents of the notification to update to.
    

#### Returns

*   Promise<boolean>
    
    Chrome 116+
    
    Returns a Promise which resolves to indicate whether a matching notification existed.
    

Events
------

### onButtonClicked

chrome.notifications.onButtonClicked.addListener(  
  callback: function,  
)

The user pressed a button in the notification.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (notificationId: string, buttonIndex: number) => void
    
    *   notificationId
        
        string
        
    *   buttonIndex
        
        number
        
    

### onClicked

chrome.notifications.onClicked.addListener(  
  callback: function,  
)

The user clicked in a non-button area of the notification.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (notificationId: string) => void
    
    *   notificationId
        
        string
        
    

### onClosed

chrome.notifications.onClosed.addListener(  
  callback: function,  
)

The notification closed, either by the system or by user action.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (notificationId: string, byUser: boolean) => void
    
    *   notificationId
        
        string
        
    *   byUser
        
        boolean
        
    

### onPermissionLevelChanged

chrome.notifications.onPermissionLevelChanged.addListener(  
  callback: function,  
)

The user changes the permission level. As of Chrome 47, only ChromeOS has UI that dispatches this event.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (level: [PermissionLevel](#type-PermissionLevel)) => void
    
    *   level
        
        [PermissionLevel](#type-PermissionLevel)
        
    

### onShowSettings

Deprecated since Chrome 65

chrome.notifications.onShowSettings.addListener(  
  callback: function,  
)

Custom notification settings button is no longer supported.

The user clicked on a link for the app's notification settings. As of Chrome 47, only ChromeOS has UI that dispatches this event. As of Chrome 65, that UI has been removed from ChromeOS, too.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    () => void
    

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","Profiles\_\_enable\_release\_notes\_notifications","Profiles\_\_enable\_developer\_profiles\_callout","Experiments\_\_reqs\_query\_experiments","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","CloudShell\_\_cloud\_code\_overflow\_menu","DevPro\_\_enable\_google\_one\_card","Search\_\_enable\_page\_map","Search\_\_enable\_ai\_search\_summaries\_for\_all","DevPro\_\_enable\_developer\_subscriptions","TpcFeatures\_\_proxy\_prod\_host","MiscFeatureFlags\_\_enable\_project\_variables","MiscFeatureFlags\_\_enable\_variable\_operator","Profiles\_\_enable\_callout\_notifications","Concierge\_\_enable\_remove\_info\_panel\_tags","DevPro\_\_enable\_vertex\_credit\_card","Concierge\_\_enable\_devsite\_llm\_tools","MiscFeatureFlags\_\_enable\_appearance\_cookies","Profiles\_\_enable\_awarding\_url","Search\_\_enable\_suggestions\_from\_borg","Profiles\_\_enable\_user\_type","CloudShell\_\_cloud\_shell\_button","DevPro\_\_remove\_eu\_tax\_intake\_form","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","Cloud\_\_enable\_cloudx\_experiment\_ids","Profiles\_\_enable\_completecodelab\_endpoint","MiscFeatureFlags\_\_developers\_footer\_dark\_image","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","MiscFeatureFlags\_\_enable\_explain\_this\_code","Search\_\_enable\_dynamic\_content\_confidential\_banner","Cloud\_\_cache\_serialized\_dynamic\_content","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","Cloud\_\_enable\_cloud\_shell","Cloud\_\_fast\_free\_trial","Cloud\_\_enable\_free\_trial\_server\_call","MiscFeatureFlags\_\_enable\_llms\_txt","DevPro\_\_enable\_firebase\_workspaces\_card","DevPro\_\_enable\_payments\_first\_batch","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","Concierge\_\_enable\_actions\_menu","DevPro\_\_enable\_cloud\_innovators\_plus","MiscFeatureFlags\_\_emergency\_css","Analytics\_\_enable\_clearcut\_logging","Cloud\_\_enable\_legacy\_calculator\_redirect","Profiles\_\_enable\_purchase\_prompts","Concierge\_\_enable\_pushui","MiscFeatureFlags\_\_enable\_view\_transitions","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","Profiles\_\_enable\_stripe\_subscription\_management","SignIn\_\_enable\_l1\_signup\_flow","Profiles\_\_enable\_playlist\_community\_acl","Profiles\_\_enable\_auto\_apply\_credits","Profiles\_\_enable\_complete\_playlist\_endpoint","MiscFeatureFlags\_\_developers\_footer\_image","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","DevPro\_\_enable\_embed\_profile\_creation","DevPro\_\_enable\_nvidia\_credits\_card","Profiles\_\_require\_profile\_eligibility\_for\_signin","Profiles\_\_enable\_page\_saving","MiscFeatureFlags\_\_enable\_firebase\_utm","DevPro\_\_enable\_code\_assist","EngEduTelemetry\_\_enable\_engedu\_telemetry","Profiles\_\_enable\_profile\_collections","Profiles\_\_enable\_dashboard\_curated\_recommendations","Profiles\_\_enable\_public\_developer\_profiles","Cloud\_\_enable\_llm\_concierge\_chat","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","Search\_\_enable\_ai\_eligibility\_checks","Profiles\_\_enable\_recognition\_badges","BookNav\_\_enable\_tenant\_cache\_key","DevPro\_\_enable\_free\_benefits","DevPro\_\_enable\_google\_payments\_buyflow","DevPro\_\_enable\_devpro\_offers","Cloud\_\_enable\_cloud\_dlp\_service","OnSwitch\_\_enable","Profiles\_\_enable\_completequiz\_endpoint","DevPro\_\_enable\_enterprise","Profiles\_\_enable\_join\_program\_group\_endpoint"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

# chrome.devtools.panels

**Source:** https://developer.chrome.com/docs/extensions/reference/api/devtools.panels

---

Description
-----------

Use the `chrome.devtools.panels` API to integrate your extension into Developer Tools window UI: create your own panels, access existing panels, and add sidebars.

Each extension panel and sidebar is displayed as a separate HTML page. All extension pages displayed in the Developer Tools window have access to all parts of the `chrome.devtools` API, as well as all other extension APIs.

You can use the [`devtools.panels.setOpenResourceHandler`](#method-setOpenResourceHandler) method to install a callback function that handles user requests to open a resource (typically, a click a resource link in the Developer Tools window). At most one of the installed handlers gets called; users can specify (using the Developer Tools Settings dialog) either the default behavior or an extension to handle resource open requests. If an extension calls `setOpenResourceHandler()` multiple times, only the last handler is retained.

See [DevTools APIs summary](/docs/extensions/how-to/devtools/extend-devtools) for general introduction to using Developer Tools APIs.

Manifest
--------

The following keys must be declared [in the manifest](/docs/extensions/mv3/manifest) to use this API.

`"devtools_page"`  

Example
-------

The following code adds a panel contained in `Panel.html`, represented by `FontPicker.png` on the Developer Tools toolbar and labeled as _Font Picker_:

chrome.devtools.panels.create("Font Picker",
                                  "FontPicker.png",
                                  "Panel.html",
                                  function(panel) { ... });

The following code adds a sidebar pane contained in `Sidebar.html` and titled _Font Properties_ to the Elements panel, then sets its height to `8ex`:

chrome.devtools.panels.elements.createSidebarPane("Font Properties",
      function(sidebar) {
        sidebar.setPage("Sidebar.html");
        sidebar.setHeight("8ex");
      }
    );

The screenshot illustrates the effect this example would have on Developer Tools window:

![Extension icon panel on DevTools toolbar](/static/docs/extensions/reference/api/devtools/panels/images/devtools-panels.png)

Extension icon panel on DevTools toolbar.

To try this API, install the [devtools panels API example](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/devtools/panels) from the [chrome-extension-samples](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples) repository.

Types
-----

### Button

A button created by the extension.

#### Properties

*   onClicked
    
    Event<functionvoidvoid>
    
    Fired when the button is clicked.
    
    The `onClicked.addListener` function looks like:
    
    (callback: function) => {...}
    
    *   callback
        
        function
        
        The `callback` parameter looks like:
        
        () => void
        
    
*   update
    
    void
    
    Updates the attributes of the button. If some of the arguments are omitted or `null`, the corresponding attributes are not updated.
    
    The `update` function looks like:
    
    (iconPath?: string, tooltipText?: string, disabled?: boolean) => {...}
    
    *   iconPath
        
        string optional
        
        Path to the new icon of the button.
        
    *   tooltipText
        
        string optional
        
        Text shown as a tooltip when user hovers the mouse over the button.
        
    *   disabled
        
        boolean optional
        
        Whether the button is disabled.
        
    

### ElementsPanel

Represents the Elements panel.

#### Properties

*   onSelectionChanged
    
    Event<functionvoidvoid>
    
    Fired when an object is selected in the panel.
    
    The `onSelectionChanged.addListener` function looks like:
    
    (callback: function) => {...}
    
    *   callback
        
        function
        
        The `callback` parameter looks like:
        
        () => void
        
    
*   createSidebarPane
    
    void
    
    Creates a pane within panel's sidebar.
    
    The `createSidebarPane` function looks like:
    
    (title: string, callback?: function) => {...}
    
    *   title
        
        string
        
        Text that is displayed in sidebar caption.
        
    *   callback
        
        function optional
        
        The `callback` parameter looks like:
        
        (result: [ExtensionSidebarPane](#type-ExtensionSidebarPane)) => void
        
        *   result
            
            [ExtensionSidebarPane](#type-ExtensionSidebarPane)
            
            An ExtensionSidebarPane object for created sidebar pane.
            
        
    

### ExtensionPanel

Represents a panel created by an extension.

#### Properties

*   onHidden
    
    Event<functionvoidvoid>
    
    Fired when the user switches away from the panel.
    
    The `onHidden.addListener` function looks like:
    
    (callback: function) => {...}
    
    *   callback
        
        function
        
        The `callback` parameter looks like:
        
        () => void
        
    
*   onSearch
    
    Event<functionvoidvoid>
    
    Fired upon a search action (start of a new search, search result navigation, or search being canceled).
    
    The `onSearch.addListener` function looks like:
    
    (callback: function) => {...}
    
    *   callback
        
        function
        
        The `callback` parameter looks like:
        
        (action: string, queryString?: string) => void
        
        *   action
            
            string
            
        *   queryString
            
            string optional
            
        
    
*   onShown
    
    Event<functionvoidvoid>
    
    Fired when the user switches to the panel.
    
    The `onShown.addListener` function looks like:
    
    (callback: function) => {...}
    
    *   callback
        
        function
        
        The `callback` parameter looks like:
        
        (window: Window) => void
        
        *   window
            
            Window
            
        
    
*   createStatusBarButton
    
    void
    
    Appends a button to the status bar of the panel.
    
    The `createStatusBarButton` function looks like:
    
    (iconPath: string, tooltipText: string, disabled: boolean) => {...}
    
    *   iconPath
        
        string
        
        Path to the icon of the button. The file should contain a 64x24-pixel image composed of two 32x24 icons. The left icon is used when the button is inactive; the right icon is displayed when the button is pressed.
        
    *   tooltipText
        
        string
        
        Text shown as a tooltip when user hovers the mouse over the button.
        
    *   disabled
        
        boolean
        
        Whether the button is disabled.
        
    
    *   returns
        
        [Button](#type-Button)
        
    
*   show
    
    void
    
    Chrome 140+
    
    Shows the panel by activating the corresponding tab.
    
    The `show` function looks like:
    
    () => {...}
    

### ExtensionSidebarPane

A sidebar created by the extension.

#### Properties

*   onHidden
    
    Event<functionvoidvoid>
    
    Fired when the sidebar pane becomes hidden as a result of the user switching away from the panel that hosts the sidebar pane.
    
    The `onHidden.addListener` function looks like:
    
    (callback: function) => {...}
    
    *   callback
        
        function
        
        The `callback` parameter looks like:
        
        () => void
        
    
*   onShown
    
    Event<functionvoidvoid>
    
    Fired when the sidebar pane becomes visible as a result of user switching to the panel that hosts it.
    
    The `onShown.addListener` function looks like:
    
    (callback: function) => {...}
    
    *   callback
        
        function
        
        The `callback` parameter looks like:
        
        (window: Window) => void
        
        *   window
            
            Window
            
        
    
*   setExpression
    
    void
    
    Sets an expression that is evaluated within the inspected page. The result is displayed in the sidebar pane.
    
    The `setExpression` function looks like:
    
    (expression: string, rootTitle?: string, callback?: function) => {...}
    
    *   expression
        
        string
        
        An expression to be evaluated in context of the inspected page. JavaScript objects and DOM nodes are displayed in an expandable tree similar to the console/watch.
        
    *   rootTitle
        
        string optional
        
        An optional title for the root of the expression tree.
        
    *   callback
        
        function optional
        
        The `callback` parameter looks like:
        
        () => void
        
    
*   setHeight
    
    void
    
    Sets the height of the sidebar.
    
    The `setHeight` function looks like:
    
    (height: string) => {...}
    
    *   height
        
        string
        
        A CSS-like size specification, such as `'100px'` or `'12ex'`.
        
    
*   setObject
    
    void
    
    Sets a JSON-compliant object to be displayed in the sidebar pane.
    
    The `setObject` function looks like:
    
    (jsonObject: string, rootTitle?: string, callback?: function) => {...}
    
    *   jsonObject
        
        string
        
        An object to be displayed in context of the inspected page. Evaluated in the context of the caller (API client).
        
    *   rootTitle
        
        string optional
        
        An optional title for the root of the expression tree.
        
    *   callback
        
        function optional
        
        The `callback` parameter looks like:
        
        () => void
        
    
*   setPage
    
    void
    
    Sets an HTML page to be displayed in the sidebar pane.
    
    The `setPage` function looks like:
    
    (path: string) => {...}
    
    *   path
        
        string
        
        Relative path of an extension page to display within the sidebar.
        
    

### SourcesPanel

Represents the Sources panel.

#### Properties

*   onSelectionChanged
    
    Event<functionvoidvoid>
    
    Fired when an object is selected in the panel.
    
    The `onSelectionChanged.addListener` function looks like:
    
    (callback: function) => {...}
    
    *   callback
        
        function
        
        The `callback` parameter looks like:
        
        () => void
        
    
*   createSidebarPane
    
    void
    
    Creates a pane within panel's sidebar.
    
    The `createSidebarPane` function looks like:
    
    (title: string, callback?: function) => {...}
    
    *   title
        
        string
        
        Text that is displayed in sidebar caption.
        
    *   callback
        
        function optional
        
        The `callback` parameter looks like:
        
        (result: [ExtensionSidebarPane](#type-ExtensionSidebarPane)) => void
        
        *   result
            
            [ExtensionSidebarPane](#type-ExtensionSidebarPane)
            
            An ExtensionSidebarPane object for created sidebar pane.
            
        
    

### Theme

Chrome 99+

Theme used by DevTools.

#### Enum

"default"  
Default DevTools theme. This is always the light theme.

"dark"  
Dark theme.

Properties
----------

### elements

Elements panel.

#### Type

[ElementsPanel](#type-ElementsPanel)

### sources

Sources panel.

#### Type

[SourcesPanel](#type-SourcesPanel)

### themeName

Chrome 59+

The name of the color theme set in user's DevTools settings. Possible values: `default` (the default) and `dark`.

#### Type

string

Methods
-------

### create()

chrome.devtools.panels.create(  
  title: string,  
  iconPath: string,  
  pagePath: string,  
  callback?: function,  
): void

Creates an extension panel.

#### Parameters

*   title
    
    string
    
    Title that is displayed next to the extension icon in the Developer Tools toolbar.
    
*   iconPath
    
    string
    
    Path of the panel's icon relative to the extension directory.
    
*   pagePath
    
    string
    
    Path of the panel's HTML page relative to the extension directory.
    
*   callback
    
    function optional
    
    The `callback` parameter looks like:
    
    (panel: [ExtensionPanel](#type-ExtensionPanel)) => void
    
    *   panel
        
        [ExtensionPanel](#type-ExtensionPanel)
        
        An ExtensionPanel object representing the created panel.
        
    

### openResource()

chrome.devtools.panels.openResource(  
  url: string,  
  lineNumber: number,  
  columnNumber?: number,  
  callback?: function,  
): void

Requests DevTools to open a URL in a Developer Tools panel.

#### Parameters

*   url
    
    string
    
    The URL of the resource to open.
    
*   lineNumber
    
    number
    
    Specifies the line number to scroll to when the resource is loaded.
    
*   columnNumber
    
    number optional
    
    Chrome 114+
    
    Specifies the column number to scroll to when the resource is loaded.
    
*   callback
    
    function optional
    
    The `callback` parameter looks like:
    
    () => void
    

### setOpenResourceHandler()

chrome.devtools.panels.setOpenResourceHandler(  
  callback?: function,  
): void

Specifies the function to be called when the user clicks a resource link in the Developer Tools window. To unset the handler, either call the method with no parameters or pass null as the parameter.

#### Parameters

*   callback
    
    function optional
    
    The `callback` parameter looks like:
    
    (resource: [Resource](https://developer.chrome.com/docs/extensions/reference/api/devtools/devtools_inspectedWindow/#type-Resource), lineNumber: number) => void
    
    *   resource
        
        [Resource](https://developer.chrome.com/docs/extensions/reference/api/devtools/devtools_inspectedWindow/#type-Resource)
        
        A [`devtools.inspectedWindow.Resource`](https://developer.chrome.com/docs/extensions/reference/api/devtools/devtools_inspectedWindow/#type-Resource) object for the resource that was clicked.
        
    *   lineNumber
        
        number
        
        Specifies the line number within the resource that was clicked.
        
    

### setThemeChangeHandler()

Chrome 99+

chrome.devtools.panels.setThemeChangeHandler(  
  callback?: function,  
): void

Specifies the function to be called when the current theme changes in DevTools. To unset the handler, either call the method with no parameters or pass `null` as the parameter.

#### Parameters

*   callback
    
    function optional
    
    The `callback` parameter looks like:
    
    (theme: [Theme](#type-Theme)) => void
    
    *   theme
        
        [Theme](#type-Theme)
        
        Current theme in DevTools.
        
    

Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2025-11-10 UTC.

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",1,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["MiscFeatureFlags\_\_enable\_appearance\_cookies","DevPro\_\_enable\_firebase\_workspaces\_card","DevPro\_\_enable\_nvidia\_credits\_card","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","MiscFeatureFlags\_\_enable\_llms\_txt","Cloud\_\_enable\_cloudx\_experiment\_ids","Cloud\_\_enable\_legacy\_calculator\_redirect","Concierge\_\_enable\_remove\_info\_panel\_tags","Search\_\_enable\_dynamic\_content\_confidential\_banner","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","Cloud\_\_enable\_cloud\_dlp\_service","DevPro\_\_enable\_payments\_first\_batch","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","Profiles\_\_enable\_auto\_apply\_credits","Cloud\_\_enable\_llm\_concierge\_chat","Profiles\_\_enable\_profile\_collections","Profiles\_\_enable\_completequiz\_endpoint","Search\_\_enable\_page\_map","SignIn\_\_enable\_l1\_signup\_flow","Profiles\_\_enable\_dashboard\_curated\_recommendations","MiscFeatureFlags\_\_developers\_footer\_image","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","Cloud\_\_enable\_free\_trial\_server\_call","DevPro\_\_enable\_code\_assist","Cloud\_\_fast\_free\_trial","DevPro\_\_enable\_free\_benefits","DevPro\_\_enable\_devpro\_offers","Profiles\_\_enable\_awarding\_url","Profiles\_\_require\_profile\_eligibility\_for\_signin","Concierge\_\_enable\_devsite\_llm\_tools","Profiles\_\_enable\_playlist\_community\_acl","Search\_\_enable\_suggestions\_from\_borg","DevPro\_\_enable\_enterprise","Profiles\_\_enable\_public\_developer\_profiles","Profiles\_\_enable\_page\_saving","Experiments\_\_reqs\_query\_experiments","Profiles\_\_enable\_release\_notes\_notifications","DevPro\_\_enable\_google\_payments\_buyflow","Profiles\_\_enable\_complete\_playlist\_endpoint","MiscFeatureFlags\_\_enable\_firebase\_utm","MiscFeatureFlags\_\_emergency\_css","Search\_\_enable\_ai\_search\_summaries\_for\_all","Analytics\_\_enable\_clearcut\_logging","CloudShell\_\_cloud\_code\_overflow\_menu","Search\_\_enable\_ai\_eligibility\_checks","MiscFeatureFlags\_\_enable\_variable\_operator","Cloud\_\_cache\_serialized\_dynamic\_content","EngEduTelemetry\_\_enable\_engedu\_telemetry","DevPro\_\_enable\_vertex\_credit\_card","Profiles\_\_enable\_completecodelab\_endpoint","MiscFeatureFlags\_\_enable\_view\_transitions","Concierge\_\_enable\_actions\_menu","BookNav\_\_enable\_tenant\_cache\_key","Profiles\_\_enable\_join\_program\_group\_endpoint","MiscFeatureFlags\_\_enable\_explain\_this\_code","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","Profiles\_\_enable\_recognition\_badges","Profiles\_\_enable\_developer\_profiles\_callout","Profiles\_\_enable\_purchase\_prompts","Profiles\_\_enable\_callout\_notifications","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","MiscFeatureFlags\_\_enable\_project\_variables","DevPro\_\_enable\_cloud\_innovators\_plus","CloudShell\_\_cloud\_shell\_button","OnSwitch\_\_enable","DevPro\_\_enable\_embed\_profile\_creation","MiscFeatureFlags\_\_developers\_footer\_dark\_image","DevPro\_\_enable\_developer\_subscriptions","TpcFeatures\_\_proxy\_prod\_host","Concierge\_\_enable\_pushui","Cloud\_\_enable\_cloud\_shell","Profiles\_\_enable\_stripe\_subscription\_management","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","DevPro\_\_enable\_google\_one\_card","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","DevPro\_\_remove\_eu\_tax\_intake\_form","Profiles\_\_enable\_user\_type"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

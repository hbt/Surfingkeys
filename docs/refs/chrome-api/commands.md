# chrome.commands

**Source:** https://developer.chrome.com/docs/extensions/reference/api/commands

---

Description
-----------

Use the commands API to add keyboard shortcuts that trigger actions in your extension, for example, an action to open the browser action or send a command to the extension.

Manifest
--------

The following keys must be declared [in the manifest](/docs/extensions/mv3/manifest) to use this API.

`"commands"`  

Concepts and usage
------------------

The Commands API allows extension developers to define specific commands, and bind them to a default key combination. Each command an extension accepts must be declared as properties of the `"commands"` object in the [extension's manifest](/docs/extensions/reference/manifest).

The property key is used as the command's name. Command objects can take two properties.

`suggested_key`

An optional property that declares default keyboard shortcuts for the command. If omitted, the command will be unbound. This property can either take a string or an object value.

*   **A string value** specifies the default keyboard shortcut that should be used across all platforms.
    
    *   **An object value** allows the extension developer to customize the keyboard shortcut for each platform. When providing platform-specific shortcuts, valid object properties are `default`, `chromeos`, `linux`, `mac`, and `windows`.
    
    See [Key combination requirements](#key-combinations) for additional details.
    

`description`

A string used to provide the user with a short description of the command's purpose. This string appears in extension keyboard shortcut management UI. Descriptions are required for standard commands, but are ignored for [Action commands](#action_commands).

An extension can have many commands, but may specify at most four suggested keyboard shortcuts. The user can manually add more shortcuts from the `chrome://extensions/shortcuts` dialog.

### Supported Keys

The following keys are usable command shortcuts. Key definitions are case sensitive. Attempting to load an extension with an incorrectly cased key will result in a manifest parse error at installation time.

Alpha keys

`A` … `Z`

Numeric keys

`0` … `9`

Standard key strings

General–`Comma`, `Period`, `Home`, `End`, `PageUp`, `PageDown`, `Space`, `Insert`, `Delete`

Arrow keys–`Up`, `Down`, `Left`, `Right`

Media Keys–`MediaNextTrack`, `MediaPlayPause`, `MediaPrevTrack`, `MediaStop`

Modifier key strings

`Ctrl`, `Alt`, `Shift`, `MacCtrl` (macOS only), `Option` (macOS only), `Command` (macOS only), `Search` (ChromeOS only)

### Key combination requirements

*   Extension command shortcuts must include either `Ctrl` or `Alt`.
    
    *   Modifiers **cannot** be used in combination with Media Keys.
        
    *   On many macOS keyboards, `Alt` refers to the Option key.
        
    *   On macOS, `Command` or `MacCtrl` can also be used in place of `Ctrl`, and the `Option` key can be used in place of `Alt` (see next bullet point).
        
*   On macOS `Ctrl` is automatically converted into `Command`.
    
    *   `Command` can also be used in the `"mac"` shortcut to explicitly refer to the Command key.
        
    *   To use the Control key on macOS, replace `Ctrl` with `MacCtrl` when defining the `"mac"` shortcut.
        
    *   Using `MacCtrl` in the combination for another platform will cause a validation error and prevent the extension from being installed.
        
*   `Shift` is an optional modifier on all platforms.
    
*   `Search` is an optional modifier exclusive to ChromeOS.
    
*   Certain operating system and Chrome shortcuts (e.g. window management) always take priority over Extension command shortcuts and cannot be overridden.
    

**Note:** Key combinations that involve `Ctrl+Alt` are not permitted in order to avoid conflicts with the `AltGr` key.

### Handle command events

manifest.json:

{
      "name": "My extension",
      ...
      "commands": {
        "run-foo": {
          "suggested_key": {
            "default": "Ctrl+Shift+Y",
            "mac": "Command+Shift+Y"
          },
          "description": "Run \"foo\" on the current page."
        },
        "_execute_action": {
          "suggested_key": {
            "windows": "Ctrl+Shift+Y",
            "mac": "Command+Shift+Y",
            "chromeos": "Ctrl+Shift+U",
            "linux": "Ctrl+Shift+J"
          }
        }
      },
      ...
    }

In your service worker, you can bind a handler to each of the commands defined in the manifest using `onCommand.addListener`. For example:

service-worker.js:

chrome.commands.onCommand.addListener((command) => {
      console.log(`Command: ${command}`);
    });

### Action commands

The `_execute_action` (Manifest V3), `_execute_browser_action` (Manifest V2), and `_execute_page_action` (Manifest V2) commands are reserved for the action of trigger your action, browser action, or page action respectively. These commands don't dispatch [command.onCommand](#event-onCommand) events like standard commands.

If you need to take action based on your popup opening, consider listening for a [DOMContentLoaded](https://developer.mozilla.org/docs/Web/API/Window/DOMContentLoaded_event) event inside your popup's JavaScript.

### Scope

By default, commands are scoped to the Chrome browser. This means that when the browser does not have focus, command shortcuts are inactive. Beginning in Chrome 35, extension developers can optionally mark a command as "global". Global commands also work while Chrome _does not_ have focus.

**Note:** ChromeOS does not support global commands.

Keyboard shortcut suggestions for global commands are limited to `Ctrl+Shift+[0..9]`. This is a protective measure to minimize the risk of overriding shortcuts in other applications since if, for example, `Alt+P` were to be allowed as global, the keyboard shortcut for opening a print dialog might not work in other applications.

End users are free to remap global commands to their preferred key combination using the UI exposed at `chrome://extensions/shortcuts`.

Example:

manifest.json:

{
      "name": "My extension",
      ...
      "commands": {
        "toggle-feature-foo": {
          "suggested_key": {
            "default": "Ctrl+Shift+5"
          },
          "description": "Toggle feature foo",
          "global": true
        }
      },
      ...
    }

Examples
--------

The following examples flex the core functionality of the Commands API.

### Basic command

Commands allow extensions to map logic to keyboard shortcuts that can be invoked by the user. At its most basic, a command only requires a command declaration in the extension's manifest and a listener registration as shown in the following example.

manifest.json:

{
      "name": "Command demo - basic",
      "version": "1.0",
      "manifest_version": 3,
      "background": {
        "service_worker": "service-worker.js"
      },
      "commands": {
        "inject-script": {
          "suggested_key": "Ctrl+Shift+Y",
          "description": "Inject a script on the page"
        }
      }
    }

service-worker.js:

chrome.commands.onCommand.addListener((command) => {
      console.log(`Command "${command}" triggered`);
    });

### Action command

As described in the [Concepts and usage](#concepts_and_usage) section, you can also map a command to an extension's action. The following example injects a content script that shows an alert on the current page when the user either clicks the extension's action or triggers the keyboard shortcut.

manifest.json:

{
      "name": "Commands demo - action invocation",
      "version": "1.0",
      "manifest_version": 3,
      "background": {
        "service_worker": "service-worker.js"
      },
      "permissions": ["activeTab", "scripting"],
      "action": {},
      "commands": {
        "_execute_action": {
          "suggested_key": {
            "default": "Ctrl+U",
            "mac": "Command+U"
          }
        }
      }
    }

service-worker.js:

chrome.action.onClicked.addListener((tab) => {
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: contentScriptFunc,
        args: ['action'],
      });
    });
    
    function contentScriptFunc(name) {
      alert(`"${name}" executed`);
    }
    
    // This callback WILL NOT be called for "_execute_action"
    chrome.commands.onCommand.addListener((command) => {
      console.log(`Command "${command}" called`);
    });

### Verify commands registered

If an extension attempts to register a shortcut that is already used by another extension, the second extension's shortcut won't register as expected. You can provide a more robust end user experience by anticipating this possibility and checking for collisions at install time.

service-worker.js:

chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        checkCommandShortcuts();
      }
    });
    
    // Only use this function during the initial install phase. After
    // installation the user may have intentionally unassigned commands.
    function checkCommandShortcuts() {
      chrome.commands.getAll((commands) => {
        let missingShortcuts = [];
    
        for (let {name, shortcut} of commands) {
          if (shortcut === '') {
            missingShortcuts.push(name);
          }
        }
    
        if (missingShortcuts.length > 0) {
          // Update the extension UI to inform the user that one or more
          // commands are currently unassigned.
        }
      });
    }

Types
-----

### Command

#### Properties

*   description
    
    string optional
    
    The Extension Command description
    
*   name
    
    string optional
    
    The name of the Extension Command
    
*   shortcut
    
    string optional
    
    The shortcut active for this command, or blank if not active.
    

Methods
-------

### getAll()

chrome.commands.getAll(): Promise<[Command](#type-Command)\[\]\>

Returns all the registered extension commands for this extension and their shortcut (if active). Before Chrome 110, this command did not return `_execute_action`.

#### Returns

*   Promise<[Command](#type-Command)\[\]>
    
    Chrome 96+
    
    Resolves with a list of the registered commands.
    

Events
------

### onCommand

chrome.commands.onCommand.addListener(  
  callback: function,  
)

Fired when a registered command is activated using a keyboard shortcut.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (command: string, tab?: [tabs.Tab](https://developer.chrome.com/docs/extensions/reference/tabs/#type-Tab)) => void
    
    *   command
        
        string
        
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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,116,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["Profiles\_\_enable\_dashboard\_curated\_recommendations","Profiles\_\_enable\_awarding\_url","MiscFeatureFlags\_\_emergency\_css","Experiments\_\_reqs\_query\_experiments","Cloud\_\_enable\_free\_trial\_server\_call","Profiles\_\_enable\_page\_saving","Search\_\_enable\_suggestions\_from\_borg","CloudShell\_\_cloud\_shell\_button","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","EngEduTelemetry\_\_enable\_engedu\_telemetry","Profiles\_\_enable\_callout\_notifications","Profiles\_\_enable\_completecodelab\_endpoint","SignIn\_\_enable\_l1\_signup\_flow","DevPro\_\_enable\_nvidia\_credits\_card","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","Profiles\_\_enable\_playlist\_community\_acl","DevPro\_\_enable\_developer\_subscriptions","Concierge\_\_enable\_devsite\_llm\_tools","DevPro\_\_enable\_google\_payments\_buyflow","MiscFeatureFlags\_\_enable\_project\_variables","Profiles\_\_enable\_profile\_collections","Profiles\_\_enable\_purchase\_prompts","DevPro\_\_enable\_firebase\_workspaces\_card","Profiles\_\_enable\_release\_notes\_notifications","Profiles\_\_require\_profile\_eligibility\_for\_signin","MiscFeatureFlags\_\_enable\_llms\_txt","Profiles\_\_enable\_developer\_profiles\_callout","DevPro\_\_enable\_payments\_first\_batch","TpcFeatures\_\_proxy\_prod\_host","Profiles\_\_enable\_recognition\_badges","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","DevPro\_\_enable\_free\_benefits","DevPro\_\_enable\_embed\_profile\_creation","DevPro\_\_enable\_google\_one\_card","MiscFeatureFlags\_\_enable\_variable\_operator","MiscFeatureFlags\_\_enable\_explain\_this\_code","Profiles\_\_enable\_complete\_playlist\_endpoint","MiscFeatureFlags\_\_enable\_firebase\_utm","DevPro\_\_enable\_devpro\_offers","Search\_\_enable\_dynamic\_content\_confidential\_banner","DevPro\_\_enable\_enterprise","Profiles\_\_enable\_join\_program\_group\_endpoint","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","Cloud\_\_enable\_cloudx\_experiment\_ids","CloudShell\_\_cloud\_code\_overflow\_menu","DevPro\_\_remove\_eu\_tax\_intake\_form","BookNav\_\_enable\_tenant\_cache\_key","Cloud\_\_enable\_legacy\_calculator\_redirect","DevPro\_\_enable\_cloud\_innovators\_plus","Profiles\_\_enable\_user\_type","Cloud\_\_fast\_free\_trial","Cloud\_\_cache\_serialized\_dynamic\_content","Profiles\_\_enable\_completequiz\_endpoint","MiscFeatureFlags\_\_developers\_footer\_dark\_image","DevPro\_\_enable\_code\_assist","OnSwitch\_\_enable","Cloud\_\_enable\_cloud\_dlp\_service","Concierge\_\_enable\_remove\_info\_panel\_tags","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","Concierge\_\_enable\_pushui","MiscFeatureFlags\_\_enable\_appearance\_cookies","Cloud\_\_enable\_cloud\_shell","DevPro\_\_enable\_vertex\_credit\_card","Cloud\_\_enable\_llm\_concierge\_chat","Concierge\_\_enable\_actions\_menu","MiscFeatureFlags\_\_developers\_footer\_image","Analytics\_\_enable\_clearcut\_logging","Profiles\_\_enable\_auto\_apply\_credits","MiscFeatureFlags\_\_enable\_view\_transitions","Search\_\_enable\_ai\_search\_summaries\_for\_all","Profiles\_\_enable\_public\_developer\_profiles","Search\_\_enable\_ai\_eligibility\_checks","Profiles\_\_enable\_stripe\_subscription\_management","Search\_\_enable\_page\_map"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

# chrome.identity

**Source:** https://developer.chrome.com/docs/extensions/reference/api/identity

---

Description
-----------

Use the `chrome.identity` API to get OAuth2 access tokens.

Permissions
-----------

`identity`  

Types
-----

### AccountInfo

#### Properties

*   id
    
    string
    
    A unique identifier for the account. This ID will not change for the lifetime of the account.
    

### AccountStatus

Chrome 84+

#### Enum

"SYNC"  
Specifies that Sync is enabled for the primary account.

"ANY"  
Specifies the existence of a primary account, if any.

### GetAuthTokenResult

Chrome 105+

#### Properties

*   grantedScopes
    
    string\[\] optional
    
    A list of OAuth2 scopes granted to the extension.
    
*   token
    
    string optional
    
    The specific token associated with the request.
    

### InvalidTokenDetails

#### Properties

*   token
    
    string
    
    The specific token that should be removed from the cache.
    

### ProfileDetails

Chrome 84+

#### Properties

*   accountStatus
    
    [AccountStatus](#type-AccountStatus) optional
    
    A status of the primary account signed into a profile whose `ProfileUserInfo` should be returned. Defaults to `SYNC` account status.
    

### ProfileUserInfo

#### Properties

*   email
    
    string
    
    An email address for the user account signed into the current profile. Empty if the user is not signed in or the `identity.email` manifest permission is not specified.
    
*   id
    
    string
    
    A unique identifier for the account. This ID will not change for the lifetime of the account. Empty if the user is not signed in or (in M41+) the `identity.email` manifest permission is not specified.
    

### TokenDetails

#### Properties

*   account
    
    [AccountInfo](#type-AccountInfo) optional
    
    The account ID whose token should be returned. If not specified, the function will use an account from the Chrome profile: the Sync account if there is one, or otherwise the first Google web account.
    
*   enableGranularPermissions
    
    boolean optional
    
    Chrome 87+
    
    The `enableGranularPermissions` flag allows extensions to opt-in early to the granular permissions consent screen, in which requested permissions are granted or denied individually.
    
*   interactive
    
    boolean optional
    
    Fetching a token may require the user to sign-in to Chrome, or approve the application's requested scopes. If the interactive flag is `true`, `getAuthToken` will prompt the user as necessary. When the flag is `false` or omitted, `getAuthToken` will return failure any time a prompt would be required.
    
*   scopes
    
    string\[\] optional
    
    A list of OAuth2 scopes to request.
    
    When the `scopes` field is present, it overrides the list of scopes specified in manifest.json.
    

### WebAuthFlowDetails

#### Properties

*   abortOnLoadForNonInteractive
    
    boolean optional
    
    Chrome 113+
    
    Whether to terminate `launchWebAuthFlow` for non-interactive requests after the page loads. This parameter does not affect interactive flows.
    
    When set to `true` (default) the flow will terminate immediately after the page loads. When set to `false`, the flow will only terminate after the `timeoutMsForNonInteractive` passes. This is useful for identity providers that use JavaScript to perform redirections after the page loads.
    
*   interactive
    
    boolean optional
    
    Whether to launch auth flow in interactive mode.
    
    Since some auth flows may immediately redirect to a result URL, `launchWebAuthFlow` hides its web view until the first navigation either redirects to the final URL, or finishes loading a page meant to be displayed.
    
    If the `interactive` flag is `true`, the window will be displayed when a page load completes. If the flag is `false` or omitted, `launchWebAuthFlow` will return with an error if the initial navigation does not complete the flow.
    
    For flows that use JavaScript for redirection, `abortOnLoadForNonInteractive` can be set to `false` in combination with setting `timeoutMsForNonInteractive` to give the page a chance to perform any redirects.
    
*   timeoutMsForNonInteractive
    
    number optional
    
    Chrome 113+
    
    The maximum amount of time, in miliseconds, `launchWebAuthFlow` is allowed to run in non-interactive mode in total. Only has an effect if `interactive` is `false`.
    
*   url
    
    string
    
    The URL that initiates the auth flow.
    

Methods
-------

### clearAllCachedAuthTokens()

Chrome 87+

chrome.identity.clearAllCachedAuthTokens(): Promise<void>

Resets the state of the Identity API:

*   Removes all OAuth2 access tokens from the token cache
*   Removes user's account preferences
*   De-authorizes the user from all auth flows

#### Returns

*   Promise<void>
    
    Chrome 106+
    
    Returns a Promise which resolves when the state has been cleared.
    

### getAccounts()

Dev channel

chrome.identity.getAccounts(): Promise<[AccountInfo](#type-AccountInfo)\[\]\>

Retrieves a list of AccountInfo objects describing the accounts present on the profile.

`getAccounts` is only supported on dev channel.

#### Returns

*   Promise<[AccountInfo](#type-AccountInfo)\[\]>
    

### getAuthToken()

chrome.identity.getAuthToken(  
  details?: [TokenDetails](#type-TokenDetails),  
): Promise<[GetAuthTokenResult](#type-GetAuthTokenResult)\>

Gets an OAuth2 access token using the client ID and scopes specified in the [`oauth2` section of manifest.json](https://developer.chrome.com/docs/apps/app_identity#update_manifest).

The Identity API caches access tokens in memory, so it's ok to call `getAuthToken` non-interactively any time a token is required. The token cache automatically handles expiration.

For a good user experience it is important interactive token requests are initiated by UI in your app explaining what the authorization is for. Failing to do this will cause your users to get authorization requests, or Chrome sign in screens if they are not signed in, with with no context. In particular, do not use `getAuthToken` interactively when your app is first launched.

Note: When called with a callback, instead of returning an object this function will return the two properties as separate arguments passed to the callback.

#### Parameters

*   details
    
    [TokenDetails](#type-TokenDetails) optional
    
    Token options.
    

#### Returns

*   Promise<[GetAuthTokenResult](#type-GetAuthTokenResult)\>
    
    Chrome 105+
    
    Returns a Promise which resolves with an OAuth2 access token as specified by the manifest, or rejects if there was an error. The `grantedScopes` parameter is populated since Chrome 87. When available, this parameter contains the list of granted scopes corresponding with the returned token.
    

### getProfileUserInfo()

chrome.identity.getProfileUserInfo(  
  details?: [ProfileDetails](#type-ProfileDetails),  
): Promise<[ProfileUserInfo](#type-ProfileUserInfo)\>

Retrieves email address and obfuscated gaia id of the user signed into a profile.

Requires the `identity.email` manifest permission. Otherwise, returns an empty result.

This API is different from identity.getAccounts in two ways. The information returned is available offline, and it only applies to the primary account for the profile.

#### Parameters

*   details
    
    [ProfileDetails](#type-ProfileDetails) optional
    
    Chrome 84+
    
    Profile options.
    

#### Returns

*   Promise<[ProfileUserInfo](#type-ProfileUserInfo)\>
    
    Chrome 106+
    
    Returns a Promise which resolves with the `ProfileUserInfo` of the primary Chrome account, or an empty `ProfileUserInfo` if the account with given `details` doesn't exist.
    

### getRedirectURL()

chrome.identity.getRedirectURL(  
  path?: string,  
): string

Generates a redirect URL to be used in `launchWebAuthFlow`.

The generated URLs match the pattern `https://<app-id>.chromiumapp.org/*`.

#### Parameters

*   path
    
    string optional
    
    The path appended to the end of the generated URL.
    

#### Returns

*   string
    

### launchWebAuthFlow()

chrome.identity.launchWebAuthFlow(  
  details: [WebAuthFlowDetails](#type-WebAuthFlowDetails),  
): Promise<string | undefined\>

Starts an auth flow at the specified URL.

This method enables auth flows with non-Google identity providers by launching a web view and navigating it to the first URL in the provider's auth flow. When the provider redirects to a URL matching the pattern `https://<app-id>.chromiumapp.org/*`, the window will close, and the final redirect URL will be passed to the `callback` function.

For a good user experience it is important interactive auth flows are initiated by UI in your app explaining what the authorization is for. Failing to do this will cause your users to get authorization requests with no context. In particular, do not launch an interactive auth flow when your app is first launched.

#### Parameters

*   details
    
    [WebAuthFlowDetails](#type-WebAuthFlowDetails)
    
    WebAuth flow options.
    

#### Returns

*   Promise<string | undefined>
    
    Chrome 106+
    
    Returns a Promise which resolves with the URL redirected back to your application.
    

### removeCachedAuthToken()

chrome.identity.removeCachedAuthToken(  
  details: [InvalidTokenDetails](#type-InvalidTokenDetails),  
): Promise<void>

Removes an OAuth2 access token from the Identity API's token cache.

If an access token is discovered to be invalid, it should be passed to removeCachedAuthToken to remove it from the cache. The app may then retrieve a fresh token with `getAuthToken`.

#### Parameters

*   details
    
    [InvalidTokenDetails](#type-InvalidTokenDetails)
    
    Token information.
    

#### Returns

*   Promise<void>
    
    Chrome 106+
    
    Returns a Promise which resolves when the token has been removed from the cache.
    

Events
------

### onSignInChanged

chrome.identity.onSignInChanged.addListener(  
  callback: function,  
)

Fired when signin state changes for an account on the user's profile.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (account: [AccountInfo](#type-AccountInfo), signedIn: boolean) => void
    
    *   account
        
        [AccountInfo](#type-AccountInfo)
        
    *   signedIn
        
        boolean
        
    

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,116,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["Profiles\_\_enable\_page\_saving","DevPro\_\_enable\_free\_benefits","MiscFeatureFlags\_\_enable\_appearance\_cookies","Profiles\_\_enable\_dashboard\_curated\_recommendations","DevPro\_\_enable\_enterprise","EngEduTelemetry\_\_enable\_engedu\_telemetry","Profiles\_\_enable\_developer\_profiles\_callout","MiscFeatureFlags\_\_developers\_footer\_dark\_image","MiscFeatureFlags\_\_enable\_project\_variables","Profiles\_\_enable\_release\_notes\_notifications","Cloud\_\_enable\_llm\_concierge\_chat","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","Cloud\_\_enable\_cloud\_dlp\_service","MiscFeatureFlags\_\_enable\_firebase\_utm","Concierge\_\_enable\_actions\_menu","DevPro\_\_enable\_google\_payments\_buyflow","MiscFeatureFlags\_\_enable\_explain\_this\_code","TpcFeatures\_\_proxy\_prod\_host","Profiles\_\_enable\_user\_type","Search\_\_enable\_page\_map","DevPro\_\_enable\_embed\_profile\_creation","Profiles\_\_enable\_completequiz\_endpoint","Profiles\_\_enable\_completecodelab\_endpoint","MiscFeatureFlags\_\_enable\_view\_transitions","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","Experiments\_\_reqs\_query\_experiments","Profiles\_\_require\_profile\_eligibility\_for\_signin","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","Search\_\_enable\_ai\_eligibility\_checks","DevPro\_\_enable\_code\_assist","Cloud\_\_enable\_cloud\_shell","MiscFeatureFlags\_\_developers\_footer\_image","Profiles\_\_enable\_stripe\_subscription\_management","Cloud\_\_enable\_legacy\_calculator\_redirect","Search\_\_enable\_suggestions\_from\_borg","DevPro\_\_enable\_firebase\_workspaces\_card","Concierge\_\_enable\_remove\_info\_panel\_tags","Concierge\_\_enable\_devsite\_llm\_tools","BookNav\_\_enable\_tenant\_cache\_key","DevPro\_\_enable\_vertex\_credit\_card","Profiles\_\_enable\_playlist\_community\_acl","DevPro\_\_enable\_google\_one\_card","SignIn\_\_enable\_l1\_signup\_flow","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","Search\_\_enable\_dynamic\_content\_confidential\_banner","Cloud\_\_enable\_free\_trial\_server\_call","Search\_\_enable\_ai\_search\_summaries\_for\_all","Profiles\_\_enable\_complete\_playlist\_endpoint","CloudShell\_\_cloud\_code\_overflow\_menu","Profiles\_\_enable\_recognition\_badges","Profiles\_\_enable\_awarding\_url","Profiles\_\_enable\_auto\_apply\_credits","MiscFeatureFlags\_\_enable\_variable\_operator","Concierge\_\_enable\_pushui","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","Profiles\_\_enable\_public\_developer\_profiles","CloudShell\_\_cloud\_shell\_button","Cloud\_\_fast\_free\_trial","Analytics\_\_enable\_clearcut\_logging","Profiles\_\_enable\_purchase\_prompts","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","DevPro\_\_enable\_devpro\_offers","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","OnSwitch\_\_enable","MiscFeatureFlags\_\_enable\_llms\_txt","Cloud\_\_cache\_serialized\_dynamic\_content","Profiles\_\_enable\_join\_program\_group\_endpoint","MiscFeatureFlags\_\_emergency\_css","Profiles\_\_enable\_callout\_notifications","Cloud\_\_enable\_cloudx\_experiment\_ids","DevPro\_\_enable\_payments\_first\_batch","DevPro\_\_enable\_cloud\_innovators\_plus","Profiles\_\_enable\_profile\_collections","DevPro\_\_enable\_developer\_subscriptions","DevPro\_\_enable\_nvidia\_credits\_card","DevPro\_\_remove\_eu\_tax\_intake\_form","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

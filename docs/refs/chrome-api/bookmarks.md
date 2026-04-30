# chrome.bookmarks

**Source:** https://developer.chrome.com/docs/extensions/reference/api/bookmarks

---

Description
-----------

Use the `chrome.bookmarks` API to create, organize, and otherwise manipulate bookmarks. Also see [Override Pages](https://developer.chrome.com/docs/extensions/override), which you can use to create a custom Bookmark Manager page.

![Clicking the star adds a bookmark](/static/docs/extensions/reference/api/images/bookmarks.png)

Clicking the star adds a bookmark.

Permissions
-----------

`bookmarks`  

You must declare the "bookmarks" permission in the [extension manifest](/docs/extensions/reference/manifest) to use the bookmarks API. For example:

{
      "name": "My extension",
      ...
      "permissions": [
        "bookmarks"
      ],
      ...
    }

Concepts and usage
------------------

### Objects and properties

Bookmarks are organized in a tree, where each node in the tree is either a bookmark or a folder (sometimes called a _group_). Each node in the tree is represented by a [bookmarks.BookmarkTreeNode](#type-BookmarkTreeNode) object.

`BookmarkTreeNode` properties are used throughout the `chrome.bookmarks` API. For example, when you call [bookmarks.create](#method-create), you pass in the new node's parent (`parentId`), and, optionally, the node's `index`, `title`, and `url` properties. See [bookmarks.BookmarkTreeNode](#type-BookmarkTreeNode) for information about the properties a node can have.

**Note:** You cannot use this API to add or remove entries in the root folder. You also cannot rename, move, or remove the special "Bookmarks Bar" and "Other Bookmarks" folders.

### Examples

The following code creates a folder with the title "Extension bookmarks". The first argument to `create()` specifies properties for the new folder. The second argument defines a function to be executed after the folder is created.

chrome.bookmarks.create(
      {'parentId': bookmarkBar.id, 'title': 'Extension bookmarks'},
      function(newFolder) {
        console.log("added folder: " + newFolder.title);
      },
    );

The next snippet creates a bookmark pointing to the developer documentation for extensions. Since nothing bad will happen if creating the bookmark fails, this code doesn't bother to define a callback function.

chrome.bookmarks.create({
      'parentId': extensionsFolderId,
      'title': 'Extensions doc',
      'url': 'https://developer.chrome.com/docs/extensions',
    });

To try this API, install the [Bookmarks API example](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/bookmarks) from the [chrome-extension-samples](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples) repository.

Types
-----

### BookmarkTreeNode

A node (either a bookmark or a folder) in the bookmark tree. Child nodes are ordered within their parent folder.

#### Properties

*   children
    
    [BookmarkTreeNode](#type-BookmarkTreeNode)\[\] optional
    
    An ordered list of children of this node.
    
*   dateAdded
    
    number optional
    
    When this node was created, in milliseconds since the epoch (`new Date(dateAdded)`).
    
*   dateGroupModified
    
    number optional
    
    When the contents of this folder last changed, in milliseconds since the epoch.
    
*   dateLastUsed
    
    number optional
    
    Chrome 114+
    
    When this node was last opened, in milliseconds since the epoch. Not set for folders.
    
*   folderType
    
    [FolderType](#type-FolderType) optional
    
    Chrome 134+
    
    If present, this is a folder that is added by the browser and that cannot be modified by the user or the extension. Child nodes may be modified, if this node does not have the `unmodifiable` property set. Omitted if the node can be modified by the user and the extension (default).
    
    There may be zero, one or multiple nodes of each folder type. A folder may be added or removed by the browser, but not via the extensions API.
    
*   id
    
    string
    
    The unique identifier for the node. IDs are unique within the current profile, and they remain valid even after the browser is restarted.
    
*   index
    
    number optional
    
    The 0-based position of this node within its parent folder.
    
*   parentId
    
    string optional
    
    The `id` of the parent folder. Omitted for the root node.
    
*   syncing
    
    boolean
    
    Chrome 134+
    
    Whether this node is synced with the user's remote account storage by the browser. This can be used to distinguish between account and local-only versions of the same [`FolderType`](#type-FolderType). The value of this property may change for an existing node, for example as a result of user action.
    
    Note: this reflects whether the node is saved to the browser's built-in account provider. It is possible that a node could be synced via a third-party, even if this value is false.
    
    For managed nodes (nodes where `unmodifiable` is set to `true`), this property will always be `false`.
    
*   title
    
    string
    
    The text displayed for the node.
    
*   unmodifiable
    
    "managed"  
     optional
    
    Indicates the reason why this node is unmodifiable. The `managed` value indicates that this node was configured by the system administrator or by the custodian of a supervised user. Omitted if the node can be modified by the user and the extension (default).
    
*   url
    
    string optional
    
    The URL navigated to when a user clicks the bookmark. Omitted for folders.
    

### BookmarkTreeNodeUnmodifiable

Chrome 44+

Indicates the reason why this node is unmodifiable. The `managed` value indicates that this node was configured by the system administrator. Omitted if the node can be modified by the user and the extension (default).

#### Value

"managed"  

### CreateDetails

Object passed to the create() function.

#### Properties

*   index
    
    number optional
    
*   parentId
    
    string optional
    
    Defaults to the Other Bookmarks folder.
    
*   title
    
    string optional
    
*   url
    
    string optional
    

### FolderType

Chrome 134+

Indicates the type of folder.

#### Enum

"bookmarks-bar"  
The folder whose contents is displayed at the top of the browser window.

"other"  
Bookmarks which are displayed in the full list of bookmarks on all platforms.

"mobile"  
Bookmarks generally available on the user's mobile devices, but modifiable by extension or in the bookmarks manager.

"managed"  
A top-level folder that may be present if the system administrator or the custodian of a supervised user has configured bookmarks.

Properties
----------

### MAX\_SUSTAINED\_WRITE\_OPERATIONS\_PER\_MINUTE

Deprecated

Bookmark write operations are no longer limited by Chrome.

#### Value

1000000  

### MAX\_WRITE\_OPERATIONS\_PER\_HOUR

Deprecated

Bookmark write operations are no longer limited by Chrome.

#### Value

1000000  

### ROOT\_NODE\_ID

Pending

The `id` associated with the root level node.

#### Value

"0"  

Methods
-------

### create()

chrome.bookmarks.create(  
  bookmark: [CreateDetails](#type-CreateDetails),  
): Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\>

Creates a bookmark or folder under the specified parentId. If url is NULL or missing, it will be a folder.

#### Parameters

*   bookmark
    
    [CreateDetails](#type-CreateDetails)
    

#### Returns

*   Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\>
    
    Chrome 90+
    

### get()

chrome.bookmarks.get(  
  idOrIdList: string | \[string, ...string\[\]\],  
): Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\[\]\>

Retrieves the specified BookmarkTreeNode(s).

#### Parameters

*   idOrIdList
    
    string | \[string, ...string\[\]\]
    
    A single string-valued id, or an array of string-valued ids
    

#### Returns

*   Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\[\]>
    
    Chrome 90+
    

### getChildren()

chrome.bookmarks.getChildren(  
  id: string,  
): Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\[\]\>

Retrieves the children of the specified BookmarkTreeNode id.

#### Parameters

*   id
    
    string
    

#### Returns

*   Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\[\]>
    
    Chrome 90+
    

### getRecent()

chrome.bookmarks.getRecent(  
  numberOfItems: number,  
): Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\[\]\>

Retrieves the recently added bookmarks.

#### Parameters

*   numberOfItems
    
    number
    
    The maximum number of items to return.
    

#### Returns

*   Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\[\]>
    
    Chrome 90+
    

### getSubTree()

chrome.bookmarks.getSubTree(  
  id: string,  
): Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\[\]\>

Retrieves part of the Bookmarks hierarchy, starting at the specified node.

#### Parameters

*   id
    
    string
    
    The ID of the root of the subtree to retrieve.
    

#### Returns

*   Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\[\]>
    
    Chrome 90+
    

### getTree()

chrome.bookmarks.getTree(): Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\[\]\>

Retrieves the entire Bookmarks hierarchy.

#### Returns

*   Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\[\]>
    
    Chrome 90+
    

### move()

chrome.bookmarks.move(  
  id: string,  
  destination: object,  
): Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\>

Moves the specified BookmarkTreeNode to the provided location.

#### Parameters

*   id
    
    string
    
*   destination
    
    object
    
    *   index
        
        number optional
        
    *   parentId
        
        string optional
        
    

#### Returns

*   Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\>
    
    Chrome 90+
    

### remove()

chrome.bookmarks.remove(  
  id: string,  
): Promise<void>

Removes a bookmark or an empty bookmark folder.

#### Parameters

*   id
    
    string
    

#### Returns

*   Promise<void>
    
    Chrome 90+
    

### removeTree()

chrome.bookmarks.removeTree(  
  id: string,  
): Promise<void>

Recursively removes a bookmark folder.

#### Parameters

*   id
    
    string
    

#### Returns

*   Promise<void>
    
    Chrome 90+
    

### search()

chrome.bookmarks.search(  
  query: string | object,  
): Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\[\]\>

Searches for BookmarkTreeNodes matching the given query. Queries specified with an object produce BookmarkTreeNodes matching all specified properties.

#### Parameters

*   query
    
    string | object
    
    Either a string of words and quoted phrases that are matched against bookmark URLs and titles, or an object. If an object, the properties `query`, `url`, and `title` may be specified and bookmarks matching all specified properties will be produced.
    
    *   query
        
        string optional
        
        A string of words and quoted phrases that are matched against bookmark URLs and titles.
        
    *   title
        
        string optional
        
        The title of the bookmark; matches verbatim.
        
    *   url
        
        string optional
        
        The URL of the bookmark; matches verbatim. Note that folders have no URL.
        
    

#### Returns

*   Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\[\]>
    
    Chrome 90+
    

### update()

chrome.bookmarks.update(  
  id: string,  
  changes: object,  
): Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\>

Updates the properties of a bookmark or folder. Specify only the properties that you want to change; unspecified properties will be left unchanged. **Note:** Currently, only 'title' and 'url' are supported.

#### Parameters

*   id
    
    string
    
*   changes
    
    object
    
    *   title
        
        string optional
        
    *   url
        
        string optional
        
    

#### Returns

*   Promise<[BookmarkTreeNode](#type-BookmarkTreeNode)\>
    
    Chrome 90+
    

Events
------

### onChanged

chrome.bookmarks.onChanged.addListener(  
  callback: function,  
)

Fired when a bookmark or folder changes. **Note:** Currently, only title and url changes trigger this.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (id: string, changeInfo: object) => void
    
    *   id
        
        string
        
    *   changeInfo
        
        object
        
        *   title
            
            string
            
        *   url
            
            string optional
            
        
    

### onChildrenReordered

chrome.bookmarks.onChildrenReordered.addListener(  
  callback: function,  
)

Fired when the children of a folder have changed their order due to the order being sorted in the UI. This is not called as a result of a move().

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (id: string, reorderInfo: object) => void
    
    *   id
        
        string
        
    *   reorderInfo
        
        object
        
        *   childIds
            
            string\[\]
            
        
    

### onCreated

chrome.bookmarks.onCreated.addListener(  
  callback: function,  
)

Fired when a bookmark or folder is created.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (id: string, bookmark: [BookmarkTreeNode](#type-BookmarkTreeNode)) => void
    
    *   id
        
        string
        
    *   bookmark
        
        [BookmarkTreeNode](#type-BookmarkTreeNode)
        
    

### onImportBegan

chrome.bookmarks.onImportBegan.addListener(  
  callback: function,  
)

Fired when a bookmark import session is begun. Expensive observers should ignore onCreated updates until onImportEnded is fired. Observers should still handle other notifications immediately.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    () => void
    

### onImportEnded

chrome.bookmarks.onImportEnded.addListener(  
  callback: function,  
)

Fired when a bookmark import session is ended.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    () => void
    

### onMoved

chrome.bookmarks.onMoved.addListener(  
  callback: function,  
)

Fired when a bookmark or folder is moved to a different parent folder.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (id: string, moveInfo: object) => void
    
    *   id
        
        string
        
    *   moveInfo
        
        object
        
        *   index
            
            number
            
        *   oldIndex
            
            number
            
        *   oldParentId
            
            string
            
        *   parentId
            
            string
            
        
    

### onRemoved

chrome.bookmarks.onRemoved.addListener(  
  callback: function,  
)

Fired when a bookmark or folder is removed. When a folder is removed recursively, a single notification is fired for the folder, and none for its contents.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (id: string, removeInfo: object) => void
    
    *   id
        
        string
        
    *   removeInfo
        
        object
        
        *   index
            
            number
            
        *   node
            
            [BookmarkTreeNode](#type-BookmarkTreeNode)
            
            Chrome 48+
            
        *   parentId
            
            string
            
        
    

Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2026-01-13 UTC.

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["DevPro\_\_remove\_eu\_tax\_intake\_form","Cloud\_\_enable\_cloudx\_experiment\_ids","Profiles\_\_enable\_awarding\_url","Profiles\_\_require\_profile\_eligibility\_for\_signin","Profiles\_\_enable\_stripe\_subscription\_management","Cloud\_\_fast\_free\_trial","Search\_\_enable\_suggestions\_from\_borg","DevPro\_\_enable\_cloud\_innovators\_plus","DevPro\_\_enable\_firebase\_workspaces\_card","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","Concierge\_\_enable\_remove\_info\_panel\_tags","MiscFeatureFlags\_\_enable\_llms\_txt","MiscFeatureFlags\_\_emergency\_css","DevPro\_\_enable\_google\_one\_card","Experiments\_\_reqs\_query\_experiments","Profiles\_\_enable\_callout\_notifications","Profiles\_\_enable\_join\_program\_group\_endpoint","Profiles\_\_enable\_profile\_collections","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","BookNav\_\_enable\_tenant\_cache\_key","Profiles\_\_enable\_complete\_playlist\_endpoint","Profiles\_\_enable\_auto\_apply\_credits","MiscFeatureFlags\_\_enable\_project\_variables","DevPro\_\_enable\_nvidia\_credits\_card","DevPro\_\_enable\_free\_benefits","Concierge\_\_enable\_pushui","DevPro\_\_enable\_payments\_first\_batch","DevPro\_\_enable\_embed\_profile\_creation","Profiles\_\_enable\_developer\_profiles\_callout","MiscFeatureFlags\_\_enable\_explain\_this\_code","Cloud\_\_cache\_serialized\_dynamic\_content","Profiles\_\_enable\_page\_saving","OnSwitch\_\_enable","MiscFeatureFlags\_\_enable\_view\_transitions","Cloud\_\_enable\_cloud\_dlp\_service","Search\_\_enable\_ai\_search\_summaries\_for\_all","CloudShell\_\_cloud\_code\_overflow\_menu","Profiles\_\_enable\_recognition\_badges","MiscFeatureFlags\_\_enable\_variable\_operator","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","DevPro\_\_enable\_developer\_subscriptions","MiscFeatureFlags\_\_enable\_firebase\_utm","Profiles\_\_enable\_completequiz\_endpoint","DevPro\_\_enable\_code\_assist","Profiles\_\_enable\_user\_type","Profiles\_\_enable\_completecodelab\_endpoint","DevPro\_\_enable\_devpro\_offers","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","MiscFeatureFlags\_\_enable\_appearance\_cookies","Cloud\_\_enable\_legacy\_calculator\_redirect","EngEduTelemetry\_\_enable\_engedu\_telemetry","DevPro\_\_enable\_enterprise","Profiles\_\_enable\_release\_notes\_notifications","Cloud\_\_enable\_llm\_concierge\_chat","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","Concierge\_\_enable\_devsite\_llm\_tools","Profiles\_\_enable\_dashboard\_curated\_recommendations","SignIn\_\_enable\_l1\_signup\_flow","DevPro\_\_enable\_vertex\_credit\_card","Search\_\_enable\_dynamic\_content\_confidential\_banner","Profiles\_\_enable\_public\_developer\_profiles","Profiles\_\_enable\_playlist\_community\_acl","TpcFeatures\_\_proxy\_prod\_host","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","Profiles\_\_enable\_purchase\_prompts","MiscFeatureFlags\_\_developers\_footer\_image","Analytics\_\_enable\_clearcut\_logging","Cloud\_\_enable\_cloud\_shell","Search\_\_enable\_page\_map","Concierge\_\_enable\_actions\_menu","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","MiscFeatureFlags\_\_developers\_footer\_dark\_image","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","Cloud\_\_enable\_free\_trial\_server\_call","Search\_\_enable\_ai\_eligibility\_checks","CloudShell\_\_cloud\_shell\_button","DevPro\_\_enable\_google\_payments\_buyflow"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

# chrome.webNavigation

**Source:** https://developer.chrome.com/docs/extensions/reference/api/webNavigation

---

Description
-----------

Use the `chrome.webNavigation` API to receive notifications about the status of navigation requests in-flight.

Permissions
-----------

`webNavigation`  

All `chrome.webNavigation` methods and events require you to declare the `"webNavigation"` permission in the [extension manifest](/docs/extensions/reference/manifest). For example:

{
      "name": "My extension",
      ...
      "permissions": [
        "webNavigation"
      ],
      ...
    }

Concepts and usage
------------------

### Event order

For a navigation that is successfully completed, events are fired in the following order:

onBeforeNavigate -> onCommitted -> [onDOMContentLoaded] -> onCompleted

Any error that occurs during the process results in an `onErrorOccurred` event. For a specific navigation, there are no further events fired after `onErrorOccurred`.

If a navigating frame contains subframes, its `onCommitted` is fired before any of its children's `onBeforeNavigate`; while `onCompleted` is fired after all of its children's `onCompleted`.

If the reference fragment of a frame is changed, a `onReferenceFragmentUpdated` event is fired. This event can fire any time after `onDOMContentLoaded`, even after `onCompleted`.

If the history API is used to modify the state of a frame (e.g. using `history.pushState()`, a `onHistoryStateUpdated` event is fired. This event can fire any time after `onDOMContentLoaded`.

If a navigation restored a page from the [Back Forward Cache](https://web.dev/bfcache/), the `onDOMContentLoaded` event won't fire. The event is not fired because the content has already completed load when the page was first visited.

If a navigation was triggered using [Chrome Instant](https://support.google.com/chrome/answer/177873) or [Instant Pages](https://support.google.com/chrome/answer/1385029), a completely loaded page is swapped into the current tab. In that case, an `onTabReplaced` event is fired.

### Relation to webRequest events

There is no defined ordering between events of the [webRequest API](/docs/extensions/reference/api/webRequest) and the events of the webNavigation API. It is possible that webRequest events are still received for frames that already started a new navigation, or that a navigation only proceeds after the network resources are already fully loaded.

In general, the webNavigation events are closely related to the navigation state that is displayed in the UI, while the webRequest events correspond to the state of the network stack which is generally opaque to the user.

### Tab IDs

Not all navigating tabs correspond to actual tabs in Chrome's UI, for example, a tab that is being pre-rendered. Such tabs are not accessible using the [tabs API](/docs/extensions/reference/api/tabs) nor can you request information about them by calling `webNavigation.getFrame()` or `webNavigation.getAllFrames()`. Once such a tab is swapped in, an `onTabReplaced` event is fired and they become accessible through these APIs.

### Timestamps

It's important to note that some technical oddities in the OS's handling of distinct Chrome processes can cause the clock to be skewed between the browser itself and extension processes. That means that the `timeStamp` property of the `WebNavigation` event `timeStamp` property is only guaranteed to be _internally_ consistent. Comparing one event to another event will give you the correct offset between them, but comparing them to the current time inside the extension (using `(new Date()).getTime()`, for instance) might give unexpected results.

### Frame IDs

Frames within a tab can be identified by a frame ID. The frame ID of the main frame is always 0, the ID of child frames is a positive number. Once a document is constructed in a frame, its frame ID remains constant during the lifetime of the document. As of Chrome 49, this ID is also constant for the lifetime of the frame (across multiple navigations).

Due to the multi-process nature of Chrome, a tab might use different processes to render the source and destination of a web page. Therefore, if a navigation takes place in a new process, you might receive events both from the new and the old page until the new navigation is committed (i.e. the `onCommitted` event is sent for the new main frame). In other words, it is possible to have more than one pending sequence of webNavigation events with the same `frameId`. The sequences can be distinguished by the `processId` key.

Also note that during a provisional load the process might be switched several times. This happens when the load is redirected to a different site. In this case, you will receive repeated `onBeforeNavigate` and `onErrorOccurred` events, until you receive the final `onCommitted` event.

Another concept that is problematic with extensions is the lifecycle of the frame. A frame hosts a document (which is associated with a committed URL). The document can change (say by navigating) but the _frameId_ won't, and so it is difficult to associate that something happened in a specific document with just _frameIds_. We are introducing a concept of a [documentId](/docs/extensions/reference/webNavigation#method-getFrame:%7E:text=retrieve%20information%20about.-,documentId,-string%C2%A0optional) which is a unique identifier per document. If a frame is navigated and opens a new document the identifier will change. This field is useful for determining when pages change their lifecycle state (between prerender/active/cached) because it remains the same.

### Transition types and qualifiers

The `webNavigation` `onCommitted` event has a `transitionType` and a `transitionQualifiers` property. The _transition type_ is the same as used in the [history API](/docs/extensions/reference/api/history#transition_types) describing how the browser navigated to this particular URL. In addition, several _transition qualifiers_ can be returned that further define the navigation.

The following transition qualifiers exist:

Transition qualifier

Description

"client\_redirect"

One or more redirects caused by JavaScript or meta refresh tags on the page happened during the navigation.

"server\_redirect"

One or more redirects caused by HTTP headers sent from the server happened during the navigation.

"forward\_back"

The user used the Forward or Back button to initiate the navigation.

"from\_address\_bar"

The user initiated the navigation from the address bar (aka Omnibox).

Examples
--------

To try this API, install the [webNavigation API example](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/webNavigation) from the [chrome-extension-samples](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples) repository.

Types
-----

### TransitionQualifier

Chrome 44+

#### Enum

"client\_redirect"  

"server\_redirect"  

"forward\_back"  

"from\_address\_bar"  

### TransitionType

Chrome 44+

Cause of the navigation. The same transition types as defined in the history API are used. These are the same transition types as defined in the [history API](https://developer.chrome.com/docs/extensions/reference/history/#transition_types) except with `"start_page"` in place of `"auto_toplevel"` (for backwards compatibility).

#### Enum

"link"  

"typed"  

"auto\_bookmark"  

"auto\_subframe"  

"manual\_subframe"  

"generated"  

"start\_page"  

"form\_submit"  

"reload"  

"keyword"  

"keyword\_generated"  

Methods
-------

### getAllFrames()

chrome.webNavigation.getAllFrames(  
  details: object,  
): Promise<object\[\] | undefined\>

Retrieves information about all frames of a given tab.

#### Parameters

*   details
    
    object
    
    Information about the tab to retrieve all frames from.
    
    *   tabId
        
        number
        
        The ID of the tab.
        
    

#### Returns

*   Promise<object\[\] | undefined>
    
    Chrome 93+
    

### getFrame()

chrome.webNavigation.getFrame(  
  details: object,  
): Promise<object | undefined\>

Retrieves information about the given frame. A frame refers to an <iframe> or a <frame> of a web page and is identified by a tab ID and a frame ID.

#### Parameters

*   details
    
    object
    
    Information about the frame to retrieve information about.
    
    *   documentId
        
        string optional
        
        Chrome 106+
        
        The UUID of the document. If the frameId and/or tabId are provided they will be validated to match the document found by provided document ID.
        
    *   frameId
        
        number optional
        
        The ID of the frame in the given tab.
        
    *   processId
        
        number optional
        
        Deprecated since Chrome 49
        
        Frames are now uniquely identified by their tab ID and frame ID; the process ID is no longer needed and therefore ignored.
        
        The ID of the process that runs the renderer for this tab.
        
    *   tabId
        
        number optional
        
        The ID of the tab in which the frame is.
        
    

#### Returns

*   Promise<object | undefined>
    
    Chrome 93+
    

Events
------

### onBeforeNavigate

chrome.webNavigation.onBeforeNavigate.addListener(  
  callback: function,  
  filters?: object,  
)

Fired when a navigation is about to occur.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (details: object) => void
    
    *   details
        
        object
        
        *   documentLifecycle
            
            [extensionTypes.DocumentLifecycle](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-DocumentLifecycle)
            
            Chrome 106+
            
            The lifecycle the document is in.
            
        *   frameId
            
            number
            
            0 indicates the navigation happens in the tab content window; a positive value indicates navigation in a subframe. Frame IDs are unique for a given tab and process.
            
        *   frameType
            
            [extensionTypes.FrameType](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-FrameType)
            
            Chrome 106+
            
            The type of frame the navigation occurred in.
            
        *   parentDocumentId
            
            string optional
            
            Chrome 106+
            
            A UUID of the parent document owning this frame. This is not set if there is no parent.
            
        *   parentFrameId
            
            number
            
            The ID of the parent frame, or `-1` if this is the main frame.
            
        *   processId
            
            number
            
            Deprecated since Chrome 50
            
            The processId is no longer set for this event, since the process which will render the resulting document is not known until onCommit.
            
            The value of -1.
            
        *   tabId
            
            number
            
            The ID of the tab in which the navigation is about to occur.
            
        *   timeStamp
            
            number
            
            The time when the browser was about to start the navigation, in milliseconds since the epoch.
            
        *   url
            
            string
            
        
    
*   filters
    
    object optional
    
    *   url
        
        [events.UrlFilter](https://developer.chrome.com/docs/extensions/reference/events/#type-UrlFilter)\[\]
        
        Conditions that the URL being navigated to must satisfy. The 'schemes' and 'ports' fields of UrlFilter are ignored for this event.
        
    

### onCommitted

chrome.webNavigation.onCommitted.addListener(  
  callback: function,  
  filters?: object,  
)

Fired when a navigation is committed. The document (and the resources it refers to, such as images and subframes) might still be downloading, but at least part of the document has been received from the server and the browser has decided to switch to the new document.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (details: object) => void
    
    *   details
        
        object
        
        *   documentId
            
            string
            
            Chrome 106+
            
            A UUID of the document loaded.
            
        *   documentLifecycle
            
            [extensionTypes.DocumentLifecycle](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-DocumentLifecycle)
            
            Chrome 106+
            
            The lifecycle the document is in.
            
        *   frameId
            
            number
            
            0 indicates the navigation happens in the tab content window; a positive value indicates navigation in a subframe. Frame IDs are unique within a tab.
            
        *   frameType
            
            [extensionTypes.FrameType](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-FrameType)
            
            Chrome 106+
            
            The type of frame the navigation occurred in.
            
        *   parentDocumentId
            
            string optional
            
            Chrome 106+
            
            A UUID of the parent document owning this frame. This is not set if there is no parent.
            
        *   parentFrameId
            
            number
            
            Chrome 74+
            
            The ID of the parent frame, or `-1` if this is the main frame.
            
        *   processId
            
            number
            
            The ID of the process that runs the renderer for this frame.
            
        *   tabId
            
            number
            
            The ID of the tab in which the navigation occurs.
            
        *   timeStamp
            
            number
            
            The time when the navigation was committed, in milliseconds since the epoch.
            
        *   transitionQualifiers
            
            [TransitionQualifier](#type-TransitionQualifier)\[\]
            
            A list of transition qualifiers.
            
        *   transitionType
            
            [TransitionType](#type-TransitionType)
            
            Cause of the navigation.
            
        *   url
            
            string
            
        
    
*   filters
    
    object optional
    
    *   url
        
        [events.UrlFilter](https://developer.chrome.com/docs/extensions/reference/events/#type-UrlFilter)\[\]
        
        Conditions that the URL being navigated to must satisfy. The 'schemes' and 'ports' fields of UrlFilter are ignored for this event.
        
    

### onCompleted

chrome.webNavigation.onCompleted.addListener(  
  callback: function,  
  filters?: object,  
)

Fired when a document, including the resources it refers to, is completely loaded and initialized.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (details: object) => void
    
    *   details
        
        object
        
        *   documentId
            
            string
            
            Chrome 106+
            
            A UUID of the document loaded.
            
        *   documentLifecycle
            
            [extensionTypes.DocumentLifecycle](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-DocumentLifecycle)
            
            Chrome 106+
            
            The lifecycle the document is in.
            
        *   frameId
            
            number
            
            0 indicates the navigation happens in the tab content window; a positive value indicates navigation in a subframe. Frame IDs are unique within a tab.
            
        *   frameType
            
            [extensionTypes.FrameType](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-FrameType)
            
            Chrome 106+
            
            The type of frame the navigation occurred in.
            
        *   parentDocumentId
            
            string optional
            
            Chrome 106+
            
            A UUID of the parent document owning this frame. This is not set if there is no parent.
            
        *   parentFrameId
            
            number
            
            Chrome 74+
            
            The ID of the parent frame, or `-1` if this is the main frame.
            
        *   processId
            
            number
            
            The ID of the process that runs the renderer for this frame.
            
        *   tabId
            
            number
            
            The ID of the tab in which the navigation occurs.
            
        *   timeStamp
            
            number
            
            The time when the document finished loading, in milliseconds since the epoch.
            
        *   url
            
            string
            
        
    
*   filters
    
    object optional
    
    *   url
        
        [events.UrlFilter](https://developer.chrome.com/docs/extensions/reference/events/#type-UrlFilter)\[\]
        
        Conditions that the URL being navigated to must satisfy. The 'schemes' and 'ports' fields of UrlFilter are ignored for this event.
        
    

### onCreatedNavigationTarget

chrome.webNavigation.onCreatedNavigationTarget.addListener(  
  callback: function,  
  filters?: object,  
)

Fired when a new window, or a new tab in an existing window, is created to host a navigation.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (details: object) => void
    
    *   details
        
        object
        
        *   sourceFrameId
            
            number
            
            The ID of the frame with sourceTabId in which the navigation is triggered. 0 indicates the main frame.
            
        *   sourceProcessId
            
            number
            
            The ID of the process that runs the renderer for the source frame.
            
        *   sourceTabId
            
            number
            
            The ID of the tab in which the navigation is triggered.
            
        *   tabId
            
            number
            
            The ID of the tab in which the url is opened
            
        *   timeStamp
            
            number
            
            The time when the browser was about to create a new view, in milliseconds since the epoch.
            
        *   url
            
            string
            
            The URL to be opened in the new window.
            
        
    
*   filters
    
    object optional
    
    *   url
        
        [events.UrlFilter](https://developer.chrome.com/docs/extensions/reference/events/#type-UrlFilter)\[\]
        
        Conditions that the URL being navigated to must satisfy. The 'schemes' and 'ports' fields of UrlFilter are ignored for this event.
        
    

### onDOMContentLoaded

chrome.webNavigation.onDOMContentLoaded.addListener(  
  callback: function,  
  filters?: object,  
)

Fired when the page's DOM is fully constructed, but the referenced resources may not finish loading.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (details: object) => void
    
    *   details
        
        object
        
        *   documentId
            
            string
            
            Chrome 106+
            
            A UUID of the document loaded.
            
        *   documentLifecycle
            
            [extensionTypes.DocumentLifecycle](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-DocumentLifecycle)
            
            Chrome 106+
            
            The lifecycle the document is in.
            
        *   frameId
            
            number
            
            0 indicates the navigation happens in the tab content window; a positive value indicates navigation in a subframe. Frame IDs are unique within a tab.
            
        *   frameType
            
            [extensionTypes.FrameType](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-FrameType)
            
            Chrome 106+
            
            The type of frame the navigation occurred in.
            
        *   parentDocumentId
            
            string optional
            
            Chrome 106+
            
            A UUID of the parent document owning this frame. This is not set if there is no parent.
            
        *   parentFrameId
            
            number
            
            Chrome 74+
            
            The ID of the parent frame, or `-1` if this is the main frame.
            
        *   processId
            
            number
            
            The ID of the process that runs the renderer for this frame.
            
        *   tabId
            
            number
            
            The ID of the tab in which the navigation occurs.
            
        *   timeStamp
            
            number
            
            The time when the page's DOM was fully constructed, in milliseconds since the epoch.
            
        *   url
            
            string
            
        
    
*   filters
    
    object optional
    
    *   url
        
        [events.UrlFilter](https://developer.chrome.com/docs/extensions/reference/events/#type-UrlFilter)\[\]
        
        Conditions that the URL being navigated to must satisfy. The 'schemes' and 'ports' fields of UrlFilter are ignored for this event.
        
    

### onErrorOccurred

chrome.webNavigation.onErrorOccurred.addListener(  
  callback: function,  
  filters?: object,  
)

Fired when an error occurs and the navigation is aborted. This can happen if either a network error occurred, or the user aborted the navigation.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (details: object) => void
    
    *   details
        
        object
        
        *   documentId
            
            string
            
            Chrome 106+
            
            A UUID of the document loaded.
            
        *   documentLifecycle
            
            [extensionTypes.DocumentLifecycle](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-DocumentLifecycle)
            
            Chrome 106+
            
            The lifecycle the document is in.
            
        *   error
            
            string
            
            The error description.
            
        *   frameId
            
            number
            
            0 indicates the navigation happens in the tab content window; a positive value indicates navigation in a subframe. Frame IDs are unique within a tab.
            
        *   frameType
            
            [extensionTypes.FrameType](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-FrameType)
            
            Chrome 106+
            
            The type of frame the navigation occurred in.
            
        *   parentDocumentId
            
            string optional
            
            Chrome 106+
            
            A UUID of the parent document owning this frame. This is not set if there is no parent.
            
        *   parentFrameId
            
            number
            
            Chrome 74+
            
            The ID of the parent frame, or `-1` if this is the main frame.
            
        *   processId
            
            number
            
            Deprecated since Chrome 50
            
            The processId is no longer set for this event.
            
            The value of -1.
            
        *   tabId
            
            number
            
            The ID of the tab in which the navigation occurs.
            
        *   timeStamp
            
            number
            
            The time when the error occurred, in milliseconds since the epoch.
            
        *   url
            
            string
            
        
    
*   filters
    
    object optional
    
    *   url
        
        [events.UrlFilter](https://developer.chrome.com/docs/extensions/reference/events/#type-UrlFilter)\[\]
        
        Conditions that the URL being navigated to must satisfy. The 'schemes' and 'ports' fields of UrlFilter are ignored for this event.
        
    

### onHistoryStateUpdated

chrome.webNavigation.onHistoryStateUpdated.addListener(  
  callback: function,  
  filters?: object,  
)

Fired when the frame's history was updated to a new URL. All future events for that frame will use the updated URL.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (details: object) => void
    
    *   details
        
        object
        
        *   documentId
            
            string
            
            Chrome 106+
            
            A UUID of the document loaded.
            
        *   documentLifecycle
            
            [extensionTypes.DocumentLifecycle](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-DocumentLifecycle)
            
            Chrome 106+
            
            The lifecycle the document is in.
            
        *   frameId
            
            number
            
            0 indicates the navigation happens in the tab content window; a positive value indicates navigation in a subframe. Frame IDs are unique within a tab.
            
        *   frameType
            
            [extensionTypes.FrameType](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-FrameType)
            
            Chrome 106+
            
            The type of frame the navigation occurred in.
            
        *   parentDocumentId
            
            string optional
            
            Chrome 106+
            
            A UUID of the parent document owning this frame. This is not set if there is no parent.
            
        *   parentFrameId
            
            number
            
            Chrome 74+
            
            The ID of the parent frame, or `-1` if this is the main frame.
            
        *   processId
            
            number
            
            The ID of the process that runs the renderer for this frame.
            
        *   tabId
            
            number
            
            The ID of the tab in which the navigation occurs.
            
        *   timeStamp
            
            number
            
            The time when the navigation was committed, in milliseconds since the epoch.
            
        *   transitionQualifiers
            
            [TransitionQualifier](#type-TransitionQualifier)\[\]
            
            A list of transition qualifiers.
            
        *   transitionType
            
            [TransitionType](#type-TransitionType)
            
            Cause of the navigation.
            
        *   url
            
            string
            
        
    
*   filters
    
    object optional
    
    *   url
        
        [events.UrlFilter](https://developer.chrome.com/docs/extensions/reference/events/#type-UrlFilter)\[\]
        
        Conditions that the URL being navigated to must satisfy. The 'schemes' and 'ports' fields of UrlFilter are ignored for this event.
        
    

### onReferenceFragmentUpdated

chrome.webNavigation.onReferenceFragmentUpdated.addListener(  
  callback: function,  
  filters?: object,  
)

Fired when the reference fragment of a frame was updated. All future events for that frame will use the updated URL.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (details: object) => void
    
    *   details
        
        object
        
        *   documentId
            
            string
            
            Chrome 106+
            
            A UUID of the document loaded.
            
        *   documentLifecycle
            
            [extensionTypes.DocumentLifecycle](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-DocumentLifecycle)
            
            Chrome 106+
            
            The lifecycle the document is in.
            
        *   frameId
            
            number
            
            0 indicates the navigation happens in the tab content window; a positive value indicates navigation in a subframe. Frame IDs are unique within a tab.
            
        *   frameType
            
            [extensionTypes.FrameType](https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-FrameType)
            
            Chrome 106+
            
            The type of frame the navigation occurred in.
            
        *   parentDocumentId
            
            string optional
            
            Chrome 106+
            
            A UUID of the parent document owning this frame. This is not set if there is no parent.
            
        *   parentFrameId
            
            number
            
            Chrome 74+
            
            The ID of the parent frame, or `-1` if this is the main frame.
            
        *   processId
            
            number
            
            The ID of the process that runs the renderer for this frame.
            
        *   tabId
            
            number
            
            The ID of the tab in which the navigation occurs.
            
        *   timeStamp
            
            number
            
            The time when the navigation was committed, in milliseconds since the epoch.
            
        *   transitionQualifiers
            
            [TransitionQualifier](#type-TransitionQualifier)\[\]
            
            A list of transition qualifiers.
            
        *   transitionType
            
            [TransitionType](#type-TransitionType)
            
            Cause of the navigation.
            
        *   url
            
            string
            
        
    
*   filters
    
    object optional
    
    *   url
        
        [events.UrlFilter](https://developer.chrome.com/docs/extensions/reference/events/#type-UrlFilter)\[\]
        
        Conditions that the URL being navigated to must satisfy. The 'schemes' and 'ports' fields of UrlFilter are ignored for this event.
        
    

### onTabReplaced

chrome.webNavigation.onTabReplaced.addListener(  
  callback: function,  
)

Fired when the contents of the tab is replaced by a different (usually previously pre-rendered) tab.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (details: object) => void
    
    *   details
        
        object
        
        *   replacedTabId
            
            number
            
            The ID of the tab that was replaced.
            
        *   tabId
            
            number
            
            The ID of the tab that replaced the old tab.
            
        *   timeStamp
            
            number
            
            The time when the replacement happened, in milliseconds since the epoch.
            
        
    

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,116,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["BookNav\_\_enable\_tenant\_cache\_key","Concierge\_\_enable\_pushui","MiscFeatureFlags\_\_enable\_appearance\_cookies","Concierge\_\_enable\_remove\_info\_panel\_tags","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","Profiles\_\_enable\_playlist\_community\_acl","DevPro\_\_enable\_free\_benefits","Profiles\_\_enable\_complete\_playlist\_endpoint","MiscFeatureFlags\_\_enable\_firebase\_utm","Profiles\_\_require\_profile\_eligibility\_for\_signin","Cloud\_\_enable\_cloudx\_experiment\_ids","Profiles\_\_enable\_dashboard\_curated\_recommendations","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","DevPro\_\_enable\_google\_one\_card","Profiles\_\_enable\_awarding\_url","Profiles\_\_enable\_recognition\_badges","Profiles\_\_enable\_completequiz\_endpoint","Cloud\_\_enable\_llm\_concierge\_chat","DevPro\_\_enable\_devpro\_offers","CloudShell\_\_cloud\_shell\_button","DevPro\_\_enable\_code\_assist","CloudShell\_\_cloud\_code\_overflow\_menu","Profiles\_\_enable\_auto\_apply\_credits","Concierge\_\_enable\_actions\_menu","MiscFeatureFlags\_\_enable\_view\_transitions","DevPro\_\_enable\_embed\_profile\_creation","MiscFeatureFlags\_\_developers\_footer\_dark\_image","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","Profiles\_\_enable\_join\_program\_group\_endpoint","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","Analytics\_\_enable\_clearcut\_logging","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","Profiles\_\_enable\_callout\_notifications","Profiles\_\_enable\_completecodelab\_endpoint","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","Profiles\_\_enable\_page\_saving","MiscFeatureFlags\_\_enable\_variable\_operator","Search\_\_enable\_ai\_eligibility\_checks","Cloud\_\_enable\_cloud\_shell","MiscFeatureFlags\_\_emergency\_css","Profiles\_\_enable\_stripe\_subscription\_management","Search\_\_enable\_ai\_search\_summaries\_for\_all","Experiments\_\_reqs\_query\_experiments","MiscFeatureFlags\_\_enable\_explain\_this\_code","Concierge\_\_enable\_devsite\_llm\_tools","Profiles\_\_enable\_user\_type","Cloud\_\_fast\_free\_trial","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","TpcFeatures\_\_proxy\_prod\_host","Profiles\_\_enable\_public\_developer\_profiles","Profiles\_\_enable\_profile\_collections","MiscFeatureFlags\_\_enable\_llms\_txt","DevPro\_\_enable\_nvidia\_credits\_card","DevPro\_\_enable\_firebase\_workspaces\_card","SignIn\_\_enable\_l1\_signup\_flow","Cloud\_\_enable\_cloud\_dlp\_service","Cloud\_\_enable\_free\_trial\_server\_call","DevPro\_\_enable\_payments\_first\_batch","Cloud\_\_enable\_legacy\_calculator\_redirect","OnSwitch\_\_enable","DevPro\_\_enable\_enterprise","Search\_\_enable\_page\_map","Profiles\_\_enable\_purchase\_prompts","MiscFeatureFlags\_\_enable\_project\_variables","DevPro\_\_enable\_developer\_subscriptions","Profiles\_\_enable\_developer\_profiles\_callout","Profiles\_\_enable\_release\_notes\_notifications","Search\_\_enable\_suggestions\_from\_borg","Cloud\_\_cache\_serialized\_dynamic\_content","DevPro\_\_enable\_google\_payments\_buyflow","DevPro\_\_enable\_vertex\_credit\_card","EngEduTelemetry\_\_enable\_engedu\_telemetry","DevPro\_\_remove\_eu\_tax\_intake\_form","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","Search\_\_enable\_dynamic\_content\_confidential\_banner","MiscFeatureFlags\_\_developers\_footer\_image","DevPro\_\_enable\_cloud\_innovators\_plus"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

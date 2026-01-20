# chrome.downloads

**Source:** https://developer.chrome.com/docs/extensions/reference/api/downloads

---

Description
-----------

Use the `chrome.downloads` API to programmatically initiate, monitor, manipulate, and search for downloads.

Permissions
-----------

`downloads`  

You must declare the `"downloads"` permission in the [extension manifest](/docs/extensions/reference/manifest) to use this API.

{
      "name": "My extension",
      ...
      "permissions": [
        "downloads"
      ],
    }

Examples
--------

You can find simple examples of using the `chrome.downloads` API in the [examples/api/downloads](https://github.com/GoogleChrome/chrome-extensions-samples/tree/master/_archive/mv2/api/downloads/) directory. For other examples and for help in viewing the source code, see [Samples](/docs/extensions/mv2/samples).

Types
-----

### BooleanDelta

#### Properties

*   current
    
    boolean optional
    
*   previous
    
    boolean optional
    

### DangerType

#### Enum

"file"  
The download's filename is suspicious.

"url"  
The download's URL is known to be malicious.

"content"  
The downloaded file is known to be malicious.

"uncommon"  
The download's URL is not commonly downloaded and could be dangerous.

"host"  
The download came from a host known to distribute malicious binaries and is likely dangerous.

"unwanted"  
The download is potentially unwanted or unsafe. E.g. it could make changes to browser or computer settings.

"safe"  
The download presents no known danger to the user's computer.

"accepted"  
The user has accepted the dangerous download.

"allowlistedByPolicy"  
Enterprise-related values.

"asyncScanning"  

"asyncLocalPasswordScanning"  

"passwordProtected"  

"blockedTooLarge"  

"sensitiveContentWarning"  

"sensitiveContentBlock"  

"deepScannedFailed"  

"deepScannedSafe"  

"deepScannedOpenedDangerous"  

"promptForScanning"  

"promptForLocalPasswordScanning"  

"accountCompromise"  

"blockedScanFailed"  

"forceSaveToGdrive"  
For use by the Secure Enterprise Browser extension. When required, Chrome will block the download to disc and download the file directly to Google Drive.

"forceSaveToOnedrive"  
For use by the Secure Enterprise Browser extension. When required, Chrome will block the download to disc and download the file directly to OneDrive.

### DoubleDelta

#### Properties

*   current
    
    number optional
    
*   previous
    
    number optional
    

### DownloadDelta

#### Properties

*   canResume
    
    [BooleanDelta](#type-BooleanDelta) optional
    
    The change in `canResume`, if any.
    
*   danger
    
    [StringDelta](#type-StringDelta) optional
    
    The change in `danger`, if any.
    
*   endTime
    
    [StringDelta](#type-StringDelta) optional
    
    The change in `endTime`, if any.
    
*   error
    
    [StringDelta](#type-StringDelta) optional
    
    The change in `error`, if any.
    
*   exists
    
    [BooleanDelta](#type-BooleanDelta) optional
    
    The change in `exists`, if any.
    
*   fileSize
    
    [DoubleDelta](#type-DoubleDelta) optional
    
    The change in `fileSize`, if any.
    
*   filename
    
    [StringDelta](#type-StringDelta) optional
    
    The change in `filename`, if any.
    
*   finalUrl
    
    [StringDelta](#type-StringDelta) optional
    
    Chrome 54+
    
    The change in `finalUrl`, if any.
    
*   id
    
    number
    
    The `id` of the [`DownloadItem`](#type-DownloadItem) that changed.
    
*   mime
    
    [StringDelta](#type-StringDelta) optional
    
    The change in `mime`, if any.
    
*   paused
    
    [BooleanDelta](#type-BooleanDelta) optional
    
    The change in `paused`, if any.
    
*   startTime
    
    [StringDelta](#type-StringDelta) optional
    
    The change in `startTime`, if any.
    
*   state
    
    [StringDelta](#type-StringDelta) optional
    
    The change in `state`, if any.
    
*   totalBytes
    
    [DoubleDelta](#type-DoubleDelta) optional
    
    The change in `totalBytes`, if any.
    
*   url
    
    [StringDelta](#type-StringDelta) optional
    
    The change in `url`, if any.
    

### DownloadItem

#### Properties

*   byExtensionId
    
    string optional
    
    The identifier for the extension that initiated this download if this download was initiated by an extension. Does not change once it is set.
    
*   byExtensionName
    
    string optional
    
    The localized name of the extension that initiated this download if this download was initiated by an extension. May change if the extension changes its name or if the user changes their locale.
    
*   bytesReceived
    
    number
    
    Number of bytes received so far from the host, without considering file compression.
    
*   canResume
    
    boolean
    
    True if the download is in progress and paused, or else if it is interrupted and can be resumed starting from where it was interrupted.
    
*   danger
    
    [DangerType](#type-DangerType)
    
    Indication of whether this download is thought to be safe or known to be suspicious.
    
*   endTime
    
    string optional
    
    The time when the download ended in ISO 8601 format. May be passed directly to the Date constructor: `chrome.downloads.search({}, function(items){items.forEach(function(item){if (item.endTime) console.log(new Date(item.endTime))})})`
    
*   error
    
    [InterruptReason](#type-InterruptReason) optional
    
    Why the download was interrupted. Several kinds of HTTP errors may be grouped under one of the errors beginning with `SERVER_`. Errors relating to the network begin with `NETWORK_`, errors relating to the process of writing the file to the file system begin with `FILE_`, and interruptions initiated by the user begin with `USER_`.
    
*   estimatedEndTime
    
    string optional
    
    Estimated time when the download will complete in ISO 8601 format. May be passed directly to the Date constructor: `chrome.downloads.search({}, function(items){items.forEach(function(item){if (item.estimatedEndTime) console.log(new Date(item.estimatedEndTime))})})`
    
*   exists
    
    boolean
    
    Whether the downloaded file still exists. This information may be out of date because Chrome does not automatically watch for file removal. Call [`search`](#method-search)() in order to trigger the check for file existence. When the existence check completes, if the file has been deleted, then an [`onChanged`](#event-onChanged) event will fire. Note that [`search`](#method-search)() does not wait for the existence check to finish before returning, so results from [`search`](#method-search)() may not accurately reflect the file system. Also, [`search`](#method-search)() may be called as often as necessary, but will not check for file existence any more frequently than once every 10 seconds.
    
*   fileSize
    
    number
    
    Number of bytes in the whole file post-decompression, or -1 if unknown.
    
*   filename
    
    string
    
    Absolute local path.
    
*   finalUrl
    
    string
    
    Chrome 54+
    
    The absolute URL that this download is being made from, after all redirects.
    
*   id
    
    number
    
    An identifier that is persistent across browser sessions.
    
*   incognito
    
    boolean
    
    False if this download is recorded in the history, true if it is not recorded.
    
*   mime
    
    string
    
    The file's MIME type.
    
*   paused
    
    boolean
    
    True if the download has stopped reading data from the host, but kept the connection open.
    
*   referrer
    
    string
    
    Absolute URL.
    
*   startTime
    
    string
    
    The time when the download began in ISO 8601 format. May be passed directly to the Date constructor: `chrome.downloads.search({}, function(items){items.forEach(function(item){console.log(new Date(item.startTime))})})`
    
*   state
    
    [State](#type-State)
    
    Indicates whether the download is progressing, interrupted, or complete.
    
*   totalBytes
    
    number
    
    Number of bytes in the whole file, without considering file compression, or -1 if unknown.
    
*   url
    
    string
    
    The absolute URL that this download initiated from, before any redirects.
    

### DownloadOptions

#### Properties

*   body
    
    string optional
    
    Post body.
    
*   conflictAction
    
    [FilenameConflictAction](#type-FilenameConflictAction) optional
    
    The action to take if `filename` already exists.
    
*   filename
    
    string optional
    
    A file path relative to the Downloads directory to contain the downloaded file, possibly containing subdirectories. Absolute paths, empty paths, and paths containing back-references ".." will cause an error. [`onDeterminingFilename`](#event-onDeterminingFilename) allows suggesting a filename after the file's MIME type and a tentative filename have been determined.
    
*   headers
    
    [HeaderNameValuePair](#type-HeaderNameValuePair)\[\] optional
    
    Extra HTTP headers to send with the request if the URL uses the HTTP\[s\] protocol. Each header is represented as a dictionary containing the keys `name` and either `value` or `binaryValue`, restricted to those allowed by XMLHttpRequest.
    
*   method
    
    [HttpMethod](#type-HttpMethod) optional
    
    The HTTP method to use if the URL uses the HTTP\[S\] protocol.
    
*   saveAs
    
    boolean optional
    
    Use a file-chooser to allow the user to select a filename regardless of whether `filename` is set or already exists.
    
*   url
    
    string
    
    The URL to download.
    

### DownloadQuery

#### Properties

*   bytesReceived
    
    number optional
    
    Number of bytes received so far from the host, without considering file compression.
    
*   danger
    
    [DangerType](#type-DangerType) optional
    
    Indication of whether this download is thought to be safe or known to be suspicious.
    
*   endTime
    
    string optional
    
    The time when the download ended in ISO 8601 format.
    
*   endedAfter
    
    string optional
    
    Limits results to [`DownloadItem`](#type-DownloadItem) that ended after the given ms in ISO 8601 format
    
*   endedBefore
    
    string optional
    
    Limits results to [`DownloadItem`](#type-DownloadItem) that ended before the given ms in ISO 8601 format.
    
*   error
    
    [InterruptReason](#type-InterruptReason) optional
    
    Why a download was interrupted.
    
*   exists
    
    boolean optional
    
    Whether the downloaded file exists;
    
*   fileSize
    
    number optional
    
    Number of bytes in the whole file post-decompression, or -1 if unknown.
    
*   filename
    
    string optional
    
    Absolute local path.
    
*   filenameRegex
    
    string optional
    
    Limits results to [`DownloadItem`](#type-DownloadItem) whose `filename` matches the given regular expression.
    
*   finalUrl
    
    string optional
    
    Chrome 54+
    
    The absolute URL that this download is being made from, after all redirects.
    
*   finalUrlRegex
    
    string optional
    
    Chrome 54+
    
    Limits results to [`DownloadItem`](#type-DownloadItem) whose `finalUrl` matches the given regular expression.
    
*   id
    
    number optional
    
    The `id` of the [`DownloadItem`](#type-DownloadItem) to query.
    
*   limit
    
    number optional
    
    The maximum number of matching [`DownloadItem`](#type-DownloadItem) returned. Defaults to 1000. Set to 0 in order to return all matching [`DownloadItem`](#type-DownloadItem). See [`search`](#method-search) for how to page through results.
    
*   mime
    
    string optional
    
    The file's MIME type.
    
*   orderBy
    
    string\[\] optional
    
    Set elements of this array to [`DownloadItem`](#type-DownloadItem) properties in order to sort search results. For example, setting `orderBy=['startTime']` sorts the [`DownloadItem`](#type-DownloadItem) by their start time in ascending order. To specify descending order, prefix with a hyphen: '-startTime'.
    
*   paused
    
    boolean optional
    
    True if the download has stopped reading data from the host, but kept the connection open.
    
*   query
    
    string\[\] optional
    
    This array of search terms limits results to [`DownloadItem`](#type-DownloadItem) whose `filename` or `url` or `finalUrl` contain all of the search terms that do not begin with a dash '-' and none of the search terms that do begin with a dash.
    
*   startTime
    
    string optional
    
    The time when the download began in ISO 8601 format.
    
*   startedAfter
    
    string optional
    
    Limits results to [`DownloadItem`](#type-DownloadItem) that started after the given ms in ISO 8601 format.
    
*   startedBefore
    
    string optional
    
    Limits results to [`DownloadItem`](#type-DownloadItem) that started before the given ms in ISO 8601 format.
    
*   state
    
    [State](#type-State) optional
    
    Indicates whether the download is progressing, interrupted, or complete.
    
*   totalBytes
    
    number optional
    
    Number of bytes in the whole file, without considering file compression, or -1 if unknown.
    
*   totalBytesGreater
    
    number optional
    
    Limits results to [`DownloadItem`](#type-DownloadItem) whose `totalBytes` is greater than the given integer.
    
*   totalBytesLess
    
    number optional
    
    Limits results to [`DownloadItem`](#type-DownloadItem) whose `totalBytes` is less than the given integer.
    
*   url
    
    string optional
    
    The absolute URL that this download initiated from, before any redirects.
    
*   urlRegex
    
    string optional
    
    Limits results to [`DownloadItem`](#type-DownloadItem) whose `url` matches the given regular expression.
    

### FilenameConflictAction

uniquify

To avoid duplication, the `filename` is changed to include a counter before the filename extension.

overwrite

The existing file will be overwritten with the new file.

prompt

The user will be prompted with a file chooser dialog.

#### Enum

"uniquify"  

"overwrite"  

"prompt"  

### FilenameSuggestion

#### Properties

*   conflictAction
    
    [FilenameConflictAction](#type-FilenameConflictAction) optional
    
    The action to take if `filename` already exists.
    
*   filename
    
    string
    
    The [`DownloadItem`](#type-DownloadItem)'s new target [`DownloadItem.filename`](#property-DownloadItem-filename), as a path relative to the user's default Downloads directory, possibly containing subdirectories. Absolute paths, empty paths, and paths containing back-references ".." will be ignored. `filename` is ignored if there are any [`onDeterminingFilename`](#event-onDeterminingFilename) listeners registered by any extensions.
    

### GetFileIconOptions

#### Properties

*   size
    
    number optional
    
    The size of the returned icon. The icon will be square with dimensions size \* size pixels. The default and largest size for the icon is 32x32 pixels. The only supported sizes are 16 and 32. It is an error to specify any other size.
    

### HeaderNameValuePair

#### Properties

*   name
    
    string
    
    Name of the HTTP header.
    
*   value
    
    string
    
    Value of the HTTP header.
    

### HttpMethod

#### Enum

"GET"  

"POST"  

### InterruptReason

#### Enum

"FILE\_FAILED"  

"FILE\_ACCESS\_DENIED"  

"FILE\_NO\_SPACE"  

"FILE\_NAME\_TOO\_LONG"  

"FILE\_TOO\_LARGE"  

"FILE\_VIRUS\_INFECTED"  

"FILE\_TRANSIENT\_ERROR"  

"FILE\_BLOCKED"  

"FILE\_SECURITY\_CHECK\_FAILED"  

"FILE\_TOO\_SHORT"  

"FILE\_HASH\_MISMATCH"  

"FILE\_SAME\_AS\_SOURCE"  

"NETWORK\_FAILED"  

"NETWORK\_TIMEOUT"  

"NETWORK\_DISCONNECTED"  

"NETWORK\_SERVER\_DOWN"  

"NETWORK\_INVALID\_REQUEST"  

"SERVER\_FAILED"  

"SERVER\_NO\_RANGE"  

"SERVER\_BAD\_CONTENT"  

"SERVER\_UNAUTHORIZED"  

"SERVER\_CERT\_PROBLEM"  

"SERVER\_FORBIDDEN"  

"SERVER\_UNREACHABLE"  

"SERVER\_CONTENT\_LENGTH\_MISMATCH"  

"SERVER\_CROSS\_ORIGIN\_REDIRECT"  

"USER\_CANCELED"  

"USER\_SHUTDOWN"  

"CRASH"  

### State

in\_progress

The download is currently receiving data from the server.

interrupted

An error broke the connection with the file host.

complete

The download completed successfully.

#### Enum

"in\_progress"  

"interrupted"  

"complete"  

### StringDelta

#### Properties

*   current
    
    string optional
    
*   previous
    
    string optional
    

### UiOptions

Chrome 105+

#### Properties

*   enabled
    
    boolean
    
    Enable or disable the download UI.
    

Methods
-------

### acceptDanger()

chrome.downloads.acceptDanger(  
  downloadId: number,  
): Promise<void>

Prompt the user to accept a dangerous download. Can only be called from a visible context (tab, window, or page/browser action popup). Does not automatically accept dangerous downloads. If the download is accepted, then an [`onChanged`](#event-onChanged) event will fire, otherwise nothing will happen. When all the data is fetched into a temporary file and either the download is not dangerous or the danger has been accepted, then the temporary file is renamed to the target filename, the `state` changes to 'complete', and [`onChanged`](#event-onChanged) fires.

#### Parameters

*   downloadId
    
    number
    
    The identifier for the [`DownloadItem`](#type-DownloadItem).
    

#### Returns

*   Promise<void>
    
    Chrome 96+
    
    Returns a Promise which resolves when the danger prompt dialog closes.
    

### cancel()

chrome.downloads.cancel(  
  downloadId: number,  
): Promise<void>

Cancel a download. When `callback` is run, the download is cancelled, completed, interrupted or doesn't exist anymore.

#### Parameters

*   downloadId
    
    number
    
    The id of the download to cancel.
    

#### Returns

*   Promise<void>
    
    Chrome 96+
    
    Returns a Promise which resolves when the cancel request is completed.
    

### download()

chrome.downloads.download(  
  options: [DownloadOptions](#type-DownloadOptions),  
): Promise<number>

Download a URL. If the URL uses the HTTP\[S\] protocol, then the request will include all cookies currently set for its hostname. If both `filename` and `saveAs` are specified, then the Save As dialog will be displayed, pre-populated with the specified `filename`. If the download started successfully, `callback` will be called with the new [`DownloadItem`](#type-DownloadItem)'s `downloadId`. If there was an error starting the download, then `callback` will be called with `downloadId=undefined` and [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/runtime/#property-lastError) will contain a descriptive string. The error strings are not guaranteed to remain backwards compatible between releases. Extensions must not parse it.

#### Parameters

*   options
    
    [DownloadOptions](#type-DownloadOptions)
    
    What to download and how.
    

#### Returns

*   Promise<number>
    
    Chrome 96+
    
    Returns a Promise which resolves with the id of the new [`DownloadItem`](#type-DownloadItem).
    

### erase()

chrome.downloads.erase(  
  query: [DownloadQuery](#type-DownloadQuery),  
): Promise<number\[\]>

Erase matching [`DownloadItem`](#type-DownloadItem) from history without deleting the downloaded file. An [`onErased`](#event-onErased) event will fire for each [`DownloadItem`](#type-DownloadItem) that matches `query`, then `callback` will be called.

#### Parameters

*   query
    
    [DownloadQuery](#type-DownloadQuery)
    

#### Returns

*   Promise<number\[\]>
    
    Chrome 96+
    

### getFileIcon()

chrome.downloads.getFileIcon(  
  downloadId: number,  
  options?: [GetFileIconOptions](#type-GetFileIconOptions),  
): Promise<string | undefined\>

Retrieve an icon for the specified download. For new downloads, file icons are available after the [`onCreated`](#event-onCreated) event has been received. The image returned by this function while a download is in progress may be different from the image returned after the download is complete. Icon retrieval is done by querying the underlying operating system or toolkit depending on the platform. The icon that is returned will therefore depend on a number of factors including state of the download, platform, registered file types and visual theme. If a file icon cannot be determined, [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/runtime/#property-lastError) will contain an error message.

#### Parameters

*   downloadId
    
    number
    
    The identifier for the download.
    
*   options
    
    [GetFileIconOptions](#type-GetFileIconOptions) optional
    

#### Returns

*   Promise<string | undefined>
    
    Chrome 96+
    
    Returns a Promise which resolves with a URL to an image that represents the download.
    

### open()

chrome.downloads.open(  
  downloadId: number,  
): Promise<void>

Opens the downloaded file now if the [`DownloadItem`](#type-DownloadItem) is complete; otherwise returns an error through [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/runtime/#property-lastError). This method requires the `"downloads.open"` permission in addition to the `"downloads"` permission. An [`onChanged`](#event-onChanged) event fires when the item is opened for the first time. This method can only be called in response to a user gesture.

#### Parameters

*   downloadId
    
    number
    
    The identifier for the downloaded file.
    

#### Returns

*   Promise<void>
    
    Chrome 123+
    

### pause()

chrome.downloads.pause(  
  downloadId: number,  
): Promise<void>

Pause the download. If the request was successful the download is in a paused state. Otherwise [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/runtime/#property-lastError) contains an error message. The request will fail if the download is not active.

#### Parameters

*   downloadId
    
    number
    
    The id of the download to pause.
    

#### Returns

*   Promise<void>
    
    Chrome 96+
    
    Returns a Promise which resolves when the pause request is completed.
    

### removeFile()

chrome.downloads.removeFile(  
  downloadId: number,  
): Promise<void>

Remove the downloaded file if it exists and the [`DownloadItem`](#type-DownloadItem) is complete; otherwise return an error through [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/runtime/#property-lastError).

#### Parameters

*   downloadId
    
    number
    

#### Returns

*   Promise<void>
    
    Chrome 96+
    

### resume()

chrome.downloads.resume(  
  downloadId: number,  
): Promise<void>

Resume a paused download. If the request was successful the download is in progress and unpaused. Otherwise [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/runtime/#property-lastError) contains an error message. The request will fail if the download is not active.

#### Parameters

*   downloadId
    
    number
    
    The id of the download to resume.
    

#### Returns

*   Promise<void>
    
    Chrome 96+
    
    Returns a Promise which resolves when the resume request is completed.
    

### search()

chrome.downloads.search(  
  query: [DownloadQuery](#type-DownloadQuery),  
): Promise<[DownloadItem](#type-DownloadItem)\[\]\>

Find [`DownloadItem`](#type-DownloadItem). Set `query` to the empty object to get all [`DownloadItem`](#type-DownloadItem). To get a specific [`DownloadItem`](#type-DownloadItem), set only the `id` field. To page through a large number of items, set `orderBy: ['-startTime']`, set `limit` to the number of items per page, and set `startedAfter` to the `startTime` of the last item from the last page.

#### Parameters

*   query
    
    [DownloadQuery](#type-DownloadQuery)
    

#### Returns

*   Promise<[DownloadItem](#type-DownloadItem)\[\]>
    
    Chrome 96+
    

### setShelfEnabled()

Deprecated since Chrome 117

chrome.downloads.setShelfEnabled(  
  enabled: boolean,  
): void

Use [`setUiOptions`](#method-setUiOptions) instead.

Enable or disable the gray shelf at the bottom of every window associated with the current browser profile. The shelf will be disabled as long as at least one extension has disabled it. Enabling the shelf while at least one other extension has disabled it will return an error through [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/runtime/#property-lastError). Requires the `"downloads.shelf"` permission in addition to the `"downloads"` permission.

#### Parameters

*   enabled
    
    boolean
    

### setUiOptions()

Chrome 105+

chrome.downloads.setUiOptions(  
  options: [UiOptions](#type-UiOptions),  
): Promise<void>

Change the download UI of every window associated with the current browser profile. As long as at least one extension has set [`UiOptions.enabled`](#property-UiOptions-enabled) to false, the download UI will be hidden. Setting [`UiOptions.enabled`](#property-UiOptions-enabled) to true while at least one other extension has disabled it will return an error through [`runtime.lastError`](https://developer.chrome.com/docs/extensions/reference/runtime/#property-lastError). Requires the `"downloads.ui"` permission in addition to the `"downloads"` permission.

#### Parameters

*   options
    
    [UiOptions](#type-UiOptions)
    
    Encapsulate a change to the download UI.
    

#### Returns

*   Promise<void>
    
    Returns a Promise which resolves when the UI update is completed.
    

### show()

chrome.downloads.show(  
  downloadId: number,  
): void

Show the downloaded file in its folder in a file manager.

#### Parameters

*   downloadId
    
    number
    
    The identifier for the downloaded file.
    

### showDefaultFolder()

chrome.downloads.showDefaultFolder(): void

Show the default Downloads folder in a file manager.

Events
------

### onChanged

chrome.downloads.onChanged.addListener(  
  callback: function,  
)

When any of a [`DownloadItem`](#type-DownloadItem)'s properties except `bytesReceived` and `estimatedEndTime` changes, this event fires with the `downloadId` and an object containing the properties that changed.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (downloadDelta: [DownloadDelta](#type-DownloadDelta)) => void
    
    *   downloadDelta
        
        [DownloadDelta](#type-DownloadDelta)
        
    

### onCreated

chrome.downloads.onCreated.addListener(  
  callback: function,  
)

This event fires with the [`DownloadItem`](#type-DownloadItem) object when a download begins.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (downloadItem: [DownloadItem](#type-DownloadItem)) => void
    
    *   downloadItem
        
        [DownloadItem](#type-DownloadItem)
        
    

### onDeterminingFilename

chrome.downloads.onDeterminingFilename.addListener(  
  callback: function,  
)

During the filename determination process, extensions will be given the opportunity to override the target [`DownloadItem.filename`](#property-DownloadItem-filename). Each extension may not register more than one listener for this event. Each listener must call `suggest` exactly once, either synchronously or asynchronously. If the listener calls `suggest` asynchronously, then it must return `true`. If the listener neither calls `suggest` synchronously nor returns `true`, then `suggest` will be called automatically. The [`DownloadItem`](#type-DownloadItem) will not complete until all listeners have called `suggest`. Listeners may call `suggest` without any arguments in order to allow the download to use `downloadItem.filename` for its filename, or pass a `suggestion` object to `suggest` in order to override the target filename. If more than one extension overrides the filename, then the last extension installed whose listener passes a `suggestion` object to `suggest` wins. In order to avoid confusion regarding which extension will win, users should not install extensions that may conflict. If the download is initiated by [`download`](#method-download) and the target filename is known before the MIME type and tentative filename have been determined, pass `filename` to [`download`](#method-download) instead.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (downloadItem: [DownloadItem](#type-DownloadItem), suggest: function) => void
    
    *   downloadItem
        
        [DownloadItem](#type-DownloadItem)
        
    *   suggest
        
        function
        
        The `suggest` parameter looks like:
        
        (suggestion?: [FilenameSuggestion](#type-FilenameSuggestion)) => void
        
        *   suggestion
            
            [FilenameSuggestion](#type-FilenameSuggestion) optional
            
        
    

### onErased

chrome.downloads.onErased.addListener(  
  callback: function,  
)

Fires with the `downloadId` when a download is erased from history.

#### Parameters

*   callback
    
    function
    
    The `callback` parameter looks like:
    
    (downloadId: number) => void
    
    *   downloadId
        
        number
        
    

Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2026-01-15 UTC.

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

\[\] {&#34;at&#34;: &#34;True&#34;, &#34;ga4&#34;: \[\], &#34;ga4p&#34;: \[\], &#34;gtm&#34;: \[{&#34;id&#34;: &#34;GTM-5QF3RT2&#34;, &#34;purpose&#34;: 0}\], &#34;parameters&#34;: {&#34;internalUser&#34;: &#34;False&#34;, &#34;language&#34;: {&#34;machineTranslated&#34;: &#34;False&#34;, &#34;requested&#34;: &#34;en&#34;, &#34;served&#34;: &#34;en&#34;}, &#34;pageType&#34;: &#34;article&#34;, &#34;projectName&#34;: &#34;API&#34;, &#34;signedIn&#34;: &#34;False&#34;, &#34;tenant&#34;: &#34;chrome&#34;, &#34;recommendations&#34;: {&#34;sourcePage&#34;: &#34;&#34;, &#34;sourceType&#34;: 0, &#34;sourceRank&#34;: 0, &#34;sourceIdenticalDescriptions&#34;: 0, &#34;sourceTitleWords&#34;: 0, &#34;sourceDescriptionWords&#34;: 0, &#34;experiment&#34;: &#34;&#34;}, &#34;experiment&#34;: {&#34;ids&#34;: &#34;&#34;}}} (function(d,e,v,s,i,t,E){d\['GoogleDevelopersObject'\]=i; t=e.createElement(v);t.async=1;t.src=s;E=e.getElementsByTagName(v)\[0\]; E.parentNode.insertBefore(t,E);})(window, document, 'script', 'https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/js/app\_loader.js', '\[53,"en",null,"/js/devsite\_app\_module.js","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome","https://chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\["/\_pwa/chrome/manifest.json","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/images/video-placeholder.svg","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/favicon.png","https://www.gstatic.com/devrel-devsite/prod/v5ecaab6967af5bdfffc1b93fe7d0ad58c271bf9f563243cec25f323a110134f0/chrome/images/lockup.svg","https://fonts.googleapis.com/css?family=Google+Sans:400,500|Roboto:400,400italic,500,500italic,700,700italic|Roboto+Mono:400,500,700&display=swap"\],1,null,\[1,6,8,12,14,17,21,25,50,52,63,70,75,76,80,87,91,92,93,97,98,100,101,102,103,104,105,107,108,109,110,112,113,117,118,120,122,124,125,126,127,129,130,131,132,133,134,135,136,138,140,141,147,148,149,151,152,156,157,158,159,161,163,164,168,169,170,179,180,182,183,186,191,193,196\],"AIzaSyCNm9YxQumEXwGJgTDjxoxXK6m1F-9720Q","AIzaSyCc76DZePGtoyUjqKrLdsMGk\_ry7sljLbY","developer.chrome.com","AIzaSyB9bqgQ2t11WJsOX8qNsCQ6U-w91mmqF-I","AIzaSyAdYnStPdzjcJJtQ0mvIaeaMKj7\_t6J\_Fg",null,null,null,\["Search\_\_enable\_dynamic\_content\_confidential\_banner","Profiles\_\_enable\_stripe\_subscription\_management","MiscFeatureFlags\_\_enable\_explicit\_template\_dependencies","MiscFeatureFlags\_\_developers\_footer\_image","Profiles\_\_enable\_profile\_collections","Experiments\_\_reqs\_query\_experiments","Profiles\_\_enable\_auto\_apply\_credits","MiscFeatureFlags\_\_enable\_firebase\_utm","MiscFeatureFlags\_\_enable\_appearance\_cookies","Profiles\_\_enable\_completequiz\_endpoint","MiscFeatureFlags\_\_enable\_llms\_txt","Profiles\_\_enable\_callout\_notifications","MiscFeatureFlags\_\_gdp\_dashboard\_reskin\_enabled","DevPro\_\_enable\_google\_one\_card","Cloud\_\_enable\_free\_trial\_server\_call","Profiles\_\_enable\_awarding\_url","OnSwitch\_\_enable","Profiles\_\_enable\_user\_type","BookNav\_\_enable\_tenant\_cache\_key","Profiles\_\_enable\_release\_notes\_notifications","DevPro\_\_enable\_vertex\_credit\_card","Concierge\_\_enable\_pushui","Cloud\_\_enable\_cloud\_dlp\_service","MiscFeatureFlags\_\_enable\_variable\_operator\_index\_yaml","Cloud\_\_enable\_cloud\_shell\_fte\_user\_flow","Profiles\_\_enable\_purchase\_prompts","Profiles\_\_enable\_developer\_profiles\_callout","Profiles\_\_enable\_developer\_profile\_pages\_as\_content","DevPro\_\_enable\_devpro\_offers","SignIn\_\_enable\_l1\_signup\_flow","MiscFeatureFlags\_\_emergency\_css","MiscFeatureFlags\_\_remove\_cross\_domain\_tracking\_params","Profiles\_\_enable\_developer\_profile\_benefits\_ui\_redesign","CloudShell\_\_cloud\_code\_overflow\_menu","Cloud\_\_enable\_llm\_concierge\_chat","MiscFeatureFlags\_\_enable\_framebox\_badge\_methods","MiscFeatureFlags\_\_enable\_project\_variables","DevPro\_\_enable\_payments\_first\_batch","DevPro\_\_enable\_embed\_profile\_creation","DevPro\_\_enable\_cloud\_innovators\_plus","Search\_\_enable\_ai\_search\_summaries\_for\_all","Profiles\_\_enable\_dashboard\_curated\_recommendations","Search\_\_enable\_suggestions\_from\_borg","Concierge\_\_enable\_actions\_menu","Concierge\_\_enable\_remove\_info\_panel\_tags","TpcFeatures\_\_enable\_unmirrored\_page\_left\_nav","DevPro\_\_enable\_code\_assist","Search\_\_enable\_page\_map","EngEduTelemetry\_\_enable\_engedu\_telemetry","TpcFeatures\_\_proxy\_prod\_host","DevPro\_\_remove\_eu\_tax\_intake\_form","Cloud\_\_enable\_cloudx\_experiment\_ids","MiscFeatureFlags\_\_enable\_view\_transitions","MiscFeatureFlags\_\_enable\_explain\_this\_code","Profiles\_\_enable\_completecodelab\_endpoint","Profiles\_\_enable\_join\_program\_group\_endpoint","Concierge\_\_enable\_devsite\_llm\_tools","Cloud\_\_enable\_cloud\_shell","DevPro\_\_enable\_firebase\_workspaces\_card","Cloud\_\_enable\_legacy\_calculator\_redirect","CloudShell\_\_cloud\_shell\_button","Profiles\_\_enable\_playlist\_community\_acl","Cloud\_\_fast\_free\_trial","Profiles\_\_enable\_recognition\_badges","Profiles\_\_enable\_complete\_playlist\_endpoint","Profiles\_\_enable\_page\_saving","DevPro\_\_enable\_nvidia\_credits\_card","DevPro\_\_enable\_free\_benefits","Cloud\_\_cache\_serialized\_dynamic\_content","Analytics\_\_enable\_clearcut\_logging","Search\_\_enable\_ai\_eligibility\_checks","DevPro\_\_enable\_developer\_subscriptions","MiscFeatureFlags\_\_enable\_variable\_operator","Profiles\_\_require\_profile\_eligibility\_for\_signin","DevPro\_\_enable\_enterprise","Profiles\_\_enable\_public\_developer\_profiles","MiscFeatureFlags\_\_developers\_footer\_dark\_image","DevPro\_\_enable\_google\_payments\_buyflow"\],null,null,"AIzaSyA58TaKli1DculwmAmbpzLVGuWc8eCQgQc","https://developerscontentserving-pa.googleapis.com","AIzaSyDWBU60w0P9hEkr29kkksYs8Z7gvZ8u\_wc","https://developerscontentsearch-pa.googleapis.com",2,4,null,"https://developerprofiles-pa.googleapis.com",\[53,"chrome","Chrome for Developers","developer.chrome.com",null,"chrome-dot-devsite-v2-prod-3p.appspot.com",null,null,\[null,null,null,null,null,null,null,null,null,null,null,\[1\],null,null,null,null,null,null,\[1\],null,null,null,null,\[1,null,1\],\[1,1,null,1,1\],null,null,null,null,null,\[1\]\],null,\[69,null,null,null,null,null,"/images/lockup.svg","/images/touchicon-180.png",null,null,null,1,1,null,null,null,null,null,null,null,null,2,null,null,null,"/images/lockup-dark-theme.svg",\[\]\],\[\],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,\[\[\],\[1,1\]\],\[\[null,null,null,null,null,\["GTM-5QF3RT2"\],null,null,null,null,null,\[\["GTM-5QF3RT2",1\]\],1\]\],null,4\],null,null,1,1,"https://developerscontentinsights-pa.googleapis.com","AIzaSyC11xEGtFhkmSh\_iF6l\_itbxnFz2GrIBOg","AIzaSyAXJ10nRF73mmdSDINgkCNX5bbd2KPcWm8","https://developers.googleapis.com",null,null,"AIzaSyCjP0KOnHfv8mwe38sfzZJMOnqE3HvrD4A"\]')

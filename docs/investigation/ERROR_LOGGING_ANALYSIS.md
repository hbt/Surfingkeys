# Error Logging and Tracking Investigation - SurfingKeys Chrome Extension

## 1. Overview

This analysis examines error handling, logging, and error tracking mechanisms in the SurfingKeys Chrome extension. The extension implements a **basic error handling system** with minimal centralized error tracking infrastructure.

---

## 2. Current Error Handling Mechanisms

### 2.1 Background Script Error Handling

#### **Location:** `/src/background/start.js` (primary), `/src/background/chrome.js`

**What Exists:**
- **Basic fetch error handling** in the `request()` function (line 6-27):
  ```javascript
  fetch(url, {...}).then(...).catch(exp => {
      onException && onException(exp);
  });
  ```
  - Callbacks for success and exception cases
  - Exception passed to optional callback

- **Message dispatching error handling** (line 538-546):
  ```javascript
  try {
      var result = handleMessage(message, sender, sendResponse);
      console.log('[CDP-BRIDGE] Dispatch complete');
      return responseData || result;
  } catch (error) {
      console.error('[CDP-BRIDGE] Error during dispatch:', error);
      return { error: error.message, action: action };
  }
  ```

- **Chrome runtime.lastError checking** (line 567-569):
  ```javascript
  if (chrome.runtime.lastError) {
      var error = chrome.runtime.lastError.message;
  }
  ```
  - Checked after storage operations
  - Error message extracted but rarely logged
  - Also found in `chrome.js` lines 23-24, 193-194

- **Promise rejection handling**:
  - Line 328: `p.catch((e) => {})` - Silent suppression of tab messaging errors
  - Line 1515: `.catch(exp => {...})` - Image processing error handling
  - Line 2043: `.catch((error) => {...})` - Native messaging error handling

- **Command execution** (line 400-444):
  - `chrome.commands.onCommand` listener with basic switch statement
  - No try-catch around individual command handlers
  - Basic logging: `console.log('[COMMAND RECEIVED]', command)`

**What's Missing:**
- No global error handler
- No error aggregation/collection
- Errors logged to console but not stored or reported
- Silent failures in some areas (promise.catch() without handling)
- No error rate tracking
- No error context preservation

---

### 2.2 Content Script Error Handling

#### **Location:** `/src/content_scripts/`

**What Exists:**

1. **Runtime error handling** in `common/runtime.js` (line 30-38):
   ```javascript
   try {
       args.needResponse = callback !== undefined;
       chrome.runtime.sendMessage(args, callback);
       if (action === 'read') {
           runtime.on('onTtsEvent', callback);
       }
   } catch (e) {
       dispatchSKEvent("front", ['showPopup', '[runtime exception] ' + e]);
   }
   ```
   - Catches message sending errors
   - Shows error in UI popup to user
   - User-facing error feedback

2. **User settings execution** in `content.js` (line 128-133):
   ```javascript
   var settings = {}, error = "";
   try {
       (new Function('settings', 'api', rs.snippets))(settings, api);
   } catch (e) {
       error = e.toString();
   }
   applyUserSettings({settings, error});
   ```
   - Dynamic code execution with try-catch
   - Error passed to settings handler
   - `applyUserSettings()` displays error to user

3. **Mode initialization** in `common/mode.js` (line 222-226):
   ```javascript
   try {
       init(cb);
   } catch (e) {
       console.log("Error on blank iframe loaded: " + e);
   }
   ```

4. **Insert mode error handling** in `common/insert.js` (line 21-23):
   ```javascript
   try {
       // Code
   } catch(err) {
       // Silent catch
   }
   ```

5. **Utility function error handling** in `common/utils.js` (line 666-680, 1047-1057):
   ```javascript
   try {
       // Various DOM operations
   } catch (e) {
       // Silent or minimal error handling
   }
   ```

**What's Missing:**
- No global `window.onerror` handler
- No `window.onunhandledrejection` handler
- No unhandled promise rejection catching at extension level
- Minimal context in error messages
- No error categorization
- Limited stack trace preservation

---

### 2.3 General Error Logging Infrastructure

#### **Location:** `/src/common/utils.js`

**LOG() Function** (line 1-9):
```javascript
function LOG(level, msg) {
    // To turn on all levels: chrome.storage.local.set({"logLevels": ["log", "warn", "error"]})
    chrome.storage.local.get(["logLevels"], (r) => {
        const logLevels = r && r.logLevels || ["error"];
        if (["log", "warn", "error"].indexOf(level) !== -1 && logLevels.indexOf(level) !== -1) {
            console[level](msg);
        }
    });
}
```

**Features:**
- Configurable log levels via storage
- Default: only "error" level enabled
- Can enable "log", "warn", "error" via: `chrome.storage.local.set({"logLevels": ["log", "warn", "error"]})`
- Routed to console methods

**Usage:** Primarily in `chrome.js` for Neovim connection errors (lines 200-211)

---

### 2.4 User-Facing Error Reporting

#### **Location:** `/src/content_scripts/common/utils.js`

**showPopup()** (line 278-279):
- Displays error messages in a UI popup
- Used for runtime errors
- User-visible feedback

**showBanner()** (line 265-266):
- Temporary banner messages
- Used for various notifications

**reportIssue()** (line 380-386):
```javascript
function reportIssue(title, description) {
    title = encodeURIComponent(title);
    description = "%23%23+Error+details%0A%0A{0}%0A%0ASurfingKeys%3A+{1}%0A%0AChrome%3A+{2}%0A%0AURL%3A+{3}%0A%0A%23%23+Context%0A%0A%2A%2APlease+replace+this+with+a+description+of+how+you+were+using+SurfingKeys.%2A%2A".format(
        encodeURIComponent(description), 
        chrome.runtime.getManifest().version, 
        encodeURIComponent(navigator.userAgent), 
        encodeURIComponent(window.location.href)
    );
    var error = '<h2>Uh-oh! The SurfingKeys extension encountered a bug.</h2> <p>Please click <a href="https://github.com/brookhong/Surfingkeys/issues/new?title={0}&body={1}" target=_blank>here</a> to start filing a new issue...'.format(title, description);
    showPopup(error);
}
```

**Capabilities:**
- Creates GitHub issue template
- Includes extension version
- Includes browser user agent
- Includes current URL
- Prompts user to provide context

---

### 2.5 LLM Module Error Handling

#### **Location:** `/src/background/llm.js`

**Promise-based error handling:**
- Line 273, 340, 412, 498: `.catch(error => console.error('Error:', error))`
- Line 308-326: Try-catch in chunk parsing with logging
- Line 383-412: Try-catch for line parsing with logging
- Line 463-498: Try-catch for JSON parsing
- Line 549-585: Multiple nested try-catch blocks for stream processing

**Error Types Handled:**
- Fetch errors
- Parse errors
- Stream errors
- Chunk parsing failures

**Pattern:** Log errors to console, continue or fail gracefully

---

### 2.6 Command Execution Error Handling

#### **Location:** `/src/background/start.js` and `/src/background/chrome.js`

**chrome.commands.onCommand listener** (start.js lines 400-444, chrome.js lines 138-178):
```javascript
chrome.commands.onCommand.addListener(function(command) {
    console.log('[COMMAND RECEIVED]', command);
    switch (command) {
        case 'restartext':
            console.log('[RESTARTEXT] Reloading extension...');
            chrome.tabs.query({}, function(tabs) {
                console.log('[RESTARTEXT] Reloading', tabs.length, 'tabs');
                tabs.forEach(function(tab) {
                    chrome.tabs.reload(tab.id);
                });
                chrome.runtime.reload();
            });
            break;
        // ... other cases
    }
});
```

**What's Present:**
- Logging of command receipt
- Switch statement dispatch
- Callback-based async operations

**What's Missing:**
- No error handling if chrome.tabs.query fails
- No validation of command handlers
- No try-catch around command execution
- Unhandled callback errors

---

## 3. Extension-Specific Error Hooks

### 3.1 What's Implemented

1. **chrome.runtime.onMessage** (common/runtime.js):
   - Main message passing with try-catch (limited)

2. **chrome.commands.onCommand** (background/chrome.js):
   - Command execution with basic logging

3. **chrome.tabs.onUpdated, onRemoved, onActivated**:
   - Tab event handlers without error wrapping
   - Callback-based without try-catch

4. **chrome.storage.local.get/set**:
   - Checked for `chrome.runtime.lastError` in some places
   - Not comprehensive

### 3.2 What's NOT Implemented

- **NO** `chrome.runtime.onError` handler
- **NO** Global exception handler at background/content script boundaries
- **NO** Promise rejection listener
- **NO** Service Worker error monitoring (Manifest V3)
- **NO** Cross-frame error propagation
- **NO** Error logging to remote service
- **NO** Error sampling/aggregation
- **NO** Source map support for debugging

---

## 4. Error Categorization

### Current Implicit Categories:

1. **Network Errors** (fetch failures)
   - Location: `start.js` request function
   - Handling: Exception callback

2. **Message Passing Errors**
   - Location: `runtime.js` RUNTIME function
   - Handling: Try-catch with user popup

3. **User Settings Errors** (dynamic code execution)
   - Location: `content.js` settings loading
   - Handling: Try-catch, error passed to applyUserSettings()

4. **API/Chrome Runtime Errors**
   - Location: Various chrome.* API calls
   - Handling: `chrome.runtime.lastError` checking (inconsistent)

5. **LLM/Stream Processing Errors**
   - Location: `llm.js`
   - Handling: Try-catch with console.error

6. **Frame/DOM Errors**
   - Location: `mode.js`, `utils.js`
   - Handling: Mostly silent catch blocks

---

## 5. Data Storage & Persistence

### Current State:
- **NO persistent error logs**
- **NO error database or history**
- **Errors only in browser console (transient)**
- **No retry mechanisms stored**
- **conf object** in background stores `interceptedErrors: []` but **never used**

---

## 6. Summary Table

| Aspect | Status | Details |
|--------|--------|---------|
| **Global Error Handler** | ❌ MISSING | No window.onerror, no unhandledrejection |
| **Background Script Errors** | ⚠️ PARTIAL | Try-catch in critical paths, but many unhandled |
| **Content Script Errors** | ⚠️ PARTIAL | Try-catch for user code, missing global handler |
| **Message Passing Errors** | ⚠️ PARTIAL | Handled for sendMessage, not all edge cases |
| **Command Errors** | ❌ MISSING | No try-catch around command handlers |
| **Promise Rejections** | ⚠️ PARTIAL | Some .catch(), many missing |
| **Error Logging** | ⚠️ BASIC | Console only, configurable levels via storage |
| **Error Persistence** | ❌ MISSING | No storage, history, or reporting |
| **Error Reporting** | ⚠️ BASIC | Manual GitHub issue template function |
| **Stack Traces** | ⚠️ PARTIAL | Preserved in some try-catch, lost in others |
| **Error Context** | ⚠️ LIMITED | URL, version sometimes included, rarely complete |
| **User Feedback** | ✅ GOOD | Popup messages for user-triggered errors |
| **Error Monitoring** | ❌ MISSING | No remote monitoring, no metrics |
| **Source Maps** | ❌ MISSING | Not configured for debugging |

---

## 7. Critical Gaps

### High Priority Issues:

1. **No global error handler** - Unhandled errors in frames/background may go completely unnoticed
2. **No unhandledrejection listener** - Promise rejections can silently fail
3. **Inconsistent error checking** - `chrome.runtime.lastError` not checked everywhere
4. **Silent failures** - Many `catch()` blocks with no action (`.catch((e) => {})`)
5. **No error persistence** - Can't diagnose issues after restart
6. **Unused configuration** - `conf.interceptedErrors` exists but never populated
7. **No service worker error monitoring** - MV3 service worker errors may be lost

### Medium Priority Issues:

1. **No retry mechanisms** - Failed operations don't retry
2. **Limited error context** - Errors lack state information
3. **No error categorization system** - Hard to identify error types
4. **No timeout handling** - Long-running operations can hang
5. **No error rate tracking** - Can't identify systematic issues

### Low Priority Issues:

1. **No remote error reporting** - Requires user action to report
2. **No error analytics** - Can't track trends
3. **No source maps** - Production code hard to debug
4. **No correlation IDs** - Can't trace errors across frames

---

## 8. Recommendations

### Immediate Actions (Week 1):

1. **Add global error handlers:**
   - `window.onerror` in content scripts
   - `globalThis.onerror` in background script
   - `window.addEventListener('unhandledrejection', ...)` in both

2. **Add service worker error monitoring (MV3):**
   ```javascript
   chrome.runtime.onError?.addListener((error) => {
       LOG("error", "Service Worker Error: " + error.message);
   });
   ```

3. **Implement error collector:**
   - Store recent errors in `conf.interceptedErrors`
   - Limit to last 50 errors
   - Include timestamp, context, stack trace

### Short Term (Month 1):

1. **Enhance error context:**
   - Include tab info, frame info, user settings state
   - Preserve stack traces completely
   - Add error categorization

2. **Implement error reporting UI:**
   - "Send Error Report" button in options page
   - Show recent errors with copy-to-clipboard
   - Allow error filtering/searching

3. **Add logging dashboard:**
   - View recent logs by level
   - Filter by component/module
   - Search by keyword

### Medium Term (Month 3):

1. **Error persistence:**
   - Store errors in IndexedDB for history
   - Rotate logs (keep last 1000 errors)
   - Export logs for debugging

2. **Improve error handling:**
   - Add retry logic for network operations
   - Implement timeout handling
   - Add circuit breakers for failing operations

3. **Error analytics:**
   - Track error frequencies
   - Identify patterns
   - Generate diagnostic reports

---

## 9. Files Requiring Changes

### Core Infrastructure:
- `/src/background/start.js` - Global error handler
- `/src/background/chrome.js` - MV3 error monitoring
- `/src/content_scripts/start.js` - Global content script errors
- `/src/common/utils.js` - Enhanced LOG function
- `/src/content_scripts/common/runtime.js` - Better error context

### New Files to Create:
- `/src/common/errorCollector.js` - Centralized error collection
- `/src/common/errorReporter.js` - Error reporting functionality
- `/src/content_scripts/errorHandler.js` - Content script error handling

### Configuration:
- Update `conf` object to track error limits
- Add storage schema for error persistence

---

## 10. Example Implementation

### Global Background Error Handler:
```javascript
// Add to /src/background/start.js
const ErrorCollector = {
    errors: [],
    maxErrors: 50,
    
    captureError(type, error, context = {}) {
        const errorObj = {
            type,
            message: error?.message || String(error),
            stack: error?.stack,
            timestamp: Date.now(),
            url: context.url,
            tabId: context.tabId,
            frameId: context.frameId,
            ...context
        };
        
        this.errors.unshift(errorObj);
        if (this.errors.length > this.maxErrors) {
            this.errors.pop();
        }
        
        LOG("error", `[${type}] ${errorObj.message}`);
        chrome.storage.local.set({ lastErrors: this.errors });
    }
};

// Global error handler
chrome.runtime.onError?.addListener((error) => {
    ErrorCollector.captureError('SERVICE_WORKER_ERROR', error);
});

// Wrap all message handlers
const originalHandleMessage = handleMessage;
function handleMessage(message, sender, sendResponse) {
    try {
        return originalHandleMessage(message, sender, sendResponse);
    } catch (error) {
        ErrorCollector.captureError('MESSAGE_HANDLER_ERROR', error, {
            action: message.action,
            senderUrl: sender.url,
            tabId: sender.tab?.id
        });
        sendResponse({ error: error.message });
    }
}
```

---

**End of Analysis**

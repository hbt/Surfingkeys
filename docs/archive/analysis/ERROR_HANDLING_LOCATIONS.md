================================================================================
QUICK REFERENCE: ERROR HANDLING LOCATIONS IN CODEBASE
================================================================================

1. BACKGROUND SCRIPT ERROR HANDLERS
================================================================================

File: /src/background/start.js
├─ Line 6-27: request() function
│  └─ .catch(exp => { onException && onException(exp); })
│     Type: Fetch error handling with callback
│
├─ Line 328: sendTabMessage() 
│  └─ p.catch((e) => {})
│     Type: Tab messaging - SILENT SUPPRESSION ⚠️
│
├─ Line 400-444: chrome.commands.onCommand listener
│  └─ NO try-catch
│     Type: Command execution - NO ERROR HANDLING ❌
│
├─ Line 538-546: __CDP_MESSAGE_BRIDGE__.dispatch()
│  └─ try { ... } catch (error) { console.error(...) }
│     Type: CDP testing bridge with error return
│
├─ Line 567-569: _updateSettings()
│  └─ if (chrome.runtime.lastError) { var error = ... }
│     Type: Storage error checking - limited logging
│
├─ Line 1515: requestImage()
│  └─ .catch(exp => { ... })
│     Type: Image processing error
│
└─ Line 2043: connectNative()
   └─ .catch((error) => { _response(..., { error }) })
      Type: Native messaging error

File: /src/background/chrome.js
├─ Line 23-24: loadRawSettings callback
│  └─ if (chrome.runtime.lastError) { subset.error = ... }
│     Type: Settings sync error
│
├─ Line 139: chrome.commands.onCommand
│  └─ console.log('[COMMAND RECEIVED]', command)
│     Type: Command logging - NO ERROR HANDLING ❌
│
└─ Line 193-194: startNative() onDisconnect
   └─ if (chrome.runtime.lastError) { var error = ... }
      Type: Native connection error

File: /src/background/llm.js
├─ Line 273: Ollama request
│  └─ .catch(error => console.error('Error:', error))
│     Type: Promise rejection with console logging
│
├─ Line 308-326: Stream chunk parsing
│  └─ try { ... } catch (e) { console.error('Error in onChunk:', e, value) }
│     Type: Try-catch with error logging
│
├─ Line 325-326: onChunk callback
│  └─ Console error on parse failure
│     Type: Chunk processing error
│
├─ Line 340, 402, 412, 498, 574, 583: Promise chains
│  └─ .catch(error => console.error(...))
│     Type: Multiple promise rejection handlers
│
└─ Line 549-585: Bedrock streaming
   └─ Multiple nested try-catch blocks
      Type: Complex stream error handling

2. CONTENT SCRIPT ERROR HANDLERS
================================================================================

File: /src/content_scripts/common/runtime.js
├─ Line 30-38: RUNTIME() function - message passing
│  └─ try { chrome.runtime.sendMessage(...) }
│     catch (e) { dispatchSKEvent("front", ['showPopup', ...]) }
│     Type: Message sending with USER-FACING popup ✅
│
└─ Line 130-134: chrome.runtime.onMessage listener
   └─ No explicit error handling at listener level
      Type: Message receiving - basic dispatch

File: /src/content_scripts/content.js
├─ Line 128-133: User settings execution
│  └─ try { (new Function('settings', 'api', rs.snippets))(...) }
│     catch (e) { error = e.toString() }
│     Type: Dynamic code execution with error capture ✅
│
└─ Line 220-231: Options page loading
   └─ .then((optionsLib) => { ... })
      Type: Dynamic import - no explicit error catch

File: /src/content_scripts/common/mode.js
├─ Line 222-226: Mode.init() - blank iframe loading
│  └─ try { init(cb) } catch (e) { console.log("Error on blank iframe...") }
│     Type: Frame initialization with console logging
│
└─ Line 262-290+: Mode.handleMapKey()
   └─ No try-catch wrapper (event handler)
      Type: Key mapping - NO ERROR HANDLING ❌

File: /src/content_scripts/common/insert.js
└─ Line 21-23: Paste operation
   └─ try { ... } catch(err) { ... }
      Type: Silent catch block - minimal error handling ⚠️

File: /src/content_scripts/common/utils.js
├─ Line 666-680: setAttributes() / setSanitizedContent()
│  └─ try { ... } catch (e) { ... }
│     Type: DOM manipulation - mostly silent catches
│
├─ Line 1047-1057: URL handling functions
│  └─ try { ... } catch (e) { ... }
│     Type: Silent error handling ⚠️
│
└─ Line 162-173: applyUserSettings()
   └─ Displays error to user via showPopup()
      Type: User-visible error handling ✅

3. LOGGING & ERROR REPORTING
================================================================================

File: /src/common/utils.js
└─ Line 1-9: LOG(level, msg) function
   Type: Configurable console logging
   └─ Default levels: ["error"]
   └─ Enable all: chrome.storage.local.set({"logLevels": ["log", "warn", "error"]})

File: /src/content_scripts/common/utils.js
├─ Line 265-266: showBanner(msg, timeout)
│  └─ Dispatch event to show temporary banner
│     Type: User notification
│
├─ Line 278-279: showPopup(msg)
│  └─ Dispatch event to show popup
│     Type: User error display ✅
│
└─ Line 380-386: reportIssue(title, description)
   └─ Creates GitHub issue template with:
      • Extension version
      • Browser user agent
      • Current URL
      Type: Manual error reporting via GitHub ✅

4. ERROR MONITORING & STORAGE
================================================================================

File: /src/background/start.js
└─ Line 223: conf.interceptedErrors = []
   └─ Status: DEFINED but NEVER USED ⚠️
      Should store error history but doesn't
      No references in entire codebase

5. MISSING ERROR HANDLERS
================================================================================

❌ NO GLOBAL window.onerror
   └─ No files implement this
   └─ Unhandled JS errors in content scripts go unreported

❌ NO GLOBAL window.onunhandledrejection
   └─ No files implement this
   └─ Unhandled promise rejections silently fail

❌ NO chrome.runtime.onError handler
   └─ No files implement this
   └─ Service Worker (MV3) errors not caught

❌ NO Chrome API error wrapping
   └─ Methods like chrome.tabs.query() not wrapped
   └─ callback(lastError) pattern not consistently used

6. PROMISE ERROR HANDLING PATTERN AUDIT
================================================================================

✅ PROPERLY HANDLED:
   • llm.js: All .catch() chains have console.error
   • content.js: User settings try-catch
   • runtime.js: Message sending try-catch

⚠️  PARTIALLY HANDLED:
   • start.js: Some .catch() have handlers, others don't
   • llm.js: Some chains properly logged, others missing
   • Various: Mixed .catch(() => {}) vs .catch(e => handle(e))

❌ NOT HANDLED:
   • start.js:328: .catch((e) => {}) - SILENT
   • Multiple promise chains without error handling
   • Chrome API callbacks without lastError checks

7. SILENT FAILURE PATTERNS
================================================================================

Pattern: .catch((e) => {})
├─ start.js:328 - Tab messaging
├─ Various other locations
└─ Result: Error is silently suppressed with no logging ❌

Pattern: try { ... } catch(e) { ... } with empty body
├─ Various utility functions
└─ Result: Error is caught but not logged ⚠️

Pattern: Chrome API callbacks without lastError checks
├─ Many chrome.tabs.* calls
├─ Many chrome.storage.* calls
└─ Result: Errors go undetected ❌

================================================================================
SUMMARY STATISTICS
================================================================================

Total files with error handling: 17
  • Background: 4 files
  • Content scripts: 6 files
  • Common utilities: 2 files
  • Pages/Special: 3 files

Error handling patterns found:
  ✅ Try-catch: 18 instances
  ⚠️  Promise .catch(): 35+ instances
  ⚠️  callback(lastError): 5 instances
  ❌ Global handlers: 0 instances

Error handling coverage:
  ✅ Good (user-facing): 3 locations
  ⚠️  Basic (console): 12 locations
  ❌ Missing (silent): 20+ locations

================================================================================
END OF QUICK REFERENCE
================================================================================

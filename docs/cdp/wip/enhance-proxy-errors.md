# CDP Proxy Enhancement: Error & Event Subscription POC

**Status**: Work in Progress (POC Testing)
**Date**: 2026-01-21
**Branch**: Exploring hybrid event capture + background logging

---

## 1. Problem Statement

### 1.1 Current Limitation

The CDP proxy is **stateless** - it forwards one request, gets one response, sends it back. No context about what happens *after* the response.

**Issue**: Asynchronous errors and events are missed.

```
Client                  Proxy                   CDP
  |                       |                       |
  |--request-+----------->|                       |
  |          (code)       |---code-+------------->|
  |                       |        |               |
  |                       |        |<--response----|
  |<--response-+----------|        |
  |                       |        |
  |                       |        |<--event-------| ← Missed!
  |                       |        | (setTimeout error)
```

**Examples that fail:**
- `setTimeout(() => { throw Error() }, 100)` - error happens later
- `console.log()` events - arrive after response completes
- `Promise.reject()` - rejection event streams separately
- Unhandled promise rejections - captured as events, not in response

### 1.2 Why It Matters

**For coding agents:**
- Can't verify if code executed successfully (errors happen in background)
- Can't collect console output reliably
- Can't debug long-running operations

---

## 2. Solution: Hybrid Event Capture + Background Logging

### 2.1 Design Overview

**Hybrid approach combines two strategies:**

1. **Marker-Based (Immediate)**: Wrap code in function, capture sync response + sync events within a time window
2. **Background Logging (Deferred)**: Enable optional event logging to file, agent polls later when ready

### 2.2 Flow Diagram

```
REQUEST (with optional enableLogging flag)
  ↓
[CDP Proxy]
  ├─ Subscribe to Runtime.enable
  ├─ Send wrapped/original code
  ├─ Collect sync events (300ms window)
  └─ Start background file logging (if enabled)
  ↓
IMMEDIATE RESPONSE
  {
    "result": {...},
    "requestId": "uuid",
    "events": [...],           // sync events captured
    "_logging": {              // if enabled
      "logFile": "/tmp/...",
      "pollUrl": "/events/uuid"
    }
  }
  ↓
BACKGROUND (if logging enabled)
  Events → /tmp/cdp-event-logs/{uuid}.jsonl
  ↓
POLLING (when ready)
  GET /events/{uuid}
  Returns accumulated events
```

### 2.3 Sequence Diagram

```
Client                  Proxy                   CDP
  |                       |                       |
  |--request-+----------->|                       |
  | uuid,    |             |---Runtime.enable---->|
  | code,    |             |<--enabled----------|
  | logging  |             |
  |          |             |---Runtime.evaluate-->|
  |          |             |<--response---------|  [Response arrives]
  |          |
  |<--response-+----------|  [Immediate return]
  |  {result, |
  |   uuid,   |             |<--event---|
  |   logFile |             |  Runtime.consoleAPICalled
  |  }        |             |  [logged to file]
  |          |             |
  |          |             |<--event---|
  |          |             |  Runtime.exceptionThrown
  |          |             |  [logged to file]
  |
  [Later, when ready]
  |--GET /events/{uuid}--->|
  |<--{events}-----------|
```

---

## 3. Test Summary: 15 Tests (8 Pass, 7 Fail)

### 3.1 Passing Tests (✅)

| # | Test | Status | Description |
|---|------|--------|-------------|
| 1 | SYNC ERROR - Error in exceptionDetails | ✅ PASS | Thrown errors available in response.result.exceptionDetails |
| 3 | SCOPE - window object accessible | ✅ PASS | `window` object not undefined inside wrapper |
| 4 | SCOPE - document object accessible | ✅ PASS | `document` object not undefined inside wrapper |
| 5 | SCOPE - closure variable access | ✅ PASS | Local variables and closures work correctly in wrapper |
| 8 | LOGGING - request ID returned | ✅ PASS | Proxy returns unique UUID for later polling |
| 9 | LOGGING - log file path provided | ✅ PASS | Response includes path to background event log |
| 13 | CLEANUP - log file removed after clear | ✅ PASS | DELETE endpoint successfully removes log file |
| 14 | SCOPE - module pattern works | ✅ PASS | Module-like IIFE patterns preserve state/closure |

### 3.2 Failing Tests (❌) with Root Cause Analysis

| # | Test | Status | Root Cause | Details |
|---|------|--------|-----------|---------|
| 2 | SYNC ERROR - Error message preserved | ❌ FAIL | Object serialization | Exception object returned as `[object Object]` instead of structured `exceptionDetails`; `returnByValue: true` converts to object form |
| 6 | CONSOLE - code executed after console.log | ❌ FAIL | Wrapper returns Promise | Wrapped code returns Promise object instead of actual value; async wrapper breaks return value |
| 7 | CONSOLE - console event captured | ❌ FAIL | Event timing | `Runtime.consoleAPICalled` events fire AFTER response completes; 300ms window insufficient |
| 10 | LOGGING - log file exists | ❌ FAIL | Event subscription failed | Background logging code path never triggered; `/tmp/cdp-event-logs/` file never created |
| 11 | LOGGING - background events logged | ❌ FAIL | Event handler not called | setTimeout error should trigger `Runtime.exceptionThrown` but event never reached handler |
| 12 | CLEANUP - events cleared | ❌ FAIL | Cascading from #10 | Tried to clear log file that was never created due to subscription failure |
| 15 | ASYNC - Promise rejection captured | ❌ FAIL | Object serialization | Promise rejection returned as `[object Object]` instead of structured exception details |

### 3.3 Failure Categories

**Object Serialization (Tests 2, 15)**
- When `returnByValue: true` is used, exception objects become `[object Object]`
- Need to either: extract specific fields or use different CDP method

**Async/Event Timing (Tests 6, 7)**
- Wrapper returning Promise instead of actual value
- Events arriving after response completes
- Need longer wait window or stream-based approach

**Background Logging (Tests 10, 11, 12)**
- Event subscription/handler not working
- Events not reaching background logger
- Need to debug event flow in proxy

---

## 4. Reproducible Test Cases

### 4.1 Setup: Start POC Proxy

```bash
# Start the hybrid POC proxy on port 9625
node /tmp/proxy-hybrid-poc.js &
sleep 2

# Verify it's running
curl -s http://127.0.0.1:9625/events/test || echo "Ready"
```

### 4.2 Test 1: SYNC ERROR - Error in exceptionDetails

**Expected**: Error captured in response.result.exceptionDetails
**Status**: ✅ PASS

```javascript
const http = require('http');
const WebSocket = require('ws');

// Get target ID first
http.get('http://127.0.0.1:9222/json', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const targets = JSON.parse(body);
    const target = targets.find(t => t.url?.includes('options.html') && t.type === 'page');

    const ws = new WebSocket('ws://127.0.0.1:9625');

    ws.on('open', () => {
      ws.send(JSON.stringify({
        targetId: target.id,
        method: 'Runtime.evaluate',
        params: {
          expression: 'throw new Error("Sync test error")',
          returnByValue: true
        },
        wrapInPromise: false
      }));
    });

    ws.on('message', (data) => {
      const resp = JSON.parse(data);
      console.log('✓ Error captured:', resp.result.exceptionDetails?.text);
      console.log('  Exception:', resp.result.exception?.description?.substring(0, 50));
      ws.close();
      process.exit(0);
    });
  });
});
```

### 4.3 Test 3: SCOPE - window object accessible

**Expected**: window object returns "window ok"
**Status**: ✅ PASS

```javascript
const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:9222/json', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const targets = JSON.parse(body);
    const target = targets.find(t => t.url?.includes('options.html') && t.type === 'page');

    const ws = new WebSocket('ws://127.0.0.1:9625');

    ws.on('open', () => {
      ws.send(JSON.stringify({
        targetId: target.id,
        method: 'Runtime.evaluate',
        params: {
          expression: 'typeof window !== "undefined" ? "window ok" : "window missing"',
          returnByValue: true
        },
        wrapInPromise: true
      }));
    });

    ws.on('message', (data) => {
      const resp = JSON.parse(data);
      const result = resp.result.result.value;
      console.log(`✓ Scope test result: ${result}`);
      console.log(`  Test ${result === 'window ok' ? 'PASSED' : 'FAILED'}`);
      ws.close();
      process.exit(0);
    });
  });
});
```

### 4.4 Test 5: SCOPE - closure variable access

**Expected**: Closure arithmetic returns 50
**Status**: ✅ PASS

```javascript
const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:9222/json', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const targets = JSON.parse(body);
    const target = targets.find(t => t.url?.includes('options.html') && t.type === 'page');

    const ws = new WebSocket('ws://127.0.0.1:9625');

    ws.on('open', () => {
      ws.send(JSON.stringify({
        targetId: target.id,
        method: 'Runtime.evaluate',
        params: {
          expression: `
            (function() {
              const x = 42;
              return x + 8;
            })()
          `,
          returnByValue: true
        },
        wrapInPromise: true
      }));
    });

    ws.on('message', (data) => {
      const resp = JSON.parse(data);
      const result = resp.result.result.value;
      console.log(`✓ Closure result: ${result}`);
      console.log(`  Test ${result === 50 ? 'PASSED' : 'FAILED'}`);
      ws.close();
      process.exit(0);
    });
  });
});
```

### 4.5 Test 7: CONSOLE - console event captured (FAILING)

**Expected**: Runtime.consoleAPICalled event in response
**Status**: ❌ FAIL (events arrive after response)

```javascript
const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:9222/json', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const targets = JSON.parse(body);
    const target = targets.find(t => t.url?.includes('options.html') && t.type === 'page');

    const ws = new WebSocket('ws://127.0.0.1:9625');

    ws.on('open', () => {
      ws.send(JSON.stringify({
        targetId: target.id,
        method: 'Runtime.evaluate',
        params: {
          expression: `
            console.log("Test log message");
            "console ok"
          `,
          returnByValue: true
        },
        wrapInPromise: true
      }));
    });

    ws.on('message', (data) => {
      const resp = JSON.parse(data);
      console.log(`Code executed: ${resp.result.result.value}`);
      const hasConsoleEvent = resp.events?.some(e => e.method === 'Runtime.consoleAPICalled');
      console.log(`✗ Console event captured: ${hasConsoleEvent ? 'YES' : 'NO (FAIL)'}`);
      console.log(`  Sync events collected: ${resp._meta.eventCount}`);
      console.log(`  ROOT CAUSE: Events fire AFTER response, 300ms window too short`);
      ws.close();
      process.exit(0);
    });
  });
});
```

### 4.6 Test 8: LOGGING - request ID returned

**Expected**: Response includes unique requestId
**Status**: ✅ PASS

```javascript
const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:9222/json', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const targets = JSON.parse(body);
    const target = targets.find(t => t.url?.includes('options.html') && t.type === 'page');

    const ws = new WebSocket('ws://127.0.0.1:9625');
    const testRequestId = 'test-' + Date.now();

    ws.on('open', () => {
      ws.send(JSON.stringify({
        targetId: target.id,
        method: 'Runtime.evaluate',
        params: { expression: '"ok"', returnByValue: true },
        requestId: testRequestId,
        enableLogging: true
      }));
    });

    ws.on('message', (data) => {
      const resp = JSON.parse(data);
      console.log(`✓ Request ID returned: ${resp.requestId}`);
      console.log(`  Test ${resp.requestId === testRequestId ? 'PASSED' : 'FAILED'}`);
      console.log(`  Log file: ${resp._logging?.logFile}`);
      ws.close();
      process.exit(0);
    });
  });
});
```

### 4.7 Test 10: LOGGING - log file exists (FAILING)

**Expected**: Log file created at path provided in response
**Status**: ❌ FAIL (background logging not triggered)

```javascript
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

http.get('http://127.0.0.1:9222/json', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const targets = JSON.parse(body);
    const target = targets.find(t => t.url?.includes('options.html') && t.type === 'page');

    const ws = new WebSocket('ws://127.0.0.1:9625');
    const testRequestId = 'test-logging-' + Date.now();

    ws.on('open', () => {
      ws.send(JSON.stringify({
        targetId: target.id,
        method: 'Runtime.evaluate',
        params: {
          expression: `
            setTimeout(() => {
              throw new Error("Async error - should be logged");
            }, 100);
            "scheduled"
          `,
          returnByValue: true
        },
        requestId: testRequestId,
        enableLogging: true,
        wrapInPromise: false
      }));
    });

    ws.on('message', (data) => {
      const resp = JSON.parse(data);
      console.log(`Request ID: ${resp.requestId}`);
      console.log(`Log file path: ${resp._logging?.logFile}`);

      // Wait for background error to occur
      setTimeout(() => {
        const logFile = resp._logging?.logFile;
        const exists = logFile && fs.existsSync(logFile);
        console.log(`✗ Log file exists: ${exists ? 'YES' : 'NO (FAIL)'}`);

        if (exists) {
          const content = fs.readFileSync(logFile, 'utf8');
          console.log(`  Log content lines: ${content.split('\n').length}`);
        } else {
          console.log(`  ROOT CAUSE: Event handler not triggered; events never reached background logger`);
        }

        ws.close();
        process.exit(0);
      }, 300);
    });
  });
});
```

### 4.8 Test 14: SCOPE - module pattern works

**Expected**: Module IIFE returns 1 (state incremented)
**Status**: ✅ PASS

```javascript
const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:9222/json', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const targets = JSON.parse(body);
    const target = targets.find(t => t.url?.includes('options.html') && t.type === 'page');

    const ws = new WebSocket('ws://127.0.0.1:9625');

    ws.on('open', () => {
      ws.send(JSON.stringify({
        targetId: target.id,
        method: 'Runtime.evaluate',
        params: {
          expression: `
            (function(global) {
              const state = { count: 0 };
              state.count++;
              return state.count;
            })(window)
          `,
          returnByValue: true
        },
        wrapInPromise: true
      }));
    });

    ws.on('message', (data) => {
      const resp = JSON.parse(data);
      const result = resp.result.result.value;
      console.log(`✓ Module pattern result: ${result}`);
      console.log(`  Test ${result === 1 ? 'PASSED' : 'FAILED'}`);
      ws.close();
      process.exit(0);
    });
  });
});
```

---

## 5. Key Findings & Recommendations

### 5.1 What Works ✅

- **Scope is preserved**: Wrapper doesn't break access to window, document, closures, or module patterns
- **Sync errors captured**: exceptionDetails available in response immediately
- **Request ID system**: UUID tracking works for polling
- **File-based logging infrastructure**: Path creation and cleanup works

### 5.2 What Needs Fixing ❌

1. **Object serialization**: Exception objects becoming `[object Object]`
   - Solution: Extract text from exceptionDetails or use different CDP flags

2. **Event timing**: Events arrive after response completes
   - Solution: Longer collection window OR stream events separately

3. **Background logging**: Event handler not receiving CDP events
   - Solution: Debug event subscription setup or use different event types

### 5.3 Next Steps

1. Fix event handler subscription (debug #10, #11)
2. Extend collection window to 500-1000ms for async events
3. Handle object serialization for exception details
4. Integrate into actual proxy-start.js
5. Add optional `--with-logging` flag to proxy command


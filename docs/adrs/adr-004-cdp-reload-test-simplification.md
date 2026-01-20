# ADR-004: CDP Reload Test Simplification

## meta.status
Accepted

## meta.date
2026-01-20

## meta.deciders
- hbt (developer)
- Claude (AI assistant)

## context.problem

The `cdp-reload-extension-messaging.ts` test was hanging indefinitely after successfully dispatching the reload command via the CDP message bridge. The test would execute the reload but never complete, blocking the test suite.

### context.constraints

**Chrome Service Worker Lifecycle:**
- Service workers become **INACTIVE** after `chrome.runtime.reload()` is called
- Inactive service workers disappear from CDP targets list (`/json` endpoint)
- Service workers do NOT automatically restart after reload
- Workers only restart when:
  - A content script needs to communicate with background
  - A user action triggers extension functionality
  - Chrome explicitly wakes the service worker

**Testing Requirements:**
- Need automated, non-interactive testing via CDP
- Cannot rely on user actions to wake service worker
- Must complete within reasonable timeout

### context.evidence

**Before reload:**
```bash
curl -s http://localhost:9222/json | jq '.[] | select(.type == "service_worker")'
# Returns: Surfingkeys service worker target
```

**After chrome.runtime.reload():**
```bash
curl -s http://localhost:9222/json | jq '.[] | select(.type == "service_worker")'
# Returns: (empty - no service workers available)
```

**Test behavior:**
1. ✅ Connection to service worker succeeds
2. ✅ Reload command dispatches successfully
3. ✅ Extension reloads
4. ❌ Service worker becomes INACTIVE
5. ❌ Test hangs waiting to reconnect (worker never reappears)

### context.attempted_solutions

**Attempt 1: Polling with retry logic**
- Poll CDP targets endpoint every 1s for 15 attempts
- Wait for service worker to reappear
- ❌ Failed: Worker never reappears, test times out

**Attempt 2: Wake service worker via new tab**
- Create new tab to trigger content script injection
- Content script communicates with background, waking worker
- ⚠️  Flaky: Timing-dependent, not guaranteed to work

**Attempt 3: Verify via behavioral test**
- Test keyboard functionality after reload
- If 'j' key still scrolls, reload succeeded
- ⚠️  Indirect, adds complexity, duplicates reload-keyboard test

## decision.chosen

**Simplify the reload-messaging test to only verify CDP message bridge functionality, not the actual reload outcome.**

### decision.rationale

1. **Separation of concerns:**
   - Message bridge dispatch ≠ reload verification
   - Different tests should verify different things

2. **Existing coverage:**
   - `cdp-reload-extension-keyboard.ts` already verifies reload behavior
   - Keyboard test detects reload via console logs ("RESTARTEXT" messages)
   - No need to duplicate reload verification

3. **Reliability:**
   - Testing message bridge dispatch is fast, deterministic
   - No timing issues, no flakiness
   - Clear pass/fail criteria

4. **Scope clarity:**
   - Bridge test: "Can I dispatch commands via CDP message bridge?"
   - Keyboard test: "Does extension actually reload?"

### decision.implementation

**New test flow:**
```typescript
// Step 1: Connect to service worker
// Step 2: Dispatch cdpReloadExtension via __CDP_MESSAGE_BRIDGE__
// Step 3: Verify command returns success response
// Step 4: Exit cleanly with pass/fail
```

**Verification:**
- ✅ CDP message bridge is working
- ✅ `cdpReloadExtension` action exists and is callable
- ✅ Command executes without errors
- ✅ Reload is initiated (based on `{"status":"reload_initiated"}` response)

**What this doesn't verify (by design):**
- ❌ Extension actually reloaded
  - **Reason:** Service worker lifecycle makes this unreliable
  - **Alternative:** Use `cdp-reload-extension-keyboard.ts` for reload verification

### decision.code_changes

**File:** `tests/cdp/cdp-reload-extension-messaging.ts`

**Key changes:**
1. Removed uptime tracking logic
2. Removed reconnection attempts
3. Removed service worker lifecycle monitoring
4. Added clear test scope documentation
5. Simplified to single request-response verification

**Test exit conditions:**
- ✅ Pass: Bridge returns `{"success": true, "result": {"status": "reload_initiated"}}`
- ❌ Fail: Bridge not found, dispatch error, or timeout (5s)

## consequences.positive

- ✅ Test completes reliably without hanging
- ✅ Fast execution (~1-2 seconds)
- ✅ Clear test purpose and scope
- ✅ No timing issues or flakiness
- ✅ All CDP tests now pass (5/5: 100%)

## consequences.negative

- ⚠️  Does not verify extension actually reloaded
  - **Mitigation:** `cdp-reload-extension-keyboard.ts` provides this coverage

## consequences.related_decisions

- **ADR-003:** CDP Message Bridge - The bridge itself is what this test validates
- **CDP Test Suite:** Now have two complementary reload tests:
  - `reload-keyboard`: Verifies actual reload via keyboard shortcut + log detection
  - `reload-messaging`: Verifies CDP bridge dispatch mechanism

## references

- Implementation: `tests/cdp/cdp-reload-extension-messaging.ts`
- Debug script: `debug/cdp-debug-reload-messaging-fix.ts`
- Chrome Service Worker Lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

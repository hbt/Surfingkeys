# plan.pushbullet-via-surfingkeys

## context

The Pushbullet Chrome extension no longer works in the latest Chrome. The replacement uses:
- A Surfingkeys `mapkey` (`ypb`) to push the current page URL + title
- A `self.pushPage` handler in the background SW that fetches the local server
- A `/push` endpoint on the existing `scripts/server.ts` (port 9600) that shells out to `pb`
- A scratch Playwright test that invokes the SW handler directly and verifies via `pb list`

No new daemon needed — the dev server on `:9600` is already running persistently.

---

## 1. `scripts/server.ts` — add `/push` endpoint

Add `pushResponse` function after `logEntryResponse` (line 117), following the same pattern:

```typescript
function pushResponse(req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  if (origin !== null && !origin.startsWith('chrome-extension://')) {
    return Promise.resolve(new Response('Forbidden', { status: 403 }));
  }
  const corsHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {})
  };
  return req.json().then(async (data: { url?: string; title?: string }) => {
    const { url, title } = data;
    if (!url || !title) {
      const body = JSON.stringify({ ok: false, error: 'Missing url or title' });
      return new Response(body, { status: 400, headers: corsHeaders });
    }
    const proc = Bun.spawn(['pb', 'push', '-u', url, '-t', title], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await proc.exited;
    if (proc.exitCode === 0) {
      log('POST', '/push', 200, url.length);
      return new Response(JSON.stringify({ ok: true, title }), { status: 200, headers: corsHeaders });
    } else {
      const stderr = await new Response(proc.stderr).text();
      log('POST', '/push', 500, stderr.length);
      return new Response(JSON.stringify({ ok: false, error: stderr.trim() }), { status: 500, headers: corsHeaders });
    }
  });
}
```

Register the route after the `/log` route (line ~371):
```typescript
if (url.pathname === '/push' && req.method === 'POST') return pushResponse(req);
```

---

## 2. `src/background/start.ts` — add `self.pushPage`

Insert after `self.userLog` (line 1232):

```typescript
self.pushPage = function(message: Msg, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) {
    const { url, title } = message as { url: string; title: string } & Msg;
    fetch(`http://localhost:${__CONFIG_SERVER_PORT__}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title }),
    })
    .then((r: Response) => r.json())
    .then((result: { ok: boolean; error?: string; title?: string }) => {
        const tabId = sender.tab?.id;
        if (tabId !== undefined) {
            sendTabMessage(tabId, 0, {
                subject: 'showBanner',
                message: result.ok ? `Pushed: ${title}` : `Push failed: ${result.error ?? 'unknown'}`,
            });
        }
        sendResponse(result);
    })
    .catch((e: unknown) => {
        sendResponse({ ok: false, error: String(e) });
    });
    return true; // keep channel open for async sendResponse
};
```

---

## 3. `/home/hassen/.surfingkeys-2026.js` — add `ypb` mapkey

Append near other custom `mapkey` entries:

```javascript
api.mapkey('ypb', 'Push current page via Pushbullet (pb)', function() {
    api.RUNTIME('pushPage', { url: window.location.href, title: document.title });
});
```

---

## 4. `tests/playwright/scratch/scratch-pushbullet-ypb.spec.ts` — scratch test

Pattern: directly invoke `self.pushPage` from the SW (same as `scratch-bookmark-save-youtube.spec.ts`), then verify via `execSync('pb list')`.

```typescript
/**
 * Scratch test: ypb — push current page via Pushbullet
 *
 * Verifies the self.pushPage SW handler end-to-end:
 * - invokes the handler directly from the SW context
 * - waits for the push to complete
 * - runs `pb list` and confirms the push appears with matching url/title
 *
 * Prerequisite: scripts/server.ts must be running on :9600 (./bin/dbg server-start)
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-pushbullet-ypb.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { execSync } from 'child_process';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const TEST_URL = 'https://example.com/scratch-pb-test';
const TEST_TITLE = `scratch-pb-test-${Date.now()}`;  // unique per run

let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
    const result = await launchWithCoverage();
    context = result.context;
    page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(500);
});

test.afterAll(async () => {
    await context?.close();
});

test('self.pushPage sends push and pb list confirms it', async () => {
    test.setTimeout(30_000);

    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');

    // Invoke self.pushPage directly from the SW
    const result = await sw.evaluate(({ url, title }: { url: string; title: string }) => {
        return new Promise<{ ok: boolean; error?: string }>((resolve) => {
            const msg = { action: 'pushPage', url, title };
            const sender = { tab: { id: 1, url, title } };
            (self as any).pushPage(msg, sender, resolve);
        });
    }, { url: TEST_URL, title: TEST_TITLE });

    expect(result.ok).toBe(true);

    // Give Pushbullet API a moment to register the push
    await page.waitForTimeout(2000);

    // Check pb list for our push
    const pbOutput = execSync('pb list 2>/dev/null', { encoding: 'utf8' });
    expect(pbOutput).toContain(TEST_TITLE);
});
```

---

## build & verification sequence

| Step | Action | Expected |
|------|--------|----------|
| 1 | Edit `server.ts`, `start.ts`, `.surfingkeys-2026.js` | — |
| 2 | `npm run build:dev` | No TS errors |
| 3 | Ensure server running: `./bin/dbg server-status` | `{ "running": true }` |
| 4 | Smoke-test endpoint: `curl -s -X POST localhost:9600/push -H 'Content-Type: application/json' -d '{"url":"https://example.com","title":"curl-test"}' \| jq .` | `{"ok":true,"title":"curl-test"}` |
| 5 | Run scratch test | Pass + `pb list` contains title |
| 6 | Reload extension in gchrb (manual) | — |
| 7 | Press `ypb` on any page | Banner "Pushed: <title>" + push on device |

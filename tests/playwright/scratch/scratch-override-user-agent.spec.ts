/**
 * Scratch: verify that we can override the browser user agent in a Playwright
 * extension context, using a CDP session's Network.setUserAgentOverride.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../utils/pw-helpers';

const CUSTOM_UA = 'Mozilla/5.0 (ScratchBot/1.0; OverrideTest) AppleWebKit/537.36';

test('override user agent via CDP and verify navigator.userAgent', async () => {
    const { context } = await launchExtensionContext();

    const page = await context.newPage();

    // Attach a CDP session to the page target so we can call Network.setUserAgentOverride.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.setUserAgentOverride', { userAgent: CUSTOM_UA });

    // A minimal self-contained fixture that exposes navigator.userAgent.
    await page.setContent(`
        <!DOCTYPE html>
        <html>
          <head><title>UA Override Test</title></head>
          <body>
            <pre id="ua"></pre>
            <script>document.getElementById('ua').textContent = navigator.userAgent;</script>
          </body>
        </html>
    `);

    const reportedUA = await page.$eval('#ua', el => el.textContent ?? '');
    console.log('Reported user agent:', reportedUA);

    expect(reportedUA).toBe(CUSTOM_UA);

    await context.close();
});

test('override user agent via context launch option and verify navigator.userAgent', async () => {
    // Alternative: set UA at context level by copying launch logic with userAgent arg.
    // chromium.launchPersistentContext accepts a `userAgent` option directly.
    const { chromium } = await import('@playwright/test');
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const { EXTENSION_PATH } = await import('../utils/pw-helpers');

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ua-test-'));
    const defaultDir = path.join(userDataDir, 'Default');
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.writeFileSync(
        path.join(defaultDir, 'Preferences'),
        JSON.stringify({ extensions: { ui: { developer_mode: true } } }),
    );

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        userAgent: CUSTOM_UA,
        args: [
            '--headless=new',
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-default-browser-check',
        ],
    });

    const page = await context.newPage();

    await page.setContent(`
        <!DOCTYPE html>
        <html>
          <head><title>UA Override Test (launch option)</title></head>
          <body>
            <pre id="ua"></pre>
            <script>document.getElementById('ua').textContent = navigator.userAgent;</script>
          </body>
        </html>
    `);

    const reportedUA = await page.$eval('#ua', el => el.textContent ?? '');
    console.log('Reported user agent (launch option):', reportedUA);

    expect(reportedUA).toBe(CUSTOM_UA);

    await context.close();
});

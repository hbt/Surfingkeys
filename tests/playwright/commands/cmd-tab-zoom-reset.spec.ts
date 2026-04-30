import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

async function getTabZoom(): Promise<number> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<number>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) return resolve(1.0);
                chrome.tabs.getZoom(tabs[0].id!, (zoom) => resolve(zoom));
            });
        });
    });
}

test.describe('cmd_tab_zoom_reset (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('pressing zr resets zoom to default after zoom in', async () => {
        // First zoom in
        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('i');
        await page.waitForTimeout(300);

        const zoomedIn = await getTabZoom();
        if (DEBUG) console.log(`After zi: ${zoomedIn}`);
        expect(zoomedIn).toBeGreaterThan(1.0);

        // Reset zoom
        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('r');
        await page.waitForTimeout(300);

        const resetZoom = await getTabZoom();
        if (DEBUG) console.log(`After zr: ${resetZoom}`);
        expect(resetZoom).toBeCloseTo(1.0, 1);
    });

    test('pressing zr resets zoom to default after zoom out', async () => {
        // First zoom out
        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('o');
        await page.waitForTimeout(300);

        const zoomedOut = await getTabZoom();
        if (DEBUG) console.log(`After zo: ${zoomedOut}`);
        expect(zoomedOut).toBeLessThan(1.0);

        // Reset zoom
        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('r');
        await page.waitForTimeout(300);

        const resetZoom = await getTabZoom();
        if (DEBUG) console.log(`After zr: ${resetZoom}`);
        expect(resetZoom).toBeCloseTo(1.0, 1);
    });
});

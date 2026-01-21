/**
 * Check if chrome://extensions tab was opened
 */
import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null
    });

    try {
        const pages = await browser.pages();

        console.log('\n=== All open tabs ===\n');
        for (const page of pages) {
            const url = page.url();
            const title = await page.title();
            console.log(`${url}\n  Title: ${title}\n`);
        }

        // Check for chrome://extensions tab
        const extensionsTab = pages.find(p => p.url().startsWith('chrome://extensions'));

        if (extensionsTab) {
            console.log('✓ Found chrome://extensions tab');
            console.log('  URL:', extensionsTab.url());
        } else {
            console.log('✗ No chrome://extensions tab found');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.disconnect();
    }
})();

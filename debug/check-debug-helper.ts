/**
 * Quick check of the debug helper console output
 */
import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null
    });

    try {
        // Get service worker target
        const targets = await browser.targets();
        const serviceWorkerTarget = targets.find(t =>
            t.type() === 'service_worker' && t.url().includes('surfingkeys')
        );

        if (!serviceWorkerTarget) {
            console.error('❌ Surfingkeys service worker not found');
            process.exit(1);
        }

        console.log('✓ Found service worker:', serviceWorkerTarget.url());

        // Get the worker (which gives us access to console)
        const worker = await serviceWorkerTarget.worker();
        if (!worker) {
            console.error('❌ Could not get worker instance');
            process.exit(1);
        }

        console.log('\n=== Checking console logs (look for [DEBUG HELPER] messages) ===\n');

        // Listen to console messages
        worker.on('console', (msg: any) => {
            const text = msg.text();
            if (text.includes('[DEBUG HELPER]')) {
                console.log('→', text);
            }
        });

        // Wait a bit to catch any logs
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('\n✓ Check complete');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.disconnect();
    }
})();

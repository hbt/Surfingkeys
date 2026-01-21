/**
 * Test that reloading the extension doesn't create duplicate chrome://extensions tabs
 */
import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null
    });

    try {
        console.log('\n1. Counting chrome://extensions tabs before reload...');
        let pages = await browser.pages();
        const beforeCount = pages.filter(p => p.url().startsWith('chrome://extensions')).length;
        console.log(`   Found ${beforeCount} tab(s)`);

        console.log('\n2. Reloading extension...');
        // Find the extensions page and reload the extension
        const extensionsPage = pages.find(p => p.url().startsWith('chrome://extensions'));
        if (extensionsPage) {
            // Use CDP to trigger extension reload
            const client = await extensionsPage.target().createCDPSession();

            // Navigate to extensions to ensure it's focused
            await extensionsPage.bringToFront();

            console.log('   Waiting 2 seconds...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Simulate extension reload via keyboard shortcut (Alt+Shift+R)
        console.log('   Triggering reload via keyboard shortcut (Alt+Shift+R)...');
        const { spawn } = require('child_process');
        spawn('xdotool', ['key', 'alt+shift+r']);

        console.log('\n3. Waiting for extension to reload (3 seconds)...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('\n4. Counting chrome://extensions tabs after reload...');
        pages = await browser.pages();
        const afterCount = pages.filter(p => p.url().startsWith('chrome://extensions')).length;
        console.log(`   Found ${afterCount} tab(s)`);

        console.log('\n=== RESULT ===');
        if (beforeCount === afterCount) {
            console.log('✓ PASS: No duplicate tab created');
            console.log(`  Tab count remained at ${afterCount}`);
        } else {
            console.log(`✗ FAIL: Tab count changed from ${beforeCount} to ${afterCount}`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.disconnect();
    }
})();

import { CDPBridge } from '../src/common/cdp-bridge.js';

const bridge = new CDPBridge('frontend');

async function testTracking() {
    // Find a tab to use for testing
    const targets = await bridge.send('Target.getTargets', {});
    console.log('Available targets:', targets);

    // Simulate pressing 'f' key to trigger hint mode
    // This should call trackCommandUsage('f', annotation, 'Normal')

    await bridge.send('Runtime.evaluate', {
        expression: `
            window.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'f',
                code: 'KeyF',
                bubbles: true
            }));
            'F key dispatched'
        `
    });

    console.log('F key dispatched');

    // Wait a bit for async storage
    await new Promise(r => setTimeout(r, 500));

    // Query what was stored
    const result = await bridge.send('Runtime.evaluate', {
        expression: `
            new Promise((resolve) => {
                chrome.storage.local.get('surfingkeys_usage', (result) => {
                    resolve(JSON.stringify(result.surfingkeys_usage?.commands || {}, null, 2));
                });
            })
        `
    });

    console.log('Storage after tracking:', result.result.value);
}

testTracking().catch(console.error);

import { CDPBridge } from '../src/common/cdp-bridge.js';

const bridge = new CDPBridge('bg');

async function inspectStorage() {
    // Query storage for f and t commands
    const result = await bridge.send('Runtime.evaluate', {
        expression: `
            new Promise((resolve) => {
                chrome.storage.local.get('surfingkeys_usage', (result) => {
                    const usage = result.surfingkeys_usage || {};
                    const commands = usage.commands || {};

                    // Find f and t commands
                    const entries = Object.entries(commands).map(([key, cmd]) => {
                        return {
                            storageKey: key,
                            key: cmd.key,
                            display_name: cmd.display_name,
                            annotation: cmd.annotation,
                            command_id: cmd.command_id,
                            category: cmd.category,
                            count: cmd.count
                        };
                    });

                    resolve(JSON.stringify(entries, null, 2));
                });
            })
        `
    });

    console.log('Storage contents:');
    console.log(result.result.value);
}

inspectStorage().catch(console.error);

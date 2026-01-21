#!/usr/bin/env ts-node
/**
 * Headless example: launches under npm run debug:cdp:headless and dumps
 * chrome://extensions/?errors data, exiting non-zero if the extension is broken.
 */

import { extractChromeExtensionErrors } from '../scripts/extract-chrome-extension-service-worker-errors';

(async () => {
    console.log('Running headless chrome://extensions error check...');
    console.log(`CDP_PORT=${process.env.CDP_PORT || '9222'}`);

    const result = await extractChromeExtensionErrors({ allowCreateTarget: true });

    console.log('\nExtension:', result.name || result.extensionId);
    console.log('Version:', result.version || 'unknown');
    console.log('Mode:', result.mode);
    console.log('Attempts:', result.attempts, 'Waited(ms):', result.waitedMs);
    console.log('Manifest errors:', result.manifestErrors.length);
    console.log('Runtime errors:', result.runtimeErrors.length);

    if (result.manifestErrors.length) {
        console.log('\nManifest Errors:');
        for (const err of result.manifestErrors) {
            console.log(`  [${err.id}] ${err.message} (${err.source})`);
        }
    }

    if (result.runtimeErrors.length) {
        console.log('\nRuntime Errors:');
        for (const err of result.runtimeErrors) {
            console.log(`  [${err.id}] ${err.message}`);
            if (err.source) {
                console.log(`      source: ${err.source}`);
            }
            if (err.stackTrace && err.stackTrace.length) {
                console.log('      stack:');
                err.stackTrace.slice(0, 3).forEach((frame: any) => {
                    console.log(`        at ${frame.functionName || '<anon>'} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})`);
                });
            }
        }
    }

    if (result.hasErrors) {
        console.error('\n✗ Extension has errors.');
        process.exit(1);
    }

    console.log('\n✓ No extension errors reported.');
    process.exit(0);
})().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});

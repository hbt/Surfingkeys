#!/usr/bin/env ts-node
/**
 * Check Console Errors
 *
 * Captures all console errors from extension contexts
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

async function getAllTargets(): Promise<any[]> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    return JSON.parse(resp);
}

async function main() {
    console.log('Checking Console Errors\n');

    const targets = await getAllTargets();

    console.log('Available targets:');
    targets.forEach((t: any) => {
        if (t.url && t.url.includes('chrome-extension://')) {
            console.log(`  - ${t.type}: ${t.title || t.url}`);
        }
    });
    console.log();

    // Listen to all extension targets for console errors
    const extensionTargets = targets.filter((t: any) =>
        t.url && t.url.includes('chrome-extension://') && t.webSocketDebuggerUrl
    );

    if (extensionTargets.length === 0) {
        console.log('No extension targets found');
        return;
    }

    console.log(`Monitoring ${extensionTargets.length} extension target(s) for console errors...\n`);

    const errors: any[] = [];

    for (const target of extensionTargets) {
        const ws = new WebSocket(target.webSocketDebuggerUrl);

        await new Promise((resolve) => {
            ws.on('open', resolve);
        });

        ws.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
        ws.send(JSON.stringify({ id: messageId++, method: 'Log.enable' }));
        ws.send(JSON.stringify({ id: messageId++, method: 'Console.enable' }));

        ws.on('message', (data: any) => {
            const msg = JSON.parse(data.toString());

            // Capture runtime exceptions
            if (msg.method === 'Runtime.exceptionThrown') {
                const exception = msg.params.exceptionDetails;
                errors.push({
                    target: target.title || target.url,
                    type: 'Exception',
                    message: exception.exception?.description || exception.text,
                    url: exception.url,
                    line: exception.lineNumber,
                    col: exception.columnNumber,
                    stack: exception.stackTrace
                });
            }

            // Capture console errors
            if (msg.method === 'Runtime.consoleAPICalled') {
                if (msg.params.type === 'error') {
                    const args = msg.params.args || [];
                    const message = args.map((arg: any) =>
                        arg.value || arg.description || JSON.stringify(arg)
                    ).join(' ');

                    errors.push({
                        target: target.title || target.url,
                        type: 'Console Error',
                        message: message,
                        stack: msg.params.stackTrace
                    });
                }
            }

            // Log entries
            if (msg.method === 'Log.entryAdded') {
                if (msg.params.entry.level === 'error') {
                    errors.push({
                        target: target.title || target.url,
                        type: 'Log Error',
                        message: msg.params.entry.text,
                        url: msg.params.entry.url,
                        line: msg.params.entry.lineNumber
                    });
                }
            }
        });
    }

    // Wait a bit for errors to accumulate
    await new Promise(r => setTimeout(r, 2000));

    if (errors.length > 0) {
        console.log('='.repeat(70));
        console.log(`FOUND ${errors.length} ERROR(S)`);
        console.log('='.repeat(70));

        errors.forEach((err, idx) => {
            console.log(`\n[${idx + 1}] ${err.type}`);
            console.log(`    Target: ${err.target}`);
            console.log(`    Message: ${err.message}`);
            if (err.url) console.log(`    URL: ${err.url}`);
            if (err.line) console.log(`    Line: ${err.line}:${err.col || 0}`);
            if (err.stack) {
                const frames = err.stack.callFrames || [];
                if (frames.length > 0) {
                    console.log(`    Stack:`);
                    frames.slice(0, 3).forEach((frame: any) => {
                        console.log(`      at ${frame.functionName || '(anonymous)'} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})`);
                    });
                }
            }
        });
        console.log();
    } else {
        console.log('✓ No console errors detected');
    }

    process.exit(0);
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

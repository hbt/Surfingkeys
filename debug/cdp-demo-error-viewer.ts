#!/usr/bin/env ts-node
/**
 * CDP Error Viewer Live Demo
 *
 * Injects a temporary error viewer UI into the current page to demonstrate
 * what the error viewer would look like without building the actual page.
 *
 * This script:
 * 1. Connects to current page
 * 2. Fetches errors from chrome.storage.local
 * 3. Injects a full-featured error viewer UI
 * 4. Displays errors in a table with filtering, details, and export
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
    red: '\x1b[31m'
};

function section(title: string): void {
    console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);
}

function step(num: number, desc: string): void {
    console.log(`${colors.bright}${colors.yellow}Step ${num}:${colors.reset} ${desc}`);
}

async function findPage(url: string): Promise<string | null> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const page = targets.find((t: any) =>
        t.type === 'page' && t.url.includes(url)
    );
    return page ? page.webSocketDebuggerUrl : null;
}

function execPage(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) {
                    console.log(`${colors.red}   CDP Error: ${msg.error.message}${colors.reset}`);
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result?.result?.value);
                }
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {
                expression: code,
                returnByValue: true,
                awaitPromise: true
            }
        }));
    });
}

// Error viewer HTML/CSS/JS code
const errorViewerCode = `
(async function() {
    // Remove existing viewer if present
    const existing = document.getElementById('surfingkeys-error-viewer');
    if (existing) {
        existing.remove();
    }

    // Fetch errors from storage
    const errors = await new Promise((resolve) => {
        chrome.storage.local.get(['surfingkeys_errors'], (result) => {
            resolve(result.surfingkeys_errors || []);
        });
    });

    // Create viewer HTML
    const viewer = document.createElement('div');
    viewer.id = 'surfingkeys-error-viewer';
    viewer.innerHTML = \`
        <style>
            #surfingkeys-error-viewer {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.95);
                z-index: 999999;
                color: #fff;
                font-family: 'Monaco', 'Menlo', monospace;
                font-size: 13px;
                overflow: auto;
                padding: 20px;
            }

            #error-viewer-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 10px;
                border-bottom: 2px solid #00ff00;
            }

            #error-viewer-title {
                font-size: 24px;
                font-weight: bold;
                color: #00ff00;
            }

            #error-viewer-stats {
                color: #888;
            }

            #error-viewer-actions {
                margin-bottom: 20px;
                display: flex;
                gap: 10px;
            }

            .error-viewer-btn {
                background: #333;
                border: 1px solid #555;
                color: #fff;
                padding: 8px 16px;
                cursor: pointer;
                border-radius: 4px;
                font-family: inherit;
                font-size: 12px;
            }

            .error-viewer-btn:hover {
                background: #444;
                border-color: #00ff00;
            }

            .error-viewer-btn-danger {
                background: #c00;
            }

            .error-viewer-btn-danger:hover {
                background: #d00;
                border-color: #f00;
            }

            #error-viewer-filters {
                margin-bottom: 15px;
                display: flex;
                gap: 10px;
                align-items: center;
            }

            #error-viewer-search {
                flex: 1;
                background: #222;
                border: 1px solid #555;
                color: #fff;
                padding: 8px 12px;
                border-radius: 4px;
                font-family: inherit;
            }

            .filter-select {
                background: #222;
                border: 1px solid #555;
                color: #fff;
                padding: 8px 12px;
                border-radius: 4px;
                font-family: inherit;
            }

            #error-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .error-item {
                background: #1a1a1a;
                border: 1px solid #333;
                border-radius: 4px;
                padding: 15px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .error-item:hover {
                border-color: #00ff00;
                background: #222;
            }

            .error-item-header {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
            }

            .error-type {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 3px;
                font-size: 11px;
                font-weight: bold;
            }

            .error-type-onerror {
                background: #c00;
                color: #fff;
            }

            .error-type-rejection {
                background: #f80;
                color: #fff;
            }

            .error-type-lasterror {
                background: #f0f;
                color: #fff;
            }

            .error-context {
                color: #888;
                font-size: 11px;
            }

            .error-message {
                color: #ff6b6b;
                margin-bottom: 5px;
                font-weight: bold;
            }

            .error-meta {
                color: #888;
                font-size: 11px;
                display: flex;
                gap: 15px;
            }

            .error-details {
                display: none;
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #333;
            }

            .error-item.expanded .error-details {
                display: block;
            }

            .error-stack {
                background: #0a0a0a;
                padding: 10px;
                border-radius: 4px;
                margin-top: 10px;
                overflow-x: auto;
                white-space: pre-wrap;
                font-size: 11px;
                color: #0f0;
                line-height: 1.4;
            }

            .error-detail-row {
                margin: 5px 0;
                color: #aaa;
            }

            .error-detail-label {
                color: #888;
                display: inline-block;
                width: 100px;
            }

            .empty-state {
                text-align: center;
                padding: 40px;
                color: #666;
                font-size: 16px;
            }
        </style>

        <div id="error-viewer-header">
            <div id="error-viewer-title">🔍 Surfingkeys Error Viewer</div>
            <div id="error-viewer-stats">\${errors.length} errors captured</div>
        </div>

        <div id="error-viewer-actions">
            <button class="error-viewer-btn" onclick="window._errorViewerRefresh()">🔄 Refresh</button>
            <button class="error-viewer-btn" onclick="window._errorViewerExport()">📥 Export JSON</button>
            <button class="error-viewer-btn error-viewer-btn-danger" onclick="window._errorViewerClear()">🗑️ Clear All</button>
            <button class="error-viewer-btn" onclick="window._errorViewerClose()">✕ Close</button>
        </div>

        <div id="error-viewer-filters">
            <input type="text" id="error-viewer-search" placeholder="Search errors..." />
            <select class="filter-select" id="filter-context">
                <option value="">All Contexts</option>
                <option value="background">Background</option>
                <option value="content_script">Content Script</option>
            </select>
            <select class="filter-select" id="filter-type">
                <option value="">All Types</option>
                <option value="window.onerror">window.onerror</option>
                <option value="unhandledrejection">Promise Rejection</option>
                <option value="chrome.runtime.lastError">Chrome API Error</option>
            </select>
        </div>

        <div id="error-list"></div>
    \`;

    document.body.appendChild(viewer);

    // Render errors
    function renderErrors() {
        const list = document.getElementById('error-list');
        const search = document.getElementById('error-viewer-search').value.toLowerCase();
        const contextFilter = document.getElementById('filter-context').value;
        const typeFilter = document.getElementById('filter-type').value;

        let filtered = errors.slice().reverse(); // Show newest first

        // Apply filters
        if (search) {
            filtered = filtered.filter(e =>
                e.message.toLowerCase().includes(search) ||
                (e.stack && e.stack.toLowerCase().includes(search))
            );
        }
        if (contextFilter) {
            filtered = filtered.filter(e => e.context === contextFilter);
        }
        if (typeFilter) {
            filtered = filtered.filter(e => e.type === typeFilter);
        }

        if (filtered.length === 0) {
            list.innerHTML = '<div class="empty-state">No errors found</div>';
            return;
        }

        list.innerHTML = filtered.map((error, idx) => {
            const typeClass = error.type === 'window.onerror' ? 'error-type-onerror' :
                            error.type === 'unhandledrejection' ? 'error-type-rejection' :
                            'error-type-lasterror';

            const timestamp = new Date(error.timestamp).toLocaleString();

            return \`
                <div class="error-item" onclick="this.classList.toggle('expanded')">
                    <div class="error-item-header">
                        <div>
                            <span class="error-type \${typeClass}">\${error.type}</span>
                            <span class="error-context">\${error.context}</span>
                        </div>
                        <div class="error-meta">
                            <span>📅 \${timestamp}</span>
                        </div>
                    </div>
                    <div class="error-message">\${error.message}</div>
                    <div class="error-meta">
                        \${error.source ? \`<span>📄 \${error.source}:\${error.lineno}:\${error.colno}</span>\` : ''}
                        \${error.url ? \`<span>🔗 \${error.url.substring(0, 50)}...</span>\` : ''}
                    </div>

                    <div class="error-details">
                        <div class="error-detail-row">
                            <span class="error-detail-label">Timestamp:</span>
                            \${error.timestamp}
                        </div>
                        <div class="error-detail-row">
                            <span class="error-detail-label">Context:</span>
                            \${error.context}
                        </div>
                        <div class="error-detail-row">
                            <span class="error-detail-label">Type:</span>
                            \${error.type}
                        </div>
                        \${error.url ? \`
                        <div class="error-detail-row">
                            <span class="error-detail-label">URL:</span>
                            \${error.url}
                        </div>
                        \` : ''}
                        \${error.userAgent ? \`
                        <div class="error-detail-row">
                            <span class="error-detail-label">User Agent:</span>
                            \${error.userAgent}
                        </div>
                        \` : ''}
                        \${error.stack ? \`
                        <div class="error-detail-row">
                            <div class="error-detail-label">Stack Trace:</div>
                            <div class="error-stack">\${error.stack}</div>
                        </div>
                        \` : ''}
                        <button class="error-viewer-btn" onclick="event.stopPropagation(); navigator.clipboard.writeText(JSON.stringify(\${JSON.stringify(error)}, null, 2)); alert('Copied to clipboard!')">📋 Copy JSON</button>
                    </div>
                </div>
            \`;
        }).join('');
    }

    // Event listeners
    document.getElementById('error-viewer-search').addEventListener('input', renderErrors);
    document.getElementById('filter-context').addEventListener('change', renderErrors);
    document.getElementById('filter-type').addEventListener('change', renderErrors);

    // Global functions
    window._errorViewerClose = () => {
        viewer.remove();
    };

    window._errorViewerRefresh = async () => {
        const newErrors = await new Promise((resolve) => {
            chrome.storage.local.get(['surfingkeys_errors'], (result) => {
                resolve(result.surfingkeys_errors || []);
            });
        });
        errors.length = 0;
        errors.push(...newErrors);
        document.getElementById('error-viewer-stats').textContent = \`\${errors.length} errors captured\`;
        renderErrors();
    };

    window._errorViewerClear = async () => {
        if (confirm('Clear all \' + errors.length + ' errors?')) {
            await new Promise((resolve) => {
                chrome.storage.local.set({ surfingkeys_errors: [] }, resolve);
            });
            errors.length = 0;
            document.getElementById('error-viewer-stats').textContent = '0 errors captured';
            renderErrors();
        }
    };

    window._errorViewerExport = () => {
        const dataStr = JSON.stringify(errors, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'surfingkeys-errors-' + new Date().toISOString() + '.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    // Initial render
    renderErrors();

    return 'Error viewer injected with ' + errors.length + ' errors';
})();
`;

async function main() {
    console.log(`${colors.bright}Error Viewer Live Demo${colors.reset}\n`);
    console.log('Injecting error viewer UI into current page\n');

    section('PHASE 1: Connect to Page');

    step(1, 'Find Google page (or any open page)');
    const pageWsUrl = await findPage('www.google.com');
    if (!pageWsUrl) {
        console.log(`${colors.red}❌ Could not find Google page${colors.reset}`);
        console.log(`${colors.yellow}Please open https://www.google.com in Chrome${colors.reset}`);
        process.exit(1);
    }

    const pageWs = new WebSocket(pageWsUrl);
    await new Promise((resolve, reject) => {
        pageWs.on('open', resolve);
        pageWs.on('error', reject);
    });

    pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 500));

    console.log(`   ${colors.green}✓ Connected to page${colors.reset}\n`);

    section('PHASE 2: Inject Error Viewer UI');

    step(2, 'Inject error viewer HTML/CSS/JS');
    const result = await execPage(pageWs, errorViewerCode);
    console.log(`   ${colors.green}✓ ${result}${colors.reset}\n`);

    section('DEMO READY');

    console.log(`${colors.bright}${colors.green}✓ Error viewer is now visible in your browser!${colors.reset}\n`);
    console.log(`${colors.bright}Features:${colors.reset}`);
    console.log(`  • Search errors by message or stack trace`);
    console.log(`  • Filter by context (background/content_script)`);
    console.log(`  • Filter by type (error/rejection/lastError)`);
    console.log(`  • Click any error to expand full details`);
    console.log(`  • Copy individual errors as JSON`);
    console.log(`  • Export all errors as JSON file`);
    console.log(`  • Clear all errors`);
    console.log(`  • Refresh to reload from storage\n`);

    console.log(`${colors.bright}To close:${colors.reset} Click the "✕ Close" button or press Escape\n`);

    console.log(`${colors.yellow}Tip: Trigger some test errors to see them appear:${colors.reset}`);
    console.log(`  throw new Error('TEST ERROR')`);
    console.log(`  Promise.reject(new Error('TEST REJECTION'))\n`);

    pageWs.close();
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

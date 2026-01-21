const WebSocket = require('ws');
const http = require('http');
let messageId = 1;

(async () => {
    const resp = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const page = targets.find(t => t.type === 'page' && t.url.includes('google.com'));
    if (!page) { console.log('❌ No Google page found'); process.exit(1); }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(resolve => ws.on('open', resolve));
    ws.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 500));

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Runtime.evaluate',
        params: {
            expression: `
(function() {
    const old = document.getElementById('sk-viewer-demo');
    if (old) old.remove();

    const viewer = document.createElement('div');
    viewer.id = 'sk-viewer-demo';
    viewer.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.98);z-index:999999;color:#0f0;font:13px Monaco,monospace;padding:20px;overflow:auto';
    
    viewer.innerHTML = '<div style="font-size:24px;border-bottom:2px solid #0f0;padding-bottom:10px;margin-bottom:20px">🔍 Surfingkeys Error Viewer - 2 errors</div>' +
        '<button onclick="this.parentElement.remove()" style="background:#222;border:1px solid #0f0;color:#0f0;padding:8px 16px;cursor:pointer;font-family:inherit;margin-bottom:20px">✕ Close</button><br><br>' +
        '<div class="error-item" style="background:#111;border:1px solid #333;padding:15px;margin:10px 0;cursor:pointer"><div style="color:#f00;font-weight:bold">[window.onerror]</div><div style="color:#ff6;margin:5px 0">TypeError: Cannot read property of undefined</div><div style="color:#666;font-size:11px">background | ' + new Date().toLocaleString() + ' | background.js:142:10</div></div>' +
        '<div class="error-item" style="background:#111;border:1px solid #333;padding:15px;margin:10px 0;cursor:pointer"><div style="color:#f80;font-weight:bold">[unhandledrejection]</div><div style="color:#ff6;margin:5px 0">Promise rejected: Network request failed</div><div style="color:#666;font-size:11px">content_script | ' + new Date().toLocaleString() + ' | content.js:89:3</div></div>';

    document.body.appendChild(viewer);
    
    return 'Viewer injected!';
})();
            `,
            returnByValue: true
        }
    }));

    await new Promise(r => setTimeout(r, 1000));
    console.log('\n✅ ERROR VIEWER DEMO IS NOW VISIBLE!\n');
    console.log('You should see:');
    console.log('  • Green terminal-style overlay');
    console.log('  • "🔍 Surfingkeys Error Viewer - 2 errors" header');
    console.log('  • Close button');
    console.log('  • 2 demo errors listed');
    console.log('\nClick "✕ Close" to dismiss\n');
    ws.close();
})();

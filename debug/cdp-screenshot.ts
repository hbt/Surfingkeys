#!/usr/bin/env ts-node
/**
 * CDP Screenshot - Options Page
 *
 * Gold standard screenshot capture via Chrome DevTools Protocol.
 * Connects directly to Chrome (not via proxy) and captures PNG screenshot.
 *
 * Usage:
 *   npm run debug:cdp:headless debug/cdp-screenshot.ts
 *   npm run debug:cdp:live debug/cdp-screenshot.ts
 *
 * Output: /tmp/screenshot-[timestamp].png
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import * as fs from 'fs';
import { CDP_CONFIG } from './config/cdp-config';

interface CDPTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

/**
 * Fetch list of available CDP targets from Chrome DevTools endpoint
 */
async function getTargets(): Promise<CDPTarget[]> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
  });
}

/**
 * Find or open options page target
 */
async function findOrOpenOptionsPage(): Promise<CDPTarget> {
  const targets = await getTargets();
  let optionsPage = targets.find(t =>
    t.type === 'page' && t.url.includes('options.html')
  );

  if (optionsPage) {
    return optionsPage;
  }

  // Options page not found, open it via extension background
  console.log('📄 Options page not found, opening via extension...');

  const extensionTarget = targets.find(t =>
    t.type === 'service_worker' && t.url.includes('background.js')
  );

  if (!extensionTarget) {
    throw new Error('Extension background not found - cannot open options page');
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(extensionTarget.webSocketDebuggerUrl);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout opening options page'));
    }, 10000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: 'chrome.runtime.openOptionsPage()',
          returnByValue: true
        }
      }));
    });

    ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === 1) {
        ws.close();
        clearTimeout(timeout);

        // Wait for options page to appear
        await new Promise(r => setTimeout(r, 1000));

        const newTargets = await getTargets();
        const found = newTargets.find(t =>
          t.type === 'page' && t.url.includes('options.html')
        );

        if (found) {
          console.log('✓ Options page opened');
          resolve(found);
        } else {
          reject(new Error('Failed to open options page'));
        }
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Capture screenshot using Page.captureScreenshot CDP method
 */
async function captureScreenshot(wsUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Screenshot capture timeout'));
    }, 10000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Page.captureScreenshot',
        params: { format: 'png' }
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === 1) {
          clearTimeout(timeout);
          ws.close();

          if (msg.error) {
            reject(new Error(`CDP Error: ${msg.error.message}`));
          } else if (msg.result?.data) {
            resolve(Buffer.from(msg.result.data, 'base64'));
          } else {
            reject(new Error('No screenshot data in response'));
          }
        }
      } catch (e) {
        clearTimeout(timeout);
        ws.close();
        reject(e);
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Save buffer to file with timestamp
 */
function saveScreenshot(buffer: Buffer): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const filename = `/tmp/screenshot-${timestamp}.png`;
  fs.writeFileSync(filename, buffer);
  return filename;
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log(`📸 CDP Screenshot Capture`);
  console.log(`   Mode: ${CDP_CONFIG.mode}`);
  console.log(`   Endpoint: ${CDP_CONFIG.endpoint}\n`);

  try {
    console.log('🔍 Finding or opening options page...');
    const target = await findOrOpenOptionsPage();

    console.log(`✓ Found target: ${target.title}`);
    console.log(`  ID: ${target.id}`);
    console.log(`  URL: ${target.url}\n`);

    console.log('📸 Capturing screenshot...');
    const screenshot = await captureScreenshot(target.webSocketDebuggerUrl);

    console.log(`✓ Captured: ${screenshot.length} bytes`);

    const path = saveScreenshot(screenshot);
    console.log(`\n✅ Screenshot saved to: ${path}`);

    // Display file info
    const stat = fs.statSync(path);
    console.log(`   Size: ${(stat.size / 1024).toFixed(1)} KB`);
    console.log(`   Mode: ${CDP_CONFIG.mode}`);

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

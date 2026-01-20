#!/usr/bin/env node
/**
 * CLI wrapper for fetch-mcp server
 * Uses the MCP server to fetch URLs as markdown without using Claude Code tokens
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

const MCP_SERVER_PATH = '/home/hassen/workspace/mcp-servers/fetch-mcp/dist/index.js';

function usage() {
  console.log(`
Usage: mcp-fetch-cli.js <url> [output-file]

Fetch a URL as markdown using the MCP server.

Examples:
  mcp-fetch-cli.js https://example.com
  mcp-fetch-cli.js https://example.com output.md

Options:
  url           URL to fetch (required)
  output-file   Save to file instead of stdout (optional)
`);
  process.exit(1);
}

async function fetchMarkdown(url) {
  return new Promise((resolve, reject) => {
    // Start the MCP server
    const mcp = spawn('node', [MCP_SERVER_PATH]);

    let responseData = '';
    let initialized = false;
    let requestId = 1;

    // Handle server output
    const rl = createInterface({
      input: mcp.stdout,
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);

        // Handle initialization response
        if (msg.id === 0) {
          initialized = true;
          // Send the fetch request
          const request = {
            jsonrpc: '2.0',
            id: requestId++,
            method: 'tools/call',
            params: {
              name: 'fetch_markdown',
              arguments: {
                url,  // URL is passed as-is (language parameter added by caller if needed)
                max_length: 1000000,  // 1MB should be enough for any API doc
                headers: {
                  'Accept-Language': 'en-US,en;q=0.9'
                }
              }
            }
          };
          mcp.stdin.write(JSON.stringify(request) + '\n');
        }

        // Handle fetch response
        if (msg.result && msg.result.content) {
          const content = msg.result.content.find(c => c.type === 'text');
          if (content) {
            resolve(content.text);
            mcp.kill();
          }
        }

        // Handle errors
        if (msg.error) {
          reject(new Error(msg.error.message || 'MCP server error'));
          mcp.kill();
        }
      } catch (e) {
        // Ignore non-JSON lines
      }
    });

    // Handle server errors
    mcp.stderr.on('data', (data) => {
      console.error('MCP stderr:', data.toString());
    });

    mcp.on('error', (err) => {
      reject(err);
    });

    mcp.on('close', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`MCP server exited with code ${code}`));
      }
    });

    // Initialize the server
    const initRequest = {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'mcp-fetch-cli',
          version: '1.0.0'
        }
      }
    };

    mcp.stdin.write(JSON.stringify(initRequest) + '\n');
  });
}

function cleanMarkdown(markdown) {
  // For Chrome API docs, strip everything before the main content
  // The actual content starts with "chrome.xxx Stay organized..." pattern
  const lines = markdown.split('\n');
  let startIndex = -1;

  // Find where actual content starts (after navigation)
  for (let i = 0; i < lines.length; i++) {
    // Look for pattern like "chrome.runtime Stay organized with collections"
    if (lines[i].match(/^chrome\.\w+\s+Stay organized/i)) {
      startIndex = i;
      break;
    }
  }

  // If found, add a proper markdown heading and return
  if (startIndex > 0) {
    const apiName = lines[startIndex].match(/^(chrome\.\w+)/i)[1];
    const cleanedLines = [
      `# ${apiName}`,
      '',
      ...lines.slice(startIndex + 1)
    ];
    return cleanedLines.join('\n');
  }

  return markdown;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1 || args.includes('-h') || args.includes('--help')) {
    usage();
  }

  const url = args[0];
  const outputFile = args[1];
  const noClean = args.includes('--no-clean');

  try {
    console.error(`Fetching: ${url}`);
    let markdown = await fetchMarkdown(url);

    // Clean up navigation unless --no-clean is specified
    if (!noClean) {
      const originalSize = markdown.length;
      markdown = cleanMarkdown(markdown);
      const removedBytes = originalSize - markdown.length;
      if (removedBytes > 0) {
        console.error(`  Cleaned: removed ${removedBytes} bytes of navigation`);
      }
    }

    if (outputFile) {
      const fs = await import('fs/promises');
      await fs.writeFile(outputFile, markdown);
      console.error(`✓ Saved to ${outputFile}`);
      console.error(`  Size: ${markdown.length} bytes`);
      console.error(`  Lines: ${markdown.split('\n').length}`);
    } else {
      console.log(markdown);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

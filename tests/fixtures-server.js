#!/usr/bin/env node
/**
 * Simple HTTP server for CDP test fixtures
 *
 * Serves ONLY the data/fixtures/ directory
 * Port: 9873 (uncommon to avoid conflicts)
 *
 * Usage: node tests/fixtures-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9873;
const FIXTURES_DIR = path.join(__dirname, '../data/fixtures');

const server = http.createServer((req, res) => {
    // Remove query string and decode URL
    let urlPath = decodeURIComponent(req.url.split('?')[0]);

    // Health check endpoint (lightweight, fast response)
    if (urlPath === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    // Serve index.html for root path
    if (urlPath === '/') {
        urlPath = '/index.html';
    }

    // Security: Only serve files from fixtures directory
    const filePath = path.join(FIXTURES_DIR, urlPath);
    const normalizedPath = path.normalize(filePath);

    // Ensure path is within fixtures directory
    if (!normalizedPath.startsWith(FIXTURES_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden: Path outside fixtures directory');
        return;
    }

    // Serve file
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
            }
            return;
        }

        // Determine content type
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml'
        };

        const contentType = contentTypes[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`✓ Fixtures server running at http://127.0.0.1:${PORT}/`);
    console.log(`✓ Serving directory: ${FIXTURES_DIR}`);
    console.log(`✓ Test URL: http://127.0.0.1:${PORT}/hackernews.html`);
    console.log('\nPress Ctrl+C to stop\n');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
    } else {
        console.error('❌ Server error:', err);
        process.exit(1);
    }
});

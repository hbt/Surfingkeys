# Chrome API Documentation

Local reference documentation for Chrome Extension APIs.

## Updating Documentation

### Regenerate All API Docs

```bash
npm run build:doc-chrome-api
```

This fetches the latest Chrome Extension API documentation for all APIs listed in `apis-to-download.txt`.

### Fetch a Single API

```bash
# From project root
scripts/fetch-chrome-api.sh runtime

# Custom output location
scripts/fetch-chrome-api.sh tabs custom/path/tabs.md
```

### Add New APIs

Edit `docs/chrome-api/apis-to-download.txt` and add the API name, then run:

```bash
npm run build:doc-chrome-api
```

## Implementation Details

The documentation fetcher uses a CLI wrapper around the MCP (Model Context Protocol) fetch server:

1. **`scripts/mcp-fetch-cli.js`** - Node.js wrapper that communicates with MCP server via JSON-RPC
2. **`scripts/fetch-chrome-api.sh`** - Bash script that fetches and post-processes markdown
3. **`scripts/fetch-all-chrome-apis.sh`** - Batch fetcher for all APIs

### How It Works

1. Script calls MCP server with URL
2. MCP server fetches HTML and converts to Markdown using TurndownService
3. Post-processing removes CSS, navigation, and artifacts
4. Clean markdown is saved to `docs/chrome-api/`

### Benefits

- **Zero tokens** - doesn't use Claude Code conversation
- **Automated** - scriptable for batch operations
- **Clean output** - removes navigation and styling artifacts
- **Maintainable** - reuses existing MCP infrastructure

## Available APIs

Core APIs:
- [action](action.md) - Control the extension's toolbar icon
- [runtime](runtime.md) - Extension lifecycle and messaging
- [tabs](tabs.md) - Interact with browser tabs
- [windows](windows.md) - Interact with browser windows
- [storage](storage.md) - Store and retrieve data
- [scripting](scripting.md) - Execute scripts in web pages

Content & UI:
- [contextMenus](contextMenus.md) - Add items to context menus
- [commands](commands.md) - Keyboard shortcuts
- [sidePanel](sidePanel.md) - Side panel UI
- [notifications](notifications.md) - Desktop notifications

Browser Features:
- [bookmarks](bookmarks.md) - Bookmark management
- [history](history.md) - Browser history
- [downloads](downloads.md) - Download management
- [cookies](cookies.md) - Cookie management
- [webNavigation](webNavigation.md) - Navigation events
- [webRequest](webRequest.md) - Network request interception

User Data:
- [identity](identity.md) - User authentication
- [permissions](permissions.md) - Runtime permissions

DevTools (Limited):
- [devtools.inspectedWindow](devtools.inspectedWindow.md)
- [devtools.network](devtools.network.md)
- [devtools.panels](devtools.panels.md)

## External Resources

- [Chrome Extensions API Reference](https://developer.chrome.com/docs/extensions/reference/api)
- [Chrome Extensions Samples](https://github.com/GoogleChrome/chrome-extensions-samples)

## Notes

- DevTools APIs appear to have limited documentation available. For comprehensive DevTools extension documentation, refer to the external resources above.
- This documentation is auto-generated from the Chrome Developers website
- Last updated: Run `npm run build:doc-chrome-api` to refresh

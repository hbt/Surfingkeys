# CDP Debug Tests - Quick Start Guide

## Easy Usage with NPM Scripts

### Prerequisites

**1. Start Chrome**

For headless mode (recommended):
```bash
gchrb-dev-headless
```

For live mode (visible browser):
```bash
gchrb-dev
```

---

## Run Tests (Easy Way)

### Headless Mode (Background Testing)

```bash
# Start headless Chrome once
gchrb-dev-headless

# Run any test in headless mode
npm run test:cdp:debug:headless debug/cdp-test-hints-headless.ts
npm run test:cdp:debug:headless debug/cdp-debug-verify-working.ts
npm run test:cdp:debug:headless debug/cdp-debug-breakpoint-hints.ts
```

**What it does:**
- Copies `.env.headless` to `.env`
- Runs the test with port 9223
- No visible window

### Live Mode (Visible Browser)

```bash
# Start live Chrome once
gchrb-dev

# Run any test in live mode
npm run test:cdp:debug:live debug/cdp-test-hints-headless.ts
npm run test:cdp:debug:live debug/cdp-debug-verify-working.ts
npm run test:cdp:debug:live debug/cdp-debug-breakpoint-hints.ts
```

**What it does:**
- Copies `.env.live` to `.env`
- Runs the test with port 9222
- Visible browser window

---

## Available Test Scripts

All scripts work in both modes:

```bash
# Current state inspection
npm run test:cdp:debug:headless debug/cdp-debug-show-current-state.ts

# Verify Surfingkeys is working (scrolling test)
npm run test:cdp:debug:headless debug/cdp-debug-verify-working.ts

# Breakpoint-style debugging with hints
npm run test:cdp:debug:headless debug/cdp-debug-breakpoint-hints.ts

# Live code modification - scrolling
npm run test:cdp:debug:headless debug/cdp-debug-live-modification-scrolling.ts

# Live code modification - clipboard
npm run test:cdp:debug:headless debug/cdp-debug-live-modification-clipboard.ts

# Live code modification - tabs
npm run test:cdp:debug:headless debug/cdp-debug-live-modification-tabs.ts

# Full demo of all capabilities
npm run test:cdp:debug:headless debug/cdp-debug-full-demo.ts

# Headless-specific test
npm run test:cdp:debug:headless debug/cdp-test-hints-headless.ts
```

---

## Configuration Files

Three preset configurations are available:

- **`.env.live`** - Port 9222, live mode (visible browser)
- **`.env.headless`** - Port 9223, headless mode (no window)
- **`.env`** - Active configuration (auto-managed by npm scripts)

---

## How It Works

### NPM Scripts

In `package.json`:
```json
{
  "test:cdp:debug:live": "cp .env.live .env && npx ts-node",
  "test:cdp:debug:headless": "cp .env.headless .env && npx ts-node"
}
```

**What happens:**
1. Copies the appropriate `.env.{mode}` file to `.env`
2. Runs `npx ts-node <your-test-file>`
3. Test loads configuration from `.env` via `debug/config/cdp-config.ts`

### Configuration Loading

All tests import:
```typescript
import { CDP_CONFIG } from './config/cdp-config';
```

This module:
- Loads `.env` using `dotenv`
- Provides `CDP_CONFIG.endpoint` (http://localhost:9222 or 9223)
- Validates port and mode settings

---

## Examples

### Example 1: Quick Test in Headless

```bash
# Terminal 1: Start headless Chrome
gchrb-dev-headless

# Terminal 2: Run test
npm run test:cdp:debug:headless debug/cdp-debug-verify-working.ts
```

### Example 2: Debug Visually in Live Mode

```bash
# Terminal 1: Start live Chrome
gchrb-dev

# Terminal 2: Run test and watch what happens
npm run test:cdp:debug:live debug/cdp-debug-breakpoint-hints.ts
```

### Example 3: Switch Between Modes

```bash
# Test in headless
npm run test:cdp:debug:headless debug/cdp-test-hints-headless.ts

# Same test in live mode (after starting gchrb-dev)
npm run test:cdp:debug:live debug/cdp-test-hints-headless.ts
```

---

## Troubleshooting

### Error: "Chrome not running on http://localhost:XXXX"

**Solution:** Start Chrome with the appropriate script:
```bash
# For headless tests (port 9223)
gchrb-dev-headless

# For live tests (port 9222)
gchrb-dev
```

### Error: "Surfingkeys background not found"

**Solution:** Chrome is running but extension not loaded. Restart:
```bash
pkill -f chrome.*9223
gchrb-dev-headless
```

### Check if Chrome is Running

```bash
# Check headless (port 9223)
curl -s http://localhost:9223/json/version | jq -r '.Browser'

# Check live (port 9222)
curl -s http://localhost:9222/json/version | jq -r '.Browser'
```

---

## Manual Configuration (Advanced)

If you prefer manual control:

```bash
# Copy preset
cp .env.headless .env

# Or edit directly
echo "CDP_PORT=9223
CDP_MODE=headless
CDP_HOST=localhost" > .env

# Run test directly
npx ts-node debug/cdp-test-hints-headless.ts
```

---

## Summary

**Easiest workflow:**

1. Start Chrome: `gchrb-dev-headless`
2. Run any test: `npm run test:cdp:debug:headless debug/<test-file>.ts`
3. Done!

**That's it!** The npm scripts handle all the configuration for you.

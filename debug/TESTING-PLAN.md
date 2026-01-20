# CDP Testing Infrastructure Plan

## Vision

Create a flexible, scalable testing infrastructure that supports:
1. **Development Mode**: Visual debugging with live browser
2. **Headless Mode**: Background testing without focus stealing
3. **Parallel Testing**: Multiple isolated test instances running simultaneously

## Current State

### What We Have
- Multiple debug scripts in `debug/` directory
- Hard-coded port numbers (9222 for live, 9223 for headless)
- Manual switching between live and headless requires running different Chrome instances
- Tests work in both modes but require manual setup

### Current Scripts
```
debug/
├── cdp-debug-show-current-state.ts
├── cdp-debug-verify-working.ts
├── cdp-debug-breakpoint-hints.ts
├── cdp-debug-live-modification-scrolling.ts
├── cdp-debug-live-modification-clipboard.ts
├── cdp-debug-full-demo.ts
├── cdp-test-hints-no-focus.ts
└── cdp-test-hints-headless.ts
```

**Problem**: Each script hard-codes port numbers like:
```typescript
http.get('http://localhost:9222/json', ...)
```

---

## Phase 1: Flexible Mode Switching

### Goal
Run any test in either live or headless mode by changing a single environment variable.

### Implementation

#### 1.1 Environment Configuration

Create `.env` file in project root:
```env
# CDP Testing Configuration
CDP_PORT=9222          # Port for Chrome DevTools Protocol
CDP_MODE=live          # 'live' or 'headless'
```

Or use `.env.live` and `.env.headless` for different profiles.

#### 1.2 Centralized CDP Configuration

Create `debug/cdp-config.ts`:
```typescript
import * as dotenv from 'dotenv';

dotenv.config();

export const CDP_CONFIG = {
    port: parseInt(process.env.CDP_PORT || '9222', 10),
    mode: process.env.CDP_MODE || 'live',
    host: process.env.CDP_HOST || 'localhost',

    get endpoint() {
        return `http://${this.host}:${this.port}`;
    },

    get wsEndpoint() {
        return `ws://${this.host}:${this.port}`;
    }
};

// Validate configuration
if (![9222, 9223].includes(CDP_CONFIG.port)) {
    console.warn(`Warning: Using non-standard port ${CDP_CONFIG.port}`);
}
```

#### 1.3 Update All Scripts

Replace hard-coded ports:
```typescript
// Before:
http.get('http://localhost:9222/json', ...)

// After:
import { CDP_CONFIG } from './cdp-config';
http.get(`${CDP_CONFIG.endpoint}/json`, ...)
```

#### 1.4 Chrome Launcher Abstraction

Update launch scripts to respect environment:
```bash
# gchrb-dev (live mode)
PORT=${CDP_PORT:-9222}
google-chrome-beta --remote-debugging-port=$PORT ...

# gchrb-dev-headless (headless mode)
PORT=${CDP_PORT:-9223}
google-chrome-beta --headless=new --remote-debugging-port=$PORT ...
```

#### 1.5 Test Runner Helper

Create `debug/run-test.sh`:
```bash
#!/bin/bash
# Usage: ./run-test.sh [live|headless] <test-file>

MODE=$1
TEST_FILE=$2

if [ "$MODE" = "live" ]; then
    export CDP_PORT=9222
    export CDP_MODE=live
    echo "Running in LIVE mode (visible browser) on port 9222"
elif [ "$MODE" = "headless" ]; then
    export CDP_PORT=9223
    export CDP_MODE=headless
    echo "Running in HEADLESS mode (no window) on port 9223"
else
    echo "Usage: $0 [live|headless] <test-file>"
    exit 1
fi

npx ts-node "$TEST_FILE"
```

**Usage Examples**:
```bash
# Run test in live mode (see browser)
./run-test.sh live debug/cdp-debug-breakpoint-hints.ts

# Run same test in headless (background)
./run-test.sh headless debug/cdp-debug-breakpoint-hints.ts
```

### Benefits of Phase 1
- ✅ One codebase for both modes
- ✅ Easy switching via environment variable
- ✅ Consistent behavior across all tests
- ✅ No code duplication

---

## Phase 2: Parallel Testing Infrastructure

### Goal
Run multiple tests simultaneously in complete isolation using dynamic port allocation and temporary profiles.

### Architecture

```
Test Orchestrator
├── Spawns N Chrome instances (headless)
│   ├── Instance 1: Port 9300, /tmp/chrome-test-abc123
│   ├── Instance 2: Port 9301, /tmp/chrome-test-def456
│   └── Instance N: Port 930N, /tmp/chrome-test-xyz789
│
├── Runs tests in parallel
│   ├── Test 1 → Instance 1
│   ├── Test 2 → Instance 2
│   └── Test N → Instance N
│
└── Collects results and reports
```

### Implementation

#### 2.1 Dynamic Port Allocation

Create `debug/port-manager.ts`:
```typescript
export class PortManager {
    private static BASE_PORT = 9300;
    private static usedPorts = new Set<number>();

    static allocate(): number {
        let port = this.BASE_PORT;
        while (this.usedPorts.has(port)) {
            port++;
        }
        this.usedPorts.add(port);
        return port;
    }

    static release(port: number): void {
        this.usedPorts.delete(port);
    }
}
```

#### 2.2 Isolated Chrome Instance Manager

Create `debug/chrome-instance.ts`:
```typescript
import { spawn } from 'child_process';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export class ChromeInstance {
    private port: number;
    private userDataDir: string;
    private process: any;

    constructor(port: number) {
        this.port = port;
        // Create temp directory: /tmp/chrome-test-1737393024-abc123
        this.userDataDir = mkdtempSync(
            join(tmpdir(), `chrome-test-${Date.now()}-`)
        );
    }

    async start(extensionPath: string): Promise<void> {
        this.process = spawn('/usr/bin/google-chrome-beta', [
            '--headless=new',
            `--user-data-dir=${this.userDataDir}`,
            `--remote-debugging-port=${this.port}`,
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            `--load-extension=${extensionPath}`
        ], {
            detached: true,
            stdio: 'ignore'
        });

        // Wait for Chrome to be ready
        await this.waitForReady();
    }

    async stop(): Promise<void> {
        if (this.process) {
            this.process.kill();
        }
        // Cleanup temp directory
        // rm -rf ${this.userDataDir}
    }

    getPort(): number {
        return this.port;
    }

    private async waitForReady(): Promise<void> {
        // Poll CDP endpoint until ready
        const maxAttempts = 30;
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await fetch(
                    `http://localhost:${this.port}/json/version`
                );
                if (response.ok) return;
            } catch {}
            await new Promise(r => setTimeout(r, 100));
        }
        throw new Error('Chrome failed to start');
    }
}
```

#### 2.3 Test Orchestrator

Create `debug/test-orchestrator.ts`:
```typescript
import { ChromeInstance } from './chrome-instance';
import { PortManager } from './port-manager';

export class TestOrchestrator {
    private instances: Map<string, ChromeInstance> = new Map();

    async runTestsInParallel(
        testFiles: string[],
        extensionPath: string
    ): Promise<TestResult[]> {

        const results: TestResult[] = [];

        // Start Chrome instances
        const instances = await Promise.all(
            testFiles.map(async (testFile) => {
                const port = PortManager.allocate();
                const instance = new ChromeInstance(port);
                await instance.start(extensionPath);
                this.instances.set(testFile, instance);
                return { testFile, instance };
            })
        );

        // Run tests in parallel
        const testPromises = instances.map(({ testFile, instance }) => {
            return this.runTest(testFile, instance.getPort());
        });

        const testResults = await Promise.allSettled(testPromises);

        // Cleanup
        await Promise.all(
            Array.from(this.instances.values()).map(i => i.stop())
        );

        return this.processResults(testResults);
    }

    private async runTest(
        testFile: string,
        port: number
    ): Promise<TestResult> {
        // Set environment for this test
        process.env.CDP_PORT = port.toString();

        // Execute test
        // const { exec } = require('child_process');
        // return new Promise((resolve) => {
        //     exec(`npx ts-node ${testFile}`, (error, stdout, stderr) => {
        //         resolve({ testFile, success: !error, output: stdout });
        //     });
        // });
    }
}
```

#### 2.4 CLI Tool

Create `debug/run-parallel.ts`:
```typescript
#!/usr/bin/env ts-node

import { TestOrchestrator } from './test-orchestrator';
import * as glob from 'glob';

async function main() {
    const args = process.argv.slice(2);

    // Find all test files or use specified pattern
    const pattern = args[0] || 'debug/cdp-*.ts';
    const testFiles = glob.sync(pattern);

    console.log(`Running ${testFiles.length} tests in parallel...\n`);

    const orchestrator = new TestOrchestrator();
    const results = await orchestrator.runTestsInParallel(
        testFiles,
        '/home/hassen/workspace/surfingkeys/dist-esbuild/development/chrome'
    );

    // Report results
    console.log('\n=== Test Results ===\n');
    results.forEach(result => {
        const status = result.success ? '✅' : '❌';
        console.log(`${status} ${result.testFile}`);
    });

    const passed = results.filter(r => r.success).length;
    console.log(`\n${passed}/${results.length} tests passed`);

    process.exit(passed === results.length ? 0 : 1);
}

main();
```

**Usage**:
```bash
# Run all tests in parallel
npx ts-node debug/run-parallel.ts

# Run specific tests
npx ts-node debug/run-parallel.ts "debug/cdp-debug-*.ts"
```

### Benefits of Phase 2
- ✅ Complete test isolation (separate ports + profiles)
- ✅ No interference between tests
- ✅ Massive speedup (N tests run in ~same time as 1)
- ✅ Clean temporary directories after run
- ✅ CI/CD friendly
- ✅ Easy to scale to hundreds of tests

---

## Phase 3: Enhanced Features (Future)

### 3.1 Test Reporter
- HTML report generation
- Screenshots on failure
- Test timing statistics
- Flaky test detection

### 3.2 Smart Resource Management
- Chrome instance pooling (reuse instances)
- Automatic port conflict resolution
- Memory usage monitoring
- Automatic cleanup on crash

### 3.3 CI/CD Integration
- GitHub Actions workflow
- Test matrix (different Chrome versions)
- Automated performance regression detection

---

## Migration Path

### Step 1: Environment Variables (Week 1)
1. Add `dotenv` to dependencies
2. Create `cdp-config.ts`
3. Update 1-2 test scripts as proof of concept
4. Test in both modes

### Step 2: Complete Migration (Week 1-2)
1. Update all remaining scripts
2. Create `run-test.sh` helper
3. Document usage in README

### Step 3: Parallel Infrastructure (Week 2-3)
1. Implement port manager
2. Implement Chrome instance manager
3. Create test orchestrator
4. Build CLI tool

### Step 4: Polish & Documentation (Week 3-4)
1. Add error handling
2. Write comprehensive tests
3. Create user documentation
4. CI/CD integration

---

## File Structure (After Implementation)

```
debug/
├── README.md                           # Updated with new usage
├── TESTING-PLAN.md                     # This document
├── .env.example                        # Example configuration
│
├── config/
│   ├── cdp-config.ts                   # Centralized config
│   └── port-manager.ts                 # Port allocation
│
├── infrastructure/
│   ├── chrome-instance.ts              # Chrome lifecycle
│   ├── test-orchestrator.ts            # Parallel test runner
│   └── test-reporter.ts                # Results aggregation
│
├── scripts/
│   ├── run-test.sh                     # Single test runner
│   └── run-parallel.ts                 # Parallel test runner
│
└── tests/
    ├── cdp-debug-show-current-state.ts
    ├── cdp-debug-verify-working.ts
    ├── cdp-debug-breakpoint-hints.ts
    └── ... (all migrated to use cdp-config)
```

---

## Success Metrics

### Phase 1
- ✅ All tests run in both live and headless modes
- ✅ No hard-coded ports in test files
- ✅ Simple mode switching via environment variable

### Phase 2
- ✅ Run 10 tests in parallel in < 30 seconds
- ✅ Zero test interference
- ✅ Automatic cleanup of temp resources
- ✅ Clear test results reporting

### Phase 3
- ✅ CI/CD pipeline integration
- ✅ 100+ tests running in < 2 minutes
- ✅ Automated regression detection

---

## Questions to Clarify

1. **Scope**: Do we want to migrate ALL existing scripts or just the main ones?

2. **Dependencies**: Are we okay adding `dotenv` as a dependency?

3. **Naming**:
   - "live mode" vs "visible mode" vs "interactive mode"?
   - "headless mode" vs "background mode"?

4. **Parallel Limits**: How many tests should we run in parallel? (CPU cores? Fixed number like 10?)

5. **Cleanup Strategy**: Keep temp directories on failure for debugging, or always clean?

6. **Port Range**: Start at 9300 and increment, or use random ports?

---

## Next Steps

**Immediate**:
1. Confirm this plan aligns with your vision
2. Choose naming conventions
3. Add `dotenv` dependency

**Then**:
1. Create `cdp-config.ts`
2. Migrate 1-2 scripts as proof of concept
3. Test both modes thoroughly
4. Proceed with full migration

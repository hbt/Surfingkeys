# Phase 2: Parallel Testing Infrastructure - Implementation Prompt

## Context: Phase 1 Completion Status

**Phase 1 is COMPLETE** ✅

All groundwork has been laid:
- ✅ All 8 debug scripts refactored to use `debug/config/cdp-config.ts`
- ✅ Environment-based configuration via `.env` file
- ✅ Flexible mode switching (live vs headless)
- ✅ `run-test.sh` helper script created
- ✅ Documentation updated in `debug/README.md`
- ✅ Committed: `5ffef5e [feat] Phase 1: Flexible CDP testing with environment-based configuration`

**Verification Commands:**
```bash
# All scripts use CDP_CONFIG
grep -l "CDP_CONFIG" debug/cdp-*.ts

# Configuration exists
ls debug/config/cdp-config.ts
ls .env.example
ls debug/run-test.sh

# Test switching modes
echo "CDP_PORT=9223" > .env
npx ts-node debug/cdp-test-hints-headless.ts
```

---

## Phase 2 Goal

Build a **parallel testing infrastructure** that enables:
1. Running multiple tests simultaneously in complete isolation
2. Dynamic port allocation (9300+)
3. Temporary Chrome instances with unique user-data directories
4. Automatic resource cleanup
5. Aggregated test results reporting

---

## Architecture Overview

```
Test Orchestrator (run-parallel.ts)
│
├─ Port Manager
│  └─ Allocates: 9300, 9301, 9302, ...
│
├─ Chrome Instance Manager
│  ├─ Instance 1: Port 9300, /tmp/chrome-test-{uuid1}
│  ├─ Instance 2: Port 9301, /tmp/chrome-test-{uuid2}
│  └─ Instance N: Port 930N, /tmp/chrome-test-{uuidN}
│
├─ Test Runner
│  ├─ Spawns N test processes with unique CDP_PORT
│  └─ Runs tests in parallel
│
└─ Result Aggregator
   └─ Collects pass/fail + timing + outputs
```

---

## Implementation Tasks

### Task 1: Port Manager

**File**: `debug/infrastructure/port-manager.ts`

```typescript
/**
 * Port Manager - Dynamic port allocation for parallel tests
 *
 * Manages a pool of available ports starting from BASE_PORT (9300).
 * Ensures no port conflicts between concurrent test instances.
 */

export class PortManager {
    private static BASE_PORT = 9300;
    private static MAX_PORT = 9399; // 100 concurrent tests max
    private static usedPorts = new Set<number>();

    /**
     * Allocate next available port
     * @returns {number} Available port number
     * @throws {Error} If no ports available
     */
    static allocate(): number {
        for (let port = this.BASE_PORT; port <= this.MAX_PORT; port++) {
            if (!this.usedPorts.has(port)) {
                this.usedPorts.add(port);
                return port;
            }
        }
        throw new Error('No available ports in range 9300-9399');
    }

    /**
     * Release a port back to the pool
     */
    static release(port: number): void {
        this.usedPorts.delete(port);
    }

    /**
     * Get all currently allocated ports
     */
    static getAllocated(): number[] {
        return Array.from(this.usedPorts);
    }

    /**
     * Reset all allocations (for testing)
     */
    static reset(): void {
        this.usedPorts.clear();
    }
}
```

**Test this**:
```typescript
const port1 = PortManager.allocate(); // 9300
const port2 = PortManager.allocate(); // 9301
PortManager.release(port1);
const port3 = PortManager.allocate(); // 9300 (reused)
```

---

### Task 2: Chrome Instance Manager

**File**: `debug/infrastructure/chrome-instance.ts`

```typescript
/**
 * Chrome Instance Manager - Lifecycle management for isolated Chrome instances
 *
 * Each instance gets:
 * - Unique port
 * - Temporary user-data directory
 * - Surfingkeys extension pre-loaded
 * - Headless mode by default
 */

import { spawn, ChildProcess } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as http from 'http';

export interface ChromeInstanceOptions {
    port: number;
    extensionPath: string;
    headless?: boolean;
    userDataDir?: string; // Optional: specify custom dir
}

export class ChromeInstance {
    private port: number;
    private userDataDir: string;
    private process: ChildProcess | null = null;
    private extensionPath: string;
    private headless: boolean;

    constructor(options: ChromeInstanceOptions) {
        this.port = options.port;
        this.extensionPath = options.extensionPath;
        this.headless = options.headless !== false; // default true

        // Create temporary user-data directory
        if (options.userDataDir) {
            this.userDataDir = options.userDataDir;
        } else {
            this.userDataDir = mkdtempSync(
                join(tmpdir(), `chrome-test-${Date.now()}-`)
            );
        }
    }

    /**
     * Start Chrome instance
     */
    async start(): Promise<void> {
        const args = [
            this.headless ? '--headless=new' : '',
            `--user-data-dir=${this.userDataDir}`,
            `--remote-debugging-port=${this.port}`,
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            `--disable-extensions-except=${this.extensionPath}`,
            `--load-extension=${this.extensionPath}`
        ].filter(Boolean);

        this.process = spawn('/usr/bin/google-chrome-beta', args, {
            detached: true,
            stdio: 'ignore'
        });

        // Wait for Chrome to be ready
        await this.waitForReady();
    }

    /**
     * Stop Chrome instance and cleanup
     */
    async stop(): Promise<void> {
        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }

        // Cleanup temp directory
        try {
            rmSync(this.userDataDir, { recursive: true, force: true });
        } catch (error) {
            console.warn(`Failed to cleanup ${this.userDataDir}:`, error);
        }
    }

    /**
     * Get port number
     */
    getPort(): number {
        return this.port;
    }

    /**
     * Get user data directory path
     */
    getUserDataDir(): string {
        return this.userDataDir;
    }

    /**
     * Wait for Chrome to be ready (CDP endpoint responding)
     */
    private async waitForReady(maxAttempts = 30): Promise<void> {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const ready = await this.checkCDP();
                if (ready) return;
            } catch {}
            await new Promise(r => setTimeout(r, 100));
        }
        throw new Error(`Chrome on port ${this.port} failed to start after ${maxAttempts * 100}ms`);
    }

    /**
     * Check if CDP endpoint is responding
     */
    private checkCDP(): Promise<boolean> {
        return new Promise((resolve) => {
            const req = http.get(`http://localhost:${this.port}/json/version`, (res) => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(1000, () => {
                req.destroy();
                resolve(false);
            });
        });
    }
}
```

**Test this**:
```typescript
const instance = new ChromeInstance({
    port: 9300,
    extensionPath: '/path/to/surfingkeys'
});
await instance.start();
console.log('Chrome ready on port', instance.getPort());
await instance.stop();
```

---

### Task 3: Test Orchestrator

**File**: `debug/infrastructure/test-orchestrator.ts`

```typescript
/**
 * Test Orchestrator - Parallel test execution coordinator
 *
 * Responsibilities:
 * - Spawn N Chrome instances
 * - Run tests in parallel with isolated environments
 * - Collect results
 * - Cleanup resources
 */

import { ChromeInstance } from './chrome-instance';
import { PortManager } from './port-manager';
import { spawn } from 'child_process';
import * as path from 'path';

export interface TestResult {
    testFile: string;
    success: boolean;
    duration: number; // milliseconds
    output: string;
    error?: string;
    port: number;
}

export class TestOrchestrator {
    private instances: Map<string, ChromeInstance> = new Map();
    private extensionPath: string;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
    }

    /**
     * Run multiple tests in parallel
     * @param testFiles Array of test file paths
     * @returns Array of test results
     */
    async runTestsInParallel(testFiles: string[]): Promise<TestResult[]> {
        console.log(`\nStarting ${testFiles.length} tests in parallel...\n`);

        // Phase 1: Start Chrome instances
        const instances = await this.startChromeInstances(testFiles);

        // Phase 2: Run tests in parallel
        const testPromises = instances.map(({ testFile, instance }) => {
            return this.runTest(testFile, instance.getPort());
        });

        const results = await Promise.allSettled(testPromises);

        // Phase 3: Cleanup
        await this.cleanup();

        // Phase 4: Process results
        return this.processResults(results, instances);
    }

    /**
     * Start Chrome instance for each test
     */
    private async startChromeInstances(
        testFiles: string[]
    ): Promise<Array<{ testFile: string; instance: ChromeInstance }>> {
        const instances = [];

        for (const testFile of testFiles) {
            const port = PortManager.allocate();
            const instance = new ChromeInstance({
                port,
                extensionPath: this.extensionPath,
                headless: true
            });

            console.log(`Starting Chrome on port ${port} for ${path.basename(testFile)}...`);
            await instance.start();

            this.instances.set(testFile, instance);
            instances.push({ testFile, instance });
        }

        return instances;
    }

    /**
     * Run a single test with specific port
     */
    private async runTest(testFile: string, port: number): Promise<TestResult> {
        const startTime = Date.now();

        return new Promise((resolve) => {
            let output = '';

            const testProcess = spawn('npx', ['ts-node', testFile], {
                env: {
                    ...process.env,
                    CDP_PORT: port.toString(),
                    CDP_MODE: 'headless'
                }
            });

            testProcess.stdout?.on('data', (data) => {
                output += data.toString();
            });

            testProcess.stderr?.on('data', (data) => {
                output += data.toString();
            });

            testProcess.on('close', (code) => {
                const duration = Date.now() - startTime;
                resolve({
                    testFile,
                    success: code === 0,
                    duration,
                    output,
                    error: code !== 0 ? `Exit code: ${code}` : undefined,
                    port
                });
            });
        });
    }

    /**
     * Cleanup all Chrome instances
     */
    private async cleanup(): Promise<void> {
        console.log('\nCleaning up Chrome instances...');

        const cleanupPromises = Array.from(this.instances.values()).map(
            instance => instance.stop()
        );

        await Promise.all(cleanupPromises);

        // Release all ports
        PortManager.reset();

        console.log('✓ Cleanup complete\n');
    }

    /**
     * Process test results from Promise.allSettled
     */
    private processResults(
        results: PromiseSettledResult<TestResult>[],
        instances: Array<{ testFile: string; instance: ChromeInstance }>
    ): TestResult[] {
        return results.map((result, index) => {
            const { testFile, instance } = instances[index];

            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                return {
                    testFile,
                    success: false,
                    duration: 0,
                    output: '',
                    error: result.reason?.message || 'Unknown error',
                    port: instance.getPort()
                };
            }
        });
    }
}
```

---

### Task 4: CLI Tool

**File**: `debug/run-parallel.ts`

```typescript
#!/usr/bin/env ts-node
/**
 * Parallel Test Runner - CLI tool for running multiple tests concurrently
 *
 * Usage:
 *   npx ts-node debug/run-parallel.ts                    # Run all tests
 *   npx ts-node debug/run-parallel.ts debug/cdp-*.ts     # Pattern
 *   npx ts-node debug/run-parallel.ts test1.ts test2.ts  # Specific tests
 */

import { TestOrchestrator } from './infrastructure/test-orchestrator';
import * as glob from 'glob';
import * as path from 'path';

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m'
};

async function main() {
    const args = process.argv.slice(2);

    // Determine test files
    let testFiles: string[];

    if (args.length === 0) {
        // Default: all CDP test files
        testFiles = glob.sync('debug/cdp-*.ts');
    } else if (args.length === 1 && args[0].includes('*')) {
        // Pattern provided
        testFiles = glob.sync(args[0]);
    } else {
        // Specific files provided
        testFiles = args;
    }

    if (testFiles.length === 0) {
        console.error('No test files found');
        process.exit(1);
    }

    console.log(`${colors.cyan}═══════════════════════════════════════════════════`);
    console.log(`CDP Parallel Test Runner`);
    console.log(`═══════════════════════════════════════════════════${colors.reset}\n`);

    console.log(`Running ${testFiles.length} tests in parallel:\n`);
    testFiles.forEach((file, i) => {
        console.log(`  ${i + 1}. ${path.basename(file)}`);
    });
    console.log('');

    // Extension path
    const extensionPath = path.resolve(
        __dirname,
        '../dist-esbuild/development/chrome'
    );

    // Run tests
    const orchestrator = new TestOrchestrator(extensionPath);
    const results = await orchestrator.runTestsInParallel(testFiles);

    // Display results
    console.log(`${colors.cyan}═══════════════════════════════════════════════════`);
    console.log(`Test Results`);
    console.log(`═══════════════════════════════════════════════════${colors.reset}\n`);

    let longestName = 0;
    results.forEach(r => {
        const name = path.basename(r.testFile);
        if (name.length > longestName) longestName = name.length;
    });

    results.forEach(result => {
        const name = path.basename(result.testFile).padEnd(longestName);
        const status = result.success
            ? `${colors.green}✓ PASS${colors.reset}`
            : `${colors.red}✗ FAIL${colors.reset}`;
        const time = `${result.duration}ms`.padStart(8);
        const port = `port ${result.port}`.padStart(10);

        console.log(`${status}  ${name}  ${time}  ${port}`);

        if (!result.success && result.error) {
            console.log(`       ${colors.red}Error: ${result.error}${colors.reset}`);
        }
    });

    // Summary
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\n${colors.cyan}─────────────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.green}${passed} passed${colors.reset}, ${colors.red}${failed} failed${colors.reset}, ${results.length} total`);
    console.log(`Total time: ${totalTime}ms (${(totalTime / results.length).toFixed(0)}ms avg)`);
    console.log(`Parallelization: ${(results.length * results[0]?.duration / totalTime).toFixed(1)}x speedup`);
    console.log('');

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
```

Make executable:
```bash
chmod +x debug/run-parallel.ts
```

---

## Testing Phase 2

### Step 1: Unit Test Components

```bash
# Test port manager
npx ts-node -e "
import { PortManager } from './debug/infrastructure/port-manager';
const p1 = PortManager.allocate();
const p2 = PortManager.allocate();
console.log('Allocated ports:', p1, p2);
"

# Test Chrome instance
npx ts-node -e "
import { ChromeInstance } from './debug/infrastructure/chrome-instance';
const instance = new ChromeInstance({
    port: 9300,
    extensionPath: './dist-esbuild/development/chrome'
});
await instance.start();
console.log('Chrome started on', instance.getPort());
await instance.stop();
"
```

### Step 2: Test with 2 Tests

```bash
npx ts-node debug/run-parallel.ts \
    debug/cdp-debug-show-current-state.ts \
    debug/cdp-debug-verify-working.ts
```

### Step 3: Test with All Tests

```bash
npx ts-node debug/run-parallel.ts
```

### Step 4: Verify Isolation

Ensure tests don't interfere:
- Different ports used (check logs)
- Temp directories created and cleaned
- All tests pass independently

---

## Success Criteria

Phase 2 is complete when:

1. ✅ All infrastructure files created and working
2. ✅ `run-parallel.ts` executes multiple tests concurrently
3. ✅ Each test gets isolated Chrome instance
4. ✅ Tests complete faster than sequential execution
5. ✅ Cleanup happens automatically (no leftover processes/directories)
6. ✅ Clear results reporting with pass/fail/timing
7. ✅ All tests pass in parallel mode

---

## Commit When Done

```bash
git add debug/infrastructure/
git add debug/run-parallel.ts
git add debug/TESTING-PLAN.md  # Update with Phase 2 results

git commit -m "[feat] Phase 2: Parallel testing infrastructure

Implemented parallel test execution with complete isolation.
Tests can now run concurrently with automatic resource management.

Changes:
- Created infrastructure/port-manager.ts for dynamic port allocation
- Created infrastructure/chrome-instance.ts for Chrome lifecycle management
- Created infrastructure/test-orchestrator.ts for coordinating parallel tests
- Created run-parallel.ts CLI tool for executing tests concurrently
- Tests use unique ports (9300+) and temporary user-data directories
- Automatic cleanup of Chrome processes and temp files

Performance:
- [X] tests complete in [Y]ms vs [Z]ms sequential
- [N]x speedup achieved through parallelization

All [X] tests pass in parallel mode with complete isolation.

UUID: $(uuidgen)

#phase2 #parallel-testing #scalability #performance #infrastructure #complete"
```

---

## Expected Outcome

After Phase 2:
- Run 8 tests in ~5-10 seconds (instead of 60+ seconds sequential)
- Complete isolation between tests
- Easy to add more tests without worrying about conflicts
- Foundation for CI/CD integration
- Scalable to 100+ tests

---

## Troubleshooting

**Issue**: Chrome instances don't start
- Check: `gchrb-dev-headless` command works manually
- Check: Extension path is correct
- Check: Ports 9300-9399 are available

**Issue**: Tests interfere with each other
- Verify: Each test uses different port (check logs)
- Verify: Temp directories are unique
- Verify: Extension loads properly in each instance

**Issue**: Cleanup fails
- Check: Chrome processes with `ps aux | grep chrome`
- Check: Temp dirs with `ls /tmp/chrome-test-*`
- Manual cleanup: `pkill -f chrome.*9[3-9][0-9][0-9]`

---

## Next Steps After Phase 2

Once Phase 2 is complete, consider:
- CI/CD integration (GitHub Actions)
- HTML test report generation
- Screenshot capture on failure
- Performance regression detection
- Test retries for flaky tests

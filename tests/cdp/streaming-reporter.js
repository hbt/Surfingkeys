/**
 * Streaming Jest Reporter
 *
 * Prints test results immediately as they complete instead of buffering.
 */

class StreamingReporter {
    constructor(globalConfig, options) {
        this._globalConfig = globalConfig;
        this._options = options;
    }

    onRunStart() {
        // Test run started
    }

    onTestStart(test) {
        // Individual test file started
    }

    onTestCaseResult(test, testCaseResult) {
        // Print result for this individual test case immediately as it completes
        const status = testCaseResult.status === 'passed' ? '✓' : '✕';
        const color = testCaseResult.status === 'passed' ? '\x1b[32m' : '\x1b[31m';
        const reset = '\x1b[0m';
        const dim = '\x1b[2m';

        const duration = testCaseResult.duration ? ` ${dim}(${testCaseResult.duration}ms)${reset}` : '';
        const testName = testCaseResult.ancestorTitles.concat(testCaseResult.title).join(' › ');

        console.log(`  ${color}${status}${reset} ${dim}${testName}${duration}${reset}`);
    }

    onTestResult(test, testResult, aggregatedResult) {
        // Test file completed - no need to print anything, already printed per-test
    }

    onRunComplete(contexts, results) {
        // Print final summary
        const { numPassedTests, numFailedTests, numTotalTests } = results;

        console.log();
        if (numFailedTests > 0) {
            console.log(`\x1b[31m✕ ${numFailedTests} failed\x1b[0m, ${numPassedTests} passed, ${numTotalTests} total`);
        } else {
            console.log(`\x1b[32m✓ All tests passed\x1b[0m (${numTotalTests} total)`);
        }
    }
}

module.exports = StreamingReporter;

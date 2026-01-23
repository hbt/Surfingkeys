/**
 * Custom Jest Reporter - JSON Output
 *
 * This reporter outputs test results in a structured JSON format,
 * including coverage references and test metadata.
 *
 * Compatible with Bun's Jest integration.
 *
 * Usage:
 *   jest --reporters=<path-to-this-file>
 */

const fs = require('fs');
const path = require('path');

class JSONReporter {
    constructor(globalConfig, options = {}) {
        this.globalConfig = globalConfig;
        this.options = options;
        this.startTime = Date.now();
        this.suites = [];
        this.tests = [];
        this.testStartTimes = {};
    }

    /**
     * Called when a test suite starts
     */
    onTestStart(test) {
        this.testStartTimes[test.path] = Date.now();
    }

    /**
     * Called when a test suite result is available
     */
    onTestResult(test, testResult, aggregatedResult) {
        const suiteDuration = Date.now() - this.testStartTimes[test.path];

        // Extract test file relative path
        const testPath = path.relative(this.globalConfig.rootDir, test.path);

        // Build test suite record
        const suite = {
            file: testPath,
            status: testResult.success ? 'passed' : 'failed',
            duration: suiteDuration,
            displayName: testResult.displayName || undefined,
            leaks: testResult.leaks || false,
            memoryUsage: testResult.memoryUsage || undefined,
            openHandles: testResult.openHandles ? testResult.openHandles.length : 0,
            perfStats: testResult.perfStats ? {
                start: testResult.perfStats.start,
                end: testResult.perfStats.end,
                runtime: testResult.perfStats.end - testResult.perfStats.start,
                slow: testResult.perfStats.slow || false
            } : undefined,
            numTests: testResult.numPassingTests + testResult.numFailingTests + testResult.numPendingTests,
            numPassed: testResult.numPassingTests,
            numFailed: testResult.numFailingTests,
            numSkipped: testResult.numPendingTests,
            numTodo: testResult.numTodoTests || 0,
            snapshot: testResult.snapshot ? {
                added: testResult.snapshot.added,
                matched: testResult.snapshot.matched,
                updated: testResult.snapshot.updated,
                unmatched: testResult.snapshot.unmatched,
                unchecked: testResult.snapshot.unchecked,
                fileDeleted: testResult.snapshot.fileDeleted
            } : undefined,
            console: this.extractConsoleOutput(testResult.console),
            tests: testResult.testResults.map(t => ({
                id: t.fullName,
                status: t.status,
                duration: t.duration || 0,
                title: t.title,
                ancestorTitles: t.ancestorTitles || [],
                location: t.location ? {
                    line: t.location.line,
                    column: t.location.column
                } : undefined,
                assertions: {
                    passing: t.numPassingAsserts || 0
                },
                invocations: t.invocations || 1,
                error: t.failureMessages && t.failureMessages.length > 0
                    ? t.failureMessages[0]
                    : null,
                failureDetails: this.extractFailureDetails(t)
            }))
        };

        this.suites.push(suite);
    }

    /**
     * Extract console output from test result
     */
    extractConsoleOutput(consoleBuffer) {
        if (!consoleBuffer || !Array.isArray(consoleBuffer)) {
            return undefined;
        }

        return consoleBuffer.map(entry => ({
            type: entry.type || 'log',
            message: entry.message,
            timestamp: entry.timestamp || Date.now()
        }));
    }

    /**
     * Extract detailed failure information from assertion result
     */
    extractFailureDetails(testResult) {
        if (!testResult.failureDetails || testResult.failureDetails.length === 0) {
            return undefined;
        }

        return testResult.failureDetails.slice(0, 5).map(detail => {
            const parsed = {
                message: typeof detail === 'string' ? detail : detail.message || detail.toString()
            };

            if (typeof detail === 'object' && detail !== null) {
                if (detail.matcherResult) {
                    const mr = detail.matcherResult;
                    parsed.matcher = mr.matcher;
                    parsed.expected = mr.expected;
                    parsed.actual = mr.actual;
                    parsed.pass = mr.pass;
                }
            }

            return parsed;
        });
    }

    /**
     * Called after all tests have run
     */
    onRunComplete(contexts, results) {
        const totalDuration = Date.now() - this.startTime;

        // Look for coverage files
        const coverageDir = '/tmp/cdp-coverage';
        const coverageFile = this.findLatestCoverageFile(coverageDir);

        // Calculate coverage summary if file exists
        let coverageSummary = null;
        if (coverageFile) {
            coverageSummary = this.extractCoverageSummary(coverageFile);
        }

        // Count slow tests and total assertions
        const slowTestCount = this.suites.filter(s => s.perfStats && s.perfStats.slow).length;
        const totalAssertions = this.suites.reduce((sum, suite) => {
            return sum + suite.tests.reduce((testSum, test) => {
                return testSum + (test.assertions?.passing || 0);
            }, 0);
        }, 0);

        // Check for resource issues
        const hasResourceLeaks = this.suites.some(s => s.leaks || s.openHandles > 0);

        // Build report
        const report = {
            type: 'test-report',
            version: '1.0',
            timestamp: new Date().toISOString(),
            testFiles: results.testResults.map(r =>
                path.relative(this.globalConfig.rootDir, r.testFilePath)
            ),
            duration: {
                total: totalDuration,
                unit: 'ms'
            },
            summary: {
                passed: results.numPassedTests,
                failed: results.numFailedTests,
                skipped: results.numPendingTests,
                total: results.numTotalTests,
                suites: results.numPassedTestSuites + results.numFailedTestSuites,
                slow: slowTestCount,
                assertions: {
                    passing: totalAssertions
                }
            },
            suites: this.suites,
            coverage: coverageFile ? {
                enabled: true,
                type: 'v8',
                file: coverageFile,
                summary: coverageSummary
            } : null,
            issues: {
                resourceLeaks: hasResourceLeaks,
                wasInterrupted: results.wasInterrupted || false,
                openHandlesTotal: this.suites.reduce((sum, s) => sum + s.openHandles, 0)
            },
            success: results.success,
            timestamp: Math.floor(Date.now() / 1000)
        };

        // Output report
        this.outputReport(report);
    }

    /**
     * Find the latest coverage file in the coverage directory
     */
    findLatestCoverageFile(coverageDir) {
        if (!fs.existsSync(coverageDir)) {
            return null;
        }

        try {
            const files = fs.readdirSync(coverageDir)
                .filter(f => f.startsWith('page-hints-coverage-') && f.endsWith('.json'))
                .map(f => ({
                    name: f,
                    path: path.join(coverageDir, f),
                    time: fs.statSync(path.join(coverageDir, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);

            return files.length > 0 ? files[0].path : null;
        } catch (err) {
            return null;
        }
    }

    /**
     * Extract coverage summary from V8 coverage file
     */
    extractCoverageSummary(filePath) {
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

            if (!data.result) {
                return null;
            }

            let totalStatements = 0;
            let coveredStatements = 0;
            let totalFunctions = 0;
            let coveredFunctions = 0;
            let totalBytes = 0;
            let coveredBytes = 0;

            data.result.forEach(script => {
                script.functions.forEach(fn => {
                    totalFunctions++;
                    if (fn.ranges.some(r => r.count > 0)) {
                        coveredFunctions++;
                    }

                    fn.ranges.forEach(range => {
                        totalStatements++;
                        const rangeBytes = range.endOffset - range.startOffset;
                        totalBytes += rangeBytes;

                        if (range.count > 0) {
                            coveredStatements++;
                            coveredBytes += rangeBytes;
                        }
                    });
                });
            });

            return {
                functions: parseFloat(((coveredFunctions / totalFunctions) * 100).toFixed(1)),
                statements: parseFloat(((coveredStatements / totalStatements) * 100).toFixed(1)),
                bytes: parseFloat(((coveredBytes / totalBytes) * 100).toFixed(1))
            };
        } catch (err) {
            return null;
        }
    }

    /**
     * Output the report to stdout and optionally to a file
     */
    outputReport(report) {
        const reportJson = JSON.stringify(report, null, 2);

        // Output to stdout
        console.log('\n=== TEST REPORT (JSON) ===\n');
        console.log(reportJson);

        // Also save to file
        const reportDir = '/tmp/cdp-test-reports';
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportFile = path.join(reportDir, `test-report-${timestamp}.json`);
        fs.writeFileSync(reportFile, reportJson);

        console.log(`\n✓ Report saved to: ${reportFile}\n`);
    }
}

module.exports = JSONReporter;

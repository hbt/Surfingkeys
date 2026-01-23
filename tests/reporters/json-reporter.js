/**
 * Custom Jest Reporter - JSON Output (Source of Truth)
 *
 * Outputs comprehensive test results in structured JSON format.
 * Full report is saved to file; console output is a brief, jq-compatible summary.
 *
 * The JSON output is the single source of truth for all test data.
 * Other reporters (e.g., Table Reporter) consume this JSON output.
 *
 * Usage:
 *   jest --reporters=<path-to-this-file>
 *
 * Output:
 *   - Full JSON report → /tmp/cdp-test-reports/test-report-*.json
 *   - Diagnostics → /tmp/cdp-test-reports/test-diagnostics-*.json
 *   - Console → Brief JSON summary (jq-compatible, pipeable)
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
            origin: entry.origin || undefined,  // Stack trace showing where the log came from
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
     * Generate field validation diagnostics
     */
    generateDiagnostics(report) {
        const diag = {
            timestamp: new Date().toISOString(),
            fieldValidation: {
                summaryLevel: {
                    slow: { value: report.summary.slow, type: typeof report.summary.slow },
                    assertions_passing: { value: report.summary.assertions.passing, type: typeof report.summary.assertions.passing }
                },
                issuesLevel: {
                    resourceLeaks: { value: report.issues.resourceLeaks, type: typeof report.issues.resourceLeaks },
                    wasInterrupted: { value: report.issues.wasInterrupted, type: typeof report.issues.wasInterrupted },
                    openHandlesTotal: { value: report.issues.openHandlesTotal, type: typeof report.issues.openHandlesTotal }
                },
                suiteLevel: [],
                testLevel: []
            }
        };

        // Analyze suite-level fields
        report.suites.forEach((suite, suiteIdx) => {
            const suiteAnalysis = {
                index: suiteIdx,
                file: suite.file,
                fields: {
                    displayName: { value: suite.displayName, present: suite.displayName !== undefined, type: typeof suite.displayName },
                    leaks: { value: suite.leaks, type: typeof suite.leaks, isAccurate: typeof suite.leaks === 'boolean' },
                    memoryUsage: { value: suite.memoryUsage, present: suite.memoryUsage !== undefined, type: typeof suite.memoryUsage },
                    openHandles: { value: suite.openHandles, type: typeof suite.openHandles, isAccurate: typeof suite.openHandles === 'number' },
                    perfStats: {
                        present: suite.perfStats !== undefined,
                        value: suite.perfStats ? {
                            start: { value: suite.perfStats.start, type: typeof suite.perfStats.start },
                            end: { value: suite.perfStats.end, type: typeof suite.perfStats.end },
                            runtime: { value: suite.perfStats.runtime, type: typeof suite.perfStats.runtime, calculated: true },
                            slow: { value: suite.perfStats.slow, type: typeof suite.perfStats.slow, isAccurate: typeof suite.perfStats.slow === 'boolean' }
                        } : null
                    },
                    numTodo: { value: suite.numTodo, type: typeof suite.numTodo },
                    snapshot: {
                        present: suite.snapshot !== undefined,
                        value: suite.snapshot ? {
                            added: suite.snapshot.added,
                            matched: suite.snapshot.matched,
                            updated: suite.snapshot.updated,
                            unmatched: suite.snapshot.unmatched,
                            unchecked: suite.snapshot.unchecked,
                            fileDeleted: suite.snapshot.fileDeleted
                        } : null
                    },
                    console: {
                        captured: suite.console !== undefined && suite.console !== null,
                        count: suite.console ? suite.console.length : 0,
                        details: suite.console ? suite.console.slice(0, 10).map((entry, idx) => ({
                            index: idx,
                            type: entry.type,
                            message: entry.message.substring(0, 100) + (entry.message.length > 100 ? '...' : ''),
                            originFile: entry.origin ? entry.origin.split('\n')[0] : 'unknown'
                        })) : []
                    }
                },
                tests: []
            };

            // Analyze test-level fields
            suite.tests.forEach((test, testIdx) => {
                const testAnalysis = {
                    index: testIdx,
                    title: test.title,
                    status: test.status,
                    fields: {
                        ancestorTitles: { value: test.ancestorTitles, count: test.ancestorTitles.length, type: typeof test.ancestorTitles },
                        location: { present: test.location !== undefined, value: test.location, type: typeof test.location },
                        assertions_passing: { value: test.assertions.passing, type: typeof test.assertions.passing, isAccurate: typeof test.assertions.passing === 'number' },
                        invocations: { value: test.invocations, type: typeof test.invocations, isDefault: test.invocations === 1 },
                        failureDetails: { present: test.failureDetails !== undefined, count: test.failureDetails ? test.failureDetails.length : 0 }
                    }
                };
                suiteAnalysis.tests.push(testAnalysis);
            });

            diag.fieldValidation.suiteLevel.push(suiteAnalysis);
        });

        return diag;
    }

    /**
     * Output brief summary to console (jq-compatible, pipeable)
     * Save full report and diagnostics to files
     */
    outputReport(report) {
        const reportDir = '/tmp/cdp-test-reports';
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Save full JSON report to file (single source of truth)
        const reportJson = JSON.stringify(report, null, 2);
        const reportFile = path.join(reportDir, `test-report-${timestamp}.json`);
        fs.writeFileSync(reportFile, reportJson);

        // Save diagnostics to file
        const diagnostics = this.generateDiagnostics(report);
        const diagFile = path.join(reportDir, `test-diagnostics-${timestamp}.json`);
        fs.writeFileSync(diagFile, JSON.stringify(diagnostics, null, 2));

        // Output brief, jq-compatible summary to console
        const summary = {
            type: 'test-summary',
            success: report.success,
            tests: report.summary.total,
            passed: report.summary.passed,
            failed: report.summary.failed,
            skipped: report.summary.skipped,
            slow: report.summary.slow,
            assertions: report.summary.assertions.passing,
            duration: report.duration.total,
            coverage: report.coverage ? report.coverage.summary : null,
            reportFile: reportFile,
            diagnosticsFile: diagFile
        };

        // Output to console as compact JSON (jq-compatible)
        console.log(JSON.stringify(summary));

        // Also output file paths to stderr for visibility
        console.error(`\n✓ Full report: ${reportFile}`);
        console.error(`✓ Diagnostics: ${diagFile}\n`);
    }
}

module.exports = JSONReporter;

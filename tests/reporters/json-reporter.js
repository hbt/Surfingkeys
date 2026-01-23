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
            numTests: testResult.numPassingTests + testResult.numFailingTests,
            numPassed: testResult.numPassingTests,
            numFailed: testResult.numFailingTests,
            numSkipped: testResult.numPendingTests,
            tests: testResult.testResults.map(t => ({
                id: t.fullName,
                status: t.status,
                duration: t.duration || 0,
                title: t.title,
                error: t.failureMessages && t.failureMessages.length > 0
                    ? t.failureMessages[0]
                    : null
            }))
        };

        this.suites.push(suite);
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
                suites: results.numPassedTestSuites + results.numFailedTestSuites
            },
            suites: this.suites,
            coverage: coverageFile ? {
                enabled: true,
                type: 'v8',
                file: coverageFile,
                summary: coverageSummary
            } : null,
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

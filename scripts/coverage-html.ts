#!/usr/bin/env bun
/**
 * Convert raw V8 coverage JSON into an HTML report using source-map segments
 * directly, without Istanbul statement/function attribution.
 *
 * Usage:
 *   bun scripts/coverage-html.ts coverage-raw/cmd_tab_close/<timestamp>.v8.json
 *   bun scripts/coverage-html.ts coverage-raw/cmd_tab_close/<timestamp>.v8.json --out coverage-html
 */

import * as fs from 'fs';
import * as path from 'path';
import { SourceMapConsumer } from 'source-map';

type V8Range = {
    startOffset: number;
    endOffset: number;
    count: number;
    functionName?: string;
};

type MappingPoint = {
    source: string;
    originalLine: number;
    originalColumn: number;
    generatedLine: number;
    generatedColumn: number;
};

type SegmentDetail = {
    generatedStart: number;
    generatedEnd: number;
    generatedLoc: string;
    count: number;
};

type LineInfo = {
    lineNumber: number;
    text: string;
    mapped: boolean;
    count: number | null;
    segments: SegmentDetail[];
};

type FileReport = {
    sourceId: string;
    displaySource: string;
    outputPath: string;
    lines: LineInfo[];
    mappedLines: number;
    coveredLines: number;
    maxCount: number;
};

const args = process.argv.slice(2);
const inputFile = args.find((arg) => !arg.startsWith('--'));
const outFlag = args.indexOf('--out');
const outBase = outFlag !== -1 ? args[outFlag + 1] : 'coverage-html';

if (!inputFile) {
    console.error('Usage: bun scripts/coverage-html.ts <v8-json-file> [--out <dir>]');
    process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
const label = String(payload.spec);
const outputDir = path.join(outBase, label);
const DIST_DIR = path.resolve('dist/development/chrome');

function escapeHtml(text: string): string {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function percent(numerator: number, denominator: number): string {
    if (denominator === 0) return '0.0%';
    return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatCount(count: number | null): string {
    if (count == null) return '-';
    return `${count}x`;
}

function toLocString(startLine: number, startColumn: number, endLine: number, endColumn: number): string {
    return `${startLine}:${startColumn}-${endLine}:${endColumn}`;
}

function relativeSourceOutput(sourceId: string): string {
    return `${sourceId}.html`.replace(/^(\.\.\/)+/, '');
}

function displaySourceLabel(sourceId: string): string {
    return sourceId
        .replace(/^(\.\.\/)+src\//, '')
        .replace(/^(\.\.\/)+node_modules\//, 'node_modules/');
}

function buildLineOffsets(source: string): number[] {
    const lines = source.split('\n');
    const offsets: number[] = [];
    let offset = 0;
    for (const line of lines) {
        offsets.push(offset);
        offset += line.length + 1;
    }
    return offsets;
}

function offsetToLoc(offset: number, lineOffsets: number[], totalLength: number): { line: number; column: number } {
    let lo = 0;
    let hi = lineOffsets.length - 1;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const start = lineOffsets[mid];
        const next = mid + 1 < lineOffsets.length ? lineOffsets[mid + 1] : totalLength + 1;
        if (offset < start) {
            hi = mid - 1;
        } else if (offset >= next) {
            lo = mid + 1;
        } else {
            return { line: mid + 1, column: offset - start };
        }
    }
    return { line: lineOffsets.length, column: 0 };
}

function locToOffset(line: number, column: number, lineOffsets: number[]): number {
    return lineOffsets[line - 1] + column;
}

function pickInnermostCount(offset: number, ranges: V8Range[]): number {
    let chosen: V8Range | null = null;
    for (const range of ranges) {
        if (offset < range.startOffset || offset >= range.endOffset) continue;
        if (!chosen) {
            chosen = range;
            continue;
        }
        const chosenSpan = chosen.endOffset - chosen.startOffset;
        const rangeSpan = range.endOffset - range.startOffset;
        if (rangeSpan < chosenSpan || (rangeSpan === chosenSpan && range.startOffset >= chosen.startOffset)) {
            chosen = range;
        }
    }
    return chosen ? chosen.count : 0;
}

function collectBoundaryOffsets(start: number, end: number, ranges: V8Range[]): number[] {
    const boundaries = new Set<number>([start, end]);
    for (const range of ranges) {
        if (range.startOffset > start && range.startOffset < end) boundaries.add(range.startOffset);
        if (range.endOffset > start && range.endOffset < end) boundaries.add(range.endOffset);
    }
    return Array.from(boundaries).sort((a, b) => a - b);
}

function renderCss(): string {
    return `
:root {
  --bg: #0b1220;
  --bg-2: #111a2d;
  --panel: #162033;
  --panel-2: #1c2940;
  --text: #edf3ff;
  --muted: #9bb0d1;
  --border: #2d3b58;
  --covered: #143528;
  --covered-strong: #1e6a49;
  --uncovered: #4a1f2d;
  --unmapped: #202b3f;
  --accent: #7dd3fc;
  --link: #93c5fd;
  --shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
  --mono: "Iosevka Web", "SFMono-Regular", "Menlo", monospace;
  --sans: "IBM Plex Sans", "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
}
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
.shell {
  width: min(1200px, calc(100vw - 32px));
  margin: 24px auto 40px;
}
.hero, .panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(8px);
}
.hero {
  padding: 24px 28px;
  margin-bottom: 18px;
}
.eyebrow {
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 12px;
  margin-bottom: 8px;
}
h1 {
  margin: 0 0 10px;
  font-size: clamp(28px, 3vw, 42px);
  line-height: 1.05;
}
.meta {
  color: var(--muted);
  font-size: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
}
.pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(17, 26, 45, 0.9);
}
.panel {
  padding: 18px 20px;
  margin-bottom: 18px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.stat {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 14px;
}
.stat-label {
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.stat-value {
  font-size: 22px;
  margin-top: 8px;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(45, 59, 88, 0.95);
  vertical-align: top;
}
th {
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.code-table td {
  padding: 0;
}
.line-no, .line-count {
  width: 88px;
  text-align: right;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 13px;
  padding: 6px 10px !important;
  white-space: nowrap;
}
.line-code {
  font-family: var(--mono);
  font-size: 13px;
  padding: 6px 14px !important;
  white-space: pre;
}
.covered { background: var(--covered); }
.uncovered { background: var(--uncovered); }
.unmapped { background: var(--unmapped); }
.code-table tr:hover td { background-color: rgba(147, 197, 253, 0.08); }
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  color: var(--muted);
  font-size: 13px;
}
.swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
  margin-right: 6px;
  vertical-align: -1px;
}
.footer-note {
  color: var(--muted);
  font-size: 13px;
  margin-top: 10px;
}
@media (max-width: 720px) {
  .shell { width: min(100vw - 16px, 1200px); margin-top: 12px; }
  .hero, .panel { border-radius: 14px; padding-left: 14px; padding-right: 14px; }
  .line-no, .line-count { width: 64px; }
  .line-code { font-size: 12px; }
}
    `.trim();
}

function renderFilePage(file: FileReport, labelValue: string, target: string, artifactPath: string): string {
    const rows = file.lines
        .map((line) => {
            const cls = !line.mapped ? 'unmapped' : (line.count ?? 0) > 0 ? 'covered' : 'uncovered';
            const title =
                line.segments.length > 0
                    ? escapeHtml(
                          line.segments
                              .map((segment) => `${segment.generatedLoc} => ${segment.count}x`)
                              .join('\n'),
                      )
                    : '';
            return `<tr class="${cls}" title="${title}"><td class="line-no">${line.lineNumber}</td><td class="line-count">${formatCount(line.count)}</td><td class="line-code">${escapeHtml(line.text)}</td></tr>`;
        })
        .join('\n');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(file.displaySource)} coverage</title>
  <style>${renderCss()}</style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="eyebrow">Raw V8 Coverage</div>
      <h1>${escapeHtml(file.displaySource)}</h1>
      <div class="meta">
        <span class="pill">Spec: ${escapeHtml(labelValue)}</span>
        <span class="pill">Target: ${escapeHtml(target)}</span>
        <span class="pill">Artifact: ${escapeHtml(path.basename(artifactPath))}</span>
      </div>
      <div class="summary-grid">
        <div class="stat"><div class="stat-label">Covered Lines</div><div class="stat-value">${file.coveredLines}/${file.mappedLines}</div></div>
        <div class="stat"><div class="stat-label">Line Coverage</div><div class="stat-value">${percent(file.coveredLines, file.mappedLines)}</div></div>
        <div class="stat"><div class="stat-label">Max Hit Count</div><div class="stat-value">${file.maxCount}x</div></div>
      </div>
    </section>
    <section class="panel">
      <div class="legend">
        <span><span class="swatch covered"></span>covered by raw V8 range mapping</span>
        <span><span class="swatch uncovered"></span>mapped but not executed</span>
        <span><span class="swatch unmapped"></span>no source-map segment for this line</span>
      </div>
      <div class="footer-note">Counts come from the innermost raw V8 range for each source-mapped generated segment. No Istanbul statement attribution is used.</div>
    </section>
    <section class="panel">
      <div class="footer-note"><a href="./index.html">Back to file index</a></div>
      <table class="code-table">
        <thead>
          <tr><th class="line-no">Line</th><th class="line-count">Hits</th><th>Code</th></tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
  </div>
</body>
</html>`;
}

function renderIndexPage(labelValue: string, target: string, artifactPath: string, reports: FileReport[]): string {
    const totalMapped = reports.reduce((sum, report) => sum + report.mappedLines, 0);
    const totalCovered = reports.reduce((sum, report) => sum + report.coveredLines, 0);
    const hasReports = reports.length > 0;
    const rows = reports
        .sort((a, b) => a.displaySource.localeCompare(b.displaySource))
        .map(
            (report) => `<tr>
  <td><a href="${escapeHtml(report.outputPath)}">${escapeHtml(report.displaySource)}</a></td>
  <td>${report.coveredLines}/${report.mappedLines}</td>
  <td>${percent(report.coveredLines, report.mappedLines)}</td>
  <td>${report.maxCount}x</td>
</tr>`,
        )
        .join('\n');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(labelValue)} coverage</title>
  <style>${renderCss()}</style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="eyebrow">Raw V8 Coverage</div>
      <h1>${escapeHtml(labelValue)}</h1>
      <div class="meta">
        <span class="pill">Target: ${escapeHtml(target)}</span>
        <span class="pill">Artifact: ${escapeHtml(path.basename(artifactPath))}</span>
        <span class="pill">Files: ${reports.length}</span>
      </div>
      <div class="summary-grid">
        <div class="stat"><div class="stat-label">Covered Lines</div><div class="stat-value">${totalCovered}/${totalMapped}</div></div>
        <div class="stat"><div class="stat-label">Line Coverage</div><div class="stat-value">${percent(totalCovered, totalMapped)}</div></div>
      </div>
    </section>
    <section class="panel">
      <div class="legend">
        <span><span class="swatch covered"></span>covered by raw V8 range mapping</span>
        <span><span class="swatch uncovered"></span>mapped but not executed</span>
        <span><span class="swatch unmapped"></span>no source-map segment for this line</span>
      </div>
      <div class="footer-note">This report is generated directly from raw V8 coverage and source-map segments. It avoids Istanbul statement remapping.</div>
    </section>
    <section class="panel">
      ${hasReports ? `<table>
        <thead>
          <tr><th>Source File</th><th>Covered</th><th>Coverage</th><th>Max Hit</th></tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>` : `<div class="footer-note">No source-mapped bundle entries were present in this raw coverage artifact. This usually means the target stayed idle during the command window.</div>`}
    </section>
  </div>
</body>
</html>`;
}

async function buildFileReport(script: any): Promise<FileReport[]> {
    const scriptUrl = String(script.url ?? '');
    const bundleFile = path.basename(scriptUrl);
    const bundlePath = path.join(DIST_DIR, bundleFile);
    const sourceMapPath = bundlePath + '.map';
    if (!fs.existsSync(bundlePath) || !fs.existsSync(sourceMapPath)) {
        console.warn(`[Coverage] Skipping ${bundleFile} - bundle or source map not found in ${DIST_DIR}`);
        return [];
    }

    const bundleSource = fs.readFileSync(bundlePath, 'utf-8');
    const bundleLength = bundleSource.length;
    const lineOffsets = buildLineOffsets(bundleSource);
    const sourceMap = JSON.parse(fs.readFileSync(sourceMapPath, 'utf-8'));
    const ranges: V8Range[] = (script.functions ?? []).flatMap((fn: any) =>
        (fn.ranges ?? []).map((range: any) => ({
            startOffset: Number(range.startOffset) || 0,
            endOffset: Number(range.endOffset) || 0,
            count: Number(range.count) || 0,
            functionName: fn.functionName || '',
        })),
    );

    const consumer = await new SourceMapConsumer(sourceMap as any);
    const mappings: MappingPoint[] = [];
    consumer.eachMapping((mapping) => {
        if (!mapping.source || mapping.originalLine == null || mapping.generatedLine == null) return;
        mappings.push({
            source: mapping.source,
            originalLine: mapping.originalLine,
            originalColumn: mapping.originalColumn ?? 0,
            generatedLine: mapping.generatedLine,
            generatedColumn: mapping.generatedColumn ?? 0,
        });
    }, null, SourceMapConsumer.GENERATED_ORDER);

    const sourceLines = new Map<string, LineInfo[]>();

    for (const sourceId of sourceMap.sources as string[]) {
        const sourcePath = path.resolve(DIST_DIR, sourceId);
        if (!fs.existsSync(sourcePath)) continue;
        const lines = fs.readFileSync(sourcePath, 'utf-8').split('\n');
        sourceLines.set(
            sourceId,
            lines.map((text, index) => ({
                lineNumber: index + 1,
                text,
                mapped: false,
                count: null,
                segments: [],
            })),
        );
    }

    for (let i = 0; i < mappings.length; i += 1) {
        const current = mappings[i];
        const next = mappings[i + 1];
        if (!sourceLines.has(current.source)) continue;

        const segmentStart = locToOffset(current.generatedLine, current.generatedColumn, lineOffsets);
        const segmentEnd = next ? locToOffset(next.generatedLine, next.generatedColumn, lineOffsets) : bundleLength;
        if (segmentEnd <= segmentStart) continue;

        const boundaries = collectBoundaryOffsets(segmentStart, segmentEnd, ranges);
        const fileLines = sourceLines.get(current.source)!;

        for (let j = 0; j < boundaries.length - 1; j += 1) {
            const start = boundaries[j];
            const end = boundaries[j + 1];
            if (end <= start) continue;
            const lineInfo = fileLines[current.originalLine - 1];
            if (!lineInfo) continue;

            const count = pickInnermostCount(start, ranges);
            const generatedStart = offsetToLoc(start, lineOffsets, bundleLength);
            const generatedEnd = offsetToLoc(end, lineOffsets, bundleLength);
            lineInfo.mapped = true;
            lineInfo.count = lineInfo.count == null ? count : Math.max(lineInfo.count, count);
            lineInfo.segments.push({
                generatedStart: start,
                generatedEnd: end,
                generatedLoc: toLocString(
                    generatedStart.line,
                    generatedStart.column,
                    generatedEnd.line,
                    generatedEnd.column,
                ),
                count,
            });
        }
    }

    consumer.destroy?.();

    const reports: FileReport[] = [];
    for (const [sourceId, lines] of sourceLines.entries()) {
        const mappedLines = lines.filter((line) => line.mapped).length;
        if (mappedLines === 0) continue;
        const coveredLines = lines.filter((line) => line.mapped && (line.count ?? 0) > 0).length;
        const maxCount = lines.reduce((max, line) => Math.max(max, line.count ?? 0), 0);
        reports.push({
            sourceId,
            displaySource: displaySourceLabel(sourceId),
            outputPath: relativeSourceOutput(sourceId),
            lines,
            mappedLines,
            coveredLines,
            maxCount,
        });
    }

    return reports;
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const fileReports = (await Promise.all((payload.result ?? []).map((script: any) => buildFileReport(script)))).flat();

for (const report of fileReports) {
    const outPath = path.join(outputDir, report.outputPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, renderFilePage(report, label, String(payload.target ?? 'unknown'), inputFile));
}

const summary = {
    spec: label,
    target: payload.target,
    artifact: inputFile,
    files: fileReports.map((report) => ({
        source: report.sourceId,
        displaySource: report.displaySource,
        mappedLines: report.mappedLines,
        coveredLines: report.coveredLines,
        coverage: percent(report.coveredLines, report.mappedLines),
        maxCount: report.maxCount,
        outputPath: report.outputPath,
    })),
};

fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(
    path.join(outputDir, 'index.html'),
    renderIndexPage(label, String(payload.target ?? 'unknown'), inputFile, fileReports),
);

console.log(`\n[Coverage] HTML report -> ${path.join(outputDir, 'index.html')}`);

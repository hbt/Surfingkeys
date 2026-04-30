#!/usr/bin/env bun
/**
 * audit-report.ts
 *
 * Human-readable audit report for SurfingKeys mappings.
 * Reads JSON from stdin (output of mappings-json-report.ts).
 *
 * Usage:
 *   bun scripts/mappings-json-report.ts | bun scripts/audit-report.ts
 *   npm run report:audit
 */

import path from "path";

// ---------------------------------------------------------------------------
// Read JSON from stdin
// ---------------------------------------------------------------------------

const inputJson = await Bun.stdin.text();
let report: any;
try {
  report = JSON.parse(inputJson);
} catch {
  process.stderr.write("Error: could not parse JSON from stdin.\n");
  process.stderr.write(
    "Usage: bun scripts/mappings-json-report.ts | bun scripts/audit-report.ts\n"
  );
  process.exit(1);
}

const mappings = report.mappings;
const list: any[] = mappings.list;
const summary = mappings.summary;

// ---------------------------------------------------------------------------
// Playwright spec file scan (independent glob)
// ---------------------------------------------------------------------------

const playwrightDir = path.join(import.meta.dir, "../tests/playwright/commands");
const specGlob = new Bun.Glob("*.spec.ts");
const specFiles: string[] = [];
for await (const f of specGlob.scan({ cwd: playwrightDir })) {
  specFiles.push(f);
}
specFiles.sort();

// cmd-scroll-down.spec.ts → cmd_scroll_down
// cmd-hints-link-background-tab.minimal.spec.ts → cmd_hints_link_background_tab (strip after first non-spec dot)
function specToUniqueId(filename: string): string {
  // Remove .spec.ts suffix, then take up to first remaining dot, replace hyphens
  const base = filename.replace(/\.spec\.ts$/, "");
  const firstPart = base.split(".")[0];
  return firstPart.replace(/-/g, "_");
}

const playwrightCoveredIds = new Set(specFiles.map(specToUniqueId));

// Count individual test() calls across all spec files
let playwrightTestCount = 0;
for (const f of specFiles) {
  const content = await Bun.file(path.join(playwrightDir, f)).text();
  const matches = content.match(/^\s*test\(/gm);
  if (matches) playwrightTestCount += matches.length;
}

// ---------------------------------------------------------------------------
// Derived metrics
// ---------------------------------------------------------------------------

const total = list.length;
const migrated = summary.migrated;
const notMigratedCount = summary.not_migrated;
const cdpTests = summary.tests.total_with_tests;
const validAnnotations = summary.validation.valid;
const personallyRemapped = summary.custom_mapping_coverage.mapped;

const validMappings = list.filter((m) => m.validationStatus === "valid");
const notMigrated = list.filter((m) => m.validationStatus === "not_migrated");

// Playwright cross-reference
const withPlaywright = validMappings.filter((m) => {
  const uid: string | undefined = m.annotation?.unique_id;
  return uid && playwrightCoveredIds.has(uid);
});

const withCDPOnly = validMappings.filter((m) => {
  const uid: string | undefined = m.annotation?.unique_id;
  const hasCDP = m.test_coverage?.hasTest;
  const hasPW = uid && playwrightCoveredIds.has(uid);
  return hasCDP && !hasPW;
});

const withNoTest = validMappings.filter((m) => {
  const uid: string | undefined = m.annotation?.unique_id;
  const hasCDP = m.test_coverage?.hasTest;
  const hasPW = uid && playwrightCoveredIds.has(uid);
  return !hasCDP && !hasPW;
});

// Personal keybinding coverage — grouped by category
const notPersonallyMapped = validMappings.filter(
  (m) => !m.custom_mapping?.hasMapping
);
const unmappedByCategory: Record<string, number> = {};
for (const m of notPersonallyMapped) {
  const cat: string = m.annotation?.category || "unknown";
  unmappedByCategory[cat] = (unmappedByCategory[cat] || 0) + 1;
}
const sortedUnmapped = Object.entries(unmappedByCategory).sort(
  ([, a], [, b]) => b - a
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(n: number, d: number): string {
  return d ? Math.round((n / d) * 100) + "%" : "0%";
}

function statusIcon(n: number, d: number): string {
  const ratio = d ? n / d : 0;
  if (ratio >= 0.8) return "✅";
  if (ratio >= 0.5) return "⚠️";
  return "❌";
}

function truncate(s: string, max = 48): string {
  const cleaned = s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return cleaned.length > max ? cleaned.substring(0, max - 1) + "…" : cleaned;
}

// ---------------------------------------------------------------------------
// Build markdown
// ---------------------------------------------------------------------------

const date = new Date().toISOString().split("T")[0];

const lines: string[] = [];

const w = (s: string) => lines.push(s);

w(`# SurfingKeys Audit Report`);
w(``);
w(`_Generated: ${date}_`);
w(``);
w(`---`);
w(``);

// --- Scorecard ---
w(`## Scorecard`);
w(``);
w(`| Metric | Count | Total | % | Status |`);
w(`|--------|-------|-------|---|--------|`);
w(`| Migration | ${migrated} | ${total} | ${pct(migrated, total)} | ${statusIcon(migrated, total)} |`);
w(`| Tests (Playwright) | ${playwrightTestCount} tests / ${specFiles.length} specs | ${total} cmds | ${pct(withPlaywright.length, total)} cmds covered | ${statusIcon(withPlaywright.length, total)} |`);
w(`| Tests (CDP legacy) | ${cdpTests} | ${total} | ${pct(cdpTests, total)} | legacy |`);
w(`| Valid annotations | ${validAnnotations} | ${migrated} | ${pct(validAnnotations, migrated)} | ${statusIcon(validAnnotations, migrated)} |`);
w(`| Personally remapped | ${personallyRemapped} | ${migrated} | ${pct(personallyRemapped, migrated)} | ${statusIcon(personallyRemapped, migrated)} |`);
w(``);
w(`_Status thresholds: ✅ ≥80%, ⚠️ 50–79%, ❌ <50%_`);
w(``);
w(`---`);
w(``);

// --- Section 1: Test coverage ---
w(`## 1. Test Coverage`);
w(``);
w(`> ⚠️  Mapped report tracks CDP/Jest tests — may undercount Playwright coverage.`);
w(``);
w(`| | Count | Total | % |`);
w(`|-|-------|-------|---|`);
w(`| CDP tests (JSON report) | ${cdpTests} | ${total} cmds | ${pct(cdpTests, total)} |`);
w(`| Playwright spec files (scan) | ${specFiles.length} | — | — |`);
w(`| Playwright individual tests | ${playwrightTestCount} | — | ~${(playwrightTestCount / specFiles.length).toFixed(1)} per spec |`);
w(`| Commands with Playwright coverage | ${withPlaywright.length} | ${total} | ${pct(withPlaywright.length, total)} |`);
w(`| Commands with CDP coverage only | ${withCDPOnly.length} | ${total} | ${pct(withCDPOnly.length, total)} |`);
w(`| Commands with no test at all | ${withNoTest.length} | ${total} | ${pct(withNoTest.length, total)} |`);
w(``);

if (withPlaywright.length > 0) {
  w(`<details>`);
  w(`<summary>Commands with Playwright coverage (${withPlaywright.length})</summary>`);
  w(``);
  w(`| unique_id | Mode | Short |`);
  w(`|-----------|------|-------|`);
  for (const m of withPlaywright) {
    w(`| \`${m.annotation.unique_id}\` | ${m.mode} | ${m.annotation.short} |`);
  }
  w(``);
  w(`</details>`);
  w(``);
}

if (withNoTest.length > 0) {
  w(`<details>`);
  w(`<summary>Commands with no test coverage at all (${withNoTest.length})</summary>`);
  w(``);
  w(`| unique_id | Mode | Short |`);
  w(`|-----------|------|-------|`);
  for (const m of withNoTest) {
    w(`| \`${m.annotation.unique_id}\` | ${m.mode} | ${m.annotation.short} |`);
  }
  w(``);
  w(`</details>`);
  w(``);
}

w(`---`);
w(``);

// --- Section 2: Migration triage ---
w(`## 2. Migration — Triage the ${notMigratedCount}`);
w(``);
w(`Overall: **${migrated} / ${total} migrated** (${pct(migrated, total)})`);
w(``);

if (notMigrated.length === 0) {
  w(`All commands are migrated. ✅`);
} else {
  w(`Not migrated (${notMigrated.length}) — needs triage:`);
  w(``);
  w(`| Key | Mode | Legacy annotation | File:Line |`);
  w(`|-----|------|-------------------|-----------|`);
  for (const m of notMigrated) {
    const ann =
      typeof m.annotation === "string"
        ? truncate(m.annotation)
        : truncate(String(m.annotation));
    const fileRef = m.source ? `${m.source.file}:${m.source.line}` : "—";
    w(`| \`${m.key}\` | ${m.mode} | ${ann} | ${fileRef} |`);
  }
  w(``);
  w(
    `> Note: some may be intentionally excluded (search_alias, synthetic, dynamic mappings via loop variables).`
  );
}

w(``);
w(`---`);
w(``);

// --- Section 3: Personal keybinding coverage ---
w(`## 3. Personal Keybinding Coverage`);
w(``);
w(`> Source: \`.surfingkeysrc.js\` — detected via \`custom_mapping\` in JSON report`);
w(``);
w(`| | Count | Total | % |`);
w(`|-|-------|-------|---|`);
w(`| Remapped | ${personallyRemapped} | ${migrated} | ${pct(personallyRemapped, migrated)} |`);
w(`| Missing | ${migrated - personallyRemapped} | ${migrated} | ${pct(migrated - personallyRemapped, migrated)} |`);
w(``);
w(`**Top unmapped by category:**`);
w(``);
w(`| Category | Unmapped |`);
w(`|----------|---------|`);
for (const [cat, count] of sortedUnmapped.slice(0, 15)) {
  w(`| ${cat} | ${count} |`);
}
w(``);

if (notPersonallyMapped.length > 0) {
  w(`<details>`);
  w(`<summary>All unmapped commands (${notPersonallyMapped.length})</summary>`);
  w(``);
  w(`| unique_id | Mode | Category | Short |`);
  w(`|-----------|------|----------|-------|`);
  for (const m of notPersonallyMapped) {
    const uid = m.annotation?.unique_id || "—";
    const cat = m.annotation?.category || "—";
    const short = m.annotation?.short || "—";
    w(`| \`${uid}\` | ${m.mode} | ${cat} | ${short} |`);
  }
  w(``);
  w(`</details>`);
  w(``);
}

w(`---`);
w(``);

// --- Section 4: Terminology ---
w(`## 4. Terminology`);
w(``);
w(`| Term | Meaning |`);
w(`|------|---------|`);
w(`| \`not_migrated\` | Still uses legacy string annotation (no unique_id) |`);
w(`| \`invalid\` | Has object annotation but missing required fields |`);
w(`| \`handler: inline\` | Anonymous function — hard to test, refactor candidate |`);
w(`| \`handler: named\` | References a named function — more testable |`);
w(`| \`handler: bound\` | Bound method reference (e.g. \`fn.bind(ctx)\`) |`);
w(`| \`handler: method\` | Object method reference (e.g. \`obj.method\`) |`);
w(`| \`handler: unknown\` | Could not determine handler type — needs review |`);
w(`| \`synthetic\` | Auto-generated mapping (e.g. search aliases) |`);
w(`| \`mapkey\` | Standard keyboard mapping type |`);
w(`| \`command\` | Omnibar command registration |`);
w(`| \`direct\` | Direct Trie insertion (bypasses mapkey) |`);
w(`| \`search_alias\` | Search engine shortcut |`);
w(``);

// Output
process.stdout.write(lines.join("\n") + "\n");

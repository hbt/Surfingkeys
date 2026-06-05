#!/usr/bin/env bun
// Surfingkeys CLI Dashboard — bun scripts/ccs.ts
// Shows: extension status, latest CI run, run history, coverage

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import * as path from "path";
import { execSync } from "child_process";

const ROOT = path.resolve(import.meta.dir, "..");
const RUNS_DIR = path.join(ROOT, "test-artifacts/reports/runs");
const COV_HTML_DIR = path.join(ROOT, "test-artifacts/coverage-html");
const DIST_DIR = path.join(ROOT, "dist/development");
const RELAY_URL = "http://localhost:9600";

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  white: "\x1b[97m",
};

function bold(s: string) { return C.bold + s + C.reset; }
function dim(s: string) { return C.dim + s + C.reset; }
function green(s: string) { return C.green + s + C.reset; }
function red(s: string) { return C.red + s + C.reset; }
function yellow(s: string) { return C.yellow + s + C.reset; }
function cyan(s: string) { return C.cyan + s + C.reset; }
function gray(s: string) { return C.gray + s + C.reset; }

function pad(s: string, len: number): string {
  const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
  const delta = s.length - plain.length;
  const target = len + delta;
  return s.length >= target ? s.slice(0, target) : s + " ".repeat(target - s.length);
}

function rpad(s: string, len: number): string {
  const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
  const delta = s.length - plain.length;
  const target = len + delta;
  return s.length >= target ? s.slice(0, target) : " ".repeat(target - s.length) + s;
}

function hr(label: string, width = 64): string {
  const inner = ` ${label} `;
  const sides = width - inner.length;
  const left = Math.floor(sides / 2);
  const right = sides - left;
  return gray("─".repeat(left)) + bold(cyan(inner)) + gray("─".repeat(right));
}

function formatRelative(iso: string): string {
  if (!iso) return "-";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min === 0 ? `${sec}s` : `${min}m ${sec}s`;
}

// ── Git info ─────────────────────────────────────────────────────────────────

function gitBranch(): string {
  try {
    return execSync("git -C " + ROOT + " rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "?";
  }
}

function gitShortSha(): string {
  try {
    return execSync("git -C " + ROOT + " rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "?";
  }
}

function gitSubject(): string {
  try {
    return execSync("git -C " + ROOT + " log -1 --format=%s", { encoding: "utf8" }).trim();
  } catch {
    return "?";
  }
}

// ── Run parsing ───────────────────────────────────────────────────────────────

interface RunStats {
  startTime: string;
  duration: number;
  expected: number;
  unexpected: number;
  flaky: number;
  skipped: number;
}

interface RunEntry {
  filename: string;
  sha: string;
  env: string;
  stats: RunStats;
}

function parseRunFilename(filename: string): { sha: string; env: string } {
  const base = filename.replace(/\.json$/, "");
  const parts = base.split("-");
  const env = parts.at(-1) ?? "";
  const candidate = parts.at(-2) ?? "";
  // A git short sha is 7 hex chars; timestamp fragments contain 'Z' or are numeric
  const sha = /^[0-9a-f]{7,}$/.test(candidate) ? candidate : "";
  return { sha, env };
}

function readRuns(limit: number): RunEntry[] {
  if (!existsSync(RUNS_DIR)) return [];
  const entries: RunEntry[] = [];
  for (const f of readdirSync(RUNS_DIR).filter(f => f.endsWith(".json"))) {
    try {
      const data = JSON.parse(readFileSync(path.join(RUNS_DIR, f), "utf8"));
      if (!data?.stats) continue;
      const { sha, env } = parseRunFilename(f);
      entries.push({ filename: f.replace(/\.json$/, ""), sha, env, stats: data.stats });
    } catch {}
  }
  entries.sort((a, b) => new Date(b.stats.startTime).getTime() - new Date(a.stats.startTime).getTime());
  return entries.slice(0, limit);
}

// ── Extension status ─────────────────────────────────────────────────────────

async function checkRelay(): Promise<{ running: boolean; panelConnected: boolean | null }> {
  try {
    const res = await fetch(`${RELAY_URL}/eval-status`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { running: true, panelConnected: null };
    const data = await res.json() as any;
    return { running: true, panelConnected: data?.panelConnected ?? false };
  } catch {
    return { running: false, panelConnected: null };
  }
}

function buildAge(): string {
  if (!existsSync(DIST_DIR)) return red("missing");
  try {
    const mtime = statSync(DIST_DIR).mtimeMs;
    return formatRelative(new Date(mtime).toISOString());
  } catch {
    return red("error");
  }
}

// ── Coverage ──────────────────────────────────────────────────────────────────

interface CovEntry {
  name: string;
  mtime: number;
}

function readCoverageEntries(limit: number): CovEntry[] {
  if (!existsSync(COV_HTML_DIR)) return [];
  const entries: CovEntry[] = [];
  for (const name of readdirSync(COV_HTML_DIR)) {
    try {
      const full = path.join(COV_HTML_DIR, name);
      const s = statSync(full);
      if (s.isDirectory()) entries.push({ name, mtime: s.mtimeMs });
    } catch {}
  }
  entries.sort((a, b) => b.mtime - a.mtime);
  return entries.slice(0, limit);
}

// ── Sections ──────────────────────────────────────────────────────────────────

function renderHeader(branch: string, sha: string, subject: string) {
  const now = new Date().toLocaleString("en-GB", { hour12: false });
  console.log();
  console.log(bold(cyan("  Surfingkeys Dashboard")) + gray(`  ${now}`));
  console.log(gray(`  ${branch}`) + " " + dim(sha) + "  " + dim(subject.slice(0, 55)));
  console.log();
}

async function renderExtensionStatus() {
  console.log(hr("Extension Status"));
  const relay = await checkRelay();
  const age = buildAge();

  const relayStatus = relay.running
    ? (relay.panelConnected ? green("● running  panel:connected") : yellow("● running  panel:disconnected"))
    : red("○ stopped");

  console.log(`  ${pad("relay", 14)}${relayStatus}`);
  console.log(`  ${pad("build age", 14)}${age}`);
  console.log();
}

function renderLatestRun(runs: RunEntry[]) {
  console.log(hr("Latest Test Run"));
  if (runs.length === 0) {
    console.log(gray("  (no runs found)"));
    console.log();
    return;
  }
  const r = runs[0];
  const { stats } = r;
  console.log(`  ${pad("sha", 8)}${dim(r.sha || "-")}`);
  console.log(`  ${pad("env", 8)}${r.env}`);
  console.log(`  ${pad("when", 8)}${formatRelative(stats.startTime)}`);
  console.log(`  ${pad("elapsed", 8)}${formatElapsed(stats.duration)}`);
  console.log(`  ${pad("pass", 8)}${green(String(stats.expected))}`);
  console.log(`  ${pad("fail", 8)}${stats.unexpected > 0 ? red(String(stats.unexpected)) : dim("0")}`);
  console.log(`  ${pad("flaky", 8)}${stats.flaky > 0 ? yellow(String(stats.flaky)) : dim("0")}`);
  console.log(`  ${pad("skip", 8)}${dim(String(stats.skipped))}`);
  console.log();
}

function renderRunHistory(runs: RunEntry[]) {
  console.log(hr("Run History (last " + runs.length + ")"));
  if (runs.length === 0) {
    console.log(gray("  (none)"));
    console.log();
    return;
  }
  console.log(
    "  " +
    pad(gray("sha"), 9) +
    pad(gray("env"), 8) +
    rpad(gray("pass"), 5) + "  " +
    rpad(gray("fail"), 4) + "  " +
    rpad(gray("flk"), 4) + "  " +
    pad(gray("elapsed"), 9) +
    gray("when")
  );
  console.log("  " + gray("─".repeat(60)));
  for (const r of runs) {
    const { stats } = r;
    const failStr = stats.unexpected > 0 ? red(String(stats.unexpected)) : dim("0");
    const flakyStr = stats.flaky > 0 ? yellow(String(stats.flaky)) : dim("0");
    console.log(
      "  " +
      pad(dim(r.sha || "-"), 9) +
      pad(r.env, 8) +
      rpad(green(String(stats.expected)), 5) + "  " +
      rpad(failStr, 4) + "  " +
      rpad(flakyStr, 4) + "  " +
      pad(formatElapsed(stats.duration), 9) +
      gray(formatRelative(stats.startTime))
    );
  }
  console.log();
}

function renderCoverage(entries: CovEntry[]) {
  console.log(hr("Coverage HTML (recent)"));
  if (entries.length === 0) {
    console.log(gray("  (none)"));
    console.log();
    return;
  }
  for (const e of entries) {
    console.log(`  ${pad(e.name, 36)}${gray(formatRelative(new Date(e.mtime).toISOString()))}`);
  }
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────────

const limit = parseInt(process.argv[2] ?? "8", 10);
const runs = readRuns(Math.max(limit, 1));
const covEntries = readCoverageEntries(6);
const branch = gitBranch();
const sha = gitShortSha();
const subject = gitSubject();

renderHeader(branch, sha, subject);
await renderExtensionStatus();
renderLatestRun(runs);
renderRunHistory(runs);
renderCoverage(covEntries);

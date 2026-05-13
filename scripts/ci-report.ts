#!/usr/bin/env bun
// report subcommand — bun scripts/ci.ts report [--json] [--limit N]

import { gather, type RunEntry, type GatherResult } from "./ci-gather.ts";

interface GitInfo {
  sha: string;
  short: string;
  subject: string;
  date: string;
}

interface EnrichedRun extends RunEntry {
  short: string;
  subject: string;
  date: string;
}

interface QueueEntry {
  sha: string;
  enqueuedAt: string;
}

// ── Git info ──────────────────────────────────────────────────────────────────

function getGitInfo(sha: string): GitInfo | null {
  if (!sha) return null;
  const result = Bun.spawnSync(
    ["git", "log", '--format={"sha":"%H","short":"%h","subject":"%s","date":"%ai"}', "-1", sha],
    { stdout: "pipe", stderr: "pipe" }
  );
  if (result.exitCode !== 0) return null;
  try {
    return JSON.parse(new TextDecoder().decode(result.stdout).trim());
  } catch {
    return null;
  }
}

function enrichRuns(runs: RunEntry[]): EnrichedRun[] {
  return runs.map(r => {
    const info = getGitInfo(r.sha);
    return {
      ...r,
      short: info?.short ?? r.sha ?? "",
      subject: info?.subject ?? "(unknown)",
      date: info?.date ?? "",
    };
  });
}

// ── Queue parsing ─────────────────────────────────────────────────────────────

// Filename format: <ISO-ts-with-dashes>-<full-sha>
function parseQueueEntry(filename: string): QueueEntry {
  const parts = filename.split("-");
  const sha = parts.at(-1)!;
  const tsRaw = parts.slice(0, -1).join("-");
  const enqueuedAt = tsRaw.replace(/(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})/, "$1:$2:$3.$4");
  return { sha, enqueuedAt };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  if (!iso) return "-";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}

// ── Human output ──────────────────────────────────────────────────────────────

function formatHuman(
  pending: QueueEntry[],
  container: string | null,
  runs: EnrichedRun[]
): string {
  const lines: string[] = [];

  lines.push("Surfingkeys CI  " + "─".repeat(44));
  lines.push("");

  lines.push("Queue");
  lines.push(`  pending     ${pending.length}`);
  lines.push(container ? `  processing  1  (${container})` : `  processing  0`);
  lines.push("");

  lines.push(`Completed (last ${runs.length})`);
  if (runs.length === 0) {
    lines.push("  (none)");
  } else {
    lines.push(`  ${pad("sha", 9)}${pad("env", 7)}${pad("host", 16)}${pad("subject", 38)}${pad("pass", 6)}${pad("fail", 6)}${pad("elapsed", 9)}when`);
    lines.push("  " + ["─".repeat(7), "─".repeat(6), "─".repeat(14), "─".repeat(36), "─".repeat(4), "─".repeat(4), "─".repeat(7), "─".repeat(9)].join("  "));
    for (const r of runs) {
      const { stats } = r;
      const elapsed = formatElapsed(stats.duration);
      const when = formatRelative(stats.startTime);
      lines.push(
        `  ${pad(r.short || r.sha || "-", 9)}${pad(r.env, 7)}${pad(r.host || "-", 16)}${pad(r.subject, 38)}${pad(String(stats.expected), 6)}${pad(String(stats.unexpected), 6)}${pad(elapsed, 9)}${when}`
      );
    }
  }

  return lines.join("\n");
}

// ── JSON output ───────────────────────────────────────────────────────────────

function formatJson(pending: QueueEntry[], container: string | null, runs: EnrichedRun[]) {
  return {
    queue: {
      pending,
      processing: container ? { container } : null,
    },
    completed: runs.map(r => ({
      filename: r.filename,
      sha: r.sha,
      short: r.short,
      env: r.env,
      host: r.host,
      subject: r.subject,
      date: r.date,
      stats: r.stats,
    })),
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function run(argv: string[]) {
  const jsonMode = argv.includes("--json");

  let limit = 10;
  const limitIdx = argv.indexOf("--limit");
  if (limitIdx !== -1 && argv[limitIdx + 1]) {
    const parsed = parseInt(argv[limitIdx + 1], 10);
    if (!isNaN(parsed)) limit = parsed;
  }

  let data: GatherResult;
  try {
    data = await gather();
  } catch (e: any) {
    console.error("Error:", e.message);
    process.exit(1);
  }

  const pending = data.queue.map(parseQueueEntry);

  // Sort newest-first by startTime, take limit
  const sorted = [...data.runs].sort(
    (a, b) => new Date(b.stats.startTime).getTime() - new Date(a.stats.startTime).getTime()
  );
  const limited = sorted.slice(0, limit);
  const enriched = enrichRuns(limited);

  if (jsonMode) {
    process.stdout.write(JSON.stringify(formatJson(pending, data.processingContainer, enriched), null, 2) + "\n");
  } else {
    console.log(formatHuman(pending, data.processingContainer, enriched));
  }
}

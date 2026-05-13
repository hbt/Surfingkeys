#!/usr/bin/env bun
// report subcommand — bun scripts/ci.ts report [--json] [--limit N]

interface RemoteResult {
  sha: string;
  exitCode: number | null;
  elapsedMs: number;
  timestamp: string;
}

interface RemoteData {
  queue: string[];               // queue entry filenames
  processingContainer: string | null;
  results: RemoteResult[];
}

interface GitInfo {
  sha: string;
  short: string;
  subject: string;
  date: string;
}

interface EnrichedResult extends RemoteResult {
  short: string;
  subject: string;
  date: string;
}

interface QueueEntry {
  sha: string;
  enqueuedAt: string;
}

// ── Remote gather ─────────────────────────────────────────────────────────────

const REMOTE_WORK_DIR = "/home/ctmsadmin/projects/surfingkeys";

function gatherRemote(): RemoteData {
  const result = Bun.spawnSync(
    ["ssh", "ctms-ops", `cd ${REMOTE_WORK_DIR} && bun scripts/ci-gather.ts`],
    { stdout: "pipe", stderr: "pipe" }
  );
  if (result.exitCode !== 0) {
    const err = new TextDecoder().decode(result.stderr);
    throw new Error(`SSH failed: ${err}`);
  }
  return JSON.parse(new TextDecoder().decode(result.stdout));
}

// ── Git info ──────────────────────────────────────────────────────────────────

function getGitInfo(sha: string): GitInfo | null {
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

function enrichWithGitInfo(results: RemoteResult[]): EnrichedResult[] {
  return results.map(r => {
    const info = getGitInfo(r.sha);
    return {
      ...r,
      short: info?.short ?? r.sha.slice(0, 7),
      subject: info?.subject ?? "(unknown)",
      date: info?.date ?? "",
    };
  });
}

// ── Queue parsing ─────────────────────────────────────────────────────────────

// Filename format: <ISO-ts-with-dashes>-<full-sha>
// SHA has no dashes, so it's always the last `-`-separated token.
function parseQueueEntry(filename: string): QueueEntry {
  const parts = filename.split("-");
  const sha = parts.at(-1)!;
  // Reconstruct timestamp: everything before the last `-<sha>` segment
  const tsRaw = parts.slice(0, -1).join("-");
  // Reverse the replace(/[:.]/g, "-") from post-commit.ts — best effort
  const enqueuedAt = tsRaw.replace(/(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})/, "$1:$2:$3.$4");
  return { sha, enqueuedAt };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
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

function exitIcon(code: number | null): string {
  if (code === null) return "?";
  return code === 0 ? "✅" : "❌";
}

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}

// ── Human output ──────────────────────────────────────────────────────────────

function formatHuman(
  pending: QueueEntry[],
  container: string | null,
  completed: EnrichedResult[]
): string {
  const lines: string[] = [];

  lines.push("Surfingkeys CI  " + "─".repeat(44));
  lines.push("");

  lines.push("Queue");
  lines.push(`  pending     ${pending.length}`);
  if (container) {
    lines.push(`  processing  1  (${container})`);
  } else {
    lines.push(`  processing  0`);
  }
  lines.push("");

  lines.push(`Completed (last ${completed.length})`);
  if (completed.length === 0) {
    lines.push("  (none)");
  } else {
    const hdr = `  ${pad("sha", 8)}${pad("subject", 38)}${pad("exit", 6)}${pad("elapsed", 9)}when`;
    lines.push(hdr);
    lines.push("  " + "─".repeat(7) + "  " + "─".repeat(36) + "  " + "─".repeat(4) + "  " + "─".repeat(7) + "  " + "─".repeat(9));
    for (const r of completed) {
      const icon = exitIcon(r.exitCode);
      const elapsed = formatElapsed(r.elapsedMs);
      const when = formatRelative(r.timestamp);
      lines.push(
        `  ${pad(r.short, 8)}${pad(r.subject, 38)}${pad(icon, 6)}${pad(elapsed, 9)}${when}`
      );
    }
  }

  return lines.join("\n");
}

// ── JSON output ───────────────────────────────────────────────────────────────

function formatJson(
  pending: QueueEntry[],
  container: string | null,
  completed: EnrichedResult[]
) {
  return {
    queue: {
      pending,
      processing: container ? { container } : null,
    },
    completed: completed.map(r => ({
      sha: r.sha,
      short: r.short,
      subject: r.subject,
      exitCode: r.exitCode,
      elapsedMs: r.elapsedMs,
      timestamp: r.timestamp,
      date: r.date,
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

  let remote: RemoteData;
  try {
    remote = gatherRemote();
  } catch (e: any) {
    console.error("Error:", e.message);
    process.exit(1);
  }

  const pending = remote.queue.map(parseQueueEntry);

  // Sort results newest-first by timestamp, then take limit
  const sorted = [...remote.results].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const limited = sorted.slice(0, limit);
  const enriched = enrichWithGitInfo(limited);

  if (jsonMode) {
    process.stdout.write(JSON.stringify(formatJson(pending, remote.processingContainer, enriched), null, 2) + "\n");
  } else {
    console.log(formatHuman(pending, remote.processingContainer, enriched));
  }
}

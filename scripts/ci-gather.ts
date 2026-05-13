#!/usr/bin/env bun
// Runs LOCALLY — gathers CI data via rsync + SSH, outputs JSON.
//
// Usage (standalone): bun scripts/ci-gather.ts
// Imported by:        ci-report.ts

import { readdirSync, readFileSync, existsSync } from "fs";
import * as path from "path";

const REMOTE_HOST = "ctms-ops";
const REMOTE_RUNS = `${REMOTE_HOST}:/home/ctmsadmin/projects/surfingkeys/test-artifacts/reports/runs/`;
const LOCAL_RUNS  = path.resolve("test-artifacts/reports/runs");
const QUEUE_DIR   = "/home/ctmsadmin/ci-queue";

export interface RunStats {
  startTime: string;
  duration: number;   // ms
  expected: number;   // passed
  unexpected: number; // failed
  flaky: number;
  skipped: number;
}

export interface RunEntry {
  filename: string;   // raw filename (no .json)
  sha: string;        // git short hash, or "" if not embedded
  env: string;        // "docker" | "local"
  host: string;       // hostname of the machine that ran the tests, or ""
  stats: RunStats;
}

export interface GatherResult {
  queue: string[];               // queue entry filenames
  processingContainer: string | null;
  runs: RunEntry[];
}

// ── Rsync ─────────────────────────────────────────────────────────────────────

function syncRuns(): void {
  Bun.spawnSync(["rsync", "-az", "--ignore-missing-args", REMOTE_RUNS, LOCAL_RUNS + "/"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  // Non-fatal: fall back to whatever is cached locally
}

// ── SSH calls ─────────────────────────────────────────────────────────────────

function sshLines(cmd: string): string[] {
  const r = Bun.spawnSync(["ssh", REMOTE_HOST, cmd], { stdout: "pipe", stderr: "pipe" });
  return new TextDecoder().decode(r.stdout).split("\n").map(l => l.trim()).filter(Boolean);
}

function fetchQueue(): string[] {
  return sshLines(`ls ${QUEUE_DIR} 2>/dev/null`).filter(f => f !== "worker.lock").sort();
}

function fetchContainer(): string | null {
  const lines = sshLines(`docker ps --format '{{.Names}}' 2>/dev/null`);
  return lines.find(l => l.includes("surfingkeys")) ?? null;
}

// ── Local run parsing ─────────────────────────────────────────────────────────

// Filename format: <ISO-with-dashes>-<sha>-<env>.json
// sha may be empty → <ISO>--<env>.json
function parseRunFilename(filename: string): { sha: string; env: string } {
  const base = filename.replace(/\.json$/, "");
  const parts = base.split("-");
  const env = parts.at(-1) ?? "";
  const sha = parts.at(-2) ?? "";
  return { sha, env };
}

function readRuns(): RunEntry[] {
  if (!existsSync(LOCAL_RUNS)) return [];
  const entries: RunEntry[] = [];
  for (const f of readdirSync(LOCAL_RUNS).filter(f => f.endsWith(".json"))) {
    try {
      const data = JSON.parse(readFileSync(path.join(LOCAL_RUNS, f), "utf8"));
      if (!data?.stats) continue;
      const { sha, env } = parseRunFilename(f);
      entries.push({ filename: f.replace(/\.json$/, ""), sha, env, host: data.host ?? "", stats: data.stats });
    } catch {}
  }
  return entries;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function gather(): Promise<GatherResult> {
  // Parallel: rsync runs + SSH queue + SSH docker ps
  const [queue, container] = await Promise.all([
    Promise.resolve(fetchQueue()),
    Promise.resolve(fetchContainer()),
    Promise.resolve(syncRuns()),
  ]);

  const runs = readRuns();
  return { queue, processingContainer: container, runs };
}

// Standalone usage
if (import.meta.main) {
  const result = await gather();
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

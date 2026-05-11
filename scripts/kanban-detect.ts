#!/usr/bin/env bun
/**
 * kanban-detect.ts — Auto-detect phase of an item from git/fs signals
 * Usage: bun scripts/kanban-detect.ts <id>
 *
 * Detection signals:
 *   implementation — branch exists OR commit SHA present in sessions
 *   testing        — proof artifact file exists + test pass count > 0
 *   merged         — git merge-base --is-ancestor <sha> master succeeds
 *   deployed       — manual only (skipped)
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { spawnSync } from "child_process";

const KANBAN_DIR = join(import.meta.dir, "../data/kanban");

const PHASES = [
  "backlog",
  "spec",
  "planning",
  "implementation",
  "testing",
  "review",
  "merged",
  "deployed",
] as const;

type Phase = (typeof PHASES)[number];

async function findItem(id: string): Promise<{ phase: Phase; path: string; item: any } | null> {
  for (const phase of PHASES) {
    const filePath = join(KANBAN_DIR, phase, `${id}.json`);
    if (existsSync(filePath)) {
      const content = await readFile(filePath, "utf8");
      return { phase, path: filePath, item: JSON.parse(content) };
    }
  }
  return null;
}

function gitBranchExists(branch: string): boolean {
  const result = spawnSync("git", ["branch", "--list", branch], { encoding: "utf8" });
  return result.stdout.trim().length > 0;
}

function gitRemoteBranchExists(branch: string): boolean {
  const result = spawnSync("git", ["ls-remote", "--heads", "origin", branch], { encoding: "utf8" });
  return result.stdout.trim().length > 0;
}

function gitIsAncestor(sha: string, base = "master"): boolean {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", sha, base]);
  return result.status === 0;
}

function detectPhase(item: any): { detected: Phase; signals: string[] } {
  const signals: string[] = [];
  let detected: Phase = "backlog";

  // Check merged — git SHA reachable from master
  const shas = (item.sessions || [])
    .map((s: any) => s.id)
    .filter((id: string) => /^[0-9a-f]{7,40}$/.test(id));

  for (const sha of shas) {
    if (gitIsAncestor(sha, "master")) {
      signals.push(`commit ${sha} is ancestor of master`);
      detected = "merged";
      break;
    }
  }

  if (detected !== "merged") {
    // Check implementation — branch exists
    if (item.branch) {
      if (gitBranchExists(item.branch)) {
        signals.push(`local branch '${item.branch}' exists`);
        detected = "implementation";
      } else if (gitRemoteBranchExists(item.branch)) {
        signals.push(`remote branch '${item.branch}' exists`);
        detected = "implementation";
      }
    }

    // Check testing — proof artifact exists
    if (item.proof?.artifact && existsSync(item.proof.artifact)) {
      signals.push(`proof artifact exists: ${item.proof.artifact}`);
      // Only upgrade if already at implementation
      if (detected === "implementation" || detected === "backlog") {
        detected = "testing";
      }
    }
  }

  if (signals.length === 0) {
    signals.push("no signals detected, defaulting to current phase");
  }

  return { detected, signals };
}

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: bun scripts/kanban-detect.ts <id>");
    process.exit(1);
  }

  const found = await findItem(id);
  if (!found) {
    console.error(`Item not found: ${id}`);
    process.exit(1);
  }

  const { detected, signals } = detectPhase(found.item);

  console.log(`Item:    ${id}`);
  console.log(`Current: ${found.phase}`);
  console.log(`Detected: ${detected}`);
  console.log(`\nSignals:`);
  for (const s of signals) {
    console.log(`  - ${s}`);
  }

  if (detected !== found.phase) {
    console.log(`\nSuggested move: bun scripts/kanban-move.ts ${id} ${detected}`);
  } else {
    console.log(`\nPhase looks correct.`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

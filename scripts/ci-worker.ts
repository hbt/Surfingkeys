#!/usr/bin/env bun
// CI queue worker — run as a systemd service on ctms-ops.
// Processes one commit at a time, flock'd to prevent concurrent workers.

import { existsSync, readdirSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { execSync, spawnSync } from "child_process";
import * as os from "os";

const QUEUE_DIR   = "/home/ctmsadmin/ci-queue";
const RESULTS_DIR = "/home/ctmsadmin/ci-results";
const WORK_DIR    = "/home/ctmsadmin/projects/surfingkeys";
const LOCK_FILE   = `${QUEUE_DIR}/worker.lock`;

mkdirSync(QUEUE_DIR, { recursive: true });
mkdirSync(RESULTS_DIR, { recursive: true });

function nextEntry(): { path: string; sha: string; quick: boolean } | null {
  const files = readdirSync(QUEUE_DIR)
    .filter(f => f !== "worker.lock")
    .sort();  // lexicographic = chronological (ISO ts prefix)
  if (!files.length) return null;
  const file = files[0];
  const filePath = `${QUEUE_DIR}/${file}`;
  const sha = file.split("-").at(-1)!;
  let quick = false;
  try {
    const raw = readFileSync(filePath, "utf8").trim();
    if (raw) quick = JSON.parse(raw).quick === true;
  } catch {}
  return { path: filePath, sha, quick };
}

function run(sha: string, quick: boolean) {
  console.log(`[ci-worker] processing ${sha}${quick ? " (quick)" : ""}`);

  // Verify commit exists
  const check = spawnSync("git", ["-C", WORK_DIR, "cat-file", "-t", sha], { encoding: "utf8" });
  if (check.stdout.trim() !== "commit") {
    // Fetch and retry
    spawnSync("git", ["-C", WORK_DIR, "fetch", "ci"], { stdio: "inherit" });
    const recheck = spawnSync("git", ["-C", WORK_DIR, "cat-file", "-t", sha], { encoding: "utf8" });
    if (recheck.stdout.trim() !== "commit") {
      console.error(`[ci-worker] SHA ${sha} not found after fetch — skipping`);
      return;
    }
  }

  spawnSync("git", ["-C", WORK_DIR, "checkout", "--detach", sha], { stdio: "inherit" });

  const extraArgs = quick
    ? ["npm", "run", "test:playwright:parallel", "--", "tests/playwright/commands/cmd-scroll-down.spec.ts"]
    : [];

  const start = Date.now();
  const result = spawnSync(
    "docker-compose",
    ["run", "--rm", "tests", ...extraArgs],
    { cwd: WORK_DIR, stdio: "inherit", env: { ...process.env, WORKERS: quick ? "1" : "4", DOCKER_CI: "1", GIT_HASH: sha.slice(0, 7), HOST_MACHINE: os.hostname() } }
  );
  const elapsed = Date.now() - start;

  const summary = {
    sha,
    quick,
    exitCode: result.status,
    elapsedMs: elapsed,
    timestamp: new Date().toISOString()
  };
  writeFileSync(`${RESULTS_DIR}/${sha}.json`, JSON.stringify(summary, null, 2));
  console.log(`[ci-worker] done ${sha} exit=${result.status} (${Math.round(elapsed/1000)}s)`);
}

// Main loop
console.log("[ci-worker] started, polling queue...");
while (true) {
  const entry = nextEntry();
  if (entry) {
    rmSync(entry.path);  // dequeue before running (prevents double-process on crash)
    run(entry.sha, entry.quick);
  } else {
    await Bun.sleep(3000);
  }
}

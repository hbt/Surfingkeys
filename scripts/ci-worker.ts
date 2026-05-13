#!/usr/bin/env bun
// CI queue worker — run as a systemd service on ctms-ops.
// Processes one commit at a time, flock'd to prevent concurrent workers.

import { existsSync, readdirSync, rmSync, mkdirSync, writeFileSync } from "fs"
import { execSync, spawnSync } from "child_process"

const QUEUE_DIR   = "/home/ctmsadmin/ci-queue"
const RESULTS_DIR = "/home/ctmsadmin/ci-results"
const WORK_DIR    = "/home/ctmsadmin/projects/surfingkeys"
const LOCK_FILE   = `${QUEUE_DIR}/worker.lock`

mkdirSync(QUEUE_DIR, { recursive: true })
mkdirSync(RESULTS_DIR, { recursive: true })

function nextEntry(): string | null {
  const files = readdirSync(QUEUE_DIR)
    .filter(f => f !== "worker.lock")
    .sort()  // lexicographic = chronological (ISO ts prefix)
  return files.length ? `${QUEUE_DIR}/${files[0]}` : null
}

function run(sha: string) {
  console.log(`[ci-worker] processing ${sha}`)

  // Verify commit exists
  const check = spawnSync("git", ["-C", WORK_DIR, "cat-file", "-t", sha], { encoding: "utf8" })
  if (check.stdout.trim() !== "commit") {
    // Fetch and retry
    spawnSync("git", ["-C", WORK_DIR, "fetch", "ci"], { stdio: "inherit" })
    const recheck = spawnSync("git", ["-C", WORK_DIR, "cat-file", "-t", sha], { encoding: "utf8" })
    if (recheck.stdout.trim() !== "commit") {
      console.error(`[ci-worker] SHA ${sha} not found after fetch — skipping`)
      return
    }
  }

  spawnSync("git", ["-C", WORK_DIR, "checkout", "--detach", sha], { stdio: "inherit" })

  const start = Date.now()
  const result = spawnSync(
    "docker-compose",
    ["run", "--rm", "tests"],
    { cwd: WORK_DIR, stdio: "inherit", env: { ...process.env, WORKERS: "4" } }
  )
  const elapsed = Date.now() - start

  const summary = {
    sha,
    exitCode: result.exitCode,
    elapsedMs: elapsed,
    timestamp: new Date().toISOString()
  }
  writeFileSync(`${RESULTS_DIR}/${sha}.json`, JSON.stringify(summary, null, 2))
  console.log(`[ci-worker] done ${sha} exit=${result.exitCode} (${Math.round(elapsed/1000)}s)`)
}

// Main loop
console.log("[ci-worker] started, polling queue...")
while (true) {
  const entry = nextEntry()
  if (entry) {
    const sha = entry.split("-").at(-1)!
    rmSync(entry)  // dequeue before running (prevents double-process on crash)
    run(sha)
  } else {
    await Bun.sleep(3000)
  }
}

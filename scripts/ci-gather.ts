#!/usr/bin/env bun
// Runs ON ctms-ops — gathers CI queue + results and prints a JSON blob to stdout.
// Invoked via SSH: ssh ctms-ops 'cd /home/ctmsadmin/projects/surfingkeys && bun scripts/ci-gather.ts'

import { readdirSync, readFileSync, existsSync } from "fs";

const QUEUE_DIR   = "/home/ctmsadmin/ci-queue";
const RESULTS_DIR = "/home/ctmsadmin/ci-results";

// Queue — filenames sorted chronologically (ISO prefix), minus the lock file
const queue: string[] = existsSync(QUEUE_DIR)
  ? readdirSync(QUEUE_DIR).filter(f => f !== "worker.lock").sort()
  : [];

// Processing container — first surfingkeys container from docker ps
const dockerPs = Bun.spawnSync(["docker", "ps", "--format", "{{.Names}}"], {
  stdout: "pipe", stderr: "pipe",
});
const dockerOut = new TextDecoder().decode(dockerPs.stdout);
const containers = dockerOut.split("\n").filter(l => l.includes("surfingkeys") && l.trim());
const processingContainer: string | null = containers[0]?.trim() ?? null;

// Results — all *.json files in RESULTS_DIR
const results: unknown[] = [];
if (existsSync(RESULTS_DIR)) {
  for (const f of readdirSync(RESULTS_DIR).filter(f => f.endsWith(".json"))) {
    try {
      results.push(JSON.parse(readFileSync(`${RESULTS_DIR}/${f}`, "utf8")));
    } catch {}
  }
}

process.stdout.write(JSON.stringify({ queue, processingContainer, results }) + "\n");

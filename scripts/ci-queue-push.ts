#!/usr/bin/env bun
// Manual CI queue push — creates a queue entry on ctms-ops via SSH.
//
// Usage:
//   bun scripts/ci-queue-push.ts              # full suite, HEAD sha
//   bun scripts/ci-queue-push.ts --quick      # single test, HEAD sha
//   bun scripts/ci-queue-push.ts --quick <sha>

import { spawnSync } from "child_process";

const args = process.argv.slice(2);
const quick = args.includes("--quick");
const shaArg = args.find(a => !a.startsWith("--"));
const sha = shaArg ?? spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const filename = `${ts}-${sha}`;
const content = quick ? JSON.stringify({ quick: true }) : "";
const QUEUE_DIR = "/home/ctmsadmin/ci-queue";

const cmd = content
  ? `echo '${content}' > ${QUEUE_DIR}/${filename}`
  : `touch ${QUEUE_DIR}/${filename}`;

const result = spawnSync("ssh", ["ctms-ops", cmd], { stdio: "inherit" });
console.log(`[ci-queue-push] queued ${sha.slice(0, 7)} (${quick ? "quick" : "full"})`);
process.exitCode = result.status ?? 0;

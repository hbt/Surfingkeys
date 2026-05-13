#!/usr/bin/env bun
// Usage: post-commit.ts <sha>
// Pushes commit to ctms-ops bare repo, then enqueues for CI.

const sha = process.argv[2];
if (!sha) process.exit(1);

// 1. Push commit objects to ctms-ops bare repo
const push = Bun.spawnSync(["git", "push", "ctms-ops", `${sha}:refs/heads/ci`], {
  stdout: "pipe", stderr: "pipe"
});
if (push.exitCode !== 0) {
  console.error("[ci] push failed:", new TextDecoder().decode(push.stderr));
  process.exit(0);  // non-fatal — don't fail post-commit
}

// 2. Enqueue the SHA on ctms-ops (directory-based queue, one file per commit)
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const queueEntry = `/home/ctmsadmin/ci-queue/${ts}-${sha}`;
const enqueue = Bun.spawnSync(
  ["ssh", "ctms-ops", `mkdir -p /home/ctmsadmin/ci-queue && touch ${queueEntry}`],
  { stdout: "pipe", stderr: "pipe" }
);
if (enqueue.exitCode !== 0) {
  console.error("[ci] enqueue failed:", new TextDecoder().decode(enqueue.stderr));
}
console.log(`[ci] queued ${sha}`);

#!/usr/bin/env bun
/**
 * worktree-setup.ts
 *
 * When run from inside a git worktree, this script:
 *   1. Finds the main (primary) worktree path via `git worktree list --porcelain`
 *   2. Symlinks <main-worktree>/node_modules -> ./node_modules (if not already present)
 *   3. Runs `npm run build:dev` to build the extension
 */

import { existsSync, symlinkSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

function run(cmd: string, args: string[], cwd?: string): { success: boolean; output: string } {
  const result = spawnSync(cmd, args, {
    cwd: cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  return { success: result.status === 0, output: output.trim() };
}

function getMainWorktreePath(): string {
  const result = run("git", ["worktree", "list", "--porcelain"]);
  if (!result.success) {
    throw new Error(`git worktree list failed:\n${result.output}`);
  }

  // The first "worktree" entry in the porcelain output is the main worktree.
  // Format:
  //   worktree /absolute/path
  //   HEAD <sha>
  //   branch refs/heads/...
  const firstLine = result.output.split("\n").find((l) => l.startsWith("worktree "));
  if (!firstLine) {
    throw new Error("Could not parse main worktree path from git output.");
  }
  return firstLine.slice("worktree ".length).trim();
}

// ── main ────────────────────────────────────────────────────────────────────

const cwd = process.cwd();
console.log(`[worktree-setup] Working directory: ${cwd}`);

// Step 1: locate main worktree
const mainPath = getMainWorktreePath();
console.log(`[worktree-setup] Main worktree: ${mainPath}`);

// Step 2: symlink node_modules
const targetLink = resolve(cwd, "node_modules");
const targetSrc = resolve(mainPath, "node_modules");

if (existsSync(targetLink)) {
  console.log(`[worktree-setup] node_modules already present — skipping symlink`);
} else {
  console.log(`[worktree-setup] Creating symlink: ${targetLink} -> ${targetSrc}`);
  symlinkSync(targetSrc, targetLink);
  console.log(`[worktree-setup] Symlink created.`);
}

// Step 3: build
console.log(`[worktree-setup] Running npm run build:dev ...`);
const buildResult = spawnSync("npm", ["run", "build:dev"], {
  cwd,
  encoding: "utf8",
  stdio: "inherit",
});

if (buildResult.status !== 0) {
  console.error(`[worktree-setup] build:dev failed (exit code ${buildResult.status})`);
  process.exit(buildResult.status ?? 1);
}

console.log(`[worktree-setup] Done.`);

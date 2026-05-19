#!/usr/bin/env bun
/**
 * worktree-create.ts
 *
 * Usage: npm run worktree:create -- <branch-name>
 *
 * 1. Derives the new worktree path from the main worktree parent dir
 * 2. Runs `git worktree add <path> -b <branch-name>`
 * 3. Spawns worktree-setup.ts in the new worktree directory
 */

import { resolve, dirname } from "path";
import { spawnSync } from "child_process";

function run(
  cmd: string,
  args: string[],
  cwd?: string,
  inherit = false,
): { success: boolean; output: string } {
  const result = spawnSync(cmd, args, {
    cwd: cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["inherit", "pipe", "pipe"],
  });
  const output = inherit ? "" : ((result.stdout ?? "") + (result.stderr ?? "")).trim();
  return { success: result.status === 0, output };
}

function getMainWorktreePath(): string {
  const result = run("git", ["worktree", "list", "--porcelain"]);
  if (!result.success) {
    throw new Error(`git worktree list failed:\n${result.output}`);
  }
  const firstLine = result.output.split("\n").find((l) => l.startsWith("worktree "));
  if (!firstLine) {
    throw new Error("Could not parse main worktree path from git output.");
  }
  return firstLine.slice("worktree ".length).trim();
}

// ── main ────────────────────────────────────────────────────────────────────

const branch = process.argv[2];
if (!branch) {
  console.error("Usage: npm run worktree:create -- <branch-name>");
  process.exit(1);
}

const mainPath = getMainWorktreePath();
const worktreePath = resolve(dirname(mainPath), `surfingkeys-${branch}`);

console.log(`[worktree-create] Main worktree:  ${mainPath}`);
console.log(`[worktree-create] New worktree:   ${worktreePath}`);
console.log(`[worktree-create] Branch:         ${branch}`);

// Step 1: git worktree add
console.log(`\n[worktree-create] Running: git worktree add ${worktreePath} -b ${branch}`);
const addResult = run("git", ["worktree", "add", worktreePath, "-b", branch], mainPath);
if (!addResult.success) {
  console.error(`[worktree-create] git worktree add failed:\n${addResult.output}`);
  process.exit(1);
}
if (addResult.output) console.log(addResult.output);

// Step 2: run worktree-setup in the new worktree
console.log(`\n[worktree-create] Running worktree:setup in ${worktreePath} ...`);
const setupResult = spawnSync("bun", [resolve(mainPath, "scripts/worktree-setup.ts")], {
  cwd: worktreePath,
  stdio: "inherit",
});

if (setupResult.status !== 0) {
  console.error(`[worktree-create] worktree-setup failed (exit code ${setupResult.status})`);
  process.exit(setupResult.status ?? 1);
}

console.log(`\n[worktree-create] Done. New worktree ready at:\n  ${worktreePath}`);

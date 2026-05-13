#!/usr/bin/env bun
/**
 * worktree-merge.ts
 *
 * Safely merges a worktree branch back into master.
 *
 * Usage:
 *   npm run worktree:merge -- <branch-name> [--remove]
 *
 * Steps:
 *   1. Locate the worktree by branch name
 *   2. Abort if worktree is dirty
 *   3. Show ahead/behind summary and confirm
 *   4. git merge --no-ff <branch> from the main worktree
 *   5. If --remove: git worktree remove + git branch -d
 */

import { spawnSync } from "child_process";
import { createInterface } from "readline";
import path from "path";

// ── ANSI ──────────────────────────────────────────────────────────────────────

const c = {
    reset:  "\x1b[0m",
    bold:   "\x1b[1m",
    dim:    "\x1b[2m",
    green:  "\x1b[32m",
    yellow: "\x1b[33m",
    red:    "\x1b[31m",
};

// ── helpers ───────────────────────────────────────────────────────────────────

function git(args: string[], cwd: string): { ok: boolean; out: string } {
    const r = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
    const out = ((r.stdout ?? "") + (r.stderr ?? "")).trim();
    return { ok: r.status === 0, out };
}

function gitLine(args: string[], cwd: string): string {
    return git(args, cwd).out.split("\n")[0] ?? "";
}

function abort(msg: string): never {
    console.error(`${c.red}Error:${c.reset} ${msg}`);
    process.exit(1);
}

function prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
    });
}

// ── types ─────────────────────────────────────────────────────────────────────

interface Worktree {
    path: string;
    branch: string | null;
    isMain: boolean;
}

function parseWorktrees(cwd: string): Worktree[] {
    const { ok, out } = git(["worktree", "list", "--porcelain"], cwd);
    if (!ok) abort(`git worktree list failed:\n${out}`);
    return out
        .split("\n\n")
        .filter((b) => b.trim())
        .map((block, i) => {
            const lines = block.split("\n");
            const wpath = lines.find((l) => l.startsWith("worktree "))?.slice(9) ?? "";
            const branchLine = lines.find((l) => l.startsWith("branch "));
            const branch = branchLine ? branchLine.slice("branch refs/heads/".length) : null;
            return { path: wpath, branch, isMain: i === 0 };
        });
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
        console.log("Usage: npm run worktree:merge -- <branch-name> [--remove]");
        console.log("       --remove   remove worktree and branch after successful merge");
        process.exit(0);
    }

    const removeAfter = args.includes("--remove");
    const targetBranch = args.find((a) => !a.startsWith("--"));
    if (!targetBranch) abort("No branch name provided.");

    const cwd = process.cwd();
    const worktrees = parseWorktrees(cwd);
    const main = worktrees[0];
    const mainBranch = gitLine(["symbolic-ref", "--short", "HEAD"], main.path);

    if (mainBranch === targetBranch) {
        abort(`"${targetBranch}" is already the main branch — cannot merge into itself.`);
    }

    const target = worktrees.find((wt) => wt.branch === targetBranch);
    if (!target) {
        const branches = worktrees
            .filter((wt) => !wt.isMain && wt.branch)
            .map((wt) => `  ${wt.branch}  (${path.basename(wt.path)})`)
            .join("\n");
        abort(
            `No worktree found for branch "${targetBranch}".\n` +
            (branches ? `Available worktree branches:\n${branches}` : "No other worktrees found."),
        );
    }

    if (target.branch === null) abort("Target worktree is in detached HEAD state.");

    // Dirty check (ignore untracked files — node_modules symlink from worktree:setup is untracked but harmless)
    const statusOut = gitLine(["status", "--porcelain", "--untracked-files=no"], target.path);
    if (statusOut.length > 0) {
        abort(`Worktree at ${target.path} has uncommitted changes. Commit or stash first.`);
    }

    // Ahead/behind
    const rev = git(
        ["rev-list", "--left-right", "--count", `${mainBranch}...${targetBranch}`],
        main.path,
    );
    if (!rev.ok) abort(`Could not compare branches: ${rev.out}`);

    const [behind = 0, ahead = 0] = rev.out.split("\t").map(Number);

    console.log(`\n${c.bold}Merge plan${c.reset}`);
    console.log(`  Branch : ${c.bold}${targetBranch}${c.reset}`);
    console.log(`  Into   : ${c.bold}${mainBranch}${c.reset}`);
    console.log(`  Ahead  : ${ahead > 0 ? c.green : c.dim}${ahead} commit(s)${c.reset}`);
    console.log(`  Behind : ${behind > 0 ? c.yellow : c.dim}${behind} commit(s)${c.reset}`);
    if (removeAfter) {
        console.log(`  Cleanup: ${c.yellow}worktree + branch will be removed after merge${c.reset}`);
    }
    console.log();

    if (ahead === 0) {
        abort(`"${targetBranch}" has no commits ahead of "${mainBranch}" — nothing to merge.`);
    }

    if (behind > 0) {
        console.log(
            `${c.yellow}Warning:${c.reset} Branch is ${behind} commit(s) behind "${mainBranch}". ` +
            `Merge will still proceed.\n`,
        );
    }

    // Confirm
    const answer = await prompt(`Merge "${targetBranch}" → "${mainBranch}"? [y/N] `);
    if (answer.toLowerCase() !== "y") {
        console.log("Aborted.");
        process.exit(0);
    }

    // Merge
    console.log(`\n${c.dim}Running: git merge --no-ff ${targetBranch}${c.reset}`);
    const mergeResult = spawnSync("git", ["merge", "--no-ff", targetBranch], {
        cwd: main.path,
        encoding: "utf8",
        stdio: "inherit",
    });

    if (mergeResult.status !== 0) {
        abort(
            `Merge failed (exit code ${mergeResult.status}).\n` +
            `Resolve conflicts manually, then run: git merge --continue`,
        );
    }

    console.log(`\n${c.green}✓ Merged "${targetBranch}" into "${mainBranch}"${c.reset}`);

    // Optional cleanup
    if (removeAfter) {
        console.log(`\n${c.dim}Removing worktree: ${target.path}${c.reset}`);
        const removeResult = git(["worktree", "remove", target.path], main.path);
        if (!removeResult.ok) {
            console.error(`${c.yellow}Warning:${c.reset} worktree remove failed: ${removeResult.out}`);
            console.error(`Run manually: git worktree remove ${target.path}`);
        } else {
            console.log(`${c.green}✓ Worktree removed${c.reset}`);
        }

        console.log(`${c.dim}Deleting branch: ${targetBranch}${c.reset}`);
        const branchResult = git(["branch", "-d", targetBranch], main.path);
        if (!branchResult.ok) {
            console.error(`${c.yellow}Warning:${c.reset} branch delete failed: ${branchResult.out}`);
            console.error(`Run manually: git branch -d ${targetBranch}`);
        } else {
            console.log(`${c.green}✓ Branch deleted${c.reset}`);
        }
    }

    console.log();
}

main();

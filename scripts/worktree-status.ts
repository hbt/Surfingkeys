#!/usr/bin/env bun
/**
 * worktree-status.ts
 *
 * Prints a status table for all git worktrees:
 *   NAME  BRANCH  AHEAD  BEHIND  DIRTY  LAST COMMIT
 *
 * Usage:
 *   npm run worktree:status
 */

import { spawnSync } from "child_process";
import path from "path";

// ── git helper ────────────────────────────────────────────────────────────────

function git(args: string[], cwd?: string): string {
    const r = spawnSync("git", args, {
        cwd: cwd ?? process.cwd(),
        encoding: "utf8",
        stdio: ["inherit", "pipe", "pipe"],
    });
    return (r.stdout ?? "").trim();
}

// ── types ─────────────────────────────────────────────────────────────────────

interface Worktree {
    path: string;
    head: string;
    branch: string | null; // null = detached HEAD
    isMain: boolean;
}

// ── parse worktrees ───────────────────────────────────────────────────────────

function parseWorktrees(): Worktree[] {
    const raw = git(["worktree", "list", "--porcelain"]);
    return raw
        .split("\n\n")
        .filter((b) => b.trim())
        .map((block, i) => {
            const lines = block.split("\n");
            const wpath = lines.find((l) => l.startsWith("worktree "))?.slice(9) ?? "";
            const head = lines.find((l) => l.startsWith("HEAD "))?.slice(5) ?? "";
            const branchLine = lines.find((l) => l.startsWith("branch "));
            const branch = branchLine ? branchLine.slice("branch refs/heads/".length) : null;
            return { path: wpath, head, branch, isMain: i === 0 };
        });
}

// ── ANSI ──────────────────────────────────────────────────────────────────────

const c = {
    reset: "\x1b[0m",
    dim:   "\x1b[2m",
    bold:  "\x1b[1m",
    green: "\x1b[32m",
    yellow:"\x1b[33m",
    red:   "\x1b[31m",
};

/** Pad a string that may contain ANSI codes, based on visible character count. */
function ansiPad(styled: string, visibleLen: number, colWidth: number): string {
    return styled + " ".repeat(Math.max(0, colWidth - visibleLen));
}

function trunc(s: string, n: number): string {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ── main ──────────────────────────────────────────────────────────────────────

const worktrees = parseWorktrees();
if (worktrees.length === 0) {
    console.log("No worktrees found.");
    process.exit(0);
}

const main = worktrees[0];
const mainBranch = git(["symbolic-ref", "--short", "HEAD"], main.path);

// Column widths (visible characters)
const W = { name: 34, branch: 28, ahead: 6, behind: 7, dirty: 6, commit: 48 };
const totalWidth = Object.values(W).reduce((a, b) => a + b, 0) + Object.keys(W).length - 1;
const sep = c.dim + "─".repeat(totalWidth) + c.reset;

// Header
console.log(`\n${c.bold}Worktrees${c.reset}`);
console.log(sep);
console.log(
    c.dim +
    [
        "NAME".padEnd(W.name),
        "BRANCH".padEnd(W.branch),
        "AHEAD".padEnd(W.ahead),
        "BEHIND".padEnd(W.behind),
        "DIRTY".padEnd(W.dirty),
        "LAST COMMIT",
    ].join(" ") +
    c.reset,
);
console.log(sep);

// Rows
for (const wt of worktrees) {
    const basename = path.basename(wt.path);

    // NAME column
    const suffix = wt.isMain ? " (main)" : "";
    const nameTrunc = trunc(basename, W.name - suffix.length);
    const nameStyled = wt.isMain
        ? `${c.bold}${nameTrunc}${c.reset}${c.dim}${suffix}${c.reset}`
        : nameTrunc;
    const nameVis = nameTrunc.length + suffix.length;

    // BRANCH column
    const branchText = wt.branch ? trunc(wt.branch, W.branch) : "(detached)";
    const branchStyled = wt.branch ? branchText : c.dim + branchText + c.reset;
    const branchVis = branchText.length;

    // AHEAD / BEHIND columns
    let aheadStr: string, aheadVis: number;
    let behindStr: string, behindVis: number;

    if (!wt.isMain && wt.branch) {
        const rev = git(
            ["rev-list", "--left-right", "--count", `${mainBranch}...${wt.branch}`],
            main.path,
        );
        const parts = rev.split("\t").map(Number);
        const behind = parts[0] ?? 0;
        const ahead  = parts[1] ?? 0;

        const aheadNum  = String(ahead);
        const behindNum = String(behind);
        aheadStr  = ahead  > 0 ? `${c.green}${aheadNum}${c.reset}`  : `${c.dim}0${c.reset}`;
        behindStr = behind > 0 ? `${c.red}${behindNum}${c.reset}` : `${c.dim}0${c.reset}`;
        aheadVis  = aheadNum.length;
        behindVis = behindNum.length;
    } else {
        aheadStr  = c.dim + "—" + c.reset;
        behindStr = c.dim + "—" + c.reset;
        aheadVis  = 1;
        behindVis = 1;
    }

    // DIRTY column
    const statusOut = git(["status", "--porcelain"], wt.path);
    const dirty = statusOut.length > 0;
    const dirtyStr = dirty ? `${c.yellow}yes${c.reset}` : `${c.dim}no${c.reset}`;
    const dirtyVis = dirty ? 3 : 2;

    // LAST COMMIT column
    const commitText = trunc(git(["log", "-1", "--format=%s (%cr)"], wt.path), W.commit);
    const commitStyled = c.dim + commitText + c.reset;

    console.log(
        [
            ansiPad(nameStyled,   nameVis,   W.name),
            ansiPad(branchStyled, branchVis, W.branch),
            ansiPad(aheadStr,     aheadVis,  W.ahead),
            ansiPad(behindStr,    behindVis, W.behind),
            ansiPad(dirtyStr,     dirtyVis,  W.dirty),
            commitStyled,
        ].join(" "),
    );
}

console.log(sep + "\n");

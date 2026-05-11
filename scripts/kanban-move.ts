#!/usr/bin/env bun
/**
 * kanban-move.ts — Move item to next phase (validates proof if required)
 * Usage: bun scripts/kanban-move.ts <id> <target-phase> [--proof <path>] [--session-id <id>] [--summary <text>]
 *
 * Phases requiring proof: testing, merged
 */

import { readFile, writeFile, rename, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync as fsExistsSync } from "fs";

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

const PROOF_REQUIRED: Phase[] = ["testing", "merged"];

function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      flags[key] = val;
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, flags };
}

async function findItem(id: string): Promise<{ phase: Phase; path: string } | null> {
  for (const phase of PHASES) {
    const filePath = join(KANBAN_DIR, phase, `${id}.json`);
    if (fsExistsSync(filePath)) {
      return { phase, path: filePath };
    }
  }
  return null;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));

  if (positional.length < 2) {
    console.error("Usage: bun scripts/kanban-move.ts <id> <target-phase> [--proof <path>] [--session-id <id>] [--summary <text>]");
    process.exit(1);
  }

  const [id, targetPhase] = positional;

  if (!PHASES.includes(targetPhase as Phase)) {
    console.error(`Invalid phase: ${targetPhase}. Valid phases: ${PHASES.join(", ")}`);
    process.exit(1);
  }

  const target = targetPhase as Phase;
  const found = await findItem(id);

  if (!found) {
    console.error(`Item not found: ${id}`);
    process.exit(1);
  }

  if (found.phase === target) {
    console.error(`Item ${id} is already in phase: ${target}`);
    process.exit(1);
  }

  // Validate proof if required
  if (PROOF_REQUIRED.includes(target)) {
    if (!flags.proof) {
      console.error(`Phase '${target}' requires --proof <path>`);
      process.exit(1);
    }
    if (!fsExistsSync(flags.proof)) {
      console.error(`Proof file not found: ${flags.proof}`);
      process.exit(1);
    }
  }

  const content = await readFile(found.path, "utf8");
  const item = JSON.parse(content);
  const now = new Date().toISOString();

  // Append session entry
  if (flags["session-id"] || flags.summary) {
    item.sessions.push({
      id: flags["session-id"] || "manual",
      phase: target,
      summary: flags.summary || `Moved to ${target}`,
    });
  }

  // Update proof if provided
  if (flags.proof) {
    item.proof = {
      phase: target,
      artifact: flags.proof,
      summary: flags.summary || `Proof for ${target}`,
      produced_by: flags["session-id"] || "manual",
      at: now,
    };
  }

  item.updated_at = now;

  const targetDir = join(KANBAN_DIR, target);
  await mkdir(targetDir, { recursive: true });
  const targetPath = join(targetDir, `${id}.json`);

  await writeFile(found.path, JSON.stringify(item, null, 2) + "\n");
  await rename(found.path, targetPath);

  console.log(`Moved: ${id}  ${found.phase} → ${target}`);
  console.log(`File: data/kanban/${target}/${id}.json`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

#!/usr/bin/env bun
/**
 * kanban-show.ts — Show full detail of one item
 * Usage: bun scripts/kanban-show.ts <id>
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

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

async function findItem(id: string): Promise<{ phase: Phase; path: string } | null> {
  for (const phase of PHASES) {
    const filePath = join(KANBAN_DIR, phase, `${id}.json`);
    if (existsSync(filePath)) {
      return { phase, path: filePath };
    }
  }
  return null;
}

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: bun scripts/kanban-show.ts <id>");
    process.exit(1);
  }

  const found = await findItem(id);
  if (!found) {
    console.error(`Item not found: ${id}`);
    process.exit(1);
  }

  const content = await readFile(found.path, "utf8");
  const item = JSON.parse(content);

  console.log(`## ${item.title}`);
  console.log(`ID:       ${item.id}`);
  console.log(`Phase:    ${found.phase}`);
  console.log(`Branch:   ${item.branch || "(none)"}`);
  console.log(`Created:  ${item.created_at}`);
  console.log(`Updated:  ${item.updated_at}`);

  if (item.notes) {
    console.log(`Notes:    ${item.notes}`);
  }

  if (item.sessions && item.sessions.length > 0) {
    console.log(`\nSessions (${item.sessions.length}):`);
    for (const s of item.sessions) {
      console.log(`  [${s.id}] ${s.phase}: ${s.summary}`);
    }
  }

  if (item.proof) {
    console.log(`\nProof:`);
    console.log(`  Phase:       ${item.proof.phase}`);
    console.log(`  Artifact:    ${item.proof.artifact || "(none)"}`);
    console.log(`  Summary:     ${item.proof.summary}`);
    console.log(`  Produced by: ${item.proof.produced_by}`);
    console.log(`  At:          ${item.proof.at}`);
  }

  console.log(`\nRaw JSON:`);
  console.log(JSON.stringify(item, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

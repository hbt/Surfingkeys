#!/usr/bin/env bun
/**
 * kanban-list.ts — Print all kanban items grouped by phase
 * Usage: bun scripts/kanban-list.ts [--json]
 */

import { readdir, readFile } from "fs/promises";
import { join } from "path";

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

interface KanbanItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  sessions: Array<{ id: string; phase: string; summary: string }>;
  branch?: string | null;
  proof?: {
    phase: string;
    artifact: string;
    summary: string;
    produced_by: string;
    at: string;
  } | null;
  notes?: string;
  _phase: Phase;
}

async function loadPhase(phase: Phase): Promise<KanbanItem[]> {
  const dir = join(KANBAN_DIR, phase);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const items: KanbanItem[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const content = await readFile(join(dir, file), "utf8");
    const item = JSON.parse(content) as KanbanItem;
    item._phase = phase;
    items.push(item);
  }
  return items;
}

async function main() {
  const useJson = process.argv.includes("--json");
  const all: Record<Phase, KanbanItem[]> = {} as Record<Phase, KanbanItem[]>;

  for (const phase of PHASES) {
    all[phase] = await loadPhase(phase);
  }

  if (useJson) {
    console.log(JSON.stringify(all, null, 2));
    return;
  }

  let total = 0;
  for (const phase of PHASES) {
    const items = all[phase];
    if (items.length === 0) continue;
    total += items.length;
    console.log(`\n## ${phase.toUpperCase()} (${items.length})`);
    for (const item of items) {
      const branch = item.branch ? `  [${item.branch}]` : "";
      const sessions = item.sessions.length > 0 ? `  sessions:${item.sessions.length}` : "";
      console.log(`  - ${item.id}: ${item.title}${branch}${sessions}`);
    }
  }
  console.log(`\nTotal: ${total} items`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

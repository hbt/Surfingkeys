#!/usr/bin/env bun
/**
 * kanban-add.ts — Create a new item in backlog/
 * Usage: bun scripts/kanban-add.ts --title "My feature" [--id my-feature] [--notes "..."]
 */

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const KANBAN_DIR = join(import.meta.dir, "../data/kanban");

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      args[key] = val;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.title) {
    console.error("Usage: bun scripts/kanban-add.ts --title \"My feature\" [--id my-feature] [--notes \"...\"]");
    process.exit(1);
  }

  const id = args.id || slugify(args.title);
  const now = new Date().toISOString();

  const item = {
    id,
    title: args.title,
    created_at: now,
    updated_at: now,
    sessions: [],
    branch: null,
    proof: null,
    notes: args.notes || "",
  };

  const dir = join(KANBAN_DIR, "backlog");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${id}.json`);

  await writeFile(filePath, JSON.stringify(item, null, 2) + "\n");
  console.log(`Created: data/kanban/backlog/${id}.json`);
  console.log(JSON.stringify(item, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

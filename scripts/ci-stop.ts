#!/usr/bin/env bun
// stop subcommand — bun scripts/ci.ts stop

const REMOTE_HOST = "ctms-ops";

const STOP_CONTAINER_CMD =
  'CONTAINER=$(docker ps --format "{{.Names}}" 2>/dev/null | grep surfingkeys | head -1); ' +
  'if [ -n "$CONTAINER" ]; then docker stop "$CONTAINER" && echo "stopped:$CONTAINER"; ' +
  'else echo "stopped:none"; fi';

const CLEAR_QUEUE_CMD =
  'cd /home/ctmsadmin/ci-queue && ' +
  'COUNT=$(ls | grep -vE "^worker\\.lock$" | wc -l | tr -d " "); ' +
  'ls | grep -vE "^worker\\.lock$" | xargs -r rm --; ' +
  'echo "cleared:$COUNT"';

// ── SSH helper ────────────────────────────────────────────────────────────────

function sshLines(cmd: string): string[] {
  const r = Bun.spawnSync(["ssh", REMOTE_HOST, cmd], { stdout: "pipe", stderr: "pipe" });
  return new TextDecoder().decode(r.stdout).split("\n").map(l => l.trim()).filter(Boolean);
}

// ── Parsers ───────────────────────────────────────────────────────────────────

interface StopResult {
  container: string | null; // null means nothing was running
}

interface ClearResult {
  count: number;
}

function parseStopResult(lines: string[]): StopResult {
  const line = lines.find(l => l.startsWith("stopped:")) ?? "stopped:none";
  const value = line.slice("stopped:".length);
  return { container: value === "none" ? null : value };
}

function parseClearResult(lines: string[]): ClearResult {
  const line = lines.find(l => l.startsWith("cleared:")) ?? "cleared:0";
  const value = line.slice("cleared:".length);
  const count = parseInt(value, 10);
  return { count: isNaN(count) ? 0 : count };
}

// ── Output ────────────────────────────────────────────────────────────────────

function formatOutput(stop: StopResult, clear: ClearResult): string {
  const lines: string[] = [];
  lines.push("Surfingkeys CI — stop");

  const containerLine = stop.container
    ? `  container    stopped  ${stop.container}`
    : `  container    nothing running`;
  lines.push(containerLine);

  const entriesLabel = clear.count === 1 ? "entry" : "entries";
  const suffix = clear.count === 0 ? " (already empty)" : "";
  lines.push(`  queue        cleared  ${clear.count} ${entriesLabel} removed${suffix}`);

  return lines.join("\n");
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function run(_argv: string[]) {
  let stopLines: string[];
  let clearLines: string[];

  try {
    [stopLines, clearLines] = await Promise.all([
      Promise.resolve(sshLines(STOP_CONTAINER_CMD)),
      Promise.resolve(sshLines(CLEAR_QUEUE_CMD)),
    ]);
  } catch (e: any) {
    console.error("Error:", e.message);
    process.exit(1);
  }

  const stop = parseStopResult(stopLines);
  const clear = parseClearResult(clearLines);

  console.log(formatOutput(stop, clear));
}

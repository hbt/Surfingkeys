#!/usr/bin/env bun
// restart subcommand — bun scripts/ci.ts restart
// Stops any running container, clears queue, pulls latest code, restarts systemd service.

const REMOTE_HOST  = "ctms-ops";
const WORK_DIR     = "/home/ctmsadmin/projects/surfingkeys";
const SERVICE_NAME = "surfingkeys-ci.service";

const STOP_CONTAINER_CMD =
  'CONTAINER=$(docker ps --format "{{.Names}}" 2>/dev/null | grep surfingkeys | head -1); ' +
  'if [ -n "$CONTAINER" ]; then docker stop "$CONTAINER" && echo "stopped:$CONTAINER"; ' +
  'else echo "stopped:none"; fi';

const CLEAR_QUEUE_CMD =
  'cd /home/ctmsadmin/ci-queue && ' +
  'COUNT=$(ls | grep -vE "^worker\\.lock$" | wc -l | tr -d " "); ' +
  'ls | grep -vE "^worker\\.lock$" | xargs -r rm --; ' +
  'echo "cleared:$COUNT"';

const PULL_CMD =
  `cd ${WORK_DIR} && git checkout master && git pull && git log --oneline -1 | sed 's/^/sha:/'`;

const RESTART_CMD =
  `sudo systemctl restart ${SERVICE_NAME} && sleep 1 && ` +
  `systemctl is-active ${SERVICE_NAME} | sed 's/^/service:/'`;

// ── SSH helper ────────────────────────────────────────────────────────────────

function sshLines(cmd: string): string[] {
  const r = Bun.spawnSync(["ssh", REMOTE_HOST, cmd], { stdout: "pipe", stderr: "pipe" });
  return new TextDecoder().decode(r.stdout).split("\n").map(l => l.trim()).filter(Boolean);
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseStopResult(lines: string[]): { container: string | null } {
  const line = lines.find(l => l.startsWith("stopped:")) ?? "stopped:none";
  const value = line.slice("stopped:".length);
  return { container: value === "none" ? null : value };
}

function parseClearResult(lines: string[]): { count: number } {
  const line = lines.find(l => l.startsWith("cleared:")) ?? "cleared:0";
  const count = parseInt(line.slice("cleared:".length), 10);
  return { count: isNaN(count) ? 0 : count };
}

function parsePullResult(lines: string[]): { sha: string | null } {
  const line = lines.find(l => l.startsWith("sha:"));
  return { sha: line ? line.slice("sha:".length).trim() : null };
}

function parseServiceResult(lines: string[]): { active: boolean } {
  const line = lines.find(l => l.startsWith("service:")) ?? "service:unknown";
  return { active: line.slice("service:".length).trim() === "active" };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function run(_argv: string[]) {
  try {
    // Step 1: stop container + clear queue in parallel
    process.stdout.write("Stopping container and clearing queue... ");
    const [stopLines, clearLines] = await Promise.all([
      Promise.resolve(sshLines(STOP_CONTAINER_CMD)),
      Promise.resolve(sshLines(CLEAR_QUEUE_CMD)),
    ]);
    const stop  = parseStopResult(stopLines);
    const clear = parseClearResult(clearLines);
    console.log("done");

    // Step 2: git pull
    process.stdout.write("Pulling latest code on ctms-ops... ");
    const pullLines = sshLines(PULL_CMD);
    const pull = parsePullResult(pullLines);
    console.log("done");

    // Step 3: restart service
    process.stdout.write("Restarting surfingkeys-ci.service... ");
    const restartLines = sshLines(RESTART_CMD);
    const svc = parseServiceResult(restartLines);
    console.log("done");

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log("\nSurfingkeys CI — restart");

    const containerLine = stop.container
      ? `  container    stopped  ${stop.container}`
      : `  container    nothing was running`;
    console.log(containerLine);

    const entriesLabel = clear.count === 1 ? "entry" : "entries";
    const suffix = clear.count === 0 ? " (already empty)" : "";
    console.log(`  queue        cleared  ${clear.count} ${entriesLabel} removed${suffix}`);

    console.log(`  pull         ${pull.sha ?? "(unknown sha)"}`);
    console.log(`  service      ${svc.active ? "active ✓" : "FAILED ✗"}`);

    if (!svc.active) process.exit(1);
  } catch (e: any) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}

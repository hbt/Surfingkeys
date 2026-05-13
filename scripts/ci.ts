#!/usr/bin/env bun
// CI CLI — bun scripts/ci.ts <subcommand> [flags]

const cmd = process.argv[2];
if (cmd === "report") {
  await import("./ci-report.ts").then(m => m.run(process.argv.slice(3)));
} else {
  console.error("Usage: bun scripts/ci.ts <subcommand>\n  report   Show CI queue and run history");
  process.exit(1);
}

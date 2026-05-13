#!/usr/bin/env bun
// Usage: bun scripts/trace-slides.ts
// Reads playwright-report/index.html (embedded manifest) to map titles → zip files
// Outputs playwright-report/slides/ (extracted JPEGs) + playwright-report/slides.html

import { existsSync, readFileSync, rmSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const reportDir = process.env.REPORT_DIR ?? "test-artifacts/playwright";
const dataDir = join(reportDir, "data");
const slidesDir = join(reportDir, "slides");
const slidesHtml = join(reportDir, "slides.html");
const indexHtml = join(reportDir, "index.html");

// --- 1. Build title → zip path map from index.html embedded manifest ---
// Playwright embeds a base64 zip in the second <script> tag containing per-test JSON files.
// Each JSON has tests[0].title and results[0].attachments with name="trace".

interface TraceEntry {
  title: string;
  zipName: string; // basename of the zip file
}

function readTraceMap(): TraceEntry[] {
  if (!existsSync(indexHtml)) return [];

  const html = readFileSync(indexHtml, "utf8");
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

  // Second script block is the base64-encoded zip with test JSON files
  const b64 = scripts[1]?.replace("data:application/zip;base64,", "");
  if (!b64) return [];

  const zipBuf = Buffer.from(b64, "base64");

  // Use unzip to extract JSON files from the in-memory zip via a temp file
  const tmpZip = "/tmp/pw-report-manifest.zip";
  writeFileSync(tmpZip, zipBuf);

  const result = spawnSync("unzip", ["-o", tmpZip, "*.json", "-d", "/tmp/pw-report-manifest"], {
    encoding: "utf8",
  });
  if (result.status !== 0 && result.status !== 11) return [];

  const entries: TraceEntry[] = [];
  const jsonFiles = readdirSync("/tmp/pw-report-manifest").filter(
    (f) => f.endsWith(".json") && f !== "report.json"
  );

  interface ReportTest {
    title?: string;
    results?: { attachments?: { name: string; path: string }[] }[];
  }
  interface ReportFile {
    tests?: ReportTest[];
  }

  for (const f of jsonFiles) {
    try {
      const obj = JSON.parse(
        readFileSync(join("/tmp/pw-report-manifest", f), "utf8")
      ) as ReportFile;
      for (const test of obj.tests ?? []) {
        const title: string = test.title ?? "";
        const attachments: { name: string; path: string }[] = test.results?.[0]?.attachments ?? [];
        const traceAtt = attachments.find((a) => a.name === "trace");
        if (title && traceAtt?.path) {
          entries.push({ title, zipName: traceAtt.path.replace(/^.*\//, "") });
        }
      }
    } catch {
      // skip malformed JSON
    }
  }

  return entries;
}

const traceMap = readTraceMap();
const titleByZip = new Map(traceMap.map((e) => [e.zipName, e.title]));

console.log(`Found ${traceMap.length} test→zip mapping(s) from index.html`);

// --- 2. Find zips, ordered by traceMap then alphabetically for any extras ---
if (!existsSync(dataDir)) {
  console.error(`No trace data found at ${dataDir}`);
  process.exit(1);
}

const diskZips = new Set(readdirSync(dataDir).filter((f) => f.endsWith(".zip")));

// Only include zips referenced by the current index.html — ignore stale zips from old runs
const orderedZips: string[] = traceMap.map((e) => e.zipName).filter((z) => diskZips.has(z));

if (orderedZips.length === 0) {
  console.error("No zip files found in " + dataDir);
  process.exit(1);
}

console.log(`Processing ${orderedZips.length} zip(s)`);

// --- 3. Wipe and recreate slides dir ---
if (existsSync(slidesDir)) {
  rmSync(slidesDir, { recursive: true });
}
mkdirSync(slidesDir, { recursive: true });

// --- 4. Extract JPEGs and trace files from each zip ---
interface FrameAnnotation {
  path: string;
  scenario?: string;
  step?: string;
}

interface TestSection {
  label: string;
  frames: FrameAnnotation[];
  videoPath?: string;
}

interface StepInfo {
  callId: string;
  parentId?: string;
  startTime: number;
  endTime?: number;
  title: string;
}

function parseTraces(zipPath: string): {
  stepMap: Map<string, StepInfo>;
  frameTs: Map<string, number>;
} {
  const tmpTraceDir = "/tmp/pw-slides-traces";
  spawnSync("rm", ["-rf", tmpTraceDir]);
  mkdirSync(tmpTraceDir, { recursive: true });
  spawnSync("unzip", ["-j", "-o", zipPath, "*.trace", "-d", tmpTraceDir], { encoding: "utf8" });

  const allLines: string[] = [];
  for (const tf of readdirSync(tmpTraceDir).filter((f) => f.endsWith(".trace"))) {
    allLines.push(...readFileSync(join(tmpTraceDir, tf), "utf8").split("\n").filter(Boolean));
  }

  const stepMap = new Map<string, StepInfo>();
  const frameTs = new Map<string, number>();

  interface TraceEvent {
    type: string;
    method?: string;
    callId?: string;
    parentId?: string;
    startTime?: number;
    endTime?: number;
    title?: string;
    sha1?: string;
    timestamp?: number;
  }

  for (const line of allLines) {
    try {
      const e = JSON.parse(line) as TraceEvent;
      if (e.type === "before" && e.method === "test.step" && e.callId && e.startTime && e.title) {
        stepMap.set(e.callId, {
          callId: e.callId,
          parentId: e.parentId,
          startTime: e.startTime,
          title: e.title,
        });
      } else if (e.type === "after" && e.callId && stepMap.has(e.callId)) {
        const step = stepMap.get(e.callId);
        if (step) step.endTime = e.endTime;
      } else if (e.type === "screencast-frame" && e.sha1 && e.timestamp !== undefined) {
        frameTs.set(e.sha1, e.timestamp);
      }
    } catch {
      // skip malformed lines
    }
  }

  return { stepMap, frameTs };
}

function annotateFrame(
  filename: string,
  stepMap: Map<string, StepInfo>,
  frameTs: Map<string, number>
): { scenario?: string; step?: string } {
  const ts = frameTs.get(filename);
  if (ts === undefined) return {};

  const active = [...stepMap.values()].filter(
    (s) => s.startTime <= ts && (s.endTime === undefined || s.endTime >= ts)
  );

  const scenario = active
    .find((s) => s.title.startsWith("Scenario:"))
    ?.title.replace(/^Scenario:\s*/, "");

  const bdd = active
    .filter((s) => /^(Given|When|Then) /.test(s.title))
    .sort((a, b) => b.startTime - a.startTime)[0]?.title;

  // Fallback: show any active step label (not just BDD-style)
  const anyStep = active
    .filter((s) => !s.title.startsWith("Scenario:"))
    .sort((a, b) => b.startTime - a.startTime)[0]?.title;

  return { scenario, step: bdd ?? anyStep };
}

const sections: TestSection[] = [];

for (let i = 0; i < orderedZips.length; i++) {
  const zipName = orderedZips[i] ?? "";
  const zipPath = join(dataDir, zipName);
  const outDir = join(slidesDir, String(i));
  mkdirSync(outDir, { recursive: true });

  const label = titleByZip.get(zipName) ?? zipName.slice(0, 12);

  // Extract only page@*.jpeg files from resources/ using unzip
  const result = spawnSync("unzip", ["-j", "-o", zipPath, "resources/page@*.jpeg", "-d", outDir], {
    encoding: "utf8",
  });

  if (result.status !== 0 && result.status !== 11) {
    // status 11 = no files matched — treat as empty
    console.warn(`  [${i}] unzip warning for ${zipName}: ${result.stderr}`);
  }

  // Parse trace files to build step/frame annotation maps
  const { stepMap, frameTs } = parseTraces(zipPath);

  // List extracted files sorted by timestamp suffix
  const frameFiles = readdirSync(outDir)
    .filter((f) => f.startsWith("page@") && f.endsWith(".jpeg"))
    .sort((a, b) => {
      const tsA = parseInt(/-(\d+)\.jpeg$/.exec(a)?.[1] ?? "0");
      const tsB = parseInt(/-(\d+)\.jpeg$/.exec(b)?.[1] ?? "0");
      return tsA - tsB;
    });

  // Annotate all frames with their active scenario/step
  const annotatedFrames: FrameAnnotation[] = frameFiles.map((f) => {
    const { scenario, step } = annotateFrame(f, stepMap, frameTs);
    return { path: `slides/${i}/${f}`, scenario, step };
  });

  // Generate video from frames using ffmpeg concat with real durations
  let videoPath: string | undefined;
  if (frameFiles.length >= 2) {
    const concatLines: string[] = ["ffconcat version 1.0"];
    for (let j = 0; j < frameFiles.length; j++) {
      const tsA = parseInt(/-(\d+)\.jpeg$/.exec(frameFiles[j] ?? "")?.[1] ?? "0");
      const tsB = parseInt(/-(\d+)\.jpeg$/.exec(frameFiles[j + 1] ?? "")?.[1] ?? String(tsA + 500));
      const duration = Math.max(0.1, (tsB - tsA) / 1000);
      concatLines.push(`file '${frameFiles[j] ?? ""}'`);
      concatLines.push(`duration ${duration.toFixed(3)}`);
    }
    const concatPath = join(outDir, "concat.txt");
    writeFileSync(concatPath, concatLines.join("\n"));

    const videoOut = join(outDir, "video.mp4");
    const ffResult = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatPath,
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        videoOut,
      ],
      { encoding: "utf8" }
    );

    if (ffResult.status === 0) {
      videoPath = `slides/${i}/video.mp4`;
      console.log(`  [${i}] video → ${videoOut}`);
    } else {
      console.warn(`  [${i}] ffmpeg failed: ${ffResult.stderr.slice(0, 200)}`);
    }
  }

  console.log(`  [${i}] "${label}" → ${annotatedFrames.length} frames`);
  sections.push({
    label,
    frames: annotatedFrames,
    videoPath,
  });
}

// --- 5. Write slides.html ---
const sectionsJson = JSON.stringify(sections);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Trace Slides</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #111; color: #eee; font-family: monospace; }
  #tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 16px; background: #1a1a1a; border-bottom: 1px solid #333; }
  .tab { padding: 5px 14px; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; cursor: pointer; font-size: 13px; color: #aaa; white-space: nowrap; }
  .tab.active { background: #3a5a3a; border-color: #5a8a5a; color: #eee; }
  .tab:hover:not(.active) { background: #333; }
  #viewer { display: flex; flex-direction: column; align-items: center; padding: 16px; gap: 12px; }
  #test-label { font-size: 15px; color: #8cf; max-width: 900px; text-align: center; }
  #step-info { text-align: center; max-width: 900px; min-height: 2.6em; display: flex; flex-direction: column; gap: 3px; }
  #scenario-label { font-size: 12px; color: #777; font-style: italic; }
  #step-label { font-size: 14px; color: #bdb; }
  #nav { display: flex; align-items: center; gap: 12px; }
  #counter { font-size: 14px; color: #aaa; min-width: 70px; text-align: center; }
  button { background: #333; color: #eee; border: 1px solid #555; padding: 6px 18px; font-size: 18px; cursor: pointer; border-radius: 4px; }
  button:hover { background: #444; }
  button:disabled { opacity: 0.3; cursor: default; }
  #frame { max-width: 100%; max-height: 80vh; border: 1px solid #555; }
  #hint { font-size: 12px; color: #555; }
  #video-link { font-size: 13px; padding: 5px 14px; background: #2a3a2a; border: 1px solid #4a6a4a; border-radius: 4px; color: #8c8; text-decoration: none; }
  #video-link:hover { background: #3a5a3a; }
  #video-link.hidden { display: none; }
</style>
</head>
<body>
<div id="tabs"></div>
<div id="viewer">
  <div id="test-label"></div>
  <div id="step-info">
    <div id="scenario-label"></div>
    <div id="step-label"></div>
  </div>
  <div id="nav">
    <button id="btn-prev" onclick="nav(-1)">&#8592;</button>
    <div id="counter"></div>
    <button id="btn-next" onclick="nav(1)">&#8594;</button>
  </div>
  <img id="frame" alt="frame">
  <a id="video-link" href="#" target="_blank" class="hidden">&#9654; Watch video</a>
  <div id="hint">← → frames &nbsp;|&nbsp; ↑ ↓ switch test &nbsp;|&nbsp; click tab to jump</div>
</div>
<script>
const sections = ${sectionsJson};
let testIdx = 0;
let frameIdx = 0;

const tabsEl = document.getElementById('tabs');
const labelEl = document.getElementById('test-label');
const scenarioEl = document.getElementById('scenario-label');
const stepEl = document.getElementById('step-label');
const imgEl = document.getElementById('frame');
const counterEl = document.getElementById('counter');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const videoLink = document.getElementById('video-link');

sections.forEach(function(s, i) {
  const tab = document.createElement('div');
  tab.className = 'tab' + (i === 0 ? ' active' : '');
  tab.textContent = 'Test ' + (i + 1) + ': ' + s.label;
  tab.onclick = function() { selectTest(i); };
  tabsEl.appendChild(tab);
});

function selectTest(i) {
  testIdx = i;
  frameIdx = 0;
  document.querySelectorAll('.tab').forEach(function(t, j) {
    t.classList.toggle('active', j === i);
  });
  show();
}

function show() {
  const s = sections[testIdx];
  if (!s || s.frames.length === 0) {
    labelEl.textContent = s ? s.label : '';
    scenarioEl.textContent = '';
    stepEl.textContent = '';
    imgEl.src = '';
    counterEl.textContent = '0 / 0';
    btnPrev.disabled = true;
    btnNext.disabled = true;
    if (videoLink) videoLink.classList.add('hidden');
    return;
  }
  const frame = s.frames[frameIdx];
  labelEl.textContent = s.label;
  imgEl.src = frame.path;
  scenarioEl.textContent = frame.scenario || '';
  stepEl.textContent = frame.step || '';
  counterEl.textContent = (frameIdx + 1) + ' / ' + s.frames.length;
  btnPrev.disabled = frameIdx === 0;
  btnNext.disabled = frameIdx === s.frames.length - 1;
  if (videoLink) {
    if (s.videoPath) {
      videoLink.setAttribute('href', s.videoPath);
      videoLink.classList.remove('hidden');
    } else {
      videoLink.classList.add('hidden');
    }
  }
}

function nav(delta) {
  const s = sections[testIdx];
  if (!s) return;
  frameIdx = Math.max(0, Math.min(frameIdx + delta, s.frames.length - 1));
  show();
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'ArrowRight') nav(1);
  if (e.key === 'ArrowLeft')  nav(-1);
  if (e.key === 'ArrowDown') selectTest(Math.min(testIdx + 1, sections.length - 1));
  if (e.key === 'ArrowUp')   selectTest(Math.max(testIdx - 1, 0));
});

show();
</script>
</body>
</html>
`;

writeFileSync(slidesHtml, html);
console.log(`\nDone! Open: file://${process.cwd()}/${slidesHtml}`);

#!/usr/bin/env node
import { exec } from "child_process";
import fs from "fs";
import path from "path";

const WATCH_DIRS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["src", "worker"];
const debounceMs = 300;
let timer = null;
let lastFile = null;

function runBuild(changedFile) {
  const f = changedFile || "";
  // If CSS changed, rebuild only CSS; otherwise rebuild dist
  const ext = path.extname(f).toLowerCase();
  let cmd = "npm run build:dist";
  if (ext === ".css" || f.includes("index.css") || f.includes("ui/styles")) {
    cmd = "npm run build:css";
  }

  console.log(`Change detected (${f || "unknown"}) — running: ${cmd}`);
  const p = exec(cmd, { cwd: process.cwd() });
  p.stdout.pipe(process.stdout);
  p.stderr.pipe(process.stderr);
}

for (const d of WATCH_DIRS) {
  const full = path.join(process.cwd(), d);
  if (!fs.existsSync(full)) continue;
  try {
    fs.watch(full, { recursive: true }, (ev, filename) => {
      if (!filename) return;
      lastFile = filename;
      clearTimeout(timer);
      timer = setTimeout(() => runBuild(lastFile), debounceMs);
    });
    console.log("Watching", full);
  } catch (e) {
    console.warn("Failed to watch", full, e.message);
  }
}

console.log("Watcher started. Press Ctrl+C to exit.");

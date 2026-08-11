#!/usr/bin/env node
import { spawn, spawnSync } from "child_process";

function run(cmd, args, name) {
  const p = spawn(cmd, args, { stdio: "inherit", shell: true });
  p.on("exit", (code, sig) => {
    console.log(`${name} exited with`, code ?? sig);
  });
  return p;
}

console.log("Running initial build...");
const b = spawnSync("npm", ["run", "build"], { stdio: "inherit", shell: true });
if (b.status !== 0) console.warn("Initial build failed (non-zero exit); continuing anyway");

// The watcher is the whole of dev mode. This used to also spawn `tsx server.ts`
// for a local Express server; that file has not existed for some time, so the
// process died on startup every run and printed an exit code into the middle of
// the watcher's output. Nothing in the extension needs a local server — you load
// dist/chromium unpacked and the worker is reached over the network.
console.log("Starting watcher...");
const watcher = run("node", ["dev/watch.js"], "watcher");

function shutdown() {
  try {
    watcher.kill("SIGTERM");
  } catch (e) {}
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

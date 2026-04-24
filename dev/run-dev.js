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
if (b.status !== 0)
  console.warn("Initial build failed (non-zero exit); continuing anyway");

console.log("Starting watcher and dev server...");
const watcher = run("node", ["dev/watch.js"], "watcher");
const server = run("npx", ["tsx", "server.ts"], "server");

function shutdown() {
  try {
    watcher.kill("SIGTERM");
  } catch (e) {}
  try {
    server.kill("SIGTERM");
  } catch (e) {}
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

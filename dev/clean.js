#!/usr/bin/env node
import fs from "fs";
import path from "path";

const toRemove = [
  path.join(process.cwd(), "dist"),
  path.join(process.cwd(), "releases"),
  path.join(process.cwd(), "src", "ui", "styles", "compiled.css"),
];

for (const p of toRemove) {
  try {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      console.log("Removed", p);
    }
  } catch (e) {
    console.error("Failed to remove", p, e.message);
  }
}

console.log("Clean complete.");

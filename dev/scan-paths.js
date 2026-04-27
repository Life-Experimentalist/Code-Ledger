#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Scanner to find problematic "/" paths that should be "./"
 * These are typically found in:
 * 1. import/from statements in ES modules
 * 2. Dynamic import() calls
 * 3. File path constants
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "..", "src");

const PATTERNS = {
  // ES6 imports starting with "/" (absolute path)
  "ES6 import": { regex: /from\s+["']\/(?!\/)[^"']*["']/g, safe: false },
  // Dynamic imports with "/"
  "Dynamic import": {
    regex: /import\s*\(\s*["']\/(?!\/)[^"']*["']\s*\)/g,
    safe: false,
  },
  // Fetch URLs (usually safe, but worth checking)
  "Fetch call": { regex: /fetch\s*\(\s*["']\/(?!\/)[^"']*["']/g, safe: true },
  // File path constants with "/"
  "Path literal": { regex: /:\s*["']\/(?!\/)[^"']*\/[^"']*["']/g, safe: true },
  // HTML src/href attributes pointing to files (not HTTP)
  "HTML resource": {
    regex: /(src|href)\s*=\s*["']\/(?!\/)[^"']*["']/g,
    safe: true,
  },
};

function* walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!["node_modules", "dist", ".git"].includes(file)) {
        yield* walkDir(fullPath);
      }
    } else if (
      file.endsWith(".js") ||
      file.endsWith(".ts") ||
      file.endsWith(".html")
    ) {
      yield fullPath;
    }
  }
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const relPath = path.relative(srcDir, filePath);
  const issues = [];

  for (const [name, { regex, safe }] of Object.entries(PATTERNS)) {
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(content))) {
      const lineNum = content.substring(0, match.index).split("\n").length;
      const line = content.split("\n")[lineNum - 1].trim();

      // Skip comments
      if (line.startsWith("//") || line.startsWith("*")) continue;

      issues.push({
        pattern: name,
        safe,
        line: lineNum,
        code: match[0],
        context: line.substring(0, 80),
      });
    }
  }

  return issues;
}

console.log("\n📋 Path Scanning Report");
console.log("=======================\n");

let totalIssues = 0;
let unsafeIssues = 0;
const fileMap = new Map();

for (const filePath of walkDir(srcDir)) {
  const issues = scanFile(filePath);
  if (issues.length > 0) {
    fileMap.set(filePath, issues);
    totalIssues += issues.length;
    unsafeIssues += issues.filter((i) => !i.safe).length;
  }
}

if (unsafeIssues === 0) {
  console.log("✅ No problematic '/' paths found!\n");
  console.log(
    "Note: All import/from statements use correct relative paths (../ or ./)"
  );
} else {
  console.log(`⚠️  Found ${unsafeIssues} potentially problematic path(s):\n`);

  for (const [filePath, issues] of fileMap) {
    const relPath = path.relative(process.cwd(), filePath);
    const unsafeCount = issues.filter((i) => !i.safe).length;

    if (unsafeCount > 0) {
      console.log(`📄 ${relPath}`);
      for (const issue of issues.filter((i) => !i.safe)) {
        console.log(`   Line ${issue.line}: [${issue.pattern}]`);
        console.log(`   Code: ${issue.code}`);
        console.log(`   Suggestion: Change "/" to "./"\n`);
      }
    }
  }
}

if (totalIssues > unsafeIssues) {
  console.log(
    `ℹ️  Found ${totalIssues - unsafeIssues} additional safe path(s) (HTTP/API calls)\n`
  );
}

console.log("Quick Fix Guide:");
console.log("================");
console.log('1. Replace: from "/<path>" → from "./<path>"');
console.log('2. Replace: import("/<path>") → import("./<path>")');
console.log('3. HTTP paths like "/api/..." are safe and should NOT be changed');
console.log(
  '4. Manifest paths like "handlers/..." are extension paths and are safe\n'
);

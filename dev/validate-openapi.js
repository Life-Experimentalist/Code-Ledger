#!/usr/bin/env node
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

function normalizePath(p) {
  // Remove trailing slash (except if exactly '/')
  if (!p) return p;
  let out = p.trim();
  if (out !== "/" && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

function implToSpecPath(impl) {
  // Convert Hono/Express style ':id' to OpenAPI '{id}'
  return impl.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function readSpec(specPath) {
  const raw = fs.readFileSync(specPath, "utf8");
  const doc = yaml.load(raw);
  return doc;
}

function extractWorkerRoutes(workerPath) {
  const src = fs.readFileSync(workerPath, "utf8");
  const regex =
    /app\.(get|post|put|delete|patch|options)\(\s*['\"`]([^'\"`]+)['\"`]/g;
  const routes = {};
  let m;
  while ((m = regex.exec(src)) !== null) {
    const method = m[1].toLowerCase();
    let rawPath = m[2];
    if (!rawPath.startsWith("/")) rawPath = "/" + rawPath;
    // Skip the catch-all static route
    if (rawPath.includes("*")) continue;
    const specPath = implToSpecPath(rawPath);
    const norm = normalizePath(specPath);
    routes[norm] = routes[norm] || new Set();
    routes[norm].add(method);
  }
  return routes;
}

function compare(spec, implRoutes) {
  const specPaths = Object.keys(spec.paths || {}).map(normalizePath);
  const specSet = new Set(specPaths);

  const missingInSpec = [];
  for (const implPath of Object.keys(implRoutes)) {
    if (!specSet.has(implPath)) missingInSpec.push(implPath);
  }

  const missingImpl = [];
  for (const sp of specPaths) {
    // ignore generic server root or wildcard
    if (sp === "/" || sp.includes("*")) continue;
    if (!implRoutes[sp]) missingImpl.push(sp);
  }

  return { missingInSpec, missingImpl };
}

async function main() {
  const repoRoot = process.cwd();
  const specPath = path.join(repoRoot, "docs", "OPENAPI.yaml");
  const workerPath = path.join(repoRoot, "worker", "src", "index.js");

  if (!fs.existsSync(specPath)) {
    console.error("OpenAPI spec not found at", specPath);
    process.exit(2);
  }
  if (!fs.existsSync(workerPath)) {
    console.error("Worker source not found at", workerPath);
    process.exit(2);
  }

  const spec = readSpec(specPath);
  const implRoutes = extractWorkerRoutes(workerPath);

  const { missingInSpec, missingImpl } = compare(spec, implRoutes);

  let exitCode = 0;
  if (missingInSpec.length) {
    console.error("\nERROR: Implemented routes missing from OpenAPI spec:");
    missingInSpec.forEach((p) => console.error("  -", p));
    exitCode = 2;
  }
  if (missingImpl.length) {
    console.warn(
      "\nWARN: OpenAPI declares routes that are not implemented in worker:",
    );
    missingImpl.forEach((p) => console.warn("  -", p));
    // keep as warning but report; you may want to enforce later
  }

  if (exitCode !== 0) {
    console.error(
      "\nOpenAPI validation FAILED. Please update docs/OPENAPI.yaml or implement the missing routes.",
    );
  } else {
    console.log(
      "\nOpenAPI validation passed — implemented routes are present in the spec.",
    );
  }
  process.exit(exitCode);
}

main().catch((e) => {
  console.error("Validator error", e);
  process.exit(3);
});

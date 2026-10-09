#!/usr/bin/env node
// Deterministic concatenation build for the Worker.
//
//   node tools/build-worker.mjs            # writes src/index.js from src/modules/MANIFEST.txt
//   node tools/build-worker.mjs --check    # exits 1 when src/index.js differs from the rebuilt output
//
// The manifest lists module paths (relative to the modules root) in output order, one per line.
// Blank lines and lines starting with # are ignored. Module files are concatenated as-is: every
// file is an exact byte slice of the original source including the newline that ends its last
// line, so the output is the plain concatenation with no separator. Lines between
// "// @build:imports-start" and "// @build:imports-end" (and the exports pair) are removed, so a
// module may carry real ESM import/export blocks for tooling without changing the generated
// single-file output. No dependencies, no parsing: bytes in are bytes out.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback; };
const modulesRoot = resolve(root, option("--modules", "src/modules"));
const manifestPath = resolve(modulesRoot, "MANIFEST.txt");
const outputPath = resolve(root, option("--out", "src/index.js"));
const checkOnly = args.includes("--check");

const MARKERS = [["// @build:imports-start", "// @build:imports-end"], ["// @build:exports-start", "// @build:exports-end"]];

// Removes marker-delimited lines. A trailing "\n" in the file survives because split("\n") keeps
// an empty last element that join("\n") turns back into the final newline.
function stripBuildBlocks(text, modulePath) {
  const lines = text.split("\n");
  const out = [];
  let open = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (open) {
      if (trimmed === open) open = null;
      continue;
    }
    const pair = MARKERS.find(([start]) => trimmed === start);
    if (pair) { open = pair[1]; continue; }
    if (MARKERS.some(([, end]) => trimmed === end)) throw new Error(`${modulePath}: stray ${trimmed}`);
    out.push(line);
  }
  if (open) throw new Error(`${modulePath}: unterminated build block (${open} missing)`);
  return out.join("\n");
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

if (!existsSync(manifestPath)) {
  console.error(`manifest not found: ${manifestPath}`);
  process.exit(2);
}
const order = readFileSync(manifestPath, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const seen = new Set();
const parts = [];
for (const rel of order) {
  if (seen.has(rel)) throw new Error(`duplicate manifest entry: ${rel}`);
  seen.add(rel);
  const text = readFileSync(resolve(modulesRoot, rel), "utf8");
  if (text.includes("\r")) throw new Error(`${rel}: CR found; modules must use LF`);
  if (!text.endsWith("\n")) throw new Error(`${rel}: file must end with a newline`);
  parts.push(stripBuildBlocks(text, rel));
}
const built = parts.join("");
const builtHash = sha256(built);

if (checkOnly) {
  const current = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
  const currentHash = sha256(current);
  if (currentHash !== builtHash) {
    console.error(`build drift: ${outputPath}\n  committed ${currentHash}\n  rebuilt   ${builtHash}\nRun: node tools/build-worker.mjs`);
    process.exit(1);
  }
  console.log(`build identity ok: ${order.length} modules, ${built.length} chars, sha256 ${builtHash}`);
} else {
  writeFileSync(outputPath, built);
  console.log(`wrote ${outputPath}: ${order.length} modules, ${built.length} chars, sha256 ${builtHash}`);
}

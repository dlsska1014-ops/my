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
//
// A module must be UTF-8 without BOM, use LF only and end with exactly one newline. The build
// refuses anything else, so an editor that adds or trims the final newline cannot change the
// output. validation/validate-build-identity-v22932.mjs imports the functions below and applies
// the same rules inside the repository harness.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BUILD_MARKERS = [
  ["// @build:imports-start", "// @build:imports-end"],
  ["// @build:exports-start", "// @build:exports-end"],
];

// Strings are hashed as UTF-8, so a built string and the bytes of the file it was written to agree.
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

export function parseManifest(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
}

export function checkModuleText(text, modulePath) {
  if (text.charCodeAt(0) === 0xfeff) throw new Error(`${modulePath}: UTF-8 BOM found; save the file without BOM`);
  if (text.includes("\r")) throw new Error(`${modulePath}: CR found; modules must use LF`);
  if (!text.endsWith("\n")) throw new Error(`${modulePath}: file must end with a newline`);
  if (text.endsWith("\n\n")) throw new Error(`${modulePath}: file must end with exactly one newline; remove the trailing blank line`);
}

// Removes marker-delimited lines. A trailing "\n" in the file survives because split("\n") keeps
// an empty last element that join("\n") turns back into the final newline.
export function stripBuildBlocks(text, modulePath) {
  const lines = text.split("\n");
  const out = [];
  let open = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (open) {
      if (trimmed === open) open = null;
      continue;
    }
    const pair = BUILD_MARKERS.find(([start]) => trimmed === start);
    if (pair) { open = pair[1]; continue; }
    if (BUILD_MARKERS.some(([, end]) => trimmed === end)) throw new Error(`${modulePath}: stray ${trimmed}`);
    out.push(line);
  }
  if (open) throw new Error(`${modulePath}: unterminated build block (${open} missing)`);
  return out.join("\n");
}

// readModule(path) returns a module's text. An empty order is refused so that a damaged manifest
// can never write an empty src/index.js.
export function assembleWorker(order, readModule) {
  if (order.length === 0) throw new Error("manifest lists no modules");
  const seen = new Set();
  const parts = [];
  for (const modulePath of order) {
    if (seen.has(modulePath)) throw new Error(`duplicate manifest entry: ${modulePath}`);
    seen.add(modulePath);
    const text = readModule(modulePath);
    checkModuleText(text, modulePath);
    parts.push(stripBuildBlocks(text, modulePath));
  }
  return parts.join("");
}

export function buildFromModulesRoot(modulesRoot) {
  const order = parseManifest(readFileSync(resolve(modulesRoot, "MANIFEST.txt"), "utf8"));
  const text = assembleWorker(order, (modulePath) => readFileSync(resolve(modulesRoot, modulePath), "utf8"));
  return { order, text };
}

const USAGE = "usage: node tools/build-worker.mjs [--check] [--modules <dir>] [--out <file>]";

function parseArgs(args) {
  const parsed = { check: false, modules: "src/modules", out: "src/index.js" };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--check") parsed.check = true;
    else if ((arg === "--modules" || arg === "--out") && args[i + 1] && !args[i + 1].startsWith("--")) parsed[arg.slice(2)] = args[(i += 1)];
    else throw new Error(`unknown or incomplete argument: ${arg}\n${USAGE}`);
  }
  return parsed;
}

function main(args) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const modulesRoot = resolve(root, options.modules);
  const outputPath = resolve(root, options.out);
  if (!existsSync(resolve(modulesRoot, "MANIFEST.txt"))) {
    console.error(`manifest not found: ${resolve(modulesRoot, "MANIFEST.txt")}`);
    return 2;
  }
  let built;
  try {
    built = buildFromModulesRoot(modulesRoot);
  } catch (error) {
    console.error(`build failed: ${error.message}`);
    return 1;
  }
  const builtHash = sha256(built.text);
  const summary = `${built.order.length} modules, ${Buffer.byteLength(built.text)} bytes, sha256 ${builtHash}`;
  const currentHash = existsSync(outputPath) ? sha256(readFileSync(outputPath)) : null;
  if (options.check) {
    if (currentHash !== builtHash) {
      console.error(`build drift: ${outputPath}\n  committed ${currentHash ?? "(missing)"}\n  rebuilt   ${builtHash}\nRun: npm run build:worker`);
      return 1;
    }
    console.log(`build identity ok: ${summary}`);
    return 0;
  }
  if (currentHash === builtHash) {
    console.log(`unchanged ${outputPath}: ${summary}`);
    return 0;
  }
  writeFileSync(outputPath, built.text);
  console.log(`wrote ${outputPath}: ${summary}`);
  return 0;
}

// Runs only as a script; importing this file (the harness does) has no side effects.
const entry = process.argv[1] ? resolve(process.argv[1]) : "";
const self = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self) {
  process.exitCode = main(process.argv.slice(2));
}

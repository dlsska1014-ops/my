#!/usr/bin/env node
// Compares the top-level statements of two Worker builds by syntax tree, so a change that only
// moves code or reformats it (whitespace between tokens, comments, quote style) shows up as
// "same", while any change to code, string values or template literal text shows up as changed.
// Template literal chunks keep their raw text: whitespace inside HTML/CSS/client code is
// served bytes and counts as a change.
//
//   node tools/compare-worker-statements.mjs <before.js> <after.js> [--allow-changed NAME]... [--allow-reorder]
//
// Statements are matched by the names they declare; statements without names (export lists,
// expression statements) are matched by content. Exits 0 when every difference is an allowed
// changed name and, unless --allow-reorder, the statement order is the same.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseModule, topLevelDeclarations } from "./worker-analysis.mjs";

function canonical(node) {
  if (typeof node === "bigint") return `${node}n`;
  if (Array.isArray(node)) return node.map(canonical);
  if (!node || typeof node !== "object") return node;
  if (node instanceof RegExp) return String(node);
  const out = {};
  for (const key of Object.keys(node).sort()) {
    if (key === "start" || key === "end" || key === "loc" || key === "range") continue;
    if (key === "raw" && node.type === "Literal") continue;
    out[key] = canonical(node[key]);
  }
  return out;
}

export function statementFingerprints(text) {
  return topLevelDeclarations(parseModule(text)).map((d) => {
    const digest = createHash("sha256").update(JSON.stringify(canonical(d.statement))).digest("hex");
    return { key: d.names.length ? d.names.join(",") : `${d.kind}:${digest.slice(0, 16)}`, kind: d.kind, digest };
  });
}

export function compareStatements(beforeText, afterText) {
  const before = statementFingerprints(beforeText);
  const after = statementFingerprints(afterText);
  const afterByKey = new Map(after.map((s) => [s.key, s]));
  const beforeKeys = new Set(before.map((s) => s.key));
  const changed = before.filter((s) => afterByKey.has(s.key) && afterByKey.get(s.key).digest !== s.digest).map((s) => s.key);
  const removed = before.filter((s) => !afterByKey.has(s.key)).map((s) => s.key);
  const added = after.filter((s) => !beforeKeys.has(s.key)).map((s) => s.key);
  const common = new Set(before.map((s) => s.key).filter((key) => afterByKey.has(key)));
  const order = (list) => list.map((s) => s.key).filter((key) => common.has(key)).join("|");
  return { before: before.length, after: after.length, same: common.size - changed.length, changed, removed, added, reordered: order(before) !== order(after) };
}

function main(argv) {
  const files = [];
  const allowed = new Set();
  let allowReorder = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--allow-changed" && argv[i + 1]) allowed.add(argv[(i += 1)]);
    else if (argv[i] === "--allow-reorder") allowReorder = true;
    else if (!argv[i].startsWith("--")) files.push(argv[i]);
    else { console.error(`unknown argument: ${argv[i]}`); return 2; }
  }
  if (files.length !== 2) { console.error("usage: node tools/compare-worker-statements.mjs <before.js> <after.js> [--allow-changed NAME]... [--allow-reorder]"); return 2; }
  const result = compareStatements(readFileSync(resolve(files[0]), "utf8"), readFileSync(resolve(files[1]), "utf8"));
  console.log(`top-level statements: before ${result.before}, after ${result.after}, identical ${result.same}`);
  console.log(`changed: ${result.changed.join(", ") || "-"}`);
  console.log(`removed: ${result.removed.join(", ") || "-"}`);
  console.log(`added:   ${result.added.join(", ") || "-"}`);
  console.log(`order:   ${result.reordered ? "changed" : "same"}`);
  const unexpected = [...result.changed.filter((key) => !allowed.has(key)), ...result.removed.map((key) => `-${key}`), ...result.added.map((key) => `+${key}`)];
  if (result.reordered && !allowReorder) unexpected.push("(order)");
  const missing = [...allowed].filter((key) => !result.changed.includes(key));
  if (missing.length) console.log(`allowed but unchanged: ${missing.join(", ")}`);
  if (unexpected.length) { console.error(`unexpected differences: ${unexpected.join(", ")}`); return 1; }
  console.log("only allowed differences");
  return 0;
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
const self = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self) process.exitCode = main(process.argv.slice(2));

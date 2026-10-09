#!/usr/bin/env node
// Writes ESM import/export blocks into every src/modules file so each module reads as a standalone
// ES module (editor navigation, per-module checks) without changing the deployed file:
// tools/build-worker.mjs removes the blocks, so src/index.js stays byte-identical.
//
//   node tools/annotate-modules.mjs            rewrite the blocks from the current code
//   node tools/annotate-modules.mjs --check    exit 1 when a block is missing or stale
//   node tools/annotate-modules.mjs --strip    remove every block
//
// The blocks are derived data. Imports list, per other module, the top-level names this module
// references (resolved lexically, tools/worker-analysis.mjs); exports list the names that other
// modules reference. npm run build:worker runs this before the build, so editing a module and
// running that one command keeps both the blocks and src/index.js current.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleWorker, checkModuleText, parseManifest, sha256, stripBuildBlocks } from "./build-worker.mjs";
import { freeReferences, parseModule, topLevelDeclarations } from "./worker-analysis.mjs";

const LINE_LIMIT = 100;

function formatList(keyword, names, tail) {
  const single = `${keyword} { ${names.join(", ")} }${tail}`;
  if (single.length <= LINE_LIMIT) return single;
  const lines = [];
  let line = "";
  for (const name of names) {
    const next = line ? `${line}, ${name}` : name;
    if (line && `  ${next},`.length > LINE_LIMIT) { lines.push(`  ${line},`); line = name; } else line = next;
  }
  if (line) lines.push(`  ${line},`);
  return `${keyword} {\n${lines.join("\n")}\n}${tail}`;
}

function importPath(fromModule, toModule) {
  const relative = posix.relative(posix.dirname(fromModule), toModule);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

// Reads the modules, analyses the joined source once and returns, per module, the current text
// and the text with fresh blocks. Throws when a statement crosses a module boundary.
export function planAnnotations(modulesRoot) {
  const order = parseManifest(readFileSync(resolve(modulesRoot, "MANIFEST.txt"), "utf8"));
  const current = new Map();
  const bodies = new Map();
  for (const path of order) {
    const text = readFileSync(resolve(modulesRoot, path), "utf8");
    checkModuleText(text, path);
    current.set(path, text);
    bodies.set(path, stripBuildBlocks(text, path));
  }
  const ranges = [];
  let offset = 0;
  for (const path of order) { ranges.push({ path, start: offset, end: offset + bodies.get(path).length }); offset += bodies.get(path).length; }
  const moduleAt = (position) => {
    let low = 0;
    let high = ranges.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (position < ranges[middle].start) high = middle - 1;
      else if (position >= ranges[middle].end) low = middle + 1;
      else return ranges[middle].path;
    }
    throw new Error(`no module at offset ${position}`);
  };
  const joined = order.map((path) => bodies.get(path)).join("");
  let program;
  try {
    program = parseModule(joined);
  } catch (error) {
    if (typeof error.pos !== "number") throw error;
    const path = moduleAt(Math.min(error.pos, joined.length - 1));
    const range = ranges.find((r) => r.path === path);
    const text = current.get(path);
    const headLines = text.startsWith("// @build:imports-start") ? text.slice(0, text.indexOf("// @build:imports-end")).split("\n").length : 0;
    const line = headLines + joined.slice(range.start, error.pos).split("\n").length;
    throw new Error(`${path}:${line}: ${error.message.replace(/ [(][0-9]+:[0-9]+[)]$/, "")}`);
  }
  const declarations = topLevelDeclarations(program);
  const owner = new Map();
  const statements = new Map(order.map((path) => [path, []]));
  for (const declaration of declarations) {
    const path = moduleAt(declaration.start);
    if (moduleAt(declaration.end - 1) !== path) throw new Error(`top-level statement ${declaration.names.join(",") || declaration.kind} crosses a module boundary at ${path}`);
    statements.get(path).push(declaration);
    for (const name of declaration.names) {
      if (owner.has(name)) throw new Error(`${name} is declared in ${owner.get(name)} and ${path}`);
      owner.set(name, path);
    }
  }
  const imports = new Map(order.map((path) => [path, new Map()]));
  const exportsOf = new Map(order.map((path) => [path, new Set()]));
  const alreadyExported = new Map(order.map((path) => [path, new Set()]));
  const crossWrites = [];
  for (const path of order) {
    for (const declaration of statements.get(path)) {
      if (declaration.exported) declaration.names.forEach((name) => alreadyExported.get(path).add(name));
      if (declaration.kind === "export-list") for (const specifier of declaration.statement.specifiers) alreadyExported.get(path).add(specifier.exported.name ?? specifier.exported.value);
      for (const reference of freeReferences(declaration.statement)) {
        const source = owner.get(reference.name);
        if (!source || source === path) continue;
        if (!imports.get(path).has(source)) imports.get(path).set(source, new Set());
        imports.get(path).get(source).add(reference.name);
        exportsOf.get(source).add(reference.name);
        if (reference.write) crossWrites.push(`${path} writes ${reference.name} (${source})`);
      }
    }
  }
  const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const modules = order.map((path) => {
    const sources = order.filter((source) => imports.get(path).has(source));
    const importLines = sources.map((source) => formatList("import", [...imports.get(path).get(source)].sort(byName), ` from "${importPath(path, source)}";`));
    const exportNames = [...exportsOf.get(path)].filter((name) => !alreadyExported.get(path).has(name)).sort(byName);
    const head = importLines.length ? `// @build:imports-start\n${importLines.join("\n")}\n// @build:imports-end\n` : "";
    const tail = exportNames.length ? `// @build:exports-start\n${formatList("export", exportNames, ";")}\n// @build:exports-end\n` : "";
    const expected = `${head}${bodies.get(path)}${tail}`;
    if (stripBuildBlocks(expected, path) !== bodies.get(path)) throw new Error(`${path}: generated blocks do not strip back to the module body`);
    checkModuleText(expected, path);
    return { path, current: current.get(path), body: bodies.get(path), expected, importCount: importLines.length, importedNames: sources.reduce((n, s) => n + imports.get(path).get(s).size, 0), exportCount: exportNames.length };
  });
  return { order, modules, crossWrites, joinedSha256: sha256(joined) };
}

function main(argv) {
  const known = new Set(["--check", "--strip"]);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length || argv.length > 1) { console.error("usage: node tools/annotate-modules.mjs [--check | --strip]"); return 2; }
  const modulesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src/modules");
  let plan;
  try { plan = planAnnotations(modulesRoot); } catch (error) { console.error(`annotate failed: ${error.message}`); return 1; }
  const mode = argv[0] ?? "--write";
  const target = (module) => (mode === "--strip" ? module.body : module.expected);
  const stale = plan.modules.filter((module) => module.current !== target(module));
  if (mode === "--check") {
    if (stale.length) { console.error(`import/export blocks are stale in ${stale.length} modules: ${stale.slice(0, 5).map((m) => m.path).join(", ")}${stale.length > 5 ? ", ..." : ""}\nRun: npm run build:worker`); return 1; }
    console.log(`module blocks current: ${plan.modules.length} modules`);
    return 0;
  }
  const rebuilt = assembleWorker(plan.order, (path) => target(plan.modules.find((module) => module.path === path)));
  if (sha256(rebuilt) !== plan.joinedSha256) { console.error("annotate failed: the build output would change; nothing was written"); return 1; }
  for (const module of stale) writeFileSync(resolve(modulesRoot, module.path), target(module));
  const imports = plan.modules.reduce((n, m) => n + m.importedNames, 0);
  const exports = plan.modules.reduce((n, m) => n + m.exportCount, 0);
  console.log(`${mode === "--strip" ? "stripped" : "annotated"} ${stale.length} of ${plan.modules.length} modules (${imports} imported names, ${exports} exported names); build output unchanged`);
  if (plan.crossWrites.length) console.log(`cross-module assignments (read-only under real ESM): ${plan.crossWrites.length}, known list in validation/validate-module-syntax-v22932.mjs`);
  return 0;
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
const self = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self) process.exitCode = main(process.argv.slice(2));

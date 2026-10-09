// Read-only structural analysis of src/index.js using the vendored acorn (tools/vendor/acorn.mjs, same 8.16.0 as Node 22).
// Run: node analyze-worker-structure.mjs <path-to-index.js> <out-dir>
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import * as acorn from "../../../../tools/vendor/acorn.mjs";
const fs = require("fs");
const path = require("path");

const file = process.argv[2];
const outDir = process.argv[3];
fs.mkdirSync(outDir, { recursive: true });
const src = fs.readFileSync(file, "utf8");
const t0 = Date.now();
const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true, ranges: true, allowHashBang: true });
const parseMs = Date.now() - t0;

function declNames(node) {
  if (!node) return [];
  if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") return node.id ? [node.id.name] : [];
  if (node.type === "VariableDeclaration") return node.declarations.flatMap((d) => patternNames(d.id));
  return [];
}
function patternNames(p) {
  if (!p) return [];
  if (p.type === "Identifier") return [p.name];
  if (p.type === "ObjectPattern") return p.properties.flatMap((pr) => pr.type === "RestElement" ? patternNames(pr.argument) : patternNames(pr.value));
  if (p.type === "ArrayPattern") return p.elements.flatMap((e) => patternNames(e));
  if (p.type === "AssignmentPattern") return patternNames(p.left);
  if (p.type === "RestElement") return patternNames(p.argument);
  return [];
}

// ---- top-level inventory
const top = [];
const exportedNames = new Set();
let defaultExport = null;
for (const node of ast.body) {
  let kind = node.type;
  let names = [];
  let decl = node;
  if (node.type === "ExportNamedDeclaration") {
    if (node.declaration) { decl = node.declaration; names = declNames(decl); kind = "Export+" + decl.type; names.forEach((n) => exportedNames.add(n)); }
    else { kind = "ExportList"; names = node.specifiers.map((s) => s.local.name); names.forEach((n) => exportedNames.add(n)); }
  } else if (node.type === "ExportDefaultDeclaration") {
    kind = "ExportDefault";
    names = node.declaration.type === "Identifier" ? [node.declaration.name] : ["(default)"];
    defaultExport = names[0];
  } else {
    names = declNames(node);
  }
  const isFunctionConst = decl.type === "VariableDeclaration" && decl.declarations.length === 1 && decl.declarations[0].init && /Function/.test(decl.declarations[0].init.type);
  top.push({
    i: top.length, kind: isFunctionConst ? "VariableDeclaration(fn)" : kind, names, start: node.loc.start.line, end: node.loc.end.line,
    bytes: node.end - node.start, node: decl, raw: node,
    varKind: decl.type === "VariableDeclaration" ? decl.kind : "",
  });
}
const topNames = new Map(); // name -> index
for (const t of top) for (const n of t.names) if (!topNames.has(n)) topNames.set(n, t.i);

// ---- generic walker
function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== "string") return;
  if (visit(node, parent) === false) return;
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "range" || key === "parent") continue;
    const v = node[key];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === "string") walk(c, visit, node); }
    else if (v && typeof v.type === "string") walk(v, visit, node);
  }
}

// collect local declarations inside a node (over-approximate shadowing)
function localDecls(node) {
  const names = new Set();
  walk(node, (n) => {
    if (n.type === "VariableDeclarator") patternNames(n.id).forEach((x) => names.add(x));
    else if ((n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") && n.id && n !== node) names.add(n.id.name);
    else if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") n.params.forEach((p) => patternNames(p).forEach((x) => names.add(x)));
    else if (n.type === "CatchClause" && n.param) patternNames(n.param).forEach((x) => names.add(x));
  });
  return names;
}

// ---- references per top-level entry
const edges = new Map(); // "from\tto" -> count
const refsByEntry = new Map();
const templates = [];
const toStringSites = [];
const newFunctionSites = [];
const globalThisKeys = new Set();
const envKeys = new Map();
for (const t of top) {
  const own = new Set(t.names);
  const locals = localDecls(t.node);
  const refs = new Map();
  walk(t.node, (n, parent) => {
    if (n.type === "Identifier") {
      const name = n.name;
      // skip non-reference positions
      if (parent) {
        if (parent.type === "MemberExpression" && parent.property === n && !parent.computed) return;
        if (parent.type === "Property" && parent.key === n && !parent.computed && !parent.shorthand) return;
        if (parent.type === "Property" && parent.key === n && parent.shorthand && parent.value === n) { /* shorthand is a reference */ }
        if (parent.type === "MethodDefinition" && parent.key === n) return;
        if (parent.type === "PropertyDefinition" && parent.key === n) return;
        if (parent.type === "LabeledStatement" || parent.type === "BreakStatement" || parent.type === "ContinueStatement") return;
        if ((parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" || parent.type === "ClassDeclaration") && parent.id === n) return;
        if (parent.type === "VariableDeclarator" && parent.id === n) return;
        if (parent.type === "ExportSpecifier" || parent.type === "ImportSpecifier") return;
      }
      if (own.has(name)) return;
      if (locals.has(name)) return;
      if (topNames.has(name)) refs.set(name, (refs.get(name) || 0) + 1);
      return;
    }
    if (n.type === "TemplateLiteral") {
      const size = n.end - n.start;
      if (size >= 2000) {
        const head = n.quasis.map((q) => q.value.raw).join("${…}").slice(0, 90).replace(/\s+/g, " ");
        templates.push({ entry: t.names[0] || `(stmt ${t.i})`, line: n.loc.start.line, bytes: size, head });
      }
    }
    if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && !n.callee.computed && n.callee.property.name === "toString" && n.callee.object.type === "Identifier" && topNames.has(n.callee.object.name)) {
      toStringSites.push({ target: n.callee.object.name, inside: t.names[0] || `(stmt ${t.i})`, line: n.loc.start.line });
    }
    if (n.type === "NewExpression" && n.callee.type === "Identifier" && n.callee.name === "Function") newFunctionSites.push({ inside: t.names[0] || `(stmt ${t.i})`, line: n.loc.start.line });
    if (n.type === "MemberExpression" && n.object.type === "Identifier" && n.object.name === "globalThis" && !n.computed) globalThisKeys.add(n.property.name);
    if (n.type === "MemberExpression" && n.object.type === "Identifier" && n.object.name === "env" && !n.computed && /^[A-Z][A-Z0-9_]+$/.test(n.property.name)) envKeys.set(n.property.name, (envKeys.get(n.property.name) || 0) + 1);
  });
  refsByEntry.set(t.i, refs);
  for (const [to, c] of refs) {
    const from = t.names[0] || `(stmt ${t.i})`;
    edges.set(`${from}\t${to}`, (edges.get(`${from}\t${to}`) || 0) + c);
  }
}

// fan-in
const fanIn = new Map();
for (const [k, c] of edges) { const [, to] = k.split("\t"); fanIn.set(to, (fanIn.get(to) || 0) + 1); }

// ---- route literals inside the worker object
const workerEntry = top.find((t) => t.names.includes("ACCOUNTBOOK_WORKER"));
const routeLiterals = new Map();
const routeRegexes = [];
if (workerEntry) {
  walk(workerEntry.node, (n) => {
    if (n.type === "Literal" && typeof n.value === "string" && /^\/[A-Za-z0-9._\-\/:]*$/.test(n.value) && n.value.length > 1) routeLiterals.set(n.value, (routeLiterals.get(n.value) || 0) + 1);
    if (n.type === "Literal" && n.regex && /\\\//.test(n.regex.pattern)) routeRegexes.push({ line: n.loc.start.line, pattern: n.regex.pattern });
  });
}

// ---- top-level initializers that call functions (evaluation-order hazards)
const initHazards = [];
for (const t of top) {
  if (t.node.type !== "VariableDeclaration") continue;
  for (const d of t.node.declarations) {
    if (!d.init) continue;
    const calls = [];
    walk(d.init, (n) => {
      if (n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") return false;
      if (n.type === "CallExpression" && n.callee.type === "Identifier" && topNames.has(n.callee.name)) calls.push(n.callee.name);
      if (n.type === "Identifier" && topNames.has(n.name) && !t.names.includes(n.name)) calls.push("ref:" + n.name);
    });
    if (calls.length) initHazards.push({ name: patternNames(d.id).join(","), line: t.start, uses: [...new Set(calls)].slice(0, 12).join(" ") });
  }
}

// ---- write outputs
const tsv = (rows) => rows.map((r) => r.join("\t")).join("\n") + "\n";
fs.writeFileSync(path.join(outDir, "toplevel.tsv"), tsv([["i", "kind", "varKind", "names", "start", "end", "lines", "bytes", "exported", "fanIn", "fanOut"], ...top.map((t) => [t.i, t.kind, t.varKind, t.names.join(","), t.start, t.end, t.end - t.start + 1, t.bytes, t.names.some((n) => exportedNames.has(n)) ? "Y" : "", t.names.reduce((a, n) => a + (fanIn.get(n) || 0), 0), refsByEntry.get(t.i).size])]));
fs.writeFileSync(path.join(outDir, "edges.tsv"), tsv([["from", "to", "count"], ...[...edges].map(([k, c]) => [...k.split("\t"), c])]));
fs.writeFileSync(path.join(outDir, "templates.tsv"), tsv([["entry", "line", "bytes", "head"], ...templates.sort((a, b) => b.bytes - a.bytes).map((x) => [x.entry, x.line, x.bytes, x.head])]));
fs.writeFileSync(path.join(outDir, "tostring.tsv"), tsv([["target", "inside", "line"], ...toStringSites.map((x) => [x.target, x.inside, x.line])]));
fs.writeFileSync(path.join(outDir, "newfunction.tsv"), tsv([["inside", "line"], ...newFunctionSites.map((x) => [x.inside, x.line])]));
fs.writeFileSync(path.join(outDir, "routes.txt"), [...routeLiterals].sort().map(([r, c]) => `${r}\t${c}`).join("\n") + "\n\n# regex\n" + routeRegexes.map((r) => `${r.line}\t${r.pattern}`).join("\n") + "\n");
fs.writeFileSync(path.join(outDir, "init-hazards.tsv"), tsv([["name", "line", "uses"], ...initHazards.map((x) => [x.name, x.line, x.uses])]));
fs.writeFileSync(path.join(outDir, "globalthis.txt"), [...globalThisKeys].sort().join("\n") + "\n");
fs.writeFileSync(path.join(outDir, "env.tsv"), tsv([...envKeys].sort((a, b) => b[1] - a[1])));

const summary = {
  parseMs, bytes: src.length, lines: ast.loc.end.line, topLevelStatements: top.length,
  functions: top.filter((t) => t.kind === "FunctionDeclaration" || t.kind === "VariableDeclaration(fn)").length,
  consts: top.filter((t) => t.kind === "VariableDeclaration").length,
  classes: top.filter((t) => t.kind === "ClassDeclaration").length,
  exportsListed: exportedNames.size, defaultExport, edges: edges.size, templatesOver2k: templates.length,
  templateBytesOver2k: templates.reduce((a, b) => a + b.bytes, 0), toStringSites: toStringSites.length, newFunctionSites: newFunctionSites.length,
  routeLiterals: routeLiterals.size, initHazards: initHazards.length,
  workerObject: workerEntry ? { start: workerEntry.start, end: workerEntry.end, bytes: workerEntry.bytes } : null,
};
fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

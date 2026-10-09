// Build a positional split manifest from proposed module boundaries, compute module-level
// dependency map, cycles, relocation candidates, and run a split -> concat byte-identity dry run.
// Run: node build-split-manifest.mjs <index.js> <ast-out-dir> <dryrun-dir>
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import * as acorn from "../../../../tools/vendor/acorn.mjs";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const file = process.argv[2];
const astDir = process.argv[3];
const dryDir = process.argv[4];
const src = fs.readFileSync(file, "utf8");
const lines = src.split("\n");
const offsets = [0, 0];
for (let i = 0; i < src.length; i += 1) if (src.charCodeAt(i) === 10) offsets.push(i + 1);
// exact byte slice of a module including the newline that ends its last line
const sliceOf = (m) => src.slice(offsets[m.startLine], offsets[m.endLine + 1] ?? src.length);
const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true, ranges: true });

// Proposed modules: [first statement line, path]. Comments before a statement travel with it.
const BOUNDARIES = [
  [1, "runtime/global-state.js"],
  [50, "runtime/ops-telemetry.js"],
  [644, "runtime/config-readiness.js"],
  [828, "runtime/ops-monitor.js"],
  [945, "worker/router.js"],
  [2180, "public/site-config.js"],
  [2408, "public/content-pages.js"],
  [2713, "client/shared-input-parsers.js"],
  [2855, "client/legacy-ui-runtime.js"],
  [4004, "web/html-postprocess.js"],
  [4469, "runtime/leases.js"],
  [4635, "runtime/http.js"],
  [4834, "auth/crypto-admin-session.js"],
  [5119, "admin/transactions-households.js"],
  [5655, "settings/categories-keywords.js"],
  [5994, "settings/payment-assets.js"],
  [6490, "settings/reserve-plans.js"],
  [6890, "admin/category-guide-pages.js"],
  [7108, "admin/bulk-and-return-paths.js"],
  [7234, "import/flexible-import-parser.js"],
  [7800, "data/households-members-rows.js"],
  [8124, "admin/dashboard-page.js"],
  [8486, "admin/settings-audit-pages.js"],
  [8655, "admin/backup-compare.js"],
  [9040, "admin/backup-apply.js"],
  [9329, "admin/import-history-rollback.js"],
  [9636, "admin/release-audit-pages.js"],
  [9955, "features/card-benefits.js"],
  [10239, "features/payment-methods-page.js"],
  [10537, "admin/ops-diagnostics-pages.js"],
  [10766, "web/unified-nav.js"],
  [11003, "admin/guide-pages.js"],
  [11402, "admin/meme-content-pages.js"],
  [11571, "features/budget-alerts-annual-goals.js"],
  [11748, "client/v5-bundle-mains.js"],
  [13038, "features/settlement-ops-pages.js"],
  [13407, "admin/nlu-openbuilder-ops.js"],
  [13590, "web/menu-and-guides.js"],
  [13909, "auth/user-session.js"],
  [14260, "auth/identity-reauth.js"],
  [14587, "auth/kakao-oauth.js"],
  [14826, "data/users-household-create.js"],
  [15004, "import/csv-duplicates.js"],
  [15136, "my/members-page.js"],
  [15174, "my/card-import-guide.js"],
  [15357, "my/backup-import.js"],
  [15816, "cron/recurring-auto-apply.js"],
  [15961, "my/groups-budget-bulk.js"],
  [16160, "my/report-challenge.js"],
  [16486, "my/reports-premium.js"],
  [16768, "my/insight-page.js"],
  [17029, "client/insight-main.js"],
  [18118, "my/analysis-page.js"],
  [18324, "my/settings-page.js"],
  [18604, "my/access-control.js"],
  [18674, "my/transactions.js"],
  [18891, "my/households-lifecycle.js"],
  [19366, "domain/budgets.js"],
  [19690, "my/home-sections.js"],
  [20017, "features/meme-cards.js"],
  [20567, "web/quick-chip-icons.js"],
  [20652, "assets/mobile-v81-css.js"],
  [20804, "assets/ab-cursor.js"],
  [20886, "assets/number-flow.js"],
  [21451, "assets/asset-registry.js"],
  [21618, "assets/accountbook-shell-css.js"],
  [22921, "assets/theme-home-assets.js"],
  [23129, "client/nav-search-notif-mains.js"],
  [24078, "assets/icons-manifest.js"],
  [24349, "assets/historical-runtime-assets.js"],
  [24351, "assets/asset-responses.js"],
  [24430, "my/mobile-home.js"],
  [24994, "admin/pc-analysis-calendar.js"],
  [25366, "my/money-plan-home-layout.js"],
  [25504, "admin/budget-center-recurring.js"],
  [25731, "auth/local-login-pages.js"],
  [25987, "auth/kakao-web-claim.js"],
  [26165, "web/login-page-side-nav.js"],
  [26221, "domain/analytics.js"],
  [26416, "features/meme-engine-premium.js"],
  [26860, "admin/dashboard-fragments.js"],
  [26977, "kakao/reply-texts.js"],
  [27353, "kakao/intent-nlu.js"],
  [27664, "kakao/response-builders.js"],
  [27814, "kakao/edit-session-v4.js"],
  [28135, "kakao/edit-state-machine.js"],
  [28710, "kakao/edit-flow-v4.js"],
  [29049, "kakao/request-guards.js"],
  [29215, "kakao/guided-flow-state.js"],
  [29499, "kakao/household-budget-commands.js"],
  [29980, "kakao/guided-flows.js"],
  [30309, "kakao/skill-handler.js"],
  [30796, "kakao/transaction-save.js"],
  [30970, "api/user-api.js"],
  [31434, "api/admin-api.js"],
  [31594, "kakao/group-links-first-record.js"],
  [32152, "admin/identity-merge.js"],
  [32310, "kakao/identity-chat-first.js"],
  [32575, "domain/users-households.js"],
  [32750, "data/supabase-client.js"],
  [32817, "kakao/simple-commands.js"],
  [32918, "nlu/transaction-parser.js"],
  [33064, "nlu/amount-parser.js"],
  [33245, "nlu/date-payment.js"],
  [33458, "nlu/category-rules.js"],
  [33618, "domain/transactions-core.js"],
  [33950, "admin/launch-guide-pages.js"],
  [34161, "worker/test-exports.js"],
];

// top-level statements with names
function declNames(node) {
  if (!node) return [];
  if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") return node.id ? [node.id.name] : [];
  if (node.type === "VariableDeclaration") return node.declarations.flatMap((d) => d.id.type === "Identifier" ? [d.id.name] : []);
  return [];
}
const stmts = ast.body.map((node) => {
  let decl = node, kind = node.type;
  if (node.type === "ExportNamedDeclaration") { if (node.declaration) { decl = node.declaration; kind = "Export+" + decl.type; } else kind = "ExportList"; }
  if (node.type === "ExportDefaultDeclaration") kind = "ExportDefault";
  return { kind, names: kind === "ExportList" || kind === "ExportDefault" ? [] : declNames(decl), start: node.loc.start.line, end: node.loc.end.line, bytes: node.end - node.start };
});
const starts = new Set(BOUNDARIES.map((b) => b[0]));
const snapped=[];for (const b of BOUNDARIES){ if(b[0]===1) continue; const st=stmts.find((x)=>x.start>=b[0]); if(!st) throw new Error("no statement at/after "+b[0]); if(st.start!==b[0]) snapped.push(b[0]+"->"+st.start+" "+b[1]); b[0]=st.start; } if(snapped.length) console.error("snapped boundaries: "+snapped.join("; "));

// assign statements to modules
const modules = BOUNDARIES.map(([start, p], i) => ({ i, path: p, firstStmtLine: start, nextStart: BOUNDARIES[i + 1]?.[0] ?? Infinity, stmts: [] }));
for (const st of stmts) {
  const m = modules.findLast((mod) => st.start >= mod.firstStmtLine);
  m.stmts.push(st);
}
// exact line ranges: a module begins right after the previous module's last statement end line.
let cursor = 1;
for (const m of modules) {
  m.startLine = cursor;
  m.endLine = m.stmts.length ? m.stmts[m.stmts.length - 1].end : cursor;
  cursor = m.endLine + 1;
}
modules[modules.length - 1].endLine = lines.length - (src.endsWith("\n") ? 1 : 0); // real line count: the trailing newline is not a line
const nameToModule = new Map();
for (const m of modules) for (const st of m.stmts) for (const n of st.names) nameToModule.set(n, m.path);

// edges from the previous analysis
const edgeRows = fs.readFileSync(path.join(astDir, "edges.tsv"), "utf8").trim().split("\n").slice(1).map((l) => l.split("\t"));
const modEdges = new Map(); // from->to -> {count, names:Set}
const inboundByName = new Map(); // name -> Map(module -> count)
for (const [from, to, c] of edgeRows) {
  const mf = nameToModule.get(from), mt = nameToModule.get(to);
  if (!mf || !mt) continue;
  if (!inboundByName.has(to)) inboundByName.set(to, new Map());
  inboundByName.get(to).set(mf, (inboundByName.get(to).get(mf) || 0) + Number(c));
  if (mf === mt) continue;
  const k = `${mf}\t${mt}`;
  if (!modEdges.has(k)) modEdges.set(k, { count: 0, names: new Set() });
  modEdges.get(k).count += Number(c);
  modEdges.get(k).names.add(to);
}
// module graph, cycles (SCC via Tarjan)
const adj = new Map(modules.map((m) => [m.path, new Set()]));
for (const k of modEdges.keys()) { const [a, b] = k.split("\t"); adj.get(a).add(b); }
let index = 0; const idx = new Map(), low = new Map(), onStack = new Set(), stack = []; const sccs = [];
function strong(v) {
  idx.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v);
  for (const w of adj.get(v)) { if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w))); }
  if (low.get(v) === idx.get(v)) { const comp = []; let w; do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v); if (comp.length > 1) sccs.push(comp); }
}
for (const m of modules) if (!idx.has(m.path)) strong(m.path);

// relocation candidates: names referenced from other modules far more than from own module
const reloc = [];
for (const [name, byMod] of inboundByName) {
  const own = nameToModule.get(name);
  const ownCount = byMod.get(own) || 0;
  let best = null;
  for (const [mod, c] of byMod) if (mod !== own && (!best || c > best[1])) best = [mod, c];
  const totalOther = [...byMod].filter(([mod]) => mod !== own).reduce((a, [, c]) => a + c, 0);
  const otherModules = [...byMod].filter(([mod]) => mod !== own).length;
  if (best && ownCount === 0 && otherModules === 1) reloc.push({ name, own, to: best[0], count: best[1] });
}
// shared utilities: referenced from many modules
const shared = [];
for (const [name, byMod] of inboundByName) {
  const own = nameToModule.get(name);
  const otherModules = [...byMod].filter(([mod]) => mod !== own).length;
  if (otherModules >= 8) shared.push({ name, own, modules: otherModules, refs: [...byMod].reduce((a, [, c]) => a + c, 0) });
}

// outputs
const tsv = (rows) => rows.map((r) => r.join("\t")).join("\n") + "\n";
const out = path.join(astDir, "modules");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "split-manifest.tsv"), tsv([["order", "path", "start_line", "end_line", "lines", "bytes", "statements", "functions", "first_name", "last_name", "imports_from", "imported_by"],
  ...modules.map((m) => {
    const bytes = sliceOf(m).length;
    const fns = m.stmts.filter((s) => s.kind === "FunctionDeclaration" || s.kind.endsWith("FunctionDeclaration")).length;
    const importsFrom = new Set([...modEdges.keys()].filter((k) => k.startsWith(m.path + "\t")).map((k) => k.split("\t")[1])).size;
    const importedBy = new Set([...modEdges.keys()].filter((k) => k.endsWith("\t" + m.path)).map((k) => k.split("\t")[0])).size;
    const named = m.stmts.filter((s) => s.names.length);
    return [m.i + 1, m.path, m.startLine, m.endLine, m.endLine - m.startLine + 1, bytes, m.stmts.length, fns, named[0]?.names[0] || "", named[named.length - 1]?.names[0] || "", importsFrom, importedBy];
  })]));
fs.writeFileSync(path.join(out, "module-edges.tsv"), tsv([["from", "to", "refs", "distinct_names", "names"], ...[...modEdges].sort((a, b) => b[1].count - a[1].count).map(([k, v]) => [...k.split("\t"), v.count, v.names.size, [...v.names].slice(0, 12).join(",")])]));
fs.writeFileSync(path.join(out, "module-members.tsv"), tsv([["module", "name", "kind", "start", "end", "bytes"], ...modules.flatMap((m) => m.stmts.flatMap((s) => s.names.map((n) => [m.path, n, s.kind, s.start, s.end, s.bytes])))]));
fs.writeFileSync(path.join(out, "cycles.txt"), sccs.map((c) => c.join(" <-> ")).join("\n") + "\n");
fs.writeFileSync(path.join(out, "relocation-candidates.tsv"), tsv([["name", "current_module", "only_used_by", "refs"], ...reloc.sort((a, b) => b.count - a.count).map((r) => [r.name, r.own, r.to, r.count])]));
fs.writeFileSync(path.join(out, "shared-utilities.tsv"), tsv([["name", "current_module", "using_modules", "refs"], ...shared.sort((a, b) => b.modules - a.modules).map((r) => [r.name, r.own, r.modules, r.refs])]));

// dry run: split and concat
fs.rmSync(dryDir, { recursive: true, force: true });
fs.mkdirSync(dryDir, { recursive: true });
const parts = [];
for (const m of modules) {
  const text = sliceOf(m);
  const p = path.join(dryDir, m.path);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  parts.push(text);
}
const rebuilt = parts.join("");
const h = (s) => crypto.createHash("sha256").update(s).digest("hex");
const summary = {
  modules: modules.length, sccCount: sccs.length, largestScc: sccs.reduce((a, c) => Math.max(a, c.length), 0),
  moduleEdges: modEdges.size, relocationCandidates: reloc.length, sharedUtilities: shared.length,
  original_sha256: h(src), rebuilt_sha256: h(rebuilt), identical: h(src) === h(rebuilt), originalLines: lines.length,
  sizes: { max: Math.max(...modules.map((m) => sliceOf(m).length)), over100k: modules.filter((m) => sliceOf(m).length > 100000).map((m) => m.path) },
};
fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
const option = name => process.argv[process.argv.indexOf(name) + 1];
const boundaryOnly = process.argv.includes("--boundary-case") ? option("--boundary-case") : "";
const root = resolve(process.argv.includes("--repo") ? option("--repo") : fileURLToPath(new URL("../", import.meta.url)));
assert.equal(Number(process.versions.node.split(".")[0]), 22);
globalThis.fetch = async () => { throw Error("benchmark external fetch blocked"); };
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-16T12:00:00+09:00");
const source = readFileSync(join(root, "src/index.js"));
const worker = await import(pathToFileURL(join(root, "src/index.js")));
const parse = text => worker.parseFlexibleImportRecords(text, "house-synthetic", "11111111-1111-4111-8111-111111111111", { source: "my_import", maxRows: 5000, importYear: 2026, mappingMetadata: true, mappingDelta: [] });
const textFor = n => "날짜,금액,내용\n" + Array.from({ length: n }, (_, i) => `2026-07-01,${10000 + i},합성구매${i + 1}`).join("\n");
const report = { root, node: { execPath: process.execPath, version: process.version }, workerSha256: createHash("sha256").update(source).digest("hex"), nativeFetchBlocked: true, measurement: "Local Node wall/process CPU; not Cloudflare CPU proof", criteria: { maxWallMs: 3000, maxCpuMs: 3000, maxHeapDeltaMiB: 80, maxAdditionalPeakRssMiB: 96, rationale: "Bounded local completion under 3s, <80 MiB end heap growth and <96 MiB isolated additional high-water RSS. Peak RSS includes native/allocator memory; heapDelta is not peak heap. Cloudflare Free 10ms/128MB requires separate runtime evidence." }, timings: [], counts: [], boundaries: [] };
for (const n of boundaryOnly ? [] : [1, 10, 120, 1000]) {
  const input = textFor(n); const digest = createHash("sha256").update(input).digest("hex");
  for (let sample = 0; sample < 6; sample++) {
    const cpuStart = process.cpuUsage(), start = performance.now();
    const result = parse(input), wallMs = performance.now() - start, cpu = process.cpuUsage(cpuStart);
    assert.equal(result.rows.length, n); assert.equal(result.rows.reduce((sum, row) => sum + row.amount, 0), n * 10000 + n * (n - 1) / 2);
    const correctnessSha256 = createHash("sha256").update(JSON.stringify(result.rows.map(row => [row.household_id, row.user_id, row.transaction_date, row.type, row.amount, row.category, row.memo, row.payment_method, row.raw_text, row.source, row._import_spender, row._import_warnings, row._import_needs_confirmation]))).digest("hex");
    report.timings.push({ rows: n, sample, phase: sample ? "warm" : "cold-size-first", inputSha256: digest, correctnessSha256, accepted: result.rows.length, wallMs, cpuMs: (cpu.user + cpu.system) / 1000 });
  }
}
const aliasesMatch = source.toString().match(/const IMPORT_FIELD_ALIASES = Object.freeze\((\{[\s\S]*?\n\})\);/);
const aliases = vm.runInNewContext("(" + aliasesMatch[1] + ")");
const fixedAliases = new Set(Object.values(aliases).flat());
for (const rows of boundaryOnly ? [] : [1, 10, 120, 1000]) {
  const normalize = String.prototype.normalize, formatter = Intl.DateTimeFormat;
  let normalizations = 0, fixedAliasNormalizations = 0, formatters = 0;
  String.prototype.normalize = function(...args) { normalizations++; if (fixedAliases.has(String(this))) fixedAliasNormalizations++; return normalize.apply(this, args); };
  Intl.DateTimeFormat = new Proxy(formatter, { construct(target, args, ctor) { formatters++; return Reflect.construct(target, args, ctor); } });
  try { const result = parse(textFor(rows)); report.counts.push({ rows, accepted: result.rows.length, normalizations, fixedAliasNormalizations, formatters }); }
  finally { String.prototype.normalize = normalize; Intl.DateTimeFormat = formatter; }
}
if (process.argv.includes("--boundaries") || boundaryOnly) {
  const head = "날짜,금액,내용\n2026-07-01,5000,";
  const cases = [
    ["mapping-long-recognized-header", () => "date,amount," + "x".repeat(2 * 1024 * 1024) + "memo\n2026-07-01,5000,shop"],
    ["mapping-max-columns", () => ["날짜", "금액", ...Array(4094).fill("임의열")].join(",") + "\n" + ["2026-07-01", "5000", ...Array(4094).fill("x")].join(",")],
    ["mapping-many-sections", () => Array.from({length:2500},()=>"날짜,금액,내용\n2026-07-01,5000,가게").join("\n")],
    ["mapping-long-header", () => "날짜,금액," + "x".repeat(1024*1024) + "\n2026-07-01,5000,가게"],
    ["max-5MiB-single-cell", () => head + "x".repeat(5 * 1024 * 1024 - Buffer.byteLength(head))],
    ["max-5MiB-escaped-quote-cell", () => head + '"' + '""'.repeat(Math.floor((5 * 1024 * 1024 - Buffer.byteLength(head) - 2) / 2)) + '"'],
    ["max-5MiB-mixed-escaped-cell", () => head + '"' + 'x""'.repeat(Math.floor((5 * 1024 * 1024 - Buffer.byteLength(head) - 2) / 3)) + '"'],
    ["over-5MiB", () => head + "x".repeat(5 * 1024 * 1024 - Buffer.byteLength(head) + 1)],
    ["max-5000-logical-records", () => textFor(4999)],
    ["over-5000-records", () => textFor(5100)],
    ["max-10000-parser-records", () => textFor(9999)],
    ["max-columns", () => "a,".repeat(4095) + "last\n"],
    ["over-columns", () => "a,".repeat(4096) + "last\n"],
    ["max-separator-cells", () => ("x,".repeat(250) + "x\n").repeat(999)],
    ["cell-budget", () => ("x,".repeat(249) + "x\n").repeat(1005)],
    ["json-over-records", () => JSON.stringify(Array.from({ length: 11000 }, (_, i) => ({ date: "2026-07-01", amount: 10000 + i, memo: "synthetic" })))],
    ["json-wide", () => JSON.stringify([Object.fromEntries(Array.from({ length: 4097 }, (_, i) => ["field" + i, "x"]))])],
    ["unterminated-long-cell", () => head + '"' + "x".repeat(1024 * 1024) + "\n2026-07-02,6000,next"]
  ];
  for (const [name, makeInput] of cases) {
    if (!boundaryOnly) {
      const child = spawnSync(process.execPath, ["--expose-gc", fileURLToPath(import.meta.url), "--repo", root, "--boundary-case", name], { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
      if (child.status !== 0) throw Error("Boundary subprocess failed: " + name + " " + child.stderr);
      const measurement = JSON.parse(child.stdout); report.boundaries.push(...measurement.boundaries); continue;
    }
    if (name !== boundaryOnly) continue;
    const input = makeInput();
    console.error("boundary start: " + name);
    globalThis.gc?.();
    const before = process.memoryUsage(), beforePeakRss = process.resourceUsage().maxRSS / 1024, cpuStart = process.cpuUsage(), start = performance.now();
    const result = name === "max-10000-parser-records" ? worker.parseFlexibleImportRecords(input, "house-synthetic", "", { maxRows: 10000, importYear: 2026, mappingMetadata: true, mappingDelta: [] }) : parse(input);
    const wallMs = performance.now() - start, cpu = process.cpuUsage(cpuStart), after = process.memoryUsage();
    const item = { name, mappingColumns: result.mapping_schema?.total_columns || 0, mappingMetadataBytes: Buffer.byteLength(JSON.stringify(result.mapping_schema || {})), inputBytes: Buffer.byteLength(input), wallMs, cpuMs: (cpu.user + cpu.system) / 1000, heapDeltaMiB: (after.heapUsed - before.heapUsed) / 1048576, rssMiB: after.rss / 1048576, maxRssMiB: process.resourceUsage().maxRSS / 1024, totalRows: result.total_rows, accepted: result.rows.length, rejected: result.rejected.length, complete: result.analysis_complete, unprocessed: result.unprocessed_rows || 0, reasons: [...new Set(result.rejected.map(row => row.reason_code))] };
    item.baseMaxRssMiB = beforePeakRss; item.additionalPeakRssMiB = item.maxRssMiB - beforePeakRss; item.memoryMethod = "Isolated boundary process high-water RSS; heapDelta is end minus start, not peak heap";
    item.withinLocalBudget = item.wallMs < report.criteria.maxWallMs && item.cpuMs < report.criteria.maxCpuMs && item.heapDeltaMiB < report.criteria.maxHeapDeltaMiB && item.additionalPeakRssMiB < 96;
    report.boundaries.push(item);
    assert.ok(item.withinLocalBudget, "Existing local boundary budget exceeded: " + name);
    assert.ok(item.mappingMetadataBytes < 65536, "Mapping metadata must remain bounded: " + name);
    console.error("boundary done: " + name + " " + Math.round(wallMs) + "ms");
  }
}
if (process.argv.includes("--out")) { const out = resolve(option("--out")); mkdirSync(out, { recursive: true }); writeFileSync(join(out, "performance.json"), JSON.stringify(report, null, 2) + "\n"); }
console.log(JSON.stringify(report, null, 2));

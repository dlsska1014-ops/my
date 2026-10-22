// V22.9.76: 감사 발견 추적표(docs/codex/FINDINGS_LEDGER.md) 검사.
// 2026-10-14 감사 105건 중 72건이 2026-10-21 에도 그대로 재현됐다. 감사 번호를 달고 고친 것은 5건뿐이었고
// 나머지는 문서에만 남아 잊혔다. 이 검사는 감사 문서의 모든 항목이 추적표에 한 번씩 있고, 상태와 다음 행동이
// 적혀 있으며, 이번 판 이후 '고침'으로 적은 코드 수정에는 하네스에 등록된 동작 검사가 있는지 확인한다.
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
let checks = 0;
const failures = [];
const ok = (condition, message) => { checks += 1; if (!condition) failures.push(message); };

// 출처 문서마다 항목 ID 를 뽑는 규칙. 새 감사 문서를 쓰면 여기에 한 줄을 더한다.
const SOURCES = [
  { key: "V44", path: "docs/codex/AUDIT_FINDINGS_V22_9_44.md", pattern: /^(###|[ ]*-) +(?:[*][*])?([A-G]-[0-9]+)(?=[ *]|$)/gm, expected: 105 },
  { key: "V76", path: "docs/codex/PRELAUNCH_AUDIT_V22_9_76.md", pattern: /^(###|[ ]*-) +(?:[*][*])?([RKWMO]-[0-9]+)(?=[ *]|$)/gm, expected: null },
  // V22.9.77: 고치는 중에 새로 찾은 항목도 문서에 적고 추적표로 옮긴다.
  { key: "V77", path: "docs/codex/FOLLOWUP_FINDINGS_V22_9_77.md", pattern: /^(###|[ ]*-) +(?:[*][*])?(N-[0-9]+)(?=[ *]|$)/gm, expected: null },
];
// '결함 아님'은 다시 확인해 보니 규격·의도대로인 항목이다. 메모에 근거(규격 문서 줄 등)를 적는다.
const STATUSES = new Set(["고침", "일부 고침", "남음", "결정 필요", "확인 불가", "결함 아님"]);
const FIXED = new Set(["고침", "일부 고침"]);
const SEVERITIES = new Set(["P0", "P1", "P2", "P3"]);

const ledger = read("docs/codex/FINDINGS_LEDGER.md");
const harness = read(".codex/scripts/verify-repository.mjs");
const rows = [];
for (const line of ledger.split("\n")) {
  const match = /^[|] *((V44|V76|V77):[A-Z]-[0-9]+) *[|]/.exec(line);
  if (!match) continue;
  const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
  const [id, severity, title, status, fixedIn, check, note] = cells;
  rows.push({ id, source: match[2], severity, title, status, fixedIn, check, note, cells });
}

const seen = new Map();
for (const row of rows) seen.set(row.id, (seen.get(row.id) || 0) + 1);
for (const [id, count] of seen) ok(count === 1, `${id} 이(가) 추적표에 ${count}번 있다`);

for (const source of SOURCES) {
  ok(existsSync(new URL(source.path, root)), `출처 문서가 있다: ${source.path}`);
  if (!existsSync(new URL(source.path, root))) continue;
  const ids = new Set([...read(source.path).matchAll(source.pattern)].map((m) => `${source.key}:${m[2]}`));
  if (source.expected !== null) ok(ids.size === source.expected, `${source.path} 에서 항목 ${source.expected}건을 읽는다 (${ids.size}건)`);
  ok(ids.size > 0, `${source.path} 에서 항목을 읽는다`);
  for (const id of ids) ok(seen.has(id), `${id} 이(가) 추적표에 없다 — 감사 항목은 고칠 때까지 추적표에 둔다`);
  for (const row of rows.filter((r) => r.source === source.key)) ok(ids.has(row.id), `추적표의 ${row.id} 이(가) ${source.path} 에 없다`);
}

const versionOf = (text) => { const m = /V22[.]9[.]([0-9]+)/.exec(String(text || "")); return m ? Number(m[1]) : null; };
for (const row of rows) {
  ok(row.cells.length === 7, `${row.id}: 칸이 7개다 (${row.cells.length}개)`);
  ok(SEVERITIES.has(row.severity), `${row.id}: 등급이 P0~P3 중 하나다 (${row.severity})`);
  ok(STATUSES.has(row.status), `${row.id}: 상태가 고침·일부 고침·남음·결정 필요·확인 불가·결함 아님 중 하나다 (${row.status})`);
  ok(String(row.title || "").length >= 4, `${row.id}: 제목이 있다`);
  if (row.status !== "고침") ok(String(row.note || "").replace(/[—-]/g, "").trim().length >= 4, `${row.id}: '${row.status}' 항목은 메모에 이유나 다음 행동을 적는다`);
  // 이번 판부터 고친 코드 결함은 하네스에 등록된 동작 검사로 다시 못 돌아오게 묶는다. 문서만 고친 항목은 메모에 '문서'라고 적는다.
  const fixedVersion = versionOf(row.fixedIn);
  if (FIXED.has(row.status) && fixedVersion !== null && fixedVersion >= 76 && !String(row.note || "").includes("문서")) {
    const scripts = String(row.check || "").split(/[ ,]+/).filter((s) => s.startsWith("validation/"));
    ok(scripts.length > 0, `${row.id}: V22.9.${fixedVersion} 에서 고친 코드 결함은 검사 칸에 validation/*.mjs 를 적는다`);
    for (const script of scripts) {
      ok(existsSync(new URL(script, root)), `${row.id}: 검사 파일이 있다 (${script})`);
      ok(harness.includes(`"${script}"`), `${row.id}: 검사가 하네스에 등록돼 있다 (${script})`);
    }
  }
}

const count = (filter) => rows.filter(filter).length;
const openSevere = rows.filter((r) => r.status !== "고침" && r.status !== "결함 아님" && (r.severity === "P0" || r.severity === "P1"));
console.log(`추적표 ${rows.length}건: 고침 ${count((r) => r.status === "고침")}, 일부 고침 ${count((r) => r.status === "일부 고침")}, 남음 ${count((r) => r.status === "남음")}, 결정 필요 ${count((r) => r.status === "결정 필요")}, 확인 불가 ${count((r) => r.status === "확인 불가")}, 결함 아님 ${count((r) => r.status === "결함 아님")}`);
if (openSevere.length) console.log(`열린 P0·P1: ${openSevere.map((r) => r.id).join(", ")}`);
if (failures.length) {
  console.error(`FAIL: V22.9.76 findings ledger (${failures.length} of ${checks} checks)`);
  for (const failure of failures.slice(0, 40)) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS: V22.9.76 findings ledger (${checks} checks)`);

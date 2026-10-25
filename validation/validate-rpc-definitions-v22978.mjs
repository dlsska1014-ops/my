// V22.9.78 운영 함수 정의 사본과 코드 호출 대조 검사 (V22.9.44 감사 G-13, 운영자 결정 2026-10-23).
// G-13: 코드가 부르는 RPC 3개(accountbook_mutate_payment_assets_v2280·record_nlu_metric·record_nlu_failure_sample)의
//       정의가 저장소에 없었다. 2026-10-23 운영 DB 에서 읽기만 해서 받은 정의를 migrations/ 에 두었다(실행 금지).
//       이 검사는 사본이 그대로 있는지, 그리고 코드가 보내는 인자 이름이 운영 함수의 인자와 맞는지 본다.
import { readFileSync } from "node:fs";
import { counter } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.78 운영 함수 정의 사본·코드 호출 대조 검사 통과");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sql = read("migrations/RPC_DEFINITIONS_PROD_2026_10_23.sql");

ok(sql.includes("실행 금지(DO NOT RUN)") && sql.includes("Not executed as DDL"), "사본 머리말이 실행 금지·읽기 전용 사본임을 밝힌다");
ok(read("migrations/README.md").includes("RPC_DEFINITIONS_PROD_2026_10_23.sql"), "migrations/README 가 사본 위치를 적는다");

// 운영 함수의 인자: 이름과 기본값 유무.
const signatures = new Map();
for (const match of sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(([^)]*)\)/g)) {
  const params = match[2].split(/,\s*(?=p_)/).map((part) => ({ name: part.trim().split(/\s+/)[0], hasDefault: /\bDEFAULT\b/.test(part) }));
  signatures.set(match[1], params);
}
eq([...signatures.keys()].sort().join(","), "accountbook_mutate_payment_assets_v2280,record_nlu_failure_sample,record_nlu_metric", "사본에 함수 3개 정의가 모두 있다");

// 코드가 /rpc/<이름> 으로 보내는 몸통의 p_ 인자 이름.
const callers = {
  accountbook_mutate_payment_assets_v2280: "src/modules/settings/payment-assets.js",
  record_nlu_metric: "src/modules/runtime/ops-telemetry.js",
  record_nlu_failure_sample: "src/modules/runtime/ops-telemetry.js",
};
for (const [name, file] of Object.entries(callers)) {
  const source = read(file);
  const at = source.indexOf(`rpc/${name}"`);
  ok(at >= 0, `${file} 가 ${name} 을 부른다`);
  // JSON.stringify({ … }) 의 바깥 중괄호까지만 본다(안쪽 객체·다음 호출의 인자가 섞이지 않게).
  const open = source.indexOf("{", source.indexOf("JSON.stringify(", at));
  let depth = 0, end = open;
  for (; end < source.length; end += 1) {
    if (source[end] === "{") depth += 1;
    else if (source[end] === "}" && --depth === 0) break;
  }
  const body = source.slice(open, end + 1);
  const sent = [...new Set([...body.matchAll(/\b(p_[a-z_]+)\s*:/g)].map((m) => m[1]))].sort();
  const params = signatures.get(name) || [];
  ok(sent.length > 0 && params.length > 0, `${name}: 코드 호출 인자(${sent.length}개)와 운영 인자(${params.length}개)를 읽었다`);
  const known = new Set(params.map((p) => p.name));
  const required = params.filter((p) => !p.hasDefault).map((p) => p.name);
  eq(sent.filter((key) => !known.has(key)).join(","), "", `${name}: 코드가 보내는 인자(${sent.join("·")})는 모두 운영 함수에 있다`);
  eq(required.filter((key) => !sent.includes(key)).join(","), "", `${name}: 기본값 없는 운영 인자(${required.join("·")})를 코드가 모두 보낸다`);
}

done();

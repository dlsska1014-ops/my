import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const purgeSql = readFileSync(new URL("../02_APPLY_HOUSEHOLD_PURGE_V22_8_71.sql", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.92-SCREEN-CLEANUP"'), "runtime exposes the merged release");

const ORIGIN = "https://ttokttok-accountbook.com";
const USER = "kakao_login:2265";

function skillRequest(headers = {}) {
  return new Request(`${ORIGIN}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      userRequest: { utterance: "안녕", user: { id: USER, properties: {} } },
      action: { params: {}, detailParams: {} },
      bot: { id: "bot" },
      intent: { id: "intent", name: "폴백블록" },
    }),
  });
}

const fixture = await createV2265QaFixture();
try {
  // ── /skill 호출자 인증은 켠 사람만 쓴다 ──────────────────────────
  // 비밀값을 넣지 않은 기존 배포가 이 변경으로 갑자기 막히면, 카카오 채널이
  // 통째로 죽는다. 기본값은 반드시 "그대로 열림"이어야 한다.
  delete fixture.env.KAKAO_SKILL_SECRET;
  delete fixture.env.KAKAO_SKILL_AUTH_REQUIRED;
  eq((await app.fetch(skillRequest(), fixture.env, {})).status, 200, "비밀값이 없으면 기존처럼 열려 있다");

  fixture.env.KAKAO_SKILL_SECRET = "s3cr3t-value-for-test";
  eq((await app.fetch(skillRequest(), fixture.env, {})).status, 403, "비밀값을 켜면 헤더 없는 호출을 막는다");
  eq((await app.fetch(skillRequest({ "x-api-key": "wrong" }), fixture.env, {})).status, 403, "틀린 값은 막는다");
  eq((await app.fetch(skillRequest({ "x-api-key": "s3cr3t-value-for-test" }), fixture.env, {})).status, 200, "OpenBuilder 의 x-api-key 헤더를 받는다");
  eq((await app.fetch(skillRequest({ "x-kakao-skill-secret": "s3cr3t-value-for-test" }), fixture.env, {})).status, 200, "전용 헤더도 받는다");
  eq((await app.fetch(skillRequest({ authorization: "Bearer s3cr3t-value-for-test" }), fixture.env, {})).status, 200, "Bearer 방식도 받는다");
  // 차단 응답이 비밀값을 되비추면 안 된다.
  const blocked = await (await app.fetch(skillRequest(), fixture.env, {})).text();
  ok(!blocked.includes("s3cr3t-value-for-test"), "차단 응답에 비밀값이 새지 않는다");

  ok(source.includes("constantTimeTextEqual(headerSecret, expected)"), "비밀값 비교는 상수 시간이다");

  // /health 는 설정 여부만 알리고 값은 알리지 않는다.
  const health = await (await app.fetch(new Request(`${ORIGIN}/health`), fixture.env, {})).json();
  eq(health.skill_caller_auth_configured, true, "/health 가 인증 설정 여부를 알린다");
  ok(!JSON.stringify(health).includes("s3cr3t-value-for-test"), "/health 가 비밀값 자체를 노출하지 않는다");
  delete fixture.env.KAKAO_SKILL_SECRET;
  const healthOff = await (await app.fetch(new Request(`${ORIGIN}/health`), fixture.env, {})).json();
  eq(healthOff.skill_caller_auth_configured, false, "비밀값이 없으면 설정 안 됨으로 알린다");

  // 켜기로 해 놓고 값을 빼먹은 배포는 준비되지 않은 것으로 본다.
  ok(source.includes('if (String(env.KAKAO_SKILL_AUTH_REQUIRED || "0") === "1" && !String(env.KAKAO_SKILL_SECRET || "").trim())'), "인증 필수 설정에 비밀값이 없으면 구성 미비로 잡는다");

  // ── 준비 점검: 필수와 선택을 나눈다 ──────────────────────────────
  // accountbook_categories 는 설정 저장소 대체 경로가 있어 없어도 동작한다.
  // 이것 때문에 멀쩡한 배포가 준비 실패로 뜨면 배포자가 없는 문제를 좇는다.
  ok(source.includes("const READINESS_REQUIRED_TABLES = ["), "필수 테이블 목록이 따로 있다");
  ok(source.includes("const READINESS_OPTIONAL_TABLES = ["), "선택 테이블 목록이 따로 있다");
  const requiredBlock = source.slice(source.indexOf("const READINESS_REQUIRED_TABLES = ["), source.indexOf("const READINESS_OPTIONAL_TABLES = ["));
  ok(!requiredBlock.includes("accountbook_categories"), "대체 경로가 있는 표는 필수에서 뺀다");
  const optionalBlock = source.slice(source.indexOf("const READINESS_OPTIONAL_TABLES = ["));
  ok(optionalBlock.slice(0, 260).includes("accountbook_categories"), "대체 경로가 있는 표는 선택으로 둔다");
  for (const table of ["households", "household_members", "transactions", "accountbook_settings", "accountbook_operation_locks"]) {
    ok(requiredBlock.includes(`"${table}"`), `${table} 은 필수로 남는다`);
  }
  // QA 픽스처는 운영 필수 설정 일부가 비어 있어 /ready 가 구성 점검에서 먼저 멈춘다.
  // 표 개수를 재려면 그 두 값을 채워 실제 점검 경로까지 보내야 한다.
  const restoreConfig = { admin: fixture.env.ADMIN_SESSION_SECRET, token: fixture.env.ADMIN_API_TOKEN };
  fixture.env.ADMIN_SESSION_SECRET = "qa-admin-session-secret";
  fixture.env.ADMIN_API_TOKEN = "qa-admin-api-token";
  const ready = await (await app.fetch(new Request(`${ORIGIN}/ready`), fixture.env, {})).json();
  eq(ready.checked_required_tables, 10, `/ready 가 필수 표 10개를 확인한다 (${JSON.stringify(ready).slice(0, 90)})`);
  eq(ready.checked_optional_tables, 1, "/ready 가 선택 표 1개를 확인한다");
  eq(ready.checked_tables, 11, "/ready 가 표 11개를 보고한다");
  fixture.env.ADMIN_SESSION_SECRET = restoreConfig.admin;
  fixture.env.ADMIN_API_TOKEN = restoreConfig.token;

  // ── 가계부 생성 잠금은 인스턴스 밖에서도 유효해야 한다 ─────────────
  // 프로세스 메모리 잠금은 Worker 인스턴스가 여러 개면 같은 이름의 가계부를
  // 동시에 만들 수 있다. Supabase 임대로 바꿔 인스턴스를 넘어 걸리게 한다.
  ok(source.includes("await claimOperationLease(env, {"), "가계부 생성이 DB 임대를 잡는다");
  ok(source.includes("if (!lease.acquired) throw new Error(\"household_create_busy\");"), "임대를 못 잡으면 생성하지 않는다");
  ok(source.includes("await releaseOperationLease(env, lease);"), "끝나면 임대를 반납한다");
  ok(!source.includes("AB_HOUSEHOLD_CREATE_LOCKS"), "프로세스 메모리 잠금은 남지 않는다");

  // ── 저장 식별자는 추측 가능하면 안 된다 ────────────────────────────
  ok(source.includes("function randomEntityId("), "저장 식별자를 난수로 만든다");
  ok(source.includes("crypto.getRandomValues"), "식별자 난수는 암호학적 난수원을 쓴다");
  ok(!/id: `settings_\$\{Date\.now\(\)/.test(source), "시간 기반 식별자가 남지 않는다");
} finally {
  fixture.restore();
}

// ── 가계부 삭제 SQL 이 남기는 것이 없어야 한다 ──────────────────────
// 지운 가계부의 설정이 남으면 같은 이름으로 다시 만들었을 때 남의 설정이 붙는다.
ok(purgeSql.includes("set search_path = ''"), "SECURITY DEFINER 함수의 search_path 를 비운다");
for (const line of purgeSql.split("\n")) {
  if (!/\b(from|join|update|delete from|into)\s+(?!public\.)[a-z_]+\b/i.test(line)) continue;
  ok(/pg_proc|pg_namespace|public\./.test(line), `search_path 를 비웠으므로 표 이름을 정규화한다: ${line.trim().slice(0, 60)}`);
}
for (const key of ["report_challenge:", "goals:v5:", "favorites:v5:"]) {
  ok(purgeSql.includes(`'${key}'`) || purgeSql.includes(`'${key}' || p_household_id::text`), `삭제 시 ${key} 설정도 지운다`);
}
// SQL 이 지우려는 키 형식이 앱이 실제로 쓰는 형식과 같아야 한다. 다르면 조용히 남는다.
ok(source.includes('`report_challenge:${String(householdId || "").trim()}`'), "report_challenge 키 형식이 SQL 과 같다");
ok(source.includes('`goals:v5:${String(householdId || "default").trim() || "default"}`'), "goals 키 형식이 SQL 과 같다");
ok(source.includes('`favorites:v5:${String(householdId || "default").trim() || "default"}:${String(userKey || "shared").trim() || "shared"}`'), "favorites 키가 사용자별 접미사를 가져 접두 일치로 지운다");
ok(purgeSql.includes("or left(key, char_length('favorites:v5:' || p_household_id::text || ':'))"), "favorites 는 접두 일치로 지운다");
// 파괴적 SQL 이 섞이지 않았는지 직접 확인한다.
ok(!/drop\s+(table|schema|database)/i.test(purgeSql), "표·스키마를 지우는 문장이 없다");
ok(!/truncate/i.test(purgeSql), "truncate 가 없다");
ok(purgeSql.includes("revoke all on function public.accountbook_purge_household_v227(uuid) from public, anon, authenticated;"), "일반 역할의 실행 권한을 회수한다");
ok(purgeSql.includes("grant execute on function public.accountbook_purge_household_v227(uuid) to service_role;"), "service_role 에만 실행 권한을 준다");
ok(purgeSql.includes("purge_rpc_count"), "적용 후 확인용 조회가 들어 있다");
// 이 RPC 는 이미 /ready 필수 목록에 있다. 새로 만드는 것이 아니라 내용만 고친다.
ok(source.includes('"accountbook_purge_household_v227"'), "삭제 RPC 는 이미 준비 점검 대상이다");

console.log(`PASS: V22.8.73 skill auth, readiness split, and purge completeness (${checks} checks)`);

#!/usr/bin/env node
// V22.9.95 데이터·운영 검사 — 전체 점검 R-12(거래 변경 감사 표 보존 정리), 관리자 ‘최근 예약 실행’ 표 열, CI 설정(R-11 중 저장소 안 부분).
//   R-12 accountbook_transaction_audit 는 지운 행 전체(메모·원문·카카오 키)를 기한 없이 쌓았다. 이제 매일 예약 실행의 정리 단계가
//        AUDIT_RETENTION_DAYS(기본 180일, 30~3650 정수, 잘못된 값은 기본)보다 오래된 행만 오래된 것부터 500행씩 두 묶음까지 지운다
//        (읽은 번호 id=in. 에 기준 시각 created_at=lt. 도 건다). 결과는 실행 기록 cleanup 의 audit_deleted·audit_batches·audit_more 이고,
//        실패는 던지지 않고 정리 오류(cleanup.error → 실행 partial)·운영 이벤트 warn 이다. 몫 4회는 예약 실행이 처음부터 떼어 둔다.
//   표   /ops-dashboard ‘최근 예약 실행’에 판·남은 범위 열, 기록 정리 칸에 ‘감사 n건’.
//   CI   .github/workflows/verify.yml 의 푸시 실행은 main 만, main 실행은 취소하지 않는다.
// 실제 번들(src/index.js)의 app.scheduled·app.fetch 와 QA 픽스처(validation/qa-fixture.mjs)로 본다. DB·네트워크 없음. 장면 시계는 고정한다.
// 사용: node validation/validate-v22995-data.mjs
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { app, ctx, fixture, intercept, putSetting, settingValue } from "./lib-audit-v22934.mjs";
import { auditRetentionDaysV22995, cleanupTransactionAuditRetentionV22995, mergeScheduledCleanupV22995 } from "../src/modules/cron/recurring-auto-apply.js";
import { opsCronStatusV22994 } from "../src/modules/admin/settings-audit-pages.js";

let checks = 0;
const failures = [];
const show = (value) => { try { return String(JSON.stringify(value)).slice(0, 260); } catch (_) { return String(value).slice(0, 260); } };
function ok(cond, msg) { checks += 1; if (!cond) failures.push(msg); }
function eq(actual, expected, msg) { checks += 1; if (!isDeepStrictEqual(actual, expected)) failures.push(`${msg} — 실제 ${show(actual)} · 기대 ${show(expected)}`); }
async function section(name, task) {
  try { await task(); } catch (error) {
    checks += 1;
    failures.push(`${name}: 구간이 끝까지 돌지 못했다 — ${String(error?.stack || error).split("\n").slice(0, 3).join(" ").slice(0, 320)}`);
  }
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ── 공통 준비 ────────────────────────────────────────────────────────────────
const DAY = 86400000;
const N = 180;
const KST = (ymd, hm = "09:10") => Date.parse(`${ymd}T${hm}:00+09:00`);
const LOG_KEY = "cron_run_log_v22978";
const STATE_KEY = "cron_recurring_state_v22976";
const AUDIT_PATH = "/rest/v1/accountbook_transaction_audit";
const SECRETS = ["hh-audit-secret", "감사비밀메모", "카카오원문비밀", "kakao-plain-key-secret", "tx-old-"];
const readJson = (value) => (value == null || value === "" ? null : typeof value === "string" ? JSON.parse(value) : value);
const logOf = (fx) => readJson(settingValue(fx, LOG_KEY)) || [];
const opsEvents = () => globalThis.__AB_OPS_EVENTS || (globalThis.__AB_OPS_EVENTS = []);
const cutoffOf = (nowMs, days = N) => new Date(nowMs - days * DAY).toISOString();
const pg = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// 감사 행 하나(운영 지우기 함수가 남기는 모양: before_value = 지운 행 전체). created_at 은 nowMs 에서 ageMs 만큼 앞이다.
function auditRow(id, nowMs, ageMs, tag = "old") {
  return {
    id, transaction_id: `tx-${tag}-${id}`, household_id: "hh-audit-secret", actor_user_id: "user-bin", actor_kind: "user", action: "delete",
    before_value: { id: `tx-${tag}-${id}`, household_id: "hh-audit-secret", memo: "감사비밀메모", raw_text: "카카오원문비밀", source_user_key: "kakao-plain-key-secret", amount: 12345 },
    after_value: null, created_at: new Date(nowMs - ageMs).toISOString(), tag,
  };
}
// 정해진 순서로 섞는다(번호 순서와 시각 순서를 어긋나게 해 created_at 순서로 고르는지 본다).
function shuffled(list, seed = 7) {
  const out = list.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i -= 1) { s = (s * 1103515245 + 12345) % 2147483648; const j = s % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
function seedAudit(fx, nowMs, specs) {
  fx.db.accountbook_transaction_audit = shuffled(specs).map((spec, index) => auditRow(index + 1, nowMs, spec.age, spec.tag));
  return fx.db.accountbook_transaction_audit;
}
const auditRows = (fx) => fx.db.accountbook_transaction_audit || [];
const tagsLeft = (fx) => [...new Set(auditRows(fx).map((row) => row.tag))].sort();

// 조용한 날(정기 규칙 없음, 리포트 범위 없는 평일)을 만든다.
function quiet(fx, ymd) {
  fx.db.accountbook_recurring.length = 0;
  putSetting(fx, STATE_KEY, JSON.stringify({ checked_date: ymd, pending_month: "" }));
}

// 예약 실행 한 번(정기 반영 + 자동 리포트 + 정리 + 실행 기록)을 nowMs 에 돌린다. 저장소 호출 수와 감사 표 요청을 센다.
async function runCron(fx, nowMs, { handler = null } = {}) {
  globalThis.__AB_QA_FIXED_NOW_MS = nowMs;
  opsEvents().length = 0;
  const seen = { calls: 0, audit: [] };
  const restore = intercept(async (request) => {
    if (request.url.hostname !== "mock.supabase.co") return null;
    seen.calls += 1;
    if (request.url.pathname === AUDIT_PATH) seen.audit.push({ method: request.method, url: request.url, prefer: new Headers(request.init?.headers || {}).get("prefer") || "" });
    return handler ? (await handler(request)) || null : null;
  });
  let error = null;
  try {
    const pending = [];
    await app.scheduled({ cron: "10 0 * * *", scheduledTime: nowMs }, fx.env, { waitUntil(p) { pending.push(p); } });
    for (const p of pending) { try { await p; } catch (err) { error = error || err; } }
  } finally { restore(); }
  return { ...seen, error, events: opsEvents().slice(), log: logOf(fx)[0] || null };
}
const reads = (run) => run.audit.filter((item) => item.method === "GET");
const deletes = (run) => run.audit.filter((item) => item.method === "DELETE");
const idsOf = (item) => (/^in\.\((.*)\)$/.exec(item.url.searchParams.get("id") || "")?.[1] || "").split(",").filter(Boolean).map(Number);
const warns = (run) => run.events.filter((event) => event.severity === "warn");

// ── 1. 보존 일수(AUDIT_RETENTION_DAYS) ─────────────────────────────────────────
await section("1 보존 일수", async () => {
  const days = (value) => auditRetentionDaysV22995({ AUDIT_RETENTION_DAYS: value });
  eq([undefined, "", "  "].map(days), [{ days: 180, invalid: false }, { days: 180, invalid: false }, { days: 180, invalid: false }], "1-a 값이 없거나 비면 기본 180일이다(잘못된 값으로 치지 않는다)");
  eq(["30", "3650", " 90 ", 400, "0365"].map((value) => days(value).days), [30, 3650, 90, 400, 365], "1-b 30~3650 정수는 그대로 쓴다(앞뒤 빈칸·숫자 값 포함)");
  ok(["29", "3651", "0", "-40", "12.5", "1e3", "abc", "180일", "+200"].every((value) => isDeepStrictEqual(days(value), { days: 180, invalid: true })), "1-c 범위 밖·소수·지수·글자·부호는 기본 180일이고 잘못된 값으로 알린다");
  eq(await cleanupTransactionAuditRetentionV22995({}), { skipped: true }, "1-d 저장소 설정이 없으면 건너뛴다(NLU 정리와 같다)");
  eq([mergeScheduledCleanupV22995({ skipped: true }, { skipped: true }), mergeScheduledCleanupV22995({ ok: true, cutoff: "x" }, { ok: true, audit_deleted: 3, audit_batches: 1, audit_more: false })],
    [{ skipped: true }, { ok: true, audit_deleted: 3, audit_batches: 1, audit_more: false }], "1-e 정리 단계 결과 합치기(둘 다 건너뜀 → 건너뜀, 둘 다 정상 → 감사 칸 셋)");
});

// ── 2. 경계와 묶음: 1,200행(N+2일 이상 1,148 · 기준 1초 앞 · N+1일 · 정확히 N일 · 기준 1초 뒤 · N-1일 · 최근 47) ──────────
await section("2 경계·묶음", async () => {
  await fixture(async (fx) => {
    const RUN1 = KST("2026-11-04"); // 수요일 09:10 — 리포트 범위가 없는 날
    quiet(fx, "2026-11-03");
    const specs = [];
    for (let i = 0; i < 1148; i += 1) specs.push({ tag: "old", age: (N + 2) * DAY + i * 3600000 });
    specs.push({ tag: "edge-gone-1s", age: N * DAY + 1000 }, { tag: "edge-gone-n1", age: (N + 1) * DAY });
    specs.push({ tag: "edge-keep-n", age: N * DAY }, { tag: "edge-keep-1s", age: N * DAY - 1000 }, { tag: "edge-keep-n-1", age: (N - 1) * DAY });
    for (let i = 0; i < 47; i += 1) specs.push({ tag: "recent", age: i * 3 * DAY + 60000 });
    const seeded = seedAudit(fx, RUN1, specs);
    eq(seeded.length, 1200, "2-0 감사 행 1,200개를 넣었다");
    const oldest = seeded.slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).slice(0, 1000).map((row) => row.id).sort((a, b) => a - b);

    const r1 = await runCron(fx, RUN1);
    const cutoff1 = cutoffOf(RUN1);
    eq([reads(r1).length, deletes(r1).length], [2, 2], "2-a 첫 실행은 읽기 2번·지우기 2번(두 묶음)이다");
    ok(reads(r1).every((item) => item.url.searchParams.get("select") === "id" && item.url.searchParams.get("order") === "created_at.asc" && item.url.searchParams.get("limit") === "500" && item.url.searchParams.get("created_at") === `lt.${cutoff1}`),
      `2-b 읽기는 select=id·order=created_at.asc·limit=500·created_at=lt.<지금-180일> 이다 (${reads(r1).map((item) => item.url.search.slice(0, 120)).join(" | ")})`);
    ok(deletes(r1).every((item) => idsOf(item).length > 0 && idsOf(item).length <= 500 && item.url.searchParams.get("created_at") === `lt.${cutoff1}` && /return=representation/.test(item.prefer)),
      "2-c 지우기는 묶음마다 id=in.(…) 500개 이하이고 같은 기준 시각(created_at=lt.)을 함께 건다");
    eq(deletes(r1).flatMap(idsOf).sort((a, b) => a - b), oldest, "2-d 첫 실행이 지운 1,000개는 가장 오래된 1,000개다(번호 순서가 아니라 created_at 순서)");
    eq(r1.log?.cleanup, { ok: true, audit_deleted: 1000, audit_batches: 2, audit_more: true }, "2-e 실행 기록 cleanup 에 지운 수·묶음 수·더 남음이 남는다");
    ok(r1.log?.status === "ok" && !r1.log?.errors?.length && !r1.error, `2-f 지울 행이 더 남은 것은 오류도 일부 처리도 아니다 (${r1.log?.status}·${show(r1.log?.errors)})`);
    ok(r1.calls <= 50, `2-g 첫 실행 저장소 호출 ${r1.calls}회 ≤ 50`);

    const r2 = await runCron(fx, RUN1); // 같은 시각에 다시 돈 실행: 기준이 같다
    eq([reads(r2).length, deletes(r2).length, r2.log?.cleanup], [1, 1, { ok: true, audit_deleted: 150, audit_batches: 1, audit_more: false }], "2-h 다음 실행이 남은 150개를 한 묶음으로 지우고 더 남지 않았다고 적는다");
    eq(tagsLeft(fx), ["edge-keep-1s", "edge-keep-n", "edge-keep-n-1", "recent"], "2-i 기준보다 오래된 행(N+1일·기준 1초 앞)만 지워지고 정확히 N일·1초 뒤·N-1일·최근 행은 남는다");
    eq(auditRows(fx).length, 50, "2-j 남은 행은 50개다");
    ok(auditRows(fx).every((row) => row.before_value?.memo === "감사비밀메모" && row.action === "delete"), "2-k 남은 행의 내용은 그대로다(이 판은 before_value 를 바꾸지 않는다)");

    const r3 = await runCron(fx, RUN1 + DAY); // 다음 날: 기준도 하루 뒤로
    eq([r3.log?.cleanup, tagsLeft(fx)], [{ ok: true, audit_deleted: 2, audit_batches: 1, audit_more: false }, ["edge-keep-n-1", "recent"]], "2-l 다음 날 실행은 하루 더 지난 두 행(어제 정확히 N일·1초 뒤)만 지운다");
    const r4 = await runCron(fx, RUN1 + DAY);
    eq([reads(r4).length, deletes(r4).length, r4.log?.cleanup], [1, 0, { ok: true, audit_deleted: 0, audit_batches: 0, audit_more: false }], "2-m 지울 행이 없으면 읽기 1번만 하고 지우지 않는다");
    const raw = String(settingValue(fx, LOG_KEY) || "");
    ok(SECRETS.every((secret) => !raw.includes(secret)), "2-n 실행 기록에 가계부 id·메모·원문·카카오 키·기록 id 가 없다(건수만)");
  });
});

// ── 3. 보존 일수 설정이 실행에 쓰인다 ─────────────────────────────────────────
await section("3 보존 일수 설정", async () => {
  const RUN = KST("2026-11-04");
  const specs = [{ tag: "d200", age: 200 * DAY }, { tag: "d31", age: 31 * DAY }, { tag: "d30-1s", age: 30 * DAY + 1000 }, { tag: "d30", age: 30 * DAY }, { tag: "d29", age: 29 * DAY }];
  await fixture(async (fx) => {
    quiet(fx, "2026-11-03");
    fx.env.AUDIT_RETENTION_DAYS = "30";
    seedAudit(fx, RUN, specs);
    const run = await runCron(fx, RUN);
    eq([reads(run)[0]?.url.searchParams.get("created_at"), tagsLeft(fx), run.log?.cleanup?.audit_deleted], [`lt.${cutoffOf(RUN, 30)}`, ["d29", "d30"], 3], "3-a AUDIT_RETENTION_DAYS=30 이면 30일보다 오래된 행만 지운다");
    ok(!run.events.some((event) => event.kind === "audit_retention_days_invalid"), "3-b 맞는 값이면 잘못된 값 알림이 없다");
  });
  await fixture(async (fx) => {
    quiet(fx, "2026-11-03");
    fx.env.AUDIT_RETENTION_DAYS = "abc";
    seedAudit(fx, RUN, specs);
    const run = await runCron(fx, RUN);
    eq([reads(run)[0]?.url.searchParams.get("created_at"), tagsLeft(fx)], [`lt.${cutoffOf(RUN, 180)}`, ["d29", "d30", "d30-1s", "d31"]], "3-c 잘못된 값(abc)이면 기본 180일로 정리한다(200일 행만)");
    const notes = run.events.filter((event) => event.kind === "audit_retention_days_invalid");
    ok(notes.length === 1 && notes[0].severity === "warn" && notes[0].path === "/cron/audit-retention" && notes[0].method === "SCHEDULED", `3-d 잘못된 값은 운영 이벤트(warn) 한 번으로 알린다 (${show(notes)})`);
    eq(run.log?.status, "ok", "3-e 잘못된 보존 일수는 실행 결과를 바꾸지 않는다(기본으로 정리)");
    fx.env.ADMIN_API_TOKEN = "qa-admin-token-v22995";
    const response = await app.fetch(new Request("https://malhaebook.com/ops-dashboard", { headers: { authorization: `Bearer ${fx.env.ADMIN_API_TOKEN}`, accept: "text/html" } }), fx.env, ctx);
    const html = await response.text();
    ok(response.status === 200 && html.includes("보존 기간(180일, AUDIT_RETENTION_DAYS 값이 잘못돼 기본값)"), "3-f 관리 화면이 쓰인 보존 기간과 잘못된 설정을 알린다");
  });
});

// ── 4. 실패: 던지지 않고 정리 오류(partial)·운영 이벤트 warn 하나 ─────────────────────────────
await section("4 지우기 실패", async () => {
  const RUN = KST("2026-11-04");
  const old = (count) => Array.from({ length: count }, () => ({ tag: "old", age: 200 * DAY }));
  await fixture(async (fx) => {
    quiet(fx, "2026-11-03");
    seedAudit(fx, RUN, old(600));
    const failDelete = ({ url, method }) => (url.pathname === AUDIT_PATH && method === "DELETE" ? pg(500, { code: "XX000", message: "simulated audit delete failure" }) : null);
    const run = await runCron(fx, RUN, { handler: failDelete });
    ok(!run.error, `4-a 감사 정리 실패로 예약 실행이 던지지 않는다 (${run.error?.message || "없음"})`);
    eq([deletes(run).length, auditRows(fx).length], [1, 600], "4-b 실패한 지우기는 다시 보내지 않고 행은 그대로다");
    eq(run.log?.cleanup, { error: "audit_cleanup_failed", audit_deleted: 0, audit_batches: 0, audit_more: true }, "4-c 실행 기록 cleanup 은 audit_cleanup_failed 이고 감사 칸을 남긴다");
    ok(run.log?.status === "partial" && run.log?.errors?.includes("cleanup:audit_cleanup_failed"), `4-d 실행은 기존 규칙대로 partial(정리 오류)이고 오류 코드가 남는다 (${run.log?.status}·${show(run.log?.errors)})`);
    const w = warns(run);
    ok(w.length === 1 && w[0].kind === "audit_retention_error" && w[0].path === "/cron/audit-retention" && w[0].method === "SCHEDULED" && w[0].detail === "delete:supabase_write_result_unknown", `4-e 운영 이벤트 warn 이 한 번이다(audit_retention_error, delete:결과 모름) (${show(w)})`);
    const feed = await opsCronStatusV22994(fx.env);
    ok(feed.ok === true && feed.last_status === "partial" && feed.last_error === "cleanup:audit_cleanup_failed" && /^V22\.9\./.test(feed.version || ""), `4-f 관제 1.5.0 이 받는 마지막 실행은 partial·cleanup:audit_cleanup_failed 다(‘일부 처리’ 경고, 실패 경고 아님) (${show(feed)})`);
    const restore = intercept(failDelete);
    try {
      const direct = await cleanupTransactionAuditRetentionV22995(fx.env);
      ok(direct.ok === false && direct.error === "audit_cleanup_failed" && direct.audit_more === true, `4-g 정리 함수는 던지지 않고 ok:false·error 를 돌려준다 (${show(direct)})`);
    } finally { restore(); }
  });
  await fixture(async (fx) => {
    quiet(fx, "2026-11-03");
    seedAudit(fx, RUN, old(700));
    let auditReads = 0;
    const failSecondRead = ({ url, method }) => (url.pathname === AUDIT_PATH && method === "GET" && ++auditReads === 2 ? pg(503, { message: "simulated audit read failure" }) : null);
    const run = await runCron(fx, RUN, { handler: failSecondRead });
    eq([run.log?.cleanup, auditRows(fx).length], [{ error: "audit_cleanup_failed", audit_deleted: 500, audit_batches: 1, audit_more: true }, 200], "4-h 둘째 묶음 읽기가 실패해도 첫 묶음에 지운 500개는 기록에 남는다");
    ok(warns(run).length === 1 && warns(run)[0].detail === "select:db_503" && run.log?.status === "partial", `4-i 읽기 실패는 select:db_503 warn 하나와 partial 이다 (${show(warns(run))})`);
  });
  await fixture(async (fx) => {
    quiet(fx, "2026-11-03");
    seedAudit(fx, RUN, old(3));
    fx.env.NLU_FAILURE_RETENTION_DAYS = "0";
    const run = await runCron(fx, RUN);
    ok(isDeepStrictEqual(run.log?.cleanup, { error: "nlu_retention_days_invalid", audit_deleted: 3, audit_batches: 1, audit_more: false }) && run.log?.status === "partial" && auditRows(fx).length === 0,
      `4-j NLU 정리가 실패해도 감사 정리는 돈다(정리 오류는 NLU 코드, 감사 3개 지움) (${show(run.log?.cleanup)})`);
  });
});

// ── 5. 예산: 리포트가 몫을 다 쓰는 일요일에도 감사 정리 두 묶음이 돌고 50회를 넘지 않는다 ─────────────────────────
await section("5 예산", async () => {
  await fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    const ids = Array.from({ length: 30 }, (_, i) => `v95b-${String(i + 1).padStart(2, "0")}`);
    for (const id of ids) {
      fx.db.households.push({ id, name: `${id} 가계부`, created_at: "2026-07-01T00:00:00.000Z" });
      fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "owner", created_at: "2026-07-01T00:00:00.000Z" });
      putSetting(fx, `free_report_preference:${id}`, JSON.stringify({ household_id: id, household_name: `${id} 가계부`, enabled: true, weekly: true, monthly: false }));
      fx.db.transactions.push({ id: `${id}-tx`, household_id: id, user_id: "user-bin", transaction_date: "2026-11-24", type: "expense", amount: 3000, category: "식비", memo: "장보기", payment_method: "국민카드", source: "web", raw_text: "장보기 3000원", created_at: "2026-11-24T03:00:00Z" });
    }
    for (const id of ids.slice(0, 3)) fx.db.accountbook_recurring.push({ id: `${id}-rule`, household_id: id, type: "expense", amount: 4000, category: "구독", memo: "구독", payment_method: "", day_of_month: 29, user_id: "user-bin", is_active: true, last_applied_month: "2026-10", created_at: "2026-07-01T00:00:00+09:00" });
    putSetting(fx, STATE_KEY, JSON.stringify({ checked_date: "2026-11-28", pending_month: "" }));
    const RUN = KST("2026-11-29"); // 일요일: 주간 리포트 30개
    seedAudit(fx, RUN, Array.from({ length: 1200 }, (_, i) => ({ tag: "old", age: 200 * DAY + i * 60000 })));
    const run = await runCron(fx, RUN);
    ok(run.calls <= 50 && !run.error, `5-a 무거운 일요일 실행도 저장소 호출 ${run.calls}회 ≤ 50, 오류 없음`);
    eq([deletes(run).length, run.log?.cleanup], [2, { ok: true, audit_deleted: 1000, audit_batches: 2, audit_more: true }], "5-b 리포트 단계가 몫을 다 써도 감사 정리는 떼어 둔 몫으로 두 묶음을 지운다");
    ok(run.log?.status === "partial" && !run.log?.errors?.length && Number(run.log?.reports?.pending_scopes) > 0 && Number(run.log?.reports?.generated) > 5, `5-c 실행은 리포트가 남아 일부 남음이고(오류 없음) 리포트는 여러 가계부를 만들었다 (${show(run.log?.reports)})`);
    ok(fx.db.transactions.filter((t) => t.source === "recurring_auto").length === 3, "5-d 정기 반영 단계는 그대로 그날 몫을 넣는다");
    ok(!run.events.some((event) => /subrequest_budget/.test(`${event.kind} ${event.detail}`)), "5-e 어느 단계도 호출 한도에 걸려 보내기 전에 멈추지 않았다");
  });
  const router = read("../src/modules/worker/router.js");
  ok(router.includes("limit: 50 - SCHEDULED_RUN_LOG_CALLS - AUDIT_RETENTION_CALLS_V22995 }")
    && /env\.__AB_DB_BUDGET\.limit = 50 - SCHEDULED_RUN_LOG_CALLS;\n\s+const auditCleanup = await cleanupTransactionAuditRetentionV22995\(env\);/.test(router)
    && router.indexOf("cleanupTransactionAuditRetentionV22995(env)") > router.indexOf("await cleanupNluOpsRetention(env)")
    && router.indexOf("cleanupTransactionAuditRetentionV22995(env)") < router.indexOf("await recordScheduledRun(env, run)"), "5-f 라우터는 감사 정리 몫을 처음에 떼고 NLU 정리 뒤·실행 기록 앞에서 푼다");
  const cron = read("../src/modules/cron/recurring-auto-apply.js");
  ok(/const AUDIT_RETENTION_BATCH_V22995 = 500;/.test(cron) && /const AUDIT_RETENTION_BATCHES_V22995 = 2;/.test(cron) && /const AUDIT_RETENTION_CALLS_V22995 = AUDIT_RETENTION_BATCHES_V22995 \* 2;/.test(cron), "5-g 한 실행 몫 = 500행 × 두 묶음, 묶음마다 읽기·지우기 2회");
  const schema = read("../schema_v22_7_0_auth_atomicity.sql");
  ok(/create table if not exists public\.accountbook_transaction_audit \([\s\S]*?id bigint generated by default as identity primary key,[\s\S]*?created_at timestamptz not null default clock_timestamp\(\)\n\);/.test(schema), "5-h 감사 표의 번호(id bigint)·시각(created_at timestamptz) 열 이름이 정의와 같다");
});

// ── 6. 관리자 ‘최근 예약 실행’ 표: 판·남은 범위 열, 기록 정리 칸의 감사 건수 ──────────────────────────────
await section("6 관리자 표", async () => {
  const zeros = { households: 0, rules_seen: 0, scanned: 0, applied: 0, deduplicated: 0, skipped: 0, failed: 0, remaining: 0, pages: 1, report_rebuilt: 0, report_rebuild_pending: 0, report_rebuild_deferred: 0 };
  const reportZeros = { failed: 0, invalid: 0, scanned: 0, skipped: 0, generated: 0 };
  const entries = [
    { started_at: "2026-11-05T00:10:01.000Z", status: "partial", version: "V22.9.95-FIXTURE", recurring: { ...zeros, checked_date: "2026-11-05" }, reports: { ...reportZeros, generated: 3, pending_scopes: 2, partial: true }, cleanup: { ok: true, audit_deleted: 1000, audit_batches: 2, audit_more: true }, errors: [] },
    { started_at: "2026-11-04T00:10:01.000Z", status: "partial", version: "V22.9.95-FIXTURE", recurring: { ...zeros, checked_date: "2026-11-04" }, reports: { ...reportZeros, pending_scopes: 0 }, cleanup: { error: "audit_cleanup_failed", audit_deleted: 500, audit_batches: 1, audit_more: true }, errors: ["cleanup:audit_cleanup_failed"] },
    // 11-02 09:10 운영 실행 기록(지침의 예) 그대로.
    { started_at: "2026-11-02T00:10:00.512Z", finished_at: "2026-11-02T00:10:04.020Z", status: "ok", version: "V22.9.94-REVIEW-FIXES", recurring: { pages: 1, failed: 0, applied: 0, scanned: 0, skipped: 0, remaining: 0, households: 0, rules_seen: 0, checked_date: "2026-11-02", deduplicated: 0, report_rebuilt: 0, report_rebuild_pending: 0, report_rebuild_deferred: 0 }, reports: { failed: 0, invalid: 0, scanned: 0, skipped: 0, generated: 0, pending_scopes: 0 }, cleanup: { ok: true }, errors: [] },
    { started_at: "2026-11-01T00:10:02.000Z", status: "ok", version: "V22.9.93-LAUNCH-FIXES", recurring: { ...zeros, checked_date: "2026-11-01" }, reports: { ...reportZeros }, cleanup: { ok: true }, errors: [] },
    { started_at: "2026-10-20T00:10:00.000Z", status: "ok", cleanup: { ok: true }, errors: [] },
  ];
  await fixture(async (fx) => {
    fx.env.ADMIN_API_TOKEN = "qa-admin-token-v22995";
    const dashboard = async () => {
      const response = await app.fetch(new Request("https://malhaebook.com/ops-dashboard", { headers: { authorization: `Bearer ${fx.env.ADMIN_API_TOKEN}`, accept: "text/html" } }), fx.env, ctx);
      const html = await response.text();
      return { status: response.status, html, section: html.slice(html.indexOf("<h2>최근 예약 실행</h2>"), html.indexOf("<h2>최근 운영 이벤트</h2>")) };
    };
    const empty = await dashboard();
    ok(empty.status === 200 && empty.section.includes('<td colspan="8">아직 저장된 예약 실행 기록이 없어요.</td>'), "6-a 기록이 없을 때 안내 칸이 여덟 칸을 덮는다");
    putSetting(fx, LOG_KEY, JSON.stringify(entries));
    const page = await dashboard();
    const rows = [...page.section.matchAll(/<tr><td>[\s\S]*?<\/tr>/g)].map((m) => m[0]);
    ok(page.status === 200 && page.section.includes("<thead><tr><th>시작(KST)</th><th>판</th><th>상태</th><th>정기 반영</th><th>자동 리포트</th><th>남은 범위</th><th>기록 정리</th><th>오류 코드</th></tr></thead>"), "6-b 머리줄에 판·남은 범위 열이 있다(시작·판·상태·정기 반영·자동 리포트·남은 범위·기록 정리·오류 코드)");
    ok(rows.length === 5 && rows.every((row) => (row.match(/<td[ >]/g) || []).length === 8), `6-c 기록 다섯 줄이 모두 여덟 칸이다 (${rows.map((row) => (row.match(/<td[ >]/g) || []).length).join(",")})`);
    ok(rows[2]?.startsWith('<tr><td>2026-11-02 09:10</td><td>V22.9.94-REVIEW-FIXES</td><td class="ok">정상</td>') && rows[2]?.endsWith("<td>생성 0 · 실패 0</td><td>0</td><td>완료</td><td>-</td></tr>"), `6-d 11-02 09:10 운영 기록 줄: 판 V22.9.94-REVIEW-FIXES·남은 범위 0·기록 정리 ‘완료’ (${rows[2]?.slice(0, 260)})`);
    ok(rows[0]?.includes("<td>V22.9.95-FIXTURE</td>") && rows[0]?.includes("<td>생성 3 · 실패 0</td><td>2</td><td>완료 · 감사 1,000건 · 다음 실행에 이어서</td>"), "6-e 감사 기록을 지운 실행은 ‘완료 · 감사 1,000건’과 이어서 할 일, 남은 범위 2 를 보인다(리포트 칸에 남은 범위를 겹쳐 쓰지 않는다)");
    ok(rows[1]?.includes("<td>오류 audit_cleanup_failed · 감사 500건</td><td>cleanup:audit_cleanup_failed</td>"), "6-f 정리 실패 실행은 오류 코드와 그때까지 지운 감사 건수를 보인다");
    ok(rows[3]?.includes("<td>V22.9.93-LAUNCH-FIXES</td>") && rows[3]?.includes("<td>생성 0 · 실패 0</td><td>-</td><td>완료</td>"), "6-g 남은 범위 칸이 없던 예전 기록(V22.9.93)은 ‘-’ 이다");
    ok(rows[4]?.startsWith("<tr><td>2026-10-20 09:10</td><td>-</td>") && rows[4]?.includes("<td>-</td><td>-</td><td>-</td><td>완료</td>"), "6-h 판·단계 칸이 없는 기록은 ‘-’ 로 보인다");
    ok(/<h2>최근 예약 실행<\/h2><div class="scroll"><table>/.test(page.section) && page.html.includes(".scroll{overflow:auto;") && page.html.includes("table{width:100%;border-collapse:collapse;min-width:780px}") && page.html.includes("@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:25px}table{min-width:680px}}"),
      "6-i 표는 기존 가로 스크롤 틀(.scroll·최소 폭 780px, 좁은 화면 680px) 안에 있어 360px 에서 옆으로 넘긴다");
    ok(page.section.includes("보존 기간(180일)이 지나 지운 거래 변경 감사 기록 수입니다."), "6-j 표 아래에 ‘감사 n건’ 뜻과 보존 기간(기본 180일)을 적는다");
    ok(SECRETS.every((secret) => !page.section.includes(secret)), "6-k 표에 가계부 id·메모·원문·카카오 키가 없다");
  });
});

// ── 7. CI 설정(.github/workflows/verify.yml) ───────────────────────────────────
await section("7 CI 설정", async () => {
  const yml = read("../.github/workflows/verify.yml");
  ok(yml.includes("\n  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}\n") && !/cancel-in-progress:\s*true/.test(yml), "7-a 앞선 실행 취소는 main 이 아닐 때만이다(main 실행은 끝까지 돈다)");
  ok(yml.includes("\n  push:\n    branches: [main]\n") && !yml.includes("'**'"), "7-b 푸시 실행은 main 만이다(브랜치 푸시는 PR 의 pull_request 실행이 맡는다)");
  // 통합 때 고침(에이전트 보고 P2): pull_request 에 branches 거르개가 있으면 base 가 main 이 아닌 쌓인 PR 은 CI 가 전혀 없다(푸시 실행도 main 만이라).
  ok(yml.includes("\non:\n  pull_request:\n  push:\n") && !yml.includes("pull_request:\n    branches"), "7-c PR 실행은 base 가 어느 브랜치든 돈다(쌓인 PR 도 검사한다)");
  // 통합 때 고침(P3): 같은 묶음에서 기다리는 실행은 하나뿐이라 짧은 사이의 병합 세 번이면 가운데 실행이 버려진다. main 은 커밋(sha)마다 따로 묶는다.
  ok(yml.includes("        os: [ubuntu-latest, windows-latest]\n        categories: [present, absent]\n") && yml.includes("run: node .codex/scripts/verify-repository.mjs") && yml.includes("run: node monitoring/test-d1.mjs") && yml.includes("  group: verify-${{ github.workflow }}-${{ github.ref == 'refs/heads/main' && github.sha || github.ref }}\n"),
    "7-d 네 칸(ubuntu·windows × present·absent)·두 단계는 그대로이고 main 실행은 커밋마다 따로 묶는다");
  ok((yml.match(/^# V22\.9\.95 R-11: .+$/gm) || []).length === 1 && /^# PR 실행은 base 가 어느 브랜치든 돈다/m.test(yml), "7-e 왜 바꿨는지 주석이 있다");
});

if (failures.length) {
  for (const line of failures) console.error(`실패: ${line}`);
  console.error(`V22.9.95 데이터·운영(감사 기록 보존·예약 실행 표·CI) 검사 checks ${checks} failed ${failures.length}`);
  process.exit(1);
}
console.log(`V22.9.95 데이터·운영(감사 기록 보존·예약 실행 표·CI) 검사 통과 checks ${checks} failed 0`);

// V22.9.81 역할·안내 문구·정리 묶음 검사 (V80 U-4·U-18·U-19·U-1·U-2·U-3·U-20·U-5·U-21).
//   U-4   카카오 예산 설정·내 이름·기록 수정/삭제·단톡방 연결·방 정보·새 가계부 뒤 연결 제안이 역할 조회 실패(503)를 ‘권한 없음’으로 읽었다
//         → V22.9.80 T-35 와 같이 엄격한 조회: 실패는 ‘권한을 확인하지 못해 아무것도 바꾸지 않았어요’로 알리고 아무것도 바꾸지 않는다.
//         흐름·수정 세션은 그대로 두어 같은 답을 다시 보내면 이어진다. 조회는 예전처럼 한 번이다(카카오 4초 예산).
// 서버가 그린 화면·리다이렉트·카카오 답장은 app.fetch 로 보고, 지운 함수·느슨한 조회는 소스 모듈을 직접 읽어 확인한다.
//   U-18  옛 관리자 화면(/?legacy=1)의 일괄 수정·삭제 성공이 ‘N건 … 완료’ 자유 문장으로 와서 초록 칸에 ‘요청을 처리하지 못했습니다’로 보였다 → 코드(bulk_updated·bulk_deleted).
//   U-19  같은 화면의 오류 칸이 환불 연결 코드가 아닌 코드(record_update_failed·edit_busy 등)를 코드 글자 그대로 보였다 → 코드 모양이면 formatMessage(모르는 코드는 일반 안내).
//   U-1   시작가이드(/start-guide)가 고른 가계부가 아니라 첫 가계부의 역할·주소로 링크를 그렸다 → 고른 가계부 기준.
// 사용: node validation/validate-roles-v22981.mjs [kakao|admin|guide|source]
// V22981_SOFT=1 이면 실패해도 멈추지 않고 모아서 끝에 보여 준다(고치기 전 코드에서 몇 개가 실패하는지 세기 위해). V22981_LIST=1 을 함께 주면 통과한 검사도 모두 적는다.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, app, counter, ctx, failure, fixture, intercept, page, post, putSetting, settingValue, skill, withClock } from "./lib-audit-v22934.mjs";
import { formatMessage, kakaoGroupLinkItemSettingsKey } from "../src/index.js";

const SOFT = process.env.V22981_SOFT === "1";
const only = process.argv[2] || "";
const run = (name) => !only || only === name;
const base = counter("V22.9.81 역할·안내 문구·정리 검사 통과");
const failures = [];
const checkLog = [];
let softChecks = 0;
const t = {
  ok(value, message) {
    if (SOFT) { softChecks += 1; checkLog.push([!!value, message]); if (!value) failures.push(message); return; }
    base.ok(value, message);
  },
  eq(actual, expected, message) {
    if (SOFT) { softChecks += 1; checkLog.push([actual === expected, message]); if (actual !== expected) failures.push(`${message} (받음 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`); return; }
    base.eq(actual, expected, message);
  },
};
async function section(name, task) {
  if (!run(name)) return;
  try { await task(); } catch (error) {
    if (!SOFT) throw error;
    softChecks += 1;
    failures.push(`${name} 구간이 끝까지 못 돌았다 — ${String(error?.stack || error).split("\n").slice(0, 2).join(" | ").slice(0, 200)}`);
  }
}

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(ROOT, ...relative.split("/")), "utf8");
const BIN = "kakao_login:2265";
const WIFI = "kakao_login:2266";
const first = (value) => String(value || "").split("\n")[0].slice(0, 90);

// ── U-4 카카오 흐름: 역할 조회 실패는 ‘권한 없음’이 아니다 ─────────────────────────────────────────
const KAKAO_FAILED = "권한을 확인하지 못해 아무것도 바꾸지 않았어요";
// 역할 확인 한 줄 조회(getHouseholdMemberRole·엄격판이 같은 주소를 쓴다)만 실패시킨다. 가계부 목록(fetchUserHouseholds)·연결 직전 재확인(select=role)은 그대로다.
const isRoleRead = (url, method) => method === "GET" && url.pathname.endsWith("/household_members")
  && !!url.searchParams.get("household_id") && !!url.searchParams.get("user_id") && url.searchParams.get("select") === "role,created_at";
async function roleDown(task, { household = "" } = {}) {
  let reads = 0;
  const restore = intercept(({ url, method }) => {
    if (!isRoleRead(url, method)) return null;
    if (household && url.searchParams.get("household_id") !== `eq.${household}`) return null;
    reads += 1;
    return failure(503, "role read down");
  });
  try { return { text: await task(), reads }; } finally { restore(); }
}
// 조회는 성공했는데 이 가계부의 구성원 줄이 없다(진짜 ‘참여자가 아님’). 라우터가 쓰는 가계부 목록은 그대로라 흐름 안의 거절을 볼 수 있다.
async function roleMissing(task) {
  const restore = intercept(({ url, method }) => (isRoleRead(url, method) ? new Response("[]", { status: 200, headers: { "content-type": "application/json" } }) : null));
  try { return await task(); } finally { restore(); }
}
async function roleReads(task) {
  let reads = 0;
  const restore = intercept(({ url, method }) => { if (isRoleRead(url, method)) reads += 1; return null; });
  try { return { text: await task(), reads }; } finally { restore(); }
}
const flowOf = (fx, userId) => {
  const row = fx.db.accountbook_settings.find((item) => item.key.startsWith(`kakao_flow_v215:${userId}:`) && item.value && item.value !== "{}");
  try { return row ? JSON.parse(row.value) : {}; } catch (_) { return {}; }
};
const editSessionOf = (fx, kakaoKey) => String(fx.db.accountbook_settings.find((item) => item.key.startsWith("kakao_edit_v4:") && item.key.endsWith(`:${kakaoKey}`))?.value || "");
const linkedOf = (fx, group) => { try { return JSON.parse(settingValue(fx, kakaoGroupLinkItemSettingsKey(group)) || "{}").household_id || ""; } catch (_) { return ""; } };
const totalBudget = (fx) => fx.db.accountbook_budgets.find((row) => row.household_id === "house-home" && row.month === "2026-07" && row.category === "__total")?.amount;
const aliasOf = (fx, userId) => { try { return JSON.parse(settingValue(fx, "member_aliases:house-home") || "{}")[userId] || ""; } catch (_) { return ""; } };
const memberRow = (fx, householdId, userId) => fx.db.household_members.find((row) => row.household_id === householdId && row.user_id === userId);
const txRow = (id, memo, amount, hour) => ({ id, household_id: "house-home", user_id: "user-bin", source_user_key: BIN, transaction_date: "2026-07-15", type: "expense", amount, category: "식비", memo, payment_method: "현금", source: "kakao_skill", raw_text: `${memo} ${amount}`, created_at: `2026-07-15T0${hour}:00:00.000Z` });
async function kakaoFixture(task) {
  return withClock("2026-07-15", () => fixture(async (fx) => {
    putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
    putSetting(fx, "kakao_selected_household_v2251:user-wifi", "house-home");
    fx.db.transactions.push(txRow("k-dinner", "저녁", 30000, 1), txRow("k-coffee", "커피", 5000, 2));
    return task(fx, (utterance, options = {}) => skill(fx, utterance, options));
  }));
}

await section("kakao", async () => {
  // 예산 설정: 단계마다 역할을 다시 본다. 실패하면 거절·흐름 닫기 대신 ‘확인하지 못함’, 예산·흐름 상태는 그대로.
  await kakaoFixture(async (fx, say) => {
    await say("예산설정");
    const atRoot = await roleDown(() => say("전체 월 예산"));
    t.ok(atRoot.text.includes(KAKAO_FAILED), `U-4 예산 설정 중 역할 조회가 실패하면 ‘권한을 확인하지 못함’으로 알린다 (${first(atRoot.text)})`);
    t.ok(!atRoot.text.includes("주인·관리자만"), "U-4 예산 설정 중 조회 실패를 ‘주인·관리자만 정할 수 있어요’(거절)로 말하지 않는다");
    t.eq(atRoot.reads, 1, "U-4 예산 설정의 역할 확인은 예전처럼 한 번 읽는다");
    t.eq(flowOf(fx, "user-bin").flow, "budget_setup", "U-4 조회 실패 뒤에도 예산 설정 흐름은 닫히지 않는다");
    t.ok((await say("전체 월 예산")).includes("얼마로"), "U-4 같은 답을 다시 보내면 그 단계에서 이어진다");
    await say("50만원");
    const atConfirm = await roleDown(() => say("설정하기"));
    t.ok(atConfirm.text.includes(KAKAO_FAILED), `U-4 예산 확정 단계의 조회 실패도 ‘확인하지 못함’이다 (${first(atConfirm.text)})`);
    t.eq(totalBudget(fx), 2500000, "U-4 조회가 실패하면 예산은 바뀌지 않는다");
    const confirmed = await roleReads(() => say("설정하기"));
    t.ok(confirmed.text.includes("설정했어요") && totalBudget(fx) === 500000, `U-4 다시 보내면 예산이 저장된다 (${first(confirmed.text)})`);
    t.eq(confirmed.reads, 1, "U-4 조회가 되살아난 뒤의 확정도 역할을 한 번만 읽는다");
    // 진짜 거절은 그대로: 흐름 도중 구성원으로 바뀌면 예전 문장으로 거절하고 흐름을 닫는다.
    await say("예산설정");
    memberRow(fx, "house-home", "user-bin").role = "member";
    const denied = await say("전체 월 예산");
    t.ok(denied.includes("예산은 가계부 주인·관리자만 정할 수 있어요"), `U-4 흐름 도중 역할이 바뀐 구성원은 예전처럼 거절한다 (${first(denied)})`);
    t.eq(flowOf(fx, "user-bin").flow, undefined, "U-4 진짜 거절 뒤에는 예산 흐름이 닫힌다");
  });

  // 내 이름: 실패를 ‘활성 구성원이 아니어서’로 말하지 않는다.
  await kakaoFixture(async (fx, say) => {
    await say("이름설정", { user: WIFI });
    const alias = await roleDown(() => say("민지", { user: WIFI }));
    t.ok(alias.text.includes(KAKAO_FAILED) && !alias.text.includes("활성 구성원이 아니어서"), `U-4 내 이름 설정의 조회 실패는 ‘활성 구성원이 아님’이 아니다 (${first(alias.text)})`);
    t.eq(aliasOf(fx, "user-wifi"), "WIFI♥", "U-4 조회가 실패하면 표시 이름은 바뀌지 않는다");
    t.ok((await say("민지", { user: WIFI })).includes("‘민지’로 설정했어요") && aliasOf(fx, "user-wifi") === "민지", "U-4 같은 이름을 다시 보내면 저장된다(흐름이 남아 있다)");
    await say("이름설정", { user: WIFI });
    const gone = await roleMissing(() => say("영희", { user: WIFI }));
    t.ok(gone.includes("활성 구성원이 아니어서"), `U-4 조회가 되고 구성원 줄이 없으면 예전처럼 거절한다 (${first(gone)})`);
    t.eq(aliasOf(fx, "user-wifi"), "민지", "U-4 진짜 거절은 표시 이름을 바꾸지 않는다");
  });

  // 기록 수정·삭제: 실패를 ‘현재 권한으로는 수정·삭제할 수 없어요’로 말하지 않고, 기록도 세션도 그대로 둔다.
  await kakaoFixture(async (fx, say) => {
    await say("수정 01번");
    await say("금액");
    const edit = await roleDown(() => say("13000"));
    t.ok(edit.text.includes(KAKAO_FAILED) && !edit.text.includes("현재 가계부 권한으로는"), `U-4 수정 적용 직전 조회 실패는 ‘권한 없음’이 아니다 (${first(edit.text)})`);
    t.eq(edit.reads, 1, "U-4 수정 적용 직전 역할 확인은 한 번 읽는다");
    t.eq(fx.db.transactions.find((row) => row.id === "k-dinner")?.amount, 30000, "U-4 조회가 실패하면 기록 금액은 바뀌지 않는다");
    t.ok(editSessionOf(fx, BIN).includes("awaiting_value"), "U-4 열려 있던 수정 세션은 그 단계 그대로 남는다");
    const retried = await say("13000");
    t.ok(retried.includes("13,000원으로 변경했어요") && fx.db.transactions.find((row) => row.id === "k-dinner")?.amount === 13000, `U-4 같은 값을 다시 보내면 수정된다 (${first(retried)})`);
    const oneLine = await roleDown(() => say("수정 01번 금액 15000"));
    t.ok(oneLine.text.includes(KAKAO_FAILED), `U-4 한 줄 수정 명령의 조회 실패도 ‘확인하지 못함’이다 (${first(oneLine.text)})`);
    t.eq(fx.db.transactions.find((row) => row.id === "k-dinner")?.amount, 13000, "U-4 한 줄 명령도 조회가 실패하면 바꾸지 않는다");
    t.eq(editSessionOf(fx, BIN), "", "U-4 한 줄 명령은 조회가 실패해도 수정 세션을 새로 열어 두지 않는다(다음 숫자가 새 기록으로 저장되도록)");
    await say("수정 02번");
    const removal = await roleDown(() => say("삭제"));
    t.ok(removal.text.includes(KAKAO_FAILED) && !removal.text.includes("현재 가계부 권한으로는"), `U-4 삭제 직전 조회 실패도 ‘확인하지 못함’이다 (${first(removal.text)})`);
    t.ok(fx.db.transactions.some((row) => row.id === "k-coffee"), "U-4 조회가 실패하면 기록을 지우지 않는다");
    t.ok((await say("삭제")).includes("삭제했어요") && !fx.db.transactions.some((row) => row.id === "k-coffee"), "U-4 다시 보내면 삭제된다(세션이 남아 있다)");
    await say("수정 01번");
    await say("금액");
    memberRow(fx, "house-home", "user-bin").role = "viewer";
    t.ok((await say("17000")).includes("현재 가계부 권한으로는 기록을 수정하거나 삭제할 수 없어요"), "U-4 조회 전용으로 바뀐 사람은 예전처럼 거절한다");
    t.eq(fx.db.transactions.find((row) => row.id === "k-dinner")?.amount, 13000, "U-4 진짜 거절도 기록을 바꾸지 않는다");
  });

  // 단톡방 연결·방 정보·새 가계부 뒤 연결 제안.
  await kakaoFixture(async (fx, say) => {
    const room = "qa-room-roles-v22981";
    const direct = await roleDown(() => say("단톡방 연결 HOME2265", { groupKey: room }));
    t.ok(!direct.text.includes("소유자 또는 관리자만"), `U-4 초대코드 연결의 조회 실패를 ‘소유자·관리자만’으로 말하지 않는다 (${first(direct.text)})`);
    t.ok(/잠시 후 다시|확인하지 못해/.test(direct.text), "U-4 초대코드 연결의 조회 실패는 잠시 뒤 다시 하라고 안내한다");
    t.eq(linkedOf(fx, room), "", "U-4 조회가 실패하면 방을 연결하지 않는다");
    t.ok((await say("단톡방 연결 TRIP2265", { groupKey: room })).includes("연결 완료") && linkedOf(fx, room) === "house-trip", "U-4 조회가 되면 소유자는 예전처럼 연결한다");
    t.ok((await say("단톡방 연결 HOME2265", { groupKey: room })).includes("연결을 변경할까요"), "U-4 다른 가계부로 바꾸려면 예전처럼 확인을 묻는다");
    const confirm = await roleDown(() => say("연결하기", { groupKey: room }));
    t.ok(confirm.text.includes(KAKAO_FAILED) && !confirm.text.includes("소유자 또는 관리자로 등록된 카카오 계정에서"), `U-4 연결 변경 확인의 조회 실패는 ‘권한 없음’이 아니다 (${first(confirm.text)})`);
    t.eq(linkedOf(fx, room), "house-trip", "U-4 조회가 실패하면 방 연결은 그대로다");
    t.ok((await say("연결하기", { groupKey: room })).includes("연결 완료") && linkedOf(fx, room) === "house-home", "U-4 ‘연결하기’를 다시 보내면 바뀐다(확인 질문이 남아 있다)");
    const info = await roleDown(() => say("단톡방 정보", { groupKey: room }));
    t.ok(info.text.includes("확인하지 못했어요") && !info.text.includes("아직 참여 전"), `U-4 방 정보는 조회 실패를 ‘아직 참여 전’으로 적지 않는다 (${info.text.split("\n").find((line) => line.startsWith("내 권한")) || ""})`);
    t.ok((await say("단톡방 정보", { groupKey: room })).includes("내 권한: 소유자"), "U-4 조회가 되면 방 정보는 예전처럼 역할을 적는다");
    t.ok((await say("단톡방 연결 TRIP2265", { groupKey: room, user: WIFI })).includes("소유자 또는 관리자만"), "U-4 소유자·관리자가 아닌 사람의 연결은 예전처럼 거절한다");
  });
  await kakaoFixture(async (fx, say) => {
    const room = "qa-room-rebind-v22981";
    await say("단톡방 연결 TRIP2265", { groupKey: room });
    await say("새 가계부 만들기 동네 모임", { groupKey: room });
    const made = await roleDown(() => say("이 이름으로 만들기", { groupKey: room }), { household: "house-trip" });
    t.ok(made.text.includes("만들었어요"), "U-4 새 가계부는 예전처럼 만들어진다");
    t.ok(!made.text.includes("소유자·관리자가 ‘가계부전환’을 입력해야"), `U-4 지금 연결 가계부의 역할을 못 읽었다고 ‘그 가계부 소유자·관리자가 바꿔야 해요’라고 하지 않는다 (${made.text.split("\n").find((line) => line.includes("가계부전환")) || ""})`);
    t.ok(made.text.includes("권한을 확인하지 못해") && made.text.includes("가계부전환"), "U-4 확인하지 못해 묻지 않았다고 알리고 나중에 바꾸는 길을 적는다");
    t.ok(!flowOf(fx, "user-bin").flow, "U-4 조회가 실패하면 연결 변경 질문 상태를 만들지 않는다");
    t.eq(linkedOf(fx, room), "house-trip", "U-4 방 연결은 그대로다");
    await say("새 가계부 만들기 동네 모임둘", { groupKey: room });
    t.ok((await say("이 이름으로 만들기", { groupKey: room })).includes("바꿀까요"), "U-4 조회가 되면 예전처럼 연결을 바꿀지 묻는다");
  });
});

// ── U-18·U-19 옛 관리자 화면(/?legacy=1): 일괄 처리 성공 안내와 오류 코드 ─────────────────────────────────────
const GENERIC = formatMessage("not_a_known_code_v22981");
const LEGACY = "/?legacy=1&month=2026-07&household_id=house-home&tab=transactions";
const txId = (n) => `0e000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const okBox = (html) => (String(html || "").match(/<div class="ok">([^<]*)<\/div>/) || [, null])[1];
const errorBox = (html) => (String(html || "").match(/<div class="error">([^<]*)<\/div>/) || [, null])[1];
const paramOf = (location, name) => new URL(location || "/", BASE).searchParams.get(name);
let adminSeq = 0;
async function adminLogin(fx) {
  adminSeq += 1;
  const response = await app.fetch(new Request(`${BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", "cf-connecting-ip": `198.51.100.${120 + adminSeq}` },
    body: new URLSearchParams({ password: "qa-admin-pass", return_to: "/?legacy=1" }).toString(),
  }), fx.env, ctx);
  return ((response.headers.get("set-cookie") || "").match(/ab_admin=[^;]+/) || [""])[0];
}
// 일괄 처리 RPC(accountbook_bulk_transactions_v227)는 픽스처에 없어 메모리로 흉내 낸다(한 문장 — 다 바꾸거나 하나도 안 바꾼다).
async function adminFixture(task) {
  return withClock("2026-07-15", () => fixture(async (fx) => {
    fx.env.ADMIN_SESSION_SECRET = "qa-admin-session-secret";
    fx.env.ADMIN_PASSWORD = "qa-admin-pass";
    for (const [n, memo] of [[1, "장보기"], [2, "택시"], [3, "약국"]]) {
      fx.db.transactions.push({ id: txId(n), household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-10", type: "expense", amount: 1000 * n, category: "식비", memo, payment_method: "카드", created_at: `2026-07-10T0${n}:00:00.000Z` });
    }
    const restore = intercept(({ url, init }) => {
      if (url.pathname !== "/rest/v1/rpc/accountbook_bulk_transactions_v227") return null;
      const body = JSON.parse(String(init.body || "{}"));
      const ids = (body.p_transaction_ids || []).map(String);
      const rows = ids.map((id) => fx.db.transactions.find((row) => String(row.id) === id && row.household_id === body.p_household_id));
      if (rows.some((row) => !row)) return new Response(JSON.stringify({ code: "P0001", message: "bulk_transaction_not_found" }), { status: 400, headers: { "content-type": "application/json" } });
      if (body.p_delete) fx.db.transactions = fx.db.transactions.filter((row) => !ids.includes(String(row.id)));
      else for (const row of rows) Object.assign(row, body.p_patch || {});
      return new Response(JSON.stringify([{ affected: ids.length }]), { status: 200, headers: { "content-type": "application/json" } });
    });
    try { return await task(fx, await adminLogin(fx)); } finally { restore(); }
  }));
}

await section("admin", () => adminFixture(async (fx, admin) => {
  t.ok(!!admin, "U-18 관리자 로그인 쿠키를 얻는다");
  const updated = await post(fx, "/admin/bulk", new URLSearchParams([["ids", txId(1)], ["ids", txId(2)], ["household_id", "house-home"], ["month", "2026-07"], ["bulk_payment_method", "현금"]]), { cookie: admin });
  t.eq(updated.status, 303, "U-18 일괄 수정은 예전처럼 화면으로 돌려보낸다");
  t.eq(paramOf(updated.location, "msg"), "bulk_updated", `U-18 일괄 수정 성공은 코드 bulk_updated 로 보낸다 (${decodeURIComponent(updated.location).slice(0, 120)})`);
  t.ok(fx.db.transactions.filter((row) => [txId(1), txId(2)].includes(row.id)).every((row) => row.payment_method === "현금"), "U-18 일괄 수정은 예전처럼 저장된다");
  const updatedPage = await page(fx, updated.location, { cookie: admin });
  t.eq(okBox(updatedPage.html), formatMessage("bulk_updated"), "U-18 화면의 성공 칸은 ‘선택 항목을 일괄 수정했습니다.’다");
  t.ok(!String(okBox(updatedPage.html) || "").includes("처리하지 못했습니다"), "U-18 일괄 수정 성공을 실패 문장으로 보이지 않는다");
  const returned = await post(fx, "/admin/bulk", new URLSearchParams([["ids", txId(1)], ["household_id", "house-home"], ["month", "2026-07"], ["bulk_category", "생활"], ["return_to", `${LEGACY}&page=2`]]), { cookie: admin });
  t.ok(paramOf(returned.location, "msg") === "bulk_updated" && paramOf(returned.location, "page") === "2", "U-18 돌아갈 주소(return_to)가 있어도 코드를 보내고 그 주소를 지킨다");
  const removed = await post(fx, "/admin/bulk", new URLSearchParams([["ids", txId(3)], ["household_id", "house-home"], ["month", "2026-07"], ["bulk_delete", "1"]]), { cookie: admin });
  t.eq(paramOf(removed.location, "msg"), "bulk_deleted", "U-18 일괄 삭제 성공은 코드 bulk_deleted 로 보낸다");
  t.ok(!fx.db.transactions.some((row) => row.id === txId(3)), "U-18 일괄 삭제는 예전처럼 지운다");
  const removedPage = await page(fx, removed.location, { cookie: admin });
  t.eq(okBox(removedPage.html), formatMessage("bulk_deleted"), "U-18 화면의 성공 칸은 ‘선택 항목을 삭제했습니다.’다");
  const empty = await post(fx, "/admin/bulk", new URLSearchParams([["household_id", "house-home"], ["month", "2026-07"], ["bulk_payment_method", "현금"]]), { cookie: admin });
  t.eq(errorBox((await page(fx, empty.location, { cookie: admin })).html), "선택된 거래가 없습니다.", "U-19 예전 자유 문장 오류는 그대로 보인다");

  // 오류 칸: 기록 처리 경로가 보내는 코드는 안내 문장으로, 모르는 코드는 일반 안내로(코드 글자는 보이지 않는다).
  for (const code of ["record_update_failed", "edit_busy", "edit_unknown", "record_not_found", "ambiguous_field", "amount_required", "amount_unit_required", "invalid_date", "db_write_unknown", "request_conflict", "write_denied_viewer", "write_denied_not_member", "not_my_record", "household_role_check_failed", "member_record_only", "member_policy_unavailable"]) {
    const shown = errorBox((await page(fx, `${LEGACY}&err=${code}`, { cookie: admin })).html);
    t.ok(!!shown && shown === formatMessage(code) && shown !== GENERIC && !shown.includes(code), `U-19 오류 코드 ${code} 는 안내 문장으로 보인다 (${String(shown).slice(0, 50)})`);
  }
  const unknown = errorBox((await page(fx, `${LEGACY}&err=zz_unknown_v22981`, { cookie: admin })).html);
  t.ok(unknown === GENERIC && !String(unknown).includes("zz_unknown_v22981"), "U-19 모르는 코드는 코드 글자 대신 일반 안내로 보인다");
  t.eq(errorBox((await page(fx, `${LEGACY}&err=refund_link_locked_category`, { cookie: admin })).html), formatMessage("refund_link_locked_category"), "U-19 환불 연결 코드는 예전처럼 안내 문장이다");
  const note = "선택한 2건 중 1건을 수정했습니다. 환불과 연결돼 바꿀 수 없는 1건은 그대로 두었습니다.";
  t.eq(errorBox((await page(fx, `${LEGACY}&err=${encodeURIComponent(note)}`, { cookie: admin })).html), note, "U-19 일괄 수정 건너뛰기 안내(문장)는 예전처럼 그대로 보인다");
  const tagged = (await page(fx, `${LEGACY}&err=${encodeURIComponent("<b>x</b>")}`, { cookie: admin })).html;
  t.ok(tagged.includes('<div class="error">&lt;b&gt;x&lt;/b&gt;</div>') && !tagged.includes("<b>x</b>"), "U-19 문장 오류는 예전처럼 이스케이프한다");
}));

// ── U-1 시작가이드: 고른 가계부(?household_id) 기준의 링크·역할 ─────────────────────────────────────────
const amp = (href) => href.replace(/&/g, "&amp;");
await section("guide", () => withClock("2026-07-15", () => fixture(async (fx) => {
  // WIFI: 우리집 생활비(구성원, 7-02) + 7월 제주여행(소유자, 7-10 — 가장 최근이라 목록 첫 가계부) + WIFI 개인(소유자, 6-01).
  fx.db.household_members.push({ household_id: "house-trip", user_id: "user-wifi", role: "owner", created_at: "2026-07-10T00:00:00.000Z" });
  fx.db.households.push({ id: "house-wifi", name: "WIFI 개인", invite_code: "WIFI2265", created_at: "2026-06-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: "house-wifi", user_id: "user-wifi", role: "owner", created_at: "2026-06-01T00:00:00.000Z" });
  const wifi = await fx.cookieFor("user-wifi");
  const member = await page(fx, "/start-guide?household_id=house-home&month=2026-07", { cookie: wifi });
  t.eq(member.status, 200, "U-1 시작가이드가 열린다");
  t.ok(member.html.includes('data-start-household="house-home"') && member.html.includes("우리집 생활비 선택됨"), "U-1 고른 가계부(우리집 생활비)를 선택된 가계부로 적는다");
  t.ok(member.html.includes(amp('href="/my?household_id=house-home&month=2026-07"')), "U-1 ‘홈·입력’ 링크가 고른 가계부로 간다");
  t.ok(!member.html.includes("household_id=house-trip"), "U-1 첫 가계부(7월 제주여행)로 가는 링크가 하나도 없다");
  t.ok(member.html.includes(amp('href="/budgets?household_id=house-home&month=2026-07"')) && member.html.includes('href="/kakao-commands"') && member.html.includes('href="/my/profile"'), "U-1 고른 가계부에서 구성원이면 구성원용 링크(예산 보기·카카오 명령·내 정보)를 보인다");
  t.ok(!/href="\/my\/settings\?household_id=/.test(member.html), "U-1 첫 가계부의 소유자 역할로 관리자 전용 링크(/my/settings)를 보이지 않는다");
  const owner = await page(fx, "/start-guide?household_id=house-wifi&month=2026-07", { cookie: wifi });
  t.ok(owner.html.includes('data-start-household="house-wifi"') && owner.html.includes("WIFI 개인 선택됨"), "U-1 소유자인 다른 가계부를 고르면 그 가계부가 선택된다");
  t.ok(owner.html.includes(amp('href="/my/settings?household_id=house-wifi&month=2026-07"')) && owner.html.includes(amp('href="/my/members?household_id=house-wifi&month=2026-07"')), "U-1 고른 가계부의 소유자에게는 관리 링크를 그 가계부로 보인다");
  t.ok(!owner.html.includes("household_id=house-trip") && !owner.html.includes("household_id=house-home"), "U-1 다른 가계부로 가는 링크가 섞이지 않는다");
  const plain = await page(fx, "/start-guide?month=2026-07", { cookie: wifi });
  t.ok(plain.html.includes('data-start-household="house-trip"') && plain.html.includes(amp('href="/my/settings?household_id=house-trip&month=2026-07"')), "U-1 가계부를 고르지 않으면 예전처럼 첫 가계부 기준이다");
})));

// ── 소스: 고친 카카오 흐름이 실패를 빈 역할로 바꾸는 느슨한 조회를 더는 쓰지 않는다 ──────────────────────────
await section("source", async () => {
  for (const file of ["kakao/guided-flows.js", "kakao/edit-flow-v4.js"]) {
    t.ok(!/\bgetHouseholdMemberRole\(/.test(read(`src/modules/${file}`)), `U-4 ${file} 는 getHouseholdMemberRole(실패 → 빈 역할)을 부르지 않는다`);
  }
  const groupLinks = read("src/modules/kakao/group-links-first-record.js");
  const bindBody = groupLinks.slice(groupLinks.indexOf("async function bindKakaoGroupByInviteCode"), groupLinks.indexOf("async function kakaoGroupInfoText"));
  const infoBody = groupLinks.slice(groupLinks.indexOf("async function kakaoGroupInfoText"));
  t.ok(bindBody.length > 0 && !/\bgetHouseholdMemberRole\(/.test(bindBody), "U-4 단톡방 연결(bindKakaoGroupByInviteCode)은 느슨한 조회를 쓰지 않는다");
  t.ok(infoBody.length > 0 && !/\bgetHouseholdMemberRole\(/.test(infoBody.slice(0, infoBody.indexOf("\n}\n") + 1)), "U-4 방 정보(kakaoGroupInfoText)는 느슨한 조회를 쓰지 않는다");
});

if (SOFT) {
  console.log(`V22981_SOFT: 통과 ${softChecks - failures.length} · 실패 ${failures.length} (검사 ${softChecks}개)`);
  if (process.env.V22981_LIST === "1") for (const [pass, message] of checkLog) console.log(`  ${pass ? "통과" : "실패"}: ${message}`);
  else for (const message of failures) console.log(`  실패: ${message}`);
  if (failures.length) process.exitCode = 1;
} else {
  base.done();
}

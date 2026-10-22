// V22.9.77 — 2026-10-14 감사 B-5·B-7 동작 검사(그리고 B-6 이 B-7 수정으로 나빠지지 않았는지).
//
// ── 이 파일이 왜 생겼는지 ──
// 감사(docs/codex/AUDIT_FINDINGS_V22_9_44.md)가 찾은 두 결함이 출시 직전까지 그대로 재현됐다.
//   B-5 단톡방 요약·정산의 사람별 합계가 이름 기준이라, 별명이 없는 구성원(모두 ‘카카오사용자’) 셋의 지출이
//       "카카오사용자: 36,000원" 한 줄이 되고 송금 제안이 "카카오사용자 → 카카오사용자"였다.
//   B-7 웹(카카오 로그인)으로 먼저 가입한 사람이 appUserId 를 실어 채팅하면 이름이 "2265"인 새 계정이 생기고
//       links["kakao_login:2265"] 가 새 계정을 가리켜, 옛 계정의 웹 로그인까지 새 채팅 계정으로 열렸다.
//   B-6 (V22.9.76 에서 고침) 이미 연결된 별칭은 전역 식별 잠금 없이 지나간다 — B-7 수정 뒤에도 그대로인지 본다.
// 소스 문자열이 아니라 실제 요청(카카오 /skill, 웹 /auth/kakao/start·callback, /settlement-summary, /u/api/recent-transactions,
// /app 의 지출자 고르기)과 저장된 행으로 확인한다.
// 봇 채널의 appUserId 가 로그인 앱과 같은 번호 체계인지는 확인되지 않았다(감사 ‘미확인’). 그래서 충돌하면 자동으로
// 합치지 않고 지금 연결을 그대로 두며 운영 이벤트만 남기는지, 기존 웹 계정 찾기는 Secret 으로 확인된 요청에서만 하는지
// (확인 안 된 요청은 찾지도 묶지도 않고 기록은 지금 계정으로)도 본다.
//
// ── 실행 ──
//   node validation/validate-identity-v22977.mjs
//   V22977_ONLY=B-5,B-7     그 절만 돌린다(B-5 · B-7 · B-6).
//   V22977_SOFT=1            실패해도 멈추지 않고 실패한 검사를 모두 적는다(옛 코드에서 무엇이 깨지는지 볼 때).
import assert from "node:assert/strict";
import { app, BASE, ctx, counter, fixture, intercept, page, post, settingValue, withClock } from "./lib-audit-v22934.mjs";

const t = counter("PASS: V22.9.77 identity fixes");
const SOFT = process.env.V22977_SOFT === "1";
const ONLY = String(process.env.V22977_ONLY || "").split(",").map((item) => item.trim()).filter(Boolean);
const failures = [];
const ok = (value, message) => {
  if (value) return t.ok(true, message);
  if (!SOFT) assert.fail(message);
  failures.push(message);
};
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
async function section(name, task) {
  if (ONLY.length && !ONLY.includes(name)) return;
  await task();
}

const SECRET = "identity-secret-v22977";
const DAY = "2026-10-15";
const MONTH = DAY.slice(0, 7);

// 공식 그룹 챗봇 모양(v1.11.1): 봇 사용자 키는 user.properties.botUserKey, 방 키는 userRequest.chat 에 온다.
function payloadFor(utterance, { user, room = "", appUserId = "" }) {
  const properties = { botUserKey: user, ...(appUserId ? { appUserId } : {}) };
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}

// 카카오 스킬 호출. 뒤로 미룬 저장(waitUntil)까지 기다린 뒤 답장 글을 돌려준다. secret:false 는 Secret 헤더 없이 보낸다.
async function say(fx, utterance, options) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(options.secret === false ? {} : { "x-kakao-skill-secret": SECRET }) },
    body: JSON.stringify(payloadFor(utterance, options)),
  }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  await Promise.allSettled(jobs);
  await Promise.allSettled(jobs);
  let json = null;
  try { json = JSON.parse(raw); } catch (_) {}
  return (json?.template?.outputs || []).map((o) => o?.simpleText?.text || [o?.textCard?.title, o?.textCard?.description].filter(Boolean).join("\n")).join("\n") || raw;
}

const links = (fx) => JSON.parse(settingValue(fx, "user_identity_links") || "{}");
const userByKey = (fx, key) => fx.db.users.find((user) => user.kakao_user_key === key);
const newest = (fx) => fx.db.transactions.at(-1);
const conflictEvents = () => (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === "kakao_login_alias_conflict");
const resetConflictTrace = () => globalThis.__AB_KAKAO_LOGIN_CONFLICT_TRACED?.clear?.();

function setCookiePairs(headers) {
  const all = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie") || ""];
  return all.map((item) => String(item).split(";")[0].trim()).filter((pair) => pair && !pair.endsWith("="));
}

// 실제 웹 카카오 로그인(/auth/kakao/start → /auth/kakao/callback). 카카오 서버 두 곳만 가짜 응답으로 바꾸고,
// 콜백이 준 세션 쿠키(ab_user = "사용자id|만료|판.서명")에서 로그인된 사용자 id 를 읽는다.
async function webKakaoLogin(fx, kakaoId, nickname) {
  Object.assign(fx.env, { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback` });
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const restore = intercept(async ({ url }) => {
    if (url.href === "https://kauth.kakao.com/oauth/token") return json({ access_token: "qa-access-token", token_type: "bearer" });
    if (url.href === "https://kapi.kakao.com/v2/user/me") return json({ id: Number(kakaoId), properties: { nickname } });
    return null;
  });
  try {
    const start = await app.fetch(new Request(`${BASE}/auth/kakao/start`), fx.env, ctx);
    const state = new URL(start.headers.get("location") || `${BASE}/`).searchParams.get("state") || "";
    const callback = await app.fetch(new Request(`${BASE}/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(state)}`, {
      headers: { cookie: setCookiePairs(start.headers).join("; ") },
    }), fx.env, ctx);
    const session = setCookiePairs(callback.headers).find((pair) => pair.startsWith("ab_user="));
    return session ? decodeURIComponent(session.slice("ab_user=".length)).split("|")[0] : `(로그인 실패 ${callback.status})`;
  } finally {
    restore();
  }
}

// 전역 식별 잠금(settings-rmw:user_identity_links)을 잡으려는 횟수와 강한 식별 표 조회 횟수를 센다. busy 이면 잠금을 못 잡게 한다.
function watchIdentityTraffic({ busy = false } = {}) {
  const seen = { lockClaims: 0, strongReads: 0 };
  const restore = intercept(async ({ url, method, init }) => {
    if (url.pathname.endsWith("/rest/v1/accountbook_user_identities") && method === "GET") seen.strongReads += 1;
    if (!url.pathname.endsWith("/rpc/accountbook_claim_operation")) return null;
    let key = "";
    try { key = JSON.parse(String(init.body || "{}")).p_key || ""; } catch (_) {}
    if (key !== "settings-rmw:user_identity_links") return null;
    seen.lockClaims += 1;
    return busy ? new Response(JSON.stringify([{ acquired: false }]), { status: 200, headers: { "content-type": "application/json" } }) : null;
  });
  return { seen, restore };
}

// ── B-5 단톡방 요약·정산: 사람마다 따로, 이름이 같으면 참여 순서 번호로 ──────────────────────────
await section("B-5", async () => {
  await withClock(DAY, () => fixture(async (fx) => {
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    const room = "room-b5";
    const said = (utterance, user) => say(fx, `@말해가계부 ${utterance}`, { user, room });
    await said("장보기 30000", "bot-b5-a");
    await said("커피 5000", "bot-b5-b");
    await said("과자 1000", "bot-b5-c");
    const hid = newest(fx).household_id;
    const [a, b, c] = ["bot-b5-a", "bot-b5-b", "bot-b5-c"].map((key) => userByKey(fx, key)?.id);
    eq(fx.db.transactions.filter((row) => row.household_id === hid).length, 3, "B-5 준비: 세 사람의 기록이 방 가계부에 저장됐다");
    eq(fx.db.household_members.filter((m) => m.household_id === hid).map((m) => fx.db.users.find((u) => u.id === m.user_id)?.nickname).join("/"), "카카오사용자/카카오사용자/카카오사용자", "B-5 준비: 세 구성원 모두 기본 이름 ‘카카오사용자’(payload 에 별명 없음)");

    const summary = await said("이번 달 요약", "bot-b5-a");
    ok(!summary.includes("카카오사용자: 36,000원"), `B-5 요약: 세 사람의 지출이 한 줄로 합쳐지지 않는다(예전: ‘카카오사용자: 36,000원’) (${summary.slice(0, 260)})`);
    ok(summary.includes("• 카카오사용자 1: 30,000원") && summary.includes("• 카카오사용자 2: 5,000원") && summary.includes("• 카카오사용자 3: 1,000원"), `B-5 요약: 사람마다 한 줄, 같은 이름은 참여 순서대로 번호 (${summary.slice(0, 260)})`);

    const settlement = await said("정산", "bot-b5-a");
    const transfers = [...settlement.matchAll(/^• (.+) → (.+): ([\d,]+)원$/gm)].map((m) => ({ from: m[1], to: m[2], amount: m[3] }));
    eq(transfers.length, 2, "B-5 정산: 송금 제안 두 줄");
    ok(transfers.every((item) => item.from !== item.to), `B-5 정산: 송금 제안의 보내는 사람과 받는 사람이 같은 이름이 아니다(예전: ‘카카오사용자 → 카카오사용자’) (${JSON.stringify(transfers)})`);
    ok(settlement.includes("• 카카오사용자 3 → 카카오사용자 1: 11,000원") && settlement.includes("• 카카오사용자 2 → 카카오사용자 1: 7,000원"), `B-5 정산: 요약과 같은 사람에게 같은 번호 (${settlement.slice(-160)})`);
    ok(settlement.includes("• 카카오사용자 1: 18,000원 받기") && settlement.includes("• 카카오사용자 2: 7,000원 보내기") && settlement.includes("• 카카오사용자 3: 11,000원 보내기"), "B-5 정산: 받을·보낼 금액도 사람마다 구분된 이름");

    // 같은 계산을 쓰는 웹 정산 화면도 같은 이름이다.
    const html = (await page(fx, `/settlement-summary?month=${MONTH}&household_id=${encodeURIComponent(hid)}`, { cookie: await fx.cookieFor(a) })).html;
    const rows = [...html.matchAll(/<tr><td>([^<]+)<\/td><td>([^<]+)<\/td><td><b>([\d,]+)원<\/b><\/td><\/tr>/g)].map((m) => [m[1], m[2], m[3]]);
    ok(rows.length === 2 && rows.every(([from, to]) => from !== to) && rows.some(([from, to, amount]) => from === "카카오사용자 3" && to === "카카오사용자 1" && amount === "11,000"), `B-5 웹 정산 화면: 송금 제안 양쪽이 구분되고 카카오 답장과 같은 번호 (${JSON.stringify(rows)})`);
    ok(html.includes("<b>카카오사용자 2</b>") && !html.includes("<b>카카오사용자</b>"), "B-5 웹 정산 화면: 참여자 표도 번호로 구분");

    // V22.9.76 D-20 그대로: 지출이 없는 조회 전용은 1/N 에 들어가지 않고, 나간 사람은 ‘별명(나간 구성원)’.
    fx.db.users.push({ id: "user-b5-viewer", kakao_user_key: "bot-b5-viewer", nickname: "카카오사용자", created_at: "2026-10-15T00:00:00.000Z" });
    fx.db.household_members.push({ household_id: hid, user_id: "user-b5-viewer", role: "viewer", created_at: "2099-01-01T00:00:00.000Z" });
    const withViewer = await said("정산", "bot-b5-a");
    ok(withViewer.includes("참여자: 3명") && !withViewer.includes("카카오사용자 4"), `B-5·D-20: 지출이 없는 조회 전용 구성원은 정산 1/N 에 들어가지 않는다 (${withViewer.slice(0, 200)})`);
    const left = await post(fx, "/my/household/leave", { household_id: hid, month: MONTH, understand_history: "1" }, { cookie: await fx.cookieFor(c) });
    ok(!fx.db.household_members.some((m) => m.household_id === hid && m.user_id === c), `B-5 준비: 세 번째 사람이 가계부에서 나갔다 (${left.status} ${left.decoded.slice(0, 120)})`);
    const afterLeave = await said("정산", "bot-b5-a");
    ok(afterLeave.includes("• 카카오사용자(나간 구성원): 11,000원 보내기") && afterLeave.includes("• 카카오사용자(나간 구성원) → 카카오사용자 1: 11,000원"), `B-5·D-20: 카카오 정산도 나간 사람을 ‘별명(나간 구성원)’으로 구분한다(예전 카카오 답장: ‘이전 구성원’) (${afterLeave.slice(-260)})`);
    ok(afterLeave.includes("• 카카오사용자 1: 18,000원 받기") && afterLeave.includes("• 카카오사용자 2: 7,000원 보내기"), "B-5: 남은 사람의 번호는 그대로(참여 순서)");
    const summaryAfterLeave = await said("이번 달 요약", "bot-b5-b");
    ok(summaryAfterLeave.includes("• 카카오사용자(나간 구성원): 1,000원") && !summaryAfterLeave.includes("미지정"), `B-5 요약: 나간 사람의 지출은 ‘미지정’이 아니라 그 사람 줄로 남는다 (${summaryAfterLeave.slice(0, 300)})`);
    // 웹 기록 목록(/u/api/recent-transactions — 나간 사람을 명단에 섞어 이름을 붙인다)도 요약·정산과 같은 이름이다. 나간 사람이
    // 섞여 와도 남은 사람의 번호는 그대로이고, 나간 사람은 ‘카카오사용자(나간 구성원)’(예전: 셋 다 ‘카카오사용자’).
    const recent = await page(fx, `/u/api/recent-transactions?household_id=${encodeURIComponent(hid)}&month=${MONTH}`, { cookie: await fx.cookieFor(a), headers: { accept: "application/json" } });
    let recentRows = [];
    try { recentRows = Object.values(JSON.parse(recent.html)).find((value) => Array.isArray(value) && value.some((row) => row && "member" in row)) || []; } catch (_) {}
    const memberFor = (amount) => recentRows.find((row) => Number(row.amount) === amount)?.member;
    eq([memberFor(30000), memberFor(5000), memberFor(1000)].join("/"), "카카오사용자 1/카카오사용자 2/카카오사용자(나간 구성원)", `B-5 웹 기록 목록: 요약·정산과 같은 이름 (${recent.status} ${recent.html.slice(0, 160)})`);
    // 웹 화면의 지출자 고르기도 같은 이름이라 같은 이름 둘 중 누구인지 고를 수 있다(예전: ‘카카오사용자 (…)’ 두 개).
    const app = await page(fx, `/app?month=${MONTH}&household_id=${encodeURIComponent(hid)}`, { cookie: await fx.cookieFor(a) });
    const optionFor = (uid) => (new RegExp(`<option value="${uid}"[^>]*>([^<]*)</option>`).exec(app.html) || [])[1] || "";
    ok(optionFor(a).startsWith("카카오사용자 1 (") && optionFor(b).startsWith("카카오사용자 2 ("), `B-5 웹 지출자 고르기: 같은 이름도 번호로 구분 (${app.status} ${optionFor(a)} | ${optionFor(b)})`);
    ok(a && b && c && new Set([a, b, c]).size === 3, "B-5 준비: 세 사람은 서로 다른 사용자다");
  }));
});

// ── B-7 웹 카카오 로그인 계정으로 채팅(appUserId)하면 그 계정을 쓴다. 지금 연결을 옮기거나 합치지 않는다 ──────────
await section("B-7", async () => {
  // ① 웹으로 먼저 가입한 사람(users.kakao_user_key = "kakao_login:2265")이 새 봇 키 + appUserId 2265 로 처음 말한다.
  //    강한 식별(accountbook_user_identities) 행이 없는 옛 가입자와 있는 가입자 둘 다 본다.
  for (const strong of [false, true]) {
    const label = strong ? "강한 식별 있음" : "강한 식별 없음";
    await withClock(DAY, () => fixture(async (fx) => {
      fx.env.KAKAO_SKILL_SECRET = SECRET;
      if (strong) fx.db.accountbook_user_identities.push({ user_id: "user-bin", provider: "kakao", provider_subject: "2265", login_name: "", credential_version: 2 });
      const usersBefore = fx.db.users.length;
      const bot = `bot-b7-new-${strong ? "s" : "w"}`;
      const first = await say(fx, "이번 달 요약", { user: bot, appUserId: "2265" });
      eq(fx.db.users.length, usersBefore, `B-7 ${label}: 새 사용자를 만들지 않는다(예전: 이름이 "2265"인 새 사용자)`);
      ok(!fx.db.users.some((user) => user.nickname === "2265"), `B-7 ${label}: appUserId 를 표시 이름으로 쓰지 않는다`);
      ok(first.includes("우리집 생활비") && first.includes("7월 제주여행"), `B-7 ${label}: 채팅이 웹 계정(Bin)의 가계부로 이어진다(예전: ‘먼저 가계부를 만들어 보세요’) (${first.slice(0, 160)})`);
      const map = links(fx);
      eq(map["kakao_login:2265"]?.user_id || "user-bin", "user-bin", `B-7 ${label}: kakao_login:2265 링크는 웹 계정을 가리킨다(예전: 새 채팅 계정으로 바뀜)`);
      eq(map[`skill_identity:${bot}`]?.user_id, "user-bin", `B-7 ${label}: 봇 사용자 별칭이 웹 계정에 연결된다`);
      await say(fx, "2", { user: bot, appUserId: "2265" });
      await say(fx, "점심 12000", { user: bot, appUserId: "2265" });
      ok(newest(fx).amount === 12000 && newest(fx).user_id === "user-bin" && newest(fx).household_id === "house-home", `B-7 ${label}: 기록은 웹 계정의 고른 가계부에 Bin 이름으로 저장 (${JSON.stringify(newest(fx)).slice(0, 160)})`);
      eq(await webKakaoLogin(fx, "2265", "Bin"), "user-bin", `B-7 ${label}: 채팅 뒤에도 웹 카카오 로그인은 같은 웹 계정으로 들어간다`);

      // B-6 이 나빠지지 않았다: 연결이 끝난 뒤의 요청은 전역 식별 잠금도, 강한 식별 조회도 하지 않는다.
      const watch = watchIdentityTraffic();
      try {
        await say(fx, "커피 4300", { user: bot, appUserId: "2265" });
      } finally {
        watch.restore();
      }
      ok(newest(fx).amount === 4300 && newest(fx).user_id === "user-bin", `B-6 ${label}: 연결된 뒤 기록은 그대로 저장`);
      eq(watch.seen.lockClaims, 0, `B-6 ${label}: 연결된 뒤에는 전역 식별 잠금을 잡지 않는다`);
      eq(watch.seen.strongReads, 0, `B-6 ${label}: 연결된 뒤에는 강한 식별 표를 다시 읽지 않는다`);
    }));
  }

  // ② 이미 채팅 계정이 있는 사람(봇 키로 만든 계정)이 나중에 appUserId 를 싣고 온다. 그 카카오 로그인 id 는 다른 웹 계정의 것이다.
  //    자동으로 합치지 않는다: 채팅은 지금 계정, 웹 로그인은 웹 계정 그대로 두고 운영 이벤트만 남긴다.
  await withClock(DAY, () => fixture(async (fx) => {
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    resetConflictTrace();
    const bot = "bot-b7-chat-first";
    await say(fx, "커피 4100", { user: bot });
    const chatUser = userByKey(fx, bot)?.id;
    ok(chatUser && newest(fx).user_id === chatUser, "B-7 충돌 준비: 봇 키만으로 채팅 계정이 생기고 첫 기록이 저장됐다");
    const usersBefore = fx.db.users.length;
    const eventsBefore = conflictEvents().length;
    const reply = await say(fx, "점심 8100", { user: bot, appUserId: "2265" });
    ok(newest(fx).amount === 8100 && newest(fx).user_id === chatUser, `B-7 충돌: 채팅은 지금 계정으로 계속 기록한다 (${reply.slice(0, 120)})`);
    ok(!links(fx)["kakao_login:2265"], `B-7 충돌: kakao_login:2265 를 채팅 계정에 묶지 않는다(예전: 묶어서 웹 로그인이 채팅 계정으로 바뀜) (${JSON.stringify(links(fx)["kakao_login:2265"] || null)})`);
    eq(fx.db.users.length, usersBefore, "B-7 충돌: 계정을 새로 만들지 않는다");
    eq(fx.db.users.find((user) => user.id === "user-bin")?.kakao_user_key, "kakao_login:2265", "B-7 충돌: 웹 계정을 합치거나 바꾸지 않는다");
    eq(userByKey(fx, bot)?.id, chatUser, "B-7 충돌: 채팅 계정도 합치거나 바꾸지 않는다");
    eq(await webKakaoLogin(fx, "2265", "Bin"), "user-bin", "B-7 충돌: 웹 카카오 로그인은 원래 웹 계정 그대로");
    const events = conflictEvents().slice(eventsBefore);
    eq(events.length, 1, "B-7 충돌: 운영 이벤트(kakao_login_alias_conflict)를 한 번 남긴다");
    ok(events.every((event) => !/8100|점심|2265/.test(JSON.stringify(event))), `B-7 충돌: 운영 이벤트에 받은 말·카카오 id 를 싣지 않는다 (${JSON.stringify(events[0] || {})})`);
    await say(fx, "저녁 9100", { user: bot, appUserId: "2265" });
    ok(newest(fx).amount === 9100 && newest(fx).user_id === chatUser, "B-7 충돌: 다음 요청도 지금 계정으로 저장");
    eq(conflictEvents().length - eventsBefore, 1, "B-7 충돌: 같은 두 계정의 운영 이벤트는 10분에 한 번만");
  }));

  // ③ ②와 같지만 다른 isolate 가 전역 식별 잠금을 쥐고 있다. 충돌한 별칭은 쓰지 않으므로 잠금이 필요 없다(B-6 이 나빠지지 않음).
  await withClock(DAY, () => fixture(async (fx) => {
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    resetConflictTrace();
    const bot = "bot-b7-busy";
    await say(fx, "커피 4200", { user: bot });
    const chatUser = userByKey(fx, bot)?.id;
    const watch = watchIdentityTraffic({ busy: true });
    let reply = "";
    try {
      reply = await say(fx, "점심 8200", { user: bot, appUserId: "2265" });
    } finally {
      watch.restore();
    }
    ok(newest(fx).amount === 8200 && newest(fx).user_id === chatUser, `B-6·B-7 충돌: 전역 식별 잠금이 바빠도 기록한다(예전: 별칭을 쓰려고 잠금을 기다리다 저장 안 됨) (${reply.slice(0, 120)})`);
    eq(watch.seen.lockClaims, 0, "B-6·B-7 충돌: 다른 사람의 kakao_login 별칭 때문에 전역 식별 잠금을 잡지 않는다");
  }));

  // ④ 링크 표에 kakao_login:2265 → 웹 계정이 이미 있다. 예전에는 채팅 계정이 그 별칭을 가져가려다 충돌 오류로 요청마다 실패했다.
  await withClock(DAY, () => fixture(async (fx) => {
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    resetConflictTrace();
    const bot = "bot-b7-linked";
    await say(fx, "커피 4400", { user: bot });
    const chatUser = userByKey(fx, bot)?.id;
    const map = links(fx);
    map["kakao_login:2265"] = { user_id: "user-bin", provider: "skill", linked_at: "2026-10-01T00:00:00.000Z" };
    fx.db.accountbook_settings.find((row) => row.key === "user_identity_links").value = JSON.stringify(map);
    const eventsBefore = conflictEvents().length;
    const reply = await say(fx, "점심 8400", { user: bot, appUserId: "2265" });
    ok(newest(fx).amount === 8400 && newest(fx).user_id === chatUser, `B-7 링크 충돌: 요청이 실패하지 않고 지금 채팅 계정에 저장(예전: identity_alias_conflict 로 실패) (${reply.slice(0, 120)})`);
    eq(links(fx)["kakao_login:2265"]?.user_id, "user-bin", "B-7 링크 충돌: 이미 있는 kakao_login 링크를 다른 사람에게 옮기지 않는다");
    eq(conflictEvents().length - eventsBefore, 1, "B-7 링크 충돌: 운영 이벤트를 남긴다");
    eq(await webKakaoLogin(fx, "2265", "Bin"), "user-bin", "B-7 링크 충돌: 웹 카카오 로그인은 웹 계정 그대로");
  }));

  // ⑥ Secret 으로 확인되지 않은 요청(observe 모드라 통과는 됨)의 appUserId 는 누구나 적어 보낼 수 있다. 그것으로 남의 웹 계정을
  //    찾아 열지 않고, 이미 있는 채팅 계정에 남의 kakao_login 별칭을 묶지도 않는다(예전: 묶어서 그 사람의 웹 로그인이 바뀜).
  await withClock(DAY, () => fixture(async (fx) => {
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    fx.env.KAKAO_SKILL_AUTH_MODE = "observe";
    const usersBefore = fx.db.users.length;
    const forged = await say(fx, "이번 달 요약", { user: "bot-b7-forged", appUserId: "2265", secret: false });
    ok(!forged.includes("우리집 생활비") && !forged.includes("7월 제주여행"), `B-7 확인 안 된 요청: appUserId 만으로 웹 계정(Bin)의 가계부를 열지 않는다 (${forged.slice(0, 120)})`);
    ok(!links(fx)["skill_identity:bot-b7-forged"] && fx.db.users.length === usersBefore, "B-7 확인 안 된 요청: 봇 별칭을 웹 계정에 묶거나 계정을 만들지 않는다");
    const bot = "bot-b7-observe";
    await say(fx, "커피 4500", { user: bot });
    const chatUser = userByKey(fx, bot)?.id;
    ok(chatUser, "B-7 확인 안 된 요청 준비: Secret 이 맞는 요청으로 채팅 계정을 만들었다");
    resetConflictTrace();
    const eventsBefore = conflictEvents().length;
    const unsigned = await say(fx, "점심 8500", { user: bot, appUserId: "2265", secret: false });
    ok(fx.db.transactions.find((row) => Number(row.amount) === 8500)?.user_id === chatUser, `B-7 확인 안 된 요청: 기록은 예전처럼 지금 채팅 계정에 저장된다(별칭만 묶지 않는다) (${unsigned.slice(0, 120)})`);
    eq(conflictEvents().length, eventsBefore, "B-7 확인 안 된 요청: 운영 이벤트를 남기지 않는다(누구나 보낼 수 있는 값으로 기록을 채우지 않는다)");
    ok(!links(fx)["kakao_login:2265"], `B-7 확인 안 된 요청: 이미 있는 채팅 계정에 남의 kakao_login 별칭을 묶지 않는다(예전: 묶음) (${JSON.stringify(links(fx)["kakao_login:2265"] || null)})`);
    eq(await webKakaoLogin(fx, "2265", "Bin"), "user-bin", "B-7 확인 안 된 요청 뒤에도 웹 카카오 로그인은 웹 계정 그대로");
  }));

  // ⑤ 웹 계정이 없는 새 사람: 예전처럼 채팅 계정을 만들고 kakao_login 별칭도 그 계정에 묶는다(이름만 기본 이름).
  await withClock(DAY, () => fixture(async (fx) => {
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    const bot = "bot-b7-fresh";
    await say(fx, "점심 9000", { user: bot, appUserId: "9001" });
    const created = userByKey(fx, bot);
    ok(created && newest(fx).user_id === created.id && newest(fx).amount === 9000, "B-7 새 사람: 채팅 계정과 개인 가계부를 만들고 첫 기록을 저장(예전과 같음)");
    eq(created?.nickname, "카카오사용자", "B-7 새 사람: 이름은 appUserId(\"9001\")가 아니라 기본 이름");
    eq(links(fx)["kakao_login:9001"]?.user_id, created?.id, "B-7 새 사람: 주인이 없는 kakao_login 별칭은 예전처럼 채팅 계정에 묶는다");
    eq(await webKakaoLogin(fx, "9001", "새사람"), created?.id, "B-7 새 사람: 같은 카카오 로그인으로 웹에 오면 채팅 계정으로 이어진다(예전과 같음)");
  }));
});

if (failures.length) {
  console.error(`FAIL: V22.9.77 identity fixes — ${failures.length}개 실패\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
t.done();

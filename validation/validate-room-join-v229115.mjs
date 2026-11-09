// V22.9.115 단톡방 호출 참여 — 단톡방에서 봇을 부르기만 해도 자동 구성원, 가계부 없는 방은 첫 호출자가 소유자, 소유자 양도(웹) 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 사용자 결정(2026-11-09): "자동 구성원으로 들이고 첫 호출자를 소유자로 보고 소유자는 양도 가능하도록 진행하자".
// 전에는 단톡방에서 거래(기록)를 한 번 보낸 사람만 방 가계부 구성원이 됐고(V22.9.43), 가계부가 없는 방은 첫 기록으로만 만들어졌다(V22.9.31).
// 기록 없이 설명서·시작·도움말·웹가계부·조회만 부른 사람은 ‘참여 전’ 안내를 받았고, ‘웹가계부’ 단추를 눌러도 로그인 화면(V22.9.105 no_user)이었다.
// 이 판: Secret 으로 확인된 요청 + 명시된 botGroupKey 이면 어떤 호출이든 그 자리에서(설명서·빈 멘션은 답 뒤에서) 구성원으로 들이고, 가계부 없는 방은
// 첫 호출자를 소유자로 공동 가계부를 준비한다(group-links-first-record.js joinKakaoRoomOnCallV229115 = tryKakaoGroupFirstRecord 의 joinOnly).
// 나간 이력·해제된 방·조회 전용·이용 제한·위조/추정 키·확인되지 않은 요청은 예전처럼 들이지 않는다. 소유자는 웹 ‘참여자·초대’에서 관리자·구성원에게
// 소유자를 양도한다(POST /my/household/transfer-owner; 대상 먼저 올리고 나를 내림, 부분 실패는 다시 눌러 복구).
// 실제 요청(/skill·/my·/my/members·/my/household/transfer-owner·/my/household/leave)과 저장된 행으로 본다. 가짜는 픽스처 DB 와 실패 흉내뿐이다.
//
// ── 실행 ──
//   node validation/validate-room-join-v229115.mjs
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { kakaoGroupFirstKeys } from "../src/modules/kakao/group-links-first-record.js";
import { householdPageMessage } from "../src/modules/my/households-lifecycle.js";
import { app, BASE, counter, failure, fixture, intercept, page, post, withClock } from "./lib-audit-v22934.mjs";

const t = counter("PASS: V22.9.115 room call joins members, first caller owns, owner transfers");
const ok = (value, message) => t.ok(!!value, message);
const eq = (actual, expected, message) => t.ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hex66 = (label) => createHash("sha256").update(label).digest("hex") + "ab";

const SECRET = "room-join-secret-v229115";
const DAY = "2026-11-09";
const ROOM = hex66("v115-room-a");
const ROOM_RECORD = hex66("v115-room-record");
const ROOM_RETIRED = hex66("v115-room-retired");
const ROOM_INFERRED = hex66("v115-room-inferred");
const U = Object.fromEntries(["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9", "u10", "u11", "u12", "u13", "u14", "u15"].map((name) => [name, hex66(`v115-${name}`)]));
const INAPP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
const ROOM_HOUSEHOLD_NAME = "이 방의 공동 가계부";

function resetIsolateState() {
  for (const name of ["__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD"]) globalThis[name]?.clear?.();
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}
const events = (kind) => (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === kind);

function payloadFor(utterance, { user, room = "", inferredRoom = "" }) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  if (inferredRoom) userRequest.chat = { id: inferredRoom }; // 추정 키(명시된 botGroupKey 없음): 읽기 호환용이지 방 가계부를 만들거나 들이는 근거가 아니다
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}
const textOf = (body) => (body?.template?.outputs || []).map((output) => output.simpleText?.text || [output.textCard?.title, output.textCard?.description].filter(Boolean).join("\n") || "").join("\n");

// 스킬 요청 한 번. waitUntil 일(답 뒤 들이기·정리)은 끝까지 기다린다. trace 는 이 요청의 저장소 호출 수(답 전/전체).
async function say(fx, utterance, { user, room = "", inferredRoom = "", secret = true } = {}) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  fx.trace = [];
  fx.replied = false;
  const headers = { "content-type": "application/json" };
  if (secret) headers["x-kakao-skill-secret"] = SECRET;
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers, body: JSON.stringify(payloadFor(utterance, { user, room, inferredRoom })) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const before = fx.trace.length;
  fx.replied = true;
  const body = JSON.parse(await response.text());
  for (let round = 0; round < 6 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  return { status: response.status, body, text: textOf(body), outputs: body?.template?.outputs || [], before, total: fx.trace.length };
}

async function go(fx, path, { ua = INAPP, cookie = "" } = {}) {
  const jobs = [];
  const response = await app.fetch(new Request(new URL(path, BASE).href, { headers: { "user-agent": ua, accept: "text/html", "sec-fetch-mode": "navigate", ...(cookie ? { cookie } : {}) } }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await Promise.allSettled(jobs);
  return { status: response.status, location: response.headers.get("location") || "", html: await response.text() };
}
const tapped = (path, { user, room = ROOM }) => { const url = new URL(path, BASE); url.searchParams.set("botUserKey", user); url.searchParams.set("appUserId", "1801267359"); url.searchParams.set("botGroupKey", room); return `${url.pathname}${url.search}`; };

const userByKey = (fx, key) => fx.db.users.find((row) => row.kakao_user_key === key);
const roleOf = (fx, userId, householdId) => fx.db.household_members.find((row) => String(row.user_id) === String(userId) && row.household_id === householdId)?.role;
const roomHouseholds = (fx) => fx.db.households.filter((row) => row.name === ROOM_HOUSEHOLD_NAME);
const linkRows = (fx) => fx.db.accountbook_settings.filter((row) => String(row.key).startsWith("kakao_group_link_v2254:"));
const owners = (fx, householdId) => fx.db.household_members.filter((row) => row.household_id === householdId && row.role === "owner").map((row) => String(row.user_id));
function putSetting(fx, key, value) {
  const row = fx.db.accountbook_settings.find((item) => item.key === key);
  if (row) row.value = value; else fx.db.accountbook_settings.push({ id: `setting-${key.slice(0, 24)}-${fx.db.accountbook_settings.length}`, key, value, created_at: `${DAY}T00:00:00.000Z` });
}
function addUser(fx, key, id, nickname) {
  fx.db.users.push({ id, kakao_user_key: key, nickname, created_at: `${DAY}T00:00:00.000Z` });
  return id;
}

async function roomFixture(task) {
  return withClock(DAY, () => fixture(async (fx) => {
    resetIsolateState();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    Object.assign(fx.env, KAKAO_ENV);
    const mock = globalThis.fetch;
    fx.trace = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.hostname !== "mock.supabase.co") throw new Error("unexpected live network in V22.9.115 room-join QA");
      fx.trace.push({ path: url.pathname + url.search, method: String(init.method || "GET"), afterReply: !!fx.replied });
      return mock(input, init);
    };
    try { return await task(fx); } finally { globalThis.fetch = mock; resetIsolateState(); }
  }));
}

// ── 0. 소스·번들·등록 ─────────────────────────────────────────────────────────
{
  const links = read("src/modules/kakao/group-links-first-record.js");
  const skill = read("src/modules/kakao/skill-handler.js");
  const members = read("src/modules/my/members-page.js");
  const lifecycle = read("src/modules/my/households-lifecycle.js");
  const router = read("src/modules/worker/router.js");
  const builders = read("src/modules/kakao/response-builders.js");
  const guide = read("src/modules/public/guide-content.js");
  const bundle = read("src/index.js");
  ok(links.includes("async function joinKakaoRoomOnCallV229115(env, context = {}) {") && /export \{[^}]*\bjoinKakaoRoomOnCallV229115\b[^}]*\}/.test(links), "0 들이기 도우미가 있고 내보낸다");
  ok(links.includes("const joinOnly = !!context.joinOnly;") && links.includes('if (joinOnly) return { ok: true, skipped: false, reason: roomCreatedNow ? "created" : joinedNow ? "joined" : "already_member", role,'), "0 기록 경로(tryKakaoGroupFirstRecord)가 joinOnly 로 저장 대신 결과 객체를 돌려준다(같은 잠금·표식·고정 ID)");
  ok(links.includes('return rejected("retired",') && links.includes('return rejected("departed",') && links.includes('return rejected("role_blocked",') && links.includes('return rejected("household_missing",'), "0 해제된 방·나간 이력·조회 전용/이용 제한·가계부 없음은 joinOnly 에서도 거절(객체)이다");
  ok(skill.includes("const roomJoinEligible = skillConfigured && !!botGroupKey && trustedIdentity && getExplicitKakaoBotGroupKey(payload) === botGroupKey;"), "0 들이기 조건 = Secret 확인 + 명시된 botGroupKey(기록 경로와 같은 조건)");
  ok(skill.includes('await deferRoomJoinOnCall("manual");') && skill.includes('await deferRoomJoinOnCall("mention");') && skill.includes('deferKakaoAfterReply(env, () => joinRoomOnCallSync({ source }), { cost: 26 })'), "0 설명서·빈 멘션은 답 뒤(deferKakaoAfterReply)에서 들인다");
  ok(skill.includes('joinRoomOnCallSync({ source: "link" })') && skill.includes('source: "start"') && skill.includes('source: "help"') && skill.includes('source: "command"'), "0 웹가계부·시작·도움말·그 밖의 명령은 그 자리에서 들인다");
  ok(skill.includes("response = await prependKakaoRoomJoinNoticeV229115(response, env);") && skill.includes("async function prependKakaoRoomJoinNoticeV229115(response, env) {"), "0 래퍼가 들인 사실을 답 맨 앞 한 줄로 끼운다");
  ok(builders.includes('function kakaoWebLedgerReply(origin = "", notice = "") {') && builders.includes('description: "전체 기록과 분석을 웹에서 크게 볼 수 있어요.\\n아래 버튼을 누르면 이 방 가계부가 열려요."'), "0 ‘웹가계부’ 카드는 글을 그대로 두고 앞에 한 줄만 더한다");
  ok(members.includes("async function handleMyOwnerTransfer(request, env) {") && /export \{[^}]*\bhandleMyOwnerTransfer\b[^}]*\}/.test(members), "0 소유자 양도 처리기가 있고 내보낸다");
  const promoteAt = members.indexOf('"owner"))) throw new Error("owner_transfer_promote_not_applied");');
  const demoteAt = members.indexOf('demoted = await patchRole(String(userId), "&role=eq.owner", "admin");');
  ok(promoteAt > 0 && demoteAt > promoteAt, "0 대상을 먼저 소유자로 올리고(현재 역할 조건부) 나를 관리자로 내린다(role=eq.owner 조건부) — 실패해도 소유자 없는 가계부가 되지 않는 순서");
  ok(members.includes("withKakaoUserLifecycleLease(env, [String(userId), targetId].sort(), async ({ assertFresh: lifecycleFresh }) => withHouseholdDatabaseLease(env, householdId,"), "0 양도는 두 사용자 잠금 → 가계부 잠금 안에서 역할을 다시 읽고 바꾼다");
  ok(router.includes('if (url.pathname === "/my/household/transfer-owner" && request.method === "POST") {') && router.includes("return await handleMyOwnerTransfer(request, env);"), "0 라우터에 POST /my/household/transfer-owner 가 있다");
  for (const code of ["owner_transferred", "owner_transfer_not_owner", "owner_transfer_target_invalid", "owner_transfer_self", "owner_transfer_partial", "owner_transfer_failed"]) ok(lifecycle.includes(`    ${code}: "`) && !/^owner_transfer/.test(householdPageMessage(code)), `0 안내 표에 ${code} 가 있다`);
  ok(householdPageMessage("household_leave_owner_blocked").includes("양도") && !householdPageMessage("household_leave_owner_blocked").includes("준비되기 전"), "0 소유자 나가기 안내가 ‘양도한 뒤’ 를 말한다(‘소유권 이전 기능이 준비되기 전’ 삭제)");
  ok(members.includes('action="/my/household/transfer-owner"') && members.includes(">소유자 양도</button>") && members.includes('const transfer = owner || !viewerIsOwner || !["admin", "member"].includes(role) ? ""'), "0 참여자 화면: 소유자가 보는 관리자·구성원 카드에만 ‘소유자 양도’ 단추");
  ok(members.includes("봇을 부르거나 거래를 보낸 사람이 승인 없이 구성원이 됩니다") && guide.includes("봇을 한 번도 부르지 않은 사람은 참여 전이라 빠집니다") && links.includes("봇을 부르거나 거래를 보내는 참여자는 승인 없이"), "0 안내 문구가 ‘봇을 부르거나 거래를 보낸 사람’ 으로 바뀌었다(참여자 화면·공개 안내·연결 안내)");
  ok(!/무료/.test(members) && !/무료/.test(guide.slice(guide.indexOf("모임 총무로 쓰기"), guide.indexOf("모임 총무로 쓰기") + 3000)), "0 바뀐 문구에 ‘무료’ 말이 없다");
  for (const needle of ["joinKakaoRoomOnCallV229115", "prependKakaoRoomJoinNoticeV229115", "handleMyOwnerTransfer", "/my/household/transfer-owner", "owner_transfer_partial", "첫 호출자인 내가 소유자예요"]) ok(bundle.includes(needle), `0 번들에 ${needle} 가 있다`);
  const pkg = JSON.parse(read("package.json"));
  ok(pkg.scripts?.["validate:room-join-v229115"] === "node validation/validate-room-join-v229115.mjs", "0 package.json 에 검사가 등록돼 있다");
  ok(read(".codex/scripts/verify-repository.mjs").includes("validation/validate-room-join-v229115.mjs"), "0 하네스에 검사가 등록돼 있다");
  const appVersion = (read("src/modules/public/site-config.js").match(/const APP_VERSION = "([^"]+)";/) || [])[1] || "";
  eq(read("VERSION.txt").trim(), appVersion, "0 VERSION.txt = APP_VERSION(판 이름 단일 출처)");
  ok(/^V22\.9\.\d+-[A-Z0-9-]+$/.test(appVersion) && parseInt(appVersion.split(".")[2], 10) >= 115, "0 판 번호가 V22.9.115 이상이다");
}

// ── 1~7. 한 방: 첫 호출자(시작) → 소유자, 그 뒤 호출자들 → 구성원 ────────────────
await roomFixture(async (fx) => {
  const householdsBefore = fx.db.households.length;
  // 1. 가계부 없는 방에서 ‘시작’ → 공동 가계부 + 소유자(기록 없음)
  const start = await say(fx, "시작", { user: U.u1, room: ROOM });
  const u1 = userByKey(fx, U.u1);
  const household = roomHouseholds(fx)[0];
  ok(u1?.id && household?.id, "1 ‘시작’ 한 번으로 채팅 계정과 ‘이 방의 공동 가계부’ 가 생긴다(기록 없이)");
  eq(fx.db.households.length, householdsBefore + 1, "1 가계부는 하나만 늘었다");
  eq(roleOf(fx, u1?.id, household?.id), "owner", "1 첫 호출자가 소유자다");
  eq(linkRows(fx).length, 1, "1 방 ↔ 가계부 연결 항목이 하나 생겼다");
  ok(start.text.includes(`이 방 가계부: ${ROOM_HOUSEHOLD_NAME}`) && start.text.includes("첫 호출자인 내가 소유자예요"), `1 ‘시작’ 답이 방 가계부와 소유자를 말한다 (${start.text.split("\n").slice(0, 3).join(" / ")})`);
  ok(start.text.includes("봇을 부르는 참여자는 자동으로 구성원이 돼요"), "1 ‘시작’ 답이 호출만으로 참여함을 말한다");
  eq(fx.db.transactions.filter((row) => row.household_id === household?.id).length, 0, "1 기록은 저장되지 않았다(호출만)");
  ok(start.before <= 34 && start.total <= 44, `1 방 가계부를 만드는 ‘시작’ 의 저장소 호출: 답 전 ${start.before} ≤ 34 · 전체 ${start.total} ≤ 44`);
  fx.measure = { createStart: { before: start.before, total: start.total } };
  // 1-b. 같은 사람이 다시 ‘시작’ → 중복 없음, 추가 호출 적음
  const again = await say(fx, "시작", { user: U.u1, room: ROOM });
  eq(roomHouseholds(fx).length, 1, "1-b 다시 불러도 가계부가 더 생기지 않는다");
  eq(owners(fx, household?.id).length, 1, "1-b 소유자는 한 명이다");
  ok(again.text.includes("내 권한: 소유자") && !again.text.includes("방금"), "1-b 구성원의 ‘시작’ 은 내 권한만 말한다(다시 들이지 않음)");
  ok(again.before <= 12, `1-b 구성원의 ‘시작’ 은 추가 들이기 호출이 없다(답 전 ${again.before} ≤ 12)`);
  fx.measure.memberStart = { before: again.before, total: again.total };

  // 2. 두 번째 사람 ‘도움말’ → 구성원
  const help = await say(fx, "도움말", { user: U.u2, room: ROOM });
  const u2 = userByKey(fx, U.u2);
  eq(roleOf(fx, u2?.id, household?.id), "member", "2 ‘도움말’ 을 부른 사람은 구성원이 된다");
  ok(help.text.includes(`이 방 가계부: ${ROOM_HOUSEHOLD_NAME}`) && help.text.includes("내 권한: 구성원") && help.text.includes("방금 이 방 가계부에 참여했어요"), `2 ‘도움말’ 답이 참여 사실을 말한다 (${help.text.split("\n").slice(0, 3).join(" / ")})`);
  ok(help.before <= 30 && help.total <= 40, `2 연결된 방에 들이는 호출: 답 전 ${help.before} ≤ 30 · 전체 ${help.total} ≤ 40`);
  fx.measure.joinHelp = { before: help.before, total: help.total };

  // 3. 세 번째 사람 ‘웹가계부’ → 구성원 + 단추로 바로 그 방 가계부 홈(V22.9.105)
  const card = await say(fx, "웹가계부", { user: U.u3, room: ROOM });
  const u3 = userByKey(fx, U.u3);
  eq(roleOf(fx, u3?.id, household?.id), "member", "3 ‘웹가계부’ 를 부른 사람은 구성원이 된다");
  eq(card.outputs[0]?.simpleText?.text, `이 방 가계부 ‘${ROOM_HOUSEHOLD_NAME}’에 참여했어요.`, "3 카드 앞에 참여 한 줄");
  const button = card.outputs[1]?.textCard?.buttons?.[0] || {};
  ok(button.action === "webLink" && button.webLinkUrl === `${BASE}/my` && card.outputs[1]?.textCard?.description?.includes("아래 버튼을 누르면 이 방 가계부가 열려요"), "3 카드 글·단추(/my)는 예전 그대로다");
  const opened = await go(fx, tapped("/my", { user: U.u3 }));
  eq(opened.status, 303, "3 단추를 누르면 로그인 화면 없이 넘긴다");
  eq(opened.location, `/app?household_id=${encodeURIComponent(household.id)}`, "3 그 방 가계부 홈(/app)으로 간다(기록 없이 들어온 사람도)");
  const cardAgain = await say(fx, "웹가계부", { user: U.u3, room: ROOM });
  ok(cardAgain.outputs.length === 1 && cardAgain.outputs[0]?.textCard, "3-b 이미 구성원이면 한 줄 없이 카드만");
  const never = await go(fx, tapped("/my", { user: U.u14 }));
  ok(never.status === 303 && !never.location.startsWith("/app"), "3-c 한 번도 부르지 않은 사람의 단추는 예전처럼 방 가계부 홈으로 바로 가지 않는다(no_user)");

  // 4. 설명서(읽기 전용 답)는 답 뒤에 들인다
  const manual = await say(fx, "사용설명서", { user: U.u4, room: ROOM });
  const u4 = userByKey(fx, U.u4);
  eq(roleOf(fx, u4?.id, household?.id), "member", "4 ‘사용설명서’ 를 부른 사람도 답 뒤에 구성원이 된다");
  ok(manual.outputs[0]?.textCard?.title === "말해가계부 도움말" && manual.outputs.length === 1, "4 설명서 답은 예전 그대로(한 줄 없음, 답 뒤 처리)");
  eq(manual.before, 0, "4 설명서 답 전에는 저장소를 부르지 않는다(답을 늦추지 않음)");
  ok(manual.total <= 40, `4 설명서 뒤 들이기 전체 호출 ${manual.total} ≤ 40`);
  fx.measure.manualDeferred = { before: manual.before, total: manual.total };
  const web = await say(fx, "웹관리하기", { user: U.u5, room: ROOM });
  eq(roleOf(fx, userByKey(fx, U.u5)?.id, household?.id), "member", "4-b ‘웹관리하기’(설명서) 를 부른 사람도 구성원이 된다");
  ok(web.outputs.length === 1, "4-b 설명서 답 모양은 그대로");

  // 5. 빈 멘션
  const mention = await say(fx, "", { user: U.u6, room: ROOM });
  eq(roleOf(fx, userByKey(fx, U.u6)?.id, household?.id), "member", "5 봇만 멘션한 사람도 답 뒤에 구성원이 된다");
  eq(mention.before, 0, "5 빈 멘션 답 전에는 저장소를 부르지 않는다");
  ok(mention.outputs.length === 1 && mention.outputs[0]?.textCard, "5 빈 멘션 답은 예전 카드 그대로");

  // 6. 조회 명령 → 들이고 그 명령을 그대로 처리(답 앞 한 줄)
  const summary = await say(fx, "이번 달 요약", { user: U.u7, room: ROOM });
  eq(roleOf(fx, userByKey(fx, U.u7)?.id, household?.id), "member", "6 ‘이번 달 요약’ 을 부른 사람은 구성원이 된다");
  eq(summary.outputs[0]?.simpleText?.text, `이 방 가계부 ‘${ROOM_HOUSEHOLD_NAME}’에 참여했어요.`, "6 답 맨 앞에 참여 한 줄");
  ok(summary.outputs.length === 2 && !summary.text.includes("참여 전") && !summary.text.includes("기록을 한 번 보내면"), `6 그 뒤에 요약 답이 이어진다(‘참여 전’ 안내가 아님) (${summary.text.split("\n")[1] || ""})`);
  const summaryAgain = await say(fx, "이번 달 요약", { user: U.u7, room: ROOM });
  ok(summaryAgain.outputs.length === 1 && !summaryAgain.text.includes("참여했어요"), "6-b 구성원의 같은 명령에는 한 줄이 없다");
  ok(summaryAgain.before <= 12, `6-b 구성원 조회에 들이기 호출이 더해지지 않는다(답 전 ${summaryAgain.before} ≤ 12)`);

  // 7. 확인되지 않은 요청·추정 키는 들이지 않는다
  const membersBefore = fx.db.household_members.length;
  const usersBefore = fx.db.users.length;
  const untrusted = await say(fx, "시작", { user: U.u8, room: ROOM, secret: false });
  eq(fx.db.household_members.length, membersBefore, "7 Secret 없는 요청은 구성원을 만들지 않는다");
  eq(fx.db.users.length, usersBefore, "7 Secret 없는 요청은 채팅 계정도 만들지 않는다");
  ok(!untrusted.text.includes("소유자예요") && !untrusted.text.includes("참여했어요"), `7 확인되지 않은 요청의 답은 들이기를 말하지 않는다 (${untrusted.text.slice(0, 40)})`);
  const inferred = await say(fx, "시작", { user: U.u8, inferredRoom: ROOM_INFERRED });
  eq(roomHouseholds(fx).length, 1, "7-b 명시되지 않은(추정) 방 키로는 가계부를 만들지 않는다");
  ok(!fx.db.household_members.some((row) => String(row.user_id) === String(userByKey(fx, U.u8)?.id || "none")), "7-b 추정 방 키로는 들이지 않는다");
  ok(!inferred.text.includes("첫 호출자인 내가 소유자예요"), "7-b 추정 방 키 답은 소유자를 말하지 않는다");

  // 8. 나간 이력: 웹에서 나간 뒤 다시 부르면 자동으로 들이지 않는다
  const leftU2 = await post(fx, "/my/household/leave", { household_id: household.id, month: "2026-11", understand_history: "1" }, { cookie: await fx.cookieFor(u2.id) });
  ok(leftU2.status === 303 && leftU2.location.includes("msg=household_left") && !roleOf(fx, u2.id, household.id), "8 준비: 구성원이 웹에서 가계부를 나간다");
  const departedStart = await say(fx, "시작", { user: U.u2, room: ROOM });
  ok(!roleOf(fx, u2.id, household.id) && departedStart.text.includes("나간 이력"), `8 나간 사람의 ‘시작’ 은 다시 들이지 않고 나간 이력을 말한다 (${departedStart.text.split("\n").slice(0, 2).join(" / ")})`);
  const departedQuery = await say(fx, "이번 달 요약", { user: U.u2, room: ROOM });
  ok(!roleOf(fx, u2.id, household.id) && departedQuery.text.includes("나간 이력") && !departedQuery.text.includes("참여했어요"), "8 나간 사람의 조회도 들이지 않고 예전 안내다");

  // 9. 승인 대기 → 호출 한 번으로 구성원
  const u9 = addUser(fx, U.u9, "v115-user-9", "대기자");
  fx.db.household_members.push({ household_id: household.id, user_id: u9, role: "pending", created_at: `${DAY}T01:00:00.000Z` });
  const pendingReply = await say(fx, "남은 예산", { user: U.u9, room: ROOM });
  eq(roleOf(fx, u9, household.id), "member", "9 승인 대기인 사람은 호출 한 번으로 구성원이 된다");
  eq(pendingReply.outputs[0]?.simpleText?.text, `이 방 가계부 ‘${ROOM_HOUSEHOLD_NAME}’에 참여했어요.`, "9 답 앞에 참여 한 줄");
  ok(!pendingReply.text.includes("승인"), "9 ‘승인해야’ 류 안내가 없다");

  // 10. 조회 전용·이용 제한은 그대로
  const u10 = addUser(fx, U.u10, "v115-user-10", "열람자");
  fx.db.household_members.push({ household_id: household.id, user_id: u10, role: "viewer", created_at: `${DAY}T01:00:00.000Z` });
  const viewer = await say(fx, "시작", { user: U.u10, room: ROOM });
  eq(roleOf(fx, u10, household.id), "viewer", "10 조회 전용은 바뀌지 않는다");
  ok(viewer.text.includes("내 권한: 조회전용") || viewer.text.includes("내 권한: 조회 전용"), `10 조회 전용의 ‘시작’ 은 내 권한을 그대로 말한다 (${viewer.text.split("\n").slice(0, 2).join(" / ")})`);
  const u11 = addUser(fx, U.u11, "v115-user-11", "제한자");
  fx.db.household_members.push({ household_id: household.id, user_id: u11, role: "blocked", created_at: `${DAY}T01:00:00.000Z` });
  await say(fx, "이번 달 요약", { user: U.u11, room: ROOM });
  eq(roleOf(fx, u11, household.id), "blocked", "10-b 이용 제한은 바뀌지 않는다");
  eq(owners(fx, household.id).length, 1, "10-c 지금까지 소유자는 한 명(U1)이다");

  // ── 11~14. 소유자 양도(웹) ──
  const u3Id = u3.id;
  const ownerCookie = await fx.cookieFor(u1.id);
  const membersPage = await page(fx, `/my/members?household_id=${encodeURIComponent(household.id)}&month=2026-11`, { cookie: ownerCookie });
  eq(membersPage.status, 200, "11 소유자가 참여자 화면을 연다");
  const transferForms = membersPage.html.split('action="/my/household/transfer-owner"').length - 1;
  const memberCount = fx.db.household_members.filter((row) => row.household_id === household.id && ["admin", "member"].includes(row.role)).length;
  eq(transferForms, memberCount, "11 소유자 화면의 ‘소유자 양도’ 단추 수 = 관리자·구성원 수(소유자 자신·승인 대기·조회 전용·이용 제한 제외)");
  ok(membersPage.html.includes(`name="user_id" value="${u3Id}"/><input type="hidden" name="month" value="2026-11"/><button class="transferButton" type="submit">소유자 양도</button>`), "11 구성원 카드에 양도 단추가 있다");
  ok(membersPage.html.includes("소유자는 다른 참여자에게 소유자를 양도할 수 있습니다") && membersPage.html.includes("봇을 부르거나 거래를 보낸 사람이 승인 없이 구성원이 됩니다"), "11 화면 안내가 양도와 호출 참여를 말한다");

  const notOwner = await post(fx, "/my/household/transfer-owner", { household_id: household.id, user_id: u4.id, month: "2026-11" }, { cookie: await fx.cookieFor(u3Id) });
  ok(notOwner.status === 303 && notOwner.location.includes("err=owner_transfer_not_owner"), "12 구성원은 양도할 수 없다");
  eq(owners(fx, household.id).join(","), String(u1.id), "12 역할이 바뀌지 않았다");
  const self = await post(fx, "/my/household/transfer-owner", { household_id: household.id, user_id: u1.id, month: "2026-11" }, { cookie: ownerCookie });
  ok(self.status === 303 && self.location.includes("err=owner_transfer_self"), "12-b 나에게는 양도할 수 없다");
  const blocked = await post(fx, "/my/household/transfer-owner", { household_id: household.id, user_id: u11, month: "2026-11" }, { cookie: ownerCookie });
  ok(blocked.status === 303 && blocked.location.includes("err=owner_transfer_target_invalid") && roleOf(fx, u11, household.id) === "blocked" && roleOf(fx, u1.id, household.id) === "owner", "12-c 이용 제한인 사람에게는 양도할 수 없다(역할 그대로)");
  const stranger = await post(fx, "/my/household/transfer-owner", { household_id: household.id, user_id: "no-such-user", month: "2026-11" }, { cookie: ownerCookie });
  ok(stranger.status === 303 && stranger.location.includes("err=owner_transfer_target_invalid"), "12-d 참여자가 아닌 사람에게는 양도할 수 없다");

  const transferred = await post(fx, "/my/household/transfer-owner", { household_id: household.id, user_id: u3Id, month: "2026-11" }, { cookie: ownerCookie });
  ok(transferred.status === 303 && transferred.location === `/my/members?household_id=${encodeURIComponent(household.id)}&month=2026-11&msg=owner_transferred`, `13 소유자가 구성원에게 양도한다 (${transferred.location})`);
  eq(roleOf(fx, u3Id, household.id), "owner", "13 대상이 소유자가 됐다");
  eq(roleOf(fx, u1.id, household.id), "admin", "13 전 소유자는 관리자가 됐다");
  eq(owners(fx, household.id).length, 1, "13 소유자는 한 명이다");
  ok(events("owner_transferred").length === 1 && events("owner_transfer_partial").length === 0, "13 운영 이벤트 owner_transferred 한 건");
  ok(linkRows(fx).length === 1 && JSON.parse(linkRows(fx)[0].value).linked_by === String(u1.id), "13 단톡방 연결 항목의 linked_by(표시용 이력)는 바꾸지 않는다");
  const adminPage = await page(fx, `/my/members?household_id=${encodeURIComponent(household.id)}&month=2026-11`, { cookie: ownerCookie });
  ok(adminPage.status === 200 && !adminPage.html.includes('action="/my/household/transfer-owner"') && adminPage.html.includes(householdPageMessage("owner_transferred").slice(0, 10)) === false, "13-b 관리자가 된 전 소유자의 화면에는 양도 단추가 없다");
  const adminTries = await post(fx, "/my/household/transfer-owner", { household_id: household.id, user_id: u4.id, month: "2026-11" }, { cookie: ownerCookie });
  ok(adminTries.status === 303 && adminTries.location.includes("err=owner_transfer_not_owner") && roleOf(fx, u3Id, household.id) === "owner", "13-c 관리자는 양도할 수 없다");
  const newOwnerPage = await page(fx, `/my/members?household_id=${encodeURIComponent(household.id)}&month=2026-11&msg=owner_transferred`, { cookie: await fx.cookieFor(u3Id) });
  ok(newOwnerPage.status === 200 && newOwnerPage.html.includes(householdPageMessage("owner_transferred")) && newOwnerPage.html.includes('action="/my/household/transfer-owner"'), "13-d 새 소유자 화면에 안내 글과 양도 단추가 있다");

  // 14. 부분 실패(두 번째 PATCH 만 실패) → 소유자 둘 + 안내 → 다시 누르면 복구
  const newOwnerCookie = await fx.cookieFor(u3Id);
  const restore = intercept(async ({ url, method }) => method === "PATCH" && url.pathname.endsWith("/household_members") && url.searchParams.get("user_id") === `eq.${u3Id}` && url.searchParams.get("role") === "eq.owner" ? failure(503, "demote failed") : null);
  let partial;
  try { partial = await post(fx, "/my/household/transfer-owner", { household_id: household.id, user_id: u4.id, month: "2026-11" }, { cookie: newOwnerCookie }); }
  finally { restore(); }
  ok(partial.status === 303 && partial.location.includes("err=owner_transfer_partial"), `14 내 권한 내리기만 실패하면 부분 실패로 알린다 (${partial.location})`);
  eq(owners(fx, household.id).sort().join(","), [String(u3Id), String(u4.id)].sort().join(","), "14 그때는 소유자가 둘이다(대상은 올라갔다)");
  ok(householdPageMessage("owner_transfer_partial").includes("한 번 더 누르면"), "14 안내가 다시 누르라고 말한다");
  const recovered = await post(fx, "/my/household/transfer-owner", { household_id: household.id, user_id: u4.id, month: "2026-11" }, { cookie: newOwnerCookie });
  ok(recovered.status === 303 && recovered.location.includes("msg=owner_transferred"), "14-b 같은 대상에게 다시 누르면 성공한다");
  eq(roleOf(fx, u3Id, household.id), "admin", "14-b 나는 관리자로 내려갔다");
  eq(owners(fx, household.id).join(","), String(u4.id), "14-b 소유자는 대상 한 명이다");
  ok(events("owner_transferred").at(-1)?.detail === "recovered_partial_transfer", "14-b 복구 양도는 운영 이벤트에 그렇게 적힌다");

  // 15. 양도 뒤 나가기: 전 소유자(관리자)는 나갈 수 있고, 소유자는 안내를 받는다
  const leftU1 = await post(fx, "/my/household/leave", { household_id: household.id, month: "2026-11", understand_history: "1" }, { cookie: ownerCookie });
  ok(leftU1.status === 303 && leftU1.location.includes("msg=household_left") && !roleOf(fx, u1.id, household.id), "15 양도한 전 소유자는 가계부를 나갈 수 있다");
  const ownerLeave = await post(fx, "/my/household/leave", { household_id: household.id, month: "2026-11", understand_history: "1" }, { cookie: await fx.cookieFor(u4.id) });
  ok(ownerLeave.status === 303 && ownerLeave.location.includes("err=household_leave_owner_blocked") && roleOf(fx, u4.id, household.id) === "owner", "15-b 소유자는 나갈 수 없다(양도 안내)");
  // 16. 새 소유자는 카카오에서도 소유자다(별도 읽기 없이 권한 줄)
  const newOwnerStart = await say(fx, "시작", { user: U.u4, room: ROOM });
  ok(newOwnerStart.text.includes("내 권한: 소유자"), `16 양도받은 사람의 ‘시작’ 은 소유자라고 말한다 (${newOwnerStart.text.split("\n").slice(0, 2).join(" / ")})`);
  console.log("measure", JSON.stringify(fx.measure));
});

// ── 17. 해제된 방은 호출로 다시 만들지 않는다 ─────────────────────────────────
await roomFixture(async (fx) => {
  const keys = await kakaoGroupFirstKeys(ROOM_RETIRED);
  putSetting(fx, keys.retired, JSON.stringify({ version: 1, group_hash: keys.hash }));
  const before = fx.db.households.length;
  const reply = await say(fx, "시작", { user: U.u12, room: ROOM_RETIRED });
  eq(fx.db.households.length, before, "17 해제·삭제된 방은 ‘시작’ 으로 다시 만들지 않는다");
  ok(reply.text.includes("해제되어") && !reply.text.includes("소유자예요"), `17 해제된 방 안내 그대로 (${reply.text.split("\n").slice(0, 2).join(" / ")})`);
  const query = await say(fx, "이번 달 요약", { user: U.u12, room: ROOM_RETIRED });
  eq(fx.db.households.length, before, "17-b 조회로도 다시 만들지 않는다");
  ok(!query.text.includes("참여했어요"), "17-b 참여 한 줄이 없다");
});

// ── 18. 기록 경로는 그대로(첫 기록 → 가계부 + 소유자 + 저장) ─────────────────────
await roomFixture(async (fx) => {
  const before = fx.db.transactions.length;
  const saved = await say(fx, "점심 12000원", { user: U.u13, room: ROOM_RECORD });
  const u13 = userByKey(fx, U.u13);
  const household = roomHouseholds(fx)[0];
  ok(household?.id && roleOf(fx, u13?.id, household.id) === "owner", "18 첫 기록은 예전처럼 가계부를 만들고 소유자가 된다");
  eq(fx.db.transactions.length, before + 1, "18 기록이 저장된다");
  ok(saved.text.includes("공동 가계부를 준비했어요") && saved.text.includes("첫 호출자인 내가 소유자예요") && saved.text.includes("양도할 수 있어요"), `18 첫 기록 안내가 소유자와 양도를 말한다 (${saved.text.split("\n").slice(0, 3).join(" / ")})`);
  const second = await say(fx, "커피 4500원", { user: U.u15, room: ROOM_RECORD });
  eq(roleOf(fx, userByKey(fx, U.u15)?.id, household.id), "member", "18-b 두 번째 사람의 기록도 예전처럼 구성원 + 저장");
  eq(fx.db.transactions.length, before + 2, "18-b 두 번째 기록도 저장된다");
  ok(second.text.includes("참여했어요") && second.text.includes("저장했어요"), "18-b 기록 답은 예전 그대로다");
  ok(!second.outputs[0]?.simpleText?.text?.startsWith("이 방 가계부 ‘") || second.outputs.length === 1, "18-b 기록 경로는 래퍼의 한 줄을 쓰지 않는다(자기 답에 들어 있음)");
});

const checks = t.done();
if (checks < 90) throw new Error(`검사 수가 너무 적다: ${checks}`);

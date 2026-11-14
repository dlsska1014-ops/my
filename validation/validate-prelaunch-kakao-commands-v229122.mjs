// V22.9.122 출시 전 점검(2026-11-14) 카카오 명령 고침 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 2026-11-14 출시 전 점검(review-artifacts/prelaunch-sweep-2026-11-14)이 찾은 카카오 명령 결함을 실제 /skill 요청(개인 대화·단톡방)과 저장된 행으로 본다.
// T-2: ‘지난달 예산 현황’·‘12월 예산 현황’이 늘 이번 달로 답했다(1월 1일에 12월 예산이 있어도 ‘아직 예산이 없어요’). 이제 예산 설정 명령과 같은 달 읽기로 물은 달을 보여 준다.
// AZ-1: ‘초대코드 HOME2265’가 참여가 아니라 초대코드 보기로 읽혀 보낸 사람 자기 가계부의 초대코드를 보여 줬다(가계부 없는 방이면 방 전체에). 이제 ‘참여 HOME2265’와 같은 참여다.
// 가짜는 픽스처 DB 와 고정 시계(globalThis.__AB_QA_FIXED_NOW_MS)뿐이다. 오늘 날짜·컴퓨터 시간대와 상관없이(TZ=UTC 포함) 같은 결과여야 한다.
//
// ── 실행 ──
//   node validation/validate-prelaunch-kakao-commands-v229122.mjs
//   AB_QA_CATEGORIES_ABSENT=1 node validation/validate-prelaunch-kakao-commands-v229122.mjs
import { app, BASE, counter, fixture } from "./lib-audit-v22934.mjs";

const t = counter("prelaunch kakao command fixes");
const SECRET = "prelaunch-kakao-v229122";
const ROOM = "7".repeat(64);
const OWNER = "kakao_login:2265"; // user-bin, house-home 소유자(초대코드 HOME2265)

function resetIsolateState() {
  for (const name of ["__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE"]) globalThis[name]?.clear?.();
}

// 한국 시각 ymd hm 으로 시계를 고정하고 task 를 돌린 뒤 되돌린다.
async function at(ymd, hm, task) {
  const previous = globalThis.__AB_QA_FIXED_NOW_MS;
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(`${ymd}T${hm}:00+09:00`);
  try { return await task(); } finally { globalThis.__AB_QA_FIXED_NOW_MS = previous; }
}

function payloadFor(utterance, { user, room = "" }) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}
const textOf = (body) => (body?.template?.outputs || []).map((output) => output.simpleText?.text || [output.textCard?.title, output.textCard?.description].filter(Boolean).join("\n") || "").join("\n");

// Secret 으로 확인된 /skill 요청 한 번. 답 뒤 일(waitUntil)도 끝까지 기다린다.
async function say(fx, utterance, { user = OWNER, room = "" } = {}) {
  resetIsolateState();
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify(payloadFor(utterance, { user, room })) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const body = JSON.parse(await response.text());
  for (let round = 0; round < 6 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  return { status: response.status, body, text: textOf(body) };
}

const SELECT_KEY = "kakao_selected_household_v2251:user-bin";
// 개인 대화(room 없음)는 house-home 을 선택 가계부로, 단톡방은 소유자가 ‘단톡방 연결 HOME2265’로 연결해 둔다.
async function prepareChannel(fx, room) {
  fx.env.KAKAO_SKILL_SECRET = SECRET;
  if (room) {
    const linked = await say(fx, "단톡방 연결 HOME2265", { room });
    t.ok(/연결/.test(linked.text), `단톡방 연결 준비: ${linked.text.slice(0, 80)}`);
  } else {
    fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== SELECT_KEY);
    fx.db.accountbook_settings.push({ id: "v122-select", key: SELECT_KEY, value: "house-home", created_at: "2026-11-01T00:00:00.000Z" });
  }
}
const paths = [["개인 대화", ""], ["단톡방", ROOM]];
const noUrl = (text) => !/https?:\/\//i.test(text);

// ── T-2: 예산 현황의 달 말 ──
// 12월: 식비 예산 300,000원, 지출 30,000 + 12,000 = 42,000원. 1월: 예산 없음, 지출 7,000원.
function seedBudgetMonths(fx) {
  fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== "house-home");
  fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((row) => row.household_id !== "house-home");
  const tx = (id, date, amount) => ({ id, household_id: "house-home", user_id: "user-bin", transaction_date: date, type: "expense", amount, category: "식비", memo: `점검 ${date}`, payment_method: "", source: "web", raw_text: "", created_at: "2026-11-01T00:00:00.000Z" });
  fx.db.transactions.push(tx("v122-dec-1", "2026-12-05", 30000), tx("v122-dec-2", "2026-12-20", 12000), tx("v122-jan-1", "2027-01-02", 7000));
  fx.db.accountbook_budgets.push({ id: "v122-dec-food", household_id: "house-home", month: "2026-12", category: "식비", amount: 300000, created_at: "2026-12-01T00:00:00.000Z" });
}
async function budgetReply(ymd, hm, utterance, room) {
  return at(ymd, hm, () => fixture(async (fx) => {
    seedBudgetMonths(fx);
    await prepareChannel(fx, room);
    const before = JSON.stringify(fx.db.accountbook_budgets);
    const reply = await say(fx, utterance, { room });
    return { ...reply, budgetsUnchanged: JSON.stringify(fx.db.accountbook_budgets) === before };
  }));
}

for (const [label, room] of paths) {
  // 1월 1일에 묻는 ‘12월’·‘지난달’ = 2026년 12월(가장 가까운 해). 예전에는 2027-01 ‘아직 예산이 없어요’.
  for (const utterance of ["12월 예산 현황", "지난달 예산 현황", "12월 남은 예산"]) {
    const reply = await budgetReply("2027-01-01", "12:00", utterance, room);
    t.ok(reply.text.startsWith("💰 2026-12 예산 현황"), `T-2 ${label} ‘${utterance}’(2027-01-01)는 2026-12 를 보여 준다: ${reply.text.slice(0, 60)}`);
    t.ok(reply.text.includes("전체 예산: 300,000원") && reply.text.includes("사용 금액: 42,000원"), `T-2 ${label} ‘${utterance}’ 숫자도 12월 것이다`);
    t.ok(!reply.text.includes("2027-01") && !reply.text.includes("아직 예산이 없어요"), `T-2 ${label} ‘${utterance}’에 1월 머리줄·예산 없음 안내가 없다`);
    t.ok(reply.budgetsUnchanged && noUrl(reply.text), `T-2 ${label} ‘${utterance}’ 는 예산을 바꾸지 않고 답 글에 주소가 없다`);
  }
  // 12월 31일 밤에 묻는 ‘1월’·12월 15일의 ‘다음 달’ = 2027년 1월(예산 없음). ‘이번 달 지출’이 아니라 그 달을 적는다.
  for (const [ymd, hm, utterance] of [["2026-12-31", "23:55", "1월 예산 현황"], ["2026-12-15", "12:00", "다음 달 예산 현황"]]) {
    const reply = await budgetReply(ymd, hm, utterance, room);
    t.ok(reply.text.startsWith("💰 2027-01 예산 현황"), `T-2 ${label} ‘${utterance}’(${ymd})는 2027-01 을 보여 준다: ${reply.text.slice(0, 60)}`);
    t.ok(reply.text.includes("아직 예산이 없어요.") && reply.text.includes("2027-01 지출: 7,000원") && !reply.text.includes("이번 달 지출"), `T-2 ${label} ‘${utterance}’ 지출 줄은 그 달(2027-01) 이름으로 적는다: ${reply.text.replace(/\n/g, " ").slice(0, 160)}`);
  }
  // 달 말이 없거나 읽지 못하면(‘13월’) 예전처럼 이번 달이고 머리줄이 그 달을 밝힌다.
  for (const utterance of ["예산 현황", "남은 예산", "이번 달 예산 현황", "13월 예산 현황"]) {
    const reply = await budgetReply("2027-01-01", "12:00", utterance, room);
    t.ok(reply.text.startsWith("💰 2027-01 예산 현황") && reply.text.includes("이번 달 지출: 7,000원"), `T-2 ${label} ‘${utterance}’는 이번 달(2027-01) 그대로: ${reply.text.replace(/\n/g, " ").slice(0, 120)}`);
  }
}

// 예산 설정과 예산 현황이 같은 달을 읽는다(1월 1일 ‘12월 식비 예산 23만원’ → 2026-12 저장 → ‘12월 예산 현황’ 이 그 값을 보여 준다).
for (const [label, room] of paths) {
  await at("2027-01-01", "12:00", () => fixture(async (fx) => {
    seedBudgetMonths(fx);
    await prepareChannel(fx, room);
    const saved = await say(fx, "12월 식비 예산 23만원", { room });
    const row = fx.db.accountbook_budgets.find((item) => item.household_id === "house-home" && item.category === "식비" && Number(item.amount) === 230000);
    t.ok(row?.month === "2026-12" && saved.text.includes("2026-12 식비 예산을 설정했어요"), `T-2 ${label} 1월 1일 ‘12월 식비 예산 23만원’은 2026-12 에 저장(설정 명령의 달 읽기): ${saved.text.slice(0, 60)}`);
    const status = await say(fx, "12월 예산 현황", { room });
    t.ok(status.text.startsWith("💰 2026-12 예산 현황") && status.text.includes("전체 예산: 230,000원"), `T-2 ${label} 이어서 ‘12월 예산 현황’은 방금 저장한 2026-12 예산을 보여 준다: ${status.text.replace(/\n/g, " ").slice(0, 120)}`);
  }));
}

// ── AZ-1: ‘초대코드 CODE’는 그 코드로 참여(‘참여 CODE’와 같은 길) ──
// 예전에는 초대코드 보기로 읽혀 보낸 사람 자기 가계부의 이름·초대코드를 보여 줬다(가계부 없는 방이면 방 전체에). 참여는 일어나지 않았다.
const OUTSIDER = "kakao_login:3001";
const NEW_ROOM = "8".repeat(64); // 가계부가 연결되지 않은 방
function seedOutsider(fx) {
  fx.env.KAKAO_SKILL_SECRET = SECRET;
  fx.db.users.push({ id: "user-out", kakao_user_key: OUTSIDER, nickname: "바깥사람", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.households.push({ id: "house-out", name: "바깥 가계부", invite_code: "OUTS3001", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: "house-out", user_id: "user-out", role: "owner", created_at: "2026-07-01T00:00:00.000Z" });
}
const roleIn = (fx, userId, householdId) => fx.db.household_members.filter((row) => row.user_id === userId && row.household_id === householdId).map((row) => row.role).join(",");
const roomLinks = (fx) => fx.db.accountbook_settings.filter((row) => String(row.key).startsWith("kakao_group_link")).length;
async function outsiderSays(utterance, room) {
  return at("2026-11-14", "12:00", () => fixture(async (fx) => {
    seedOutsider(fx);
    const households = fx.db.households.length;
    const links = roomLinks(fx);
    const tx = fx.db.transactions.length;
    const reply = await say(fx, utterance, { user: OUTSIDER, room });
    return { ...reply, role: roleIn(fx, "user-out", "house-home"), householdsAdded: fx.db.households.length - households, linksAdded: roomLinks(fx) - links, txAdded: fx.db.transactions.length - tx };
  }));
}
for (const [label, room] of [["개인 대화", ""], ["가계부 없는 단톡방", NEW_ROOM]]) {
  const reference = await outsiderSays("참여 HOME2265", room);
  t.ok(reference.role === "pending" && reference.text.includes("승인 대기"), `AZ-1 기준: ${label} ‘참여 HOME2265’는 승인 대기 참여다: ${reference.text.slice(0, 60)}`);
  for (const utterance of ["초대코드 HOME2265", "참여코드 HOME2265", "초대 코드 HOME2265", "초대코드 home2265"]) {
    const reply = await outsiderSays(utterance, room);
    t.ok(reply.role === "pending", `AZ-1 ${label} ‘${utterance}’는 우리집 생활비에 승인 대기로 참여한다(승인 규칙 그대로, 실제 ${reply.role || "없음"})`);
    t.ok(reply.text === reference.text, `AZ-1 ${label} ‘${utterance}’ 답은 ‘참여 HOME2265’와 같다: ${reply.text.replace(/\n/g, " ").slice(0, 120)}`);
    t.ok(!reply.text.includes("OUTS3001") && !reply.text.includes("바깥 가계부"), `AZ-1 ${label} ‘${utterance}’에 보낸 사람 자기 가계부 이름·초대코드가 나오지 않는다`);
    t.ok(reply.householdsAdded === 0 && reply.linksAdded === 0 && reply.txAdded === 0, `AZ-1 ${label} ‘${utterance}’는 가계부·방 연결·기록을 새로 만들지 않는다`);
  }
  const unknown = await outsiderSays("초대코드 NOPE99", room);
  t.ok(unknown.text.startsWith("초대코드 NOPE99를 찾지 못했어요") && unknown.role === "" && unknown.householdsAdded === 0, `AZ-1 ${label} 없는 코드는 ‘찾지 못했어요’이고 아무것도 바꾸지 않는다: ${unknown.text.slice(0, 50)}`);
}
// 코드 없는 ‘초대코드’·‘초대코드 보여줘’는 예전처럼 초대코드 보기다(가계부 없는 방에서는 자기 가계부를 이 방에 연결하려는 사람일 수 있어 그대로 둔다).
for (const utterance of ["초대코드", "초대코드 보여줘"]) {
  const reply = await outsiderSays(utterance, NEW_ROOM);
  t.ok(reply.text.includes("초대코드: OUTS3001") && reply.role === "", `AZ-1 가계부 없는 방 ‘${utterance}’는 예전처럼 자기 초대코드 보기(참여 아님): ${reply.text.replace(/\n/g, " ").slice(0, 70)}`);
  const direct = await outsiderSays(utterance, "");
  t.ok(direct.text.includes("초대코드를 확인할 가계부") && direct.role === "", `AZ-1 개인 대화 ‘${utterance}’도 예전처럼 보기(가계부 고르기): ${direct.text.replace(/\n/g, " ").slice(0, 70)}`);
}
// 이미 구성원인 사람(소유자)의 개인 대화 ‘초대코드 HOME2265’도 ‘참여 HOME2265’와 같은 답이고 역할은 그대로다.
for (const utterance of ["참여 HOME2265", "초대코드 HOME2265"]) {
  await at("2026-11-14", "12:00", () => fixture(async (fx) => {
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    const reply = await say(fx, utterance);
    t.ok(reply.text.startsWith("✅ ‘우리집 생활비’ 가계부에 참여했어요.") && roleIn(fx, "user-bin", "house-home") === "owner", `AZ-1 소유자 개인 대화 ‘${utterance}’는 참여 확인 답이고 역할은 owner 그대로: ${reply.text.replace(/\n/g, " ").slice(0, 70)}`);
  }));
}

t.done();

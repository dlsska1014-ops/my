#!/usr/bin/env node
// V22.9.120 통합 수정 검사: V22.9.119 ‘같은 날 같은 문장’ 거절 답이 내놓는 다시 보낼 예시(같은 문장 끝 ‘두 번째’ · 날짜 수정 · 별도 구매 추가)는
// 파서 확인(한 건·같은 날짜·금액·구분)에 더해 V22.9.120 저장 직전 안전망도 통과할 때만 보이고, 걸리면 예시 없이 사실만 답한다
// (그대로 보내면 저장된다는 V22.9.119 약속을 안전망이 생긴 뒤에도 지킨다). 오프라인 픽스처, 바깥 요청 0.
//  1. 함수: 세 답이 안전망에 걸리는 예시는 내지 않고(파서 확인은 통과하는 예시 — 막은 것이 안전망임을 함께 본다), 평범한 예시는 그대로 낸다
//  2. 함수: 안전망 판정의 기준 날짜는 넘긴 ‘그 요청의 오늘’이다(같은 시계·같은 원문이라도 오늘이 다르면 앞날 N일 판정이 따라 바뀐다, 없으면 지금 날짜)
//  3. 장면(1:1·단톡방): 메모에 ‘몇 월 며칠’·‘며칠 전에’ 가 남은 기록의 날짜 수정이 같은 문장에 걸리면 사실 두 줄만, 기록 그대로
//  4. 장면(1:1·단톡방): 평범한 예시 ‘커피 4500 두 번째’(같은 문장)·‘11월 10일 버스 1500원 두 번째’(날짜 수정)는 그대로 나오고 그대로 보내면 저장된다
//  5. 소스: skill-handler 가 안전망 판정한 오늘을 요청에 남기고, 세 답의 호출 지점이 그 날을 넘긴다
import { readFileSync } from "node:fs";
import { app, BASE, counter, withClock } from "./lib-audit-v22934.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { kakaoEditSameTextTextV229119, kakaoSameTextExistsTextV229119, kakaoSeparateSameTextTextV229119 } from "../src/modules/kakao/response-builders.js";
import { kakaoRecordGuardV229120 } from "../src/modules/kakao/request-guards.js";
import { parseMultipleTransactions } from "../src/modules/nlu/transaction-parser.js";

const c = counter("V22.9.120 통합 수정: 거절 답의 예시는 안전망도 통과할 때만(같은 문장·날짜 수정·별도 구매)");
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const DAY = "2026-11-12";
const SECRET = "validate-kakao-guard-examples-secret";
const clearGuards = () => { globalThis.__AB_KAKAO_REPEAT_GUARD?.clear(); globalThis.__AB_KAKAO_INFLIGHT?.clear(); };
const kind = (value) => (value === "income" ? "income" : "expense");
const parseOne = (text) => { const rows = parseMultipleTransactions(text, {}); return Array.isArray(rows) && !rows.blocked && rows.length === 1 ? rows[0] : null; };
// V22.9.119 의 파서 확인만으로는 이 예시가 나왔을 것인가(같은 날짜·금액·구분 한 건)
const parsesAs = (example, item) => { const one = parseOne(example); return !!one && String(one.transaction_date) === String(item.transaction_date) && Number(one.amount) === Number(item.amount) && kind(one.type) === kind(item.type); };
const guardOf = (text, today) => kakaoRecordGuardV229120(text, parseMultipleTransactions(text, {}), today);
const exampleIn = (text) => (String(text).match(/‘([^’]*번째)’/) || [])[1] || "";

const dayLine = (date = DAY) => (date === DAY ? "오늘 같은 문장으로 저장한 기록이 이미 있어요." : `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 기록 중에 같은 문장으로 저장한 기록이 이미 있어요.`);
const SAME = (word, example = "", date = DAY) => ["이번 내용은 저장하지 않았어요.", dayLine(date), `같은 ${word}이 한 번 더 있었다면 문장 끝에 낱말을 하나 덧붙여 다시 보내 주세요.${example ? ` 예: ‘${example}’` : ""}`].join("\n");
const SEPARATE = (example = "") => ["별도 구매를 추가하지 않았어요. 새 기록은 저장하지 않았어요.", "같은 날 같은 문장은 한 번 더 저장되지 않아요.", `서로 다른 구매라면 ‘별도 구매 추가’ 없이 문장 끝에 낱말을 하나 덧붙여 보내 주세요.${example ? ` 예: ‘${example}’` : ""}`].join("\n");
const EDIT_DATE = (day, word = "지출", example = "") => ["01번 기록을 바꾸지 않았어요. 기록은 그대로예요.", `${day} 기록 중에 같은 문장·같은 금액으로 저장한 기록이 이미 있어서 바꿀 수 없어요.`, ...(example ? [`서로 다른 ${word}이라면 이 기록을 지우고 이 문장으로 다시 보내 주세요: ‘${example}’`] : [])].join("\n");

// ── 1·2. 함수 ──
await withClock(DAY, async () => {
  // 같은 문장·별도 구매: 안전망 전 판(V22.9.119 까지)에 저장된 원문은 지금 안전망이 막는 꼴일 수 있다(‘별도 구매 추가 <원문>’ 은 안전망을 거치지 않는다).
  const blocked = [
    ["중고차 계약금 500 냄 나머지는 담주에", "date"],
    ["지난주 금욜 택시 12000", "date"],
    ["다음 달에 냉장고 120만원 살 예정", "plan"],
    ["25일 미용실 3만원", "future"],
  ];
  for (const [raw, guardKind] of blocked) {
    const one = parseOne(raw);
    const item = { transaction_date: one?.transaction_date, type: one?.type, amount: one?.amount, raw_text: raw, existing: true };
    const example = `${raw} 두 번째`;
    c.ok(!!one && parsesAs(example, item), `1 ‘${example}’ 는 파서 확인(한 건·같은 날짜·금액·구분)을 통과한다 — V22.9.119 라면 예시로 나왔다`);
    c.eq(guardOf(example, DAY)?.kind, guardKind, `1 ‘${example}’ 는 안전망이 ${guardKind} 로 되묻는다`);
    c.eq(kakaoSameTextExistsTextV229119([item], 1, [], { today: DAY }), SAME(kind(item.type) === "income" ? "수입" : "지출", "", item.transaction_date), `1 같은 문장 거절 답: ‘${raw}’ 는 예시 없이 사실과 방법만`);
    c.eq(kakaoSeparateSameTextTextV229119(item, { today: DAY }), SEPARATE(), `1 별도 구매 거절 답: ‘${raw}’ 는 예시 없이`);
  }
  const plain = { transaction_date: DAY, type: "expense", amount: 4500, raw_text: "커피 4500", existing: true };
  c.eq(kakaoSameTextExistsTextV229119([plain], 1, [], { today: DAY }), SAME("지출", "커피 4500 두 번째"), "1 평범한 같은 문장 거절 답의 예시 ‘커피 4500 두 번째’ 는 그대로");
  c.eq(kakaoSeparateSameTextTextV229119(plain, { today: DAY }), SEPARATE("커피 4500 두 번째"), "1 별도 구매 거절 답의 예시도 그대로");
  c.eq(kakaoSameTextExistsTextV229119([plain], 1, []), SAME("지출", "커피 4500 두 번째"), "1 오늘을 넘기지 않으면 지금 날짜로 판정(예전 호출 모양 그대로 동작)");
  // 날짜 수정: 메모로 만든 예시(기록 칸 + 옮길 날짜 + ‘두 번째’)
  for (const [memo, amount, type, guardKind] of [["몇 월 며칠인지도 모르고 사는 요즘ㅋㅋ 다이소", 7000, "expense", "question"], ["안 한 실비 청구 며칠 전에 해놨더니 벌써 들어왔네요 보험금", 58000, "income", "date"]]) {
    const row = { transaction_date: DAY, type, amount, memo };
    const word = type === "income" ? "수입" : "지출";
    const candidates = type === "income" ? [`11월 11일 ${memo} ${amount}원 두 번째`, `11월 11일 ${memo} ${amount}원 받음 두 번째`] : [`11월 11일 ${memo} ${amount}원 두 번째`];
    const offered = candidates.filter((example) => parsesAs(example, { transaction_date: "2026-11-11", amount, type }));
    c.ok(offered.length >= 1 && offered.every((example) => guardOf(example, DAY)?.kind === guardKind), `1 날짜 수정 예시 ${JSON.stringify(offered)} 는 파서 확인을 통과하지만 안전망(${guardKind})에 걸린다`);
    c.eq(kakaoEditSameTextTextV229119("01", row, { transaction_date: "2026-11-11" }, { today: DAY }), EDIT_DATE("11월 11일", word), `1 날짜 수정 거절 답: 메모 ‘${memo.slice(0, 12)}…’ 는 사실 두 줄만`);
  }
  c.eq(kakaoEditSameTextTextV229119("01", { transaction_date: DAY, type: "expense", amount: 1500, memo: "버스" }, { transaction_date: "2026-11-10" }, { today: DAY }), EDIT_DATE("11월 10일", "지출", "11월 10일 버스 1500원 두 번째"), "1 평범한 날짜 수정 예시 ‘11월 10일 버스 1500원 두 번째’ 는 그대로");
});
// 2. 기준 날짜: 시계 11월 26일에 ‘25일 미용실 3만원’(11월 25일 기록)의 같은 문장 예시 — 넘긴 오늘이 26일이면 지난 날이라 예시, 24일이면 앞날이라 안전망이 막아 예시 없음
await withClock("2026-11-26", async () => {
  const item = { transaction_date: "2026-11-25", type: "expense", amount: 30000, raw_text: "25일 미용실 3만원", existing: true };
  c.ok(parsesAs("25일 미용실 3만원 두 번째", item), "2 시계 11월 26일: ‘25일 미용실 3만원 두 번째’ 는 11월 25일 30,000원 한 건으로 읽힌다");
  c.eq(exampleIn(kakaoSameTextExistsTextV229119([item], 1, [], { today: "2026-11-26" })), "25일 미용실 3만원 두 번째", "2 넘긴 오늘 = 11월 26일 → 25일은 지난 날, 예시를 낸다");
  c.eq(exampleIn(kakaoSameTextExistsTextV229119([item], 1, [], { today: "2026-11-24" })), "", "2 넘긴 오늘 = 11월 24일 → 25일은 앞날(안전망 future), 같은 시계여도 예시 없음");
  c.eq(exampleIn(kakaoSeparateSameTextTextV229119(item, { today: "2026-11-24" })), "", "2 별도 구매 답도 넘긴 오늘을 쓴다");
  c.eq(exampleIn(kakaoSameTextExistsTextV229119([item], 1, [])), "25일 미용실 3만원 두 번째", "2 오늘을 넘기지 않으면 지금 날짜(11월 26일)");
});

// ── 3·4. 장면 ──
async function withFx(task) {
  const fx = await createV2265QaFixture();
  Object.assign(fx.env, { SKILL_RATE_LIMIT: "100000", KAKAO_SKILL_SECRET: SECRET, KAKAO_SKILL_AUTH_REQUIRED: "1" });
  fx.db.__honor_select = true;
  fx.db.__kakao_request_unique = true;
  const fixtureFetch = globalThis.fetch;
  const external = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "mock.supabase.co") { external.push(url.hostname); throw new Error(`external request blocked: ${url.hostname}`); }
    return fixtureFetch(input, init);
  };
  try { return await task(fx); }
  finally { clearGuards(); globalThis.fetch = fixtureFetch; fx.restore?.(); c.eq(external.join(","), "", "바깥 요청 0"); }
}
async function say(fx, utterance, { key, room = "" }) {
  clearGuards();
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "블록" }, utterance, lang: "kr", user: { id: key, type: "botUserKey", properties: { botUserKey: key, ...(room ? { botGroupKey: room } : {}) } }, ...(room ? { chat: { id: room, type: "groupChat", properties: { botGroupKey: room } } } : {}) };
  const body = { intent: { id: "i1", name: "블록" }, userRequest, bot: { id: "bot1", name: "말해가계부" }, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify(body) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  for (let done = 0; done < jobs.length;) { const batch = jobs.slice(done); done = jobs.length; await Promise.allSettled(batch); }
  let json = null;
  try { json = JSON.parse(raw); } catch (_) {}
  return json ? (json.template?.outputs || []).map((o) => o?.simpleText?.text || o?.textCard?.description || o?.textCard?.title || "").join("\n") : raw;
}
const rowsOf = (fx, key) => fx.db.transactions.filter((t) => t.source === "kakao_skill" && t.source_user_key === key);
const dates = (fx, key) => rowsOf(fx, key).map((t) => t.transaction_date).sort().join(",");
const moveAll = (fx, key, date, days) => { for (const t of rowsOf(fx, key)) { t.transaction_date = date; t.created_at = new Date(Date.now() - days * 86400000).toISOString(); } };
const PATHS = [["1:1", ""], ["단톡방", "room-guard-examples"]];

await withClock(DAY, async () => {
  // 3. 멈춘 두 문장: 메모에 안전망이 막는 말이 남은 기록의 날짜 수정
  const STOPPED = [
    ["몇 월 며칠인지도 모르고 사는 요즘ㅋㅋ 다이소 7000", "question"],
    ["작년에 깜빡하고 안 한 실비 청구 며칠 전에 해놨더니 오늘 벌써 들어왔네요 보험금 58000원", "date"],
  ];
  for (const [name, room] of PATHS) for (const [sentence, guardKind] of STOPPED) await withFx(async (fx) => {
    const key = `guard-example-${room ? "room" : "direct"}-${guardKind}`;
    const first = await say(fx, sentence, { key, room });
    const row = rowsOf(fx, key)[0];
    c.ok(rowsOf(fx, key).length === 1 && /저장했어요/.test(first), `3 ${name} ‘${sentence.slice(0, 16)}…’ 는 이 판에서 저장된다(안전망 통과)`);
    moveAll(fx, key, "2026-11-11", 1);
    await say(fx, sentence, { key, room });
    c.eq(dates(fx, key), "2026-11-11,2026-11-12", `3 ${name} 다른 날의 같은 문장은 저장된다`);
    const word = row?.type === "income" ? "수입" : "지출";
    const v119 = [`11월 11일 ${row?.memo} ${Number(row?.amount)}원 두 번째`, ...(row?.type === "income" ? [`11월 11일 ${row?.memo} ${Number(row?.amount)}원 받음 두 번째`] : [])]
      .find((example) => example.length <= 60 && parsesAs(example, { transaction_date: "2026-11-11", amount: row?.amount, type: row?.type })) || "";
    c.ok(!!v119 && guardOf(v119, DAY)?.kind === guardKind, `3 ${name} 저장된 기록 칸(메모 ‘${String(row?.memo).slice(0, 12)}…’)으로 만든 V22.9.119 예시 ‘${v119.slice(0, 24)}…’ 는 파서 확인을 통과하고 안전망(${guardKind})에 걸린다`);
    const refused = await say(fx, "수정 01번 날짜 어제", { key, room });
    c.eq(refused, EDIT_DATE("11월 11일", word), `3 ${name} 날짜 수정이 같은 문장에 걸리면 예시 없이 사실 두 줄만(V22.9.119: 안전망에 걸리는 예시를 보내라고 했다)`);
    c.eq(dates(fx, key), "2026-11-11,2026-11-12", `3 ${name} 기록은 그대로`);
  });

  // 4. 평범한 예시는 그대로 나오고, 그대로 보내면 저장된다
  for (const [name, room] of PATHS) await withFx(async (fx) => {
    const key = `guard-example-${room ? "room" : "direct"}-coffee`;
    await say(fx, "커피 4500", { key, room });
    for (const t of rowsOf(fx, key)) t.created_at = new Date(Date.now() - 121000).toISOString();
    const again = await say(fx, "커피 4500", { key, room });
    c.eq(again, SAME("지출", "커피 4500 두 번째"), `4 ${name} 같은 문장 거절 답에 예시 ‘커피 4500 두 번째’`);
    const follow = await say(fx, "커피 4500 두 번째", { key, room });
    const saved = rowsOf(fx, key).find((t) => t.raw_text === "커피 4500 두 번째");
    c.ok(/지출 저장했어요/.test(follow) && saved?.transaction_date === DAY && Number(saved?.amount) === 4500 && saved?.type === "expense", `4 ${name} 그 예시를 그대로 보내면 오늘 4,500원 지출로 저장`);
  });
  for (const [name, room] of PATHS) await withFx(async (fx) => {
    const key = `guard-example-${room ? "room" : "direct"}-bus`;
    await say(fx, "어제 버스 1500", { key, room });
    moveAll(fx, key, "2026-11-10", 2);
    await say(fx, "어제 버스 1500", { key, room });
    c.eq(dates(fx, key), "2026-11-10,2026-11-11", `4 ${name} 준비: 11월 10일·11일에 같은 문장 기록`);
    const refused = await say(fx, "11월 11일 수정 01번 날짜 11월 10일", { key, room });
    c.eq(refused, EDIT_DATE("11월 10일", "지출", "11월 10일 버스 1500원 두 번째"), `4 ${name} 날짜 수정 거절 답에 예시 ‘11월 10일 버스 1500원 두 번째’`);
    const follow = await say(fx, "11월 10일 버스 1500원 두 번째", { key, room });
    const saved = rowsOf(fx, key).find((t) => t.raw_text === "11월 10일 버스 1500원 두 번째");
    c.ok(/지출 저장했어요/.test(follow) && saved?.transaction_date === "2026-11-10" && Number(saved?.amount) === 1500 && saved?.type === "expense", `4 ${name} 그 예시를 그대로 보내면 11월 10일 1,500원 지출로 저장`);
  });
});

// ── 5. 소스 ──
{
  const handler = read("../src/modules/kakao/skill-handler.js");
  const builders = read("../src/modules/kakao/response-builders.js");
  c.ok(handler.includes("const guardTodayV229120 = formatDate(nowKstDate());") && handler.includes("env.__AB_KAKAO_REQUEST.todayV229120 = guardTodayV229120;")
    && handler.includes("kakaoRecordGuardV229120(utterance, preParsedList, guardTodayV229120)"), "5 skill-handler 는 안전망을 판정한 오늘을 그 요청에 남긴다(같은 날로 판정)");
  for (const [file, call] of [["transaction-save.js", "kakaoSameTextExistsTextV229119("], ["edit-flow-v4.js", "kakaoEditSameTextTextV229119("], ["separate-purchase.js", "kakaoSeparateSameTextTextV229119("]]) {
    const source = read(`../src/modules/kakao/${file}`);
    const at = source.indexOf(call);
    c.ok(at > 0 && source.slice(at, source.indexOf("\n", at)).includes("today: env?.__AB_KAKAO_REQUEST?.todayV229120"), `5 ${file} 의 거절 답은 요청의 오늘을 넘긴다`);
  }
  c.ok(/function kakaoExampleParsesAsV229119\(example = "", item = \{\}, today = ""\)[\s\S]{0,700}!kakaoRecordGuardV229120\(example, parsed, /.test(builders), "5 예시 확인(kakaoExampleParsesAsV229119)은 파서 확인 뒤 안전망을 본다");
  // 서로 가져오는 두 모듈은 모듈을 읽을 때(최상위) 서로의 값을 쓰지 않는다 — 최상위 줄에 상대 모듈의 이름이 없다.
  const guards = read("../src/modules/kakao/request-guards.js");
  const topLevel = (source) => source.split("\n").filter((line) => /^(?:const|let|var)\s/.test(line));
  c.ok(!topLevel(builders).some((line) => /kakaoRecordGuardV229120|formatDate|nowKstDate/.test(line)) && !topLevel(guards).some((line) => /\bkakaoText\b/.test(line)), "5 response-builders ↔ request-guards: 최상위에서 서로의 값을 쓰지 않는다");
}

c.done();

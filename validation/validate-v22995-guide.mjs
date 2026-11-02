#!/usr/bin/env node
// V22.9.95 안내·해석 검사(영역 3) — 번들(src/index.js)·QA 픽스처·가짜 브라우저로 본다. DB·네트워크 없음.
//   R-14 안내: /kakao-guide 의 표 10줄이 카카오 1:1·단톡방에서 보낸 실제 결과와 같다. 봇 ‘기록방법’ 카드 두 줄. 되묻는 답(금액을 못 읽음·외화)에
//              ‘입력 예시 보기’ 링크 버튼(글에는 주소 없음). /quick-input-help 낡은 문구 0·지금 동작. 공지 띠 NOTICE_TEXT·NOTICE_LINK(있을 때만).
//              /menu ‘도움말과 안내’ 의 ‘문의·FAQ’ 줄.
//   R-16 분류 예외 4개(운동화·충전기·참기름/들기름·버스킹)의 전·후. 보이지 않는 글자(폭 0 글자 지우기, 전각 라틴·숫자·공백만 반각).
//   R-20 외화 금액 되묻기: 카카오 직접·방, 웹 빠른 입력. 옛(73d2f48)·새 해석 대조 — 의도한 문장 외 차이 0.
//   R-19 가져오기: 2만 칸 공백 칸·4만 자 숫자 칸이 50 ms 안에 끝나고 결과는 예전과 같다.
// 옛 번들은 git 기록(73d2f48)이 있을 때만 임시 폴더로 꺼내 따로(자식 프로세스) 돌린다(저장소 안에 두지 않는다). 없으면(CI 얕은 클론) 아래
// 내장 해시로 대조한다. 검사 수는 두 경우가 같다.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import vm from "node:vm";
import { parseExpressionAt } from "../tools/vendor/acorn.mjs";
import { app, BASE, ctx, fixture, page, withClock } from "./lib-audit-v22934.mjs";
import { createInputBrowser } from "./lib-lucian-a-browser.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { parseFlexibleImportRecords, parseMultipleTransactions, parseTransaction } from "../src/index.js";
import { foreignCurrencyAmountIn, inferInputCategory, normalizeInputText } from "../src/modules/client/shared-input-nlu.js";

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
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BASE_COMMIT = "73d2f48"; // 운영 V22.9.94 = main
const GUIDE_URL = "https://malhaebook.com/kakao-guide";
const FOREIGN_TEXT = "외화 금액은 원화로 바꿔 적어 주세요";
const sha = (text) => createHash("sha256").update(text).digest("hex");

// ── 카카오 요청(1:1 직접·단톡방) ─────────────────────────────────────────
const clearGuards = () => { for (const name of ["__AB_SKILL_RATE_BUCKETS", "__AB_TRAFFIC_BUCKETS", "__AB_KAKAO_REPEAT_GUARD", "__AB_KAKAO_INFLIGHT"]) globalThis[name]?.clear(); };
async function kakao(fx, utterance, room) {
  const key = room ? "room-owner-v22995" : "kakao_login:2265";
  const user = { id: key, type: "botUserKey", properties: { botUserKey: key } };
  const headers = { "content-type": "application/json" };
  let body;
  if (room) {
    headers["x-kakao-skill-secret"] = fx.env.KAKAO_SKILL_SECRET;
    body = { bot: { id: "667e5382f2b2f84cb555091c", name: "말해가계부" }, intent: { id: "synthetic-fallback", name: "폴백 블록" }, userRequest: { utterance, user, chat: { id: "room-v22995", type: "botGroupKey", properties: { botGroupKey: "room-v22995" } } } };
  } else {
    const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "블록" }, utterance, lang: "kr", user };
    body = { intent: { id: "i1", name: "블록" }, userRequest, bot: { id: "bot1", name: "말해가계부" }, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
  }
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers, body: JSON.stringify(body) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await Promise.allSettled(jobs);
  return response.json();
}
const walk = (node, visit) => { if (Array.isArray(node)) node.forEach((item) => walk(item, visit)); else if (node && typeof node === "object") { visit(node); Object.values(node).forEach((item) => walk(item, visit)); } };
const replyTexts = (data) => { const out = []; walk(data?.template?.outputs || [], (node) => { for (const key of ["text", "description", "title"]) if (typeof node[key] === "string") out.push(node[key]); }); return out; };
const replyButtons = (data) => { const out = []; walk(data?.template || {}, (node) => { if (typeof node.action === "string" && typeof node.label === "string") out.push(node); }); return out; };
const exampleButton = (result) => result.buttons.some((b) => b.label === "입력 예시 보기" && b.action === "webLink" && b.webLinkUrl === GUIDE_URL);
const noUrlInText = (result) => result.texts.every((text) => !/https?:\/\//i.test(text));
const keyOf = (row) => row.id ?? row;
const liveRow = (row) => !row.deleted_at && !row.is_deleted;
// 한 장면: 새 픽스처 + 앞 준비 말(직접: ‘오늘기록’·‘2’, 방: 첫 기록 ‘주차 3000’) + setup 말 뒤에 utterances 를 보낸다.
async function scene(room, utterances, setup = []) {
  return withClock("2026-07-15", async () => {
    const fx = await createV2265QaFixture();
    const savedFetch = globalThis.fetch;
    try {
      fx.env.SKILL_RATE_LIMIT = 10000;
      if (room) fx.env.KAKAO_SKILL_SECRET = "validate-v22995-secret";
      for (const text of [...(room ? ["주차 3000"] : ["오늘기록", "2"]), ...setup]) { clearGuards(); await kakao(fx, text, room); }
      const before = new Map(fx.db.transactions.filter(liveRow).map((row) => [keyOf(row), row.amount]));
      let data = null;
      for (const text of utterances) { clearGuards(); data = await kakao(fx, text, room); }
      const after = fx.db.transactions.filter(liveRow);
      const afterKeys = new Set(after.map(keyOf));
      const texts = replyTexts(data);
      return {
        rows: after.filter((row) => !before.has(keyOf(row))),
        removed: [...before.keys()].filter((key) => !afterKeys.has(key)),
        changed: after.filter((row) => before.has(keyOf(row)) && before.get(keyOf(row)) !== row.amount),
        texts, text: texts.join("\n"), buttons: replyButtons(data),
      };
    } finally { globalThis.fetch = savedFetch; fx.restore(); }
  });
}
const PATHS = [["직접", false], ["방", true]];

// ── 자산에서 클라이언트 함수 꺼내기(옛 v22993 은 AB_HISTORICAL_RUNTIME_ASSETS 에서 내려간다) ─────
const assetText = async (path) => {
  const response = await app.fetch(new Request(`${BASE}${path}`), {}, ctx);
  if (response.status !== 200) throw new Error(`${path} ${response.status}`);
  return response.text();
};
const fromAsset = (source, name) => {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`자산에 ${name} 이 없다`);
  const node = parseExpressionAt(source, start, { ecmaVersion: "latest" });
  return source.slice(node.start, node.end);
};
const WEB_FNS = ["quickAmountFieldState", "moneyTokenSpans", "quickAmountCount", "explicitDateIntent", "quickInputDate", "parseMobileAmountText", "transactionTypeFromText", "normalizeInputText", "foldInputWidth", "joinSpacedKoreanAmount", "inputPaymentPatterns"];
const homeOld = await assetText("/assets/mobile-home-v22993.js");
const homeNew = await assetText("/assets/mobile-home-v22995.js");
function webFunctions(source) {
  const context = vm.createContext({});
  vm.runInContext(WEB_FNS.map((name) => fromAsset(source, name)).join("\n") + "\n;globalThis.__fns={normalizeInputText,quickAmountCount,parseMobileAmountText};", context);
  return context.__fns;
}
const quickPage = () => {
  const browser = createInputBrowser();
  const submit = browser.element("button", { class: "quickSubmit", type: "submit" }, browser.form);
  browser.run([...WEB_FNS, "foreignCurrencyAmountIn"].map((name) => fromAsset(homeNew, name)).join("\n"));
  browser.run(`const state=(${fromAsset(homeNew, "quickSmartInputController")})({amount:parseMobileAmountText,date:quickInputDate,type:text=>transactionTypeFromText(text,[]),category:()=>"",payment:()=>"",memo:(text,token)=>text.replace(token,"").trim()});`);
  const type = (text, enter = false) => { browser.smart.value = text; browser.run(`state.apply(${enter})`); };
  return { browser, submit, type, after: () => String(browser.fields.after.textContent || "") };
};
const rulesFrom = (source) => { const context = vm.createContext({ window: {} }); try { vm.runInContext(source, context); } catch (_) { /* 규칙 대입 뒤의 화면 코드는 여기서 필요 없다 */ } return context.window.AB_CATEGORY_RULES; };

// ── 문장 모음(옛·새 대조) ───────────────────────────────────────────────
const CURRENCY = ["커피 $100", "커피 $ 100", "커피 100$", "커피 100 $", "US$ 5 커피", "커피 US$5", "€3 젤라또", "젤라또 3€", "£12 기념품", "기념품 12 £",
  "¥1000 라멘", "라멘 1000¥", "USD 100 커피", "커피 100usd", "커피 100 USD", "EUR 25 택시", "택시 25 eur", "JPY 3000 편의점", "편의점 3000jpy", "CNY 50 간식",
  "간식 50 CNY", "GBP 8 커피", "커피 8gbp", "어제 커피 $4.5", "점심 $12 카드", "숙소 $120, 택시 $15", "호텔 1박 200 USD", "면세점 $59.99", "환전 수수료 USD 3", "커피 ＄100"];
// 외화 표시처럼 보이지만 숫자에 붙지 않았거나 다른 낱말인 문장(되묻지 않는다). ‘5달러’ 같은 한글 통화 이름은 이번 규칙 밖이다.
const NOT_FOREIGN = ["커피 4500", "₩5000 커피", "커피 5000￦", "USB 10000", "EURO 2024 티켓 30000", "ABCUSD 100", "100 used", "커피 4500 (USDA 인증)", "커피 $ 사이즈 업 500", "커피 4,500원 $", "커피 5달러", "아이폰 케이스 15000"];
function corpus() {
  const memos = ["점심", "커피", "택시", "버스", "지하철", "주유", "편의점", "마트 장보기", "월급", "용돈", "병원", "약국", "관리비", "전기요금", "통신비",
    "헬스", "운동", "책", "영화", "선물", "카페 라떼", "배달 치킨", "교통카드 충전", "휴대폰 요금", "보험료", "적금", "이자", "환불", "중고거래 판매", "월세"];
  const amounts = ["4500", "12000", "12,000", "12000원", "1.5만", "3만원", "만원", "2천원", "100", "300", "15000원", "1,234,567", "5천", "3만 5천원", "8000원"];
  const dates = ["", "어제 ", "오늘 ", "3일 ", "7월 3일 ", "지난주 금요일 "];
  const tails = ["", " 카드", " 현금", " 신한카드", " 이체"];
  const out = [];
  memos.forEach((memo, i) => amounts.forEach((amount, j) => dates.forEach((date, k) => out.push(`${date}${memo} ${amount}${tails[(i + j + k) % tails.length]}`))));
  memos.forEach((memo, i) => out.push(`${memo} ${amounts[i % amounts.length]}, ${memos[(i + 7) % memos.length]} ${amounts[(i + 3) % amounts.length]}`));
  for (let i = 0; i < 10; i += 1) out.push(`${i + 1}일 ${memos[i]} ${amounts[i]}\n${i + 2}일 ${memos[i + 10]} ${amounts[i + 1]}`);
  for (const sym of ["!", "#", "~", "(", ")", "[", "]", "*", "+", "=", "/", ":", ";", "?", "^", "_", "|", "@", "&", "%"]) out.push(`커피${sym} 4500`, `점심 ${sym}12000`, `택시 8000${sym}`);
  out.push("점심 12000원", "커피 4500, 택시 8000", "어제 병원 15000", "신한카드 1234 결제 5000", "예산 식비 300000", "월급 300", "3일 커피 4000\n5일 택시 8000",
    "@말해가계부 커피 4500", "커피 4000 5000", "점심 만이천원", "회비 12.000원", "월세 1.200.000원", "7.3 커피 4000", "커피 4,500원!", "[카드] 커피 4500", "(점심) 12000",
    "운동화 89000", "충전기 25000", "참기름 12000", "들기름 15000", "버스킹 5000", "커피 4​500", "ＫＴＸ 59800", "커피　4500");
  return [...out, ...CURRENCY, ...NOT_FOREIGN];
}
const INTENDED = /[​-‍⁠﻿　！-～]|운동화|충전기|참기름|들기름|버스킹/;
// 옛 번들(73d2f48) 의 parseMultipleTransactions 출력 해시(의도한 차이 문장을 뺀 모음, 장면 시계 2026-07-15). 해석기를 일부러 바꾸면 새로 적는다.
const OLD_PARSER_DIGEST = "33ff7496e7a157067248edd8dd5459fb8007235c0672fc8ea0b25bf5bca17f56";
const parserLine = (text, value) => `${JSON.stringify(text)}\t${JSON.stringify(value)}`;
function oldParserLines(sentences) {
  let dir = "";
  try {
    const source = execFileSync("git", ["show", `${BASE_COMMIT}:src/index.js`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    dir = mkdtempSync(join(tmpdir(), "v22995-guide-"));
    writeFileSync(join(dir, "index.old.js"), source);
    writeFileSync(join(dir, "sentences.json"), JSON.stringify(sentences));
    writeFileSync(join(dir, "run.mjs"), [
      `import { readFileSync, writeFileSync } from "node:fs";`,
      `const { parseMultipleTransactions } = await import(${JSON.stringify(pathToFileURL(join(dir, "index.old.js")).href)});`,
      `globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-07-15T12:00:00+09:00");`,
      `const list = JSON.parse(readFileSync(${JSON.stringify(join(dir, "sentences.json"))}, "utf8"));`,
      `const out = list.map((text) => { try { return parseMultipleTransactions(text, {}); } catch (error) { return "ERR " + error.message; } });`,
      `writeFileSync(${JSON.stringify(join(dir, "out.json"))}, JSON.stringify(out));`,
    ].join("\n"));
    execFileSync(process.execPath, [join(dir, "run.mjs")], { stdio: ["ignore", "ignore", "pipe"] });
    const values = JSON.parse(readFileSync(join(dir, "out.json"), "utf8"));
    return sentences.map((text, i) => parserLine(text, values[i]));
  } catch (_) { return null; } finally { if (dir) rmSync(dir, { recursive: true, force: true }); }
}

// ── R-14: /kakao-guide 표 10줄 = 실제 결과 ─────────────────────────────────
const TABLE = [
  ["점심 12000원", "지출 12,000원 1건(외식)", (r) => r.rows.length === 1 && r.rows[0].amount === 12000 && r.rows[0].type === "expense" && r.rows[0].category === "외식"],
  ["커피 4500, 택시 8000", "지출 2건(4,500원·8,000원)", (r) => r.rows.length === 2 && r.rows.map((row) => row.amount).join(",") === "4500,8000" && r.rows.every((row) => row.type === "expense")],
  ["어제 병원 15000", "어제 날짜로 15,000원 1건", (r) => r.rows.length === 1 && r.rows[0].amount === 15000 && r.rows[0].transaction_date === "2026-07-14"],
  ["신한카드 1234 결제 5000", "5,000원 1건, 결제수단 신한카드", (r) => r.rows.length === 1 && r.rows[0].amount === 5000 && r.rows[0].payment_method === "신한카드"],
  ["수정 01번 금액 13000", "오늘 01번 기록의 금액을 13,000원으로 고쳐요", (r) => r.rows.length === 0 && r.removed.length === 0 && r.changed.length === 1 && r.changed[0].amount === 13000, ["주차 3000"]],
  ["방금 거 지워줘", "가장 최근 기록을 지워요", (r) => r.rows.length === 0 && r.removed.length === 1 && r.text.includes("복구"), ["주차 3000"]],
  ["예산 식비 300000", "이번 달 식비 예산 300,000원 설정(기록 아님)", (r) => r.rows.length === 0 && r.removed.length === 0 && r.changed.length === 0 && r.text.includes("식비 예산")],
  ["커피 $100", "저장하지 않고 다시 물어요", (r) => r.rows.length === 0 && r.text.includes(FOREIGN_TEXT) && exampleButton(r) && noUrlInText(r)],
  ["월급 300", "수입 300원으로 저장돼요", (r) => r.rows.length === 1 && r.rows[0].amount === 300 && r.rows[0].type === "income"],
  ["3일 커피 4000\n5일 택시 8000", "두 건 모두 3일로 저장돼요(택시 내용은 ‘5일 택시’)", (r) => r.rows.length === 2 && r.rows.every((row) => row.transaction_date === "2026-07-03") && r.rows[1].memo === "5일 택시"],
];
await section("R-14 /kakao-guide 표", async () => {
  const response = await app.fetch(new Request(`${BASE}/kakao-guide`), {}, ctx);
  const html = await response.text();
  eq(response.status, 200, "R-14 /kakao-guide 가 열린다");
  ok(html.includes("잘 읽히는 문장과 다시 묻는 말") && html.includes("보내는 문장과 실제 결과"), "R-14 /kakao-guide 에 ‘잘 읽히는 문장과 다시 묻는 말’ 절과 표 제목이 있다");
  for (const [sentence, result] of TABLE) ok(html.includes(sentence.replace("\n", " ⏎ ")) && html.includes(result), `R-14 표에 ‘${sentence.replace("\n", " ⏎ ")}’ → ‘${result}’ 줄이 있다`);
  const tableAt = html.indexOf("보내는 문장과 실제 결과");
  const added = tableAt < 0 ? "" : html.slice(tableAt, html.indexOf("</table>", tableAt));
  ok(added.length > 500 && !/계좌|\d{2,3}-\d{3,4}-\d{4}|@[a-z0-9.-]+\.[a-z]{2,}/i.test(added), "R-14 새 절에 계좌·전화번호·메일 같은 개인 정보가 없다");
  for (const [label, room] of PATHS) for (const [sentence, , expected, setup] of TABLE) {
    const result = await scene(room, [sentence], setup || []);
    ok(expected(result), `R-14 ${label} ‘${sentence.replace("\n", "⏎")}’ 의 실제 결과가 표와 같다 — 새 기록 ${show(result.rows.map((row) => [row.amount, row.type, row.category, row.memo, row.transaction_date, row.payment_method]))} · 지움 ${result.removed.length} · 고침 ${result.changed.length} · 답 ${result.text.slice(0, 120)}`);
  }
});

// ── R-14: 기록방법 카드 두 줄·되묻는 답의 ‘입력 예시 보기’ ─────────────────────────
await section("R-14 카드·되묻기 버튼", async () => {
  const { kakaoInputExampleText } = await import("../src/modules/kakao/reply-texts.js");
  const example = String(kakaoInputExampleText());
  ok(example.includes("여러 건은 쉼표로 나눠 적어요") && example.includes("금액 뒤에 ‘원’ 을 붙이면 더 정확해요"), "R-14 입력 예시 글에 두 줄이 있다");
  for (const [label, room] of PATHS) {
    // ‘기록방법’·‘입력 예시’ 같은 말은 버튼형 사용 설명서 카드(manual-guides ‘기록하는 법’)가 먼저 받는다. 그 카드는 V22.9.65·76 검사가 설명 4줄 이하를
    // 지켜(지금 4줄) 두 줄을 넣지 않았다 — 위 입력 예시 글(kakaoInputExampleText)에만 있다. 카드에 넣을지는 사용자 결정으로 남긴다.
    const noMatch = await scene(room, ["커피"]);
    ok(noMatch.rows.length === 0 && exampleButton(noMatch) && noUrlInText(noMatch), `R-14 ${label} 금액을 못 읽은 ‘커피’ 의 되묻는 답에 ‘입력 예시 보기’ 링크 버튼이 있고 글에는 주소가 없다: ${noMatch.text.slice(0, 120)}`);
    const saved = await scene(room, ["점심 12000원"]);
    ok(saved.rows.length === 1 && !saved.buttons.some((b) => b.label === "입력 예시 보기"), `R-14 ${label} 저장된 답에는 ‘입력 예시 보기’ 를 붙이지 않는다`);
  }
});

// ── R-20: 외화 금액 되묻기(카카오 직접·방) ───────────────────────────────────
await section("R-20 카카오 외화 되묻기", async () => {
  eq(CURRENCY.length, 30, "R-20 통화 문장은 30개다");
  for (const text of CURRENCY) ok(foreignCurrencyAmountIn(text), `R-20 ‘${text}’ 은 외화 금액이다`);
  for (const text of NOT_FOREIGN) ok(!foreignCurrencyAmountIn(text), `R-20 ‘${text}’ 은 외화 금액으로 보지 않는다`);
  for (const [label, room] of PATHS) for (const text of CURRENCY) {
    const result = await scene(room, [text]);
    ok(result.rows.length === 0 && result.text.includes(FOREIGN_TEXT) && result.text.includes("커피 130000원") && exampleButton(result) && noUrlInText(result),
      `R-20 ${label} ‘${text}’ 은 저장하지 않고 원화로 적어 달라고 되묻는다(버튼 ‘입력 예시 보기’, 글에 주소 없음): 새 기록 ${result.rows.length} · ${result.text.slice(0, 100)}`);
  }
  for (const [label, room] of PATHS) for (const [text, amount] of [["₩5000 커피", 5000], ["커피 5000￦", 5000]]) {
    const result = await scene(room, [text]);
    ok(result.rows.length === 1 && result.rows[0].amount === amount && !result.text.includes(FOREIGN_TEXT), `R-20 ${label} ‘${text}’ 은 예전처럼 원화 ${amount}원으로 저장한다`);
  }
});

// ── R-20: 웹 빠른 입력 ─────────────────────────────────────────────────────
await section("R-20 웹 빠른 입력", async () => {
  for (const text of ["커피 $100", "USD 100 커피", "커피 100 EUR", "커피 ＄100"]) {
    const { browser, submit, type, after } = quickPage();
    type(text);
    ok(after().includes(FOREIGN_TEXT) && browser.fields.amountInput.value === "" && submit.disabled === true && browser.fire(browser.form, "submit") === false,
      `R-20 웹 ‘${text}’ 은 금액을 채우지 않고 원화로 적으라고 안내하며 저장되지 않는다: ${after().slice(0, 80)} · 금액 ‘${browser.fields.amountInput.value}’`);
  }
  for (const [manual, blocked] of [[{}, true], [{ amount: "1" }, false]]) {
    const { browser, submit, after } = quickPage();
    browser.element("input", { id: "rawTextInput", type: "hidden", name: "raw_text" }, browser.form).value = "커피 $100";
    browser.fields.amountInput.value = "130,000";
    browser.fields.memoInput.value = "커피";
    browser.fire(browser.form, "ab:quick-restore", { detail: { manual } });
    eq([after().includes(FOREIGN_TEXT), submit.disabled], [blocked, blocked], `R-20 웹 임시저장에서 되살린 ‘커피 $100’(금액 칸 ${JSON.stringify(manual)}) — 금액 칸을 손으로 채웠으면 막지 않는다`);
  }
  const { browser, submit, type, after } = quickPage();
  type("커피 4500");
  ok(!after().includes(FOREIGN_TEXT) && browser.fields.amountInput.value === "4,500" && submit.disabled === false, "R-20 웹 ‘커피 4500’ 은 예전처럼 4,500 을 채운다");
});

// ── /quick-input-help: 낡은 문구 0·지금 동작 ───────────────────────────────
await section("R-14 /quick-input-help", async () => {
  await fixture(async (fx) => {
    const result = await page(fx, "/quick-input-help");
    const html = String(result?.html ?? "");
    ok(html.includes("한 줄에 한 건씩 적으면 됩니다"), "R-14 /quick-input-help 가 로그인 뒤 열린다");
    ok(!html.includes("V20.2") && !html.includes("날짜 묶음 여러 줄 입력"), "R-14 /quick-input-help 에 ‘V20.2 기준’·‘날짜 묶음 여러 줄 입력’ 이 없다");
    for (const words of ["금액이 둘 이상이에요", FOREIGN_TEXT, "300원으로 채워요", "href=\"/kakao-guide\""]) ok(html.includes(words), `R-14 /quick-input-help 에 ‘${words}’ 가 있다`);
  });
  // 안내에 적은 웹 결과를 가짜 브라우저로 확인한다.
  for (const [text, amount, warned] of [["점심 12000 국민카드", "12,000", false], ["어제 병원 15000", "15,000", false], ["월급 250만원", "2,500,000", false], ["월급 300", "300", false], ["커피 4500, 택시 8000", "", true], ["신한카드 1234 결제 5000", "", true]]) {
    const { browser, submit, type, after } = quickPage();
    type(text);
    const shown = after().includes("금액이 둘 이상이에요");
    ok(shown === warned && submit.disabled === warned && (warned || browser.fields.amountInput.value === amount), `R-14 웹 ‘${text}’ → ${warned ? "‘금액이 둘 이상이에요’" : `금액 ${amount}`} (실제 금액 ‘${browser.fields.amountInput.value}’, 안내 ‘${after().slice(0, 60)}’)`);
  }
  const { browser, type } = quickPage();
  type("어제 병원 15000");
  // 가짜 브라우저의 오늘은 날짜 칸 기본값 2026-07-15 다.
  eq(browser.fields.txDate.value, "2026-07-14", "R-14 웹 ‘어제 병원 15000’ 은 날짜를 어제로 채운다");
});

// ── 공지 띠·문의 메뉴 ──────────────────────────────────────────────────────
const bandOf = (html) => { const start = html.indexOf('<div class="abNoticeBand"'); return start < 0 ? "" : html.slice(start, html.indexOf("</div>", start) + 6); };
const lum = (hex) => { const v = hex.slice(1).match(/../g).map((h) => parseInt(h, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
await section("공지 띠", async () => {
  await fixture(async (fx) => {
    const pub = async (path) => (await app.fetch(new Request(`${BASE}${path}`), fx.env, ctx)).text();
    const pages = async () => ({ app: String((await page(fx, "/app"))?.html ?? ""), settings: String((await page(fx, "/my/settings"))?.html ?? ""), guide: await pub("/kakao-guide"), faq: await pub("/faq") });
    delete fx.env.NOTICE_TEXT; delete fx.env.NOTICE_LINK;
    const off = await pages();
    ok(Object.values(off).every((html) => html.length > 1000 && !html.includes("abNoticeBand")), "공지 NOTICE_TEXT 가 없으면 띠도 스타일도 그리지 않는다(/app·/my/settings·/kakao-guide·/faq)");
    fx.env.NOTICE_TEXT = "  11월 13일 02:00~03:00 점검이 있어요 <b>꼭</b> & 확인  ";
    fx.env.NOTICE_LINK = "/faq";
    const on = await pages();
    for (const [name, html] of Object.entries(on)) {
      const band = bandOf(html);
      ok(band.startsWith('<div class="abNoticeBand" role="status">') && band.includes("11월 13일 02:00~03:00 점검이 있어요 &lt;b&gt;꼭&lt;/b&gt; &amp; 확인") && band.includes('<a href="/faq">자세히</a>') && !band.includes("<b>"),
        `공지 ${name} 에 role="status" 띠·글(이스케이프)·‘자세히’ 링크가 있다: ${band.slice(0, 160)}`);
      const body = html.indexOf("<body"), at = html.indexOf('<div class="abNoticeBand"');
      ok(at > body && html.split('class="abNoticeBand"').length === 2 && ["<main", "<header", "pubHeader"].every((mark) => html.indexOf(mark, body) < 0 || at < html.indexOf(mark, body)), `공지 ${name} 의 띠는 본문 맨 위에 한 번만 있다`);
    }
    const styleAt = on.guide.indexOf('<style id="abNoticeBandStyle">');
    const style = on.guide.slice(styleAt, on.guide.indexOf("</style>", styleAt));
    const light = style.match(/\.abNoticeBand\{[^}]*background:(#[0-9a-f]{6});color:(#[0-9a-f]{6})/i), dark = style.match(/dark"\] \.abNoticeBand\{background:(#[0-9a-f]{6});color:(#[0-9a-f]{6})/i);
    ok(light && dark && contrast(light[1], light[2]) >= 4.5 && contrast(dark[1], dark[2]) >= 4.5 && /dark"\] \.abNoticeBand a\{color:#[0-9a-f]{6}\}/i.test(style),
      `공지 띠 글자 대비가 밝은·어두운(앱 설정 다크) 모두 4.5 이상이다: ${light && contrast(light[1], light[2]).toFixed(2)} · ${dark && contrast(dark[1], dark[2]).toFixed(2)}`);
    for (const [link, href] of [["https://malhaebook.com/notice", "https://malhaebook.com/notice"], ["javascript:alert(1)", ""], ["//evil.example/x", ""], ['https://malhaebook.com/x"onmouseover="1', ""]]) {
      fx.env.NOTICE_LINK = link;
      const band = bandOf(await pub("/kakao-guide"));
      ok(band.includes("점검이 있어요") && (href ? band.includes(`<a href="${href}">자세히</a>`) : !band.includes("<a")), `공지 NOTICE_LINK ‘${link}’ → ${href ? "링크" : "링크 없이 글만"}`);
    }
    fx.env.NOTICE_TEXT = "   ";
    ok(!(await pub("/kakao-guide")).includes("abNoticeBand"), "공지 빈칸뿐인 NOTICE_TEXT 는 그리지 않는다");
    fx.env.NOTICE_TEXT = "점검 안내";
    const health = await app.fetch(new Request(`${BASE}/health`), fx.env, ctx);
    const asset = await app.fetch(new Request(`${BASE}/assets/mobile-home-v22995.js`), fx.env, ctx);
    ok(!String(health.headers.get("content-type")).includes("text/html") && !(await health.text()).includes("abNoticeBand") && !(await asset.text()).includes("abNoticeBand"), "공지 HTML 이 아닌 답(/health·자산)에는 붙이지 않는다");
  });
});
await section("문의 메뉴", async () => {
  await fixture(async (fx) => {
    const html = String((await page(fx, "/menu"))?.html ?? "");
    // 통합 때 고침: 법무 영역(R-9)이 메뉴 이름을 ‘개인정보처리방침’ 으로 바꿨다.
    const privacy = html.indexOf("개인정보처리방침"), faq = html.indexOf("문의·FAQ");
    ok(privacy > 0 && faq > privacy && html.slice(Math.max(0, faq - 400), faq).includes('href="/faq'), `/menu ‘도움말과 안내’ 에 ‘개인정보처리방침’ 다음 ‘문의·FAQ’(/faq) 줄이 있다 (${privacy}, ${faq})`);
    const faqPage = await (await app.fetch(new Request(`${BASE}/faq`), {}, ctx)).text();
    ok(faqPage.includes('href="/contact"'), "/faq 에서 /contact 로 가는 링크가 있다");
  });
});

// ── R-16 분류 예외·보이지 않는 글자 ─────────────────────────────────────────
await section("R-16 분류 예외", async () => {
  const oldRules = rulesFrom(await assetText("/assets/ab-category-rules-v22993.js"));
  const newRules = rulesFrom(await assetText("/assets/ab-category-rules-v22995.js"));
  ok(Array.isArray(oldRules) && Array.isArray(newRules) && oldRules.length === newRules.length, "R-16 옛(v22993)·새(v22995) 분류 규칙 자산을 읽는다");
  const cat = (rules, text) => inferInputCategory(normalizeInputText(text).toLowerCase(), "expense", rules) || "";
  for (const [word, pair] of [["운동화 89000", "운동 50000"], ["충전기 25000", "전기요금 30000"], ["참기름 12000", "기름 50000"], ["들기름 15000", "기름 50000"], ["버스킹 5000", "버스 1500"]]) {
    const before = cat(oldRules, word), pairCategory = cat(oldRules, pair), after = cat(newRules, word);
    ok(before && before === pairCategory && after !== before && cat(newRules, pair) === pairCategory, `R-16 ‘${word}’ 은 예전에 ‘${before}’(‘${pair}’ 와 같은 규칙)였고 이제 ‘${after || "분류 없음"}’ 이다`);
    const parsed = await withClock("2026-07-15", () => parseMultipleTransactions(word, {}));
    const row = Array.isArray(parsed) ? parsed[0] : parsed?.items?.[0] || parsed;
    ok(row && row.amount > 0 && row.category !== before, `R-16 카카오 해석에서도 ‘${word}’ 은 ‘${before}’ 이 아니다(${row?.category})`);
  }
  for (const text of ["헬스장 운동 50000", "전기요금 30000", "주유 50000", "버스 1500", "휴대폰 충전 5000"]) eq(cat(newRules, text), cat(oldRules, text), `R-16 다른 낱말 ‘${text}’ 의 분류는 그대로다`);
  for (const [label, room] of PATHS) {
    const result = await scene(room, ["운동화 89000"]);
    ok(result.rows.length === 1 && result.rows[0].amount === 89000 && result.rows[0].category !== "운동", `R-16 ${label} ‘운동화 89000’ 은 운동으로 저장하지 않는다(${result.rows[0]?.category})`);
  }
});
await section("보이지 않는 글자", async () => {
  for (const mark of ["​", "‌", "‍", "⁠", "﻿"]) eq(normalizeInputText(`커피 4${mark}500`), normalizeInputText("커피 4500"), `폭 0 글자 U+${mark.codePointAt(0).toString(16).toUpperCase()} 를 지운다`);
  eq(normalizeInputText("ＫＴＸ　５９８００"), normalizeInputText("KTX 59800"), "전각 라틴·숫자·공백(U+FF01~FF5E·U+3000)을 반각으로 읽는다");
  ok(normalizeInputText("① 커피 4500").includes("①") && normalizeInputText("쌀 1㎏ 4500").includes("㎏") && normalizeInputText("ｶﾌｪ 4500").includes("ｶﾌｪ"), "그 범위 밖(①·㎏·반각 가나)은 NFKC 처럼 바꾸지 않는다");
  for (const [label, room] of PATHS) {
    const zw = await scene(room, ["커피 4​500"]);
    ok(zw.rows.length === 1 && zw.rows[0].amount === 4500, `${label} ‘커피 4(폭 0)500’ 을 4,500원으로 저장한다(예전에는 금액을 못 읽음): ${show(zw.rows.map((row) => [row.amount, row.memo]))}`);
    const wide = await scene(room, ["ＫＴＸ 59800"]);
    ok(wide.rows.length === 1 && wide.rows[0].amount === 59800 && /KTX/.test(wide.rows[0].memo), `${label} ‘ＫＴＸ 59800’ 의 내용은 반각 ‘KTX’ 다(${wide.rows[0]?.memo})`);
  }
  const { browser, type } = quickPage();
  type("커피 4​500");
  eq(browser.fields.amountInput.value, "4,500", "웹 ‘커피 4(폭 0)500’ 은 4,500 을 채운다");
});

// ── 옛·새 해석 대조 ─────────────────────────────────────────────────────────
await section("옛·새 대조", async () => {
  const sentences = corpus();
  const kept = sentences.filter((text) => !INTENDED.test(text));
  const newLines = await withClock("2026-07-15", () => kept.map((text) => { try { return parserLine(text, parseMultipleTransactions(text, {})); } catch (error) { return parserLine(text, `ERR ${error.message}`); } }));
  const digest = sha(newLines.join("\n"));
  const oldLines = oldParserLines(kept);
  const diffs = oldLines ? kept.filter((_, i) => oldLines[i] !== newLines[i]) : [];
  const oldDigest = oldLines ? sha(oldLines.join("\n")) : OLD_PARSER_DIGEST;
  ok(digest === OLD_PARSER_DIGEST && oldDigest === OLD_PARSER_DIGEST && diffs.length === 0,
    `카카오 해석(parseMultipleTransactions) 옛·새 대조 ${kept.length}문장 — 의도한 문장(폭 0·전각·R-16 낱말) 외 차이 0 (${oldLines ? "옛 번들로 문장마다" : "내장 해시로"}): 새 ${digest} · 옛 ${oldDigest} · 차이 ${diffs.length} ${show(diffs.slice(0, 5))}`);
  const oldWeb = webFunctions(homeOld), newWeb = webFunctions(homeNew);
  const webLine = (fns, text) => { try { return JSON.stringify([fns.normalizeInputText(text), fns.quickAmountCount(text), fns.parseMobileAmountText(text)]); } catch (error) { return `ERR ${error.message}`; } };
  const webDiffs = kept.filter((text) => webLine(oldWeb, text) !== webLine(newWeb, text));
  ok(webDiffs.length === 0, `웹 빠른 입력 해석(홈 자산 v22993·v22995 의 normalizeInputText·quickAmountCount·parseMobileAmountText) 옛·새 대조 ${kept.length}문장 차이 0 ${show(webDiffs.slice(0, 5))}`);
  const others = sentences.filter((text) => !CURRENCY.includes(text));
  ok(others.every((text) => !foreignCurrencyAmountIn(text)), `통화 문장 30개 밖의 ${others.length}문장은 외화 되묻기에 걸리지 않는다(카카오 입구의 새 분기는 이 판정 하나다)`);
  const intended = sentences.filter((text) => INTENDED.test(text));
  ok(intended.length === 9 && intended.every((text) => /운동화|충전기|참기름|들기름|버스킹|＄|[​　]|ＫＴＸ/.test(text)), `의도한 차이 문장은 R-16 낱말·폭 0·전각 문장뿐이다(${intended.length}개)`);
  const fold = await withClock("2026-07-15", () => [["커피 4​500", "커피 4500"], ["ＫＴＸ 59800", "KTX 59800"], ["커피　4500", "커피 4500"]].every(([wide, plain]) => { const read = (text) => JSON.stringify(parseMultipleTransactions(text, {}).map(({ raw_text, ...row }) => row)); return read(wide) === read(plain); }));
  ok(fold, "의도한 차이(폭 0·전각) 문장은 새 해석에서 반각·폭 0 없는 문장과 똑같이 읽힌다(원문 raw_text 만 그대로 남는다)");
});

// ── R-19 가져오기 성능 ───────────────────────────────────────────────────────
await section("R-19 가져오기", async () => {
  const imp = (text) => { const r = parseFlexibleImportRecords(text, "hh-v22995", "", { referenceDate: "2026-07-15" }); return [r.rows.map((row) => [row.type, row.amount, row.memo]), r.rejected.map((row) => row.reason_code)]; };
  const timed = (text) => { imp(text); let best = Infinity, out = null; for (let i = 0; i < 3; i += 1) { const started = performance.now(); out = imp(text); best = Math.min(best, performance.now() - started); } return [best, out]; };
  const header = "날짜,내용,금액\n2026-07-01,커피,", headerless = "2026-07-01,커피,";
  for (const [label, text, expected] of [
    ["머리글 표의 2만 칸 공백 금액 칸", header + " ".repeat(20000), imp(header)],
    ["머리글 없는 행의 2만 칸 공백 칸", headerless + " ".repeat(20000), imp(headerless)],
    ["머리글 표의 4만 자 숫자 금액 칸", header + "1".repeat(40000), imp(header + "1".repeat(160))],
    ["머리글 없는 행의 4만 자 숫자 칸", headerless + "1".repeat(40000), [[], ["memo_too_long"]]],
    ["머리글 없는 행의 공백 2만 칸 뒤 ‘x원’", headerless + "4500" + " ".repeat(20000) + "x원", [[], ["missing_amount"]]],
  ]) {
    const [ms, out] = timed(text);
    ok(ms < 50, `R-19 ${label}이 50 ms 안에 끝난다(${ms.toFixed(1)} ms)`);
    eq(out, expected, `R-19 ${label}의 결과(공백 → 빈 칸과 같음, 숫자 → 저장하지 않음)`);
  }
  eq(imp("2026-07-01 커피 4500"), [[["expense", 4500, "커피"]], []], "R-19 160자 안의 자연어 줄은 예전처럼 읽는다");
  eq(imp("2026-07-01 " + "가".repeat(150) + " 4500"), [[], ["memo_too_long"]], "R-19 160자를 넘는 자연어 줄은 자연어로 읽지 않고 메모 저장 한도 초과로 뺀다(원본을 자르지 않는다)");
  eq(parseTransaction("커피 " + "가".repeat(200) + " 4500", {}).amount, 4500, "R-19 상한은 가져오기에만 있다(카카오·웹이 쓰는 해석기는 그대로)");
  const cells = ["12,000원", "12000 원", "₩12,000", "￦12000", "KRW 12000", "krw12000", "12000krw", "12000 KRW", "12000won", "won 12000", "(12,000원)", "-12,000원", "12,000원-", "△12,000", "▲ 12000 원", "1.2만원", "3만 5천원", "12,000 원 ", "  12000원  ", "12000원원", "원12000", "12000 원 원"];
  const quote = (cell) => (/[",]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  const amounts = cells.map((cell) => { const r = parseFlexibleImportRecords(header + quote(cell), "hh-v22995", "", { referenceDate: "2026-07-15" }); return r.rows[0] ? [r.rows[0].type, r.rows[0].amount] : r.rejected.map((row) => row.reason_code).join("|"); });
  // 옛 번들(73d2f48)의 결과와 같다(끝 ‘원’ 떼기를 선형으로 바꾼 뒤에도).
  eq(amounts, [["expense", 12000], ["expense", 12000], ["expense", 12000], ["expense", 12000], ["expense", 12000], ["expense", 12000], ["expense", 12000], ["expense", 12000], ["expense", 12000], ["expense", 12000], ["income", 12000], ["income", 12000], ["income", 12000], ["income", 12000], ["income", 12000], ["expense", 12000], ["expense", 35000], ["expense", 12000], ["expense", 12000], ["expense", 12000], "invalid_amount", ["expense", 12000]], "R-19 금액 칸의 원화 표시 떼기 결과가 예전과 같다(22칸)");
});

if (failures.length) {
  for (const line of failures.slice(0, 80)) console.error(`실패: ${line}`);
  console.error(`V22.9.95 안내·해석 검사 실패 — checks ${checks} failed ${failures.length}`);
  process.exit(1);
}
console.log(`V22.9.95 안내·해석(R-14 안내·R-16 분류 예외·폭 0/전각 글자·R-20 외화 되묻기·R-19 가져오기·공지 띠·문의 메뉴) 검사 통과 — checks ${checks} failed 0`);

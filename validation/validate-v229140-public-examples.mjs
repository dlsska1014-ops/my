// V22.9.140 공개 화면 판 통합 검사(2026-11-22 — Codex 의 공개 예제 작업 중 공개 화면 몫 + 그 검토에서 남은 것, 사용자 "140 공개, 141 카톡 나눠서").
// 1. V139:A-8: 로그인 뒤 /menu·/payment-methods 가 없는 세무 계산표(‘계산표 12종’·‘연말정산 … 공개 계산표에서 바로 검산’)를 말하지 않는다.
//    원본 전체에서 ‘계산표·계산기 N종/N개’ 와 ‘연말정산 … 계산표’ 문구를 막는다(옛 자산 문자열 파일은 뺀다).
// 2. V139:A-7: /year-end-tax-expense-check 의 실손보험 FAQ 가 첫 문장에서 답하고(보전받은 금액은 의료비 공제 대상에서 빠진다) 예를 든다.
// 3. 수정일은 본문·기본 예제가 바뀐 글에만 올린다: 계산표 글 넷(룸메이트·현금흐름·연간 목돈·월 마감)은 11-07, /about 은 10-21 그대로이고
//    /about 에 ‘수정 기록’ 절이 없다.
// 4. 찾는 말이 든 제목: 첫 화면 문서 제목 ‘카카오톡 가계부 …’(히어로 문구는 공유 이미지와 같은 그대로), /group-accountbook ‘단톡방 정산 방법 …’,
//    /kakao-guide ‘카카오톡 가계부 입력 방법 …’. 첫 화면 설명에 ‘가상 예제’ 가 없다.
// 5. 처음 온 사람의 봇 길: 첫 화면 둘째 단추와 /kakao-guide 첫 단추가 카카오톡 채널 1:1 채팅으로 간다(원본에 채널 주소는 상수 한 곳).
// 6. 첫 화면 글 목록 ‘처음이라면 이 글부터’ = 처음 읽을 순서로 고른 8편 + 전체 목록(연말정산 글 없음).
// 7. 카카오 저장 답 모양은 이 판에서 바꾸지 않는다: /demo 봇 말풍선은 V22.9.139 모양 그대로다(실제 답과의 줄 대조는 validate-demo-tour-v22992).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://malhaebook.com";
const CHANNEL_CHAT = "https://pf.kakao.com/_WpNXX/chat";
const STARTER = ["/accountbook-habit", "/payday-budget-cycle", "/budget-ratio-guide", "/expense-category-rules", "/fixed-cost-checklist", "/subscription-cleanup", "/shared-living-cost-rules", "/monthly-closing-routine"];
const UNCHANGED_SHEETS = ["/roommate-shared-ledger", "/cash-flow-table", "/sinking-fund-annual-expenses", "/monthly-closing-routine"];
// 본문·기본 예제·계산 결과를 고친 글(예산 비율·카드 실적은 입력 예제가 같고 계산 결과가 바뀌었다 — 독립 검토).
const REVISED = ["/shared-living-cost-rules", "/subscription-cleanup", "/expense-category-rules", "/year-end-tax-expense-check", "/budget-ratio-guide", "/card-spending-threshold"];
const fx = await createV2265QaFixture();
const ownerCookie = await fx.cookieFor("user-bin");

async function get(target, { cookie = "" } = {}) {
  const res = await app.fetch(new Request(`${ORIGIN}${target}`, {
    headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", ...(cookie ? { cookie } : {}) },
  }), { ...fx.env }, { waitUntil() {} });
  return { status: res.status, html: await res.text() };
}
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const titleOf = (html) => decode((html.match(/<title>([^<]*)<\/title>/) || ["", ""])[1]);
const heroOf = (html) => (html.match(/<div class="pubHeroActions">([\s\S]*?)<\/div>/) || ["", ""])[1];
const modifiedOf = (html) => (html.match(/수정 <time datetime="(\d{4}-\d{2}-\d{2})">/) || ["", ""])[1];
const sectionOf = (html, heading) => (html.match(new RegExp(`<section class="pubSection" id="section-\\d+"><h2>${heading}</h2>[\\s\\S]*?</section>`)) || [""])[0];
const visible = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith(".js") && name !== "historical-runtime-assets.js") out.push(full);
  }
  return out;
}

try {
  // ── 1. V139:A-8 ──
  const sources = sourceFiles(path.join(ROOT, "src", "modules"));
  ok(sources.length > 100, `원본 모듈 ${sources.length}개를 읽었다`);
  let countedSheet = 0, taxSheet = 0, channelUrl = 0;
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    countedSheet += (text.match(/계산(?:표|기)\s*\d+\s*(?:종|개)/g) || []).length;
    taxSheet += (text.match(/연말정산[^"'`<>\n]{0,20}계산표/g) || []).length;
    channelUrl += (text.match(/pf\.kakao\.com\//g) || []).length;
    if (file.endsWith(path.join("features", "payment-methods-page.js"))) ok(!/연말정산[^.。<]*계산표에서/.test(text), "/payment-methods 원본: 연말정산을 ‘계산표에서 … 검산’ 할 수 있다는 문장이 없다");
  }
  eq(countedSheet, 0, "원본 어디에도 ‘계산표·계산기 N종/N개’ 문구가 없다(실제 수와 어긋나기 쉬운 수를 쓰지 않는다)");
  eq(taxSheet, 0, "원본 어디에도 ‘연말정산 … 계산표’ 문구가 없다(세무 계산표는 V22.9.139 에서 뺐다)");
  eq(channelUrl, 1, "카카오톡 채널 주소는 원본에 상수 한 곳뿐이다");

  const menu = await get("/menu", { cookie: ownerCookie });
  eq(menu.status, 200, "로그인 /menu 200");
  const menuText = visible(menu.html);
  ok(menuText.includes("예산·공동정산·구독 정리 계산표와 생활비 글") && !menuText.includes("12종") && !menuText.includes("연말정산·예산"), "/menu 의 글·계산표 설명에 수와 연말정산 계산표가 없다");
  const payment = await get("/payment-methods?month=2026-07&household_id=house-home", { cookie: ownerCookie });
  eq(payment.status, 200, "로그인 /payment-methods 200");
  const paymentText = visible(payment.html);
  ok(payment.html.includes("<h2>카드 실적·결제수단 참고 글</h2>") && !paymentText.includes("연말정산 참고 계산표"), "/payment-methods 카드 칸 제목이 ‘참고 글’ 이다");
  ok(paymentText.includes("전월 실적을 채울 때의 손익분기와 계좌 현금흐름은 공개 계산표에서 직접 계산해 볼 수 있습니다.") && !paymentText.includes("25% 문턱과 결제수단 전환 손익"), "/payment-methods 는 실제로 있는 계산표(전월 실적·현금흐름)만 계산표라고 한다");
  ok(payment.html.includes('<a href="/payment-method-switch-nov-dec">11~12월 결제수단 전환 정리</a>') && payment.html.includes('href="/card-spending-threshold"') && payment.html.includes('href="/cash-flow-table"'), "/payment-methods 의 세 링크(정리 글·전월 실적·현금흐름)는 그대로다");

  // ── 2. V139:A-7 ──
  const tax = await get("/year-end-tax-expense-check");
  eq(tax.status, 200, "/year-end-tax-expense-check 200");
  const taxText = visible(tax.html);
  const answer = "아니요. 실손의료보험금으로 돌려받은 금액은 의료비 세액공제 대상에서 빠집니다(소득세법 시행령 제118조의5).";
  ok(taxText.includes("의료비는 실손보험으로 돌려받은 금액도 공제되나요? " + answer), "실손보험 FAQ 가 첫 문장에서 답한다(물음 바로 뒤)");
  ok(taxText.includes("총급여의 3%를 넘는지도 이 30만 원으로 따집니다") && !taxText.includes("3% 문턱도 이 30만 원으로"), "문턱(총급여의 3%)과 견주는 금액(30만 원)을 섞지 않는다");
  ok(taxText.includes("병원비 100만 원을 내고 실손보험금 70만 원을 받았다면 공제 대상 의료비는 30만 원"), "실손보험 FAQ 에 숫자 예가 있다");
  ok(!taxText.includes("보험금으로 보전받은 부분을 어떻게 처리하는지도 그 안내에 나옵니다"), "옛 답(안내로 넘기기)은 없다");
  const faqLd = [...tax.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join(" ");
  ok(!faqLd.includes("보험금으로 보전받은 부분을 어떻게 처리하는지도") , "구조화 데이터에도 옛 답이 없다");

  // ── 3. 수정일 ──
  for (const target of UNCHANGED_SHEETS) {
    const page = await get(target);
    eq(page.status, 200, `${target} 200`);
    eq(modifiedOf(page.html), "2026-11-07", `${target}: 본문·예제가 그대로라 수정일 11-07 그대로`);
    ok(page.html.includes('class="pubBtn" href="#inline-worksheet"'), `${target}: 머리 단추는 본문 계산표로 간다`);
  }
  for (const target of REVISED) eq(modifiedOf((await get(target)).html), "2026-11-22", `${target}: 본문·예제·계산 결과를 고친 글은 수정일 11-22`);
  eq(modifiedOf((await get("/emergency-fund-basics")).html), "2026-10-12", "/emergency-fund-basics: 계산 결과가 그대로라 수정일 그대로");
  const about = await get("/about");
  eq(about.status, 200, "/about 200");
  eq(modifiedOf(about.html), "2026-10-21", "/about 수정일은 10-21 그대로");
  ok(!about.html.includes("수정 기록</h2>") && !about.html.includes("생활비 계산표 수정 기록"), "/about 에 계산표 수정 기록 절이 없다");

  // ── 4·5. 제목·설명·봇 길 ──
  const home = await get("/");
  eq(home.status, 200, "첫 화면 200");
  eq(titleOf(home.html), "카카오톡 가계부 말해가계부 · 함께 보는 생활비", "첫 화면 문서 제목이 ‘카카오톡 가계부’ 로 시작한다");
  ok(home.html.includes('og:title" content="카카오톡 가계부 말해가계부 · 함께 보는 생활비"'), "공유 제목도 같다");
  ok(home.html.includes("<h1>말한 기록이, 함께 보는 생활비가 됩니다</h1>"), "히어로 문구는 공유 이미지와 같은 그대로다");
  const homeDescription = decode((home.html.match(/<meta name="description" content="([^"]*)"/) || ["", ""])[1]);
  ok(homeDescription.includes("가입하지 않아도 세 사람의 공동 생활비 예제로 정산을 직접 계산해 볼 수 있습니다.") && !homeDescription.includes("가상 예제"), "첫 화면 설명은 공개 정산 예제를 말하고 ‘가상 예제’ 가 없다");
  eq(heroOf(home.html), `<a class="pubBtn" href="/shared-living-cost-rules#inline-worksheet">가입 없이 생활비 정산하기</a><a class="pubBtn secondary" href="${CHANNEL_CHAT}">카카오톡에서 시작하기</a>`, "첫 화면 단추: 공개 정산 + 카카오톡 채널 1:1 채팅");
  const group = await get("/group-accountbook");
  eq(group.status, 200, "/group-accountbook 200");
  ok(titleOf(group.html).startsWith("단톡방 정산 방법: 방별 공동 가계부와 세 사람 사례 · "), "/group-accountbook 제목이 ‘단톡방 정산 방법’ 으로 시작한다");
  ok(group.html.includes("<h1>단톡방 정산 방법: 방별 공동 가계부와 세 사람 사례</h1>"), "/group-accountbook 머리 제목도 같다");
  const guide = await get("/kakao-guide");
  eq(guide.status, 200, "/kakao-guide 200");
  ok(titleOf(guide.html).startsWith("카카오톡 가계부 입력 방법: 보낸 문장과 저장 결과 · "), "/kakao-guide 제목이 ‘카카오톡 가계부 입력 방법’ 으로 시작한다");
  eq(heroOf(guide.html), `<a class="pubBtn" href="${CHANNEL_CHAT}">카카오톡에서 시작하기</a><a class="pubBtn secondary" href="/demo">가상 예제로 확인하기</a>`, "/kakao-guide 첫 단추가 카카오톡 채널 1:1 채팅으로 간다");
  const related = await get("/shared-living-cost-rules");
  ok(related.html.includes('href="/group-accountbook">단톡방 정산 방법: 방별 공동 가계부와 세 사람 사례'), "다른 글의 ‘다음에 읽을 글’ 링크 이름도 새 제목이다");
  // 공동 생활비: 같은 화면의 본문 비교표(동일 분배 120,000원씩)와 예제 검산 표가 같은 값을 보인다(독립 검토 — 기본값이 품목별이면 어긋났다).
  ok(related.html.includes('<tr><th scope="row">동일 분배</th><td>120,000</td><td>120,000</td><td>120,000</td><td>B가 A에게 90,000</td></tr>'), "본문 비교표의 동일 분배 줄");
  const sharedCheck = sectionOf(related.html, "예제 검산과 계산표 열기");
  ok(sharedCheck.includes('<caption id="table-10">균등 분담 (원)</caption>') && sharedCheck.includes('<tr><th scope="row">A</th><td>210000</td><td>120000</td><td>90000</td></tr><tr><th scope="row">B</th><td>30000</td><td>120000</td><td>-90000</td></tr><tr><th scope="row">C</th><td>120000</td><td>120000</td><td>0</td></tr>'), "예제 검산 표 = 본문 비교표의 동일 분배(120,000원씩·B가 A에게 90,000원)");
  ok(sharedCheck.includes("본문 비교표처럼 모든 지출을 세 사람이 나눈 경우입니다(장보기도 A,B,C)") && sharedCheck.includes("B가 A에게 110,000원, C가 A에게 20,000원"), "검산 문장이 기본값(모두 참여)과 품목별 예제를 함께 설명한다");
  ok(sectionOf(related.html, "원본 지출 예제").includes('<tr><th scope="row">공용 장보기</th><td>C</td><td>120000</td><td>A,B,C</td></tr>'), "예제 원본의 장보기 참여자 = A,B,C(기본값)");
  const firstLabel = related.html.indexOf("본문 비교표 · 모든 지출을 세 사람이 나눔"), itemLabel = related.html.indexOf("본문 품목별 · 장보기는 B와 C");
  ok(firstLabel > 0 && itemLabel > firstLabel, "계산표 예제 선택: 본문 비교표가 먼저, 본문 품목별이 다음");

  // ── 6. 첫 화면 글 목록 ──
  const starter = sectionOf(home.html, "처음이라면 이 글부터");
  ok(starter.length > 0 && !home.html.includes("<h2>최근 글</h2>"), "첫 화면 글 목록은 ‘처음이라면 이 글부터’ 하나다");
  eq([...starter.matchAll(/<a href="([^"]+)">/g)].map((m) => m[1]), [...STARTER, "/articles"], "처음 읽을 순서로 고른 8편 + 전체 목록");
  for (const target of STARTER) eq((await get(target)).status, 200, `${target} 200`);

  // ── 7. /demo 봇 말풍선은 V22.9.139 모양 그대로(카카오 저장 답은 V22.9.141) ──
  const demo = await get("/demo");
  eq(demo.status, 200, "/demo 200");
  ok(visible(demo.html).includes("💸 지출 저장했어요 😊") && visible(demo.html).includes("수정 01번 금액 13000"), "/demo 봇 말풍선은 지금 봇 답과 같은 모양이다");

  console.log(`V22.9.140 공개 화면 판 검사 통과 (${checks} checks)`);
} finally {
  await fx.close?.();
}

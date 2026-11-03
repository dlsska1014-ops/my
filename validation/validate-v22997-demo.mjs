#!/usr/bin/env node
// V22.9.97 모임 정산 검사 — /demo 일곱째 단계(단톡방 모임 회비·여행 경비 정산)·/group-accountbook ‘모임 총무로 쓰기’ 절·/faq 새 문항.
// 수익화 검토(review-artifacts/monetization-2026-11-02/REVIEW-FABLE-PLAN.md 3절 1번 ‘모임 총무’)는 이 판에서 반응만 본다. 가격·플랜 문구는 없다.
//   1. /demo: 일곱째 단계(번호·제목·문장·‘어디서’·링크), 단톡방 말풍선 차례(내 기록·다른 세 사람의 기록·생략 안내·내 ‘정산’·봇 답),
//      봇 답 = 픽스처 단톡방에서 같은 말을 차례로 보낸(기록 → 저마다 ‘내 이름’ → ‘정산’) 실제 /skill 정산 답과 줄마다 같다(바꾸는 값 없음),
//      저장된 기록·역할이 말풍선과 같다, 새 말풍선 CSS 는 /demo 에만 있고 대비 4.5:1 이상, HTML 72 KiB·인라인 CSS 24 KiB 이하.
//   2. /group-accountbook ‘모임 총무로 쓰기’: 절·목차·둘러보기 링크, 문장마다 앱 동작과 대조한다 — 기록하지 않은 사람은 참여 전,
//      초대코드 참여는 승인 대기이고 웹 ‘참여자·초대’에서 구성원으로 바꾸면 함께 나눈다, 지출자는 소유자·관리자만 웹에서 바꾼다,
//      이름을 정하지 않으면 ‘카카오사용자 N’, 카카오 답은 참여자·송금 제안 8개까지(나머지는 웹), 회비 수입은 요약에 나오고 정산에서 빠진다,
//      정산은 이번 달만, 웹 정산은 달·네 방식·완료 이력(소유자·관리자).
//   3. /faq: 새 문항 하나와 답 아래 둘러보기 링크, FAQPage 구조화 데이터 문항 수 = 화면 문항 수, 링크 여백 규칙은 /faq 에만.
//   4. 세 화면의 안내 수정일 = 구조화 데이터 = 사이트맵 lastmod, 사이트맵에 조각 주소 없음, 첫 화면(/)에 새 내용 없음, 가격·플랜 낱말 없음,
//      공개 화면을 그리는 동안 바깥 요청 0.
// 실제 번들(src/index.js)의 app.fetch 와 QA 픽스처로 본다. DB·네트워크 없음. 장면 시계는 단계마다 2026-09·10 의 날로 고정한다.
import { isDeepStrictEqual } from "node:util";
import { app, BASE, ctx, fixture, page, post, withClock } from "./lib-audit-v22934.mjs";

let checks = 0;
const failures = [];
const show = (value) => { try { return String(JSON.stringify(value)).slice(0, 300); } catch (_) { return String(value).slice(0, 300); } };
function ok(cond, msg) { checks += 1; if (!cond) failures.push(msg); }
function eq(actual, expected, msg) { checks += 1; if (!isDeepStrictEqual(actual, expected)) failures.push(`${msg} — 실제 ${show(actual)} · 기대 ${show(expected)}`); }
async function section(name, task) {
  try { await task(); } catch (error) {
    checks += 1;
    failures.push(`${name}: 구간이 끝까지 돌지 못했다 — ${String(error?.stack || error).split("\n").slice(0, 3).join(" ").slice(0, 320)}`);
  }
}

const REVISION = "2026-11-03";
const SECRET = "qa-v22997-demo-skill-secret";
const ME = "민지";
const QUESTION = "모임 회비나 여행 경비 정산에도 쓸 수 있나요?";
const TOUR_LINK = '<div class="pubLinks"><a href="/demo#tour-settle">모임 정산 예시 둘러보기<span aria-hidden="true"> →</span></a>';
const FAQ_LINK_CSS = ".pubFaq .pubLinks{margin:0 0 18px}";
// 이 판은 모임 정산의 반응만 본다(검토 3절 1번). 유료·가격·플랜·결제 문구는 넣지 않는다.
const FORBIDDEN = ["유료", "가격", "요금", "플랜", "결제", "구독", "프리미엄", "멤버십", "이용권", "할인", "총무 전용", "월정액"];
const decode = (text) => String(text).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const plain = (html) => decode(String(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const countOf = (text, needle) => String(text || "").split(needle).length - 1;
const inlineCss = (html) => [...String(html).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("");
const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;
const forbiddenIn = (text) => FORBIDDEN.filter((word) => String(text).includes(word));
const structuredOf = (html) => JSON.parse((String(html).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || ["", "{}"])[1]);

// WCAG 상대 휘도 대비(#rrggbb).
function contrast(fg, bg) {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// 공개 화면은 기본 env 로 그린다. 그리는 동안 바깥 요청은 하나도 없어야 한다(픽스처 밖에서만 부른다).
let outbound = 0;
async function publicPage(path) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { outbound += 1; throw new Error("공개 화면은 바깥 요청을 하지 않는다"); };
  try {
    const response = await app.fetch(new Request(`${BASE}${path}`, { headers: { accept: "text/html" } }), {}, ctx);
    return { status: response.status, html: await response.text() };
  } finally { globalThis.fetch = previous; }
}

// 단톡방 한 곳에서 보낸 말. 처음 보는 사용자는 인증된 카카오 요청이어야 계정이 생긴다(validate-group-first-v22931 과 같은 꼴).
async function roomSay(fx, room, userKey, utterance) {
  const jobs = [];
  const body = { userRequest: { utterance, user: { id: userKey, type: "botUserKey", properties: { botUserKey: userKey, botGroupKey: room } } } };
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify(body) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await Promise.allSettled(jobs);
  const data = await response.json();
  return (data?.template?.outputs || []).map((o) => o?.simpleText?.text || o?.textCard?.description || "").join("\n");
}
const roomFixture = (task) => fixture(async (fx) => { fx.env.KAKAO_SKILL_SECRET = SECRET; return task(fx); });
const userIdOf = (fx, key) => fx.db.users.find((row) => row.kakao_user_key === key)?.id;
// 새 사용자는 단톡방 가계부 하나에만 참여하므로 그 사람의 가계부가 그 방의 가계부다.
const roomHouseholdOf = (fx, key) => fx.db.households.find((h) => fx.db.household_members.some((m) => m.household_id === h.id && m.user_id === userIdOf(fx, key)));
const roleOf = (fx, householdId, key) => fx.db.household_members.find((m) => m.household_id === householdId && m.user_id === userIdOf(fx, key))?.role;
const personLines = (lines) => lines.filter((line) => /^• [^→]+: (?:[\d,]+원 (?:받기|보내기)|정산 차액 없음)$/.test(line));
const transferLines = (lines) => lines.filter((line) => /^• .+ → .+: [\d,]+원$/.test(line));

const demo = await publicPage("/demo");
const group = await publicPage("/group-accountbook");
const faq = await publicPage("/faq");
const tourStart = demo.html.indexOf('<section class="pubSection pubTour"');
const tour = tourStart < 0 ? "" : demo.html.slice(tourStart, demo.html.indexOf("</ol></section>", tourStart));
const stopHtml = (tour.match(/<li class="pubTourStop" id="tour-settle">[\s\S]*?<\/li>/) || [""])[0];
const groupSection = (group.html.match(/<section class="pubSection" id="section-\d+"><h2>모임 총무로 쓰기<\/h2>[\s\S]*?<\/section>/) || [""])[0];
const groupText = plain(groupSection);

// ── 1. /demo 일곱째 단계 ────────────────────────────────────────────────────
const bubbles = [];
await section("1 /demo 일곱째 단계", async () => {
  eq(demo.status, 200, "1-a /demo 가 로그인 없이 열린다");
  ok(tour.includes('<h2 id="tour-title">한눈에 보는 일곱 가지 기능</h2>'), "1-b 둘러보기 제목이 ‘일곱 가지 기능’이다");
  eq(countOf(demo.html, 'id="tour-settle"'), 1, "1-c 모임 정산 단계(id=tour-settle, /faq·/group-accountbook 링크의 목적지)는 하나다");
  ok(stopHtml.startsWith('<li class="pubTourStop" id="tour-settle"><h3><span aria-hidden="true">7</span>모임 회비·여행 경비도 단톡방에서 정산해요</h3>'), "1-d 일곱째 단계의 번호(7)·제목");
  const stopText = plain(stopHtml);
  ok(stopText.includes("동아리 회비, 여행 경비, 커플·친구 모임의 더치페이를 단톡방에서 바로") && stopText.includes("‘정산’이라고 보내면") && stopText.includes("가상 예시"), "1-e 문장이 모임 회비·여행 경비·더치페이와 ‘정산’ 요청을 말하고 가상 예시라고 밝힌다");
  ok(stopHtml.includes('<p class="pubTourWhere">어디서: 카카오톡 단톡방 · 비율·품목별로 나누려면 로그인 뒤 /settlement-summary</p><div class="pubLinks"><a href="/group-accountbook">모임 총무로 쓰는 법<span aria-hidden="true"> →</span></a></div></li>'), "1-f ‘어디서’ 줄(단톡방·웹 정산)과 ‘모임 총무로 쓰는 법’ 링크(/group-accountbook)");
  eq(forbiddenIn(stopText), [], "1-g 일곱째 단계에 유료·가격·플랜·결제 낱말이 없다");

  const figure = (stopHtml.match(/<figure class="pubTourPreview pubChat">([\s\S]*?)<\/figure>/) || ["", ""])[1];
  eq((figure.match(/<figcaption>([^<]*)<\/figcaption>/) || ["", ""])[1], `카카오톡 단톡방 · ${ME}의 화면 · 가상 예시`, "1-h 말풍선 묶음은 단톡방·민지의 화면·가상 예시라고 밝힌다");
  const BUBBLE = /<p class="pubChatMe"><span class="pubSr">내가 보낸 말: <\/span>([^<]*)<\/p>|<div class="pubChatPeer"><b>([^<]*)<\/b><p>([^<]*)<\/p><\/div>|<p class="pubChatNote">([^<]*)<\/p>|<div class="pubChatBot"><b>말해가계부<\/b><p>([^<]*)<\/p><\/div>/g;
  for (const m of figure.matchAll(BUBBLE)) {
    if (m[1] !== undefined) bubbles.push({ kind: "me", name: ME, text: decode(m[1]) });
    else if (m[2] !== undefined) bubbles.push({ kind: "peer", name: decode(m[2]), text: decode(m[3]) });
    else if (m[4] !== undefined) bubbles.push({ kind: "note", text: decode(m[4]) });
    else bubbles.push({ kind: "bot", lines: decode(m[5]).split("\n") });
  }
  eq(bubbles.map((b) => b.kind), ["me", "peer", "peer", "peer", "note", "me", "bot"], "1-i 말풍선 차례: 내 기록 → 다른 세 사람의 기록 → 생략 안내 → 내 ‘정산’ → 봇 답");
  eq(figure.replace(/<figcaption>[^<]*<\/figcaption>/, "").replace(BUBBLE, ""), "", "1-j 말풍선 묶음에 그 밖의 요소가 없다");
  const records = bubbles.slice(0, 4);
  eq(new Set(records.map((b) => b.name)).size, 4, "1-k 기록한 사람은 서로 다른 네 명이다");
  ok(records.every((b) => /^@말해가계부 \S+ \d+원$/.test(b.text)), "1-l 기록 말은 봇을 부른 ‘@말해가계부 내용 금액원’ 한 줄이다");
  ok(bubbles[4]?.text.includes("저장 답") && bubbles[4]?.text.includes("내 이름 민지") && bubbles[4]?.text.includes("생략"), "1-m 가운데 줄이 기록마다 오는 저장 답과 이름 정하기를 생략했다고 밝힌다");
  eq(bubbles[5]?.text, "@말해가계부 정산", "1-n 내 마지막 말은 ‘@말해가계부 정산’이다");

  // 같은 말을 픽스처 단톡방에서 차례로 보낸다: 네 사람이 기록 → 저마다 ‘내 이름’ → 민지가 ‘정산’.
  await roomFixture((fx) => withClock("2026-09-27", async () => {
    const room = "qa-v22997-demo-trip";
    const keyOf = (name) => `qa-v22997-${name}`;
    const before = fx.db.transactions.length;
    for (const record of records) ok((await roomSay(fx, room, keyOf(record.name), record.text)).includes("지출 저장했어요"), `1-o ${record.name} 의 ‘${record.text}’ 는 실제로 지출로 저장된다`);
    const amountOf = (text) => Number(text.match(/(\d+)원$/)[1]);
    eq(fx.db.transactions.slice(before).map((row) => [row.user_id, Number(row.amount), row.type, row.transaction_date]), records.map((r) => [userIdOf(fx, keyOf(r.name)), amountOf(r.text), "expense", "2026-09-27"]), "1-p 네 기록이 보낸 사람(지출자) 앞으로 금액 그대로 9월 지출로 저장된다");
    const household = roomHouseholdOf(fx, keyOf(ME));
    eq(records.map((r) => roleOf(fx, household?.id, keyOf(r.name))), ["owner", "member", "member", "member"], "1-q 첫 기록자(민지)가 소유자, 나머지 셋은 기록 한 번으로 구성원이 된다");
    for (const record of records) ok((await roomSay(fx, room, keyOf(record.name), `@말해가계부 내 이름 ${record.name}`)).includes(`내 이름을 ‘${record.name}’`), `1-r ‘@말해가계부 내 이름 ${record.name}’ 으로 이 방 가계부의 이름을 정한다`);
    const real = (await roomSay(fx, room, keyOf(ME), bubbles[5].text)).split("\n");
    eq(bubbles[6]?.lines, real, "1-s 봇 말풍선은 같은 말을 차례로 보낸 실제 /skill 정산 답과 줄마다 같다(바꾸는 값 없음)");
    const total = records.reduce((sum, r) => sum + amountOf(r.text), 0);
    ok(real.includes(`총 지출: ${won(total)}`) && real.includes(`참여자: ${records.length}명`) && real.includes(`1인 기준: ${won(total / records.length)}`) && real.includes("송금 제안"), "1-t 답의 총 지출·참여자·1인 기준이 네 기록의 합·4명·4분의 1이고 송금 제안이 있다");

    // ── 2-가. 같은 방으로 본 절의 사실: 참여 전·초대코드 승인·지출자 바꾸기·웹 정산 ──
    const harin = keyOf("하린");
    const outsider = await roomSay(fx, room, harin, "@말해가계부 정산");
    ok(outsider.includes("아직 이 방 가계부에 참여 전이에요") && !roleOf(fx, household?.id, harin), "2-a 기록을 한 번도 보내지 않은 사람은 ‘참여 전’ 안내를 받고 가계부 참여자가 아니다(절: 참여 전이라 빠집니다)");
    const joined = await roomSay(fx, room, harin, `@말해가계부 가계부 참여 ${household?.invite_code}`);
    ok(joined.includes("승인 대기") && roleOf(fx, household?.id, harin) === "pending", "2-b 초대코드로 참여를 요청하면 승인 대기다(절: 초대코드로 참여를 요청)");
    ok((await roomSay(fx, room, keyOf(ME), "@말해가계부 정산")).split("\n").includes("참여자: 4명"), "2-c 승인 대기인 사람은 정산에서 빠진다(참여자 4명 그대로)");
    const ownerCookie = await fx.cookieFor(userIdOf(fx, keyOf(ME)));
    const members = await page(fx, `/my/members?household_id=${encodeURIComponent(household?.id)}`, { cookie: ownerCookie });
    ok(members.status === 200 && members.html.includes(`name="user_id" value="${userIdOf(fx, harin)}"`) && members.html.includes('<option value="pending" selected>승인 대기</option>') && members.html.includes('<option value="member">구성원 · 기록 가능</option>'), "2-d 소유자의 웹 ‘참여자·초대’(/my/members)에 그 사람의 권한 칸(승인 대기 → 구성원)이 있다");
    const promoted = await post(fx, "/admin/member/update", { household_id: household?.id, user_id: userIdOf(fx, harin), role: "member", return_to: `/my/members?household_id=${household?.id}` }, { cookie: ownerCookie });
    ok(promoted.status === 303 && roleOf(fx, household?.id, harin) === "member", "2-e 소유자가 권한을 구성원으로 바꾼다");
    const five = (await roomSay(fx, room, keyOf(ME), "@말해가계부 정산")).split("\n");
    ok(five.includes("참여자: 5명") && five.includes(`1인 기준: ${won(total / 5)}`), "2-f 구성원이 되면 낸 돈이 없어도 함께 나눈다(5명, 1인 기준 80,000원)(절: 구성원으로 바꾸면 함께 나눕니다)");

    const txOf = (name) => fx.db.transactions.find((row) => row.household_id === household?.id && row.user_id === userIdOf(fx, keyOf(name)));
    const coffee = txOf("도윤"), rental = txOf("서연");
    const ownerForm = await page(fx, `/transactions/edit?id=${encodeURIComponent(coffee?.id)}&fragment=1`, { cookie: ownerCookie });
    const memberCookie = await fx.cookieFor(userIdOf(fx, keyOf("서연")));
    const memberForm = await page(fx, `/transactions/edit?id=${encodeURIComponent(rental?.id)}&fragment=1`, { cookie: memberCookie });
    ok(ownerForm.status === 200 && ownerForm.html.includes('<select name="user_id" required>') && memberForm.status === 200 && memberForm.html.includes("v8-spender-readonly") && !memberForm.html.includes('<select name="user_id"'), "2-g 웹 기록 수정에서 지출자 고르기는 소유자에게만 있고 구성원은 읽기만 한다");
    const back = `/app?tab=transactions&household_id=${household?.id}&month=2026-09`;
    await post(fx, "/admin/update", { id: coffee?.id, household_id: household?.id, month: "2026-09", amount: "20000", user_id: userIdOf(fx, keyOf("준호")), return_to: back }, { cookie: ownerCookie });
    await post(fx, "/admin/update", { id: rental?.id, household_id: household?.id, month: "2026-09", amount: "60000", user_id: userIdOf(fx, keyOf(ME)), return_to: back }, { cookie: memberCookie });
    eq([fx.db.transactions.find((row) => row.id === coffee?.id)?.user_id, fx.db.transactions.find((row) => row.id === rental?.id)?.user_id], [userIdOf(fx, keyOf("준호")), userIdOf(fx, keyOf("서연"))], "2-h 소유자는 대신 적은 기록의 지출자를 바꾸고, 구성원이 보낸 지출자 값은 저장하지 않는다(절: 소유자·관리자가 웹 거래 내역에서 지출자를 바꿉니다)");

    const webOwner = await page(fx, `/settlement-summary?household_id=${encodeURIComponent(household?.id)}&month=2026-09`, { cookie: ownerCookie });
    const webMember = await page(fx, `/settlement-summary?household_id=${encodeURIComponent(household?.id)}&month=2026-09`, { cookie: memberCookie });
    ok(webOwner.status === 200 && webOwner.html.includes('<input type="month" name="month" value="2026-09"') && ["동일 분배", "비율 분배", "인원수 분배", "품목별 참여자"].every((mode) => webOwner.html.includes(`>${mode}</option>`)), "2-i 웹 정산 화면에서 달과 네 방식(동일·비율·인원수·품목별 참여자)을 고른다");
    ok(webOwner.html.includes('action="/my/settlement/save"') && webMember.status === 200 && !webMember.html.includes('action="/my/settlement/save"'), "2-j 완료 이력 저장은 소유자·관리자에게만 있다(절: 소유자·관리자는 … 완료 이력)");
  }));
});

// ── 2. /group-accountbook ‘모임 총무로 쓰기’ ───────────────────────────────
await section("2 /group-accountbook 모임 총무로 쓰기", async () => {
  eq(group.status, 200, "2-k /group-accountbook 이 로그인 없이 열린다");
  eq(countOf(group.html, "<h2>모임 총무로 쓰기</h2>"), 1, "2-l ‘모임 총무로 쓰기’ 절이 하나 있다");
  const sectionId = (groupSection.match(/^<section class="pubSection" id="(section-\d+)">/) || [])[1];
  ok(!!sectionId && group.html.includes(`<a href="#${sectionId}">모임 총무로 쓰기</a>`), "2-m 페이지 목차에 그 절이 있다");
  ok(groupSection.includes('<div class="pubLinks"><a href="/demo#tour-settle">모임 정산 예시 둘러보기<span aria-hidden="true"> →</span></a><a href="/kakao-guide">카카오 입력·수정 방법'), "2-n 절 끝에 둘러보기 일곱째 단계(/demo#tour-settle)와 카카오 입력 안내 링크가 있다");
  eq(forbiddenIn(groupText), [], "2-o 절에 유료·가격·플랜·결제 낱말이 없다");
  const claims = [
    "‘@말해가계부 숙소 200000원’처럼 한 줄씩 보내면", "보낸 사람이 지출자가 됩니다", "소유자·관리자가 웹 거래 내역에서 지출자를 바꿉니다",
    "‘정산’이라고 보냅니다", "‘내 이름 민지’처럼 정해 둔 이름", "‘카카오사용자 1’처럼 번호가 붙습니다",
    "‘회비 30000원 입금’처럼 수입으로", "‘이번 달 요약’에서 수입과 지출을 함께 봅니다", "수입은 넣지 않습니다", "자기 돈을 낸 것처럼 계산되므로",
    "참여 전이라 빠집니다", "초대코드로 참여를 요청하고", "권한을 구성원으로 바꾸면 함께 나눕니다",
    "이번 달 지출을 똑같이 나누고", "각각 8개까지", "달과 방식을 골라", "정산은 달 단위입니다", "송금은 자동으로 하지 않습니다", "완료 이력을 남길 수 있습니다",
  ];
  eq(claims.filter((claim) => !groupText.includes(claim)), [], "2-p 절이 아래에서 앱과 대조하는 문장들을 그대로 적는다");
  ok(bubbles[0]?.text === "@말해가계부 숙소 200000원" && groupText.includes(`‘${bubbles[0]?.text}’`), "2-q 절의 기록 예시가 둘러보기 첫 기록 말풍선과 같다");

  // 이름을 정하지 않은 열 사람: 기본 이름 번호, 카카오 답은 참여자·송금 제안 8개까지, 나머지는 웹 정산 화면.
  await roomFixture((fx) => withClock("2026-09-27", async () => {
    const room = "qa-v22997-demo-ten";
    const keys = Array.from({ length: 10 }, (_, i) => `qa-v22997-ten-${i + 1}`);
    await roomSay(fx, room, keys[0], "@말해가계부 숙소 100000원");
    for (let i = 1; i < keys.length; i += 1) await roomSay(fx, room, keys[i], `@말해가계부 간식 ${1000 + i * 100}원`);
    const lines = (await roomSay(fx, room, keys[0], "@말해가계부 정산")).split("\n");
    ok(lines.includes("참여자: 10명") && lines.some((line) => line.startsWith("• 카카오사용자 1: ")), "2-r 이름을 정하지 않으면 ‘카카오사용자 1’처럼 번호가 붙는다(10명)");
    ok(personLines(lines).length === 8 && lines.includes("외 2명은 웹 정산 화면에서 볼 수 있어요."), "2-s 카카오 답은 참여자 8명까지 보이고 나머지는 ‘외 2명’으로 웹 정산 화면을 가리킨다");
    ok(transferLines(lines).length === 8 && lines.includes("외 1건은 웹 정산 화면에서 볼 수 있어요."), "2-t 송금 제안도 8건까지 보이고 나머지는 ‘외 1건’이다");
    const household = roomHouseholdOf(fx, keys[0]);
    const web = await page(fx, `/settlement-summary?household_id=${encodeURIComponent(household?.id)}&month=2026-09`, { cookie: await fx.cookieFor(userIdOf(fx, keys[0])) });
    const hidden = ["카카오사용자 2", "카카오사용자 3"];
    ok(web.status === 200 && hidden.every((name) => web.html.includes(name) && !lines.some((line) => line.startsWith(`• ${name}: `))), "2-u 카카오 답에서 빠진 사람도 웹 정산 화면에는 있다(절: 나머지 사람 … 웹의 정산 화면에서)");
  }));

  // 회비: 걷은 회비는 수입, 요약에 함께 나오고, 정산은 지출만 나눠 기록한 사람이 낸 것처럼 계산한다.
  await roomFixture((fx) => withClock("2026-09-27", async () => {
    const room = "qa-v22997-demo-dues";
    const [a, b] = ["qa-v22997-dues-a", "qa-v22997-dues-b"];
    const before = fx.db.transactions.length;
    await roomSay(fx, room, a, "@말해가계부 회비 30000원 입금");
    await roomSay(fx, room, b, "@말해가계부 회비 30000원 입금");
    await roomSay(fx, room, a, "@말해가계부 회식 50000원");
    eq(fx.db.transactions.slice(before).map((row) => [row.type, Number(row.amount)]), [["income", 30000], ["income", 30000], ["expense", 50000]], "2-v ‘회비 30000원 입금’은 수입으로, 회식은 지출로 저장된다");
    const summary = (await roomSay(fx, room, a, "@말해가계부 이번 달 요약")).split("\n");
    ok(summary.includes("지출: 50,000원 · 1건") && summary.includes("수입: 60,000원"), "2-w ‘이번 달 요약’에 걷은 회비(수입)와 쓴 돈(지출)이 함께 나온다");
    const settle = (await roomSay(fx, room, a, "@말해가계부 정산")).split("\n");
    ok(settle.includes("총 지출: 50,000원") && settle.includes("참여자: 2명") && settle.includes("• 카카오사용자 1: 25,000원 받기"), "2-x 정산은 수입을 넣지 않고, 회비에서 쓴 지출도 기록한 사람이 낸 것처럼 나눈다(절의 주의 문장)");
  }));

  // 달 단위: 9월 30일 기록은 10월 1일의 ‘정산’에 들어가지 않는다.
  await roomFixture(async (fx) => {
    const room = "qa-v22997-demo-month";
    const [a, b] = ["qa-v22997-month-a", "qa-v22997-month-b"];
    await withClock("2026-09-30", () => roomSay(fx, room, a, "@말해가계부 숙소 200000원"));
    const lines = await withClock("2026-10-01", async () => {
      await roomSay(fx, room, b, "@말해가계부 저녁 60000원");
      return (await roomSay(fx, room, a, "@말해가계부 정산")).split("\n");
    });
    ok(lines[0] === "📊 2026-10 정산" && lines.includes("총 지출: 60,000원"), "2-y 카카오 정산은 이번 달 지출만 나눈다(9월 30일 기록은 10월 정산에 없다)(절: 정산은 달 단위)");
  });
});

// ── 3. /faq 새 문항 ─────────────────────────────────────────────────────────
await section("3 /faq 새 문항", async () => {
  eq(faq.status, 200, "3-a /faq 가 로그인 없이 열린다");
  eq(countOf(faq.html, `<summary>${QUESTION}</summary>`), 1, "3-b 새 문항이 하나 있다");
  const at = faq.html.indexOf(`<details><summary>${QUESTION}</summary>`);
  const item = at < 0 ? "" : faq.html.slice(at, faq.html.indexOf("</details>", at) + "</details>".length);
  const answer = decode((item.match(/<\/summary><p>([^<]*)<\/p>/) || ["", ""])[1]);
  ok(item.endsWith(`${TOUR_LINK}</div></details>`), "3-c 답 아래에 둘러보기 일곱째 단계 링크(/demo#tour-settle) 한 줄이 있다");
  const facts = ["봇을 부르고", "기록한 사람이 지출자가 됩니다", "‘정산’을 보내면", "1인 기준", "송금 제안", "소유자·관리자가 웹 거래 내역에서 지출자를 바꾸고", "웹 정산 화면", "수입으로 적은 돈은 정산에 넣지 않으며", "송금은 직접"];
  eq(facts.filter((fact) => !answer.includes(fact)), [], "3-d 답이 방·지출자·정산·지출자 바꾸기·웹 정산·수입 제외·송금을 사실대로 적는다(2절에서 대조한 사실)");
  eq(forbiddenIn(`${QUESTION} ${answer}`), [], "3-e 새 문항에 유료·가격·플랜·결제 낱말이 없다");
  eq(countOf(faq.html.slice(faq.html.indexOf('<div class="pubFaq">'), faq.html.indexOf('<div class="pubFaq">') >= 0 ? faq.html.indexOf("</div>", faq.html.lastIndexOf("</details>")) : 0), '<div class="pubLinks">'), 1, "3-f 링크를 단 문항은 새 문항 하나뿐이다(다른 답은 그대로)");
  const structured = structuredOf(faq.html);
  ok(structured["@type"] === "FAQPage" && Array.isArray(structured.mainEntity) && structured.mainEntity.length === countOf(faq.html, "<details><summary>"), "3-g FAQPage 구조화 데이터의 문항 수가 화면 문항 수와 같다(새 문항만큼 함께 늘었다)");
  eq(structured.mainEntity?.find((q) => q.name === QUESTION)?.acceptedAnswer?.text, answer, "3-h 구조화 데이터의 새 문항 답이 화면 답과 같다(링크 없이 글만)");
  eq(countOf(inlineCss(faq.html), FAQ_LINK_CSS), 1, "3-i 답 아래 링크의 여백 규칙이 /faq 에 한 번 있다");
});

// ── 4. 수정일·사이트맵·CSS 자리·첫 화면·바깥 요청 ─────────────────────────────
await section("4 수정일·사이트맵·첫 화면", async () => {
  const xml = (await publicPage("/sitemap.xml")).html;
  const lastmodOf = (path) => ((xml.split(`<loc>${BASE}${path}</loc>`)[1] || "").match(/^\s*<lastmod>([^<]+)<\/lastmod>/) || [])[1];
  for (const [path, html] of [["/demo", demo.html], ["/group-accountbook", group.html], ["/faq", faq.html]]) {
    ok(html.includes(`안내 수정 <time datetime="${REVISION}">${REVISION}</time>`) && structuredOf(html).dateModified === REVISION && lastmodOf(path) === REVISION, `4-a ${path} 의 안내 수정일·구조화 데이터·사이트맵 lastmod 가 내용을 바꾼 ${REVISION} 이다`);
  }
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok(locs.length > 0 && !locs.some((loc) => loc.includes("#")) && ["/demo", "/group-accountbook", "/faq"].every((path) => countOf(xml, `<loc>${BASE}${path}</loc>`) === 1), "4-b 사이트맵에 조각 주소가 없고 세 화면은 한 번씩이다(새 페이지 없음)");

  const demoCss = inlineCss(demo.html);
  ok(Buffer.byteLength(demo.html) <= 72 * 1024 && Buffer.byteLength(demoCss) <= 24 * 1024, `4-c /demo HTML 72 KiB·인라인 CSS 24 KiB 이하다 (${Buffer.byteLength(demo.html)} B · ${Buffer.byteLength(demoCss)} B)`);
  const note = (demoCss.match(/\.pubTour p\.pubChatNote\{[^}]*\}/) || [""])[0];
  const peer = (demoCss.match(/\.pubChatPeer b\{[^}]*\}/) || [""])[0];
  const chatBg = ((demoCss.match(/\.pubChat\{[^}]*background:(#[0-9a-f]{6})/) || [])[1]) || "#000000";
  const hex = (rule, prop) => ((rule.match(new RegExp(`(?:^|[;{])${prop}:(#[0-9a-f]{6})`)) || [])[1]) || "#000000";
  ok(!!note && contrast(hex(note, "color"), hex(note, "background")) >= 4.5 && !!peer && contrast(hex(peer, "color"), chatBg) >= 4.5, `4-d 생략 안내 줄(${hex(note, "color")}/${hex(note, "background")})과 다른 사람 이름표(${hex(peer, "color")}/${chatBg})의 대비가 4.5:1 이상이다`);
  const home = await publicPage("/");
  const others = { "/": home.html, "/faq": faq.html, "/group-accountbook": group.html };
  ok(Object.values(others).every((html) => !html.includes("pubChatPeer") && !html.includes("pubChatNote")), "4-e 단톡방 말풍선 CSS·HTML 은 /demo 에만 싣는다(/, /faq, /group-accountbook 에 없다)");
  const article = await publicPage("/household-spending-statistics");
  ok(article.html.includes("<details><summary>") && [home.html, demo.html, group.html, article.html].every((html) => !html.includes(FAQ_LINK_CSS)), "4-f FAQ 링크 여백 규칙은 링크를 단 답이 있는 /faq 에만 싣는다(FAQ 가 있는 생활비 글·/·/demo·/group-accountbook 에 없다)");
  ok(home.status === 200 && ["tour-settle", "모임 총무로 쓰기", QUESTION].every((needle) => !home.html.includes(needle)), "4-g 첫 화면(/)에는 새 단계·절·문항이 없다(첫 화면은 그대로)");
  eq(outbound, 0, "4-h 공개 화면을 그리는 동안 바깥 요청이 없다");
});

if (failures.length) for (const line of failures) console.error(`실패: ${line}`);
if (failures.length) { console.error(`V22.9.97 모임 정산 둘러보기 검사 실패 checks ${checks} failed ${failures.length}`); process.exit(1); }
console.log(`V22.9.97 모임 정산 둘러보기 검사 통과 (${checks} checks)`);

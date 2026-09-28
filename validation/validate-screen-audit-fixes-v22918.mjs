// V22.9.18 — 화면을 실제 브라우저로 띄워 잰 결함들 (tools/screen-audit.mjs 로 찾았다).
//
// 구조 계측으로는 보이지 않던 것들이다. 이 검사는 브라우저 없이 돌아야 하므로
// "고친 규칙이 화면에 도착하는가"와 "선언한 색 쌍이 WCAG AA 를 넘는가"를 직접 계산한다.
//
// 1. /reserve-plans 가 390px 휴대폰에서 594px 로 넓어졌다. 수입·지출 세그먼트의 숨긴 라디오가
//    모바일 규칙 `.formGrid input{width:100%}`(같은 명시도, 뒤에 옴)에 덮여 390px 이 되고,
//    기준 조상 없이 position:absolute 라 화면 밖으로 뻗었다. 화면 전체 글자가 작아진다.
// 2. 리포트 월 이동 바 — 현재 달의 "이번 달"은 <span> 인데 모양 규칙이 a,button 에만 걸려
//    네모난 입력칸처럼 보였다. 모바일에서 이 고정 바가 3줄(~200px)이라 스크롤 내내 화면의
//    1/4 을 가렸다 → 한 줄(‹ 월·이동 ›).
// 3. 리포트 3열 표가 min-width:520px 로 390px 에서 좌우 스크롤을 강요했다.
// 4. 최근 내역 — 행마다 "수정/삭제" 접기 줄이 따로 붙었다. 행 본문이 그 접기의 summary 가 된다.
// 5. 다크 대비 — 정기 화면 배지·수정 단추·세그먼트 1.05~1.65:1, 홈 "일별" 탭 1.8:1,
//    예산 탭 2.4~3.0:1, 거래 내역 필터 제목 1.5~2.2:1. 라이트 탭 보조 글자 2.58:1,
//    거래 내역 수입 금액 3.42:1.

import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
function ok(value, label) {
  if (!value) throw new Error(`FAIL: ${label}`);
  checks += 1;
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${expected}, got ${actual})`);
  checks += 1;
}

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const base = "https://ttokttok-accountbook.com";
const mobileUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari";
const ctx = { waitUntil() {}, passThroughOnException() {} };
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-07-15T12:00:00+09:00");
const fixture = await createV2265QaFixture();
const H = "household_id=house-home";

async function get(path, cookie = fixture.cookie) {
  const response = await app.fetch(new Request(`${base}${path}`, { headers: { cookie, "user-agent": mobileUA } }), fixture.env, ctx);
  return { status: response.status, text: await response.text() };
}

// WCAG 2.x 상대 휘도 대비. 반투명은 바탕과 섞은 뒤 잰다.
function hex(value) {
  const v = value.replace("#", "");
  const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function over(rgba, backdrop) {
  const [r, g, b, a] = rgba;
  const bg = hex(backdrop);
  return [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)];
}
function contrast(fg, bg) {
  const L1 = luminance(Array.isArray(fg) ? fg : hex(fg));
  const L2 = luminance(Array.isArray(bg) ? bg : hex(bg));
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}
function aa(fg, bg, label, need = 4.5) {
  const ratio = contrast(fg, bg);
  ok(ratio >= need, `${label} — ${ratio.toFixed(2)}:1 ≥ ${need}:1`);
}

try {
  // -------------------------------------------------------------------------
  // 1. 정기 화면 세그먼트의 숨긴 라디오
  // -------------------------------------------------------------------------
  {
    const page = await get(`/reserve-plans?${H}`);
    eq(page.status, 200, "정기 화면이 렌더된다");
    ok(page.text.includes('class="reserveTypeSeg"'), "수입·지출 세그먼트가 있다");
    ok(page.text.includes(".reserveTypeSeg label{flex:1;margin:0;position:relative}"), "라디오의 기준 조상이 라벨이다(화면 밖으로 뻗지 않는다)");
    ok(page.text.includes(".formGrid .reserveTypeSeg input[type=radio],.reserveTypeSeg input[type=radio]{position:absolute;inset:0;opacity:0;width:100%;height:100%;min-height:0;"),
      "라디오 규칙이 모바일 `.formGrid input{width:100%}` 보다 명시도가 높다");
    eq(page.text.includes(".reserveTypeSeg input{position:absolute;opacity:0;width:0;height:0}"), false, "덮이던 예전 규칙이 남아 있지 않다");
    ok(page.text.includes(".reserveTypeSeg input:focus-visible+span{outline:3px solid #2563eb"), "숨긴 라디오에 키보드 초점 표시가 있다");
    const mediaAt = page.text.indexOf("@media(max-width:760px)");
    const radioAt = page.text.indexOf(".formGrid .reserveTypeSeg input[type=radio]");
    ok(mediaAt > 0 && radioAt > 0, "모바일 규칙과 라디오 규칙이 같은 스타일에 있다");
    ok(page.text.includes(".reserveCard span:not(.reserveEdit *),.reserveAmt small,.note{display:block;color:#64748b;"), "카드 보조 글자색이 카드 안 수정 폼까지 들어가지 않는다");
  }

  // -------------------------------------------------------------------------
  // 2·3. 리포트 월 이동 바와 표
  // -------------------------------------------------------------------------
  {
    const current = await get(`/reports?month=2026-07&${H}`);
    eq(current.status, 200, "이번 달 리포트가 렌더된다");
    ok(current.text.includes('<span class="reportMonthCurrent" aria-current="date">이번 달</span>'), "현재 달이면 이번 달 표시는 링크가 아닌 표식이다");
    ok(source.includes(".reportMonthNav a,.reportMonthNav button,.reportMonthNav .reportMonthCurrent{min-height:44px;"), "이번 달 표식도 단추와 같은 모양 규칙을 받는다");
    ok(source.includes(".reportMonthNav{top:calc(52px + env(safe-area-inset-top,0px));grid-template-columns:auto minmax(0,1fr) auto}"), "모바일 월 이동 바는 한 줄 3칸이다");
    ok(source.includes(".reportMonthNav>.reportMonthArrow:first-child{grid-column:1;grid-row:1}") && source.includes(".reportMonthNav>form+.reportMonthArrow{grid-column:3;grid-row:1}"), "이전·다음 달이 입력칸 양옆에 있다");
    ok(source.includes(".reportMonthNav>span.reportMonthCurrent{display:none}"), "모바일에서 현재 달 표식은 줄을 차지하지 않는다(입력칸이 이미 달을 보여 준다)");
    ok(source.includes(".reportMonthNav>a.reportMonthCurrent{grid-column:1/-1;grid-row:2;min-height:36px}"), "다른 달을 볼 때만 '이번 달' 링크가 둘째 줄에 온다");
    const prev = await get(`/reports?month=2026-06&${H}`);
    ok(prev.text.includes('<a class="reportMonthCurrent" href="'), "다른 달이면 이번 달로 가는 링크가 있다");

    ok(current.text.includes('<div class="tableWrap tableFit"><table><thead><tr><th>분류</th><th>금액</th><th>건수</th>'), "분류 표가 화면 폭에 맞춘다");
    eq(current.text.includes("table{width:100%;border-collapse:collapse;min-width:520px}"), false, "리포트 표에 520px 최소 폭이 없다");
    ok(current.text.includes(".abV2281 .tableWrap.tableFit:before,.tableWrap.tableFit:before{content:none;display:none}"), "맞춘 표에는 '좌우로 밀어서' 안내가 붙지 않는다");
  }

  // -------------------------------------------------------------------------
  // 4. 최근 내역 행 = 수정 접기의 summary
  // -------------------------------------------------------------------------
  {
    const home = await get(`/app?${H}`);
    eq(home.status, 200, "홈이 렌더된다");
    eq((home.text.match(/<summary>수정\/삭제<\/summary>/g) || []).length, 0, "행마다 붙던 '수정/삭제' 줄이 없다");
    const rows = (home.text.match(/<article class="v8-tx"/g) || []).length;
    const summaries = (home.text.match(/<summary class="v8-tx-main">/g) || []).length;
    ok(rows > 0, `최근 내역 행이 있다 (${rows}건)`);
    eq(summaries, rows, "편집할 수 있는 행은 모두 행 본문이 접기 제목이다");
    eq((home.text.match(/data-ab-edit-src="/g) || []).length, rows, "지연 로드 계약은 그대로 행마다 하나");
    eq((home.text.match(/class="v8-editOpen"/g) || []).length, rows, "JS 없이 쓸 링크도 그대로 행마다 하나");
    ok(/<summary class="v8-tx-main"><div><b>[^<]+<\/b><span>[^<]+<\/span><span class="v8-spender">[^<]+<\/span><\/div><strong class="(expense|income)">[^<]+<\/strong><i class="srOnly">수정·삭제<\/i><\/summary>/.test(home.text),
      "행 제목은 내용·금액을 그대로 읽고, 화면 낭독기에는 '수정·삭제'를 덧붙인다");

    const tx = await get(`/app?month=2026-07&${H}&tab=transactions`);
    ok(tx.text.includes('<section class="txDayGroup">') && tx.text.includes('<summary class="v8-tx-main">'), "거래 내역 탭도 같은 행 구조를 쓴다");

    // 편집 권한이 없는 행은 접기 없이 본문만
    const memberCookie = await fixture.cookieFor("user-wifi");
    const memberHome = await get(`/app?${H}`, memberCookie);
    eq(memberHome.status, 200, "구성원 홈이 렌더된다");
    const memberRows = (memberHome.text.match(/<article class="v8-tx"/g) || []).length;
    const memberSummaries = (memberHome.text.match(/<summary class="v8-tx-main">/g) || []).length;
    const memberPlain = (memberHome.text.match(/<article class="v8-tx"[^>]*><div class="v8-tx-main">/g) || []).length;
    eq(memberSummaries + memberPlain, memberRows, "구성원 화면의 행은 편집 가능하면 접기, 아니면 본문만이다");

    const css = await app.fetch(new Request(`${base}/assets/mobile-home-v22918.css`), fixture.env, ctx).then((r) => r.text());
    ok(css.includes(".v8-tx summary.v8-tx-main,body.abV22812Shell .v8-tx summary.v8-tx-main{display:flex;"), "행 제목이 셸의 summary 규칙(파란 굵은 글자)보다 명시도가 높다");
    ok(css.includes(".v8-tx summary.v8-tx-main::-webkit-details-marker{display:none}"), "행 제목에 기본 삼각표가 붙지 않는다");
    ok(css.includes(".v8-tx details[open]>summary.v8-tx-main>strong::after{transform:rotate(90deg)}"), "펼침 상태가 금액 옆 표시로 보인다");
    ok(css.includes(".v8-tx summary.v8-tx-main:focus-visible{outline:3px solid #2563eb"), "행 제목에 키보드 초점 표시가 있다");
    ok(home.text.includes('href="/assets/mobile-home-v22918.css"'), "홈이 새 주소의 스타일시트를 받는다(옛 1년 캐시와 섞이지 않는다)");
  }

  // -------------------------------------------------------------------------
  // 5. 대비 — 규칙이 도착하는지와, 그 색 쌍이 AA 를 넘는지
  // -------------------------------------------------------------------------
  {
    const shell = await app.fetch(new Request(`${base}/assets/accountbook-shell-v22918.css`), fixture.env, ctx).then((r) => r.text());
    const home = await app.fetch(new Request(`${base}/assets/mobile-home-v22918.css`), fixture.env, ctx).then((r) => r.text());
    const D = 'html[data-ab-resolved-theme="dark"] body.abV22812Shell';

    // 정기 화면 — 카드 전체에 거는 글자색이 수정 폼 안까지 들어가지 않는다
    ok(shell.includes('html:not([data-ab-resolved-theme="dark"]) body.abV22812Shell.abPageReserve .reserveCard.alert :is(b,strong,span,small):not(.reserveEdit *){color:var(--ab12-accent)!important}'), "라이트 알림 카드 강조색이 수정 폼 세그먼트를 칠하지 않는다");
    ok(shell.includes(`${D}.abPageReserve .reserveCard :is(b,strong,span,small):not(.reserveEdit *){color:inherit!important}`), "다크 카드 상속색이 수정 폼에 들어가지 않는다");
    ok(shell.includes(`${D}.abPageReserve .reserveKind.kindExpense{background:rgba(248,113,113,.18);color:#fca5a5!important}`), "다크 지출 배지");
    ok(shell.includes(`${D}.abPageReserve .reserveKind.kindIncome{background:rgba(52,211,153,.18);color:#6ee7b7!important}`), "다크 수입 배지");
    ok(shell.includes(`${D}.abPageReserve .reserveKind.kindRepeat{background:rgba(129,140,248,.22);color:#c7d2fe!important}`), "다크 반복 배지");
    ok(shell.includes(`${D}.abPageReserve .reserveEdit summary{background:rgba(147,197,253,.16);color:#bfdbfe}`), "다크 수정 단추");
    ok(shell.includes(`${D}.abPageReserve .reserveTypeSeg span{background:var(--ab12-surface-raised,#262a33);color:var(--ab12-text,#edeff3)!important}`), "다크 세그먼트");
    ok(shell.includes(`${D}.abPageReserve .reserveTypeSeg input:checked+span{background:#1d4ed8;color:#fff!important}`), "다크 선택 세그먼트");
    const card = "#262a33"; // 다크 카드(raised)
    aa("#fca5a5", over([248, 113, 113, 0.18], card), "다크 지출 배지 글자");
    aa("#6ee7b7", over([52, 211, 153, 0.18], card), "다크 수입 배지 글자");
    aa("#c7d2fe", over([129, 140, 248, 0.22], card), "다크 반복 배지 글자");
    aa("#bfdbfe", over([147, 197, 253, 0.16], card), "다크 수정 단추 글자");
    aa("#edeff3", card, "다크 세그먼트 글자");
    aa("#ffffff", "#1d4ed8", "다크 선택 세그먼트 글자");

    // 홈 — 다크 활성 탭은 밝은 파랑 바탕이다
    ok(shell.includes(`${D} .homeTrendSeg .homeTrendOn{background:var(--ab12-accent)!important;color:#0b1220!important;`), "다크 '일별' 탭 글자가 어둡다");
    aa("#0b1220", "#93c5fd", "다크 활성 추세 탭");
    ok(home.includes('html[data-ab-resolved-theme="dark"] .homeWeek li.isToday em,html[data-ab-resolved-theme="dark"] .homeUsage>span em{color:var(--ab12-accent,#93c5fd)}'), "다크 주간 띠 오늘·수입 대비 사용률 숫자");
    aa("#93c5fd", "#1d2c42", "다크 주간 띠 오늘 날짜");
    aa("#93c5fd", "#1e2026", "다크 수입 대비 사용률");
    aa("#fcd34d", "#1e2026", "다크 사용률 주의");
    aa("#fca5a5", "#1e2026", "다크 사용률 초과");

    // 거래 내역 탭 — 행이 흰 카드가 아니라 회색 페이지 위에 있다
    ok(home.includes('html:not([data-ab-resolved-theme="dark"]) .txDayGroup .v8-tx-main strong.income{color:#047857}'), "거래 내역 수입 금액 색");
    aa("#566175", "#f2f4f6", "거래 내역 날짜·분류 줄");
    aa("#c81e1e", "#f2f4f6", "거래 내역 지출 금액");
    aa("#047857", "#f2f4f6", "거래 내역 수입 금액");
    ok(home.includes('html[data-ab-resolved-theme="dark"] .txFilterMore>summary{color:var(--ab12-accent,#93c5fd)}'), "다크 거래 내역 필터 제목");
    aa("#93c5fd", "#1e2026", "다크 거래 내역 필터 제목");
    aa("#cbd5e1", "#282b33", "다크 상세 필터 제목");

    // 예산·정기·설정 상단 탭(페이지 인라인)
    const budgets = await get(`/budgets?month=2026-07&${H}`);
    ok(budgets.text.includes(".abMoneyPlanTabs a small{font-size:11px;color:#667085;font-weight:900}"), "라이트 탭 보조 글자");
    ok(budgets.text.includes('html[data-ab-resolved-theme="dark"] .abMoneyPlanTabs a.on{background:#1d4ed8;border-color:#1d4ed8;color:#fff!important}'), "다크 활성 탭 바탕");
    aa("#667085", "#ffffff", "라이트 탭 보조 글자");
    aa("#ffffff", "#1d4ed8", "다크 활성 탭 제목");
    aa("#dbeafe", "#1d4ed8", "다크 활성 탭 보조 글자");
    aa("#b3bdc9", "#1e2026", "다크 탭 보조 글자");
  }

  // -------------------------------------------------------------------------
  // 6. 불변 자산 — 내용이 바뀐 두 스타일시트는 새 주소로, 옛 주소는 쓰지 않는다
  // -------------------------------------------------------------------------
  {
    ok(source.includes('const MOBILE_HOME_CSS_ASSET_PATH = "/assets/mobile-home-v22918.css"'), "홈 스타일시트 주소가 v22918");
    ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22918.css"'), "셸 스타일시트 주소가 v22918");
    eq(source.includes("mobile-home-v22914.css"), false, "옛 홈 스타일시트 주소가 남아 있지 않다");
    eq(source.includes("accountbook-shell-v22914.css"), false, "옛 셸 스타일시트 주소가 남아 있지 않다");
    const reserve = await get(`/reserve-plans?${H}`);
    ok(reserve.text.includes('href="/assets/accountbook-shell-v22918.css"'), "정기 화면이 새 셸 스타일시트를 받는다");
  }
} finally {
  fixture.restore();
  delete globalThis.__AB_QA_FIXED_NOW_MS;
}

console.log(`PASS: V22.9.18 screen audit fixes (${checks} checks)`);

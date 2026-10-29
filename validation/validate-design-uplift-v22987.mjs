// V22.9.87 — 디자인 보강 4단계(docs/ux/MALHAEBOOK_UX_WORK_ORDER.md T-19 데스크톱 독 정리)와 V22.9.86 남은 결정(V-8·V-9·T-16 실행 취소) 검사.
//
// ── 이 파일이 왜 생겼는지 ──
//   T-19 900px 이상에서 본문 아래 가운데 떠 있던 4버튼 독(검색·빠른 입력·알림·화면 설정)이 스크롤 중 글줄을 덮었다
//        (T-08 고정 층 가림, 1280 평균: 예산 5.7%·리포트 5%·전체 메뉴 4%·홈 1.2%).
//   V86:V-8 지난달·다음 달을 보는 예산 카드 머리도 ‘이번 달 쓸 수 있는 돈’이었다.
//   V86:V-9 T-12 로 SMART NOTICE 띠가 빠지며 홈에서 ‘가장 가까운 정기 항목’ 한 건이 사라졌다.
//   V85:R-9 데스크톱 사이드바 현재 메뉴의 면 대비가 1.10~1.40:1 이고 테두리가 없었다(라이트 글자 #1b64da 고정, 다크는 모든 메뉴 글자가 강조색).
//   T-16 V22.9.86 은 저장 알림의 실행 취소를 만들지 않았다 — 삭제 길(/my/delete)이 ‘이 세션이 방금 만든 기록’을 보지 않아, 주소의 saved_rid 만으로
//        단추를 그리면 꾸민 주소로 남의 기록을 지우게 할 수 있었다. V22.9.87 은 저장 응답에 서버가 서명한 60초 표(로그인 사용자·가계부·기록 번호·
//        내용 지문)를 싣고, 새 경로 POST /my/undo 는 그 표만 받는다(사용자 결정 2026-10-29).
//
// ── 어떻게 잡는가 ──
// 화면 문구는 픽스처 홈 HTML 에서 본다. T-19 는 1년 캐시 자산 바이트(셸 CSS·nav JS)를 보고, 빠른 입력 단추 줄이기(bindQuickCompact)는 vm 가짜 창에서 돌린다.
// 실행 취소는 픽스처에서 실제로 저장 → 표 → 알림 폼 → POST /my/undo 를 돌리고, 거절 경우(위조·남의 세션·만료·저장 뒤 수정·‘기록만’ 구성원·
// 가계부에서 나감·교차 사이트·관리자 세션·다시 보낸 요청)를 하나씩 본다. 알림 타이머는 V5 accountbookSaveFeedbackClientMain 을 가짜 DOM 에서 돌린다.
// 실제 화면(900·1024·1280 겹침·가림, 390 모바일, 톤 8개)은 review-artifacts/design-uplift-2026-10-28/v87/ 의 브라우저 측정이 맡는다.
import vm from "node:vm";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "../tools/vendor/acorn.mjs";
import { app, BASE, ctx, counter, fixture, withClock, page, post, putSetting } from "./lib-audit-v22934.mjs";
import { quickUndoFingerprint, readQuickUndoTicket, signedPurposeToken } from "../src/modules/auth/identity-reauth.js";
import { designUplift3Css } from "../src/modules/assets/design-uplift-3-css.js";
import { designUplift4Css } from "../src/modules/assets/design-uplift-4-css.js";

const t = counter("V22.9.87 디자인 보강 4단계(데스크톱 독 정리·사이드바 현재 메뉴)와 V22.9.86 남은 결정(예산 카드 머리·가장 가까운 정기 항목·실행 취소)");
const HH = "house-home";
const HOME = `/app?month=2026-07&household_id=${HH}`;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const SHELL = "/assets/accountbook-shell-v22987.css";
const NAV = "/assets/accountbook-nav-v22987.js";
const V5 = "/assets/accountbook-v5-v22987.js";
const ADMIN_PASSWORD = "design-uplift-v22987-admin";
const count = (text, needle) => String(text).split(needle).length - 1;
const asset = async (path) => {
  const response = await app.fetch(new Request(`${BASE}${path}`), {}, ctx);
  t.eq(response.status, 200, `${path} 가 내려간다`);
  return response.text();
};
const home = async (fx, path = HOME, cookie = fx.cookie) => (await page(fx, path.replace(/#.*$/, ""), { cookie, headers: { "user-agent": UA } })).html;
const toast = (html) => (html.match(/<div class="abSaveFeedback[^]*?<\/button><\/div>/) || [""])[0];
const plain = (html) => String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// ── V86:V-8 예산 카드 머리 이름 (오늘 2026-07-15) ──
await withClock("2026-07-15", () => fixture(async (fx) => {
  for (const [month, label, why] of [
    ["2026-07", "이번 달 쓸 수 있는 돈", "이번 달은 그대로"],
    ["2026-06", "6월 예산에서 남은 돈", "지난달은 남은 돈"],
    ["2026-08", "8월 쓸 수 있는 돈", "다음 달은 그 달 이름"],
    ["2025-12", "2025년 12월 예산에서 남은 돈", "해가 다르면 연도까지"],
    ["2027-01", "2027년 1월 쓸 수 있는 돈", "다음 해도 연도까지"],
  ]) {
    const html = await home(fx, `/app?month=${month}&household_id=${HH}`);
    t.eq((html.match(/<div class="homeBudgetTop"><span>([^<]*)<\/span>/) || [])[1], label, `V-8 ${month} 예산 카드 머리: ${why}`);
  }
}));

// ── V86:V-9 홈 정기 카드 작은 줄의 가장 가까운 정기 항목 한 건 ──
const reserveLine = (html) => plain((html.match(/<a class="homeReserveCard"[^]*?<small>([^]*?)<\/small>/) || ["", ""])[1]).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const CAR = { id: "reserve-1", name: "자동차보험", amount: 1200000, due_months: [8], recurrence: "annual" };
await withClock("2026-07-15", () => fixture(async (fx) => {
  t.eq(reserveLine(await home(fx)), "자동차보험 납부 17일 전 · 준비 알림 1건", "V-9 기본 픽스처: 8월 1일 자동차보험이 맨 앞");
  for (const [plans, line, why] of [
    [[CAR, { id: "reserve-2", name: "직무수당", amount: 300000, type: "income", due_months: [7], due_day: 20, recurrence: "annual" }], "직무수당 입금 5일 전 · 준비 알림 1건 · 입금 예정 1건", "입금이 더 가까우면 입금"],
    [[CAR, { id: "reserve-2", name: "직무수당", amount: 300000, type: "income", due_months: [8], due_day: 1, recurrence: "annual" }], "자동차보험 납부 17일 전 · 준비 알림 1건 · 입금 예정 1건", "같은 날이면 지출을 먼저(옛 띠와 같다)"],
    [[CAR, { id: "reserve-3", name: "재산세", amount: 400000, due_months: [7], due_day: 15, recurrence: "annual" }], "재산세 납부 오늘 · 준비 알림 2건", "오늘이면 ‘오늘’"],
    [[{ id: "reserve-4", name: "<i>연회비", amount: 50000, due_months: [8], recurrence: "annual" }], "<i>연회비 납부 17일 전 · 준비 알림 1건", "이름은 글자로 적는다"],
    [[{ id: "reserve-5", name: "종합소득세", amount: 900000, due_months: [12], recurrence: "annual" }], "다가오는 납부 없음", "알림 창 밖이면 예전 문구"],
  ]) {
    putSetting(fx, `reserve_plans:${HH}`, JSON.stringify(plans));
    const html = await home(fx);
    t.eq(reserveLine(html), line, `V-9 ${why}`);
    if (line.startsWith("<i>")) t.ok(html.includes("<small>&lt;i&gt;연회비 납부 17일 전") && !html.includes("<i>연회비"), "V-9 항목 이름은 escapeHtml 을 거친다");
  }
}));

// ── T-19 데스크톱: 셸 CSS ──
const shell = await asset(SHELL);
const uplift4 = designUplift4Css();
t.ok(shell.includes(uplift4), "T-19 4단계 묶음(design-uplift-4-css.js)이 셸 CSS 에 그대로 실린다");
t.ok(shell.indexOf(designUplift3Css()) >= 0 && shell.indexOf(designUplift3Css()) + designUplift3Css().length <= shell.indexOf(uplift4) && shell.indexOf(uplift4) < shell.indexOf("/* ── V22.9.40 (C) 점진적 최신 규칙 ──"),
  "T-19 묶음은 3단계 뒤·V22.9.40 (C) 블록 앞이다(나중 규칙이 이긴다, (C) 는 맨 끝)");
for (const [needle, label] of [
  ["body.abV22812Shell .abNavKbd{display:none}", "‘/’ 표시는 기본으로 숨긴다(모바일 서랍)"],
  ["body.abV22812Shell .abNavSearchSlot .abGlobalAction{display:flex;width:100%;min-height:44px;", "사이드바 검색 줄은 44px 한 줄"],
  ["border:1px solid var(--ab12-line)!important;border-radius:12px;", "검색 줄은 1px 선·반경 12"],
  ["body.abV22812Shell .abNavSearchSlot .abNavKbd{display:inline-block;", "검색 줄 안에서만 ‘/’ 가 보인다"],
  ["body.abV22812Shell.abNavCollapsed .abNavSearchSlot .abNavKbd{display:none}", "사이드바를 접으면 ‘/’ 를 숨긴다"],
  ["body.abV22812Shell .abV5PageHeader>.abDeskActions{float:right;margin:-8px 0 6px 16px}", "아이콘 단추 묶음은 머리말 오른쪽 위에 띄운다(float — 제목·조작 줄이 비켜 흐른다)"],
  ["body.abV22812Shell .appTop.abV5PageHeader>.abDeskActions{margin-top:14px}", "홈 머리말은 가계부·월 조작 줄에 맞춘다"],
  ["body.abV22812Shell .abDeskActionsRow{justify-content:flex-end;margin:12px 0}", "머리말 없는 화면은 본문 맨 위 오른쪽 한 줄"],
  ["width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;margin:0!important;padding:0!important;", "아이콘 단추는 44×44, 바깥 여백까지 고정(리포트 머리말 button 3px 여백을 이긴다)"],
  ["body.abV22812Shell .abDeskActions .abV5NotifBadge{top:-4px;right:-4px;box-sizing:border-box;min-width:18px;height:18px;padding:0 5px;border:2px solid var(--ab12-surface);font-size:11px;line-height:14px}", "알림 배지는 18px·2px 바탕색 테두리"],
  ["@media(max-width:899px){body.abV22812Shell :is(.abDeskActions,.abNavSearchSlot){display:none!important}}", "900px 아래에서는 묶음·검색 줄이 남아 있어도 숨긴다"],
  ["body.abV22812Shell .abGlobalActions[data-ab-quick-dock]{left:auto!important;right:28px;bottom:24px;transform:none;gap:0;padding:0!important;border:0!important;border-radius:999px;background:transparent!important;-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none!important}", "독은 오른쪽 아래(28·24) 바탕 없는 틀"],
  ["body.abV22812Shell.abHasActivityRail .abGlobalActions[data-ab-quick-dock]{right:calc(var(--abActivityRailW,0px) + 28px)}", "오른쪽 활동 레일이 있으면 그 왼쪽"],
  ["max-width:220px;height:56px;min-height:56px;min-width:0;justify-content:flex-start;gap:8px;padding:0 22px 0 16px;border-radius:999px;", "빠른 입력 단추는 높이 56 알약(왼쪽 16 + 아이콘 24)"],
  [".abGlobalActionQuick .abNavIconSvg{width:24px!important;height:24px!important;flex:0 0 24px;", "빠른 입력 아이콘 24px"],
  ["body.abV22812Shell .abGlobalActions[data-ab-quick-dock].abQuickCompact .abGlobalActionQuick{max-width:56px;padding-right:0}", "줄면 56px 원(16+24+16)"],
  ["html[data-ab-resolved-theme=\"dark\"] body.abV22812Shell .abGlobalActions[data-ab-quick-dock] .abGlobalActionQuick{box-shadow:0 16px 40px rgba(0,0,0,.55)!important}", "다크 그림자는 따로"],
]) t.ok(uplift4.includes(needle), `T-19 ${label}`);
const fabStart = uplift4.indexOf("@media(min-width:900px){\n");
const fabBlock = fabStart < 0 ? "" : uplift4.slice(fabStart, uplift4.indexOf("\n}\n", fabStart));
t.ok(fabBlock.includes("left:auto!important;right:28px;bottom:24px") && fabBlock.includes("max-width:220px;height:56px") && fabBlock.includes(".abQuickCompact .abGlobalActionQuick{max-width:56px")
  && uplift4.replace(fabBlock, "").split("\n").filter((line) => line.includes("data-ab-quick-dock")).every((line) => line.startsWith("@media(min-width:900px) and (prefers-reduced-motion:no-preference){")),
  "T-19 독 규칙은 모두 900px 이상 안에 있다(모바일 하단 탭·입력 바는 그대로)");
t.eq(count(uplift4, "transition:"), 1, "T-19 전환은 한 곳뿐이다");
t.ok(uplift4.includes("@media(min-width:900px) and (prefers-reduced-motion:no-preference){body.abV22812Shell .abGlobalActions[data-ab-quick-dock] .abGlobalActionQuick{transition:max-width var(--ab12-dur,180ms) "), "T-19 줄어드는 전환은 움직임 줄이기가 아닐 때만, 눈금 --ab12-dur");
t.ok(!/#[0-9a-f]{3,8}\b/i.test(uplift4), "T-19·T-16 색은 모두 토큰(--ab12-*)이다 — 톤 8개·다크에서 같은 규칙");
t.ok(uplift4.includes("body.abV22812Shell .abSaveFeedbackUndo{display:contents}") && uplift4.includes("body.abV22812Shell button.abSaveFeedbackAction{margin:0;border:0;background:transparent;font:inherit;font-size:14px;font-weight:800;cursor:pointer}"),
  "T-16 실행 취소 폼은 상자를 만들지 않고 단추는 옆 링크(.abSaveFeedbackAction)와 같은 모양");
for (const [needle, label] of [
  ["@media(min-width:900px){\nbody.abV22812Shell .abLayoutNav .abNavLinks a{border:1px solid transparent!important}","900px 이상 메뉴 링크는 모두 투명 1px 테두리(현재 메뉴만 색이 생겨 글자가 밀리지 않는다)"],
  ["body.abV22812Shell .abLayoutNav .abNavLinks a.active{border-color:var(--ab12-accent)!important;background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important}", "현재 메뉴는 강조색 테두리·글자(톤을 따른다, 옛 #1b64da 고정 아님)"],
  ["html[data-ab-resolved-theme=\"dark\"] body.abV22812Shell .abLayoutNav .abNavLinks a:not(.active){color:var(--ab12-muted)!important}", "다크의 다른 메뉴 글자는 보조색(모두 강조색이던 것)"],
]) t.ok(uplift4.includes(needle), `V85:R-9 ${label}`);
t.ok(!/#1b64da/i.test(uplift4), "V85:R-9 새 규칙에는 고정 색이 없다");
t.ok(!quickUndoBlock(uplift4).includes("!important") && shell.includes("@media(forced-colors:active){\n  body.abV22812Shell :is(a,button,input,select,textarea,summary){border:1px solid ButtonText!important}"),
  "T-16 실행 취소 단추 규칙은 !important 없이 — 고대비 모드의 단추 테두리(ButtonText)가 그대로 걸린다");

// ── T-19 데스크톱: nav JS ──
const nav = await asset(NAV);
for (const [needle, label] of [
  ['<span>거래 검색</span><kbd class="abNavKbd" aria-hidden="true">/</kbd></button>', "검색 단추에 ‘/’ 단축키 표시(보조기기에는 읽히지 않는다)"],
  ['data-abv5-notif-open aria-label="알림 센터" title="알림 센터">', "알림 아이콘 단추는 이름과 마우스용 title"],
  ['data-ab-global-open="appearance" title="화면 설정">', "화면 설정 아이콘 단추에 title"],
  ['var DESK_HEAD_ACTIONS = ["[data-abv5-notif-open]", "[data-ab-global-open=\'appearance\']"];', "머리말 묶음은 알림·화면 설정(검색·빠른 입력은 아니다)"],
  ['document.querySelector(".abNavSearchSlot " + selector) || document.querySelector(".abDeskActions " + selector);', "새 자리도 찾아 폭이 바뀌면 되돌린다"],
  ['if (head && window.getComputedStyle(head).display === "block") return head;', "머리말이 블록일 때만 그 안에 넣는다(float 이 먹는 자리)"],
  ['cluster.setAttribute("role", "group");', "묶음은 group"],
  ['cluster.setAttribute("aria-label", "화면 도구");', "묶음 이름 ‘화면 도구’"],
  ["if (cluster.parentNode !== host) host.insertBefore(cluster, host.firstChild);", "묶음은 머리말 첫 자식(오른쪽 위)"],
  ['cluster.classList.toggle("abDeskActionsRow", host.id === "abMainContent");', "머리말이 없으면 본문 맨 위 한 줄"],
  ['var eye = document.querySelector(".abNavTop .abPrivacyEye");', "금액 가리기 눈 단추도 데스크톱 묶음으로"],
  ["if (deskEye && navTop) navTop.appendChild(deskEye);", "모바일 폭에서는 눈 단추를 사이드바 위 줄로 돌린다"],
  ["syncGlobalActionPlacement();\n    bindQuickCompact();", "빠른 입력 줄이기는 자리를 잡은 뒤 묶는다"],
]) t.ok(nav.includes(needle), `T-19 ${label}`);
const compact = compactHarness(nav);
t.eq(compact.options?.passive, true, "T-19 스크롤 리스너는 passive");
compact.scrollTo(100);
t.ok(compact.compact, "T-19 아래로 내리면 빠른 입력 단추가 원으로 준다");
compact.scrollTo(103);
compact.scrollTo(99);
t.ok(compact.compact, "T-19 4px 이하 흔들림에는 그대로다");
compact.scrollTo(60);
t.ok(!compact.compact, "T-19 위로 올리면 다시 펼친다");
compact.scrollTo(400, { flush: false });
compact.scrollTo(450, { flush: false });
t.eq(compact.frames.length, 1, "T-19 스크롤 여러 번은 한 프레임으로 묶는다");
compact.flush();
t.ok(compact.compact, "T-19 묶인 프레임은 마지막 위치로 판단한다");
compact.scrollTo(0);
t.ok(!compact.compact, "T-19 맨 위면 늘 펼친다");

// ── T-16 실행 취소: 서명한 표 ──
const SAVE = { household_id: HH, month: "2026-07", transaction_date: "2026-07-15", type: "expense", amount: "7000", memo: "점심", category: "식비", payment_method: "현금", user_id: "user-bin", raw_text: "", return_to: HOME };
const params = (location) => new URL(location || "/", BASE).searchParams;
const save = async (fx, extra = {}, cookie = fx.cookie) => {
  const response = await post(fx, "/admin/transactions", { ...SAVE, request_id: crypto.randomUUID(), ...extra }, { cookie });
  return { ...response, rid: params(response.location).get("saved_rid") || "", ticket: params(response.location).get("undo") || "" };
};
const undo = (fx, ticket, { cookie = fx.cookie, returnTo = HOME } = {}) => post(fx, "/my/undo", { ticket, month: "2026-07", return_to: returnTo }, { cookie });
const has = (fx, id) => fx.db.transactions.some((row) => String(row.id) === String(id));
const rowOf = (fx, id) => fx.db.transactions.find((row) => String(row.id) === String(id));
const errOf = (response) => params(response.location).get("err") || "";
const msgOf = (response) => params(response.location).get("msg") || "";
const decodeTicket = (ticket) => JSON.parse(Buffer.from(ticket.slice(0, ticket.lastIndexOf(".")), "base64url").toString("utf8"));
// 서버의 용도 표(identity-reauth.js signedPurposeToken: HMAC-SHA256(USER_SESSION_SECRET, "용도:" + 본문), base64url)를 검사 쪽에서 만든다
// — 서버 비밀로 서명했어도 내용이 틀린 표, 다른 용도로 서명한 표를 만들 수 있게.
const signTicket = (secret, payload, purpose = "quick-undo") => {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${data}.${createHmac("sha256", secret).update(`${purpose}:${data}`).digest("base64url")}`;
};

await withClock("2026-07-15", () => fixture(async (fx) => {
  const secret = fx.env.USER_SESSION_SECRET;
  const saved = await save(fx);
  t.eq(saved.status, 303, "T-16 빠른 입력 저장은 303");
  t.ok(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(saved.ticket) && saved.ticket.length <= 1024, "T-16 저장 주소에 서명한 실행 취소 표(undo)가 붙는다");
  const payload = decodeTicket(saved.ticket);
  const nowSeconds = Math.floor(Date.now() / 1000);
  t.deepEq(Object.keys(payload), ["r", "h", "u", "f", "purpose", "exp"], "T-16 표 칸은 기록·가계부·사용자·지문과 용도 표의 용도·끝나는 때");
  t.ok(payload.purpose === "quick-undo" && payload.r === saved.rid && payload.h === HH && payload.u === "user-bin", "T-16 표는 이 로그인 사용자·가계부·방금 만든 기록 번호를 담은 quick-undo 용도 표다");
  t.ok(payload.exp - nowSeconds >= 59 && payload.exp - nowSeconds <= 61, "T-16 표는 60초 뒤 끝난다");
  t.ok(/^[0-9a-f]{32}$/.test(payload.f) && !saved.ticket.includes("점심") && !Buffer.from(saved.ticket.split(".")[0], "base64url").toString("utf8").includes("점심") && !JSON.stringify(payload).includes("7000"),
    "T-16 표에는 기록 내용 대신 지문(32자)만 있다 — 주소에 금액·메모가 남지 않는다");
  t.eq(signTicket(secret, payload), saved.ticket, "T-16 검사의 서명 재현이 서버와 같다(아래 꾸민 표 검사의 전제)");
  t.eq(payload.f, await quickUndoFingerprint(rowOf(fx, saved.rid)), "T-16 지문은 저장된 행에서 다시 계산한 값과 같다");
  t.deepEq(await readQuickUndoTicket(fx.env, saved.ticket, "user-bin"), payload, "T-16 서버 판독은 같은 사용자에게만 표를 돌려준다");
  t.eq(await readQuickUndoTicket(fx.env, saved.ticket, "user-wifi"), null, "T-16 다른 사용자에게는 null");

  const box = toast(await home(fx, saved.location));
  const form = box.match(/<form class="abSaveFeedbackUndo" method="post" action="\/my\/undo">([^]*?)<\/form>/);
  t.ok(!!form, "T-16 성공 알림에 실행 취소 폼(POST /my/undo)이 있다");
  t.ok(form && form[1].includes(`<input type="hidden" name="ticket" value="${saved.ticket}">`) && form[1].includes('<input type="hidden" name="month" value="2026-07">')
    && form[1].includes(`<input type="hidden" name="return_to" value="/app?month=2026-07&amp;household_id=${HH}">`), "T-16 폼은 표·달·돌아갈 화면(알림 값을 뺀 주소)을 싣는다");
  t.ok(form && form[1].endsWith('<button type="submit" class="abSaveFeedbackAction" data-ab-undo>실행 취소</button>') && !box.includes("data-ab-undo-edit"), "T-16 단추 이름은 ‘실행 취소’, 표가 있으면 수정 링크는 없다");

  const done = await undo(fx, saved.ticket);
  t.ok(done.status === 303 && done.location === `${HOME}&msg=undone`, "T-16 실행 취소는 저장했던 화면으로 msg=undone 을 들고 돌아간다");
  t.ok(!has(fx, saved.rid), "T-16 방금 만든 기록이 지워진다");
  const call = fx.db.__rpc_calls.filter((item) => item.name === "accountbook_delete_transaction_v227").at(-1);
  t.ok(call && call.data.p_transaction_id === saved.rid && call.data.p_household_id === HH && call.data.p_actor_user_id === "user-bin" && call.data.p_actor_kind === "user",
    "T-16 지우기는 보통 삭제와 같은 감사 함수(누가·user)를 거친다");
  t.eq(errOf(await undo(fx, saved.ticket)), "record_not_found", "T-16 같은 표를 다시 보내도 더 지우지 않는다");
  const after = toast(await home(fx, done.location));
  t.ok(after.includes("<b>저장을 취소했습니다</b>") && after.includes("방금 기록을 지우고 예산을 되돌렸어요.") && after.includes("남은 예산 ") && !after.includes("data-ab-undo"),
    "T-16 취소 뒤 알림: 제목·문구·남은 예산 줄, 단추 없음");
  for (const [err, needle] of [["undo_expired", "실행 취소할 수 있는 시간이 지나 기록을 그대로 두었습니다."], ["undo_changed", "저장한 뒤 바뀐 기록이라 실행 취소하지 않았습니다."]]) {
    t.ok(toast(await home(fx, `${HOME}&err=${err}`)).includes(needle), `T-16 ${err} 알림 문구`);
  }

  // 거절: 기록은 그대로 남아야 한다.
  const keep = await save(fx, { memo: "저녁", amount: "12000" });
  const wifi = await fx.cookieFor("user-wifi");
  t.eq(errOf(await undo(fx, keep.ticket, { cookie: wifi })), "undo_expired", "T-16 같은 가계부의 다른 사람 세션은 표를 쓰지 못한다");
  t.eq(errOf(await undo(fx, `${keep.ticket.slice(0, -1)}${keep.ticket.endsWith("A") ? "B" : "A"}`)), "undo_expired", "T-16 서명을 바꾼 표는 받지 않는다");
  const swapped = `${Buffer.from(JSON.stringify({ ...decodeTicket(keep.ticket), r: "tx-expense-3" }), "utf8").toString("base64url")}.${keep.ticket.split(".")[1]}`;
  t.eq(errOf(await undo(fx, swapped)), "undo_expired", "T-16 표 안의 기록 번호를 남의 것으로 바꾸면 서명이 맞지 않는다");
  const foreign = signTicket("not-the-server-secret", { ...decodeTicket(keep.ticket), r: "tx-expense-3", f: await quickUndoFingerprint(rowOf(fx, "tx-expense-3")) });
  t.eq(errOf(await undo(fx, foreign)), "undo_expired", "T-16 다른 비밀로 만든 표는 받지 않는다");
  t.eq(errOf(await undo(fx, "")), "undo_expired", "T-16 표가 없으면 받지 않는다");
  t.eq(errOf(await undo(fx, `${"x".repeat(5000)}.y`)), "undo_expired", "T-16 너무 긴 표는 받지 않는다");
  for (const [label, patch] of [["용도가 다른", { purpose: "credential-change" }], ["지문 없는", { f: "" }], ["기록 번호 없는", { r: "" }], ["가계부 없는", { h: "" }], ["끝난", { exp: nowSeconds - 1 }], ["다른 사용자", { u: "user-wifi" }]]) {
    t.eq(errOf(await undo(fx, signTicket(secret, { ...decodeTicket(keep.ticket), ...patch }))), "undo_expired", `T-16 서버 비밀로 서명했어도 ${label} 표는 받지 않는다`);
  }
  t.eq(errOf(await undo(fx, signTicket(secret, decodeTicket(keep.ticket), "credential-change"))), "undo_expired", "T-16 같은 내용이라도 다른 용도로 서명한 표는 받지 않는다");
  const otherPurpose = await signedPurposeToken(fx.env, "credential-change", { r: keep.rid, h: HH, u: "user-bin", f: decodeTicket(keep.ticket).f }, 60);
  t.eq(errOf(await undo(fx, otherPurpose)), "undo_expired", "T-16 서버가 다른 용도(비밀번호 변경 확인)로 준 표를 실행 취소에 쓰지 못한다");
  const realNow = Date.now;
  Date.now = () => realNow() + 61_000;
  try { t.eq(errOf(await undo(fx, keep.ticket)), "undo_expired", "T-16 60초가 지난 표는 받지 않는다"); } finally { Date.now = realNow; }
  const cross = await app.fetch(new Request(`${BASE}/my/undo`, {
    method: "POST",
    headers: { cookie: fx.cookie, "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example", "sec-fetch-site": "cross-site", accept: "text/html" },
    body: new URLSearchParams({ ticket: keep.ticket, month: "2026-07", return_to: HOME }).toString(),
  }), fx.env, ctx);
  t.eq(cross.status, 403, "T-16 다른 사이트에서 보낸 실행 취소는 라우터의 같은 출처 검사가 막는다");
  const anonymous = await undo(fx, keep.ticket, { cookie: "" });
  t.ok(anonymous.status === 303 && anonymous.location === "/my", "T-16 로그인하지 않았으면 /my 로 보낸다");
  const stored = rowOf(fx, keep.rid);
  stored.amount = 13000;
  t.eq(errOf(await undo(fx, keep.ticket)), "undo_changed", "T-16 저장한 뒤 금액을 바꾼 기록은 지우지 않는다");
  stored.amount = 12000;
  stored.memo = "저녁 회식";
  t.eq(errOf(await undo(fx, keep.ticket)), "undo_changed", "T-16 메모를 바꾼 기록도 지우지 않는다");
  stored.memo = "저녁";
  t.ok(has(fx, keep.rid), "T-16 거절된 실행 취소는 기록을 지우지 않았다");
  const back = await undo(fx, keep.ticket, { returnTo: `${HOME}&view=calendar&date=2026-07-15&feed=all&msg=added&saved_rid=${keep.rid}&saved_qd=x&undo=y&day_detail=1&quick=1&balert=z&rid=w` });
  t.eq(back.location, `${HOME}&view=calendar&date=2026-07-15&feed=all&msg=undone`, "T-16 내용이 저장 때와 같으면 취소되고, 돌아갈 주소의 알림 값(msg·saved_rid·undo·day_detail…)은 빼고 화면 값은 남긴다");
  t.ok(!has(fx, keep.rid), "T-16 그 기록이 지워졌다");
  const outward = await undo(fx, (await save(fx, { memo: "간식" })).ticket, { returnTo: "https://evil.example/steal" });
  t.ok(outward.location === `${HOME}&msg=undone`, "T-16 돌아갈 곳이 바깥 주소면 그 가계부 홈으로 돌아간다");

  const replayId = crypto.randomUUID();
  const first = await post(fx, "/admin/transactions", { ...SAVE, memo: "중복 확인", request_id: replayId });
  const again = await post(fx, "/admin/transactions", { ...SAVE, memo: "중복 확인", request_id: replayId });
  t.ok(params(first.location).get("undo") && params(again.location).get("msg") === "already_saved" && !params(again.location).get("undo"), "T-16 다시 보낸 같은 요청(already_saved)에는 표를 다시 주지 않는다");
}));

// ── T-16 누가 취소할 수 있나: 보통 삭제(/my/delete)와 같은 규칙 ──
await withClock("2026-07-15", () => fixture(async (fx) => {
  const wifi = await fx.cookieFor("user-wifi");
  const own = await save(fx, { user_id: "user-wifi", memo: "구성원 점심" }, wifi);
  t.ok(own.ticket && decodeTicket(own.ticket).u === "user-wifi", "T-16 구성원이 만든 기록에도 그 구성원의 표가 붙는다");
  t.ok(toast(await home(fx, own.location, wifi)).includes("data-ab-undo>실행 취소</button>"), "T-16 구성원 알림에도 실행 취소 단추");
  t.eq(msgOf(await undo(fx, own.ticket, { cookie: wifi })), "undone", "T-16 구성원은 자기가 방금 만든 기록을 취소할 수 있다");
  t.ok(!has(fx, own.rid), "T-16 구성원 기록이 지워졌다");

  const forWifi = await save(fx, { user_id: "user-wifi", memo: "택시" });
  t.eq(rowOf(fx, forWifi.rid)?.user_id, "user-wifi", "T-16 소유자가 다른 지출자로 저장했다");
  t.eq(msgOf(await undo(fx, forWifi.ticket)), "undone", "T-16 소유자는 다른 지출자로 저장한 기록도 취소할 수 있다");

  putSetting(fx, `household_member_policy_v22943:${HH}`, JSON.stringify({ version: 1, mode: "record_only" }));
  const recordOnly = await save(fx, { user_id: "user-wifi", memo: "커피" }, wifi);
  const box = toast(await home(fx, recordOnly.location, wifi));
  t.ok(box.includes("<b>기록을 저장했습니다</b>") && !box.includes("data-ab-undo") && !box.includes("/transactions/edit"), "T-16 ‘기록만’ 구성원 알림에는 실행 취소 단추도 수정 링크도 없다");
  t.eq(errOf(await undo(fx, recordOnly.ticket, { cookie: wifi })), "member_record_only", "T-16 서버도 ‘기록만’ 정책으로 거절한다");
  t.ok(has(fx, recordOnly.rid), "T-16 ‘기록만’ 구성원 기록은 남는다");

  const ownerAfterPolicy = await save(fx, { memo: "정책 뒤 소유자" });
  t.eq(msgOf(await undo(fx, ownerAfterPolicy.ticket)), "undone", "T-16 ‘기록만’ 정책은 소유자에게 걸리지 않는다");

  const leaving = await save(fx, { user_id: "user-wifi", memo: "나가기 전" }, wifi);
  fx.db.household_members = fx.db.household_members.filter((member) => !(member.household_id === HH && member.user_id === "user-wifi"));
  t.eq(errOf(await undo(fx, leaving.ticket, { cookie: wifi })), "undo_expired", "T-16 가계부에서 나간 사람의 표는 받지 않는다");
  t.ok(has(fx, leaving.rid), "T-16 나간 사람의 기록은 남는다");

  const admin = await adminCookie(fx);
  const adminSaved = await save(fx, { memo: "관리자 기록" }, admin);
  t.ok(adminSaved.status === 303 && adminSaved.rid && !adminSaved.ticket, "T-16 관리자 세션 저장에는 표가 없다");
  const adminBox = toast(await home(fx, adminSaved.location, admin));
  t.ok(adminBox.includes(`<a class="abSaveFeedbackAction" data-ab-undo-edit href="/transactions/edit?id=${adminSaved.rid}&amp;return_to=`) && !adminBox.includes("/my/undo"), "T-16 관리자 세션 알림은 수정·삭제 화면 링크");
}));

// ── T-16 알림 타이머(V5 자산) ──
const v5 = await asset(V5);
const v5Module = readFileSync(new URL("../src/modules/client/v5-bundle-mains.js", import.meta.url), "utf8");
const feedbackSource = functionSource(v5Module, "accountbookSaveFeedbackClientMain");
t.ok(v5.includes(`(${feedbackSource})();`), "T-16 V5 자산이 고친 저장 알림 함수를 그대로 싣고 부른다");
const RID = "1f6c7a2e-4b1d-4c2a-9e3f-1a2b3c4d5e6f";
const undoable = toastHarness(feedbackSource, { search: `?month=2026-07&household_id=${HH}&msg=added&saved_rid=${RID}&saved_qd=${RID}&undo=abc.def`, kind: "success", undo: true });
t.deepEq(undoable.pending(), [0, 12000], "T-16 실행 취소 알림은 12초(지시서: 10초 이상) 보인다");
t.ok(!undoable.location.search.includes("msg="), "T-16 알림 값(msg)은 바로 지운다");
undoable.runZero();
t.eq(undoable.location.search, `?month=2026-07&household_id=${HH}`, "T-16 한 틱 뒤 saved_rid·saved_qd·undo 를 주소에서 지운다(새로 불러와도 표가 남지 않는다)");
undoable.fire("mouseenter");
t.deepEq(undoable.pending(), [], "T-16 마우스가 알림 위에 있으면 멈춘다");
undoable.fire("mouseleave");
t.deepEq(undoable.pending(), [6000], "T-16 마우스가 나가면 6초 뒤 닫는다");
undoable.focusInside();
undoable.fire("focusin");
t.deepEq(undoable.pending(), [], "T-16 키보드 초점이 단추에 오면 멈춘다");
undoable.fire("focusout");
undoable.runZero();
t.deepEq(undoable.pending(), [], "T-16 초점이 알림 안에 남아 있으면 계속 멈춘다");
undoable.blur();
undoable.fire("focusout");
undoable.runZero();
t.deepEq(undoable.pending(), [6000], "T-16 초점이 나가면 6초 뒤 닫는다");
undoable.fire("mouseenter");
undoable.fire("focusout");
undoable.runZero();
t.deepEq(undoable.pending(), [], "T-16 초점이 나가도 마우스가 위에 있으면 그대로 멈춘다");
undoable.fire("mouseleave");
undoable.run(6000);
t.ok(undoable.closed(), "T-16 남은 시간이 지나면 닫는다");
for (const [kind, hold, resume] of [["success", 5200, 2400], ["warning", 9000, 4200]]) {
  const run = toastHarness(feedbackSource, { search: `?month=2026-07&msg=added`, kind, undo: false });
  t.deepEq(run.pending(), [hold], `T-16 단추 없는 ${kind} 알림은 예전처럼 ${hold / 1000}초`);
  run.fire("mouseenter");
  run.fire("mouseleave");
  t.deepEq(run.pending(), [resume], `T-16 ${kind} 알림도 마우스가 나가면 ${resume / 1000}초 뒤`);
}
const error = toastHarness(feedbackSource, { search: `?month=2026-07&err=amount_required`, kind: "error", undo: false });
error.fire("mouseenter");
error.fire("mouseleave");
t.deepEq(error.pending(), [], "T-16 오류 알림은 예전처럼 저절로 닫지 않는다");

t.done();

async function adminCookie(fx) {
  fx.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  fx.env.ADMIN_SESSION_SECRET = "design-uplift-v22987-admin-session";
  const login = await post(fx, "/login", { password: ADMIN_PASSWORD }, { cookie: "" });
  return (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
}

function functionSource(source, name) {
  const node = parse(source, { ecmaVersion: "latest", sourceType: "module" }).body.find((n) => n.type === "FunctionDeclaration" && n.id.name === name);
  if (!node) throw new Error(`${name} 이 없다`);
  return source.slice(node.start, node.end);
}

// nav 자산의 bindQuickCompact 만 꺼내 가짜 창에서 돌린다(스크롤 위치·프레임을 손으로 넘긴다).
function compactHarness(source) {
  const start = source.indexOf("function bindQuickCompact() {");
  const end = source.indexOf("function bindGlobalActions() {", start);
  if (start < 0 || end < 0) throw new Error("bindQuickCompact 가 없다");
  const classes = new Set();
  const dock = { classList: { remove: (name) => classes.delete(name), toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)) } };
  const frames = [];
  let onScroll = null, options = null;
  const window = { pageYOffset: 0, addEventListener(type, fn, opts) { if (type === "scroll") { onScroll = fn; options = opts; } }, requestAnimationFrame: (fn) => frames.push(fn) };
  const document = { querySelector: (selector) => (selector === ".abGlobalActions[data-ab-quick-dock]" ? dock : null) };
  vm.runInContext(`${source.slice(start, end)}\nbindQuickCompact();`, vm.createContext({ window, document }));
  return {
    options, frames,
    get compact() { return classes.has("abQuickCompact"); },
    flush() { frames.splice(0).forEach((fn) => fn()); },
    scrollTo(y, { flush = true } = {}) { window.pageYOffset = y; onScroll(); if (flush) this.flush(); },
  };
}

// 저장 알림 하나와 그 안의 실행 취소 단추를 가진 가짜 DOM. 타이머는 번호로 지우고, 0ms(주소 정리·초점 확인)는 손으로 돌린다.
function toastHarness(source, { search, kind, undo }) {
  const timers = new Map();
  let seq = 0;
  const classes = new Set();
  const handlers = {};
  const button = { name: "실행 취소" };
  const feedback = {
    attrs: {}, classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
    getAttribute: (key) => (key === "data-ab-feedback-kind" ? kind : null), hasAttribute(key) { return key in this.attrs; }, setAttribute(key, value) { this.attrs[key] = value; },
    querySelector: (selector) => (selector === "[data-ab-undo]" && undo ? button : null),
    addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); },
    contains: (node) => node === feedback || (undo && node === button),
  };
  const location = { pathname: "/app", search, hash: "" };
  const document = { readyState: "interactive", activeElement: null, addEventListener() {}, getElementById: () => null, querySelector: (selector) => (selector === "[data-ab-save-feedback]" ? feedback : null) };
  const window = { history: { replaceState(_state, _title, url) { location.search = url.includes("?") ? url.slice(url.indexOf("?")).replace(/#.*$/, "") : ""; } } };
  const context = vm.createContext({
    document, window, location, URLSearchParams, requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn, ms) => { seq += 1; timers.set(seq, { fn, ms }); return seq; },
    clearTimeout: (id) => { timers.delete(id); },
  });
  vm.runInContext(`${source}\naccountbookSaveFeedbackClientMain();`, context);
  const run = (ms) => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } };
  return {
    location,
    pending: () => [...timers.values()].map((timer) => timer.ms).filter((ms) => ms !== 180).sort((a, b) => a - b),
    run, runZero: () => run(0),
    fire: (type) => { for (const fn of handlers[type] || []) fn({ type }); },
    focusInside() { document.activeElement = button; },
    blur() { document.activeElement = null; },
    closed: () => classes.has("isLeaving"),
  };
}

// T-16 묶음(quickUndoCss)의 줄만 꺼낸다.
function quickUndoBlock(css) {
  return css.split("\n").filter((line) => line.includes(".abSaveFeedbackUndo") || line.includes("button.abSaveFeedbackAction")).join("\n");
}

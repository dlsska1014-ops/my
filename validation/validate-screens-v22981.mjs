// V22.9.81 화면 대비·넘침(screens 묶음) 검사 — U-28·U-29(+같은 유형 훑기)·U-30·U-15·U-16·U-17.
// 화면이 실제로 받는 CSS(셸 자산·다른 자산·페이지 인라인 <style>)를 lib-css-engine-v22981 로 계산한다.
// 다크 = html[data-ab-resolved-theme="dark"], 색조 = html[data-ab-tone] (파랑·에메랄드·보라·호박). 라이트에서 바뀌면 안 되는 값은 V22.9.80 값으로 고정한다.
// 넘침(U-17)은 레이아웃을 계산하지 않고, 넘침을 막는 선언이 그 폭에서 실제로 이기는지를 본다(실제 Chrome 측정 결과는 묶음 보고에 있다).
// 클라이언트 스크립트가 그리는 요소(알림 배지·작은 달력 칸·거래 요약 레일·목표 단추)는 스크립트가 만드는 조상 줄을 그대로 적어 계산한다.
// 사용: node validation/validate-screens-v22981.mjs   (V22981_SOFT=1 또는 --soft: 실패를 세어 끝까지 돌고 마지막에 목록을 찍는다 — 옛 코드에서 몇 개가 깨지는지 볼 때)
import { counter, fixture, page, post, withClock } from "./lib-audit-v22934.mjs";
import {
  beats, blend, bodyClassesOf, byClass, cascade, chain, chainForSelector, colorOf, computed, flatRules, fontOf, isLarge, num,
  pathOf, ratio, servedCssParts, solidBackdrop,
} from "./lib-css-engine-v22981.mjs";

const SOFT = process.env.V22981_SOFT === "1" || process.argv.includes("--soft");
const base = counter("V22.9.81 화면 대비·넘침 검사 통과");
const failed = [];
const passed = [];
let total = 0;
function guard(fn, message) {
  total += 1;
  try { fn(); passed.push(message); } catch (error) {
    if (!SOFT) throw error;
    const detail = String(error.message).split("\n")[0];
    failed.push(detail === message ? message : `${message} — ${detail.slice(0, 140)}`);
  }
}
const ok = (value, message) => guard(() => base.ok(value, message), message);
const eq = (actual, expected, message) => guard(() => base.eq(actual, expected, message), message);
async function section(name, task) {
  try { await task(); } catch (error) {
    if (!SOFT) throw error;
    total += 1;
    failed.push(`${name} 구간이 끝까지 못 돌았다 — ${String(error.message).split("\n")[0].slice(0, 160)}`);
  }
}

const H = "household_id=house-home", M = "month=2026-07";
const MOBILE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const TONES = ["", "emerald", "violet", "amber"];
const toneName = (tone) => tone || "blue";
// V22.9.80 라이트 강조색(네 색조 모두 --ab12-accent 와 --ab12-action 이 같다). 라이트 화면이 그대로인지 이 값으로 본다.
const LIGHT_ACCENT = { "": "#1d4ed8", emerald: "#047857", violet: "#6d28d9", amber: "#92400e" };
const rootOf = (dark, tone) => ({ tag: "html", attrs: { "data-ab-resolved-theme": dark ? "dark" : "light", ...(tone ? { "data-ab-tone": tone } : {}) } });
const opacityOf = (css, el, width) => { let op = 1; for (let e = el; e; e = e.parent) op *= num(cascade(css, e, "opacity", width)?.value); return op; };
function contrast(css, el, width) {
  if (!el) return { fg: "", bg: "", op: 1, r: 0, missing: true };
  const fg = colorOf(css, el, width);
  const bd = solidBackdrop(css, el, width);
  const op = opacityOf(css, el, width);
  const eff = op < 1 && fg && bd.color ? blend(fg, op, bd.color) : fg;
  return { fg, bg: bd.color || `?(${bd.unknown || "없음"})`, op, r: fg && bd.color ? ratio(eff, bd.color) : 0 };
}
const show = (c) => (c.missing ? "요소 없음" : `${c.fg || "?"} / ${c.bg}${c.op < 1 ? ` 투명도 ${c.op.toFixed(2)}` : ""} = ${c.r.toFixed(2)}:1`);
const bgOf = (css, el, width) => (el ? solidBackdrop(css, el, width).color : "");
// 요소를 못 찾으면 null(검사가 실패로 센다).
function find(html, match, opts, ...extra) { try { return pathOf(html, match, opts, ...extra); } catch { return null; } }
// padding 처럼 한 줄 선언(padding)과 쪽 선언(padding-left)이 섞인 값을 이기는 선언 기준으로 푼다.
function sideValue(css, el, prop, side, width) {
  if (!el) return "";
  const short = cascade(css, el, prop, width), long = cascade(css, el, `${prop}-${side}`, width);
  const win = !short ? long : !long ? short : beats(long.key, short.key) ? long : short;
  if (!win) return "";
  if (win === long) return long.value.trim();
  const v = short.value.trim().split(/\s+/);
  const four = v.length === 1 ? [v[0], v[0], v[0], v[0]] : v.length === 2 ? [v[0], v[1], v[0], v[1]] : v.length === 3 ? [v[0], v[1], v[2], v[1]] : v;
  return four[{ top: 0, right: 1, bottom: 2, left: 3 }[side]];
}
const valueOf = (css, el, prop, width) => (el ? String(computed(css, el, prop, width) ?? "").replace(/\s+/g, " ").trim() : "");

async function load(fx, path, { cookie = fx.cookie, ua = DESKTOP } = {}) {
  const res = await page(fx, path, { cookie, headers: { "user-agent": ua } });
  const { parts, css } = res.status === 200 ? await servedCssParts(fx, res.html, cookie) : { parts: [], css: "" };
  return { ...res, parts, css, bodyClasses: bodyClassesOf(res.html) };
}

// 같은 유형 훑기: 한 규칙 안에서 글씨를 흰색으로 고정하고 바탕을 토큰(var(--…))으로 준 규칙을 모두 찾아, 다크에서 흰 글씨 대비를 잰다.
// 로고(.abNavLogo·.abNavMobileTop a>span)와 그 안의 표식은 aria-hidden 그림만 든 자리라 뺀다(아래에서 글자가 없음을 함께 확인한다).
const WHITE = /^(#fff|#ffffff|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)|var\(--on-accent\))$/i;
const LOGO = (sel) => /\.abNavLogo\b|\.abNavMobileTop a>span|\.abBrandMark\b/.test(sel);
function whiteOnTokenFailures(load, dark, tone, width) {
  const out = [];
  for (const part of load.parts) {
    for (const rule of flatRules(part.text)) {
      if (!rule.decls.some((d) => d.prop === "color" && WHITE.test(d.value))) continue;
      if (!rule.decls.some((d) => (d.prop === "background" || d.prop === "background-color") && /var\(--/.test(d.value))) continue;
      for (const sel of rule.sels) {
        if (LOGO(sel)) continue;
        const el = chainForSelector(sel, { dark, tone, bodyClasses: load.bodyClasses });
        if (!el || colorOf(load.css, el, width) !== "#ffffff") continue;
        const bd = solidBackdrop(load.css, el, width);
        if (!bd.color) continue;
        const need = isLarge(fontOf(load.css, el, width)) ? 3 : 4.5;
        const r = ratio("#ffffff", bd.color);
        if (r < need) out.push(`${sel} 흰 글씨/${bd.color} ${r.toFixed(2)}:1 < ${need}`);
      }
    }
  }
  return out;
}

await withClock("2026-07-15", () => fixture(async (fx) => {
  fx.env.ADMIN_PASSWORD = "screens-v22981-admin";
  fx.env.ADMIN_SESSION_SECRET = "screens-v22981-admin-session-secret";
  const login = await post(fx, "/login", { password: fx.env.ADMIN_PASSWORD }, { cookie: "" });
  const admin = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
  ok(Boolean(admin), "관리자 로그인 쿠키를 받았다(옛 관리자 화면·PC 분석 계산용)");

  const home = await load(fx, `/app?${M}&${H}`);
  const homeMobile = await load(fx, `/app?${M}&${H}`, { ua: MOBILE });
  const report = await load(fx, `/my/analysis?${M}&${H}&view=report`);
  const reportMobile = await load(fx, `/my/analysis?${M}&${H}&view=report`, { ua: MOBILE });
  const goals = await load(fx, `/goals?${M}&${H}`);
  const budgets = await load(fx, `/budgets?${M}&${H}`);
  const transactions = await load(fx, `/app?${M}&${H}&tab=transactions`);
  const pcAnalysis = await load(fx, `/analysis?${M}&${H}`, { cookie: `${fx.cookie}; ${admin}` });
  for (const [name, l] of [["홈", home], ["홈(모바일)", homeMobile], ["종합 리포트", report], ["종합 리포트(모바일)", reportMobile], ["목표", goals], ["예산", budgets], ["거래 탭", transactions], ["PC 분석", pcAnalysis]]) {
    ok(l.status === 200 && l.parts.some((p) => /\/assets\/accountbook-shell-v\d+\.css/.test(p.origin)), `${name} 화면이 200 으로 셸 CSS 자산을 싣는다`);
  }

  // ── U-28 다크 알림 배지 ───────────────────────────────────────────────────────────────────
  await section("U-28", async () => {
    // 배지는 nav-search-notif-mains 가 body 끝에 붙이는 빠른 실행 줄(.abGlobalActions)과 공통 작업 대화상자 안에 하나씩 있다.
    const badges = (l, dark, tone) => [
      ["빠른 실행 줄", chain(rootOf(dark, tone), { tag: "body", classes: l.bodyClasses }, { tag: "div", classes: ["abGlobalActions"] }, { tag: "button", classes: ["abGlobalAction"] }, { tag: "span", classes: ["abV5NotifBadge"] })],
      ["공통 작업 대화상자", chain(rootOf(dark, tone), { tag: "body", classes: l.bodyClasses }, { tag: "dialog", classes: ["abGlobalDialog"] }, { tag: "div", classes: ["abGlobalDialogBody"] }, { tag: "div", classes: ["abGlobalActionGrid"] }, { tag: "button", classes: ["abGlobalActionChoice"] }, { tag: "span", classes: ["abV5NotifBadge"] })],
    ];
    for (const [name, l] of [["홈", home], ["종합 리포트", report]]) {
      for (const tone of TONES) {
        for (const [where, el] of badges(l, true, tone)) {
          const c = contrast(l.css, el, 1280);
          ok(c.fg === "#ffffff" && c.r >= 4.5, `U-28 ${name} 다크/${toneName(tone)} ${where} 알림 배지 흰 숫자가 4.5:1 이상 (${show(c)})`);
        }
        const [, lightEl] = badges(l, false, tone)[0];
        const lc = contrast(l.css, lightEl, 1280);
        eq(bgOf(l.css, lightEl, 1280), "#c0362c", `U-28 ${name} 라이트/${toneName(tone)} 배지 바탕은 V22.9.80 그대로 #c0362c (${show(lc)})`);
      }
    }
  });

  // ── U-29 작은 달력 오늘 칸 ────────────────────────────────────────────────────────────────
  await section("U-29", async () => {
    // 칸은 accountbookSidebarDashboardClientMain 이 section.abNavCalendar 안에 div.abNavCalGrid > a.abNavCalDay 로 그린다.
    for (const [name, l] of [["홈", home], ["종합 리포트", report]]) {
      for (const tone of TONES) {
        for (const dark of [true, false]) {
          const cell = find(l.html, byClass("section", "abNavCalendar"), { dark, tone, label: "작은 달력" }, { tag: "div", classes: ["abNavCalGrid"] }, { tag: "a", classes: ["abNavCalDay", "isToday"] });
          const dot = find(l.html, byClass("section", "abNavCalendar"), { dark, tone, label: "작은 달력" }, { tag: "div", classes: ["abNavCalGrid"] }, { tag: "a", classes: ["abNavCalDay", "isToday", "hasRecord"] }, { tag: "i" });
          const c = contrast(l.css, cell, 1280);
          const theme = dark ? "다크" : "라이트";
          ok(c.fg === "#ffffff" && c.r >= 4.5, `U-29 ${name} ${theme}/${toneName(tone)} 오늘 칸 흰 글씨가 4.5:1 이상 (${show(c)})`);
          const dotBg = bgOf(l.css, dot, 1280), cellBg = bgOf(l.css, cell, 1280);
          ok(dotBg && cellBg && ratio(dotBg, cellBg) >= 3, `U-29 ${name} ${theme}/${toneName(tone)} 오늘 칸의 기록 점(${dotBg || "?"})이 칸 바탕(${cellBg || "?"}) 위에서 3:1 이상`);
          if (!dark) eq(cellBg, LIGHT_ACCENT[tone], `U-29 ${name} 라이트/${toneName(tone)} 오늘 칸 바탕은 V22.9.80 그대로 ${LIGHT_ACCENT[tone]}`);
        }
      }
    }
  });

  // ── 같은 유형 훑기(다크 토큰 바탕 + 흰 글씨) + 목표 납입 단추 ─────────────────────────────────
  await section("같은 유형 훑기", async () => {
    for (const [name, l, width] of [["홈", home, 1280], ["홈(모바일)", homeMobile, 390], ["종합 리포트", report, 1280], ["목표", goals, 1280], ["예산", budgets, 1280]]) {
      for (const tone of TONES) {
        const bad = whiteOnTokenFailures(l, true, tone, width);
        ok(bad.length === 0, `같은 유형 ${name} 다크/${toneName(tone)}: 토큰 바탕에 흰 글씨를 고정한 규칙이 모두 AA 를 넘는다${bad.length ? ` — ${bad.slice(0, 3).join(" | ")}` : ""}`);
      }
    }
    // 로고 예외의 전제: 로고 자리에는 aria-hidden 그림만 있고 글자가 없다.
    const logoText = (html, open) => {
      const at = html.indexOf(open);
      if (at < 0) return null;
      const end = html.indexOf("</span>", html.indexOf("</svg>", at));
      return html.slice(at + open.length, end).replace(/<svg\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg>/g, "").trim();
    };
    eq(logoText(home.html, '<span class="abNavLogo">'), "", "로고 예외 전제: 사이드바 로고(.abNavLogo) 안에는 aria-hidden 그림만 있다");
    eq(logoText(homeMobile.html, '<span class="abNavMobileLogo">'), "", "로고 예외 전제: 모바일 상단 로고(.abNavMobileTop a>span) 안에는 aria-hidden 그림만 있다");
    // 목표 납입 단추(.goalActions .fund)는 accountbookGoalsClientMain 이 목표 카드 안에 그린다.
    for (const tone of TONES) {
      const fund = (dark) => chain(rootOf(dark, tone), { tag: "body", classes: goals.bodyClasses }, { tag: "main" }, { tag: "div", classes: ["goalCard"] }, { tag: "div", classes: ["goalActions"] }, { tag: "button", classes: ["fund"] });
      const d = contrast(goals.css, fund(true), 1280);
      ok(d.fg === "#ffffff" && d.r >= 4.5, `같은 유형 목표 다크/${toneName(tone)} 납입 단추 흰 글씨가 4.5:1 이상 (${show(d)})`);
      const li = contrast(goals.css, fund(false), 1280);
      eq(bgOf(goals.css, fund(false), 1280), LIGHT_ACCENT[tone], `같은 유형 목표 라이트/${toneName(tone)} 납입 단추 바탕은 V22.9.80 그대로 ${LIGHT_ACCENT[tone]} (${show(li)})`);
    }
  });

  // ── U-30 거래 요약 수입 ──────────────────────────────────────────────────────────────────
  await section("U-30", async () => {
    // 요약 레일은 accountbookActivityRailClientMain 이 거래 탭(1320px 이상)에서 body 에 aside.abActivityRail.abTransactionRail 로 붙인다.
    const dd = (dark, tone, kind) => chain(rootOf(dark, tone), { tag: "body", classes: transactions.bodyClasses }, { tag: "aside", classes: ["abActivityRail", "abTransactionRail"] }, { tag: "div", classes: ["abTransactionSummary"] }, { tag: "dl" }, { tag: "div" }, { tag: "dd", classes: [kind] });
    for (const tone of TONES) {
      const li = contrast(transactions.css, dd(false, tone, "income"), 1366);
      ok(li.r >= 4.5, `U-30 라이트/${toneName(tone)} 거래 요약 수입이 흰 바탕에서 4.5:1 이상 (${show(li)})`);
      eq(li.fg, "#087a55", `U-30 라이트/${toneName(tone)} 거래 요약 수입은 수입 토큰 --pos(#087a55) 색`);
      const dk = contrast(transactions.css, dd(true, tone, "income"), 1366);
      ok(dk.fg === "#6ee7b7" && dk.r >= 4.5, `U-30 다크/${toneName(tone)} 거래 요약 수입은 V22.9.80 그대로 #6ee7b7·4.5:1 이상 (${show(dk)})`);
      const le = contrast(transactions.css, dd(false, tone, "expense"), 1366), de = contrast(transactions.css, dd(true, tone, "expense"), 1366);
      ok(le.fg === "#dc2626" && de.fg === "#fca5a5" && le.r >= 4.5 && de.r >= 4.5, `U-30 ${toneName(tone)} 거래 요약 지출은 그대로(라이트 ${show(le)}, 다크 ${show(de)})`);
    }
  });

  // ── U-15 일별 그래프 빈 날 ───────────────────────────────────────────────────────────────
  await section("U-15", async () => {
    for (const [name, l, width] of [["종합 리포트", report, 1280], ["종합 리포트(모바일)", reportMobile, 390], ["홈(모바일)", homeMobile, 390], ["PC 분석", pcAnalysis, 1280]]) {
      for (const dark of [false, true]) {
        const theme = dark ? "다크" : "라이트";
        const empty = (...inner) => find(l.html, byClass("div", "dailyCell", "noValue"), { dark, label: "빈 날 칸" }, ...inner);
        const full = (...inner) => find(l.html, byClass("div", "dailyCell", "hasValue"), { dark, label: "값 있는 날 칸" }, ...inner);
        const day = empty({ tag: "div", classes: ["dailyTop"] }, { tag: "b" });
        const dot = empty({ tag: "span", classes: ["dailyAmt"] });
        const fullDay = full({ tag: "div", classes: ["dailyTop"] }, { tag: "b" });
        eq(day ? Number(opacityOf(l.css, day, width).toFixed(2)) : -1, 1, `U-15 ${name} ${theme} 빈 날 칸을 투명도로 흐리지 않는다`);
        const cd = contrast(l.css, day, width), cs = contrast(l.css, dot, width);
        ok(cd.r >= 4.5, `U-15 ${name} ${theme} 빈 날 날짜 숫자가 4.5:1 이상 (${show(cd)})`);
        ok(cs.r >= 4.5, `U-15 ${name} ${theme} 빈 날 '·' 표시가 4.5:1 이상 (${show(cs)})`);
        const fd = contrast(l.css, fullDay, width);
        ok(cd.fg && fd.fg && cd.fg !== fd.fg, `U-15 ${name} ${theme} 빈 날 날짜는 값 있는 날(${fd.fg || "?"})과 다른 흐린 색(${cd.fg || "?"})으로 구분된다`);
      }
    }
  });

  // ── U-16 오픈빌더 최종 발화 표 ────────────────────────────────────────────────────────────
  await section("U-16", async () => {
    for (const path of ["/openbuilder-final", "/openbuilder-utterances", "/kakao-openbuilder-final"]) {
      const res = await page(fx, path, { cookie: "" });
      const table = (res.html.match(/<tbody>[\s\S]*?<\/tbody>/) || [""])[0];
      ok(res.status === 200 && table.includes("여러 줄 입력"), `U-16 ${path} 최종 연결 표가 열린다`);
      ok(!/7월3일\\n|\\n온열안대/.test(res.html), `U-16 ${path} 여러 줄 입력 예시에 글자 그대로의 \\n 이 없다`);
      const cell = (table.match(/<td[^>]*>7월3일[^<]*<\/td>/) || [""])[0];
      ok(cell.includes(">7월3일\n온열안대 9900 삼성카드\n풋샴푸 10150 삼성카드</td>"), `U-16 ${path} 여러 줄 입력 예시는 실제 줄바꿈 세 줄이다`);
      ok(/^<td style="white-space:pre-line">/.test(cell), `U-16 ${path} 줄바꿈이 든 칸만 white-space:pre-line 으로 줄을 살린다`);
      eq((table.match(/<td style=/g) || []).length, 1, `U-16 ${path} 다른 칸에는 style 을 붙이지 않았다`);
    }
  });

  // ── U-17 옛 관리자 화면 넘침 ─────────────────────────────────────────────────────────────
  await section("U-17", async () => {
    const calendarD = await load(fx, `/admin-view?tab=calendar&${M}&${H}`, { cookie: admin });
    const calendarM = await load(fx, `/admin-view?tab=calendar&${M}&${H}`, { cookie: admin, ua: MOBILE });
    const overview = await load(fx, `/admin-view?${M}&${H}`, { cookie: admin });
    const overviewM = await load(fx, `/admin-view?${M}&${H}`, { cookie: admin, ua: MOBILE });
    const importTab = await load(fx, `/admin-view?tab=import&${M}&${H}`, { cookie: admin });
    for (const [name, l] of [["달력 탭", calendarD], ["달력 탭(모바일)", calendarM], ["개요", overview], ["개요(모바일)", overviewM], ["가져오기 탭", importTab]]) ok(l.status === 200 && (l.html.includes("calendarLegend") || l.html.includes("filterTop")), `U-17 옛 관리자 ${name} 화면이 열린다`);
    // 달력: 금액 줄바꿈·칸 여백·범례 폭
    for (const [l, width] of [[calendarM, 360], [calendarD, 1024], [calendarD, 1280], [calendarD, 1440]]) {
      const amount = find(l.html, byClass("div", "dayAmt"), { label: "달력 금액" });
      eq(valueOf(l.css, amount, "overflow-wrap", width), "anywhere", `U-17 ${width}px 달력 금액(.dayAmt)은 칸 안에서 줄을 바꾼다(overflow-wrap:anywhere)`);
      const cell = find(l.html, (n) => n.tag === "a" && n.classes.includes("day") && !n.classes.includes("blank"), { label: "달력 칸" });
      const want = width <= 600 ? "4px" : "6px";
      eq(`${sideValue(l.css, cell, "padding", "left", width)} ${sideValue(l.css, cell, "padding", "right", width)}`, `${want} ${want}`, `U-17 ${width}px 달력 칸 좌우 여백이 ${want}(금액이 세 줄 안에 든다)`);
      const legend = find(l.html, byClass("div", "calendarLegend"), { label: "달력 범례" });
      eq(valueOf(l.css, legend, "flex", width), "none", `U-17 ${width}px 범례(적음·많음)는 flex:none 으로 제 폭을 지킨다`);
    }
    eq(valueOf(calendarM.css, find(calendarM.html, byClass("div", "calendar"), { label: "달력" }), "gap", 360), "4px", "U-17 360px 달력 칸 간격 4px");
    // 필터 줄: 1180px 경계를 1320px 로 — 그 사이에서는 단추 줄을 따로 둔다.
    const mainActions = find(overview.html, (n) => n.classes.includes("filterActions") && n.nth === 5, { label: "필터 단추 칸" });
    const mainTop = find(overview.html, byClass("div", "filterTop"), { label: "필터 줄" });
    for (const width of [1181, 1240, 1280, 1300, 1320]) {
      eq(valueOf(overview.css, mainActions, "grid-column", width), "1/-1", `U-17 ${width}px 조회·초기화 단추는 다섯째 칸(0~117px)에 끼지 않고 줄을 따로 쓴다`);
      eq(valueOf(overview.css, mainTop, "grid-template-columns", width), "1fr 150px 130px 1fr", `U-17 ${width}px 필터 줄은 네 칸 배치`);
    }
    for (const width of [1321, 1440]) {
      eq(valueOf(overview.css, mainTop, "grid-template-columns", width), "minmax(240px,1fr) 150px 130px minmax(280px,1fr) auto", `U-17 ${width}px 필터 줄은 V22.9.80 그대로 다섯 칸 배치`);
      ok(valueOf(overview.css, mainActions, "grid-column", width) !== "1/-1", `U-17 ${width}px 조회·초기화는 다섯째 칸에 그대로 있다`);
    }
    for (const width of [1024, 1280, 1440]) eq(valueOf(overview.css, mainActions, "flex-wrap", width), "wrap", `U-17 ${width}px 단추 칸은 자리가 모자라면 다음 줄로 내린다(flex-wrap)`);
    for (const [label, desc] of [["조회(button)", { tag: "button" }], ["초기화(a.btn)", { tag: "a", classes: ["btn", "ghost"] }]]) {
      const btn = find(overview.html, (n) => n.classes.includes("filterActions") && n.nth === 5, { label: "필터 단추 칸" }, desc);
      eq(valueOf(overview.css, btn, "flex", 1280), "none", `U-17 1280px ${label} 단추는 글자 폭 아래로 줄지 않는다(flex:none)`);
      const mobileBtn = find(overviewM.html, (n) => n.classes.includes("filterActions"), { label: "모바일 필터 단추 칸" }, desc);
      ok(mobileBtn && valueOf(overviewM.css, mobileBtn, "flex", 390) !== "none", `U-17 390px ${label} 모바일 단추 배치는 그대로(데스크톱 규칙이 닿지 않는다)`);
    }
    // 가져오기 탭 가계부 선택 폼: 단추 칸이 둘째 칸(150px)에 들어가 1440px 에서도 잘렸다.
    const importActions = find(importTab.html, (n) => n.classes.includes("filterActions") && n.nth === 2, { label: "가져오기 탭 단추 칸" });
    for (const width of [1321, 1440, 1920]) eq(valueOf(importTab.css, importActions, "grid-column", width), "2/-1", `U-17 ${width}px 가져오기 탭 선택 적용·가계부·참여자 단추 칸이 끝 칸까지 늘어난다`);
    eq(valueOf(importTab.css, importActions, "grid-column", 1280), "1/-1", "U-17 1280px 가져오기 탭 단추도 줄을 따로 쓴다");
  });
}));

if (SOFT) {
  console.log(`${failed.length} of ${total} checks fail`);
  for (const line of failed) console.log(`  FAIL ${line}`);
  if (process.argv.includes("--all")) for (const line of passed) console.log(`  pass ${line}`);
  process.exit(failed.length ? 1 : 0);
}
base.done();

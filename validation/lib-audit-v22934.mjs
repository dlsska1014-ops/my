// V22.9.34 감사 수정 검사들이 함께 쓰는 도구. 모든 재현은 메모리 픽스처(validation/qa-fixture.mjs)로
// 하며 네트워크를 쓰지 않는다.
import assert from "node:assert/strict";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

export { app };
export const BASE = "https://malhaebook.com";
export const ctx = { waitUntil() {}, passThroughOnException() {} };

// V22.9.80 T-37 changes renderMyAnalysisHtml in exactly three places so the budget-usage table keeps readable
// category names at 360px: a comment block, class="budgetTable" on that table, and one CSS rule pair right
// before ${reportUxCss()}. Reversing them keeps the whole-renderer hashes guarding every other byte.
export function beforeDarkBudgetTable(block) {
  const comment = /  \/\/ V22\.9\.80 T-37:[^\n]*\n(?:  \/\/ [^\n]*\n)*/g;
  assert.equal((block.match(comment) || []).length, 1, "T-37 renderer comment must occur exactly once");
  block = block.replace(comment, () => "");
  const reversals = [
    ['<div class="scroll"><table class="budgetTable"><thead>', '<div class="scroll"><table><thead>'],
    [".budgetTable th:first-child,.budgetTable td:first-child{min-width:7.5em;word-break:keep-all;overflow-wrap:break-word}.budgetTable td:not(:first-child){white-space:nowrap}${reportUxCss()}", "${reportUxCss()}"],
  ];
  for (const [current, previous] of reversals) {
    assert.equal(block.split(current).length - 1, 1, "T-37 renderer exception must occur exactly once: " + current);
    block = block.replace(current, () => previous);
  }
  return block;
}

// V22.9.83 (화면 정리 1차) changes renderMyAnalysisHtml in exactly two places: the hero sentence that explained
// the two views is replaced by one line plus the view tabs (renderAnalysisViewTabs), and the "← 한눈에 보기(소비 분석)"
// button leaves the pcBox. Reversing them keeps the whole-renderer hashes guarding every other byte.
export function beforeUiClarityV22983(block) {
  const reversals = [
    [
      " · 예산, 소비 추이, 고정비, 반복지출, 분류별 지출을 한 달 단위로 모아 봅니다.</p>${renderAnalysisViewTabs(\"report\", qs)}<p class=\"muted\">",
      " · 깊게 보는 분석 화면입니다. <b>종합 리포트는 이번 달 전체를 고정해 보는 화면</b>이고, <b>소비 분석은 필터로 좁혀 보는 화면</b>입니다. 여기서는 예산, 소비 추이, 고정비, 반복지출, 분류별 지출을 한 화면에서 봅니다.</p><p class=\"muted\">",
    ],
    [
      "<div class=\"pcBox\"><a class=\"btn secondary\" href=\"/budgets?${qs}\">예산 설정</a>",
      "<div class=\"pcBox\"><a class=\"btn\" href=\"/my/analysis?${qs}#reportCockpitTitle\">← 한눈에 보기(소비 분석)</a><a class=\"btn secondary\" href=\"/budgets?${qs}\">예산 설정</a>",
    ],
  ];
  for (const [current, previous] of reversals) {
    assert.equal(block.split(current).length - 1, 1, "V22.9.83 renderer exception must occur exactly once: " + current);
    block = block.replace(current, () => previous);
  }
  return block;
}

// V22.9.89 (Codex Astra 리포트, 사용자 2026-10-29 "확인해서 반영이나 수정해야하는 사항 있으면 진행하고") changes renderMyAnalysisHtml in
// exactly three places — numbers and names only, no layout (V2 §8 R3: 소비 분석은 D-5 전 보호 화면이라 배치·탭·필터는 그대로다):
// Astra 4 (Z-4) 무지출일 is "-" when nothing was written by hand (noSpendDays null), Astra 3 (Z-3) the 월말 예상 지출 label says
// "정기 항목 빼고 계산" when the recurring rules could not be read, and Astra 7 (Z-7) the improvement tip uses the "정리할 기록" name.
// Reversing them keeps the whole-renderer hashes guarding every other byte.
export function beforeNumbersTrustV22989(block) {
  const reversals = [
    [
      '<b>${analysis.basisDays === 0 || analysis.noSpendDays == null ? "-" : `${numberWithCommas(analysis.noSpendDays)}일`}</b>',
      '<b>${analysis.basisDays === 0 ? "-" : `${numberWithCommas(analysis.noSpendDays || 0)}일`}</b>',
    ],
    [
      '<span class="muted">월말 예상 지출${analysis.spendingOutlook?.partial && analysis.burnForecast != null ? " · 정기 항목 빼고 계산" : ""}</span>',
      '<span class="muted">월말 예상 지출</span>',
    ],
    [
      '<div><b>정리할 기록 줄이기</b><br/><span class="muted">분류나 결제수단이 비어 있는 기록이 많으면 분석이 부정확해져요. 키워드 설정을 보강하세요.</span></div>',
      '<div><b>분류 누락 정리</b><br/><span class="muted">분류·결제수단 누락이 많으면 분석 정확도가 떨어지므로 키워드 설정을 보강하세요.</span></div>',
    ],
  ];
  for (const [current, previous] of reversals) {
    assert.equal(block.split(current).length - 1, 1, "V22.9.89 renderer exception must occur exactly once: " + current);
    block = block.replace(current, () => previous);
  }
  return block;
}

// V22.9.116 (사용자 2026-11-10 "결함 개선 진행하자" — 출시 전 P1 ‘무지출일 리포트 ≠ 분석’, docs/codex/FOLLOWUP_FINDINGS_V22_9_116.md P-2·P-3)
// changes insightClientMain (소비 분석 클라이언트, V2 §8 R3 보호 화면) in exactly three places — the no-spend chip's number only, no layout:
// MARKS·STARTED are read from the payload after ROWS.sort, the chip calls noSpendDaysIn (same rule as 생활비 리포트·종합 리포트)
// and hides under row filters, and two helper functions follow renderInsights. Reversing them keeps the whole-client hashes
// (validate-ux-principles·validate-ads-gate-v22940·validate-polish-v22940) guarding every other byte.
export function beforePrelaunchP1V229116(block) {
  const reversals = [
    [
      String.raw`  // V22.9.116: 무지출일(noSpendDaysIn)의 ‘기록이 있는가’·‘가장 이른 기록’ 은 금액과 상관없이 받은 기록 전부로 본다(생활비 리포트와 같다).
  // 8번째 칸 1 = 정기 자동 기록. STARTED = 가계부를 만든 날(KST, 모르면 빈 값 — 그때는 기간 첫날부터 센다).
  var MARKS = (DATA.rows || []).map(function (a) { return { date: String(a[0] || ""), auto: a[7] === 1 }; })
    .filter(function (r) { return /^\d{4}-\d{2}-\d{2}$/.test(r.date); });
  var STARTED = /^\d{4}-\d{2}-\d{2}$/.test(String(DATA.started || "")) ? String(DATA.started) : "";
`,
      "",
    ],
    [
      String.raw`    // V22.9.116 (V110 #8): 무지출일은 생활비 리포트·종합 리포트와 같은 셈이다(noSpendDaysIn). 분류·결제수단·사람·금액·검색으로 좁힌 화면에서는
    // ‘그 조건의 지출이 없던 날’ 이 되어 무지출일과 뜻이 다르므로 이 칩을 보이지 않는다.
    if (state.type !== "income" && model.observed.status === "complete" && span <= 62 && !rowFilterActive()) {
      var endCount = state.end > TODAY ? TODAY : state.end;
      var noSpend = noSpendDaysIn(state.start, endCount);
      if (noSpend && noSpend.days > 0) box.appendChild(el("span", "iChip", "무지출 " + noSpend.days + "일 (" + noSpend.from + " ~ " + endCount + ")"));
    }
`,
      String.raw`    if (state.type !== "income" && model.observed.status === "complete" && span <= 62) {
      var endCount = state.end > TODAY ? TODAY : state.end;
      if (endCount >= state.start) {
        var days = dayDiff(state.start, endCount) + 1;
        var noSpend = days - Object.keys(byDay).filter(function (d2) { return d2 <= endCount; }).length;
        if (noSpend > 0) box.appendChild(el("span", "iChip", "무지출 " + noSpend + "일 (" + state.start + " ~ " + endCount + ")"));
      }
    }
`,
    ],
    [
      String.raw`  function rowFilterActive() {
    return !!(state.cats.length || state.pays.length || state.whos.length || state.min != null || state.max != null || state.q);
  }
  // V22.9.116 (V110 #8): 무지출일 = 기록을 시작한 날부터 그 기간 끝(오늘을 넘지 않음)까지 지출 기록 없이 지난 날. 시작한 날은 가계부를 만든 날이고,
  // 그 기간에 그보다 앞선 기록이 있으면 그 날이다. 그 기간에 직접 적은 기록(정기 자동 기록 제외)이 하나도 없으면 세지 않는다(null).
  // 생활비 리포트(buildLivingReport)·종합 리포트(noSpendDaysFrom)와 같은 규칙이다. 예전에는 기간 첫날부터 세어 11월 6일에 만든 가계부가
  // 같은 11월을 리포트 1일·소비 분석 5일로 달리 보였고, 정기 자동 기록만 있는 달도 무지출로 셌다.
  function noSpendDaysIn(start, end) {
    if (!(end >= start)) return null;
    var own = false, first = "";
    MARKS.forEach(function (r) {
      if (r.date < start || r.date > end) return;
      if (!r.auto) own = true;
      if (!first || r.date < first) first = r.date;
    });
    if (!own) return null;
    var startDay = STARTED && first && first < STARTED ? first : STARTED;
    var from = startDay && startDay > start ? startDay : start;
    if (from > end) return { days: 0, from: from };
    var spent = Object.create(null);
    ROWS.forEach(function (r) { if (!r.income && r.date >= from && r.date <= end) spent[r.date] = 1; });
    return { days: dayDiff(from, end) + 1 - Object.keys(spent).length, from: from };
  }
`,
      "",
    ],
  ];
  for (const [current, previous] of reversals) {
    assert.equal(block.split(current).length - 1, 1, "V22.9.116 analysis client exception must occur exactly once: " + current.slice(0, 80));
    block = block.replace(current, () => previous);
  }
  return block;
}

// V22.9.119 (사용자 2026-11-12 전체 점검 개선 승인 — 리포트·분석 숫자와 문장 맞추기 N-1·N-2·N-4·N-9·N-13) changes renderMyAnalysisHtml
// (종합 리포트, V2 §8 R3 보호 화면) in exactly seven places — sentences and expressions only, no layout (칸·순서·탭·필터·차트 그대로):
// one local declaration (reportText = reportSectionText(...)), the two basis captions after the 총 지출·총 수입 deltas (N-1, 미리 적은 금액이 있을 때만),
// the donut title/summary month name (N-13), the category-change section title/description/table call (N-2·N-9·N-13), the anomaly call options
// (N-9·N-13) and the ‘고정비 점검’ tip renamed to match the ‘주거·통신·보험·구독’ cells (N-4). Reversing them keeps the whole-renderer hashes
// (validate-ux-principles·validate-ads-gate-v22940·validate-polish-v22940·validate-d3-refund-guidance-v22958) guarding every other byte.
export function beforeReportNumbersV229119(block) {
  const reversals = [
    ["  const reportText = reportSectionText(ext, fair, month, analysis);\n", ""],
    ["${reportText.expenseBasis}", ""],
    ["${reportText.incomeBasis}", ""],
    [
      "<summary>${escapeHtml(reportText.monthLabel)} 지출 구성 (도넛 차트)</summary><div><h2>${escapeHtml(reportText.monthLabel)} 지출 구성</h2>",
      "<summary>이번 달 지출 구성 (도넛 차트)</summary><div><h2>이번 달 지출 구성</h2>",
    ],
    [
      "<summary>${escapeHtml(reportText.compareTitle)}</summary><div><h2>${escapeHtml(reportText.compareTitle)}</h2><p class=\"muted\">${escapeHtml(reportText.compareDesc)}</p>${renderCategoryCompareTable(reportText.compareItems, true, reportText.compareLabels)}",
      "<summary>전월 대비 분류 변화 TOP</summary><div><h2>전월 대비 분류 변화 TOP</h2><p class=\"muted\">지난달보다 크게 늘거나 줄어든 분류입니다.</p>${renderCategoryCompareTable(ext.categoryCompare, true)}",
    ],
    ["${renderAnomalyList(anomalies, reportText.anomaly)}", "${renderAnomalyList(anomalies)}"],
    ["<div><b>주거·통신·보험·구독 점검</b><br/>", "<div><b>고정비 점검</b><br/>"],
  ];
  for (const [current, previous] of reversals) {
    assert.equal(block.split(current).length - 1, 1, "V22.9.119 renderer exception must occur exactly once: " + current.slice(0, 80));
    block = block.replace(current, () => previous);
  }
  return block;
}

// V22.9.54 changes only these two money expressions in renderMyAnalysisHtml.
// Reversing them lets existing whole-renderer hashes keep guarding all other
// bytes. Actual future-month output is covered by validate-bot-observation.
export function beforeBotObservationRenderer(block) {
  block = beforeDarkBudgetTable(beforeUiClarityV22983(beforeNumbersTrustV22989(beforeReportNumbersV229119(block))));
  // V22.9.58 authorizes exactly two comparison spans and one local declaration.
  const reversals = [
    [
        "  const comparisonDisplay = fairMoMDisplay(fair);\n",
        ""
    ],
    [
        "<span class=\"${comparisonDisplay.expense.cls}\">${escapeHtml(comparisonDisplay.expense.text)}</span>",
        "<span class=\"${deltaClass(fair.expense)}\">${escapeHtml(fair.label)} ${formatSignedPercent(fair.expense)}</span>"
    ],
    [
        "<span class=\"${comparisonDisplay.income.cls}\">${escapeHtml(comparisonDisplay.income.text)}</span>",
        "<span class=\"${fair.income > 0 ? \"deltaDown\" : fair.income < 0 ? \"deltaUp\" : \"deltaFlat\"}\">${escapeHtml(fair.label)} ${formatSignedPercent(fair.income)}</span>"
    ],
    // V22.9.80 T-21: 분석 보고서(?view=report) 내비가 구성원에게 ‘관리자 전용’ 표시를 붙이도록 역할(role)을 넘기는 한 조각. 렌더러의 나머지 바이트는 그대로다.
    [
        "showSidebarDashboard: true, role: String(selected.role || \"\"), sidebarRows: rows,",
        "showSidebarDashboard: true, sidebarRows: rows,"
    ]
];
  for (const [current, previous] of reversals) {
    assert.equal(block.split(current).length - 1, 1, "D-3 renderer exception must occur exactly once: " + current);
    block = block.replace(current, previous);
  }
  return block
    .replace('${renderObservedMoney(analysis, analysis.avgExpense)}', '${numberWithCommas(analysis.avgExpense || 0)}원')
    .replace('${renderObservedMoney(analysis, analysis.burnForecast)}', '${numberWithCommas(analysis.burnForecast || 0)}원');
}

export function counter(label) {
  let checks = 0;
  return {
    ok(value, message) { assert.ok(value, message); checks += 1; },
    eq(actual, expected, message) { assert.equal(actual, expected, message); checks += 1; },
    deepEq(actual, expected, message) { assert.deepEqual(actual, expected, message); checks += 1; },
    done() { console.log(`${label} (${checks} checks)`); return checks; },
  };
}

export async function fixture(task, options = {}) {
  const fx = await createV2265QaFixture(options);
  fx.env.SKILL_RATE_LIMIT = 10000;
  const fixtureFetch = globalThis.fetch;
  try {
    return await task(fx);
  } finally {
    globalThis.fetch = fixtureFetch;
    fx.restore();
  }
}

// 픽스처 fetch 앞에 끼워 특정 요청만 실패시킨다. handler 가 Response 를 돌려주면 그 응답을 쓴다.
// forward() 는 원래 요청을 보낸다(저장은 되고 응답만 잃는 상황을 만들 때 쓴다).
export function intercept(handler) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
    const injected = await handler({ url, method, init, forward: () => previous(input, init) });
    if (injected) return injected;
    return previous(input, init);
  };
  return () => { globalThis.fetch = previous; };
}

export const failure = (status = 503, message = "simulated failure") => new Response(JSON.stringify({ code: "QA", message }), { status, headers: { "content-type": "application/json" } });

export async function withClock(ymd, task) {
  const previous = globalThis.__AB_QA_FIXED_NOW_MS;
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(`${ymd}T12:00:00+09:00`);
  try { return await task(); } finally { globalThis.__AB_QA_FIXED_NOW_MS = previous; }
}

export async function page(fx, path, { cookie = fx.cookie, headers = {} } = {}) {
  const response = await app.fetch(new Request(`${BASE}${path}`, { headers: { ...(cookie ? { cookie } : {}), accept: "text/html", ...headers } }), fx.env, ctx);
  return { status: response.status, location: response.headers.get("location") || "", setCookie: response.headers.get("set-cookie") || "", html: await response.text() };
}

export async function post(fx, path, values, { cookie = fx.cookie, accept = "text/html" } = {}) {
  const body = values instanceof URLSearchParams ? values : new URLSearchParams(values);
  const response = await app.fetch(new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { ...(cookie ? { cookie } : {}), "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept },
    body: body.toString(),
  }), fx.env, ctx);
  const location = response.headers.get("location") || "";
  return { status: response.status, location, decoded: decodeURIComponent(location), setCookie: response.headers.get("set-cookie") || "", text: await response.text() };
}

export async function api(fx, path, method = "GET", body) {
  const response = await app.fetch(new Request(`${BASE}${path}`, {
    method,
    headers: { cookie: fx.cookie, "content-type": "application/json", accept: "application/json", ...(method === "GET" ? {} : { origin: BASE, "sec-fetch-site": "same-origin" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), fx.env, ctx);
  let data = null;
  try { data = await response.json(); } catch (_) {}
  return { status: response.status, data };
}

export async function skill(fx, utterance, { user = "kakao_login:2265", groupKey = "" } = {}) {
  const jobs = [];
  const userRequest = {
    timezone: "Asia/Seoul",
    params: {},
    block: { id: "b1", name: "블록" },
    utterance,
    lang: "kr",
    user: { id: user, type: "botUserKey", properties: { botUserKey: user, ...(groupKey ? { botGroupKey: groupKey } : {}) } },
  };
  if (groupKey) userRequest.chat = { id: groupKey, type: "groupChat", properties: { botGroupKey: groupKey } };
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      intent: { id: "i1", name: "블록" },
      userRequest,
      bot: { id: "bot1", name: "말해가계부" },
      action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} },
      contexts: [],
    }),
  }), fx.env, { waitUntil(job) { jobs.push(job); } });
  const raw = await response.text();
  for (let offset = 0; offset < jobs.length;) { const batch = jobs.slice(offset); offset += batch.length; await Promise.allSettled(batch); }
  try {
    const data = JSON.parse(raw);
    return String(data?.template?.outputs?.map((o) => o?.simpleText?.text || o?.textCard?.description || "").join("\n") || raw);
  } catch (_) {
    return raw;
  }
}

// 그린 화면의 폼 하나를 브라우저처럼 직렬화한다(선택된 옵션·체크된 칸만).
export function formFields(html, actionPath) {
  const form = html.match(new RegExp(`<form\\b[^>]*action="${actionPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>[\\s\\S]*?</form>`))?.[0] || "";
  const fields = new URLSearchParams();
  for (const m of form.matchAll(/<input\b([^>]*)>/g)) {
    const tag = m[1];
    const name = (tag.match(/\bname="([^"]+)"/) || [])[1];
    if (!name || /\bdisabled\b/.test(tag)) continue;
    const type = ((tag.match(/\btype="([^"]+)"/) || [])[1] || "text").toLowerCase();
    if ((type === "radio" || type === "checkbox") && !/\bchecked\b/.test(tag)) continue;
    if (type === "submit" || type === "button") continue;
    fields.append(name, ((tag.match(/\bvalue="([^"]*)"/) || [, ""])[1]).replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  }
  for (const m of form.matchAll(/<select\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const selected = (m[2].match(/<option\b[^>]*value="([^"]*)"[^>]*\bselected\b/) || m[2].match(/<option\b[^>]*value="([^"]*)"/) || [, ""])[1];
    fields.append(m[1], selected.replace(/&amp;/g, "&"));
  }
  for (const m of form.matchAll(/<textarea\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) fields.append(m[1], m[2].replace(/&amp;/g, "&"));
  return { found: !!form, form, fields };
}

export const settingValue = (fx, key) => fx.db.accountbook_settings.find((row) => row.key === key)?.value;
export function putSetting(fx, key, value) {
  const row = fx.db.accountbook_settings.find((item) => item.key === key);
  if (row) row.value = value;
  else fx.db.accountbook_settings.push({ id: `qa-${key}`, key, value, created_at: new Date().toISOString() });
}

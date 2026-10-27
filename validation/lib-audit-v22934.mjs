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

// V22.9.54 changes only these two money expressions in renderMyAnalysisHtml.
// Reversing them lets existing whole-renderer hashes keep guarding all other
// bytes. Actual future-month output is covered by validate-bot-observation.
export function beforeBotObservationRenderer(block) {
  block = beforeDarkBudgetTable(block);
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
  }), fx.env, ctx);
  const raw = await response.text();
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

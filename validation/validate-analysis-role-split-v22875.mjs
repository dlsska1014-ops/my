// V22.8.75: 통계(소비 분석)와 종합 리포트가 같은 카드를 두 번 그리던 문제를 막는다.
//
// 두 화면은 그대로 두고 역할만 나눴다.
//   · 소비 분석  = 빠르게 보는 요약  → "한눈에 보기" 코크핏을 여기서만 그린다.
//   · 종합 리포트 = 깊게 보는 분석    → 코크핏 대신 KPI 그리드·핵심 인사이트·
//                                      예산 게이지·분류별 예산 사용률로 더 깊게 본다.
// 코크핏을 종합 리포트에 되돌리면 같은 페이지 안에서 네 카드와 다시 겹치므로,
// 그 복귀를 여기서 실패로 잡는다.
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
let checks = 0;

function ok(value, message) {
  checks++;
  if (!value) throw new Error(`FAIL: ${message}`);
}

function eq(actual, expected, message) {
  ok(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function headings(html) {
  return [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)]
    .map((match) => match[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// 소스 수준: 역할이 코드에 고정되어 있는지
// ---------------------------------------------------------------------------
ok(source.includes("${renderReportDashboard(dashboard)}"), "summary screen still renders the shared cockpit");
eq(source.split("${renderReportDashboard(dashboard)}").length - 1, 1, "the cockpit is rendered from exactly one screen");
ok(!/renderMyAnalysisHtml\(\{[^}]*dashboard/.test(source), "deep report no longer receives the summary model it does not draw");
ok(source.includes("빠르게 보는 요약 화면입니다"), "summary screen states its role in the hero");
ok(source.includes("깊게 보는 분석 화면입니다"), "deep report states its role in the hero");
ok(source.includes('href="/my/analysis?view=report&${qs}">깊게 보기(종합 리포트)'), "summary links onward to the deep report");
ok(source.includes('href="/my/analysis?${qs}#reportCockpitTitle">← 한눈에 보기(소비 분석)'), "deep report links back to the summary cockpit");
ok(source.includes('id="reportCockpitTitle"'), "the cockpit anchor the deep report links to exists");

// 통계 화면 안에서도 예산 사용률이 두 번 그려지지 않는다.
ok(source.includes("<h2>예산 소비 페이스</h2>"), "the stats budget card is renamed to the part the cockpit lacks");
ok(!source.includes("<h2>이번 달 예산</h2>"), "the stats budget card no longer repeats the cockpit heading");
ok(source.includes("var hasBudget = BUDGET && Number(BUDGET.total) > 0;"), "the pace card hides when there is no total to pace against");
ok(source.includes("renderPaceChart(box, monthRows, total);"), "the pace curve — the part only this card draws — is kept");
ok(!/cats\.slice\(0, 6\)\.forEach/.test(source), "the stats budget card no longer redraws per-category usage");

// ---------------------------------------------------------------------------
// 렌더 결과: 실제 응답에서 카드가 겹치지 않는지
// ---------------------------------------------------------------------------
const fixture = await createV2265QaFixture();
try {
  const context = "month=2026-07&household_id=house-home";
  const request = (path) => app.fetch(
    new Request(`https://ttokttok-accountbook.com${path}`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }),
    fixture.env,
    {},
  );

  const summaryResponse = await request(`/my/analysis?${context}`);
  eq(summaryResponse.status, 200, "summary screen still renders");
  const summaryHtml = await summaryResponse.text();

  const reportResponse = await request(`/my/analysis?view=report&${context}`);
  eq(reportResponse.status, 200, "deep report still renders");
  const reportHtml = await reportResponse.text();

  const monthlyResponse = await request(`/reports?${context}`);
  eq(monthlyResponse.status, 200, "monthly closing still renders");
  const monthlyHtml = await monthlyResponse.text();

  // 두 화면 모두 살아 있고 URL 도 그대로다.
  ok(summaryHtml.includes("<h1>소비 분석</h1>"), "summary screen keeps its own URL and title");
  ok(reportHtml.includes("<h1>종합 리포트</h1>"), "deep report keeps its own URL and title");

  // 코크핏은 요약 쪽에만.
  ok(summaryHtml.includes('class="reportCockpit"'), "summary owns the cockpit");
  ok(!reportHtml.includes('class="reportCockpit"'), "deep report does not repeat the cockpit");
  ok(summaryHtml.includes('id="reportCockpitTitle"'), "the anchor target the deep report links to is reachable");
  ok(reportHtml.includes("#reportCockpitTitle"), "deep report offers a way back to the summary");
  ok(summaryHtml.includes("view=report"), "summary offers a way into the deep report");

  // 코크핏이 대신하던 내용은 종합 리포트에 더 깊은 형태로 그대로 남아 있다.
  for (const kept of ["핵심 인사이트", "예산 사용 게이지", "분류별 예산 사용률", "월말 예상 지출"]) {
    ok(reportHtml.includes(kept), `deep report still covers ${kept} in its own detailed form`);
  }

  // 제목이 겹치는 카드는 챌린지 하나뿐 — 챌린지는 홈·요약·리포트가 함께 쓰는
  // 진행 표시라 의도적으로 남긴다. 그 밖의 제목이 겹치면 중복이 되살아난 것이다.
  const summaryTitles = headings(summaryHtml);
  const reportTitles = headings(reportHtml);
  const monthlyTitles = headings(monthlyHtml);
  ok(summaryTitles.length > 5 && reportTitles.length > 10, "both screens still carry their own card sets");
  const shared = summaryTitles.filter((title) => reportTitles.includes(title));
  const challengeOnly = shared.every((title) => title.includes("무지출 데이") || title.includes("챌린지"));
  ok(challengeOnly, `only the shared challenge may appear on both screens (found: ${shared.join(", ") || "없음"})`);
  ok(shared.length <= 1, `summary and deep report repeat at most the challenge card (found ${shared.length})`);
  eq(summaryTitles.filter((title) => monthlyTitles.includes(title)).length, 0, "summary and monthly closing share no card");
  eq(reportTitles.filter((title) => monthlyTitles.includes(title)).length, 0, "deep report and monthly closing share no card");

  // 요약 화면 안에서도 같은 표가 두 번 나오지 않는다.
  ok(summaryTitles.includes("예산 소비 페이스"), "summary keeps the pace card the cockpit cannot show");
  ok(!summaryTitles.includes("이번 달 예산"), "summary no longer repeats the cockpit budget gauge as a card");
  eq(new Set(summaryTitles).size, summaryTitles.length, "no card title repeats inside the summary screen");
  eq(new Set(reportTitles).size, reportTitles.length, "no card title repeats inside the deep report");

  // 역할을 나눴으니 "돌아가는 길"이 주요 버튼으로 읽혀야 한다. 같은 히어로의
  // 보조 버튼까지 파란 주요 버튼으로 칠해지면 어디로 가야 할지 구분되지 않는다.
  const heroButtons = [...reportHtml.matchAll(/<a class="btn( secondary)?" href="([^"]+)"/g)].map((m) => ({ secondary: !!m[1] }));
  ok(heroButtons.some((item) => !item.secondary), "deep report hero keeps one primary action");
  ok(heroButtons.some((item) => item.secondary), "deep report hero keeps secondary actions");
  ok(source.includes(".abV2281 .btn:not(.light):not(.soft):not(.danger):not(.secondary)"), "the primary blue fill no longer swallows secondary buttons");
  ok(!source.includes(".abV2281 .btn:not(.light):not(.soft):not(.danger){"), "no primary rule remains that outranks .btn.secondary");
  ok(!source.includes(".abV2281 .btn:not(.light):not(.soft):not(.danger),"), "no primary selector list remains that outranks .btn.secondary");

  // 요약 화면의 클라이언트 번들도 분류별 사용률을 다시 그리지 않는다.
  const bundleResponse = await request("/my/analysis/app.js");
  eq(bundleResponse.status, 200, "analysis client bundle still serves");
  const bundle = await bundleResponse.text();
  ok(bundle.includes("renderPaceChart"), "client bundle keeps the pace chart");
  ok(!bundle.includes("cats.slice(0, 6)"), "client bundle no longer redraws per-category budget usage");
} finally {
  await fixture.cleanup?.();
}

console.log(`PASS: V22.8.75 analysis role split (${checks} checks)`);

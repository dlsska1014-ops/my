import assert from "node:assert/strict";
import { counter, fixture, intercept, failure, page, post, withClock } from "./lib-audit-v22934.mjs";
import { calculateDashboardAnalysis, monthlyObservedSpending } from "../src/modules/domain/analytics.js";
import { buildReportDashboardSummary } from "../src/modules/my/report-challenge.js";
import { calendarDaysFromRows } from "../src/modules/domain/transactions-core.js";
const {ok, eq, deepEq, done} = counter("BOT observed period V22.9.54");
globalThis.fetch = async () => { throw new Error("External fetch forbidden"); };
const row = (date, amount, id = date) => ({ id, household_id:"house-home", user_id:"user-bin", transaction_date:date, type:"expense", category:"외식", memo:"합성 거래", amount });
async function analysisPage(fx, path) {
  if (path.startsWith("/my/")) return page(fx,path);
  fx.env.ADMIN_PASSWORD="synthetic-analysis-password";
  fx.env.ADMIN_SESSION_SECRET="synthetic-analysis-session";
  fx.env.AUTH_RATE_LIMIT=30; // Independent synthetic pages share one in-memory IP bucket.
  const login=await post(fx,"/login",{password:fx.env.ADMIN_PASSWORD},{cookie:""});
  ok(/ab_admin=/.test(login.setCookie),"synthetic administrator authenticated before HTML assertions");
  return page(fx,path+"&legacy=1",{cookie:fx.cookie+"; "+(login.setCookie.match(/ab_admin=[^;]+/) || [""])[0]});
}
await withClock("2026-10-15", async () => {
  const rows = [row("2026-10-10",300000), row("2026-10-25",150000)];
  const analysis = calculateDashboardAnalysis(rows, rows, calendarDaysFromRows(rows,"2026-10"),"2026-10");
  deepEq([analysis.expense,analysis.observedExpense,analysis.avgExpense,analysis.burnForecast], [450000,300000,20000,620000], "monthly total and observed rates");
  eq(analysis.noSpendDays, 14, "future dates are not no-spend observations");
  const summary = buildReportDashboardSummary(rows,{},"2026-10");
  deepEq([summary.expense,summary.observedExpense,summary.forecast],[450000,300000,620000],"default analysis dashboard agrees");
  for (const path of ["/my/analysis", "/my/analysis?view=report", "/analysis", "/admin-view?tab=overview", "/?tab=premium", "/smart-tools"]) await fixture(async fx => {
    fx.db.transactions = structuredClone(rows);
    // V22.9.79 V76 W-7: 사용자 화면의 월말 예상은 반영 대기 고정지출을 더한다. 기록만 재는 이 검사는 픽스처의 월세 규칙을 비운다
    // (고정지출이 든 화면끼리의 같음은 validate-spending-outlook-v22979 가 본다).
    fx.db.accountbook_recurring = [];
    const p=await analysisPage(fx,path+(path.includes("?")?"&":"?")+"month=2026-10&household_id=house-home");
    eq(p.status,200,"actual HTML route " + path);
    ok(p.html.includes("450,000원"),"full monthly total retained");
    ok(p.html.includes("620,000원"),"actual HTML observed forecast");
    ok(!p.html.includes("930,000원"),"future row excluded from speed");
    if(path!=="/my/analysis" && path!=="/smart-tools") ok(p.html.includes("20,000원"),"actual HTML average");
  });
  for (const [month, input, expected] of [
    ["2026-10",[],[15,0,0,0]],
    ["2026-10",[row("2026-10-25",150000)],[15,0,0,0]],
    ["2026-09",[row("2026-09-30",300000)],[30,300000,10000,300000]],
    ["2026-11",[row("2026-11-01",300000)],[0,0,null,null]],
    ["2024-02",[row("2024-02-29",290000)],[29,290000,10000,290000]],
    ["2025-02",[row("2025-02-28",280000)],[28,280000,10000,280000]],
  ]) {
    const a=monthlyObservedSpending(input,month);
    deepEq([a.basisDays,a.observedExpense,a.avgExpense,a.burnForecast],expected,"month boundary " + month);
  }
  for (const path of ["/my/analysis", "/my/analysis?view=report", "/analysis", "/admin-view?tab=overview", "/?tab=premium", "/smart-tools"]) await fixture(async fx => {
    fx.db.transactions=[row("2026-11-01",300000),{...row("2026-11-02",400000,"future-income"),type:"income",category:"급여"}];
    const p=await analysisPage(fx,path+(path.includes("?")?"&":"?")+"month=2026-11&household_id=house-home");
    eq(p.status,200,"actual future HTML route " + path);
    ok(p.html.includes("관측 전"),"future month explicit state " + path);
    ok(!/(?:현재 속도|월말 예상) 기준 수입 대비 0%|<b>0원<\/b><span>절약 후보|<b>0점<\/b><span>관리 점수|절약 후보<\/span><b>0원|현재 위험점수 0점|무지출일 0일/.test(p.html),"all future derived summaries retain unavailable state " + path);
    ok(!/월말 예상(?: 지출)?<\/span><b>0원/.test(p.html),"future month is not 0 forecast");
    ok(!/소비 위험도<\/[^>]+><[^>]+>0점|정상 범위|위험 점수<\/span><b[^>]*>null점|관리 점수<\/[^>]+><[^>]+>100점/.test(p.html),"future risk and achievement not fabricated");
  });
  await fixture(async fx => {
    fx.db.transactions=[{...row("2026-11-02",400000,"future-income-only"),type:"income",category:"급여"}];
    const p=await analysisPage(fx,"/?tab=premium&month=2026-11&household_id=house-home");
    const futureAnalysis=calculateDashboardAnalysis(fx.db.transactions,fx.db.transactions,calendarDaysFromRows(fx.db.transactions,"2026-11"),"2026-11");
    eq(futureAnalysis.meme.key,"BEFORE_OBSERVATION","future income alone does not earn no-spend achievement");
    ok(p.html.includes("관측 전"),"future income-only HTML retains unavailable observation state");
  });
  for (const path of ["/my/analysis", "/my/analysis?view=report", "/analysis"]) await fixture(async fx => {
    intercept(({url,method}) => method === "GET" && url.pathname.endsWith("/transactions") ? failure(503,"synthetic read failure") : undefined);
    const p=await analysisPage(fx,path+(path.includes("?")?"&":"?")+"month=2026-10&household_id=house-home");
    ok(!p.html.includes("reportCockpitGrid") && !/하루 평균 지출<\/span><b>0원/.test(p.html),"read failure not successful zero report " + path);
  });
});
for (const [clock,days] of [["2026-10-15T14:59:59.999Z",15],["2026-10-15T15:00:00.000Z",16],["2026-10-31T14:59:59.999Z",31],["2026-10-31T15:00:00.000Z",31]]) {
  const old=globalThis.__AB_QA_FIXED_NOW_MS;
  globalThis.__AB_QA_FIXED_NOW_MS=Date.parse(clock);
  try { eq(monthlyObservedSpending([],"2026-10").basisDays,days,"KST boundary " + clock); }
  finally { globalThis.__AB_QA_FIXED_NOW_MS=old; }
}
assert.throws(()=>monthlyObservedSpending(null,"2026-10"),/analysis_observation_invalid/);
ok(true,"missing rows not treated as empty");
done();

// V22.9.37 관제 알림·표본 검사.
// 관제 1.0.1 은 경고를 관리자가 화면을 열 때만 계산했고 아무 데도 보내지 않았다. 요금제 확인 기록은 7일 뒤 만료돼 2026-10-08
// 부터 모든 한도 경고가 꺼져 있었고, p95 표본 부족 때문에 전체 상태는 늘 "확인 불가"였다. 앱 쪽에서는 전송 실패가 조용히
// 사라지고, 저장 실패 답장이 "ok"로 집계되고, 설정·정산·예산 알림 화면은 표본에서 빠져 있었다. 이 검사는 관제 1.1.0 의
// 소스·설정·워크플로와 앱 쪽 세 가지(전송 실패 이벤트, 저장 실패 분류, 표본 범위)를 본다. 관제 Worker 의 동작 자체는
// `node monitoring/test-d1.mjs`(SQLite)가 따로 확인한다.
import { existsSync, readFileSync } from "node:fs";
import { BASE, counter, ctx, fixture, intercept, page } from "./lib-audit-v22934.mjs";
import app from "../src/index.js";

const { ok, eq, done } = counter("V22.9.37 관제 알림·표본 검사 통과");
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const source = read("src/index.js");

// ── 1. 관제 Worker 소스·설정·워크플로 ────────────────────────────────────────
{
  const worker = read("monitoring/worker.mjs");
  ok(worker.includes("export async function deliverAlerts("), "관제가 경고를 발송하는 함수를 가진다");
  ok(/ALERT_RESEND_MS=\{critical:6\*3600000,upgrade:12\*3600000,warning:24\*3600000\}/.test(worker), "같은 경고는 긴급 6시간·전환 검토 12시간·주의 24시간 안에 다시 보내지 않는다");
  ok(worker.includes('await writeCollector(env,"alerts",()=>deliverAlerts(env,now),now);'), "매 수집 뒤에 발송하고 결과를 수집 상태 alerts 로 남긴다");
  ok(worker.includes('throw new Error(`delivery_failed ${failures.join(" ")}`);'), "모든 채널이 실패하면 기록을 남기지 않아 다음 수집 때 다시 보낸다");
  ok(worker.includes("async function collectToken(env)") && worker.includes("/client/v4/user/tokens/verify"), "분석 토큰 만료일을 시간마다 확인한다");
  ok(worker.includes("const planStale=!planFresh&&") && worker.includes('title:"요금제 확인 기록 만료"'), "요금제 확인 기록이 만료돼도 마지막 한도로 비교하고 재확인을 알린다");
  ok(worker.includes("const notes=[];") && worker.includes('notes.push("카카오 p95 표본 부족'), "p95 표본 부족은 확인 불가가 아니라 참고 사항이다");
  ok(worker.includes('title:"앱 Worker 런타임 오류(오늘)"'), "앱 런타임 오류는 요청 수와 무관하게 건수로 경고한다");
  ok(/metrics_unavailable\|http_\\d\+/.test(worker), "DB 수집 실패의 실제 원인 코드가 살아남는다");
  ok(read("monitoring/model.mjs").includes('MONITOR_VERSION = "1.1.0"'), "관제 판은 1.1.0 이다");
  const wrangler = read("monitoring/wrangler.jsonc");
  ok(wrangler.includes('"CF_PLAN": "free"') && wrangler.includes('"ALERT_TO"') && wrangler.includes('"ALERT_FROM"'), "관제 설정에 요금제·알림 변수가 있다");
  ok(wrangler.includes('"observability": { "enabled": true }'), "관제 Worker 의 Workers Logs 를 켠다");
  ok(existsSync(new URL("../.github/workflows/monitoring.yml", import.meta.url)), "외부 접속 검사 워크플로가 활성화돼 있다");
  const workflow = read(".github/workflows/monitoring.yml");
  ok(workflow.includes('cron: "*/30 * * * *"') && workflow.includes("node monitoring/external-check.mjs"), "외부 검사는 30분마다 공개 /health·/ready 를 본다");
  ok(read("monitoring/README.md").includes("## 알림 발송 (1.1.0)"), "README 가 알림 발송 설정 순서를 적는다");
  const dashboard = read("monitoring/dashboard.mjs");
  ok(dashboard.includes("alerts:'알림 발송'") && dashboard.includes("d.notes"), "화면이 알림 발송 상태와 참고 사항을 보여 준다");
}

// ── 2. 앱 소스: 표본 범위·전송 실패 이벤트·저장 실패 분류 ───────────────────────
{
  const prefixes = (source.match(/const AB_MONITOR_ROUTE_PREFIXES = \[([^\]]+)\];/) || [, ""])[1];
  for (const path of ["/reports", "/settings", "/backup", "/settlement-summary", "/budget-alerts", "/goals", "/reserve-plans", "/payment-methods", "/annual", "/menu"]) ok(prefixes.includes(`"${path}"`), `${path} 화면이 관제 표본에 들어간다`);
  ok(source.includes('kind: "monitor_send_failed"'), "관제 전송 실패를 운영 이벤트로 남긴다");
  ok(source.includes("if (AB_MONITOR_SEND_FAILURE.minute === minute) return;"), "전송 실패 이벤트는 인스턴스마다 분당 한 번이다");
  ok(source.includes('reason: "save_failed"') && source.includes('reason: "save_uncertain"'), "저장 실패·불확실 답장을 ok 가 아니라 error 로 분류한다");
}

// ── 3. 앱 동작: 표본 범위와 전송 실패 ────────────────────────────────────────
await fixture(async (fx) => {
  const posted = [];
  fx.env.OPS_MONITOR_TOKEN = "qa-monitor-token";
  fx.env.OPS_MONITOR = { async fetch(_url, init) { posted.push(JSON.parse(String(init.body))); return new Response("", { status: 202 }); } };
  const random = Math.random;
  Math.random = () => 0; // 2% 무작위 표본에 항상 걸리게 한다
  try {
    for (const path of ["/reserve-plans?household_id=house-home", "/reports?month=2026-07&household_id=house-home", "/my/settings?household_id=house-home"]) {
      const res = await page(fx, path);
      ok(res.status === 200, `${path.split("?")[0]} 화면이 열린다(HTTP ${res.status})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
    eq(posted.length, 3, "세 화면 모두 관제 표본으로 전송된다(예전에는 /reserve-plans·/reports 가 빠졌다)");
    ok(posted.every((event) => event.route === "web" && !("url" in event) && !("utterance" in event)), "표본에는 경로 종류만 있고 주소·발화는 없다");

    const before = (globalThis.__AB_OPS_EVENTS || []).length;
    fx.env.OPS_MONITOR = { async fetch() { throw new Error("monitor down"); } };
    await page(fx, "/reports?month=2026-06&household_id=house-home");
    await page(fx, "/reports?month=2026-05&household_id=house-home");
    await new Promise((resolve) => setTimeout(resolve, 60));
    const failed = (globalThis.__AB_OPS_EVENTS || []).slice(before).filter((event) => event.kind === "monitor_send_failed");
    eq(failed.length, 1, "관제 전송 실패가 운영 이벤트로 한 번 남는다(같은 분 안에서는 한 번)");
    ok(String(failed[0]?.detail || "").includes("monitor down"), "이벤트 상세에 실패 이유가 있다");
  } finally { Math.random = random; }
});

// ── 4. 앱 동작: 저장 실패 답장의 분류 ───────────────────────────────────────
await fixture(async (fx) => {
  fx.env.SKILL_RATE_LIMIT = 10000;
  fx.db.accountbook_settings.push({ id: "sel-bin-v22937m", key: "kakao_selected_household_v2251:user-bin", value: "house-home", created_at: "2026-07-01T00:00:00Z" });
  const send = async (utterance) => {
    const user = "kakao_login:2265";
    const body = { intent: { id: "i1", name: "블록" }, userRequest: { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "블록" }, utterance, lang: "kr", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } }, bot: { id: "bot1", name: "말해가계부" }, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
    const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), fx.env, ctx);
    const data = await response.json();
    return { result: response.headers.get("x-accountbook-nlu-result"), text: String(data?.template?.outputs?.map((o) => o?.simpleText?.text || "").join("\n")) };
  };
  const good = await send("커피 4500 관제분류정상");
  eq(good.result, "ok", "정상 저장 답장은 ok 다");
  const restore = intercept(async ({ url, method }) => (method === "POST" && /\/rest\/v1\/transactions(\?|$)/.test(url.pathname + url.search) ? new Response(JSON.stringify({ code: "QA", message: "simulated rejection" }), { status: 503, headers: { "content-type": "application/json" } }) : null));
  try {
    const failed = await send("점심 9000 관제분류실패");
    ok(failed.text.includes("저장하지 못했어요") || failed.text.includes("저장 확인이 지연"), `저장소가 거절하면 실패 안내가 나간다 — ${failed.text.split("\n")[0]}`);
    eq(failed.result, "error", "저장 실패 답장은 관제에 error 로 집계된다(예전에는 ok)");
  } finally { restore(); }
});

done();

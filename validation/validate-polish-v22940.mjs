// V22.9.40 패키지 A — 화면 다듬기와 감사 잔여 항목 검사.
// A1 생활비 리포트 라벨 통일, A2(감사 U10) 인사이트 막대 aria-label 의 비율, A3(감사 U9) 모바일 홈 11px 라벨 대비와 다크 읽기 전용
// 지출자 칸, A4(감사 H11) 홈 피드의 나간 참여자 이름, A5(감사 D14) 거래내역 탭 쪽 경계의 날짜 합계를 메모리 픽스처
// (validation/qa-fixture.mjs)와 app.fetch 로 확인한다. 네트워크를 쓰지 않는다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { BASE, api, app, beforeBotObservationRenderer, counter, ctx, failure, fixture, intercept, page, withClock } from "./lib-audit-v22934.mjs";

// AB_AUDIT_SOFT=1 로 돌리면 실패를 모아 보고만 하고 멈추지 않는다(고치기 전 빌드의 재현 기록용). 기본은 첫 실패에서 멈춘다.
const LABEL = "V22.9.40 패키지 A 화면 다듬기 검사 통과";
function softCounter(label) {
  let checks = 0;
  let failed = 0;
  const report = (passed, message) => { checks += 1; if (!passed) { failed += 1; console.log(`  FAIL ${message}`); } };
  return {
    ok(value, message) { report(!!value, message); },
    eq(actual, expected, message) { report(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`); },
    done() { console.log(`${label} (${checks} checks, ${failed} failed)`); return checks; },
  };
}
const { ok, eq, done } = process.env.AB_AUDIT_SOFT === "1" ? softCounter(LABEL) : counter(LABEL);
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const HOME = "/app?month=2026-07&household_id=house-home";
const Q = "month=2026-07&household_id=house-home";
const HOME_BUDGET = 35 * 1024;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const count = (text, needle) => String(text).split(needle).length - 1;

function contrast(fg, bg) {
  const channel = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = (hex) => { const [r, g, b] = channel(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [a, b] = [lum(fg), lum(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function asset(path, method = "GET") {
  const response = await app.fetch(new Request(`${BASE}${path}`, { method }), {}, ctx);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, type: response.headers.get("content-type") || "", cache: response.headers.get("cache-control") || "", etag: response.headers.get("etag") || "", bytes, text: bytes.toString("utf8") };
}

// 모의 Supabase 호출 수와 직렬 깊이(가장 긴 의존 사슬)를 함께 잰다. validate-serial-depth-v22916 과 같은 방식이다.
async function measured(fx, path, { failUsers = false } = {}) {
  const calls = [];
  let completed = 0;
  let depth = 0;
  const restore = intercept(async ({ url, forward }) => {
    if (url.hostname !== "mock.supabase.co") return null;
    const level = completed + 1;
    depth = Math.max(depth, level);
    calls.push(decodeURIComponent(`${url.pathname}${url.search}`));
    await new Promise((resolve) => setTimeout(resolve, 6));
    const response = failUsers && url.pathname.endsWith("/users") && String(url.searchParams.get("id") || "").startsWith("in.") ? failure() : await forward();
    completed = Math.max(completed, level);
    return response;
  });
  try {
    const result = await page(fx, path);
    return { ...result, calls, depth };
  } finally {
    restore();
  }
}
const userLookups = (calls) => calls.filter((call) => call.startsWith("/rest/v1/users?") && call.includes("id=in."));
const navOf = (html) => { const start = html.indexOf('<aside id="abDesktopSidebar"'); return start < 0 ? "" : html.slice(start, html.indexOf("</aside>", start)); };

// ── A1 생활비 리포트 라벨 통일 ─────────────────────────────────────────────
await fixture(async (fx) => {
  for (const [name, path] of [["홈", HOME], ["생활비 리포트", `/reports?${Q}`], ["전체 메뉴", `/menu?${Q}`], ["설정", `/my/settings?${Q}`]]) {
    const res = await page(fx, path);
    eq(res.status, 200, `A1 ${name} 화면이 열린다`);
    ok(/<a data-key="reports"[^>]*href="\/reports\?[^"]*"[^>]*><i class="abNavItemIcon"[^>]*><\/i><span>생활비 리포트<\/span><\/a>/.test(navOf(res.html)), `A1 ${name} 사이드바의 /reports 항목이 "생활비 리포트"다`);
    ok(!res.html.includes("월 마감"), `A1 ${name} 화면 어디에도 "월 마감"이 없다`);
  }
  const reports = await page(fx, `/reports?${Q}`);
  ok(/<title>[^<]* · 무료 리포트<\/title>/.test(reports.html), "A1 /reports 문서 제목은 '무료 리포트'를 그대로 둔다(기존 검사가 고정)");
  ok(reports.html.includes("<h1>생활비 리포트</h1>"), "A1 /reports 제목(h1)은 생활비 리포트다");
  ok(reports.html.includes("<h2>자동 생성 설정</h2>") && reports.html.includes("<h2>지출 상위 분류</h2>"), "A1 /reports 의 자동 생성 설정·지출 상위 분류 절 제목은 그대로다");
  const smart = await page(fx, `/smart-tools?${Q}`);
  ok(/<a class="btn" href="\/reports\?[^"]*">생활비 리포트<\/a>/.test(smart.html), "A1 스마트 도구의 /reports 버튼도 생활비 리포트다");
  ok(!smart.html.includes(">자동 리포트</a>"), "A1 스마트 도구에 '자동 리포트' 링크가 남지 않는다");
  // 옛 사이드 메뉴(renderMySideNav)는 내보낼 때 통합 내비로 바뀌지만, 원본 라벨도 같은 이름을 쓴다.
  ok(source.includes('item("reports", `/reports?${qs}`, "생활비 리포트", "주간·월간")'), "A1 옛 사이드 메뉴의 /reports 라벨도 생활비 리포트다(보조 라벨 주간·월간 유지)");
  ok(source.includes('["생활비 리포트", `/reports?month=${encodeURIComponent(month)}${hh}`, "주간·월간 생성·공유"]'), "A1 관리자 경로 점검 표의 /reports 이름도 같다");
  // 라벨이 9 B 길어진 만큼 걷어 낸 공백이 되살아나면 홈 예산(여유 6 B)을 넘는다.
  const home = await page(fx, HOME);
  ok(!home.html.includes('class="abNavGroup "') && !/<nav class="abNavBottom"[^>]*>[\s\S]*?class="[^"]*"  /.test(home.html), "A1 사이드바 그룹 클래스 끝 공백·하단 탭 이중 공백이 없다");
  ok(Buffer.byteLength(home.html) < HOME_BUDGET, `A1 기준 픽스처 홈 HTML 이 35 KiB 미만이다 (${Buffer.byteLength(home.html)} B)`);
});
// 기준선(BASELINE "당월 6행")은 픽스처의 달을 이번 달로 볼 때다. 오늘 표시·지난달 같은 기간 비교가 붙어 가장 크다.
await withClock("2026-07-15", () => fixture(async (fx) => {
  const home = await page(fx, HOME);
  ok(Buffer.byteLength(home.html) < HOME_BUDGET, `A1 당월(2026-07-15) 기준 픽스처 홈 HTML 도 35 KiB 미만이다 (${Buffer.byteLength(home.html)} B)`);
}));

// ── A2 감사 U10: 인사이트 막대 aria-label 에 보이는 비율을 넣는다 ─────────────────
await fixture(async (fx) => {
  const res = await app.fetch(new Request(`${BASE}/my/analysis/app.js`, { headers: { cookie: fx.cookie } }), fx.env, ctx);
  const js = await res.text();
  eq(res.status, 200, "A2 분석 화면 클라이언트가 내려간다");
  const legendLabel = 'row.setAttribute("aria-label", s.name + " " + Math.round(s.amt / total * 100) + "% " + won(s.amt) + ", 누르면 이 분류만 필터");';
  const barLabel = 'row.setAttribute("aria-label", it.name + " " + won(it.amt) + " " + share.textContent + ", 누르면 필터 적용");';
  ok(js.includes(legendLabel), "A2 분류 범례 버튼의 접근성 이름이 보이는 순서(이름·비율·금액)대로 비율을 담는다");
  ok(js.includes(barLabel), "A2 결제수단·구성원 막대의 접근성 이름이 보이는 순서(이름·금액·비율)대로 비율을 담는다");
  ok(js.includes('row.appendChild(el("span", "pct", Math.round(s.amt / total * 100) + "%"));'), "A2 범례의 보이는 비율 글자와 접근성 이름이 같은 식을 쓴다");
  ok(js.includes('var share = el("small", null, Math.round(it.amt / total * 100) + "%");'), "A2 막대의 보이는 비율 글자는 share 요소이고 접근성 이름이 그 글자를 그대로 읽는다");
  ok(!js.includes('s.name + " " + won(s.amt) + ", 누르면 이 분류만 필터"') && !js.includes('it.name + " " + won(it.amt) + ", 누르면 필터 적용"'), "A2 비율이 빠진 옛 접근성 이름이 남지 않는다");
  const marker = "function insightClientMain(";
  const start = source.indexOf(marker);
  const block = source.slice(start, source.indexOf("\nfunction ", start + marker.length));
  const reverted = block
    .replace(legendLabel, 'row.setAttribute("aria-label", s.name + " " + won(s.amt) + ", 누르면 이 분류만 필터");')
    .replace(barLabel, 'row.setAttribute("aria-label", it.name + " " + won(it.amt) + ", 누르면 필터 적용");');
  // Keep the historical two-label normalization, now relative to the expressly
  // authorized C baseline; its 37 unaffected declarations are pinned separately.
  eq(sha256(reverted), "e11b22ab07bb95de80293da85d08b52740eb65b62012ea79e628b1127fc434bb", "A2 두 접근성 이름을 정규화한 승인 C 기준과 일치하며 비대상 선언은 별도로 보호합니다.");
  const renderStart = source.indexOf("function renderMyAnalysisHtml(");
  eq(sha256(beforeBotObservationRenderer(source.slice(renderStart, source.indexOf("\nfunction ", renderStart + 10)))), "db2edc2887985b44fd9456a38b7b5f014c4a8739bc5e0c4bca2ba21626ff4bfd", "A2 BOT-09 관측 표시 두 곳만 되돌리면 기존 고정 분석 화면과 같다");
});

// ── A3 감사 U9: 모바일 홈 11px 라벨 대비(라이트·다크) ───────────────────────────
{
  const css = await asset("/assets/mobile-home-v22979.css");
  eq(css.status, 200, "A3 새 홈 스타일시트 주소가 내려간다");
  ok(css.type.startsWith("text/css") && css.cache.includes("immutable") && css.etag === '"mobile-home-v22979-css"', `A3 새 주소는 CSS·1년 불변 캐시·같은 판의 ETag 다 (${css.etag})`);
  const lightRule = ".v8-edit-field>span,.v8-spender-readonly>span{font-size:11px;color:#475467;font-weight:1000}";
  ok(css.text.includes(lightRule), "A3 11px 수정 폼 라벨의 원본 색이 #475467 이다");
  ok(!css.text.includes(".v8-edit-field>span,.v8-spender-readonly>span{font-size:11px;color:#687385"), "A3 옛 보조색(#687385, 4.35:1) 라벨 규칙이 남지 않는다");
  const darkSurface = 'html[data-ab-resolved-theme="dark"] .v8-spender-readonly{background:var(--ab12-surface-raised,#282b33);border-color:var(--ab12-line,#3b475a)}';
  const darkLabel = 'html[data-ab-resolved-theme="dark"] .v8-edit-field>span,html[data-ab-resolved-theme="dark"] .v8-spender-readonly>span{color:var(--ab12-muted,#b3bdc9)}';
  ok(css.text.includes(darkSurface), "A3 다크에서 읽기 전용 지출자 칸이 밝은 배경(#f8fafc)으로 남지 않는다(다크 표면 토큰)");
  ok(css.text.includes(darkLabel), "A3 다크 라벨은 기존 다크 토큰 패턴(var(--ab12-muted,…))을 쓴다");
  ok(contrast("#475467", "#ffffff") >= 7, `A3 라벨이 흰 카드 위 7:1 이상이다 (${contrast("#475467", "#ffffff").toFixed(2)}:1)`);
  ok(contrast("#475467", "#f8fafc") >= 7, `A3 라벨이 읽기 전용 칸(#f8fafc) 위 7:1 이상이다 (${contrast("#475467", "#f8fafc").toFixed(2)}:1)`);
  ok(contrast("#475467", "#f2f4f6") >= 4.5, `A3 감사가 잰 회색 표면(#f2f4f6) 위에서도 4.5:1 이상이다 (${contrast("#475467", "#f2f4f6").toFixed(2)}:1)`);
  ok(contrast("#687385", "#f2f4f6") < 4.5, `A3 고치기 전 색은 감사가 잰 표면 위 4.5:1 미만이었다 (${contrast("#687385", "#f2f4f6").toFixed(2)}:1, 감사 U9 4.35:1 재현)`);
  const shell = await asset("/assets/accountbook-shell-v22981.css");
  const darkTokens = (shell.text.match(/html\[data-ab-resolved-theme="dark"\] body\.abV22812Shell\{([^}]*--ab12-surface-raised:[^}]*)\}/) || [])[1] || "";
  const token = (name) => (darkTokens.match(new RegExp(`--${name}:(#[0-9a-fA-F]{6})`)) || [])[1] || "";
  const [muted, raised, text, line] = ["ab12-muted", "ab12-surface-raised", "ab12-text", "ab12-line"].map(token);
  ok(muted === "#b3bdc9" && raised === "#282b33" && line === "#3b475a", `A3 대체값이 셸의 다크 토큰과 같다 (muted ${muted}, raised ${raised}, line ${line})`);
  ok(contrast(muted, raised) >= 4.5, `A3 다크 라벨(보조 토큰)이 다크 표면 위 4.5:1 이상이다 (${contrast(muted || "#000000", raised || "#000000").toFixed(2)}:1)`);
  ok(contrast(text, raised) >= 4.5, `A3 다크 읽기 전용 칸의 이름 글자가 4.5:1 이상이다 (${contrast(text || "#000000", raised || "#000000").toFixed(2)}:1)`);
  ok(contrast("#edeff3", "#f8fafc") < 1.5, "A3 고치기 전 다크 읽기 전용 칸은 밝은 배경 위 밝은 글자였다(1.1:1, 헤드리스 Chrome 실측 재현)");
  const head = await asset("/assets/mobile-home-v22979.css", "HEAD");
  ok(head.status === 200 && head.bytes.length === 0 && head.etag === css.etag, "A3 새 주소의 HEAD 는 본문 없이 같은 ETag 다");
  // 옛 주소는 1년 캐시 약속대로 옛 바이트를 그대로 낸다(AB_HISTORICAL_RUNTIME_ASSETS, CSS 형식).
  const old = await asset("/assets/mobile-home-v22919.css");
  eq(old.status, 200, "A3 옛 주소(v22919)도 계속 내려간다");
  ok(old.type.startsWith("text/css") && old.cache.includes("immutable") && old.etag === '"mobile-home-v22919-css"', `A3 옛 주소는 CSS 형식·불변 캐시·옛 ETag 그대로다 (${old.type})`);
  eq(sha256(old.bytes), "0695bbde13382d71c11769607dabd7b70e91e1b7b83c8a4df4a8b92794d047f7", "A3 옛 주소의 바이트는 V22.9.19 고정 해시 그대로다");
  ok(old.text.includes(".v8-edit-field>span,.v8-spender-readonly>span{font-size:11px;color:#687385;font-weight:1000}"), "A3 옛 바이트에는 옛 색이 그대로 있다(바이트를 고치지 않았다)");
  const oldHead = await asset("/assets/mobile-home-v22919.css", "HEAD");
  ok(oldHead.status === 200 && oldHead.bytes.length === 0 && oldHead.type.startsWith("text/css"), "A3 옛 주소의 HEAD 도 CSS 형식이고 본문이 없다");
  const nav = await asset("/assets/accountbook-v5-v22934.js");
  ok(nav.status === 200 && nav.type.startsWith("text/javascript"), "A3 형식을 적지 않은 옛 JS 보관본은 예전처럼 JS 로 내려간다");
}
await fixture(async (fx) => {
  const home = await page(fx, HOME);
  eq(count(home.html, 'href="/assets/mobile-home-v22979.css"'), 1, "A3 홈이 새 홈 스타일시트를 정확히 한 번 받는다");
  ok(!home.html.includes("mobile-home-v22919.css"), "A3 홈이 옛 주소를 더 쓰지 않는다");
});

// ── A4 감사 H11: 홈 피드의 나간 참여자 이름 ───────────────────────────────────
const LEFT_USER = { id: "user-left", kakao_user_key: "kakao_login:9901", nickname: "떠난사람", created_at: "2026-06-01T00:00:00.000Z" };
const leftTx = (id, userId) => ({ id, household_id: "house-home", user_id: userId, transaction_date: "2026-07-10", type: "expense", amount: 5400, category: "식비", memo: "떠난 사람 커피", payment_method: "현금", source: "web", raw_text: "커피 5400", created_at: "2026-07-10T03:00:00.000Z" });
let baseCalls = 0;
let baseDepth = 0;
await fixture(async (fx) => {
  await page(fx, HOME); // 첫 요청은 계정 캐시를 채운다. 평소 상태(두 번째부터)를 잰다.
  const base = await measured(fx, HOME);
  baseCalls = base.calls.length;
  baseDepth = base.depth;
  eq(base.status, 200, "A4 기준 픽스처 홈이 열린다");
  ok(baseCalls <= 9, `A4 기준 픽스처 /app 의 DB 호출이 9회 이하다 (${baseCalls}회)`);
  eq(userLookups(base.calls).length, 0, "A4 명단에 없는 지출자가 없으면 사용자 행을 더 읽지 않는다(추가 호출 0)");
});
await fixture(async (fx) => {
  fx.db.users.push(LEFT_USER);
  fx.db.transactions.push(leftTx("tx-left-1", "user-left"));
  await page(fx, HOME);
  const res = await measured(fx, HOME);
  eq(res.status, 200, "A4 나간 참여자의 기록이 있어도 홈이 열린다");
  ok(res.html.includes('<span class="v8-spender">지출자 떠난사람</span>'), "A4 홈 피드가 나간 참여자의 실제 이름을 쓴다(예전에는 '이전 참여자')");
  ok(!res.html.includes("이전 참여자"), "A4 이름을 찾은 기록은 '이전 참여자'로 그리지 않는다");
  eq(res.calls.length, baseCalls + 1, `A4 명단에 없는 지출자가 있으면 DB 호출이 정확히 1 늘어난다 (${baseCalls} → ${res.calls.length})`);
  const lookups = userLookups(res.calls);
  ok(lookups.length === 1 && lookups[0].includes("id=in.(user-left)") && lookups[0].includes("select=id,nickname"), `A4 사용자 행은 이름 칸만 한 번에 읽는다 (${lookups.join(" ")})`);
  ok(res.calls.length <= 9, `A4 나간 참여자가 있어도 /app DB 호출이 9회 이하다 (${res.calls.length}회)`);
  ok(res.depth <= baseDepth + 1, `A4 직렬 깊이는 많아야 한 단계 늘어난다 (${baseDepth} → ${res.depth})`);
  ok(!res.html.includes('value="user-left"'), "A4 나간 참여자는 지출자 선택지에 들어가지 않는다(이름 맵에만 쓴다)");
  const tab = await page(fx, `${HOME}&tab=transactions`);
  ok(tab.html.includes('<span class="v8-spender">지출자 떠난사람</span>'), "A4 거래내역 탭도 같은 이름을 쓴다");
  const day = await api(fx, "/u/api/day-transactions?date=2026-07-10&household=house-home");
  eq(day.data?.items?.find((item) => item.id === "tx-left-1")?.member, "떠난사람", "A4 /u/api/* 의 이름 붙이기(조회를 나눈 attachSpenderNamesWithHistory)는 그대로다");
});
await fixture(async (fx) => {
  fx.db.transactions.push(leftTx("tx-ghost-1", "user-ghost"));
  await page(fx, HOME);
  const res = await measured(fx, HOME);
  ok(res.status === 200 && res.html.includes('<span class="v8-spender">지출자 이전 참여자</span>'), "A4 사용자 행도 없으면 예전처럼 '이전 참여자'다");
  eq(res.calls.length, baseCalls + 1, "A4 이름을 못 찾은 경우에도 조회는 한 번뿐이다");
});
await fixture(async (fx) => {
  fx.db.users.push(LEFT_USER);
  fx.db.transactions.push(leftTx("tx-left-1", "user-left"));
  await page(fx, HOME);
  const res = await measured(fx, HOME, { failUsers: true });
  eq(res.status, 200, "A4 이름 조회가 실패해도 홈이 깨지지 않는다");
  ok(res.html.includes('<span class="v8-spender">지출자 이전 참여자</span>') && !res.html.includes("떠난사람"), "A4 이름 조회가 실패하면 조용히 '이전 참여자'로 돌아간다");
});

// ── A5 감사 D14: 거래내역 탭 쪽 경계의 날짜 합계 ──────────────────────────────
const dayHeads = (html) => [...html.matchAll(/<h3 class="txDayHead"><span>([^<]*)<\/span><b>([^<]*)<\/b><\/h3>/g)].map((m) => ({ label: m[1], sum: m[2] }));
await fixture(async (fx) => {
  await page(fx, HOME);
  const baseTab = await measured(fx, `${HOME}&tab=transactions`);
  for (let i = 0; i < 60; i += 1) {
    const date = i < 30 ? "2026-07-28" : "2026-07-27";
    fx.db.transactions.push({ id: `pg-${String(i).padStart(2, "0")}`, household_id: "house-home", user_id: "user-bin", transaction_date: date, type: "expense", amount: 1000 + i, category: "식비", memo: `쪽 ${i}`, payment_method: "현금", source: "web", raw_text: "", created_at: `${date}T0${i % 10}:00:00.000Z` });
  }
  const total27 = fx.db.transactions.filter((t) => t.transaction_date === "2026-07-27").reduce((sum, t) => sum + t.amount, 0).toLocaleString("en-US");
  const total28 = fx.db.transactions.filter((t) => t.transaction_date === "2026-07-28").reduce((sum, t) => sum + t.amount, 0).toLocaleString("en-US");
  const first = await measured(fx, `${HOME}&tab=transactions`);
  const second = await page(fx, `${HOME}&tab=transactions&page=2`);
  const head27 = dayHeads(first.html).find((h) => h.label.startsWith("7월 27일"));
  const head27b = dayHeads(second.html).find((h) => h.label.startsWith("7월 27일"));
  const head28 = dayHeads(first.html).find((h) => h.label.startsWith("7월 28일"));
  eq(count(first.html, 'class="v8-tx"'), 50, "A5 거래내역 탭 첫 쪽은 50건이다(쪽 크기 그대로)");
  ok(head27?.sum === `-${total27}원 · 30건 중 20건 표시`, `A5 첫 쪽 경계의 날은 그날 전체 합계와 잘림을 함께 적는다 (${head27?.sum})`);
  ok(head27b?.sum === `-${total27}원 · 30건 중 10건 표시`, `A5 다음 쪽의 같은 날도 같은 전체 합계를 쓴다 (${head27b?.sum})`);
  eq(head28?.sum, `-${total28}원`, "A5 쪽 안에 다 보이는 날은 예전 그대로다");
  eq(first.calls.length, baseTab.calls.length, `A5 정확한 합계를 내려고 DB 를 더 부르지 않는다 (${first.calls.length}회)`);
  ok(source.includes("renderV8TxDayGroups(txRows, `${currentPath}&tab=transactions`, appCanEditRow, [], false, txAll)"), "A5 거래내역 탭은 이미 읽은 필터 결과 전체(txAll)를 합계용으로 넘긴다");
});

done();

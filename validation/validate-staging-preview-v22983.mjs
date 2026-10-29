// V22.9.83 — 테스트 서버(tools/staging/*)의 동작 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 사용자 요청(2026-10-28): "바로 적용 말고 운영서버는 놔두고 별도 테스트서버에서 확인하고 적용할 수 있도록 해줘".
// 그래서 운영 Worker·운영 DB 와 섞이지 않는 미리보기를 만들었다.
//   - 내 PC: npm run preview:app → http://127.0.0.1:4400 (preview-server.mjs)
//   - 승인 뒤 선택: 별도 Worker malhaebook-staging(workers.dev, 비밀번호) — deploy-staging.mjs, 입구 worker-entry.mjs
// 둘 다 QA 메모리 픽스처 위에 예시 데이터(demo-data.mjs)를 깔고, demo-handler.mjs 가 요청을 앱으로 넘긴다.
// 이 검사는 미리보기가 운영처럼 보이되 운영 어디에도 닿지 않는다는 약속을 지키는지 본다.
//   1. 화면이 열리고, 위에 "테스트 서버" 띠가 붙고, 검색 엔진에서 빠진다(x-robots-tag·robots.txt).
//   2. 앱 바깥(카카오·메일·Supabase 실서버 등)으로 나가는 요청은 모두 막히고 기록된다.
//   3. 운영 주소(https://malhaebook.com)가 화면·이동 주소에 남지 않고, 쿠키에 운영 Domain·http 의 Secure 가 붙지 않는다.
//   4. 역할 전환(소유자·구성원)이 실제 권한 차이로 보인다.
//   5. 업로드 계획은 malhaebook-staging 만 허락하고 운영 이름(kakao-accountbook)은 거절한다. 바인딩에 운영 Secret 이 없다.
//   6. 업로드 순서(스크립트 올리기 → workers.dev 켜기 → 확인)가 라우트·도메인·운영 스크립트를 건드리지 않는다.
//   7. Worker 입구는 비밀번호 없이 열리지 않는다.
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { APP_ORIGIN, createDemoHandler } from "../tools/staging/demo-handler.mjs";
import { STAGING_SCRIPT, PRODUCTION_SCRIPT, STAGING_MODULES, planStagingUpload, uploadForm, deployStaging } from "../tools/staging/deploy-staging.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const ROOT = new URL("../", import.meta.url);
const VERSION = readFileSync(new URL("VERSION.txt", ROOT), "utf8").trim();
const ORIGIN = "http://127.0.0.1:4400";
const NOW = Date.parse("2026-10-28T12:00:00+09:00");
const ctx = { waitUntil() {}, passThroughOnException() {} };
const originalFetch = globalThis.fetch;

// ── 1~4. 미리보기 처리기 ──
{
  const handler = await createDemoHandler({ app, createFixture: createV2265QaFixture, publicOrigin: ORIGIN, now: () => NOW, version: VERSION });
  const get = async (path, cookie = "") => handler.fetch(new Request(`${ORIGIN}${path}`, { headers: { accept: "text/html", ...(cookie ? { cookie } : {}) } }), ctx);
  const M = "month=2026-10&household_id=house-home";
  for (const path of [`/app?${M}`, `/my/analysis?${M}`, `/my/analysis?${M}&view=report`, `/reports?${M}`, `/budgets?${M}`, `/reserve-plans?${M}`, `/my/settings?${M}`, `/menu?${M}`, `/settlement-summary?${M}`, `/payment-methods?${M}`]) {
    const response = await get(path);
    const html = await response.text();
    eq(response.status, 200, `1 ${path} 가 열린다`);
    ok(html.includes('id="abPreviewBanner"') && html.includes("테스트 서버"), `1 ${path} 위에 테스트 서버 띠가 붙는다`);
    eq(response.headers.get("x-robots-tag"), "noindex, nofollow", `1 ${path} 는 검색에서 빠진다`);
    eq(response.headers.get("x-malhaebook-preview"), "1", `1 ${path} 는 미리보기 응답임을 밝힌다`);
    ok(!html.includes(APP_ORIGIN), `3 ${path} 화면에 운영 주소가 남지 않는다`);
    ok(!response.headers.get("strict-transport-security"), `3 ${path} 는 HSTS 를 내려보내지 않는다(127.0.0.1 http)`);
  }
  const robots = await (await get("/robots.txt")).text();
  ok(/User-agent: \*\nDisallow: \//.test(robots), "1 robots.txt 가 모든 경로를 막는다");

  const health = await (await get("/__preview/health")).json();
  ok(health.ok === true && health.preview === true && health.version === VERSION, `1 상태 확인이 판 이름을 말한다 (${health.version})`);
  ok(health.data && health.data.transactions >= 100 && health.data.months.length === 3, `1 예시 데이터는 석 달·100건 이상이다 (${health.data?.transactions}건)`);
  eq(health.blocked, 0, "2 화면 열 동안 바깥으로 나간 요청이 없다");
  const db = handler.db;
  ok((db.accountbook_recurring || []).filter((row) => row.household_id === "house-home").length >= 4, "1 예시 가계부에 매달 자동 기록(월급·월세·통신비·구독)이 있다");

  // 2. 바깥 요청 차단
  await assert.rejects(() => globalThis.fetch("https://kapi.kakao.com/v1/api/talk/memo/default/send", { method: "POST" }), /preview blocks outbound network/);
  checks += 1;
  ok(handler.blocked.includes("https://kapi.kakao.com"), "2 막힌 바깥 요청은 주소가 남는다");
  await assert.rejects(() => globalThis.fetch("https://abcdefgh.supabase.co/rest/v1/transactions"), /preview blocks outbound network/);
  checks += 1;

  // 3. 이동 주소·쿠키
  const asMember = await get("/__preview/as/member");
  eq(asMember.status, 303, "4 역할 전환은 홈으로 돌려보낸다");
  eq(asMember.headers.get("location"), `${ORIGIN}/app`, "3 역할 전환 뒤 주소는 미리보기 주소다");
  const roleCookie = asMember.headers.get("set-cookie") || "";
  ok(roleCookie.startsWith("ab_preview_as=member") && !/;\s*Secure/i.test(roleCookie) && !/;\s*Domain=/i.test(roleCookie), `3 역할 쿠키는 http 미리보기에서 쓸 수 있다 (${roleCookie})`);
  const logout = await handler.fetch(new Request(`${ORIGIN}/my/logout`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" }, body: "" }), ctx);
  const location = logout.headers.get("location") || "";
  ok(!location.startsWith(APP_ORIGIN), `3 앱이 돌려준 이동 주소에 운영 주소가 없다 (${location || logout.status})`);
  for (const cookie of logout.headers.getSetCookie()) ok(!/;\s*Domain=/i.test(cookie) && !/;\s*Secure/i.test(cookie), `3 앱 쿠키에서 Domain·Secure 를 뗀다 (${cookie.split(";")[0]})`);

  // 4. 역할 차이
  const ownerMembers = await get(`/my/members?${M}`);
  const memberMembers = await get(`/my/members?${M}`, "ab_preview_as=member");
  eq(ownerMembers.status, 200, "4 소유자로는 참여자 관리 화면이 열린다");
  eq(memberMembers.status, 403, "4 구성원으로는 참여자 관리 화면이 막힌다(실제 권한 그대로)");
  const memberHome = await (await get(`/app?${M}`, "ab_preview_as=member")).text();
  ok(memberHome.includes("구성원"), "4 띠가 지금 보는 역할(구성원)을 말한다");

  // 되돌리기: 예시 데이터를 처음으로
  const reset = await get("/__preview/reset");
  eq(reset.status, 303, "1 예시 데이터 되돌리기는 홈으로 돌려보낸다");
  globalThis.fetch = originalFetch;
}

// ── 5. 업로드 계획 ──
const plan = planStagingUpload();
eq(plan.script, "malhaebook-staging", "5 올리는 곳은 별도 Worker malhaebook-staging 이다");
ok(STAGING_SCRIPT !== PRODUCTION_SCRIPT && PRODUCTION_SCRIPT === "kakao-accountbook", "5 운영 스크립트 이름을 따로 알고 있다");
assert.throws(() => planStagingUpload({ script: PRODUCTION_SCRIPT }), /refusing to upload/);
checks += 1;
assert.throws(() => planStagingUpload({ script: "kakao-accountbook-staging-typo" }), /refusing to upload/);
checks += 1;
eq(plan.version, VERSION, "5 올리는 판 이름은 VERSION.txt 다");
eq(plan.metadata.main_module, "worker-entry.mjs", "5 입구는 worker-entry.mjs 다");
eq(JSON.stringify(plan.metadata.bindings), JSON.stringify([{ type: "plain_text", name: "PREVIEW_VERSION", text: VERSION }]), "5 계획의 바인딩은 판 이름 하나뿐이다(운영 DB·카카오·메일 Secret 없음)");
ok(!("triggers" in plan.metadata) && !("routes" in plan.metadata) && !JSON.stringify(plan.metadata).includes("cron"), "5 예약 작업·라우트를 싣지 않는다");
const names = plan.modules.map((m) => m.name);
eq(new Set(names).size, names.length, "5 모듈 이름이 겹치지 않는다");
for (const mod of plan.modules) {
  const text = Buffer.from(mod.bytes).toString("utf8");
  for (const spec of [...text.matchAll(/^\s*import\s[^"']*["'](\.\/[^"']+)["']/gm)].map((m) => m[1].slice(2))) {
    ok(names.includes(spec), `5 ${mod.name} 가 부르는 ./${spec} 가 함께 올라간다`);
  }
}
assert.throws(() => uploadForm(plan, "short"), /at least 8/);
checks += 1;
const form = uploadForm(plan, "preview-pass-123");
const metadata = JSON.parse(await form.get("metadata").text());
ok(metadata.bindings.some((b) => b.type === "secret_text" && b.name === "STAGING_PASSWORD") && metadata.bindings.length === 2, "5 업로드에는 비밀번호 Secret 하나만 더한다");
eq(form.getAll("index.js").length, 1, "5 앱 번들이 모듈 하나로 올라간다");

// ── 6. 업로드 순서(가짜 Cloudflare API) ──
{
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push(`${init.method || "GET"} ${String(url).replace("https://api.cloudflare.com/client/v4", "")}`);
    if (String(url).endsWith("/__preview/health")) return Response.json({ ok: true, preview: true, version: VERSION, data: { transactions: 120 } });
    if (String(url).endsWith("/workers/subdomain")) return Response.json({ success: true, result: { subdomain: "example" } });
    return Response.json({ success: true, result: {} });
  };
  const result = await deployStaging({ env: { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "acc", STAGING_PASSWORD: "preview-pass-123" }, fetchImpl: fakeFetch, log: () => {}, sleep: async () => {}, plan });
  eq(result.url, "https://malhaebook-staging.example.workers.dev", "6 확인 주소는 workers.dev 의 별도 이름이다");
  eq(JSON.stringify(calls.slice(0, 3)), JSON.stringify(["PUT /accounts/acc/workers/scripts/malhaebook-staging", "POST /accounts/acc/workers/scripts/malhaebook-staging/subdomain", "GET /accounts/acc/workers/subdomain"]), `6 순서: 올리기 → workers.dev 켜기 → 하위 도메인 확인 (${calls.join(" | ")})`);
  ok(calls.every((call) => !call.includes(PRODUCTION_SCRIPT) && !/routes|domains|zones|secrets|versions|deployments/.test(call)), "6 운영 스크립트·라우트·도메인·Secret·버전 승격 API 를 부르지 않는다");
  await assert.rejects(() => deployStaging({ env: {}, fetchImpl: fakeFetch, log: () => {}, sleep: async () => {}, plan }), /CLOUDFLARE_API_TOKEN/);
  checks += 1;
}

// ── 7. Worker 입구(비밀번호) — 실제로 올라가는 모양(평평한 폴더)으로 불러 본다 ──
{
  const dir = mkdtempSync(join(tmpdir(), "ab-staging-"));
  try {
    for (const [name, path] of STAGING_MODULES) copyFileSync(new URL(path, ROOT), join(dir, name));
    const entry = (await import(pathToFileURL(join(dir, "worker-entry.mjs")).href)).default;
    const call = (env, auth) => entry.fetch(new Request("https://malhaebook-staging.example.workers.dev/__preview/health", { headers: auth ? { authorization: `Basic ${Buffer.from(auth).toString("base64")}` } : {} }), env, ctx);
    eq((await call({}, "")).status, 503, "7 비밀번호 Secret 이 없으면 열지 않는다");
    eq((await call({ STAGING_PASSWORD: "short" }, ":short")).status, 503, "7 8자보다 짧은 비밀번호는 쓰지 않는다");
    const noAuth = await call({ STAGING_PASSWORD: "preview-pass-123" }, "");
    eq(noAuth.status, 401, "7 비밀번호 없이 오면 막는다");
    ok(/^Basic /.test(noAuth.headers.get("www-authenticate") || "") && noAuth.headers.get("x-robots-tag") === "noindex, nofollow", "7 막을 때 비밀번호 창을 띄우고 검색에서 빠진다");
    eq((await call({ STAGING_PASSWORD: "preview-pass-123" }, "preview:wrong-pass-1")).status, 401, "7 틀린 비밀번호는 막는다");
    const opened = await call({ STAGING_PASSWORD: "preview-pass-123", PREVIEW_VERSION: VERSION }, "preview:preview-pass-123");
    eq(opened.status, 200, "7 맞는 비밀번호로는 열린다");
    eq((await opened.json()).version, VERSION, "7 올라간 판 이름을 말한다");
    const source = readFileSync(join(dir, "worker-entry.mjs"), "utf8");
    ok(!/\bscheduled\s*\(/.test(source) && !/\bqueue\s*\(/.test(source), "7 입구는 fetch 만 내보낸다(예약 작업 없음)");
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(dir, { recursive: true, force: true });
  }
}

const server = readFileSync(new URL("tools/staging/preview-server.mjs", ROOT), "utf8");
ok(server.includes('"127.0.0.1"'), "1 내 PC 미리보기는 127.0.0.1 에만 열린다(같은 망의 다른 기기에 열지 않는다)");
const pkg = JSON.parse(readFileSync(new URL("package.json", ROOT), "utf8"));
eq(pkg.scripts["preview:app"], "node tools/staging/preview-server.mjs", "npm run preview:app 이 등록돼 있다");

console.log(`V22.9.83 테스트 서버 검사 통과 (${checks} checks)`);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.9.0-UX-REPAIR"'), "runtime exposes the web manifest release");
ok(source.includes('const AB_MANIFEST_PATH = "/manifest.json"'), "manifest has one canonical path");
ok(source.includes('["/icon-192.png", { kind: "png", size: 192 }]'), "192px install icon is served");
ok(source.includes('["/icon-512.png", { kind: "png", size: 512 }]'), "512px install icon is served");
ok(source.includes("async function abIconDeflate(raw)"), "icons use real compression when the runtime provides it");
ok(source.includes("return abIconStoredDeflate(raw);"), "icons fall back to stored blocks without a compressor");
// 매니페스트 링크 한 줄만 넣고 아이콘 링크는 넣지 않는다.
ok(source.includes('const AB_MANIFEST_LINK = `<link rel="manifest" href="${AB_MANIFEST_PATH}"/>`'), "only the manifest link is injected");
ok(!source.includes('rel="icon"') && !source.includes('rel="apple-touch-icon"'), "icon links stay out of budgeted HTML");

async function request(fixture, path, { method = "GET", cookie = "" } = {}) {
  const headers = { "user-agent": "Mozilla/5.0" };
  if (cookie) headers.cookie = cookie;
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { method, headers }), fixture.env, {});
  return { response, bytes: new Uint8Array(await response.arrayBuffer()) };
}

const fixture = await createV2265QaFixture();
try {
  const beforeTransactions = fixture.db.transactions.length;

  const manifest = await request(fixture, "/manifest.json");
  eq(manifest.response.status, 200, "manifest responds 200 without a session");
  ok(String(manifest.response.headers.get("content-type") || "").startsWith("application/manifest+json"), "manifest uses the manifest MIME type");
  eq(manifest.response.headers.get("etag"), '"ab-manifest-v22864"', "manifest has a stable ETag");
  const parsed = JSON.parse(new TextDecoder().decode(manifest.bytes));
  eq(parsed.name, "똑똑한 가계부", "manifest carries the product name");
  eq(parsed.short_name, "가계부", "manifest carries a short name for the home screen");
  eq(parsed.start_url, "/app", "install opens the personal home");
  eq(parsed.scope, "/", "manifest scope covers the whole app");
  eq(parsed.display, "standalone", "install opens without browser chrome");
  eq(parsed.theme_color, "#3182f6", "manifest theme colour matches the brand");
  eq(parsed.background_color, "#f2f4f6", "manifest background matches the app surface");
  eq(parsed.lang, "ko", "manifest declares Korean");
  // 안드로이드 설치 요건: 192·512 아이콘과 maskable 항목.
  ok(parsed.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png"), "manifest declares the 192px icon");
  ok(parsed.icons.some((icon) => icon.sizes === "512x512" && icon.type === "image/png"), "manifest declares the 512px icon");
  ok(parsed.icons.some((icon) => icon.purpose === "maskable"), "manifest declares a maskable icon");

  for (const [path, size] of [["/apple-touch-icon.png", 180], ["/icon-192.png", 192], ["/icon-512.png", 512]]) {
    const icon = await request(fixture, path);
    eq(icon.response.status, 200, `${path} responds 200`);
    eq(icon.response.headers.get("content-type"), "image/png", `${path} uses the PNG MIME type`);
    eq(Array.from(icon.bytes.slice(0, 8)).join(","), "137,80,78,71,13,10,26,10", `${path} has a valid PNG signature`);
    const view = new DataView(icon.bytes.buffer, icon.bytes.byteOffset);
    eq(view.getUint32(16), size, `${path} is ${size}px wide`);
    eq(view.getUint32(20), size, `${path} is ${size}px tall`);
    eq(icon.bytes[25], 3, `${path} uses an indexed palette`);
    // 압축을 쓰므로 아이콘은 작게 유지되어야 한다.
    ok(icon.bytes.length < 8 * 1024, `${path} stays small (${icon.bytes.length} bytes)`);
  }

  const ico = await request(fixture, "/favicon.ico");
  eq(ico.response.status, 200, "favicon still responds 200");
  eq(ico.bytes[6], 32, "favicon is still 32px");

  const head = await request(fixture, "/manifest.json", { method: "HEAD" });
  eq(head.response.status, 200, "manifest supports HEAD");
  eq(head.bytes.length, 0, "manifest HEAD has no body");

  // 모든 사용자 화면이 매니페스트를 정확히 한 번만 참조해야 한다.
  const q = "month=2026-07&household_id=house-home";
  for (const [name, path] of [["홈", `/app?${q}`], ["전체 메뉴", `/menu?${q}`], ["통계", `/my/analysis?${q}`], ["예산", `/budgets?${q}`], ["월 마감", `/reports?${q}`]]) {
    const page = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
    const html = await page.text();
    eq(page.status, 200, `${name} 화면이 200으로 응답한다`);
    eq(html.split('<link rel="manifest" href="/manifest.json"/>').length - 1, 1, `${name} 화면이 매니페스트를 정확히 한 번 참조한다`);
    ok(!html.includes('rel="icon"'), `${name} 화면에 아이콘 링크가 추가되지 않는다`);
  }

  // 예산 회귀 방지.
  const home = await app.fetch(new Request(`https://ttokttok-accountbook.com/app?${q}`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
  const homeHtml = await home.text();
  ok(Buffer.byteLength(homeHtml) < 35 * 1024, `home HTML stays under the 35 KiB budget (${Buffer.byteLength(homeHtml)} bytes)`);

  eq(fixture.db.transactions.length, beforeTransactions, "manifest and icon routes write no data");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.64 web manifest (${checks} checks)`);

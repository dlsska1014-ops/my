import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.95-DESKTOP-CURSOR"'), "runtime exposes the app icon release");
ok(source.includes("async function appIconAssetResponse(request, url)"), "icon routes have a dedicated handler");
ok(source.includes('["/favicon.ico", { kind: "ico", size: 32 }]'), "favicon path is served");
ok(source.includes('["/apple-touch-icon.png", { kind: "png", size: 180 }]'), "apple touch icon path is served");
ok(source.includes('["/apple-touch-icon-precomposed.png", { kind: "png", size: 180 }]'), "legacy apple touch icon path is served");
// 홈 HTML 예산을 지키기 위해 마크업은 늘리지 않는다.
ok(!source.includes('rel="icon"') && !source.includes('rel="apple-touch-icon"'), "no icon link markup is added to budgeted HTML");
ok(source.includes("function abIconIndexedPixels(size, rounded = true)"), "icon rasterizer supports rounded and full-bleed shapes");
ok(source.includes("abIconIndexedPixels(size, false)"), "apple touch icon is full bleed so iOS can apply its own mask");

async function request(fixture, path, { method = "GET" } = {}) {
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { method, headers: { "user-agent": "Mozilla/5.0" } }), fixture.env, {});
  return { response, bytes: new Uint8Array(await response.arrayBuffer()) };
}

const fixture = await createV2265QaFixture();
try {
  const beforeTransactions = fixture.db.transactions.length;

  const ico = await request(fixture, "/favicon.ico");
  eq(ico.response.status, 200, "favicon responds 200 without a session");
  eq(ico.response.headers.get("content-type"), "image/x-icon", "favicon uses the icon MIME type");
  ok(String(ico.response.headers.get("cache-control") || "").includes("max-age="), "favicon is cacheable");
  eq(ico.response.headers.get("etag"), '"ab-icon-v22864-ico-32"', "favicon has a stable ETag");
  // ICONDIR: reserved 0, type 1, count 1 그리고 32x32 항목.
  eq(ico.bytes[0] | (ico.bytes[1] << 8), 0, "ICO reserved field is zero");
  eq(ico.bytes[2] | (ico.bytes[3] << 8), 1, "ICO type is icon");
  eq(ico.bytes[4] | (ico.bytes[5] << 8), 1, "ICO holds exactly one image");
  eq(ico.bytes[6], 32, "ICO image is 32px wide");
  eq(ico.bytes[7], 32, "ICO image is 32px tall");
  ok(ico.bytes.length > 4000 && ico.bytes.length < 8000, `ICO stays small (${ico.bytes.length} bytes)`);

  const png = await request(fixture, "/apple-touch-icon.png");
  eq(png.response.status, 200, "apple touch icon responds 200 without a session");
  eq(png.response.headers.get("content-type"), "image/png", "apple touch icon uses the PNG MIME type");
  eq(png.response.headers.get("etag"), '"ab-icon-v22864-png-180"', "apple touch icon has a stable ETag");
  eq(Array.from(png.bytes.slice(0, 8)).join(","), "137,80,78,71,13,10,26,10", "PNG signature is valid");
  const view = new DataView(png.bytes.buffer, png.bytes.byteOffset);
  eq(view.getUint32(16), 180, "PNG is 180px wide");
  eq(view.getUint32(20), 180, "PNG is 180px tall");
  eq(png.bytes[24], 8, "PNG uses 8-bit samples");
  eq(png.bytes[25], 3, "PNG uses an indexed palette");
  const text = new TextDecoder().decode(png.bytes);
  ok(text.includes("PLTE"), "PNG carries its palette");
  ok(!text.includes("tRNS"), "apple touch icon has no transparency so iOS masking stays clean");
  ok(text.includes("IEND"), "PNG is terminated");

  const precomposed = await request(fixture, "/apple-touch-icon-precomposed.png");
  eq(precomposed.response.status, 200, "legacy apple touch icon responds 200");
  eq(precomposed.bytes.length, png.bytes.length, "both apple touch icon paths serve the same image");

  const head = await request(fixture, "/favicon.ico", { method: "HEAD" });
  eq(head.response.status, 200, "favicon supports HEAD");
  eq(head.bytes.length, 0, "favicon HEAD has no body");

  const post = await app.fetch(new Request("https://ttokttok-accountbook.com/favicon.ico", { method: "POST" }), fixture.env, {});
  ok(post.status !== 200 || post.headers.get("etag") !== '"ab-icon-v22864-ico-32"', "icon routes do not answer writes");

  // 예산 회귀 방지: 아이콘 대응이 홈 HTML을 늘리지 않아야 한다.
  const home = await app.fetch(new Request("https://ttokttok-accountbook.com/app?month=2026-07&household_id=house-home", { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
  const homeHtml = await home.text();
  eq(home.status, 200, "home still renders");
  ok(!homeHtml.includes("favicon"), "home HTML carries no favicon markup");
  ok(Buffer.byteLength(homeHtml) < 35 * 1024, `home HTML stays under the 35 KiB budget (${Buffer.byteLength(homeHtml)} bytes)`);

  eq(fixture.db.transactions.length, beforeTransactions, "icon routes write no data");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.63 app icon assets (${checks} checks)`);

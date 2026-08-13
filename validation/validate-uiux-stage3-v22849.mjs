import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.92-SCREEN-CLEANUP"'), "stage 3 runtime version is explicit");
ok(source.includes("function accountbookQuickInputClientMain"), "shared quick-input client exists");
ok(source.includes('window.openAbQuickInput = function(date, trigger)'), "day popup and navigation can open one shared quick-input surface");
ok(source.includes('section#add.panel,section#add'), "the existing quick-input section is reused rather than duplicated");
ok(source.includes('body.appendChild(section)'), "the existing form node is moved into the modal without rebuilding it");
ok(source.includes('className = "abQuickInputOverlay"'), "quick-input overlay is created lazily");
ok(source.includes('role="dialog" aria-modal="true" aria-labelledby="abQuickInputTitle"'), "quick input exposes modal semantics");
ok(source.includes('event.key === "Escape"'), "quick input supports Escape close");
ok(source.includes('event.key !== "Tab"'), "quick input traps keyboard focus");
ok(source.includes('returnFocus.focus()'), "quick input restores focus to its opener");
ok(source.includes('input[name="transaction_date"],#txDate'), "selected dates are written into the existing date field");
ok(source.includes('params.get("quick") === "1"'), "cross-page quick links auto-open the popup on /app");
ok(source.includes('hash === "#add" || hash === "#quick"'), "legacy quick-input hashes remain compatible");
ok(source.includes('data-ab-quick-open'), "quick-input triggers use one explicit client hook");
// V22.8.73 부터 이 버튼은 기본으로 감춰 두고 권한(can_write)이 있을 때만 보인다.
// 조회 전용 사용자에게 눌러도 저장되지 않는 버튼을 보여 주지 않기 위해서다.
ok(source.includes('data-ab-day-add hidden>이 날 기록 추가'), "day details provide a record-add action");
ok(source.includes('if (data && data.can_write) add.removeAttribute("hidden");'), "the record-add action appears for members who may write");
ok(source.includes("can_write: canWrite,"), "the day detail API reports whether the viewer may write");
ok(source.includes('window.openAbQuickInput(date, lastTrigger)'), "day detail passes the selected date to quick input");
ok(source.includes('이 날짜가 선택된 빠른 입력을 바로 열 수 있습니다.'), "empty days explain the connected action");
ok(source.includes('별도 쓰기 API를 추가하지 않는다'), "stage 3 explicitly preserves the existing write contract");
ok(!source.includes('/u/api/quick-input'), "stage 3 adds no parallel quick-input write endpoint");
ok(source.includes('{ key: "quick", icon: "plus", label: "입력"'), "mobile navigation has a central input destination");
ok(source.includes('{ key: "menu", icon: "more", label: "전체"'), "mobile navigation keeps full menu access");
ok(source.includes('item.quick ? "abNavQuickInput"'), "mobile input action receives a distinct visual class");
ok(source.includes('.abNavBottom a.abNavQuickInput'), "central mobile input styling exists");
ok(source.includes('.abQuickInputPanel'), "desktop modal styling exists");
ok(source.includes('@media(max-width:899px){body.abV22812Shell .abQuickInputOverlay{align-items:flex-end'), "mobile quick input becomes a bottom sheet");
ok(source.includes('body.abQuickInputOpen{overflow:hidden!important}'), "background scrolling is locked while input is open");
ok(source.includes('.abQuickInputOriginalTitle{display:none!important}'), "duplicate inline title is hidden after modal promotion");
ok(source.includes('.abDayDetailAdd{background:var(--action)'), "day-detail add action is visually primary");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22891.css"'), "current release uses a fresh shell asset");
ok(source.includes('const ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH = "/assets/accountbook-v5-v22890.js"'), "current release uses a fresh V5 runtime asset");
ok(source.includes('"accountbook-shell-v22891-css"'), "current shell has an immutable ETag");
ok(source.includes('"accountbook-v5-v22890-js"'), "current runtime has an immutable ETag");
ok(source.includes('(${accountbookQuickInputClientMain.toString()})();(${accountbookDayDetailClientMain.toString()})();'), "quick input loads before day-detail integration");
ok(source.includes('method="post" action="/admin/transactions"'), "existing transaction form action remains present");
ok(source.includes('async function handleMyAddTransaction(request, env)'), "existing user transaction handler remains present");
ok(source.includes('async function handleAdminAddTransaction(request, env)'), "existing admin transaction handler remains present");

async function request(fixture, path, { cookie = fixture.cookie } = {}) {
  const headers = { accept: "text/html,application/json" };
  if (cookie) headers.cookie = cookie;
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { headers }), fixture.env, {});
  const text = await response.text();
  return { response, text };
}

const fixture = await createV2265QaFixture();
try {
  const beforeCount = fixture.db.transactions.length;
  const home = await request(fixture, "/app?month=2026-07&household_id=house-home");
  eq(home.response.status, 200, "home renders with stage 3 assets");
  ok(Buffer.byteLength(home.text) < 35 * 1024, "home stays below the protected 35 KiB HTML budget");
  ok(home.text.includes('/assets/accountbook-shell-v22891.css'), "home loads the current shell");
  ok(home.text.includes('/assets/accountbook-v5-v22890.js'), "home loads the current runtime");
  ok(home.text.includes('id="add"'), "home still emits the existing quick-input form for progressive enhancement");
  ok(home.text.includes('name="transaction_date"'), "home keeps the existing date field");
  ok(home.text.includes('name="amount"'), "home keeps the existing amount field");
  ok(home.text.includes('name="category"'), "home keeps the existing category field");
  ok(home.text.includes('name="payment_method"'), "home keeps the existing payment field");
  eq(fixture.db.transactions.length, beforeCount, "rendering stage 3 UI does not mutate transactions");

  const v5 = await request(fixture, "/assets/accountbook-v5-v22890.js");
  eq(v5.response.status, 200, "stage 3 V5 runtime is served");
  ok((v5.response.headers.get("content-type") || "").includes("javascript"), "stage 3 runtime has a JavaScript content type");
  eq(v5.response.headers.get("etag"), '"accountbook-v5-v22890-js"', "current runtime ETag is correct");
  ok(v5.text.includes("abQuickInputOverlay"), "runtime contains quick-input modal logic");
  ok(v5.text.includes("openAbQuickInput"), "runtime exposes the shared quick-input opener");
  ok(v5.text.includes("data-ab-day-add"), "runtime connects day details to input");

  const shell = await request(fixture, "/assets/accountbook-shell-v22891.css");
  eq(shell.response.status, 200, "stage 3 shell is served");
  ok((shell.response.headers.get("content-type") || "").includes("text/css"), "stage 3 shell has a CSS content type");
  eq(shell.response.headers.get("etag"), '"accountbook-shell-v22891-css"', "current shell ETag is correct");
  ok(shell.text.includes(".abQuickInputOverlay"), "shell contains quick-input overlay styles");
  ok(shell.text.includes(".abNavQuickInput"), "shell contains central mobile input styles");
} finally {
  fixture.restore();
}

console.log(`V22.8.49 UIUX stage 3 validation passed: ${checks} checks`);

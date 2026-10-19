import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { app, fixture, intercept, failure, page, post, api, withClock, putSetting } from "./lib-audit-v22934.mjs";
import { createDeleteBrowser } from "./lib-lucian-b-browser.mjs";
import { accountbookTransactionDeleteClientMain, accountbookTransactionFilterClientMain } from "../src/modules/client/lucian-b-mains.js";
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; };
const eq = (value, expected, label) => { assert.equal(value, expected, label); checks++; };
const q = "month=2026-07&household_id=house-home&tab=transactions";
const values = { id: "tx-expense-1", household_id: "house-home", month: "2026-07", return_to: "/app?" + q };
const rpcCount = fx => fx.db.__rpc_calls.filter(call => call.name === "accountbook_delete_transaction_v227").length;
let inFlight = [];
const flush = async () => { for (let round = 0; round < 5; round++) { await Promise.allSettled(inFlight); await new Promise(resolve => setImmediate(resolve)); } };
const links = html => [...html.matchAll(/<a data-ab-filter-relax href="([^"]+)">([^<]+)<\/a>/g)].map(m => ({ url: new URL(m[1].replaceAll("&amp;", "&"), "https://malhaebook.com"), label: m[2] }));
await withClock("2026-07-15", async () => {
  await fixture(async fx => {
    let requests = [];
    const restore = intercept(({ url, method }) => { requests.push({ url, method }); });
    const base = await page(fx, "/app?" + q); const baseCalls = requests.length; requests = [];
    const empty = await page(fx, "/app?" + q + "&category=없는분류&page=9");
    eq(requests.length, baseCalls, "B1 no additional queries");
    eq(requests.filter(r => r.url.pathname.endsWith("/transactions")).length, 2, "only existing month and previous-month reads");
    const candidate = links(empty.html)[0]; ok(candidate, "empty list offers relaxation");
    eq(candidate.label, "분류 조건 해제 · 5건", "count uses complete month");
    eq(candidate.url.searchParams.get("month"), "2026-07", "keeps month"); eq(candidate.url.searchParams.get("household_id"), "house-home", "keeps ledger"); eq(candidate.url.searchParams.get("tab"), "transactions", "keeps tab"); eq(candidate.url.searchParams.has("page"), false, "resets page"); eq(candidate.url.searchParams.has("category"), false, "removes category"); eq(candidate.url.hash, "#abTxResults", "focus destination");
    const filtered = await page(fx, "/app?" + q + "&category=식비&category_text=없는분류&date=2026-07-04&type=expense");
    const one = links(filtered.html); eq(one.length, 1, "only productive condition suggested"); eq(one[0].label, "분류 조건 해제 · 1건", "does not count excluded rows"); eq(one[0].url.searchParams.has("category_text"), false, "removes category_text too"); eq(one[0].url.searchParams.get("date"), "2026-07-04", "keeps date"); eq(one[0].url.searchParams.get("type"), "expense", "keeps type");
    const none = await page(fx, "/app?" + q + "&q=없음&category=없음"); eq(links(none.html)[0].label, "이 달의 전체 기록 보기", "no single relaxation falls back to whole month");
    const followed = await page(fx, one[0].url.pathname + one[0].url.search); ok(followed.html.includes('data-count="1"'), "followed link yields counted records");
    const seed = fx.db.transactions.find(row => row.id === values.id);
    for (let i = 0; i < 60; i++) fx.db.transactions.push({ ...seed, id: "b-many-" + i });
    eq(links((await page(fx, "/app?" + q + "&category=不存在")).html)[0].label, "분류 조건 해제 · 65건", "count is not limited to displayed 50");
    restore();
    const broken = intercept(({ url }) => url.pathname.endsWith("/transactions") ? failure(503) : null);
    const fail = await page(fx, "/app?" + q + "&category=없음"); eq(fail.status, 500, "query failure is not empty data"); eq(links(fail.html).length, 0, "no counts on failed read"); broken();
    fx.db.transactions = fx.db.transactions.filter(row => row.household_id !== "house-home");
    const monthEmpty = await page(fx, "/app?" + q); ok(monthEmpty.html.includes("이 달에는 기록이 없습니다."), "empty month is distinguished"); ok(monthEmpty.html.includes('href="#add" data-ab-quick-open'), "writer can add");
    fx.db.household_members.find(m => m.user_id === "user-wifi" && m.household_id === "house-home").role = "viewer";
    const reader = await page(fx, "/app?" + q, { cookie: await fx.cookieFor("user-wifi") }); eq(reader.status, 200, "reader sees empty state"); ok(!reader.html.includes('href="#add" data-ab-quick-open'), "reader has no empty-state write action");
  });
  await fixture(async fx => {
    const response = await post(fx, "/admin/delete", values, { accept: "application/json" }); const data = JSON.parse(response.text);
    eq(response.status, 200, "JSON deletion confirmed"); eq(data.deleted, true, "RPC confirmation exposed"); eq(data.transaction_id, values.id, "confirmed exact ID"); eq(data.household_id, values.household_id, "confirmed exact ledger"); eq(rpcCount(fx), 1, "one audit write"); ok(!fx.db.transactions.some(row => row.id === values.id), "record actually removed");
    const exists = await api(fx, "/u/api/tx/presence?household_id=house-home&id=" + values.id); eq(exists.data.exists, false, "exact absence read"); eq(Object.keys(exists.data).sort().join(","), "exists,household_id,ok,transaction_id", "presence has no amount or memo");
  });
  await fixture(async fx => {
    const seed = fx.db.transactions.find(row => row.id === values.id);
    fx.db.transactions = fx.db.transactions.filter(row => row.household_id !== "house-home");
    for (const [group, count, fields] of [["date", 3, { transaction_date: "2026-07-05" }], ["category", 2, { category: "다른분류" }], ["payment", 1, { payment_method: "카드" }]]) for (let i = 0; i < count; i++) fx.db.transactions.push({ ...seed, id: group + i, transaction_date: "2026-07-04", category: "음식", payment_method: "현금", source: "web_manual", memo: "검사", ...fields });
    const result = links((await page(fx, "/app?" + q + "&date=2026-07-04&category_text=음식&payment_method=현금&q=검사&type=expense&quality=web_only&view=calendar&page=9")).html);
    eq(result.length, 2, "maximum two suggestions among three productive filters");
    eq(result[0].label, "날짜 조건 해제 · 3건", "highest count first"); eq(result[1].label, "분류 조건 해제 · 2건", "second productive count");
    for (const item of result) { eq(item.url.searchParams.get("q"), "검사", "keeps query"); eq(item.url.searchParams.get("payment_method"), "현금", "keeps payment"); eq(item.url.searchParams.get("quality"), "web_only", "keeps input-path filter"); eq(item.url.searchParams.get("view"), "calendar", "keeps calendar context"); }
  });
  await fixture(async fx => {
    const seed = fx.db.transactions.find(row => row.id === values.id);
    for (let i = 0; i < 1000; i++) fx.db.transactions.push({ ...seed, id: "b-paged-" + i });
    let calls = 0; const trace = intercept(() => { calls++; });
    await page(fx, "/app?" + q); const before = calls; calls = 0;
    const result = links((await page(fx, "/app?" + q + "&category=없음")).html);
    eq(result[0].label, "분류 조건 해제 · 1,005건", "counts full paginated month"); eq(calls, before, "pagination does not add filter queries"); trace();
  });
  for (const [label, patch, options, expected] of [["missing scope", { household_id: "" }, {}, 400], ["wrong ledger", { household_id: "house-trip" }, {}, 404], ["expired session", {}, { cookie: "" }, 401], ["another member row", { id: "tx-expense-2" }, { user: "user-wifi" }, 403]]) await fixture(async fx => {
    const cookie = options.user ? await fx.cookieFor(options.user) : options.cookie === "" ? "" : fx.cookie;
    const res = await post(fx, "/admin/delete", { ...values, ...patch }, { accept: "application/json", cookie }); eq(res.status, expected, label); eq(rpcCount(fx), 0, label + " writes zero"); eq(JSON.parse(res.text).ok, false, label + " JSON denial");
  });
  await fixture(async fx => {
    putSetting(fx, "household_member_policy_v22943:house-home", { version: 1, mode: "record_only" });
    const res = await post(fx, "/admin/delete", values, { accept: "application/json", cookie: await fx.cookieFor("user-wifi") }); eq(res.status, 403, "record_only denial"); eq(rpcCount(fx), 0, "record_only zero writes"); ok(JSON.parse(res.text).message.includes("소유자") && !JSON.parse(res.text).message.includes("member_record_only"), "policy refusal uses understandable copy");
    const csrf = await app.fetch(new Request("https://malhaebook.com/admin/delete", { method: "POST", headers: { cookie: fx.cookie, origin: "https://evil.invalid", accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values) }), fx.env, {}); eq(csrf.status, 403, "CSRF rejected"); eq((await csrf.json()).error, "cross_site_request_blocked", "CSRF uses JSON for explicit request"); eq(rpcCount(fx), 0, "CSRF zero writes");
    const missing = await api(fx, "/u/api/tx/presence?id=" + values.id); eq(missing.status, 400, "presence requires ledger"); const wrong = await api(fx, "/u/api/tx/presence?household_id=not-a-ledger&id=" + values.id); eq(wrong.status, 404, "presence never falls back");
    const inject = intercept(({ url }) => url.pathname.endsWith("/transactions") && url.searchParams.get("select") === "id" ? new Response("{}", { headers: { "content-type": "application/json" } }) : null);
    eq((await api(fx, "/u/api/tx/presence?household_id=house-home&id=" + values.id)).status, 503, "malformed lookup never means absent"); inject();
  });
  for (const kind of ["reject", "lost", "invalid"]) await fixture(async fx => {
    const inject = intercept(async ({ url, forward }) => { if (!url.pathname.endsWith("/accountbook_delete_transaction_v227")) return null; if (kind === "reject") return failure(400); if (kind === "lost") { await forward(); return failure(503, "lost after commit"); } return new Response("[]", { headers: { "content-type": "application/json" } }); });
    const res = await post(fx, "/admin/delete", values, { accept: "application/json" }); const data = JSON.parse(res.text); eq(res.status, 503, kind + " failure response"); eq(data.uncertain, kind !== "reject", kind + " certainty classification"); eq(data.error, kind === "reject" ? "record_delete_failed" : "db_write_unknown", kind + " outcome code"); inject();
  });
  await fixture(async fx => { const res = await post(fx, "/admin/delete", values); eq(res.status, 303, "HTML form keeps redirect"); ok(res.location.includes("msg=deleted"), "HTML confirmed success"); });
  await fixture(async fx => { const inject = intercept(async ({ url, forward }) => { if (url.pathname.endsWith("/accountbook_delete_transaction_v227")) { await forward(); return failure(503); } }); const res = await post(fx, "/admin/delete", values); ok(new URL(res.location, "https://malhaebook.com").searchParams.get("err")?.includes("삭제 결과를 확인하지 못했습니다"), "HTML unknown message is honest: " + res.decoded); ok(!res.decoded.includes("기존 기록은 유지됩니다"), "HTML does not guarantee preservation after lost response"); inject(); });

  async function client(test, { storageFails = false, storage, browserFetch, pathname, search } = {}) { await fixture(async fx => {
    const calls = [];
    inFlight = [];
    const request = (path, init = {}) => { calls.push({ path, method: init.method || "GET" }); const forward = () => app.fetch(new Request("https://malhaebook.com" + path, { ...init, headers: { ...init.headers, cookie: fx.cookie, origin: "https://malhaebook.com" } }), fx.env, {}); const task = Promise.resolve().then(() => browserFetch ? browserFetch(path, init, forward) : forward()); inFlight.push(task); return task; };
    const browser = createDeleteBrowser({ fetch: request, storageFails, storage }); if (pathname) browser.location.pathname = pathname; if (search) browser.location.search = search; const first = browser.form(); const second = browser.form("tx-expense-2"); browser.run(accountbookTransactionDeleteClientMain); await test({ fx, browser, first, second, calls });
  }); }
  await client(async ({ fx, browser: b, first, second }) => { const event = b.submit(first); ok(event.defaultPrevented && event.stopped, "capture prevents native and legacy submissions"); eq(rpcCount(fx), 0, "pending zero writes"); ok(first.row.hasAttribute("data-ab-delete-pending"), "row folded"); eq(second.button.disabled, true, "other deletion temporarily blocked"); b.tick(3000); b.undo.click(); b.tick(10000); await flush(); eq(rpcCount(fx), 0, "undo writes zero"); eq(first.row.hasAttribute("data-ab-delete-pending"), false, "undo restores row"); eq(second.button.disabled, false, "undo unlocks next record"); });
  await client(async ({ fx, browser: b, first, second, calls }) => { b.submit(first); b.tick(3000); b.submit(second); b.tick(1999); eq(rpcCount(fx), 0, "second delete does not shorten first deadline"); b.tick(1); await flush(); eq(rpcCount(fx), 1, "normal confirm one write"); eq(calls.filter(c => c.method === "POST").length, 1, "one network POST"); ok(b.assigned[0]?.includes("msg=deleted"), "confirmed response reloads actual list"); eq(b.storage.has("abTxDeletePending"), false, "confirmed response clears metadata"); });
  await client(async ({ fx, browser: b, first }) => { b.submit(first); b.tick(1000); b.fire(b.notice, "pointerenter"); b.tick(9000); eq(rpcCount(fx), 0, "hover pauses"); b.fire(b.notice, "pointerleave"); b.tick(1000); b.undo.focus(); b.tick(9000); eq(rpcCount(fx), 0, "undo focus pauses"); b.element("button").focus(); b.tick(3000); await flush(); eq(rpcCount(fx), 1, "remaining time resumes"); });
  await client(async ({ fx, browser: b, first }) => { b.submit(first); b.fire(b.window, "pagehide"); b.tick(10000); await flush(); eq(rpcCount(fx), 0, "pagehide cancels without send"); b.fire(b.window, "pageshow", { persisted: true }); eq(b.assigned.at(-1), "reload", "BFCache reloads server state"); eq(rpcCount(fx), 0, "BFCache never revives timer"); });
  await client(async ({ browser: b }) => { b.location.pathname = "/my/settings"; const input = b.element("input", { value: "unsaved draft" }); b.fire(b.window, "pageshow", { persisted: true }); eq(b.assigned.length, 0, "BFCache without deletion keeps the current page"); eq(input.value, "unsaved draft", "unrelated unsaved input survives"); });
  await client(async ({ fx, browser: b, first }) => { b.submit(first); const dialog = b.element("dialog", { open: "" }); b.mutate(); ok(dialog.contains(b.notice), "undo moves into the open native dialog"); b.undo.focus(); b.tick(10000); eq(rpcCount(fx), 0, "dialog undo focus pauses"); dialog.removeAttribute("open"); b.mutate(); eq(b.notice.parentElement, b.body, "closing popup keeps common notification"); b.undo.click(); eq(rpcCount(fx), 0, "popup cancellation writes zero"); });
  await client(async ({ fx, browser: b, first }) => { b.submit(first); const link = b.element("a", { href: "/menu?household_id=house-home" }); b.click(link); b.fire(b.window, "beforeunload"); await flush(); b.tick(10000); eq(rpcCount(fx), 0, "actual navigation cancels before transmission"); });
  await client(async ({ fx, browser: b, first, second, calls }) => {
    b.submit(first); b.tick(5000); await flush();
    eq(rpcCount(fx), 1, "lost response commits only once");
    eq(calls.filter(c => c.path.startsWith("/u/api/tx/presence")).length, 1, "unknown exact ID re-read once");
    eq(first.button.disabled, true, "unknown ID stays blocked"); eq(second.button.disabled, false, "other IDs unlocked");
    ok(b.notice.textContent.includes("현재 기록을 찾지 못했습니다"), "read reports current absence");
    ok(!b.notice.textContent.includes("기록을 삭제했습니다"), "absence does not claim request success");
    const metadata = JSON.parse(b.storage.get("abTxDeletePending"));
    eq(Object.keys(metadata[0]).sort().join(","), "household_id,state,transaction_id", "stores IDs and state only");
    b.submit(first); b.tick(10000); await flush(); eq(rpcCount(fx), 1, "unknown request never retried");
  }, { browserFetch: async (_path, init, forward) => { if (init.method === "POST") { await forward(); throw new Error("lost response"); } return forward(); } });
  await client(async ({ fx, browser: b, first }) => { b.submit(first); b.undo.click(); b.tick(9000); eq(rpcCount(fx), 0, "blocked storage never bypasses cancellation"); }, { storageFails: true });
  await client(async ({ fx, browser: b, first, second, calls }) => { await flush(); eq(rpcCount(fx), 0, "restored request is never resubmitted"); eq(calls.filter(c => c.path.startsWith("/u/api/tx/presence")).length, 1, "restored request exact lookup once"); eq(first.button.disabled, true, "restored uncertain ID blocked"); eq(second.button.disabled, false, "restored uncertainty does not lock other IDs"); ok(b.notice.textContent.includes("현재 기록이 존재합니다"), "presence is not a definite deletion failure"); }, { storage: new Map([["abTxDeletePending", JSON.stringify([{ household_id: "house-home", transaction_id: values.id, state: "requesting" }])]]) });
  await client(async ({ fx, browser: b, first, calls }) => {
    const edit = await page(fx, "/transactions/edit?id=" + values.id);
    ok(edit.html.includes('name="household_id" value="house-home"'), "standalone edit supplies actual ledger in form");
    await flush(); eq(rpcCount(fx), 0, "standalone restoration never resends");
    eq(calls.filter(c => c.path.startsWith("/u/api/tx/presence")).length, 1, "standalone restoration checks exact ID once");
    ok(b.notice?.textContent.includes("현재 기록이 존재합니다"), "standalone restoration offers result check");
    eq(first.button.disabled, true, "standalone uncertain ID remains blocked");
    eq(new URL(calls[0].path, "https://malhaebook.com").searchParams.get("household_id"), "house-home", "standalone check uses actual form ledger");
  }, { pathname: "/transactions/edit", search: "?id=" + values.id, storage: new Map([["abTxDeletePending", JSON.stringify([{ household_id: "house-home", transaction_id: values.id, state: "requesting" }])]]) });
  await client(async ({ fx, browser: b, first, second, calls }) => { b.submit(first); b.tick(5000); await new Promise(resolve => setImmediate(resolve)); ok(JSON.parse(b.storage.get("abTxDeletePending"))[0].state === "requesting", "metadata persisted immediately before send"); eq(b.undo.disabled, true, "undo disabled after send"); b.tick(15000); await flush(); eq(calls.filter(c => c.method === "POST").length, 1, "timeout never resends"); eq(calls.filter(c => c.path.startsWith("/u/api/tx/presence")).length, 1, "timeout checks exact ID once"); eq(first.button.disabled, true, "timeout blocks affected ID"); eq(second.button.disabled, false, "timeout releases other IDs"); eq(rpcCount(fx), 0, "aborted simulated request has no write"); }, { browserFetch: async (_path, init, forward) => init.method === "POST" ? new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true })) : forward() });
  await client(async ({ fx, browser: b, first, calls }) => { b.submit(first); b.tick(5000); await flush(); eq(calls.filter(c => c.method === "POST").length, 1, "failed lookup never resubmits deletion"); eq(calls.filter(c => c.path.startsWith("/u/api/tx/presence")).length, 1, "failed automatic lookup only once"); ok(b.notice.textContent.includes("현재 기록 조회도 완료하지 못했습니다"), "lookup failure stays unknown"); b.notice.querySelector("[data-ab-delete-check]").click(); await flush(); eq(calls.filter(c => c.path.startsWith("/u/api/tx/presence")).length, 2, "manual lookup allowed"); eq(rpcCount(fx), 0, "manual lookup is read only"); }, { browserFetch: async (path, init) => { throw new Error(path + ": unavailable"); } });
  for (const kind of ["html", "invalid", "network"]) await client(async ({ fx, browser: b, first, second, calls }) => { b.submit(first); b.tick(5000); await flush(); eq(rpcCount(fx), 0, kind + " no unexpected write"); eq(calls.filter(c => c.method === "POST").length, 1, kind + " no retry"); eq(calls.filter(c => c.path.startsWith("/u/api/tx/presence")).length, 1, kind + " exact check"); eq(first.button.disabled, true, kind + " blocked ID"); eq(second.button.disabled, false, kind + " releases screen"); ok(!b.notice.textContent.includes("기록을 삭제했습니다"), kind + " no false success"); }, { browserFetch: async (_path, init, forward) => init.method !== "POST" ? forward() : kind === "html" ? new Response("<html>login</html>", { headers: { "content-type": "text/html" } }) : kind === "invalid" ? new Response("{}", { headers: { "content-type": "application/json" } }) : Promise.reject(new Error("connection lost")) });
  const focus = createDeleteBrowser({ hash: "#abTxResults" }); const summary = focus.element("section", { class: "txTabHead", "data-count": "65" }); const heading = focus.element("h2", { id: "abTxResults" }, summary); focus.run(accountbookTransactionFilterClientMain); focus.tick(50); eq(focus.document.activeElement, heading, "filter destination focused"); ok(summary.textContent.includes("65건"), "actual result count announced");
  const settings = createDeleteBrowser(); settings.location.pathname = "/my/settings"; const draft = settings.element("input", { value: "unsaved plan" }); settings.run(accountbookTransactionDeleteClientMain); settings.fire(settings.window, "pageshow", { persisted: true }); eq(settings.document.events.size, 0, "unrelated page installs no delete listeners"); eq(draft.value, "unsaved plan", "unrelated page preserves draft");
});
for (const [path, expected] of [["/assets/accountbook-shell-v22946.css", "3653eb214c33fe4223b8f0bc414c63b3e8292c85bd6f9eb59a4adfcb97fde08c"], ["/assets/accountbook-v5-v22946.js", "d8b25695573233145372dba77ee457bbf9a27c98f6875269664056ed02e28f03"]]) { const response = await app.fetch(new Request("https://malhaebook.com" + path), {}, {}); eq(createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex"), expected, "E historical bytes preserved"); }
ok(readFileSync(new URL("../src/modules/client/lucian-b-mains.js", import.meta.url), "utf8").includes("MIT License"), "license retained");
console.log(`Lucian B V22.9.47: ${checks} checks passed`);

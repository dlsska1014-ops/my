// V22.9.45: B-1, C-1, G-1, G-18 and G-16 only. Adapted from the
// v22944-audit reproductions; all requests use synthetic in-memory data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import app from "../src/index.js";
import { supabase } from "../src/modules/data/supabase-client.js";
import { saveKakaoParsedTransactionsReply } from "../src/modules/kakao/transaction-save.js";
import { renderCalendarFilterScript } from "../src/modules/web/menu-and-guides.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { fixture, page, post } from "./lib-audit-v22934.mjs";

let checks = 0, sequence = 0;
const eq = (actual, expected, label) => { assert.equal(actual, expected, label); checks++; };
const ok = (actual, label) => { assert.ok(actual, label); checks++; };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const BASE = "https://malhaebook.com";
const textOf = (body) => (body?.template?.outputs || []).map((o) => o.simpleText?.text || o.textCard?.description || "").join("\n");

async function withFx(task, options = {}) {
  const fx = await createV2265QaFixture(options);
  fx.env.KAKAO_SKILL_SECRET = "synthetic-v45-skill-secret";
  fx.env.SKILL_RATE_LIMIT = 10000;
  fx.delayMs = 0;
  fx.calls = [];
  const memoryFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "mock.supabase.co") throw new Error(`unexpected live network: ${url.hostname}`);
    fx.calls.push({ method: init.method || "GET", path: url.pathname });
    if (fx.delayMs) await new Promise((resolve) => setTimeout(resolve, fx.delayMs));
    return memoryFetch(input, init);
  };
  try { return await task(fx); } finally { fx.restore(); }
}

async function say(fx, utterance, { key, room = "", waitUntil = true } = {}) {
  const jobs = [];
  const userRequest = { utterance: room ? `@말해가계부 ${utterance}` : utterance, user: { id: key, type: "botUserKey", properties: { botUserKey: key } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  const started = Date.now();
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kakao-skill-secret": fx.env.KAKAO_SKILL_SECRET },
    body: JSON.stringify({ bot: { id: "synthetic-v45-bot", name: "말해가계부" }, userRequest }),
  }), fx.env, waitUntil ? { waitUntil(job) { jobs.push(job); } } : undefined);
  const answeredMs = Date.now() - started;
  const body = await response.json();
  return { response, body, text: textOf(body), answeredMs, async settle() {
    // Completion can schedule NLU persistence after the deferred promise resolves.
    for (let offset = 0; offset < jobs.length;) {
      const batch = jobs.slice(offset); offset += batch.length;
      const settled = await Promise.allSettled(batch);
      // Keep this infrastructure assertion, but exclude timing-dependent batch
      // counts from the release total (100ms requests may finish before deferral).
      assert.ok(settled.every((job) => job.status === "fulfilled"), "waitUntil jobs finish without rejection");
    }
  } };
}

async function b1() {
  // V22.9.73: since V22.9.72 the first-record path is shorter (about 29 sequential calls before the
  // save gate), so at 120ms a synchronous caller's preparation took 3.48-3.6s and straddled the 3.5s
  // gate (repeated ubuntu CI failures: "room@120ms waitUntil=false: first transaction count").
  // 150ms and 200ms clear both the gate and the 4s response budget.
  for (const delayMs of [150, 200]) {
    for (const kind of ["room", "dm"]) {
      for (const waitUntil of [true, false]) {
        await withFx(async (fx) => {
          const key = `v45-${kind}-${++sequence}`, room = kind === "room" ? `${key}-room` : "";
          fx.delayMs = delayMs;
          const reply = await say(fx, "점심 51000", { key, room, waitUntil });
          await reply.settle();
          const recordDbCount = fx.calls.length;
          const saved = () => fx.db.transactions.filter((row) => row.source_user_key === key);
          const label = `${kind}@${delayMs}ms waitUntil=${waitUntil}`;
          eq(saved().length, waitUntil ? 1 : 0, `${label}: first transaction count`);
          eq(reply.response.status, 200, `${label}: HTTP 200`);
          if (waitUntil) {
            eq(reply.response.headers.get("x-accountbook-nlu-result"), "deferred", `${label}: deferred response`);
            ok(reply.answeredMs < 5000, `${label}: answers within Kakao budget (${reply.answeredMs}ms)`);
            eq(saved()[0].amount, 51000, `${label}: amount is preserved`);
            const uid = fx.db.users.find((u) => u.kakao_user_key === key)?.id;
            eq(fx.db.household_members.find((m) => m.user_id === uid && m.household_id === saved()[0].household_id)?.role, "owner", `${label}: first caller owns the ledger`);
            const duplicate = await say(fx, "점심 51000", { key, room });
            await duplicate.settle();
            eq(saved().length, 1, `${label}: immediate replay cannot duplicate a transaction`);
            fx.delayMs = 0;
            const today = await say(fx, "오늘 기록 보기", { key, room });
            await today.settle();
            ok(today.text.includes("51,000"), `${label}: saved record is visible in today's list`);
          } else {
            ok(reply.text.includes("저장 전 준비 조회가 지연되어") && reply.text.includes("저장하지 않았어요"), `${label}: synchronous refusal remains truthful`);
          }
          console.log(`B-1 ${label}: response=${reply.answeredMs}ms DB=${recordDbCount} saved=${saved().length}`);
        });
      }
    }
  }
  for (const delayMs of [0, 100]) {
    await withFx(async (fx) => {
      const key = `v45-fast-${++sequence}`, room = `${key}-room`;
      fx.delayMs = delayMs;
      const first = await say(fx, "점심 52000", { key, room }); await first.settle();
      ok(first.text.includes("공동 가계부를 준비했어요"), `room@${delayMs}ms: normal owner notice`);
      eq(fx.db.transactions.filter((row) => row.source_user_key === key).length, 1, `room@${delayMs}ms: saves exactly once`);
      const member = `${key}-member`;
      const joined = await say(fx, "커피 4700", { key: member, room }); await joined.settle();
      ok(joined.text.includes("참여했어요") && joined.text.includes("기록·수정"), `join@${delayMs}ms: membership notice`);
      eq(fx.db.transactions.filter((row) => row.source_user_key === member).length, 1, `join@${delayMs}ms: saves exactly once`);
      const dm = `${key}-dm`;
      const personal = await say(fx, "점심 53000", { key: dm }); await personal.settle();
      ok(personal.text.includes("저장했어요") || (delayMs === 100 && personal.response.headers.get("x-accountbook-nlu-result") === "deferred"), `dm@${delayMs}ms: save or response-budget acknowledgement`);
      eq(fx.db.transactions.filter((row) => row.source_user_key === dm).length, 1, `dm@${delayMs}ms: saves exactly once`);
    });
  }
  // Exercise the save gate directly without waiting 20 real seconds.
  for (const [canDeferSave, elapsed, expected] of [[false, 4000, 0], [true, 4000, 1], [true, 19000, 1], [true, 20500, 0]]) {
    await withFx(async (fx) => {
      const before = fx.db.transactions.length;
      const response = await saveKakaoParsedTransactionsReply(fx.env, {
        household: { ...fx.db.households[0], role: "owner" }, user: fx.db.users[0],
        kakaoUserKey: "kakao_login:2265", nickname: "Bin", origin: BASE, utterance: "점심 54000",
        parsedList: [{ type: "expense", amount: 54000, category: "외식", memo: "점심", payment_method: "현금", transaction_date: "2026-07-15", raw_text: "점심 54000" }],
        handlerStartedAt: Date.now() - elapsed, canDeferSave,
      });
      eq(fx.db.transactions.length - before, expected, `save gate: deferred=${canDeferSave}, elapsed=${elapsed}`);
      if (!expected) ok(textOf(await response.json()).includes("저장하지 않았어요"), "expired preparation never claims a save");
    });
  }
}

async function c1() {
  const payload = "</script><script>window.__x=1</script>";
  await fixture(async (fx) => {
    fx.env.ADMIN_PASSWORD = "synthetic-password"; fx.env.ADMIN_SESSION_SECRET = "synthetic-secret";
    const login = await post(fx, "/login", { password: fx.env.ADMIN_PASSWORD, return_to: "/?legacy=1" }, { cookie: "" });
    eq(login.status, 303, "synthetic administrator login succeeds");
    const cookie = login.setCookie.split(/,(?=\s*\w+=)/).map((part) => part.split(";")[0].trim()).join("; ");
    for (const path of ["/?legacy=1", "/admin-view"]) {
      for (const date of [payload, "2026-02-30", "2026-13-01", "invalid", "2026-07-15"]) {
        const reply = await page(fx, `${path}${path.includes("?") ? "&" : "?"}date=${encodeURIComponent(date)}`, { cookie });
        eq(reply.status, 200, `${path}: administrator dashboard remains accessible`);
        ok(!reply.html.includes(payload), `${path}: raw script breakout is absent`);
        ok(reply.html.includes(`var active=${JSON.stringify(date === "2026-07-15" ? date : "")};`), `${path}: only a real calendar date is active`);
      }
    }
  });
  for (const value of [payload, "</ScRiPt><script>window.__x=1</script>", "\u2028\u2029<>&\"'"]) {
    const html = renderCalendarFilterScript(value);
    eq((html.match(/<script>/g) || []).length, 1, "calendar renderer emits one script opening tag");
    eq((html.match(/<\/script>/g) || []).length, 1, "calendar renderer emits one script closing tag");
    const expression = html.match(/var active=(.*?);function qs/s)?.[1];
    eq(runInNewContext(expression), value, "escaped inline JSON preserves the original JavaScript value");
    ok(!expression.includes("<") && !expression.includes("\u2028") && !expression.includes("\u2029"), "HTML and line separators are escaped at the sink");
  }
}

async function g1() {
  await withFx(async (fx) => {
    const sent = [], jobs = [];
    fx.env.OPS_MONITOR_TOKEN = "synthetic-monitor-token";
    fx.env.OPS_MONITOR = { async fetch(_input, init) { sent.push(JSON.parse(init.body)); return new Response("", { status: 200 }); } };
    const random = Math.random;
    Math.random = () => 0; // Force a normal random sample so db_failures is observable.
    try {
      const key = `v45-monitor-${++sequence}`;
      const reply = await say(fx, "커피 4500", { key }); await reply.settle();
      eq(fx.db.transactions.filter((row) => row.source_user_key === key).length, 1, "missing categories table does not block Kakao save");
      const home = await app.fetch(new Request(`${BASE}/app?household_id=house-home&month=2026-07`, { headers: { cookie: fx.cookie } }), fx.env, { waitUntil(job) { jobs.push(job); } });
      eq(home.status, 200, "missing categories table does not block /app");
      await home.text(); await Promise.all(jobs);
      for (const route of ["skill", "web"]) {
        const sample = sent.find((row) => row.route === route);
        ok(sample, `${route}: telemetry sample exists`);
        eq(sample.db_failures, 0, `${route}: optional 404/PGRST205 is not a DB failure`);
        eq(sample.sample_kind, "random", `${route}: successful request is not an incident`);
        eq(sample.outcome, "ok", `${route}: successful outcome`);
        if (route === "web") ok(sample.db_count <= 9, "/app stays inside its DB budget");
      }
      // With random sampling disabled, successful requests send no incident at all.
      Math.random = () => 0.5; sent.length = 0; jobs.length = 0;
      const again = await app.fetch(new Request(`${BASE}/app?household_id=house-home&month=2026-07`, { headers: { cookie: fx.cookie } }), fx.env, { waitUntil(job) { jobs.push(job); } });
      await again.text(); await Promise.all(jobs);
      eq(sent.length, 0, "optional absence does not trigger incident-only telemetry");
      // A genuine failure of the same optional read must still be an incident.
      const memoryFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => new URL(input).pathname === "/rest/v1/accountbook_categories"
        ? new Response(JSON.stringify({ code: "PGRST001", message: "synthetic DB outage" }), { status: 503 })
        : memoryFetch(input, init);
      jobs.length = 0;
      const broken = await app.fetch(new Request(`${BASE}/my/settings?household_id=house-home&month=2026-07`, { headers: { cookie: fx.cookie } }), fx.env, { waitUntil(job) { jobs.push(job); } });
      await broken.text(); await Promise.all(jobs);
      eq(sent.at(-1)?.db_failures, 1, "real DB failure is counted");
      eq(sent.at(-1)?.sample_kind, "incident", "real DB failure still creates an incident");
    } finally { Math.random = random; }
  }, { categoriesPresent: false });
  // Only the explicitly optional GET and exact missing-table response are exempt.
  for (const [path, method, optionalTable, status, code, failures] of [
    ["accountbook_categories", "GET", "accountbook_categories", 404, "PGRST205", 0],
    ["accountbook_categories", "GET", "", 404, "PGRST205", 1],
    ["accountbook_categories", "GET", "accountbook_categories", 404, "PGRST125", 1],
    ["accountbook_categories", "GET", "accountbook_categories", 403, "42501", 1],
    ["accountbook_categories", "GET", "accountbook_categories", 500, "PGRST205", 1],
    ["accountbook_categories", "POST", "accountbook_categories", 404, "PGRST205", 1],
    ["transactions", "GET", "accountbook_categories", 404, "PGRST205", 1],
  ]) {
    const oldFetch = globalThis.fetch;
    const record = { db_count: 0, db_ms: 0, db_failures: 0 };
    globalThis.fetch = async (_input, init) => {
      ok(!Object.hasOwn(init, "optionalTable"), "monitoring option is never forwarded to fetch");
      return new Response(JSON.stringify({ code, message: "synthetic failure" }), { status });
    };
    try {
      await assert.rejects(supabase({ SUPABASE_URL: "https://mock.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetic", __AB_MONITOR_REQUEST: record }, `/rest/v1/${path}?select=*`, { method, optionalTable }), /Supabase/); checks++;
      eq(record.db_count, 1, "optional request still counts toward the DB request budget");
      eq(record.db_failures, failures, `${method} ${path} ${status}/${code}: failure classification`);
    } finally { globalThis.fetch = oldFetch; }
  }
}

function g18() {
  const scripts = JSON.parse(read("package.json")).scripts;
  for (const path of [".agents/skills/run-kakao-accountbook-loop/SKILL.md", ".agents/skills/orchestrate-kakao-accountbook-graph/SKILL.md", "AGENTS.md"]) {
    const text = read(path);
    ok(!text.includes("validate:receipt"), `${path}: no nonexistent validation command`);
    ok(!/34 release checksums|902 automated checks/.test(text), `${path}: no obsolete fixed verification counts`);
    ok(text.includes("AGENTS.md") || path === "AGENTS.md", `${path}: points to repository rules`);
    for (const match of text.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) ok(Object.hasOwn(scripts, match[1]), `${path}: script ${match[1]} exists`);
  }
  const agents = read("AGENTS.md");
  ok(!agents.includes("SQL` 적용이 필요"), "already-applied V22.8.46 SQL is not requested again");
  ok(!agents.includes("두 모드를 모두 실행합니다"), "harness instructions do not imply one call runs both modes");
  ok(agents.includes("npm run validate:categories-absent"), "absent-table mode is explicitly invoked");
  ok(agents.includes("validate:unix"), "Bash-only entrypoint is identified");
}

function g16() {
  for (const path of ["DEPLOYMENT_MATRIX.md", "CHANGELOG.md", "README.md", "RELEASE-CHECKLIST.md"]) {
    const text = read(path);
    ok(text.includes("3d12b754-299f-4e83-8235-c5994d7fa4f9"), `${path}: actual V22.9.44 production version is recorded`);
    ok(text.includes("4d5884dd-1a12-408a-93b9-d934e6c71bae"), `${path}: actual V22.9.44 deployment is recorded`);
    ok(text.includes("2026-10-13 15:52 KST"), `${path}: deployment time is recorded`);
  }
  ok(read(".gitignore").split(/\r?\n/).includes("output/"), "local deployment artifacts are excluded from Git");
}

const cases = { b1, c1, g1, g18, g16 };
const selected = process.argv.find((arg) => arg.startsWith("--case="))?.slice(7).split(",") || Object.keys(cases);
for (const name of selected) {
  assert.ok(Object.hasOwn(cases, name), `unknown audit case: ${name}`);
  await cases[name]();
}
console.log(`PASS: V22.9.45 audit hotfix (${checks} checks)`);

// K-1: synthetic database requests only. Counts are captured at app.fetch's
// response boundary, before reading its body, and again after waitUntil settles.
import { app, BASE, counter, putSetting, settingValue, failure } from "./lib-audit-v22934.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { claimOperationLease, deferKakaoAfterReply, releaseOperationLease, runKakaoAfterReply, withSettingsRmwLease } from "../src/modules/runtime/leases.js";
import { queueKakaoSkillIdentityAliases } from "../src/modules/auth/kakao-account-link.js";
import { supabase } from "../src/modules/data/supabase-client.js";

const t = counter("PASS: V22.9.101 deferred skill identity");
const measurements = {};
const textOf = body => (body.template?.outputs || []).map(output => output.simpleText?.text || output.textCard?.description || "").join("\n");
const pathIs = (call, suffix, method) => call.url.pathname.endsWith(suffix) && call.method === method;
const probeCount = result => result.calls.filter(c => pathIs(c, "/accountbook_settings", "POST") && String(c.body?.key).startsWith("kakao_app_user_id_probe_v22991:")).length;
const withoutProbe = result => result.total - probeCount(result);
const pendingWrite = call => pathIs(call, "/accountbook_settings", "POST") && JSON.stringify(call.body).includes(":pending_write:") ||
  pathIs(call, "/accountbook_settings", "PATCH") && String(call.url.searchParams.get("key")).includes(":pending_write:");
const pendingDelete = call => pathIs(call, "/accountbook_settings", "DELETE") && String(call.url.searchParams.get("key")).includes(":pending_write:");
const claims = calls => calls.filter(call => pathIs(call, "/accountbook_claim_operation", "POST")).map(call => call.body.p_key);
const clearRepeat = () => { globalThis.__AB_KAKAO_REPEAT_GUARD?.clear(); globalThis.__AB_KAKAO_INFLIGHT?.clear(); };
const activeLeases = fx => fx.db.accountbook_operation_locks.filter(row => Date.parse(row.locked_until) > Date.now()).length;
let sequence = 0;

async function fixture(task, options) {
  const fx = await createV2265QaFixture(options);
  fx.env.KAKAO_SKILL_SECRET = "synthetic-b0-secret";
  fx.env.SKILL_RATE_LIMIT = "10000";
  fx.db.__honor_select = true;
  Object.assign(fx.env, { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback` });
  globalThis.__AB_KAKAO_APP_USER_ID_PROBE?.clear();
  globalThis.__AB_KAKAO_IDENTITY_WORK_DONE?.clear();
  globalThis.__AB_EFFECTIVE_USER_CACHE?.clear();
  globalThis.__AB_KAKAO_LOGIN_CONFLICT_TRACED?.clear();
  const offerCache = globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE;
  if (offerCache) { offerCache.value = null; offerCache.at = 0; }
  fx.prefix = `b0-${++sequence}`;
  fx.room = `${fx.prefix}-room`;
  fx.owner = `${fx.prefix}-owner`;
  fx.member = `${fx.prefix}-member`;
  fx.hook = null;
  const support = globalThis.__AB_POSTGREST_EMBED_SUPPORT;
  const oldSupport = { ...support };
  if (support) Object.assign(support, { kakao_owner_discovery: true, kakao_owner_locked: true, kakao_identity_users: true, household_members_or_embed: true, household_members_households: true, household_members_users: true });
  const memoryFetch = globalThis.fetch;
  let trace = [], replied = false, inFlight = 0, wave = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "mock.supabase.co") throw new Error("unexpected external request in K-1 fixture");
    const method = String(init.method || "GET").toUpperCase();
    let body = null;
    if (init.body) body = JSON.parse(String(init.body));
    if (inFlight === 0) wave += 1;
    inFlight += 1;
    const call = { url, method, body, afterReply: replied, wave, done: false };
    trace.push(call);
    try {
      const injected = fx.hook ? await fx.hook(call) : null;
      return injected || await memoryFetch(input, init);
    } finally { call.done = true; inFlight -= 1; }
  };
  fx.say = async (utterance, { key = fx.owner, room = fx.room, properties = {}, noContext = false, settle = true, trusted = true } = {}) => {
    trace = []; replied = false; inFlight = 0; wave = 0;
    const jobs = [];
    const payload = { userRequest: { utterance,
      user: { id: key, type: "botUserKey", properties: { botUserKey: key, ...(room ? { botGroupKey: room } : {}), ...properties } },
      ...(room ? { chat: { id: room, type: "groupChat", properties: { botGroupKey: room } } } : {}) } };
    const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", ...(trusted ? { "x-kakao-skill-secret": fx.env.KAKAO_SKILL_SECRET } : {}) }, body: JSON.stringify(payload) }), fx.env, noContext ? undefined : { waitUntil(job) { jobs.push(job); } });
    const before = trace.length;
    const waves = wave;
    replied = true;
    const body = await response.json();
    const finish = async () => { let settled = 0; while (settled < jobs.length) { const batch = jobs.slice(settled); settled = jobs.length; await Promise.allSettled(batch); } };
    if (settle) await finish();
    return { before, total: trace.length, waves, text: textOf(body), body, status: response.status, calls: trace.slice(), settle: finish };
  };
  fx.uid = key => fx.db.users.find(user => user.kakao_user_key === key)?.id;
  try { await task(fx); }
  finally {
    clearRepeat();
    if (support) { for (const key of Object.keys(support)) delete support[key]; Object.assign(support, oldSupport); }
    fx.restore();
  }
}

const measure = (name, result) => {
  measurements[name] = { before: result.before, total: result.total, text: result.text, calls: result.calls.map(c => ({ path: c.url.pathname + c.url.search, method: c.method, afterReply: c.afterReply, body: c.body })) };
  t.ok(result.text.includes("저장했어요"), `${name}: record saved`);
};
// R-1: a durable raw user must retry its missing first app alias after an
// isolate restart, including when account-link offers are disabled.
for (const enabled of [false, true]) for (const mode of ["write-failure", "budget"]) await fixture(async fx => {
  if (enabled) fx.env.KAKAO_ACCOUNT_LINK_ENABLED = "1";
  const appId = String(901000000 + sequence);
  const properties = { appUserId: appId };
  fx.hook = c => mode === "write-failure"
    ? pathIs(c, "/accountbook_settings", "POST") && c.body?.key === "user_identity_links" ? failure(503, "first aliases failed") : null
    : c.url.search.includes("accountbook_user_identities(") || pathIs(c, "/accountbook_user_identities", "GET") && c.url.search.includes("users(") ? failure(400, "PGRST200 identity embedding unavailable") : null;
  const room = mode === "budget" ? "" : fx.room;
  const first = await fx.say("점심 12000", { properties, room });
  t.ok(first.text.includes("저장했어요"), "R-1: failed first alias keeps the confirmed record");
  t.ok(!JSON.parse(settingValue(fx, "user_identity_links") || "{}")[`kakao_login:${appId}`], "R-1: first app alias is absent");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_WORK_DONE.size, 0, "R-1: failure is not completion-cached");
  fx.hook = null;
  Object.assign(globalThis.__AB_POSTGREST_EMBED_SUPPORT, { kakao_owner_discovery: true, kakao_owner_locked: true, kakao_identity_users: true });
  globalThis.__AB_KAKAO_IDENTITY_WORK_DONE.clear();
  globalThis.__AB_EFFECTIVE_USER_CACHE.clear();
  await fx.say("커피 3000원", { room });
  const base = await fx.say("커피 3100원", { room });
  const retry = await fx.say("커피 3200원", { properties, room });
  t.eq(JSON.parse(settingValue(fx, "user_identity_links") || "{}")[`kakao_login:${appId}`]?.user_id, fx.uid(fx.owner), "R-1: existing raw user repairs the failed app alias");
  t.eq(retry.before, base.before, "R-1: recovery adds no pre-reply calls");
  t.ok(retry.total - base.total <= 7, "R-1: recovery stays within seven calls");
  const third = await fx.say("커피 3300원", { properties, room });
  t.eq(withoutProbe(third), withoutProbe(base), "R-1: third request adds no calls except probe");
});
for (const kind of ["legacy", "strong", "linked"]) for (const existingRoom of [false, true]) await fixture(async fx => {
  if (existingRoom) await fx.say("점심 11000", { key: `${fx.owner}-host` });
  const appId = String(902000000 + sequence);
  const properties = { appUserId: appId };
  if (kind === "legacy") fx.db.users.find(u => u.id === "user-bin").kakao_user_key = `kakao_login:${appId}`;
  if (kind === "strong") fx.db.accountbook_user_identities.push({ provider: "kakao", provider_subject: appId, user_id: "user-bin" });
  if (kind === "linked") putSetting(fx, "user_identity_links", JSON.stringify({ ...JSON.parse(settingValue(fx, "user_identity_links") || "{}"), [`kakao_login:${appId}`]: { user_id: "user-bin" } }));
  const linksBefore = settingValue(fx, "user_identity_links");
  const recordsBefore = fx.db.transactions.length;
  fx.hook = c => pathIs(c, "/accountbook_settings", "POST") && c.body?.key === "user_identity_links" ? failure(503, "discovered alias failed") : null;
  const failed = await fx.say("커피 3400원", { properties });
  t.eq(fx.db.transactions.length, recordsBefore, "R-2: synchronous alias failure saves no record");
  t.ok(!fx.uid(fx.owner), "R-2: synchronous alias failure leaves no raw bot user");
  t.eq(settingValue(fx, "user_identity_links"), linksBefore, "R-2: synchronous alias failure leaves links unchanged");
  t.ok(!failed.text.includes("저장했어요") && /실패|문제|다시|잠시|확인/.test(failed.text), "R-2: failed request reports failure");
  fx.hook = null; clearRepeat();
  globalThis.__AB_EFFECTIVE_USER_CACHE.clear();
  const retry = await fx.say("커피 3400원", { properties });
  t.ok(retry.text.includes("저장했어요"), "R-2: retry succeeds");
  const links = JSON.parse(settingValue(fx, "user_identity_links"));
  t.eq(links[`skill_identity:${fx.owner}`]?.user_id, "user-bin", "R-2: durable bot alias uses W");
  t.eq(links[`kakao_login:${appId}`]?.user_id, "user-bin", "R-2: durable app alias uses W");
  t.ok(retry.before <= 31 && (existingRoom || retry.total <= 40), "R-2: synchronous discovered-owner caps");
  globalThis.__AB_KAKAO_IDENTITY_WORK_DONE.clear(); globalThis.__AB_EFFECTIVE_USER_CACHE.clear();
  await fx.say("커피 3500원");
  t.eq(fx.db.transactions.at(-1).user_id, "user-bin", "R-3: app-less next request after cache reset stays on W");
  t.ok(!fx.uid(fx.owner), "R-3: no split raw user");
});
for (const kind of ["legacy", "strong", "linked"]) await fixture(async fx => {
  await fx.say("점심 12000");
  const base = await fx.say("커피 3700원");
  const appId = String(903000000 + sequence);
  const properties = { appUserId: appId };
  if (kind === "legacy") fx.db.users.find(u => u.id === "user-bin").kakao_user_key = `kakao_login:${appId}`;
  if (kind === "strong") fx.db.accountbook_user_identities.push({ provider: "kakao", provider_subject: appId, user_id: "user-bin" });
  if (kind === "linked") putSetting(fx, "user_identity_links", JSON.stringify({ ...JSON.parse(settingValue(fx, "user_identity_links")), [`kakao_login:${appId}`]: { user_id: "user-bin" } }));
  const eventsBefore = globalThis.__AB_OPS_EVENTS.filter(e => e.kind === "kakao_login_alias_conflict").length;
  const first = await fx.say("커피 3800원", { properties });
  t.eq(first.before, base.before, "R-4: off conflict adds zero reply calls");
  t.ok(withoutProbe(first) - withoutProbe(base) <= 5, "R-4: off conflict costs at most five calls excluding probe");
  t.eq(globalThis.__AB_OPS_EVENTS.filter(e => e.kind === "kakao_login_alias_conflict").length - eventsBefore, 1, "R-4: off conflict traces once");
  t.ok(!settingValue(fx, "kakao_login_link_offers_v22991"), "R-4: off conflict creates no offer");
  const hit = await fx.say("커피 3900원", { properties });
  t.eq(withoutProbe(hit), withoutProbe(base), "R-4: off conflict cache adds zero calls");
  const entry = globalThis.__AB_KAKAO_IDENTITY_WORK_DONE.get(`${fx.owner}\nkakao_login:${appId}`);
  t.eq(entry.kind, "conflict", "R-4: conflict decision is distinct from verified ownership");
  entry.at -= 10 * 60 * 1000 + 1;
  const expired = await fx.say("커피 4000원", { properties });
  t.ok(expired.calls.some(c => c.body?.p_key === "settings-rmw:user_identity_links"), "R-4: expired conflict rechecks ownership under lock");
  fx.env.KAKAO_ACCOUNT_LINK_ENABLED = "1";
  fx.hook = c => pathIs(c, "/accountbook_settings", "POST") && c.body?.key === "kakao_login_link_offers_v22991" ? failure(503, "offer failed") : null;
  await fx.say("커피 4100원", { properties });
  t.ok(!globalThis.__AB_KAKAO_IDENTITY_WORK_DONE.get(`${fx.owner}\nkakao_login:${appId}`)?.enabled, "R-4: failed enabled offer is not completion-cached");
  fx.hook = null;
  await fx.say("커피 4200원", { properties });
  t.ok(!!JSON.parse(settingValue(fx, "kakao_login_link_offers_v22991") || "{}")["user-bin"], "R-4: enabled retry persists the offer despite earlier off conflict cache");
});
for (const kind of ["none", "unknown", "legacy", "strong"]) await fixture(async fx => {
  const appId = String(910000000 + sequence);
  if (kind === "legacy") fx.db.users.find(u => u.id === "user-bin").kakao_user_key = `kakao_login:${appId}`;
  if (kind === "strong") fx.db.accountbook_user_identities.push({ provider: "kakao", provider_subject: appId, user_id: "user-bin" });
  const result = await fx.say("점심 12000", { properties: kind === "none" ? {} : { appUserId: appId } });
  measure(`new-${kind}`, result);
  const discovered = ["legacy", "strong"].includes(kind);
  t.ok(result.before <= (discovered ? 31 : 25), `${kind}: A reply cap with discovered-owner exception`);
  t.ok(result.calls.filter(c => c.method === "POST" && JSON.stringify(c.body).includes("user_identity_links")).every(c => c.afterReply === !discovered), `${kind}: only discovered-owner aliases precede the response`);
  if (kind !== "none") {
    t.ok(discovered ? result.before <= 31 : result.before - measurements["new-none"].before === 1, `${kind}: B-7 discovery reply cap`);
    t.ok(discovered ? result.total <= 40 : result.total - measurements["new-none"].total <= 2, `${kind}: B-7 total cap`);
    const map = JSON.parse(settingValue(fx, "user_identity_links") || "{}");
    t.eq(map[`kakao_login:${appId}`]?.user_id, fx.db.transactions.at(-1).user_id, `${kind}: first app alias keeps web-login continuity`);
    const count = fx.db.users.length;
    await fx.say("커피 3600원");
    t.eq(fx.db.users.length, count, `${kind}: next message without app uses the durable bot alias`);
  }
  if (["legacy", "strong"].includes(kind)) t.eq(fx.db.transactions.at(-1).user_id, "user-bin", `${kind}: B-7 selects the web user`);
});
await fixture(async fx => {
  await fx.say("점심 12000");
  const base = await fx.say("커피 2500원"); measure("existing-none", base);
  const properties = { appUserId: String(920000000 + sequence) };
  putSetting(fx, "user_identity_links", JSON.stringify({ ...JSON.parse(settingValue(fx, "user_identity_links")), [`kakao_login:${properties.appUserId}`]: { user_id: fx.uid(fx.owner) } }));
  const off = await fx.say("빵 2600", { properties }); measure("existing-off", off);
  t.ok(off.before <= 10, "F ordinary reply cap ten");
  t.eq(off.calls.filter(c => c.url.pathname.endsWith("/accountbook_user_identities") || c.url.search.includes("kakao_login")).length, 0, "off linked existing only confirms links without owner queries");
  t.ok(!settingValue(fx, "kakao_login_link_offers_v22991"), "off creates no offer queue storage");
  const hit = await fx.say("커피 2700원", { properties }); measure("existing-off-hit", hit);
  t.eq(hit.before, base.before, "off probe hit adds no reply calls");
  t.eq(hit.total, base.total, "off probe hit adds no total calls");
  fx.env.KAKAO_ACCOUNT_LINK_ENABLED = "1";
  const first = await fx.say("커피 2800원", { properties }); measure("existing-on-first", first);
  const cached = await fx.say("커피 2900원", { properties }); measure("existing-on-hit", cached);
});
for (const owner of ["unknown", "legacy", "strong", "linked", "already"]) await fixture(async fx => {
  await fx.say("점심 12000");
  const base = await fx.say("커피 3100원");
  fx.env.KAKAO_ACCOUNT_LINK_ENABLED = "1";
  const appId = String(930000000 + sequence);
  if (owner === "legacy") fx.db.users.find(u => u.id === "user-bin").kakao_user_key = `kakao_login:${appId}`;
  if (owner === "strong") fx.db.accountbook_user_identities.push({ provider: "kakao", provider_subject: appId, user_id: "user-bin" });
  if (owner === "linked") putSetting(fx, "user_identity_links", JSON.stringify({ ...JSON.parse(settingValue(fx, "user_identity_links") || "{}"), [`kakao_login:${appId}`]: { user_id: "user-bin" } }));
  if (owner === "already") putSetting(fx, "user_identity_links", JSON.stringify({ ...JSON.parse(settingValue(fx, "user_identity_links") || "{}"), [`kakao_login:${appId}`]: { user_id: fx.uid(fx.owner) } }));
  const first = await fx.say("커피 3200원", { properties: { appUserId: appId } });
  measure(`on-cold-${owner}`, first);
  measurements[`on-cold-${owner}`].added = { before: first.before - base.before, total: withoutProbe(first) - withoutProbe(base), probe: probeCount(first) };
  t.eq(first.before, base.before, `${owner}: identity work never delays the reply`);
  t.ok(first.calls.filter(c => c.url.pathname.endsWith("/accountbook_user_identities") || c.url.search.includes("kakao_login") || JSON.stringify(c.body).includes("user_identity_links") || JSON.stringify(c.body).includes("kakao_login_link_offers")).every(c => c.afterReply), `${owner}: all app owner/alias/offer requests are after reply`);
  t.eq(fx.db.transactions.at(-1).user_id, fx.uid(fx.owner), `${owner}: app does not replace the current user`);
  const map = JSON.parse(settingValue(fx, "user_identity_links") || "{}");
  t.eq(map[`kakao_login:${appId}`]?.user_id || "user-bin", ["unknown", "already"].includes(owner) ? fx.uid(fx.owner) : "user-bin", `${owner}: no alias theft`);
  globalThis.__AB_KAKAO_APP_USER_ID_PROBE?.clear();
  const cached = await fx.say("커피 3300원", { properties: { appUserId: appId } });
  t.eq(cached.before, base.before, `${owner}: completed work has no pre-reply cost`);
  t.eq(cached.total, base.total, `${owner}: completed work has no total cost even with a cold probe cache`);
});
await fixture(async fx => {
  fx.env.KAKAO_ACCOUNT_LINK_ENABLED = "1";
  measure("new-on-first", await fx.say("점심 12000", { properties: { appUserId: String(940000000 + sequence) } }));
});
await fixture(async fx => {
  fx.env.KAKAO_ACCOUNT_LINK_ENABLED = "1";
  const id = String(941000000 + sequence);
  let changed = false;
  fx.hook = c => {
    if (!changed && pathIs(c, "/transactions", "POST")) {
      changed = true;
      fx.db.accountbook_user_identities.push({ provider: "kakao", provider_subject: id, user_id: "user-bin" });
    }
    return null;
  };
  measure("new-on-conflict", await fx.say("점심 12000", { properties: { appUserId: id } }));
  t.ok(!!JSON.parse(settingValue(fx, "kakao_login_link_offers_v22991") || "{}")["user-bin"], "A+(c): late conflict persists an offer within the new-room cap");
});
await fixture(async fx => {
  const id = String(941500000 + sequence);
  fx.db.accountbook_user_identities.push({ provider: "kakao", provider_subject: id, user_id: "user-bin" });
  let release, entered;
  const blocked = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  fx.hook = async c => {
    if (c.url.search.includes("accountbook_user_identities(") && c.url.searchParams.get("accountbook_user_identities.provider_subject") === `eq.${id}`) { entered(); await blocked; }
    return null;
  };
  const firstPromise = fx.say("점심 12000", { properties: { appUserId: id }, settle: false });
  await started;
  const secondPromise = fx.say("커피 12500원", { settle: false });
  await new Promise(resolve => setTimeout(resolve, 25));
  t.ok(!fx.uid(fx.owner), "discovery overlap: app-less request cannot create raw user during owner discovery");
  release();
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  await first.settle(); await second.settle();
  t.ok(!fx.uid(fx.owner), "discovery overlap: neither request leaves a split raw user");
  t.eq(JSON.parse(settingValue(fx, "user_identity_links") || "{}")[`skill_identity:${fx.owner}`]?.user_id, "user-bin", "discovery overlap: durable bot identity remains W");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_RESOLVING.size, 0, "discovery overlap: resolution gate releases");
  await fx.say("커피 12600원");
  t.eq(fx.db.transactions.at(-1).user_id, "user-bin", "discovery overlap: later app-less record stays on W");
});
for (const change of ["strong", "linked", "missing"]) await fixture(async fx => {
  const id = String(942000000 + sequence);
  fx.db.accountbook_user_identities.push({ provider: "kakao", provider_subject: id, user_id: "user-bin" });
  const count = fx.db.transactions.length;
  let changed = false;
  fx.hook = c => {
    if (!changed && pathIs(c, "/accountbook_claim_operation", "POST") && c.body?.p_key === "settings-rmw:user_identity_links") {
      changed = true;
      const identity = fx.db.accountbook_user_identities.find(row => row.provider_subject === id);
      if (change === "strong") identity.user_id = "user-wifi";
      if (change === "missing") fx.db.accountbook_user_identities.splice(fx.db.accountbook_user_identities.indexOf(identity), 1);
      if (change === "linked") putSetting(fx, "user_identity_links", JSON.stringify({ [`kakao_login:${id}`]: { user_id: "user-wifi" } }));
    }
    return null;
  };
  await fx.say("점심 12000", { properties: { appUserId: id } });
  t.ok(changed, "B-7 race changes ownership between discovery and lock");
  t.eq(fx.db.transactions.length, count, "B-7 race never records for the stale discovered owner");
  t.ok(!fx.uid(fx.owner) && !JSON.parse(settingValue(fx, "user_identity_links") || "{}")[`skill_identity:${fx.owner}`], "B-7 race leaves no raw or bot identity");
  t.eq(activeLeases(fx), 0, "B-7 race releases the identity lease");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_PENDING.size, 0, "B-7 race releases the local gate");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_RESOLVING.size, 0, "B-7 failure releases the resolver gate");
});
// Discovery filters are executable fixture semantics, not canned matching rows.
for (const reverse of [false, true]) await fixture(async fx => {
  const id = String(950000000 + sequence);
  fx.db.users.find(u => u.id === "user-bin").kakao_user_key = `kakao_login:${id}`;
  fx.db.accountbook_user_identities.push({ user_id: "user-wifi", provider: "kakao", provider_subject: id });
  fx.db.accountbook_user_identities.push({ user_id: "user-bin", provider: "local", provider_subject: id });
  if (reverse) fx.db.users.reverse();
  const result = await fx.say("점심 12000", { properties: { appUserId: id } });
  t.ok(result.text.includes("저장했어요"), "discovery stores the record");
  t.eq(fx.db.transactions.at(-1).user_id, "user-wifi", "strong wins over legacy independently of row order");
  t.eq(result.calls.filter(c => !c.afterReply && c.url.search.includes("accountbook_user_identities(") && c.url.searchParams.get("accountbook_user_identities.provider_subject")?.startsWith("eq.")).length, 1, "only one pre-reply owner discovery query before locked revalidation");
});
for (const mode of ["reject", "malformed", "multiple", "error", "merged"]) await fixture(async fx => {
  const id = String(960000000 + sequence);
  fx.db.users.find(u => u.id === "user-bin").kakao_user_key = `kakao_login:${id}`;
  if (mode === "merged") fx.db.users.find(u => u.id === "user-bin").nickname = "Bin(통합됨)";
  if (mode !== "merged") fx.hook = c => {
    if (!c.url.search.includes("accountbook_user_identities(")) return null;
    if (mode === "reject") return failure(400, { code: "PGRST200", message: "relationship unavailable" });
    if (mode === "error") return failure(503, { message: "unavailable" });
    if (mode === "malformed") return Response.json([{ id: "user-bin", kakao_user_key: `kakao_login:${id}` }]);
    return Response.json(["user-bin", "user-wifi"].map(uid => ({ id: uid, kakao_user_key: "other", nickname: "name", accountbook_user_identities: [{ user_id: uid, provider: "kakao", provider_subject: id }] })));
  };
  const before = fx.db.transactions.length;
  await fx.say("점심 12000", { properties: { appUserId: id } });
  t.eq(fx.db.transactions.length - before, mode === "reject" ? 1 : 0, `${mode}: discovery fallback or safe stop`);
  t.eq(fx.db.users.filter(u => u.kakao_user_key === fx.owner).length, 0, `${mode}: never split a known web identity`);
  if (mode === "reject") t.eq(fx.db.transactions.at(-1).user_id, "user-bin", "rejected embed keeps legacy discovery behavior");
});
await fixture(async fx => {
  const id = String(970000000 + sequence);
  fx.db.users.find(u => u.id === "user-bin").kakao_user_key = `kakao_login:${id}`;
  const count = fx.db.transactions.length;
  const result = await fx.say("점심 12000", { properties: { appUserId: id }, trusted: false });
  t.eq(fx.db.transactions.length, count, "untrusted new bot cannot access the web user's account");
  t.eq(result.calls.filter(c => c.url.search.includes("accountbook_user_identities(")).length, 0, "untrusted has no new discovery permission");
});
await fixture(async fx => {
  await fx.say("점심 12000");
  fx.env.KAKAO_ACCOUNT_LINK_ENABLED = "1";
  const appId = String(980000000 + sequence);
  fx.hook = c => c.url.pathname.endsWith("/accountbook_user_identities") || c.url.search.includes("accountbook_user_identities(") ? failure(503, { message: "owner unavailable" }) : null;
  const failed = await fx.say("커피 3500원", { properties: { appUserId: appId } });
  t.ok(failed.text.includes("저장했어요"), "background ownership failure keeps the confirmed transaction");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_WORK_DONE.size, 0, "failed owner lookup is not completion-cached");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_PENDING.size, 0, "failed identity task releases local gate");
  fx.hook = null;
  await fx.say("커피 3600원", { properties: { appUserId: appId } });
  t.eq(JSON.parse(settingValue(fx, "user_identity_links"))[`kakao_login:${appId}`]?.user_id, fx.uid(fx.owner), "next request retries failed alias work");
});
await fixture(async fx => {
  fx.env.KAKAO_ACCOUNT_LINK_ENABLED = "1";
  Object.assign(fx.env, { __AB_REQUEST_USER_ROWS: new Map(), __AB_IDENTITY_CONFIRMED: new Map(), __AB_DB_BUDGET: { used: 49, limit: 50 }, __AB_KAKAO_REQUEST: { enabled: true, afterReply: [], createdUsers: new Set() } });
  await queueKakaoSkillIdentityAliases(fx.env, { rawKey: fx.owner, user: fx.db.users[0], appAlias: "kakao_login:989000001" });
  await runKakaoAfterReply(fx.env);
  t.eq(globalThis.__AB_KAKAO_IDENTITY_WORK_DONE.size, 0, "budget-skipped work is not cached");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_PENDING.size, 0, "budget skip always releases the local gate");
});
await fixture(async fx => {
  await fx.say("점심 12000");
  await fx.say("저녁 14000", { key: fx.member });
  fx.env.KAKAO_ACCOUNT_LINK_ENABLED = "1";
  const id = String(990000000 + sequence);
  let release, entered;
  const blocked = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  let claims = 0, active = 0, overlap = false;
  fx.hook = async c => {
    if (!String(c.body?.p_key).includes("settings-rmw:user_identity_links")) return null;
    if (c.url.pathname.endsWith("/accountbook_claim_operation")) {
      claims += 1; active += 1; if (active > 1) overlap = true;
      if (claims === 1) { entered(); await blocked; }
    } else if (c.url.pathname.endsWith("/accountbook_release_operation")) active -= 1;
    return null;
  };
  const first = await fx.say("커피 4100원", { properties: { appUserId: id }, settle: false });
  await started;
  const second = await fx.say("커피 4200원", { key: fx.member, properties: { appUserId: id }, settle: false });
  release(); await Promise.all([first.settle(), second.settle()]);
  const owner = JSON.parse(settingValue(fx, "user_identity_links"))[`kakao_login:${id}`]?.user_id;
  t.eq(claims, 2, "two chatters each enter the global identity lock");
  t.ok(!overlap, "global identity leases do not overlap in the isolate");
  t.eq(owner, fx.uid(fx.owner), "second chatter cannot overwrite the first successful alias owner");
  t.eq(fx.db.transactions.at(-1).user_id, fx.uid(fx.member), "second chatter's transaction still belongs to the second chatter");
});
await fixture(async fx => {
  const id = String(995000000 + sequence);
  fx.db.users.find(u => u.id === "user-bin").kakao_user_key = `kakao_login:${id}`;
  let release, entered;
  const blocked = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  fx.hook = async c => {
    if (c.url.pathname.endsWith("/accountbook_claim_operation") && c.body?.p_key === "settings-rmw:user_identity_links") { entered(); await blocked; }
    return null;
  };
  const firstPromise = fx.say("점심 12000", { properties: { appUserId: id }, settle: false });
  await started;
  const secondPromise = fx.say("커피 4700원");
  release(); const first = await firstPromise; await first.settle();
  const second = await secondPromise;
  t.ok(second.text.includes("저장했어요") || /처리|다시|잠시/.test(second.text), "immediate next message waits for bot identity then follows the existing message lease contract");
  t.eq(fx.db.transactions.at(-1).user_id, "user-bin", "immediate next message without app keeps the web identity");
  t.ok(!fx.uid(fx.owner), "overlapping app-less request cannot create a split raw identity");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_PENDING.size, 0, "successful local identity gate is cleared");
});
await fixture(async fx => {
  const id = String(996000000 + sequence);
  const result = await fx.say("점심 9000", { room: "", properties: { appUserId: id } });
  measure("direct-new", result);
  measurements["direct-new"].alias = JSON.parse(settingValue(fx, "user_identity_links") || "{}")[`kakao_login:${id}`];
  t.eq(measurements["direct-new"].alias?.user_id, fx.uid(fx.owner), "direct first record preserves app/web continuity within the request budget");
  t.ok(result.total <= 50, "direct first record includes alias persistence and cleanup within 50 calls");
  t.eq(result.calls.filter(c => !c.afterReply && c.url.search.includes("accountbook_user_identities(")).length, 1, "direct B-7 discovery occurs only once across seed recheck");
});
for (const ordinary of [false, true]) await fixture(async fx => {
  await fx.say("점심 12000");
  const base = await fx.say(ordinary ? "빵 6100" : "커피 6100원");
  const properties = { appUserId: String(997000000 + sequence) };
  putSetting(fx, "user_identity_links", JSON.stringify({ ...JSON.parse(settingValue(fx, "user_identity_links")), [`kakao_login:${properties.appUserId}`]: { user_id: fx.uid(fx.owner) } }));
  const cold = await fx.say(ordinary ? "빵 6200" : "커피 6200원", { properties });
  const hit = await fx.say(ordinary ? "빵 6300" : "커피 6300원", { properties });
  t.eq(cold.before, base.before, "off existing app adds zero reply calls for either input shape");
  t.ok(cold.total - base.total <= 2, "off existing confirmation and cold probe total extra at most two");
  t.eq(hit.total, base.total, "off existing probe hit adds zero total calls");
  t.ok(cold.before <= 10 && hit.before <= 10, "F reply cap ten in both input shapes");
  t.eq(cold.calls.filter(c => c.afterReply && c.method === "POST" && JSON.stringify(c.body).includes("kakao_app_user_id_probe_v22991:present")).length, 1, "cold present probe is written after reply");
  for (const [key] of globalThis.__AB_KAKAO_APP_USER_ID_PROBE) if (key.startsWith("present:")) globalThis.__AB_KAKAO_APP_USER_ID_PROBE.set(key, Date.now() - 60 * 60 * 1000 - 1);
  const expired = await fx.say(ordinary ? "빵 6400" : "커피 6400원", { properties });
  t.eq(expired.total, base.total + 1, "probe retries once after one-hour expiry without rechecking verified links");
});
await fixture(async fx => {
  await fx.say("점심 12000");
  fx.env.KAKAO_ACCOUNT_LINK_ENABLED = "1";
  const id = String(998000000 + sequence);
  const properties = { appUserId: id };
  await fx.say("커피 6500원", { properties });
  const entry = globalThis.__AB_KAKAO_IDENTITY_WORK_DONE.get(`${fx.owner}\nkakao_login:${id}`);
  t.ok(!!entry, "successful pair has a completion entry");
  entry.at -= 24 * 60 * 60 * 1000 + 1;
  const again = await fx.say("커피 6600원", { properties });
  t.ok(again.calls.some(c => c.afterReply && pathIs(c, "/accountbook_settings", "GET") && c.url.search.includes("user_identity_links")) && !again.calls.some(c => c.body?.p_key === "settings-rmw:user_identity_links"), "24-hour expiry confirms existing links without a lock");
  t.eq(fx.db.transactions.at(-1).user_id, fx.uid(fx.owner), "completion cache never changes selected identity");
});
await fixture(async fx => {
  await fx.say("점심 12000");
  fx.env.KAKAO_ACCOUNT_LINK_ENABLED = "1";
  const id = String(999000000 + sequence);
  const before = fx.db.transactions.length;
  fx.hook = c => c.url.pathname.endsWith("/accountbook_claim_operation") && c.body?.p_key === "settings-rmw:user_identity_links" ? Response.json([{ acquired: false }]) : null;
  const result = await fx.say("커피 6700원", { properties: { appUserId: id } });
  t.ok(result.text.includes("저장했어요") && fx.db.transactions.length === before + 1, "busy alias lock cannot erase a confirmed record");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_WORK_DONE.size, 0, "busy lock does not become completed work");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_PENDING.size, 0, "busy lock eventually opens the local gate");
});
await fixture(async fx => {
  await fx.say("점심 12000");
  const count = fx.db.transactions.length;
  let changed = false;
  fx.hook = c => {
    if (!changed && c.url.pathname.endsWith("/accountbook_claim_operation") && String(c.body?.p_key).startsWith("kakao-group-lifecycle:")) {
      changed = true;
      putSetting(fx, `identity_merge_redirect:${fx.uid(fx.member)}`, JSON.stringify({ primary_user_id: "user-bin" }));
    }
    return null;
  };
  await fx.say("저녁 16000", { key: fx.member });
  t.ok(changed, "redirect changes between initial routing and the locked room snapshot");
  t.eq(fx.db.transactions.length, count, "locked redirect protection stops the first member write");
});
await fixture(async fx => {
  const id = String(999100000 + sequence);
  fx.hook = c => c.url.search.includes("accountbook_user_identities(") || c.url.pathname.endsWith("/accountbook_user_identities") && c.url.search.includes("users(")
    ? failure(400, "PGRST200 identity embedding unavailable") : null;
  const result = await fx.say("점심 9000", { room: "", properties: { appUserId: id } });
  measure("direct-embed-fallback", result);
  t.ok(result.total <= 50, "identity embedding rejection remains under the dispatch limit");
  t.eq(activeLeases(fx), 0, "fallback cannot consume the inner identity or outer message release budget");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_WORK_DONE.size, 0, "budget-aborted fallback work is not completed");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_PENDING.size, 0, "budget-aborted fallback opens the local gate");
});
await fixture(async fx => {
  const run = async suffix => {
    const env = { ...fx.env, __AB_DB_BUDGET: { used: 0, limit: 7 }, __AB_KAKAO_REQUEST: { enabled: true, afterReply: [], createdUsers: new Set() } };
    const lease = await claimOperationLease(env, { key: `outer-cleanup-${suffix}`, owner: `cleanup-${suffix}` });
    let aborted = false, restoredInside = false;
    await deferKakaoAfterReply(env, async () => {
      try {
        await withSettingsRmwLease(env, `nested-a-${suffix}`, async () => withSettingsRmwLease(env, `nested-b-${suffix}`, async () => {
          await supabase(env, "/rest/v1/users?select=id&limit=1", { method: "GET" });
          await supabase(env, "/rest/v1/users?select=id&limit=1", { method: "GET" });
        }));
      } catch (error) { aborted = error.code === "supabase_subrequest_budget_before_dispatch"; throw error; }
      finally { restoredInside = env.__AB_DB_BUDGET.reserved === 1; }
    }, { cost: 1 }); // Deliberately underestimate to verify dispatch-time protection.
    await deferKakaoAfterReply(env, () => releaseOperationLease(env, lease), { cost: 1, critical: true });
    await runKakaoAfterReply(env);
    return { env, aborted, restoredInside };
  };
  const results = await Promise.all([run(`${fx.prefix}-one`), run(`${fx.prefix}-two`)]);
  t.ok(results.every(r => r.aborted), "both nested optional jobs stop before spending reserved cleanup calls");
  t.ok(results.every(r => r.restoredInside), "nested RMW finally restores the outer reservation");
  t.ok(results.every(r => r.env.__AB_DB_BUDGET.used === 7), "independent request budgets each dispatch exactly seven calls");
  t.ok(results.every(r => r.env.__AB_DB_BUDGET.limit === 7 && r.env.__AB_DB_BUDGET.reserved === 0 && r.env.__AB_DB_BUDGET.afterReplyDepth === 0), "finally restores each request's budget scope without changing its limit");
  t.ok(results[0].env.__AB_DB_BUDGET !== results[1].env.__AB_DB_BUDGET, "concurrent request budgets are separate objects");
  t.eq(activeLeases(fx), 0, "nested and outer critical leases all release");
});
await fixture(async fx => {
  await fx.say("점심 12000");
  fx.env.KAKAO_ACCOUNT_LINK_ENABLED = "1";
  fx.hook = c => c.url.pathname.endsWith("/accountbook_release_operation") && c.body?.p_key === "settings-rmw:user_identity_links" ? failure(503, "identity release failed") : null;
  const result = await fx.say("커피 6800원", { properties: { appUserId: String(999200000 + sequence) } });
  t.ok(result.text.includes("저장했어요"), "background release failure keeps the confirmed record");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_WORK_DONE.size, 0, "failed inner release is not completion-cached");
  t.eq(globalThis.__AB_KAKAO_IDENTITY_PENDING.size, 0, "failed inner release opens the local identity gate");
  t.eq(fx.db.accountbook_operation_locks.filter(row => Date.parse(row.locked_until) > Date.now() && row.operation_key?.startsWith("kakao-message:")).length, 0, "background identity release failure does not strand the message lease");
});
await fixture(async fx => {
  const env = { ...fx.env, __AB_DB_BUDGET: { used: 0, limit: 2 }, __AB_KAKAO_REQUEST: { enabled: true, afterReply: [], createdUsers: new Set() } };
  const lease = await claimOperationLease(env, { key: `${fx.prefix}-reserved-cleanup`, owner: "protected-owner" });
  let optionalReleased, usedBeforeCritical;
  await deferKakaoAfterReply(env, async () => {
    optionalReleased = await releaseOperationLease(env, lease);
    usedBeforeCritical = env.__AB_DB_BUDGET.used;
  }, { cost: 0 });
  await deferKakaoAfterReply(env, () => releaseOperationLease(env, lease), { cost: 1, critical: true });
  await runKakaoAfterReply(env);
  t.eq(optionalReleased, false, "an unreserved optional release cannot borrow a queued critical slot");
  t.eq(usedBeforeCritical, 1, "rejected optional release never dispatches");
  t.eq(env.__AB_DB_BUDGET.used, 2, "the critical release consumes its own final slot");
  t.eq(env.__AB_DB_BUDGET.reserved, 0, "unreserved release failure does not double-return reservations");
  t.eq(activeLeases(fx), 0, "the scheduled critical cleanup still completes");
});
const enabledGate = Object.fromEntries(Object.entries(measurements).filter(([name]) => name.startsWith("on-cold-")).map(([name, value]) => {
  const cap = name === "on-cold-already" ? 1 : name === "on-cold-unknown" ? 6 : 9;
  return [name, { added: value.added.total, probe: value.added.probe, cap, passed: value.added.total <= cap }];
}));
enabledGate.newRoom = { total: measurements["new-on-first"].total, cap: 45, passed: measurements["new-on-first"].total <= 45 };
enabledGate.newRoomConflict = { total: measurements["new-on-conflict"].total, cap: 45, passed: measurements["new-on-conflict"].total <= 45 };
const summary = Object.fromEntries(Object.entries(measurements).map(([name, value]) => [name, { before: value.before, total: value.total, ...(value.added ? { added: value.added } : {}) }]));
console.log(JSON.stringify({ measurements: process.argv.includes("--measure") ? measurements : summary, enabledGate }, null, 2));
console.log("Decision 2 gates exclude the separately measured hourly probe.");
t.done();
if (process.argv.includes("--enabled-gate") && Object.values(enabledGate).some(item => !item.passed)) { console.error("ENABLED GATE FAILED: first alias 6 / conflict 9 / new room 45"); process.exitCode = 1; }

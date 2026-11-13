#!/usr/bin/env node
// V22.9.121 회원 번호(MB-XXXX-XXXX) 검사 — 후원한 분이 어느 계정인지 운영자가 알 수 있게 하는 번호와 관리자 찾기·전체 사용자 목록.
// 사용자 결정(2026-11-04): "누구든 내 계정 보안 탭에서 나의 고유 아이디 혹은 로그인 아이디를 확인할 수 있고, 그걸 나한테 알려주면 내 관리자
// 화면에는 리스트가 있어서 적용". 후원자 표시는 supporter:<user_id> 인데 /support 는 ‘로그인 이름’ 을 알려 달라고 했고, 카카오 로그인만 쓰는 분에게는
// 로그인 이름이 없었다.
//   1. 번호(my/member-code.js): MB-XXXX-XXXX 꼴, 같은 사용자는 같은 번호, 사용자마다 다름, 독립 계산(node:crypto HMAC)과 같은 값, 비밀값 없으면 "",
//      2,000개 uuid 에서 겹침 없음, 사람이 적은 꼴(소문자·띄어쓰기·줄표·MB 없음·O/I/L·전각) 맞추기.
//   2. 내 계정·보안(/my/backup-login): 카카오 로그인·로그인 이름·단톡방 링크(채팅 계정) 세션 모두 번호 카드와 ‘복사’ 단추, 사용자 id·채팅 키는 화면에
//      없음, 번호를 못 만들면 카드 없음. 화면 GET 은 DB 에 쓰지 않는다(미리 렌더링 규칙·validate-speculation-rules-v2297). 기억 줄은 화면이 실제로
//      보일 때 보내는 신호(POST /my/member-code/seen, 늘 204)로 답 뒤(waitUntil) 한 번(ignore-duplicates) — 답이 그 쓰기를 기다리지 않고, 같은 isolate
//      에서 다시 쓰지 않으며, 세션 없음·다른 출처·같은 사이트·미리 받기·합쳐진 계정·GET 은 쓰지 않는다.
//   3. 관리자 찾기(POST /admin/supporters/save, by=member_code): 기억 줄 → 다시 계산해 확인, 없으면 훑기 + 기억 줄, 틀린 기억 줄은 버리고 바로잡음,
//      꼴이 틀리면 member_code_invalid, 비밀값이 없으면 member_code_unavailable, 훑기 읽기가 실패하면 member_code_lookup_failed, 합쳐진 계정은 user_merged.
//   4. 관리자 전체 사용자 목록(GET /admin/supporters): 줄·계정 유형·가입일(KST)·id 앞 8자·후원 상태·추가/고치기 링크, 이름·번호·id 앞자리 찾기,
//      쪽 넘기기, 통합됨 표시, 이름 이스케이프, 관리자만, 화면 한 번 DB 호출 5번 이하(정식 꼴이 아닌 번호 꼴을 번호로 못 찾아 표시 이름으로도 찾을
//      때만 6번)·줄마다 읽지 않음, 정식 꼴 번호는 이름으로 찾지 않음, 훑기 읽기 실패는 다시 시도 안내, 추가 링크 → 폼 → 저장.
//   5. /support 문구(오픈채팅 길·송금 길·문의)와 ‘내 계정·보안’ 메뉴 이름, 6. 개인정보처리방침 6절 표 줄·ab_sp·12절 한 문단, 7. 소스·등록.
// 실제 번들(src/index.js)의 app.fetch 와 QA 픽스처로 본다. DB·네트워크 없음.
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  lookupMemberCodeV229121, memberCodeAvailableV229121,
  memberCodeForUserV229121, memberCodesForUsersV229121, normalizeMemberCodeV229121,
} from "../src/modules/my/member-code.js";
import { app, BASE, fixture, intercept, page, post, settingValue, withClock } from "./lib-audit-v22934.mjs";

let checks = 0;
const failures = [];
const show = (value) => { try { return String(JSON.stringify(value)).slice(0, 300); } catch (_) { return String(value).slice(0, 300); } };
function ok(cond, msg) { checks += 1; if (!cond) failures.push(msg); }
function eq(actual, expected, msg) { checks += 1; if (!isDeepStrictEqual(actual, expected)) failures.push(`${msg} — 실제 ${show(actual)} · 기대 ${show(expected)}`); }
async function section(name, task) {
  try { await task(); } catch (error) {
    checks += 1;
    failures.push(`${name}: 구간이 끝까지 돌지 못했다 — ${String(error?.stack || error).split("\n").slice(0, 3).join(" ").slice(0, 400)}`);
  }
}
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const DAY = "2026-11-13";
const QA_SECRET = "qa-user-session-v2265"; // qa-fixture 의 USER_SESSION_SECRET
const ADMIN_PASSWORD = "qa-v229121-supporter-id-admin";
const CODE_SHAPE = /^MB-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CARD_LINE = "후원 확인이나 문의 때 운영자에게 알려 주는 번호예요. 로그인에는 쓰이지 않아요.";
const SCAN_PATH = "/rest/v1/users?select=id&order=created_at.desc,id.desc&limit=500";
const uuidOf = (label) => { const h = createHash("sha256").update(String(label)).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const hex66 = (label) => createHash("sha256").update(label).digest("hex") + "ab";

// 독립 계산: HMAC-SHA256(비밀값, "malhaebook:member-code:v1:" + user_id) 앞 40비트 → 크록퍼드 base32 8글자.
function referenceCode(secret, userId) {
  const mac = createHmac("sha256", secret).update(`malhaebook:member-code:v1:${userId}`).digest();
  let bits = "";
  for (let index = 0; index < 5; index += 1) bits += mac[index].toString(2).padStart(8, "0");
  let out = "";
  for (let index = 0; index < 40; index += 5) out += CROCKFORD[parseInt(bits.slice(index, index + 5), 2)];
  return `MB-${out.slice(0, 4)}-${out.slice(4)}`;
}
const codeOf = (userId) => referenceCode(QA_SECRET, userId);
const resetMemo = () => globalThis.__AB_MEMBER_CODE_REMEMBERED_V229121?.clear?.();
const settle = async () => { for (let round = 0; round < 5; round += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

// Supabase 로 가는 요청만 적는다(픽스처 fetch 는 그대로 돈다).
async function withDb(task) {
  const log = [];
  const restore = intercept(({ url, method, init }) => {
    if (url.hostname.endsWith("supabase.co")) {
      const headers = new Headers(init?.headers || {});
      log.push({ method, path: `${url.pathname}${url.search}`, decoded: decodeURIComponent(`${url.pathname}${url.search}`), url, prefer: headers.get("prefer") || "", body: typeof init?.body === "string" ? init.body : "" });
    }
    return null;
  });
  try { return { result: await task(), log }; } finally { restore(); }
}
const memberCodeWrites = (log) => log.filter((row) => row.method === "POST" && row.path === "/rest/v1/accountbook_settings?on_conflict=key" && row.body.includes("member_code:"));
const scans = (log) => log.filter((row) => row.method === "GET" && row.decoded === SCAN_PATH);
const putSetting = (fx, key, value) => {
  const row = fx.db.accountbook_settings.find((item) => item.key === key);
  if (row) row.value = value; else fx.db.accountbook_settings.push({ key, value, created_at: "2026-11-01T00:00:00Z" });
};
const dropSettings = (fx, prefix) => { fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => !String(row.key).startsWith(prefix)); };
const cardOf = (html) => {
  const at = html.indexOf('aria-labelledby="memberCodeTitle"');
  return at < 0 ? "" : html.slice(html.lastIndexOf("<section", at), html.indexOf("</section>", at) + "</section>".length);
};

// ── 1. 번호 만들기·맞추기(모듈) ───────────────────────────────────────────────
await section("1 번호", async () => {
  const env = { USER_SESSION_SECRET: QA_SECRET };
  const bin = await memberCodeForUserV229121(env, "user-bin");
  ok(CODE_SHAPE.test(bin), `1-a 번호는 MB-XXXX-XXXX(크록퍼드 base32 8글자) 꼴이다: ${bin}`);
  eq(bin, codeOf("user-bin"), "1-b 독립 계산(HMAC-SHA256(USER_SESSION_SECRET, \"malhaebook:member-code:v1:\"+user_id) 앞 40비트)과 같다");
  eq(await memberCodeForUserV229121(env, "user-bin"), bin, "1-c 같은 사용자는 늘 같은 번호다");
  const wifi = await memberCodeForUserV229121(env, "user-wifi");
  ok(CODE_SHAPE.test(wifi) && wifi !== bin, "1-d 사용자마다 번호가 다르다");
  eq(await memberCodeForUserV229121({ USER_SESSION_SECRET: `  ${QA_SECRET}\n` }, "user-bin"), bin, "1-e 비밀값 앞뒤 공백은 세션 서명처럼 무시한다");
  ok(await memberCodeForUserV229121({ USER_SESSION_SECRET: "other-secret" }, "user-bin") !== bin, "1-f 비밀값이 다르면 번호도 다르다(비밀값 없이는 만들 수 없다)");
  let thrown = null;
  const blank = [];
  try {
    for (const [label, e, id] of [["비밀값 없음", {}, "user-bin"], ["공백 비밀값", { USER_SESSION_SECRET: "   " }, "user-bin"], ["env 없음", null, "user-bin"], ["빈 사용자", env, ""], ["사용자 null", env, null]]) blank.push([label, await memberCodeForUserV229121(e, id)]);
  } catch (error) { thrown = error; }
  ok(!thrown && blank.every(([, value]) => value === ""), `1-g 비밀값이나 사용자가 없으면 "" 이고 던지지 않는다: ${show(blank)} ${thrown || ""}`);
  ok(memberCodeAvailableV229121(env) && !memberCodeAvailableV229121({}) && !memberCodeAvailableV229121({ USER_SESSION_SECRET: " " }), "1-h 계산할 수 있는지 = 비밀값이 있는지");

  const ids = Array.from({ length: 2000 }, (_, index) => uuidOf(`v229121-collision-${index}`));
  const batch = await memberCodesForUsersV229121(env, ids);
  const codes = ids.map((id) => batch.get(id));
  ok(codes.every((code) => CODE_SHAPE.test(code || "")), "1-i 2,000명 번호가 모두 꼴에 맞다");
  eq(new Set(codes).size, 2000, "1-j 2,000개 uuid 에서 번호가 겹치지 않는다(40비트, 겹칠 확률 약 0.0002%)");
  const sample = [];
  for (const id of ids.slice(0, 25)) sample.push((await memberCodeForUserV229121(env, id)) === batch.get(id) && batch.get(id) === referenceCode(QA_SECRET, id));
  ok(sample.every(Boolean), "1-k 여러 명 계산(키 한 번)은 한 명씩 계산·독립 계산과 같다");
  eq((await memberCodesForUsersV229121({}, ids.slice(0, 3))).size, 0, "1-l 비밀값이 없으면 여러 명 계산도 빈 결과다");

  const canonical = "MB-7K3Q-9XWD";
  const variants = [
    ["그대로", "MB-7K3Q-9XWD"], ["소문자", "mb-7k3q-9xwd"], ["띄어쓰기", "MB 7K3Q 9XWD"], ["줄표 없음", "MB7K3Q9XWD"], ["MB 없음", "7K3Q-9XWD"],
    ["MB·줄표 없음", "7k3q9xwd"], ["앞뒤 공백", "  MB-7K3Q-9XWD \n"], ["전각", "ＭＢ－７Ｋ３Ｑ－９ＸＷＤ"], ["긴 줄표", "MB–7K3Q—9XWD"], ["밑줄·점", "MB_7K3Q.9XWD"],
  ];
  eq(variants.map(([label, text]) => [label, normalizeMemberCodeV229121(text)]), variants.map(([label]) => [label, canonical]), "1-m 사람이 적은 여러 꼴을 MB-XXXX-XXXX 로 맞춘다");
  eq([normalizeMemberCodeV229121("MB-OK3Q-9XWD"), normalizeMemberCodeV229121("mb-ik3q-9xwl"), normalizeMemberCodeV229121("MB-LK3Q-9XWD")], ["MB-0K3Q-9XWD", "MB-1K3Q-9XW1", "MB-1K3Q-9XWD"], "1-n 크록퍼드 바꿔 읽기: O→0, I·L→1");
  eq(normalizeMemberCodeV229121("MB-MB12-3456"), "MB-MB12-3456", "1-o 본문이 MB 로 시작해도 머리만 뗀다(구분 기호를 뺀 길이 10)");
  const bad = ["", "MB-7K3Q-9XW", "MB-7K3Q-9XWDD", "MB-7K3U-9XWD", "MB-7K3Q-9XW!", "XY-7K3Q-9XWD", "7K3Q", "123456789", null, undefined, "MB-가나다라-9XWD"];
  eq(bad.map((text) => normalizeMemberCodeV229121(text)), bad.map(() => ""), "1-p 꼴이 아니면 \"\"(U·기호·길이·다른 머리)");
});

// ── 2. 내 계정·보안 화면 ─────────────────────────────────────────────────────
const SEEN_PATH = "/my/member-code/seen";
const dbWrites = (log) => log.filter((row) => !["GET", "HEAD"].includes(row.method));
// sendBeacon 꼴 신호: 몸 없는 POST, 같은 출처 머리. headers 로 덮어쓴다(null 이면 그 머리를 뺀다).
async function seen(fx, { cookie = fx.cookie, headers = {}, method = "POST", context = null } = {}) {
  const jobs = [];
  const sent = { ...(cookie ? { cookie } : {}), origin: BASE, "sec-fetch-site": "same-origin", "sec-fetch-mode": "no-cors", "user-agent": "Mozilla/5.0 (iPhone)", ...headers };
  for (const name of Object.keys(sent)) if (sent[name] == null) delete sent[name];
  const response = await app.fetch(new Request(`${BASE}${SEEN_PATH}`, { method, headers: sent }), fx.env, context || { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const body = await response.text();
  await Promise.allSettled(jobs);
  return { status: response.status, body, cacheControl: response.headers.get("cache-control") || "", jobs: jobs.length };
}

await section("2 내 계정·보안", async () => {
  await withClock(DAY, () => fixture(async (fx) => {
    resetMemo();
    const code = codeOf("user-bin");
    const { result: view, log } = await withDb(() => page(fx, "/my/backup-login"));
    const card = cardOf(view.html);
    ok(view.status === 200 && card.includes('<h2 id="memberCodeTitle">회원 번호</h2>'), `2-a 카카오 로그인 사용자의 내 계정·보안 화면에 ‘회원 번호’ 카드가 있다(${view.status})`);
    ok(card.includes(`<code class="memberCode" id="memberCode">${code}</code>`), "2-b 카드는 그 사용자의 번호를 큰 고정폭 글자로 보인다");
    ok(card.includes(`<button type="button" class="secondary memberCodeCopy" id="memberCodeCopy" data-copy="${code}">복사</button>`), "2-c ‘복사’ 단추가 그 번호를 복사한다");
    ok(card.includes(`<p class="muted">${CARD_LINE}</p>`), "2-d 카드 설명: 후원 확인·문의 때 알려 주는 번호이고 로그인에는 쓰이지 않는다");
    ok(view.html.includes('<script id="memberCodeCopyRuntime">') && /navigator\.clipboard\.writeText/.test(view.html) && /window\.prompt\(/.test(view.html), "2-e 복사 스크립트(클립보드, 안 되면 직접 복사 창)");
    const cardAt = view.html.indexOf('aria-labelledby="memberCodeTitle"');
    const loginAt = view.html.indexOf("<h2>로그인 이름·비밀번호</h2>");
    ok(cardAt > 0 && loginAt > cardAt, "2-f 카드는 화면 위쪽(로그인 이름·비밀번호 카드 앞)에 있다");
    ok(!view.html.includes("user-bin"), "2-g 화면 어디에도 사용자 id(user_id)가 없다");
    ok(!/무료|준비 중|곧 /.test(card), "2-h 카드에 ‘무료’·미래 약속 말이 없다");
    await settle();
    eq(dbWrites(log).map((row) => `${row.method} ${row.path}`), [], "2-i 화면 GET 은 DB 에 쓰지 않는다(미리 렌더링돼도 데이터가 바뀌지 않는다)");
    const beacon = view.html.match(/<script id="memberCodeSeenRuntime">([\s\S]*?)<\/script>/)?.[1] || "";
    ok(beacon.includes(`navigator.sendBeacon("${SEEN_PATH}")`) && /d\.prerendering\)\{d\.addEventListener\("prerenderingchange",v,\{once:true\}\)\}else\{v\(\)\}/.test(beacon), "2-j 화면은 실제로 보일 때(미리 렌더링이면 prerenderingchange 때) 신호를 한 번 보낸다");
    ok(view.html.indexOf('<script id="memberCodeSeenRuntime">') > view.html.indexOf('<script id="memberCodeCopyRuntime">'), "2-k 신호 스크립트는 복사 스크립트 뒤(본문 끝)에 있다");

    // 신호: 답은 늘 204, 쓰기는 한 번(ignore-duplicates), 값은 { user_id } 만(본 시각은 남기지 않는다 — 독립 검토 1차 P2).
    const first = await withDb(() => seen(fx));
    await settle();
    ok(first.result.status === 204 && first.result.body === "" && /no-store/.test(first.result.cacheControl), `2-l 신호 답은 몸 없는 204·no-store 다(${first.result.status})`);
    const writes = memberCodeWrites(first.log);
    eq(writes.length, 1, "2-m 신호를 받으면 기억 줄 쓰기는 한 번이다");
    eq(dbWrites(first.log).length, 1, "2-n 신호가 바꾸는 것은 기억 줄 하나뿐이다");
    let body = null;
    try { body = JSON.parse(writes[0]?.body || "null"); } catch (_) { body = null; }
    ok(writes[0]?.prefer === "resolution=ignore-duplicates,return=minimal" && body?.key === `member_code:${code}`, `2-o 쓰기는 on_conflict=key + ignore-duplicates(있는 줄은 그대로), 키 member_code:<번호>: ${show(writes[0]?.prefer)}`);
    const stored = JSON.parse(settingValue(fx, `member_code:${code}`) || "{}");
    ok(stored.user_id === "user-bin" && isDeepStrictEqual(Object.keys(stored), ["user_id"]), `2-p 기억 줄 값은 { user_id } 뿐이다(본 시각 없음): ${show(stored)}`);
    ok(first.log.length <= 2, `2-q 신호 하나의 DB 호출은 세션 확인 + 넣기, 많아야 2번이다(${first.log.length})`);

    const again = await withDb(() => seen(fx));
    await settle();
    ok(again.result.status === 204 && memberCodeWrites(again.log).length === 0 && again.log.length <= 1, `2-r 같은 isolate 에서 같은 번호는 다시 쓰지 않는다(호출 ${again.log.length})`);
    resetMemo();
    putSetting(fx, `member_code:${code}`, JSON.stringify({ user_id: "user-bin", at: "2026-11-01T00:00:00.000Z" }));
    const fresh = await withDb(() => seen(fx));
    await settle();
    ok(memberCodeWrites(fresh.log).length === 1 && JSON.parse(settingValue(fx, `member_code:${code}`)).at === "2026-11-01T00:00:00.000Z", "2-s 새 isolate 에서 다시 써도 있는 줄은 바뀌지 않는다(ignore-duplicates)");

    // 쓰지 않는 신호: 세션 없음·같은 사이트(다른 하위 도메인, 또는 Origin 없음)·직접 연 요청·다른 출처·미리 받기·GET·합쳐진 계정.
    // 셋째 칸 = 답이 204 인지(다른 출처·다른 하위 도메인은 라우터의 같은 출처 검사가 먼저 막고, GET 은 이 경로가 받지 않는다).
    const refusedCases = [
      ["세션 없음", { cookie: "" }, true],
      ["같은 사이트(다른 하위 도메인)", { headers: { "sec-fetch-site": "same-site", origin: "https://tools.malhaebook.com" } }, false],
      ["같은 사이트(Origin 없음)", { headers: { "sec-fetch-site": "same-site", origin: null } }, true],
      ["직접 연 요청(none)", { headers: { "sec-fetch-site": "none", origin: null } }, true],
      ["다른 출처", { headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" } }, false],
      ["미리 받기", { headers: { "sec-purpose": "prefetch;prerender" } }, true],
      ["옛 Purpose", { headers: { purpose: "prefetch" } }, true],
      ["GET", { method: "GET" }, false],
    ];
    const refused = [];
    for (const [label, options] of refusedCases) {
      resetMemo();
      dropSettings(fx, "member_code:");
      const { result, log: rowLog } = await withDb(() => seen(fx, options));
      await settle();
      refused.push([label, dbWrites(rowLog).length, result.status === 204]);
    }
    eq(refused, refusedCases.map(([label, , answered]) => [label, 0, answered]), "2-t 세션 없음·같은 사이트·직접 연 요청·다른 출처·미리 받기·GET 신호는 아무것도 쓰지 않는다");
    resetMemo();
    dropSettings(fx, "member_code:");
    const bin = fx.db.users.find((row) => row.id === "user-bin");
    const savedKey = bin.kakao_user_key;
    bin.kakao_user_key = "merged:user-wifi";
    let merged;
    try { merged = await withDb(() => seen(fx)); } finally { bin.kakao_user_key = savedKey; }
    await settle();
    ok(merged.result.status === 204 && dbWrites(merged.log).length === 0, "2-u 다른 계정으로 합쳐진 계정의 신호는 쓰지 않는다(세션이 무효)");

    // 답 뒤: 쓰기가 끝나지 않아도 신호 답이 먼저 나가고, 그 쓰기는 waitUntil 이 붙든다.
    resetMemo();
    dropSettings(fx, "member_code:");
    let release = () => {};
    const gate = new Promise((resolve) => { release = resolve; });
    const restore = intercept(async ({ url, method, init, forward }) => {
      if (method === "POST" && url.hostname.endsWith("supabase.co") && String(init?.body || "").includes("member_code:")) { await gate; return forward(); }
      return null;
    });
    const jobs = [];
    let response = null;
    try {
      response = await Promise.race([
        app.fetch(new Request(`${BASE}${SEEN_PATH}`, { method: "POST", headers: { cookie: fx.cookie, origin: BASE, "sec-fetch-site": "same-origin" } }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} }),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 3000)),
      ]);
      ok(response !== "timeout" && response.status === 204, "2-v 기억 줄 쓰기가 끝나지 않아도 신호 답은 바로 나간다(답이 쓰기를 기다리지 않는다)");
      ok(jobs.length >= 1 && settingValue(fx, `member_code:${code}`) === undefined, "2-w 그 쓰기는 ctx.waitUntil 에 맡겨져 아직 끝나지 않았다");
    } finally {
      release();
      await Promise.allSettled(jobs);
      restore();
    }
    ok(JSON.parse(settingValue(fx, `member_code:${code}`) || "{}").user_id === "user-bin", "2-x waitUntil 이 끝나면 기억 줄이 있다");

    // 로그인 이름 계정: 자기 번호, 신호도 자기 번호만.
    resetMemo();
    fx.db.accountbook_user_identities.push({ id: "qa-v229121-local", user_id: "user-wifi", provider: "local", provider_subject: "qaid121", login_name: "qaid121", created_at: "2026-07-01T00:00:00Z" });
    const wifiCookie = await fx.cookieFor("user-wifi");
    const local = await page(fx, "/my/backup-login", { cookie: wifiCookie });
    ok(local.status === 200 && cardOf(local.html).includes(`>${codeOf("user-wifi")}</code>`) && !local.html.includes("user-wifi"), "2-y 로그인 이름 계정도 자기 번호를 보고 user_id 는 없다");
    const wifiSeen = await withDb(() => seen(fx, { cookie: wifiCookie }));
    await settle();
    const wifiBody = JSON.parse(memberCodeWrites(wifiSeen.log)[0]?.body || "{}");
    ok(wifiBody.key === `member_code:${codeOf("user-wifi")}` && JSON.parse(wifiBody.value || "{}").user_id === "user-wifi", "2-z 신호는 세션의 사용자 번호만 넣는다(번호와 사용자를 모두 세션에서 정한다)");
    // 독립 검토 1차 P3: 저장 오류(확인 입력 불일치)로 같은 화면을 다시 그려도 맨 위 회원 번호 카드가 있다.
    const mismatch = await post(fx, "/my/backup-login", { login_name: "qaid121", access_code: "qa-pass-121a", access_code_confirm: "qa-pass-121b", return_to: "/my/households" }, { cookie: wifiCookie });
    ok(mismatch.status === 400 && mismatch.text.includes("확인 입력이 일치하지 않습니다.") && cardOf(mismatch.text).includes(`>${codeOf("user-wifi")}</code>`) && !mismatch.text.includes("user-wifi"), `2-z2 저장 오류로 다시 그린 화면에도 회원 번호 카드: ${mismatch.status}`);

    // 번호를 만들지 못하면(계산 실패) 카드도 신호 스크립트도 없고, 신호를 보내도 쓰지 않는다. 세션 서명 같은 다른 HMAC 은 그대로 둔다.
    resetMemo();
    dropSettings(fx, "member_code:");
    const realSign = crypto.subtle.sign;
    crypto.subtle.sign = async function patchedSign(algorithm, key, data) {
      const text = new TextDecoder().decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
      if (text.startsWith("malhaebook:member-code:v1:")) throw new Error("qa: member code unavailable");
      return realSign.call(crypto.subtle, algorithm, key, data);
    };
    let hidden;
    let hiddenSeen;
    try {
      hidden = await withDb(() => page(fx, "/my/backup-login"));
      hiddenSeen = await withDb(() => seen(fx));
    } finally {
      delete crypto.subtle.sign;
    }
    await settle();
    ok(crypto.subtle.sign === realSign, "2-aa (검사 준비) crypto.subtle.sign 을 되돌렸다");
    ok(hidden.result.status === 200 && !hidden.result.html.includes("memberCodeCard") && !hidden.result.html.includes(">회원 번호</h2>") && !hidden.result.html.includes("memberCodeSeenRuntime") && dbWrites(hidden.log).length === 0, "2-bb 번호를 만들지 못하면 카드도 신호 스크립트도 없다(화면은 200)");
    ok(hiddenSeen.result.status === 204 && dbWrites(hiddenSeen.log).length === 0, "2-cc 번호를 만들지 못하면 신호도 쓰지 않는다(204)");
  }));
});

// ── 2b. 단톡방 ‘웹가계부’ 단추로 연 세션(채팅 계정) ─────────────────────────────
await section("2b 채팅 계정", async () => {
  const SKILL_SECRET = "qa-v229121-skill-secret";
  const ROOM = hex66("v229121-room");
  const U1 = hex66("v229121-user-1");
  const INAPP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
  const resetIsolate = () => {
    for (const name of ["__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD"]) globalThis[name]?.clear?.();
    const cache = globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE;
    if (cache) { cache.at = 0; cache.value = null; }
  };
  await withClock(DAY, () => fixture(async (fx) => {
    resetIsolate();
    resetMemo();
    fx.env.KAKAO_SKILL_SECRET = SKILL_SECRET;
    Object.assign(fx.env, { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback` });
    try {
      const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance: "점심 12000원", lang: "ko", user: { id: U1, type: "botUserKey", properties: { botUserKey: U1 } }, chat: { id: ROOM, type: "botGroupKey", properties: { botGroupKey: ROOM } } };
      const skillJobs = [];
      await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SKILL_SECRET }, body: JSON.stringify({ bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }) }), fx.env, { waitUntil(job) { skillJobs.push(job); }, passThroughOnException() {} });
      for (let round = 0; round < 5 && skillJobs.length; round += 1) await Promise.allSettled(skillJobs.splice(0));
      const chatUser = fx.db.users.find((row) => row.kakao_user_key === U1);
      ok(!!chatUser?.id, "2b-a (준비) 단톡방 첫 기록으로 채팅 계정이 생긴다");
      resetIsolate();
      const url = new URL("/my", BASE);
      url.searchParams.set("botUserKey", U1);
      url.searchParams.set("appUserId", "1801267359");
      url.searchParams.set("botGroupKey", ROOM);
      const tapJobs = [];
      const tap = await app.fetch(new Request(url.href, { headers: { "user-agent": INAPP, accept: "text/html", "sec-fetch-mode": "navigate" } }), fx.env, { waitUntil(job) { tapJobs.push(job); }, passThroughOnException() {} });
      await Promise.allSettled(tapJobs);
      const cookies = typeof tap.headers.getSetCookie === "function" ? tap.headers.getSetCookie() : [];
      const jar = cookies.filter((line) => !/Max-Age=0/i.test(line)).map((line) => line.split(";")[0]).join("; ");
      ok(tap.status === 303 && /(?:^|; )ab_user=/.test(jar), `2b-b (준비) ‘웹가계부’ 단추로 그 채팅 계정 세션이 생긴다(${tap.status})`);
      const view = await page(fx, "/my/backup-login", { cookie: jar });
      const card = cardOf(view.html);
      ok(view.status === 200 && card.includes(`>${codeOf(chatUser?.id)}</code>`), `2b-c 채팅 계정 세션도 내 계정·보안에서 자기 번호를 본다(${view.status})`);
      ok(!view.html.includes(chatUser?.id) && !view.html.includes(U1) && !view.html.includes(ROOM), "2b-d 화면에 사용자 id·채팅 키(botUserKey·botGroupKey)가 없다");
    } finally {
      resetIsolate();
    }
  }));
});

// ── 3·4. 관리자 ─────────────────────────────────────────────────────────────
await withClock(DAY, () => fixture(async (fx) => {
  resetMemo();
  fx.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  fx.env.ADMIN_SESSION_SECRET = "qa-v229121-admin-session";
  const login = await post(fx, "/login", { password: ADMIN_PASSWORD, return_to: "/admin/supporters" }, { cookie: "" });
  const admin = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
  ok(admin.length > "ab_admin=".length, "3-0 관리자 로그인 쿠키를 받는다(검사 준비)");
  const flag = (since, until = null) => JSON.stringify({ since, until, note: "QA", public_name: null });

  // ── 3. 회원 번호로 찾아 넣기 ──
  await section("3 관리자 찾기", async () => {
    const form = (who, extra = {}) => ({ by: "member_code", who, since: "", until: "", note: "", public_name: "", ...extra });
    const invalid = await withDb(() => post(fx, "/admin/supporters/save", form("MB-12"), { cookie: admin }));
    ok(invalid.result.location === "/admin/supporters?err=member_code_invalid" && !invalid.log.some((row) => row.decoded.includes("member_code:") || row.decoded === SCAN_PATH), `3-a 꼴이 틀리면 member_code_invalid 이고 찾지 않는다: ${invalid.result.location}`);
    const shown = await page(fx, "/admin/supporters?err=member_code_invalid", { cookie: admin });
    ok(shown.html.includes('<p class="error" role="alert">회원 번호는 MB-XXXX-XXXX 꼴이에요.</p>'), "3-b 오류 문구: ‘회원 번호는 MB-XXXX-XXXX 꼴이에요.’");
    ok(/<select name="by"><option value="member_code">회원 번호\(MB-XXXX-XXXX\)<\/option><option value="user_id">user_id<\/option><option value="login">/.test(shown.html), "3-c 찾는 방법의 첫(기본) 선택이 ‘회원 번호’ 다");

    // 기억 줄이 맞으면 훑지 않는다. 사람이 적은 꼴(소문자·줄표 없음)도 받는다.
    resetMemo();
    putSetting(fx, `member_code:${codeOf("user-wifi")}`, JSON.stringify({ user_id: "user-wifi", at: "2026-11-01T00:00:00.000Z" }));
    const cached = await withDb(() => post(fx, "/admin/supporters/save", form(codeOf("user-wifi").toLowerCase().replace(/-/g, "")), { cookie: admin }));
    await settle();
    ok(cached.result.location === "/admin/supporters?msg=saved" && !!settingValue(fx, "supporter:user-wifi") && scans(cached.log).length === 0 && memberCodeWrites(cached.log).length === 0, `3-d 기억 줄이 맞으면(다시 계산해 확인) 훑지 않고 그 사람에게 켠다: ${cached.result.location}`);

    // 기억 줄이 없으면 훑어 찾고 기억 줄을 남긴다(답 뒤, 없을 때만).
    resetMemo();
    dropSettings(fx, "member_code:");
    const scanned = await withDb(() => post(fx, "/admin/supporters/save", form(codeOf("user-bin")), { cookie: admin }));
    await settle();
    const scanWrites = memberCodeWrites(scanned.log);
    ok(scanned.result.location === "/admin/supporters?msg=saved" && !!settingValue(fx, "supporter:user-bin"), "3-e 기억 줄이 없어도 훑어서 찾아 켠다");
    ok(scans(scanned.log).length === 1 && scanWrites.length === 1 && scanWrites[0].prefer === "resolution=ignore-duplicates,return=minimal" && JSON.parse(settingValue(fx, `member_code:${codeOf("user-bin")}`) || "{}").user_id === "user-bin", `3-f 훑기는 한 번(최근 가입 500명 id 만), 찾으면 기억 줄 하나(ignore-duplicates): ${show(scanned.log.map((row) => row.decoded))}`);

    // 틀린 기억 줄(다른 사람을 가리킴)은 믿지 않는다 → 훑어서 바로잡는다(merge-duplicates).
    resetMemo();
    dropSettings(fx, "supporter:");
    putSetting(fx, `member_code:${codeOf("user-wifi")}`, JSON.stringify({ user_id: "user-bin", at: "2026-11-01T00:00:00.000Z" }));
    const stale = await withDb(() => post(fx, "/admin/supporters/save", form(codeOf("user-wifi")), { cookie: admin }));
    await settle();
    const staleWrites = memberCodeWrites(stale.log);
    ok(stale.result.location === "/admin/supporters?msg=saved" && !!settingValue(fx, "supporter:user-wifi") && !settingValue(fx, "supporter:user-bin"), "3-g 틀린 기억 줄이 가리키는 사람(user-bin)이 아니라 번호의 주인(user-wifi)에게 켠다");
    ok(scans(stale.log).length === 1 && staleWrites.length === 1 && staleWrites[0].prefer === "resolution=merge-duplicates,return=minimal" && JSON.parse(settingValue(fx, `member_code:${codeOf("user-wifi")}`)).user_id === "user-wifi", "3-h 틀린 기억 줄은 훑어서 찾은 주인으로 덮어쓴다(merge-duplicates)");

    // 꾸민 기억 줄 + 아무와도 맞지 않는 번호 → 찾지 못함.
    resetMemo();
    putSetting(fx, "member_code:MB-0000-0000", JSON.stringify({ user_id: "user-ghost" }));
    const ghost = await withDb(() => post(fx, "/admin/supporters/save", form("MB-0000-0000"), { cookie: admin }));
    await settle();
    ok(ghost.result.location === "/admin/supporters?err=user_not_found" && !settingValue(fx, "supporter:user-ghost") && memberCodeWrites(ghost.log).length === 0, `3-i 아무와도 맞지 않는 번호는 user_not_found 이고 아무것도 쓰지 않는다: ${ghost.result.location}`);

    // 비밀값이 없으면(관리자 세션 비밀값은 따로) 번호를 계산할 수 없다고 알린다.
    const secret = fx.env.USER_SESSION_SECRET;
    delete fx.env.USER_SESSION_SECRET;
    let unavailable;
    try { unavailable = await post(fx, "/admin/supporters/save", form(codeOf("user-bin")), { cookie: admin }); } finally { fx.env.USER_SESSION_SECRET = secret; }
    ok(unavailable.location === "/admin/supporters?err=member_code_unavailable", `3-j 번호를 계산할 수 없으면 member_code_unavailable: ${unavailable.location}`);
    // 독립 검토 4차 P3: 훑기 읽기가 실패하면 user_not_found(‘…다시 확인해 주세요’)가 아니라 다시 시도 안내다 — 운영자가 후원자에게 번호가 틀렸다고
    // 답하지 않게. 기억 줄이 없는 사람(이 검사만 쓰는 user-scan-121)의 번호로 본다.
    resetMemo();
    fx.db.users.push({ id: "user-scan-121", kakao_user_key: "kakao_login:9121", nickname: "훑기 실패 확인", created_at: "2026-10-02T00:00:00Z" });
    const failingScan = intercept(({ url, method }) => (method === "GET" && decodeURIComponent(`${url.pathname}${url.search}`) === SCAN_PATH ? new Response(JSON.stringify({ message: "QA" }), { status: 503 }) : null));
    let scanBroken;
    try { scanBroken = await withDb(() => post(fx, "/admin/supporters/save", form(codeOf("user-scan-121")), { cookie: admin })); } finally { failingScan(); }
    await settle();
    ok(scanBroken.result.location === "/admin/supporters?err=member_code_lookup_failed" && memberCodeWrites(scanBroken.log).length === 0 && scans(scanBroken.log).length >= 1 && !settingValue(fx, "supporter:user-scan-121"),
      `3-j2 훑기 읽기가 실패하면 user_not_found 가 아니라 member_code_lookup_failed(다시 시도 안내)이고 아무것도 쓰지 않는다: ${scanBroken.result.location}`);
    const lookupFailedShown = await page(fx, "/admin/supporters?err=member_code_lookup_failed", { cookie: admin });
    ok(lookupFailedShown.html.includes('<p class="error" role="alert">회원 번호로 찾다가 사용자 목록을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.</p>'), "3-j3 오류 문구: ‘회원 번호로 찾다가 사용자 목록을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.’");
    const scanAgain = await post(fx, "/admin/supporters/save", form(codeOf("user-scan-121")), { cookie: admin });
    ok(scanAgain.location === "/admin/supporters?msg=saved" && !!settingValue(fx, "supporter:user-scan-121"), "3-j4 훑기가 다시 되면 같은 번호로 켜진다(번호는 맞았다)");
    dropSettings(fx, "supporter:user-scan-121");
    dropSettings(fx, `member_code:${codeOf("user-scan-121")}`);
    fx.db.users = fx.db.users.filter((row) => row.id !== "user-scan-121");

    // 합쳐진 계정에는 새로 켜지 않는다(이미 있는 줄 고치기는 그대로).
    resetMemo();
    fx.db.users.push({ id: "user-merged-121", kakao_user_key: "merged:user-wifi:v229121", nickname: "옛 계정 (통합됨)", created_at: "2026-10-01T00:00:00Z" });
    const mergedByCode = await post(fx, "/admin/supporters/save", form(codeOf("user-merged-121")), { cookie: admin });
    const mergedById = await post(fx, "/admin/supporters/save", { user_id: "user-merged-121", since: "", until: "", note: "", public_name: "" }, { cookie: admin });
    ok(mergedByCode.location === "/admin/supporters?err=user_merged" && mergedById.location === "/admin/supporters?err=user_merged" && !settingValue(fx, "supporter:user-merged-121"), `3-k 합쳐진 계정은 번호로도 user_id 로도 새로 켜지 않는다(user_merged): ${mergedByCode.location} · ${mergedById.location}`);
    putSetting(fx, "supporter:user-merged-121", flag("2026-10-01"));
    const mergedEdit = await post(fx, "/admin/supporters/save", { user_id: "user-merged-121", since: "", until: "2026-12-31", note: "", public_name: "" }, { cookie: admin });
    ok(mergedEdit.location === "/admin/supporters?msg=saved" && JSON.parse(settingValue(fx, "supporter:user-merged-121")).until === "2026-12-31", "3-l 합쳐진 계정에 이미 있는 줄은 고칠 수 있다(끝나는 날 정하기)");
    const mergedShown = await page(fx, "/admin/supporters?err=user_merged", { cookie: admin });
    ok(mergedShown.html.includes("다른 계정으로 합쳐진 계정이라 새로 켤 수 없어요."), "3-m 오류 문구: 합쳐진 계정");
    dropSettings(fx, "supporter:");
    fx.db.users = fx.db.users.filter((row) => row.id !== "user-merged-121");
  });

  // ── 4. 전체 사용자 목록 ──
  await section("4 전체 사용자 목록", async () => {
    resetMemo();
    dropSettings(fx, "member_code:");
    dropSettings(fx, "supporter:");
    const A = "a1b2c3d4-0000-4000-8000-00000000000a"; // 카카오 로그인(강한 식별)
    const B = "b7e8f9a0-0000-4000-8000-00000000000b"; // 로그인 이름(강한 식별)
    const C = "c0ffee00-0000-4000-8000-00000000000c"; // 둘 다
    const D = "d00dfeed-0000-4000-8000-00000000000d"; // 채팅 전용
    const E = "e1e2e3e4-0000-4000-8000-00000000000e"; // 합쳐진 계정
    const F = "f5f6f7f8-0000-4000-8000-00000000000f"; // 이름에 <script>
    const G = "9a9b9c9d-0000-4000-8000-000000000009"; // 옛 웹 로그인 별칭만(kakao_login:)
    fx.db.users.push(
      { id: A, kakao_user_key: "kakao_login:9001", nickname: "카카오 사용자", created_at: "2026-11-10T16:30:00Z" },
      { id: B, kakao_user_key: "local_web:qa-b", nickname: "로그인 사용자", created_at: "2026-11-09T01:00:00Z" },
      { id: C, kakao_user_key: "kakao_login:9003", nickname: "둘다 사용자", created_at: "2026-11-08T01:00:00Z" },
      { id: D, kakao_user_key: hex66("v229121-chat-d"), nickname: "채팅 사용자", created_at: "2026-11-07T01:00:00Z" },
      { id: E, kakao_user_key: "merged:c0ffee00", nickname: "옛 채팅 (통합됨)", created_at: "2026-11-06T01:00:00Z" },
      { id: F, kakao_user_key: hex66("v229121-chat-f"), nickname: "<script>alert(1)</script>", created_at: "2026-11-05T01:00:00Z" },
      { id: G, kakao_user_key: "kakao_login:9007", nickname: "옛 웹 사용자", created_at: "2026-11-04T01:00:00Z" },
    );
    fx.db.accountbook_user_identities.push(
      { id: "qa121-a", user_id: A, provider: "kakao", provider_subject: "9001", created_at: "2026-11-10T16:30:00Z" },
      { id: "qa121-b", user_id: B, provider: "local", provider_subject: "qa-b", created_at: "2026-11-09T01:00:00Z" },
      { id: "qa121-c1", user_id: C, provider: "kakao", provider_subject: "9003", created_at: "2026-11-08T01:00:00Z" },
      { id: "qa121-c2", user_id: C, provider: "local", provider_subject: "qa-c", created_at: "2026-11-08T01:00:00Z" },
    );
    putSetting(fx, "supporter:user-bin", flag("2026-11-01"));
    putSetting(fx, "supporter:user-wifi", flag("2026-10-01", "2026-11-01"));
    putSetting(fx, `supporter:${A}`, flag("2026-12-01"));

    const rowsOf = (html) => {
      const at = html.indexOf('id="users"');
      const sectionHtml = at < 0 ? "" : html.slice(at, html.indexOf("</section>", at));
      const tbody = sectionHtml.slice(sectionHtml.indexOf("<tbody>") + 7, sectionHtml.indexOf("</tbody>"));
      return [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((match) => {
        const cells = [...match[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]);
        return { raw: match[1], cells, text: cells.map((cell) => cell.replace(/<[^>]+>/g, "").trim()) };
      });
    };
    const rowFor = (rows, id) => rows.find((row) => row.cells[0]?.includes(codeOf(id)));
    const { result: all, log: allLog } = await withDb(() => page(fx, "/admin/supporters", { cookie: admin }));
    const rows = rowsOf(all.html);
    ok(all.status === 200 && all.html.includes("<h2>전체 사용자 목록</h2>") && rows.length === 9, `4-a 관리자 화면에 ‘전체 사용자 목록’ 칸과 모든 사용자 줄(9명): ${rows.length}`);
    eq(rows.map((row) => row.text[0]), [A, B, C, D, E, F, G, "user-bin", "user-wifi"].map(codeOf).slice(0, 7).concat(rows.slice(7).map((row) => row.text[0])), "4-b 최근 가입 순(가입일 내림차순)이다");
    ok([codeOf("user-bin"), codeOf("user-wifi")].every((code) => rows.slice(7).some((row) => row.text[0] === code)), "4-c 같은 날 가입한 두 사람도 목록에 있다");
    eq(rowFor(rows, A)?.text.slice(1, 6), ["카카오 사용자", "카카오 로그인", "2026-11-11", A.slice(0, 8), "시작 전"], "4-d 줄 칸: 표시 이름·계정 유형(카카오 로그인)·가입일(KST: 11-10 16:30 UTC → 11-11)·user_id 앞 8자·후원 상태(시작 전)");
    eq(rowFor(rows, B)?.text.slice(2, 3), ["로그인 이름"], "4-e 계정 유형: 로그인 이름(강한 식별 local)");
    eq(rowFor(rows, C)?.text.slice(2, 3), ["카카오 로그인 · 로그인 이름"], "4-f 계정 유형: 둘 다면 둘 다");
    eq(rowFor(rows, D)?.text.slice(2, 3), ["채팅 전용"], "4-g 계정 유형: 강한 식별도 웹 로그인 별칭도 없으면 채팅 전용");
    eq(rowFor(rows, G)?.text.slice(2, 3), ["카카오 로그인"], "4-h 계정 유형: 강한 식별이 없어도 옛 웹 로그인 별칭(kakao_login:)이면 카카오 로그인");
    eq([rowFor(rows, "user-bin")?.text[5], rowFor(rows, "user-wifi")?.text[5], rowFor(rows, D)?.text[5]], ["켜짐", "끝남", "없음"], "4-i 후원 상태: 켜짐·끝남·없음");
    ok(rowFor(rows, D)?.raw.includes(`<a href="/admin/supporters?add=${D}#edit">후원자 추가</a>`) && rowFor(rows, "user-bin")?.raw.includes('<a href="/admin/supporters?user_id=user-bin#edit">고치기</a>'), "4-j 후원자 아닌 사람은 ‘후원자 추가’, 이미 줄이 있으면 ‘고치기’ 링크");
    const merged = rowFor(rows, E);
    ok(merged?.raw.includes('<span class="state merged">통합됨</span>') && !merged.raw.includes("후원자 추가") && !merged.raw.includes("add="), "4-k 합쳐진 계정은 ‘통합됨’ 표시만, 추가 링크가 없다");
    ok(all.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && !all.html.includes("<script>alert(1)</script>"), "4-l 표시 이름은 이스케이프한다(<script> 그대로 나가지 않음)");
    ok(allLog.length <= 5 && allLog.filter((row) => row.decoded.startsWith("/rest/v1/users")).length <= 2 && !allLog.some((row) => row.decoded.startsWith("/rest/v1/accountbook_user_identities")), `4-m 화면 한 번 DB 호출 5번 이하, 사용자 줄은 많아야 두 번(로그인 수단은 같은 호출에 포함): ${show(allLog.map((row) => row.decoded))}`);

    // 이름·번호·id 앞자리 찾기.
    const view = async (query) => withDb(() => page(fx, `/admin/supporters?q=${encodeURIComponent(query)}`, { cookie: admin }));
    const byName = await view("wifi");
    eq(rowsOf(byName.result.html).map((row) => row.text[1]), ["WIFI♥"], "4-n 표시 이름 일부(대소문자 무시)로 찾는다");
    const byScript = await view("<script>");
    ok(rowsOf(byScript.result.html).length === 1 && byScript.result.html.includes('value="&lt;script&gt;"'), "4-o 찾는 말도 이스케이프해 다시 보인다");
    const odd = await view('Bin, (x)"\\*%_');
    ok(odd.result.status === 200 && !odd.result.html.includes("사용자 목록을 불러오지 못했어요") && rowsOf(odd.result.html).some((row) => row.raw.includes("찾는 사용자가 없어요.")), "4-p 쉼표·괄호·따옴표·와일드카드가 든 말도 논리식을 깨지 않는다(0명)");
    for (const [label, query] of [["그대로", codeOf(A)], ["소문자·줄표 없음", codeOf(A).toLowerCase().replace(/-/g, "")], ["MB 없이 XXXX-XXXX", codeOf(A).slice(3)]]) {
      const found = await view(query);
      const list = rowsOf(found.result.html);
      ok(list.length === 1 && list[0].text[0] === codeOf(A) && list[0].text[1] === "카카오 사용자", `4-q 회원 번호(${label})로 그 한 명을 찾는다`);
      ok(found.log.length <= 5 && !found.log.some((row) => row.method !== "GET"), `4-r 번호 찾기 화면도 DB 호출 5번 이하이고 아무것도 쓰지 않는다(${label}): ${show(found.log.map((row) => row.decoded))}`);
    }
    // 독립 검토 1차 P3: 머리(MB) 없이 공백으로 나눈 네 글자 둘은 이름이다(번호로 읽지 않는다).
    fx.db.users.push({ id: "c1d2e3f4-0000-4000-8000-0000000000a1", kakao_user_key: "kakao_login:9011", nickname: "Kate Moss", created_at: "2026-11-03T01:00:00Z" });
    const kate = await view("Kate Moss");
    ok(rowsOf(kate.result.html).some((row) => row.text[1] === "Kate Moss") && !kate.result.html.includes("회원 번호 MB-") && !kate.result.html.includes("회원 번호는 MB-XXXX-XXXX 꼴이에요.") && scans(kate.log).length === 0, "4-q2 ‘Kate Moss’ 처럼 네 글자 이름 둘은 이름으로 찾는다");
    const dashed = await view(codeOf(A).slice(3).replace("-", "–"));
    ok(rowsOf(dashed.result.html).length === 1 && rowsOf(dashed.result.html)[0].text[0] === codeOf(A), "4-q3 머리 없는 꼴도 줄표 계열(–)이면 번호로 찾는다");
    const missing = await view("MB-0000-0000");
    ok(missing.result.html.includes("회원 번호 MB-0000-0000 와 맞는 사용자가 없어요.") && missing.log.length <= 5 && scans(missing.log).length === 1, `4-s 맞는 사람이 없는 정식 꼴 번호는 안내 한 줄(훑기 한 번, DB 호출 5번 이하 — 관리자 세션 확인 1·후원자 줄 1·기억 줄 1·훑기 1·후원자 이름 1): ${show(missing.log.map((row) => row.decoded))}`);
    // 독립 검토 4차 P3: 정식 꼴(MB-XXXX-XXXX)로 적은 번호는 맞는 사람이 없어도 표시 이름으로 찾지 않는다 — 표시 이름을 번호처럼 지은 다른 사람이
    // 번호 찾기 결과에 끼지 않게(3차 반영의 ‘이름으로도 찾기’ 는 번호 꼴로 읽히는 이름에만).
    const nameSearch = (log) => log.find((row) => row.url.pathname === "/rest/v1/users" && row.url.searchParams.get("order") && row.url.searchParams.get("or"));
    ok(!nameSearch(missing.log) && missing.result.html.includes("회원 번호 MB-0000-0000 와 맞는 사용자가 없어요. 번호를 다시 확인해 주세요.") && !missing.result.html.includes("표시 이름으로도")
      && rowsOf(missing.result.html).some((row) => row.raw.includes("찾는 사용자가 없어요.")) && !missing.log.some((row) => row.method !== "GET"),
      `4-s2 정식 꼴 번호는 맞는 사람이 없어도 표시 이름으로 찾지 않는다(아무것도 쓰지 않음): ${show(missing.log.map((row) => row.decoded))}`);
    fx.db.users.push({ id: "c1d2e3f4-0000-4000-8000-0000000000a5", kakao_user_key: "kakao_login:9015", nickname: "MB-ABCD-1234", created_at: "2026-11-03T05:00:00Z" });
    const lookalike = await view("MB-ABCD-1234");
    ok(!rowsOf(lookalike.result.html).some((row) => row.text[1] === "MB-ABCD-1234") && !nameSearch(lookalike.log) && lookalike.result.html.includes("회원 번호 MB-ABCD-1234 와 맞는 사용자가 없어요. 번호를 다시 확인해 주세요."),
      "4-s3 표시 이름을 번호처럼 지은 사람(‘MB-ABCD-1234’)은 그 번호를 찾아도 결과에 끼지 않는다");
    // 독립 검토 2차 P3: 번호 꼴인데 번호로 읽히지 않으면(틀린 글자 U, ‘MB’ 로 시작하는 10글자 이름) 안내 한 줄과 함께 표시 이름으로 찾는다.
    const NOT_CODE_NOTE = '<p class="warn" role="status">회원 번호로 읽히지 않아 표시 이름으로 찾았어요. 회원 번호는 MB-XXXX-XXXX 꼴이에요.</p>';
    const badCode = await view("MB-ABCD-EFGU");
    const badCodeList = badCode.log.find((row) => row.url.pathname === "/rest/v1/users" && row.url.searchParams.get("order"));
    ok(badCode.result.html.includes(NOT_CODE_NOTE) && !badCode.result.html.includes('role="alert"') && scans(badCode.log).length === 0 && badCodeList?.url.searchParams.get("or") === '(nickname.ilike."%MB-ABCD-EFGU%")', `4-t 번호 꼴인데 틀린 글자(U)면 안내 한 줄과 함께 표시 이름으로 찾는다(훑지 않음): ${show(badCode.log.map((row) => row.decoded))}`);
    fx.db.users.push({ id: "c1d2e3f4-0000-4000-8000-0000000000a2", kakao_user_key: "kakao_login:9012", nickname: "MBTI ENFP 좋아", created_at: "2026-11-03T02:00:00Z" });
    const mbName = await view("MBTI ENFP 좋아");
    ok(rowsOf(mbName.result.html).some((row) => row.text[1] === "MBTI ENFP 좋아") && mbName.result.html.includes(NOT_CODE_NOTE) && scans(mbName.log).length === 0, "4-t2 ‘MB’ 로 시작하는 10글자 이름(‘MBTI ENFP 좋아’)도 그 이름으로 찾는다");
    // 독립 검토 3차 P3: 크록퍼드 글자로만 된 이름은 번호로 읽힌다(‘Kate-Moss’ → MB-KATE-M0SS, ‘MBTI INFJ01’ → MB-T11N-FJ01). 번호로 맞는 사람이
    // 없으면 같은 말을 표시 이름으로도 찾아 그 사람을 보여 준다(훑기 한 번, DB 호출 6번 이하, 아무것도 쓰지 않음).
    fx.db.users.push({ id: "c1d2e3f4-0000-4000-8000-0000000000a3", kakao_user_key: "kakao_login:9013", nickname: "Kate-Moss", created_at: "2026-11-03T03:00:00Z" });
    fx.db.users.push({ id: "c1d2e3f4-0000-4000-8000-0000000000a4", kakao_user_key: "kakao_login:9014", nickname: "MBTI INFJ01", created_at: "2026-11-03T04:00:00Z" });
    for (const [name, code, id] of [["Kate-Moss", "MB-KATE-M0SS", "c1d2e3f4-0000-4000-8000-0000000000a3"], ["MBTI INFJ01", "MB-T11N-FJ01", "c1d2e3f4-0000-4000-8000-0000000000a4"]]) {
      const named = await view(name);
      const list = rowsOf(named.result.html);
      ok(named.result.html.includes(`회원 번호 ${code} 와 맞는 사용자가 없어요. 같은 말을 표시 이름으로도 찾았어요`) && list.length === 1 && list[0].text[1] === name && list[0].text[0] === codeOf(id)
        && !named.result.html.includes("회원 번호로 읽히지 않아") && scans(named.log).length === 1 && named.log.length <= 6 && !named.log.some((row) => row.method !== "GET"),
        `4-t3 번호로 읽히는 이름(‘${name}’ → ${code})은 번호로 맞는 사람이 없으면 표시 이름으로도 찾는다: ${show(list.map((row) => row.text[1]))} · ${show(named.log.map((row) => row.decoded))}`);
    }
    const failingName = intercept(({ url }) => (url.pathname === "/rest/v1/users" && url.searchParams.get("or") === '(nickname.ilike."%Kate-Moss%")' ? new Response(JSON.stringify({ message: "QA" }), { status: 503 }) : null));
    let brokenName;
    try { brokenName = await view("Kate-Moss"); } finally { failingName(); }
    ok(brokenName.result.status === 200 && brokenName.result.html.includes("사용자 목록을 불러오지 못했어요.") && !rowsOf(brokenName.result.html).some((row) => row.text[1] === "Kate-Moss")
      && brokenName.result.html.includes("같은 말을 표시 이름으로도 찾으려 했지만 목록을 읽지 못했어요.") && !brokenName.result.html.includes("같은 말을 표시 이름으로도 찾았어요"),
      "4-t4 이름으로도 찾는 읽기가 실패하면 안내 줄과 목록 칸이 둘 다 ‘읽지 못했어요’ 다(화면은 200, 독립 검토 4차 P3)");
    // 독립 검토 4차 P3: 비밀값이 없으면(번호 찾기를 쓸 수 없음) 번호 꼴로 읽히는 이름도 그 오류 안내만 하고 이름으로 찾지 않는다(호출 고정).
    const keptSecret = fx.env.USER_SESSION_SECRET;
    delete fx.env.USER_SESSION_SECRET;
    let noSecret;
    try { noSecret = await view("Kate-Moss"); } finally { fx.env.USER_SESSION_SECRET = keptSecret; }
    ok(noSecret.result.status === 200 && noSecret.result.html.includes('<p class="error" role="alert">회원 번호를 계산할 수 없어요. 운영 설정을 확인해 주세요.</p>') && !nameSearch(noSecret.log) && scans(noSecret.log).length === 0 && noSecret.log.length <= 4,
      `4-t5 비밀값이 없으면 번호 꼴 이름도 계산할 수 없다는 안내만(이름 찾기·훑기 없음): ${show(noSecret.log.map((row) => row.decoded))}`);
    // 독립 검토 4차 P3: 훑기 읽기가 실패하면 ‘맞는 사용자가 없어요’ 가 아니라 다시 시도 안내다(번호 꼴로 읽히는 말이어도 이름으로 찾지 않음).
    const failingScanView = intercept(({ url, method }) => (method === "GET" && decodeURIComponent(`${url.pathname}${url.search}`) === SCAN_PATH ? new Response(JSON.stringify({ message: "QA" }), { status: 503 }) : null));
    let scanBrokenView;
    try { scanBrokenView = await view(codeOf(D).toLowerCase().replace(/-/g, "")); } finally { failingScanView(); }
    ok(scanBrokenView.result.status === 200 && scanBrokenView.result.html.includes('<p class="error" role="alert">회원 번호로 찾다가 사용자 목록을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.</p>')
      && !scanBrokenView.result.html.includes("와 맞는 사용자가 없어요") && scanBrokenView.result.html.includes("사용자 목록을 불러오지 못했어요.") && !nameSearch(scanBrokenView.log) && scans(scanBrokenView.log).length >= 1,
      `4-t6 훑기 읽기가 실패하면 ‘맞는 사용자가 없어요’ 가 아니라 다시 시도 안내이고 이름으로도 찾지 않는다: ${show(scanBrokenView.log.map((row) => row.decoded))}`);
    putSetting(fx, `member_code:${codeOf(B)}`, JSON.stringify({ user_id: B }));
    const cachedView = await view(codeOf(B));
    ok(rowsOf(cachedView.result.html).length === 1 && scans(cachedView.log).length === 0 && cachedView.log.length <= 5, "4-u 기억 줄이 있으면 번호 찾기 화면도 훑지 않는다");
    const byPrefix = await view("a1b2c3");
    eq(rowsOf(byPrefix.result.html).map((row) => row.text[0]), [codeOf(A)], "4-v user_id 앞자리(16진수 4자 이상)로 찾는다(uuid 범위)");
    const byPrefixDash = await view("a1b2c3d4-0000");
    eq(rowsOf(byPrefixDash.result.html).map((row) => row.text[0]), [codeOf(A)], "4-w 줄표가 든 앞자리도 받는다");
    const orFilter = byPrefix.log.find((row) => row.url.pathname === "/rest/v1/users" && row.url.searchParams.get("or"));
    eq(orFilter?.url.searchParams.get("or"), '(nickname.ilike."%a1b2c3%",and(id.gte.a1b2c300-0000-0000-0000-000000000000,id.lte.a1b2c3ff-ffff-ffff-ffff-ffffffffffff))', "4-x 찾기 논리식: 이름 부분 일치(SQL % — PostgREST * 별칭을 따옴표 안에서 믿지 않는다) + id 범위");

    // 쪽 넘기기(50명씩).
    for (let index = 0; index < 60; index += 1) fx.db.users.push({ id: uuidOf(`v229121-page-${index}`), kakao_user_key: hex66(`v229121-page-${index}`), nickname: `쪽 사용자 ${String(index).padStart(2, "0")}`, created_at: `2026-11-12T00:${String(index).padStart(2, "0")}:00Z` });
    const first = await view("쪽 사용자");
    const firstRows = rowsOf(first.result.html);
    ok(firstRows.length === 50 && firstRows[0].text[1] === "쪽 사용자 59" && first.result.html.includes('<a href="/admin/supporters?q=%EC%AA%BD+%EC%82%AC%EC%9A%A9%EC%9E%90&amp;page=2#users">다음 50명</a>') && !first.result.html.includes("이전 50명"), "4-y 첫 쪽은 50명(최근 순)과 ‘다음 50명’(찾는 말 유지)");
    ok(first.log.length <= 5 && first.log.filter((row) => row.decoded.startsWith("/rest/v1/users")).length <= 2, `4-z 50명 쪽도 DB 호출 5번 이하(줄마다 읽지 않음): ${first.log.length}`);
    const second = await withDb(() => page(fx, `/admin/supporters?q=${encodeURIComponent("쪽 사용자")}&page=2`, { cookie: admin }));
    const secondRows = rowsOf(second.result.html);
    ok(secondRows.length === 10 && secondRows[0].text[1] === "쪽 사용자 09" && second.result.html.includes(">이전 50명</a>") && !second.result.html.includes("다음 50명") && second.result.html.includes("51–60번째"), "4-aa 둘째 쪽은 나머지 10명과 ‘이전 50명’");
    // 독립 검토 2차 P3: 마지막 쪽 뒤의 빈 쪽은 ‘찾는 사용자가 없어요’ 가 아니라 ‘이 쪽에는 사용자가 없어요’ 와 첫 쪽 링크(이전 50명도 그대로).
    const past = await withDb(() => page(fx, `/admin/supporters?q=${encodeURIComponent("쪽 사용자")}&page=3`, { cookie: admin }));
    ok(rowsOf(past.result.html).every((row) => !row.cells.length) && past.result.html.includes('<tr><td colspan="7">이 쪽에는 사용자가 없어요. <a href="/admin/supporters?q=%EC%AA%BD+%EC%82%AC%EC%9A%A9%EC%9E%90#users">첫 쪽으로</a></td></tr>') && !past.result.html.includes("찾는 사용자가 없어요.") && past.result.html.includes(">이전 50명</a>"), "4-aa2 마지막 쪽 뒤의 빈 쪽은 ‘이 쪽에는 사용자가 없어요’ 와 첫 쪽 링크");
    const nobody = await view("없는 이름 v229121");
    ok(nobody.result.html.includes('<tr><td colspan="7">찾는 사용자가 없어요.</td></tr>') && !nobody.result.html.includes("첫 쪽으로"), "4-aa3 첫 쪽에서 아무도 없으면 예전처럼 ‘찾는 사용자가 없어요’");
    const allPage2 = await withDb(() => page(fx, "/admin/supporters?page=2", { cookie: admin }));
    ok(allPage2.log.length <= 5, `4-ab 후원자가 그 쪽에 없어도(이름을 따로 읽음) DB 호출 5번 이하: ${allPage2.log.length}`);
    ok(allPage2.result.html.includes("<td>Bin</td>") || allPage2.result.html.includes(">Bin<"), "4-ac 그 쪽에 없는 후원자의 표시 이름도 후원자 목록에 보인다");

    // 추가 링크 → 폼 → 저장(예전 user_id 길).
    const addView = await withDb(() => page(fx, `/admin/supporters?add=${D}`, { cookie: admin }));
    ok(addView.result.html.includes("<h2>후원자 표시 추가</h2>") && addView.result.html.includes(`<input type="hidden" name="user_id" value="${D}"/>`) && addView.result.html.includes(`추가할 사용자: 회원 번호 <code>${codeOf(D)}</code> · 채팅 사용자`) && !addView.result.html.includes('<select name="by">'), "4-ad ‘후원자 추가’ 는 그 사람(번호·이름)으로 채운 폼을 연다(숨은 user_id)");
    ok(addView.log.length <= 5, `4-ae 추가 폼 화면도 DB 호출 5번 이하: ${addView.log.length}`);
    const addSave = await post(fx, "/admin/supporters/save", { user_id: D, since: "", until: "", note: "추가 링크", public_name: "" }, { cookie: admin });
    ok(addSave.location === "/admin/supporters?msg=saved" && JSON.parse(settingValue(fx, `supporter:${D}`) || "{}").since === DAY, "4-af 그 폼으로 저장하면 그 사람에게 켜진다(시작일 오늘)");
    const addBad = await post(fx, "/admin/supporters/save", { user_id: B, since: "", until: "2026-13-01", note: "", public_name: "" }, { cookie: admin });
    ok(addBad.location === `/admin/supporters?err=until_invalid&add=${B}`, `4-ag 추가 폼에서 날짜가 틀리면 같은 추가 폼으로 돌아간다: ${addBad.location}`);
    const addExisting = await page(fx, "/admin/supporters?add=user-bin", { cookie: admin });
    ok(addExisting.html.includes("<h2>후원자 표시 고치기</h2>") && addExisting.html.includes('<input type="hidden" name="user_id" value="user-bin"/>') && addExisting.html.includes(`회원 번호 <code>${codeOf("user-bin")}</code>`), "4-ah 이미 후원자면 추가 링크도 고치기 폼(번호 보임)으로 연다");
    const addMerged = await page(fx, `/admin/supporters?add=${E}`, { cookie: admin });
    ok(!addMerged.html.includes(`name="user_id" value="${E}"`) && addMerged.html.includes("다른 계정으로 합쳐진 계정이라 새로 켤 수 없어요."), "4-ai 합쳐진 계정 추가 링크는 폼을 채우지 않고 안내한다");
    const addNobody = await page(fx, "/admin/supporters?add=user-nobody-121", { cookie: admin });
    ok(addNobody.html.includes("추가할 사용자를 찾지 못했어요.") && addNobody.html.includes('<select name="by">'), "4-aj 없는 사용자 추가 링크는 찾기 폼과 안내");
    const addJunk = await page(fx, `/admin/supporters?add=${encodeURIComponent('"><script>x</script>')}`, { cookie: admin });
    ok(addJunk.status === 200 && !addJunk.html.includes("<script>x</script>") && addJunk.html.includes('<select name="by">'), "4-ak id 모양이 아닌 add 값은 무시한다");

    // 관리자만.
    const anon = await page(fx, "/admin/supporters?q=wifi", { cookie: "" });
    const userOnly = await page(fx, "/admin/supporters?q=wifi");
    ok(anon.status === 303 && anon.location.includes("/admin-view") && userOnly.status === 303 && userOnly.location.includes("/admin-view") && !anon.html.includes("전체 사용자 목록") && !userOnly.html.includes("전체 사용자 목록"), "4-al 관리자 세션이 없으면(사용자 세션 포함) 목록 없이 관리자 비밀번호 화면으로");
    const failing = intercept(({ url }) => (url.pathname === "/rest/v1/users" && url.searchParams.get("order") === "created_at.desc,id.desc" && url.searchParams.get("offset") ? new Response(JSON.stringify({ message: "QA" }), { status: 503 }) : null));
    let broken;
    try { broken = await page(fx, "/admin/supporters", { cookie: admin }); } finally { failing(); }
    ok(broken.status === 200 && broken.html.includes("사용자 목록을 불러오지 못했어요.") && broken.html.includes("<h2>후원자 목록</h2>"), "4-am 목록을 읽지 못하면 그 칸만 안내하고 화면은 200");
  });
}));

// ── 5. /support 문구 ─────────────────────────────────────────────────────────
await section("5 /support", async () => {
  const sectionsOf = (html) => [...html.matchAll(/<section class="pubSection" id="section-(\d+)"><h2>([^<]*)<\/h2>([\s\S]*?)<\/section>/g)].map((m) => ({ title: m[2], body: m[3], paragraphs: [...m[3].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((p) => p[1]) }));
  const OPEN_CHAT_LINE = "후원자 표시를 켜 드리려면 어느 계정인지 알아야 해요. 웹 가계부 ‘전체 메뉴 → 내 계정·보안’ 에 있는 회원 번호(MB- 로 시작)를 함께 알려 주세요.";
  await withClock(DAY, () => fixture(async (fx) => {
    for (const key of ["SUPPORT_KAKAOPAY_URL", "SUPPORT_BANK_ACCOUNT", "SUPPORT_TOSS_URL", "COMMUNITY_OPENCHAT_URL", "SUPPORTER_OPENCHAT_URL"]) delete fx.env[key];
    const none = await page(fx, "/support", { cookie: "" });
    const noneAsk = sectionsOf(none.html).find((s) => s.title === "문의");
    ok(none.status === 200 && !none.html.includes("로그인 이름") && noneAsk?.paragraphs[0]?.includes("보낸 분 이름·보낸 날짜·회원 번호를 함께 적어 주시면 빨리 확인할 수 있어요."), "5-a 문의 절은 로그인 이름 대신 회원 번호를 함께 적어 달라고 한다");

    fx.env.COMMUNITY_OPENCHAT_URL = "https://open.kakao.com/o/qaV229121";
    const chat = await page(fx, "/support", { cookie: "" });
    const way = sectionsOf(chat.html).find((s) => s.title === "후원하는 방법");
    eq(way?.paragraphs.length, 3, "5-b 오픈채팅 길: 안내 문단 셋");
    eq(way?.paragraphs[1], OPEN_CHAT_LINE, "5-c 오픈채팅 길: 첫 문단 다음에 회원 번호를 함께 알려 달라는 문단");
    ok(!chat.html.includes("로그인 이름"), "5-d 오픈채팅 길 화면에 ‘로그인 이름’ 이 없다");

    fx.env.SUPPORT_KAKAOPAY_URL = "https://qr.kakaopay.com/qa-v229121";
    const pay = await page(fx, "/support", { cookie: "" });
    const payWay = sectionsOf(pay.html).find((s) => s.title === "후원하는 방법");
    ok(payWay?.paragraphs[0]?.includes("보낸 분 이름·보낸 날짜·회원 번호(웹 가계부 ‘전체 메뉴 → 내 계정·보안’)를 admin@malhaebook.com 로 알려 주시면 확인하고 후원자 표시를 켜 드려요."), `5-e 송금 길: 회원 번호(어디서 보는지)를 알려 달라고 한다: ${show(payWay?.paragraphs[0])}`);
    ok(!pay.html.includes("로그인 이름") && !/무료/.test(pay.html), "5-f 송금 길 화면에 ‘로그인 이름’·‘무료’ 가 없다");

    const menu = await page(fx, "/menu?household_id=house-home&month=2026-11");
    ok(menu.status === 200 && /<a data-key="backup-login" href="\/my\/backup-login[^"]*">[\s\S]{0,120}<span>내 계정·보안<\/span><\/a>/.test(menu.html), "5-g 안내가 가리키는 메뉴 이름 ‘전체 메뉴 → 내 계정·보안’ 이 실제로 /my/backup-login 으로 간다");
  }));
});

// ── 6. 개인정보처리방침 ─────────────────────────────────────────────────────
await section("6 /privacy", async () => {
  await withClock(DAY, () => fixture(async (fx) => {
    const privacy = await page(fx, "/privacy", { cookie: "" });
    ok(privacy.status === 200, "6-a /privacy 200");
    ok(privacy.html.includes("<tr><th scope=\"row\">후원(원하는 분만)</th><td>후원자 표시 기간, 확인 메모(보낸 분 이름·보낸 날짜처럼 후원 확인에 쓴 내용), 공개 명단에 올릴 이름(원하는 분만)</td><td>후원 사실을 메일이나 오픈채팅으로 알려 주실 때(보낸 분 이름·보낸 날짜·회원 번호로 확인하고, 후원자 표시와 공개 명단에만 씁니다)</td><td>후원자 표시를 지울 때까지(요청하면 바로 지움). 알려 주신 메일은 8절의 문의 메일 기준을 따르고, 오픈채팅으로 알려 주신 내용은 그 대화방(카카오톡 오픈채팅)에 남아 카카오톡의 대화 보관 방식을 따릅니다.</td></tr>"), "6-b 6절 후원 줄: 저장하는 것(표시 기간·확인 메모·명단 이름), 확인에 쓰는 것, 보관(메일은 8절 기준·오픈채팅은 그 대화방)");
    ok(privacy.html.includes("<tr><th scope=\"row\">회원 번호</th><td>회원 번호(MB- 로 시작, 계정마다 이미 있는 내부 식별값으로 만든 번호)와 그 번호가 가리키는 계정</td><td>‘내 계정·보안’ 화면을 열 때나 운영자가 후원 확인·문의 때 그 번호로 계정을 찾을 때(번호로 계정을 찾는 데만 씁니다)</td><td>회원 이용 기간(삭제 요청 시까지)</td></tr>"), "6-b2 6절 회원 번호 줄(번호와 번호가 가리키는 계정 기억 — 운영자가 번호로 찾을 때도 기억한다, 회원 이용 기간)");
    ok(privacy.html.includes("<li>ab_sp: 후원자가 고른 포인트 색을 웹 가계부의 다른 화면에도 보이게 하는 표시(값 1, 개인정보 없음), 1일</li>"), "6-c 6절 쿠키 목록에 ab_sp");
    const v121 = "같은 날 개정에는 후원 확인 방법도 들어 있습니다. 후원을 확인할 때 로그인 이름 대신 ‘내 계정·보안’ 에 보이는 회원 번호를 받도록 하면서 회원 번호와 그 번호가 가리키는 계정을 6절 표에 더하고, 후원 확인 때 받는 정보와 보관 기간을 6절 표에 적고, 후원자 포인트 색 쿠키(ab_sp)를 쿠키 목록에 더했습니다. 회원 번호는 계정마다 이미 있는 내부 식별값으로 만든 번호이고 이용자에게서 새로 받는 정보가 없으며 쓰는 곳도 후원 확인과 문의뿐이어서, 이것도 이용자에게 불리하지 않은 변경입니다.";
    const twelfth = privacy.html.slice(privacy.html.indexOf("<h2>12. 개인정보처리방침의 변경</h2>"));
    const v121At = twelfth.indexOf(v121);
    const v118At = twelfth.indexOf("이번 개정은 단톡방에서 기록뿐 아니라 조회나 설명서 보기로 봇을 불러도");
    ok(v121At > 0, "6-d 12절에 이번(V22.9.121) 개정 설명이 있다");
    ok(v118At > 0 && v118At < v121At && !twelfth.slice(v118At, v121At).includes("</p>") && twelfth.slice(v121At + v121.length).startsWith("</p>"), "6-e V22.9.118 설명과 같은 문단(같은 조건 — 공고 = 시행) 끝에 있다(독립 검토 1차 P3)");
    ok(!twelfth.includes("이미 받아 온 정보"), "6-f 회원 번호를 ‘이미 받아 온 정보’ 라고 적지 않는다(이 판에서 처음 생긴 번호)");
  }));
});

// ── 7. 소스·등록 ─────────────────────────────────────────────────────────────
await section("7 소스", async () => {
  const manifest = read("src/modules/MANIFEST.txt");
  ok(/\nmy\/supporters\.js\r?\nmy\/member-code\.js\r?\n/.test(manifest), "7-a 새 모듈 my/member-code.js 가 MANIFEST 에 있다(my/supporters.js 다음)");
  const mod = read("src/modules/my/member-code.js");
  const code = mod.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  ok(code.includes("env?.USER_SESSION_SECRET") && !/ADMIN_SESSION_SECRET|KAKAO_SKILL_SECRET|SUPABASE_SERVICE_ROLE_KEY/.test(code) && !/무료/.test(mod), "7-b 번호는 기존 세션 비밀값 하나로만 만든다(새 변수 없음), ‘무료’ 말 없음");
  ok(code.includes('"resolution=ignore-duplicates"') && code.includes("/rest/v1/accountbook_settings?on_conflict=key"), "7-c 기억 줄은 on_conflict=key + ignore-duplicates 로 넣는다");
  const login = read("src/modules/auth/local-login-pages.js");
  const pageHandler = login.slice(login.indexOf("async function handleMyBackupLoginPage("), login.indexOf("async function handleMyBackupLoginSave("));
  ok(pageHandler.includes("memberCodeForUserV229121(env, user.id)") && !/scheduleMemberCodeRemember|rememberMemberCode|supabase\(/.test(pageHandler) && login.includes("MEMBER_CODE_SEEN_SCRIPT_V229121"), "7-d 내 계정·보안 화면 GET 은 번호만 계산하고 쓰지 않으며, 기억 줄은 신호 스크립트로 넣는다");
  const router = read("src/modules/worker/router.js");
  ok(router.includes("memberCodeSeenResponseV229121(request, env, url, ctx)") && router.includes("handleSupportersAdminSave(request, env, ctx)") && router.indexOf("if (!csrfOriginAllowed(request, url))") < router.indexOf("memberCodeSeenResponseV229121(request, env, url, ctx)"), "7-e 라우터가 신호 경로(같은 출처 검사 뒤)와 관리자 저장에 ctx 를 넘긴다");
  const adminModule = read("src/modules/admin/supporters-admin.js");
  ok(adminModule.includes("lookupMemberCodeV229121(env, query.code, { remember: false })"), "7-f 관리자 화면 GET 은 기억 줄을 쓰지 않는다(remember:false)");
  const pkg = JSON.parse(read("package.json"));
  ok(pkg.scripts?.["validate:supporter-id-v229121"] === "node validation/validate-supporter-id-v229121.mjs", "7-g package.json 에 검사가 등록돼 있다");
  ok(read(".codex/scripts/verify-repository.mjs").includes("validation/validate-supporter-id-v229121.mjs"), "7-h 하네스에 검사가 등록돼 있다");
  // 독립 검토 4차 반영 때 고침: 예전 입력 ‘not-a-code’ 는 구분 기호를 빼면 8글자(N0TA-C0DE)라 번호 꼴로 읽혀 DB 를 읽으려 했다(비밀값만 있는
  // 환경이라 읽기가 실패해 빈 결과로 보였을 뿐). 정말 꼴이 아닌 말로 보고, 나가는 요청 수를 센다.
  const lookupEnv = { USER_SESSION_SECRET: QA_SECRET, SUPABASE_URL: "https://qa-v229121.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "qa-v229121" };
  ok(normalizeMemberCodeV229121("not-a-code") === "MB-N0TA-C0DE", "7-i0 ‘not-a-code’ 는 번호 꼴로 읽힌다(O → 0, 구분 기호 무시) — 그래서 꼴이 아닌 예로 쓰지 않는다");
  let lookupCalls = 0;
  const failAll = intercept(() => { lookupCalls += 1; return new Response(JSON.stringify({ message: "QA" }), { status: 503 }); });
  let offline;
  let offlineCalls = -1;
  let scanBroken;
  try {
    offline = await Promise.all(["MB-12", "MB-ABCD-EFGU", "회원번호"].map((input) => lookupMemberCodeV229121(lookupEnv, input)));
    offlineCalls = lookupCalls;
    scanBroken = await lookupMemberCodeV229121(lookupEnv, codeOf("user-bin"), { remember: false });
  } finally { failAll(); }
  ok(offline.every((row) => JSON.stringify(row) === JSON.stringify({ userId: "", via: "", cacheStale: false, available: true })) && offlineCalls === 0, `7-i 꼴이 아닌 번호(‘MB-12’·틀린 글자 U·한글)는 DB 를 읽지 않고 빈 결과: 요청 ${offlineCalls}회`);
  eq(scanBroken, { userId: "", via: "", cacheStale: false, available: true, scanFailed: true }, "7-i2 DB 를 읽지 못하면(기억 줄·훑기 둘 다 503) scanFailed: true 로 ‘맞는 사람 없음’ 과 가른다(독립 검토 4차 P3)");
  eq(await lookupMemberCodeV229121({}, codeOf("user-bin")), { userId: "", via: "", cacheStale: false, available: false }, "7-j 비밀값이 없으면 찾지 않는다(DB 를 읽지 않고 available false)");
  const adminSource = read("src/modules/admin/supporters-admin.js");
  ok(adminSource.includes("const found = await lookupMemberCodeV229121(env, code, { ctx });") && adminSource.includes("if (found.scanFailed) return { error: \"member_code_lookup_failed\" };") && !/findUserIdByMemberCode/.test(adminSource + mod), "7-k 관리자 저장은 훑기 실패(scanFailed)를 ‘못 찾음’ 과 가른다(독립 검토 4차 P3)");
});

if (failures.length) for (const line of failures) console.error(`실패: ${line}`);
if (failures.length) { console.error(`V22.9.121 회원 번호 검사 실패 checks ${checks} failed ${failures.length}`); process.exit(1); }
console.log(`V22.9.121 회원 번호 검사 통과 (${checks} checks)`);

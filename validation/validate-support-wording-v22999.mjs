import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { app, BASE, ctx, fixture, page, post } from "./lib-audit-v22934.mjs";

let checks = 0;
const ok = (value, label) => { checks++; assert.ok(value, label); };
const eq = (value, expected, label) => { checks++; assert.equal(value, expected, label); };
const visible = (html) => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ");
const band = (html) => html.match(/<div class="abNoticeBand"[^>]*>[\s\S]*?<\/div>/)?.[0] || "";
const get = async (fx, path, cookie = "", method = "GET") => {
  const response = await app.fetch(new Request(BASE + path, { method, headers: { cookie, accept: "text/html" } }), fx.env, ctx);
  return { response, html: await response.text() };
};

await fixture(async (fx) => {
  for (const path of ["/", "/support", "/faq", "/how-it-works", "/about", "/my", "/app", "/menu", "/reports", "/smart-tools", "/my/premium", "/my/settings"]) {
    const result = await page(fx, path, { cookie: path === "/my" ? "" : fx.cookie });
    eq(result.status, 200, `${path}: renders`);
    ok(!/무료(?!\s?체험)|후원하지 않아도.*똑같|계속 무료/.test(visible(result.html)), `${path}: no free declaration`);
  }
  const support = (await page(fx, "/support")).html;
  for (const phrase of ["후원은 선택이에요", "카카오톡으로 묻고 답하는 서버", "외부 저장소 비용", "주소(도메인) 갱신과 장애 감시", "유지보수·업데이트", "금액은 정해져 있지 않아요"]) {
    ok(support.includes(phrase), `support explains ${phrase}`);
  }
  ok(!/Cloudflare|Supabase|후원하지 않아도|계속 무료/.test(support), "support omits vendor names and price promises");
  const privacy = (await page(fx, "/privacy")).html;
  ok(privacy.includes("Cloudflare") && privacy.includes("Supabase"), "privacy retains vendor disclosures");
  const backup = (await page(fx, "/my/backup")).html;
  ok(backup.includes('<section class="grid"><div class="card abV5SectionCard"><h2>백업 다운로드</h2>') || backup.includes('<section class="grid"><div class="card"><h2>백업 다운로드</h2>'), "report label in navigation does not restyle backup grid");
  for (const mode of ["review", "live", "adfit"]) {
    fx.env.ADS_MODE = mode;
    const faq = (await page(fx, "/faq")).html;
    // V22.9.108(사용자 결정 2026-11-07): ‘지금은 가입비나 이용료 없이 쓸 수 있어요’ 문장을 뺐다. 문항은 운영 비용 마련 방법으로 바꿨다.
    ok(faq.includes("광고가 나오나요? 운영 비용은 어떻게 마련하나요?") && faq.includes("서비스 운영 비용은 후원") && !faq.includes("가입비나 이용료") && !faq.includes("이용료가 있나요"), `${mode}: fee wording removed (V22.9.108)`);
  }
  delete fx.env.ADS_MODE;
  const noNotice = await get(fx, "/faq");
  ok(!noNotice.html.includes("abNoticeBand"), "notice absent without configuration");
  ok(noNotice.response.headers.get("cache-control").includes("public"), "unconfigured public cache unchanged");
  fx.env.NOTICE_TEXT = "점검 <b>안내</b> & 확인";
  fx.env.NOTICE_LINK = "/privacy";
  const expectedHash = createHash("sha256").update(fx.env.NOTICE_TEXT + fx.env.NOTICE_LINK).digest("hex").slice(0, 16);
  const hiddenCookie = `ab_notice_hide=${expectedHash}`;
  const hidden = await post(fx, "/notice/hide", { back: "/faq?topic=notice&view=all" }, { cookie: "" });
  eq(hidden.status, 303, "anonymous POST succeeds");
  eq(hidden.location, "/faq?topic=notice&view=all", "path and query preserved");
  eq(hidden.setCookie, `${hiddenCookie}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`, "cookie digest and browser expiry attributes");
  const loginPaths = new Set(["/my", "/app", "/my/settings"]);
  const sizes = [];
  for (const path of ["/my", "/app", "/my/settings", "/", "/faq", "/support", "/articles"]) {
    const session = loginPaths.has(path) && path !== "/my" ? fx.cookie : "";
    const shown = await get(fx, path + "?view=a&topic=b", session);
    eq(shown.response.status, 200, `${path}: shown status`);
    const notice = band(shown.html);
    ok(notice.includes('role="status"') && notice.includes("&lt;b&gt;안내&lt;/b&gt; &amp; 확인"), `${path}: accessible and escaped`);
    ok(notice.includes('<form class="abNoticeHide" method="post" action="/notice/hide">') && notice.includes('<button class="secondary" type="submit">오늘 하루 안 보기</button>'), `${path}: plain POST form`);
    ok(notice.includes(`value="${path}?view=a&amp;topic=b"`), `${path}: escaped back includes query`);
    ok(!/<script|onclick|onsubmit/i.test(notice), `${path}: no form script required`);
    const absent = await get(fx, path + "?view=a&topic=b", `${session}; ${hiddenCookie}`);
    ok(!absent.html.includes("abNoticeBand"), `${path}: matching cookie hides markup and styles`);
    for (const result of [shown, absent]) {
      ok(/(?:^|,\s*)Cookie(?:,|$)/i.test(result.response.headers.get("vary")), `${path}: varies by cookie`);
      if (loginPaths.has(path)) ok(result.response.headers.get("cache-control").includes("no-store"), `${path}: personal no-store`);
      else eq(result.response.headers.get("cache-control"), "private, max-age=300", `${path}: no shared cache`);
    }
    sizes.push({ path, shown: Buffer.byteLength(shown.html), hidden: Buffer.byteLength(absent.html) });
  }
  for (const cookie of ["", "ab_notice_hide=old", "ab_notice_hide=%", "ab_notice_hide=__proto__"]) {
    ok(band((await get(fx, "/faq", cookie)).html), "missing or unmatched cookie shows notice");
  }
  fx.env.NOTICE_TEXT += " 새 공지";
  ok(band((await get(fx, "/faq", hiddenCookie)).html), "changed text reappears");
  fx.env.NOTICE_TEXT = "점검 <b>안내</b> & 확인";
  fx.env.NOTICE_LINK = "/terms";
  ok(band((await get(fx, "/faq", hiddenCookie)).html), "changed link reappears");
  fx.env.NOTICE_LINK = "/privacy";
  for (const back of ["https://evil.example", "//evil.example", "/\\evil.example", "/x/..//evil.example", "/%2e%2e//evil.example", "/%2fevil.example", "/%5cevil.example", "/x\r\nLocation: https://evil.example", "/x\t", "/%0d", "javascript:alert(1)", "relative", "", "/" + "x".repeat(2048)]) {
    const result = await post(fx, "/notice/hide", { back }, { cookie: "" });
    eq(result.status, 303, "unsafe return has safe redirect status");
    eq(result.location, "/", `unsafe return falls back: ${JSON.stringify(back).slice(0, 90)}`);
  }
  for (const back of ["/my?month=2026-11", "/articles?q=test%20value", "/faq#notice"]) {
    eq((await post(fx, "/notice/hide", { back }, { cookie: "" })).location, back, "safe local return preserved");
  }
  for (const method of ["GET", "HEAD", "PUT", "DELETE"]) {
    const result = await app.fetch(new Request(BASE + "/notice/hide", { method, headers: { origin: BASE, "sec-fetch-site": "same-origin" } }), fx.env, ctx);
    eq(result.status, 405, `${method}: cannot hide`);
    eq(result.headers.get("allow"), "POST", `${method}: Allow header`);
    eq(result.headers.get("set-cookie"), null, `${method}: no cookie`);
  }
  const crossOrigin = await app.fetch(new Request(BASE + "/notice/hide", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" }, body: new URLSearchParams({ back: "/faq" }) }), fx.env, ctx);
  eq(crossOrigin.status, 403, "existing CSRF protection rejects cross-origin POST");
  eq(crossOrigin.headers.get("set-cookie"), null, "CSRF does not set cookie");
  const malformed = await app.fetch(new Request(BASE + "/notice/hide", { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: "{}" }), fx.env, ctx);
  eq(malformed.status, 400, "malformed form rejected");
  for (const path of ["/", "/faq", "/support"]) {
    const head = await get(fx, path, hiddenCookie, "HEAD");
    eq(head.html, "", `${path}: HEAD body empty`);
    eq(head.response.headers.get("cache-control"), "private, max-age=300", `${path}: HEAD cache matches GET`);
    ok(/Cookie/i.test(head.response.headers.get("vary")), `${path}: HEAD varies by cookie`);
  }
  const health = await get(fx, "/health", hiddenCookie);
  ok(!health.html.includes("abNoticeBand"), "non-HTML response unchanged");
  delete fx.env.NOTICE_TEXT;
  eq((await post(fx, "/notice/hide", { back: "/faq" }, { cookie: "" })).setCookie, "", "no notice does not create hiding cookie");
  console.log("Notice HTML byte measurements:", JSON.stringify(sizes));
});

// No edits to immutable assets are needed for this inline, server-rendered feature.
const source = readFileSync(new URL("../src/modules/web/html-postprocess.js", import.meta.url), "utf8");
ok(source.includes(".abNoticeHide button{min-height:44px") && source.includes("color:inherit!important;box-shadow:none!important"), "button keeps touch size and notice contrast");
console.log(`V22.9.99 support wording and notice hide passed (${checks} checks)`);

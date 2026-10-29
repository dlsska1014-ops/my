// V22.9.83: 테스트 서버(미리보기)의 요청 처리. 로컬 서버(preview-server.mjs)와 Cloudflare 별도 Worker
// (worker-entry.mjs, 이름 malhaebook-staging)가 같은 이 파일을 쓴다.
//
// 지키는 성질
// - 운영 DB 를 모른다. 앱에는 QA 픽스처의 env(SUPABASE_URL=https://mock.supabase.co)만 준다. 운영 Secret 은 없다.
// - 밖으로 나가는 요청을 모두 막는다. 메모리 Supabase(mock.supabase.co) 말고는 fetch 가 바로 실패한다
//   (카카오·메일·Supabase 실서버 어디로도 나가지 않는다). 막힌 주소는 blocked 에 남는다.
// - 늘 예시 사용자로 로그인한 상태다(소유자 Bin). /__preview/as/member 로 구성원(WIFI♥) 화면을 본다.
// - 검색에 잡히지 않는다(X-Robots-Tag·robots.txt). 모든 HTML 위에 "테스트 서버" 표시를 붙인다.
// - 앱은 자기 주소를 https://malhaebook.com 으로 안다. 들어온 요청을 그 주소로 바꿔 넘기고, 응답의 주소
//   (Location·HTML 안 절대 주소)는 미리보기 주소로 되돌린다 — 미리보기에서 누른 링크가 운영으로 가지 않는다.
import { applyDemoData } from "./demo-data.mjs";

export const APP_ORIGIN = "https://malhaebook.com";
const MOCK_HOST = "mock.supabase.co";
const DEMO_USERS = { owner: "user-bin", member: "user-wifi" };
const REWRITE_TYPES = /^(text\/html|text\/javascript|application\/javascript|application\/json|text\/css)/i;

function bannerHtml(role) {
  const who = role === "member" ? "구성원(WIFI♥)으로 보는 중" : "소유자(Bin)로 보는 중";
  return `<style id="abPreviewBannerStyle">#abPreviewBanner{position:fixed;z-index:2147483000;right:12px;top:10px;display:flex;gap:8px;align-items:center;background:#b42318;color:#fff;font:700 12px/1.25 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;padding:6px 10px;border-radius:999px;box-shadow:0 6px 18px rgba(15,23,42,.22);opacity:.94}#abPreviewBanner a{color:#fff;text-decoration:underline;font-weight:600}@media(max-width:899px){#abPreviewBanner{top:auto;bottom:calc(92px + env(safe-area-inset-bottom,0px));right:8px;font-size:11px}}@media print{#abPreviewBanner{display:none}}</style><div id="abPreviewBanner" role="note" aria-label="테스트 서버">테스트 서버 · 예시 데이터 · ${who} <a href="/__preview/as/${role === "member" ? "owner" : "member"}">${role === "member" ? "소유자로" : "구성원으로"}</a><a href="/__preview/reset">초기화</a></div>`;
}

function cookieValue(header, name) {
  for (const part of String(header || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return "";
}

export async function createDemoHandler({ app, createFixture, publicOrigin, now = () => Date.now(), version = "" }) {
  const origin = String(publicOrigin || "").replace(/\/$/, "");
  const insecure = origin.startsWith("http://");
  const blocked = [];
  let state = null;

  async function build() {
    if (state) state.fixture.restore();
    const fixture = await createFixture({ categoriesPresent: true });
    const summary = applyDemoData(fixture.db, now());
    Object.assign(fixture.env, { SKILL_RATE_LIMIT: 10000, TRAFFIC_GUARD_LIMIT: 10000 });
    const mockFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const target = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
      if (target.hostname === MOCK_HOST) return mockFetch(input, init);
      blocked.push(target.origin);
      if (blocked.length > 50) blocked.shift();
      throw new Error(`preview blocks outbound network: ${target.origin}`);
    };
    state = { fixture, summary, builtAt: new Date(now()).toISOString() };
  }
  await build();

  function rewriteHeaders(response) {
    const headers = new Headers();
    response.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (["set-cookie", "strict-transport-security", "content-length"].includes(k)) return;
      headers.set(key, k === "location" && value.startsWith(APP_ORIGIN) ? origin + value.slice(APP_ORIGIN.length) : value);
    });
    const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    for (const cookie of cookies) {
      let next = cookie.replace(/;\s*Domain=[^;]*/gi, "");
      if (insecure) next = next.replace(/;\s*Secure/gi, "");
      headers.append("set-cookie", next);
    }
    headers.set("x-robots-tag", "noindex, nofollow");
    headers.set("x-malhaebook-preview", "1");
    return headers;
  }

  async function forward(request, ctx) {
    const url = new URL(request.url);
    const role = cookieValue(request.headers.get("cookie"), "ab_preview_as") === "member" ? "member" : "owner";
    const target = new URL(url.pathname + url.search, APP_ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete("host");
    const kept = String(headers.get("cookie") || "").split(/;\s*/).filter((c) => c && !/^(ab_user|ab_admin)=/.test(c));
    kept.push(await state.fixture.cookieFor(DEMO_USERS[role]));
    headers.set("cookie", kept.join("; "));
    for (const name of ["origin", "referer"]) {
      const value = headers.get(name);
      if (value && value.startsWith(origin)) headers.set(name, APP_ORIGIN + value.slice(origin.length));
    }
    const init = { method: request.method, headers, redirect: "manual" };
    if (!["GET", "HEAD"].includes(request.method)) init.body = await request.arrayBuffer();
    const response = await app.fetch(new Request(target, init), state.fixture.env, ctx);
    const outHeaders = rewriteHeaders(response);
    const type = response.headers.get("content-type") || "";
    if (request.method === "HEAD" || !REWRITE_TYPES.test(type) || [101, 204, 304].includes(response.status)) {
      return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers: outHeaders });
    }
    let text = (await response.text()).split(APP_ORIGIN).join(origin);
    if (/^text\/html/i.test(type)) {
      const at = text.search(/<body[^>]*>/i);
      if (at >= 0) {
        const end = text.indexOf(">", at) + 1;
        text = text.slice(0, end) + bannerHtml(role) + text.slice(end);
      }
    }
    return new Response(text, { status: response.status, headers: outHeaders });
  }

  return {
    blocked,
    get db() { return state.fixture.db; },
    get summary() { return state.summary; },
    async fetch(request, ctx = { waitUntil() {}, passThroughOnException() {} }) {
      const url = new URL(request.url);
      if (url.pathname === "/robots.txt") {
        return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex, nofollow" } });
      }
      if (url.pathname === "/__preview/health") {
        return Response.json({ ok: true, preview: true, version, data: state.summary, built_at: state.builtAt, blocked: blocked.length }, { headers: { "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" } });
      }
      if (url.pathname === "/__preview/reset") {
        await build();
        return new Response(null, { status: 303, headers: { location: `${origin}/app`, "cache-control": "no-store" } });
      }
      const as = url.pathname.match(/^\/__preview\/as\/(owner|member)$/);
      if (as) {
        return new Response(null, { status: 303, headers: { location: `${origin}/app`, "set-cookie": `ab_preview_as=${as[1]}; Path=/; SameSite=Lax${insecure ? "" : "; Secure"}`, "cache-control": "no-store" } });
      }
      return forward(request, ctx);
    },
  };
}

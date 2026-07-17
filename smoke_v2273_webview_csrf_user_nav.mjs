import fs from "node:fs";
import assert from "node:assert/strict";
import worker from "./src/index.js";

const source = fs.readFileSync(new URL("./src/index.js", import.meta.url), "utf8");
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

async function post(headers = {}) {
  const request = new Request("https://ttokttok-accountbook.com/__csrf_probe__", {
    method: "POST",
    headers,
    body: "probe=1",
  });
  return worker.fetch(request, {}, { waitUntil() {} });
}

eq((await post({ origin: "https://ttokttok-accountbook.com", "sec-fetch-site": "same-origin" })).status, 404, "same-origin POST passes CSRF guard");
eq((await post({ origin: "https://evil.example", "sec-fetch-site": "same-site" })).status, 403, "concrete foreign Origin remains blocked");
eq((await post({ origin: "https://ttokttok-accountbook.com", "sec-fetch-site": "cross-site" })).status, 403, "cross-site Fetch Metadata remains blocked");
eq((await post({ origin: "null", "sec-fetch-site": "same-origin", referer: "android-app://com.kakao.talk" })).status, 404, "Kakao WebView opaque headers pass with same-origin Fetch Metadata");
eq((await post({ "sec-fetch-site": "same-origin", referer: "https://kauth.kakao.com/" })).status, 404, "stale OAuth Referer does not override same-origin Fetch Metadata");
eq((await post({ origin: "null", referer: "android-app://com.kakao.talk", cookie: "ab_user=webview-session" })).status, 404, "authenticated legacy WebView opaque request passes");
eq((await post({ origin: "null", referer: "https://kauth.kakao.com/oauth/authorize", cookie: "ab_user=webview-session" })).status, 404, "authenticated Kakao OAuth transition Referer passes");
eq((await post({ origin: "null", referer: "https://evil.example/form", cookie: "ab_user=webview-session" })).status, 403, "foreign HTTP Referer stays blocked even with a session");
eq((await post({ origin: "null", referer: "android-app://com.kakao.talk" })).status, 403, "unauthenticated opaque request without Fetch Metadata stays blocked");

ok(source.includes('const APP_VERSION = "V22.8.5-MOBILE-ACCESS-MENU-HIERARCHY"'), "V22.8.2 version active");
ok(source.includes('const APP_MODE = "asset-dashboard-complete-stability"'), "stable asset mode remains active");
ok(source.includes('["my-households", "가계부 전환·추가", `/my/households?month=${encodeURIComponent(month)}${hh}`, "⇄"]'), "global user navigation targets /my/households");
ok(source.includes('["households", "참여자·초대", `/my/members?month=${encodeURIComponent(month)}${hh}`, "+"]'), "participant navigation uses user-scoped route");
ok(source.includes('["backup-login", "개인 비밀번호"'), "personal security navigation is exposed");
ok(!source.includes('["settings", "보안·설정", "/settings"]'), "user navigation no longer exposes admin security route");
ok(source.includes('return redirectResponse(`/my/backup-login?return_to=${encodeURIComponent(returnTo)}`);'), "logged-in users reaching /settings are recovered to personal security");
ok(source.includes('kind: "csrf_blocked"'), "CSRF rejections leave a redacted operations event");

console.log(`V22.7.3 webview CSRF/user-nav smoke passed: ${checks} checks`);

// V22.9.35 가입 해시 수정 검사.
// Cloudflare Workers 운영 런타임은 PBKDF2 반복 횟수 100,000 을 넘는 deriveBits 를 거절한다. 210,000 회로 만든
// 해시는 Node 검사를 모두 통과했지만 운영 가입(2026-10-09 23:43 KST, HTTP 500)·ID 설정·관리자 비밀번호 변경은
// 모두 실패했다. 이 검사는 픽스처(validation/qa-fixture.mjs)가 운영과 같은 상한을 두는지, 그 상한 아래에서
// 가입·로그인·관리자 비밀번호 변경이 되는지, 상한을 넘는 저장값은 엉뚱한 해시 대신 분명한 오류가 되는지 본다.
import { readFileSync } from "node:fs";
import { counter, fixture, intercept, post } from "./lib-audit-v22934.mjs";
import { WORKERS_PBKDF2_MAX_ITERATIONS } from "./qa-fixture.mjs";

const { ok, eq, done } = counter("V22.9.35 가입 해시 수정 검사 통과");
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

// 검사 내내 PBKDF2 요청 횟수를 모은다(상한 흉내 위에 한 겹 더 씌운다).
const requested = [];
const subtleProto = Object.getPrototypeOf(globalThis.crypto.subtle);
const cappedDeriveBits = subtleProto.deriveBits;
subtleProto.deriveBits = function spyDeriveBits(algorithm, ...rest) {
  if (String(algorithm?.name || "").toUpperCase() === "PBKDF2") requested.push(Number(algorithm.iterations));
  return cappedDeriveBits.call(this, algorithm, ...rest);
};

// ── 1. 픽스처가 운영 상한을 흉내 낸다 ─────────────────────────────
{
  eq(WORKERS_PBKDF2_MAX_ITERATIONS, 100000, "픽스처 상한은 workerd 기본값 100,000 이다");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("cap-probe"), { name: "PBKDF2" }, false, ["deriveBits"]);
  const salt = new Uint8Array(16);
  const over = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100001 }, key, 256).then(() => null, (err) => err);
  ok(over?.name === "NotSupportedError" && /above 100000/.test(over.message), "상한을 넘는 PBKDF2 는 운영처럼 NotSupportedError 로 거절된다");
  const at = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  eq(at.byteLength, 32, "상한과 같은 100,000 회는 계산된다");
  requested.length = 0;
}

// ── 2. 소스: 새 해시는 상한 이하로 만들고, 저장값만 그대로 읽는다 ──────────
{
  ok(source.includes("const PASSWORD_KDF_MAX_ITERATIONS = 100000;"), "운영 상한 상수가 100,000 이다");
  ok(source.includes("const PASSWORD_KDF_ITERATIONS = PASSWORD_KDF_MAX_ITERATIONS;"), "새 해시 반복 횟수는 운영 상한과 같다");
  ok(source.includes('if (!(rounds <= PASSWORD_KDF_MAX_ITERATIONS)) throw new Error("password_kdf_iterations_unsupported");'), "상한을 넘는 반복 횟수는 계산하지 않고 분명한 오류로 알린다");
  const calls = [...source.matchAll(/(?<!function )pbkdf2PasswordHash\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)].map((m) => m[1].split(",").map((part) => part.trim()));
  ok(calls.length >= 7, `해시 계산 자리를 모두 찾았다(${calls.length}곳)`);
  const allowed = /^(PASSWORD_KDF_ITERATIONS|[\w.]+\.(?:credential_iterations|password_iterations))$/;
  const badCalls = calls.filter((args) => !allowed.test(args[2] || ""));
  eq(badCalls.length, 0, `해시 계산은 상한 상수나 저장된 반복 횟수만 쓴다${badCalls.length ? ` — ${badCalls.map((a) => a.join(", ")).join(" | ")}` : ""}`);
  const writes = [...source.matchAll(/\b(p_credential_iterations|password_iterations):\s*([^,}\n]+)/g)].map((m) => [m[1], m[2].trim()]);
  const badWrites = writes.filter(([, value]) => value !== "PASSWORD_KDF_ITERATIONS" && value !== "1");
  ok(writes.length >= 3 && badWrites.length === 0, `저장하는 반복 횟수는 상한 상수다(준비 상태 점검의 일부러 틀린 값 1 제외, ${writes.length}곳)`);
  const literals = [...source.matchAll(/iterations:\s*(\d{6,})/g)].map((m) => Number(m[1])).filter((n) => n > WORKERS_PBKDF2_MAX_ITERATIONS);
  eq(literals.length, 0, "소스 어디에도 상한을 넘는 반복 횟수 숫자가 없다");
}

// ── 3. 가입·로그인 ────────────────────────────────────────────────
await fixture(async (fx) => {
  const password = "kdf-check-2026";
  const signup = await post(fx, "/my/local-signup", { login_name: "kdfcheck", display_name: "해시점검", access_code: password, access_code_confirm: password }, { cookie: "" });
  eq(signup.status, 303, "운영 상한 아래에서 새 계정 만들기가 된다(예전에는 500)");
  ok(/ab_user=[^;]/.test(signup.setCookie), "가입 뒤 로그인 쿠키를 준다");
  const identity = fx.db.accountbook_user_identities.find((row) => row.provider === "local" && row.provider_subject === "kdfcheck");
  eq(identity?.credential_iterations, 100000, "저장한 반복 횟수는 100,000 이다");
  ok(String(identity?.credential_hash || "").length >= 40 && String(identity?.credential_salt || "").length >= 16, "해시와 솔트가 저장된다");

  const login = await post(fx, "/my/local-login", { login_name: "kdfcheck", access_code: password }, { cookie: "" });
  eq(login.status, 303, "만든 계정으로 로그인된다");
  ok(/ab_user=[^;]/.test(login.setCookie), "로그인 쿠키를 준다");
  const wrong = await post(fx, "/my/local-login", { login_name: "kdfcheck", access_code: "wrong-pass-2026" }, { cookie: "" });
  ok(wrong.status === 401 && wrong.text.includes("맞지 않습니다"), "틀린 비밀번호는 401 로 안내한다");
  const unknown = await post(fx, "/my/local-login", { login_name: "nobody-kdf", access_code: password }, { cookie: "" });
  ok(unknown.status === 401 && unknown.text.includes("맞지 않습니다"), "없는 이름도 401 이다(시간 맞추기 해시가 상한 아래에서 계산된다, 예전에는 500)");

  // 상한을 넘는 반복 횟수로 저장된 계정(운영 밖에서 만든 행)은 엉뚱한 해시로 "비밀번호 틀림"을 만들지 않는다.
  fx.db.accountbook_user_identities.push({ user_id: "user-bin", provider: "local", provider_subject: "legacykdf", login_name: "legacykdf", credential_hash: "x".repeat(43), credential_salt: "legacy-salt-0123456789", credential_iterations: 210000, credential_version: 2 });
  const eventsBefore = (globalThis.__AB_OPS_EVENTS || []).length;
  const legacy = await post(fx, "/my/local-login", { login_name: "legacykdf", access_code: password }, { cookie: "" });
  ok(legacy.status === 500 && legacy.text.includes("로그인을 처리하지 못했습니다"), "상한을 넘는 저장값은 처리 오류로 안내한다");
  const event = (globalThis.__AB_OPS_EVENTS || []).slice(eventsBefore).find((item) => item.kind === "local_login_failed");
  ok(event && event.detail.includes("password_kdf_iterations_unsupported"), "로그인 처리 오류를 운영 이벤트(local_login_failed)로 남긴다");
});

// ── 4. 관리자 비밀번호 변경 ──────────────────────────────────────
await fixture(async (fx) => {
  fx.env.ADMIN_PASSWORD = "initial-admin-123";
  fx.env.ADMIN_SESSION_SECRET = "qa-admin-session-secret";
  const login = await post(fx, "/login", { password: "initial-admin-123" }, { cookie: "" });
  const adminCookie = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
  ok(login.status === 303 && adminCookie.length > 10, "관리자로 로그인한다");
  let stored = null;
  const restore = intercept(async ({ url, method, init }) => {
    if (method === "POST" && url.pathname.endsWith("/accountbook_admin_security")) stored = JSON.parse(init.body);
    return null;
  });
  const changed = await post(fx, "/admin/settings/password", { current_password: "initial-admin-123", new_password: "changed-admin-456", confirm_password: "changed-admin-456" }, { cookie: adminCookie });
  restore();
  ok(changed.status === 303 && changed.location.includes("msg=password_updated"), "관리자 비밀번호 변경이 된다(예전에는 해시 단계에서 실패)");
  eq(stored?.password_iterations, 100000, "관리자 비밀번호도 100,000 회로 저장한다");
});

// ── 5. 검사 내내 상한을 넘는 PBKDF2 를 요청하지 않았다 ───────────────
ok(requested.length >= 5, `가입·로그인·관리자 경로에서 PBKDF2 를 실제로 계산했다(${requested.length}회)`);
eq(Math.max(...requested), 100000, "어떤 경로도 상한을 넘는 반복 횟수를 요청하지 않았다");
subtleProto.deriveBits = cappedDeriveBits;

done();

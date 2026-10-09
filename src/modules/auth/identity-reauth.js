
function userIdentityLinksSettingsKey() {
  return "user_identity_links";
}

// V22.9.26: 전역 식별 링크 표는 읽기 실패를 빈 값으로 보지 않는다. 모든 호출부가 읽고-고쳐-쓰는
// 길이라, 503 한 번이 다른 모든 사용자의 카카오 식별 링크를 지우고 새 사용자로 갈라 놓을 수 있었다.
async function fetchUserIdentityLinks(env) {
  const value = await getSettingValueStrict(env, userIdentityLinksSettingsKey());
  return parseStrictSettingsObject(value, "user_identity_links");
}

async function saveUserIdentityLinks(env, links = {}) {
  const clean = safeObject(links);
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: userIdentityLinksSettingsKey(), value: JSON.stringify(clean) }),
  });
  return clean;
}

function normalizeLocalLoginName(value = "") {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 80);
}

async function fetchStrongIdentityBySubject(env, provider = "local", subject = "") {
  const cleanProvider = provider === "kakao" ? "kakao" : "local";
  const cleanSubject = String(subject || "").trim();
  if (!cleanSubject) return null;
  try {
    const rows = await supabase(env, `/rest/v1/accountbook_user_identities?provider=eq.${cleanProvider}&provider_subject=eq.${encodeURIComponent(cleanSubject)}&select=user_id,provider,provider_subject,login_name,credential_hash,credential_salt,credential_iterations,credential_version&limit=1`, { method: "GET" }) || [];
    return rows[0] || null;
  } catch (err) {
    throw err;
  }
}

async function fetchStrongIdentityForUser(env, provider = "local", userId = "") {
  const cleanProvider = provider === "kakao" ? "kakao" : "local";
  const uid = String(userId || "").trim();
  if (!uid) return null;
  try {
    const rows = await supabase(env, `/rest/v1/accountbook_user_identities?provider=eq.${cleanProvider}&user_id=eq.${encodeURIComponent(uid)}&select=user_id,provider,provider_subject,login_name,credential_hash,credential_salt,credential_iterations,credential_version&limit=1`, { method: "GET" }) || [];
    return rows[0] || null;
  } catch (err) {
    throw err;
  }
}

async function linkKakaoLoginToUser(env, kakaoId = "", userId = "", profile = {}) {
  const kid = String(kakaoId || "").trim();
  const uid = String(userId || "").trim();
  if (!kid || !uid) return false;
  await supabase(env, "/rest/v1/rpc/accountbook_link_kakao_identity_v227", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ p_user_id: uid, p_kakao_id: kid, p_nickname: stripMergedMarkerSuffix(profile.nickname).slice(0, 80) }),
  });
  return true;
}

async function linkLocalLoginToUser(env, nickname = "", accessCode = "", userId = "") {
  return replaceLocalLoginForUser(env, nickname, accessCode, userId, { revokeSessions: false });
}

async function replaceLocalLoginForUser(env, nickname = "", accessCode = "", userId = "", options = {}) {
  const name = String(nickname || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 80);
  const code = String(accessCode || "").trim();
  const uid = String(userId || "").trim();
  if (!name || code.length < 4 || !uid) return false;
  const salt = newPasswordSalt();
  const hash = await pbkdf2PasswordHash(code, salt, PASSWORD_KDF_ITERATIONS);
  await supabase(env, "/rest/v1/rpc/accountbook_set_local_identity_v227", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_user_id: uid,
      p_login_name: name,
      p_credential_hash: hash,
      p_credential_salt: salt,
      p_credential_iterations: PASSWORD_KDF_ITERATIONS,
      p_revoke_sessions: options.revokeSessions !== false,
    }),
  });
  return true;
}

async function verifyLocalLoginForUser(env, userId = "", accessCode = "") {
  const uid = String(userId || "").trim();
  const code = String(accessCode || "").trim();
  if (!uid || code.length < 4) return false;
  const strong = await fetchStrongIdentityForUser(env, "local", uid);
  if (strong?.credential_hash && strong?.credential_salt) {
    const actual = await pbkdf2PasswordHash(code, strong.credential_salt, strong.credential_iterations);
    return constantTimeTextEqual(actual, strong.credential_hash);
  }
  return false;
}

function isPlaceholderUserNickname(value = "") {
  const name = normalizeText(value || "").replace(/\s+/g, "").toLowerCase();
  return !name || ["카카오사용자", "가계부사용자", "사용자", "내", "unknown", "user"].includes(name);
}

async function findUserByLocalLoginIdentity(env, nickname = "", accessCode = "") {
  const loginName = normalizeLocalLoginName(nickname);
  const code = String(accessCode || "").trim();
  if (!loginName || code.length < 4) return null;
  const strong = await fetchStrongIdentityBySubject(env, "local", loginName);
  if (strong?.credential_hash && strong?.credential_salt) {
    const actual = await pbkdf2PasswordHash(code, strong.credential_salt, strong.credential_iterations);
    if (!constantTimeTextEqual(actual, strong.credential_hash)) return null;
    return await fetchUserById(env, strong.user_id);
  }

  await pbkdf2PasswordHash(code, "accountbook-missing-identity-timing-v22930", PASSWORD_KDF_ITERATIONS);
  return null;
}

async function hasBackupLoginIdentity(env, user = {}) {
  const uid = String(user?.id || "").trim();
  if (!uid) return false;
  try {
    if (await fetchStrongIdentityForUser(env, "local", uid)) return true;
    if (String(user?.kakao_user_key || "").startsWith("local_web:")) return true;
    const links = await fetchUserIdentityLinks(env);
    return Object.entries(safeObject(links)).some(([key, value]) => String(key || "").startsWith("local_web:") && String(safeObject(value).user_id || "") === uid);
  } catch (err) {
    // A temporary identity lookup problem must not break login, household, or
    // password-setting screens. Fall back to the cheapest local signal.
    rememberOpsEvent({ kind: "backup_identity_lookup_failed", severity: "warn", path: "", method: "", detail: safeError(err) });
    return String(user?.kakao_user_key || "").startsWith("local_web:");
  }
}

async function hasKakaoLoginIdentity(env, user = {}) {
  const uid = String(user?.id || "").trim();
  if (!uid) return false;
  try {
    if (await fetchStrongIdentityForUser(env, "kakao", uid)) return true;
    if (String(user?.kakao_user_key || "").startsWith("kakao_login:")) return true;
    const links = await fetchUserIdentityLinks(env);
    return Object.entries(safeObject(links)).some(([key, value]) => String(key || "").startsWith("kakao_login:") && String(safeObject(value).user_id || "") === uid);
  } catch (err) {
    rememberOpsEvent({ kind: "kakao_identity_lookup_failed", severity: "warn", path: "", method: "", detail: safeError(err) });
    return String(user?.kakao_user_key || "").startsWith("kakao_login:");
  }
}

async function kakaoLoginIdentityMatchesUser(env, userId = "", kakaoId = "") {
  const uid = String(userId || "").trim();
  const kid = String(kakaoId || "").trim();
  if (!uid || !kid) return false;
  const [byUser, bySubject, user] = await Promise.all([
    fetchStrongIdentityForUser(env, "kakao", uid),
    fetchStrongIdentityBySubject(env, "kakao", kid),
    fetchUserById(env, uid),
  ]);
  if (byUser?.provider_subject) return constantTimeTextEqual(String(byUser.provider_subject), kid);
  if (bySubject?.user_id) return constantTimeTextEqual(String(bySubject.user_id), uid);
  if (constantTimeTextEqual(String(user?.kakao_user_key || ""), kakaoLoginUserKey(kid))) return true;
  const links = await fetchUserIdentityLinks(env);
  return constantTimeTextEqual(String(safeObject(links[kakaoLoginUserKey(kid)]).user_id || ""), uid);
}

async function boundedFormRequest(request, limit = 65536) {
  const fail = (status) => Object.assign(new Error("invalid_request_body"), { httpStatus: status });
  if (Number(request.headers.get("content-length") || 0) > limit) throw fail(413);
  const reader = request.body?.getReader();
  const chunks = []; let size = 0;
  if (reader) try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > limit) throw fail(413); chunks.push(part.value); }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const bounded = new Request(request.url, {method: request.method, headers: request.headers, body: bytes});
  const contentType = request.headers.get("content-type") || "";
  if (/multipart\/form-data|application\/x-www-form-urlencoded/i.test(contentType)) {
    let form; try { form = await bounded.clone().formData(); } catch (_) { throw fail(400); }
    bounded.formData = async () => form;
  } else if (/application\/json/i.test(contentType) && size) {
    try { JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { throw fail(400); }
  }
  return bounded;
}

async function signedPurposeToken(env, purpose, values = {}, seconds = 300) {
  const data = base64UrlEncodeText(JSON.stringify({...values, purpose, exp: Math.floor(Date.now()/1000) + seconds}));
  return data + "." + await hmacSha256(userSessionSecret(env), purpose + ":" + data);
}

async function readPurposeToken(env, purpose, token = "") {
  if (!token || token.length > 4096) return null;
  const dot = token.lastIndexOf("."); if (dot < 1) return null;
  const data = token.slice(0, dot);
  if (!constantTimeTextEqual(token.slice(dot+1), await hmacSha256(userSessionSecret(env), purpose + ":" + data))) return null;
  try { const payload = JSON.parse(base64UrlDecodeText(data)); return payload.purpose === purpose && payload.exp >= Math.floor(Date.now()/1000) ? payload : null; } catch (_) { return null; }
}

async function makeCredentialProof(env, userId) {
  const version = await getUserSessionVersion(env, userId);
  if (version < 1) throw new Error("user_session_security_unavailable");
  return signedPurposeToken(env, "credential-change", {user_id: userId, version});
}

async function verifyCredentialProof(request, env, userId) {
  const proof = await readPurposeToken(env, "credential-change", getCookie(request, "ab_credential_reauth"));
  return !!proof && proof.user_id === userId && Number(proof.version) >= 1 && Number(proof.version) === Number(await getUserSessionVersion(env, userId));
}

async function verifyPasswordReauth(request, env, userId, password) {
  const admission = await recordAuthAttempt(env, request, "/my/password-reauth-admission", false, {limit:30});
  if (!admission.allowed) return false;
  const attempt = await recordAuthAttempt(env, request, "/my/password-reauth", false);
  if (!attempt.allowed) return false;
  try {
    const valid = await verifyLocalLoginForUser(env, userId, password);
    if (valid) await recordAuthAttempt(env, request, "/my/password-reauth", true);
    return valid;
  } catch (error) { await recordAuthAttempt(env, request, "/my/password-reauth", true); throw error; }
}

async function handleAccountReauth(request, env) {
  const userId = await verifyUserSession(request, env); if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  if (!(await verifyPasswordReauth(request, env, userId, String(form.get("current_password") || "")))) return redirectResponse("/my/backup-login?err=account_reauth_required");
  const proof = await makeCredentialProof(env, userId);
  return redirectResponse("/my/backup-login?msg=account_reauth_verified", {"set-cookie": `ab_credential_reauth=${encodeURIComponent(proof)}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Lax`});
}

function householdDeleteReauthCookieName() {
  return "ab_household_delete_reauth";
}

function clearHouseholdDeleteReauthCookie() {
  return `${householdDeleteReauthCookieName()}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function makeHouseholdDeleteReauthToken(env, userId = "", householdId = "") {
  const payload = {
    v: 1,
    purpose: "household-delete",
    user_id: String(userId || "").trim(),
    household_id: String(householdId || "").trim(),
    exp: Math.floor(Date.now() / 1000) + 5 * 60,
  };
  if (!payload.user_id || !payload.household_id) throw new Error("household_delete_reauth_target_required");
  const data = base64UrlEncodeText(JSON.stringify(payload));
  const signature = await hmacSha256(userSessionSecret(env), `household-delete:${data}`);
  return `${data}.${signature}`;
}

async function verifyHouseholdDeleteReauth(request, env, userId = "", householdId = "") {
  const token = getCookie(request, householdDeleteReauthCookieName());
  if (!token || token.length > 4096) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const data = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = await hmacSha256(userSessionSecret(env), `household-delete:${data}`);
  if (!signature || !constantTimeTextEqual(signature, expected)) return false;
  try {
    const payload = JSON.parse(base64UrlDecodeText(data));
    return Number(payload?.v || 0) === 1
      && payload?.purpose === "household-delete"
      && Number(payload?.exp || 0) >= Math.floor(Date.now() / 1000)
      && constantTimeTextEqual(String(payload?.user_id || ""), String(userId || ""))
      && constantTimeTextEqual(String(payload?.household_id || ""), String(householdId || ""));
  } catch (err) {
    return false;
  }
}

async function findUserByKakaoLoginId(env, kakaoId = "") {
  const kid = String(kakaoId || "").trim();
  if (!kid) return null;
  const strong = await fetchStrongIdentityBySubject(env, "kakao", kid);
  if (strong?.user_id) {
    const user = await fetchUserById(env, strong.user_id);
    if (user) return user;
  }
  const key = kakaoLoginUserKey(kakaoId);
  const links = await fetchUserIdentityLinks(env);
  const linkedUserId = String(safeObject(links[key]).user_id || "");
  if (linkedUserId) {
    const linked = await fetchUserById(env, linkedUserId);
    if (linked) {
      try { await linkKakaoLoginToUser(env, kid, linked.id, { nickname: linked.nickname || "" }); } catch (err) { rememberOpsEvent({ kind: "legacy_kakao_identity_migration_failed", severity: "warn", path: "/auth/kakao/callback", method: "GET", detail: "V22.7 migration required" }); }
      return linked;
    }
  }
  const existing = await supabase(env, `/rest/v1/users?kakao_user_key=eq.${encodeURIComponent(key)}&select=id,kakao_user_key,nickname&limit=1`, { method: "GET" });
  if (existing?.[0]) {
    try { await linkKakaoLoginToUser(env, kid, existing[0].id, { nickname: existing[0].nickname || "" }); } catch (err) { rememberOpsEvent({ kind: "legacy_kakao_identity_migration_failed", severity: "warn", path: "/auth/kakao/callback", method: "GET", detail: "V22.7 migration required" }); }
    return existing[0];
  }
  return null;
}

async function ensureKakaoLoginUser(env, kakaoId, nickname) {
  const found = await findUserByKakaoLoginId(env, kakaoId);
  if (found) return found;
  const key = kakaoLoginUserKey(kakaoId);
  const created = await supabase(env, "/rest/v1/users", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ kakao_user_key: key, nickname: (stripMergedMarkerSuffix(nickname) || "카카오사용자").slice(0, 80) }),
  });
  const user = Array.isArray(created) ? created[0] : created;
  if (user?.id) {
    try {
      await linkKakaoLoginToUser(env, kakaoId, user.id, { nickname });
    } catch (err) {
      // A late identity-link commit must never be undone by deleting its user.
      // Only an authoritative 4xx rejection permits cleanup of this new row.
      if (isDefiniteStorageFailure(err)) {
        const members = await supabase(env, `/rest/v1/household_members?user_id=eq.${encodeURIComponent(user.id)}&select=household_id&limit=1`, { method: "GET" });
        if (!Array.isArray(members)) throw new Error("household_member_source_invalid");
        if (!members.length) await optionalSupabase(env, `/rest/v1/users?id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }, null);
      }
      throw err;
    }
  }
  return user;
}

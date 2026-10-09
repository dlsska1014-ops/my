// V22.9.34 — 감사(docs/codex/AUDIT_FINDINGS_V22_9_33.md)의 설정 화면·계정 결함을 고정한다.
//   U1 로그아웃: 전체 메뉴와 내 계정·보안 화면에 POST 로그아웃이 있고, 누르면 로그인 쿠키를 지운다.
//   S3 예산 일괄 저장: 읽기 실패로 빈 폼을 그리지 않고, 폼을 연 뒤 바뀐 계획은 덮어쓰지 않는다.
//   S4 키워드 편집기: 못 읽으면 예시로 채운 편집기를 그리지 않고, 바꾼 카드만 원래 값과 대조해 저장한다.
//   S5 자산: 순자산 기록·자산 목록을 못 읽으면 덮어쓰지 않는다.
//   S6 카카오 "지난달 예산 복사": 이번 달 예산을 못 읽었거나 이미 있으면 복사하지 않는다.
//   S2 계정 통합: 단톡방 연결은 linked_by 만 옮기고 옛 연결 맵을 관대한 읽기로 다시 쓰지 않는다.
//   S7 설정 분류: 엄격한 읽기와 가계부 설정 잠금. S8 관리자 비밀번호: 해시를 못 읽으면 옛 비밀번호로 열지 않는다.
//   S9 목표·챌린지: 가계부 삭제와 같은 잠금을 써서 지운 가계부의 설정을 되살리지 않는다.
//   S10 관리자 백업: 못 읽은 자료가 있으면 파일을 만들지 않는다. S11 홈 배치: 못 읽으면 기본값 폼을 그리지 않는다.
import { createHash } from "node:crypto";
import { kakaoGroupLinkItemSettingsKey } from "../src/index.js";
import {
  BASE, api, app, counter, ctx, failure, fixture, formFields, intercept, page, post, putSetting, settingValue, skill, withClock,
} from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.34 설정·계정 안전 검사 통과");

const monthRows = (fx, month, householdId = "house-home") => fx.db.accountbook_budgets
  .filter((row) => row.household_id === householdId && row.month === month)
  .map((row) => `${row.category}=${row.amount}`)
  .sort()
  .join(",");
const failBudgetReads = (month = "") => intercept(({ url, method }) => (
  method === "GET" && url.pathname.endsWith("/accountbook_budgets") && (!month || url.searchParams.get("month") === `eq.${month}`)
    ? failure(503, "simulated budgets read failure")
    : null
));

// ── U1 로그아웃 ─────────────────────────────────────────────
await fixture(async (fx) => {
  const menu = await page(fx, "/menu?month=2026-07&household_id=house-home");
  ok(menu.status === 200 && /<form class="menuLogout" method="post" action="\/my\/logout"><button type="submit">로그아웃<\/button>/.test(menu.html), "U1 전체 메뉴에 로그아웃 버튼(POST)이 있다");
  const account = await page(fx, "/my/backup-login?return_to=%2Fmenu");
  ok(account.status === 200 && /<form method="post" action="\/my\/logout"><button type="submit" class="secondary">로그아웃<\/button><\/form>/.test(account.html), "U1 내 계정·보안 화면에 로그아웃 버튼(POST)이 있다");
  const out = await post(fx, "/my/logout", {});
  eq(out.status, 303, "U1 로그아웃은 303 으로 돌려보낸다");
  ok(out.location === "/my" && /ab_user=;[^,]*Max-Age=0/.test(out.setCookie), "U1 로그아웃은 로그인 쿠키(ab_user)를 지우고 /my 로 보낸다");
  ok(/ab_hh=;[^,]*Max-Age=0/.test(out.setCookie), "U1 로그아웃은 기억한 가계부 쿠키(ab_hh)도 지운다");
  const anonymousMenu = await page(fx, "/menu", { cookie: "" });
  ok(!/menuLogout/.test(anonymousMenu.html), "U1 로그인하지 않은 화면에는 로그아웃 버튼을 그리지 않는다");
});

// ── S3 예산 일괄 저장 ───────────────────────────────────────
for (const [label, path, action] of [
  ["/budgets", "/budgets?month=2026-07&household_id=house-home", "/my/budget-bulk/save"],
  ["/my/settings", "/my/settings?month=2026-07&household_id=house-home", "/my/budget-bulk/save"],
]) {
  await fixture(async (fx) => {
    const before = monthRows(fx, "2026-07");
    const restore = failBudgetReads("2026-07");
    const failed = await page(fx, path);
    restore();
    ok(failed.status === 200 && /예산을 불러오지 못해 지금은 편집할 수 없습니다/.test(failed.html), `S3 ${label}: 예산을 못 읽으면 편집 불가 안내를 보인다`);
    ok(!formFields(failed.html, action).found, `S3 ${label}: 예산을 못 읽으면 빈 일괄 저장 폼을 그리지 않는다`);

    const fresh = await page(fx, path);
    const { found, fields } = formFields(fresh.html, action);
    ok(found && /^p1-\d+-[0-9a-f]{8}$/.test(fields.get("plan_fingerprint") || ""), `S3 ${label}: 일괄 저장 폼이 계획 지문을 싣는다`);

    const stale = new URLSearchParams(fields);
    stale.delete("plan_fingerprint");
    const staleSave = await post(fx, action, stale);
    ok(staleSave.decoded.includes("err=budget_form_stale") && monthRows(fx, "2026-07") === before, `S3 ${label}: 지문 없는 예전 폼은 저장하지 않는다`);

    const restoreSave = failBudgetReads("2026-07");
    const readFailedSave = await post(fx, action, fields);
    restoreSave();
    ok(readFailedSave.decoded.includes("err=budget_read_failed") && monthRows(fx, "2026-07") === before, `S3 ${label}: 저장 직전 계획을 못 읽으면 바꾸지 않는다`);

    const other = fx.db.accountbook_budgets.find((row) => row.household_id === "house-home" && row.month === "2026-07" && row.category === "교통");
    other.amount = 260000;
    const changedBefore = monthRows(fx, "2026-07");
    const conflict = await post(fx, action, fields);
    ok(conflict.decoded.includes("err=budget_changed") && monthRows(fx, "2026-07") === changedBefore, `S3 ${label}: 폼을 연 뒤 다른 곳에서 바뀐 계획은 덮어쓰지 않는다`);

    const reopened = formFields((await page(fx, path)).html, action).fields;
    const names = reopened.getAll("budget_category");
    const amounts = reopened.getAll("budget_amount");
    reopened.delete("budget_amount");
    names.forEach((name, index) => reopened.append("budget_amount", name === "식비" ? "600000" : amounts[index] || ""));
    const saved = await post(fx, action, reopened);
    const after = monthRows(fx, "2026-07");
    ok(saved.decoded.includes("msg=budget_saved") && after.includes("식비=600000") && after.includes("교통=260000") && after.includes("카페/간식=180000"), `S3 ${label}: 최신 폼으로 저장하면 바꾼 칸만 달라지고 나머지 예산은 남는다`);
  });
}

// ── S4 키워드 일괄 편집기 ───────────────────────────────────
const decodeHtml = (value) => String(value || "").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const keywordForm = (html) => {
  const form = html.match(/<form method="post" action="\/my\/category-keywords\/bulk-save"[\s\S]*?<\/form>/)?.[0] || "";
  const base = new URLSearchParams();
  for (const m of form.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"\/>/g)) base.append(m[1], decodeHtml(m[2]));
  const boxes = [...form.matchAll(/<details class="kwBox" data-type="([^"]*)" data-name="([^"]*)" data-orig="([^"]*)"[\s\S]*?<input type="hidden" class="kwHidden" value="([^"]*)"\/>/g)]
    .map((m) => ({ type: decodeHtml(m[1]), name: decodeHtml(m[2]), orig: decodeHtml(m[3]), value: decodeHtml(m[4]) }));
  return { found: !!form, base, boxes };
};
// 브라우저의 저장 스크립트처럼 카드마다 kw_type·kw_name·kw_keywords·kw_orig 를 붙인다.
const keywordSubmit = ({ base, boxes }, edits = {}, { withOrig = true } = {}) => {
  const fields = new URLSearchParams(base);
  for (const box of boxes) {
    fields.append("kw_type", box.type);
    fields.append("kw_name", box.name);
    fields.append("kw_keywords", Object.prototype.hasOwnProperty.call(edits, box.name) ? edits[box.name] : box.value);
    if (withOrig) fields.append("kw_orig", box.orig);
  }
  return fields;
};
await fixture(async (fx) => {
  const key = "category_keywords:house-home";
  const path = "/keyword-guide?household_id=house-home&month=2026-07";
  const action = "/my/category-keywords/bulk-save";
  const stored = () => JSON.parse(settingValue(fx, key) || "{}");
  putSetting(fx, key, JSON.stringify({ "expense::식비": ["김밥천국", "배민", "구내식당"], "expense::교통": ["티머니", "주차"] }));

  fx.db.__fail_settings_read_key = key;
  const failed = await page(fx, path);
  fx.db.__fail_settings_read_key = "";
  ok(/키워드를 불러오지 못했습니다/.test(failed.html) && !keywordForm(failed.html).found, "S4 키워드를 못 읽으면 예시로 채운 편집기를 그리지 않는다");

  const fresh = keywordForm((await page(fx, path)).html);
  const food = fresh.boxes.find((box) => box.name === "식비");
  ok(fresh.found && food?.orig === "김밥천국,배민,구내식당" && fresh.boxes.length > 5, "S4 카드마다 그릴 때의 키워드(data-orig)를 싣는다");

  const before = settingValue(fx, key);
  const stale = await post(fx, action, keywordSubmit(fresh, {}, { withOrig: false }));
  ok(stale.decoded.includes("err=keyword_form_stale") && settingValue(fx, key) === before, "S4 kw_orig 가 없는 예전 화면의 저장은 거절한다");
  const unchanged = await post(fx, action, keywordSubmit(fresh));
  ok(unchanged.decoded.includes("msg=category_keywords_unchanged") && settingValue(fx, key) === before, "S4 아무 카드도 바꾸지 않으면 저장하지 않는다(예시 키워드를 저장하지 않는다)");

  const changed = await post(fx, action, keywordSubmit(fresh, { 식비: "김밥천국,배민,구내식당,도시락" }));
  const afterChange = stored();
  ok(changed.decoded.includes("msg=category_keywords_saved") && afterChange["expense::식비"].includes("도시락") && afterChange["expense::교통"].join() === "티머니,주차" && Object.keys(afterChange).length === 2, "S4 바꾼 카드만 저장하고 다른 분류는 그대로 둔다");

  const opened = keywordForm((await page(fx, path)).html);
  putSetting(fx, key, JSON.stringify({ ...stored(), "expense::교통": ["티머니", "주차", "카카오T"] }));
  const conflict = await post(fx, action, keywordSubmit(opened, { 교통: "티머니" }));
  ok(conflict.decoded.includes("err=category_keywords_conflict") && stored()["expense::교통"].includes("카카오T"), "S4 화면을 연 뒤 다른 곳에서 바뀐 분류는 덮어쓰지 않는다");

  const toClear = keywordForm((await page(fx, path)).html);
  await post(fx, action, keywordSubmit(toClear, { 교통: "" }));
  const reopened = keywordForm((await page(fx, path)).html);
  ok(Array.isArray(stored()["expense::교통"]) && stored()["expense::교통"].length === 0 && reopened.boxes.find((box) => box.name === "교통")?.orig === "", "S4 비운 분류는 빈 목록으로 남고 예시 키워드를 다시 그리지 않는다");
  await post(fx, action, keywordSubmit(reopened, { 식비: "김밥천국" }));
  ok(stored()["expense::교통"].length === 0 && stored()["expense::식비"].join() === "김밥천국", "S4 다른 카드를 저장해도 비운 분류에 예시가 되살아나지 않는다");

  putSetting(fx, key, JSON.stringify({ "expense::식비": Array.from({ length: 20 }, (_, index) => `키워드${index + 1}`) }));
  const many = keywordForm((await page(fx, path)).html);
  ok(many.boxes.find((box) => box.name === "식비")?.orig.split(",").length === 20, "S4 저장된 키워드가 16개를 넘어도 모두 그려 편집 한 번에 사라지지 않는다");
});

// ── S5 자산 ─────────────────────────────────────────────────
await fixture(async (fx) => {
  const key = "asset_history:house-home";
  putSetting(fx, key, JSON.stringify({
    "2026-04": { asset_total: 4000000, liability_total: 0, net_worth: 4000000, saved_at: "2026-04-30T00:00:00Z" },
    "2026-05": { asset_total: 4500000, liability_total: 0, net_worth: 4500000, saved_at: "2026-05-31T00:00:00Z" },
    "2026-06": { asset_total: 5000000, liability_total: 0, net_worth: 5000000, saved_at: "2026-06-30T00:00:00Z" },
  }));
  fx.db.__fail_settings_read_key = key;
  const res = await post(fx, "/admin/payment-asset/update", { household_id: "house-home", month: "2026-07", id: "asset-2", mode: "balance", balance: "5300000" });
  fx.db.__fail_settings_read_key = "";
  const months = Object.keys(JSON.parse(settingValue(fx, key)));
  ok(months.join() === "2026-04,2026-05,2026-06" && /snapshot_deferred/.test(res.decoded), "S5 순자산 기록을 못 읽으면 이번 달 한 칸으로 덮어쓰지 않고 갱신을 미룬다");
});
await fixture(async (fx) => {
  const key = "payment_assets:house-home";
  fx.db.__missing_rpcs = ["accountbook_mutate_payment_assets_v2271", "accountbook_mutate_payment_assets_v2280"];
  const before = settingValue(fx, key);
  fx.db.__fail_settings_read_key = key;
  await post(fx, "/admin/payment-asset/create", { household_id: "house-home", month: "2026-07", name: "새통장", kind: "bank_account", balance: "1000" });
  fx.db.__fail_settings_read_key = "";
  ok(settingValue(fx, key) === before, "S5 원자 RPC 가 없을 때 자산 목록을 못 읽으면 목록을 통째로 다시 쓰지 않는다");
  await post(fx, "/admin/payment-asset/create", { household_id: "house-home", month: "2026-07", name: "새통장", kind: "bank_account", balance: "1000" });
  const names = JSON.parse(settingValue(fx, key)).map((item) => item.name);
  ok(names.includes("국민카드") && names.includes("새통장"), "S5 읽기가 되면 원자 RPC 가 없어도 기존 목록에 더해 저장한다");
});

// ── S2 계정 통합의 단톡방 연결 ──────────────────────────────
for (const loseLegacyRead of [true, false]) {
  await fixture(async (fx) => {
    fx.env.ADMIN_API_TOKEN = "qa-admin-token";
    const restore = intercept(({ url }) => (url.pathname.endsWith("/rpc/accountbook_merge_users_v227")
      ? new Response(JSON.stringify([{ merged: true }]), { status: 200, headers: { "content-type": "application/json" } })
      : null));
    putSetting(fx, "kakao_group_links", JSON.stringify({
      "legacy-room-A": { household_id: "house-trip", household_name: "7월 제주여행", invite_code: "TRIP2265", linked_by: "user-bin", linked_at: "2026-01-01T00:00:00Z" },
      "legacy-room-C": { household_id: "house-home", household_name: "우리집 생활비", invite_code: "HOME2265", linked_by: "user-wifi", linked_at: "2026-01-01T00:00:00Z" },
    }));
    putSetting(fx, kakaoGroupLinkItemSettingsKey("room-B"), JSON.stringify({ group_key: "room-B", household_id: "house-home", linked_by: "user-wifi" }));
    if (loseLegacyRead) fx.db.__fail_settings_read_key = "kakao_group_links";
    await app.fetch(new Request(`${BASE}/admin/identity/merge`, {
      method: "POST",
      headers: { authorization: "Bearer qa-admin-token", "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin" },
      body: new URLSearchParams({ household_id: "house-home", primary_user_id: "user-bin", secondary_user_id: "user-wifi", confirm_text: "통합" }).toString(),
    }), fx.env, ctx);
    fx.db.__fail_settings_read_key = "";
    restore();
    const legacy = JSON.parse(settingValue(fx, "kakao_group_links"));
    const roomB = JSON.parse(settingValue(fx, kakaoGroupLinkItemSettingsKey("room-B")));
    if (loseLegacyRead) {
      ok(legacy["legacy-room-A"]?.household_id === "house-trip" && legacy["legacy-room-C"]?.linked_by === "user-wifi", "S2 옛 연결 맵을 못 읽으면 옛 맵을 다시 쓰지 않아 방 연결이 남는다");
    } else {
      ok(legacy["legacy-room-A"]?.linked_by === "user-bin" && legacy["legacy-room-C"]?.linked_by === "user-bin" && !legacy["room-B"], "S2 옛 맵은 linked_by 만 바꾸고 방별 행을 옛 맵에 섞지 않는다");
    }
    ok(roomB.linked_by === "user-bin" && roomB.household_id === "house-home", `S2 방별 연결 행의 linked_by 를 통합한 계정으로 옮긴다(${loseLegacyRead ? "옛 맵 읽기 실패" : "정상"})`);
  });
}

// ── S8 관리자 비밀번호 ──────────────────────────────────────
await fixture(async (fx) => {
  fx.env.ADMIN_PASSWORD = "initial-pass-123";
  fx.env.ADMIN_SESSION_SECRET = "qa-admin-session-secret";
  const salt = "legacysalt";
  putSetting(fx, "admin_password_hash", `${salt}:${createHash("sha256").update(`${salt}:changed-pass-456`).digest("hex")}`);
  const login = (password) => post(fx, "/login", { password }, { cookie: "" });
  const oldPassword = await login("initial-pass-123");
  const newPassword = await login("changed-pass-456");
  ok(oldPassword.status === 401 && newPassword.status === 303 && /ab_admin=/.test(newPassword.setCookie), "S8 바꾼 관리자 비밀번호만 통하고 환경변수의 옛 비밀번호는 거절한다");
  fx.db.__fail_settings_read_key = "admin_password_hash";
  const failedRead = await login("initial-pass-123");
  fx.db.__fail_settings_read_key = "";
  ok(failedRead.status === 503 && !/ab_admin=[^;]/.test(failedRead.setCookie), "S8 바꾼 비밀번호를 못 읽으면 옛 비밀번호로 열지 않고 503 으로 닫는다");
});

// ── S7 설정에 저장한 사용자 분류 ────────────────────────────
await fixture(async (fx) => {
  fx.env.ADMIN_API_TOKEN = "qa-admin-token";
  const key = "custom_categories:house-home";
  putSetting(fx, key, JSON.stringify([
    { id: "settings_a", household_id: "house-home", name: "육아", type: "expense", sort_order: 100, keywords: [] },
    { id: "settings_b", household_id: "house-home", name: "반려동물", type: "expense", sort_order: 100, keywords: [] },
  ]));
  const adminPost = (path, values) => app.fetch(new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { authorization: "Bearer qa-admin-token", "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin" },
    body: new URLSearchParams(values).toString(),
  }), fx.env, ctx);
  const names = () => JSON.parse(settingValue(fx, key) || "[]").map((item) => item.name).join(",");
  fx.db.__fail_settings_read_key = key;
  await adminPost("/admin/category/delete", { household_id: "house-home", id: "settings_b" });
  const restore = intercept(({ url, method }) => (url.pathname.endsWith("/accountbook_categories") && method === "POST" ? failure(503, "simulated table failure") : null));
  await adminPost("/admin/category/create", { household_id: "house-home", name: "취미", type: "expense" });
  restore();
  fx.db.__fail_settings_read_key = "";
  ok(names() === "육아,반려동물", "S7 분류 목록을 못 읽으면 삭제·추가가 기존 목록을 덮어쓰지 않는다");
  await adminPost("/admin/category/delete", { household_id: "house-home", id: "settings_b" });
  ok(names() === "육아", "S7 읽기가 되면 고른 분류만 지운다");
});

// ── S9 삭제된 가계부의 목표·챌린지 ──────────────────────────
await fixture(async (fx) => {
  // 접근 확인을 지난 뒤 잠금을 잡는 순간 가계부가 지워진 상황을 만든다.
  const restore = intercept(async ({ url, init }) => {
    if (url.pathname.endsWith("/rpc/accountbook_claim_operation") && String(init.body || "").includes("household-settings-rmw:house-trip")) {
      fx.db.households = fx.db.households.filter((row) => row.id !== "house-trip");
    }
    return null;
  });
  const goal = await api(fx, "/u/api/goals", "POST", { household: "house-trip", action: "create", name: "여행 적금", target: 1000000 });
  restore();
  ok(goal.status === 404 && goal.data?.reason === "household_missing" && !settingValue(fx, "goals:v5:house-trip"), "S9 지워진 가계부에는 목표 설정을 다시 만들지 않는다");
});
await fixture(async (fx) => {
  const restore = intercept(async ({ url, init }) => {
    if (url.pathname.endsWith("/rpc/accountbook_claim_operation") && String(init.body || "").includes("household-settings-rmw:house-trip")) {
      fx.db.households = fx.db.households.filter((row) => row.id !== "house-trip");
    }
    return null;
  });
  await post(fx, "/my/report-challenge/save", { household_id: "house-trip", month: "2026-07", title: "무지출 도전", challenge_type: "no_spend_days", target_days: "3", start_date: "2026-07-01", target_date: "2026-07-10", enabled: "1" });
  restore();
  ok(!fx.db.accountbook_settings.some((row) => String(row.key || "").includes("house-trip") && /challenge/i.test(String(row.key || ""))), "S9 지워진 가계부에는 챌린지 설정을 다시 만들지 않는다");
});

// ── S10 관리자 JSON 백업 ────────────────────────────────────
await fixture(async (fx) => {
  fx.env.ADMIN_API_TOKEN = "qa-admin-token";
  const exportJson = () => app.fetch(new Request(`${BASE}/admin/export/json?month=2026-07&household_id=house-home`, { headers: { authorization: "Bearer qa-admin-token" } }), fx.env, ctx);
  fx.db.__fail_settings_read_key = "reserve_plans:house-home";
  const failed = await exportJson();
  fx.db.__fail_settings_read_key = "";
  const failedBody = await failed.json().catch(() => ({}));
  ok(failed.status === 503 && failedBody.error === "backup_read_failed", "S10 백업에 넣을 자료를 못 읽으면 빈 값이 든 백업 파일을 만들지 않는다");
  const good = await exportJson();
  const payload = await good.json().catch(() => ({}));
  ok(good.status === 200 && payload.counts?.reserve_plans >= 1 && payload.counts?.budgets >= 1, "S10 모두 읽으면 백업 파일을 만든다");
});

// ── S11 홈 배치 편집기 ──────────────────────────────────────
await fixture(async (fx) => {
  const key = "home-layout:v1:house-home:user-bin";
  putSetting(fx, key, JSON.stringify({ reports: { order: ["reserve", "budget", "pace", "where"], hidden: ["where"] }, shortcuts: { order: ["menu", "add", "budgets"], hidden: [] } }));
  fx.db.__fail_settings_read_key = key;
  const failed = await page(fx, "/home-layout?household_id=house-home&month=2026-07");
  fx.db.__fail_settings_read_key = "";
  ok(/홈 구성을 불러오지 못해 지금은 바꿀 수 없습니다/.test(failed.html) && !/action="\/home-layout\/save"/.test(failed.html), "S11 홈 구성을 못 읽으면 기본값으로 채운 저장 폼을 그리지 않는다");
  const fresh = await page(fx, "/home-layout?household_id=house-home&month=2026-07");
  ok(/action="\/home-layout\/save"/.test(fresh.html), "S11 읽기가 되면 홈 구성 폼을 그린다");
});

// ── S6 카카오 지난달 예산 복사 ──────────────────────────────
await withClock("2026-08-15", async () => {
  await fixture(async (fx) => {
    await skill(fx, "안녕");
    await skill(fx, "2");
    await skill(fx, "예산 설정");
    const restore = failBudgetReads("2026-08");
    const failedReply = await skill(fx, "지난달 예산 복사");
    restore();
    ok(/확인하지 못해 복사하지 않았어요/.test(failedReply) && monthRows(fx, "2026-08") === "", "S6 이번 달 예산을 못 읽으면 지난달 예산을 복사하지 않는다");

    fx.db.accountbook_budgets.push({ id: "budget-aug-food", household_id: "house-home", month: "2026-08", category: "식비", amount: 900000, created_at: "2026-08-01T00:00:00Z" });
    await skill(fx, "예산 설정");
    const configuredReply = await skill(fx, "지난달 예산 복사");
    ok(/2026-08 예산이 이미 있어 지난달 예산을 복사하지 않았어요/.test(configuredReply) && monthRows(fx, "2026-08") === "식비=900000", "S6 이번 달 예산이 이미 있으면 덮어쓰지 않고 이유를 말한다");

    fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((row) => row.month !== "2026-08");
    await skill(fx, "예산 설정");
    const copiedReply = await skill(fx, "지난달 예산 복사");
    const copied = monthRows(fx, "2026-08");
    ok(/2026-07 예산 \d+개를 2026-08로 복사했어요/.test(copiedReply) && copied.includes("식비=800000") && copied.includes("교통=250000"), "S6 이번 달 예산이 없으면 지난달 예산을 복사한다");
  });
});

done();

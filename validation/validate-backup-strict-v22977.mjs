// V22.9.77 백업 엄격 조회 검사 (V77 N-15, 2026-10-24 ASTRA 분석 1).
// 관리자 JSON 백업(/admin/export/json)은 V22.9.34 S10 부터 '못 읽은 자료가 있으면 파일을 만들지 않는다'. 그런데 분류·키워드
// (fetchCustomCategories)와 구성원 별명(fetchMemberAliasMap)은 읽기 실패를 빈 목록으로 바꿔, 기본 분류만 들었거나 별명이 빠진
// 파일이 200 으로 내려받아졌다. 운영은 분류 표가 없는 모드라 분류·키워드가 모두 설정 값에서 온다.
// 분류 표가 있는 모드와 없는 모드(404 PGRST205)를 하네스 모드와 상관없이 둘 다 돌린다. 네트워크는 쓰지 않는다.
// 사용: node validation/validate-backup-strict-v22977.mjs
import { app, BASE, ctx, counter, fixture, intercept, page, putSetting } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.77 백업 엄격 조회 검사 통과");
const HH = "house-home";
const EXPORT = `/admin/export/json?household_id=${HH}&month=2026-10`;

// /login 은 클라이언트마다 1분에 8번까지만 받으므로 로그인마다 다른 문서용 주소를 쓴다.
let loginSeq = 0;
async function adminCookie(fx) {
  fx.env.ADMIN_PASSWORD = "admin-pass";
  fx.env.ADMIN_SESSION_SECRET = "admin-secret";
  loginSeq += 1;
  const response = await app.fetch(new Request(`${BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", "cf-connecting-ip": `198.51.100.${200 + loginSeq}` },
    body: new URLSearchParams({ password: "admin-pass", return_to: "/backup" }).toString(),
  }), fx.env, ctx);
  return ((response.headers.get("set-cookie") || "").match(/ab_admin=[^;]+/) || [""])[0];
}

const settingsRead = (url, method, key) => method === "GET" && url.pathname.endsWith("/accountbook_settings") && decodeURIComponent(url.search).includes(key);
const outage = () => new Response(JSON.stringify({ message: "synthetic outage" }), { status: 503, headers: { "content-type": "application/json" } });
async function exportWith(fx, cookie, handler) {
  const stop = handler ? intercept(handler) : () => {};
  try {
    const response = await page(fx, EXPORT, { cookie });
    let json = null;
    try { json = JSON.parse(response.html); } catch (_) {}
    return { status: response.status, json };
  } finally { stop(); }
}

for (const categoriesPresent of [false, true]) {
  const mode = categoriesPresent ? "분류 표 있음" : "분류 표 없음(운영)";
  await fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    ok(!!cookie, `${mode}: 관리자 로그인`);
    if (categoriesPresent) fx.db.accountbook_categories.push({ id: "n15-pet", household_id: HH, name: "반려동물용품", type: "expense", sort_order: 1, created_at: "2026-10-01T00:00:00Z" });
    else putSetting(fx, `custom_categories:${HH}`, JSON.stringify([{ id: "n15-pet", name: "반려동물용품", type: "expense" }]));
    putSetting(fx, `category_keywords:${HH}`, JSON.stringify({ "expense::반려동물용품": ["사료", "간식"] }));
    putSetting(fx, `member_aliases:${HH}`, JSON.stringify({ "user-wifi": "살림 담당" }));

    const normal = await exportWith(fx, cookie);
    eq(normal.status, 200, `${mode}: 읽기가 모두 되면 백업 파일을 만든다`);
    const pet = (normal.json?.categories?.[HH] || []).find((row) => row.name === "반려동물용품");
    ok(!!pet && ["사료", "간식"].every((word) => (pet.keywords || []).includes(word)), `${mode}: 직접 만든 분류와 키워드가 백업에 들어 있다 (${JSON.stringify(pet?.keywords || null)})`);
    eq((normal.json?.household_members?.[HH] || []).find((row) => row.user_id === "user-wifi")?.display_alias, "살림 담당", `${mode}: 구성원 별명이 백업에 들어 있다`);

    const keywords = await exportWith(fx, cookie, ({ url, method }) => (settingsRead(url, method, `category_keywords:${HH}`) ? outage() : null));
    ok(keywords.status === 503 && keywords.json?.error === "backup_read_failed", `${mode}: 분류·키워드 설정을 못 읽으면 백업 파일을 만들지 않는다 (${keywords.status} ${keywords.json?.error || ""})`);

    const aliases = await exportWith(fx, cookie, ({ url, method }) => (settingsRead(url, method, `member_aliases:${HH}`) ? outage() : null));
    ok(aliases.status === 503 && aliases.json?.error === "backup_read_failed", `${mode}: 구성원 별명을 못 읽으면 백업 파일을 만들지 않는다 (${aliases.status} ${aliases.json?.error || ""})`);

    if (categoriesPresent) {
      const table = await exportWith(fx, cookie, ({ url, method }) => (method === "GET" && url.pathname.endsWith("/accountbook_categories") ? outage() : null));
      ok(table.status === 503 && table.json?.error === "backup_read_failed", `${mode}: 분류 표 읽기가 실패하면(표 없음 PGRST205 가 아님) 설정 값으로 대신하지 않고 파일을 만들지 않는다 (${table.status})`);
    }

    // 백업센터 화면(개수 표시)은 예전처럼 읽기 실패에도 열린다. 엄격 조회는 내려받는 파일에만 쓴다.
    const stop = intercept(({ url, method }) => (settingsRead(url, method, `category_keywords:${HH}`) ? outage() : null));
    let center;
    try { center = await page(fx, `/backup?household_id=${HH}&month=2026-10`, { cookie }); } finally { stop(); }
    eq(center.status, 200, `${mode}: 분류 설정을 못 읽어도 백업센터 화면은 열린다`);
  }, { categoriesPresent });
}

done();

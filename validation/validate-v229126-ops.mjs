// V22.9.126 결함 수정 판 — 운영자(관리자) 화면 묶음 검사. 고친 동작과 고치기 전 결함 장면을 함께 본다.
//   FC-24  관리자 /households(가계부 60개)·/identity-audit(참여자 50명)이 DB 호출 예산(50회) 안에서 열리고, 세지 못한 줄은 ‘확인 못 함’
//   FC-25  옛 관리자 화면(/?legacy=1) 수정 모달에 가계부·달·돌아갈 화면을 실어 저장이 되고 보던 화면으로 돌아온다
//   FC-26  백업 복구 비교·후보·최종 확인·적용이 백업(계획)의 가계부와 고른 가계부가 다르면 멈춘다. 비교는 고른 가계부의 기록만. 복구 크기 안내
//   FC-27  a 이력·되돌리기 후보가 my_import 를 센다 · b 되돌리기 최종 확인 묶음 읽기·확인 불가 · c 최종 확인 범위 = 적용 범위
//          d 백업 JSON 에 초대코드·카카오 키 없음 · e 운영센터 카드 · f ‘전체 가계부’ 빠른 입력 안내 · g 이력 시각 KST
//          i 가계부 만들기·초대코드 재발급·프로필 저장 실패 안내 · j 한 번에 18건 · k /analysis·/calendar 없는 가계부
// 네트워크를 쓰지 않는다(메모리 픽스처). 실행: node validation/validate-v229126-ops.mjs  (분류 표 없는 운영 모드: AB_QA_CATEGORIES_ABSENT=1)
import { app, BASE, ctx, counter, fixture, intercept, failure, page, post } from "./lib-audit-v22934.mjs";

const t = counter("V22.9.126 ops screens");
const failures = [];
const ok = (value, message) => { if (value) t.ok(true, message); else failures.push(message); };
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
async function section(name, task) {
  try { await task(); } catch (error) { failures.push(`${name}: 예외 ${String(error?.stack || error).slice(0, 600)}`); }
}

const HOME = "house-home";
const TRIP = "house-trip";
const BIN = "11111111-1111-4111-8111-111111111111";
const WIFI = "22222222-2222-4222-8222-222222222222";
const GUEST = "44444444-4444-4444-8444-444444444444";
const decode = (text) => String(text || "").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const textOf = (html) => decode(String(html || "").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const metrics = (html) => Object.fromEntries([...String(html).matchAll(/<div class="metric"><span>([^<]+)<\/span><b>([^<]+)<\/b>/g)].map((m) => [m[1], m[2]]));
const selectedHousehold = (html) => (String(html).match(/<select name="household_id"[^>]*>([\s\S]*?)<\/select>/)?.[1].match(/<option value="([^"]*)"[^>]*\bselected\b/) || [, ""])[1];

let adminSeq = 0;
async function adminCookie(fx) {
  fx.env.ADMIN_PASSWORD = "admin-pass";
  fx.env.ADMIN_SESSION_SECRET = "admin-secret";
  adminSeq += 1;
  const response = await app.fetch(new Request(`${BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", "cf-connecting-ip": `198.51.100.${(adminSeq % 200) + 20}` },
    body: new URLSearchParams({ password: "admin-pass", return_to: "/backup" }).toString(),
  }), fx.env, ctx);
  return ((response.headers.get("set-cookie") || "").match(/ab_admin=[^;]+/) || [""])[0];
}
// 픽스처 저장소(mock.supabase.co)로 간 요청 = 한 요청의 DB 호출.
async function dbCalls(task) {
  const calls = [];
  const stop = intercept(({ url, method }) => { if (url.hostname === "mock.supabase.co") calls.push(`${method} ${url.pathname}${decodeURIComponent(url.search)}`); return null; });
  try { return { result: await task(), calls }; } finally { stop(); }
}
async function upload(fx, cookie, path, fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value && typeof value === "object" && "file" in value) form.set(key, new File([value.file], "file.json", { type: "application/json" }));
    else form.set(key, String(value));
  }
  const response = await app.fetch(new Request(`${BASE}${path}`, { method: "POST", headers: { cookie, origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html" }, body: form }), fx.env, ctx);
  return { status: response.status, html: await response.text() };
}
// 관리자 복구는 지출자 id 가 UUID 꼴이어야 저장된다. BIN 은 두 가계부 모두에, GUEST 는 7월 제주여행(TRIP)에만 있다.
function uuidFixture(fx) {
  for (const [name, rows] of Object.entries(fx.db)) {
    if (Array.isArray(rows)) fx.db[name] = JSON.parse(JSON.stringify(rows).replaceAll("user-bin", BIN).replaceAll("user-wifi", WIFI));
  }
  fx.db.users.push({ id: GUEST, kakao_user_key: "kakao_login:9999", nickname: "Guest", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: TRIP, user_id: GUEST, role: "member", created_at: "2026-07-03T00:00:00.000Z" });
  fx.db.transactions.push(
    { id: "aaaaaaaa-0000-4000-8000-000000000001", household_id: TRIP, user_id: BIN, transaction_date: "2026-07-13", type: "expense", amount: 64000, category: "식비", memo: "흑돼지", payment_method: "국민카드", source: "kakao", raw_text: "흑돼지 64000" },
    { id: "aaaaaaaa-0000-4000-8000-000000000002", household_id: TRIP, user_id: GUEST, transaction_date: "2026-07-14", type: "expense", amount: 33000, category: "교통", memo: "렌터카 주유", payment_method: "현금", source: "kakao", raw_text: "주유 33000" },
  );
}
const candidatesOf = (html) => { try { return JSON.parse(decode((String(html).match(/id="candidateJson" value="([^"]*)"/) || [, "[]"])[1])); } catch (_) { return null; } };
// 후보 화면의 ‘선택 계획 JSON 저장’ 단추가 만드는 파일(전체 선택)과 같은 모양.
function planFromCandidatePage(html) {
  const householdId = decode((String(html).match(/id="candidateJson"[^>]*data-household-id="([^"]*)"/) || [, ""])[1]);
  const selected = candidatesOf(html) || [];
  return { householdId, text: JSON.stringify({ app: "kakao-accountbook", version: "V19.8-BUDGET-ALERT", created_at: "2026-07-20T03:00:00.000Z", mode: "candidate_plan_only_no_db_write", household_id: householdId, selected_count: selected.length, selected }, null, 2) };
}
const legacyPlan = (selected, extra = {}) => JSON.stringify({ app: "kakao-accountbook", mode: "candidate_plan_only_no_db_write", selected_count: selected.length, selected, ...extra });
const applyFields = (householdId, month = "2026-07") => ({ household_id: householdId, month, admin_password: "admin-pass", confirm_text: "가져오기 적용" });

const previousClock = globalThis.__AB_QA_FIXED_NOW_MS;
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-07-20T12:00:00+09:00");
try {
  // ── FC-24 관리자 /households: 가계부 60개 ───────────────────────────────────────────
  await section("FC-24 households", () => fixture(async (fx) => {
    for (let i = fx.db.households.length; i < 60; i += 1) {
      const id = `hh-${String(i).padStart(3, "0")}`;
      fx.db.households.push({ id, name: `가계부 ${i}`, invite_code: `INV${String(i).padStart(5, "0")}`, created_at: `2026-08-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00.000Z` });
      fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "owner", created_at: "2026-08-01T00:00:00.000Z" });
      fx.db.transactions.push({ id: `tx-${id}`, household_id: id, user_id: "user-bin", transaction_date: "2026-08-03", type: "expense", amount: 1000 + i, category: "식비", memo: `m${i}`, payment_method: "현금", source: "web" });
    }
    const cookie = await adminCookie(fx);
    ok(!!cookie, "FC-24 관리자 로그인");
    const plain = await dbCalls(() => page(fx, "/households", { cookie }));
    eq(plain.result.status, 200, "FC-24 가계부 60개에서 관리자 /households 가 열린다(예전에는 45개부터 500 안전모드)");
    ok(plain.calls.length <= 50, `FC-24 DB 호출이 예산 50회 안이다 (${plain.calls.length}회)`);
    const uncounted = (plain.result.html.match(/거래 확인 못 함/g) || []).length;
    ok(uncounted > 0 && uncounted < 60, `FC-24 세지 못한 가계부는 ‘거래 확인 못 함’ 이다 (${uncounted}곳)`);
    ok(textOf(plain.result.html).includes(`가계부 ${uncounted}곳은 거래 수를 세지 않았습니다`), "FC-24 세지 않은 가계부 수를 목록 위에 알린다");
    ok(/참여자 1명 · 거래 1건/.test(plain.result.html), "FC-24 예산 안에서는 거래 수를 그대로 센다");
    const picked = await dbCalls(() => page(fx, "/households?household_id=hh-059", { cookie }));
    eq(picked.result.status, 200, "FC-24 마지막 가계부를 고른 화면도 열린다");
    ok(picked.calls.length <= 50, `FC-24 고른 화면의 DB 호출도 50회 안이다 (${picked.calls.length}회)`);
    ok(/href="\/households\?household_id=hh-059"><b>가계부 59<\/b><span class="muted">참여자 1명 · 거래 1건<\/span>/.test(picked.result.html), "FC-24 고른 가계부는 먼저 세어 거래 수가 보인다");
    // 첫 셈이 실패하면 나머지는 세지 않고 ‘확인 못 함’ — 500 이 아니다.
    const stop = intercept(({ url, method }) => (method === "HEAD" && url.pathname === "/rest/v1/transactions" ? failure(503) : null));
    let broken;
    try { broken = await page(fx, "/households", { cookie }); } finally { stop(); }
    eq(broken.status, 200, "FC-24 거래 수 읽기가 실패해도 화면은 열린다");
    eq((broken.html.match(/거래 확인 못 함/g) || []).length, 60, "FC-24 읽지 못한 가계부는 모두 ‘거래 확인 못 함’ 이다");
    // 고치기 전 장면: 가계부마다 세면 60개에서 한 요청이 50회를 넘는다(예산 50 에서는 그 순간 500 이었다). 예산을 900 으로 열어 확인한다.
    fx.env.DB_CALL_BUDGET = "900";
    const every = await dbCalls(() => page(fx, "/households", { cookie }));
    delete fx.env.DB_CALL_BUDGET;
    ok(every.result.status === 200 && !every.result.html.includes("거래 확인 못 함") && every.calls.length > 50, `FC-24 고치기 전 장면: 60곳을 모두 세면 DB 호출이 ${every.calls.length}회로 50회를 넘는다`);
  }));

  // ── FC-24 /identity-audit: 참여자 50명 ─────────────────────────────────────────────
  await section("FC-24 identity-audit", () => fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    const small = await page(fx, `/identity-audit?household_id=${HOME}`, { cookie });
    const unreadable = (html) => (textOf(html).match(/읽지 못함/g) || []).length;
    for (let i = fx.db.household_members.filter((m) => m.household_id === HOME).length; i < 50; i += 1) {
      const uid = `user-room-${String(i).padStart(3, "0")}`;
      fx.db.users.push({ id: uid, kakao_user_key: `botkey-${i}-abcdefgh`, nickname: `손님${i}`, created_at: "2026-08-01T00:00:00.000Z" });
      fx.db.household_members.push({ household_id: HOME, user_id: uid, role: "member", created_at: "2026-08-02T00:00:00.000Z" });
    }
    const big = await dbCalls(() => page(fx, `/identity-audit?household_id=${HOME}`, { cookie }));
    eq(big.result.status, 200, "FC-24 참여자 50명에서 /identity-audit 이 열린다(예전에는 47명부터 500)");
    ok(big.calls.length <= 50, `FC-24 DB 호출이 50회 안이다 (${big.calls.length}회)`);
    const cells = (big.result.html.match(/<td>확인 못 함<\/td>/g) || []).length;
    ok(cells > 0 && cells < 50, `FC-24 세지 못한 참여자 줄은 ‘확인 못 함’ 이다 (${cells}줄)`);
    ok((big.result.html.match(/· 거래 확인 못 함<\/option>/g) || []).length === cells * 2, "FC-24 통합 선택 칸에도 ‘거래 확인 못 함’ 으로 보인다(주·보조 두 칸)");
    ok(textOf(big.result.html).includes(`참여자 ${cells}명은 거래 수를 세지 않았습니다`), "FC-24 세지 않은 참여자 수를 알린다");
    ok(/<td>\d+건<\/td>/.test(big.result.html), "FC-24 예산 안의 참여자는 거래 수가 보인다");
    eq(unreadable(big.result.html), unreadable(small.html), "FC-24 계정 잇기 진단(DB 2회)은 예산을 남겨 두어 그대로 읽힌다");
    fx.env.DB_CALL_BUDGET = "900";
    const every = await dbCalls(() => page(fx, `/identity-audit?household_id=${HOME}`, { cookie }));
    delete fx.env.DB_CALL_BUDGET;
    ok(every.result.status === 200 && !every.result.html.includes("확인 못 함") && every.calls.length > 50, `FC-24 고치기 전 장면: 50명을 모두 세면 DB 호출이 ${every.calls.length}회로 50회를 넘는다`);
  }));

  // ── FC-25 옛 관리자 화면의 수정 모달 ───────────────────────────────────────────────
  await section("FC-25", () => fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    const screen = `/?legacy=1&tab=transactions&household_id=${HOME}&month=2026-07`;
    const legacy = await page(fx, screen, { cookie });
    eq(legacy.status, 200, "FC-25 옛 관리자 화면(기록 관리 탭)이 열린다");
    const modal = (legacy.html.match(/<form id="txEditModalForm"[\s\S]*?<\/form>/) || [""])[0];
    const names = [...modal.matchAll(/\bname="([^"]+)"/g)].map((m) => m[1]);
    ok(["household_id", "month", "return_to", "tab"].every((name) => names.includes(name)), `FC-25 모달 폼에 가계부·달·돌아갈 화면·탭 칸이 있다 (${names.join(",")})`);
    ok(["type", "category", "payment_method"].every((name) => names.filter((n) => n === name).length === 1) && !["q", "quality", "date", "group_by"].some((name) => names.includes(name)), "FC-25 필터 칸(type·q 등)은 싣지 않는다(모달의 type 과 겹치지 않는다)");
    const hidden = Object.fromEntries([...modal.matchAll(/<input type="hidden" name="(household_id|month|return_to|tab)" value="([^"]*)"\/>/g)].map((m) => [m[1], decode(m[2])]));
    eq(hidden.household_id, HOME, "FC-25 모달의 가계부 칸은 고른 가계부다");
    const button = (legacy.html.match(/onclick="openTxEdit\(this\)"([^>]*)>수정<\/button>/) || [, ""])[1];
    const data = Object.fromEntries([...button.matchAll(/data-([a-z]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));
    ok(!!data.id, `FC-25 수정 단추가 있다 (${data.id})`);
    // 브라우저처럼: openTxEdit 가 칸을 채운 뒤 폼의 칸만 보낸다.
    const submit = (withBase, amount) => {
      const body = new URLSearchParams();
      const values = { id: data.id, type: data.type || "expense", transaction_date: data.date, amount, category: data.category, payment_method: data.payment, user_id: data.user, memo: data.memo };
      const orig = { type: data.type || "expense", transaction_date: data.date, amount: data.amount, category: data.category, payment_method: data.payment, memo: data.memo, user_id: data.user };
      for (const name of names) {
        if (["household_id", "month", "return_to", "tab"].includes(name)) { if (withBase) body.append(name, hidden[name] ?? ""); continue; }
        body.append(name, name.startsWith("orig_") ? orig[name.slice(5)] ?? "" : values[name] ?? "");
      }
      return body;
    };
    const rowOf = () => fx.db.transactions.find((row) => row.id === data.id);
    const before = Number(rowOf()?.amount);
    // 고치기 전 장면: 가계부·달 칸 없이 보내면 ‘가계부를 선택하세요.’ 로 거절되고 기록은 그대로다.
    const old = await post(fx, "/admin/update", submit(false, String(before + 1111)), { cookie });
    ok(old.status === 303 && old.decoded.replace(/\+/g, " ").includes("가계부를 선택하세요."), `FC-25 고치기 전 장면: 가계부 칸이 없으면 ‘가계부를 선택하세요.’ (${old.decoded})`);
    eq(Number(rowOf()?.amount), before, "FC-25 고치기 전 장면: 기록은 바뀌지 않았다");
    const saved = await post(fx, "/admin/update", submit(true, String(before + 2222)), { cookie });
    ok(saved.status === 303 && saved.decoded.includes("msg=updated"), `FC-25 모달 저장이 성공한다 (${saved.decoded})`);
    ok(saved.decoded.startsWith("/?legacy=1") && saved.decoded.includes("tab=transactions") && saved.decoded.includes(`household_id=${HOME}`) && saved.decoded.includes("month=2026-07"), "FC-25 저장 뒤 보던 화면(같은 가계부·달·탭)으로 돌아온다");
    eq(Number(rowOf()?.amount), before + 2222, "FC-25 금액이 바뀌었다");
    eq(rowOf()?.type, data.type || "expense", "FC-25 구분(type)은 그대로다");
  }));

  // ── FC-26 백업 복구와 가계부 ───────────────────────────────────────────────────────
  await section("FC-26", () => fixture(async (fx) => {
    uuidFixture(fx);
    const cookie = await adminCookie(fx);
    const exported = await page(fx, `/admin/export/json?month=2026-07&household_id=${TRIP}`, { cookie });
    const backupB = exported.html;
    const parsedB = JSON.parse(backupB);
    // 고치기 전 장면의 조건: 백업은 TRIP 의 것이고, 그 안에 두 가계부 모두의 참여자(BIN)가 쓴 기록이 있어 지출자 판정만으로는 HOME 에 들어갔다.
    ok(parsedB.scope?.household_id === TRIP && parsedB.transactions.some((row) => row.user_id === BIN) && fx.db.household_members.some((m) => m.household_id === HOME && m.user_id === BIN), "FC-26 장면: TRIP 백업에 HOME 에도 있는 참여자의 기록이 있다");
    const selectPage = await page(fx, "/backup/select", { cookie });
    eq(selectedHousehold(selectPage.html), "", "FC-26 주소에 가계부가 없으면 후보 화면의 기본값은 첫 가계부가 아니라 ‘백업 파일의 가계부’ 다");
    ok(selectPage.html.includes('<option value="">백업 파일의 가계부</option>'), "FC-26 선택 칸 첫 줄이 ‘백업 파일의 가계부’ 다");
    eq(selectedHousehold((await page(fx, "/backup/compare", { cookie })).html), "", "FC-26 비교 화면의 기본값도 ‘백업 파일의 가계부’ 다");

    const compared = await upload(fx, cookie, "/backup/compare", { backup_file: { file: backupB }, household_id: HOME, month: "2026-07" });
    eq(compared.status, 400, "FC-26 TRIP 백업을 HOME 으로 비교하면 멈춘다");
    ok(textOf(compared.html).includes("‘7월 제주여행’ 가계부의 백업이라 고른 가계부(‘우리집 생활비’)와 다릅니다"), "FC-26 비교 화면이 두 가계부 이름과 이유를 알린다");
    eq(selectedHousehold(compared.html), TRIP, "FC-26 선택 칸을 백업의 가계부로 돌려 둔다");
    ok(!("신규 후보" in metrics(compared.html)), "FC-26 멈춘 비교는 결과 숫자를 보이지 않는다");
    const refused = await upload(fx, cookie, "/backup/select", { backup_file: { file: backupB }, household_id: HOME, month: "2026-07" });
    ok(refused.status === 400 && !refused.html.includes('id="candidateJson"') && selectedHousehold(refused.html) === TRIP, "FC-26 후보 화면도 멈추고 후보를 만들지 않는다");

    // TRIP 의 기록을 잃은 뒤 ‘백업 파일의 가계부’ 그대로 후보를 고른다 → 계획 파일에 그 가계부가 적힌다.
    const tripRows = fx.db.transactions.filter((row) => row.household_id === TRIP);
    fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== TRIP);
    const chosen = await upload(fx, cookie, "/backup/select", { backup_file: { file: backupB }, household_id: "", month: "2026-07" });
    const plan = planFromCandidatePage(chosen.html);
    ok(chosen.status === 200 && plan.householdId === TRIP && (candidatesOf(chosen.html) || []).length === tripRows.length, `FC-26 백업의 가계부로 후보를 고르면 계획에 그 가계부가 적힌다 (${plan.householdId}, ${(candidatesOf(chosen.html) || []).length}건)`);
    const finalWrong = await upload(fx, cookie, "/backup/final-check", { plan_file: { file: plan.text }, household_id: HOME, month: "2026-07", admin_password: "admin-pass" });
    ok(finalWrong.status === 400 && textOf(finalWrong.html).includes("이 계획 파일은 ‘7월 제주여행’ 가계부에서 만든 것이라") && selectedHousehold(finalWrong.html) === TRIP, "FC-26 최종 확인도 다른 가계부면 멈추고 선택 칸을 계획의 가계부로 돌린다");
    const homeBefore = fx.db.transactions.filter((row) => row.household_id === HOME).length;
    const applyWrong = await upload(fx, cookie, "/backup/apply", { plan_file: { file: plan.text }, ...applyFields(HOME) });
    ok(applyWrong.status === 400 && textOf(applyWrong.html).includes("아무 행도 저장하지 않았습니다"), "FC-26 적용도 다른 가계부면 멈춘다");
    eq(fx.db.transactions.filter((row) => row.household_id === HOME).length, homeBefore, "FC-26 HOME 에 아무 기록도 들어가지 않았다(예전에는 BIN 의 기록 2건이 들어갔다)");
    const applied = await upload(fx, cookie, "/backup/apply", { plan_file: { file: plan.text }, ...applyFields(TRIP) });
    eq(metrics(applied.html)["성공"], String(tripRows.length), "FC-26 같은 가계부로는 그대로 복구된다(GUEST 의 기록 포함)");
    const restored = fx.db.transactions.filter((row) => row.household_id === TRIP);
    eq(restored.length, tripRows.length, "FC-26 TRIP 기록 수가 돌아왔다");

    // FC-27a 복구 직후 이력·되돌리기 후보
    ok(restored.every((row) => row.source === "my_import"), "FC-27a 장면: 복구 적용은 source my_import 로 저장한다(backup_import_* 가 아니다)");
    const history = await page(fx, `/backup/import-history?month=2026-07&household_id=${TRIP}`, { cookie });
    eq(metrics(history.html)["가져오기 건수"], `${tripRows.length}건`, "FC-27a 복구 직후 가져오기 이력에 저장된 건수가 보인다(예전 0건)");
    const rollback = await page(fx, `/backup/rollback-candidates?month=2026-07&household_id=${TRIP}`, { cookie });
    eq(metrics(rollback.html)["되돌리기 후보"], `${tripRows.length}건`, "FC-27a 되돌리기 후보에도 보인다(예전 0건)");

    // 모든 가계부 백업: 고른 가계부의 기록만 비교하고, 가계부를 고르지 않으면 멈춘다.
    const all = await page(fx, "/admin/export/json?month=2026-07", { cookie });
    const allScope = JSON.parse(all.html).scope;
    ok(all.status === 200 && allScope.household_id === "" && allScope.household_scope === "all", "FC-26 모든 가계부 한 달 백업을 만든다");
    const allHome = await upload(fx, cookie, "/backup/select", { backup_file: { file: all.html }, household_id: HOME, month: "2026-07" });
    const allMetrics = metrics(allHome.html);
    ok(allHome.status === 200 && (candidatesOf(allHome.html) || []).length === 0 && allMetrics["신규 후보"] === "0", `FC-26 모든 가계부 백업을 HOME 으로 고르면 TRIP 기록은 후보가 되지 않는다(예전 3건) (${JSON.stringify(allMetrics)})`);
    ok(textOf(allHome.html).includes("다른 가계부의 기록") && textOf(allHome.html).includes("빼고 고른 가계부의 기록만 비교합니다"), "FC-26 다른 가계부의 기록을 뺐다고 알린다");
    const allCompare = await upload(fx, cookie, "/backup/compare", { backup_file: { file: all.html }, household_id: HOME, month: "2026-07" });
    eq(metrics(allCompare.html)["백업 거래"], String(fx.db.transactions.filter((row) => row.household_id === HOME && row.transaction_date.startsWith("2026-07")).length), "FC-26 비교의 ‘백업 거래’ 는 고른 가계부의 기록 수다");
    const allNone = await upload(fx, cookie, "/backup/select", { backup_file: { file: all.html }, household_id: "", month: "2026-07" });
    ok(allNone.status === 400 && textOf(allNone.html).includes("복구할 가계부를 하나 고른 뒤"), "FC-26 모든 가계부 백업은 가계부를 고르게 한다");

    // 백업센터의 복구 크기 안내(라우터가 /backup/* 본문을 64KB 에서 자른다).
    const center = textOf((await page(fx, `/backup?household_id=${HOME}&month=2026-07`, { cookie })).html);
    ok(center.includes("복구 단계(2~6)에 올릴 수 있는 파일은 약 64KB까지") && center.includes("거래 150건 안팎"), "FC-26 백업센터가 복구에 올릴 수 있는 크기(약 64KB, 한 달 150건 안팎)를 알린다");
    const bigRows = Array.from({ length: 400 }, (_, i) => ({ ...parsedB.transactions[0], id: `big-${i}`, memo: `큰 백업 ${i}` }));
    const tooBig = await upload(fx, cookie, "/backup/compare", { backup_file: { file: JSON.stringify({ ...parsedB, transactions: bigRows }, null, 2) }, household_id: TRIP, month: "2026-07" });
    eq(tooBig.status, 413, "FC-26 장면: 한 달 400건 백업은 복구 단계에 올라가지 않는다(라우터 64KB)");
  }));

  // ── FC-27b 되돌리기 최종 확인 ──────────────────────────────────────────────────────
  await section("FC-27b", () => fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    const rows = [];
    for (let i = 0; i < 60; i += 1) {
      const row = { id: `rb-${String(i).padStart(3, "0")}`, household_id: HOME, user_id: "user-bin", transaction_date: "2026-07-15", type: "expense", amount: 1000 + i, category: "식비", memo: `복구 ${i}`, payment_method: "현금", source: "my_import", raw_text: "", created_at: "2026-07-15T03:00:00.000Z" };
      fx.db.transactions.push(row);
      rows.push({ id: row.id, household_id: HOME, transaction_date: row.transaction_date, type: row.type, amount: row.amount, category: row.category, memo: row.memo, payment_method: row.payment_method, source: row.source, created_at: row.created_at });
    }
    const planText = (selected) => JSON.stringify({ app: "kakao-accountbook", mode: "rollback_candidate_plan_only_no_db_write", month: "2026-07", household_id: HOME, selected_count: selected.length, selected });
    const check = (selected, extra = {}) => dbCalls(() => upload(fx, cookie, "/backup/rollback-final-check", { rollback_plan_file: { file: planText(selected) }, household_id: HOME, month: "2026-07", admin_password: "admin-pass", ...extra }));
    const full = await check(rows);
    const reads = full.calls.filter((call) => call.startsWith("GET /rest/v1/transactions"));
    ok(full.result.status === 200 && textOf(full.result.html).includes("삭제 전 최종 확인 통과") && metrics(full.result.html)["삭제 가능 후보"] === "60", `FC-27b 60건 계획이 모두 확인된다 (${JSON.stringify(metrics(full.result.html))})`);
    ok(full.calls.length <= 50, `FC-27b DB 호출이 50회 안이다 (${full.calls.length}회)`);
    ok(reads.length === 2 && reads.every((call) => call.includes("id=in.(") && call.includes(`household_id=eq.${HOME}`)), `FC-27b 고른 가계부 안에서 50건씩 묶어 읽는다(60건에 ${reads.length}회, 예전에는 한 건씩 60회)`);
    fx.db.transactions = fx.db.transactions.filter((row) => row.id !== "rb-007");
    const gone = await check(rows);
    ok(textOf(gone.result.html).includes("삭제 전 확인 필요") && metrics(gone.result.html)["현재 없음"] === "1" && textOf(gone.result.html).includes("고른 가계부에 이 거래가 없음"), "FC-27b 빠진 행이 있으면 ‘통과’ 라고 하지 않는다");
    const stop = intercept(({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/transactions" && decodeURIComponent(url.search).includes("id=in.(") ? failure(503) : null));
    let outage;
    try { outage = await check(rows); } finally { stop(); }
    ok(outage.result.status === 200 && textOf(outage.result.html).includes("삭제 전 확인 필요") && metrics(outage.result.html)["확인 불가"] === "60" && metrics(outage.result.html)["현재 없음"] === "0", `FC-27b 읽기가 실패하면 ‘현재 없음’ 이 아니라 ‘확인 불가’ 다 (${JSON.stringify(metrics(outage.result.html))})`);
    const many = Array.from({ length: 210 }, (_, i) => ({ ...rows[0], id: `rbx-${String(i).padStart(3, "0")}`, memo: "x" }));
    for (const row of many) fx.db.transactions.push({ ...row, user_id: "user-bin", raw_text: "" });
    const capped = await check(many);
    ok(metrics(capped.result.html)["확인 불가"] === "10" && metrics(capped.result.html)["삭제 가능 후보"] === "200" && !textOf(capped.result.html).includes("삭제 전 최종 확인 통과"), `FC-27b 한 번에 200건까지 확인하고 나머지는 ‘확인 불가’ 다 (${JSON.stringify(metrics(capped.result.html))})`);
    const otherHousehold = await check(rows.slice(0, 3), { household_id: TRIP });
    ok(metrics(otherHousehold.result.html)["현재 없음"] === "3" && !textOf(otherHousehold.result.html).includes("삭제 전 최종 확인 통과"), "FC-27b 다른 가계부를 고르면 그 가계부에서만 찾는다");
  }));

  // ── FC-27c 최종 확인 범위 = 적용 범위, FC-27j 한 번에 18건 ─────────────────────────
  await section("FC-27c·j", () => fixture(async (fx) => {
    uuidFixture(fx);
    const cookie = await adminCookie(fx);
    const row = (memo, extra = {}) => ({ transaction_date: "2026-07-21", type: "expense", amount: 4100, category: "식비", memo, payment_method: "현금", user_id: BIN, ...extra });
    const selected = [row("범위 안 하나"), row("범위 안 둘", { amount: 4200 }), row("유월 기록", { transaction_date: "2026-06-30" }), row("손님 기록", { user_id: GUEST })];
    const final = await upload(fx, cookie, "/backup/final-check", { plan_file: { file: legacyPlan(selected) }, household_id: HOME, month: "2026-07", admin_password: "admin-pass" });
    const fm = metrics(final.html);
    ok(final.status === 200 && fm["선택 후보"] === "4" && fm["아직 신규"] === "2" && fm["적용에서 빠짐"] === "2", `FC-27c 최종 확인이 적용과 같이 다른 달·활성 참여자 아닌 행을 뺀다(예전에는 4건 모두 ‘아직 신규’) (${JSON.stringify(fm)})`);
    ok(textOf(final.html).includes("일부 행은 적용에서 빠집니다") && !textOf(final.html).includes("최종 확인 통과") && textOf(final.html).includes("지출자가 이 가계부의 활성 참여자가 아니어서 제외") && textOf(final.html).includes("선택한 달(2026-07) 밖의 날짜라"), "FC-27c 빠질 행과 사유를 보이고 ‘통과’ 라고 하지 않는다");
    const applied = await upload(fx, cookie, "/backup/apply", { plan_file: { file: legacyPlan(selected) }, ...applyFields(HOME) });
    const am = metrics(applied.html);
    ok(am["성공"] === fm["아직 신규"] && am["형식·범위·중단 제외"] === fm["적용에서 빠짐"], `FC-27c 적용 결과가 최종 확인과 같다 (${JSON.stringify(am)})`);
    const missingHousehold = await upload(fx, cookie, "/backup/final-check", { plan_file: { file: legacyPlan(selected) }, household_id: "", month: "2026-07", admin_password: "admin-pass" });
    ok(missingHousehold.status === 400 && textOf(missingHousehold.html).includes("확인할 가계부를 고른 뒤"), "FC-27c 가계부가 정해지지 않으면 확인하지 않는다");

    const applyPage = await page(fx, `/backup/apply?household_id=${HOME}&month=2026-07`, { cookie });
    ok(applyPage.html.includes("최대 18건 적용") && applyPage.html.includes("1회 최대 18건"), "FC-27j 적용 화면이 한 번에 18건이라고 알린다");
    const many = Array.from({ length: 25 }, (_, i) => row(`많은 복구 ${i}`, { amount: 7000 + i, transaction_date: `2026-07-${String(1 + i).padStart(2, "0")}` }));
    const big = await dbCalls(() => upload(fx, cookie, "/backup/apply", { plan_file: { file: legacyPlan(many) }, ...applyFields(HOME) }));
    const bm = metrics(big.result.html);
    ok(bm["성공"] === "18" && bm["제한 초과 제외"] === "7", `FC-27j 25건 계획에서 18건만 적용하고 7건은 제한으로 뺀다 (${JSON.stringify(bm)})`);
    ok(big.calls.length <= 48, `FC-27j 18건 적용의 DB 호출이 예산 50회보다 여유가 있다(${big.calls.length}회; 20건이면 행마다 2회씩 더해 50회에 닿았다)`);
  }));

  // ── FC-27d 백업 JSON 에서 초대코드·카카오 사용자 키를 뺀다 ───────────────────────────
  await section("FC-27d", () => fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    ok(fx.db.households.some((h) => h.id === HOME && h.invite_code) && fx.db.users.some((u) => u.kakao_user_key), "FC-27d 장면: 저장소의 가계부·사용자에는 초대코드·카카오 키가 있다");
    for (const query of [`month=2026-07&household_id=${HOME}`, `month=2026-07&household_id=${HOME}&range=all`, "month=2026-07"]) {
      const exported = await page(fx, `/admin/export/json?${query}`, { cookie });
      const data = JSON.parse(exported.html);
      const members = Object.values(data.household_members || {}).flat();
      ok(exported.status === 200 && !exported.html.includes("kakao_user_key") && !exported.html.includes("invite_code") && !exported.html.includes("HOME2265"), `FC-27d 백업 파일에 kakao_user_key·invite_code 가 없다 (${query})`);
      ok(members.length > 0 && members.every((m) => m.user_id && m.role) && data.households.every((h) => h.id && h.name), `FC-27d 참여자·가계부의 나머지 칸은 그대로다 (${query})`);
    }
    const exported = JSON.parse((await page(fx, `/admin/export/json?month=2026-07&household_id=${HOME}`, { cookie })).html);
    const preview = await upload(fx, cookie, "/backup/preview", { backup_file: { file: JSON.stringify(exported) } });
    ok(preview.status === 200 && textOf(preview.html).includes("검증 통과"), "FC-27d 두 칸을 뺀 백업도 복구 단계의 파일 확인을 통과한다");
  }));

  // ── FC-27e 운영센터 카드 ───────────────────────────────────────────────────────────
  await section("FC-27e", () => fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    const center = await page(fx, "/operation-center", { cookie });
    ok(center.status === 200 && center.html.includes('<a class="opCard" href="/ops-audit"><span>관리</span><b>운영 점검</b><p>배포 전후 운영 기준을 점검합니다.</p></a>'), "FC-27e ‘운영 점검’ 카드가 /ops-audit 로 가고 설명·꼬리표가 제자리다(예전에는 주소가 운영센터, 설명 자리에 주소)");
  }));

  // ── FC-27f ‘전체 가계부’ 빠른 입력 ────────────────────────────────────────────────
  await section("FC-27f", () => fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    const quick = (html) => (String(html).match(/<section id="quickAddSection"[\s\S]*?<\/section>/) || [""])[0];
    const all = await page(fx, "/?legacy=1&tab=transactions&month=2026-07", { cookie });
    const section = quick(all.html);
    ok(all.status === 200 && section && !section.includes("<form") && textOf(section).includes("기록할 가계부를 고르면 입력 칸이 나옵니다"), "FC-27f ‘전체 가계부’ 보기에서는 빠른 입력 폼 대신 가계부를 고르라고 안내한다");
    ok(section.includes(`household_id=${HOME}`) && section.includes(`household_id=${TRIP}`), "FC-27f 안내에 가계부로 가는 단추가 있다");
    ok(!all.html.includes("새 입력은 기본 가계부에 저장됩니다") && all.html.includes("새 기록은 가계부를 하나 고른 뒤 입력하세요"), "FC-27f ‘기본 가계부에 저장됩니다’ 안내를 고쳤다");
    const one = await page(fx, `/?legacy=1&tab=transactions&household_id=${HOME}&month=2026-07`, { cookie });
    ok(quick(one.html).includes('<form method="post" action="/admin/transactions"'), "FC-27f 가계부를 고르면 빠른 입력 폼이 그대로 있다");
    // 고치기 전 장면: 전체 보기의 폼(첫 가계부·빈 지출자)으로 보내면 저장되지 않았다.
    const before = fx.db.transactions.length;
    const sent = await post(fx, "/admin/transactions", { household_id: HOME, month: "2026-07", type: "expense", amount: "12000", memo: "점심", user_id: "", return_to: "/?legacy=1&tab=transactions&month=2026-07" }, { cookie });
    ok(sent.decoded.replace(/\+/g, " ").includes("지출자를 선택하세요") && fx.db.transactions.length === before, `FC-27f 고치기 전 장면: 지출자가 빈 폼은 늘 거절됐다 (${sent.decoded})`);
  }));

  // ── FC-27g 가져오기 이력 시각 KST ──────────────────────────────────────────────────
  await section("FC-27g", () => fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    fx.db.transactions.push({ id: "imp-utc-1", household_id: HOME, user_id: "user-bin", transaction_date: "2026-11-21", type: "expense", amount: 4500, category: "카페/간식", memo: "새벽 커피", payment_method: "현금", source: "my_import", raw_text: "", created_at: "2026-11-20T15:30:00+00:00" });
    const history = textOf((await page(fx, `/backup/import-history?month=2026-11&household_id=${HOME}`, { cookie })).html);
    ok(history.includes("2026-11-21 00시") && history.includes("2026-11-21 00:30:00") && !history.includes("2026-11-20 15시") && !history.includes("2026-11-20 15:30:00"), "FC-27g 배치·저장 시각이 한국 시간이다(UTC 15:30 → 다음 날 00:30)");
    const rollback = textOf((await page(fx, `/backup/rollback-candidates?month=2026-11&household_id=${HOME}`, { cookie })).html);
    ok(rollback.includes("2026-11-21 00:30:00"), "FC-27g 되돌리기 후보의 저장 시각도 한국 시간이다");
  }));

  // ── FC-27i 저장 실패가 500 이 아니라 안내 ──────────────────────────────────────────
  await section("FC-27i", () => fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    const failing = async (match, task, status = 400) => {
      const stop = intercept(({ url, method }) => (match(url, method) ? failure(status) : null));
      try { return await task(); } finally { stop(); }
    };
    const count = fx.db.households.length;
    const created = await failing((url, method) => method === "POST" && url.pathname === "/rest/v1/households", () => post(fx, "/admin/household/create", { name: "새 모임" }, { cookie }));
    ok(created.status === 303 && created.location === "/households?err=household_create_failed" && fx.db.households.length === count, `FC-27i 가계부 만들기 실패는 500 이 아니라 안내로 돌아간다 (${created.status} ${created.location})`);
    const createdShown = textOf((await page(fx, created.location, { cookie })).html);
    ok(createdShown.includes("가계부를 만들지 못했습니다"), "FC-27i 가계부 화면이 만들지 못했다고 알린다");
    const unknown = await failing((url, method) => method === "POST" && url.pathname === "/rest/v1/households", () => post(fx, "/admin/household/create", { name: "새 모임" }, { cookie }), 503);
    ok(unknown.status === 303 && /^\/households\?err=(db_write_unknown|household_create_failed)$/.test(unknown.location), `FC-27i 저장소 503 도 안내로 돌아간다 (${unknown.status} ${unknown.location})`);
    const code = fx.db.households.find((h) => h.id === HOME)?.invite_code;
    const regen = await failing((url, method) => method === "PATCH" && url.pathname === "/rest/v1/households", () => post(fx, "/admin/household/regenerate", { id: HOME }, { cookie }));
    ok(regen.status === 303 && regen.decoded.startsWith(`/households?household_id=${HOME}&err=`) && fx.db.households.find((h) => h.id === HOME)?.invite_code === code, `FC-27i 초대코드 재발급 실패도 안내로 돌아가고 코드는 그대로다 (${regen.decoded})`);
    ok(textOf((await page(fx, regen.location, { cookie })).html).includes("초대코드를 새로 만들지 못했습니다. 기존 초대코드는 그대로입니다."), "FC-27i 가계부 화면이 재발급 실패를 알린다");
    const nickname = fx.db.users.find((u) => u.id === "user-bin")?.nickname;
    const profile = await failing((url, method) => method === "PATCH" && url.pathname === "/rest/v1/users", () => post(fx, "/my/profile", { nickname: "빈빈" }));
    ok(profile.status === 303 && profile.decoded.startsWith("/my/profile?err=") && fx.db.users.find((u) => u.id === "user-bin")?.nickname === nickname, `FC-27i 프로필 저장 실패도 안내로 돌아간다 (${profile.decoded})`);
    ok(textOf((await page(fx, profile.location)).html).includes("표시 이름을 저장하지 못했습니다"), "FC-27i 프로필 화면이 저장하지 못했다고 알린다");
    const fine = await post(fx, "/admin/household/create", { name: "새 모임" }, { cookie });
    ok(fine.location === "/households?msg=created" && fx.db.households.length === count + 1, "FC-27i 저장이 되면 예전처럼 만든다");
  }));

  // ── FC-27k /analysis·/calendar 와 없는 가계부 ─────────────────────────────────────
  await section("FC-27k", () => fixture(async (fx) => {
    const admin = await adminCookie(fx);
    const both = `${admin}; ${fx.cookie}`;
    for (const path of ["/analysis", "/calendar"]) {
      const gone = await page(fx, `${path}?household_id=house-gone&month=2026-07`, { cookie: both });
      ok(gone.status === 404 && textOf(gone.html).includes("가계부를 찾을 수 없어요"), `FC-27k ${path} 의 없는 가계부는 ‘찾을 수 없어요’ 다(예전에는 0원 화면) (${gone.status})`);
      const known = await page(fx, `${path}?household_id=${HOME}&month=2026-07`, { cookie: both });
      ok(known.status === 200 && !textOf(known.html).includes("가계부를 찾을 수 없어요"), `FC-27k ${path}: 있는 가계부는 그대로 열린다 (${known.status})`);
      const adminOnly = await page(fx, `${path}?household_id=house-gone&month=2026-07`, { cookie: admin });
      ok(adminOnly.status === 303 && adminOnly.location === "/my", `FC-27k ${path}: 관리자 쿠키만이면 예전처럼 /my 로 보낸다 (${adminOnly.status} ${adminOnly.location})`);
      const userOnly = await page(fx, `${path}?household_id=house-gone&month=2026-07`, { cookie: fx.cookie });
      ok(userOnly.status === 303 && userOnly.location.includes("household_id=house-gone"), `FC-27k ${path}: 사용자 쿠키만이면 예전처럼 사용자 화면으로 보낸다(거기서 404) (${userOnly.status} ${userOnly.location})`);
    }
  }));
} finally {
  globalThis.__AB_QA_FIXED_NOW_MS = previousClock;
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} checks failed`);
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
t.done();

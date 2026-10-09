// V22.9.34 — 2차 점검 보고서의 저장 무결성 결함(B12~B15)과 감사 SIM-1 을 고정한다.
//   B13 결과를 모르는 저장의 재시도: 요청 id 를 기록의 기본 키로 써서 시간이 지나도 한 번만 저장한다.
//       저장은 됐는데 응답만 잃었으면 id 로 다시 읽어 저장됐다고 알린다(웹·카카오).
//   B12 서로 다른 미리보기의 동시 가져오기: 가계부 가져오기 잠금으로 중복 확인과 저장을 묶는다.
//   B15 가져오기 결과: 확정 실패(저장 안 됨)·저장 완료·결과 모름(확인 필요)을 나눈다.
//   B14 오래 열어 둔 수정 폼: 사용자가 바꾼 칸만 저장하고, 그 사이 다른 곳에서 바뀐 칸은 덮어쓰지 않는다.
//   SIM-1 관리자 수정 모달: 목록 필터의 type 이 수정 값을 덮어쓰지 않는다.
// 픽스처는 운영 PostgREST 처럼 같은 기본 키 저장을 409(23505)로 거절한다.
import { BASE, app, counter, ctx, fixture, formFields, intercept, page, post, skill, withClock } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.34 저장 무결성 검사 통과");
const isTxInsert = ({ url, method }) => method === "POST" && url.pathname === "/rest/v1/transactions";
const query = (location, key) => new URL(location || "/", BASE).searchParams.get(key) || "";
const ageAll = (fx, seconds) => { for (const row of fx.db.transactions) if (row.created_at) row.created_at = new Date(Date.parse(row.created_at) - seconds * 1000).toISOString(); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── B13 웹 빠른 입력 ────────────────────────────────────────
const addForm = { household_id: "house-home", month: "2026-10", type: "expense", transaction_date: "2026-10-09", amount: "8900", memo: "점심 국밥", category: "식비", payment_method: "국민카드", return_to: "/app?month=2026-10&household_id=house-home", user_id: "user-bin", raw_text: "", quick_manual_amount: "1", quick_manual_date: "1" };
const soups = (fx) => fx.db.transactions.filter((row) => row.memo === "점심 국밥").length;
await withClock("2026-10-09", async () => {
  await fixture(async (fx) => {
    const restore = intercept(async ({ url, method, forward }) => {
      if (!isTxInsert({ url, method })) return null;
      await forward();
      return new Response(JSON.stringify({ message: "lost after commit" }), { status: 503 });
    });
    const first = await post(fx, "/admin/transactions", addForm);
    restore();
    ok(query(first.location, "msg") === "added" && soups(fx) === 1, "B13 저장은 됐는데 응답만 잃으면 id 로 확인해 저장했다고 알린다");
  });
  await fixture(async (fx) => {
    const restore = intercept(({ url, method }) => (isTxInsert({ url, method }) ? new Response("{}", { status: 503 }) : null));
    const first = await post(fx, "/admin/transactions", addForm);
    restore();
    const rid = query(first.location, "rid");
    ok(query(first.location, "err") === "db_write_unknown" && /^[0-9a-f-]{36}$/.test(rid) && soups(fx) === 0, "B13 저장 전 실패는 결과 모름으로 알리고 요청 id(rid)를 돌려준다");
    const again = await page(fx, first.location);
    ok(again.html.includes(`name="request_id" value="${rid}"`), "B13 다시 그린 빠른 입력이 같은 요청 id 를 싣는다");
    ageAll(fx, 91);
    const retry = await post(fx, "/admin/transactions", { ...addForm, request_id: rid });
    ok(query(retry.location, "msg") === "added" && soups(fx) === 1, "B13 같은 요청 id 로 다시 저장하면 한 번 저장된다");
    ageAll(fx, 91);
    const replay = await post(fx, "/admin/transactions", { ...addForm, request_id: rid });
    ok(query(replay.location, "msg") === "already_saved" && soups(fx) === 1, "B13 보호 시간(90초)이 지나 다시 보내도 같은 요청 id 는 두 번 저장되지 않는다");
  });
  await fixture(async (fx) => {
    let armed = true;
    const restore = intercept(async ({ url, method, forward }) => {
      if (!armed || !isTxInsert({ url, method })) return null;
      armed = false;
      setTimeout(() => { forward(); }, 40);
      return new Response("{}", { status: 504 });
    });
    const first = await post(fx, "/admin/transactions", addForm);
    restore();
    await sleep(120);
    ageAll(fx, 91);
    const retry = await post(fx, "/admin/transactions", { ...addForm, request_id: query(first.location, "rid") });
    ok(query(first.location, "err") === "db_write_unknown" && query(retry.location, "msg") === "already_saved" && soups(fx) === 1, "B13 확인 뒤 늦게 반영된 저장도 재시도에서 한 번만 남는다");
  });
  await fixture(async (fx) => {
    const rid = "0f0e0d0c-0b0a-4908-8706-050403020100";
    fx.db.transactions.push({ id: rid, household_id: "house-trip", user_id: "user-bin", transaction_date: "2026-10-01", type: "expense", amount: 1, category: "x", memo: "other", payment_method: "", source: "web_admin" });
    const res = await post(fx, "/admin/transactions", { ...addForm, request_id: rid });
    ok(query(res.location, "err") === "request_conflict" && soups(fx) === 0 && fx.db.transactions.find((row) => row.id === rid).memo === "other", "B13 다른 가계부 기록의 id 를 요청 id 로 보내면 저장하지 않고 그 기록도 건드리지 않는다");
    const plain = await post(fx, "/admin/transactions", addForm);
    ok(query(plain.location, "msg") === "added" && soups(fx) === 1, "B13 요청 id 가 없는 보통 저장은 서버가 id 를 정해 저장한다");
  });
});

// ── B13 카카오 새 기록 ──────────────────────────────────────
await withClock("2026-07-15", async () => {
  // 카카오 저장에는 같은 문장을 몇 초 동안 막는 인스턴스 안 장치가 있어 시나리오마다 금액을 바꾼다.
  let soupPrice = 8900;
  for (const [label, inject] of [
    ["저장 전 실패(503)", () => intercept(({ url, method }) => (isTxInsert({ url, method }) ? new Response("{}", { status: 503 }) : null))],
    ["확인 뒤 늦게 반영", () => {
      let armed = true;
      return intercept(async ({ url, method, forward }) => {
        if (!armed || !isTxInsert({ url, method })) return null;
        armed = false;
        setTimeout(() => { forward(); }, 40);
        return new Response("{}", { status: 504 });
      });
    }],
  ]) {
    await fixture(async (fx) => {
      fx.env.KAKAO_REPEAT_GUARD_SECONDS = "2";
      fx.db.accountbook_settings.push({ id: "sel-bin", key: "kakao_selected_household_v2251:user-bin", value: "house-home", created_at: "2026-07-01T00:00:00.000Z" });
      const rows = () => fx.db.transactions.filter((row) => row.household_id === "house-home" && String(row.memo || "").includes("국밥")).length;
      const utterance = `국밥 ${soupPrice++}원 국민카드`;
      const restore = inject();
      const first = await skill(fx, utterance);
      restore();
      await sleep(150);
      ok(/저장 확인이 지연/.test(first) && /다시 보내지 말고/.test(first), `B13 카카오 ${label}: 결과를 모르면 다시 보내지 말고 먼저 확인하라고 알린다`);
      ok(fx.db.accountbook_settings.some((row) => /pending_write/.test(row.key) && String(row.value || "").includes("ids")), `B13 카카오 ${label}: 확인하지 못한 기록 id 를 남겨 둔다`);
      ageAll(fx, 121);
      await sleep(2100);
      await skill(fx, utterance);
      eq(rows(), 1, `B13 카카오 ${label}: 120초 뒤 같은 문장을 다시 보내도 한 건만 남는다`);
    });
  }
});

// ── B12·B15 가져오기 ────────────────────────────────────────
const BIN = "11111111-1111-4111-8111-111111111111";
const WIFI = "22222222-2222-4222-8222-222222222222";
const CSV = "날짜,구분,금액,분류,내용,결제수단\n2026-10-09,지출,12345,식비,점심,국민카드\n2026-10-09,지출,4500,카페/간식,커피,카카오페이";
const isImport = ({ url }) => /accountbook_import_transactions_v227$/.test(url.pathname);
const importFixture = (task) => fixture(async (fx) => {
  for (const [name, rows] of Object.entries(fx.db)) {
    if (Array.isArray(rows)) fx.db[name] = JSON.parse(JSON.stringify(rows).replaceAll("user-bin", BIN).replaceAll("user-wifi", WIFI));
  }
  fx.cookie = await fx.cookieFor(BIN);
  fx.db.__import_rpc_available = true;
  return task(fx);
});
const importPreview = async (fx) => {
  const res = await post(fx, "/my/import", { household_id: "house-home", month: "2026-10", csv_text: CSV, skip_duplicates: "1" });
  const token = res.text.match(/name="import_token" value="([^"]+)"/)?.[1] || "";
  const data = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
  return { token, rows: data.ready.map((entry) => entry.row_number) };
};
const importCommit = (fx, preview) => {
  const body = new URLSearchParams({ import_action: "commit", import_token: preview.token });
  for (const row of preview.rows) body.append("selected_rows", String(row));
  return post(fx, "/my/import", body);
};
const metric = (html, label) => Number((String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").match(new RegExp(`${label} ([0-9,]+)`)) || [, "-1"])[1].replace(/,/g, ""));
const imported = (fx) => fx.db.transactions.filter((row) => row.source === "my_import").length;
await withClock("2026-10-09", async () => {
  await importFixture(async (fx) => {
    const a = await importPreview(fx);
    const b = await importPreview(fx);
    // 요청마다 작은 지연을 넣어 두 저장이 실제로 겹치게 한다.
    const jitter = intercept(async () => { await sleep(2 + Math.random() * 10); return null; });
    const [ra, rb] = await Promise.all([importCommit(fx, a), importCommit(fx, b)]);
    jitter();
    const late = [ra, rb].find((res) => /다른 가져오기를 저장하고 있어요/.test(res.text) || metric(res.text, "중복 제외") === 2);
    ok(imported(fx) === 2 && late && (late.status === 409 || metric(late.text, "중복 제외") === 2), "B12 서로 다른 미리보기를 동시에 저장해도 같은 행은 한 번만 저장한다(늦은 쪽은 잠금 안내 또는 중복 제외)");
    const retry = await importCommit(fx, late === ra ? a : b);
    ok(imported(fx) === 2 && metric(retry.text, "중복 제외") === 2, "B12 늦은 쪽을 다시 저장하면 중복으로 건너뛴다");
  });
  await importFixture(async (fx) => {
    const preview = await importPreview(fx);
    const restore = intercept(({ url }) => (isImport({ url }) ? new Response(JSON.stringify({ code: "P0001", message: "import_spender_not_member" }), { status: 400 }) : null));
    const res = await importCommit(fx, preview);
    restore();
    ok(metric(res.text, "저장 안 됨") === 2 && imported(fx) === 0, "B15 확정 실패는 '저장 안 됨'으로 센다");
  });
  await importFixture(async (fx) => {
    const preview = await importPreview(fx);
    const restore = intercept(async ({ url, forward }) => {
      if (!isImport({ url })) return null;
      await forward();
      return new Response(JSON.stringify({ message: "lost after commit" }), { status: 503 });
    });
    const res = await importCommit(fx, preview);
    restore();
    ok(metric(res.text, "저장 완료") === 2 && imported(fx) === 2, "B15 저장은 됐는데 응답만 잃은 행은 id 로 확인해 '저장 완료'로 센다");
  });
  await importFixture(async (fx) => {
    const preview = await importPreview(fx);
    const restore = intercept(({ url }) => (isImport({ url }) ? new Response("{}", { status: 503 }) : null));
    const res = await importCommit(fx, preview);
    restore();
    ok(metric(res.text, "확인 필요") === 2 && /저장 여부 확인 필요/.test(res.text) && !/이 행만 다시 가져오세요/.test(res.text), "B15 결과를 모르는 행은 '확인 필요'로 세고 다시 가져오라고 하지 않는다");
    const again = await importCommit(fx, preview);
    ok(metric(again.text, "저장 완료") === 2 && imported(fx) === 2, "B15 같은 미리보기로 다시 저장하면 한 번 저장된다");
  });
});

// ── B14 오래 열어 둔 수정 폼 ────────────────────────────────
const editForm = async (fx, id = "tx-expense-2") => {
  const frag = await page(fx, `/transactions/edit?id=${id}&fragment=1&return_to=${encodeURIComponent("/app?month=2026-07&household_id=house-home")}`);
  return formFields(frag.html, "/admin/update");
};
const submitEdit = (fx, { fields }, changes) => {
  const body = new URLSearchParams(fields);
  for (const [key, value] of Object.entries(changes)) body.set(key, value);
  return post(fx, "/admin/update", body);
};
await fixture(async (fx) => {
  const row = () => fx.db.transactions.find((item) => item.id === "tx-expense-2");
  const formA = await editForm(fx);
  const formB = await editForm(fx);
  ok(formA.found && formA.fields.get("orig_amount") === "72000", "B14 수정 폼이 원래 값(orig_*)을 싣는다");
  await submitEdit(fx, formA, { amount: "73000" });
  const staleCategory = await submitEdit(fx, formB, { category: "주유/차량" });
  ok(query(staleCategory.location, "msg") === "updated" && Number(row().amount) === 73000 && row().category === "주유/차량", "B14 오래된 폼에서 분류만 바꾸면 다른 곳에서 바꾼 금액(73,000원)을 되돌리지 않는다");
  const staleAmount = await submitEdit(fx, formB, { amount: "74000" });
  ok(staleAmount.status === 409 && /다른 곳에서 이 기록이 먼저 바뀌었어요/.test(staleAmount.text) && /73,000원/.test(staleAmount.text) && Number(row().amount) === 73000, "B14 다른 곳에서 바뀐 칸을 또 바꾸면 저장하지 않고 지금 값을 보여 준다");
  const formC = await editForm(fx);
  await submitEdit(fx, formC, { amount: "75000" });
  const twice = await submitEdit(fx, formC, { amount: "75000" });
  ok(query(twice.location, "msg") === "updated" && Number(row().amount) === 75000, "B14 같은 폼을 두 번 보내도 결과가 같다");
});
await fixture(async (fx) => {
  const target = fx.db.transactions.find((item) => item.id === "tx-expense-1");
  target.memo = "";
  target.raw_text = "마트 장보기 148000원";
  const form = await editForm(fx, "tx-expense-1");
  await submitEdit(fx, form, { amount: "150000" });
  ok(target.memo === "" && Number(target.amount) === 150000, "B14 금액만 고치면 비어 있던 메모에 원문(raw_text)을 넣지 않는다");
});

// ── SIM-1 관리자 수정 모달 ──────────────────────────────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    fx.env.ADMIN_API_TOKEN = "qa-admin-token";
    const admin = { authorization: "Bearer qa-admin-token" };
    const dashboard = await app.fetch(new Request(`${BASE}/?legacy=1&tab=transactions&month=2026-07&household_id=house-home&type=expense`, { headers: { ...admin, accept: "text/html" } }), fx.env, ctx);
    const html = await dashboard.text();
    const modal = html.match(/<form id="txEditModalForm"[\s\S]*?<\/form>/)?.[0] || "";
    ok(modal && !/<input type="hidden" name="type"/.test(modal) && /name="orig_type"/.test(modal), "SIM-1 관리자 수정 모달에 목록 필터의 type 칸을 붙이지 않는다");
    const income = fx.db.transactions.find((row) => row.id === "tx-income-1");
    const send = (values) => app.fetch(new Request(`${BASE}/admin/update`, {
      method: "POST",
      headers: { ...admin, "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin" },
      body: values.toString(),
    }), fx.env, ctx);
    const base = [["id", income.id], ["household_id", "house-home"], ["month", "2026-07"], ["transaction_date", income.transaction_date], ["amount", String(income.amount)], ["category", income.category], ["payment_method", income.payment_method || ""], ["memo", `${income.memo} 메모만`], ["user_id", income.user_id]];
    const ambiguous = await send(new URLSearchParams([...base, ["type", "income"], ["type", "expense"]]));
    ok(query(ambiguous.headers.get("location"), "err") === "ambiguous_field" && income.type === "income" && !income.memo.includes("메모만"), "SIM-1 서로 다른 type 이 함께 오면 저장하지 않는다");
    const memoOnly = await send(new URLSearchParams([...base, ["type", "income"]]));
    ok(query(memoOnly.headers.get("location"), "msg") === "updated" && income.type === "income" && income.memo.includes("메모만"), "SIM-1 수입 기록의 메모만 고치면 수입 그대로 저장된다");
  });
});

done();

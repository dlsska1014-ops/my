import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import vm from "node:vm";
const root = process.env.AB_IMPORT_PREREQ_ROOT || fileURLToPath(new URL("../", import.meta.url));
const worker = await import(pathToFileURL(resolve(root, "src/index.js")));
const { createV2265QaFixture } = await import(pathToFileURL(resolve(root, "validation/qa-fixture.mjs")));
const { normalizeText } = await import(pathToFileURL(resolve(root, "src/modules/nlu/amount-parser.js")));
const { inferCategory } = await import(pathToFileURL(resolve(root, "src/modules/nlu/category-rules.js")));
const USER = "11111111-1111-4111-8111-111111111111", MEMBER = "22222222-2222-4222-8222-222222222222", BASE = "https://malhaebook.com";
let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (actual, label) => { assert.ok(actual, label); checks++; };
const nativeFetch = globalThis.fetch, clock = globalThis.__AB_QA_FIXED_NOW_MS;
globalThis.fetch = async () => { throw Error("import prerequisites: native fetch blocked"); };
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-16T12:00:00+09:00");
const parse = (text, options = {}) => worker.parseFlexibleImportRecords(text, "house-home", USER, { importYear: 2026, ...options });
const csv = (amount = 7654, memo = "합성 구매", extra = "") => `날짜,구분,금액,내용${extra ? ",지출자" : ""}\n2026-07-01,지출,${amount},${memo}${extra ? "," + extra : ""}`;
const row = (amount = 7654) => parse(csv(amount)).rows[0];
async function fixture(task) {
  const fx = await createV2265QaFixture();
  for (const [key, rows] of Object.entries(fx.db)) if (Array.isArray(rows)) fx.db[key] = JSON.parse(JSON.stringify(rows).replaceAll("user-bin", USER).replaceAll("user-wifi", MEMBER));
  fx.db.__import_rpc_available = true; fx.cookie = await fx.cookieFor(USER);
  try { await task(fx); } finally { fx.restore(); }
}
async function post(fx, fields, extra = {}) {
  const body = fields instanceof FormData ? fields : new URLSearchParams(fields);
  const headers = { cookie: fx.cookie, origin: BASE, "sec-fetch-site": "same-origin", ...(body instanceof FormData ? {} : { "content-type": "application/x-www-form-urlencoded" }), ...extra };
  const response = await worker.default.fetch(new Request(BASE + "/my/import", { method: "POST", headers, body }), fx.env, { waitUntil() {} });
  return { status: response.status, html: await response.text(), location: response.headers.get("location"), cache: response.headers.get("cache-control") };
}
async function preview(fx, text, fields = {}) {
  const response = await post(fx, { household_id: "house-home", month: "2026-07", csv_text: text, skip_duplicates: "1", ...fields });
  eq(response.status, 200, "preview returns actual signed candidates");
  const token = response.html.match(/name="import_token" value="([^"]+)"/)?.[1]; ok(token, "preview has token");
  const payload = await worker.verifyMyImportPreviewToken(fx.env, token); ok(payload, "token verifies");
  return { ...response, token, payload };
}
async function commit(fx, p, picks = p.payload.ready.map(e => e.row_number), fields = {}) {
  const data = new URLSearchParams({ import_action: "commit", import_token: p.token, ...fields });
  for (const id of picks) data.append("selected_rows", String(id));
  return post(fx, data);
}
const writes = fx => fx.db.__rpc_calls.filter(call => call.name === "accountbook_commit_import_v22960").length;

try {
  for (const [input, expected] of [["@alice 점심 12,000원 카드", "점심 12,000원 카드"], ["/지출 19:40 현대카드(1234) 12,000원", "지출 현대카드 12,000원"], ['A"()\t\nB', "A B"], ["(12\"34) 카드", "12 34 카드"]]) eq(normalizeText(input), expected, "shared text normalization keeps its established meaning");
  const chunkPrefix = "x".repeat(16383);
  eq(normalizeText(chunkPrefix + '"()\t\n a\\b'), chunkPrefix + " a b", "text normalization preserves punctuation/whitespace across chunk boundaries");
  for (const [input, expected] of [["CU", "편의점"], ["CUP", "기타지출"], ["KT", "통신비"], ["SKT123", "기타지출"], ["EV", "주유/충전"], ["server", "기타지출"], ["CU/가게", "편의점"], ["학교cu", "교육/학습"]]) eq(inferCategory(input, "expense"), expected, "exact category token boundaries remain unchanged: " + input);
  for (const header of ["지급", "지급액", "찾으신금액"]) {
    const p = parse(`거래일,${header},맡기신금액,잔액,내용\n2026-07-03,5000,0,999999,가게\n2026-07-04,,7000,999999,보상`);
    eq(p.rows.map(r => [r.type, r.amount]), [["expense", 5000], ["income", 7000]], "bank aliases exclude balance: " + header);
  }
  for (const [money, accepted, reason] of [["5000,1000", 0, "both_income_expense"], ["bad,1000", 0, "invalid_amount"], ["0,", 0, "invalid_amount"], [",1000", 1, ""], ["0,1000", 1, ""]]) {
    const p = parse(`날짜,찾으신금액,맡기신금액,내용\n2026-07-03,${money},가게`);
    eq(p.rows.length, accepted, "split amount validity " + money);
    if (reason) eq(p.rejected[0]?.reason_code, reason, "split amount reason");
  }
  for (const sign of ["-5000", "−5000", "₩-5000", "-₩5000", "△5000", "▲5000", "(5000)", "5000-", "KRW -5000"]) {
    const p = parse(csv(sign));
    eq(p.rows.length, 1, "supported negative grammar " + sign); eq(p.rows[0].amount, 5000, "negative magnitude");
    eq(p.rows[0].type, "income", "isolated negative is refund"); eq(p.rows[0]._import_needs_confirmation, true, "refund needs confirmation");
  }
  for (const bad of ["1e3", "0x10", "12.5", "--5000", "5-000", "12,34", "2000000001", "$5000", "USD 5000"]) eq(parse(csv(bad)).rows.length, 0, "invalid/foreign amount never saved: " + bad);
  eq(parse(csv(2000000000)).rows[0].amount, 2000000000, "20 billion-won boundary remains 2e9");
  for (const [value, expected] of [["0.1만", 1000], ["1.234천", 1234], ["KRW5000", 5000], ["1.2345천", 0], ["1.0000000001만", 0], ["21억원", 0]]) eq(parse(csv(value)).rows[0]?.amount || 0, expected, "unit amount is exact integer won " + value);
  const signed = parse("날짜,금액,내용\n2026-07-01,−5000,가게\n2026-07-02,△6000,가게\n2026-07-03,9000,월급");
  eq(signed.sign_convention.mode, "signed", "full-file new signs retain signed convention"); eq(signed.rows.map(r => r.type), ["expense", "expense", "income"], "signed semantics");
  const lastDecision = "날짜,금액,내용\n" + Array.from({ length: 120 }, () => "2026-07-01,-5000,가게").join("\n") + "\n날짜,구분,금액,내용\n2026-07-02,지출,6000,가게";
  eq(parse(lastDecision).sign_convention.mode, "default", "sign decision after first 120 rows is included");
  eq(parse(csv(5000, "승인취소")).rows[0]._import_needs_confirmation, true, "actual positive cancellation needs confirmation");
  eq(parse(csv(5000, "환불 수수료")).rows[0].type, "expense", "fee expense preserved");

  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2027-01-05T00:01:00+09:00");
  const dates = "날짜,금액,내용\n12/28,5000,가게";
  eq(parse(dates, { importYear: 2027 }).rows[0].transaction_date, "2027-12-28", "legacy direct importYear remains explicit");
  eq(parse(dates, { importYear: 2027, dateBasisMode: "default" }).rows[0].transaction_date, "2026-12-28", "default 183-day correction");
  eq(parse("날짜,금액,내용\n07/04,5000,가게", { importYear: 2025 }).rows[0].transaction_date, "2025-07-04", "selected historical year preserved");
  eq(parse("날짜,금액,내용\n7월 4일,5000,가게", { importYear: 2025 }).rows[0].transaction_date, "2025-07-04", "selected Korean month/day preserved");
  eq(parse("날짜,금액,내용\n2024-02-29,5000,가게\n03/01,6000,가게").rows.map(r => r.transaction_date), ["2024-02-29", "2024-03-01"], "one explicit file year governs missing year");
  for (const date of ["2026-02-29", "2027-13-01", "2035-01-01"]) eq(parse(`날짜,금액,내용\n${date},5000,가게`).rows.length, 0, "invalid date " + date);
  eq(parse("날짜,금액,내용\n46207,5000,가게\n10/12/25,6000,가게").rows.map(r => r.transaction_date), ["2026-07-04", "2025-10-12"], "serial and M/D/YY preserved");
  eq(parse("날짜,금액,내용\n2027-12-28,5000,가게", { importYear: 2027, dateBasisMode: "default" }).rows[0].transaction_date, "2027-12-28", "explicit future is never silently shifted");
  const frozen = parse(dates, { importYear: 2027, dateBasisMode: "default" }).date_basis;
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2028-01-01T00:01:00+09:00");
  eq(parse(dates, { dateContext: frozen }).rows[0].transaction_date, "2026-12-28", "frozen analysis context survives year boundary");
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-16T12:00:00+09:00");
  for (const value of ["2026-07-03", "2026-07-03 12:30:00"]) eq(parse(`거래시간,거래일,금액,내용\n12:30:00,${value},5000,가게`).rows[0].transaction_date, "2026-07-03", "time-only column cannot override date");
  for (const value of ["", "bad"]) eq(parse(`거래시간,거래일,금액,내용\n12:30:00,${value},5000,2026-07-03 가게`).rows.length, 0, "invalid explicit date cannot use another column");
  for (const title of ["거래시간(KST)", "거래시간[UTC]", "거래시간 KST", "사용시간(24시간)", "time[UTC]", "transaction time UTC"]) {
    for (const first of [true, false]) {
      const header = first ? `${title},거래일` : `거래일,${title}`;
      const values = first ? "12:30:00,2026-07-03" : "2026-07-03,12:30:00";
      eq(parse(`${header},금액,내용\n${values},5000,가게`).rows[0]?.transaction_date, "2026-07-03", "time-zone/unit header cannot override date: " + title);
    }
    for (const date of ["", "bad"]) eq(parse(`${title},거래일,금액,내용\n12:30:00,${date},5000,2026-07-03 가게`).rows.length, 0, "time header never repairs explicit invalid date: " + title);
  }
  for (const title of ["거래일시(KST)", "거래일시[UTC]"]) eq(parse(`${title},금액,내용\n2026-07-03 12:30:00,5000,가게`).rows[0]?.transaction_date, "2026-07-03", "date-time column with time zone remains date");

  const clean = parse("날짜,금액,내용\n2026-07-03,5000,가게").rows[0];
  for (const hidden of ["현금", "통신비", "월급", "승인취소", "환불", "합계", "총계", "누계"]) {
    for (const header of ["미인식보조칸", "잔액", "원문"]) {
      const p = parse(`날짜,금액,내용,${header}\n2026-07-03,5000,가게,${hidden}`).rows[0];
      eq([p.type, p.category, p.payment_method, p._import_needs_confirmation], [clean.type, clean.category, clean.payment_method, false], "excluded source cannot contaminate inference " + header + hidden);
      if (header === "원문") eq(p.raw_text, hidden, "explicit raw preserved separately");
    }
  }
  const custom = parse("날짜,금액,내용,분류,결제수단,원문\n2026-07-03,5000,가게,내 분류,국민카드(1234),원래 입력").rows[0];
  eq([custom.category, custom.payment_method, custom.raw_text], ["내 분류", "국민카드(1234)", "원래 입력"], "custom explicit fields preserved");
  eq(parse(`날짜,금액,내용,분류\n2026-07-03,5000,통신비,${"가".repeat(81)}`).rejected[0].reason_code, "invalid_field", "invalid explicit field not replaced by context");
  eq(parse("어제 점심 12000원 카드").rows[0].transaction_date, "2026-10-15", "natural-language relative date preserved");
  eq(parse("2026-07-03,지출,38000,마트").rows[0].amount, 38000, "headerless table preserved");
  eq(parse("날짜:2026-07-03|금액:5000|분류:내 분류|결제수단:내 카드").rows[0].payment_method, "내 카드", "key/value custom payment preserved");
  for (const [phrase, expected] of [["내년", "2027-12-25"], ["작년", "2025-12-25"], ["재작년", "2024-12-25"]]) {
    eq(parse(`날짜,금액,내용\n${phrase} 12월 25일,5000,가게`).rows[0].transaction_date, expected, "explicit relative year wins over selected month/day " + phrase);
    eq(parse(`${phrase} 12월 25일 점심 5000원 카드`).rows[0].transaction_date, expected, "natural explicit relative year preserved " + phrase);
  }
  const signedExcluded = parse("날짜,금액,내용,상태\n2026-07-01,-5000,가게,합계\n2026-07-02,-6000,가게,총계\n2026-07-03,7000,월급,누계");
  eq(signedExcluded.sign_convention.mode, "signed", "excluded summary text does not alter file sign convention"); eq(signedExcluded.rows.length, 3, "excluded summary text never removes transactions");

  const quotes = parse('날짜,금액,내용\r\n2026-07-03,5000,TV 55"\r\n2026-07-04,6000,"가게, A ""매장""\r\n두번째 줄"');
  eq(quotes.rows.length, 2, "literal quote does not swallow next row"); eq(quotes.rows[0].memo, 'TV 55"', "literal quote preserved");
  eq(quotes.rows[1].memo, '가게, A "매장"\r\n두번째 줄', "quoted commas/escaped quotes/multiline preserved");
  eq(quotes.accepted.map(e => [e.row_number, e.source_location.start_line, e.source_location.end_line]), [[2, 2, 2], [3, 3, 4]], "physical and logical positions separated");
  const blanks = parse('\n날짜,금액,내용\n\n2026-07-03,5000,A\n\n날짜,금액,내용\n2026-07-04,6000,B');
  eq(blanks.accepted.map(e => [e.row_number, e.source_location.start_line, e.source_location.section]), [[2, 4, 1], [4, 7, 2]], "blank lines and table sections preserve logical IDs");
  const broken = parse('날짜,금액,내용\n2026-07-03,5000,"未完\n2026-07-04,6000,次行');
  eq(broken.rejected[0]?.reason_code, "invalid_csv", "unclosed quote gives cause"); eq(broken.rejected[0]?.source_location.start_line, 2, "unclosed quote gives location");
  eq(broken.rows[0]?.amount, 6000, "next physical transaction is recovered"); eq(broken.analysis_complete, false, "malformed analysis never marked complete");

  for (const role of ["owner", "admin", "member", "viewer", "blocked", "pending", "left"]) await fixture(async fx => {
    const nickname = fx.db.users.find(u => u.id === MEMBER).nickname;
    const p = await preview(fx, csv(8765, "권한 검사", nickname)); eq(p.payload.ready[0].row.user_id, MEMBER, "owner preview keeps explicit spender");
    if (role === "left") fx.db.household_members = fx.db.household_members.filter(m => !(m.user_id === USER && m.household_id === "house-home"));
    else fx.db.household_members.find(m => m.user_id === USER && m.household_id === "house-home").role = role;
    const before = fx.db.transactions.length, rpcBefore = writes(fx); const response = await commit(fx, p);
    const allowed = ["owner", "admin"].includes(role);
    eq(fx.db.transactions.length - before, allowed ? 1 : 0, "current role actual rows " + role); eq(writes(fx) - rpcBefore, allowed ? 1 : 0, "current role actual RPC " + role);
    if (allowed) { eq(response.status, 200, "authorized save"); eq(fx.db.transactions.at(-1).user_id, MEMBER, "actual stored spender"); }
    else ok(response.status >= 300, "denial is explicit " + role);
  });
  for (const role of ["viewer", "blocked", "pending", "left"]) await fixture(async fx => {
    const p = await preview(fx, csv(8765, "지출자 검사", fx.db.users.find(u => u.id === MEMBER).nickname));
    if (role === "left") fx.db.household_members = fx.db.household_members.filter(m => m.user_id !== MEMBER);
    else fx.db.household_members.find(m => m.user_id === MEMBER && m.household_id === "house-home").role = role;
    const before = fx.db.transactions.length; await commit(fx, p); eq(fx.db.transactions.length, before, "spender no longer eligible " + role); eq(writes(fx), 0, "ineligible spender RPC zero");
  });
  for (const recordOnly of [false, true]) await fixture(async fx => {
    fx.db.household_members.find(m => m.user_id === USER && m.household_id === "house-home").role = "member";
    if (recordOnly) fx.db.accountbook_settings.push({ key: "household_member_policy_v22943:house-home", value: JSON.stringify({ version: 1, mode: "record_only" }) });
    const p = await preview(fx, csv()); const before = fx.db.transactions.length; await commit(fx, p);
    eq(fx.db.transactions.length - before, 1, "member may newly analyze/save own record " + recordOnly); eq(fx.db.transactions.at(-1).user_id, USER, "own spender stored");
  });
  for (const attack of ["other-household", "tampered", "expired", "csrf"]) await fixture(async fx => {
    const p = await preview(fx, csv()); const before = fx.db.transactions.length;
    if (attack === "tampered") p.token += "x";
    if (attack === "expired") p.token = await worker.makeMyImportPreviewToken(fx.env, { ...p.payload, exp: 1 });
    const data = new URLSearchParams({ import_action: "commit", import_token: p.token, selected_rows: String(p.payload.ready[0].row_number), ...(attack === "other-household" ? { household_id: "house-other" } : {}) });
    await post(fx, data, attack === "csrf" ? { origin: "https://evil.example", "sec-fetch-site": "cross-site" } : {});
    eq(fx.db.transactions.length, before, "attack stores zero " + attack); eq(writes(fx), 0, "attack write RPC zero " + attack);
  });

  await fixture(async fx => {
    fx.db.transactions.push({ ...row(), id: "existing-one", user_id: MEMBER });
    const input = csv() + "\n2026-07-01,지출,7654,합성 구매";
    const a = await preview(fx, input), b = await preview(fx, input);
    eq(a.payload.ready.length, 1, "one DB occurrence consumes one of two file occurrences"); eq(a.payload.reason_counts.duplicate, 1, "duplicate multiplicity reported");
    eq(a.payload.duplicate_basis, ["existing-one"], "consumed basis signed"); const before = fx.db.transactions.length;
    await commit(fx, a); eq(fx.db.transactions.length - before, 1, "remaining occurrence actually saved");
    await commit(fx, a); eq(fx.db.transactions.length - before, 1, "same token retry preserves fixed ID");
    await commit(fx, b); eq(fx.db.transactions.length - before, 1, "second token consumes new competing occurrence");
    eq(fx.db.transactions.filter(t => t.amount === 7654).length, 2, "household policy ignores uploader identity");
  });
  await fixture(async fx => {
    fx.db.transactions.push({ ...row(), id: "existing-one" });
    const p = await preview(fx, csv() + "\n2026-07-01,지출,7654,합성 구매\n2026-07-01,지출,7654,합성 구매");
    eq(p.payload.ready.length, 2, "three occurrences minus one existing");
    const [a, b] = p.payload.ready; await commit(fx, p, [b.row_number]); await commit(fx, p, [a.row_number]);
    eq(fx.db.transactions.filter(t => t.amount === 7654).length, 3, "reverse partial selection reserves own-token siblings");
    await commit(fx, p); eq(fx.db.transactions.filter(t => t.amount === 7654).length, 3, "partial retries remain fixed");
  });
  await fixture(async fx => {
    const p = await preview(fx, csv() + "\n2026-07-01,지출,7654,합성 구매", { skip_duplicates: "0" });
    const before = fx.db.transactions.length; await commit(fx, p); await commit(fx, p);
    eq(fx.db.transactions.length - before, 2, "intentional equal values both save; retry does not add"); eq(writes(fx), 1, "retry makes zero extra RPC");
  });
  await fixture(async fx => {
    fx.db.__honor_select = true;
    const p = await preview(fx, csv()); await commit(fx, p);
    const original = structuredClone(fx.db.transactions.at(-1));
    const changed = await commit(fx, p, undefined, { ["row_type_" + p.payload.ready[0].row_number]: "income" });
    eq(fx.db.transactions.at(-1), original, "fixed-ID retry cannot replace already stored values"); eq(writes(fx), 1, "conflicting fixed-ID retry writes zero"); ok(changed.html.includes("기존 기록과 값이 다릅니다"), "fixed-ID conflict explains original preservation");
  });
  for (const change of [{ amount: 9999 }, { transaction_date: "2026-07-02" }, { source_user_key: "edited-source-key" }, { id: "99999999-9999-4999-8999-999999999999" }]) await fixture(async fx => {
    fx.db.__honor_select = true;
    const p = await preview(fx, csv()); await commit(fx, p);
    Object.assign(fx.db.transactions.at(-1), change);
    const stored = structuredClone(fx.db.transactions.at(-1)), count = fx.db.transactions.length;
    const retry = await commit(fx, p);
    eq(fx.db.transactions.length, count, "changed fixed identity never adds a transaction");
    eq(fx.db.transactions.at(-1), stored, "changed fixed identity preserves actual stored values");
    eq(writes(fx), 1, "fixed-ID/source-key query is independent of value similarity " + JSON.stringify(change));
    ok(retry.html.includes("기존 기록과 값이 다릅니다"), "changed fixed identity explains the conflict");
  });
  await fixture(async fx => {
    const input = csv() + "\n2026-07-01,지출,7654,합성 구매", a = await preview(fx, input), b = await preview(fx, input);
    await commit(fx, a, [2]); await commit(fx, b, [3]); await commit(fx, b, [2]);
    eq(fx.db.transactions.filter(row => row.amount === 7654).length, 2, "competing occurrences allocated in full file order across partial commits");
    await commit(fx, b); eq(fx.db.transactions.filter(row => row.amount === 7654).length, 2, "competing partial retry remains exactly two");
  });
  await fixture(async fx => {
    const input = "날짜,구분,금액,내용\n" + Array.from({ length: 300 }, (_, i) => `2026-07-01,지출,${10000 + i},합成${i}`).join("\n");
    const counts = [], limits = [], positions = [], before = fx.db.transactions.length;
    for (let i = 0; i < 4; i++) {
      const p = await preview(fx, input); counts.push(p.payload.ready.length); limits.push(p.payload.limited); positions.push(p.payload.ready[0]?.source_location.start_line || 0);
      await commit(fx, p);
    }
    eq(counts, [120, 120, 60, 0], "300 records progress across repeated analyses"); eq(limits, [180, 60, 0, 0], "limit applied after duplicate matching"); eq(positions, [2, 122, 242, 0], "batch source positions correct");
    eq(fx.db.transactions.length - before, 300, "all 300 actual rows exactly once"); eq(new Set(fx.db.transactions.slice(before).map(t => t.id)).size, 300, "300 distinct fixed IDs");
  });
  for (const maxRows of [1, 2]) await fixture(async fx => {
    fx.db.__transaction_max_rows = maxRows;
    for (let i = 0; i < 5; i++) fx.db.transactions.push({ ...row(), id: "existing-" + i });
    const p = await preview(fx, csv() + "\n2026-07-01,지출,7654,合成購入");
    eq(p.payload.reason_counts.duplicate, 1, "small DB page cap still reads complete source");
  });
  await fixture(async fx => {
    fx.db.__omit_count_header = true; const response = await post(fx, { household_id: "house-home", csv_text: csv(), skip_duplicates: "1" });
    eq(response.status, 503, "unknown page completeness fails explicitly"); eq(writes(fx), 0, "incomplete source never writes");
  });
  for (const source of ["file", "text", "converted", ""]) await fixture(async fx => {
    const form = new FormData(); form.set("household_id", "house-home"); form.set("month", "2026-07"); form.set("csv_text", csv(4321));
    form.set("csv_file", new File([csv(7654)], "bank.csv", { type: "application/vnd.ms-excel" })); if (source) form.set("input_source", source);
    const response = await post(fx, form);
    if (!source) { eq(response.status, 303, "unmarked conflicting sources rejected"); ok(response.location.includes("import_source_conflict"), "conflict cause"); return; }
    eq(response.status, 200, "explicit source accepted " + source);
    const token = response.html.match(/name="import_token" value="([^"]+)"/)?.[1]; const payload = await worker.verifyMyImportPreviewToken(fx.env, token);
    eq(payload.ready[0].row.amount, source === "file" ? 7654 : 4321, "only selected source parsed");
    await commit(fx, { token, payload }); eq(fx.db.transactions.at(-1).amount, source === "file" ? 7654 : 4321, "selected source actually stored");
  });
  for (const [name, bytes] of [["renamed.csv", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0])], ["bad.csv", new Uint8Array([1, 2, 3, 4])], ["real.xlsx", "PK workbook"]]) await fixture(async fx => {
    const form = new FormData(); form.set("household_id", "house-home"); form.set("input_source", "file"); form.set("csv_file", new File([bytes], name));
    const response = await post(fx, form); eq(response.status, 303, "binary/Excel rejected " + name); eq(writes(fx), 0, "binary writes zero");
  });
  await fixture(async fx => {
    const original = { ...row(9876), id: "roundtrip", memo: "=coffee", payment_method: "국민카드(1234)", raw_text: "별도 원문" }; fx.db.transactions.push(original);
    const response = await worker.default.fetch(new Request(BASE + "/my/backup.csv?household_id=house-home&month=2026-07", { headers: { cookie: fx.cookie } }), fx.env, {});
    eq(response.status, 200, "actual user CSV export"); const text = await response.text(); ok(text.includes("'=coffee"), "formula protection remains");
    const restored = parse(text).rows.find(t => t.amount === 9876); eq(restored.payment_method, "국민카드(1234)", "explicit payment survives actual export/import"); eq(restored.memo, "=coffee", "formula guard apostrophe is removed on import (V22.9.79 E-15; a memo that really starts with an apostrophe is kept)"); ok(restored.raw_text !== original.raw_text, "readable CSV does not claim unavailable raw restoration");
  });
  await fixture(async fx => {
    const a = await preview(fx, csv()), b = await preview(fx, csv()); const before = fx.db.transactions.length;
    await Promise.all([commit(fx, a), commit(fx, b)]);
    eq(fx.db.transactions.length - before, 1, "two concurrent tabs save one occurrence"); eq(writes(fx), 1, "two concurrent tabs issue one write RPC");
  });
  await fixture(async fx => {
    const other = fx.db.users.find(u => u.id === MEMBER).nickname, self = fx.db.users.find(u => u.id === USER).nickname;
    const p = await preview(fx, csv(7654, "同額", self) + `\n2026-07-01,지출,7654,同額,${other}\n2026-07-02,지출,7654,同額,${self}`);
    const before = fx.db.transactions.length; await commit(fx, p);
    eq(fx.db.transactions.length - before, 3, "explicit actual spender/date distinguish separate transactions");
    const repeated = await preview(fx, csv(7654, "同額", self) + `\n2026-07-01,지출,7654,同額,${other}`);
    eq(repeated.payload.ready.length, 0, "same explicit spenders still dedupe");
  });
  await fixture(async fx => {
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2027-01-05T00:01:00+09:00");
    const text = "날짜,금액,내용\n12/28,5000,가게";
    const defaults = await preview(fx, text, { month: "2027-01", date_basis_mode: "default" });
    eq(defaults.payload.ready[0].row.transaction_date, "2026-12-28", "HTTP explicit default basis rolls past December");
    const selected = await preview(fx, text, { month: "2025-07", date_basis_mode: "selected" });
    eq(selected.payload.ready[0].row.transaction_date, "2025-12-28", "HTTP selected month retains historical year");
    // V22.9.76 감사 E-4: 기준(date_basis_mode)을 보내지 않은 옛 요청은 화면 기본값과 같게 고른다. 이번 달(2027-01)이면 웹·카카오와 같은
    // 183일 규칙으로 지난 12월이 되고(예전 기대값 2027-12-28 은 1월에 가져온 12/28 을 올해 12월로 저장하던 E-4 결함), 다른 달이면 그 해를 지킨다.
    const legacy = await preview(fx, text, { month: "2027-01" }); eq(legacy.payload.ready[0].row.transaction_date, "2026-12-28", "legacy HTTP current month follows the default 183-day basis (E-4)");
    const legacyPast = await preview(fx, text, { month: "2025-07" }); eq(legacyPast.payload.ready[0].row.transaction_date, "2025-12-28", "legacy HTTP other month stays explicit");
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2028-01-01T00:01:00+09:00");
    const continued = await preview(fx, text, { month: "2027-01", date_basis_mode: "default", previous_import_token: defaults.token });
    eq(continued.payload.parsed.date_basis, defaults.payload.parsed.date_basis, "verified analysis family freezes reference date");
    eq(continued.payload.ready[0].row.id, defaults.payload.ready[0].row.id, "unchanged family preserves fixed transaction ID");
    const changed = await preview(fx, text, { month: "2027-01", date_basis_mode: "selected", previous_import_token: defaults.token });
    ok(changed.payload.jti !== defaults.payload.jti, "explicitly changed date basis requires new preview"); eq(changed.payload.ready[0].row.transaction_date, "2027-12-28", "changed basis is shown in new preview");
    const wrongSource = await post(fx, { household_id: "house-home", csv_text: csv(), previous_import_token: defaults.token });
    eq(wrongSource.status, 303, "previous token cannot authorize different source"); eq(writes(fx), 0, "date reanalysis never writes");
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-16T12:00:00+09:00");
  });
  await fixture(async fx => {
    const p = await preview(fx, csv());
    const memoryFetch = globalThis.fetch; let unknown = true;
    globalThis.fetch = async (input, init) => String(input).includes("/rpc/accountbook_commit_import_v22960") && unknown ? new Response('{"message":"synthetic pending write"}', { status: 503 }) : memoryFetch(input, init);
    const before = fx.db.transactions.length; const response = await commit(fx, p);
    eq(fx.db.transactions.length, before, "unknown attempt has no observed rows"); ok(response.html.includes("확인 필요"), "unknown remains explicit");
    const fresh = await post(fx, { household_id: "house-home", month: "2026-07", csv_text: csv(), skip_duplicates: "1" });
    eq(fresh.status, 409, "unknown source cannot create new token/ID");
    const changed = await commit(fx, p, undefined, { ["row_type_" + p.payload.ready[0].row_number]: "income" });
    eq(changed.status, 409, "unknown attempt cannot retry changed values");
    unknown = false; await commit(fx, p); eq(fx.db.transactions.length - before, 1, "same fixed-ID retry can resolve unknown");
    eq(fx.db.transactions.at(-1).id, p.payload.ready[0].row.id, "unknown retry kept original ID");
    const analyzed = await preview(fx, csv()); eq(analyzed.payload.ready.length, 0, "resolved source can be safely analyzed again");
  });
  await fixture(async fx => {
    const p = await preview(fx, csv()), memoryFetch = globalThis.fetch; let status = 503;
    globalThis.fetch = async (input, init) => String(input).includes("/rpc/accountbook_commit_import_v22960") ? new Response('{"message":"synthetic request outcome"}', { status }) : memoryFetch(input, init);
    await commit(fx, p); status = 400; const retry = await commit(fx, p);
    const state = JSON.parse(fx.db.accountbook_settings.find(row => row.key === p.payload.source_state_key).value);
    eq(state.state, "pending", "retry rejection cannot settle an earlier unknown request"); ok(retry.html.includes("확인 필요"), "retry rejection remains unknown to user");
    const fresh = await post(fx, { household_id: "house-home", month: "2026-07", csv_text: csv(), skip_duplicates: "1" });
    eq(fresh.status, 409, "earlier unknown still fences new token/ID after retry 400");
  });
  await fixture(async fx => {
    const a = await preview(fx, csv(), { skip_duplicates: "0" }), b = await preview(fx, csv(), { skip_duplicates: "0" });
    const memoryFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => String(input).includes("/rpc/accountbook_commit_import_v22960") ? new Response('{"message":"synthetic pending"}', { status: 503 }) : memoryFetch(input, init);
    await commit(fx, a); fx.db.transactions.push(structuredClone(a.payload.ready[0].row));
    // Hold a preview's exact-row GET after its snapshot is taken. B replaces
    // A's pending state while that stale read is in flight.
    let reached, release; const gate = new Promise(resolve => { release = resolve; }), atRead = new Promise(resolve => { reached = resolve; }); let held = false;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      if (!held && (init.method || "GET") === "GET" && url.pathname.endsWith("/transactions") && url.searchParams.get("id")?.includes(a.payload.ready[0].row.id)) {
        held = true; const response = await memoryFetch(input, init); reached(); await gate; return response;
      }
      if (url.pathname.endsWith("/rpc/accountbook_commit_import_v22960")) return new Response('{"message":"synthetic pending"}', { status: 503 });
      return memoryFetch(input, init);
    };
    const olderPreview = post(fx, { household_id: "house-home", month: "2026-07", csv_text: csv(), skip_duplicates: "0" });
    await atRead; await commit(fx, b);
    const current = () => JSON.parse(fx.db.accountbook_settings.find(row => row.key === a.payload.source_state_key).value);
    eq([current().state, current().jti], ["pending", b.payload.jti], "new B write is pending before stale preview resumes");
    release(); await olderPreview;
    eq([current().state, current().jti], ["pending", b.payload.jti], "read-only preview cannot overwrite newer pending state");
    const fresh = await post(fx, { household_id: "house-home", csv_text: csv() }); eq(fresh.status, 409, "new pending fence survives stale preview completion");
  });
  await fixture(async fx => {
    const p = await preview(fx, csv()), memoryFetch = globalThis.fetch; let replaced = false;
    const later = { revision: "f".repeat(32), v: 1, state: "pending", jti: "later-request", rows: [{ id: "99999999-9999-4999-8999-999999999999", hash: "0".repeat(64) }] };
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      if (!replaced && url.pathname.endsWith("/rpc/accountbook_import_source_v22960") && JSON.parse(JSON.parse(init.body).p_next_value || "{}").state === "complete") {
        replaced = true; fx.db.accountbook_settings.find(row => row.key === p.payload.source_state_key).value = JSON.stringify(later);
      }
      return memoryFetch(input, init);
    };
    await commit(fx, p);
    eq(JSON.parse(fx.db.accountbook_settings.find(row => row.key === p.payload.source_state_key).value), later, "conditional state update cannot overwrite a later pending request");
    eq(writes(fx), 1, "state-confirmation race never repeats transaction RPC");
    const fresh = await post(fx, { household_id: "house-home", csv_text: csv() }); eq(fresh.status, 409, "later pending fence remains effective");
  });
  await fixture(async fx => {
    const input = "날짜,금액,내용\n" + Array.from({ length: 120 }, (_, i) => `2026-07-01,${10000 + i},구매${i}`).join("\n");
    const p = await preview(fx, input), memoryFetch = globalThis.fetch, patches = [];
    globalThis.fetch = async (input, init = {}) => {
      if (new URL(String(input)).pathname.endsWith("/rpc/accountbook_import_source_v22960") && JSON.parse(JSON.parse(init.body).p_next_value || "{}").state === "complete") patches.push({ url: String(input), body: JSON.parse(init.body) });
      return memoryFetch(input, init);
    };
    const before = fx.db.transactions.length; await commit(fx, p);
    eq(fx.db.transactions.length - before, 120, "full-value CAS stores all default-limit rows");
    eq(patches.length, 1, "one completion CAS after initial state creation");
    ok(patches[0].url.length < 1024, "state CAS URL length is independent of signed row count");
    eq(new URL(patches[0].url).search, "", "state CAS uses JSON body, not PostgREST value filters");
    eq([patches[0].body.p_household_id, JSON.parse(patches[0].body.p_expected_value).rows.length], ["house-home", 120], "completion CAS carries household and all original pending bytes");
    const state = JSON.parse(fx.db.accountbook_settings.find(row => row.key === p.payload.source_state_key).value);
    eq(state.state, "complete", "default-limit state revision is confirmed");
    ok(/^[a-f0-9]{32}$/.test(state.revision), "state carries a unique fixed-size revision");
  });
  await fixture(async fx => {
    fx.env.MY_IMPORT_LIMIT = "1000"; fx.db.__honor_select = true;
    const input = "날짜,금액,내용\n" + Array.from({ length: 1100 }, (_, i) => `2026-07-01,${20000 + i},분할구매${i}`).join("\n");
    const before = fx.db.transactions.length, first = await preview(fx, input);
    eq(first.payload.ready.length, 1000, "one commit keeps the configured 1000-row save ceiling");
    await commit(fx, first); eq(fx.db.transactions.length - before, 1000, "first analysis-family batch stores 1000 actual rows");
    const rest = await preview(fx, input, { previous_import_token: first.token });
    eq(rest.payload.jti, first.payload.jti, "continuation keeps one analysis family");
    eq(rest.payload.ready.length, 100, "continuation excludes the 1000 stored occurrences");
    await commit(fx, rest, rest.payload.ready.slice(0, 50).map(entry => entry.row_number));
    eq(fx.db.transactions.length - before, 1050, "first continuation selection is saved");
    await commit(fx, rest, rest.payload.ready.slice(50).map(entry => entry.row_number));
    eq(fx.db.transactions.length - before, 1100, "same-family cumulative count never blocks remaining selection");
    eq(writes(fx), 3, "three selected batches invoke exactly three import RPCs");
    await commit(fx, rest); eq(writes(fx), 3, "continuation fixed-ID retry invokes zero additional RPCs");
    eq(new Set(fx.db.transactions.slice(before).map(row => row.id)).size, 1100, "continued analysis has distinct stable IDs");
    const done = await preview(fx, input, { previous_import_token: rest.token });
    eq(done.payload.ready.length, 0, "fully saved analysis family has no remaining candidate");
  });
  await fixture(async fx => {
    const p = await preview(fx, csv()), memoryFetch = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
      const response = await memoryFetch(input, init);
      if (String(input).endsWith("/rpc/accountbook_claim_operation")) {
        const data = await response.json(); return Response.json({ ...data, locked_until: new Date(Date.now() - 1000).toISOString() });
      }
      return response;
    };
    const before = fx.db.transactions.length; await commit(fx, p);
    eq(fx.db.transactions.length, before, "expired import lease stores zero rows"); eq(writes(fx), 0, "expired lease blocks write RPC");
  });
  const source = readFileSync(resolve(root, "src/index.js"), "utf8");
  const aliases = vm.runInNewContext("(" + source.match(/const IMPORT_FIELD_ALIASES = Object.freeze\((\{[\s\S]*?\n\})\);/)[1] + ")");
  const fixedAliases = new Set(Object.values(aliases).flat());
  const operationCounts = [];
  for (const rows of [1, 10, 120, 1000]) {
    const oldNormalize = String.prototype.normalize, oldFormatter = Intl.DateTimeFormat; let fixed = 0, formats = 0;
    String.prototype.normalize = function(...args) { if (fixedAliases.has(String(this))) fixed++; return oldNormalize.apply(this, args); };
    Intl.DateTimeFormat = new Proxy(oldFormatter, { construct(target, args, ctor) { formats++; return Reflect.construct(target, args, ctor); } });
    try { eq(parse("날짜,금액,내용\n" + Array.from({ length: rows }, (_, i) => `2026-07-01,${10000+i},합성구매${i}`).join("\n")).rows.length, rows, "count probe retains full processing scope"); }
    finally { String.prototype.normalize = oldNormalize; Intl.DateTimeFormat = oldFormatter; }
    operationCounts.push([fixed, formats]);
  }
  eq(operationCounts.map(count => count[0]), [30, 30, 30, 30], "fixed aliases are not recalculated per transaction");
  eq(operationCounts.map(count => count[1]), [1, 1, 1, 1], "request date Intl construction does not scale with rows");
  const header = "날짜,금액,내용\n2026-07-01,5000,";
  // V59: the 5 MiB parser limit stays intact; oversized memo rows are explicitly rejected before signing/storage.
  const maximumCell = parse(header + "x".repeat(5 * 1024 * 1024 - Buffer.byteLength(header)));
  eq([maximumCell.rows.length, maximumCell.rejected[0]?.reason_code, maximumCell.analysis_complete], [0, "memo_too_long", true], "maximum input/cell is fully analyzed and rejected by the authorized storage text contract");
  const escaped = header + '"' + '""'.repeat(Math.floor((5 * 1024 * 1024 - Buffer.byteLength(header) - 2) / 2)) + '"';
  const escapedResult = parse(escaped);
  eq([escapedResult.rows.length, escapedResult.rejected[0]?.reason_code], [0, "memo_too_long"], "maximum valid escaped-quote cell is analyzed and explicitly rejected");
  eq(escapedResult.analysis_complete, true, "maximum escaped-quote cell is complete");
  ok(escapedResult.rejected[0].raw.includes('"'.repeat(100)), "large escaped cell preserves a quote preview without accepting a truncated memo");
  const mixed = header + '"' + 'x""'.repeat(Math.floor((5 * 1024 * 1024 - Buffer.byteLength(header) - 2) / 3)) + '"';
  const mixedResult = parse(mixed);
  eq([mixedResult.rows.length, mixedResult.rejected[0]?.reason_code], [0, "memo_too_long"], "maximum mixed escaped-quote cell is analyzed and explicitly rejected");
  eq(mixedResult.analysis_complete, true, "maximum mixed escaped-quote cell is complete");
  ok(mixedResult.rejected[0].raw.includes('x"'.repeat(50)), "large mixed cell preserves a content preview without accepting a truncated memo");
  eq(parse(header + "x".repeat(5 * 1024 * 1024 - Buffer.byteLength(header) + 1)).analysis_complete, false, "over byte limit explicit");
  const json = parse(JSON.stringify(Array.from({ length: 11000 }, (_, i) => ({ date: "2026-07-01", amount: 10000 + i, memo: "item" }))));
  eq(json.total_rows, 11001, "JSON never silently drops records beyond ten thousand"); eq(json.analysis_complete, false, "JSON parsing range is explicit"); eq(json.unprocessed_rows, 6001, "JSON unprocessed count correct");
  eq(parse("a,".repeat(4096) + "last").rejected[0].reason_code, "structure_limit", "wide table bounded with explicit error");
  console.log(`PASS: V22.9.55 import prerequisites (${checks} checks)`);
} finally { globalThis.fetch = nativeFetch; globalThis.__AB_QA_FIXED_NOW_MS = clock; }

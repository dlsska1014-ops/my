import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
const root = process.env.AB_IMPORT_MAPPING_ROOT || fileURLToPath(new URL("../", import.meta.url));
const worker = await import(pathToFileURL(resolve(root, "src/index.js")));
const { createV2265QaFixture } = await import(pathToFileURL(resolve(root, "validation/qa-fixture.mjs")));
const USER = "11111111-1111-4111-8111-111111111111", MEMBER = "22222222-2222-4222-8222-222222222222", BASE = "https://malhaebook.com";
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const ok = (a, label) => { assert.ok(a, label); checks++; };
const rejects = (fn, label) => { assert.throws(fn, /import_mapping_invalid:/, label); checks++; };
const nativeFetch = globalThis.fetch, fixedClock = globalThis.__AB_QA_FIXED_NOW_MS;
globalThis.fetch = async () => { throw Error("mapping validation: external fetch blocked"); };
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-16T12:00:00+09:00");
const parse = (text, options = {}) => worker.parseFlexibleImportRecords(text, "house-home", USER, { importYear: 2026, ...options });
const edit = (column_index, field, section = 1) => ({ section, column_index, field });
const csv = "날짜,구분,금액,새값,내용\n2026-07-01,지출,5000,9000,합성 구매";
const delta = [edit(2, "ignore"), edit(3, "amount")];
async function fixture(fn) {
  const fx = await createV2265QaFixture();
  for (const [name, rows] of Object.entries(fx.db)) if (Array.isArray(rows)) fx.db[name] = JSON.parse(JSON.stringify(rows).replaceAll("user-bin", USER).replaceAll("user-wifi", MEMBER));
  fx.db.__import_rpc_available = true; fx.cookie = await fx.cookieFor(USER);
  try { await fn(fx); } finally { fx.restore(); }
}
async function post(fx, fields, headers = {}) {
  const body = fields instanceof FormData || fields instanceof URLSearchParams ? fields : new URLSearchParams(fields);
  const response = await worker.default.fetch(new Request(BASE + "/my/import", { method: "POST", body, headers: { cookie: fx.cookie, origin: BASE, "sec-fetch-site": "same-origin", ...(body instanceof FormData ? {} : { "content-type": "application/x-www-form-urlencoded" }), ...headers } }), fx.env, { waitUntil() {} });
  const text = await response.text(); let html = text; if ((response.headers.get("content-type") || "").includes("application/json")) html = JSON.parse(text).html;
  return { status: response.status, html, location: response.headers.get("location"), cache: response.headers.get("cache-control") };
}
async function preview(fx, text = csv, fields = {}) {
  const result = await post(fx, { household_id: "house-home", month: "2026-07", input_source: "text", csv_text: text, skip_duplicates: "1", mapping_protocol: "1", ...fields });
  eq(result.status, 200, "mapping preview returns candidates");
  const token = result.html.match(/name="import_token" value="([^"]+)"/)?.[1]; ok(token, "actual preview token is present");
  const payload = await worker.verifyMyImportPreviewToken(fx.env, token); ok(payload, "actual signed preview verifies");
  return { ...result, token, payload };
}
async function reanalyze(fx, previous, changes = delta, fields = {}, text = csv) { return preview(fx, text, { previous_import_token: previous.token, mapping_delta: JSON.stringify(changes), ...fields }); }
async function commit(fx, p, picks = p.payload.ready.map(entry => entry.row_number), fields = {}) {
  const form = new URLSearchParams({ import_action: "commit", import_token: p.token, ...fields });
  for (const pick of picks) form.append("selected_rows", String(pick));
  return post(fx, form);
}
const writes = fx => fx.db.__rpc_calls.filter(call => call.name === "accountbook_commit_import_v22960").length;
try {
  const fixtures = [
    csv,
    "날짜,구분,금액,내용,분류,결제수단,지출자,원문\n2026-07-01,지출,5000,점심,식비,현금,,원래 문장",
    "거래일,입금액,출금액,내용,통화\n2026-07-02,3000,0,보상,KRW\n2026-07-03,,5000,가게,KRW",
    "날짜,금액,내용\n2026-07-01,-5000,가게\n2026-07-02,-6000,가게\n2026-07-03,9000,보상",
    "날짜,금액,내용\n2026-07-01,5000,가게\n内容,amount,date\n상점,9000,2026-07-02",
    "구분,금액,내용\n지출,5000,2026-07-01 점심",
    "date,amount,amount,memo,memo,category,category\n2026-07-01,5000,,점심,모임,식비,외식",
    "날짜,금액,통화,원문,외화금액,원화금액,내용\n2026-07-01,5000,USD,현금 취소 월급 합계,20,5000,상점",
    '날짜,내용,금액\n2026-07-01,"TV 55인치\n구매",5000',
  ];
  for (const text of fixtures) {
    const legacy = parse(text), mapped = parse(text, { mappingMetadata: true, mappingDelta: [] });
    for (const key of ["rows", "accepted", "rejected", "warnings", "sign_convention", "date_basis", "mappings", "analysis_complete", "total_rows"]) eq(mapped[key], legacy[key], "no-change mapping preserves V55 " + key);
    const same = legacy.mappings.filter(m => ["date", "amount", "type", "income", "expense", "memo", "category", "payment", "spender", "ignore"].includes(m.field)).map(m => edit(m.column_index, m.field, m.section));
    eq(parse(text, { mappingMetadata: true, mappingDelta: same }).rows, legacy.rows, "explicit automatic no-ops preserve exact metadata");
  }
  const mapped = parse(csv, { mappingMetadata: true, mappingDelta: delta });
  eq(mapped.rows[0].amount, 9000, "unknown source column becomes actual server amount");
  ok(mapped.rows[0].raw_text.includes("5000"), "ignored column remains in original text");
  eq(mapped.mapping_schema.sections[0].columns[3].automatic, "", "unrecognized column metadata is included");
  eq(mapped.mapping_schema.sections[0].columns[3].sample, "9000", "short source sample is included");
  eq(mapped.mapping_delta, delta, "only effective delta is retained");
  const multiple = "날짜,금액,새값,내용\n2026-07-01,5000,8000,가게\n내용,새값,금액,날짜\n상점,9000,6000,2026-07-02";
  eq(parse(multiple, { mappingDelta: [edit(2, "ignore", 2), edit(1, "amount", 2)] }).rows.map(r => r.amount), [5000, 9000], "section-specific indexes never alter the first table");
  eq(parse("date,amount,amount,memo\n2026-07-01,5000,9000,가게", { mappingDelta: [edit(1, "ignore")] }).rows[0].amount, 9000, "duplicate titles retain independent indexes");
  const poisoned = "날짜,금액,내용,비고\n2026-07-01,5000,가게,월급 현금 취소 통신비 합계";
  for (const field of ["memo", "ignore"]) {
    const p = parse(poisoned, { mappingDelta: [edit(3, field)] });
    if (field === "ignore") { eq(p.rows[0].type, "expense", "ignored type words stay excluded"); eq(p.rows[0].payment_method, "", "ignored payment stays excluded"); eq(p.rows[0]._import_needs_confirmation, false, "ignored cancellation stays excluded"); eq(p.rows[0].category, "기타지출", "ignored category stays excluded"); }
  }
  const sourceDate = "날짜,금액,내용\n2025-07-01,5000,2026-07-02 점심";
  eq(parse(sourceDate, { mappingDelta: [edit(0, "ignore")] }).rows[0].transaction_date, "2026-07-02", "date presence and file-year scan follow effective mapping");
  const signed = "날짜,금액,새값,내용\n2026-07-01,5000,-7000,가게\n2026-07-02,5000,-8000,가게\n2026-07-03,5000,9000,보상";
  eq(parse(signed, { mappingDelta: [edit(1, "ignore"), edit(2, "amount")] }).rows.map(r => r.type), ["expense", "expense", "income"], "sign prepass uses reassigned amount");
  for (const item of [null, {}, { section: "1", column_index: 0, field: "date" }, edit(-1, "date"), edit(99, "memo"), edit(1, "memo", 9), edit(1.5, "memo"), edit(1, "currency"), edit(1, "raw_text"), edit(1, "constructor"), edit(1, "__proto__"), { ...edit(1, "memo"), extra: 1 }]) rejects(() => parse(csv, { mappingDelta: [item] }), "malformed mapping is rejected");
  rejects(() => parse(csv, { mappingDelta: [edit(1, "memo"), edit(1, "ignore")] }), "duplicate delta is rejected");
  rejects(() => parse(csv, { mappingDelta: Array.from({ length: 257 }, (_, i) => edit(i, "memo")) }), "mapping count is bounded");
  for (const field of ["date", "amount", "type"]) rejects(() => parse(csv, { mappingDelta: [edit(3, field)] }), "new singleton conflict is explained");
  rejects(() => parse(csv, { mappingDelta: [edit(3, "income")] }), "new mixed amount method is rejected");
  const fxCurrency = "날짜,금액,통화,원문,외화금액,새값,내용\n2026-07-01,5000,USD,원문,50,7000,상점";
  for (const index of [2, 3]) for (const field of ["ignore", "amount", "memo"]) rejects(() => parse(fxCurrency, { mappingDelta: [edit(index, field)] }), "protected currency/raw column cannot be edited");
  for (const curr of ["USD", "EUR"]) {
    const text = fxCurrency.replace("USD", curr);
    eq(parse(text, { mappingDelta: [edit(1, "ignore"), edit(5, "amount")] }).rows.length, 0, "reassignment cannot remove currency protection");
    eq(parse(text, { mappingDelta: [edit(1, "ignore"), edit(4, "amount")] }).rows.length, 0, "foreign amount reassignment remains foreign");
  }
  for (const header of ["income(USD)", "expense(EUR)", "moneyin(USD)"]) {
    const text = `date,amount,${header},memo\n2026-07-01,5000,50,shop`;
    eq(parse(text).rows.length, 0, "foreign original money is protected before edits");
    for (const field of ["ignore", "memo", "category"]) eq(parse(text, { mappingDelta: [edit(2, field)] }).rows.length, 0, "original foreign money metadata survives " + field);
  }
  const sectionCases = [
    "date,amount,memo\n2026-07-01,5000,A\n# sheet: note,amount,memo\n2026-07-02,6000,B\nmemo,amount,date\nC,7000,2026-07-03",
    "date,amount,memo\n2024-07-01,5000,A\n2/29,amount,memo\nmemo,amount,date,category\nC,7000,2024-07-03,custom",
    "date,amount,memo\n2024-07-01,5000,A\n2/29,amount,memo\nmemo,amount,date\nC,7000,2024-07-03",
  ];
  for (const text of sectionCases) {
    const original = parse(text), p = parse(text, { mappingMetadata: true, mappingDelta: [] });
    eq(p.rows, original.rows, "sheet/leap classification cannot drift with metadata"); eq(p.accepted, original.accepted, "section and original locations stay identical"); eq(p.mapping_schema.sections.map(s => s.section), [1, 2], "only real source headers allocate section IDs");
    eq(parse(text, { mappingDelta: [edit(1, "ignore", 2)] }).rows.filter(row => row.amount === 7000).length, 0, "second actual section edit cannot miss its target");
  }
  const wideHeaders = ["날짜", "금액", ...Array.from({ length: 4094 }, (_, i) => "열" + i)];
  const wide = wideHeaders.join(",") + "\n" + ["2026-07-01", "5000", ...Array(4094).fill("표본")].join(",");
  const w = parse(wide, { mappingMetadata: true }); eq(w.mapping_schema.total_columns, 4096, "full width is reported"); eq(w.mapping_schema.shown, 64, "metadata page is bounded"); ok(JSON.stringify(w.mapping_schema).length < 18000, "metadata bytes stay bounded");
  const w2 = parse(wide, { mappingMetadata: true, mappingOffset: 4032 }); eq(w2.mapping_schema.sections[0].columns[0].column_index, 4032, "last page exposes all remaining columns"); eq(w2.rows, w.rows, "metadata pagination never changes parser results");
  const noTitle = parse("알파,베타,감마\n2026-07-01,5000,가게", { mappingMetadata: true }); eq(noTitle.format, "headerless_table", "unknown first row is never silently made a header");
  await fixture(async fx => {
    const p = await preview(fx); eq(p.payload.ready[0].row.amount, 5000, "initial auto amount");
    const same = await reanalyze(fx, p, []); eq(same.payload.jti, p.payload.jti, "no-change jti retained"); eq(same.payload.ready, p.payload.ready, "all signed candidate values and IDs retained"); eq(same.payload.mapping_revision, p.payload.mapping_revision, "no-change revision retained");
    const changed = await reanalyze(fx, same); eq(changed.payload.jti, p.payload.jti, "pre-save same family retains fixed IDs"); ok(changed.payload.mapping_revision !== p.payload.mapping_revision, "changed mapping invalidates old candidate"); eq(changed.payload.ready[0].row.amount, 9000, "new token contains actual recalculated amount");
    eq((await commit(fx, p)).status, 409, "old tab cannot commit stale mapping"); eq(writes(fx), 0, "stale commit made no transaction write");
    const saved = await commit(fx, changed, undefined, { import_response: "json" }); eq(saved.status, 200, "current mapped token commits"); eq(fx.db.transactions.at(-1).amount, 9000, "actual row has mapped amount");
    const frozen = JSON.parse(fx.db.accountbook_settings.find(row => row.key === p.payload.source_state_key).value); eq(frozen.mapping.used, true, "storage start permanently fences mapping"); eq(frozen.mapping.revision, changed.payload.mapping_revision, "metadata survives complete transition"); ok(!JSON.stringify(frozen).includes("합성 구매"), "source text is absent from durable state");
    const again = await reanalyze(fx, changed); eq(again.payload.ready.length, 0, "same mapping after save proceeds without duplicate IDs"); eq(again.payload.mapping_locked, true, "UI reflects server lock");
    const forbidden = await post(fx, { household_id: "house-home", month: "2026-07", csv_text: csv, mapping_protocol: "1", previous_import_token: again.token, mapping_delta: "[]" }); eq(forbidden.status, 409, "mapping cannot change after storage starts");
    const omitted = await post(fx, { household_id: "house-home", month: "2026-07", csv_text: csv, mapping_protocol: "1" }); eq(omitted.status, 409, "missing previous token cannot reset used mapping");
    eq(writes(fx), 1, "forbidden reanalysis does not write transactions");
  });
  await fixture(async fx => {
    const legacyResponse = await post(fx, { household_id: "house-home", month: "2026-07", csv_text: csv, skip_duplicates: "1" });
    const token = legacyResponse.html.match(/name="import_token" value="([^"]+)"/)[1]; const legacy = { token, payload: await worker.verifyMyImportPreviewToken(fx.env, token) };
    await preview(fx); eq((await commit(fx, legacy)).status, 409, "V55 token cannot bypass new source fence"); eq(writes(fx), 0, "legacy bypass wrote nothing");
  });
  await fixture(async fx => {
    const legacyResponse = await post(fx, { household_id: "house-home", month: "2026-07", csv_text: csv, skip_duplicates: "1" });
    const token = legacyResponse.html.match(/name="import_token" value="([^"]+)"/)[1]; const legacy = { token, payload: await worker.verifyMyImportPreviewToken(fx.env, token) };
    await commit(fx, legacy);
    const altered = await post(fx, { household_id: "house-home", month: "2026-07", csv_text: csv, skip_duplicates: "1", mapping_protocol: "1", previous_import_token: token, mapping_delta: JSON.stringify(delta) });
    eq(altered.status, 409, "previous V55 storage cannot be remapped by protocol migration"); eq(writes(fx), 1, "migration does not insert changed values");
    const current = await reanalyze(fx, legacy, []); eq(current.payload.mapping_locked, true, "unchanged V55 migration inherits storage fence");
  });
  await fixture(async fx => {
    const p = await preview(fx), a = await reanalyze(fx, p);
    const retry = await reanalyze(fx, p); eq(retry.payload.mapping_revision, a.payload.mapping_revision, "lost response retry reissues current revision"); eq(retry.payload.ready, a.payload.ready, "lost response retry reissues exact IDs and values");
    const b = await reanalyze(fx, p, [edit(1, "ignore"), edit(2, "ignore"), edit(3, "income")]); eq(b.payload.ready[0].row.type, "income", "in-flight edit can supersede unused immediate descendant");
    eq((await commit(fx, a)).status, 409, "superseded in-flight candidate cannot be committed");
    const retryB = await reanalyze(fx, p, [edit(1, "ignore"), edit(2, "ignore"), edit(3, "income")]); eq(retryB.payload.mapping_revision, b.payload.mapping_revision, "lost descendant response can be retried exactly");
    await commit(fx, retryB); const reset = await post(fx, { household_id: "house-home", month: "2026-07", csv_text: csv, mapping_protocol: "1" }); eq(reset.status, 409, "fresh initial preview cannot reset a used remapped source");
  });
  await fixture(async fx => {
    const p = await preview(fx); await commit(fx, p, undefined, { ["row_type_" + p.payload.ready[0].row_number]: "income" });
    const q = await reanalyze(fx, p, []); eq(q.payload.ready.length, 0, "used fixed-ID value conflict does not create new candidate"); eq(q.payload.reason_counts.duplicate || 0, 0, "changed fixed-ID values are not described as simple duplicate"); ok(q.payload.outcomes.some(outcome => outcome.suggestion.includes("고정 ID")), "conflict recovery explains original record comparison");
  });
  for (const fields of [
    { mapping_delta: "{" }, { mapping_delta: "null" }, { mapping_delta: JSON.stringify({ __proto__: null }) },
    { mapping_delta: "[]".repeat(9000) }, { mapping_offset: "-1" }, { mapping_offset: "1.5" }, { mapping_offset: "constructor" }, { mapping_offset: "1000000" },
    { mapping_protocol: "2" },
  ]) await fixture(async fx => { const p = await preview(fx); const response = await post(fx, { household_id: "house-home", month: "2026-07", csv_text: csv, mapping_protocol: "1", previous_import_token: p.token, ...fields }); eq(response.status, 400, "malformed HTTP mapping is rejected"); eq(writes(fx), 0, "malformed request never writes transactions"); });
  await fixture(async fx => {
    const p = await preview(fx); const form = new URLSearchParams({ household_id: "house-home", month: "2026-07", csv_text: csv, mapping_protocol: "1", previous_import_token: p.token }); form.append("mapping_delta", "[]"); form.append("mapping_delta", "[]");
    eq((await post(fx, form)).status, 400, "duplicate mapping parameter is rejected"); eq(writes(fx), 0, "duplicate parameter has no transaction effect");
    const fresh = await post(fx, { household_id: "house-home", month: "2026-07", csv_text: csv, mapping_protocol: "1", mapping_delta: JSON.stringify(delta) }); eq(fresh.status, 400, "mapping changes require a verified previous result");
    const upload = new FormData(); for (const [key, value] of Object.entries({ household_id: "house-home", month: "2026-07", input_source: "file", mapping_protocol: "1", previous_import_token: p.token, mapping_delta: "[]" })) upload.set(key, value);
    upload.set("csv_file", new File([csv + "different"], "synthetic.csv", { type: "text/csv" })); eq((await post(fx, upload)).status, 303, "reselected different file cannot join signed family");
    const state = JSON.parse(fx.db.accountbook_settings.find(row => row.key === p.payload.source_state_key).value); ok(JSON.stringify(state).length < 1500, "durable source mapping state has a bounded small contract");
  });
  await fixture(async fx => {
    const p = await preview(fx), q = await preview(fx); eq((await commit(fx, p)).status, 409, "initial preview without previous token supersedes old unused candidate");
    eq((await post(fx, { household_id: "house-home", month: "2026-07", csv_text: csv, mapping_protocol: "1", previous_import_token: p.token, mapping_delta: JSON.stringify(delta) })).status, 409, "old tab cannot rejoin independent new analysis through parent revision"); eq((await commit(fx, q)).status, 200, "latest initial candidate still works");
  });
  await fixture(async fx => {
    const text = "날짜,金額,내용\n" + Array.from({ length: 300 }, (_, i) => `2026-07-01,${5001 + i},합성${i}`).join("\n");
    let p = await preview(fx, text), inserted = [];
    for (let i = 0; i < 4; i++) { const before = fx.db.transactions.length; await commit(fx, p); inserted.push(fx.db.transactions.length - before); if (i < 3) p = await reanalyze(fx, p, [], {}, text); }
    eq(inserted, [120, 120, 60, 0], "mapping protocol preserves following 120/120/60/0 batches");
  });
  await fixture(async fx => {
    const p = await preview(fx); const memory = globalThis.fetch;
    globalThis.fetch = async (input, init) => String(input).includes("/rpc/accountbook_commit_import_v22960") ? new Response('{"message":"synthetic pending"}', { status: 503 }) : memory(input, init);
    await commit(fx, p); const state = JSON.parse(fx.db.accountbook_settings.find(row => row.key === p.payload.source_state_key).value);
    eq(state.state, "pending", "uncertain write stays pending"); eq(state.mapping.used, true, "pending retains used mapping fence");
    const blocked = await post(fx, { household_id: "house-home", month: "2026-07", csv_text: csv, mapping_protocol: "1", previous_import_token: p.token, mapping_delta: JSON.stringify(delta) }); eq(blocked.status, 409, "uncertain write cannot generate remapped IDs");
    globalThis.fetch = memory; await commit(fx, p); const next = await reanalyze(fx, p, []); eq(next.payload.mapping_revision, p.payload.mapping_revision, "resolved pending preserves mapping lineage"); eq(next.payload.ready.length, 0, "exact retry resolves without duplicate insert");
  });
  await fixture(async fx => {
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-12-31T23:59:00+09:00");
    const text = "날짜,금액,내용\n12/28,5000,가게"; const p = await preview(fx, text, { month: "2026-12", date_basis_mode: "default" });
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2027-01-01T00:01:00+09:00"); const q = await reanalyze(fx, p, [], { month: "2027-01", date_basis_mode: "default" }, text);
    eq(q.payload.parsed.date_basis, p.payload.parsed.date_basis, "KST year boundary preserves verified date basis"); eq(q.payload.ready[0].row.id, p.payload.ready[0].row.id, "KST reanalysis preserves fixed ID");
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-16T12:00:00+09:00");
  });
  await fixture(async fx => {
    const text = "날짜,QZX,금액,내용\n2026-07-01,2025-07-02,5000,가게\n7/3,7/4,6000,가게";
    const p = await preview(fx, text); eq(p.payload.parsed.date_basis.file_year, 2026, "initial file-year evidence");
    const q = await reanalyze(fx, p, [edit(0, "ignore"), edit(1, "date")], {}, text);
    eq(q.payload.ready.map(e => e.row.transaction_date), ["2025-07-02", "2025-07-04"], "remapped date column refreshes file-year evidence"); eq(q.payload.parsed.date_basis.reference_date, p.payload.parsed.date_basis.reference_date, "mapping change retains verified reference clock");
    const same = await reanalyze(fx, q, [edit(0, "ignore"), edit(1, "date")], {}, text); eq(same.payload.ready, q.payload.ready, "unchanged remapped file-year reanalysis retains values and IDs");
  });
  await fixture(async fx => {
    const p = await preview(fx, csv, { date_basis_mode: "default" });
    const q = await reanalyze(fx, p, [], { date_basis_mode: "selected" }); ok(q.payload.jti !== p.payload.jti, "changed requested date basis starts a new family");
    const recovered = await reanalyze(fx, p, [], { date_basis_mode: "selected" }); eq(recovered.payload.mapping_revision, q.payload.mapping_revision, "lost changed-basis response recovers exact revision"); eq(recovered.payload.ready, q.payload.ready, "changed-basis retry preserves current fixed IDs"); eq((await commit(fx, p)).status, 409, "parent basis candidate stays invalid");
    await commit(fx, recovered); eq(fx.db.transactions.at(-1).id, q.payload.ready[0].row.id, "recovered basis candidate stores current ID once");
  });
  await fixture(async fx => {
    const p = await preview(fx, csv, { month: "2025-07", date_basis_mode: "selected" });
    const q = await reanalyze(fx, p, [], { month: "2026-07", date_basis_mode: "selected" }); ok(q.payload.mapping_revision !== p.payload.mapping_revision, "requested year change is distinct even when explicit file year wins"); eq(q.payload.ready[0].row.transaction_date, "2026-07-01", "explicit file date stays authoritative");
    const same = await reanalyze(fx, p, [], { month: "2026-07", date_basis_mode: "selected" }); eq(same.payload.jti, q.payload.jti, "lost requested-year response reuses descendant family");
  });
  await fixture(async fx => {
    const long = "date,amount," + "x".repeat(2 * 1024 * 1024) + "memo\n2026-07-01,5000,shop";
    const p = await preview(fx, long); ok(p.token.length < 30000, "recognized long header does not inflate token"); ok(p.payload.parsed.mappings.every(item => item.source.length <= 80), "legacy mapping summary is also length bounded");
    const q = await reanalyze(fx, p, [], {}, long); eq(q.payload.ready, p.payload.ready, "long recognized header can actually be reanalyzed"); await commit(fx, q); eq(fx.db.transactions.at(-1).amount, 5000, "bounded long-header token is actually usable for storage");
  });
  for (const kind of ["invalid", "expired", "household", "source", "role", "csrf"]) await fixture(async fx => {
    const p = await preview(fx); const fields = { household_id: "house-home", month: "2026-07", csv_text: csv, mapping_protocol: "1", previous_import_token: p.token, mapping_delta: JSON.stringify(delta) };
    if (kind === "invalid") fields.previous_import_token += "x";
    if (kind === "expired") fields.previous_import_token = await worker.makeMyImportPreviewToken(fx.env, { ...p.payload, exp: 1 });
    if (kind === "household") fields.household_id = "house-shared";
    if (kind === "source") fields.csv_text += "changed";
    if (kind === "role") fx.db.household_members.find(m => m.user_id === USER && m.household_id === "house-home").role = "viewer";
    const result = await post(fx, fields, kind === "csrf" ? { origin: "https://evil.example", "sec-fetch-site": "cross-site" } : {});
    ok(result.status >= 300, kind + " rejects reanalysis"); eq(writes(fx), 0, kind + " writes no transactions");
  });
  const runtime = readFileSync(resolve(root, "src/modules/client/lucian-d-import.js"), "utf8");
  ok(!/localStorage|indexedDB|sessionStorage/.test(runtime), "new runtime does not persist source text");
  const digest = createHash("sha256").update(readFileSync(resolve(root, "src/index.js"))).digest("hex");
  console.log(`PASS: V22.9.56 import mapping (${checks} checks)`);
  if (process.env.AB_IMPORT_MAPPING_REPORT) (await import("node:fs")).writeFileSync(process.env.AB_IMPORT_MAPPING_REPORT, JSON.stringify({ checks, node: process.version, execPath: process.execPath, workerSha256: digest }, null, 2) + "\n");
} finally { globalThis.fetch = nativeFetch; if (fixedClock === undefined) delete globalThis.__AB_QA_FIXED_NOW_MS; else globalThis.__AB_QA_FIXED_NOW_MS = fixedClock; }

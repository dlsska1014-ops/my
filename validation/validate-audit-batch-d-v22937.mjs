// V22.9.37 감사 묶음 D(가져오기·백업 적용·입력 검증) 검사.
// 항목: 공용 엄격 검증기(domain/strict-input.js), N5·D6(엑셀 일련번호·두 자리 연도), T9(합계 행·구분 없는 수입),
// T10(파일 전체 부호 규칙·미리보기 구분 변경), SIM-6(관리자 백업 적용의 잠금·불명확 저장·읽기 실패),
// SIM-7(계획 파일·JSON 가져오기의 엄격 검증), N7(자산 잔액), N13(관리자 API). 재현은 모두 메모리 픽스처
// (validation/qa-fixture.mjs)로 하며 네트워크를 쓰지 않는다. 각 항목의 첫 검사는 수정 전 코드에서 실패한다.
import { readFileSync } from "node:fs";
import * as acorn from "../tools/vendor/acorn.mjs";
import { parseManifest, stripBuildBlocks } from "../tools/build-worker.mjs";
import { parseFlexibleImportRecords } from "../src/index.js";
import { computePaymentAssetTotals } from "../src/modules/settings/payment-assets.js";
import { BASE, app, counter, ctx, fixture, intercept, post, settingValue, withClock } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.37 감사 묶음 D(가져오기·검증) 통과");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const text = (html) => String(html).replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const escapeRe = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const parse = (csv) => parseFlexibleImportRecords(csv, "house-home", "user-bin", { importYear: 2026, source: "my_import" });

// ── 1. 공용 엄격 검증기 domain/strict-input.js ─────────────────────────
{
  const manifest = parseManifest(read("src/modules/MANIFEST.txt"));
  const at = manifest.indexOf("domain/strict-input.js");
  ok(at > 0 && manifest[at - 1] === "domain/transactions-core.js", "strict-input.js 는 MANIFEST 에서 domain/transactions-core.js 바로 뒤에 있다");
  const body = stripBuildBlocks(read("src/modules/domain/strict-input.js"), "domain/strict-input.js");
  const ast = acorn.parse(body, { ecmaVersion: "latest", sourceType: "script" });
  eq(ast.body.filter((node) => node.type !== "FunctionDeclaration").length, 0, "최상위에는 함수 선언만 있다(로드 때 평가되는 상수 없음)");
  const names = ast.body.map((node) => node.id.name);
  for (const name of ["parseStrictAmount", "parseStrictMonth", "parseStrictDate", "parseStrictDay"]) ok(names.includes(name), `${name} 을 선언한다`);
  // 의존 함수(연결 순서상 앞에 있는 상수·함수)를 흉내 내어 모듈 본문만 단독으로 평가한다.
  const validMonth = (value) => (/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(String(value || "")) ? String(value) : null);
  const isValidTransactionDateString = (value) => {
    const v = String(value || "").trim();
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  };
  const strict = new Function("MAX_TRANSACTION_AMOUNT", "validMonth", "isValidTransactionDateString", `${body}\nreturn { parseStrictAmount, parseStrictMonth, parseStrictDate, parseStrictDay };`)(2_000_000_000, validMonth, isValidTransactionDateString);
  for (const [value, expected, label] of [[12000, 12000, "정수"], ["12000", 12000, "숫자 문자열"], [" 500 ", 500, "공백 둘린 숫자 문자열"], ["+500", 500, "+ 부호"], [0, 0, "0"], [2_000_000_000, 2_000_000_000, "거래 상한"], [1e3, 1000, "숫자 1e3(=1000)"]]) eq(strict.parseStrictAmount(value), expected, `parseStrictAmount 받음: ${label}`);
  for (const [value, label] of [["", "빈 문자열"], [" ", "공백"], ["0x10", "16진수 문자열"], ["1e3", "지수 문자열"], ["12.5", "소수 문자열"], [12.5, "소수"], [-100, "음수"], ["-100", "음수 문자열"], [NaN, "NaN"], [Infinity, "Infinity"], [true, "불리언"], [null, "null"], [undefined, "undefined"], [{}, "객체"], [[500], "배열"], ["1,000", "쉼표 묶음(기본)"], [2_000_000_001, "상한 초과"], ["abc", "문자"], ["1만원", "단위 문자열"]]) eq(strict.parseStrictAmount(value), null, `parseStrictAmount 거절: ${label}`);
  eq(strict.parseStrictAmount("1,500,000", { allowCommas: true }), 1500000, "allowCommas 면 천 단위 쉼표를 받는다");
  eq(strict.parseStrictAmount("1,50,000", { allowCommas: true }), null, "쉼표 자리가 틀리면 거절한다");
  eq(strict.parseStrictAmount(-5000, { allowNegative: true }), -5000, "allowNegative 면 음수를 그대로 돌려준다");
  eq(strict.parseStrictAmount("-5000", { allowNegative: true }), -5000, "allowNegative 는 음수 문자열도 받는다");
  eq(strict.parseStrictAmount(-5000, { allowNegative: true, max: 4000 }), null, "allowNegative 도 크기 상한을 본다");
  eq(strict.parseStrictAmount(0, { min: 1 }), null, "min 아래는 거절한다");
  eq(strict.parseStrictAmount(5, { min: 1, max: 10 }), 5, "min·max 안의 값은 받는다");
  ok(Object.is(strict.parseStrictAmount("-0"), 0), "-0 은 0 이다");
  for (const [value, expected] of [["2026-07", "2026-07"], [" 2026-12 ", "2026-12"], ["2026-13", null], ["2026-00", null], ["2026/07", null], ["202607", null], [202607, null], ["1999-12", null], ["", null], [null, null]]) eq(strict.parseStrictMonth(value), expected, `parseStrictMonth(${JSON.stringify(value)})`);
  for (const [value, expected] of [["2026-07-15", "2026-07-15"], ["2024-02-29", "2024-02-29"], ["2026-02-30", null], ["2026-07-15T00:00:00", null], ["2026/07/15", null], ["20260715", null], [20260715, null], ["1999-01-01", null], ["", null]]) eq(strict.parseStrictDate(value), expected, `parseStrictDate(${JSON.stringify(value)})`);
  for (const [value, expected] of [[1, 1], ["05", 5], [31, 31], [0, null], [32, null], ["1e1", null], [15.5, null], ["", null]]) eq(strict.parseStrictDay(value), expected, `parseStrictDay(${JSON.stringify(value)})`);
  eq(strict.parseStrictDay(28, { max: 28 }), 28, "parseStrictDay 는 max 옵션을 받는다");
  eq(strict.parseStrictDay(29, { max: 28 }), null, "parseStrictDay 는 max 를 넘으면 거절한다");
  // 쓰는 곳
  const index = read("src/index.js");
  ok(/function cleanImportedRowsForInsert[\s\S]{0,900}parseStrictAmount\(out\.amount, \{ min: 1 \}\)/.test(index), "가져오기 저장 직전 정리가 공용 엄격 금액 검증기를 쓴다(SIM-7)");
  ok(/function validateAdminApiTransactionBody[\s\S]{0,1800}parseStrictAmount\(body\.amount, \{ min: 1 \}\)/.test(index), "관리자 API 본문 검증이 공용 엄격 금액 검증기를 쓴다(N13)");
  ok(/function strictCandidatePlanRow[\s\S]{0,400}parseStrictAmount\(r\.amount, \{ min: 1 \}\)/.test(index), "백업 계획 행 검증이 공용 엄격 금액 검증기를 쓴다(SIM-7)");
  ok(!/parseAmountValue\(form\.get\("balance"\)/.test(index), "자산 잔액 폼이 자연어 금액 해석기를 바로 쓰지 않는다(N7)");
  ok(/function handleImportApplyPost[\s\S]{0,4000}withHouseholdSettingsRmw\(env, householdId/.test(index), "관리자 백업 적용은 가계부 설정 잠금 안에서 한다(SIM-6)");
}

// ── N5·D6 엑셀 일련번호·두 자리 연도 ──────────────────────────────
await withClock("2026-07-15", async () => {
  let result = parse("날짜,구분,금액,내용\n,지출,38000,마트\n2026-07-02,지출,52000,주유");
  eq(result.rows.length, 1, "N5 날짜가 빈 행은 저장 후보가 아니다");
  eq(result.rejected[0]?.reason_code, "missing_date", "N5 날짜가 빈 행은 missing_date 로 확인 필요에 간다(예전에는 금액 38000 이 2004-01-14 가 됐다)");
  ok(!result.rows.some((row) => row.transaction_date.startsWith("2004")), "N5 금액 칸을 엑셀 날짜로 읽지 않는다");
  result = parse("날짜,구분,금액,내용\n2026-13-45,지출,52000,주유");
  eq(result.rows.length, 0, "N5 날짜가 틀린 행은 저장 후보가 아니다(예전에는 2042-05-14)");
  eq(result.rejected[0]?.reason_code, "invalid_date", "N5 틀린 날짜는 invalid_date 다");
  result = parse("날짜,구분,금액,내용\n46207,지출,4500,a");
  eq(result.rows[0]?.transaction_date, "2026-07-04", "N5 날짜 열의 엑셀 일련번호는 여전히 날짜다");
  result = parse("날짜,구분,금액,내용\n10/12/25,지출,4500,커피\n1/1/26,지출,4500,a\n12/10/25,지출,4500,b\n25.10.12,지출,4500,c");
  eq(result.rows.map((row) => row.transaction_date).join(","), "2025-10-12,2026-01-01,2025-12-10,2025-10-12", "D6 두 자리 연도는 M/D/YY 를 먼저 보고 월이 13 이상이면 YY/MM/DD 다(예전에는 10/12/25 → 2010-12-25)");
  eq(result.two_digit_year_rows, 4, "D6 두 자리 연도 행 수를 돌려준다");
  ok(result.warnings.some((w) => w.includes("월/일/연도")), "D6 두 자리 연도 해석을 파일 경고로 알린다");
  ok(!result.rows.some((row) => (row._import_warnings || []).length), "D6 행마다 경고를 붙여 모든 행을 확인 필요로 만들지 않는다");
  result = parse("날짜,구분,금액,내용\n2035-01-01,지출,4500,e\n1999-12-31,지출,4500,f\n2027-01-01,지출,4500,g");
  eq(result.rows.map((row) => row.transaction_date).join(","), "2027-01-01", "N5 연도는 2000년~내년만 받는다");
  eq(result.rejected.filter((r) => r.reason_code === "invalid_date").length, 2, "N5 범위 밖 연도는 invalid_date 다");
  result = parse("구분,금액,내용\n지출,4500,2026-07-03 커피");
  eq(result.rows[0]?.transaction_date, "2026-07-03", "날짜 열이 없는 표는 예전처럼 행 안의 날짜를 쓴다");
  result = parse("어제 점심 12000원 카드");
  eq(result.rows[0]?.transaction_date, "2026-07-14", "자연어 행은 예전처럼 상대 날짜를 읽는다");
  eq(parse("날짜,금액,내용\n07/04,3500,coffee").rows[0]?.transaction_date, "2026-07-04", "연도 없는 M/D 는 선택한 달의 연도다");
  eq(parse("날짜,구분,금액,내용\n7월 15일,지출,4500,a").rows[0]?.transaction_date, "2026-07-15", "한글 월일은 여전히 날짜다");
  eq(parse("날짜,구분,금액,내용\n2026-07-04 13:22:10,지출,4500,a").rows[0]?.transaction_date, "2026-07-04", "날짜시각 문자열은 여전히 날짜다");
  const headerless = parse("2026-07-03,지출,38000,마트");
  ok(headerless.rows.length === 1 && headerless.rows[0].transaction_date === "2026-07-03" && headerless.rows[0].amount === 38000, "N5 제목 없는 행의 다섯 자리 금액은 날짜가 아니라 금액이다");
});

// ── T9 합계 행·구분 없는 수입 ──────────────────────────────────────
{
  let result = parse("날짜,구분,금액,내용\n2026-07-01,지출,4500,커피\n2026-07-31,합계,4500,7월 합계\n합계,,4500,");
  eq(result.rows.length, 1, "T9 날짜가 있는 합계 행도 저장 후보가 아니다(예전에는 지출 4,500원이 됐다)");
  eq(result.rejected.filter((r) => r.reason_code === "summary_row").length, 2, "T9 쉼표로 이은 합계 행은 summary_row 로 제외된다(예전에는 invalid_date·지출)");
  result = parse("날짜,금액,내용\n2026-07-01,4500,커피\n총합계,4500,\n,123000,지출 합계\n소계: 4500,,");
  eq(result.rejected.filter((r) => r.reason_code === "summary_row").length, 3, "T9 총합계·지출 합계·소계: 칸을 합계로 본다");
  eq(result.rows.length, 1, "T9 합계 행 사이의 거래는 남는다");
  result = parse("날짜,구분,금액,잔액\n2026-07-01,지출,4500,995500\n# 시트: 8월\n날짜,구분,금액,잔액\n2026-08-01,지출,3000,992500");
  eq(result.rows.length, 2, "T9 잔액 열이 있는 표의 거래 행은 합계가 아니다");
  eq(result.rejected.filter((r) => r.reason_code === "repeated_header").length, 1, "T9 잔액 열이 있는 반복 제목 행을 합계로 오인하지 않는다");
  result = parse("날짜,구분,금액,내용\n2026-07-01,지출,4500,합계 확인 점심");
  eq(result.rows.length, 1, "T9 메모 문장 속 합계 말은 행을 제외하지 않는다");
  result = parse("날짜,금액,분류,내용,결제수단\n2026-07-25,3000000,급여,월급,계좌이체\n2026-07-05,180000,부수입,중고판매,카카오뱅크\n2026-07-04,12000,식비,점심,카드\n2026-07-10,50000,선물,부모님 용돈,현금\n2026-07-11,3000,기타,판매 수수료,계좌");
  eq(result.rows.map((row) => row.type).join(","), "income,income,expense,expense,expense", "T9 구분 열이 없으면 D2 규칙으로 월급·판매는 수입, 점심·부모님 용돈·판매 수수료는 지출이다(예전에는 모두 지출)");
  result = parse("날짜\t금액\t내용\n2026-07-25\t3000000\t월급");
  eq(result.rows[0]?.type, "income", "T9 탭으로 이은 표도 같다");
}

// ── T10 파일 전체 부호 규칙·미리보기 구분 변경 ───────────────────────
{
  let result = parse("날짜,구분,금액,내용\n2026-07-01,지출,-4500,커피\n2026-07-02,지출,-12000,점심\n2026-07-25,수입,3000000,월급");
  eq(result.sign_convention.mode, "signed", "T10 음수가 둘 이상·절반 이상이고 양수 지출이 없으면 부호 파일이다");
  eq(result.rows.map((row) => `${row.type}:${row.category}`).join(","), "expense:카페/간식,expense:외식,income:급여", "T10 부호 파일의 음수 지출은 환급(수입)이 되지 않는다(예전에는 커피·점심이 환급 수입)");
  ok(!result.rows.some((row) => row._import_needs_confirmation), "T10 부호 파일의 음수 지출에는 확인 필요 표시가 없다");
  ok(result.warnings.some((w) => w.startsWith("부호 규칙:")), "T10 부호 규칙을 파일 경고로 알린다");
  result = parse("날짜,금액,내용\n2026-07-01,-4500,커피\n2026-07-02,-12000,점심\n2026-07-25,3000000,월급\n2026-07-26,15000,점심값");
  eq(result.rows.map((row) => row.type).join(","), "expense,expense,income,income", "T10 구분 열이 없는 부호 파일은 음수 = 지출, 양수 = 수입이다(예전에는 월급이 지출, 커피가 환급)");
  ok(result.rows[3]._import_warnings.some((w) => w.includes("부호 규칙")), "T10 내용이 지출로 보이는 양수 수입에는 확인 경고를 붙인다");
  result = parse("날짜,구분,금액,내용,분류,결제수단\n2026-07-01,지출,4500,스타벅스,카페/간식,카드\n2026-07-01,수입,50000,용돈,기타수입,계좌\n2026-07-02,지출,-5000,취소건,식비,카드\n2026-07-16,지출,12000,점심,식비,국민카드");
  eq(result.sign_convention.mode, "default", "T10 양수 지출이 있는 파일은 부호 파일이 아니다");
  const refund = result.rows.find((row) => row.amount === 5000);
  ok(refund?.type === "income" && refund.category === "환급" && refund._import_needs_confirmation === true, "T10 그런 파일의 음수 지출은 예전처럼 환급(수입)·확인 필요다");
  eq(parse("날짜,구분,금액,내용\n2026-07-01,지출,-4500,커피\n2026-07-25,수입,3000000,월급").sign_convention.mode, "default", "T10 음수가 한 건뿐이면 부호 파일로 보지 않는다");
  eq(parse("날짜,구분,금액,내용\n2026-07-01,수입,-4500,환불\n2026-07-02,지출,-12000,점심").sign_convention.mode, "default", "T10 음수 수입이 있으면 부호 파일로 보지 않는다");
  eq(parse("날짜,출금액,입금액,내용\n2026-07-01,-4500,,커피\n2026-07-02,-12000,,점심\n2026-07-25,,3000000,월급").rows.map((row) => row.type).join(","), "expense,expense,income", "T10 출금액 열이 음수인 통장 내보내기도 지출로 읽는다");
}
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    const BIN = "11111111-1111-4111-8111-111111111111";
    for (const [name, rows] of Object.entries(fx.db)) if (Array.isArray(rows)) fx.db[name] = JSON.parse(JSON.stringify(rows).replaceAll("user-bin", BIN));
    fx.cookie = await fx.cookieFor(BIN);
    fx.db.__import_rpc_available = true;
    const csv = "날짜,구분,금액,내용\n2026-07-01,지출,-4500,커피\n2026-07-02,지출,-12000,점심\n2026-07-25,수입,3000000,월급";
    const preview = await post(fx, "/my/import", { household_id: "house-home", month: "2026-07", csv_text: csv, skip_duplicates: "1" });
    eq(preview.status, 200, "T10 부호 파일 미리보기가 열린다");
    ok(preview.text.includes('id="importSignConvention"') && preview.text.includes("음수 = 지출, 양수 = 수입"), "T10 미리보기가 추론한 부호 규칙을 보여 준다");
    eq((preview.text.match(/class="importTypePick"/g) || []).length, 3, "T10 행마다 구분을 바꾸는 선택 상자가 있다");
    ok(/name="row_type_2"[^>]*>\s*<option value="expense" selected>지출<\/option>/.test(preview.text), "T10 2행(커피)의 선택 상자는 지출이 선택돼 있다");
    ok(/data-amount="4500"[^>]*data-type="expense"/.test(preview.text), "T10 커피 행은 지출 후보다(예전에는 환급 수입)");
    ok(preview.text.includes('id="selectedImportExpense">16,500원') && preview.text.includes('id="selectedImportIncome">3,000,000원'), "T10 처음 선택 합계가 부호 규칙을 따른다");
    eq((preview.text.match(/class="importPick"/g) || []).length, 3, "T10 선택 체크박스 수는 그대로다");
    const token = preview.text.match(/name="import_token" value="([^"]+)"/)?.[1] || "";
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    eq(payload.parsed?.sign_convention?.mode, "signed", "T10 서명된 미리보기에 부호 규칙이 실린다");
    const body = new URLSearchParams({ import_action: "commit", import_token: token, row_type_2: "income", row_type_4: "expense", row_type_3: "bogus" });
    for (const row of [2, 3, 4]) body.append("selected_rows", String(row));
    const before = fx.db.transactions.length;
    const commit = await post(fx, "/my/import", body);
    eq(commit.status, 200, "T10 구분을 바꾼 저장이 된다");
    eq(fx.db.transactions.length - before, 3, "T10 세 행이 저장된다");
    const saved = fx.db.transactions.slice(before);
    eq(saved.find((row) => row.amount === 4500)?.type, "income", "T10 미리보기에서 수입으로 바꾼 커피 행은 수입으로 저장된다");
    eq(saved.find((row) => row.amount === 3000000)?.type, "expense", "T10 지출로 바꾼 월급 행은 지출로 저장된다");
    eq(saved.find((row) => row.amount === 12000)?.type, "expense", "T10 엉뚱한 구분 값은 무시하고 원래 구분(지출)으로 저장된다");
    ok(fx.db.__rpc_calls.some((call) => call.name === "accountbook_claim_operation" && call.data?.p_key === "transaction-import:house-home"), "B12 저장은 여전히 가계부 가져오기 잠금 안에서 한다");
    const refundCsv = "날짜,구분,금액,내용,분류\n2026-07-03,지출,7000,편의점,식비\n2026-07-03,지출,9000,마트,식비\n2026-07-04,지출,-5000,취소건,식비";
    const preview2 = await post(fx, "/my/import", { household_id: "house-home", month: "2026-07", csv_text: refundCsv, skip_duplicates: "1" });
    ok(preview2.text.includes("취소·환불(수입)로 읽고 확인 필요로 표시했습니다"), "T10 환불 해석도 미리보기에 밝힌다");
    ok(/data-amount="5000"[^>]*data-type="income"[^>]*data-review-needed="1"/.test(preview2.text), "T10 양수 지출 사이의 음수는 예전처럼 환급(수입)·확인 필요로 표시한다");
    const token2 = preview2.text.match(/name="import_token" value="([^"]+)"/)?.[1] || "";
    const before2 = fx.db.transactions.length;
    await post(fx, "/my/import", new URLSearchParams({ import_action: "commit", import_token: token2, selected_rows: "4", row_type_4: "expense" }));
    const flipped = fx.db.transactions.slice(before2)[0];
    ok(flipped && flipped.type === "expense" && flipped.category !== "환급" && flipped.amount === 5000, "T10 환급 행을 지출로 되돌려 저장하면 분류가 환급이 아니다");
  });
});

// ── SIM-6 관리자 백업 적용: 잠금·불명확 저장·읽기 실패 ───────────────
const adminLogin = async (fx) => {
  fx.env.ADMIN_PASSWORD = "qa-admin-123";
  fx.env.ADMIN_SESSION_SECRET = "qa-admin-session";
  const login = await post(fx, "/login", { password: "qa-admin-123" }, { cookie: "" });
  return (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
};
const multipart = async (fx, cookie, path, fields) => {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  const res = await app.fetch(new Request(`${BASE}${path}`, { method: "POST", headers: { cookie, origin: BASE, "sec-fetch-site": "same-origin" }, body: fd }), fx.env, ctx);
  return { status: res.status, html: await res.text() };
};
const planFile = (rows) => new File([JSON.stringify({ app: "kakao-accountbook", mode: "candidate_plan_only_no_db_write", selected: rows })], "plan.json", { type: "application/json" });
const applyPlan = (fx, cookie, rows, extra = {}) => multipart(fx, cookie, "/backup/apply", { plan_file: planFile(rows), household_id: extra.household_id ?? "house-home", month: extra.month ?? "2026-07", admin_password: "qa-admin-123", confirm_text: "가져오기 적용" });
const planRow = (memo, amount, extra = {}) => ({ type: "expense", transaction_date: "2026-07-20", amount, category: "식비", memo, payment_method: "카드", user_id: "user-bin", ...extra });
await fixture(async (fx) => {
  const cookie = await adminLogin(fx);
  ok(cookie.length > 10, "관리자로 로그인한다");
  // 두 요청의 현재 기록 읽기가 모두 끝난 뒤에야 저장이 시작되도록 막는다. 잠금이 없으면 둘 다 "신규"로 보고 둘 다 저장한다.
  let waiting = 0;
  let release = null;
  const barrier = new Promise((resolve) => { release = resolve; });
  const restoreBarrier = intercept(async ({ url, method }) => {
    if (method === "GET" && url.pathname.endsWith("/transactions") && url.searchParams.has("transaction_date")) {
      waiting += 1;
      if (waiting >= 2) release();
      await Promise.race([barrier, new Promise((resolve) => setTimeout(resolve, 400))]);
    }
    return null;
  });
  const before = fx.db.transactions.length;
  const [a, b] = await Promise.all([applyPlan(fx, cookie, [planRow("qa-concurrent", 5000)]), applyPlan(fx, cookie, [planRow("qa-concurrent", 5000)])]);
  restoreBarrier();
  eq(fx.db.transactions.length - before, 1, "SIM-6 같은 계획을 동시에 두 번 적용해도 한 번만 저장된다(가계부 설정 잠금)");
  ok(a.status === 200 && b.status === 200, "SIM-6 두 요청 모두 결과 화면을 받는다");
  ok(text(a.html + b.html).includes("중복으로 제외"), "SIM-6 뒤의 요청은 중복으로 제외했다고 알린다");
  ok(fx.db.__rpc_calls.some((call) => call.name === "accountbook_claim_operation" && call.data?.p_key === "household-settings-rmw:house-home"), "SIM-6 적용은 가계부 설정 잠금(household-settings-rmw)을 쓴다");
  // 응답을 잃은 저장: 저장은 됐는데 503 → 다시 읽어 저장됨으로 확인한다(예전에는 "저장하지 못함(기존 데이터 유지)").
  fx.db.__lose_next_transaction_response = 1;
  const before2 = fx.db.transactions.length;
  const lost = await applyPlan(fx, cookie, [planRow("qa-lost-response", 6000)]);
  eq(fx.db.transactions.length - before2, 1, "SIM-6 응답을 잃은 저장은 한 번만 저장된다");
  ok(/qa-lost-response[^|]{0,80}저장됨/.test(text(lost.html)), "SIM-6 다시 읽어 확인한 행은 저장됨으로 알린다");
  ok(!text(lost.html).includes("저장하지 못함(기존 데이터 유지)"), "SIM-6 저장된 행을 실패라고 알리지 않는다(예전에는 실패로 알려 다시 제출하면 중복됐다)");
  // 저장 전에 끊긴 503(결과 불명확, 다시 읽어도 없음) → 확인 필요로 알리고 남은 행은 적용하지 않는다.
  fx.db.__fail_transaction_writes = 1;
  const before3 = fx.db.transactions.length;
  const unknown = await applyPlan(fx, cookie, [planRow("qa-unknown-1", 7000), planRow("qa-unknown-2", 8000)]);
  eq(fx.db.transactions.length - before3, 0, "SIM-6 불명확한 저장 뒤 남은 행은 적용하지 않는다");
  const unknownText = text(unknown.html);
  ok(unknownText.includes("확인 필요 1") && /qa-unknown-1[^|]{0,80}확인 필요: 저장 여부 확인 필요/.test(unknownText), "SIM-6 결과를 모르는 행은 확인 필요로 알린다(실패가 아니다)");
  ok(!/qa-unknown-1[^|]{0,80}저장하지 못함/.test(unknownText), "SIM-6 결과를 모르는 행을 '저장하지 못함'이라고 하지 않는다");
  ok(unknownText.includes("형식·범위·중단 제외 1") && /qa-unknown-2[^|]{0,80}제외: 앞선 저장 결과가 불명확해 적용하지 않음/.test(unknownText), "SIM-6 뒤 행은 중단 사유와 함께 제외로 보여 준다");
  ok(unknownText.includes("같은 계획을 다시 제출하세요"), "SIM-6 확인 뒤에만 다시 제출하라고 안내한다");
  // 현재 기록을 못 읽으면 빈 목록으로 보지 않고 적용하지 않는다.
  const restoreRead = intercept(({ url, method }) => (method === "GET" && url.pathname.endsWith("/transactions") && url.searchParams.has("transaction_date") ? new Response(JSON.stringify({ code: "QA" }), { status: 503, headers: { "content-type": "application/json" } }) : null));
  const before4 = fx.db.transactions.length;
  const failed = await applyPlan(fx, cookie, [planRow("qa-readfail", 9000)]);
  restoreRead();
  eq(failed.status, 400, "SIM-6 현재 기록 읽기 실패는 오류 화면이다");
  eq(fx.db.transactions.length - before4, 0, "SIM-6 읽기 실패 위에 적용하지 않는다");
  ok(!fx.db.accountbook_operation_locks.some((lock) => lock.operation_key === "household-settings-rmw:house-home" && Date.parse(lock.locked_until) > Date.now() + 1000), "SIM-6 오류 뒤 잠금을 풀었다");
  // 잠금이 이미 잡혀 있으면 적용하지 않고 409 로 알린다.
  const heldLock = { operation_key: "household-settings-rmw:house-home", owner: "other-worker", locked_until: new Date(Date.now() + 60000).toISOString(), updated_at: new Date().toISOString() };
  const existingLock = fx.db.accountbook_operation_locks.find((lock) => lock.operation_key === heldLock.operation_key);
  if (existingLock) Object.assign(existingLock, heldLock);
  else fx.db.accountbook_operation_locks.push(heldLock);
  const before5 = fx.db.transactions.length;
  const busy = await applyPlan(fx, cookie, [planRow("qa-busy", 9500)]);
  eq(busy.status, 409, "SIM-6 다른 작업이 잠금을 잡고 있으면 409 다");
  ok(text(busy.html).includes("아무 행도 저장하지 않았으니") && fx.db.transactions.length === before5, "SIM-6 잠금 중에는 아무 행도 저장하지 않았다고 알린다");
});

// ── SIM-7 계획 파일·JSON 가져오기의 엄격 검증 ────────────────────────
await fixture(async (fx) => {
  const cookie = await adminLogin(fx);
  const before = fx.db.transactions.length;
  const res = await applyPlan(fx, cookie, [
    planRow("qa-hex", "0x10"), planRow("qa-type", 1000, { type: "bogus" }), planRow("qa-negative", -5000), planRow("qa-decimal", 12.5),
    planRow("qa-stranger", 3000, { user_id: "user-nobody" }), planRow("qa-no-spender", 3500, { user_id: undefined }), planRow("qa-other-month", 2000, { transaction_date: "2026-08-02" }),
    planRow("qa-object-memo", 4000, { memo: { x: 1 } }), planRow("qa-good", 2500),
  ]);
  eq(res.status, 200, "SIM-7 형식 오류가 섞인 계획도 결과 화면을 받는다");
  eq(fx.db.transactions.slice(before).map((row) => row.memo).join(","), "qa-good", "SIM-7 형식·범위가 맞는 행만 저장된다(예전에는 0x10 → 16원, bogus → 지출, 12.5 → 13원, 비참여자·다른 달도 저장)");
  const body = text(res.html);
  for (const [memo, reason] of [["qa-hex", "금액 ‘0x10’은 1원 이상의 정수가 아님"], ["qa-type", "구분 ‘bogus’은 income·expense 가 아님"], ["qa-negative", "금액 ‘-5000’은 1원 이상의 정수가 아님"], ["qa-decimal", "금액 ‘12.5’은 1원 이상의 정수가 아님"], ["qa-stranger", "활성 참여자가 아니어서 제외"], ["qa-no-spender", "지출자(user_id)가 없어 저장할 수 없음"], ["qa-other-month", "선택한 달(2026-07) 밖의 날짜"]]) {
    ok(new RegExp(`${escapeRe(memo)}[^|]{0,120}${escapeRe(reason)}`).test(body), `SIM-7 ${memo} 행은 사유(${reason})와 함께 제외된다`);
  }
  ok(body.includes("memo 가 문자열이 아님"), "SIM-7 문자열이 아닌 내용 칸도 사유와 함께 제외된다");
  ok(body.includes("형식·범위·중단 제외 8"), "SIM-7 제외 건수를 알린다");
  ok(/qa-hex[^|]{0,40}제외: 형식 오류로 제외/.test(body) && !/qa-hex[^|]{0,40}실패:/.test(body), "SIM-7 형식 오류 행은 실패가 아니라 제외로 표시한다");
  const before2 = fx.db.transactions.length;
  const ghost = await applyPlan(fx, cookie, [planRow("qa-ghost", 7000)], { household_id: "house-ghost" });
  eq(ghost.status, 400, "SIM-7 목록에 없는 가계부는 400 이다");
  eq(fx.db.transactions.length - before2, 0, "SIM-7 없는 가계부에 저장하지 않는다(예전에는 house-ghost 행이 생겼다)");
  const allBad = await applyPlan(fx, cookie, [planRow("qa-bad", "abc")]);
  eq(allBad.status, 400, "SIM-7 저장할 수 있는 행이 없으면 계획을 거절한다");
  ok(text(allBad.html).includes("형식 오류 1건"), "SIM-7 거절 사유에 형식 오류 건수가 있다");
  const finalCheck = await multipart(fx, cookie, "/backup/final-check", { plan_file: planFile([planRow("qa-hex", "0x10"), planRow("qa-good", 2500)]), household_id: "house-home", month: "2026-07", admin_password: "qa-admin-123" });
  const finalText = text(finalCheck.html);
  ok(finalCheck.status === 200 && finalText.includes("형식이 잘못된 후보 1건") && finalText.includes("선택 후보 1"), "SIM-7 최종 확인도 형식 오류 행을 빼고 알린다");
  // /admin/import/json — 파서가 거른 행은 사유와 함께 skipped 로 돌아온다
  fx.db.__import_rpc_available = true;
  const jsonImport = async (payload) => {
    const response = await app.fetch(new Request(`${BASE}/admin/import/json`, { method: "POST", headers: { cookie, origin: BASE, "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify(payload) }), fx.env, ctx);
    return { status: response.status, data: await response.json() };
  };
  const before3 = fx.db.transactions.length;
  const imported = await jsonImport({ household_id: "house-home", user_id: "user-bin", raw_text: "날짜,구분,금액,내용\n2026-07-01,지출,0x10,qa-json-hex\n2026-07-02,지출,12.5,qa-json-decimal\n2026-07-03,지출,4500,qa-json-good" });
  eq(imported.status, 200, "SIM-7 JSON 가져오기가 된다");
  eq(imported.data.inserted, 1, "SIM-7 JSON 가져오기는 형식이 맞는 행만 저장한다");
  eq(imported.data.skipped, 2, "SIM-7 0x10·12.5 행은 건너뛴다(예전에는 12.5 가 13원)");
  ok(imported.data.warnings.some((w) => /^2행: 금액 형식을 해석하지 못함/.test(w)) && imported.data.warnings.some((w) => /^3행: 금액 형식을 해석하지 못함/.test(w)), "SIM-7 건너뛴 행의 사유를 돌려준다");
  eq(fx.db.transactions.slice(before3).map((row) => row.amount).join(","), "4500", "SIM-7 16원·13원 행은 저장되지 않는다");
  const noHousehold = await jsonImport({ household_id: { id: "house-home" }, user_id: "user-bin", raw_text: "2026-07-03,지출,4500,a" });
  eq(noHousehold.data.error, "household_id_required", "SIM-7 가계부 ID 가 문자열이 아니면 400 이다");
});

// ── N7 자산 잔액: 해석 실패 거절·음수는 대출·신용카드만 ───────────────
await fixture(async (fx) => {
  const key = "payment_assets:house-home";
  const assets = () => JSON.parse(settingValue(fx, key));
  const balanceOf = (idOrName) => assets().find((a) => a.id === idOrName || a.name === idOrName)?.balance;
  const msgOf = (res) => decodeURIComponent(res.location).replace(/\+/g, " ");
  const update = (id, balance) => post(fx, "/admin/payment-asset/update", { household_id: "house-home", month: "2026-07", id, mode: "balance", balance });
  const create = (fields) => post(fx, "/admin/payment-asset/create", { household_id: "house-home", month: "2026-07", ...fields });
  let res = await update("asset-2", "abc");
  ok(res.status === 303 && msgOf(res).includes("잔액을 숫자로 입력해 주세요"), "N7 해석할 수 없는 잔액은 거절한다(예전에는 0 으로 저장)");
  eq(balanceOf("asset-2"), 5200000, "N7 거절된 입력은 기존 잔액을 바꾸지 않는다");
  res = await update("asset-2", "-5000");
  ok(msgOf(res).includes("음수 잔액은 대출·부채와 신용카드에서만"), "N7 통장 잔액의 음수는 거절한다(예전에는 5,000원으로 부호가 뒤집혔다)");
  eq(balanceOf("asset-2"), 5200000, "N7 거절된 음수는 저장되지 않는다");
  res = await update("asset-2", "");
  ok(msgOf(res).includes("잔액을 입력해 주세요") && balanceOf("asset-2") === 5200000, "N7 잔액 저장 폼의 빈 칸은 0 으로 저장하지 않고 거절한다");
  res = await update("asset-2", "1,500,000");
  ok(msgOf(res).includes("msg=payment_asset_balance_updated") && balanceOf("asset-2") === 1500000, "N7 쉼표 숫자는 받는다");
  await update("asset-2", "530만원");
  eq(balanceOf("asset-2"), 5300000, "N7 단위가 붙은 한글 금액은 예전처럼 받는다");
  res = await post(fx, "/admin/payment-asset/update", { household_id: "house-home", month: "2026-07", id: "asset-2", mode: "edit", name: "급여통장", kind: "bank_account", issuer: "", memo: "주거래", balance: "", include_in_asset: "on" });
  ok(msgOf(res).includes("msg=payment_asset_updated") && balanceOf("asset-2") === 5300000, "N7 상세 수정의 빈 잔액 칸은 기존 잔액을 유지한다(예전에는 0)");
  res = await create({ name: "주택대출", kind: "loan", balance: "-120000" });
  ok(msgOf(res).includes("msg=payment_asset_saved") && balanceOf("주택대출") === -120000, "N7 대출의 음수 잔액은 입력한 대로 저장된다(예전에는 120,000)");
  const snapshot = Object.values(JSON.parse(settingValue(fx, "asset_history:house-home"))).at(-1);
  ok(snapshot.liability_total > 0 && snapshot.net_worth === snapshot.asset_total - snapshot.liability_total, "N7 음수 대출을 저장해도 자산 이력은 부채를 양수로 차감한다");
  res = await create({ name: "비상금", kind: "cash", balance: "(3000)" });
  ok(msgOf(res).includes("음수 잔액은 대출·부채와 신용카드에서만") && balanceOf("비상금") === undefined, "N7 괄호 음수도 음수이며 현금에는 저장하지 않는다");
  res = await create({ name: "비상금", kind: "cash", balance: "abc" });
  ok(msgOf(res).includes("잔액을 숫자로 입력해 주세요") && balanceOf("비상금") === undefined, "N7 추가 폼의 해석 실패도 거절한다(예전에는 0 원으로 추가)");
  res = await create({ name: "교통카드", kind: "credit_card", balance: "" });
  ok(msgOf(res).includes("msg=payment_asset_saved") && balanceOf("교통카드") === 0, "N7 카드의 빈 잔액은 0 이다");
  res = await create({ name: "체크통장", kind: "bank_account", balance: "−7000" });
  ok(msgOf(res).includes("음수 잔액은 대출·부채와 신용카드에서만") && balanceOf("체크통장") === undefined, "N7 유니코드 마이너스도 음수다");
  const loanId = assets().find((a) => a.name === "주택대출").id;
  res = await post(fx, "/admin/payment-asset/update", { household_id: "house-home", month: "2026-07", id: loanId, mode: "edit", name: "주택대출", kind: "savings", issuer: "", memo: "", balance: "-120000", include_in_asset: "on" });
  ok(msgOf(res).includes("음수 잔액은 대출·부채와 신용카드에서만") && assets().find((a) => a.id === loanId).kind === "loan" && balanceOf(loanId) === -120000, "N7 종류를 자산으로 바꾸면서 음수 잔액이 남으면 거절한다");
  const page = await app.fetch(new Request(`${BASE}/payment-methods?month=2026-07&household_id=house-home`, { headers: { cookie: fx.cookie } }), fx.env, ctx);
  const html = await page.text();
  ok(page.status === 200 && html.includes('name="balance" inputmode="numeric" value="-120000"'), "N7 자산 화면의 잔액 폼은 음수 대출 잔액을 부호 그대로 보여 준다");
});

for (const balance of [-120000, 120000]) {
  const assets = [{ kind: "bank_account", balance: 1000000 }, { kind: "loan", balance }];
  const totals = computePaymentAssetTotals(assets);
  eq(totals.liabilityTotal, 120000, `N7 ${balance} 대출의 부채 합계는 남은 원금의 크기다`);
  eq(totals.groupTotals.debt, 120000, `N7 ${balance} 대출의 그룹 합계도 같은 기준이다`);
  eq(totals.netWorth, 880000, `N7 ${balance} 대출은 순자산에서 차감한다`);
  eq(assets[1].balance, balance, "N7 합계 계산은 입력한 대출 부호를 바꾸지 않는다");
}

// ── N13 관리자 API 의 엄격한 금액·구분·문자열 ─────────────────────────
await fixture(async (fx) => {
  fx.env.ADMIN_API_TOKEN = "qa-admin-token";
  const call = async (path, method, body) => {
    const response = await app.fetch(new Request(`${BASE}${path}`, { method, headers: { authorization: "Bearer qa-admin-token", origin: BASE, "sec-fetch-site": "same-origin", "content-type": "application/json", accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), fx.env, ctx);
    return { status: response.status, data: await response.json().catch(() => null) };
  };
  const base = { household_id: "house-home", user_id: "user-bin", type: "expense", transaction_date: "2026-07-20", memo: "qa-api", category: "QA" };
  const before = fx.db.transactions.length;
  for (const [amount, label] of [["0x10", "16진수 문자열"], ["1e3", "지수 문자열"], [true, "불리언"], ["1,000", "쉼표 문자열"], [12.5, "소수"], [-100, "음수"], ["", "빈 문자열"], [null, "null"], [[500], "배열"]]) {
    const res = await call("/api/transactions", "POST", { ...base, amount });
    ok(res.status === 400 && res.data?.error === "invalid_amount", `N13 금액 ${label}(${JSON.stringify(amount)})은 400 invalid_amount 다`);
  }
  eq(fx.db.transactions.length, before, "N13 거절된 금액으로 기록이 생기지 않는다(예전에는 0x10 → 16원, 1e3 → 1,000원, true → 1원)");
  let res = await call("/api/transactions", "POST", { ...base, amount: 500 });
  ok(res.status === 200 && res.data?.item?.amount === 500, "N13 정수 금액은 저장된다");
  res = await call("/api/transactions", "POST", { ...base, amount: "750", memo: "qa-api-750" });
  ok(res.status === 200 && fx.db.transactions.find((row) => row.memo === "qa-api-750")?.amount === 750, "N13 숫자 문자열은 정수로 저장된다");
  for (const [patch, error, label] of [[{ household_id: { id: "house-home" } }, "household_required", "객체 가계부"], [{ user_id: ["user-bin"] }, "spender_required", "배열 지출자"], [{ type: ["income"] }, "invalid_type", "배열 구분"], [{ memo: { x: 1 } }, "invalid_text", "객체 내용"], [{ category: 123 }, "invalid_text", "숫자 분류"], [{ payment_method: ["카드"] }, "invalid_text", "배열 결제수단"], [{ transaction_date: 20260720 }, "invalid_date", "숫자 날짜"], [{ transaction_date: "2026-07-20T00:00" }, "invalid_date", "날짜시각"]]) {
    res = await call("/api/transactions", "POST", { ...base, amount: 500, ...patch });
    ok(res.status === 400 && res.data?.error === error, `N13 ${label}은 400 ${error} 다`);
  }
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  fx.db.transactions.push({ id, household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-21", type: "expense", amount: 1000, category: "QA", memo: "qa-patch", payment_method: "", source: "web_admin", created_at: "2026-07-21T00:00:00Z" });
  res = await call(`/api/transactions/${id}`, "PATCH", { amount: "0x20" });
  ok(res.status === 400 && res.data?.error === "invalid_amount", "N13 단건 수정의 16진수 금액은 400 이다(예전에는 32원)");
  res = await call(`/api/transactions/${id}`, "PATCH", { memo: ["x"] });
  ok(res.status === 400 && res.data?.error === "invalid_text", "N13 단건 수정의 배열 내용은 400 이다");
  res = await call(`/api/transactions/${id}`, "PATCH", { user_id: { id: "user-bin" } });
  ok(res.status === 400 && res.data?.error === "spender_required", "N13 단건 수정의 객체 지출자는 400 이다");
  res = await call(`/api/transactions/${id}`, "PATCH", { amount: 700 });
  ok(res.status === 200 && fx.db.transactions.find((row) => row.id === id)?.amount === 700, "N13 정수 금액 수정은 된다");
  res = await call("/api/transactions/batch", "PATCH", { ids: [id], amount: "1e3" });
  ok(res.status === 400 && res.data?.error === "invalid_amount", "N13 일괄 수정의 지수 금액은 400 이다");
  eq(fx.db.transactions.find((row) => row.id === id)?.amount, 700, "N13 거절된 일괄 수정은 금액을 바꾸지 않는다");
});

done();

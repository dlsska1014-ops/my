// V22.9.80 데이터 묶음 검사 — 가져오기 해석(V79 T-25·T-28·T-29), 가져오기 미리 보기 후처리(T-26), 정기 ‘기록하기’ 표식 되살리기(T-14),
// 카카오 날짜 목록의 읽기 한도(T-10), 이번 달 1~6일 홈 ‘쓰는 속도’(T-20). 메모리 픽스처(validation/qa-fixture.mjs)로 재현하며 네트워크를 쓰지 않는다.
//
// ── 이 파일이 왜 생겼는지 ──
//   T-25 백업 되살리기에서 메모 끝이 합계·소계인 기록(‘카드값 합계’·‘7월 소계’)이 합계 행으로 빠졌다. 이 앱이 내보낸 백업 표(열 9개)는 기록이 전부이므로
//        날짜가 읽히는 행은 합계 행 거르기를 하지 않는다. 은행·카드사 파일과 열이 모자란 표는 예전처럼 거른다.
//   T-28 ‘키: 값’ 줄(‘지점: 인터넷’)과 머리글 없는 표가 줄 전체를 분류 근거로 써서 ‘인터넷’ 한 낱말이 통신비를 정했다. 키 줄은 읽는 키(내용·분류·구분·원문)의
//        값과 키 없는 글만, 머리글 없는 표는 금액·날짜·결제수단 말을 지운 나머지 글만 근거로 쓴다.
//   T-29 비슷한 이름 매핑이 ‘카드번호’를 결제수단(가린 카드번호가 결제수단 이름으로 저장), ‘입금계좌번호’를 수입 금액, ‘가맹점주소’를 내용(주소 낱말 ‘병원 앞’이
//        분류를 정함), 영문 ‘No.’ 를 구분 열로 읽었다. 번호·주소 머리글은 제외 열로 둔다.
//   T-26 가져오기 미리 보기(약 240KB, 서명 토큰 약 110KB)를 응답 후처리가 통째로 다시 훑었다. 긴 불투명 값만 자리표시로 바꿔 훑고 되돌린다(출력은 같다).
//   T-14 수동 ‘기록하기’의 표식 되살리기가 규칙마다 PATCH 를 보내, 표식이 더 나중인 규칙이 많으면 요청 한도(50)에 닿아 recurring_apply_incomplete 로 끝났다.
//   T-10 카카오 날짜 목록은 그날 가계부 기록을 500건까지만 읽는다. 한도에 닿으면 답장이 한 줄로 말한다(추가 조회 없음).
//   T-20 이번 달 1~6일에는 오늘로 끝나는 7일 창이 달 앞에서 시작해 지출이 있어도 ‘쓰는 속도’ 큰 숫자가 0원이었다. 1일부터 오늘까지로 센다(새 조회 없음).
//
// 옛 코드(V22.9.79)에서 무엇이 깨지는지 보려면 V22980_SOFT=1 로 돌린다(실패한 검사를 모두 적고 끝낸다). 시간 재기는 --bench 로 본다.
// 사용: node validation/validate-data-import-v22980.mjs [--bench]
import assert from "node:assert/strict";
import app, { parseFlexibleImportRecords, canonicalImportField } from "../src/index.js";
import { attachBusinessInfoFooter, attachUiUxRuntime } from "../src/modules/web/html-postprocess.js";
import { buildReadableTransactionsCsv } from "../src/modules/import/csv-duplicates.js";
import { BASE, ctx, counter, fixture, intercept, page, post, putSetting, withClock } from "./lib-audit-v22934.mjs";

const SOFT = process.env.V22980_SOFT === "1";
const BENCH = process.argv.includes("--bench");
const t = counter("V22.9.80 데이터 묶음 검사 통과(백업 합계 행·키 줄/머리글 없는 표 분류 근거·번호/주소 머리글·미리 보기 후처리·표식 되살리기 묶음·카카오 날짜 목록 한도·홈 쓰는 속도 1~6일)");
const failures = [];
let checks = 0;
const ok = (value, message) => {
  checks += 1;
  if (value) return t.ok(true, message);
  if (!SOFT) assert.fail(message);
  failures.push(message);
  return undefined;
};
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const deepEq = (actual, expected, message) => ok(JSON.stringify(actual) === JSON.stringify(expected), `${message} (실제 ${JSON.stringify(actual)?.slice(0, 300)}, 기대 ${JSON.stringify(expected)?.slice(0, 300)})`);
// 옛 코드에서 함수·값이 없어 예외가 나도 검사 하나의 실패로 모은다(SOFT).
const attempt = async (label, task) => {
  try { return await task(); } catch (error) {
    checks += 1;
    if (!SOFT) throw error;
    failures.push(`${label}: 예외 ${String(error?.message || error).slice(0, 160)}`);
    return undefined;
  }
};

const HH = "house-home";
const BIN = "11111111-1111-4111-8111-111111111111";
const WIFI = "22222222-2222-4222-8222-222222222222";
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-14T12:00:00+09:00");
const parse = (text, options = {}) => parseFlexibleImportRecords(text, HH, BIN, { source: "my_import", maxRows: 5000, importYear: 2026, ...options });
const reasons = (result) => result.rejected.map((item) => item.reason_code);

// 운영 users.id 는 uuid 다. 가져오기가 uuid 가 아닌 user_id 를 지우므로 픽스처 id 를 uuid 로 바꾼다.
async function uuidFixture(fx) {
  for (const [name, rows] of Object.entries(fx.db)) {
    if (Array.isArray(rows)) fx.db[name] = JSON.parse(JSON.stringify(rows).replaceAll("user-bin", BIN).replaceAll("user-wifi", WIFI));
  }
  fx.cookie = await fx.cookieFor(BIN);
  fx.db.__import_rpc_available = true;
  return fx;
}
const tokenPayload = (token) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
const tokenOf = (html) => html.match(/name="import_token" value="([^"]+)"/)?.[1] || "";
async function importPreview(fx, text, { month = "2026-07", json = false } = {}) {
  const response = await post(fx, "/my/import", { import_action: "preview", household_id: HH, month, csv_text: text, skip_duplicates: "1", ...(json ? { import_response: "json" } : {}) }, json ? { accept: "application/json" } : undefined);
  const html = json ? JSON.parse(response.text).html : response.text;
  const token = tokenOf(html);
  return { status: response.status, html, token, payload: token ? tokenPayload(token) : null };
}
async function importCommit(fx, preview, rowNumbers, month = "2026-07") {
  const values = new URLSearchParams({ import_action: "commit", import_token: preview.token, household_id: HH, month });
  for (const number of rowNumbers) values.append("selected_rows", String(number));
  return post(fx, "/my/import", values);
}
const exportCsv = async (fx, query = `household_id=${HH}&month=2026-07&range=all`) => {
  const response = await app.fetch(new Request(`${BASE}/my/backup.csv?${query}`, { headers: { cookie: fx.cookie } }), fx.env, ctx);
  return { status: response.status, text: (await response.text()).replace(/^﻿/, "") };
};

// ── T-29 번호·주소 머리글 ───────────────────────────────────────────────────────
// 1) 필드 판정 표: 번호·주소 머리글은 제외 열이고, 읽던 머리글은 예전과 같다.
{
  const excluded = ["카드번호", "카드 번호", "계좌번호", "입금계좌번호", "가맹점주소", "가맹점 주소", "가맹점번호", "가맹점 사업자번호", "Card Number", "Account Number", "Merchant Address", "No.", "No", "NO"];
  for (const header of excluded) eq(canonicalImportField(header), "ignore", `T-29 ‘${header}’ 는 제외 열이다`);
  const kept = {
    날짜: "date", 거래일자: "date", 이용일자: "date", 승인일시: "date", 금액: "amount", 이용금액: "amount", 출금액: "expense", 입금액: "income", 승인금액: "expense",
    내용: "memo", 적요: "memo", 메모: "memo", 가맹점: "memo", 가맹점명: "memo", 이용가맹점: "memo", 상호: "memo", 분류: "category", 카테고리: "category",
    결제수단: "payment", 이용카드: "payment", 카드: "payment", 카드명: "payment", 계좌명: "payment", 지출자: "spender", 구분: "type", 번호: "ignore", 순번: "ignore",
    승인번호: "ignore", 사업자번호: "ignore", 거래번호: "ignore", 잔액: "ignore", 상태: "ignore", 주소: "", 지점: "", 거래점: "", "Phone Number": "", Date: "date", Amount: "amount", Memo: "memo",
  };
  for (const [header, field] of Object.entries(kept)) eq(canonicalImportField(header), field, `T-29 ‘${header}’ 의 판정은 예전과 같다(${field || "읽지 않음"})`);
}

// 2) 표로 읽기: 가린 카드번호는 결제수단이 되지 않고, 주소 낱말은 분류를 정하지 않는다.
{
  const card = parse("날짜,금액,내용,카드번호\n2026-07-15,4500,스타벅스,1234-56**-****-7890");
  eq(card.rows[0]?.payment_method, "", "T-29 ‘카드번호’ 열의 가린 카드번호가 결제수단 이름으로 저장되지 않는다");
  eq(card.rows[0]?.category, "카페/간식", "T-29 ‘카드번호’ 열이 있어도 분류는 내용(스타벅스)으로 정한다");
  const cardMapping = card.mappings.find((item) => item.source === "카드번호");
  eq(cardMapping?.field, "ignore", "T-29 열 연결 안내에 ‘카드번호 → 제외 열’ 로 보인다");
  const withPay = parse("날짜,금액,내용,결제수단,카드번호\n2026-07-15,4500,스타벅스,신한카드,1234-56**-****-7890");
  eq(withPay.rows[0]?.payment_method, "신한카드", "T-29 결제수단 열이 있으면 카드번호 열과 상관없이 그 값이 결제수단이다");

  const address = parse("날짜,금액,가맹점명,가맹점주소\n2026-07-15,4500,스타벅스,서울 강남구 병원 앞");
  eq(address.rows[0]?.category, "카페/간식", "T-29 ‘가맹점주소’ 의 주소 낱말(‘병원 앞’)이 분류를 의료/병원으로 만들지 않는다");
  eq(address.rows[0]?.memo, "스타벅스", "T-29 ‘가맹점주소’ 가 내용에 붙지 않는다");

  const account = parse("날짜,입금계좌번호,출금액,내용\n2026-07-15,110-123-456789,4500,스타벅스");
  eq(account.rows.length, 1, "T-29 ‘입금계좌번호’ 열의 계좌번호가 수입 금액으로 읽혀 행이 거절되지 않는다");
  eq(account.rows[0]?.type, "expense", "T-29 그 행은 출금액 4,500원 지출이다");

  const numbered = parse("No.,날짜,금액,내용\n1,2026-07-15,4500,스타벅스\n2,2026-07-16,5500,점심");
  eq(numbered.rows.length, 2, "T-29 ‘No.’ 열이 있는 표도 모든 행을 읽는다");
  ok(numbered.rows.every((row) => row._import_warnings.length === 0), "T-29 ‘No.’ 번호가 구분 값으로 읽혀 행마다 ‘구분을 해석하지 못했다’ 경고가 붙지 않는다");
  deepEq(numbered.rows.map((row) => row.memo), ["스타벅스", "점심"], "T-29 ‘No.’ 번호가 내용에 섞이지 않는다");

  // 읽는 열은 그대로다(기존 표 형태 몇 개의 읽은 결과가 같다).
  const bank = parse("거래일자,거래시간,적요,출금(원),입금(원),내용,잔액(원),거래점\n2026.10.01,12:00:00,체크카드,4500,0,스타벅스,995500,인터넷");
  deepEq([bank.rows[0]?.category, bank.rows[0]?.payment_method, bank.rows[0]?.amount], ["카페/간식", "체크카드", 4500], "T-29 통장 표(승인번호·거래점 포함)는 예전과 같이 읽는다");
  const stmt = parse("이용일자,이용카드,이용가맹점,이용금액,결제방법,승인번호\n2026.10.01,본인 1234,스타벅스,4500,일시불,12345678");
  deepEq([stmt.rows[0]?.payment_method, stmt.rows[0]?.memo, stmt.rows[0]?.amount], ["본인 1234", "스타벅스", 4500], "T-29 카드 명세서 표는 예전과 같이 읽는다");
}

// 3) 열 연결: 사용자가 직접 고르면 그대로 읽고, 미리 보기에는 ‘제외 열’ 로 보인다.
{
  const csv = "날짜,금액,내용,카드번호\n2026-07-15,4500,스타벅스,1234-56**-****-7890";
  const remapped = parse(csv, { mappingDelta: [{ section: 1, column_index: 3, field: "payment" }] });
  eq(remapped.rows[0]?.payment_method, "1234-56**-****-7890", "T-29 열 연결 화면에서 ‘카드번호’ 를 결제수단으로 고르면 그 값을 결제수단으로 읽는다");
  const schema = parse(csv, { mappingMetadata: true }).mapping_schema?.sections?.[0]?.columns?.find((column) => column.title === "카드번호");
  deepEq([schema?.automatic, schema?.field, schema?.readonly], ["ignore", "ignore", false], "T-29 열 연결 화면의 자동 연결은 ‘제외 열’ 이고 바꿀 수 있다");
}
await fixture(async (fx) => {
  await uuidFixture(fx);
  const preview = await importPreview(fx, "날짜,금액,내용,카드번호\n2026-07-15,4500,스타벅스,1234-56**-****-7890");
  eq(preview.status, 200, "T-29 카드번호 열이 있는 파일의 미리 보기가 열린다");
  ok(preview.html.includes("카드번호 → <b>제외 열</b>"), "T-29 미리 보기의 ‘인식한 행 제목’ 에 ‘카드번호 → 제외 열’ 이 보인다");
  deepEq((preview.payload?.ready || []).map((entry) => entry.row.payment_method), [""], "T-29 저장 후보의 결제수단에 가린 카드번호가 들어가지 않는다");
});

// ── T-28 ‘키: 값’ 줄과 머리글 없는 표의 분류 근거 ───────────────────────────────
{
  const kv = (extra, memo = "내용: 스타벅스") => parse(`날짜: 2026-07-15 | 금액: 4500 | ${memo} | ${extra}`).rows[0];
  eq(kv("지점: 인터넷")?.category, "카페/간식", "T-28 ‘지점: 인터넷’ 이 분류를 통신비로 만들지 않는다(내용 ‘스타벅스’ 로 정한다)");
  eq(kv("거래점=인터넷")?.category, "카페/간식", "T-28 ‘거래점=인터넷’(= 구분자)도 같다");
  eq(kv("업종: 통신판매")?.category, "카페/간식", "T-28 ‘업종: 통신판매’ 도 분류를 오염시키지 않는다");
  eq(kv("지점: 인터넷", "내용: 점심")?.category, "외식", "T-28 내용 ‘점심’ → 외식");
  eq(kv("지점: 강남", "내용: 인터넷 요금")?.category, "통신비", "T-28 내용에 든 ‘인터넷’ 은 예전처럼 통신비를 정한다");
  eq(kv("지점: 인터넷", "분류: 식비")?.category, "식비", "T-28 분류 값이 적혀 있으면 그 값이 분류다");
  eq(kv("지점: 인터넷", "원문: 스타벅스 커피 4500원")?.category, "카페/간식", "T-28 원문(raw_text) 값은 분류 근거다");
  eq(parse("스타벅스 | 날짜: 2026-07-15 | 금액: 4500 | 지점: 인터넷").rows[0]?.category, "카페/간식", "T-28 ‘키: 값’ 꼴이 아닌 글(스타벅스)은 분류 근거다");
  eq(kv("지점: 인터넷", "결제수단: 카드")?.category, "기타지출", "T-28 근거가 되는 글이 없으면 인터넷(지점)이 아니라 기본 분류다");
  eq(kv("지점: 인터넷", "결제수단: 신한카드")?.payment_method, "신한카드", "T-28 결제수단 값은 그대로 결제수단이다");
  const incomeKv = parse("날짜: 2026-07-25 | 금액: 3000000 | 내용: 월급 | 지점: 인터넷").rows[0];
  deepEq([incomeKv?.type, incomeKv?.category], ["income", "급여"], "T-28 수입 줄도 내용(월급)으로 정한다");
  eq(parse("날짜: 2026-07-15\n금액: 4500\n내용: 스타벅스\n지점: 인터넷").rows.length >= 0, true, "T-28 여러 줄로 나눈 ‘키: 값’ 도 예외 없이 읽는다");

  // 머리글 없는 표: 금액·날짜·결제수단 말은 근거가 아니다. 결제수단 낱말(‘카페이’ = 카카오페이 줄임말)의 ‘카페’ 가 분류를 정하지 않는다.
  const pay = parse("2026-07-15,4500,카페이").rows[0];
  deepEq([pay?.payment_method, pay?.category], ["카카오페이", "기타지출"], "T-28 머리글 없는 표: 결제수단 낱말(카페이 → 카카오페이)의 ‘카페’ 가 분류를 카페/간식으로 만들지 않는다");
  const cafe = parse("2026-07-15,4500,스타벅스,카페이").rows[0];
  deepEq([cafe?.payment_method, cafe?.category], ["카카오페이", "카페/간식"], "T-28 머리글 없는 표: 내용(스타벅스)은 그대로 분류 근거다");
  const card = parse("2026-07-15,4500,스타벅스,신한카드").rows[0];
  deepEq([card?.payment_method, card?.category], ["신한카드", "카페/간식"], "T-28 머리글 없는 표: 결제수단 칸은 결제수단으로 읽고 분류는 내용으로 정한다");
  const transit = parse("2026-07-15,50000,교통카드").rows[0];
  eq(transit?.category, "교통", "T-28 머리글 없는 표: 결제수단을 뺀 나머지(교통)는 분류 근거로 남는다");
  const income = parse("2026-07-25,3000000,월급,계좌이체").rows[0];
  deepEq([income?.type, income?.category, income?.payment_method], ["income", "급여", "계좌이체"], "T-28 머리글 없는 표: 수입 줄은 예전과 같다");
  // 결제수단이 아닌 낱말은 지우지 않는다(결제 ‘구매’ 같은 명령 낱말도 분류 근거다 — 메모 다듬기처럼 지우면 쇼핑이 기타지출이 된다).
  eq(parse("2026-07-15\t4500\t구매").rows[0]?.category, "쇼핑", "T-28 탭으로 나눈 머리글 없는 표: ‘구매’ 는 예전처럼 쇼핑이다");
  eq(parse("2026-07-15,4500,구매").rows[0]?.category, "쇼핑", "T-28 쉼표로 나눈 머리글 없는 표: ‘구매’ 는 예전처럼 쇼핑이다");
  eq(parse("2026-07-15,4500,택시,현금").rows[0]?.category, "택시", "T-28 머리글 없는 표: 내용·결제수단 순서가 이래도 같다");
  eq(parse("어제 점심 12000원 카드").rows[0]?.category, "외식", "T-28 자연어 한 줄은 예전과 같다");
  eq(parse("2026-07-15 스타벅스 4500원 신한카드").rows[0]?.category, "카페/간식", "T-28 구분자 없는 한 줄(날짜·내용·금액·결제수단)도 예전과 같다");
}

// ── T-25 이 앱이 내보낸 백업 표의 합계·소계 메모 ───────────────────────────────
{
  const header = "날짜,구분,금액,분류,내용,결제수단,지출자,출처,기록ID";
  const memos = ["카드값 합계", "7월 소계", "지출 합계", "월계", "총계", "합계", "합계: 300,000원", "소계 5,000"];
  const csvLines = memos.map((memo, index) => `2026-07-${String(10 + index).padStart(2, "0")},지출,${10000 + index},금융,${memo.includes(",") ? `"${memo}"` : memo},신한카드,민수,web,t25-${index}`);
  const backup = parse([header, ...csvLines].join("\n"));
  eq(backup.rows.length, memos.length, `T-25 백업 표: 메모가 합계·소계·총계·월계로 끝나는 기록 ${memos.length}건이 모두 읽힌다`);
  deepEq(backup.rows.map((row) => row.memo), memos, "T-25 백업 표: 메모가 파일에 적힌 그대로 돌아온다");
  deepEq(reasons(backup), [], "T-25 백업 표: ‘합계·잔액 행’ 으로 제외된 행이 없다");
  const exported = buildReadableTransactionsCsv(memos.map((memo, index) => ({ transaction_date: `2026-07-${String(10 + index).padStart(2, "0")}`, type: "expense", amount: 10000 + index, category: "금융", memo, payment_method: "신한카드", spender_name: "민수", source: "web", id: `t25b-${index}` })));
  const roundTrip = parse(exported);
  deepEq(roundTrip.rows.map((row) => row.memo), memos, "T-25 내보내기 → 가져오기 왕복: 합계·소계로 끝나는 메모가 모두 돌아온다");

  // 합계 행 거르기는 은행·카드사 파일과 열이 모자란 표에 남는다.
  const bank = parse("거래일자,적요,출금액,입금액,내용,잔액\n2026.07.10,체크카드,4500,0,스타벅스,995500\n2026.07.31,,300000,,7월 소계,500000\n,합계,304500,0,,");
  deepEq(reasons(bank), ["summary_row", "summary_row"], "T-25 은행 표의 합계·소계 행은 예전처럼 합계 행으로 제외된다");
  eq(bank.rows.length, 1, "T-25 은행 표의 거래 행은 읽힌다");
  const partial = parse("날짜,구분,금액,분류,내용,결제수단,지출자\n2026-07-31,지출,300000,금융,카드값 합계,신한카드,민수");
  deepEq(reasons(partial), ["summary_row"], "T-25 열이 7개뿐인 표(백업 표가 아님)는 예전처럼 합계 행을 거른다");
  const simple = parse("날짜,금액,내용\n2026-07-31,300000,7월 소계\n2026-07-30,5000,점심");
  deepEq([reasons(simple), simple.rows.length], [["summary_row"], 1], "T-25 날짜·금액·내용 표도 예전처럼 합계 행을 거른다");

  // 백업 표 안의 손으로 더한 합계 줄(날짜가 읽히지 않는 줄)은 예전처럼 합계 행 안내와 함께 제외한다.
  const hand = parse([header, "2026-07-10,지출,10000,금융,점심,신한카드,민수,web,h-1", "합계,,10000,,,,,,", "소계,,10000,,,,,,"].join("\n"));
  eq(hand.rows.length, 1, "T-25 백업 표에 손으로 더한 합계 줄은 기록으로 읽히지 않는다");
  deepEq(reasons(hand), ["summary_row", "summary_row"], "T-25 그 줄은 ‘합계·잔액 행’ 안내와 함께 제외된다(날짜 오류가 아니다)");
}

// T-25 실제 흐름: 내보내기 → 비운 가계부에 가져오기 → 같은 기록이 돌아온다
await fixture(async (fx) => {
  await uuidFixture(fx);
  const base = { household_id: HH, source: "web", created_at: "2026-07-21T01:00:00Z", user_id: BIN, type: "expense", category: "금융", payment_method: "신한카드", raw_text: "" };
  const memos = ["카드값 합계", "7월 소계", "월계", "점심"];
  memos.forEach((memo, index) => fx.db.transactions.push({ ...base, id: `t25-${index}`, transaction_date: `2026-07-${String(20 + index).padStart(2, "0")}`, amount: 41000 + index, memo }));
  const originals = fx.db.transactions.filter((row) => row.household_id === HH).map((row) => row.memo);
  const exported = await exportCsv(fx);
  eq(exported.status, 200, "T-25 전체 기간 백업 CSV 를 내려받는다");
  fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HH);
  const restore = await importPreview(fx, exported.text);
  const ready = restore.payload?.ready || [];
  eq(ready.length, originals.length, "T-25 미리 보기: 합계·소계 메모 기록까지 모두 저장 후보다(가계부의 모든 기록)");
  ok(!(restore.payload?.reason_counts?.summary_row), "T-25 미리 보기: ‘합계·잔액 행’ 으로 제외된 행이 없다");
  ok(ready.every((entry) => !entry.needs_confirmation), "T-25 미리 보기: 확인 필요로 기본 선택에서 빠지는 행이 없다");
  const saved = await importCommit(fx, restore, ready.map((entry) => entry.row_number));
  eq(saved.status, 200, "T-25 기본 선택 그대로 저장한다");
  deepEq(fx.db.transactions.filter((row) => row.household_id === HH).map((row) => row.memo).sort(), originals.slice().sort(), "T-25 저장된 기록의 메모가 원래와 같다(합계·소계 메모 포함)");
  ok(memos.slice(0, 3).every((memo) => fx.db.transactions.some((row) => row.household_id === HH && row.memo === memo)), "T-25 ‘카드값 합계’·‘7월 소계’·‘월계’ 메모의 기록이 되살아났다");
});

// ── T-26 가져오기 미리 보기 후처리 ──────────────────────────────────────────────
const previewCsv = (rowCount) => ["날짜,금액,내용,결제수단", ...Array.from({ length: rowCount }, (_, i) => `2026-07-${String((i % 28) + 1).padStart(2, "0")},${3000 + i * 137},스타벅스 ${i}번 매장,신한카드`)].join("\n");
await attempt("T-26", () => fixture(async (fx) => {
  await uuidFixture(fx);
  const raw = await importPreview(fx, previewCsv(120), { json: true });
  eq(raw.status, 200, "T-26 120행 미리 보기가 열린다(후처리 전 HTML)");
  ok(raw.token.length > 100000, `T-26 서명 토큰이 약 110KB 다(${raw.token.length}자)`);
  ok(raw.html.length > 150000, `T-26 미리 보기 HTML 이 후처리 전 150KB 를 넘는다(${raw.html.length}자)`);

  // 1) 바꾸지 않은 길(options.opaqueValues === false)과 출력이 한 바이트도 다르지 않다.
  const masked = attachUiUxRuntime(raw.html);
  const plain = attachUiUxRuntime(raw.html, { opaqueValues: false });
  ok(masked === plain, "T-26 긴 불투명 값을 자리표시로 바꿔 훑어도 후처리 출력은 바꾸지 않은 길과 같다");
  ok(masked.includes(`name="import_token" value="${raw.token}"`), "T-26 서명 토큰이 출력에 그대로 들어 있다");
  ok(!masked.includes("ab-opaque-value-"), "T-26 자리표시가 출력에 남지 않는다");
  ok(masked.length > raw.html.length, "T-26 후처리가 하는 일(링크·스크립트 더하기)은 그대로 한다");

  // 2) 실제 응답: 후처리한 결과와 같고(요청마다 다른 토큰 값만 맞춘다), 그 토큰으로 저장이 된다.
  const served = await importPreview(fx, previewCsv(120));
  eq(served.status, 200, "T-26 실제 응답이 열린다");
  const processed = attachBusinessInfoFooter(attachUiUxRuntime(raw.html)).replace(raw.token, () => served.token);
  ok(served.html === processed, "T-26 실제 응답은 후처리 전 HTML 에 같은 후처리를 한 것과 같다(토큰 값만 요청마다 다르다)");
  const ready = served.payload?.ready || [];
  eq(ready.length, 120, "T-26 실제 응답의 토큰이 온전해 120행이 저장 후보로 풀린다");
  const saved = await importCommit(fx, served, ready.map((entry) => entry.row_number));
  eq(saved.status, 200, "T-26 그 토큰으로 저장한다");
  eq(fx.db.transactions.filter((row) => row.household_id === HH && /^스타벅스 \d+번 매장$/.test(row.memo)).length, 120, "T-26 120행이 저장됐다");
}));

// 경계: 값 길이·쪽 크기·여러 값·자리표시 충돌. 모두 바꾸지 않은 길과 같아야 한다.
await attempt("T-26 경계", async () => {
  const filler = (bytes) => `<ul>${"<li><label for=\"a\">항목</label> 본문 글 </li>".repeat(Math.ceil(bytes / 40))}</ul>`;
  const shell = (body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><title>가져오기 확인</title></head><body><main><h1>가져오기</h1><form method="post" action="/my/import">${body}</form></main></body></html>`;
  const token = (length, seed = "A") => Array.from({ length }, (_, i) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-."[(i * 7 + seed.charCodeAt(0)) % 65]).join("");
  const same = (label, html) => { const masked = attachUiUxRuntime(html); ok(masked === attachUiUxRuntime(html, { opaqueValues: false }), `T-26 경계: ${label} 출력이 같다`); return masked; };
  const big = filler(70000);
  const out2048 = same("값 2048자(자리표시 대상의 경계)", shell(`${big}<input type="hidden" name="import_token" value="${token(2048)}"/>`));
  ok(out2048.includes(token(2048)), "T-26 경계: 2048자 값이 온전하다");
  same("값 2047자(자리표시 대상이 아닌 경계)", shell(`${big}<input type="hidden" name="import_token" value="${token(2047)}"/>`));
  same("쪽이 작을 때(64KB 미만) 긴 값", shell(`${filler(20000)}<input type="hidden" name="import_token" value="${token(5000)}"/>`));
  const two = same("긴 값 둘", shell(`${big}<input type="hidden" name="a" value="${token(3000, "B")}"/><input type="hidden" name="b" value="${token(4000, "C")}"/>`));
  ok(two.includes(token(3000, "B")) && two.includes(token(4000, "C")), "T-26 경계: 긴 값 둘이 각자 제자리에 온전히 돌아온다");
  same("긴 값 앞뒤에 다른 입력", shell(`<input name="q" value="앞"/>${big}<input type="hidden" name="import_token" value="${token(9000, "D")}"/><input type="text" name="w" value="뒤"/>`));
  same("자리표시 낱말이 이미 든 쪽(바꾸지 않는다)", shell(`${big}<p>ab-opaque-value-0-end</p><input type="hidden" name="import_token" value="${token(3000, "E")}"/>`));
  same("작은따옴표 value 와 문자 집합 밖의 긴 값(바꾸지 않는다)", shell(`${big}<input name="x" value='${token(3000, "F")}'/><input name="y" value="${token(3000, "G")}+/="/>`));
  same("$ 패턴이 든 본문", shell(`${big}<p>$& $1 $' $\`</p><input type="hidden" name="import_token" value="${token(3000, "H")}"/>`));
  // 규칙이 긴 불투명 값 안을 훑지 않는다는 직접 증거: 값 속 낱말(‘homeOnboarding’)이 안내 런타임을 켜지 못한다(옛 후처리는 응답 전체의 낱말을 찾아 켰다).
  // 본문에 같은 낱말이 있거나 값이 짧으면 예전처럼 켠다.
  const bare = (value) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><title>확인</title></head><body><main><h1>가져오기</h1>${big}<input type="hidden" name="t" value="${value}"/></main></body></html>`;
  const canary = `${token(1500, "J")}homeOnboarding${token(1500, "K")}`;
  const hidden = attachUiUxRuntime(bare(canary));
  ok(!hidden.includes("v2281GuidedUiUxRuntime"), "T-26 긴 불투명 값 속의 낱말(homeOnboarding)이 후처리 규칙을 켜지 못한다 — 값 안을 훑지 않는다");
  ok(hidden.includes(`value="${canary}"`), "T-26 그 긴 값은 출력에 그대로 있다");
  ok(attachUiUxRuntime(bare("homeOnboarding")).includes("v2281GuidedUiUxRuntime"), "T-26 짧은 값 속의 같은 낱말은 예전처럼 규칙을 켠다");
  ok(attachUiUxRuntime(bare(token(3000, "L")).replace("<h1>", () => "<h1 id=\"homeOnboarding\">")).includes("v2281GuidedUiUxRuntime"), "T-26 본문 속의 같은 낱말은 예전처럼 규칙을 켠다");
});

// 시간: 같은 입력을 번갈아 돌려 가장 빠른 값끼리 견준다(잡음에 강하다). 숫자는 --bench 로 본다.
await attempt("T-26 시간", () => fixture(async (fx) => {
  await uuidFixture(fx);
  const raw = (await importPreview(fx, previewCsv(120), { json: true })).html;
  const timeOnce = (options) => { const started = performance.now(); attachUiUxRuntime(raw, options); return performance.now() - started; };
  for (let i = 0; i < 8; i++) { timeOnce(); timeOnce({ opaqueValues: false }); }
  const fast = [], slow = [];
  for (let i = 0; i < 25; i++) { fast.push(timeOnce()); slow.push(timeOnce({ opaqueValues: false })); }
  const best = (samples) => Math.min(...samples);
  if (BENCH) console.log(`T-26 후처리 120행 미리 보기: 자리표시 ${best(fast).toFixed(2)}ms · 바꾸지 않은 길 ${best(slow).toFixed(2)}ms (최소값)`);
  ok(best(fast) <= best(slow) * 0.9, `T-26 후처리 시간이 줄었다: 자리표시 ${best(fast).toFixed(2)}ms ≤ 바꾸지 않은 길 ${best(slow).toFixed(2)}ms × 0.9`);
}));

// ── T-14 수동 ‘기록하기’ 표식 되살리기 묶음 ─────────────────────────────────────
// 요청마다 저장소 호출 한도 50(Workers 요청 한도와 같은 값)은 supabase() 가 스스로 센다(env.__AB_DB_BUDGET). 넘기려는 호출은 보내기 전에 예외로 끝나
// 그 요청이 recurring_apply_incomplete 로 돌아온다 — 그래서 픽스처로도 한도를 그대로 만난다. 여기서는 실제로 나간 호출과 표식 PATCH 를 센다.
const SUBREQUEST_LIMIT = 50;
async function applyRecurring(fx, { count, markerOf, month = "2026-10" }) {
  fx.db.accountbook_recurring.length = 0;
  for (let i = 0; i < count; i++) {
    fx.db.accountbook_recurring.push({ id: `r-${String(i).padStart(3, "0")}`, household_id: HH, type: "expense", amount: 1000 + i, category: "구독", memo: `규칙${i}`, payment_method: "", user_id: "user-bin", is_active: true, last_applied_month: markerOf(i), created_at: "2026-09-01T10:00:00+09:00", day_of_month: (i % 27) + 1 });
  }
  let calls = 0;
  const patches = [];
  const stop = intercept(({ url, method, init }) => {
    if (url.hostname !== "mock.supabase.co") return null;
    calls += 1;
    if (method === "PATCH" && url.pathname.endsWith("/accountbook_recurring")) patches.push({ filter: decodeURIComponent(url.search), body: JSON.parse(String(init?.body || "{}")) });
    return null;
  });
  let response;
  try { response = await post(fx, "/admin/recurring/apply", { household_id: HH, month, confirmed: "yes" }); } finally { stop(); }
  return { response, calls, patches, rules: fx.db.accountbook_recurring };
}
await attempt("T-14", () => withClock("2026-11-03", () => fixture(async (fx) => {
  // 120개 규칙: 표식이 2026-12(대상 달 뒤) 40개, 2026-11(뒤) 40개, 2026-09(앞) 20개, 없음 20개.
  const markerOf = (i) => (i % 6 < 2 ? "2026-12" : i % 6 < 4 ? "2026-11" : i % 6 === 4 ? "2026-09" : null);
  const run = await applyRecurring(fx, { count: 120, markerOf });
  eq(run.response.status, 303, "T-14 규칙 120개(표식이 대상 달 뒤인 규칙 80개) 기록하기가 끝난다");
  ok(/msg=/.test(run.response.location) && !/err=/.test(run.response.location), `T-14 ‘고정항목 N건 기록’ 안내로 돌아온다 — recurring_apply_incomplete 가 아니다 (${run.response.decoded.slice(0, 120)})`);
  ok(run.calls <= SUBREQUEST_LIMIT / 2, `T-14 저장소 호출이 한도 ${SUBREQUEST_LIMIT}의 절반 안이다(${run.calls}번 — 규칙 수와 상관없이 몇 번뿐)`);
  ok(run.patches.length <= 4, `T-14 표식 되살리기 PATCH 가 규칙 80개에 ${run.patches.length}번뿐이다(값마다 한 번)`);
  deepEq(run.patches.map((patch) => patch.body.last_applied_month).sort(), ["2026-11", "2026-12"], "T-14 PATCH 는 되살릴 표식 값(2026-11·2026-12)마다 한 번씩이다");
  ok(run.patches.every((patch) => /id=in\.\(/.test(patch.filter) && patch.filter.includes(`household_id=eq.${HH}`)), "T-14 PATCH 는 id=in.(…) 에 가계부 조건을 함께 건다");
  const wrong = run.rules.filter((rule, i) => rule.last_applied_month !== (i % 6 < 2 ? "2026-12" : i % 6 < 4 ? "2026-11" : "2026-10"));
  deepEq(wrong.map((rule) => `${rule.id}=${rule.last_applied_month}`), [], "T-14 반영 표식: 대상 달 뒤였던 규칙은 제 표식으로 되살아나고 나머지는 대상 달(2026-10)이다");
  eq(fx.db.transactions.filter((row) => row.source === "recurring_auto" && row.transaction_date.startsWith("2026-10")).length, 120, "T-14 대상 달(2026-10) 기록이 규칙 120개만큼 들어갔다");
})));
await attempt("T-14 묶음 크기", () => withClock("2026-11-03", () => fixture(async (fx) => {
  // 표식이 모두 대상 달 뒤인 규칙 200개: 같은 값이어도 한 번에 80개씩 세 번(80·80·40)으로 나눈다.
  const big = await applyRecurring(fx, { count: 200, markerOf: () => "2026-12" });
  ok(!/err=/.test(big.response.location), `T-14 표식이 모두 뒤 달인 규칙 200개 기록하기가 끝난다 (${big.response.decoded.slice(0, 100)})`);
  eq(big.patches.length, 3, "T-14 같은 표식 200개는 한 번에 80개씩 PATCH 세 번이다");
  deepEq(big.patches.map((patch) => (patch.filter.match(/%22|"/g) || []).length / 2).sort((a, b) => a - b), [40, 80, 80], "T-14 한 번에 담긴 규칙 수는 80·80·40 이다");
  ok(big.rules.every((rule) => rule.last_applied_month === "2026-12"), "T-14 200개 모두 제 표식(2026-12)으로 돌아왔다");
  ok(big.calls <= SUBREQUEST_LIMIT / 2, `T-14 저장소 호출이 한도의 절반 안이다(${big.calls}번)`);
})));
await attempt("T-14 소규모", () => withClock("2026-11-03", () => fixture(async (fx) => {
  // 규칙 몇 개: 예전과 같은 결과(표식 되살림·기록 수)이고, 표식이 뒤인 규칙이 하나도 없으면 PATCH 가 없다.
  const some = await applyRecurring(fx, { count: 6, markerOf: (i) => (i === 0 ? "2026-12" : i === 1 ? "2026-11" : null) });
  ok(!/err=/.test(some.response.location), "T-14 규칙 6개 기록하기가 끝난다");
  deepEq(some.rules.map((rule) => rule.last_applied_month), ["2026-12", "2026-11", "2026-10", "2026-10", "2026-10", "2026-10"], "T-14 규칙 6개의 표식: 뒤 달 둘은 되살아나고 넷은 대상 달이다");
  eq(some.patches.length, 2, "T-14 표식 값이 다른 두 규칙은 PATCH 두 번이다");
  await fixture(async (fx2) => {
    const none = await applyRecurring(fx2, { count: 5, markerOf: () => null });
    eq(none.patches.length, 0, "T-14 표식이 대상 달 뒤인 규칙이 없으면 되살리기 PATCH 를 보내지 않는다");
  });
})));

// ── T-10 카카오 날짜 목록의 읽기 한도 ───────────────────────────────────────────
const DAY = "2026-08-05";
const KAKAO_USER = "kakao_login:2265";
function kakaoPayload(utterance, user) {
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest: { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } }, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}
async function say(fx, utterance, user = KAKAO_USER) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(kakaoPayload(utterance, user)) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  await Promise.allSettled(jobs);
  let json = null;
  try { json = JSON.parse(raw); } catch (_) { /* 본문이 JSON 이 아니면 그대로 */ }
  return (json?.template?.outputs || []).map((o) => o?.simpleText?.text || [o?.textCard?.title, o?.textCard?.description].filter(Boolean).join("\n")).join("\n") || raw;
}
const LIMIT_LINE = /500건에 닿아 앞의 500건까지만 읽었어요/;
await attempt("T-10", () => withClock(DAY, () => fixture(async (fx) => {
  putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
  const row = (i, user) => ({ id: `t10-${String(i).padStart(4, "0")}`, household_id: HH, user_id: user, source: "kakao_skill", transaction_date: DAY, type: "expense", amount: 1000 + i, category: "외식", memo: `기록${i}`, payment_method: "", raw_text: "", created_at: `2026-08-05T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z` });
  const seed = (count, mine) => {
    fx.db.transactions = fx.db.transactions.filter((item) => !String(item.id).startsWith("t10-"));
    for (let i = 0; i < count; i++) fx.db.transactions.push(row(i, mine(i) ? "user-bin" : "user-wifi"));
  };
  let reads = 0;
  const stop = intercept(({ url, method }) => { if (url.hostname === "mock.supabase.co" && method === "GET" && url.pathname.endsWith("/transactions")) reads += 1; return null; });
  try {
    // 가계부 전체가 500건에 닿고 내 기록은 앞쪽에 있다: 목록 + 한 줄
    seed(520, (i) => i % 100 === 0);
    reads = 0;
    const list = await say(fx, "오늘 기록 보기");
    eq(reads, 1, "T-10 날짜 목록: 기록 조회는 한 번뿐이다(한도 안내를 위해 더 읽지 않는다)");
    ok(LIMIT_LINE.test(list), `T-10 500건에 닿으면 목록에 한 줄로 알린다 (${list.split("\n").filter((line) => /500건/.test(line)).join(" / ")})`);
    eq(list.split("\n").filter((line) => /500건/.test(line)).length, 1, "T-10 안내는 한 줄이다");
    deepEq(list.split("\n").filter((line) => /^\d{2}번 - /.test(line)).map((line) => line.split(" / ")[0]), ["01번 - 기록0", "02번 - 기록100", "03번 - 기록200", "04번 - 기록300", "05번 - 기록400"], "T-10 목록 번호는 예전 그대로다(읽은 500건 안의 내 기록 5건)");

    // 내 기록이 읽은 범위 밖(뒤쪽)에만 있다: ‘아직 기록이 없어요’ 라고 단정하지 않는다
    seed(520, (i) => i >= 510);
    const empty = await say(fx, "오늘 기록 보기");
    ok(!empty.includes("아직 기록이 없어요"), "T-10 읽은 범위에 내 기록이 없어도 한도에 닿았으면 ‘아직 기록이 없어요’ 라고 하지 않는다");
    ok(empty.includes("읽은 범위에는 내 기록이 없어요") && LIMIT_LINE.test(empty), "T-10 대신 읽은 범위와 한도를 말한다");

    // 번호로 지우기·고치기: 못 찾으면 한도를 함께 말한다
    seed(520, (i) => i % 100 === 0);
    reads = 0;
    const missing = await say(fx, "삭제 09번");
    eq(reads, 1, "T-10 번호로 지우기: 기록 조회는 한 번뿐이다");
    ok(missing.includes("기록을 찾지 못했어요") && LIMIT_LINE.test(missing), "T-10 못 찾은 번호의 안내에 한도 한 줄이 붙는다");
    ok(LIMIT_LINE.test(await say(fx, "수정 09번 금액 5000")), "T-10 못 찾은 번호로 고치기에도 한도 한 줄이 붙는다");
    eq(fx.db.transactions.filter((item) => String(item.id).startsWith("t10-")).length, 520, "T-10 못 찾았으므로 아무것도 지우지 않았다");

    // 찾은 번호는 한도에 닿은 날에도 예전처럼 고치고 지운다(안내는 못 찾았을 때만 붙는다)
    const edited = await say(fx, "수정 02번 금액 5000");
    ok(edited.includes("02번 금액을 5,000원으로 변경했어요") && !/500건/.test(edited), "T-10 읽은 범위 안의 번호는 한도에 닿은 날에도 고쳐지고 안내가 붙지 않는다");
    eq(fx.db.transactions.find((item) => item.id === "t10-0100")?.amount, 5000, "T-10 고친 기록의 금액이 바뀌었다");
    const removed = await say(fx, "삭제 03번");
    ok(removed.includes("03번 기록을 삭제했어요") && !/500건/.test(removed) && !fx.db.transactions.some((item) => item.id === "t10-0200"), "T-10 읽은 범위 안의 번호는 한도에 닿은 날에도 지워진다");
    seed(520, (i) => i % 100 === 0);

    // 499건: 한도에 닿지 않는다. 500건: 닿는다.
    seed(499, (i) => i % 100 === 0);
    const below = await say(fx, "오늘 기록 보기");
    ok(!/500건/.test(below), "T-10 499건이면 안내가 없다");
    const notFound = await say(fx, "삭제 09번");
    ok(notFound.includes("기록을 찾지 못했어요") && !/500건/.test(notFound), "T-10 499건이면 못 찾은 안내에도 한도 줄이 없다");
    seed(500, (i) => i % 100 === 0);
    ok(LIMIT_LINE.test(await say(fx, "오늘 기록 보기")), "T-10 정확히 500건이면 닿은 것으로 본다(뒤에 더 있을 수 있다)");

    // 한도에 닿지 않은 보통 날: 예전 답장 그대로(빈 날 문구 포함)
    seed(0, () => false);
    const quiet = await say(fx, "오늘 기록 보기");
    ok(quiet.includes("아직 기록이 없어요") && !/500건|읽은 범위/.test(quiet), "T-10 기록이 없는 보통 날은 예전 문구 그대로다");
    seed(7, (i) => i % 2 === 0);
    const normal = await say(fx, "오늘 기록 보기");
    ok(!/500건/.test(normal) && /01번 - 기록0/.test(normal) && /04번 - 기록6/.test(normal), "T-10 보통 날 목록은 예전 그대로다(안내 없음)");
    const deleted = await say(fx, "삭제 02번");
    ok(deleted.includes("기록을 삭제했어요") && !fx.db.transactions.some((item) => item.id === "t10-0002"), "T-10 번호로 지우기는 예전처럼 된다");
  } finally { stop(); }
})));

// ── T-20 이번 달 1~6일 홈 ‘쓰는 속도’ ───────────────────────────────────────────
const expenseRow = (id, date, amount, extra = {}) => ({ id, household_id: HH, user_id: "user-bin", transaction_date: date, type: "expense", amount, category: "식비", memo: `기록 ${id}`, payment_method: "현금", source: "web", raw_text: "", ...extra });
const decodeHtml = (value) => String(value || "").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
async function paceCard(fx, month) {
  const response = await page(fx, `/app?month=${month}&household_id=${HH}`);
  // V22.9.89 U-11: 카드 머리 ‘쓰는 속도’ → 큰 숫자가 세는 기간(최근 7일 · 지난 달은 마지막 7일 · 이번 달 1~6일은 이번 달).
  const card = (response.html.match(/<article class="homeReport"><div class="homeReportTop"><span>(?:최근 7일|마지막 7일|이번 달)<\/span>[\s\S]*?<\/article>/) || [""])[0];
  return {
    status: response.status, bytes: Buffer.byteLength(response.html), head: (card.match(/<div class="homeReportTop"><span>([^<]*)<\/span>/) || [])[1] || "",
    value: decodeHtml((card.match(/<b>([^<]*)<\/b>/) || [])[1] || ""),
    note: decodeHtml((card.match(/<small>([^<]*)<\/small>/) || [])[1] || ""),
    label: (card.match(/aria-label="([^"]*)"/) || [])[1] || "",
    bars: [...card.matchAll(/<i\b([^>]*)>/g)].map((m) => (/isBlank/.test(m[1]) ? "blank" : (m[1].match(/height:(\d+)%/) || [])[1] + "%")),
  };
}
await attempt("T-20", async () => {
  const seed = (fx, rows) => { fx.db.transactions = fx.db.transactions.filter((row) => !String(row.id).startsWith("t20-")); fx.db.transactions.push(...rows); };
  // 2026-10: 1일 5,000 · 2일 3,000 · 3일 2,000(수입 90,000 은 지출이 아니다) · 5일 1,000 · 6일 700 · 7일 400
  const october = [expenseRow("t20-1", "2026-10-01", 5000), expenseRow("t20-2", "2026-10-02", 3000), expenseRow("t20-3", "2026-10-03", 2000), expenseRow("t20-i", "2026-10-03", 90000, { type: "income", category: "급여" }), expenseRow("t20-5", "2026-10-05", 1000), expenseRow("t20-6", "2026-10-06", 700), expenseRow("t20-7", "2026-10-07", 400)];
  const sums = { "2026-10-01": 5000, "2026-10-02": 8000, "2026-10-03": 10000, "2026-10-04": 10000, "2026-10-05": 11000, "2026-10-06": 11700 };
  for (const [day, sum] of Object.entries(sums)) {
    await withClock(day, () => fixture(async (fx) => {
      seed(fx, october);
      const card = await paceCard(fx, "2026-10");
      eq(card.status, 200, `T-20 ${day} 홈이 열린다`);
      eq(card.value, `${sum.toLocaleString("en-US")}원`, `T-20 ${day}: 큰 숫자가 1일부터 오늘까지의 지출 합계다 (${card.value})`);
      ok(card.note.startsWith("1일부터 오늘까지 쓴 돈이에요"), `T-20 ${day}: 1일부터 오늘까지라고 말한다 (${card.note})`);
      eq(card.head, "이번 달", `V22.9.89 T-20 ${day}: 카드 머리도 큰 숫자의 기간(이번 달)이다 (${card.head})`);
      eq(card.label, "최근 4주 지출", `T-20 ${day}: 막대 설명은 그대로다`);
      eq(card.bars.join(","), "blank,blank,blank,100%", `T-20 ${day}: 오늘로 끝나는 창만 그려지고 앞 창들은 비어 있다 (${card.bars.join(",")})`);
    }));
  }
  // 지출이 없는 1~6일은 0원이 맞다
  await withClock("2026-10-04", () => fixture(async (fx) => {
    seed(fx, [expenseRow("t20-x", "2026-09-30", 7000), expenseRow("t20-y", "2026-10-09", 1000)]);
    const card = await paceCard(fx, "2026-10");
    eq(card.value, "0원", `T-20 이번 달에 오늘까지 지출이 없으면 0원이다 — 지난달 말·오늘 뒤 기록은 세지 않는다 (${card.value})`);
  }));
  // 7일부터는 예전 그대로(7일 창, 안내문)
  await withClock("2026-10-07", () => fixture(async (fx) => {
    seed(fx, october);
    const card = await paceCard(fx, "2026-10");
    eq(card.value, "12,100원", `T-20 7일에는 1~7일 창이다 (${card.value})`);
    eq(card.note, "이 달에 쌓인 주만 보여드려요. 4주가 모이면 견줄 수 있어요", `T-20 7일의 문구는 예전 그대로다 (${card.note})`);
  }));
  await withClock("2026-10-14", () => fixture(async (fx) => {
    seed(fx, [...october, expenseRow("t20-a", "2026-10-09", 500), expenseRow("t20-b", "2026-10-14", 300)]);
    const card = await paceCard(fx, "2026-10");
    eq(card.value, "800원", `T-20 14일에는 8~14일 창이다 (${card.value})`);
    eq(card.note, "직전 7일보다 ▼ 11,300원 덜 쓰는 속도입니다", `T-20 14일의 비교 문구는 예전 그대로다 (${card.note})`);
    eq(card.bars[0], "blank", "T-20 달 시작보다 앞선 창은 여전히 비운다");
  }));
  // 지난 달(V22.9.79 S-3)과 아직 오지 않은 달은 그대로다. 11월 1~3일의 10월은 지난 달이다.
  await withClock("2026-11-03", () => fixture(async (fx) => {
    seed(fx, [...october, expenseRow("t20-n", "2026-10-31", 12000), expenseRow("t20-o", "2026-11-02", 4000), expenseRow("t20-f", "2026-12-24", 100000)]);
    const past = await paceCard(fx, "2026-10");
    eq(past.value, "12,000원", `T-20 11월 3일의 10월 홈은 10월 말일로 끝나는 마지막 7일이다 (${past.value})`);
    eq(past.label, "마지막 4주 지출", "T-20 지난 달 막대 설명은 ‘마지막 4주’ 다");
    ok(past.note.startsWith("마지막 7일이 직전 7일보다") && !past.note.includes("1일부터 오늘까지"), `T-20 지난 달 문구는 과거형 그대로다 (${past.note})`);
    const now = await paceCard(fx, "2026-11");
    eq(now.value, "4,000원", `T-20 11월 3일의 11월 홈은 1일부터 오늘까지다 (${now.value})`);
    const future = await paceCard(fx, "2026-12");
    deepEq([future.value, future.note, future.bars.join(",")], ["관측 전", "아직 시작하지 않은 달이에요", "blank,blank,blank,blank"], "T-20 아직 오지 않은 달은 그대로다");
  }));
  // 홈 HTML 바이트 예산(44KiB, 실사용 200행)과 DB 읽기 수: 1~6일 홈도 같은 예산 안이고 새 읽기가 없다.
  const BUDGET = 44 * 1024;
  const measure = async (day) => withClock(day, () => fixture(async (fx) => {
    const categories = ["식비", "카페/간식", "교통/차량", "장보기", "주거/관리", "쇼핑", "의료/건강", "구독"];
    const payments = ["국민카드", "현대카드", "카카오페이", "현금", "계좌이체"];
    for (let index = 0; index < 200; index += 1) {
      const d = String((index % 28) + 1).padStart(2, "0");
      fx.db.transactions.push({ id: `t20-b${index}`, household_id: HH, user_id: "user-bin", transaction_date: `2026-07-${d}`, type: index % 9 === 0 ? "income" : "expense", amount: 1000 + (index * 137) % 90000, category: categories[index % categories.length], memo: `실사용 기록 ${index} 항목`, payment_method: payments[index % payments.length], source: "web", created_at: `2026-07-${d}T09:00:00.000Z` });
    }
    let reads = 0;
    const stop = intercept(({ url }) => { if (url.hostname === "mock.supabase.co") reads += 1; return null; });
    try {
      const response = await app.fetch(new Request(`${BASE}/app?month=2026-07&household_id=${HH}`, { headers: { cookie: fx.cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" } }), fx.env, {});
      const html = await response.text();
      return { bytes: Buffer.byteLength(html), reads, value: decodeHtml((html.match(/<span>쓰는 속도<\/span><a[^>]*>[^<]*<\/a><\/div><b>([^<]*)<\/b>/) || [])[1] || "") };
    } finally { stop(); }
  }));
  const mid = await measure("2026-07-15");
  for (const day of ["2026-07-01", "2026-07-03", "2026-07-06"]) {
    const early = await measure(day);
    ok(early.bytes <= BUDGET, `T-20 ${day} 홈 HTML 이 실사용 예산 안이다(${early.bytes} ≤ ${BUDGET})`);
    ok(early.bytes <= mid.bytes + 64, `T-20 ${day} 홈 HTML 이 15일 홈보다 64B 넘게 커지지 않는다(${early.bytes} vs ${mid.bytes})`);
    eq(early.reads, mid.reads, `T-20 ${day} 홈의 DB 읽기 수가 15일 홈과 같다(${early.reads}회 — 새 조회 없음)`);
    ok(early.reads <= 9, `T-20 ${day} 홈의 DB 읽기는 9회 이하다(${early.reads}회)`);
    ok(early.value !== "0원", `T-20 ${day} 지출이 있는 달의 큰 숫자가 0원이 아니다(${early.value})`);
  }
});

if (SOFT) {
  console.log(`검사 ${checks}개 중 ${failures.length}개 실패(V22980_SOFT=1)`);
  for (const message of failures) console.log(`  ✗ ${message}`);
} else {
  t.done();
}

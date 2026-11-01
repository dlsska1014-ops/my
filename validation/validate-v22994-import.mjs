// V22.9.94 — 가져오기(CSV) 해석 결함 2건(외부 검토 C-7·C-8) 회귀 검사.
//
// ── 이 파일이 왜 생겼는지 ──
//   C-7 머리글 없는 CSV 의 외화가 원화로 저장됐다. ‘2026-07-01,커피,$100’ 이 100원 지출로 기본 선택됐다. 머리글이 있으면 금액 칸의
//       외화 표시($)로 거절하는데, 머리글 없는 행의 금액 추론(행의 숫자에서 금액 찾기)과 자연어 해석(‘€100’·‘USD 100’·‘커피 $100’)은
//       그 검사를 지나지 않았다. 이제 추론한 금액에 외화 표시가 붙어 있으면 머리글 경로처럼 거절하고(ambiguous_amount),
//       통화 코드만 적힌 칸이 따로 있으면(‘100,USD’) 확인 필요로 두어 기본 선택하지 않는다. ₩·원·KRW 는 예전 그대로다.
//   C-8 환불 행 개수로 수입이 지출로 뒤집혔다. 제목 있는 표에서 ‘지출,-100,커피 환불’ 한 행은 환급(수입)·확인 필요인데, 같은 꼴의 행이
//       둘이면 파일 전체 부호 규칙(음수가 둘 이상·절반 이상이면 음수 = 지출)이 켜져 두 행 모두 양수 지출로 기본 선택됐다. 같은 파일의
//       양수 행(‘점심 3000’)은 수입이 됐다. 이제 환불·취소·반품·환급 말이 있는 음수 행은 부호 규칙의 근거로 세지 않고, 부호 규칙이 켜진
//       파일에서도 한 행일 때처럼 환급(수입)·확인 필요로 둔다. 환불 말이 없는 은행식 파일(지출이 모두 음수)은 예전 그대로 음수 = 지출이다.
// 모두 메모리 픽스처(DB·서버 없음)에서 번들(src/index.js)의 실제 경로를 돌린다. 각 항목의 첫 검사는 고치기 전 코드에서 실패한다.
import { parseFlexibleImportRecords } from "../src/index.js";
import { fixture, post, withClock } from "./lib-audit-v22934.mjs";

const HH = "house-home";
let checks = 0;
const failures = [];
const ok = (value, message) => { checks += 1; if (!value) failures.push(message); };
const eq = (actual, expected, message) => { checks += 1; if (actual !== expected) failures.push(`${message}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`); };
const parse = (text, options = {}) => parseFlexibleImportRecords(text, HH, "", { referenceDate: "2026-07-15", ...options });
const brief = (row) => (row ? `${row.type}:${row.amount}:${row.category}:${row._import_needs_confirmation === true}` : "없음");
const kind = (row) => (row ? `${row.type}:${row._import_needs_confirmation === true}` : "없음");

// ── C-7 머리글 없는 CSV 의 외화 ─────────────────────────────────────
await withClock("2026-07-15", async () => {
  const repro = parse("2026-07-01,커피,$100");
  eq(repro.rows.length, 0, "C-7 머리글 없는 ‘2026-07-01,커피,$100’ 은 저장 후보가 아니다(예전에는 100원 지출로 기본 선택)");
  eq(repro.rejected[0]?.reason_code, "ambiguous_amount", "C-7 머리글 없는 외화 금액은 머리글 경로와 같은 사유로 뺀다");
  const headed = parse("날짜,내용,금액\n2026-07-01,커피,$100");
  const headedRejection = headed.rejected.find((item) => item.row_number === 2);
  eq(headed.rows.length, 0, "C-7 머리글 있는 같은 행은 예전처럼 저장하지 않는다");
  eq(headedRejection?.reason_code, repro.rejected[0]?.reason_code, "C-7 머리글 있는 행과 없는 행의 제외 사유가 같다");
  eq(headedRejection?.suggestion, repro.rejected[0]?.suggestion, "C-7 머리글 있는 행과 없는 행의 안내가 같다");

  // 행의 숫자에서 금액을 찾는 길(금액 칸 = 원래 칸)과, 숫자 칸이 없어 자연어로 금액을 찾는 길(행 안·한 줄) 모두.
  const foreign = [
    "2026-07-01,커피,$100", "2026-07-01,커피,＄100", "2026-07-01\t커피\t$100", "2026-07-01;커피;$100", "2026-07-01|커피|$100",
    "2026-07-01,커피,$ 100", "2026-07-01,커피,-$100", "2026-07-01,커피,($100)", "2026-07-01,커피,$100-", "2026-07-01,커피,$1만",
    "2026-07-01,커피,$12,000", "2026-07-01,커피,\"$12,000\"", "2026-07-01,$100,100", "커피,$12,000",
    "2026-07-01,커피,€100", "2026-07-01,커피,¥100", "2026-07-01,커피,￥100", "2026-07-01,커피,£100", "2026-07-01,커피,USD 100",
    "2026-07-01,커피,US$100", "2026-07-01,커피,JPY 1000", "2026-07-01,커피,1,000$", "2026-07-01,커피,USD 1,234", "2026-07-01,커피,€1,234",
    "2026-07-01,커피,1,234 USD", "2026-07-01,커피,$1,234.56", "2026-07-01,커피,€3,4000",
    "커피 $100", "어제 커피 $100", "커피 €100", "2026-07-01 커피 $100", "커피 100$", "커피 100€", "커피 100 EUR", "커피 100 dollars",
    "커피 JPY 1000", "커피 ¥1,000", "커피 US$ 100", "커피 $1.5만", "$100 커피", "커피 €100 카드", "커피 ＄１００",
  ];
  for (const text of foreign) {
    const parsed = parse(text);
    eq(parsed.rows.length, 0, `C-7 외화 금액 ‘${text}’ 은 원화로 저장하지 않는다`);
    eq(parsed.rejected.map((item) => item.reason_code).join(","), "ambiguous_amount", `C-7 ‘${text}’ 은 머리글 경로처럼 금액 확인 사유로 뺀다`);
  }
  // 금액 뒤에 외화 이름이 붙은 꼴은 예전부터 금액을 읽지 못해 저장하지 않았다(그대로다).
  for (const text of ["2026-07-01,커피,100€", "2026-07-01,커피,100달러", "2026-07-01,커피,100 USD", "커피 100달러", "커피 100엔", "커피 100유로"]) {
    const parsed = parse(text);
    eq(parsed.rows.length, 0, `C-7 외화 금액 ‘${text}’ 은 예전처럼 저장하지 않는다`);
    eq(parsed.rejected.length, 1, `C-7 ‘${text}’ 은 예전처럼 제외 사유에 남는다`);
  }

  // ₩·원·KRW 와 원화 금액이 따로 적힌 행은 예전 그대로 저장 후보다(외화 낱말이 금액에 붙지 않았으면 거절하지 않는다).
  const local = [
    ["2026-07-01,커피,4000", 4000], ["2026-07-01,커피,₩4000", 4000], ["2026-07-01,커피,￦4,000", 4000], ["2026-07-01,커피,4000원", 4000],
    ["2026-07-01,커피,KRW 4000", 4000], ["2026-07-01,커피,4,000원", 4000], ["커피 4000원", 4000], ["커피 4000", 4000], ["스벅 4,500원", 4500],
    ["달러 환전 50000원", 50000], ["2026-07-01,달러 환전,50000", 50000], ["USD 환전 50000원", 50000], ["2026-07-01,USD 환전,50000원", 50000],
    ["커피 4000원 (3달러)", 4000], ["커피 4000원 $3", 4000], ["2026-07-01,커피,€3,4000원", 4000], ["2026-07-01,아마존 $25,34000원", 34000],
    ["2026-07-01,USD,50000원", 50000], ["PHP7 교재 30000원", 30000], ["2026-07-01,커피,-4000", 4000],
    ["2026-07-01,커피 €3,4000", 4000], ["2026-07-01,PHP7 교재,30000", 30000], ["2026-07-01,4000원,€3,4000", 4000],
  ];
  for (const [text, amount] of local) {
    const parsed = parse(text);
    eq(parsed.rows.length, 1, `C-7 원화 행 ‘${text}’ 은 저장 후보다`);
    eq(parsed.rows[0]?.amount, amount, `C-7 원화 행 ‘${text}’ 의 금액`);
    ok(!parsed.rows[0]?._import_warnings.some((warning) => warning.includes("외화")), `C-7 원화 행 ‘${text}’ 에는 외화 경고가 없다`);
  }
  for (const [text] of local.filter(([text]) => !text.endsWith(",-4000"))) eq(parse(text).rows[0]?._import_needs_confirmation, false, `C-7 원화 행 ‘${text}’ 은 예전처럼 기본 선택한다`);

  // 통화 코드만 적힌 칸이 따로 있는 행(제목 없는 표의 통화 열)은 금액에 원화 표시가 없으면 확인 필요다.
  for (const text of ["2026-07-01,커피,100,USD", "2026-07-01,커피,USD,100", "2026-07-01,EUR,커피,100", "2026-07-01,커피,100,$", "2026-07-01\t커피\t100\tJPY"]) {
    const parsed = parse(text);
    eq(parsed.rows.length, 1, `C-7 통화 칸이 따로 있는 ‘${text}’ 은 후보로 남는다`);
    eq(parsed.rows[0]?._import_needs_confirmation, true, `C-7 통화 칸이 따로 있는 ‘${text}’ 은 확인 필요라 기본 선택하지 않는다(예전에는 100원 기본 선택)`);
    ok(parsed.rows[0]?._import_warnings.some((warning) => warning.includes("외화")), `C-7 ‘${text}’ 에 외화 확인 경고가 붙는다`);
  }

  // 머리글 경로는 예전 그대로다.
  eq(parse("date,amount,memo\n2025-07-04,$12.50,coffee", { referenceDate: "2025-07-15" }).rows.length, 0, "C-7 머리글 경로의 외화 금액 칸은 예전처럼 저장하지 않는다");
  eq(parse("날짜,금액,통화,내용\n2026-07-04,12500,USD,coffee").rows.length, 0, "C-7 머리글 경로의 통화 열은 예전처럼 거절한다");
  eq(parse("날짜,외화금액(USD),원화금액(원),내용\n2026-07-04,12.50,18000,coffee").rows[0]?.amount, 18000, "C-7 원화 금액 열이 있으면 예전처럼 원화 금액을 쓴다");
  eq(parse("날짜:2026-07-03|금액:$5000|내용:커피").rows.length, 0, "C-7 키: 값 줄의 외화 금액도 저장하지 않는다");

  // 외화 칸 판정은 긴 칸에서도 길이에 비례한다(숫자·쉼표·빈칸 20만 자). 뒤에 붙는 외화 꼴을 아무 자리에서나 찾거나 부호 앞뒤 빈칸을 두 번 읽으면
  // 20만 자에 1분이 넘게 걸린다. (글자 뒤 긴 빈칸은 금액 칸의 ‘원’ 떼기가 고치기 전부터 느려 여기서 재지 않는다.)
  for (const [label, cell] of [["숫자", "1".repeat(200000)], ["쉼표 숫자", `"${"1,".repeat(100000)}"`], ["$ 뒤 빈칸", `$${" ".repeat(200000)}x`]]) {
    const started = performance.now();
    const parsed = parse(`2026-07-01,4000,${cell}`);
    const elapsed = performance.now() - started;
    ok(elapsed < 3000, `C-7 긴 ${label} 칸(20만 자)의 외화 판정이 3초 안에 끝난다(${Math.round(elapsed)}ms)`);
    eq(parsed.rows[0]?.amount ?? parsed.rejected[0]?.reason_code, 4000, `C-7 긴 ${label} 칸이 있어도 금액 칸 4000 을 읽는다`);
  }
});

// ── C-8 환불 행 개수로 부호 뜻이 바뀌지 않는다 ──────────────────────
await withClock("2026-07-15", async () => {
  const H = "날짜,구분,금액,내용\n";
  const U = "날짜,금액,내용\n";
  const single = parse(`${H}2026-07-01,지출,-100,커피 환불`);
  eq(brief(single.rows[0]), "income:100:환급:true", "C-8 환불 음수 지출 한 행은 환급(수입)·확인 필요다(예전과 같다)");
  const two = parse(`${H}2026-07-01,지출,-100,커피 환불\n2026-07-01,지출,-100,커피 환불`);
  eq(two.sign_convention.mode, "default", "C-8 환불 음수 행 둘만으로는 파일 부호 규칙을 켜지 않는다(예전에는 음수 = 지출)");
  eq(two.rows.map(brief).join(","), "income:100:환급:true,income:100:환급:true", "C-8 같은 행이 둘이어도 둘 다 환급(수입)·확인 필요다(예전에는 둘 다 양수 지출·기본 선택)");
  eq(two.sign_convention.negative_rows, 2, "C-8 음수 행 수는 그대로 센다(미리보기 안내)");

  // 한 행씩 가져올 때와 여러 행을 함께 가져올 때 결과가 같다(환불·반품·취소·환급·refund, 구분 칸이 빈 행 포함).
  const refundRows = ["2026-07-01,지출,-100,커피 환불", "2026-07-02,지출,-200,택시 반품", "2026-07-03,지출,-300,결제 취소", "2026-07-04,지출,-400,세금 환급", "2026-07-05,지출,-500,refund", "2026-07-06,,-600,우산 환불", "2026-07-07,지출,-700,주문취소"];
  const alone = refundRows.map((row) => brief(parse(H + row).rows[0]));
  for (const [index, value] of alone.entries()) ok(value.startsWith("income:") && value.endsWith(":환급:true"), `C-8 한 행씩 가져온 환불 음수 행은 환급(수입)·확인 필요다: ${refundRows[index]} → ${value}`);
  for (let n = 2; n <= refundRows.length; n++) {
    const together = parse(H + refundRows.slice(0, n).join("\n"));
    eq(together.sign_convention.mode, "default", `C-8 환불 음수 행 ${n}개는 부호 파일이 아니다`);
    eq(together.rows.map(brief).join(","), alone.slice(0, n).join(","), `C-8 환불 음수 행 ${n}개의 결과가 한 행씩 가져올 때와 같다`);
    ok(together.rows.every((row) => row._import_needs_confirmation === true), `C-8 환불 음수 행 ${n}개가 모두 기본 선택되지 않는다`);
  }

  const mixed = parse(`${U}2026-07-01,-100,커피 환불\n2026-07-02,-200,택시 환불\n2026-07-03,3000,점심`);
  eq(mixed.sign_convention.mode, "default", "C-8 환불 음수 행 둘이 파일을 부호 파일로 만들지 않는다");
  eq(mixed.rows.map(kind).join(","), "income:true,income:true,expense:false", "C-8 같은 파일의 점심 3000원은 지출이다(예전에는 부호 규칙으로 수입)");
  const card = parse("날짜,구분,금액,가맹점\n2026-07-01,승인,5000,편의점\n2026-07-02,취소,-5000,편의점\n2026-07-03,취소,-3000,마트");
  eq(card.sign_convention.mode, "default", "C-8 취소 음수 행이 많아도 카드 명세서를 부호 파일로 보지 않는다");
  eq(card.rows[0]?.type, "expense", "C-8 승인 5000원은 지출이다(예전에는 취소 두 행 때문에 수입)");

  // 환불 말이 없는 은행식 파일은 예전 그대로다.
  const bank = parse(`${U}2026-07-01,-5000,가게\n2026-07-02,-6000,가게\n2026-07-03,9000,월급`);
  eq(bank.sign_convention.mode, "signed", "C-8 환불 말이 없는 은행식 파일은 예전처럼 부호 파일이다");
  eq(bank.rows.map(kind).join(","), "expense:false,expense:false,income:false", "C-8 은행식 파일은 음수 = 지출, 양수 = 수입이고 기본 선택한다");
  const bankTyped = parse(`${H}2026-07-01,지출,-4500,커피\n2026-07-02,지출,-12000,점심\n2026-07-25,수입,3000000,월급`);
  eq(bankTyped.sign_convention.mode, "signed", "C-8 구분 칸이 있는 부호 파일도 예전 그대로다");
  eq(bankTyped.rows.map(kind).join(","), "expense:false,expense:false,income:false", "C-8 구분 칸이 있는 부호 파일의 음수 지출은 지출이다");
  const bankAll = parse(U + Array.from({ length: 6 }, (_, index) => `2026-07-0${index + 1},-${index + 1}000,가게`).join("\n"));
  eq(bankAll.sign_convention.mode, "signed", "C-8 전부 음수인 은행식 파일은 부호 파일이다");
  ok(bankAll.rows.every((row) => row.type === "expense" && row._import_needs_confirmation === false), "C-8 전부 음수인 은행식 파일은 모두 지출·기본 선택이다");

  // 부호 파일 안의 환불 음수 행은 부호 규칙과 맞지 않으므로 한 행일 때처럼 환급(수입)·확인 필요로 두고 까닭을 남긴다.
  for (const [label, text, refund, lone] of [
    ["구분 없음", `${U}2026-07-01,-5000,점심\n2026-07-02,-3000,커피\n2026-07-03,-100,커피 환불`, 2, `${U}2026-07-03,-100,커피 환불`],
    ["구분 있음", `${H}2026-07-01,지출,-5000,점심\n2026-07-02,지출,-3000,커피\n2026-07-03,지출,-100,커피 환불`, 2, `${H}2026-07-03,지출,-100,커피 환불`],
    ["출금액 열", "날짜,출금액,입금액,내용\n2026-07-01,-5000,,점심\n2026-07-02,-3000,,커피\n2026-07-03,-100,,커피 환불", 2, "날짜,출금액,입금액,내용\n2026-07-03,-100,,커피 환불"],
  ]) {
    const conflict = parse(text);
    eq(conflict.sign_convention.mode, "signed", `C-8 ${label}: 환불 말 없는 음수 행이 둘 이상·절반 이상이면 여전히 부호 파일이다`);
    eq(conflict.rows.slice(0, refund).map(kind).join(","), "expense:false,expense:false", `C-8 ${label}: 그 파일의 환불 말 없는 음수 행은 예전처럼 지출·기본 선택이다`);
    eq(brief(conflict.rows[refund]), "income:100:환급:true", `C-8 ${label}: 부호 파일 안의 환불 음수 행은 환급(수입)·확인 필요다(예전에는 지출·기본 선택)`);
    eq(brief(conflict.rows[refund]), brief(parse(lone).rows[0]), `C-8 ${label}: 부호 파일 안의 환불 음수 행도 한 행일 때와 같다`);
    ok(conflict.rows[refund]?._import_warnings.some((warning) => warning.includes("부호 규칙")), `C-8 ${label}: 부호 규칙을 따르지 않은 까닭을 경고로 남긴다`);
  }
  const positiveRefund = parse(`${U}2026-07-01,-5000,점심\n2026-07-02,-3000,커피\n2026-07-03,4000,커피 환불`);
  eq(positiveRefund.sign_convention.mode, "signed", "C-8 양수 환불 행은 부호 판정을 바꾸지 않는다");
  eq(positiveRefund.rows.map(kind).join(","), "expense:false,expense:false,income:false", "C-8 부호 파일의 양수 환불은 예전처럼 수입이다");
  const fee = parse(`${U}2026-07-01,-5000,점심\n2026-07-02,-3000,환불 수수료`);
  eq(fee.sign_convention.mode, "signed", "C-8 환불 수수료는 환불 말로 보지 않는다");
  eq(fee.rows.map(kind).join(","), "expense:false,expense:false", "C-8 부호 파일의 환불 수수료는 예전처럼 지출이다");
  const reversal = parse(`${U}2026-07-01,-5000,점심\n2026-07-02,-3000,커피\n2026-07-03,-50000,입금취소\n2026-07-04,50000,급여`);
  eq(reversal.sign_convention.mode, "signed", "C-8 입금 취소는 환불 말로 보지 않는다");
  eq(reversal.rows[2]?.type, "expense", "C-8 부호 파일의 입금 취소는 예전처럼 지출이다");
  eq(parse(`${H}2026-07-01,수입,-4500,환불\n2026-07-02,지출,-12000,점심`).sign_convention.mode, "default", "C-8 음수 수입이 있으면 예전처럼 부호 파일이 아니다");
  const defaultRefund = parse("날짜,구분,금액,내용,분류,결제수단\n2026-07-01,지출,4500,스타벅스,카페/간식,카드\n2026-07-02,지출,-5000,취소건,식비,카드\n2026-07-16,지출,12000,점심,식비,국민카드");
  eq(defaultRefund.rows.map(brief).join(","), "expense:4500:카페/간식:false,income:5000:환급:true,expense:12000:식비:false", "C-8 양수 지출 사이의 음수는 예전처럼 환급(수입)·확인 필요다");
});

// ── 미리보기 화면(서버 렌더): 확인 필요 표시와 기본 선택 ─────────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    const BIN = "11111111-1111-4111-8111-111111111111";
    for (const [name, rows] of Object.entries(fx.db)) if (Array.isArray(rows)) fx.db[name] = JSON.parse(JSON.stringify(rows).replaceAll("user-bin", BIN));
    fx.cookie = await fx.cookieFor(BIN);
    fx.db.__import_rpc_available = true;
    const preview = (csv) => post(fx, "/my/import", { household_id: HH, month: "2026-07", csv_text: csv, skip_duplicates: "1" });
    const picks = (html) => [...String(html).matchAll(/<input class="importPick"[^>]*>/g)].map(([tag]) => ({
      amount: Number(tag.match(/data-amount="(\d+)"/)?.[1] || 0),
      type: tag.match(/data-type="(\w+)"/)?.[1] || "",
      review: tag.includes('data-review-needed="1"'),
      checked: /\schecked(?=[\s/>])/.test(tag),
    }));

    const c7 = await preview("2026-07-01,커피,$100\n2026-07-02,점심,12000");
    eq(c7.status, 200, "C-7 미리보기가 열린다");
    const c7Picks = picks(c7.text);
    eq(c7Picks.length, 1, "C-7 미리보기의 저장 후보는 원화 행 하나뿐이다(예전에는 $100 행도 후보)");
    ok(!c7Picks.some((pick) => pick.amount === 100), "C-7 $100 행은 100원 후보로 보이지 않는다");
    ok(c7Picks[0]?.amount === 12000 && c7Picks[0].checked, "C-7 원화 행은 예전처럼 기본 선택한다");
    ok(c7.text.includes(">2026-07-01,커피,$100<"), "C-7 외화 행은 제외 사유 표에 원문 그대로 보인다");

    const c7Code = await preview("2026-07-01,커피,100,USD");
    const c7CodePicks = picks(c7Code.text);
    eq(c7CodePicks.length, 1, "C-7 통화 칸이 따로 있는 행은 미리보기 후보로 남는다");
    ok(c7CodePicks[0] && !c7CodePicks[0].checked && c7CodePicks[0].review, "C-7 통화 칸이 따로 있는 행은 확인 필요·기본 선택 해제다");
    ok(c7Code.text.includes("원화 금액인지 확인"), "C-7 미리보기에 외화 확인 경고가 보인다");

    const c8 = await preview("날짜,구분,금액,내용\n2026-07-01,지출,-100,커피 환불\n2026-07-02,지출,-200,택시 환불");
    eq(c8.status, 200, "C-8 미리보기가 열린다");
    const c8Picks = picks(c8.text);
    eq(c8Picks.length, 2, "C-8 환불 행 둘이 모두 후보로 보인다");
    ok(c8Picks.every((pick) => pick.type === "income" && pick.review && !pick.checked), "C-8 환불 행 둘은 모두 환급(수입)·확인 필요·기본 선택 해제다(예전에는 지출·기본 선택)");
    ok(c8.text.includes("음수 금액 2행은 취소·환불(수입)로 읽고 확인 필요로 표시했습니다"), "C-8 미리보기가 환불 해석을 밝힌다");
    ok(!c8.text.includes("음수 = 지출, 양수 = 수입"), "C-8 환불 행만 있는 파일에 부호 파일 안내를 띄우지 않는다");

    const c8Conflict = await preview("날짜,금액,내용\n2026-07-01,-5000,점심\n2026-07-02,-3000,커피\n2026-07-03,-100,커피 환불");
    const conflictPicks = picks(c8Conflict.text);
    eq(conflictPicks.map((pick) => `${pick.amount}:${pick.type}:${pick.checked}`).join(","), "5000:expense:true,3000:expense:true,100:income:false", "C-8 부호 파일 미리보기에서 환불 음수 행만 환급(수입)·기본 선택 해제다");
  });
});

if (failures.length) {
  console.error(failures.slice(0, 400).join("\n"));
  console.error(`V22.9.94 가져오기 검사 실패 ${failures.length}건 / ${checks}`);
  process.exit(1);
}
console.log(`V22.9.94 가져오기 검사 통과 (${checks} checks)`);

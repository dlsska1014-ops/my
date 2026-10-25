// V22.9.78 백업 CSV 열 이름 유지·안내 일치 검사 (V76:W-10, 운영자 결정 2026-10-23).
// W-10: 백업 CSV 열 이름이 화면 용어와 다르다. 결정은 열 이름을 그대로 두어 가져오기 호환을 지키는 것이다.
//       대신 백업 화면 안내를 실제 열 목록에서 만들고(예전 안내에는 ‘지출자’가 빠져 있었다), 화면 용어와 다른 열은 괄호로 풀어 쓴다.
import { READABLE_CSV_COLUMNS, buildReadableTransactionsCsv } from "../src/modules/import/csv-duplicates.js";
import { canonicalImportField, parseFlexibleImportRecords } from "../src/modules/import/flexible-import-parser.js";
import { counter, fixture, page } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.78 백업 CSV 열 이름 유지·안내 일치 검사 통과");
const HH = "house-home";
const COLUMNS = ["날짜", "구분", "금액", "분류", "내용", "결제수단", "지출자", "출처", "기록ID"];

// 1) 열 이름은 예전과 같다.
eq(JSON.stringify(READABLE_CSV_COLUMNS), JSON.stringify(COLUMNS), "백업 CSV 열 이름은 예전과 같다(가져오기 호환)");
ok(Object.isFrozen(READABLE_CSV_COLUMNS), "열 목록은 바꿀 수 없게 고정돼 있다");
const csv = buildReadableTransactionsCsv([{ transaction_date: "2026-10-20", type: "expense", amount: 12000, category: "외식", memo: "점심", payment_method: "카드", spender_name: "민수", source: "kakao_skill", id: "tx-1" }]);
const [head, line] = csv.replace(/^﻿/, "").split(/\r?\n/);
eq(head, COLUMNS.join(","), "CSV 첫 줄이 같은 열 이름이다");
eq(line, "2026-10-20,지출,12000,외식,점심,카드,민수,kakao_skill,tx-1", "값 줄도 예전과 같은 순서다");

// 2) 가져오기는 이 열 이름을 그대로 읽는다(복원 계약). 화면 용어 ‘메모’로 바꿔 쓴 첫 줄도 읽는다.
for (const name of ["날짜", "구분", "금액", "분류", "내용", "결제수단", "지출자"]) ok(Boolean(canonicalImportField(name)), `가져오기가 ‘${name}’ 열을 안다`);
ok(Boolean(canonicalImportField("메모")) && canonicalImportField("메모") === canonicalImportField("내용"), "가져오기는 화면 용어 ‘메모’도 ‘내용’과 같은 열로 읽는다");
const parsed = parseFlexibleImportRecords(csv, HH, "user-bin", { reference_date: "2026-10-25" });
const records = Array.isArray(parsed) ? parsed : parsed?.records || parsed?.rows || [];
const first = records[0] || {};
ok(records.length === 1 && Number(first.amount) === 12000 && first.type === "expense" && first.transaction_date === "2026-10-20" && first.memo === "점심" && first.category === "외식",
  `백업 CSV 를 다시 가져오면 같은 날짜·구분·금액·분류·내용으로 읽는다(받음: ${JSON.stringify(first).slice(0, 200)})`);

// 3) 백업 화면 안내가 실제 열 9개를 같은 순서로 적는다.
await fixture(async (fx) => {
  const response = await page(fx, `/my/backup?household_id=${HH}`);
  eq(response.status, 200, "백업 화면이 열린다");
  const note = (response.html.match(/<p class="muted">컬럼: ([^<]*)<\/p>/) || [])[1] || "";
  eq(note.split(". ")[0], "날짜, 구분(수입·지출), 금액, 분류, 내용(메모), 결제수단, 지출자, 출처(기록한 곳), 기록ID", "안내가 CSV 열 9개를 같은 순서로 적는다(예전 안내에는 지출자가 빠졌다)");
  ok(note.includes("컬럼 이름은 예전 백업과 같아 가져오기에서 그대로 읽습니다"), "열 이름이 예전과 같아 가져오기에서 읽는다고 알린다");
});

done();

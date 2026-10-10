# V22.9.37 감사 묶음 D — 가져오기·백업 적용·입력 검증

감사 `docs/codex/AUDIT_FINDINGS_V22_9_33.md`(4절·입력 검증 묶음)와 `AUDIT_FINDINGS_V22_9_34.md` §2 에서 V22.9.36 으로 넘긴
항목 가운데 가져오기 해석, 관리자 백업 적용, 입력 검증을 고친 기록이다. 검사는 `validation/validate-audit-batch-d-v22937.mjs`
(220개)이며 모두 메모리 픽스처로 재현한다.

## 공용 엄격 검증기 `src/modules/domain/strict-input.js`

- `parseStrictAmount(value, { max, min, allowNegative, allowCommas })` → 정수 또는 `null`. 숫자와 `"12000"`·`"+500"` 꼴 문자열만
  받고, `Number()` 가 조용히 받아 주는 `"0x10"`(16)·`"1e3"`(1000)·`true`(1)·`" "`(0)·소수·NaN·Infinity·객체는 모두 `null` 이다.
  천 단위 쉼표(`"1,500,000"`)는 `allowCommas` 일 때만(폼 입력), 음수는 `allowNegative` 일 때만(대출·신용카드 잔액) 받는다.
- `parseStrictMonth` 는 `validMonth`, `parseStrictDate` 는 `isValidTransactionDateString` 을 그대로 쓴다(의미 중복 없음).
  `parseStrictDay(value, { min = 1, max = 31 })` 는 정수 일자다.
- `MANIFEST.txt` 에서 `domain/transactions-core.js` 바로 뒤에 있고 최상위에는 함수 선언만 둔다(기본값은 호출 시점에 읽음).
- 쓰는 곳: 가져오기 저장 직전 정리(`cleanImportedRowsForInsert`), 관리자 API 본문 검증, 백업 계획 행 검증, 자산 잔액 입력.
  다른 묶음(N8~N12)도 이 함수를 쓰면 된다. `worker/test-exports.js` 에는 아직 올리지 않았다(이 묶음의 소유 범위 밖).

## 고친 항목

| ID | 결함 | 고친 방법 |
|---|---|---|
| N5·D6 | 날짜가 없거나 틀린 행에서 금액 칸(38000·52000)을 엑셀 일련번호로 읽어 2004·2042년으로 저장. `10/12/25` 가 2010-12-25. | 가져오기 전용 `parseImportDateCell`: 다섯 자리 숫자는 날짜 열 값일 때만 날짜, 두 자리 연도는 M/D/YY 를 먼저 보고 월이 13 이상이면 YY/MM/DD, 연도는 2000년~내년만. 날짜 열이 있는 행은 그 칸에서만 읽고 비었거나 틀리면 `missing_date`·`invalid_date` 로 확인 필요에 보낸다. 두 자리 연도 해석은 파일 단위 경고와 미리보기 안내로 알린다(행마다 경고를 붙이면 모든 행이 확인 필요가 되므로). 카카오·웹이 쓰는 `parseDateStrict` 는 바꾸지 않았다. |
| T9 | 쉼표로 이은 "합계" 행이 지출로 저장. 구분 열이 없으면 월급·판매가 지출. | 합계 판정을 칸 단위로(`isImportSummaryRow`: 합계·총계·소계·월계 칸은 날짜가 있어도 거래가 아님, 누계·잔액은 예전처럼 날짜 없는 행만). 제목 행 판정 뒤에 합계를 보므로 "잔액" 열이 있는 반복 제목 행을 합계로 오인하지 않는다. 문맥으로 구분을 정할 때는 칸을 공백으로 이어 공용 `detectType`(D2 규칙)을 그대로 부른다. |
| T10 | 부호로 수입·지출을 적은 내보내기(음수 = 지출)에서 모든 지출이 환급(수입)으로 뒤집힘. | 본 해석 전에 파일 전체 부호 규칙을 정한다(`detectImportSignConvention`): 금액 있는 행 중 둘 이상·절반 이상이 음수이고 양수 지출·음수 수입이 없으면 `signed`(음수 = 지출, 양수 = 수입). 그 밖은 예전처럼 음수 한두 건을 취소·환불로 본다. 미리보기는 추론한 규칙을 보여 주고(`#importSignConvention`), 행마다 구분을 바꾸는 `<select name="row_type_N">` 을 두어 저장 때 반영한다(환급 → 지출로 되돌리면 분류도 되돌림). |
| SIM-6 | 관리자 백업 적용에 잠금이 없어 같은 계획을 동시에 두 번 적용하면 둘 다 저장. 응답을 잃은 저장(5xx)을 "저장하지 못함(기존 데이터 유지)"으로 알려 다시 제출하면 중복. | 적용 전체를 가계부 설정 잠금(`withHouseholdSettingsRmw`, `household-settings-rmw:<id>`) 안에서 하고, 현재 기록·참여자를 엄격하게 읽어 실패하면 적용하지 않는다(예전부터 읽기 실패는 오류였음). 불명확한 저장은 다시 읽어 확인하고, 확인되지 않으면 "확인 필요"로 알린 뒤 남은 행은 적용하지 않는다. 잠금 중이면 409. |
| SIM-7 | 계획 파일의 `"0x10"` 이 16원, `-5000` 이 0원 지출, 모르는 구분이 지출, `12.5` 가 13원으로 저장. 비참여자 지출자·없는 가계부·다른 달 날짜도 저장. JSON 가져오기의 소수 금액 반올림. | `strictCandidatePlanRow` 가 금액·날짜·구분·지출자·글자 칸을 엄격하게 읽고 틀린 행은 사유와 함께 뺀다. 가계부는 읽어 온 목록에 있는 것만, 지출자는 활성 참여자만, 날짜는 선택한 달만(중복 확인 범위). `parseImportAmountCell` 은 원 단위 소수를 금액 오류로 보낸다. `cleanImportedRowsForInsert` 가 저장 직전 공용 검증기로 다시 확인한다. |
| N7 | 자산 잔액에서 해석 실패("abc")가 0 으로 저장, 음수는 부호가 뒤집혀 양수로 저장. | `parsePaymentAssetBalanceInput`: 해석 실패는 메시지로 거절(저장 안 함), 음수는 그대로 읽는다. 음수 잔액은 대출·신용카드(`allowsNegativePaymentAssetBalance`)만 허용하고 그 밖은 거절한다. 종류를 자산으로 바꾸면서 음수가 남아도 거절한다. 단위가 붙은 한글 금액("150만원")은 예전처럼 받는다. 잔액 저장 폼의 빈 칸은 거절, 상세 수정 폼의 빈 칸은 잔액을 바꾸지 않는다. `normalizePaymentAssetAmount` 는 부호를 지우지 않고 종류별 규칙은 `paymentAssetBalanceForKind` 가 정한다. |
| N13 | 관리자 API 가 `"0x10"`·`"1e3"`·`true` 를 금액으로 받고, 객체·배열 ID·글자 칸을 문자열로 바꿔 저장. | `validateAdminApiTransactionBody` 가 금액은 공용 엄격 검증기, ID·구분·글자 칸은 문자열만 받는다(`invalid_text` 400 추가). `normalizeApiTransactionBody` 는 검증된 정수 금액을 넘긴다. |

## 바꾸지 않은 것·주의

PR #68 후속 검토에서 음수 대출 잔액을 부채 합계에도 음수로 더해 순자산이 늘어나는 회귀를 고쳤다. 저장된 잔액의 부호는 보존하고, 부채 합계와 부채 그룹은 원금의 절댓값을 사용한다. 은행 1,000,000원과 대출 ±120,000원은 모두 부채 120,000원·순자산 880,000원이 되며, 새 월별 자산 기록에도 같은 합계를 저장한다(추가 검사 9개).

- `nlu/date-payment.js` 의 `parseDateStrict`·`quickInputDate`·`resolveWeekdayPhrase` 는 그대로다(카카오·웹 날짜 해석 공유).
- 부호 규칙은 제목 행이 있는 표에서만 정한다. 음수가 한 건뿐인 파일은 예전처럼 취소·환불로 보되 미리보기에서 구분을 바꿀 수 있다.
- 백업 적용은 계획 행의 날짜가 선택한 달 밖이면 제외한다(중복 확인이 그 달 기록과만 이뤄지므로). 여러 달 복구는 달마다 나눠 적용한다.
- 자산 화면(`features/payment-methods-page.js`)의 상세 수정 폼 잔액 칸은 `normalizePaymentAssetAmount(a.balance)` 를 그대로 쓰므로 음수 대출 잔액도 부호 그대로 보인다(부호를 지우지 않게 바꾼 결과).

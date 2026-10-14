# V22.9.44 전체 점검 결과 (2026-10-14)

**1단계 반영:** B-1·C-1·G-1·G-18·G-16은 V22.9.45에서 고침(저장소 수정, 운영 적용 대기). 나머지 100건과 아래의 원래 점검 관찰은 보존합니다. 전후 검사 근거는 `VERIFICATION_V22_9_45.md`에 있습니다.

## 개요

- **대상:** main `ed75a0e`, 즉 운영 배포본 V22.9.44-KAKAO-LATENCY(2026-10-13 15:52 KST)입니다. 이 점검은 저장소와 운영 설정을 바꾸지 않았고 운영으로 요청도 보내지 않았습니다.
- **방법:** 일곱 영역으로 나눠 재현했습니다.
  - 영역: A 카카오 해석·응답, B 카카오 흐름·단톡방, C 웹 보안, D 금액·날짜·집계, E 가져오기·백업, F 크롤·브라우저, G 운영 한계.
  - 도구: 메모리 픽스처(`validation/qa-fixture.mjs`)와 `app.fetch`, 그리고 헤드리스 Chrome(DevTools 파이프).
- **제외:**
  - 2026-10-14 외부 QA가 보고한 4건: 예산 알림 화면 넘침, 알림 숫자 위치, 다크 모드 알림 숫자 대비, 가져오기 미리보기의 가계부 이름.
  - 같은 QA의 UX 의견.
  - `KNOWN-ISSUES.md`에 적힌 한계.
- **재현 자료:** `D:\Github_Kakao_Account\review-artifacts\v22944-audit\<영역>\`에 있습니다.
  - 스크립트는 저장소를 절대 경로로 불러옵니다. 그 폴더에서 `node <파일>`로 다시 돌릴 수 있습니다(A·D·E는 `TZ=UTC`).
  - 관찰한 출력은 같은 이름의 `.out.txt`나 `*-output.txt`에 있습니다.
- **★ 표시:** 정리하면서 직접 다시 돌려 같은 결과를 확인한 항목입니다. 나머지는 영역 점검에서 재현했습니다.
- **Codex 인계:** 단계별 작업 지시, 파일 소유, 완료 기준, 시작 프롬프트는 `docs/codex/HANDOFF_V22_9_44_AUDIT.md`에 있습니다.

## 요약

| 영역 | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| A 카카오 해석·응답 | | 6 | 6 | 6 |
| B 카카오 흐름·단톡방 | 1 | 1 | 6 | 3 |
| C 웹 보안 | | 1 | | 2 |
| D 금액·날짜·집계 | | 3 | 8 | 17 |
| E 가져오기·백업 | | | 8 | 9 |
| F 크롤·브라우저 | | 1 | 1 | 8 |
| G 운영 한계·관제·문서 | | | 9 | 9 |
| 합계 | 1 | 12 | 38 | 54 |

- **가장 급한 것:** B-1입니다. 어제 배포한 V22.9.44의 '먼저 답하기'로 넘어간 첫 기록이 저장되지 않습니다.
- **P1의 갈래:**
  - 카카오와 웹 빠른 입력이 문장을 잘못 읽어 틀린 금액·구분·날짜로 저장하는 것(A-01~A-06, F-1)
  - 수정 세션의 번호 답장이 다른 기록을 바꾸는 것(B-2)
  - 정기 항목의 누락과 이중 기록(D-1, D-2)
  - 시작 예산 분류와 자동분류가 맞지 않는 것(D-4)
  - 관리자 화면의 스크립트 삽입(C-1)
- **운영에서 이미 보이는 것:**
  - 관제의 '최근 처리 실패 기록' 경고가 늘 켜져 있는 원인은 G-1입니다. 운영에 없는 분류 표의 404를 DB 실패로 셉니다.
  - '먼저 답하기' 뒤 실패도 관제에 남지 않습니다(G-5).

## 1. 지금 바로 고칠 것 (P0)

### B-1 ★ '먼저 답하기'로 넘어간 첫 기록이 저장되지 않음 (새 단톡방·새 1:1 사용자)
- **상태:** V22.9.45에서 고침. waitUntil 지원 여부를 저장 경로까지 전달하고 준비 상한 20초를 적용합니다. 문맥 없는 호출은 3.5초 거절을 유지합니다.
- **증상:** 새 단톡방의 첫 기록과 처음 쓰는 1:1 사용자의 첫 기록은 4초 응답 예산을 넘깁니다.
  - 그래서 "요청은 받았어요. … 같은 내용을 다시 보내지 말고 잠시 뒤 '오늘 기록 보기'로 확인해 주세요"라고 먼저 답합니다.
  - 그런데 뒤에서 이어지는 저장이 `transaction-save.js:78`의 검사에 걸립니다. 핸들러 시작 뒤 3.5초가 지나면 INSERT하지 않는 검사입니다. 그래서 저장되지 않습니다.
- **위치:**
  - `src/modules/kakao/transaction-save.js:78`: 3.5초 검사
  - `src/modules/kakao/skill-handler.js:224-239`: 4초 먼저 답하기
- **재현:** `B-kakao-flows/h1a-deferred-save-dropped.mjs 120`
  - 호출당 120ms에서 새 방 첫 기록(room-first)과 새 1:1 사용자 첫 기록(dm-first) 모두 `result=deferred`이고 저장은 0건입니다.
  - 같은 조건에서 waitUntil이 없으면 "저장 전 준비 조회가 지연되어 … 저장하지 않았어요"라고 사실대로 답합니다.
  - 100ms에서는 저장됩니다. V22.9.44 검사는 100ms로만 돕니다. 110·150·170ms에서는 저장되지 않습니다.
- **이어지는 증상:**
  - 곧바로 다시 보내면 "방금 같은 내용을 처리했어요"(8초 가드)라고 답합니다.
  - '오늘 기록 보기'는 "기록이 없습니다"라고 답합니다.
  - 새 1:1 사용자는 '오늘 기록 보기' 뒤 가계부 선택 흐름에 들어가고, 다음 기록까지 그 흐름이 삼킵니다(`h1a-new-user-followup.mjs`).
  - 새 방 소유자 안내("구성원 권한 기록만 …")는 끝내 나오지 않습니다(`h1a-room-followup.mjs`).
- **영향:**
  - 운영 추정 지연(호출당 120~170ms, KNOWN-ISSUES V22.9.44)에서는 출시 주간의 새 사용자와 새 방의 첫 기록이 조용히 사라집니다.
  - V22.9.44 전에는 같은 상황에서 "저장하지 않았어요, 다시 보내 주세요"로 사실대로 실패했습니다. 이제는 다시 보내지 말라고 안내합니다.
  - 관제는 `deferred`를 unknown으로 받아 경보가 없습니다(`monitoring/model.mjs:102`, 코드 판독).
  - 방 참여(두 번째 사람의 첫 기록)는 170ms까지 저장됩니다.
- **고치는 방향:**
  - `waitUntil`이 있는 요청은 3.5초 검사를 끄거나, 먼저 답한 뒤에는 검사하지 않습니다. 응답 시간은 먼저 답하기가 지킵니다.
  - `validate-kakao-latency-v22944`의 지연 시나리오를 호출당 120·170ms로도 돌려 "먼저 답한 뒤 저장됨"을 고정합니다.
  - 예정한 실제 단톡방 재시험은 이 수정 뒤에 합니다.

## 2. P1

### B-2 ★ 수정 세션 메뉴에 "1번"·"6번 엄마"로 답하면 오늘의 그 번호 기록이 바뀜
- **위치:**
  - `kakao/skill-handler.js:280-286`: `parseKakaoEditCommandV4`가 맞으면 세션 처리를 건너뜁니다.
  - `kakao/edit-session-v4.js:323`: 옛 문법 `^(\d{1,2})\s*번\s*(.*)$`이 이 입력을 받습니다.
  - 세션 자체는 `edit-state-machine.js:396`과 메뉴 예시 "6번 엄마"로 이 입력을 받도록 만들어져 있습니다.
- **재현:** `B-kakao-flows/h2-session-number-hijack.mjs`
  - "수정 02번"(점심) 메뉴에 "1번"을 보내면 01번 커피 메뉴로 바뀝니다. 이어서 "13000"을 보내면 커피가 13,000원이 됩니다.
  - 지출자 선택지에서 "2번"을 보내도 02번 메뉴로 빠집니다.
  - `…-oneline.mjs`: "1번 13000" 한 줄이 01번을 바로 바꿉니다.
- **영향:** 번호를 고르라는 메뉴에 "N번"으로 답하는 흔한 습관에서 다른 기록의 금액이나 지출자가 바뀝니다. V22.9.33 N1·T2와 같은 종류입니다.
- **고치는 방향:** 만료되지 않은 세션이 있으면, '수정·삭제' 말과 날짜 접두가 없는 "N번"·"N번 값"을 세션에 먼저 넘깁니다.

### C-1 ★ 관리자 대시보드의 `date` 쿼리가 인라인 스크립트에 그대로 들어감(반사형 스크립트 삽입)
- **상태:** V22.9.45에서 고침. 날짜 검증과 달력 스크립트의 안전한 인라인 JSON을 적용했습니다.
- **위치:** `admin/dashboard-page.js:301`이 `date`를 검증 없이 받고 `:405`에서 넘깁니다. `web/menu-and-guides.js:360` `renderCalendarFilterScript`가 그 값을 `var active=${JSON.stringify(selectedDate)}`로 씁니다.
- **재현:** `verify/c1-admin-date-xss.mjs`, `verify/c1b.mjs`
  - 관리자 세션으로 `/?legacy=1&date=</script><script>…</script>`를 열면 `var active="</script><script>window.__x=1</script>"`가 그대로 나옵니다.
  - CSP가 `script-src 'self' 'unsafe-inline'`이라 막지 못합니다.
  - 사용자 화면(`/app?date=`)에는 이 문제가 없습니다.
- **영향:**
  - 로그인한 운영자가 조작된 링크를 열면, 운영자 권한으로 스크립트가 돌아 전체 가계부 데이터와 관리자 기능에 닿습니다.
  - 세션 쿠키가 SameSite=Lax라서 링크를 눌러 이동할 때도 쿠키가 실립니다.
- **고치는 방향:** `date`를 `YYYY-MM-DD`로 검증합니다. `renderCalendarFilterScript`는 `jsonForInlineScript`(`domain/transactions-core.js:402`)를 씁니다.

### D-1 ★ 가계부가 6개 이상이면 정기 예약 실행이 월말 쪽 규칙을 그 달에 영영 기록하지 않음
- **위치:** `cron/recurring-auto-apply.js:115-116·148·164`(runRecurringAutoApplyUnlocked). 하루에 가계부 5개씩 도는 커서입니다.
- **재현:** `D-web-domain/recurring/r1-min-month-end.mjs`
  - 가계부 12개에 매월 30일 규칙을 두고, 2026-11-01~12-03 매일 09:10에 실행하면 11월 기록은 12개 중 2개만 생깁니다.
  - h-001~h-010은 11-28·11-29에 마지막으로 들러 지정일 전이라 건너뜁니다.
  - 새 달 첫 실행에서도 따라잡지 않아 `last_applied_month=2026-10`에 머뭅니다.
  - `r1b`(가계부 100개·25일 규칙)는 100개 중 18개만 기록됩니다.
- **운영 조건:**
  - 운영 Cron은 `10 0 * * *` UTC로, 하루 한 번 09:10 KST입니다(`docs/deployments/V22_9_31_2026_10_08.md:50`).
  - 카카오 1:1 사용자와 단톡방마다 가계부가 생기므로 이미 6개를 넘었을 가능성이 큽니다.
- **영향:** 25~31일의 월세·카드값·급여 같은 정기 항목이 여러 가계부에서 달마다 조용히 빠집니다. KNOWN-ISSUES에는 "가계부 수÷5일 지연"만 적혀 있습니다.
- **고치는 방향:**
  - 가계부 커서 대신, 활성이고 `last_applied_month < 이번 달`이며 지정일이 오늘 이전인 규칙을 직접 골라 처리합니다.
  - 아니면 기한이 남은 규칙이 있을 때 바퀴를 다시 돌고, 새 달 첫 실행에서 지난달 미반영분을 모두 따라잡습니다.
  - D-10과 함께 고칩니다.

### D-2 ★ '고정지출 추가'(/admin/recurring/save)가 이번 달 이미 적은 지출을 다음 날 한 번 더 기록
- **위치:** `admin/budget-center-recurring.js:185-226`(handleRecurringSave). V22.9.34 T3의 `markRecurringAppliedIfRecordedThisMonth`는 `/my` 경로(`my/settings-page.js:208·249`)에만 들어갔습니다.
- **재현:** `D-web-domain/recurring/r4-new-rule-double.mjs`
  - 10/5에 월세 65만 원을 기록하고 10/10에 같은 규칙을 추가합니다.
  - `/admin/recurring/save`는 `last_applied_month=null`이라, 다음 날 예약 실행 뒤 10월 월세가 2건이 됩니다.
  - `/my/recurring/save`와 `from-candidate`는 1건입니다.
- **영향:** 홈 '정기 수입·지출' 카드와 예산 탭의 추가 폼이 이 경로입니다. 이번 달 월세를 적은 뒤 정기로 등록하는 흔한 순서에서 이번 달 지출이 두 배가 됩니다.
- **고치는 방향:** id 없는 새 규칙을 저장할 때는 경로와 상관없이 `markRecurringAppliedIfRecordedThisMonth`를 부릅니다.

### D-4 ★ 예산이 권하는 시작 분류 '식비'·'교통'을 자동분류가 만들지 않아 예산 사용액이 늘 적게 나옴 (영역 판정 P2 → P1)
- **위치:**
  - 시작 행: `admin/budget-center-recurring.js:87`, `my/settings-page.js:342`
  - 카카오 '예산 설정' 버튼: `kakao/guided-flow-state.js:128`
  - 집계: `domain/budgets.js:155`. 분류 이름이 정확히 같아야 셉니다.
  - 쓰이지 않는 `nlu/category-rules.js:56` LEGACY_CATEGORY_SPLITS
- **재현:** `D-web-domain/settings/s4-starter-budget-vs-classifier.mjs`
  - 시작 분류는 `식비, 교통, 생활용품, 보험, 카페/간식`입니다.
  - 자동분류는 점심을 외식, 장보기를 장보기, 배달을 배달, 택시를 택시, 주유를 주유/충전으로 나눕니다.
  - 예산 화면은 "식비 예산 300,000원 사용 0원"입니다.
  - 홈은 오늘 쓴 돈이 162,000원인데 "예산 사용률 3%"입니다.
- **영향:**
  - 권하는 대로 예산을 잡은 모든 가계부에서 홈 대표 숫자, 사용률, 초과 알림이 실제보다 적게 나옵니다.
  - V22.9.15에 분류가 30개로 바뀐 뒤 계속됐고, 지난달 예산 복사로 다음 달에도 이어집니다.
  - 카카오 '카테고리별 예산'의 첫 바로가기와 키워드 안내 문구("커피→식비, 주유→교통")도 옛 분류입니다(A 영역 겹침).
- **고치는 방향:** 시작 행·버튼·안내를 30개 분류 이름으로 바꾸거나, 예산 집계에서 옛 상위 이름(식비·교통)을 하위 분류로 펼칩니다. 기존 '식비' 예산 행을 어떻게 다룰지는 정해야 합니다.

### A-01 ★ '만두'·'천원샵'·수량('30 구', '아이폰 15')이 금액으로 읽혀 유령 기록이 생김
- **위치:**
  - `client/shared-input-parsers.js:14-29`(moneyTokenSpans): 한글 숫자 글자만으로 된 낱말과 띄어 쓴 단위 없는 수를 금액 후보로 둡니다.
  - `nlu/transaction-parser.js:72-90`: 후보가 둘이면 두 건으로 나눕니다.
- **재현:** `A-kakao-nlu/A01-phantom-amount.mjs`
  - "점심 만두 5000" → 2건(10,002원 + 5,000원)
  - "천원샵 5000" → 1,000원 + 5,000원
  - "계란 30 구 9000" → 30원 + 9,000원
  - "아이폰 15 케이스 20000" → 15원 + 20,000원
  - 웹 빠른 입력 금액칸도 `parseMobileAmountText("만두 5000")`이 10002입니다.
- **고치는 방향:**
  - 한글 숫자만으로 된 토큰은 '원'이 붙었거나 금액 문맥일 때만 받습니다.
  - 단위 없는 작은 수 뒤에 명사가 오면 수량으로 봅니다.
  - 후보가 애매하면 나누지 말고 묻습니다.

### A-02 ★ 수입 낱말이 지출로 저장됨 — 봇이 안내하는 '입력 예시'의 "부수입 30000원"도
- **위치:** `client/shared-input-parsers.js:56`(transactionTypeFromText)의 수입 목록이 `nlu/category-rules.js:8-12` CATEGORY_RULES의 수입 낱말과 다릅니다.
- **재현:** `A-kakao-nlu/A02-income-as-expense.mjs`
  - '입력 예시'에 나오는 "부수입 30000원" → 지출(메모 '부')
  - 알바비·상여금·성과급 → 지출
  - 예금이자·주식배당 → 지출(저축/투자)
  - 강의료 → 지출(의료/병원)
- **고치는 방향:** 구분 판정을 CATEGORY_RULES 수입 낱말에서 만듭니다. '입력 예시'의 모든 문장을 회귀 검사에 넣습니다.

### A-03 환불·취소 문장이 새 지출로 저장됨
- **위치:** `client/shared-input-parsers.js:50-52`. '환불'은 바로 뒤에 숫자가 오거나 문장 끝일 때만 수입으로 보고, '취소'는 판정에 아예 없습니다.
- **재현:** `A03-refund-cancel.mjs`
  - "쿠팡 환불 완료 34000", "환불됨 35000", "환불금 31000", "결제 취소 36000", 카드 '승인취소' 문자 → 모두 지출
  - 대조군: "환불 32000" → 수입
- **영향:** 환불받은 만큼 지출이 한 번 더 더해집니다.
- **고치는 방향:** 환불 뒤에 완료·됨·금·처리·입금이 붙은 말과 반품은 수입(환급)으로 봅니다. 결제·승인 취소는 저장 전에 확인합니다.

### A-04 ★ '메뉴'·'기능'이 든 거래가 도움말로 바뀌고 저장되지 않음
- **위치:**
  - `kakao/skill-handler.js:354`: `if (isHelpCommand(utterance))`에만 `!strongTransactionInput` 조건이 없습니다.
  - `kakao/intent-nlu.js:45·170-171`: 부분 문자열로 맞춥니다.
- **재현:** `A04-help-hijack.mjs`
  - "스타벅스 신메뉴 6500", "건강기능식품 35000", "점심 메뉴 12000", "기능성 티셔츠 30000"
  - 결과: 모두 저장 0건이고, 답장은 "📒 말해가계부 사용법"입니다.
- **고치는 방향:** 354행에 `!strongTransactionInput &&`를 붙이거나, 도움말은 짧은 명령과 정확히 같을 때만 받습니다.

### A-05 붙여 쓴 날짜 말('어제저녁'·'어젯밤')과 '10-3'이 오늘로 저장됨
- **위치:**
  - `client/shared-input-parsers.js:74·96·124`
  - `nlu/date-payment.js:102-112`: 날짜를 못 읽으면 오늘로 채웁니다.
  - `nlu/category-rules.js:124-129`
- **재현:** `A05-date-words.mjs`
  - "어제저녁 치킨 20000", "어젯밤 치킨 21000", "어제점심 김밥 5000", "엊그저께 커피 4800"(메모 '엊 커피'), "10-3 마트 52400" → 모두 10-14
  - 대조군: "어제 저녁 치킨" → 10-13
- **고치는 방향:** 어제·그제·오늘 뒤에 붙는 아침·점심·저녁·밤·새벽·오전·오후를 받습니다. 어젯밤·엊저녁·엊그저께와 M-D 형식도 받습니다.

### A-06 지출이 수입으로 저장됨: 배우자 용돈, '받은'이 든 지출, 적금 입금
- **위치:** `client/shared-input-parsers.js:52·55·56`
- **재현:** `A06-expense-as-income.mjs`
  - "남편 용돈 30만원", "와이프 용돈 20만원", "용돈 지급 10만원", "배달 받은 치킨 20000", "적금 입금 50만원" → 모두 수입
- **고치는 방향:**
  - 배우자 호칭과 지급·이체·송금 같은 주는 말을 지출 쪽에 넣습니다.
  - '받은'은 돈이 주어일 때만 수입으로 봅니다.
  - 적금·예금과 입금이 함께 오면 저축/투자 지출로 봅니다.

### F-1 ★ 웹 빠른 입력을 '시트'로 열면 한 줄 문장의 날짜("어제", "7월 3일")를 버리고 오늘로 저장
- **위치:**
  - `client/v5-bundle-mains.js:508-524`: 시트를 열 때 날짜 칸에 `change`를 보냅니다.
  - `client/shared-input-parsers.js:194-198`: 이 이벤트를 직접 고침으로 세어 `quick_manual_date=1`을 둡니다.
  - `admin/transactions-households.js:231-234`: 이 값이면 문장 날짜 대조와 없는 날짜 거절을 건너뜁니다.
- **재현:** `F-crawl-ui/forms/quick-sheet-date.mjs`(헤드리스 Chrome)
  - 모바일 하단 ＋ 시트에서 "어제 택시 13800 현대카드" → 07-15(오늘)로 저장
  - "7월 3일 약국 8200" → 07-15
  - 없는 날짜 "2월 30일 문구 2300"도 거절되지 않고 07-15로 저장
  - 데스크톱 '빠른 입력' 시트에서 "어제 주차 4000" → 07-15
  - 대조군: 시트를 열지 않은 인라인 입력은 07-14로 저장
- **영향:** 지난 기록을 이 경로로 적는 모든 사용자에게 생깁니다: 모바일 하단 ＋, 다른 화면의 ＋(`/app?quick=1#quick`), 데스크톱 '빠른 입력'. V22.9.33 B04의 회귀입니다.
- **고치는 방향:** 사용자가 고른 날짜(일별 시트, 주소의 date)일 때만 직접 고침으로 표시합니다. 또는 `event.isTrusted`인 입력만 직접 고침으로 셉니다.

## 3. P2

각 항목은 제목, 위치, 재현, 고치는 방향 순서입니다.

### 카카오 해석 (A)

- **A-07 띄어 쓴 한글 금액 '만 오천원'이 두 건으로 나뉨**
  - 위치: `client/shared-input-parsers.js:14`, `nlu/transaction-parser.js:72-90`
  - 재현: `A07-numeral-space.mjs`. "택시 만 오천원" → 10,000원 + 기타지출 5,000원
  - 고치는 방향: 만·억 뒤에 오는 작은 단위를 한 금액으로 합칩니다.
- **A-08 분수·띄어 쓴 소수가 날짜로도 읽힘**
  - 위치: `shared-input-parsers.js:96·13`
  - 재현: `A08-fraction-date.mjs`. "주유 1.5 만원" → 2026-01-05, "회식 1/4 25000" → 01-04
  - 고치는 방향: 금액으로 쓴 토큰은 날짜 후보에서 뺍니다.
- **A-09 대표 명령 '기록 방법'이 "이해하지 못했어요"로 답함**
  - 위치: `kakao/request-guards.js:45-46`(stripLeadingCommand가 '기록 '을 떼고 '방법'만 남김), `kakao/simple-commands.js:92`
  - 재현: `A09-record-guide.mjs`. 가계부 선택 뒤의 첫 바로가기가 1:1과 단톡방 모두에서 오류처럼 답함
  - 고치는 방향: 명령 판정을 먼저 합니다.
- **A-10 낱말 속 글자가 분류를 정함**
  - 위치: `nlu/category-rules.js:101-120`(부분 문자열로 맞춤)
  - 재현: `A10-category-substring.mjs`
    - "커피 4500 농협카드" → 장보기
    - "아이패드" → 육아/자녀
    - "수술비"·"미술학원" → 외식
    - "전기차 충전" → 공과금
  - 고치는 방향: 결제수단 원문은 분류 입력에서 빼고, 짧은 낱말은 낱말 경계로 맞춥니다.
- **A-11 '정기지출' 안내의 입력 예시를 보내면 오늘 지출로 저장**
  - 위치: `kakao/reply-texts.js:318-328`
  - 재현: `A11-reserve-guide.mjs`. "자동차보험 120만원 8월" → 오늘 날짜 1,200,000원 지출
  - 고치는 방향: 안내를 웹 화면으로 바꾸거나 저장 전에 확인합니다.
- **A-12 '31일'처럼 일만 쓴 날짜가 이달의 미래 날짜로 저장**
  - 위치: `shared-input-parsers.js:102-103`
  - 재현: `A12-day-only.mjs`. 2027-01-01에 "31일 송년회" → 2027-01-31
  - 고치는 방향: 오늘보다 뒤면 지난달로 보거나 묻습니다.

### 카카오 흐름 (B)

- **B-3 수정 메뉴 5분 뒤 "금액 13000"이 새 지출 '금액 13,000원'으로 저장**
  - 위치: `kakao/edit-flow-v4.js:266-270`. 만료 세션은 일반 기록 경로로 가고, `edit-state-machine.js:321-329`의 expiredReply가 쓰이지 않습니다.
  - 재현: `h2-expired-session-value.mjs`
  - 고치는 방향: 만료 세션에 수정 문법이 오면 만료 안내로 답합니다.
- **B-4 열린 수정 세션이 조회 명령을 '내용 변경'으로 삼킴**
  - 위치: `skill-handler.js:280-286`, `edit-flow-v4.js:263-280·448-453`, `edit-state-machine.js:163-168`
  - 재현:
    - `h1d-deferred-edit-session.mjs`: "오늘 기록 보기"를 보내면 "내용을 '오늘 기록 보기'로 바꾸는 건가요?"라고 묻습니다.
    - `h4-group-permissions.mjs`: 구성원의 "지출자 변경"이 반드시 거절될 세션을 열고, 그 세션이 다음 예산 명령들을 삼킵니다.
  - 고치는 방향: 세션 중에도 목록·요약·도움말·전환 명령은 세션을 비켜 가게 합니다. 지출자 분기에서는 권한부터 확인합니다.
- **B-5 단톡방 요약·정산의 사람별 합계가 이름 기준이라 '카카오사용자' 한 줄로 합쳐짐**
  - 위치: `kakao/household-budget-commands.js:536`, `kakao/identity-chat-first.js:77-83`
  - 재현: `h4-room-names-summary.mjs`. 세 사람이 30,000·5,000·1,000원을 쓰면 "카카오사용자: 36,000원" 한 줄이 되고, 송금 제안은 "카카오사용자 → 카카오사용자"입니다.
  - 고치는 방향: user_id로 모으고 겹치는 이름은 구분합니다.
- **B-6 appUserId·plusfriendUserKey가 실린 요청마다 전역 식별 잠금을 잡음**
  - 위치: `domain/users-households.js:26-35`, `kakao/identity-chat-first.js:109-151`
  - 재현:
    - `h6b-identity-lease.mjs`: 두 사용자가 동시에 보내면 8건 중 4건이 저장되지 않고 일반 폴백이 나갑니다.
    - `h7-identity-depth.mjs`: 666ms·DB 12회이던 기록이 1,195ms·DB 17회가 됩니다.
  - 고치는 방향: 별칭이 이미 연결돼 있으면 잠금 없이 건너뜁니다.
  - 미확인: 운영 payload에 이 키들이 실리는지.
- **B-7 웹(카카오 로그인)으로 먼저 가입한 사용자가 appUserId를 실어 채팅하면 다른 계정이 생김**
  - 위치: `kakao/identity-chat-first.js:52-65·77-83`, `domain/users-households.js:38-45`, `auth/identity-reauth.js:296-320`
  - 재현:
    - `h7-applink.mjs`: 이름이 "2265"인 새 사용자가 생기고, `links["kakao_login:2265"]`가 새 사용자를 가리킵니다.
    - `h7-applink-weblogin.mjs`: 옛 계정의 웹 로그인이 새 채팅 계정으로 바뀝니다.
  - 고치는 방향: appUserId로 강한 식별을 먼저 찾고, appUserId를 표시 이름으로 쓰지 않습니다.
  - 미확인: 봇 채널과 로그인 앱의 연결 여부.
- **B-11 ★ 수정 세션의 '내용' 단계에 숫자가 든 메모를 보내면, 메모는 바뀌지 않고 유령 지출이 여러 건 저장** (G 영역 부수 관찰)
  - 재현: `G-ops-limits/C/edit-memo-digits-sideobs.mjs`
    - "수정 01번" → "내용" → "엄마한테 빌린 돈 010-1234-5678 계좌 110-123-456789"
    - 답장은 "01번 수정은 끝내고, 보낸 내용을 새 기록으로 처리했어요"입니다.
    - 110원·123원·456,789원 지출 3건(합계 457,022원)이 새로 저장되고, 01번 메모는 그대로입니다.
  - 고치는 방향: 내용 단계에서는 입력 전체를 메모 값으로 받습니다. A-01과 함께 하이픈으로 이어진 숫자열은 금액 후보에서 뺍니다.

### 금액·날짜·집계 (D)

- **D-3 미래 날짜 기록이 '오늘까지' 비교·하루 평균·월말 예상에 섞여 거짓 '월말 초과 예상'이 뜸**
  - 위치: `my/mobile-home.js:620·441·159-168`, `my/analysis-page.js:28-41`, `domain/analytics.js:152·206-212`, `client/insight-main.js:285-307`, `features/budget-alerts-annual-goals.js:31·41`, `kakao/household-budget-commands.js:445`
  - 재현: `t2-future.mjs`. 10/3에 25일 관리비 18만 원을 반영하면:
    - 홈: "지난달 1~3일보다 170,000원 더"
    - 종합 리포트: "+567%", "하루 평균 66,667원", "월말 예상 2,066,667원"
    - 예산 알림: "1,566,667원 초과 예상"
    - /reports만 "10,000원 덜 썼어요"로 맞습니다.
  - 고치는 방향: 현재 달 계산은 오늘까지만 쓰고, 예정분은 따로 보입니다.
- **D-5 정산이 환불(환급 수입·음수 지출)을 빼지 않아 송금 방향과 금액이 틀림**
  - 위치: `features/settlement-ops-pages.js:87·89`, `kakao/simple-commands.js:53`
  - 재현: `money/m1-settlement.mjs`. 기대는 Bin → WIFI 20,000원인데, 실제는 WIFI → Bin 30,000원입니다.
  - 고치는 방향: 환급은 그 사람이 낸 금액과 총액에서 뺍니다.
- **D-6 ★ 같은 이름의 가계부가 둘이면, 카카오에서 이름으로 고를 때 묻지 않고 첫 번째를 골라 다른 가계부에 저장**
  - 위치: `kakao/household-budget-commands.js:89-99`(`rows.find`), `my/households-lifecycle.js:297-319`(이름 바꾸기는 중복 허용)
  - 재현: `lifecycle/l4c-same-name-other-owner.mjs`. 내 '우리집 생활비' 대신 부모님 소유의 같은 이름 가계부가 선택되고, "커피 4500"이 그쪽에 저장됩니다. 답장은 "가계부: 우리집 생활비"라서 구분할 수 없습니다.
  - 고치는 방향: 여럿과 맞으면 번호로 묻고, 확인 문구에 역할과 소유자를 붙입니다.
- **D-7 'N월 요약'·'N월 D일 요약'을 연도 없이 보내면 늘 올해로 읽음**
  - 위치: `kakao/household-budget-commands.js:449-457`
  - 재현:
    - `t4b-kakao-yearless.mjs`: 2027-01-05에 "12월 요약"을 보내면 0원입니다. 같은 제목으로 답하는 "지난달 요약"은 30,000원입니다.
    - 같은 원인으로 12월에 보낸 "1월 식비 예산 30만원"은 지난 1월에 저장됩니다(A `X-D7-year-month.mjs`).
  - 고치는 방향: 오늘보다 뒤면 작년으로 보고, 제목에 연도를 붙입니다.
- **D-8 자산 '잔액 저장'이 '자산 합계에 포함' 해제를 되돌림**
  - 위치: `settings/payment-assets.js:382·535-541`
  - 재현: `settings/s2-asset-balance-reinclude.mjs`. 전세보증금 3억이 순자산에 다시 들어가 5,200,000원이 315,200,000원이 됩니다.
  - 고치는 방향: patch에 그 칸이 없으면 기존 값을 그대로 둡니다.
- **D-9 키워드 편집기의 일부 분류 카드는 저장해도 쓰이지 않고, 수입 분류 카드는 카카오에서 지출/급여로 저장**
  - 위치: `settings/categories-keywords.js:114·236-253`, `admin/category-guide-pages.js:27-44`
  - 재현: `settings/s1-keyword-unused.mjs`
    - 통신 '헬로모바일', 교육/육아, 용돈 카드 → 기타지출
    - 급여 '에이전시입금' → 카카오에서 expense/급여
  - 고치는 방향: 카드를 실제 분류 체계에서 만들고, 수입 분류는 `income::` 키로 저장한 뒤 분류할 때 읽습니다.
- **D-10 새 달에 지난달 몫을 따라잡을 때 규칙의 지금 상태를 씀**
  - 위치: `cron/recurring-auto-apply.js:115-116·70-84`
  - 재현: `recurring/r6-*`, `recurring/r6b-*`
    - 11/1에 만든 규칙이 10월 15일 자로 기록됩니다.
    - 11/1에 70만 원으로 바꾼 월세가 10월분도 70만 원으로 기록됩니다.
  - 고치는 방향: 생성 월보다 앞선 달은 건너뛰고, 금액 변경은 다음 반영부터 씁니다.
- **D-11 지난달 화면의 "이번 달 고정지출 기록하기"가 보고 있는 달에 기록**
  - 위치: `settings/reserve-plans.js:387`, `admin/budget-center-recurring.js:255-303`
  - 재현: `recurring/r7-past-month-apply-label.mjs`. 10/20에 9월 화면에서 누르면, 10월에 만든 규칙이 2026-09-15 자로 기록됩니다.
  - 고치는 방향: 문구에 대상 월을 적고, 이번 달이 아니면 한 번 더 확인을 받습니다.

### 가져오기·백업 (E)

- **E-1 가져오기 해석 CPU가 행당 약 3ms: 120행 미리보기에 약 400ms (Free 한도는 10ms)**
  - 위치: `import/flexible-import-parser.js:135-154·244-253·268-271`
  - 재현: `e07-cpu-wall.mjs`, `e07b-parse-profile.mjs`
    - 120행 380~420ms, 1,000행 약 3.1초
    - 시간의 57.5%가 `normalizeImportHeader`, 14.5%가 `nowKstDate`(매번 Intl.DateTimeFormat을 새로 만듦)입니다.
  - 고치는 방향: 정규화한 별칭 Map을 한 번만 만들고, 현재 연도는 한 번만 구하고, 한도와 여유분까지만 해석합니다.
  - 미확인: 운영에서 1102로 실패하는지.
- **E-2 은행 통장식 금액 제목(찾으신금액·맡기신금액·지급(원))을 못 알아봄**
  - 위치: `flexible-import-parser.js:99-112·167-185`
  - 재현: `e02-bank-headers.mjs`. 0건이 되거나, 출금 행이 모두 "금액 형식 오류"가 됩니다.
  - 고치는 방향: 별칭에 지급·지급액·찾으신금액·맡기신금액을 넣습니다.
- **E-3 음수 표기 변형(−·₩-·△·▲)의 부호를 잃어 취소·환불이 지출로 저장**
  - 위치: `flexible-import-parser.js:357-368`
  - 재현: `e01-parser-matrix.mjs` §1
  - 고치는 방향: NFKC 정규화 뒤 이 기호들을 음수로 봅니다.
- **E-4 연도 없는 날짜를 1월에 가져오면 지난 12월 거래가 올해 12월(미래)로 저장**
  - 위치: `flexible-import-parser.js:489-490`, `nlu/date-payment.js:48-53`, `my/backup-import.js:405`
  - 재현: `e08-yearless-dates.mjs`. 2027-01-05에 `12/28`을 가져오면 2027-12-28이 됩니다. 웹·카카오는 같은 날짜를 2026-12-28로 읽습니다.
  - 고치는 방향: 웹·카카오와 같은 183일 규칙을 씁니다.
- **E-5 중복 판정이 다대일: DB의 1건이 파일 속 같은 거래 2건을 모두 '중복'으로 뺌**
  - 위치: `my/backup-import.js:208-211·419-426·306-315`
  - 재현: `e04-import-flow.mjs` §B
  - 고치는 방향: 키별 개수로 비교합니다.
- **E-6 120행 한도가 중복 제외보다 먼저라 121행부터는 같은 파일로 영영 못 가져옴(안내는 env 이름)**
  - 위치: `my/backup-import.js:406-413`, `flexible-import-parser.js:130`
  - 재현: `e04` §C. 300행 파일을 두 번째로 올리면 후보가 0건입니다.
  - 고치는 방향: 중복을 먼저 빼고 다음 120행으로 이어 가게 합니다. 안내에서 env 이름을 뺍니다.
- **E-7 관리자 JSON 백업 복원이 같은 날 같은 거래 2건 중 1건을 영구히 빠뜨림**
  - 위치: `admin/backup-apply.js:314-321·132-149`, `admin/backup-compare.js:265-268`
  - 재현: `e10-admin-backup-restore.mjs`
  - 고치는 방향: 개수 기반이나 백업 id 기반으로 비교합니다.
- **E-8 관리자 가져오기(/admin/import/json)의 1,000행 초과분 누락과 재시도 중복**
  - 1,000행을 넘는 부분을 조용히 버립니다.
  - 응답이 유실되면 "변경되지 않았다"고 안내해, 재시도하면 중복 저장됩니다.
  - 위치: `flexible-import-parser.js:65-79`
  - 재현: `e09-admin-import-json.mjs`
  - 고치는 방향: 결정적 id와 `isUncertainStorageWrite` 분기를 두고, 초과분은 거절합니다.

### 웹 입력 (F)

- **F-2 내용만 적으면 '분류 자동추천' 칸이 비고, 미리보기 안내와 달리 예산 분류로 저장**
  - 미리보기는 "예산 밖 분류로 저장합니다"라고 안내하지만 실제로는 예산 분류로 저장됩니다.
  - 위치: `client/shared-input-parsers.js:159-170·194-198`, 서버 `admin/transactions-households.js:260`
  - 재현: `F-crawl-ui/autocomplete/memo-only-preview.mjs`. 내용에 "스타벅스"만 적으면 분류 칸은 비어 있고 "예산 밖 분류로 저장합니다"라고 나오는데, 실제로는 카페/간식으로 저장됩니다.
  - 외부 QA의 "자동완성이 동작하지 않았고"와 가장 잘 맞는 증상입니다.
  - 고치는 방향: 내용 칸에 입력할 때도 분류를 채우고, 미리보기는 그 값으로 판정합니다.

### 운영 한계·관제·배포 도구 (G)

**측정 기준**
- Workers Free의 subrequest 한도는 요청당 50입니다(https://developers.cloudflare.com/workers/platform/limits/).
- service binding 호출도 이 한도에 들어갑니다.
- `waitUntil` 안의 fetch도 같은 요청으로 보고 합산했습니다. 앱의 `__AB_DB_BUDGET` 50(`data/supabase-client.js:27-29`)도 같은 전제입니다.

**50을 넘는 경로:** G-2뿐입니다.

**한도에 가까운 경로(결함 아님):**
- 새 사용자의 1:1 첫 메시지: 48회 + 관제 1회 = 49회
- 새 단톡방 첫 기록: 45회
- 4만 건 백업·전 기간 검색: 46회

**운영 설정 근거:** 배포 기록 `output/deploy/V22.9.44-*/live-*.json`.
- 확인한 값: `KAKAO_SKILL_AUTH_REQUIRED=1`, `NLU_METRICS_ENABLED=1`, `NLU_PERSIST_FAILURE_SAMPLES=0`
- 없는 값: `CRON_SECRET`, `MY_IMPORT_LIMIT`(그래서 운영 가져오기 한도는 120행)

**결함**
- **G-1 ★ 분류 표 404가 'DB 실패 표본'으로 쌓여 관제의 '최근 처리 실패 기록' 경고가 꺼지지 않음**
  - 상태: V22.9.45에서 고침. 명시한 선택 분류 표 GET의 404/PGRST205만 DB 실패 집계에서 제외하며 실제 오류는 유지합니다.
  - 위치:
    - `kakao/transaction-save.js:143`, `settings/categories-keywords.js:382`
    - `data/supabase-client.js:48-65`: 실패한 호출마다 `db_failures += 1`
    - `runtime/ops-monitor.js:35-43`
    - `monitoring/worker.mjs:249·338`
  - 재현: `G-ops-limits/main/monitor-false-incident.mjs`
    - 정상 카카오 저장(200)과 `/app`(200)이 `db_failures=1 kind=incident`로 관제에 갑니다.
    - 그래서 요약이 "[warning] 최근 처리 실패 기록"을 띄웁니다.
  - 영향:
    - 24시간 안에 카카오 기록이 한 건만 있어도 경고가 켜집니다.
    - 주의 메일이 24시간마다 다시 오고, 해소 메일은 오지 않습니다. 진짜 실패가 이 소음에 묻힙니다.
    - 요청마다 관제 전송 subrequest가 1회씩 늘어납니다.
  - 고치는 방향: 선택 표의 PGRST205/404는 계측 실패에서 뺍니다. 또는 표가 없다는 것을 한 번 확인한 뒤 조회 자체를 건너뜁니다.
- **G-2 단톡방 2개 이상에 연결된 가계부를 지우면 subrequest 51회로 예산을 다 써, 잠금 해제와 연결 정리가 빠진 채 "삭제됨"으로 끝남**
  - 위치: `my/households-lifecycle.js:330-414·419`
  - 재현: `main/subreq-household-delete-http.mjs`, `main/household-delete-after.mjs`
    - 연결된 방이 0개면 26회, 1개면 40회, 2개 이상이면 51회입니다.
    - 삭제 뒤 잠금 2개(약 90초)와 삭제된 가계부를 가리키는 연결 행이 남습니다.
    - 그 방에서 기록하면 "처리 중이에요"라고 답합니다.
  - 고치는 방향: 방 임대와 연결 정리를 한 번의 호출로 묶습니다. 또는 정리용 예산을 남겨 두고, 모자라면 다음 요청이나 cron으로 넘깁니다.
- **G-3 경고가 임계값 근처에서 깜빡이면 '같은 경고 6·24시간 안 재발송 안 함' 약속이 깨짐**
  - 위치: `monitoring/worker.mjs:345-375·294`. 해소될 때 기억 행을 지워, 다시 생기면 새 경고로 봅니다.
  - 재현: `A/monitor-flap.mjs`
    - `/ready`가 5분마다 실패와 성공을 오가면 1시간에 메일 12건이 갑니다.
    - DB CPU가 86%와 84%를 오가면 1시간에 6건이 갑니다.
  - 고치는 방향: 해소된 뒤에도 마지막 발송 시각을 보존하고, 해소는 여러 번 연속 정상일 때만 판정합니다.
- **G-4 배포 스크립트 `--promote`가 업로드 뒤에 바뀐 현재 배포를 확인하지 않아, 그사이 교체한 Secret을 옛 값으로 되돌림**
  - 위치: `tools/deploy-worker-version.mjs:444-470`. 업로드 단계에는 같은 확인이 있습니다(`:186-189`).
  - 재현: `A/deploy-promote-secret-revert.mjs`(가짜 API). 업로드 뒤 대시보드에서 `KAKAO_SKILL_SECRET`을 바꾸면, 승격 결과 Secret이 옛 값이 됩니다.
  - 영향: 스킬 Secret이 되돌아가면 enforce 모드에서 카카오 전체가 403이 됩니다.
  - 고치는 방향: 승격 시점의 현재 배포가 업로드 기록과 다르면 승격을 거절합니다.
- **G-5 '처리 중'으로 먼저 답한 뒤 저장이 실패해도 관제에 실패가 남지 않음** (B-1과 짝)
  - 위치: `runtime/ops-monitor.js:35-56`, `monitoring/model.mjs:104-111`. outcome 목록에 "deferred"가 없어 unknown으로 저장됩니다.
  - 재현: `A/deferred-telemetry.mjs`. 거래 저장 503, 저장 0건인데 관제 값은 `outcome=deferred db_failures=0`입니다.
  - 고치는 방향: waitUntil 작업이 끝날 때 결과 표본을 하나 더 보냅니다. 관제에 "deferred"를 추가합니다.
- **G-6 관제 cron의 `summary()`가 CPU 약 8.7ms를 써 Free Cron 한도 10ms에 붙음**
  - 위치: `monitoring/worker.mjs` `summary()`. 7일치 표본 2,016행과 telemetry 1,000행을 5분마다 해석·정렬합니다.
  - 재현: `A/monitor-summary-cpu.mjs`(200회 평균 8.68ms)
  - 영향: 7일치가 차는 10-19쯤부터 1102로 끊기면 수집과 알림이 함께 멈춥니다. 그 사실을 알릴 길도 없습니다(G-10).
  - 고치는 방향: 일 단위 요약을 미리 계산해 둡니다. 또는 관제만 Paid로 옮깁니다.
- **G-7 카카오 수정 흐름이 인식하지 못한 입력의 원문과 사용자 키를 기한 없이 저장(개인정보 안내와 다름)**
  - 위치: `kakao/edit-flow-v4.js:77`(`logKakaoEditTelemetryV4`), `public/content-pages.js:62-64`, `runtime/ops-telemetry.js:206-212`
  - 재현: `C/unrecognized-inputs-raw.mjs`. `unrecognized_inputs`에 `{"user_id":"kakao_login:2265","input":"… 엄마 전화번호 공일공 김민지 강남구 역삼동"}` 같은 행이 남습니다.
  - 기대 vs 실제: 운영은 `NLU_PERSIST_FAILURE_SAMPLES=0`이고, /privacy는 원문을 저장하지 않는다고 안내합니다. 실제로는 원문 300자를 저장합니다.
  - 영향: 운영 표에 이미 쌓여 있을 수 있습니다. 확인 조회: `select count(*), min(created_at) from unrecognized_inputs`.
  - 고치는 방향: NLU 스위치를 따르게 합니다. 원문은 가리고 사용자 키는 지문으로 바꾸며, 보존 정리 대상에 넣습니다.
- **G-8 스킬 Secret이 비었거나 observe 모드이면 `/skill` 인증이 꺼짐(`KAKAO_SKILL_AUTH_REQUIRED=1`은 `/ready`에만 영향)**
  - 위치: `auth/crypto-admin-session.js:162·174`, `runtime/config-readiness.js:23-29`
  - 재현: `C/skill-auth-failopen.mjs`
    - Secret이 비면 `/ready`는 503인데, 헤더 없는 `/skill`이 가계부 목록을 돌려줍니다.
    - observe 모드이면 `/ready`는 200이고 틀린 헤더도 통과합니다.
  - 영향: 지금 운영에는 노출이 없습니다(Secret 있음). 하지만 KNOWN-ISSUES:311의 "observe 한 줄로 복구"를 켠 채 잊으면, botUserKey만 알아도 다른 사용자로 행세할 수 있습니다.
  - 고치는 방향: REQUIRED=1이면 두 경우 모두 403으로 막거나, `/ready`를 503으로 만들고 관제가 경고하게 합니다.
- **G-9 monitoring/README가 관제를 끄려면 앱을 V22.9.21 백업으로 복구하라고 안내**
  - 위치: `monitoring/README.md:98-99`(8단계 `:57`도 배포 스크립트를 우회)
  - 재현: `B/check-monitor-readme-rollback.mjs`
  - 영향: 문서대로 하면 23판 전 코드로 돌아가 V22.9.34~43의 보안·저장 수정이 사라집니다. 실제로는 binding이나 토큰만 빼면 됩니다.
  - 고치는 방향: "binding 삭제 또는 Secret 비움"만 남기고, 8단계는 배포 스크립트 기준으로 다시 씁니다.

## 4. P3 (한 줄씩)

- A-13 기간을 못 읽은 요약('저번달 요약', '그제 요약', '9월 지출 현황')에 이번 달로 답함 — `household-budget-commands.js:430-464`
- A-14 '오늘 기록 보기'가 오래된 것부터 20건에서 끊기고, 950자에서 줄 중간이 잘림 — `edit-flow-v4.js:363`, `response-builders.js:31-35`
- A-15 메모가 낱말 안에서 잘림(주차장 사용료→'주차장 료', 공동구매→'공동', 원정→'원') — `category-rules.js:124-131`, `amount-parser.js:10-11`
- A-16 전각 숫자 금액을 못 읽음. "1+1 우유 3000"·"생수 2 박스" 같은 수량은 1원·2원으로 읽혀 거절됨 — `shared-input-parsers.js:14`
- A-17 단톡방 글 선택지가 5개로 잘려 '직접 입력'과 '취소'가 사라짐 — `response-builders.js:137-146`
- A-18 '오늘 뭐 썼어'가 날짜와 상관없는 최근 5건을 보여 줌 — `simple-commands.js:84`, `edit-session-v4.js:240-247`
- B-8 '복구' 잠금 충돌 때 "다시 ‘복구’를 입력"하라고 안내함. 따르면 더 오래된 삭제 기록까지 되살아남 — `edit-flow-v4.js:403-414`, `request-guards.js:104`
- B-9 두 가계부에서 같은 번호를 지운 뒤 지금 가계부에서 '복구 01번'을 보내면 실패함 — `edit-flow-v4.js:376-380`
- B-10 단톡방 안내 문구가 실제 상태와 다름 — `skill-handler.js:477-479·504·527-529`, `household-budget-commands.js:143-158`
  - 연결 안 된 방이나 준비 중인 방의 조회 명령에 "방금 입력한 기록은 어디에도 저장하지 않았어요"라고 답함
  - 승인 대기 사용자에게 "관리자가 승인해야"라고 답함
- C-2 복귀 경로 검사가 정규화 전 문자열만 봐서 `/.//x`가 `//x`로 나갈 수 있음 — `admin/bulk-and-return-paths.js:117`, `auth/crypto-admin-session.js:299`. 코드 판독이며, 폼을 서버가 만들고 CSRF 검사가 있어 실제 위험은 낮음
- C-3 ★ `?msg=constructor`를 열면 "기록을 저장했습니다 function Object() { [native code] }"가 보임(`/app`, `/my/members`, `/my/settings`) — `kakao/reply-texts.js:79`, `my/reports-premium.js:596-597`
- D-12 예산 숫자 경계 표시 — `my/analysis-page.js:60-61`, `my/mobile-home.js:340`
  - 종합 리포트가 사용률을 160%에서 자름
  - 예산이 없으면 전체 지출을 '초과'로 보임
  - 홈 대표 숫자가 수입−지출(음수 가능)로 바뀜
- D-13 이전 값이 0원이면 증감률이 '+100%' — `domain/analytics.js:64-68`
- D-14 금액 줄임 표기가 단위를 넘김 — `my/analysis-page.js:83`
  - 하루 9,500~9,999원이 "10천", 99,995,000원이 "10000만"
  - 1조 이상이 "10020억"
- D-15 음수 금액이 "--12,000원"으로 보이고, 옛 음수·소수·미분류 행의 집계가 화면마다 다름 — `home-sections.js:262·268·340-342` 등
- D-16 홈 '주별' 탭이 요일별 합계를 보이고, 지난달 홈의 '쓰는 속도'가 오늘 기준임 — `mobile-home.js:214·223`, `home-sections.js:192-223`
- D-17 예산 알림 센터가 이미 반영된 정기지출을 '대기'로 다시 더하고, 초과·지난달에 "설정 필요"를 보임 — `features/budget-alerts-annual-goals.js:36·29`
- D-18 '하루 X원'이 홈(버림)과 예산 알림(반올림)에서 1원 다름 — `budget-alerts-annual-goals.js:29`, `mobile-home.js:149`
- D-19 예산 알림 센터가 카카오에 없는 명령(이번달예상·오늘예산)을 추천함. V22.9.37 D10 수정에서 빠진 곳 — `features/settlement-ops-pages.js:64`
- D-20 정산에서 조회 전용과 나간 사람이 1/N 부담자가 되고, 나간 사람은 모두 '이전 구성원'으로 같아짐 — `settlement-ops-pages.js:71-81·95·103·130`, `households-lifecycle.js:514`
- D-21 카카오 '정산'이 참여자 8명·송금 8건까지만 보이고 나머지를 알리지 않음 — `kakao/simple-commands.js:58·63`
- D-22 목표: 넘치게 모은 목표 때문에 전체 진행률이 100%로 보이고, 마감 지난 목표가 "남은 1개월"로 보임 — `api/user-api.js:487·497-502`, `client/v5-bundle-mains.js:81·105-108`
- D-23 '이번 달 나갈 정기지출'이 고른 달이 아니라 오늘 기준으로 계산됨 — `settings/reserve-plans.js:378-379·250`
- D-24 지운·나간 가계부를 기억한 채 열면 다른 가계부가 있어도 "열 수 있는 가계부가 없습니다"가 나옴 — `mobile-home.js:561-564`, `runtime/config-readiness.js:207-209`
- D-25 고정지출 추가를 두 번 보내면 규칙이 둘 생겨 다달이 두 번 기록되고, 목록 읽기에 실패하면 "등록된 항목 없음"이 나옴 — `admin/budget-center-recurring.js:214-220`, `domain/budgets.js:101-108`
- D-26 정기 항목 입력 검증 묶음 — `admin/budget-center-recurring.js:174-177`, `my/settings-page.js:186·193·225-245`, `cron/recurring-auto-apply.js:191`
  - 지정일 0·32·빈칸을 바꿔 넣고 성공으로 답함
  - 금액 '-5000'이 5,000원으로 저장됨
  - 없는 id를 지워도 성공으로 답함
  - 비활성 규칙이 활성과 구분되지 않음
  - cron의 `today` 값을 검증하지 않음
- D-27 운영·관리 화면의 역할·오류 안내 — `admin/ops-diagnostics-pages.js:228`, `domain/users-households.js:202-206`, `admin/transactions-households.js:675-689`
  - 관리자 역할 선택에 admin이 없어, '권한저장'을 누르면 승인 대기로 강등됨
  - 역할 조회가 503이면 "권한이 없습니다"로 답함
  - /my/members 이름 바꾸기가 500 안전모드로 떨어짐. `handleAdminMemberNickname`만 try/catch가 없음(C2 세부)
- D-28 KNOWN-ISSUES의 "29~31일 수동 반영 차단·RPC 28일 고정" 설명이 지금 동작과 다름(2026-10-08에 해소됨) — `KNOWN-ISSUES.md:145·151·542`
- E-9 Windows+Office의 Firefox에서 .csv를 올리면 "엑셀 변환 실패"로 거절됨 — `my/backup-import.js:387-390`
- E-10 시간 열이 날짜 열보다 앞에 있으면 모든 행이 "날짜 형식 오류"가 됨 — `flexible-import-parser.js:101·396`
- E-11 분류와 결제수단이 매핑 안 된 열의 값에 오염됨('스타벅스'→통신비, 결제수단 '일시불') — `flexible-import-parser.js:565·108`
- E-12 따옴표 없는 칸 안의 큰따옴표 하나(`TV 55"`)가 뒤 행들을 조용히 삼킴 — `flexible-import-parser.js:204-224`
- E-13 입력창에 남은 이전 내용이 새로 고른 CSV 파일을 조용히 덮음 — `my/backup-import.js:383-397`, `client/legacy-ui-runtime.js:1094-1097`
- E-14 미리보기의 '행 번호'가 원본 파일의 줄 번호와 다름 — `flexible-import-parser.js:218·222·621`
- E-15 백업 CSV 왕복에서 메모 앞에 `'`가 붙고, 결제수단 이름이 줄고, raw_text가 바뀜 — `import/csv-duplicates.js:14-19`, `flexible-import-parser.js:564`
- E-16 관리자 백업센터의 "전체 가계부 백업"이 선택한 한 달 치만 담음 — `admin/backup-compare.js:36-39·119`
- E-17 옛 관리자 가져오기 화면이 CSV를 UTF-8로만 읽어 CP949 파일이 깨짐 — `web/menu-and-guides.js:339`
- F-3 기록 수정 폼(전체 화면·홈 상세·일별 시트)의 분류·결제수단 칸에 제안 목록이 없음 — `my/home-sections.js:96`, `client/v5-bundle-mains.js:872`
- F-4 긴 가계부 이름·큰 금액·긴 표시 이름이 예산 알림 외 화면에서도 360·390px에서 넘침 — `assets/accountbook-shell-css.js:581` 등
  - /reports·/my/analysis·종합 리포트·/settlement-summary의 머리말
  - 결제수단 막대
  - 수정 폼의 지출자 select
- F-5 다크 모드 '챗봇 명령어'(/kakao-commands) 카드의 제목·설명이 배경과 같은 색(1.00:1) — `admin/meme-content-pages.js:156`
- F-6 구성원에게 보이는 본문의 '예산 설정' 링크가 403이고, 403 안내는 다른 화면 이야기를 함 — `my/settings-page.js:59`, `my/access-control.js:54-56`
- F-7 거래 검색 결과를 눌러도 그 기록으로 이동·강조하지 않음(`.v8-tx` 선택자 누락) — `client/nav-search-notif-mains.js:787`
- F-8 날짜 칩 '오늘·어제'는 기기 시계를 쓰고, 한 줄 입력과 서버는 KST를 씀 — `my/mobile-home.js:497`
- F-9 가입 서버 오류 뒤 로그인 이름과 표시 이름이 지워지고, 폼이 화면 아래 멀리 있음 — `auth/local-login-pages.js:154`
- F-10 관리자 백업 화면의 표시 결함 — `admin/backup-apply.js` 등
  - 다크 모드 경고의 대비가 1.05~1.08:1
  - `/backup/apply` 버튼이 오른쪽에서 잘림
  - 390px에서 표가 넘침
- G-10 관제 수집기가 실패해도(예: 토큰 불일치 401) 메일이 가지 않고, DB 용량 상태가 unknown으로 조용히 바뀜 — `monitoring/worker.mjs:345-350`
- G-11 cron 처리량이 문서보다 적음 — `cron/recurring-auto-apply.js:118-125·142`, `my/reports-premium.js:161·174-180·201`, `KNOWN-ISSUES.md:62`
  - 실측은 가계부 3개·구독 1개/일로, 문서의 가계부 5개·구독 2개보다 적음
  - 구독이 14개를 넘으면 리포트 대기열(`cron_report_cursor_v22930.scopes`)이 끝없이 늘어남
- G-12 `/ready`가 `users`·`accountbook_recurring`·`accountbook_budgets` 표를 확인하지 않음 — `runtime/config-readiness.js:31-49`
- G-13 코드가 부르는 RPC 3개(`accountbook_mutate_payment_assets_v2280`, `record_nlu_metric`, `record_nlu_failure_sample`)의 정의 SQL이 main에 없음. NLU RPC가 없으면 `/skill`마다 404가 나는데 `/ready`는 200 — `settings/payment-assets.js:272`, `runtime/ops-telemetry.js:164·182`
- G-14 `migrations/README.md`의 `/ready` 범위와 "코드가 의존하는 표" 목록이 틀림(없는 표 4개, 빠진 표 8개) — `migrations/README.md:42-60`
- G-15 필수 Secret 6개와 카카오 로그인·cron 변수 이름이 운영 문서 어디에도 없음. `/cron/*`이 `ADMIN_API_TOKEN` Bearer로도 통과한다는 사실도 문서에 없음 — `runtime/config-readiness.js:14-21`
- G-16 커밋된 운영 기록에 V22.9.44 배포가 없고, 배포 ID는 추적되지 않는 `output/`에만 있음(DEPLOYMENT_MATRIX·CHANGELOG·README·RELEASE-CHECKLIST는 V22.9.43 기준)
  - 상태: V22.9.45에서 고침. 문서 네 개에 운영 ID·시각을 기록하고 output/을 Git 제외 목록에 넣었습니다.
- G-17 README의 "현재 릴리스 적용" 절이 V22.9.21의 붙여넣기 배포와 옛 `--version`을 안내함. SQLite 검사 수도 45개로 적혀 있음(실제 84개) — `README.md:1-3·92-97·279-283`
- G-18 저장소 스킬과 AGENTS.md의 검증 지시가 실제와 다름(이미 알려진 902/34 외) — `.agents/skills/*/SKILL.md`, `AGENTS.md:66-68·133·164`
  - 상태: V22.9.45에서 고침. 실제 npm 스크립트·두 모드 실행·현행 manifest·검사 하한 참조와 SQL 적용 완료·validate:unix 설명을 반영했습니다.
  - 두 스킬의 첫 검증 `validate:receipt`가 없는 스크립트임
  - AGENTS.md가 "V22.8.46 SQL 적용 필요"라고 적음(실제로는 재실행 금지)
  - AGENTS.md가 "하네스가 두 모드를 실행"한다고 적음(실제로는 한 번에 한 모드)
  - `npm run validate`의 Bash 필요 설명이 틀림

## 5. 문제 없음으로 확인한 것

- **보안**
  - 인증 관문: 경로 320개 확인.
  - 교차 출처 요청: POST는 403이고, 쿠키는 SameSite=Lax입니다. CORS `*`에는 자격 증명이 실리지 않습니다.
  - 세션: HMAC 세션과 session_version, 카카오 OAuth state.
  - 비밀번호: `/my/backup-login` 재인증(V22.9.28 P1#1 해소), 로그인 시도 제한, 응답 시간 균등화.
  - 초대코드: 약 40비트이고, 참여는 승인 대기로만 됩니다.
  - 권한:
    - 다른 가계부 쓰기를 실제 폼 50종으로 시도했고 반영 0건, 읽기 노출 0건이었습니다.
    - viewer·pending·blocked의 쓰기도 0건이었습니다.
    - '기록만' 정책은 웹·카카오의 변경 경로를 모두 거절합니다. 예외는 B-4의 지출자 세션입니다.
  - 출력: 저장형 XSS 없음. 인라인 JSON 싱크는 C-1 말고 모두 안전하고, innerHTML 경로도 안전합니다.
  - 헤더: 개인 HTML·JSON은 no-store, 화면은 XFO DENY. SIM-10 회귀 없음.
- **크롤·브라우저**
  - 세션 4종 × URL 330~403개에서 5xx·깨진 내부 링크·자산 404·no-store 누락이 0입니다. 픽스처에 env가 없는 3곳의 5xx는 뺐습니다.
  - 템플릿 864회 로드에서 JS 예외와 콘솔 오류가 0입니다.
  - 메뉴·검색·알림·테마·빠른 입력·월 이동·콤보·정기 카드 등 조작 40여 건이 정상입니다. 이중 제출도 1건만 저장됩니다.
  - 공개 30쪽의 sitemap, canonical, 중복 제목, 내부 링크가 정상입니다.
- **카카오**
  - 응답 형식: 응답 105개에서 오픈빌더 한도 위반이 0입니다(outputs, simpleText 1000자, textCard, 버튼, quickReplies 10개, label 14자). 그룹 응답에 quickReplies·carousel·commerceCard가 0입니다.
  - 해석: KST 자정 경계와 조회 숫자가 맞습니다.
    - 금액 기본형이 맞습니다(만원, 삼만오천원, 1만2천, 5천만원 1건).
    - 결제수단과 대부분의 날짜 말을 바르게 읽습니다.
    - 옛 회귀(이자카야=지출, 판매=수입 등)가 없습니다.
  - 흐름:
    - '먼저 답하기' 뒤 실패하고 다시 보내도 행 없이 "저장했어요"라고 답한 경우는 없습니다.
    - N1·D3·D4·T2 회귀가 없습니다.
    - 새 방에 첫 기록이 동시에 와도 가계부는 1개만 생깁니다.
    - 웹 연결 코드는 1회용이고 10분 뒤 만료됩니다.
  - DB 호출: 첫 기록에 1:1 47회, 방 43회입니다.
- **집계**
  - 60행 시드에서 홈·거래내역·캘린더·예산·카카오 요약의 숫자가 일치합니다. 차이는 D-3과 D-15뿐입니다.
  - 28~31일 달, 연말의 달 이동, KST 자정이 맞습니다.
  - 정기 항목의 29~31일은 말일로 보정되고 이중 반영이 0입니다.
  - SIM-3·SIM-9 회귀가 없고, 가계부 삭제·나가기·강등 규칙이 맞습니다.
- **가져오기**
  - CP949·UTF-16·UTF-8 BOM을 바르게 해독하고, 따옴표와 구분자를 처리합니다.
  - 대부분의 금액·날짜 형식을 읽고, 취소 행에는 확인 표시를 붙입니다.
  - 저장은 원자적이고 재시도해도 중복이 생기지 않습니다. 토큰은 HMAC·30분·사용자 단위로 묶입니다.
  - 내보내기는 BOM을 붙이고 수식으로 시작하는 칸을 무력화하며, IDOR이 없습니다.
- **운영 한계·관제·문서**
  - subrequest 50 초과는 G-2뿐입니다. 4만 건 백업·검색은 40,001건이면 정상 거절합니다.
  - cron은 앱 자체 상한(30·41회) 덕분에 50 안입니다.
  - `node monitoring/test-d1.mjs`(Node v22.23.1)가 84 checks로 통과합니다. 배포 스크립트 검사는 207 checks로 통과하고, `--rollback`과 업로드의 inherit 확인은 맞습니다.
  - Secret이 빠지면 닫히는 쪽으로 동작합니다: USER_SESSION_SECRET, ADMIN_API_TOKEN, ADMIN_SESSION_SECRET, OPS_MONITOR_TOKEN, MY_IMPORT_TOKEN_SECRET.
  - AGENTS.md의 `validate:*` 37개가 모두 있습니다. 체크섬 V22_9_44, 검사 하한 14,781, SQLite 84, 성능 예산이 실제와 맞습니다.
  - V22.9.40~44의 되돌리기 ID 연결이 일치합니다.
  - 상한 없는 모듈 전역 상태는 `AB_KAKAO_EDIT_SESSION_HINTS` 하나입니다. 증가 속도가 낮아 결함으로 보지 않았습니다.

## 6. 확인 못 한 것

- **운영의 실제 호출당 지연:** B-1은 약 110ms 이상에서 재현되고 100ms에서는 재현되지 않습니다. 실제 단톡방과 새 사용자 첫 기록으로 확인해야 합니다.
- **카카오 payload와 앱 연결:** 운영 payload에 appUserId·plusfriendUserKey가 실리는지, 봇 채널이 로그인 앱과 연결돼 있는지. B-6과 B-7의 빈도가 여기에 달려 있습니다.
- **운영 DB 현황:**
  - 가계부 수와 정기 규칙 분포(D-1 빈도)
  - 옛 '식비' 예산 수(D-4 영향 범위)
  - 옛 음수·소수·미분류 행 수(D-15)
- **운영 CPU(1102):** E-1의 가져오기 미리보기와, KNOWN-ISSUES에 적힌 큰 화면들.
- **실기기:** iOS Safari·Android의 datalist·IME·날짜 칩, VoiceOver·TalkBack.
- **실제 은행·카드사 파일의 열 이름:** E-2·E-10·E-11은 관례를 따른 합성 파일로 재현했습니다.
- **운영 플랫폼 동작:** `waitUntil` 안의 fetch가 subrequest 50에 합산되는지(합산으로 가정함). G-1 경고가 운영 관제에서 늘 켜져 있는지, G-6 관제 cron이 1102로 끊기는지는 관제 화면과 Workers Logs로 봐야 합니다.
- **운영 DB의 RPC와 표:** `record_nlu_*`·`accountbook_mutate_payment_assets_v2280` RPC가 있는지, `unrecognized_inputs`에 몇 행이 쌓였는지(G-7·G-13).

## 7. 수정 묶음 제안

1. **V22.9.45 긴급(작게):** B-1, C-1, G-1.
   - B-1: 먼저 답한 뒤에는 3.5초 검사를 하지 않고, 120·170ms 지연 검사를 더합니다.
   - C-1: date를 검증하고 jsonForInlineScript를 씁니다.
   - G-1: 선택 표 404를 계측 실패에서 뺍니다.
   - 셋 다 몇 줄 수정이고 다른 묶음과 파일이 겹치지 않습니다. 배포 뒤 실제 단톡방 재시험을 하고, 관제 경고가 꺼졌는지 확인합니다.
2. **카카오·웹 입력 해석 묶음:** A-01~A-12, A-15, A-16, B-11, F-1, F-2, D-7.
   - 대부분 `client/shared-input-parsers.js`와 `nlu/*`라서 웹 빠른 입력에도 함께 적용됩니다.
   - '입력 예시'와 안내 문장 전부, 그리고 A 영역의 문장 표(`02-skill-e2e.mjs`, 82문장)를 회귀 검사로 고정합니다.
3. **카카오 세션·단톡방 묶음:** B-2~B-10, A-13·A-14·A-17·A-18, D-6, D-21, G-2. 이 묶음에서는 B-2(P1)를 먼저 합니다.
4. **정기·예산 묶음:**
   - D-1·D-10: 예약 실행 재설계
   - D-2·D-25·D-26
   - D-4·D-9: 분류 체계 일치. 기존 '식비' 예산을 어떻게 다룰지 정해야 합니다.
   - D-3·D-12·D-17·D-18·D-19·D-23, D-11
   - D-28: 문서
5. **가져오기 묶음:** E-1(CPU)부터 시작하고, 이어서 E-2~E-17.
6. **관제·보안 설정 묶음:**
   - G-5(먼저 답한 뒤 결과 표본), G-3, G-6, G-10, G-12, G-13
   - G-8: 인증 fail-open 차단
   - G-7: `unrecognized_inputs` 원문 저장 중단과 정리. 정리는 운영 SQL이라 승인이 필요합니다.
   - G-4: 배포 스크립트 승격 확인
   - 관제 Worker는 앱과 따로 배포합니다.
7. **문서 묶음:** G-9(관제 README의 V22.9.21 복구 안내를 먼저), G-14~G-18, D-28, G-11 문서 수치, 외부 QA가 짚은 902/34.
8. **화면·표시 묶음:** 외부 QA 4건, F-3~F-10, D-13~D-16, D-20, D-22, D-24, D-27, C-2, C-3.

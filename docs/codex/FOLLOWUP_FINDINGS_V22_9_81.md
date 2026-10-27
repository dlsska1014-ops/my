# V22.9.81 작업 중 새로 찾은 항목

V22.9.81 은 V22.9.80 후속 발견 U-1~U-30 과 V79 T-43 을 여섯 묶음(입력 해석·데이터·환불 연결·화면·역할·관제)으로 고친 판이다. 이 문서는 그 판을 만들면서 새로 찾은 결함을 적는다.
이 문서는 발견 기록만 둔다. 상태·고친 판·검사는 `docs/codex/FINDINGS_LEDGER.md` 의 `V81:` 행에서 추적한다. 파일 줄 번호는 찾은 때(76ea594 위 각 묶음) 값이라 조금 다를 수 있다.
각 묶음 에이전트가 소스와 오프라인 번들로 확인해 보고한 것을 Claude 가 옮겼다.
- 고친 것(X-1~X-11·X-29)은 그 검사가 고치기 전 코드에서 실패하는 것으로 확인했다.
- 남은 것(X-12~X-28)은 Claude 가 따로 재현하지 않았다.

## V22.9.81 안에서 고친 것
- **X-1** (P2, 가져오기) 날짜 칸이 있는 머리글 없는 CSV 에서 따옴표 없는 천 단위 쉼표가 틀린 금액을 저장한다. ‘2026-07-15,5,000원,커피’ → 5원, 메모 ‘000원 커피’. 경고만 붙고 기본으로 선택돼 있었다(`import/flexible-import-parser.js:1148`·`893-897`).
- **X-2** (P3, 인증) 통합 표식을 뗀 뒤 길이로 자르면 자른 끝에 ‘(통합됨)’이 다시 남을 수 있다. 그러면 U-23 과 같은 영구 웹 로그인 막힘이 된다.
  - 자르는 곳: /my/profile 이름(`admin/category-guide-pages.js:225`, 80자), 가입(`auth/local-login-pages.js:158`, 80자), `my/households-lifecycle.js:263`(40자).
  - NFKC 가 표식으로 바꾸는 전각 ‘（통합됨）’도 같다.
- **X-3** (P3, 가져오기) 긴 머리글 속 별칭이 엉뚱한 칸으로 맞춰진다(`import/flexible-import-parser.js:235`).
  - ‘입금자명’ → 수입. 이름 행이 invalid_amount 로 거절된다.
  - ‘카드종류’·‘카드구분’ → 구분. ‘Card Type’=Credit 이 수입으로 저장된다.
  - ‘paid’ → 제외 열.
- **X-4** (P3, 가져오기) 영문 ‘Credit Card’·‘Debit Card’ 머리글을 금액 칸으로 읽어 그 행을 거절한다.
- **X-5** (P2, 가져오기) ‘지출일’·‘입금일’·‘수입일’·‘출금일’·‘지급일’·‘입금처리일’ 머리글을 금액 열로 읽는다. 그래서 모든 행이 invalid_amount 다(`import/flexible-import-parser.js:237-272`). ‘지출일자’·‘입금일시’는 괜찮았다.
- **X-6** (P2, 입력 해석) 한 건 입력과 웹이 ‘지지난주/저저번주 금요일’을 지난주 금요일로 읽는다. 2026-08-05 기준 07-24 가 아니라 07-31 로 저장된다.
  - ‘지지난달 25일’·‘지지난달 말일’도 지난달로 읽고, 메모가 ‘지 커피’가 된다.
  - 위치: `client/shared-input-parsers.js:141`·`143`·`170`, `nlu/date-payment.js:171`, `client/shared-input-nlu.js:286`(cleanInputMemo).
- **X-7** (P3, 입력 해석) 카카오 ‘지지난달 식비 예산 30만원’을 읽지 못한다. 분류 이름이 ‘지지난달 식비’로 남아 ‘등록된 카테고리를 찾지 못했어요’로 답한다(`kakao/household-budget-commands.js:403` parseBudgetMonthHint).
- **X-8** (P3, 입력 해석) ‘다음/이번/오는/지난번 금요일’을 가장 가까운 지난 금요일로 읽는다.
- **X-9** (P3, 입력 해석) 메모에 ‘모레’·‘지금’·‘방금’과 8자리 날짜가 남는다(‘모레 커피’). 낱말을 그냥 지우면 ‘아모레’가 깨진다.
- **X-10** (P3, 입력 해석) ‘오십 오만 오천원’이 50원과 55,000원 두 건으로 나뉜다(세 낱말 사슬, U-9 다음 꼴).
- **X-11** (P3, 입력 해석) 윤년 2월 29일 전에 보낸 ‘2월 29일 요약’이 지난해로 옮겨져 ‘없는 날짜’라고 답한다(`kakao/household-budget-commands.js:553` 근처). 처음 생길 수 있는 때는 2028-01-01~02-28 이다.
- **X-29** (P3, 입력 해석) 카카오 대표 명령어 ‘기록하기’를 누르고 이어 쓴 ‘기록하기 점심 12000원’·‘기록하기: 커피 4500원’·‘입력하기 …’의 메모가 ‘기록하기 점심’·‘기록하기 커피’로 저장된다. 앞머리는 ‘기록 ’·‘입력 ’만 뗐다(`kakao/request-guards.js:47` stripLeadingCommand). 명령어만 보내면 기록 방법 안내가 나와 문제없다. 2026-10-27 앱 승인 담당자가 대표 명령어에 ‘기록하기’를 더해 달라고 한 요청을 확인하다 Claude 가 찾았다(운영 V22.9.80 도 같다).

## 남은 것
- **X-12** (P3, 역할 조회) 가계부 삭제 재인증(`auth/kakao-oauth.js:52`·`213`)이 느슨한 getHouseholdMemberRole 을 쓴다. 읽기에 실패하면 역할이 빈 값이 되어 소유자가 household_delete_owner_only 를 본다.
- **X-13** (P3, 화면) /budgets 안내가 이미 이스케이프된 formatMessage 결과를 한 번 더 이스케이프한다(`admin/budget-center-recurring.js:145`). /budgets?err=amount_unit_required 가 `&quot;7원&quot;` 으로 보인다.
- **X-14** (P3, 정리) 부르는 곳이 없는 코드가 남았다.
  - `kakao/group-links-first-record.js:641`·`645` ensurePendingMemberIfMissing·resolveKakaoHousehold. 되살리면 느슨한 읽기가 실패할 때 pending 구성원 행을 넣는다.
  - `domain/budgets.js:343`·`363`·`382` renderBudgetBasisRows·renderBudgetConsistencyAlert·renderBudgetRows(U-5 를 지운 뒤).
  - `domain/users-households.js:233` ROLE_CHECK_FAILED_TEXT.
  - `kakao/household-budget-commands.js:181` bind 의 후보 하나 갈래. 부르는 곳이 모두 forceChoice:true 를 넘긴다.
  - 죽은 CSS: `my/analysis-page.js:232` 의 `.dailyCell.noValue{opacity:.55}`(셸 규칙이 언제나 이김), `assets/mobile-v81-css.js:56`·`admin/dashboard-page.js:295-299` 의 #059669 흰 글자 규칙(뒤 규칙이 덮음).
- **X-15** (P3, 환불 연결 — 플래그 꺼짐) 연결 읽기 실패가 카카오에서 이유 없는 일반 대체 답장(‘잠시 처리 흐름을 정리하고 있어요…’)으로 나간다(`kakao/simple-commands.js:84` → `kakao/skill-handler.js:798`). 장애 때 생기고, V22.9.81 부터는 상한 넘침(U-26)도 같은 길이다.
- **X-16** (P3, 환불 연결 — 플래그 꺼짐) 쪽(offset) 읽기 사이에 연결이 더해지거나 지워지면, 화면 읽기에서 연결 하나가 빠지거나 겹칠 수 있다(`data/households-members-rows.js:255-307`). 연결이 1,000개를 넘을 때만 생긴다.
- **X-17** (P3, 정산) settlement_history 안에 null 항목이 있으면 500 이 난다(`features/settlement-ops-pages.js:351`, `features/settlement-refund-links.js:583`, `features/settlement-refund-preview.js:75`). 원래 있던 문제이고, 손으로 고친 행에서만 생긴다.
- **X-18** (P3, 관제) ‘최근 처리 실패 기록’ 회복이 telemetry_status ok 를 요구한다(`monitoring/worker.mjs:454`). 그래서 요청이 적으면 왕복 확인이 정상이어도 회복을 확정하지 못한다.
- **X-19** (P3, 관제) 표본 칸(5분 창:종류:hash%10)에 INSERT OR IGNORE 를 쓴다(`monitoring/worker.mjs:553-561`). 한 창에 예약이 두 번 동시에 돌면 1/10 확률로 not_received 가 한 번 난다. 3번 연속이어야 경보라 경보는 없다.
- **X-20** (P3, 검사) `validation/validate-audit-hotfix-v22945.mjs:105` 의 room@100ms 는 4초 예산에 0.1초 남짓 남는다. 그래서 부하 때 거짓으로 실패한다(단독으로는 통과).
- **X-21** (P3, 가져오기) 영문 머리글 일부가 엉뚱한 열로 매핑된다(`import/flexible-import-parser.js:221`·`237-272`).
  - ‘Card No.’·‘Account No.’ → 결제수단(단독 ‘no’ 만 봄).
  - ‘Credit Card Amount’ → 수입, ‘Credit Card Type’ → 수입 금액.
  - ‘Deposit Date’·‘Withdrawal Date’·‘Credit Date’ → 금액, ‘Payment Date’ → 결제수단.
  - ‘입금일(KST)’ 은 수입 금액 그대로다(드묾).
- **X-22** (P3, 입력 해석) 웹은 카카오가 무시하는 지난 기록 결제수단 이름을 맞춘다. ‘점심 9000 회사카드’가 웹에서는 회사카드, 카카오에서는 카드다(`my/mobile-home.js:771`·인라인 detectQuickPayment).
- **X-23** (P3, 입력 해석) ‘1999년 3월 2일 요약’이 올해 3월 2일을 읽는다. 연도 묶음이 20xx 만 맞는다(`kakao/household-budget-commands.js:547`).
- **X-24** (P3, 입력 해석) ‘저저번달’을 기능마다 다르게 읽는다(`kakao/household-budget-commands.js:506-529`·`572-574`).
  - 요약은 ‘읽지 못한 기간’이고, 예산·거래 날짜는 두 달 전이다.
  - 요약 쪽은 검사 세 개가 고정한다: validate-kakao-audit-v22976:214, validate-kakao-replies-v22979:723, validate-nlu-v22980:447.
- **X-25** (P3, 입력 해석) 네 낱말 사슬과 억 사슬은 두 건으로 나뉜다. ‘삼억 오십 오만 오천원’ → 3억 + 555,000원(`client/shared-input-nlu.js:43-46`).
- **X-26** (P3, 입력 해석) 윤년 다음 해의 ‘2월 29일 요약’은 ‘없는 날짜’로 답한다(`kakao/household-budget-commands.js:560-561`). 처음 생길 수 있는 때는 2029-01-01 부터다.
- **X-27** (P3, 입력 해석) 고정 하루 말(오늘·어제·내일·그제)이 낱말 속에서도 메모에서 지워진다(`client/shared-input-nlu.js:305`·`311`). V22.9.80 도 같다.
  - ‘오늘의집 쿠션’ → ‘의집 쿠션’.
  - ‘내일배움카드 교재’ → ‘배움 교재’.
- **X-28** (P3, 입력 해석) 20으로 시작하는 8자리 수는 다른 날짜 말이 없으면 날짜로 읽는다(`client/shared-input-parsers.js:149-150`). V22.9.80 도 같다.
  - ‘택배 3000원 주문번호 20123456’ 은 저장이 거절된다.
  - 맞는 날짜 꼴(예: 송장 20991231)이면 그날로 저장된다.

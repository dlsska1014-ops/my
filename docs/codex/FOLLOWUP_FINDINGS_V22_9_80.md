# V22.9.80 작업 중 새로 찾은 항목

V22.9.80(V22.9.79 후속 발견 T-10~T-39 를 다크·입력 해석·역할 표시·데이터·환불 연결 다섯 묶음으로 고치고, 통합 때 T-40 을 더한 판)을 만들면서 새로 찾은 결함이다.
이 문서는 발견 기록만 두고, 상태·고친 판·검사는 `docs/codex/FINDINGS_LEDGER.md` 의 `V80:` 행에서 추적한다. 파일 줄 번호는 찾은 때(29ee7cc 위 각 묶음) 값이라 조금 다를 수 있다.
입력 해석 묶음이 찾은 P2(카카오 조회 전용 구성원의 쓰기 우회)는 V22.9.79 통합 검토에서 넓혀 고쳤다(V79 T-44).

## 남은 것
- **U-1** (P3, 역할 표시) 시작가이드(`web/menu-and-guides.js:41` renderUserStartGuideHtml)가 고른 가계부가 아니라 목록의 첫 가계부(households[0])의 역할로 링크를 고른다. 첫 가계부의 소유자가 다른 가계부를 골라 둔 구성원이면 관리자 링크가 보이거나 그 반대가 된다.
- **U-2** (P3, 역할 표시) 결제수단 화면(`features/payment-methods-page.js:248`)은 주소의 `err` 를 코드가 아니라 받은 글자 그대로 보인다(이스케이프는 됨). 다른 화면처럼 formatMessage 로 안내하지 않는다.
- **U-3** (P3, 역할 표시) 예산 센터 정기 항목의 입력 검사 거절은 아직 자유 문장으로 `err` 에 실린다(T-34 는 권한 거절만 코드로 바꿨다).
- **U-4** (P3, 역할 조회) 카카오 흐름의 역할 조회가 실패를 ‘권한 없음’으로 읽는다: 예산 설정 흐름(`kakao/guided-flows.js` budget_setup), 기록 수정(`kakao/edit-flow-v4.js:329`), 단톡방 첫 기록(`kakao/group-links-first-record.js:667`·`727`). T-35(웹)와 같은 꼴이다. 이름 흐름의 조회 전용 쓰기는 V79 T-44 에서 막았다.
- **U-5** (P3, 정리) 부르는 곳이 없는 `handleBudgetCenterPageLegacyV2264`(`admin/budget-center-recurring.js:149`).
- **U-6** (P3, 입력 해석) 카카오 ‘지지난달 요약’·‘지지난주 요약’을 지난달·지난주로 읽는다(`kakao/household-budget-commands.js:532`·`537`). ‘얼마나 썼어’ 꼴(T-39)은 읽지 못한 기간으로 안내한다.
- **U-7** (P3, 입력 해석) 웹 결제수단 목록에 ‘자동이체’가 있어(`my/mobile-home.js:730`) ‘통신비 50000 자동이체’가 웹은 자동이체, 카카오는 계좌이체로 저장된다.
- **U-8** (P3, 입력 해석) 홈 빠른 입력의 분류 이름 맞춤(`my/mobile-home.js:582` inferQuickCategory)이 낱말 속 분류 이름을 찾는다(‘점심 9000 급여통장’ → 급여). 서버 분류 호출이 안 될 때만 쓰인다.
- **U-9** (P3, 입력 해석) ‘월세 오십 오만원’이 두 건(50원·50,000원)으로 나뉜다(`client/shared-input-nlu.js:32`). T-17 은 ‘십’으로 끝나는 머리를 일부러 잇지 않았다.
- **U-10** (P3, 입력 해석) 카카오 기록 수정에서 구분을 바꿀 때 다시 분류하는 근거에 자동으로 채운 메모가 들어간다(`kakao/edit-flow-v4.js:85`). T-18 은 저장 때 분류만 고쳤다.
- **U-11** (P3, 가져오기) 메모 키가 없는 ‘키: 값’ 줄은 키 이름들이 메모가 되고(‘날짜 금액 지점 인터넷’), 머리글 없는 행은 구분자가 섞인 메모(‘, ,스타벅스,인터넷’)가 된다(`import/flexible-import-parser.js:953`).
- **U-12** (P3, 가져오기) ‘카드 끝 4자리’·‘카드뒷자리’ 머리글이 결제수단으로 매핑돼 ‘1234’가 결제수단 이름이 된다(`import/flexible-import-parser.js:221`). 비슷한 머리글 맞춤이 짧은 머리글을 긴 별칭의 부분 문자열로 맞춘다(‘No’ 가 그랬다 — T-29 에서 ‘No.’ 는 제외 열로 고정).
- **U-13** (P3, 카카오) 그날 기록이 500건을 넘는 가계부에서, 처음 500건 밖의 최신 기록을 `dailySeqForKakaoRow(...) || 1` 이 ‘01번’으로 적는다(`kakao/edit-flow-v4.js:403`).
- **U-14** (P3, 예약) 지출자 자격이 없는 규칙이 하나라도 있으면 수동 ‘기록하기’가 규칙을 하나씩 반영해(규칙당 DB 호출 3회 이상) 남은 규칙이 16개쯤이면 요청 한도 50 에 닿는다(`admin/budget-center-recurring.js:365`). T-14 와 같은 꼴이다.
- **U-15** (P3, 화면) 종합 리포트 날짜 그래프의 지출 없는 날(`.dailyCell.noValue{opacity:.55}`, `my/analysis-page.js:232`)이 라이트에서 날짜 숫자 4.00:1, ‘·’ 3.31:1 이다(다크는 통과).
- **U-16** (P3, 화면) 오픈빌더 안내의 최종 발화 표 ‘여러 줄 입력’ 예시가 글자 그대로의 `\n` 을 보인다(`admin/guide-pages.js:249`). T-38 과 같은 결함이지만 표 칸이라 실제 줄바꿈과 `white-space:pre-line` 이 함께 필요하다.
- **U-17** (P3, 화면) 옛 관리자 화면(`admin/dashboard-page.js:60`, `.dayAmt`·`.calendarLegend` nowrap): 360px 달력 탭에서 ‘+3,200,000원’ 같은 큰 금액이 칸 밖으로 나간다(글자 끝 237px, 칸 끝 187px). 1280px 에서 ‘초기화’ 단추 글자가 3px, 가져오기 탭 ‘선택 적용’·‘가계부·참여자’가 6·13px 넘친다.
- **U-18** (P3, 옛 관리자 화면) 일괄 수정·삭제가 성공 문장(‘N건 일괄 수정 완료’·‘N건 삭제 완료’)을 `msg` 에 그대로 싣는데(`admin/bulk-and-return-paths.js:42`·`78`), 옛 관리자 화면(`admin/dashboard-page.js:390`)은 `msg` 를 formatMessage 로 바꿔 ‘요청을 처리하지 못했습니다…’로 보인다. 성공이 실패처럼 보인다.
- **U-19** (P3, 옛 관리자 화면) 같은 자리에서 환불 연결 코드 밖의 `err` 코드(record_update_failed·edit_unknown 등)는 코드 글자 그대로 보인다(이스케이프는 됨).
- **U-20** (P3, 웹) `/my` 는 `/app` 으로 넘기면서 `msg`·`err` 를 버린다(`my/households-lifecycle.js:705` handleMyPage). `/my/update` 의 결과(T-12 의 막힌 이유 포함)가 모두 사라진다. 지금 이 주소로 보내는 화면은 없다(홈 수정은 `/admin/update`).
- **U-21** (P3, 정리) 부르는 곳이 없는 `kakaoBudgetStatusText`(`domain/budgets.js:453`).

## PR #98 뒤 확인으로 더한 것 (2026-10-26)
- 출처:
  - U-22~U-27 은 Codex Astra 의 76ea594 읽기 전용 검토다. Claude 가 소스와 오프라인 번들로 사실임을 확인했다(저장소 밖 `review-artifacts/v80-improvements-2026-10-25/codex-astra-review-2026-10-26/VERIFY.md`, 재현 `repro-3-4.mjs`).
  - U-28~U-30 은 2026-10-26 V79 운영 화면 확인(Aside)에서 나왔다.
- U-22~U-25 는 V22.9.79 운영에도 있고 V22.9.80 이 바꾸지 않았다. U-26·U-27 은 꺼진 환불 연결 플래그 뒤에 있다.
- **U-22** (P3, 데이터) DB 가 2xx 머리를 보낸 뒤 본문 받기가 끊기면(`data/supabase-client.js:73` 근처 `await res.text()` 가 던지거나 쓰기 시한이 본문을 받는 중에 끝남) 결과 불확실로 분류하지 않는다. catch 조건 `!status || status >= 500 || status === 408` 에 걸리지 않아, 실제로 저장됐을 수 있는 쓰기를 ‘저장하지 못함’으로 안내한다. 다시 시도하면 기록이 두 번 생길 수 있고, `backup-apply.js` 는 다음 행을 계속 적용한다.
- **U-23** (P3, 인증) 카카오 프로필 이름이 ‘…(통합됨)’으로 끝나면 로그인이 막히고 다음 로그인에도 풀리지 않는다. `ensureKakaoLoginUser`(`auth/identity-reauth.js:329`)는 표식을 떼지만, 로그인 콜백은 저장된 이름이 자리표시(`isPlaceholderUserNickname`, `:122`)이면 프로필 이름을 그대로 다시 쓰고, 세션 검사(`auth/user-session.js:190`·`236`, `auth/kakao-web-claim.js:60`, `domain/users-households.js:30`)는 그 이름을 통합된 계정으로 보고 거절한다.
- **U-24** (P2 후보, 입력 해석) 여러 건 입력에서 ‘지난/저번 + 요일’이 뒤 거래로 이어지지 않는다. 기준일 2026-08-05(수) ‘지난 금요일 커피 4500원 택시 8000원’ → 커피 07-31, 택시 08-05(오늘). 카카오 저장도 같다. `nlu/transaction-parser.js:57` extractLeadingDateHint 의 정규식에 ‘지난주 + 요일’은 있지만 ‘지난/저번 + 요일’은 없다.
- **U-25** (P3, 입력 해석) 없는 날짜의 카카오 요약이 다른 날 금액을 보인다. ‘2월 30일 요약’은 제목이 2월 30일인데 3월 2일 기록의 금액과 month=2026-03 분석 링크를 보이고, ‘13월 5일 요약’은 ‘2025년 13월 5일’이 된다(`kakao/household-budget-commands.js` 의 검사 없는 `new Date(y, m - 1, d)`). 데이터는 바뀌지 않는다.
- **U-26** (P3, 환불 연결 — 플래그 꺼짐) 환불 연결이 많으면 정산이 일부 환불을 빠뜨린다. `fetchRefundLinkRows`(`features/settlement-refund-links.js:76`)는 묶음(100 id)마다 `limit=1000` 으로 읽고 넘침을 보지 않는다. `loadRefundDeductions` 는 `>= 2000` 일 때만 잘림으로 보는데, Supabase API 최대 행이 그보다 작으면 이 검사는 걸리지 않는다. 플래그를 켜기 전에 고친다.
- **U-27** (켜면 P2, 환불 연결 — 플래그 꺼짐·SQL 미적용) 정산 완료 이력의 30건 상한(`history.slice(-30)`, `features/settlement-refund-links.js:607`·`features/settlement-ops-pages.js:347`) 때문에 완료한 달의 잠금이 풀린다. 실행 금지 SQL 의 `refund_link_month_completed`(`migrations/V22_9_79_REFUND_LINKS_APPLY_REVIEW_ONLY.sql:180`·`250`)와 앱 판정이 이 배열만 본다. 완료 월 상태를 표시용 이력과 따로 두고 SQL 도 바꿔야 한다. 플래그를 켜기 전에 반드시 고친다.
- **U-28** (P3, 화면 대비 — 다크) 알림 배지 1.90:1. `body.abV22812Shell .abV5NotifBadge{…background:var(--neg)…color:#fff}`(`assets/accountbook-shell-css.js:721`)이고 다크의 `--neg` 는 #fca5a5 다. 알림이 있는 모든 사용자 화면에 보인다.
- **U-29** (P3, 화면 대비 — 다크) 사이드바 작은 달력 오늘 칸 1.80:1. `body.abV22812Shell .abNavCalDay.isToday{background:var(--accent)!important;color:#fff!important}`(`assets/accountbook-shell-css.js:775`). U-28 과 같은 꼴로, 흰 글자를 고정한 채 바탕 토큰만 다크에서 옅어진다.
- **U-30** (P3, 화면 대비 — 라이트) 거래 목록 요약 수입 3.77:1. `.abTransactionSummary dd.income`(`client/v5-bundle-mains.js` 의 `+N원`)이 흰 바탕 위 #059669 다. #047857(5.48:1) 같은 값이 필요하다.

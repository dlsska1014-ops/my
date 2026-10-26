# V22.9.79 작업 중 새로 찾은 항목

V22.9.79(운영자가 권장안을 채택한 W-7 월말 예상·D-5·M-7 환불 연결과, 추적표에 남은 카카오·입력 해석·예약 반영·웹 화면·백업·화면 검사 항목)를
여덟 묶음으로 나눠 고치면서 새로 찾은 결함과 아직 확인하지 못한 전제다. 이 문서는 발견 기록만 두고, 상태·고친 판·검사는
`docs/codex/FINDINGS_LEDGER.md` 의 `V79:` 행에서 추적한다. 파일 줄 번호는 찾은 때(437554e 기준) 값이라 조금 다를 수 있다.

## 같은 판에서 고친 것
- **T-1** (P3) 카카오 ‘내 이름 설정’ 단계가 열린 채로 ‘오늘 뭐 썼어’·‘이번 달 뭐 썼어’·‘최근 기록 보여줘’·‘이번 주 쓴 거’를 보내면 그 말이 그대로 내 이름으로 저장됐다(`kakao/guided-flow-state.js` 이름 단계의 흐름 끊기 판정, `kakao/guided-flows.js` member_alias). 모든 명령으로 끊으면 ‘정산담당’ 같은 이름이 막히므로 이름 단계에서만 조회 질문 꼴을 보고 끊는다. 통합 검토(2026-10-26)에서 이 판정의 틈 세 개를 더 막았다: 끝 물음표를 normalizeText 뒤에 봐서 ‘지난달 얼마나 썼지?’가 이름으로 저장됐고(원문에서 본다, ‘얼마나’ 꼴도 더함), 앞 ‘기록 ’을 stripLeadingCommand 가 떼어 ‘기록 보여줘’가 ‘보여줘’로 저장됐고(멘션만 뗀 원문으로도 본다), ‘쓴/산/나간+거’에 뒤 경계가 없어 ‘부산거북이’·‘등산거사’ 같은 이름이 막혔다(조사만 허용하는 뒤 경계).
- **T-2** (P2) 카카오 ‘최근 기록’·‘내 기록’·‘마지막’과 ‘방금 삭제·수정·지출자 변경’의 대상 조회(`getRecentKakaoOwnedTransactionsV2254`)가 가계부 전체의 최근 20~50건을 읽은 뒤 내 것만 걸렀다. 같은 가계부의 다른 구성원이 그 뒤로 많이 저장하면 “아직 내가 기록한 내역이 없어요”가 나왔다. 서버 조건(or=/and=)으로 내 기록에만 limit 을 건다. 운영 PostgREST 가 이 조건 문법을 받는지는 아직 운영에서 확인하지 않았다(4xx 면 예전 조회로 한 번 더 읽고 운영 이벤트를 남긴다).
- **T-3** (P3) 조회 전용(viewer)은 ‘오늘 기록 보기’만 되고 ‘어제 기록 보기’·‘7월 3일 기록 보기’는 막혔다(`kakao/skill-handler.js` 읽기 명령 목록).
- **T-4** (P3) 관리자 화면의 `<datalist id="spenderNameList">`(원래 별명 그대로)와 `renderSpenderDatalist` 는 어디에서도 참조하지 않는 죽은 마크업이었다.
- **T-5** (P3) 카카오 ‘이번 주·이번 달·지난주 뭐 썼어’·‘이번 달 쓴 거’가 그 기간이 아니라 방금 입력한 5건을 보였다(헤더만 ‘최근 입력 내역’).
- **T-6** (P3) 수동 정기 반영 ‘기록하기’(`admin/budget-center-recurring.js` handleRecurringApply)가 지난 달·이미 끝난 주에 넣은 기록의 월간·주간 스냅숏을 다시 만들지 않았다. 반영 표식이 그 달로 바뀌어 예약 실행도 그 달을 다시 보지 않았다.
- **T-7** (P3) 예약 실행 끝의 상태 저장(`cron/recurring-auto-apply.js`)이 처음 읽은 상태로 계산한 값을 그대로 써서, 실행 중에 실행 밖(T-6·N-10)에서 다시 만들기 대기에 보탠 항목을 지웠다. 남은 틈: 저장 바로 앞에 다시 읽은 뒤 저장까지 한 번 왕복 사이에 보탠 항목은 여전히 덮일 수 있다.
- **T-8** (P3) 종합 리포트·무료 리포트·PC 분석·백업센터가 정기 항목 목록을 못 읽으면 빈 목록으로 다뤘다. 그래서 이미 등록한 항목이 반복 후보(무료 리포트는 등록 단추까지)로 보였고 백업센터는 ‘고정항목 0개’였다(`my/insight-page.js`, `my/reports-premium.js`, `admin/pc-analysis-calendar.js`, `admin/backup-compare.js`).
- **T-9** (P3) 홈의 설정 한 번 조회(`fetchMobileHomeSettings`)가 실패하면 정기지출 항목이 빈 목록이 되어 ‘앞으로 나갈 돈’과 월말 예상이 남은 납부를 조용히 뺐다(예산 알림은 같은 때 ‘읽지 못해 빼고 계산’이라고 말한다).
- **T-41** (P3, 통합 검토) 화면 끝에 런타임 스크립트를 넣는 `web/html-postprocess.js` attachUiUxRuntime 이 문자열 치환(`source.replace("</body>", script + "</body>")`)이라, 런타임 원문의 `"\\$&"`(입력 분류 `transactionTypeFromText` 의 정규식 이스케이프)가 `</body>` 로 펼쳐졌다. 다음 런타임은 그 가짜 `</body>` 자리, 곧 앞 스크립트의 문자열 안에 들어가 빠른 입력 런타임이 문법 오류로 깨진다. V22.9.79 이전부터 있었고, 지금 경로 중에는 이 런타임(`id="smartInput"` 이면서 홈 전용 런타임이 없는 화면)을 받는 화면이 없다(2026-10-25 렌더 73장 확인). `.toString()` 을 넣는 세 곳을 함수 치환으로 바꿨다.
- **T-42** (P3, 통합 검토) `validate-refund-links-v22979` 의 플래그 꺼짐 고정값 `afterMain`(완료 뒤 정산 화면)이 검사한 날짜에 묶여 있었다. 완료 이력 ‘완료일’ 칸은 앱이 실제 시계로 찍은 `completed_at` 의 앞 10글자라, 2026-10-25 에 만든 고정값이 2026-10-26 하네스에서 어긋났다(화면 자체는 같음 — 날짜만 10-25 로 바꾸면 옛 고정값과 같다). 그 칸만 자리표시로 바꿔 비교한다.

## 남은 것
- **T-10** (P3) 카카오 날짜 목록(`kakao/edit-session-v4.js` getDailyKakaoRows, 215~216줄)은 그날 내 기록을 오래된 순으로 500건까지만 읽는다. 하루 500건을 넘게 쓰면 뒤쪽 기록이 목록에 없다.
- **T-11** (P3) 환불 연결(플래그 뒤, DB 적용 전): 가계부 지우기 열쇠 목록(`docs/db-review/v22961/10_APPLY_LIFECYCLE_REVIEW_ONLY.sql` 125~140줄 부근)에 `refund_review_kept:<가계부>` 설정 행이 없어 지운 뒤에도 남는다. 연결 자체는 함께 지워진다(cascade).
- **T-12** (P3) 환불 연결(플래그 뒤, DB 적용 전): 연결된 기록의 수정이 트리거에 막히면 카카오 수정은 “잠시 후 다시 보내 주세요”(다시 보내도 안 됨, `kakao/edit-flow-v4.js` 309줄), 관리자 수정은 일반 실패(`admin/transactions-households.js` 509줄), 여러 건 수정은 한 건 때문에 전체가 실패한다(`domain/transactions-core.js` 256줄).
- **T-13** (P3) 환불 연결(플래그 뒤, DB 적용 전): 백업·가져오기·카카오 복구는 연결을 싣지 않아, 되살리거나 다시 가져온 연결 기록은 연결 없이 돌아온다.
- **T-14** (P3) 수동 ‘기록하기’의 표식 되살리기(SIM-8, `admin/budget-center-recurring.js` 343~346줄)는 표식이 대상 달보다 늦은 규칙마다 PATCH 를 하나씩 보낸다. 그런 규칙이 40개쯤 넘으면 요청 한도(50)에 닿아 `recurring_apply_incomplete` 로 끝나고 T-6 의 대기 저장도 실패한다. 표식은 되감긴 채 남지만 뒤 예약 실행이 중복 없이 고친다(데이터 손실 없음). `id=in.(…)` 한 번으로 묶으면 된다.
- **T-15** (P3) 가계부에 등록한 결제수단 이름을 낱말 속에서도 찾는다(`settings/payment-assets.js` 406~417줄, 홈 빠른 입력 detectQuickPayment 의 선택지 고리, 옛 화면 detectPayment). 결제수단 ‘토스’를 등록하면 ‘토스트 3000’이 카카오·웹 모두 결제수단 토스로 저장된다.
- **T-16** (P3) 낱말 속 분류 낱말이 아직 남는다(`nlu/category-rules.js` 24~55줄): 가스레인지·전기밥솥 → 공과금, 주식회사 설립 → 저축/투자, 시장조사 → 장보기, 아이유 콘서트 → 육아/자녀, 카페인 → 카페/간식.
- **T-17** (P3) ‘집 삼억 오천만원’·‘택시 만 오천 현금’은 아직 두 금액으로 나뉜다(서버·웹 같음, `client/shared-input-nlu.js` joinSpacedKoreanAmount — ‘원’이나 문장 끝이 있어야 하고 뒤는 천·백·십만 본다).
- **T-18** (P3) 저장 때 분류(`settings/payment-assets.js` 450~472줄)는 raw_text·메모·분류·결제수단을 이어 붙여 판정해, 분류가 비어 있으면 ‘농협’ 같은 결제수단 낱말이 분류를 정할 수 있다(웹 빠른 입력의 A-10 고침과 같은 틈).
- **T-19** (P3) 정리: `nlu/amount-parser.js` 의 collect*Candidates·isLikelyDateAround·isLikelyYearOrTime 은 부르는 곳이 없다(parseKoreanAmount 는 홈 템플릿·성능 검사가 아직 쓴다).
- **T-20** (P3) 이번 달 1~6일 홈의 ‘쓰는 속도’ 큰 숫자는 7일 창이 달 앞에서 시작해 지출이 있어도 0원이다(`my/home-sections.js` 쓰는 속도 카드). 홈 바이트 예산 때문에 V22.9.79 에서 고치지 않았다.
- **T-21** (P3) 내비(`web/unified-nav.js` 70줄)를 그리는 곳 약 97곳 가운데 12곳 정도만 역할을 넘긴다. 구성원은 /reports·/annual·/settlement-summary 등에서 꼬리표 없는 관리자 전용 링크(참여자·초대/단톡방, 누르면 403)를 본다.
- **T-22** (P3) 안내 화면이 구성원에게 /my/settings·/my/groups·/my/members 링크(403)를 보인다(`web/menu-and-guides.js` 46·75줄, `web/guide-pages.js` 147줄).
- **T-23** (P3) `admin/budget-center-recurring.js` 140줄의 /my/settings 바닥 링크는 `web/html-postprocess.js` 117줄이 카드를 바꿔 치워 화면에 나오지 않는 죽은 마크업이다.
- **T-24** (P3) PC 분석의 주간 리포트(`admin/pc-analysis-calendar.js` 247줄)는 월요일 시작, 홈 ‘주별’ 탭(D-16)은 일요일 시작이다 — ‘주’가 두 뜻이다.
- **T-25** (P3) 가져오기의 합계 행 거르기(`import/flexible-import-parser.js` isImportSummaryRow)가 메모 끝이 합계·소계인 기록(‘카드값 합계’·‘7월 소계’)을 백업 되살리기에서도 뺀다(제외로 보인다).
- **T-26** (P3) 가져오기 미리 보기(약 244KB, 서명 토큰 111KB 포함)를 `web/html-postprocess.js`(49·381줄 attachUiUxRuntime)가 통째로 다시 훑는다 — 120행 미리 보기 약 35ms 중 6.4ms(Node).
- **T-27** (P3) `nlu/date-payment.js` 157~161줄 nowKstDate() 는 withKstNowScope 밖에서 부를 때마다 Intl.DateTimeFormat 을 새로 만든다(빈 isolate 첫 호출 약 5ms). 고정 UTC+9 계산과 결과가 같다.
- **T-28** (P3) E-11 의 남은 꼴: ‘지점: 인터넷’ 같은 ‘키: 값’ 줄과 머리글 없는 표는 줄 전체를 분류 근거로 써서 ‘인터넷’ 열이 통신비를 정한다(`import/flexible-import-parser.js` normalizeImportedRecordDetailed, 매핑이 없으면 contextText = rawText).
- **T-29** (P3) 머리글 비슷한 이름 매핑(`import/flexible-import-parser.js` 218줄 canonicalImportField)이 ‘카드번호’를 결제수단(가린 카드번호가 결제수단 이름으로 저장), ‘가맹점주소’를 메모(주소 낱말 ‘병원 앞’이 분류를 정함)로 읽는다.
- **T-30** (P2) 다크 모드 예산 센터 카드(`admin/budget-center-recurring.js` 140줄 `.budgetP0.isWarn·.isOver`, `assets/accountbook-shell-css.js` 25줄)는 게이지 색 #fbbf24·#f87171 을 카드 배경으로 쓰고 글씨는 흰색이다 — 경고 1.67:1(잰 값), 초과 약 2.8:1(계산). 예산을 85~100% 쓴 다크 모드에서 보인다.
- **T-31** (P2) 다크 모드 /meeting-households·/travel-households·/household-templates 의 서식 카드(`features/settlement-ops-pages.js` 173~225줄)는 흰 배경에 밝은 글씨(1.10~1.15:1)다.
- **T-32** (P2) 다크 모드 로그인 꼴 화면에 오류가 있을 때(예: /my/kakao-link) 오류 요약 `.authErrorSummary`(`web/login-page-side-nav.js` 26줄) 대비가 1.05:1 이다.
- **T-33** (P3) 사이드바 작은 달력의 ‘오늘’ 표시와 ‘오늘이 있는 달로’(`client/v5-bundle-mains.js` 305~306줄)는 기기 시간대 날짜를 쓴다(F-8 과 같은 꼴).
- **T-34** (P3) 거절 문장이 자유 글이라(`admin/transactions-households.js` 242·352·468줄, `admin/budget-center-recurring.js` 202·259·305줄) 실제 거절(조회 전용·차단)이 홈·정기 화면에서 ‘입력값을 확인한 뒤 다시 시도해 주세요’로 보인다. 코드와 formatMessage 안내가 필요하다.
- **T-35** (P3) 역할 조회를 엄격하지 않게 읽는 곳이 남았다(D-27 과 같은 꼴: 조회 실패 = 권한 없음): `admin/pc-analysis-calendar.js` 46·83줄, `settings/payment-assets.js` 489줄, `settings/reserve-plans.js` 444·482·516줄, `my/money-plan-home-layout.js` 90·161줄.
- **T-36** (P3) 옛 관리자 화면(/admin-view)의 `.footerNote` 2.41:1, small 2.56:1, `.expense` 3.44:1, `a.disabled` 3.86:1, 모바일 내비 글자 3.03:1, 1024px 에서 `section.grid8`(4×190px) 80px 넘침(`admin/dashboard-page.js`, `dashboard-fragments.js`, `web/unified-nav.js`).
- **T-37** (P3) 종합 리포트 예산 사용률 표(`my/analysis-page.js` 245줄 부근)는 360px 에서 9자리 금액이면 분류 이름이 한 글자씩 줄바꿈된다(가로 스크롤로 읽을 수는 있다).
- **T-38** (P3) /kakao-commands 예시 줄(`admin/meme-content-pages.js` 163줄)에 글자 그대로의 `\n` 이 보인다.
- **T-39** (P3, 통합 검토) 카카오 ‘얼마나 썼어’·‘얼마 나갔어’·‘지난달 얼마나 썼지?’는 “무슨 뜻인지 이해하지 못했어요”로 답한다(‘이번 달 얼마 썼어’는 이번 달 요약). ‘얼마나’·‘나갔’ 꼴을 요약 질문으로 읽지 못한다.
- **T-40** (P3, 통합 검토) 정산 완료 이력의 ‘완료일’(`features/settlement-ops-pages.js` 419줄 부근)은 `completed_at` 의 앞 10글자, 곧 UTC 날짜다. 한국 시각 00~09시에 완료하면 전날로 보인다.

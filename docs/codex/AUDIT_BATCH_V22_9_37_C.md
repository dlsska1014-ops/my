# V22.9.37 감사 묶음 C — 화면·클라이언트·내비게이션·자산

기준 감사: `docs/codex/AUDIT_FINDINGS_V22_9_33.md`(H1·U3·U6, H4, H8, H9, H11, H12, U2, U4, U5, U7, U8, U9, U10, U11, U12, U13, U14, N12).
검증: `validation/validate-audit-batch-c-v22937.mjs`(146 checks, 모두 메모리 픽스처). 고치기 전 코드에서는 143개 중 96개가 실패했다(재현 기록).

## 고친 것

| ID | 원인 | 고친 방법 |
|---|---|---|
| H1·U3 | 쿠키로 채운 진입(설치 앱 `/app`, 예산 바로가기)은 주소에 `household_id` 가 없어 클라이언트가 가계부를 비우고 보냈고 서버는 첫 가계부로 대체했다. | 공통 내비 범위 표식에 실제로 그린 가계부를 싣는다(`<div class="abNavScope" … data-ab-hh="…">`). 내비·검색·알림·행 즐겨찾기·목표·빠른 입력·활동 레일이 그 표식을 먼저 읽는다. 목표·즐겨찾기 **저장**은 가계부 없이 오면 400(`household_required`). 조회는 옛 캐시 번들을 위해 예전 규칙을 둔다. |
| U6 | 마우스 표시 설정이 가계부별 키였다. | 사용자별 키 `cursor:v1:user:<uid>` 로 저장하고 가계부 없이 읽는다. 옛 가계부별 줄은 저장할 때만 함께 남긴다(가계부 삭제 정리·기존 검사가 보는 줄). 한 번 꺼 둔 사람은 한 번 다시 꺼야 한다. |
| H4 | 참여 요청 뒤 `/my/households?household_id=<대기>` 가 200 으로 그려져 쿠키가 승인 대기 가계부를 기억했고, 이후 모든 화면이 403 이었다. 다른 계정이 로그인해도 쿠키가 남았다. | 가계부 목록 화면에서는 기억을 쓰지 않는다. 쿠키로 채운 요청이 403 이면 그 자리에서 기억을 지운다. 응답이 새 `ab_user` 세션을 발급하면(가입·로그인·카카오·복구 모두) `ab_hh` 를 함께 지운다 — `withRememberedHouseholdCookie` 한 곳에서 처리. |
| H8 | 관리자 `/households` 가 가계부마다 참여자 2회·거래 수 1회를 읽어 16개부터 요청당 예산(50회)을 넘었다. | 참여자 수는 `household_members?household_id=in.(…)` 한 번(100개씩)으로 세고, 명단은 선택한 가계부만 읽는다(`fetchHouseholdMemberCounts`). 거래 수 HEAD 조회는 가계부당 1회 그대로다. |
| H9 | 없는 가계부 id 가 `/menu`·`/start-guide`·`/households`·`/home-layout`·관리자 대시보드에서 첫 가계부로 바뀌었다(대시보드는 숨은 저장 칸까지). | "가계부를 찾을 수 없어요" 화면(404, 가계부 목록 링크)으로 답한다(`householdNotFoundResponse`). 관리자 대시보드는 호출부가 200 으로 감싸므로 본문만 안내 화면이다. |
| H11 | 나간 사람의 참여 행은 RPC 가 지우므로 `attachSpenderNames` 가 "이전 구성원"으로 그렸다. | `/u/api/*`(검색·최근·날짜) 는 `attachSpenderNamesWithHistory` 로 참여 명단에 없는 지출자의 사용자 행 이름을 한 번에 읽어 쓴다. 사용자 행도 없을 때만 "이전 구성원". |
| H12 | 웹 연결 코드 시도를 IP(20회)·IP+UA 로만 세어 같은 IP 뒤 사용자 모두가 막혔다. | 계정 로그인과 같은 틀: IP 입장 제한 40회 + `IP|코드해시` 묶음 키(`subject-client`). |
| U2 | 알림 스크립트가 배지를 시작할 때 한 번만 찾았고, 배지는 뒤에 실행되는 내비 스크립트가 만든다. | `setBadge()` 가 부를 때마다 찾고, 내비가 `ab:nav-ready` 를 알리면 다시 그린다. |
| U4 | 다크에서 로그아웃 시작 화면의 글자색만 바뀌고 미리보기·인증 카드는 흰 배경이었다. | 셸 CSS 에 `.abPageLogin` 다크 표면 규칙 추가(미리보기·인증 카드·기록 카드·말풍선·보조 글자·강조 글자). |
| U5 | 알림 키에 월이 없어 한 번 닫으면 다음 달에도 숨었다. | 서버 키에 월(납부 알림은 기한)을 붙이고, 클라이언트는 닫은 시각을 저장해 두 달 뒤 지운다. |
| U7 | 홈의 월간 리포트 링크가 `/analysis` 였고 리다이렉트가 조회 조건을 버렸다. | 링크를 `/my/analysis?month=…&household_id=…` 로 바로 걸고, 리다이렉트는 `url.search` 를 유지한다. |
| U8 | 도움말의 `code` 에 글자색이 없어 다크 본문색을 물려받았다. `/kakao-commands` 는 테마 스크립트가 없었다. | `code` 글자색·다크 규칙 추가, `/kakao-commands` 에 테마 스크립트와 다크 규칙 추가. `/budget-alert-guide` 는 소유 밖(교차 모듈 요청). |
| U9 | 로그인 바로가기 글자색이 `body.abV22812Shell a` 에 밀렸고(2.65:1), 11px 수정 폼 라벨이 보조색(4.35:1)이었다. | `.skipLink` 글자색 `!important`, 라벨은 `#475467`(밝은 카드 위 7:1), 다크는 보조 토큰. `mobile-v81-css` 는 건드리지 않고 셸에서 덮었다. |
| U10 | 고정 aria-label 이 보이는 글자와 달랐다. | 브랜드 링크는 aria-label 을 빼 보이는 글자가 이름이 된다. 챌린지 화살표는 "이전 달/다음 달 YYYY-MM로 이동", 검색·알림 닫기는 "Esc · … 닫기". 인사이트 막대는 `validate-ux-principles` 가 `insightClientMain` 해시를 고정하고 있어 보류(아래). |
| U11 | `/annual`·`/goals` 조회 줄이 `1fr` 이라 긴 이름이 버튼을 밀었다. | `minmax(0,1fr)` + `select{min-width:0;width:100%}`. |
| U12 | 로그아웃 화면에도 번들이 알림·즐겨찾기를 불러 401 이 났다. | 알림·행 즐겨찾기 로드는 `data-nav-scope="user"` 가 없으면 부르지 않는다. |
| U13 | 사용자 도움말이 운영자 화면으로 연결됐다. | `/quick-input-help`·`/kakao-commands` 의 운영자 링크는 관리자 세션에서만 그린다. |
| U14 | 일반 참여자에게도 관리자 전용 메뉴가 보여 403 을 만났다. | `renderUnifiedNav` 가 `opts.role` 을 받아 member·viewer 에게 "관리자 전용"을 붙인다(목적지 20개는 그대로). 역할을 넘기는 화면: `/app`, `/menu`, `/annual`, `/goals`, `/home-layout`, `/households`(사용자), 옛 사이드바를 승격한 화면(추론). 나머지 화면은 교차 모듈 요청. |
| N12 | 목표 마감월·즐겨찾기 날짜를 검증하지 않았다. | 마감월은 `validMonth`(400 `invalid_deadline`), 즐겨찾기 날짜는 `isValidTransactionDateString`·월은 `validMonth`(400 `invalid_date`/`invalid_month`). 읽기 경로는 저장값을 지우지 않는다. |

## 자산 주소(v22937)

셸 CSS 와 내비·V5 번들·목표·행 즐겨찾기·검색·알림 JS 의 주소를 올렸다. 옛 JS 주소 6개의 바이트와 ETag 는 `AB_HISTORICAL_RUNTIME_ASSETS` 에 그대로 남았고, `validate-immutable-asset-addresses-v2299` 가 새 주소와 옛 주소를 모두 고정한다.

## 보류·교차 모듈

- U10 인사이트 막대 비율: `validate-ux-principles.mjs` 가 `insightClientMain` 함수 해시를 고정하고 분석 화면은 기준선에서 변경 금지다. 해시 갱신 결정이 있을 때 `client/insight-main.js` 578·687 의 aria-label 에 `pct` 를 넣으면 된다.
- U8 `/budget-alert-guide`(`features/settlement-ops-pages.js`): 테마 스크립트와 다크 규칙이 필요하다.
- U14: `renderUnifiedNav` 호출부에 `role: selected.role` 을 넘기지 않은 화면(`my/insight-page.js`, `my/analysis-page.js`, `my/reports-premium.js`, `features/settlement-ops-pages.js`, `features/payment-methods-page.js`, `settings/reserve-plans.js`, `admin/budget-center-recurring.js`, `admin/category-guide-pages.js`, `my/households-lifecycle.js`, `my/members-page.js`, `admin/pc-analysis-calendar.js`)은 예전처럼 표시가 없다.
- H9: `admin/budget-center-recurring.js` 140 의 `selectScopedHousehold` 는 여전히 첫 가계부로 대체한다.
- H11: 홈 피드(`my/home-sections.js`, `my/mobile-home.js` 416)의 "이전 참여자"는 그대로다(`attachSpenderNamesWithHistory` 를 쓰면 된다).

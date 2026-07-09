# V19.7-UNIFIED-HOME 점검 보고서

> V19.3-REPORT-CLEAN-FINAL 점검 결과 위에 v19.4 변경분 점검을 추가한 문서입니다.

v19.3-report 원본을 기준으로 운영 적용 전 전체 점검을 수행한 결과입니다.
기능 추가 없이 정리·수정·검증만 진행했습니다.

## 1. 발견·수정한 문제

| # | 항목 | 심각도 | 내용 | 조치 |
|---|---|---|---|---|
| 1 | ZIP 내부 경로 | 중 | Windows 백슬래시 경로(`...\src\index.js`)로 압축되어 일부 환경에서 폴더 구조가 깨짐 | 정상 슬래시 경로로 재구성 |
| 2 | /health 이전 마커 | 중 | `mode: "global-stability-final"`, source `backup_import_v18_8` 등 v18.8 잔재 | `report-clean-final`, `backup_import_v19_3`으로 정리 |
| 3 | /budgets 가계부 범위 누출 | **높음** | 로그인 사용자가 `?household_id=`로 임의 가계부 ID를 넘기면 다른 가계부의 예산·거래·참여자 사용내역이 조회됨 | 참여 가계부 목록으로 클램핑(selectScopedHousehold) |
| 4 | /my/calendar 전체 달력 상시 펼침 | 중 | 모바일에서 화면이 과도하게 길어짐 | 기록 있는 날짜 우선 + 전체 달력 details 기본 접힘 |
| 5 | /calendar 전체 달력 기본 open | 중 | `<details open>`으로 기본 펼침 상태 | open 제거(기본 접힘), 히트맵 유지 |
| 6 | /analysis·/my/analysis 정보량 | 중 | 모바일에서 고급 분석까지 전부 펼쳐져 스크롤 과다 | 도넛/6·12개월/분류변화/반복지출/큰지출을 details 접기로 재배치, 두 화면 구조 통일 |
| 7 | /payment-methods 저장·삭제 권한 불일치 | 중 | POST 핸들러가 관리자 세션 전용이라 사용자 화면의 저장/삭제 버튼이 실제로는 동작하지 않음(관리자 로그인으로 리다이렉트) | 예산/정기지출과 동일한 owner/admin 권한 체크로 정리 |
| 8 | 권한 없는 사용자에게 버튼 노출 | 중 | /budgets, /reserve-plans, /payment-methods에서 viewer 등에게도 저장/삭제 버튼 표시 | canManage(owner/admin) 조건부 렌더링 |
| 9 | 문서 v18.8 기준 | 낮음 | FULL_AUDIT_REPORT/LOCAL_RUNTIME_TEST_REPORT/FINAL_APPLY_CHECKLIST/VERSION이 v18.8 기준 | 전부 V19.3-REPORT-CLEAN-FINAL 기준으로 재작성 |

## 2. 이상 없음을 확인한 항목

- **장기 분석 범위**: /analysis, /my/analysis의 6/12개월 조회(fetchAdminRowsRange)는 모두 현재 household_id 필터로만 조회. 가계부 미선택 시 빈 배열 처리.
- **/app, /calendar, /my/***: pcScopedContext / getMyPageContext / getScopedHouseholdsForPage가 사용자 참여 가계부로만 선택을 제한.
- **/households**: 사용자 화면은 fetchUserHouseholds 기반 — 참여하지 않은 가계부 미노출. 참여자 카드 UI 정상.
- **표시 이름 수정**: /admin/member/nickname은 household_members.nickname만 변경. 카카오 고유키(kakao_user_key)는 변경 경로 없음.
- **예산 정합성 경고**: 분류 합계 > 월 전체 예산, 월 전체 예산 > 수입 기준 모두 경고 표시(renderBudgetConsistencyAlert).
- **내부 코드값**: `__income`/`__total`은 화면에서 한글 라벨로 변환되어 노출되지 않음(런타임 테스트로 확인).
- **서버측 변경 권한**: 예산 저장/삭제, 정기지출 저장/삭제, 참여자 이름/권한 변경 모두 owner/admin 서버 체크 존재. pending/viewer/blocked는 기록 입력/수정 불가(canWriteMyHousehold).
- **safe fallback**: 사용자 화면 라우트는 safeHtmlRoute로 감싸져 있어 오류 시 Error 1101 대신 안내 페이지 응답.
- **관리자 메뉴 분리**: 운영/점검 메뉴는 renderUnifiedNav의 ops 그룹(showOps일 때만) 및 /operation-center로 분리 — 일반 사용자 메뉴에 미노출.

## 3. 수행한 검증

- `node --check src/index.js` 통과
- 렌더링된 12개 화면의 인라인 `<script>` 12개 전부 vm 문법 검사 통과
- `"async async"` 문자열 0건
- ZIP `testzip()` 무결성 통과
- mock Supabase 런타임 테스트 51건 전부 통과 (상세: LOCAL_RUNTIME_TEST_REPORT.md)
  - u1(h1만 참여) 세션으로 9개 화면 × (기본 / household_id=h2 강제) 조합 전부에서 h2 데이터(가계부명, 거래, 예산, 정기지출, 자산, 참여자, 카카오키) 미노출
  - viewer 권한에서 저장/삭제 버튼 미노출 + POST 강제 호출 시 서버 차단
  - u1이 h2에 예산/정기지출/자산 저장 시도 시 서버 차단


## 4. V19.4 변경분 점검

| 항목 | 내용 | 위험도 | 검증 |
|---|---|---|---|
| 예산 자동 산정 | budgetSummary는 원래 `__total 없으면 분류 합계` 폴백이 있었으므로 데이터 계산 로직은 무변경. UI/경고/문구만 자동 모드 중심으로 재설계 | 낮음 | 자동/직접 두 모드 렌더링 테스트 통과 |
| 초과 저장 경고 | 클라이언트 confirm — 서버 저장 로직은 무변경(권한 체크 그대로) | 낮음 | 스크립트 문법 검사 통과 |
| /app 입력 칩 | 서버에서 이번 달 rows(이미 household 스코프)로만 칩 생성 — 새 데이터 접근 없음 | 낮음 | h2 누출 테스트 포함 전체 통과 |
| 정기지출 이번 달 요약 | 기존 reserveDashboard 결과 필터링만 추가 | 낮음 | 렌더링 테스트 통과 |
| 시작가이드 체크리스트 | 사용자 첫 가계부(households[0]) 기준으로만 조회 — 스코프 유지 | 낮음 | /start-guide 스크립트·렌더링 테스트 통과 |
| 권한 구조 | owner/admin/member/viewer/pending/blocked 로직 무변경 | 없음 | 회귀 테스트 전부 통과 |


## 5. V19.5 변경분 점검

| 항목 | 내용 | 위험도 | 검증 |
|---|---|---|---|
| /app 쓰기 라우트 개방 | **v19.4까지 /app의 기록 저장/수정/삭제·고정지출이 관리자 전용이라 일반 사용자에게 동작하지 않던 구조 결함** 수정. resolveTransactionAccess로 owner/admin/member/viewer 매트릭스 적용, 수정/삭제는 DB row의 household·user_id 기준 검증(폼 값 신뢰 안 함) | **높음(수정됨)** | 12건 권한 매트릭스 런타임 테스트 통과 |
| member 지출자 강제 | member가 add/update 시 user_id를 본인으로 강제 | 중 | 테스트 통과 |
| 분류 자동 추론 | category 비면 inferCategory(전역 규칙)로 채움 — 기존 저장 동작에 추가만 | 낮음 | 추론 결과 저장 테스트 통과 |
| 한 줄 입력 | 순수 클라이언트 파서(폼 채우기만) — 서버 로직 무변경 | 낮음 | 스크립트 문법 검사 통과 |
| 드릴다운 링크 | 기존 /app 필터 파라미터 재사용 — 새 데이터 접근 없음 | 낮음 | 렌더링 테스트 통과 |
| 오늘 카드 | 이미 스코프된 rows/budget으로 계산 | 낮음 | 렌더링 테스트 통과 |


## 6. V19.6 변경분 점검 (카카오 매뉴얼 컴플라이언스)

| 항목 | 내용 | 위험도 | 검증 |
|---|---|---|---|
| 카카오 재전송 멱등 | findExactDuplicateTransaction에 옵션 시간창 추가. 카카오만 withinSeconds=120으로 재전송 합침, CSV 가져오기는 기존(시간 무관) 유지 | 중(오차단 버그도 함께 해소) | 재전송=1건, 10분 경과 반복=정상 저장 테스트 통과 |
| 개인정보 보관 기간 | /privacy·챗봇 응답에 보관/삭제 기준 문구 추가. 금지 표현 없음 | 낮음 | 문구 렌더링 테스트 통과 |
| SkillResponse 타입 | QuickReplies/Carousel 미사용 확인(코드 grep 0건) | 없음 | 정적 확인 |
| plusfriendUserKey | 레거시 폴백만, 신규 미사용 | 없음 | 정적 확인 |


## 7. V19.7 변경분 점검 (홈 단일화 · 하단탭 재편)

| 항목 | 내용 | 위험도 | 검증 |
|---|---|---|---|
| 단일 홈 | /my→/app 리다이렉트가 이미 존재함을 확인. 렌더 경로 변경 없이 /app을 정본 홈으로 정착 | 낮음 | /my 리다이렉트 테스트 통과 |
| 하단탭 재편 | 밈 탭 제거(홈 카드로 유지), 예산 탭 승격, ＋입력 중앙 강조, 스크롤 스파이 | 낮음 | 렌더·문법·80+ 런타임 테스트 통과 |
| 링크 스코프 | 예산/전체 탭이 month+household_id 파라미터를 그대로 전달 | 없음 | 렌더 출력 확인 |
| CSS 정리 | 이전 active-tab 파란 박스/검은 박스 규칙 제거, 아이콘+라벨 세로 배치로 교체 | 낮음 | 시각 렌더 확인 |


## 8. V19.7 후속 — 모바일 상단/하단 헤더 중복 수정 (코덱스 지적 반영)

실제 모바일 렌더(Playwright 390×844)로 재현한 결과, `/app`이 자체 헤더(.appTop)+하단바(.bottom)에
더해 renderUnifiedNav("app")의 모바일 상단바(abNavMobileTop)·하단바(abNavBottom)까지 함께 렌더해
**상단바 2개·하단바 2개**가 겹쳐 있었다. 코덱스가 지적한 "상단 고정헤더 자동 숨김 문제"는
고정 abNavMobileTop이 스크롤 시 숨는데 그 아래 sticky .appTop이 top:48px에 고정돼 빈 띠/겹침이
생기는 이 이중 구조의 증상이었다.

| 조치 | 내용 | 검증 |
|---|---|---|
| 중복 nav 제거 | `/app`에서 renderUnifiedNav 호출 삭제 — .appTop이 top:0 단일 sticky로 정상화, 고정 상단바/자동숨김 충돌 제거 | 렌더 계측: navTop=null, appTop top:0 |
| 하단바 5칸 고정 | 옛 4탭 잔재 `@media(max-width:420px){.bottom{repeat(4,1fr)}}` → repeat(5,1fr). 5개 탭이 한 줄 정렬 | 계측: 5칸 동일 top |
| 단일 nav 보장 | /app에 abNavBottom/abNavMobileTop 부재를 런타임 테스트로 고정 | 테스트 통과 |

결과: /app이 단일 헤더 + 단일 하단바(홈·기록·＋입력·예산·전체)로 정리됨. 데스크톱 /app은
사이드바 대신 자체 헤더+하단바+전체(/menu)로 내비게이션 제공.

# 똑똑한가계부 V19.3-REPORT-CLEAN-FINAL

Cloudflare Workers 단일 파일(`src/index.js`) + Supabase REST 기반 카카오 가계부 웹앱입니다.
이 버전은 **v19.3-report의 기능을 그대로 유지**하면서, 운영 적용을 위한 정리·검증·문서화만 수행한 clean 버전입니다.
새 기능 추가는 없습니다.

## 유지된 v19.3-report 기능

- /analysis 월간 리포트 구조, 주간 리포트(토스 스타일), 전월 대비 증감 배지
- 핵심 인사이트 카드, 분류별 지출 도넛 차트
- 최근 6개월 수입·지출 흐름, 최근 12개월 상세 표, 전월 대비 분류 변화 TOP
- 반복 지출 후보 자동 감지(매달 나가는 돈), 큰 지출 체크
- 요일별 소비 추이, 일별 소비 그래프, 캘린더 지출 히트맵(5단계)
- SERVER_DASHBOARD_CSS / MOBILE_V81_CSS 상수 분리 구조

## 이번 clean-final에서 정리한 내용

### 1. ZIP 경로 정상화
- 이전 ZIP 내부 경로가 Windows 백슬래시(`...\src\index.js`)였던 문제를 수정했습니다.
- 이제 `kakao-accountbook-cloudflare-v19.3-report-clean-final/src/index.js` 형태의 정상 경로입니다.

### 2. 버전/마커 정리
- `/health` → `version: "V19.3-REPORT-CLEAN-FINAL"`, `mode: "report-clean-final"`
- 백업 가져오기 source 마커 → `backup_import_v19_3`
- 이전 값(`backup_import_v18_8`, `global-stability-final`)은 코드에서 제거했습니다.

### 3. 캘린더 UX 정리
- /calendar: "기록 있는 날짜" 카드가 먼저 나오고, 전체 달력(히트맵 포함)은 `<details>` **기본 접힘**으로 변경.
- /my/calendar: 전체 달력이 항상 펼쳐져 모바일에서 길어지던 문제를 수정 —
  "기록 있는 날짜" 섹션을 먼저 보여주고 전체 달력은 접힘 details로 분리.

### 4. /analysis 모바일 정보량 조절 + /my/analysis 통일
- 기본 노출: 이번 달 요약(KPI), 핵심 인사이트, 주간 리포트, 일별 소비 그래프, 요일별 소비 추이
- 접기(details) 영역: 도넛 차트, 전월 대비 분류 변화, 최근 6개월 흐름(+12개월 상세), 매달 나가는 돈(반복 지출 후보), 큰 지출 체크
- /analysis와 /my/analysis 두 화면이 동일한 위젯 함수와 동일한 접기 구조를 사용합니다.

### 5. 가계부 범위(household_id) 보안 수정
- **/budgets 누출 수정**: 로그인 사용자가 쿼리스트링으로 임의 household_id를 넘기면
  다른 가계부의 예산·거래가 조회되던 문제를 수정 — 이제 참여한 가계부로만 제한됩니다.
- 최근 6/12개월 장기 분석 조회는 모두 현재 household_id로만 조회함을 검증했습니다.
- /app, /analysis, /my/*, /calendar, /reserve-plans, /payment-methods, /households, /keyword-guide 전부
  u1(h1 참여)이 h2 데이터를 볼 수 없음을 mock 런타임 테스트로 확인했습니다.

### 6. 권한별 버튼 노출 정리
- owner/admin: 예산·정기지출·자산 저장/삭제 가능 (버튼 표시)
- member/viewer/pending/blocked: 저장/삭제 버튼 미표시 + 서버측 권한 체크로 이중 차단
- /payment-methods 저장/삭제는 기존에 관리자 세션 전용이라 사용자 화면의 버튼이 동작하지 않던 문제를
  owner/admin 권한 체크 방식(예산/정기지출과 동일 패턴)으로 정리했습니다.

### 7. /budgets 정리
- 월 수입 기준 / 월 전체 예산 / 분류별 예산 합계의 정합성 경고 유지:
  분류 합계 > 월 전체 예산, 월 전체 예산 > 수입 기준 두 경우 모두 경고.
- `__income`, `__total` 내부 코드값은 사용자 화면에 그대로 노출되지 않음을 검증했습니다(한글 라벨로 변환).

### 8. /reserve-plans 정리
- 분류 입력은 직접입력 + datalist 추천목록 방식 유지.
- 매월/연1회/반기/분기 입력 방식 유지, 반복주기에 따라 납부월 칸을 자동 표시/숨김.
- owner/admin만 저장/삭제 가능(서버 체크 + 버튼 노출 제어).

### 9. /households 정리
- 로그인 사용자는 자신이 참여한 가계부만 표시.
- 참여자 관리 카드형 UI, 표시 이름(별명) 수정은 가계부 안 별명만 변경 —
  카카오 고유키(kakao_user_key/source_user_key)는 변경하지 않습니다.

## 운영 URL

| URL | 용도 |
|---|---|
| /my | 로그인/가입/가계부 없음 상태 전용 |
| /app | 홈, 입력, 기록 보기 |
| /analysis | 분석/월간 리포트 |
| /my/analysis | 사용자 분석/월간 리포트 |
| /calendar | 캘린더(히트맵) |
| /budgets | 예산 |
| /reserve-plans | 정기지출 |
| /payment-methods | 자산·결제수단 |
| /keyword-guide | 분류·키워드 |
| /households | 가계부·참여자 |

## 구조 원칙

- Cloudflare Workers 단일 파일 `src/index.js` (Node 전용 패키지/express/fs 없음)
- Supabase REST(PostgREST) 호출 구조 유지
- PC/모바일 같은 URL, CSS 반응형 대응
- 오류 시 Cloudflare Error 1101이 뜨지 않도록 safe fallback(safeHtmlRoute) 유지

## 배포

1. Cloudflare Workers 대시보드에서 기존 코드 백업
2. `src/index.js` 전체 붙여넣기 후 배포
3. `/health`에서 버전(V19.3-REPORT-CLEAN-FINAL) 확인
4. 상세 순서는 `FINAL_APPLY_CHECKLIST.md` 참조

필요 환경변수: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `USER_SESSION_SECRET`(권장)

# V21.3-HOME-CALENDAR-MERGE

## 배경
- `/my/calendar` 별도 캘린더 페이지와 홈 `/app`이 사실상 같은 데이터(월 rows)를 두 화면에서 이중 관리하고 있었습니다.
- 캘린더에서 기록을 수정하려면 별도 페이지의 자체 수정/삭제 폼을 거쳐야 해서 홈 피드의 수정 흐름과 동작이 갈라져 있었습니다.
- V21.3에서 캘린더를 홈 안으로 통합해 "캘린더 그리드 → 날짜 클릭 → 피드(date 필터) → 기존 수정/삭제/빠른입력" 전체 흐름이 한 페이지에서 동작하도록 정리했습니다.

## 반영
- **홈 캘린더 뷰**: `/app?view=calendar`에서 `renderHomeCalendarSection(rows, month, baseQs)`가 캘린더 섹션을 렌더합니다. 기존 `renderMyCalendarHtml`의 dayMap 집계(날짜별 expense/income/count)를 이 함수로 추출해 재사용했습니다. 요일 헤더(일~토)와 1일 요일 정렬을 포함한 7열 달력 그리드로, 모바일에서도 7열을 유지합니다(최소 4열 요건 충족).
- **날짜 카드 링크**: 기록 있는 날은 `/app?month=...&household_id=...&view=calendar&date=YYYY-MM-DD&feed=all#feed`로 연결되어 같은 페이지 피드에 그날 기록만 표시됩니다. 기록 없는 날은 링크 없이 흐리게 표시됩니다. 선택된 날짜는 반전 색으로 강조됩니다.
- **이전달/다음달**: `view=calendar`를 유지한 채 month만 변경합니다. 피드 표시건수 링크·필터 폼도 캘린더 뷰를 유지하도록 `view` 파라미터를 전파합니다.
- **빠른입력 프리셋**: `date` 파라미터가 있으면 빠른입력 폼의 `transaction_date` 기본값이 today 대신 그 날짜로 설정됩니다.
- **배치**: 통계 카드(homeMetrics) 아래, 피드 위. `view=calendar`가 아니면 캘린더는 렌더하지 않고 "📅 캘린더" 토글 버튼 하나만 추가해 홈 기본 화면 변화를 최소화했습니다.
- **Supabase 호출**: 기본적으로 /app이 이미 가진 월 rows를 재사용하며 `getCalendar` 재호출은 없습니다. 단, 피드 필터(date 등)가 걸린 상태에서는 rows가 해당 날짜로 좁혀져 있어 캘린더 그리드용 월 전체 rows 1회 조회만 추가로 수행합니다(그리드가 한 날짜로 붕괴하는 것 방지).
- **리다이렉트 전환**: `/my/calendar` GET은 `handleMyCalendarPage` 호출 대신 `/app?month=...&household_id=...&view=calendar#calendar` 303 리다이렉트로 전환했습니다. 미로그인 접근은 /app의 기존 세션 체크(/my 로그인 화면)에 맡깁니다. V21.2의 PC `/calendar` 보정도 체인 리다이렉트 대신 `/app?view=calendar` 직행으로 변경했습니다.
- **링크 일괄 교체**: renderUnifiedNav 2곳(돈 관리 그룹 + 단축 아이콘), appMenu(전체메뉴) 1곳, 시작가이드 2곳 + 라우트 소개 목록 1곳, /my/analysis "캘린더 보기", PC /analysis "캘린더로 보기"를 모두 `/app?...&view=calendar#calendar`로 교체했습니다. 남은 `/my/calendar` 문자열은 리다이렉트 라우트 1곳뿐입니다.
- **죽은 코드 정리**: handleMyPage의 도달 불가 블록(members/rows/stats fetch + renderMyDashboardHtml 호출), `renderMyDashboardHtml`, `handleMyCalendarPage`, `renderMyCalendarHtml`을 삭제했습니다. 이로 인해 고아가 된 `renderMyQuickStartBox`, `myStatCards`, `attachEditHistory`, `renderEditHistoryDetails`도 함께 정리했습니다(삭제 전 참조 0 확인). handleMyPage는 가계부가 있으면 /app 리다이렉트, 없으면 시작 선택 화면으로 마무리되도록 안전한 폴백을 남겼습니다.
- **버전/문서**: `APP_VERSION`을 `V21.3-HOME-CALENDAR-MERGE`로 변경(/health 반영 확인). README.md · FINAL_APPLY_CHECKLIST.md에 캘린더 접근 경로 `https://ttokttok-accountbook.com/app?view=calendar`(구주소 자동 이동)를 추가했습니다.

## 변경하지 않은 것
- `/skill` POST 처리와 카카오 스킬 응답 로직 전체 (V21.3.1 스킬 테스트 호환성 핫픽스 포함)
- `/my/transactions`, `/my/update`, `/my/delete` POST 저장 로직
- Supabase 테이블 구조, 권한/가계부 범위 체크(canManageMyRecord 등)
- 중복 저장 방어, 레이트리밋, 트래픽 가드
- 예산 계산, 밈 콘텐츠센터

## 검증
- `node --check src/index.js`: PASS
- `node smoke_v213.mjs`: PASS
  - `/health`에 `V21.3-HOME-CALENDAR-MERGE` 포함
  - `/my/calendar?month=2026-07&household_id=test` → 303 + Location `/app?month=2026-07&household_id=test&view=calendar#calendar`
  - `/app` 미로그인 → `/my`(200 로그인 화면) 안전 이동
  - `/skill` GET 안내 화면, POST(JSON/raw) quickReplies 포함 응답: PASS
- `node smoke_v2131.mjs` (카카오 스킬 테스트 회귀): PASS
- Supabase 모킹 + 로그인 세션 통합 테스트 25건: PASS
  - 홈 기본 화면은 토글 버튼만 노출, 그리드 미렌더
  - `view=calendar` 그리드 렌더, 기록 있는 날 링크/없는 날 흐림, 이전·다음달 이동 시 view 유지
  - 날짜 클릭 시 피드가 그날 기록만 표시, 캘린더 그리드는 월 전체 유지, 선택일 강조
  - 빠른입력 날짜가 선택일로 프리셋(미선택 시 today)
  - 구주소 `/my/calendar`·PC `/calendar` 리다이렉트, `/my` → `/app` 리다이렉트

## 배포 후 수동 확인
1. `/app?view=calendar` 캘린더 그리드 표시, 이전/다음달 이동 시 view 유지
2. 날짜 클릭 → 같은 페이지 피드에 그날 기록만 표시, 수정/삭제 정상
3. 날짜 선택 상태에서 빠른입력 날짜가 그 날짜로 프리셋
4. 구주소 `https://ttokttok-accountbook.com/my/calendar?month=2026-07&household_id=...` 자동 이동
5. 시작가이드/전체메뉴/분석의 캘린더 버튼 전부 홈 캘린더로 이동
6. `/skill` POST 저장, 권한 체크, 예산 알림 회귀 없음

## 참고
- 이번 작업의 기준 코드는 V21.3.1-KAKAO-SKILL-TEST-HOTFIX 번들이며, 해당 핫픽스 내용은 모두 유지된 상태에서 캘린더 통합만 추가되었습니다. 버전 문자열은 작업 지시서에 따라 `V21.3-HOME-CALENDAR-MERGE`를 사용합니다.

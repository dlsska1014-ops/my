# SQL 적용 이력과 현재 판정

## V22.8.78

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 작성 내용 보존은 브라우저 안(`sessionStorage`)에서만 일어나고 서버로 아무것도 보내지 않는다
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.77

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 로그인 만료 복구는 어디로 되돌려 보낼지만 바꾼다. 저장 경로와 표 구조는 그대로다
- 입력 초안은 브라우저 안(`sessionStorage`)에만 두고 서버에 보내지 않는다
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.76

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 카카오 의도 정리와 예산 명령 보정은 입력 해석 단계만 바꾼다. 저장 경로와 표 구조는 그대로다
- `/skill` 인증 집계는 isolate 메모리에만 남고 DB 를 쓰지 않는다
- 배포: 검증된 `src/index.js` 전체 교체 + (선택) 환경변수 `KAKAO_SKILL_AUTH_MODE`

## V22.8.75

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 통계·종합 리포트 역할 분리는 렌더 단계에서 어떤 카드를 그릴지만 바꾼다. 집계 함수·질의·데이터 계약은 그대로다
- 종합 리포트에서 코크핏을 빼면서 `buildReportDashboardSummary` 호출 한 번이 줄어든다(요약 화면에서는 그대로 호출). 질의는 늘지도 줄지도 않는다
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.74

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 예산 재검토와 다크 대비 보정은 마크업·스타일 변경만으로 처리한다
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.73

- **신규 SQL 있음**: `02_APPLY_HOUSEHOLD_PURGE_V22_8_71.sql`
- 새 RPC 를 만들지 않는다. 기존 `accountbook_purge_household_v227`(정의 위치: `schema_v22_7_0_auth_atomicity.sql`) 의 **본문만 교체**한다
- 실제 변경 3건
  - `set search_path = public` → `''` (SECURITY DEFINER 하이재킹 방지). 본문의 표 참조가 전부 `public.` 으로 정규화돼 있고, 쓰이는 함수는 `pg_catalog` 소속이라 빈 search_path 에서도 해석된다
  - 가계부 삭제 시 함께 지우는 설정 키 3종 추가: `report_challenge:<id>`, `goals:v5:<id>`(정확히 일치), `favorites:v5:<id>:`(접두 일치 — 뒤에 사용자 키가 붙는다)
  - 적용 후 확인용 비변경 조회(`purge_rpc_count`) 추가
- `drop`·`truncate` 없음. 실행 권한은 `service_role` 에만 부여하고 `public`·`anon`·`authenticated` 에서 회수
- **적용: 2026-08-06 운영자가 Supabase SQL Editor 에서 실행했다고 알려 옴.** 이 저장소에서는 운영 DB 에 접근하지 않아 직접 확인하지 못했다
- 적용 전에 삭제된 가계부의 위 설정 키는 그대로 남아 있다. 이 SQL 은 앞으로의 삭제만 완전하게 만든다
- 기존 V22.6.8·V22.7.0·V22.7.1·V22.8.46 SQL 은 재실행하지 않는다

## V22.8.72

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 본문 바로가기는 셸 삽입 지점의 마크업 변경만으로 처리하며 데이터 경로가 없다
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.71

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 카카오 되돌리기 버퍼는 기존 `accountbook_settings` 에 JSON 형태로 저장하며, 옛 단일 슬롯 형태도 계속 읽는다
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.59

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 V22.7.0의 계정 생성 RPC와 사용자 세션 보안 테이블을 그대로 사용
- 기존 SQL 재실행 금지; `/ready`의 17개 RPC·3개 테이블 통과만 확인
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.58

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 챌린지 날짜 셀과 퍼센트 전환은 기존 가계부 범위 설정값과 거래 읽기 결과만 사용
- 우측 최근 기록은 기존 로그인 세션 범위 GET API의 표시만 개선하며 쓰기 경로 없음
- 기존 V22.6.8·V22.7.0·V22.7.1 및 V22.8.46 SQL 재실행 금지
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.57

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 우측 최근 기록은 기존 거래 조회와 세션 가계부 범위를 재사용하는 읽기 전용 API
- 챌린지의 시작일·목표일은 기존 `accountbook_settings` JSON 값에 추가되며 테이블 변경 없음
- 환경변수·Secret·Kakao Developers·OpenBuilder 변경 없음
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.56

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 월간 챌린지는 기존 `accountbook_settings`에 가계부별 JSON 설정으로 저장
- 읽기는 해당 가계부 구성원 범위, 설정 변경은 소유자·관리자 권한으로 제한
- 기존 URL·거래·예산·리포트 데이터 구조 변경 없음
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.46

- 신규 SQL: `01_APPLY_MEMBER_ROLE_SCHEMA_V22_8_46.sql`
- 운영 근거: V22.8.45에서 승인대기→관리자 저장 시 DB 역할 규칙 오류가 화면에 확인됨
- 변경 범위: `public.household_members.role`의 허용 역할에 `admin` 추가
- 타입 대응: 텍스트 CHECK 또는 PostgreSQL enum 자동 판별
- 데이터 보호: 기존 참여자 행 INSERT·UPDATE·DELETE 없음, 알 수 없는 역할·제약이면 transaction 중단
- 변경하지 않음: RLS, GRANT, RPC, 인덱스, 환경변수
- 적용 완료 기준: SQL 결과의 `admin_allowed=true`, `invalid_role_count=0`, `readiness_ok=true`
- 이 저장소 작업에서는 SQL을 실행하지 않았으며 운영 적용은 사용자 수동 단계

## V22.8.44

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 공통 셸의 색상 토큰·반응형 터치 영역·보조 디스플레이 CSS만 보강
- 운영 `/ready`가 정상인 환경에서는 기존 SQL 재실행 없음
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.43

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 `accountbook_settings`와 `accountbook_claim_operation`·`accountbook_release_operation` 재사용
- 정산·목표 JSON 쓰기의 strict read와 실패 피드백은 Worker 코드에서 보강
- 운영 `/ready`가 정상인 환경에서는 V22.6.8·V22.7.0·V22.7.1 재실행 없음
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.42

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 `accountbook_claim_operation`·`accountbook_release_operation`으로 자산 변경을 가계부 단위 직렬화
- 기존 `accountbook_mutate_payment_assets_v2271`과 `accountbook_replace_budget_plan_v227` 재사용
- 운영 `/ready`가 정상인 환경에서는 V22.6.8·V22.7.0·V22.7.1 재실행 없음
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.41

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 `accountbook_claim_operation`·`accountbook_release_operation` RPC를 일반 웹 거래 중복 제출 직렬화에 재사용
- 운영 `/ready`가 정상인 환경에서는 V22.6.8·V22.7.0·V22.7.1 복구 SQL 재실행 없음
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.40

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- `/ready`가 기존 RPC의 실제 파라미터 이름으로 시그니처 존재를 안전하게 판정하도록 Worker 코드만 수정
- V22.6.8·V22.7.0·V22.7.1 SQL 재실행 없음
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.39

- 신규 스키마 설계: 없음
- 저장소에 복원한 기존 원본: `schema_v22_6_8_operations_integrity.sql`, `schema_v22_7_0_auth_atomicity.sql`, `schema_v22_7_1_asset_dashboard.sql`
- 복원 근거: Git commit `cdedaf69a8a81609728f1e61184fc1dd6e478148`의 blob과 SHA-256 일치
- 적용 조건: 운영 `/ready`가 필수 RPC 누락을 보고하는 환경
- 적용 순서: Supabase 백업 → V22.6.8 무결성 검사·적용 → 성공 확인 → V22.7.0 인증·원자성 적용 → 자산 원자성 RPC가 모두 없을 때 V22.7.1 적용 → Worker 배포 → `/ready` 200 확인
- 중단 조건: V22.6.8 중복 검사 실패, SQL transaction 실패, 예상 밖 데이터 변경, `/ready`의 테이블 오류
- 이 저장소 작업에서 SQL은 실행하지 않았으며 운영 적용은 별도 승인·수동 단계

## V22.8.38

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 기존 `accountbook_settings`와 `accountbook_claim_operation`·`accountbook_release_operation` RPC 재사용
- 이유: 목표·즐겨찾기를 기존 설정 저장소에 통합하고 목표 동시 쓰기만 기존 잠금으로 보호
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.25

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 기존 검색·빠른 입력·예산 알림·화면 설정 경로를 공통 외부 런타임으로 연결하고 홈 활성 메뉴를 교정
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.24

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: UI V5 공통 셸의 메뉴 판정·반응형 드로어·키보드 접근성과 버전형 정적 자원만 변경
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.20

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 기존 거래 테이블과 설정 저장소를 이용한 카카오 수정·복구 및 웹 응답 피드백 통합
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.17

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 공개 소유권 메타·`/ads.txt`, 광고 심사 경계, 홈·달력·분석 CSS와 마크업만 변경
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.16

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 사용자 화면 marker, CSS 표면·대비와 새 immutable CSS 경로만 변경
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.15

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 인증 화면 marker, CSS 범위·대비와 새 immutable CSS 경로만 변경
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.14

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 홈 링크 표식, CSS 우선순위와 새 immutable CSS 경로만 변경
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.13

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 화면 범위 marker, CSS 대비와 새 immutable CSS 경로만 변경
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.12

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 버전형 CSS·JavaScript, 브라우저 로컬 화면 설정, 대비 토큰만 변경
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.11

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 정적 CSS·JavaScript 자원, 화면 body marker, 내비게이션 표시만 변경
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## 최근 버전

| 버전 | 업데이트 때 SQL 실행 | 비고 |
|---|---:|---|
| V22.8.20 | 없음 | 카카오 수정·삭제·복구 V4·웹 인라인 피드백 |
| V22.8.19 | 없음 | 전체 색상·대비 회귀 보정 |
| V22.8.17 | 없음 | AdSense 심사 안전·V2 홈/달력/분석 UX |
| V22.8.16 | 없음 | 사용자 화면 전체 대비 |
| V22.8.15 | 없음 | 다크 인증 화면 대비 |
| V22.8.14 | 없음 | 홈 전체 조회 버튼 대비 |
| V22.8.13 | 없음 | 다크모드 전체 보정 |
| V22.8.12 | 없음 | 접근성 테마·대비 |
| V22.8.11 | 없음 | 홈 UX 셸 확장 |
| V22.8.10 | 없음 | 홈 성능·공통 자원 |
| V22.8.9 | 없음 | 계정·가계부 보안 분리 |
| V22.8.8 | 없음 | UX 피드백 |
| V22.8.7 | 없음 | 카카오 그룹 응답 |
| V22.8.6 | 없음 | 영수증 안정화 |
| V22.8.5 | 없음 | 모바일 접근·메뉴 |
| V22.8.4 | 없음 | UI·성능 재검증 |
| V22.8.3 | 없음 | 안정화 병합 |
| V22.8.2 | 없음 | 인증 안정화 |
| V22.8.1 | 없음 | UI·UX 개편 |
| V22.8.0 | 있음 | 자산·결제수단 기반 스키마 |

과거 SQL 원본은 과거 배포본의 신규 설치·장애 복구 자료입니다. V22.8.20 적용을 위해 실행하지 않습니다. 성능 인덱스는 운영 행 수와 실행 계획에서 병목이 확인될 때만 별도 버전으로 검토합니다.

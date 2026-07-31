# 배포 적용 매트릭스

| 버전 | `src/index.js` 전체 교체 | 신규 SQL | 환경변수 | Kakao Developers | OpenBuilder | 핵심 |
|---|---:|---:|---:|---:|---:|---|
| V22.8.58 | 필요 | 없음 | 없음 | 없음 | 없음 | 7일 이하 날짜형 챌린지·8일 이상 퍼센트·최근 기록 SVG/정보 위계 개선 |
| V22.8.57 | 필요 | 없음 | 없음 | 없음 | 없음 | 홈 우측 기록 복원·폭/브랜드/접기 버튼·챌린지 날짜/진행 계산 보정 |
| V22.8.56 | 필요 | 없음 | 없음 | 없음 | 없음 | 리포트 월 탐색·중앙 대시보드·월간 챌린지·사이드바 겹침 수정 |
| V22.8.55 | 필요 | 없음 | 없음 | 없음 | 없음 | 피드 카드 마크업 축소·실사용 예산 측정 |
| V22.8.54 | 필요 | 없음 | 없음 | 없음 | 없음 | 조회 페이지 크기 500→1000, DB 왕복 축소 |
| V22.8.53 | 필요 | 없음 | 없음 | 없음 | 없음 | 홈 예산 사용률 표기 상한 제거 |
| V22.8.52 | 필요 | 없음 | 선택(`SKILL_IP_GUARD_LIMIT`) | 없음 | 없음 | 스킬 IP 상한·CSV 수식 차단·가계부 이름 검증 완화 |
| V22.8.51 | 필요 | 없음 | 없음 | 없음 | 없음 | 소액 금액 저장 복구·한 줄 입력 파서 복구·월 범위 검증 |
| V22.8.50 | 필요 | 없음 | 없음 | 없음 | 없음 | PC 빠른 실행 독·저장 피드백·선택 날짜 복귀 |
| V22.8.49 | 필요 | 없음 | 없음 | 없음 | 없음 | PC 중앙 빠른입력·모바일 바텀시트·날짜 연동 입력 |
| V22.8.48 | 필요 | 없음 | 없음 | 없음 | 없음 | 날짜 클릭 일별 거래 상세 팝업 |
| V22.8.47 | 필요 | 없음 | 없음 | 없음 | 없음 | 좌측 캘린더·실제 예산 사용률 |
| V22.8.46 | 필요 | 필요 | 없음 | 없음 | 없음 | DB 역할 규칙에 `admin` 추가·관리자 승격 완성 |
| V22.8.45 | 필요 | 없음 | 없음 | 없음 | 없음 | 참여자 권한 저장 Error 1101 차단·실패 시 기존 권한 보존 |
| V22.8.44 | 필요 | 없음 | 없음 | 없음 | 없음 | 라이트 보조 텍스트·테마 대비·모바일/보조 디스플레이 접근성 |
| V22.8.43 | 필요 | 없음 | 없음 | 없음 | 없음 | 정산·목표 JSON strict read·동시 저장·실패 피드백 |
| V22.8.42 | 필요 | 없음 | 없음 | 없음 | 없음 | 자산 동시 쓰기·스냅샷 피드백·예산 fallback 정합성 |
| V22.8.41 | 필요 | 없음 | 없음 | 없음 | 없음 | 명시 가계부 범위·예산 삭제·거래 중복/수정 피드백 안전화 |
| V22.8.40 | 필요 | 없음 | 없음 | 없음 | 없음 | `/ready` RPC 시그니처 존재 판정 핫픽스 |
| V22.8.39 | 필요 | 없음·기존 SQL 복구 조건부 필요 | 없음 | 없음 | 없음 | 가계부 범위·cron/QA 인증·readiness 운영 보강 |
| V22.8.38 | 필요 | 없음 | 없음 | 없음 | 없음 | V5 연간·목표·전 기간 검색·알림·즐겨찾기 통합 안정화 |
| V22.8.25 | 필요 | 없음 | 없음 | 없음 | 없음 | UI V5 검색·빠른 입력·예산 알림·화면 설정 전역 작업 |
| V22.8.24 | 필요 | 없음 | 없음 | 없음 | 없음 | UI V5 현재 메뉴·900px 드로어·키보드 접근성 정확도 보정 |
| V22.8.23 | 필요 | 없음 | 없음 | 없음 | 없음 | UI V5 나머지 로그인 화면·구형 내부 메뉴 통합 3단계 |
| V22.8.22 | 필요 | 없음 | 없음 | 없음 | 없음 | UI V5 홈·분석·정산 본문 공통 컴포넌트 2단계 |
| V22.8.21 | 필요 | 없음 | 없음 | 없음 | 없음 | UI V5 공통 셸·238px 사이드바·SVG 아이콘 1단계 |
| V22.8.20 | 필요 | 없음 | 없음 | 없음 | 없음 | 카카오 수정·삭제·복구 V4와 웹 인라인 피드백 통합 |
| V22.8.19 | 필요 | 없음 | 없음 | 없음 | 없음 | 전체 색상·대비 회귀 보정 |
| V22.8.18 | 필요 | 없음 | 없음 | 없음 | 없음 | UI·UX 4단계 메뉴·테마·반응형 통합 |
| V22.8.17 | 필요 | 없음 | 없음 | 없음 | 없음 | AdSense 심사 안전·V2 홈/달력/분석 UX |
| V22.8.16 | 필요 | 없음 | 없음 | 없음 | 없음 | 사용자 화면 전체 라이트·다크 대비 |
| V22.8.15 | 필요 | 없음 | 없음 | 없음 | 없음 | 다크 로그인·계정보안 표면 대비 |
| V22.8.14 | 필요 | 없음 | 없음 | 없음 | 없음 | 홈 전체 조회 버튼 다크모드 대비 |
| V22.8.13 | 필요 | 없음 | 없음 | 없음 | 없음 | 예산·정산·내 설정 다크모드 전체 보정 |
| V22.8.12 | 필요 | 없음 | 없음 | 없음 | 없음 | 접근성 대비·라이트/다크/시스템·컬러톤 |
| V22.8.11 | 필요 | 없음 | 없음 | 없음 | 없음 | 홈 UX 셸 승격·주요 사용자 화면 확장 |
| V22.8.10 | 필요 | 없음 | 없음 | 없음 | 없음 | 홈 묶음 조회·공통 자원 캐시 |
| V22.8.9 | 필요 | 없음 | 없음 | 없음 | 없음 | 계정 보안·가계부 분리 |
| V22.8.8 | 필요 | 없음 | 없음 | 없음 | 없음 | 행동별 진행·비밀번호 피드백 |
| V22.8.7 | 필요 | 없음 | 없음 | 없음 | 없음 | 그룹 응답 규격 정합성 |
| V22.8.6 | 필요 | 없음 | 없음 | 없음 | 없음 | 영수증 OCR 안정화 |
| V22.8.5 | 필요 | 없음 | 없음 | 없음 | 없음 | 모바일 접근·메뉴 |
| V22.8.4 | 필요 | 없음 | 없음 | 없음 | 없음 | UI·성능 재검증 |
| V22.8.3 | 필요 | 없음 | 없음 | 없음 | 없음 | 안정화본 병합 |
| V22.8.2 | 필요 | 없음 | 없음 | 없음 | 없음 | 인증·세션 안정화 |
| V22.8.1 | 필요 | 없음 | 없음 | 없음 | 없음 | UI·UX 위계 |
| V22.8.0 | 필요 | 있음 | 당시 적용 | 당시 적용 | 당시 적용 | 자산·결제수단 기반 |

## V22.8.49 적용 판단

- Cloudflare Worker: 검증된 `src/index.js` 전체 교체
- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 V22.8.46 역할 SQL이 미적용 상태라면 SQL을 먼저 적용하고 `readiness_ok=true` 확인
- 환경변수·Secret·Kakao Developers·OpenBuilder: 변경 없음
- 적용 후 `/health` 버전, 세 신규 immutable 자산, PC 중앙 모달, 모바일 바텀시트, 선택 날짜와 테스트 저장 확인

## V22.8.46 적용 판단

- Supabase: 백업 확인 후 `01_APPLY_MEMBER_ROLE_SCHEMA_V22_8_46.sql` 전체 1회 실행
- SQL 완료 기준: `admin_allowed=true`, `invalid_role_count=0`, `readiness_ok=true`
- Cloudflare Worker: SQL 성공 후 검증된 `src/index.js` 전체 교체
- 기존 참여자 행·RLS·GRANT·RPC·인덱스: 변경 없음
- 환경변수·Secret·Kakao Developers·OpenBuilder: 변경 없음
- 운영 적용 전 V22.8.45 Worker 소스 백업
- 적용 후 `/health` V22.8.46, `/ready` HTTP 200, 승인대기→관리자 상태 유지 확인

## V22.8.45 적용 판단

- Cloudflare Worker: 검증된 `src/index.js` 전체 교체
- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 환경변수·Secret·Kakao Developers·OpenBuilder: 변경 없음
- 운영 적용 전 V22.8.44 Worker 소스 백업
- 적용 후 `/health`의 `V22.8.45-MEMBER-ROLE-SAFE-UPDATE`, `/ready` HTTP 200 확인
- 테스트 참여자의 승인대기→관리자 저장과 새로고침 후 상태 유지 확인

## V22.8.44 적용 판단

- Cloudflare Worker: 검증된 `src/index.js` 전체 교체
- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 V22.8.43 정산·목표 저장 계약과 DB 객체 그대로 유지
- 환경변수·Secret·Kakao Developers·OpenBuilder: 변경 없음
- 운영 적용 전 V22.8.43 Worker 소스 백업
- 적용 후 `/health`의 `V22.8.44-THEME-CONTRAST-ACCESSIBILITY`, `/ready` HTTP 200, `/assets/accountbook-shell-v22844.css`의 immutable·ETag 확인
- 운영 결과(2026-07-28): 배포 후 자동 확인 PASS, `/ready` 필수 RPC 17개 확인

## V22.8.43 적용 판단

- Cloudflare Worker: 검증된 `src/index.js` 전체 교체
- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 operation lease와 `accountbook_settings` 재사용
- 기존 V22.6.8·V22.7.0·V22.7.1 SQL: `/ready`가 정상이라면 재실행 금지
- 환경변수·Secret·Kakao Developers·OpenBuilder: 변경 없음
- 운영 적용 전 V22.8.42 Worker 소스 백업
- 적용 후 `/health`의 `V22.8.43-SETTLEMENT-GOAL-CONSISTENCY`와 `/ready` HTTP 200 확인

## V22.8.42 적용 판단

- Cloudflare Worker: 검증된 `src/index.js` 전체 교체
- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 operation lease와 `accountbook_mutate_payment_assets_v2271`·`accountbook_replace_budget_plan_v227` RPC 재사용
- 기존 V22.6.8·V22.7.0·V22.7.1 SQL: `/ready`가 정상이라면 재실행 금지
- 환경변수·Secret·Kakao Developers·OpenBuilder: 변경 없음
- 운영 적용 전 V22.8.41 Worker 소스 백업
- 적용 후 `/health`의 `V22.8.42-ASSET-BUDGET-CONSISTENCY`와 `/ready` HTTP 200 확인

## V22.8.41 적용 판단

- Cloudflare Worker: 검증된 `src/index.js` 전체 교체
- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 V22.6.8·V22.7.0·V22.7.1 SQL: `/ready`가 이미 정상이라면 재실행 금지
- 환경변수·Secret·Kakao Developers·OpenBuilder: 변경 없음
- 운영 적용 전 V22.8.40 Worker 소스 백업
- 적용 후 `/health`의 `V22.8.41-OPERATIONS-WRITE-SAFETY`와 `/ready` HTTP 200 확인

## V22.8.39 적용 판단

### Cloudflare Worker

- 적용 파일: `src/index.js`
- 방식: 검증된 파일 전체 교체
- 부분 붙여넣기: 금지
- 런타임 버전: `V22.8.39-OPERATIONS-HARDENING`
- 새 정적 자원 경로:
  - `/assets/accountbook-shell-v22838.css`
  - `/assets/accountbook-nav-v22836.js`
  - `/assets/accountbook-v5-v22838.js`
  - `/assets/accountbook-search-v22836.js`
  - `/assets/accountbook-notif-v22836.js`
  - `/assets/accountbook-goals-v22836.js`
- 그대로 보존되는 이전 경로:
  - `/assets/accountbook-shell-v22819.css`는 새 HTML에서 사용하지 않음
- 그대로 보존되는 기존 경로:
  - `/assets/accountbook-theme-v22812.js`
- 그대로 보존되는 기존 경로:
  - `/assets/accountbook-shell-v22811.css`
  - `/assets/mobile-home-shell-v22811.js`
  - `/assets/mobile-home-v22810.css`
  - `/assets/mobile-home-v22810.js`

### 데이터베이스

- 신규 설계 SQL·테이블·컬럼·RLS·RPC·인덱스: 없음
- 복구 자료: `schema_v22_6_8_operations_integrity.sql`, `schema_v22_7_0_auth_atomicity.sql`, `schema_v22_7_1_asset_dashboard.sql`
- 운영 `/ready`가 `missing_rpcs`를 반환하는 환경만 Supabase 백업 후 V22.6.8 → V22.7.0 → 필요한 경우 V22.7.1 순서로 적용
- V22.6.8이 중복 데이터로 중단되면 V22.7.0을 계속 실행하지 말고 감사·정리를 먼저 수행
- 세 파일은 Git 이력의 원본 blob과 일치하며 이 저장소 작업에서는 실행하지 않음

### 환경과 외부 콘솔

- 신규 환경변수·Secret: 없음
- Cloudflare native Cron Trigger는 변경 없음. 외부 HTTP 예약 호출을 사용 중이면 GET/query 방식에서 POST + `x-cron-secret` 또는 Bearer 방식으로 변경 필요
- 기존 게시자 환경값은 변경하지 않으며 심사 소유자 고정값보다 우선하지 않음
- Kakao Developers 앱 키·Redirect URI·동의항목: 변경 없음
- OpenBuilder Skill URL·블록·엔티티·파라미터: 변경 없음

### 보호 화면

- 홈 저장·분석 필터·CSV·예산·참여자·백업·정산 계산 및 완료 저장의 기존 동작 계약 유지
- 영수증 OCR DOM·스크립트·POST 필드, 백업 적용, 로그인·계정 보안 form 유지

### AdSense 심사 경계

- 홈·정책·주요 공개 콘텐츠: 정확한 소유권 메타 1회
- `/ads.txt`: 승인 판매자 1줄
- 개인·관리자 화면: 광고 메타·런타임·쿠키 코드 제외
- 승인 전 광고 실행 스크립트: 없음

운영 SQL 실행·배포와 실기기 확인은 이 저장소 작업에 포함되지 않습니다. V22.8.44 코드 문제면 배포 직전 백업한 V22.8.43 Worker 소스로 전체 롤백하고, 복구한 기존 DB 객체는 임의 삭제하지 않습니다.

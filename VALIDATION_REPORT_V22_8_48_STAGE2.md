# V22.8.48 UI/UX Stage 2 Validation Report

버전: `V22.8.48-UIUX-STAGE2-DAY-DETAIL-POPUP`

## 구현 범위

- PC 좌측 미니 캘린더 날짜 클릭 → 중앙 일별 상세 모달
- 홈 전체 캘린더의 기록 날짜 클릭 → 동일 모달
- 모바일 화면 → 하단 바텀시트
- 날짜별 지출·수입 합계, 거래 건수, 메모, 분류, 결제수단, 구성원, 금액 표시
- 참여 가계부만 조회하는 읽기 전용 `/u/api/day-transactions`
- 전체 기록 보기에서 기존 날짜 필터 화면 유지
- Esc 닫기, 포커스 가두기, 닫은 뒤 선택 날짜로 포커스 복귀

## 자동검사

- 영수증: 56
- 카카오 그룹: 22
- 카카오 수정·삭제·복구: 130
- 가계부 보안: 75
- 참여자 역할 스키마: 20
- UX 원칙: 56
- 화면·성능: 144
- AdSense·V2·UI V5: 261
- V5 안정화: 41
- 핵심 쓰기·권한: 97
- UI/UX 1단계 누적: 24
- UI/UX 2단계: 48

총 **974개 통과**.

추가로 다음 검사를 통과했다.

- `node --check src/index.js`
- ES module `default.fetch`
- 익명 접근 401
- 잘못된 날짜 400
- 참여하지 않은 가계부 404
- owner·viewer의 참여 가계부 조회 200
- 조회 전후 거래 건수 동일
- 빈 날짜 응답
- 실제 메모·분류·결제수단·구성원 반환
- immutable CSS/JS 자산과 ETag

## 크기

QA fixture 기준:

- 기본 `/app` HTML: 35,765 bytes / 제한 35,840 bytes
- 캘린더 보기 HTML: 39,670 bytes
- 셸 CSS: 102,306 bytes
- V5 외부 JS: 33,972 bytes
- 일별 API 응답 예시: 367 bytes

기본 홈 HTML 크기는 1단계와 동일하며 2단계 팝업 마크업과 동작은 외부 JS에서 생성한다.

## 변경하지 않은 영역

- Supabase 테이블·컬럼·RLS·RPC
- 거래 저장·수정·삭제 로직
- 권한·중복 방지
- 카카오 Skill·OpenBuilder
- 환경변수·Secret

## 잔여 확인

- 실제 iOS Safari와 Android Chrome의 바텀시트 높이·키보드 동작은 운영 배포 후 확인이 필요하다.
- 팝업은 하루 최대 250건을 표시하고, 초과분은 `전체 기록에서 보기`로 이동한다.
- 빈 날짜에서 바로 기록하는 빠른입력 팝업은 3단계 범위다.

`src/index.js` SHA-256:

`c47dae29a50683597a22a11d304bd6dbc2d0dc880b1d89889b71e71ff206b637`

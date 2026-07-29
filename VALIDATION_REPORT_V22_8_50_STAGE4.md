# V22.8.50 UI/UX Stage 4 Validation Report

버전: `V22.8.50-UIUX-STAGE4-QUICK-DOCK-SAVE-FEEDBACK`

## 구현 범위

- PC 본문 하단 빠른 실행 독
- 거래 검색·빠른 입력·알림·화면 설정 연결
- 빠른 입력 주요 동작 강조
- 성공·예산 경고·오류 통합 피드백 카드
- 성공 저장 뒤 선택 날짜 일별 상세 자동 복귀
- 오류 저장 뒤 선택 날짜 빠른 입력 자동 복귀
- 일회성 `msg`·`err`·`balert`·`quick`·`day_detail` URL 상태 정리
- 기존 `section#add` 입력폼과 기존 `/admin/transactions` 저장 경로 재사용

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
- UI/UX 2단계 누적: 48
- UI/UX 3단계 누적: 57
- UI/UX 4단계: 89

총 **1,120개 통과**.

추가 통과 항목:

- `node --check src/index.js`
- ES module `default.fetch`
- 성공 POST가 선택 날짜·캘린더·`day_detail=1`을 유지하는지 확인
- 오류 POST가 선택 날짜·`quick=1`을 유지하고 거래를 생성하지 않는지 확인
- 기존 입력폼·거래 POST·권한·중복 방지 계약 유지
- 신규 거래 쓰기 API 없음
- 신규 immutable CSS·내비게이션 JS·V5 JS 및 ETag
- 패키지 내부 SHA-256 전수 검사

## 브라우저 렌더링

격리 QA fixture의 HTML·정적 자원을 인라인 렌더링하고 시스템 Chromium과 Playwright로 확인했습니다.

### PC 1440 × 1000

- 빠른 실행 독: 446.1 × 62px
- 독 위치: 본문 영역 하단 중앙, 하단 여백 18px
- 성공 피드백: 520 × 72px, 독 위에 표시
- 문서 가로폭: 1,440 / 1,440px
- 브라우저 JavaScript 오류: 0건

### 모바일 390 × 844

- 빠른 입력 바텀시트: 390 × 776.5px
- 오류 피드백: 366 × 86.7px
- 오류 피드백을 모바일 하단 메뉴 위에 배치
- 선택 날짜: `2026-07-18`
- 문서 가로폭: 390 / 390px
- 브라우저 JavaScript 오류: 0건

렌더 화면:

- `docs/uiux/V22_8_50_STAGE4_DESKTOP_DOCK_FEEDBACK.png`
- `docs/uiux/V22_8_50_STAGE4_MOBILE_ERROR_RETURN.png`

## 크기

QA fixture 기준:

- 기본 `/app` HTML: 35,765 bytes / 제한 35,840 bytes
- 셸 CSS: 109,948 bytes
- V5 외부 JS: 45,080 bytes
- 내비게이션 JS: 18,724 bytes

피드백 마크업은 저장 결과가 있을 때만 서버 HTML에 포함됩니다. 기본 홈 HTML 크기는 3단계와 동일합니다.

## 소스 변경량

V22.8.49 대비 `src/index.js`:

- 추가 148줄
- 삭제 21줄

## 변경하지 않은 영역

- Supabase 테이블·컬럼·RLS·RPC
- 거래 저장·수정·삭제의 기존 데이터 계약
- 카카오 Skill·OpenBuilder
- 환경변수·Secret

V22.8.46 참여자 역할 SQL은 사용자가 운영 Supabase에 적용 완료했다고 확인했습니다. 이번 단계의 추가 SQL은 없습니다.

## 잔여 확인

- 실제 iOS Safari와 Android Chrome에서 가상 키보드가 열린 상태의 바텀시트·오류 카드 위치를 운영 배포 후 확인해야 합니다.
- 현재 저장은 안전한 기존 POST·페이지 복귀 방식을 유지합니다. 모달 내부 비동기 저장과 목록 부분 갱신은 이번 단계에 포함하지 않았습니다.

`src/index.js` SHA-256:

`3a746890c92104ce40eda3bbbec190ae19b98f2105e2a09107e6bbd845864c78`

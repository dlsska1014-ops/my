# V22.8.11 홈 UX 셸 확장 보고서

## 결과

Claude UI 시안의 시각 방향을 기존 Worker의 데이터·인증·권한 구조 위에 선택적으로 재구현했습니다. React, localStorage, 예시 데이터는 포함하지 않았습니다.

## 적용 범위

- 홈: 토큰, 카드, 238px PC 사이드바, 모바일 하단 메뉴
- 주요 사용자 화면: 통합 내비게이션, 개인 appMenu, 로그인, 내 계정·보안, 가계부 시작
- 접근성: 모바일 입력 16px, 터치 44px, `focus-visible`, reduced motion
- 내비게이션: 현재 항목 하나, `home→app`, `keyword-guide→categories`, `members→households`
- 셸 경계: 통합 내비게이션 출력의 `data-nav-scope="user|ops|admin"` 표식을 기준으로 사용자 셸 적용 여부 결정

공통 CSS는 `body.abV22811Shell` 아래에만 적용합니다. `user` 범위 또는 명시적 개인·로그인·시작·모바일 표식만 셸을 받고, `ops`·`admin` 범위는 항상 제외합니다. 공개 마케팅, 운영·진단, 레거시 관리자, 관리자 가계부·계정 감사 화면은 대상이 아닙니다. PC 통합 내비게이션은 고우선순위 기존 규칙보다 강하게 238px 폭과 동일한 본문 offset을 사용하며 접힌 상태는 기존 compact 폭을 유지합니다.

흰 글자를 쓰는 일반 form 동작에는 `#2563eb` action token을 사용하고 `#3182f6`은 장식·soft accent로 유지합니다.

## 보호한 동작

- 인증·권한·가계부 수명주기·DB 조회와 저장
- 영수증 OCR DOM·스크립트·POST 필드
- 백업 가져오기·적용 내부 로직
- 로그인과 내 계정·보안 form action·field
- 분석 클라이언트와 렌더러 바이트 해시
- V22.8.10 기본 자산 바이트와 ETag

## 성능

- `/my`: DB 요청 4회 이하
- `/app`: DB 요청 9회 이하
- 개인 홈 HTML: 35KB 미만
- 정적 자원: DB 0회, immutable, GET·HEAD 지원
- 홈 외 화면: CSS 링크 한 건만 추가

## 배포 분류

- Worker: 전체 `src/index.js` 교체 필요
- SQL·스키마·RLS·RPC·인덱스: 없음
- 환경변수·Secret: 없음
- Kakao Developers·OpenBuilder: 없음
- 운영 배포·실기기 검수: 별도 수동 단계

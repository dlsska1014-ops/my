# V22.5 검증 보고서

검증일: 2026-07-14

## 통과

- `node --check src/index.js`
- ES module import
- `smoke_v222.mjs` 분석 인증·app.js·CSV 보안
- `smoke_v224.mjs` 공개 페이지·온보딩·자연어
- `smoke_v2241_identity.mjs` 사용자 식별·owner·계정 통합
- `smoke_v2241_full.mjs` 거래·예산·요약·정산·초대·닉네임 전체 회귀
- `smoke_v2242_public.mjs` 공개 정책·푸터·사이트맵
- `smoke_v223.mjs` NLU 운영 RPC·비식별 설정
- `smoke_v225_uiux.mjs` 선택 병합 신규 기능
- NLU 평가 4,738/4,738
- Supabase 요청당 450ms 지연 시험 약 3.9초
- ZIP 무결성 검사

## V22.5 신규 검증

- 분류 `식비|외식` 2건 집계
- 현재 월 `지난달 같은 기간 대비`
- 예산 페이스 클라이언트 포함
- URL 특수문자 인코딩·복원 코드
- 거래 행 날짜 이동 링크
- 필터 `aria-pressed`
- CSV 수식 주입 방어 유지
- 분석 서버 오류 안전모드
- 모바일 메뉴 자동 접힘 코드
- 공개 루트·사이트맵 유지

## 제한

- 실제 iOS Safari·Android WebView 기기 테스트는 배포 후 수행 필요
- 9,000건을 넘는 실제 운영 가계부의 체감 성능은 운영에서 추가 측정 필요
- PWA는 이번 버전에 포함하지 않음

## 변경 범위 무결성

- `KAKAO_OPENBUILDER_UTTERANCES.md` SHA-256 동일
- 패키지 루트의 모든 SQL 파일 SHA-256 동일
- manifest·service worker·PWA 코드 미포함

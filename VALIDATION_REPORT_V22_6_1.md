# V22.6.1 검증 보고서

## 기준

- 원본 ZIP: `kakao-accountbook-cloudflare-v22.6-premium-foundation-hidden-incomplete-features(3).zip`
- 원본 SHA-256: `87d3f5cb9f7ea5ec3e2d0e4487838c68113139306334b1974ea543a44080ed5f`
- 결과 버전: `V22.6.1-IDENTITY-SESSION-HOUSEHOLD-LIST-RECOVERY-HOTFIX`

## 전용 재현시험

`smoke_v2261_identity_session_recovery.mjs`

- 과거 `identity_merge_audit:*`만 있는 보조 계정 세션 복구
- 주 계정 세션 쿠키 재발급
- 기존 가계부 목록 표시
- `Bin (통합됨)` 보조 닉네임 미사용
- `/my`에서 신규 시작 화면 대신 기존 가계부 진입
- 보조 계정 세션 POST 본문 유지
- 신규 가계부 참여 역할을 주 계정에 저장
- 보조 계정 참여 행 재생성 차단

결과: 전 항목 통과

## 회귀시험

- V22.6 프리미엄·숨김 기능 smoke 통과
- V22.5.4 대화 상태·권한·동시성 321 assertions 통과
- V22.5.3 생성·지출자 수정 통과
- V22.5.2 대표 명령어 통과
- V22.5.1 가계부 컨텍스트 통과
- V22.5 분석 UI·안전모드 통과
- V22.4.2 공개 정책·사이트맵 통과
- V22.4.1 계정 안정성·전체 기능 통과
- V22.3·V22.2·V22.1 전체 회귀 통과
- NLU 합성 평가 4,738/4,738 통과
- Supabase 요청당 450ms 모의 지연에서 카카오 저장 약 3.9초 통과

## 정적·패키지 검증

- `node --check src/index.js` 통과
- ES module import 통과
- 최종 ZIP 무결성 검사 및 ZIP 내부 `src/index.js` 재검사 통과
- Supabase SQL 파일 변경 없음
- OpenBuilder 문서 변경 없음

## 한계

모의시험은 운영 Supabase의 실제 RLS, 과거 감사 데이터 보존 상태, 브라우저 쿠키 정책을 완전히 재현하지 않는다. 배포 후 문제 계정의 실제 목록과 역할을 최종 확인해야 한다. V22.5 UI 안전모드 시험 로그의 강제 Supabase 500 오류는 오류 화면 대체 동작을 확인하기 위해 의도적으로 발생시킨 테스트이며 최종 결과는 통과다.

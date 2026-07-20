# 먼저 확인하세요 · V22.8.8

이 파일은 현재 버전에서 실제로 무엇을 적용해야 하는지 빠르게 확인하기 위한 요약입니다.

## 배포 판정

- 교체 파일: `src/index.js` 전체
- 신규 SQL: 없음
- 기존 SQL 재실행: 하지 않음
- Cloudflare 환경변수: 변경 없음
- 카카오 OpenBuilder: 변경 없음
- 롤백: V22.8.7 `src/index.js`로 코드만 복귀

## 이번 버전 변경

- 로그인·계정 생성·가계부 생성·참여·삭제·탈퇴·가져오기·저장의 진행 문구를 실제 행동별로 표시
- 제출 중 form·button `aria-busy`와 보조기기용 `aria-live` 상태 추가
- 뒤로 가기 복귀 때 버튼 문구·잠금·busy 상태 복원
- 삭제·탈퇴·계정 통합 확인창에 실제 결과 표시
- 새 계정과 개인 복구 비밀번호의 8자리·불일치·일치 즉시 안내
- 분석 화면은 V22.8.7 소스 해시 그대로 보호
- 영수증·카카오 그룹 응답은 기존 구현과 자동 검증 유지

## 무결성 기준

- 버전 상수: `V22.8.8-PREDICTABLE-ACTION-FEEDBACK`
- `src/index.js` SHA-256: `d6cb50c4d2800149f855c77de096d3c1ef04c505339eefd5dabfcba5b94148da`
- 영수증 자동 확인: 55개
- 카카오 1:1·그룹 자동 확인: 18개
- V22.8.8 UX·분석 보호 자동 확인: 55개
- 합계: 128개와 ESM 배포 소스 검사

## ZIP 구성

- 첫 누적본부터의 MD·SQL·검증 스크립트·매뉴얼 이력 유지
- 최신 전체 Worker는 `src/index.js` 한 파일로 제공
- 과거 시각 검증 PNG 제외
- Sites 개발 구조인 `worker/`, `dist/`, `.openai/`, `package.json` 제외
- Secret과 실제 운영 환경값 제외

## 자세히 볼 파일

1. `README.md` — 적용 순서와 현재 구성
2. `CHANGELOG.md` — 버전별 누적 이력
3. `DEPLOYMENT_MATRIX.md` — SQL·index.js·환경변수·OpenBuilder 판정
4. `FINAL_APPLY_CHECKLIST_V22_8_8.md` — 배포 전후 확인
5. `V22_8_8_PREDICTABLE_ACTION_FEEDBACK_REPORT.md` — 구현 상세
6. `VALIDATION_REPORT_V22_8_8.md` — 검증 결과
7. `NEXT_UPDATE_PLAN.md` — V22.8.9 이후 계획
8. `docs/ux/UX_PRINCIPLES_BRUNCH_110_PROJECT_MEMORY.md` — 학습한 UX 원칙과 프로젝트 적용 기준

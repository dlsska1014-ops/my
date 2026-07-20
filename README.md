# 똑똑한 가계부 V22.8.8 누적 배포본

이 ZIP은 V22.8.7 카카오 그룹 응답 정합성과 V22.8.6 영수증 안정화를 모두 포함하고, 로그인·가입·저장·삭제 같은 동작의 피드백을 실제 행동에 맞게 정리한 전체 배포본입니다. 부분 패치가 아니므로 최신 `src/index.js` 한 파일로 Cloudflare Worker 코드를 교체할 수 있습니다.

## 이번 버전 적용 범위

| 항목 | 적용 여부 | 작업 |
|---|---:|---|
| Cloudflare Worker 코드 | 필요 | `src/index.js` 전체 교체 |
| Supabase SQL | 불필요 | 실행할 신규 SQL 없음 |
| Cloudflare 환경변수 | 변경 없음 | 기존 값을 그대로 유지 |
| 카카오 OpenBuilder Skill URL | 변경 없음 | `https://ttokttok-accountbook.com/skill` 유지 |
| 카카오 블록·엔티티 | 변경 없음 | 기존 설정 유지 |

판정 근거는 `DEPLOYMENT_MATRIX.md`, 버전별 이력은 `CHANGELOG.md`에서 확인합니다.

## V22.8.8 핵심 변경

- 모든 POST 버튼을 똑같이 `저장 중…`으로 표시하던 공통 처리를 실제 행동별 문구로 교체
  - 로그인: `로그인 중…`
  - 새 계정: `계정 만드는 중…`
  - 가계부 생성·참여·삭제·탈퇴·가져오기: 각 행동에 맞는 진행 문구
  - 분류하기 어려운 동작만 `처리 중…` 사용
- 제출 중 form과 button에 `aria-busy`를 적용하고 보조기기에 진행 상태를 알리는 `aria-live` 상태 추가
- 공통 위험 작업 확인창에 삭제·탈퇴·계정 통합의 실제 결과를 명시
- 새 계정과 개인 복구 비밀번호 화면에서 8자리·일치 여부를 입력 즉시 안내
- 사용자가 만족한 분석 화면은 V22.8.7 소스와 바이트 단위 해시가 같도록 보호
- 영수증 화면은 이미 진행·취소·완료 상태가 충분해 이번 버전에서 변경하지 않고 기존 55개 검증으로 보호

프로젝트 UX 판단 기준은 `docs/ux/UX_PRINCIPLES_BRUNCH_110_PROJECT_MEMORY.md`에 누적했습니다.

## 적용 순서

1. 현재 Worker 코드와 환경변수를 백업합니다.
2. ZIP의 `src/index.js` 전체를 기존 Worker 코드와 교체합니다.
3. 신규 SQL은 실행하지 않습니다. 이전 SQL도 다시 실행하지 않습니다.
4. 배포 후 `/health`, `/my`, `/my/backup-login`, `/receipts`, `/my/analysis`, `/skill`을 확인합니다.
5. 로그인·새 계정·일반 저장·삭제 취소 시 버튼과 안내 문구가 행동에 맞는지 확인합니다.
6. 카카오 1:1 `시작`의 빠른 답장과 그룹 `시작`의 번호형 입력 안내를 각각 확인합니다.

## 자동 검증

개발 원본에서 다음 명령으로 검증합니다.

```sh
npm run validate:receipt
npm run validate:kakao-group
npm run validate:ux-principles
npm run build
npm run validate
```

- 영수증·보호 화면: 55개
- 카카오 1:1·그룹 응답: 18개
- V22.8.8 UX 원칙·분석 고정: 55개
- 합계: 128개 자동 확인과 빌드 ESM 검증

최종 누적 ZIP은 운영에 필요한 `src/index.js`, 버전 이력, SQL 이력, 매뉴얼, 검증 파일만 포함합니다. 빌드용 Sites 구조와 PNG 검증 이미지는 포함하지 않습니다.

## 주요 문서

- `VERSION.txt`: 현재 릴리스 식별자
- `CHANGELOG.md`: 버전별 누적 변경 이력
- `BASELINE.md`: 후속 버전에서 보호할 기능·UI·정책
- `DEPLOYMENT_MATRIX.md`: SQL·index.js·환경변수·OpenBuilder 판단
- `KNOWN-ISSUES.md`: 외부 제약과 운영 확인 사항
- `RELEASE-CHECKLIST.md`: 자동·수동 검증표
- `NEXT_UPDATE_PLAN.md`: V22.8.9 이후 계획
- `V22_8_8_PREDICTABLE_ACTION_FEEDBACK_REPORT.md`: 이번 변경 상세 보고서
- `VALIDATION_REPORT_V22_8_8.md`: 검증 결과
- `ARTIFACT_MANIFEST_V22_8_8.txt`: 누적 ZIP 구성 기준
- `BUNDLE_FILE_CHECKSUMS_V22_8_8.sha256`: ZIP 내부 파일 체크섬

## 롤백

V22.8.8은 DB 변경이 없습니다. 문제가 생기면 직전 V22.8.7의 `src/index.js`로 되돌리며 SQL 롤백은 하지 않습니다.

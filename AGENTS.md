# Codex 작업 지침

이 파일은 저장소 전체에 적용된다. 더 가까운 하위 디렉터리에 별도
`AGENTS.md`가 생기면 그 파일의 지침이 해당 범위에서 우선한다.

## 작업 시작

- 먼저 `VERSION.txt`, `BASELINE.md`, `KNOWN-ISSUES.md`를 읽는다.
- 다음 버전 작업은 `NEXT_UPDATE_PLAN.md`와 `DEPLOYMENT_MATRIX.md`를 확인한다.
- 카카오 동작은 `docs/kakao-manual/PROJECT_MEMORY_V22_8_10.md`와 관련 문서를
  기준으로 판단한다.
- UX 변경은 `docs/ux/UX_PRINCIPLES_BRUNCH_110_PROJECT_MEMORY.md`를 확인한다.
- 요청 범위 밖의 기능, SQL, 환경변수, Kakao Developers, OpenBuilder 설정을
  임의로 변경하지 않는다.

## 저장소 구조

- `src/index.js`: Cloudflare Worker 전체 배포 소스이자 핵심 애플리케이션.
- `validation/`: 현재 릴리스의 독립 회귀 검증.
- `docs/kakao-manual/`: 카카오 1:1·그룹 응답과 가계부 규칙.
- `docs/ux/`: 화면·행동·상태 피드백 원칙.
- `BASELINE.md`: 후속 버전에서 보호해야 할 제품 기준.
- `DEPLOYMENT_MATRIX.md`, `SQL_HISTORY.md`: 버전별 배포 및 DB 결정 기록.
- `RELEASE-CHECKLIST.md`: 자동 검증과 운영 수동 확인 항목.

## 필수 보호 기준

- 계정 로그인 비밀번호와 가계부 수명주기·초대코드·참여 권한을 섞지 않는다.
- 삭제·연결 해제·나가기 실패 시 다른 가계부로 자동 대체하지 않는다.
- 카카오 그룹 요청은 `botGroupKey`로 구분하고 그룹 응답에 QuickReplies,
  CommerceCard, Carousel을 추가하지 않는다.
- 사용자 식별은 `botUserKey`, `appUserId`를 우선하며 `plusfriendUserKey`는
  기존 호환용 대체 키로만 취급한다.
- 영수증 사진은 사용자의 명시적 동작 없이 OCR 또는 업로드하지 않는다.
- 개인 데이터 HTML은 `no-store`를 유지하고 버전이 붙은 정적 자원은
  장기 immutable 캐시 정책을 유지한다.
- 기준 성능 예산은 `/my` 데이터 요청 4회 이하, `/app` 9회 이하,
  개인 홈 HTML 35KB 이하이다.
- 근거가 되는 운영 실행 계획 없이 추측으로 DB 인덱스나 SQL을 추가하지 않는다.

## 변경 원칙

- 변경 전 관련 코드를 검색하고 가장 작은 범위로 수정한다.
- `src/index.js`는 저장소에서 직접 수정할 수 있지만 운영 배포는 항상 검증된
  파일 전체 교체 방식이다.
- 현재 V22.8.10은 신규 SQL, 스키마, 환경변수, Kakao Developers,
  OpenBuilder 변경을 요구하지 않는다.
- 비밀키, 토큰, 실제 사용자 데이터, `.env`, 빌드 결과, `node_modules`,
  스크린샷, 중첩 ZIP을 커밋하지 않는다.
- 버전 또는 배포 판단이 바뀌면 `VERSION.txt`, `CHANGELOG.md`,
  `DEPLOYMENT_MATRIX.md`, `SQL_HISTORY.md`, 관련 검증·체크리스트를 함께 검토한다.
- Windows에서도 체크섬이 유지되도록 `.gitattributes`의 LF 정책을 보존한다.

## 검증

코드 변경 후 먼저 관련 검증을 실행하고 마지막에 전체 검증을 실행한다.

```bash
npm run validate:receipt
npm run validate:kakao-group
npm run validate:household-security
npm run validate:ux-principles
npm run validate:performance
node .codex/scripts/verify-repository.mjs
```

저장소 하네스는 PowerShell, 명령 프롬프트, Git Bash에서 동일하게 실행되며
원본 배포 묶음 체크섬 31개, 영수증 55개, 카카오 그룹 18개, 가계부 보안 43개,
UX 55개, 홈 성능 32개로 총 203개, ESM `default.fetch`, 작업 트리와
스테이징 영역의 공백 오류를 확인해야 한다. 세부 절차는
`docs/codex/VERIFICATION.md`를 따른다.

기존 `npm run validate`는 원본 배포 묶음 호환용이며 Bash가 필요하다.
문서만 변경했더라도 저장소 하네스를 실행해 기준선이 그대로인지 확인한다.
운영 환경 수동 확인이 필요한 항목은 자동 통과로 간주하지 말고
`RELEASE-CHECKLIST.md`에 따라 별도로 보고한다.

## 완료 기준

- 요청한 변경과 직접 관련된 파일만 수정했다.
- 필수 보호 기준을 위반하지 않았다.
- 관련 검증과 전체 203개 검증이 통과했다.
- `git diff --check`가 통과하고 diff를 자체 검토했다.
- SQL·환경변수·외부 콘솔·수동 운영 확인의 필요 여부를 명시했다.
- 실행하지 못한 검증이나 남은 위험을 숨기지 않고 최종 보고에 포함했다.

## Codex 운영

- 작업 시작 전에 난이도에 맞는 추론 강도를 사용자에게 알린다.
- 구현·수정·버전 준비는 저장소 스킬 `$run-kakao-accountbook-loop`의
  목표·검증·재시도·완료 절차를 따른다.
- 둘 이상의 독립 영역을 분석·검토해야 하는 복합 작업은
  `$orchestrate-kakao-accountbook-graph`로 라우팅한다.
- 일반 수정은 Medium, 인증·보안·데이터 수명주기·배포·검증 하네스는 High,
  대규모 구조 변경·복합 장애·멀티에이전트 통합은 Extra High를 우선 추천한다.
- 현재 수준보다 높은 추론이 필요하면 이유와 시간·비용 영향을 먼저 설명한다.
- 복잡하거나 모호한 변경은 구현 전에 계획을 세운다.
- 단순 작업은 단일 에이전트로 처리한다. 복합 작업의 독립적인 읽기·검토 분기만
  제한적으로 병렬화하고, 병렬화하더라도 겹치는 파일과 `src/index.js`의 최종
  작성자는 하나로 유지한다.
- 파괴적 Git 명령, 강제 푸시, 운영 배포, SQL 실행, 외부 서비스 설정 변경은
  사용자 승인 없이 수행하지 않는다.

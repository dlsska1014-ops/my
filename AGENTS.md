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

- `src/modules/`: Worker 소스. 원본 선언 순서를 그대로 나눈 모듈과 연결 순서를 적은
  `MANIFEST.txt`.
- `src/index.js`: `npm run build:worker`가 `src/modules/`를 이어 만드는 생성 파일이자
  Cloudflare Worker 전체 배포 산출물. 검증·배포가 이 파일을 보므로 함께 커밋한다.
- `tools/build-worker.mjs`, `tools/split-worker.mjs`: 연결 빌드(`--check`는 드리프트
  검사)와 1회용 위치 분할 도구.
- `tools/deploy-worker-version.mjs`: Versions API 업로드·대조·승격·되돌림 스크립트. 토큰은
  환경변수로만 받고, 업로드는 배포하지 않으며 승격은 `--promote`와 사용자 승인 뒤에만 한다.
- `tools/annotate-modules.mjs`, `tools/worker-analysis.mjs`, `tools/compare-worker-statements.mjs`:
  모듈 import/export 표시 생성, 스코프 분석, 두 빌드의 최상위 문장 구문 트리 비교.
- `tools/vendor/`: 분석에 쓰는 acorn 8.16.0 원본과 라이선스·출처 기록.
- `docs/refactor/modularization-v1/`: 모듈 분리 설계·분할 명세와 재생산 스크립트.
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
- 영수증 사진 등록은 V22.9.19 에서 제거됐다. 되살릴 때는 사용자의 명시적 동작 없이 OCR 또는 업로드하지 않는다.
- 개인 데이터 HTML은 `no-store`를 유지하고 버전이 붙은 정적 자원은
  장기 immutable 캐시 정책을 유지한다.
- 기준 성능 예산은 `/my` 데이터 요청 4회 이하, `/app` 9회 이하, 개인 홈 HTML은
  기준 픽스처(당월 6행) 35KB 이하이고 실사용 부하(당월 200행) 44KB 이하이다.
  실사용 예산 44KB는 V22.8.55 마크업 축소 이후 실측 42.5KB(43,542바이트)를
  근거로 V22.8.56에서 정한 값이다. 두 값 모두 실측 근거 없이 올리지 않는다.
- 근거가 되는 운영 실행 계획 없이 추측으로 DB 인덱스나 SQL을 추가하지 않는다.

## 변경 원칙

- 변경 전 관련 코드를 검색하고 가장 작은 범위로 수정한다.
- Worker 코드는 `src/modules/`에서 고치고 `npm run build:worker`로 모듈의 import/export
  표시와 `src/index.js`를 다시 만들어 함께 커밋한다. `src/index.js`는 생성 파일이므로 직접 수정하지 않는다.
  하네스의 빌드 동일성 검사는 다시 이은 결과와 커밋된 `src/index.js`의 SHA-256이
  다르면 실패한다. 운영 배포는 지금처럼 검증된 `src/index.js` 파일 전체 교체 방식이다.
- 모듈 파일은 UTF-8(BOM 없음)·LF이고 마지막 줄바꿈이 정확히 하나다. 연결 순서는
  `src/modules/MANIFEST.txt`가 정하고 선언 순서가 곧 초기화 순서이므로 임의로 바꾸지
  않는다. 모듈 사이 선언 이동은 `docs/refactor/modularization-v1/PLAN.md` 4단계의
  절차와 검사를 따르고, `node tools/compare-worker-statements.mjs`로 의도한 문장만 바뀌었는지
  확인한다. `.toString()`으로 내려보내는 클라이언트 함수에는 Worker 최상위 이름을 새로 넣지 않는다.
- 현재 V22.8.46은 `household_members.role`에 `admin`을 허용하는
  `01_APPLY_MEMBER_ROLE_SCHEMA_V22_8_46.sql` 적용이 필요하다. 기존 참여자 행,
  RLS, GRANT, RPC, 인덱스, 환경변수, Kakao Developers, OpenBuilder는 변경하지 않는다.
- 비밀키, 토큰, 실제 사용자 데이터, `.env`, 빌드 결과, `node_modules`,
  스크린샷, 중첩 ZIP을 커밋하지 않는다.
- 버전 또는 배포 판단이 바뀌면 `VERSION.txt`, `CHANGELOG.md`,
  `DEPLOYMENT_MATRIX.md`, `SQL_HISTORY.md`, 관련 검증·체크리스트를 함께 검토한다.
- Windows에서도 체크섬이 유지되도록 `.gitattributes`의 LF 정책을 보존한다.

## 검증

코드 변경 후 먼저 관련 검증을 실행하고 마지막에 전체 검증을 실행한다.

```bash
npm run validate:card-import
npm run validate:kakao-group
npm run validate:kakao-edit
npm run validate:household-security
npm run validate:ux-principles
npm run validate:performance
npm run validate:adsense-v2
npm run validate:v5
npm run validate:core-write
npm run validate:report-dashboard
npm run validate:home-rail-challenge
npm run validate:challenge-activity-ux
npm run validate:account-runtime
npm run validate:sister-link
npm run validate:audit-corrections
npm run validate:startup-budget
npm run validate:group-first
npm run validate:import-cron
npm run validate:build-identity
npm run validate:module-syntax
npm run validate:client-serialization
npm run validate:init-order
npm run validate:deploy-script
node .codex/scripts/verify-repository.mjs
```

저장소 하네스는 PowerShell, 명령 프롬프트, Git Bash에서 동일하게 실행되며
현재 배포 묶음은 `BUNDLE_FILE_CHECKSUMS_V22_9_32.sha256`로 확인하며 자동 검사의 최소 기준은 8,384개이다. ESM `default.fetch`, 작업 트리와
스테이징 영역의 공백 오류를 확인해야 한다. 여기에는 V22.9.24의 설정 범위·취소·관제 SSO·부분 지표 검사 121개, V22.9.25의 UI/UX 회귀 검사 42개, V22.9.26의 라우터 await·안전 실패 검사 47개, 출시 점검 수정 검사 83개, 코드리뷰 후속 검사 125개와 cold/warm 직렬 깊이 보호 6개가 포함된다.
설정 JSON(키워드·적립계획·별칭·식별 링크)을 읽고-고쳐-쓰는 경로는 `{ strict: true }` 읽기를 쓴다. 읽기 실패를 빈 값으로 보면 기존 값이 통째로 사라진다.
라우터 `route()` 안에서 핸들러는 반드시 `return await handleX(...)` 로 돌려준다. `await` 가 빠지면 핸들러의 오류가 라우터의 안전모드 catch 를 건너뛴다.
SQLite 메모리 검증 45개는 사용 중인 Node.js 환경에서 `node monitoring/test-d1.mjs`로 별도로 실행하고 실제 런타임 버전을 기록한다. 세부 절차는
`docs/codex/VERIFICATION.md`를 따른다.

`src/index.js`의 클라이언트 런타임 중 `renderMobileV81Html`의 인라인 스크립트는
템플릿 리터럴 안 문자열이므로 정규식 백슬래시를 반드시 이중으로 쓴다. 새로 작성하는
클라이언트 코드는 실제 함수로 만들고 `.toString()`으로 직렬화한다.

기존 `npm run validate`는 원본 배포 묶음 호환용이며 Bash가 필요하다.
문서만 변경했더라도 저장소 하네스를 실행해 기준선이 그대로인지 확인한다.
운영 환경 수동 확인이 필요한 항목은 자동 통과로 간주하지 말고
`RELEASE-CHECKLIST.md`에 따라 별도로 보고한다.

## 완료 기준

- 요청한 변경과 직접 관련된 파일만 수정했다.
- 필수 보호 기준을 위반하지 않았다.
- 관련 검증과 현재 전체 하네스가 통과했고 실제 검사·체크섬 개수를 기록했다.
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

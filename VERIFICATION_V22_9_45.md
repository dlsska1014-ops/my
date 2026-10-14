# V22.9.45 검증 기록

기준은 main `ed75a0e`이며 브랜치는 `codex/v22945-deferred-save`입니다. 첫 커밋 `bf79272`에는 감사·인계 문서 두 개만 들어 있습니다. 상태는 운영 적용 대기(`production-pending`)입니다. 운영 배포·SQL·Secret·외부 콘솔 변경은 실행하지 않았습니다.

## 재현과 회귀 고정

`D:\Github_Kakao_Account\review-artifacts\v22944-audit`에서 다음 원본을 수정 전에 실행했습니다.

- `B-kakao-flows/h1a-deferred-save-dropped.mjs 120,170`: 먼저 답한 새 방·새 1:1 기록이 저장 0건으로 끝났습니다.
- `verify/c1-admin-date-xss.mjs`, `verify/c1b.mjs`: 관리자 주소 두 곳의 HTML에 원문 스크립트 삽입이 나타났습니다.
- `G-ops-limits/main/monitor-false-incident.mjs`: 정상 요청에서 `db_failures=1`, `sample_kind=incident`와 ‘최근 처리 실패 기록’ 경고가 나타났습니다.

이를 `validation/validate-audit-hotfix-v22945.mjs`로 옮겼습니다. 각 `--case=b1|c1|g1|g18|g16` 검사를 수정 전 코드에서 실행하여 종료 코드 1로 실패함을 확인했습니다.

| 결함 | 수정 전 실패 | 수정 후 검사 |
|---|---|---|
| B-1 | 120ms 새 방 첫 거래 0건 ≠ 1건 | 120·170ms 새 방·1:1 deferred 응답 뒤 1건 저장, 재전송 중복 방지, 오늘 목록 노출, 문맥 없는 거절, 0·100ms·방 참여, 20초 준비 상한을 확인합니다. |
| C-1 | 관리자 HTML에 원문 삽입이 존재함 | 두 주소의 원문 제거·날짜 검증, 달력 직렬화의 값 보존을 확인합니다. |
| G-1 | 정상 카카오 표본의 DB 실패 1건 ≠ 0건 | 카카오·홈의 정상 표본, 사고 전송 부재, 설정 화면의 실제 503 사고, 선택 GET에 한정한 예외를 확인합니다. |
| G-18 | 스킬에 없는 검증 명령이 존재함 | 실제 npm 스크립트·두 모드 실행·현행 manifest와 검사 하한 참조를 확인합니다. |
| G-16 | 운영 V22.9.44 ID가 문서에 없음 | 문서 네 개의 운영 버전·배포 ID·시각과 output/ 제외를 확인합니다. |

수정 전 실패는 Git 밖 `D:\Github_Kakao_Account\review-artifacts\v22945-deferred-save\before-*.txt`에 보관합니다. 최종 통과 기록은 같은 폴더의 `harness-present-final.txt`, `harness-absent-final.txt`입니다. 초기 시도 로그와 원본 재현 스크립트·관찰 출력도 보존했습니다.

## 구현과 요청 예산

`canDeferSave`는 실행 문맥의 waitUntil 지원 여부로만 정하며 일반·새 방·새 1:1 기록 저장까지 전달합니다. 저장 전 준비 상한은 20초이고 문맥이 없으면 3.5초를 유지합니다. 처리 중 표시·8초 반복 가드·24시간 결과 불명확 지문·잠금과 쓰기 순서는 유지합니다.

선택 분류 표를 읽는 두 곳에서만 `optionalTable`을 지정합니다. GET 경로·표 이름·HTTP 404·JSON 코드 PGRST205가 모두 맞을 때에만 DB 실패 수에서 제외하며 호출 수와 시간은 계속 셉니다. 예외는 유지하여 기존 설정 분류 대체를 사용합니다. 다른 404·403·5xx·필수 표·POST 오류는 계속 실패입니다. 코드의 뜻은 [PostgREST 공식 오류 문서](https://docs.postgrest.org/en/stable/references/errors.html#group-2-schema-cache)와 대조했습니다.

격리 전체의 표 부재 캐시는 도입하지 않았습니다. 일시적인 스키마 캐시 부재나 권한·설정 변화가 고정되지 않도록 기존 조회를 유지했으며 추가 DB 왕복은 0회입니다. 수정 후 새 방 첫 기록은 DB 43회, 새 1:1은 47회였습니다(NLU 영속화·관제 전송을 끈 합성 요청).

운영과 같은 분류 표 부재·NLU 지표 활성화·원문 표본 비활성화 조건에서 170ms 지연과 관제 전송 1회를 포함해 다시 측정했습니다. 두 요청 모두 deferred 응답 뒤 정확히 1건 저장됐으며 예산 거절은 없었습니다. 감사의 `harness.mjs`를 재사용한 측정 스크립트와 출력은 Git 밖 `ops-budget.mjs`, `ops-budget.txt`에 있습니다.

| 요청 | DB 호출 | 관제 전송 | 전체 subrequest |
|---|---:|---:|---:|
| 새 1:1 첫 기록 | 48 | 1 | 49/50 |
| 새 방 첫 기록 | 44 | 1 | 45/50 |

## 검증 결과

Node.js v22.23.1에서 다음 검사를 모두 통과했습니다. 로그는 로컬 근거 폴더에 보관합니다.

| 검사 | 결과 |
|---|---|
| 새 감사 회귀 | 224개를 통과했습니다. B-1 62개, C-1 43개, G-1 42개, G-18·G-16 77개입니다. |
| 일반 하네스 | 자동 검사 15,005개·체크섬 422개를 통과했습니다. |
| 분류 표 부재 하네스 | 자동 검사 15,005개·체크섬 422개를 통과했습니다. |
| SQLite 관제 | 84개를 통과했습니다. |
| 관련 기존 검사 | 카카오 지연 36개·자동 참여 156개·공동방 첫 기록 921개·개인 첫 기록 261개·가계부 보안 89개·빌드 동일성 19개·모듈 문법 120개·클라이언트 직렬화 43개·성능 165개를 통과했습니다. |
| 빌드·진입점·공백 | 111개 모듈의 생성 파일 일치·기존 내보내기 목록·default.fetch·git diff --check를 확인했습니다. |

`EXPECTED_MINIMUM_CHECKS`는 15,005입니다. waitUntil 작업의 거절 여부 검사는 계속 실행하되 처리 완료 시점에 따라 달라지는 작업 묶음 수를 릴리스 검사 수에 더하지 않습니다. 기존 14,781개에 고정된 새 224개를 더했으며 기존 검사를 제거하지 않았습니다.

`src/index.js`는 4,081,057바이트이며 SHA-256은 `dad69ab7c701d06f75925fc18326e17903a12ee77907629547d5db9aa0afe665`입니다. manifest는 이전 415개 경로를 모두 보존하고 7개 경로를 추가했습니다. 새 감사·인계 문서도 포함합니다.

## 바꾼 파일

main 기준 총 32개 파일을 변경했습니다. 단톡방 첫 기록 모듈은 기존 `...context`로 지원 여부를 전달하므로 직접 변경하지 않았습니다.

| 범위 | 파일 |
|---|---|
| Worker 소스 8개·생성 파일 1개 | `src/modules/kakao/skill-handler.js`, `src/modules/kakao/identity-chat-first.js`, `src/modules/kakao/transaction-save.js`, `src/modules/admin/dashboard-page.js`, `src/modules/web/menu-and-guides.js`, `src/modules/data/supabase-client.js`, `src/modules/settings/categories-keywords.js`, `src/modules/public/site-config.js`, `src/index.js` |
| 검증 3개 | `validation/validate-audit-hotfix-v22945.mjs`, `.codex/scripts/verify-repository.mjs`, `BUNDLE_FILE_CHECKSUMS_V22_9_45.sha256` |
| 작업 지침 3개 | `AGENTS.md`, `.agents/skills/run-kakao-accountbook-loop/SKILL.md`, `.agents/skills/orchestrate-kakao-accountbook-graph/SKILL.md` |
| 버전·저장소 설정 3개 | `VERSION.txt`, `package.json`, `.gitignore` |
| 기준·운영 문서 8개 | `BASELINE.md`, `CHANGELOG.md`, `DEPLOYMENT_MATRIX.md`, `KNOWN-ISSUES.md`, `NEXT_UPDATE_PLAN.md`, `README.md`, `RELEASE-CHECKLIST.md`, `SQL_HISTORY.md` |
| 감사·판 문서 6개 | `docs/codex/AUDIT_FINDINGS_V22_9_44.md`, `docs/codex/HANDOFF_V22_9_44_AUDIT.md`, `docs/codex/VERIFICATION.md`, `00_READ_FIRST_V22_9_45.md`, `VERIFICATION_V22_9_45.md`, `docs/ASIDE_V22_9_45.md` |

Input/·output/과 기존 사용자 문서 두 개는 커밋하지 않았습니다. 운영 적용은 수행하지 않았습니다.

## 남은 위험과 수동 확인

- 먼저 답한 새 방에 초기 소유자 권한 안내를 후속 전송하지 않습니다. 결과는 `오늘 기록 보기`로 확인합니다.
- 20초는 저장 시작 전의 준비 상한입니다. 실제 느린 쓰기의 완료와 응답 뒤 waitUntil 실행 한도·Free CPU 한도는 운영 확인 사항입니다.
- G-5 후속 저장 실패 관제 전송과 G-4 승격 사이 설정 변경을 포함한 나머지 감사 항목은 수정하지 않았습니다.
- 실제 새 단톡방·새 1:1 첫 기록, 구성원 참여·권한, 기존 24시간 사고 표본 만료와 테스트 행 정리는 사용자가 [배포 안내](docs/ASIDE_V22_9_45.md)에 따라 확인합니다.

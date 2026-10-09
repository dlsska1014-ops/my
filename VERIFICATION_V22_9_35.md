# V22.9.35 검증 기록

저장소 자동 검증을 마쳤습니다. 운영 적용, 운영 배포, 실제 Cloudflare API 호출은 아직 하지 않았습니다.

- **작업 위치:** git worktree `D:\Github_Kakao_Account\my-v22935`, 브랜치 `codex/v22935-signup-kdf`
- **기준:** V22.9.34 main `43e794e`, 운영 버전 `04da3a9e…`
- **동결 소스:** SHA-256 `636cab5cb9f049d2bc1be9f9e9d06ce357292e6c36f4d41e642bc8fd3db0fbb8`, 3,514,697 bytes, 35,249줄

## 원인 재현

운영 실패와 같은 조건을 메모리 픽스처로 만들어 V22.9.34 코드(`43e794e`)에서 가입했습니다. 조건은 Workers 런타임처럼 100,000회를 넘는 PBKDF2 를 `NotSupportedError`로 거절하는 것입니다.
- **응답:** HTTP 500, "계정을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." 운영에서 본 것과 같습니다.
- **만들어진 사용자·로컬 계정 행:** 0 건. 해시가 계정 생성 RPC 보다 먼저 실패합니다.
- **운영 이벤트:** `local_signup_failed / error / signup_failed; Pbkdf2 failed: iteration counts above 100000 are not supported (requested 210000).`

같은 조건에서 V22.9.35 는 HTTP 303 으로 가입하고, 반복 횟수 100,000 인 로컬 계정을 만듭니다.

## 바뀐 범위

`tools/compare-worker-statements.mjs`로 V22.9.34 운영 소스(`f74f729a…`)와 최상위 문장을 구문 트리로 비교했습니다.
- 1,659개에서 1,660개가 됐고, 순서는 같습니다.
- 바뀐 문장 4개, 새 문장 1개, 없어진 문장 0개입니다.
- 바뀐 것: 판 번호, 반복 횟수 상수, 해시 함수, 로컬 로그인 처리기(운영 이벤트)
- 새 것: 운영 상한 상수 `PASSWORD_KDF_MAX_ITERATIONS`

Worker 내보내기 목록은 바뀌지 않았습니다. 1년 캐시 자산의 바이트도 같습니다.

## 새 검사와 바꾼 검사

| 검사 | 검사 수 | 고치기 전(V22.9.34) 결과 |
|---|---|---|
| `validate-signup-kdf-v22935`(새 검사) | 25 | 정적 검사 첫 항목에서 실패 |
| `validate-launch-fixes-v22926`(바꾸지 않음, 상한 픽스처로 실행) | 그대로 | "가입이 된다"에서 실패 |
| `validate-audit-corrections-v22930`(반복 횟수 기대값을 100,000 으로 바꿈) | 그대로 | 카카오 사용자의 ID·비밀번호 설정에서 실패 |

메모리 픽스처(`validation/qa-fixture.mjs`)는 불러오는 순간 `SubtleCrypto`의 `deriveBits`·`deriveKey`에 운영 런타임과 같은 PBKDF2 상한(100,000)을 겁니다. 이 픽스처를 쓰는 모든 검사가 운영과 같은 상한 아래에서 돕니다.

## 전체 검증

- **새 manifest:** `BUNDLE_FILE_CHECKSUMS_V22_9_35.sha256`은 V22_9_34 의 348개 경로를 모두 보존하고 새 파일을 더한 **352개**입니다.
  - 새 파일은 판 문서 3개와 새 검사입니다.
- **전체 하네스:** `node .codex/scripts/verify-repository.mjs`가 다음을 통과했습니다.
  - 자동 검사 **8,769개**(하한 8,769)
  - Worker 문법
  - ESM `default.fetch`
  - 작업 트리와 스테이징 공백 검사
- **SQLite:** Node.js v22.23.1 에서 `node monitoring/test-d1.mjs`의 45개를 별도로 통과했습니다.
- **CI:** Ubuntu·Windows 결과는 병합 뒤 배포 기록에 남깁니다.

## 운영과 한계

- 운영 런타임의 실제 상한은 확인할 방법이 없어 공개 자료로 판단했습니다. workerd 이슈 #1346 에는 2026년 1월 "210,000회에서 오류" 보고가 있고, 상한을 올리는 PR #7550 은 병합되지 않았습니다.
- 무료 요금제 CPU 한도(10ms)는 운영에서만 확인할 수 있습니다(`docs/ASIDE_V22_9_35.md` 4·5절).

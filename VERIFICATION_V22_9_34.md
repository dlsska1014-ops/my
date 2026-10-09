# V22.9.34 검증 기록

저장소 자동 검증을 마쳤습니다. 운영 적용, 운영 배포, 실제 Cloudflare API 호출은 아직 하지 않았습니다.

- **작업 위치:** git worktree `D:\Github_Kakao_Account\my-v22934`, 브랜치 `codex/v22934-audit-fixes`
- **기준:** V22.9.33 main `1a31796`, 운영 버전 `e24b4219…`
- **동결 소스:** SHA-256 `f74f729a04af30654be748c54bace4f000a7d307c66298d28b7e43a1a756eefd`, 3,513,719 bytes, 35,241줄

## 바뀐 범위

`tools/compare-worker-statements.mjs`로 V22.9.33 운영 소스(`2e5dd9d8…`)와 최상위 문장을 구문 트리로 비교했습니다.
- 1,619개에서 1,659개가 됐고, 순서는 같습니다.
- 바뀐 문장은 149개, 새 문장은 43개, 없어진 문장은 3개입니다.
- 없어진 것은 카카오 되돌리기 버퍼의 옛 저장·꺼내기·비우기 도우미입니다. 잠금 안의 한 번 읽기·쓰기로 바뀌었습니다.

바뀐 문장 수가 많은 이유는 원형 오염 방지(SIM-10)입니다. 빈 객체 `{}`로 만든 집계 맵 79곳을 `Object.create(null)`로 바꿨습니다. 나머지는 아래 결함별 수정에 해당합니다.

Worker 내보내기 목록은 바뀌지 않았습니다(`ACCOUNTBOOK_WORKER`의 `fetch`·`route`·`scheduled`). 그래서 배포 스크립트의 `named_handlers` 대조도 같습니다.

## 새 검사

| 검사 | 검사 수 | 고치기 전(V22.9.33) 결과 |
|---|---|---|
| `validate-settings-safety-v22934` | 49 | U1 첫 항목에서 실패 |
| `validate-input-parsing-v22934` | 95 | D1 첫 항목에서 실패 |
| `validate-proto-safety-v22934` | 18 | 정적 검사에서 실패. 정적 검사를 뺀 실행 검사도 `/app` 을 그린 뒤 원형 오염으로 실패 |
| `validate-kakao-edit-safety-v22934` | 66 | N1 첫 항목에서 실패(조사 단계에서 66개 중 57개 실패, 나머지 9개는 대조군) |
| `validate-write-integrity-v22934` | 28 | B13 첫 항목에서 실패 |
| `validate-qa2-screens-v22934` | 28 | B10 첫 항목에서 실패 |

공용 도구는 `validation/lib-audit-v22934.mjs`입니다.

메모리 픽스처(`validation/qa-fixture.mjs`)를 운영 PostgREST 에 더 가깝게 바꿨습니다.
- 같은 기본 키로 거래를 넣으면 409(23505)로 거절합니다. `db.__strict_primary_keys = false` 로 끌 수 있습니다.
- `db.__lose_next_transaction_response` 로 "저장은 되고 응답만 잃는" 상황을 만들 수 있습니다.
- 이 상태로 기존 검사 99개가 모두 통과합니다.

## 의도한 변경에 맞춰 고친 기존 검사

| 검사 | 바꾼 것 |
|---|---|
| `validate-core-write-smoke` | 예산 일괄 저장에 계획 지문을 보냅니다. 같은 인스턴스의 동시 목표·정산 저장은 차례대로 처리됩니다(목표 둘 다 저장, 정산은 두 번째가 중복 완료). |
| `validate-recurring-merge-budget-cleanup-v22880`, `validate-launch-review-followups-v22926`, `validate-launch-fixes-v22926` | 예산 일괄 저장에 계획 지문을 보냅니다. |
| `validate-v5-stabilization` | 목표 저장 잠금 이름이 가계부 설정 잠금(`household-settings-rmw`)입니다. |
| `validate-role-surface-v22867` | 키워드 저장이 카드별 원래 값(`kw_orig`)을 보냅니다. 결과 리다이렉트가 9가지입니다. |
| `validate-ux-principles` | 분석 클라이언트와 분석 렌더러의 함수 해시 기준을 갱신했습니다(원형 없는 맵, 무지출 기준 문구). |
| `validate-kakao-edit-flow`, `validate-edit-restore-v22871` | 복구는 원래 id 로 한 번만 넣습니다. 수정 세션 중 새 지출은 세션을 끝내고 저장합니다. |
| `validate-chat-first-v22928` | 저장은 되고 응답만 잃은 경우 id 로 확인해 "저장했어요"라고 답합니다. |
| 홈·v5 자산을 읽는 검사 18개 | 새 자산 주소(v22934)를 읽습니다. |
| `validate-immutable-asset-addresses-v2299` | 새 주소 세 개의 해시를 고정했습니다. 옛 주소 세 개는 보존 바이트(운영과 같은 `98ea43f0…`·`d294d13b…`·`4aeb9097…`)로 계속 확인합니다. |

## 전체 검증

- **새 manifest:** `BUNDLE_FILE_CHECKSUMS_V22_9_34.sha256`은 V22_9_33 의 337개 경로를 모두 보존하고 새 파일을 더한 **348개**입니다.
  - 새 파일은 판 문서 3개, 감사 처리 현황 문서, 새 검사 6개, 공용 검사 도구입니다.
- **전체 하네스:** `node .codex/scripts/verify-repository.mjs`가 다음을 통과했습니다.
  - 자동 검사 **8,744개**(하한 8,744)
  - Worker 문법
  - ESM `default.fetch`
  - 작업 트리와 스테이징 공백 검사
- **SQLite:** Node.js v22.23.1 에서 `node monitoring/test-d1.mjs`의 45개를 별도로 통과했습니다.
- **CI:** Ubuntu·Windows 결과는 병합 뒤 이 기록에 덧붙입니다.

## 함께 한 조사

읽기 전용 조사 에이전트 세 개의 결과를 반영했습니다.
- **2차 보고서 항목 확인과 비슷한 결함:** 458개 화면의 폼 분석과 원형 키 집계 전수 조사를 했습니다. SIM-1~18 을 찾았습니다.
- **저장 동시성·멱등성 설계:** B12~B15 시제품을 만들고 기존 검사 83개로 확인했습니다.
- **카카오 수정·삭제·복구 명세:** 패치 26개와 검사 66개를 만들었고, 새 결함 NEW-1~9 를 찾았습니다.

## 운영과 한계

- 운영에서만 확인할 수 있는 항목은 `docs/ASIDE_V22_9_34.md` 4절 "운영 확인 지시문"에 있습니다.
- 운영 DB 가 명시적 id 와 `on_conflict=id`를 받아들이는지는 배포 전에 읽기 전용으로 확인합니다(ASIDE 2절).
- 넘긴 항목과 이유는 `docs/codex/AUDIT_FINDINGS_V22_9_34.md` 2절에 있습니다.

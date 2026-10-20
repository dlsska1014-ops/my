# 현재 상태 (작업 시작 때 이 파일만 읽는다)

마지막 갱신: 2026-10-20 (V22.9.72 운영 반영·OpenBuilder v3.4 뒤). 판을 올리거나 운영에 반영하면 이 파일의 표를 먼저 고친다.

## 운영

| 항목 | 값 |
|---|---|
| 운영 Worker | `kakao-accountbook`, 도메인 https://malhaebook.com |
| 운영 판 | **V22.9.72-CHAT-FEEDBACK** (2026-10-20, ASIDE 배포), version `c17bb5fb-4564-4848-8f3f-47c9427bc736`, 배포 `db638aff-8e52-407b-a8c0-1021e4ad4061`, 소스 SHA-256 `a15e9b10…`(커밋 662c337). 기록 docs/deployments/V22_9_72_OPENBUILDER_V3_4_2026_10_20.md |
| 되돌리기 대상 | V22.9.71-NAME-EXAMPLE `bb845660-1f6e-4a6d-91ed-57c113d1df3b` |
| 운영 DB | Supabase. 2026-10-18 V61 수명주기 migration 적용 완료. 재실행·V44 복귀·구형 RPC 권한 복원 금지 |
| 외부 콘솔 | OpenBuilder v3.4 전체 배포(2026-10-20 18:53, ASIDE): 봇 입장 블록(웹가계부·도움말 보기·기록하기), 도움말 하단 창, 대표 명령어 13개(짧은 이름), 01 블록 패턴 34개. Kakao Developers·채널 변경 없음 |
| 확인 명령 | `curl -s https://malhaebook.com/health` 의 `version`; 배포 기록 `docs/deployments/`, 로컬 `output/deploy/<판>/` |

## 저장소

| 항목 | 값 |
|---|---|
| GitHub main | PR #85(`claude/v22972-chat-feedback`, V22.9.69~72 + 2026-10-19 정비 병합) 머지 뒤 = 운영 V22.9.72 소스. 머지 전 main 은 `5876619`(V22.9.68 + 정비) |
| 진행 중 | `claude/v22972-records`(이 기록·진단 정정, PR #86). 다음 후보 V22.9.73: Worker→Supabase 요청 멈춤 조사·완화(NEXT_UPDATE_PLAN) |
| 배포 절차 | `node tools/deploy-worker-version.mjs`(업로드·대조, 배포 아님) → 출력의 `--promote <id>` 명령(승인 뒤). 토큰은 환경변수로만. 답장에 실행 가능한 되돌리기 예시를 적지 않는다(2026-10-19 사고) |
| 검증 | `node tools/build-worker.mjs --check` → `node .codex/scripts/verify-repository.mjs` → `npm run validate:categories-absent`. 하한·manifest 는 하네스 머리의 상수와 `BUNDLE_FILE_CHECKSUMS_<판>.sha256` |

## 열린 일

- **Worker→Supabase 요청 멈춤(V22.9.73 조사)**: 2026-10-20 12:07~12:09 세 요청이 10초 조회 제한에 걸려 실패(요청이 Supabase 에 도착하지 않음), ‘점심 오천원’ 미저장 → 테스터 재입력 요청. 조회 재시도·쓰기 시한 안 검토(KNOWN-ISSUES V22.9.72 절).
- 실제 새 단톡방 확인(요구사항 문서 5절: 빈 멘션 → 도움말 보기 → 참여 전 오늘기록 → 기록 → 이번달요약·남은예산·정산), ‘도움말 보기’ 머신러닝 매칭, ‘기록하기’ 위치는 테스터 확인 전까지 가정. 테스터에게 반영 알림(R13).
- CI 흔들림: `validate-audit-hotfix-v22945` B-1 타이밍 검사가 ubuntu 푸시 실행에서 한 번 실패(같은 커밋 PR 실행·로컬은 통과).
- V22.9.68 실제 단톡방 확인(‘새 가계부 만들기 → 연결하기 → 기록’)은 미실시.
- KNOWN-ISSUES 의 V22.9.68 절: 낮은 항목 5건(‘예산’ 낱말 문장, 메모 토큰, 묶음 번호 순서, 아이폰 분류, 삭제 뒤 잔여 표식).
- Lucian UX/UI 미적용 9개(081·097·163·165·151·134·029·008·178)는 별도 묶음.

## 어디를 읽나

- 보호해야 할 제품 기준: `AGENTS.md` 필수 보호 기준 + `BASELINE.md`의 해당 판 절.
- 판별 변경 이력: `CHANGELOG.md`(V22.9 만 남김). V22.8 이력은 `docs/archive/`.
- 알려진 문제: `KNOWN-ISSUES.md` 첫 절(현재 상태)과 작업 범위의 판 절.
- 배포·DB 결정: `DEPLOYMENT_MATRIX.md`, `SQL_HISTORY.md`의 해당 판 절, `docs/db-review/`.
- 카카오 동작: `docs/kakao-manual/PROJECT_MEMORY_V22_8_10.md`. UX 원칙: `docs/ux/UX_PRINCIPLES_BRUNCH_110_PROJECT_MEMORY.md`. OpenBuilder 콘솔 변경: `docs/kakao-manual/OPENBUILDER_V3_3_CHAT_FEEDBACK_2026_10_20.md`.
- 점검·배포 증거(저장소 밖): `D:/Github_Kakao_Account/review-artifacts/` — 최신 인계는 `CURRENT_HANDOFF.txt`.

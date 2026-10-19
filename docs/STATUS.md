# 현재 상태 (작업 시작 때 이 파일만 읽는다)

마지막 갱신: 2026-10-19 22:30 KST (V22.9.68 운영 반영 뒤). 판을 올리거나 운영에 반영하면 이 파일의 표를 먼저 고친다.

## 운영

| 항목 | 값 |
|---|---|
| 운영 Worker | `kakao-accountbook`, 도메인 https://malhaebook.com |
| 운영 판 | **V22.9.68-ROOM-REBIND** (2026-10-19 21:31 KST), version `52a83dd5-24e7-4e33-8a78-44ea0412373c`, 배포 `8ccec259-d508-4204-8b9f-befda748bc7c` |
| 되돌리기 대상 | V22.9.67-SHORT-BUTTONS `2428e81f-f616-4547-bb7b-4729ff854237` |
| 운영 DB | Supabase. 2026-10-18 V61 수명주기 migration 적용 완료. 재실행·V44 복귀·구형 RPC 권한 복원 금지 |
| 외부 콘솔 | OpenBuilder v3.1(V22.9.65~67 버튼형 설명서에 맞춤), Kakao Developers·채널 변경 없음 |
| 확인 명령 | `curl -s https://malhaebook.com/health` 의 `version`; 배포 기록 `docs/deployments/`, 로컬 `output/deploy/<판>/` |

## 저장소

| 항목 | 값 |
|---|---|
| GitHub main | V22.9.46 `bd41cca` (2026-10-14). PR #81(`claude/v22962-sync`, V22.9.47~67 동기화)과 PR #83(`claude/v22968-room-rebind`, V22.9.68)을 순서대로 머지하면 운영과 같아진다 |
| 진행 중 | Codex `aside/v22969-button-hub`(V22.9.69~70, 시작·도움말·빈 멘션 버튼형 설명서) — V22.9.68 위 |
| 배포 절차 | `node tools/deploy-worker-version.mjs`(업로드·대조, 배포 아님) → 출력의 `--promote <id>` 명령(승인 뒤). 토큰은 환경변수로만. 답장에 실행 가능한 되돌리기 예시를 적지 않는다(2026-10-19 사고) |
| 검증 | `node tools/build-worker.mjs --check` → `node .codex/scripts/verify-repository.mjs` → `npm run validate:categories-absent`. 하한·manifest 는 하네스 머리의 상수와 `BUNDLE_FILE_CHECKSUMS_<판>.sha256` |

## 열린 일

- 운영 반영 뒤 실제 단톡방 확인(‘새 가계부 만들기 → 연결하기 → 기록’)은 미실시.
- KNOWN-ISSUES 의 V22.9.68 절: 점검에서 확인했지만 넣지 않은 낮은 항목 5건(‘예산’ 낱말 문장, 메모 토큰, 묶음 번호 순서, 아이폰 분류, 삭제 뒤 잔여 표식).
- Lucian UX/UI 미적용 9개(081·097·163·165·151·134·029·008·178)는 별도 묶음.

## 어디를 읽나

- 보호해야 할 제품 기준: `AGENTS.md` 필수 보호 기준 + `BASELINE.md`의 해당 판 절.
- 판별 변경 이력: `CHANGELOG.md`(V22.9 만 남김). V22.8 이력은 `docs/archive/`.
- 알려진 문제: `KNOWN-ISSUES.md` 첫 절(현재 상태)과 작업 범위의 판 절.
- 배포·DB 결정: `DEPLOYMENT_MATRIX.md`, `SQL_HISTORY.md`의 해당 판 절, `docs/db-review/`.
- 카카오 동작: `docs/kakao-manual/PROJECT_MEMORY_V22_8_10.md`. UX 원칙: `docs/ux/UX_PRINCIPLES_BRUNCH_110_PROJECT_MEMORY.md`.
- 점검·배포 증거(저장소 밖): `D:/Github_Kakao_Account/review-artifacts/` — 최신 인계는 `CURRENT_HANDOFF.txt`.

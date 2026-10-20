# 현재 상태 (작업 시작 때 이 파일만 읽는다)

마지막 갱신: 2026-10-20 (V22.9.72-CHAT-FEEDBACK 준비본, 운영은 V22.9.71). 판을 올리거나 운영에 반영하면 이 파일의 표를 먼저 고친다.

## 운영

| 항목 | 값 |
|---|---|
| 운영 Worker | `kakao-accountbook`, 도메인 https://malhaebook.com |
| 운영 판 | **V22.9.71-NAME-EXAMPLE** (Codex, 2026-10-19 밤). 그 앞 V22.9.69 `dc6395bc-eb06-46af-b13a-4493c695730b`, V22.9.70 `2aad16a6-2bcc-40ea-a2a8-e6c2109beed5`(docs/deployments/V22_9_70_2026_10_19.md). V22.9.71 의 version id 는 Codex 클론의 `output/deploy/` 기록을 본다 |
| 되돌리기 대상 | V22.9.70-MANUAL-ENTRY `2aad16a6-2bcc-40ea-a2a8-e6c2109beed5` |
| 운영 DB | Supabase. 2026-10-18 V61 수명주기 migration 적용 완료. 재실행·V44 복귀·구형 RPC 권한 복원 금지 |
| 외부 콘솔 | OpenBuilder v3.2 부분 배포(`00_시작_메뉴` 스킬 전환). 대표 명령어 ‘사용 설명서’ 변경본은 미배포. v3.3 지시문(`docs/kakao-manual/OPENBUILDER_V3_3_CHAT_FEEDBACK_2026_10_20.md`)은 V22.9.72 승격 뒤 반영. Kakao Developers·채널 변경 없음 |
| 확인 명령 | `curl -s https://malhaebook.com/health` 의 `version`; 배포 기록 `docs/deployments/`, 로컬 `output/deploy/<판>/` |

## 저장소

| 항목 | 값 |
|---|---|
| GitHub main | `5876619` (2026-10-19 23:20 KST) = 운영 V22.9.68 소스 + 정비 커밋(PR #81·#83·#84). V22.9.69~71(Codex 로컬 `aside/v22969-button-hub`)은 GitHub 에 없었고 `claude/v22972-chat-feedback` PR 에 함께 들어간다 |
| 진행 중 | `claude/v22972-chat-feedback`(V22.9.72, 2026-10-20 단톡방 테스트 피드백) — V22.9.71 + main 병합 위. 요구사항·진단 `docs/codex/CHAT_FEEDBACK_REQUIREMENTS_2026_10_20.md` |
| 배포 절차 | `node tools/deploy-worker-version.mjs`(업로드·대조, 배포 아님) → 출력의 `--promote <id>` 명령(승인 뒤). 토큰은 환경변수로만. 답장에 실행 가능한 되돌리기 예시를 적지 않는다(2026-10-19 사고) |
| 검증 | `node tools/build-worker.mjs --check` → `node .codex/scripts/verify-repository.mjs` → `npm run validate:categories-absent`. 하한·manifest 는 하네스 머리의 상수와 `BUNDLE_FILE_CHECKSUMS_<판>.sha256` |

## 열린 일

- V22.9.72 운영 반영 뒤 실제 단톡방 확인(요구사항 문서 5절: 빈 멘션 → 도움말 보기 → 참여 전 오늘기록 → 기록 → 이번달요약·남은예산·정산)과 OpenBuilder v3.3 지시문 반영, 테스터에게 알림.
- 2026-10-20 12:07~12:10 KST 지연 답의 원인 확인(`/nlu-ops.json?hours=24`, Supabase Reports). 코드 경로는 짧아(참여 전 조회 3왕복) 저장소 지연으로 추정.
- ‘기록하기’ 버튼 위치(맨 아래)와 단톡방 ‘도움말 보기’ 이름(OpenBuilder 가로채기 여부)은 테스터·실제 방 확인 전까지 가정.
- 운영 반영 뒤 실제 단톡방 확인(‘새 가계부 만들기 → 연결하기 → 기록’, V22.9.68)은 미실시.
- KNOWN-ISSUES 의 V22.9.68 절: 점검에서 확인했지만 넣지 않은 낮은 항목 5건(‘예산’ 낱말 문장, 메모 토큰, 묶음 번호 순서, 아이폰 분류, 삭제 뒤 잔여 표식).
- Lucian UX/UI 미적용 9개(081·097·163·165·151·134·029·008·178)는 별도 묶음.

## 어디를 읽나

- 보호해야 할 제품 기준: `AGENTS.md` 필수 보호 기준 + `BASELINE.md`의 해당 판 절.
- 판별 변경 이력: `CHANGELOG.md`(V22.9 만 남김). V22.8 이력은 `docs/archive/`.
- 알려진 문제: `KNOWN-ISSUES.md` 첫 절(현재 상태)과 작업 범위의 판 절.
- 배포·DB 결정: `DEPLOYMENT_MATRIX.md`, `SQL_HISTORY.md`의 해당 판 절, `docs/db-review/`.
- 카카오 동작: `docs/kakao-manual/PROJECT_MEMORY_V22_8_10.md`. UX 원칙: `docs/ux/UX_PRINCIPLES_BRUNCH_110_PROJECT_MEMORY.md`. OpenBuilder 콘솔 변경: `docs/kakao-manual/OPENBUILDER_V3_3_CHAT_FEEDBACK_2026_10_20.md`.
- 점검·배포 증거(저장소 밖): `D:/Github_Kakao_Account/review-artifacts/` — 최신 인계는 `CURRENT_HANDOFF.txt`.

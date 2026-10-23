# 현재 상태 (작업 시작 때 이 파일만 읽는다)

마지막 갱신: 2026-10-23 (V22.9.76 다음날 점검 수행 완료, 접속·준비 상태 정상·예약 결과 검증은 근거 부족으로 blocked). 판을 올리거나 운영에 반영하면 이 파일의 표를 먼저 고친다.

## 운영

| 항목 | 값 |
|---|---|
| 운영 Worker | `kakao-accountbook`, 도메인 https://malhaebook.com |
| 운영 판 | **V22.9.76-PRELAUNCH-AUDIT** (2026-10-22 19:32:58 KST), version `f0cfc8d7-02f6-4ed0-aa04-dd6109f04906`, 배포 `7c694744-e639-4cbb-b4e2-a1e1abc7928c`, SHA-256 `68375f230742e1778af03dfb5c37e7664933b5d1ca3d4302b1969b1c7c2b7875`(main25c2dc7). 기록 docs/deployments/V22_9_76_2026_10_22.md. V75기록 docs/deployments/V22_9_75_2026_10_21.md |
| 되돌리기 대상 | V22.9.75-NAVER-VERIFY `df9b5e22-e755-4c15-b652-59550022c5d0`(별도 사용자 승인 뒤에만) |
| 운영 DB | Supabase. 2026-10-18 V61 수명주기 migration 적용 완료. 재실행·V44 복귀·구형 RPC 권한 복원 금지 |
| 외부 콘솔 | OpenBuilder v3.4 전체 배포(2026-10-20 18:53, ASIDE): 봇 입장 블록(웹가계부·도움말 보기·기록하기), 도움말 하단 창, 대표 명령어 13개(짧은 이름), 01 블록 패턴 34개. Kakao Developers·채널 변경 없음 |
| 확인 명령 | `curl -s https://malhaebook.com/health` 의 `version`; 배포 기록 `docs/deployments/`, 로컬 `output/deploy/<판>/` |

## 저장소

| 항목 | 값 |
|---|---|
| GitHub main | `25c2dc7` = V22.9.76 소스(PR91 승인 병합), 운영 소스와 동일 |
| 진행 중 | Claude `claude/v22977-audit-followup` PR92, main 정렬은 Claude 담당. ASIDE V77 작업은 보류: V76 예약 결과 검증 [blocked], 운영 기록 PR93 미병합. 미확인 근거에 대한 사용자 후속 판단·별도 병합/배포 승인 필요 |
| 배포 절차 | `node tools/deploy-worker-version.mjs`(업로드·대조, 배포 아님) → 출력의 `--promote <id>` 명령(승인 뒤). 토큰은 환경변수로만. 답장에 실행 가능한 되돌리기 예시를 적지 않는다(2026-10-19 사고) |
| 검증 | `node tools/build-worker.mjs --check` → `node .codex/scripts/verify-repository.mjs` → `npm run validate:categories-absent`. 하한·manifest 는 하네스 머리의 상수와 `BUNDLE_FILE_CHECKSUMS_<판>.sha256`. 운영 /ready 에 `accountbook_categories` 가 없으므로 분류 표 부재 모드가 실제 운영 모드다 |
| 운영 설정 | 필요한 Secret·환경변수·cron·관제 한 장: `docs/OPERATIONS_CONFIG.md` |

## 열린 일

- **V22.9.76 후속 확인**: 10/23 20:00 점검 수행 완료, 20:01 health200/missing0·ready200/필수13/실패[]/RPC누락[]. [blocked] 배포 이후 scheduled_error·scheduled_partial 및 예약 실제 성공·실패·누락·중복의 전기간 근거가 없어 건수는 null, 0으로 판정하지 않음. 정기수입 알림은 운영자 수동 확인 필요, “수당” 분류 미수정. 임시20시 슬롯 제거·기존 매일09시 예약 복구. PR93은 결과·한계 기록 후 별도 병합 승인 대상이며 V77 진행 승인과 별개. 상세는 docs/deployments/V22_9_76_2026_10_22.md.
- **AdSense 재검토**: 2026-10-21 03:33 KST ‘주의 필요’(사유 `가치가 별로 없는 콘텐츠`). V22.9.74 반영 뒤 Search Console 사이트맵 재제출·새 글 색인 요청 → 네이버 소유 확인·사이트맵 제출 완료(10/22 16:37) → 1~2주 뒤 ‘검토 요청’. 같은 AdSense 사이트인 `tools.malhaebook.com`(양식 121쪽·계산기 80쪽, 저장소 밖)은 별도 점검 대상. 운영자 결정: 글 바이라인 실명 공개 여부, /about 의 생성형 도구 고지 문구.
- **Worker→Supabase 요청 멈춤**: 2026-10-20 12:07~12:09 세 요청이 10초 조회 제한에 걸려 실패(요청이 Supabase 에 도착하지 않음), ‘점심 오천원’ 미저장 → 테스터 재입력 요청. V22.9.73(23:29 반영)이 조회 재시도·쓰기 시한으로 완화하지만 원인은 미확정 — 하루 뒤 `/nlu-ops.json?hours=24` 의 db_retries·supabase_read_timeout 실패를 보고, 남으면 Cloudflare Workers 로그로 좁힌다.
- 실제 새 단톡방 확인(요구사항 문서 5절: 빈 멘션 → 도움말 보기 → 참여 전 오늘기록 → 기록 → 이번달요약·남은예산·정산), ‘도움말 보기’ 머신러닝 매칭, ‘기록하기’ 위치는 테스터 확인 전까지 가정. 테스터에게 반영 알림(R13).
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

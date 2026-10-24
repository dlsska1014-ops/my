# 현재 상태 (작업 시작 때 이 파일만 읽는다)

마지막 갱신: 2026-10-24 (V22.9.76 다음날 점검 및 운영 기록 PR #93 병합 확인. 사용자 요청으로 V22.9.77 PR #92 병합·배포 준비를 재개했으나, 새 통합판 검증과 앱 연동 전제는 아직 미완료). 판을 올리거나 운영에 반영하면 이 파일의 표를 먼저 고친다.

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
| GitHub main | `6ac4913` = V22.9.76 운영 소스 + 다음날 점검 결과·검증 한계 기록(PR #93 병합). 앱 V77 배포 완료를 뜻하지 않음 |
| 진행 중 | `claude/v22977-audit-followup` PR #92 = **V22.9.77-AUDIT-FOLLOWUP**. main 문서 충돌 정리·현재 관제 1.1.2 진단 보존·새 체크섬/두 모드 CI·N-7 앱 연결 확인 뒤에만 병합·배포. 카카오 K-4/B-5/B-7, 관제 G-3/G-5/G-6, M-8/E-1 후보이며 운영 반영 전 |
| 배포 절차 | `node tools/deploy-worker-version.mjs`(업로드·대조, 배포 아님) → 출력의 `--promote <id>` 명령(승인 뒤). 토큰은 환경변수로만. 답장에 실행 가능한 되돌리기 예시를 적지 않는다(2026-10-19 사고) |
| 검증 | `node tools/build-worker.mjs --check` → `node .codex/scripts/verify-repository.mjs` → `npm run validate:categories-absent`. 하한·manifest 는 하네스 머리의 상수와 `BUNDLE_FILE_CHECKSUMS_<판>.sha256`. 운영 /ready 에 `accountbook_categories` 가 없으므로 분류 표 부재 모드가 실제 운영 모드다 |
| 운영 설정 | 필요한 Secret·환경변수·cron·관제 한 장: `docs/OPERATIONS_CONFIG.md` |

## 열린 일

- **V22.9.77 배포 준비**: 사용자 10/24 후속 요청으로 재개. V76 이후·PR93 기록 main 반영은 확인했으나 예약 전수 결과의 미확인을 정상으로 바꾸지 않는다. 봇 채널의 연결 앱과 웹 로그인 앱 일치(N-7), 현 운영 관제1.1.2 진단 보존, 새 통합판 두 모드·CI 확인이 전제다. 앱 Worker → 관제1.2.0 순서이며 말일·1일·2일은 피한다.
- **V22.9.76 후속 확인**: 10/23 20:00 점검 수행 완료, health200/missing0·ready200/필수13/실패[]/RPC누락[]. [blocked] 배포 이후 scheduled_error·scheduled_partial 및 예약 실제 성공·실패·누락·중복 전기간 근거가 없어 건수는 null. 정기수입 분류와 입금 N일 전 알림은 별도 운영자 화면에서 확인했으나 자동 예약 거래 성공 증거와는 구분한다. 개인 항목명·금액은 이 문서에 복제하지 않는다. PR93은 병합됐으며 임시20시 슬롯은 제거되고 매일09시 예약이 복구된 것으로 확인했다. 상세는 docs/deployments/V22_9_76_2026_10_22.md.
- **운영자 결정7건**: D-5·M-7은 명시적으로 원지출과 연결된 환불만 차감, W-5는 대기 고정지출 중복 제외 포함, W-7은 화면 간 예측 기준 통일, W-10은 기존 CSV 열 호환 유지, G-13은 운영 RPC3개 정의 읽기 확보(DDL없음), N-12는 주 없이 쓴 지난 요일을 오늘 제외 직전 요일로 해석하는 방향으로 확정했다. 결정과 코드 구현을 구분하며 이 문서 수정만으로 구현 완료라고 하지 않는다.
- **AdSense 재검토**: 10/21 주의 필요/가치가 별로 없는 콘텐츠. 네이버 소유 확인·사이트맵 제출은10/22 완료 기록. 기존 예약의10/31 이전 금지를 유지하며, 날짜만으로 제출하지 않고 실제 품질 보강 근거를 확인한다. tools.malhaebook.com은 별도 점검 대상이고 상여금 안내·레거시 공유링크 예외 범위 정리 등 후속이 남아 있다. 바이라인은 운영팀명 유지, 생성형 도구 고지는 실제 사용·검증 범위에 맞게 정리하는 방향으로 확정했지만 공개 문구 변경은 아직 미반영이다.
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

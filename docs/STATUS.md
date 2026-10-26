# 현재 상태 (작업 시작 때 이 파일만 읽는다)

마지막 갱신: 2026-10-26 (V22.9.78-OPERATOR-DECISIONS 운영 반영 10-25 20:15·관제 1.2.1 20:20, 다음 날 DB 확인 끝. V22.9.79-SPENDING-OUTLOOK = PR #97: 월말 예상 하나(W-7)·환불 연결(플래그 꺼짐)·추적표 정리 여덟 묶음 + 통합 검토 수정. 사용자 승인을 기다린다). 판을 올리거나 운영에 반영하면 이 파일의 표를 먼저 고친다.

## 운영

| 항목 | 값 |
|---|---|
| 운영 Worker | `kakao-accountbook`, 도메인 https://malhaebook.com |
| 운영 판 | **V22.9.78-OPERATOR-DECISIONS** (2026-10-25 20:15:21 KST), version `53da778a-cb7a-4a84-98f3-9e7f4834ae26`(#315), 배포 `0374f0dc-4487-4ad5-a999-e134545499cc`(main f912b5f, 6,703,262 바이트). 기록 docs/deployments/V22_9_78_2026_10_25.md. V77 기록 docs/deployments/V22_9_77_2026_10_24.md |
| 되돌리기 대상 | V22.9.77-AUDIT-FOLLOWUP `7898e8b1-60b7-4215-abc5-b92998ca7f21`(별도 사용자 승인 뒤에만) |
| 관제 Worker | `malhaebook-monitor` 1.2.1, version `520f6ef6-ade7-41e7-838b-f170ba791a4e`(#14), 배포 `171a5531-cef4-4a6a-ba5c-5190d67c2317`(2026-10-25 20:20:54 KST). 21:53 확인: 분석 토큰 확인이 실행 52분 뒤에도 수집됨(V77 N-19 운영 확인). 되돌리기 대상 1.2.0 `6262c0a1-6a2b-45e0-910a-2d966affdc83`(별도 사용자 승인 뒤에만) |
| 운영 DB | Supabase. 2026-10-18 V61 수명주기 migration 적용 완료. 재실행·V44 복귀·구형 RPC 권한 복원 금지 |
| 외부 콘솔 | OpenBuilder v3.4 전체 배포(2026-10-20 18:53, ASIDE): 봇 입장 블록(웹가계부·도움말 보기·기록하기), 도움말 하단 창, 대표 명령어 13개(짧은 이름), 01 블록 패턴 34개. Kakao Developers·채널 변경 없음 |
| 확인 명령 | `curl -s https://malhaebook.com/health` 의 `version`; 배포 기록 `docs/deployments/`, 로컬 `output/deploy/<판>/` |

## 저장소

| 항목 | 값 |
|---|---|
| GitHub main | `f912b5f` = V22.9.78 운영 소스(PR #95 병합, 2026-10-25). `src/` 는 운영과 같다 |
| 진행 중 | `claude/v22979-followup` = V22.9.79-SPENDING-OUTLOOK(앱 Worker 만, 관제 변경 없음). V22.9.78 배포 기록도 이 브랜치에 있다. 병합·배포는 사용자 승인 뒤. 배포는 말일·1일·2일(2026-10-31~11-02)을 피한다 |
| 배포 절차 | `node tools/deploy-worker-version.mjs`(업로드·대조, 배포 아님) → 출력의 `--promote <id>` 명령(승인 뒤). 토큰은 환경변수로만. 답장에 실행 가능한 되돌리기 예시를 적지 않는다(2026-10-19 사고) |
| 검증 | `node tools/build-worker.mjs --check` → `node .codex/scripts/verify-repository.mjs` → `npm run validate:categories-absent`. 하한·manifest 는 하네스 머리의 상수와 `BUNDLE_FILE_CHECKSUMS_<판>.sha256`. 운영 /ready 에 `accountbook_categories` 가 없으므로 분류 표 부재 모드가 실제 운영 모드다 |
| 운영 설정 | 필요한 Secret·환경변수·cron·관제 한 장: `docs/OPERATIONS_CONFIG.md` |

## 열린 일

- **V22.9.78 다음 날 확인(2026-10-26, 읽기만) 끝**: `cron_run_log_v22978` 09:10:34~37 한 건 ok·errors 없음(N-18 운영 확인), `cron_recurring_state_v22976` checked_date 2026-10-26, Cloudflare 활성 버전 두 개·cron, `/ops-dashboard` ‘최근 예약 실행’, 관제 수집기 모두 기대대로. [미확인] 앱→관제 요청 표본 0건(10-25 08:49:32 뒤 없음) — 송수신 코드·바인딩은 V77 과 같아 요청이 적은 탓으로 보지만 관제가 저사용량과 연결 실패를 구분하지 못한다(T-43). 기록은 docs/deployments/V22_9_78_2026_10_25.md ‘다음 날 확인’ 절.
- **운영 수동 확인(사용자가 직접)**: 카카오 ‘수정 01번’→8 구분, 단톡방 같은 이름 두 사람, ‘토스트 3000’, 가져오기 120행. V22.9.79 배포 뒤: ‘커피 ４５００’·‘택시 만 오천원’·‘1+1 우유 3000’(웹·카카오 같은 값), 금요일의 ‘지난 금요일’, 해외 시간대 휴대폰의 날짜 칩, 실기기 다크 모드·좁은 화면, 검색 결과 이동, 가입 오류 위치. N-7: 앞으로 봇에 앱을 연결한다면 웹 로그인 앱(1489689)만.
- **V22.9.79(PR 대기)**: 월말 예상 하나(W-7)·환불 연결(D-5·M-7, 플래그 `REFUND_LINKS_ENABLED` 꺼짐, 운영 DB SQL 은 검토용·실행 금지)·카카오 답장(A-18·B-8·B-9·B-10·N-4·N-5)·입력 해석 공유(A-07·A-10·A-16·N-11·N-13)·예약 반영(S-4·N-9·N-10·D-25·W-3)·웹 화면(S-3·D-16·F-3·F-6·F-7·F-9)·백업(E-15·E-16·E-11·E-1)·시각(F-4·F-5·F-8·F-10·D-27). 1년 캐시 자산 새 주소 7개(v22979). 새 발견 T-1~T-45(`docs/codex/FOLLOWUP_FINDINGS_V22_9_79.md`, T-1~T-9·T-41·T-42·T-44·T-45 고침 — T-41·T-42·T-44·T-45 와 T-1 의 틈 세 개는 2026-10-26 통합 검토에서 고침. **T-44(P2)는 V22.9.78 운영에도 있다**: 카카오 조회 전용 구성원이 ‘요약 커피 4500’처럼 조회 낱말을 섞으면 새 기록이 저장된다 — V22.9.79 배포로 닫힌다). 배포 직후·다음 날 확인은 DEPLOYMENT_MATRIX V22.9.79 절.
- **V22.9.76 후속 확인**: 10/23 20:00 점검 수행 완료, health200/missing0·ready200/필수13/실패[]/RPC누락[]. [blocked] 배포 이후 scheduled_error·scheduled_partial 및 예약 실제 성공·실패·누락·중복 전기간 근거가 없어 건수는 null. 정기수입 분류와 입금 N일 전 알림은 별도 운영자 화면에서 확인했으나 자동 예약 거래 성공 증거와는 구분한다. 개인 항목명·금액은 이 문서에 복제하지 않는다. PR93은 병합됐으며 임시20시 슬롯은 제거되고 매일09시 예약이 복구된 것으로 확인했다. 상세는 docs/deployments/V22_9_76_2026_10_22.md.
- **운영자 결정 7건(2026-10-23)**: N-12·W-5·W-10·G-13 은 V22.9.78(운영), W-7·D-5·M-7 은 운영자가 2026-10-25 변경안의 권장안을 채택해 V22.9.79 에서 넣었다. 환불 연결은 운영 DB 변경을 그때 다시 승인받아 적용한 뒤 플래그를 켠다. 원본 결정 기록 `review-artifacts/operator-followthrough-2026-10-23/DECISIONS_AND_STATUS.md`.
- **AdSense 재검토**: 10/21 주의 필요/가치가 별로 없는 콘텐츠. 네이버 소유 확인·사이트맵 제출은10/22 완료 기록. 기존 예약의10/31 이전 금지를 유지하며, 날짜만으로 제출하지 않고 실제 품질 보강 근거를 확인한다. tools.malhaebook.com은 별도 점검 대상이고 상여금 안내·레거시 공유링크 예외 범위 정리 등 후속이 남아 있다. 시급 계산기는 첫 화면에서 경고가 뜬다(입력란에 없는 ‘연간 근무 주 수’를 1~52주로 검사, 예시 단추에만 52가 들어 있음, 2026-10-24 공개 페이지로 확인) — tools 사이트 저장소에서 고친다. 바이라인은 운영팀명 유지, 생성형 도구 고지는 실제 사용·검증 범위에 맞게 정리하는 방향으로 확정했지만 공개 문구 변경은 아직 미반영이다.
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

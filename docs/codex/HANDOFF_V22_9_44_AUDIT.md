# Codex 인계: V22.9.44 전체 점검 결과 수정 (2026-10-14)

**1단계 반영:** B-1·C-1·G-1·G-18·G-16은 V22.9.45에서 고침(저장소 수정, 운영 적용 대기). 첫 커밋 `bf79272`에 감사·인계 문서만 보존했으며 아래의 원래 작업 지시는 유지합니다. 실제 전후 검사와 배포 절차는 `VERIFICATION_V22_9_45.md`, `docs/ASIDE_V22_9_45.md`에 있습니다.

이 문서는 Codex가 `docs/codex/AUDIT_FINDINGS_V22_9_44.md`의 결함 105건(P0 1·P1 12·P2 38·P3 54)을 이어받아 고치기 위한 작업 지시입니다.
- 2026-10-14 Claude 점검 세션에서 만들었습니다. 이 세션은 저장소 코드를 바꾸지 않았습니다.
- 이 문서와 감사 문서는 아직 커밋되지 않았습니다. 1단계 PR의 첫 커밋에 넣습니다.

## 0. 현재 상태

- **운영:** V22.9.44-KAKAO-LATENCY
  - Cloudflare version `3d12b754-299f-4e83-8235-c5994d7fa4f9`, deployment `4d5884dd-1a12-408a-93b9-d934e6c71bae`. 2026-10-13 15:52 KST에 배포했습니다.
  - 되돌리기 대상은 V22.9.43 `7ece012b-15d0-4738-ae50-428ddb19b089`입니다.
  - 근거는 `output/deploy/V22.9.44-KAKAO-LATENCY/promote-*.json`(추적 안 됨)입니다.
- **main:** `ed75a0e`(PR #78). 커밋된 운영 기록(DEPLOYMENT_MATRIX 등)은 아직 V22.9.43 기준입니다(G-16).
- **가장 급한 결함 B-1:** 새 단톡방과 새 1:1 사용자의 첫 기록이 '먼저 답하기' 뒤 저장되지 않습니다.
  - 운영 지연(호출당 120~170ms 추정)에서 지금 일어나고 있을 가능성이 큽니다.
  - 사용자가 예정한 실제 단톡방 재시험은 1단계 배포 뒤에 합니다.

## 1. 시작 전에 읽을 것

1. `AGENTS.md`: 필수 보호 기준, 검증 목록
2. `docs/codex/AUDIT_FINDINGS_V22_9_44.md`: 결함마다 위치, 재현, 고치는 방향이 있습니다.
3. `VERSION.txt`, `BASELINE.md`, `KNOWN-ISSUES.md` 1~20줄(V22.9.44·V22.9.43 절), `NEXT_UPDATE_PLAN.md`, `DEPLOYMENT_MATRIX.md`, `RELEASE-CHECKLIST.md`
4. 카카오 동작: `docs/kakao-manual/03_KAKAO_CANONICAL_RULES_AND_CONFLICTS.md`, `docs/kakao-manual/04_ACCOUNTBOOK_APPLICATION_SPEC.md`

## 2. 저장소 스킬과 실제가 다른 점

- **없는 검증 스크립트:** `$run-kakao-accountbook-loop`(54줄)와 `$orchestrate-kakao-accountbook-graph`(72줄)의 `npm run validate:receipt`는 없는 스크립트입니다.
- **옛 기준:** "34 release checksums, 902 automated checks"(71줄)는 옛 기준입니다.
  - 검증 목록은 `AGENTS.md`를 따릅니다.
  - 현재 기준은 `BUNDLE_FILE_CHECKSUMS_V22_9_44.sha256`(415개), 자동 검사 14,781개 이상입니다.
  - 이 스킬 문서를 고치는 일은 1단계에 들어 있습니다(G-18).
- **하네스 실행:** 전체 하네스는 두 번 돌립니다. 한 번 실행에 한 모드만 돌기 때문입니다.
  - `node .codex/scripts/verify-repository.mjs`
  - `npm run validate:categories-absent`(운영처럼 분류 표가 없는 모드)
- **AGENTS.md의 틀린 문장:**
  - 66~67줄 "V22.8.46 SQL 적용이 필요": 이미 적용됐고 재실행하지 않습니다(`SQL_HISTORY.md` 132·178줄).
  - 133줄 "`npm run validate`는 Bash가 필요": Bash가 필요한 것은 `validate:unix`입니다.
- **운영 한도:** 운영은 Workers Free입니다. 요청당 CPU 10ms, subrequest 50개입니다.
  - 새 사용자 첫 메시지가 이미 49/50(관제 전송 1 포함)입니다.
  - 호출을 늘리는 수정은 DB 왕복 수를 세어 보고합니다.

## 3. 작업 규칙

AGENTS.md를 요약하고, 이번 점검에서 확인한 함정을 더했습니다.

- **빌드:** Worker 코드는 `src/modules/`에서 고칩니다. `npm run build:worker`로 `src/index.js`를 다시 만들어 함께 커밋합니다.
  - 내보내기 목록은 바꾸지 않습니다. 배포 스크립트가 운영 `named_handlers`와 대조해 승격을 거절합니다.
- **브라우저용 코드:** `src/modules/client/*`의 `.toString()` 함수나 `client/shared-input-parsers.js`처럼 브라우저로 직렬화되는 코드를 바꾸면 두 가지를 함께 합니다.
  - 1년 캐시 자산 주소의 버전을 올리고, `validation/validate-immutable-asset-addresses-v2299.mjs`의 해시 고정을 갱신합니다.
  - `renderMobileV81Html` 인라인 스크립트의 정규식 백슬래시는 이중으로 씁니다.
- **고정된 해시:** `client/insight-main.js`는 `validate-ux-principles`가 해시로 고정합니다(BASELINE "분석 화면 고정"). 고치면 해시와 근거를 함께 갱신합니다.
- **성능 예산:**
  - 홈 HTML은 기준 픽스처 35,840B 중 여유가 248B입니다(V22.9.40).
  - `/app` DB 9회, `/my` 4회 이하를 지킵니다.
- **설정 JSON:**
  - 읽고-고쳐-쓰기는 `{ strict: true }` 읽기와 가계부 설정 잠금으로 합니다.
  - 사용자 값이 키가 되는 맵은 `Object.create(null)`로 만듭니다.
- **그 밖의 규칙:**
  - 라우터 핸들러는 `return await`로 돌려줍니다.
  - PBKDF2는 100,000회를 넘기지 않습니다.
  - 카카오 그룹 응답에 QuickReplies·Carousel·CommerceCard를 넣지 않습니다.
- **Windows 환경:**
  - python이 없으니 node를 씁니다.
  - Bash heredoc은 백슬래시와 `\u` 이스케이프를 망가뜨립니다. 코드 편집은 편집 도구로 합니다.
  - Git Bash는 `/assets/...` 인자를 경로로 바꿉니다. `MSYS_NO_PATHCONV=1`을 씁니다.
- **하지 않는 것:** 운영 배포, SQL 실행, Secret 변경, Kakao Developers·OpenBuilder 변경은 하지 않습니다.
  - 배포는 사용자가 `tools/deploy-worker-version.mjs`로 업로드한 뒤 `--promote`로 승격합니다.
  - 토큰이 들어가는 명령은 사용자가 직접 실행합니다.
- **커밋 범위:** 추적되지 않는 `Input/`, `output/`, `docs/ASIDE_MONITOR_USAGE_REFRESH.md`, `docs/MONITOR_REFRESH_IMPROVEMENT_PLAN_2026_10_12.md`는 커밋하지 않습니다.

## 4. 재현 자료

- **위치:** `D:\Github_Kakao_Account\review-artifacts\v22944-audit\`(git 밖). 사용법은 그 폴더의 `README.md`에 있습니다.
- **구성:** 영역 폴더 A~G, `verify`, 점검 규칙 `BRIEF.md`
- **실행:** 영역 폴더에서 `node <파일>`로 돌립니다. A·D·E 영역은 `TZ=UTC`로 돌립니다.
  - `.out.txt`·`*-output.txt`는 `ed75a0e`에서 관찰한 결함 출력입니다.
  - F 영역 브라우저 스크립트는 설치된 Chrome을 DevTools 파이프로 띄웁니다.
- **경로:** 스크립트는 `file:///D:/Github_Kakao_Account/my/...`를 불러옵니다.
  - `my/`에서 브랜치를 바꿔 작업하면 그대로 돌립니다.
  - worktree에서 작업하면 `node retarget.mjs <영역|all> <worktree 경로>`로 경로를 바꾼 사본을 만들어 돌립니다.
- **검사로 옮기기:** 결함을 고치면 재현을 `validation/`의 새 검사로 옮깁니다.
  - 고치기 전 코드에서 실패하고 고친 뒤 통과하는지(변이 확인) 기록합니다.
  - 새 검사는 다음 다섯 곳에 반영합니다: `.codex/scripts/verify-repository.mjs` 등록, `package.json` 스크립트, `AGENTS.md` 목록, 체크섬 manifest, `EXPECTED_MINIMUM_CHECKS`.

## 5. 1단계: V22.9.45 긴급 수정 (작성자 1명, 추론 High)

- **목표:**
  - 운영에서 지금 일어나는 첫 기록 손실(B-1)과 관리자 스크립트 삽입(C-1)을 막습니다.
  - 관제 경고 소음(G-1)을 없앱니다.
- **진행 방식:** 작게 고쳐 바로 배포합니다. 범위 밖 결함은 고치지 않습니다.

### B-1 먼저 답한 첫 기록이 저장되지 않음

- **상태:** V22.9.45에서 고침. 일반·새 방·새 1:1 경로에 waitUntil 지원 여부를 전달했으며 준비 상한은 20초입니다.

- **원인:** `handleKakaoSkillStable`(`kakao/skill-handler.js:87-240`)은 4초가 지나면 먼저 답하고 `work`를 `ctx.waitUntil`로 넘깁니다.
  - 그런데 `work`가 부르는 `handleKakaoSkill(cloned, env)`(186줄)는 이 사실을 모릅니다.
  - 그래서 저장 직전 `kakao/transaction-save.js:78`의 `Date.now() - handlerStartedAt >= 3500` 검사가 뒤 작업에서도 저장을 거절합니다.
- **고치는 방향:**
  - 먼저 답하기를 쓸 수 있을 때(`typeof ctx?.waitUntil === "function"`) 그 사실을 `handleKakaoSkill`에 넘기고 저장 경로까지 전달합니다.
    - 일반 기록: `skill-handler.js:634`
    - 1:1 첫 기록: `:487` → `kakao/identity-chat-first.js:239·277`
    - 단톡방 첫 기록: `:452` → `kakao/group-links-first-record.js`
  - `transaction-save.js:78`은 그 값이 있으면 3.5초에서 거절하지 않습니다.
    - waitUntil 한도(응답 뒤 30초) 안에 끝나도록 상한은 둡니다(예: 20초).
    - 값이 없으면(waitUntil 없음) 지금처럼 3.5초에서 거절합니다.
  - 처리 중 표시, 24시간 결과 모름 지문, 8초 같은 문장 가드는 그대로 둡니다.
- **완료 기준:** 새 검사를 쓰거나 `validate-kakao-latency-v22944`를 넓힙니다.
  - 조건: DB 호출당 120ms·170ms 지연, waitUntil 작업을 모아 기다리는 ctx.
    - 새 방 첫 기록과 새 1:1 첫 기록의 응답은 `x-accountbook-nlu-result: deferred`입니다.
    - 뒤 작업이 끝난 뒤 거래는 정확히 1건입니다.
  - waitUntil 없는 호출은 지금과 같이 "저장 전 준비 조회가 지연되어 … 저장하지 않았어요"로 답합니다.
  - 지연 0~100ms의 기존 동작과 방 참여(두 번째 사람)는 그대로입니다.
  - 본보기: `B-kakao-flows/h1a-deferred-save-dropped.mjs`(지연 주입과 ctx 수집은 `lib-b.mjs`에 있음), `h1a-room-followup.mjs`, `h1a-new-user-followup.mjs`
- **남는 것:** 먼저 답한 경우 새 방 소유자 안내("구성원 권한 기록만 …")는 나오지 않습니다. 결과는 '오늘 기록 보기'로 확인한다고 KNOWN-ISSUES에 적습니다.

### C-1 관리자 대시보드 `date` 스크립트 삽입

- **상태:** V22.9.45에서 고침. 날짜 검증과 `jsonForInlineScript`를 적용했습니다.

- **고치는 곳:**
  - `admin/dashboard-page.js:301`: `date`가 `isValidTransactionDateString`(`admin/transactions-households.js:114`)을 통과하지 않으면 빈 값으로 둡니다.
  - `web/menu-and-guides.js:360` `renderCalendarFilterScript`: `JSON.stringify` 대신 `jsonForInlineScript`(`domain/transactions-core.js:402`)를 씁니다.
- **완료 기준:** 관리자 세션으로 다음 두 주소를 열었을 때 HTML에 원문 `</script><script>`가 없어야 합니다.
  - `/?legacy=1&date=</script><script>window.__x=1</script>`
  - `/admin-view?date=…`
  - 본보기: `verify/c1-admin-date-xss.mjs`, `verify/c1b.mjs`

### G-1 분류 표 404가 관제 'DB 실패'로 셈

- **상태:** V22.9.45에서 고침. 명시한 선택 표 GET의 404/PGRST205만 실패 집계에서 제외하며 추가 DB 왕복은 없습니다. 표 부재 캐시는 도입하지 않았습니다.

- **원인:** `data/supabase-client.js:48-65`의 `finally`가 실패한 호출마다 `monitor.db_failures += 1`을 합니다.
  - 운영에는 선택 표 `accountbook_categories`가 없습니다(V22.9.36).
  - 그래서 카카오 새 기록, 웹 저장, 설정 화면의 404가 모두 '사고 표본'이 됩니다.
- **고치는 방향:**
  - 선택 표 조회(`kakao/transaction-save.js:143`, `settings/categories-keywords.js:382`)에서 나는 404/PGRST205는 계측 실패로 세지 않습니다.
  - 가능하면 격리 안에서 표가 없다는 것을 한 번 확인한 뒤 조회 자체를 건너뜁니다. 그러면 subrequest가 1회 줄어듭니다.
- **완료 기준:**
  - 분류 표 없는 픽스처에서 정상 카카오 저장과 `/app`의 관제 표본이 `db_failures=0`이고 사고가 아닙니다.
  - 진짜 DB 실패는 여전히 사고로 셉니다.
  - 본보기: `G-ops-limits/main/monitor-false-incident.mjs`

### 같은 PR에 넣을 문서

- **G-18:**
  - 상태: V22.9.45에서 고침. 실제 검증 명령과 두 모드·manifest·검사 하한 참조를 반영했습니다.
  - `.agents/skills/run-kakao-accountbook-loop/SKILL.md`의 54·71줄과 `.agents/skills/orchestrate-kakao-accountbook-graph/SKILL.md`의 72줄을 고칩니다. AGENTS.md의 검증 목록과 현재 manifest·검사 하한을 가리키게 합니다.
  - `AGENTS.md`의 66~67·133줄을 위 2절대로 고칩니다.
- **G-16:**
  - 상태: V22.9.45에서 고침. 운영 ID·시각을 문서 네 개에 남기고 output/을 Git 제외 목록에 넣었습니다.
  - V22.9.44 운영 배포 기록(0절의 ID)을 `DEPLOYMENT_MATRIX.md`, `CHANGELOG.md`, `README.md`, `RELEASE-CHECKLIST.md`에 반영합니다.
  - `output/`을 `.gitignore`에 넣을지는 9절의 사용자 결정을 따릅니다.
- **감사·인계 문서:** `docs/codex/AUDIT_FINDINGS_V22_9_44.md`와 이 문서를 커밋하고, 고친 항목에 "V22.9.45에서 고침"을 표시합니다.

### 버전 의식

V22.9.44 커밋 `60b5542`의 파일 묶음을 따릅니다. 이름은 예를 들어 `V22.9.45-DEFERRED-SAVE`로 짓습니다.

- **버전 값:** `VERSION.txt`, `package.json` version, `src/modules/public/site-config.js` APP_VERSION
- **AGENTS.md:** manifest 이름, 검사 하한, 검증 목록
- **새 문서:** `00_READ_FIRST_V22_9_45.md`, `VERIFICATION_V22_9_45.md`, `docs/ASIDE_V22_9_45.md`(사용자 배포와 운영 확인 절차)
- **기존 문서:** `CHANGELOG.md`, `DEPLOYMENT_MATRIX.md`(SQL·env 변경 없음, 되돌리기 대상 V22.9.44 `3d12b754…`), `KNOWN-ISSUES.md`, `BASELINE.md`, `RELEASE-CHECKLIST.md`, `NEXT_UPDATE_PLAN.md`, `SQL_HISTORY.md`, `docs/codex/VERIFICATION.md`
- **검증 파일:** `BUNDLE_FILE_CHECKSUMS_V22_9_45.sha256`, `.codex/scripts/verify-repository.mjs`(검사 등록, `EXPECTED_MINIMUM_CHECKS`)
  - manifest는 `docs/codex/*.md`도 담습니다(V22.9.44 기준 12개). 새 문서 `AUDIT_FINDINGS_V22_9_44.md`와 `HANDOFF_V22_9_44_AUDIT.md`도 넣습니다.
  - 하네스는 목록에 있는 파일만 확인하므로, 커밋하기 전의 추적 안 된 두 문서가 하네스를 깨지는 않습니다.

### 배포 뒤 사용자 확인 (`docs/ASIDE_V22_9_45.md`에 적기)

1. 배포 스크립트로 업로드하고 차이가 없는지 본 뒤 `--promote`로 승격합니다.
2. 테스트 단톡방에서 확인합니다.
   - 소유자의 첫 기록이 '처리 중'으로 답해도 1분 안에 '오늘 기록 보기'에 보이는지
   - 구성원이 기록하면 참여되는지, `구성원 권한 기록만` 명령이 동작하는지
3. 새 1:1 계정으로 첫 기록을 보내 확인합니다. 테스트 행은 확인 뒤 정리합니다.
4. 오픈빌더 '스킬 서버 연결 오류' 메일이 멈췄는지 봅니다.
5. `/ops-monitor`의 '최근 처리 실패 기록' 경고가 24시간 안에 해소되는지 봅니다(G-1).

## 6. 2단계: P1 데이터 정확성 → V22.9.46 (세 갈래 병렬 + 통합 작성자 1명, 추론 Extra High)

`$orchestrate-kakao-accountbook-graph`로 나눕니다.
- 갈래마다 아래 표의 파일 소유를 지켜 충돌을 막습니다.
- `src/index.js`, manifest, 버전 파일은 통합 작성자만 씁니다.
- 각 갈래는 P1을 먼저 고치고, 같은 파일의 P2·P3를 이어서 고칩니다.
- 1단계가 머지된 main에서 시작합니다(`skill-handler.js`·`transaction-save.js`가 1단계에서 바뀝니다).

| 갈래 | 소유 파일 | P1 | 같은 파일의 P2·P3 |
|---|---|---|---|
| 2-A 입력 해석 | `client/shared-input-parsers.js`, `nlu/*`, `client/v5-bundle-mains.js`(빠른 입력 시트 부분) | A-01, A-02, A-03, A-05, A-06, F-1 | A-07, A-08, A-10, A-12, A-15, A-16, F-2, B-11(금액 후보 쪽) |
| 2-B 카카오 흐름 | `kakao/skill-handler.js`, `kakao/edit-*.js`, `kakao/request-guards.js`, `kakao/reply-texts.js` | B-2, A-04 | B-3, B-4, A-09, A-11, B-8, B-9, B-11(세션 쪽) |
| 2-C 정기·예산 | `cron/recurring-auto-apply.js`, `admin/budget-center-recurring.js`, `my/settings-page.js`(정기 부분), `domain/budgets.js`, `settings/categories-keywords.js`, `kakao/guided-flow-state.js` | D-1(+D-10), D-2, D-4 | D-9, D-11, D-25, D-26 |

- **2-A:** 웹 빠른 입력과 카카오가 같은 파서를 씁니다.
  - 두 경로를 모두 검사합니다.
    - A 영역 `02-skill-e2e.mjs`의 82문장 표
    - 봇이 보내는 '입력 예시'와 안내 문장 전부
  - 클라이언트 자산 버전을 올려야 합니다.
- **2-B의 B-2:** 만료되지 않은 수정 세션이 있으면, '수정·삭제' 말과 날짜 접두가 없는 "N번"·"N번 값"을 세션에 먼저 넘깁니다(`skill-handler.js:280-286`, `edit-session-v4.js:323`).
- **2-C의 D-1:** 가계부 커서 대신, 활성이고 `last_applied_month < 이번 달`이며 지정일이 오늘 이전인 규칙을 직접 고릅니다.
  - 새 달 첫 실행에서는 지난달 미반영분을 따라잡습니다.
  - 요청당 subrequest 50을 넘지 않게 합니다. 지금 cron은 26~46회입니다.
  - D-10도 함께 고칩니다. 따라잡을 때는 규칙의 생성 월과 그 달의 금액을 기준으로 씁니다.
  - 본보기: `D-web-domain/recurring/r1-*`, `r6-*`
- **2-C의 D-4:** 사용자 결정이 필요합니다(9절). 결정이 없으면 권장안대로 진행합니다.
- **통합:** 세 갈래를 합치고 다음을 마칩니다: 2단계 전체 검사, 하네스 두 모드, 버전 의식(V22.9.46), ASIDE 문서, PR. 운영 배포는 사용자가 합니다.

## 7. 3단계: 나머지 P2 (V22.9.47~)

감사 문서 7절의 묶음을 따릅니다. 파일이 겹치지 않게 순서를 정합니다.

- **돈·집계:** D-3, D-5, D-7, D-8, D-12, D-17, D-18, D-19, D-20, D-21, D-23
  - D-3은 `client/insight-main.js` 해시 고정에 주의합니다.
- **카카오 단톡방·식별:** D-6, B-5, B-6, B-7, B-10, A-13, A-14, A-17, A-18, G-2
- **가져오기:** E-1(CPU)을 먼저 하고, 이어서 E-2~E-8, 그다음 E-9~E-17
- **관제·보안 설정:** G-5, G-3, G-6, G-10, G-12, G-13, G-8, G-7, G-4
  - G-5는 먼저 답한 뒤 결과 표본을 하나 더 보내는 수정입니다. 관제 Worker의 outcome 목록에 "deferred"를 추가해야 하고, 관제 Worker는 따로 배포합니다.

## 8. 4단계: P3·화면·문서

- **화면:**
  - 외부 QA 4건: 예산 알림 넘침, 알림 숫자 위치, 다크 모드 알림 숫자 대비, 가져오기 미리보기의 가계부 이름
  - F-3~F-10, D-13~D-16, D-22, D-24, D-27, C-2, C-3
- **문서:** G-9를 먼저 고칩니다. 관제 README가 V22.9.21로 복구하라고 안내합니다. 나머지는 G-14, G-15, G-17, D-28, G-11입니다.

## 9. 사용자 결정이 필요한 것

Codex는 권장안으로 진행하거나 사용자에게 묻습니다.

| 항목 | 질문 | 권장안 |
|---|---|---|
| D-4 | 기존 '식비'·'교통' 예산을 어떻게 셀까 | 옛 상위 이름을 하위 분류 묶음으로 집계합니다(`nlu/category-rules.js`의 LEGACY_CATEGORY_SPLITS 활용). 새 예산의 시작 행과 버튼은 실제 분류 이름으로 바꿉니다. |
| G-7 | 이미 쌓인 `unrecognized_inputs` 원문을 지울까 | 코드는 저장을 멈추고 원문을 가립니다. 기존 행 삭제 SQL은 사용자 승인 뒤 실행합니다. |
| G-6 | 관제 cron CPU | 먼저 요약을 미리 계산해 둬서 줄입니다. 그래도 안 되면 관제만 Workers Paid로 옮길지 검토합니다. |
| B-7 | 웹으로 먼저 가입한 계정과 채팅 계정을 이을까 | 자동 병합하지 않습니다. appUserId가 기존 강한 식별과 맞으면 그 계정을 쓰고, 별칭 덮어쓰기를 막습니다. |
| G-16 | `output/`을 `.gitignore`에 넣을까 | 넣습니다. 배포 기록 원본은 로컬에 두고, 요약은 문서에 남깁니다. |
| 배포 | 각 단계를 언제 배포할까 | 1단계는 바로 배포합니다. 2단계부터는 PR과 CI 뒤 사용자 승인으로 배포합니다. |

## 10. Codex 시작 프롬프트

1단계:

```
$run-kakao-accountbook-loop
D:\Github_Kakao_Account\my 에서 docs/codex/HANDOFF_V22_9_44_AUDIT.md 의 5절(1단계, V22.9.45 긴급 수정)을 진행해 줘.
- 먼저 이 문서와 docs/codex/AUDIT_FINDINGS_V22_9_44.md 를 읽고 2·3절 규칙을 따른다. 스킬의 validate:receipt 와 902/34 기준은 쓰지 않는다.
- main 에서 새 브랜치 codex/v22945-deferred-save 를 만들고, 커밋되지 않은 위 두 문서를 첫 커밋에 넣는다. Input/·output/ 등 다른 추적 안 된 파일은 넣지 않는다.
- 범위는 B-1, C-1, G-1, G-18, G-16 뿐이다. 그 밖의 결함은 고치지 않는다.
- 재현은 D:\Github_Kakao_Account\review-artifacts\v22944-audit 의 스크립트로 하고, 각 결함을 고치기 전 실패·고친 뒤 통과하는 검사로 고정한다.
- 관련 검증, 하네스 두 모드(node .codex/scripts/verify-repository.mjs, npm run validate:categories-absent), git diff --check 를 통과시킨다. 버전 의식(V22.9.45)을 마친 뒤 push 와 PR 까지 한다.
- 운영 배포·SQL·Secret·콘솔 변경은 하지 않는다.
- 최종 보고: 바꾼 파일, 실제 검사 수·체크섬 수, 사용자 배포 절차(docs/ASIDE_V22_9_45.md), 남은 위험.
```

2단계(1단계 PR이 머지된 뒤):

```
$orchestrate-kakao-accountbook-graph
D:\Github_Kakao_Account\my 에서 docs/codex/HANDOFF_V22_9_44_AUDIT.md 의 6절(2단계, V22.9.46 P1 데이터 정확성)을 진행해 줘.
- 2-A·2-B·2-C 세 갈래를 표의 파일 소유대로 나누고, src/index.js·manifest·버전 파일은 통합 작성자 하나만 쓴다.
- D-4 는 9절 권장안으로 진행한다. 사용자가 다른 결정을 주면 그것을 따른다.
- 갈래마다 P1 을 먼저 고치고 같은 파일의 P2·P3 를 이어서 고친다. 각 결함은 고치기 전 실패·고친 뒤 통과하는 검사로 고정한다.
- worktree 에서 작업하면 재현 스크립트는 review-artifacts\v22944-audit\retarget.mjs 로 경로를 바꿔 돌린다.
- 통합 뒤 하네스 두 모드, 버전 의식(V22.9.46), PR 까지 한다. 운영 배포는 하지 않는다.
```

3·4단계는 7·8절의 묶음 이름을 넣어 같은 방식으로 시작합니다.

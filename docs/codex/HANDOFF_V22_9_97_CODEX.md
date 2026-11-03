# Codex 인계: V22.9.97 운영 반영 뒤, 출시(2026-11-13) 전 할 일 (2026-11-03)

사용자 2026-11-03 낮 지시 "사용량때문에 실제 작업은 CODEX에서 할 수 있도록 내가 여기서진행해 달라 하기 전까지 최적의 방법으로 넘겨줘 목요일 이후에나 여기서 계속 작업 가능할 것 같아" 에 따라 Claude Code 가 쓴 인계문이다. Claude 쪽 작업은 11-06(목) 이후 사용자가 다시 지목할 때까지 쉰다. 그동안 저장소 작업은 Codex 가 한다. 이 문서는 `docs/STATUS.md` 의 ‘열린 일’ 을 대신하지 않는다 — 상태는 STATUS, 할 일의 순서와 맥락은 이 문서다.

## 0. 현재 상태 (2026-11-03 낮 KST)

- **운영 = V22.9.97-MONETIZATION-PREP** + 관제 1.6.0. 앱 활성 version `d97741c8-231c-4c73-a222-75019def45eb`(#328, 13:30:13 = 코드 `bf7345be-b4f3-4e26-86bf-39ddcc42f67d` #327 13:28:07 + 변수 `COMMUNITY_OPENCHAT_URL`, 바인딩 33). 관제 version `ce046034-060a-4671-bb88-cb0216d8e44a`(2026-11-03 13:50:15). 기록 `docs/deployments/V22_9_97_2026_11_03.md`. 되돌리기 대상(사용자 승인 뒤에만, 실행 명령은 문서에 쓰지 않는다): 앱 V22.9.96 `4146e87d-5ecd-4ce1-97cc-7f84388e4561`(#326), 관제 1.5.0 `3083fd46-857c-4a8d-ac75-32b9f9dac838`.
- **main `4d57f29`** = 운영 코드(PR #121·#122 병합 12:55·12:56). 이 인계문과 운영 반영 기록은 기록 PR #123(브랜치 `claude/v22997-deployment-records`, 코드 변경 없음)으로 들어간다. 병합되면 main 은 그 merge commit 이다. 새 판은 origin/main 에서 새 브랜치로 시작하고 이름은 V22.9.98 부터 쓴다.
- **정식 출시 2026-11-13(금).** 11-11 부터는 결함 수정만. 출시 전까지는 사용자가 다음 날 확인과 배포 창 규칙(말일·1·2일 금지, 09:10 뒤)을 생략시켰다(사용자가 없어 의미 없음). 출시 뒤에는 원래 규칙으로 돌아간다.
- 운영 변수(설정됨): NOTICE_TEXT·NOTICE_LINK(개정 공고 띠, 출시 1주 뒤 제거 예정), COMMUNITY_OPENCHAT_URL. 설정하지 않은 것: 송금 창구 셋·SUPPORTER_OPENCHAT_URL·AUDIT_RETENTION_DAYS(기본 180)·광고 변수(ADS_MODE 기본 review)·REFUND_LINKS_ENABLED·KAKAO_ACCOUNT_LINK_ENABLED·KAKAO_INAPP_AUTO_LOGIN. 다음 배포 대조는 바인딩 33.
- 사용자 결정(2026-11-03, 바꾸지 말 것): ① 후원은 오픈채팅에서 운영자가 직접 안내(송금 링크·계좌 변수 없음, /support 는 오픈채팅 안내) ② 제휴 가입은 사업자(일반과세)·애드픽 비즈회원 먼저(텐핑은 뒤) ③ 금융 상품 캠페인은 노출하지 않음(보류) ④ 애드센스 재검토 최우선(후원 페이지 다음) ⑤ 애드핏을 먼저 전체에 쓰다 애드센스 승인 뒤 전체 교체(`ADS_MODE` 한 변수) ⑥ 네이버 사이트맵은 10-22 제출돼 있어 할 일 없음 ⑦ 방침 광고 절(제3자 광고와 쿠키)은 이미 있어 변경 없음.

## 1. 시작 전에 읽을 것

1. `AGENTS.md` — 보호 기준·검증 목록(정본).
2. `docs/STATUS.md` — 운영 판·브랜치·열린 일.
3. `docs/codex/FOLLOWUP_FINDINGS_V22_9_97.md`(H-1~H-15)와 `docs/codex/FINDINGS_LEDGER.md` 의 ‘남음’·‘결정 필요’ 행(2026-11-03 기준 남음 40 = P2 8·P3 32, 결정 필요 4).
4. `docs/OPERATIONS_CONFIG.md` — 변수·cron·관제 한 장(후원 변수 절 포함).
5. `docs/deployments/V22_9_97_2026_11_03.md` — 이번 운영 반영 기록.

## 2. 할 일 (우선순위 순)

### A. 애드센스 재검토 (최우선)
- 콘솔 쪽(사용자 또는 Aside): 2026-11-03 14:1x 끝 — 서치 콘솔 sitemap.xml 재제출(성공 60개) + 새 글 8편 ‘색인 생성 요청’ 8/8 접수(검사 시점 미색인). 애드센스 사이트 ‘주의 필요 — 가치가 별로 없는 콘텐츠’(정책 위반 없음), ads.txt 화면 ‘찾을 수 없음’(공개 파일 200·게시자 ID 일치, 결함 아님 H-15), ‘검토 요청’ 단추 활성. **다음:** 11-05 무렵 서치 콘솔 URL 검사로 글 8편 색인 여부 확인 → 색인된 글이 있으면 사용자가 ‘검토 요청’ 을 지목 → 누름(Aside 또는 사용자). 색인 전에는 누르지 않는다(거절 뒤 재요청 간격이 길다). 결과는 2~4주 뒤.
- 저장소에서 할 수 있는 것(작은 PR 하나씩, 각각 검사 등록·추적표 갱신):
  - H-8: 기존 글에서 새 글 8편으로 가는 내부 링크가 없다. 허브 `/articles` 밖에서도 관련 글 목록(같은 주제 묶음)에 새 글이 들어가게 한다. 글 모듈은 `src/modules/public/living-cost-articles-v22997.js`, 허브·관련 글 생성은 `src/modules/public/` 의 글 모듈들과 `content-pages.js` 를 grep 한다. 공개 글 수(40)·sitemap(60)·AD_PAGE_KEYS(53) 검사가 있으니 수치를 바꾸면 `validation/validate-v22997-articles.mjs` 도 같이 본다.
  - H-10: 글 8편의 문장 사람 검토 — 사용자가 고칠 문장을 주면 반영. 출처는 nts.go.kr·law.go.kr 만(검사가 호스트를 본다).
  - H-9: 첫 화면 ‘최근 글’ 은 사용자 결정 뒤에만. 휴대폰 홈은 35 KiB 예산 여유가 141 B 뿐이라(H-1) 홈에 무엇을 더하려면 다른 곳을 줄여야 한다(`validate-ui-perf` 가 막는다).
- 하지 말 것: 애드센스 ‘검토 요청’ 단추(사용자 지목), tools.malhaebook.com noindex(H-14, 다른 저장소 `everyday-tools`, 사용자 결정), 심사용 임시 품질 높이기.

### B. 애드핏 (승인 메일 대기)
- 제휴 문의 접수 KAKAO-20261101230148-54(11-01 23:01). 승인 메일(admin@malhaebook.com → 네이버 메일함)이 오면 인증코드 → 가입(카카오계정) → 매체 등록 → 광고 단위 → 매체 심사는 사용자/Aside 몫이고 각각 사용자가 지목한다.
- 저장소: 코드는 V22.9.92 에 준비돼 있다(`ADS_MODE=adfit` + `ADFIT_UNIT_CONTENT`·`ADFIT_UNIT_SIZE`, 공개 정본 53쪽만, 로그인 화면 제외). 켜기 직전 운영 `CANONICAL_REDIRECT=1` 을 다시 확인한다. 애드센스 승인이 나면 `ADS_MODE=live` 로 바꿔 전체 교체한다(한 배포에 한 네트워크만 — 애드핏 5.2 준수).

### C. 제휴(애드픽)
- 가입은 사용자가 한다(비즈회원, 사업자등록증·본인 인증). 가입 뒤 C-3 제휴 배너 슬롯(알뜰폰 먼저, ‘광고’ 라벨, 클릭 로그, 변수로 켜고 끔, 금융 캠페인 제외)을 출시 뒤 첫 작은 PR 로 만든다. 소재 형식(배너 크기·링크 모양)은 가입 뒤 사용자가 준다.
- 직접 제휴 제안용 백데이터: 출시 뒤 관제 ‘이용 현황’ 과 Cloudflare 방문 통계를 월별로 모은다(저장소 밖 작업, 사용자).

### D. 결함 수정 후보(출시 전, 작은 PR 단위)
- 관제 `monitoring/worker.mjs` `collectD1` 118줄이 빈 행을 던져 120~121줄의 0 처리에 닿지 못한다(2026-10-31 발견, P3, 추적표 미등록). 추적표에 올린 뒤 고치고 `monitoring/test-d1.mjs` 에 경우를 더한다. 관제 배포는 사용자 지목(1.6.1).
- 추적표 ‘남음’ P2 가운데 코드로 닫을 수 있는 것: V95:E-1(챗봇 첫 기록에 동의 안내 한 줄 + 약관·방침 링크 버튼 — 답 글에 주소를 넣지 않고 링크 버튼으로, Y-7 규칙), V95:E-2(`accountbook_auth_attempts` 보유기간 정리 — SQL 이 필요하면 검토용 파일로만 두고 적용은 사용자 지목), V95:E-9(봇 ‘기록하는 법’ 카드 두 줄 노출), V95:E-10(옛 인라인 런타임 외화 되묻기), V94:R-13(옛 1년 캐시 자산 보관 규칙: 최근 운영 두 판이 V96·V97 이라 그보다 옛 판만 쓰던 주소를 줄일 수 있다 — 주소 버전·manifest·pin 갱신 규칙은 AGENTS.md).
- 금액·날짜 인식은 넓히지 않는다(V22.9.93 교훈: 정확한 문장 꼴에서만 켜고 나머지는 운영 동작이나 되묻기). V93:Q-104(같은 줄 두 기록)는 ‘운영 그대로’ 로 결정됐다.
- 11-11 부터 출시까지는 사용자가 보고한 결함만 고친다.

### E. 출시 직전(사용자 몫, 저장소에서 챙길 것)
- R-10 Workers Paid 전환 + 관제 `CF_PLAN` 변수 + /ops-monitor 요금제 확인 저장(사용자, 11-13 전). 값이 바뀌면 `docs/OPERATIONS_CONFIG.md` 관제 절과 `monitoring/` 검사의 한도 표를 확인한다.
- R-8 DB 백업(Supabase Pro 또는 dump·복원 리허설), R-11 main 보호 규칙 — 사용자 결정.
- 공지 띠 변수(NOTICE_TEXT·NOTICE_LINK) 제거는 출시 1주 뒤 사용자 지목.

### F. 후원 운영(코드 없음)
- 후원자 표시는 운영자가 오픈채팅에서 확인한 뒤 `/admin/supporters` 로 켠다. 관제 ‘후원(대략, 30일)’ 줄은 다음 이용 현황 수집 뒤 숫자가 생긴다(대략값, H-2·H-3·H-6).

## 3. 작업 규칙 요약(정본은 AGENTS.md)

- `src/modules/` 를 고치고 `npm run build:worker` 로 `src/index.js` 를 재생성해 함께 커밋한다. 새 검사는 `.codex/scripts/verify-repository.mjs` 목록과 `package.json` 에 등록한다.
- 판마다 `BUNDLE_FILE_CHECKSUMS_V22_9_NN.sha256` 을 마지막에 만들고 `EXPECTED_MINIMUM_CHECKS` 는 두 모드 실측 중 작은 값 이하로 둔다. 두 모드 하네스(`node .codex/scripts/verify-repository.mjs`, `npm run validate:categories-absent`) 통과 뒤 PR, CI 4/4 를 본다.
- 1년 캐시 자산(`/assets/*-vNNNNN.css|js`)을 바꾸면 주소 버전을 올리고 manifest 와 pin 을 갱신한다.
- main 병합·Worker 승격·되돌리기·Secret/변수 변경·DB SQL·콘솔 변경은 사용자가 그 일을 지목한 뒤에만(Aside 또는 사용자). 되돌리기 실행 명령 예시를 답장·문서에 쓰지 않는다. 실명은 `BUSINESS_FOOTER_INFO` 에만 둔다. 비밀 값은 코드·문서에 넣지 않는다.
- 운영에 대한 확인은 읽기만(GET /health·/ready·공개 화면). 로그인·가입·후원자 설정 같은 쓰기 동작은 하지 않는다.

## 4. Claude 쪽 증거(저장소 밖, 같은 PC `D:\Github_Kakao_Account\review-artifacts\`)

- `v97-monetization-prep-2026-11-02/` — deploy 지시문(prompt-*.txt)·merge/RESULT.md·app/claude-checks.md·naver/RESULT-2026-11-03.md·agent-reports/·work/.
- `monetization-2026-11-02/` — EXECUTION-PLAN.md(진행표)·AFFILIATE-RESEARCH.md(제휴 조사, 출처 33개)·REVIEW-FABLE-PLAN.md(수익화 순서).
- `adfit-2026-11-01/` — 애드핏 제휴 문의 값·증거.
- Claude 쪽 상태 요약은 `D:\Github_Kakao_Account\CLAUDE.md` 와 `review-artifacts/CURRENT_HANDOFF.txt`(Claude·Aside 공용) 맨 위 줄이다. Codex 가 판을 올리거나 운영에 반영하면 저장소 문서(STATUS·MATRIX·KNOWN-ISSUES·CHECKLIST·deployments)를 고치고, 가능하면 CURRENT_HANDOFF.txt 맨 위에 한 줄을 더한다.

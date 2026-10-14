# Codex 인계: Lucian UX/UI 요소 적용 (2026-10-14)

이 문서는 Codex가 Lucian UX/UI Prompt(https://github.com/Seokwoooo/lucian-uxui-prompt, MIT)의 요소 21개를 말해가계부 화면에 옮겨 넣기 위한 작업 지시입니다.

- 2026-10-14 Claude 세션에서 만들었습니다. 이 세션은 저장소 코드를 바꾸지 않았고 이 문서만 추가했습니다(추적 안 됨).
- 선정 근거와 200개 전체 등급표는 `D:\Github_Kakao_Account\review-artifacts\lucian-uxui-2026-10-14\MAPPING.md`(git 밖)에 있습니다.
- 요소 원문 21개와 토큰 파일은 같은 폴더의 `elements/`에 있습니다(2절).

## 0. 현재 상태

### 2026-10-14 Codex 후속 기록

- PR #79를 main `e84ce2f877a3201343e2cb86aba1bede73ff1e39`에 머지했습니다(08:07:33 UTC). 운영 배포는 수행하지 않았습니다. 아래 최초 확인 기록은 작성 당시의 상태입니다.
- 사용자가 “PR #79 머지 후 묶음 E부터 진행”을 선택했습니다. 깨끗한 main에서 `codex/lucian-e`를 만들고 이 문서만 첫 커밋 `e669285`에 보존했습니다. E의 버전은 최신 main 다음인 `V22.9.46-LUCIAN-E`입니다.
- 사용자가 C를 나중의 별도 PR로 승인했습니다. 그때 `/my/analysis` 해시 고정 갱신과 분석 스튜디오 변경을 수행할 수 있습니다. 이번 E에서는 `insightClientMain`·레거시 `/analysis`를 변경하지 않습니다.
- 요소 088은 사용자에게 확인한 예외에 따라 홈에서 전체 기간 기록 존재 여부를 최대 한 번 조회합니다. 당월 또는 이전 달 기록이 있으면 생략하고, 조회 실패는 기록 0건으로 처리하지 않습니다. 기록 없는 이름 있는 가계부는 첫 기록 버튼 하나, 가계부 없는 시작 화면은 템플릿 네 장으로 구분합니다.
- 오래된 빈 가계부에 투어를 자동 표시하지 않도록 생성 후 24시간 이내의 기록 없는 가계부만 자동 대상입니다. 나중의 첫 방문은 `tour=1`로 재시작합니다. 목표 응답 후 축하와 첫 페인트 가리기 때문에 goals·theme 자산도 shell·V5와 함께 v22946으로 올리고 이전 네 주소의 바이트를 보존합니다.
- E의 검증과 사용자 절차는 `VERIFICATION_V22_9_46.md`, `docs/ASIDE_V22_9_46.md`에 기록합니다. A·D의 감사 선행 조건은 그대로이며, 감사 인계 문서에 예약된 V22.9.46 번호는 실제 실행 시 최신 main의 다음 버전으로 정합니다.
- PR #80 리뷰에서 발견된 기록 0건의 챌린지 축하, 접힌 투어 대상, 만 단위 금액 누출과 꺼짐 상태의 DOM 처리를 같은 `codex/lucian-e`에서 수정했습니다. E 검사 192개와 Git 밖 `E/pr80-fixes/`에 수정 전·후 재현을 남깁니다. PR #80은 머지·배포하지 않습니다.

### 최초 확인 기록

- **운영:** V22.9.44-KAKAO-LATENCY. 되돌리기 대상과 ID는 `docs/codex/HANDOFF_V22_9_44_AUDIT.md` 0절과 같습니다.
- **main:** `ed75a0e`(PR #78).
- **V22.9.45-DEFERRED-SAVE:** PR #79(https://github.com/dlsska1014-ops/my/pull/79), 브랜치 `codex/v22945-deferred-save`, 커밋 `262b4a4`. 2026-10-14 16:46 KST 기준 열려 있고 MERGEABLE이며 CI 8개(ubuntu·windows × 일반·분류 표 부재, 두 실행)가 모두 통과했습니다. 아직 머지·배포되지 않았습니다. 바꾼 파일 32개, 새 회귀 검사 224개, 하네스 각 모드 15,005개·체크섬 422개(`VERIFICATION_V22_9_45.md`). 배포 절차는 `docs/ASIDE_V22_9_45.md`입니다.
- **로컬 `my/`:** `codex/v22945-deferred-save`가 체크아웃되어 있고 원격과 같습니다. 추적 안 된 파일은 `Input/`, 관제 문서 둘, 그리고 이 문서뿐입니다.
- **이 작업의 시작 조건:** PR #79와 V22.9.46(P1 데이터 정확성, 인계 문서 6절) PR이 main에 머지된 뒤, 깨끗한 main에서 묶음마다 브랜치를 만듭니다. 이유는 4절의 파일 충돌표에 있습니다. 묶음 E·B는 #79 머지 직후부터 가능합니다.
- **범위:** 웹 화면만 바꿉니다. 카카오 응답, SQL, 환경변수, Secret, Kakao Developers, OpenBuilder는 바꾸지 않습니다. 새 DB 호출은 묶음 B·C에서만, 아래에 적은 횟수만큼만 늘립니다.

## 1. 시작 전에 읽을 것

1. `AGENTS.md`: 필수 보호 기준, 검증 목록, 클라이언트 코드 직렬화 규칙
2. `docs/codex/HANDOFF_V22_9_44_AUDIT.md` 2·3절: 저장소 스킬과 실제가 다른 점, 작업 규칙(빌드·자산 버전·성능 예산·Windows 함정). 이 문서는 그 규칙을 반복하지 않고 UI 포팅에 필요한 것만 더합니다.
3. `docs/ux/UX_PRINCIPLES_BRUNCH_110_PROJECT_MEMORY.md`: 특히 원칙 2(주 행동 하나), 3(상태 즉시 알림), 6(빈 결과도 다음 행동), 7(움직임은 상태 변화 설명에만), 8(버튼은 동사). "분석 화면은 별도 요청 없이 변경하지 않는다"는 레거시 `/analysis`에 대한 결정이며, 묶음 C는 `/my/analysis` 분석 스튜디오만 다룹니다(12절 사용자 결정 2).
4. `docs/v5/CLAUDE_DIRECTION.md` 2.1절: 셸은 갈아엎지 않고, 신규 기능은 격리된 추가로, 지출/수입 색은 시맨틱 토큰으로.
5. `review-artifacts/lucian-uxui-2026-10-14/MAPPING.md` 3·7절: 요소별 자리와 제약
6. 요소 원문의 머리 주석(`What it does`, `How to use it`): 옮길 때 보존해야 할 상태와 상호작용이 적혀 있습니다.

## 2. 자료 위치와 요소 원문을 얻는 방법

- **폴더:** `D:\Github_Kakao_Account\review-artifacts\lucian-uxui-2026-10-14\`
  - `MAPPING.md`: 200개 등급표, 토큰 매핑, 묶음 제안
  - `elements/NNN.txt`: 이번 범위 21개 요소 원문(한국어 문구판). `008 029 035 070 071 081 088 092 093 096 097 130 134 138 143 145 151 163 165 178 197`
  - `elements/tokens.css`: `--ux-*` 토큰과 `.ux` 공통 규칙(라이트·다크·모션 줄이기)
  - `elements/catalog.ko.tsv`, `elements/index.json`: 전체 목록(다른 요소를 찾을 때)
- **원문 형식:** 파일마다 `<!-- Lucian UX/UI Prompt #NNN · MIT License ... -->` 한 줄, 설명 주석, `<style>`(모든 선택자가 `.uNNN` 안), `<div class="ux uNNN">`, `<script>`(`document.currentScript.previousElementSibling`으로 루트를 찾는 IIFE) 순서입니다.
- **폴더가 없을 때(클라우드 샌드박스 등):** 같은 파일을 `https://lucianlabs.dev/uxui-prompt/api/v1/ko/e/NNN.txt`와 `https://lucianlabs.dev/uxui-prompt/api/v1/ko/tokens.css`에서 받습니다. 네트워크가 막히면 사용자에게 폴더를 요청하고, 요약만 보고 요소를 지어내지 않습니다.
- **스킬:** `npx skills add Seokwoooo/lucian-uxui`는 설치하지 않아도 됩니다(원문이 이미 있음). 이번 범위 밖 요소를 찾을 때만 씁니다.
- **라이선스:** 옮긴 코드가 들어가는 모듈 파일의 해당 함수 바로 위에 원문 첫 줄을 `//` 주석으로 남깁니다. 요소 하나당 한 줄이면 됩니다.

## 3. 포팅 규칙 (이 저장소에 맞춘 것)

### 3.1 토큰

요소 CSS의 `var(--ux-*)`를 전부 찾아 아래로 바꿉니다. `--ux-*` 이름을 저장소에 새로 정의하지 않습니다(셸 토큰 한 벌만 유지).

| 요소 토큰 | 저장소 토큰 | 비고 |
|---|---|---|
| `--ux-page` | `--ab12-bg` | |
| `--ux-surface` | `--ab12-surface` | |
| `--ux-surface-2`, `--ux-surface-3` | `--ab12-surface-raised` | 두 단계를 하나로 |
| `--ux-ink` | `--ab12-text` | |
| `--ux-ink-2`, `--ux-ink-3` | `--ab12-muted` | |
| `--ux-line`, `--ux-line-2` | `--ab12-line` | |
| `--ux-accent` | `--ab12-accent` | 톤 4종을 따라감 |
| `--ux-accent-2` | `--ab12-brand` | |
| `--ux-accent-soft` | `--ab12-accent-soft` | |
| `--ux-accent-ink` | `#fff` | 액션 버튼 글자 |
| `--ux-mint` | `--ab12-down` | 수입·긍정(지출 감소) |
| `--ux-danger` | `--ab12-gauge-over` | 초과·오류 |
| `--ux-warn` | `--ab12-gauge-warn` | 경고 |
| `--ux-ease` | `--ab12-ease` | |
| `--ux-spring` | `cubic-bezier(.34,1.45,.64,1)` 리터럴 | 토큰 신설 금지(셸 토큰 변경 범위 밖) |
| `--ux-shadow`, `--ux-shadow-strong` | `--ab12-elev-float` 또는 `--ab12-shadow` | |
| `--ux-glass*`, `--ux-grad` | 쓰지 않음 | 장식 토큰. 이번 범위 요소는 쓰지 않음 |

- 증감 색은 `--ab12-up`(지출 증가·붉은 계열), `--ab12-down`(수입·감소)으로 고정합니다. 톤에 따라 바뀌지 않습니다(셸 CSS 주석 V22.8.85 2.1).
- **다크:** 요소의 `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) …}`와 `:root[data-theme="dark"] …` 두 블록을 **하나**로 합쳐 `html[data-ab-resolved-theme="dark"] .uNNN …`로 바꿉니다. 저장소는 서버·클라이언트가 정한 `data-ab-resolved-theme`만 봅니다.
- `.ux` 공통 규칙(`box-sizing`, 글꼴, `:focus-visible`, `[hidden]`, 모션 줄이기)은 셸이 이미 같은 역할을 하므로 가져오지 않습니다. 단 요소가 `.ux :focus-visible` 테두리에 기대면 `.uNNN :focus-visible`로 옮깁니다.
- `prefers-reduced-motion`: 요소 CSS의 전환·반복을 멈추는 규칙을 그대로 둡니다. 스크립트의 `rm` 분기(모션 줄이기 때 지연 단축)도 그대로 둡니다.

### 3.2 스크립트

- 요소의 IIFE를 `src/modules/client/*`의 **실제 함수**로 옮기고 `.toString()`으로 직렬화합니다(AGENTS.md). 루트는 `document.currentScript`가 아니라 `document.getElementById`나 `data-ab-*` 속성으로 찾습니다.
- 함수 본문은 Worker 최상위 이름을 참조하지 않습니다. `validate-client-serialization-v22932`가 막습니다. 다른 클라이언트 함수가 전역으로 내려 주는 것을 쓰려면 그 검사의 `PAGE_GLOBALS`에 제공자와 함께 적습니다.
- 한 화면에 같은 요소가 여러 개 있을 수 있는 자리(거래 행, 분류 행)는 요소 스크립트를 "루트 하나 초기화" 함수로 바꾸고 `querySelectorAll`로 돌립니다. `window`·`document` 리스너와 타이머는 루트가 사라질 때 정리합니다(날짜 상세 팝업처럼 다시 그려지는 곳).
- 인라인 `onclick=` 같은 속성 처리기는 쓰지 않습니다(엄격한 CSP 준비, `NEXT_UPDATE_PLAN.md` V22.9.40 이후 5).
- 요소가 `setTimeout`으로 시연하는 "가짜 저장 완료"는 전부 실제 결과로 바꿉니다. 성공 표시는 서버 응답을 받은 뒤에만 합니다(`docs/ux` V22.9.29 "정직한 안내").

### 3.3 어디에 넣는가

| 화면 | CSS | JS | 주소·해시 갱신 |
|---|---|---|---|
| 홈 `/app`, 거래 목록, 날짜 상세, 빠른 입력 시트 | `assets/accountbook-shell-css.js`(셸 CSS 자산) | `client/v5-bundle-mains.js`(V5 번들) | `assets/asset-registry.js`의 `ACCOUNTBOOK_SHELL_CSS_ASSET_PATH`(지금 v22940)·`ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH`(지금 v22937) 버전 올림 + `validation/validate-immutable-asset-addresses-v2299.mjs` 해시 고정 갱신. 옛 주소는 유지 |
| 분석 스튜디오 `/my/analysis` | `my/insight-page.js` 인라인 CSS | `client/insight-main.js` → `/my/analysis/app.js?v=APP_VERSION` | `validate-ux-principles.mjs:182`의 `insightClientMain` 해시 갱신(사용자 승인 뒤) |
| 설정·관리 페이지(각자 HTML) | 그 페이지의 인라인 `<style>` | 그 페이지가 직렬화하는 클라이언트 함수 | 없음(`no-store` HTML) |

- **홈 HTML 예산 35 KiB**(기준 픽스처, 여유 248 B)와 실사용 44 KB는 넘기지 않습니다. 홈에 인라인 CSS·JS를 더하지 않습니다. 홈 마크업에 더하는 것은 훅 속성(`data-ab-*`)과 빈 상태 템플릿 링크 정도로 제한하고, 변경 뒤 `validate-ui-perf`로 바이트를 다시 잽니다.
- 묶음 A·B·E는 같은 두 자산(셸 CSS·V5 번들)을 바꾸므로 **묶음 하나가 머지될 때마다** 주소를 한 번 올립니다. 묶음 안에서 요소마다 올리지 않습니다.

### 3.4 UX 규칙

- 요소의 샘플 문구·숫자는 전부 실제 데이터와 저장소 문구로 바꿉니다. 버튼은 동사(`저장`, `삭제`, `되돌리기`, `하나 더 입력`)로 씁니다.
- 접근성 속성(`aria-*`, `role`, `tabindex`, 키보드 처리, 포커스 테두리)은 요소 것을 유지합니다. 터치 대상은 44px 이상입니다.
- 모션은 상태 변화를 설명할 때만 씁니다. 요소의 장식 연출(떠다니는 blob, 자석 끌림, 반사광)은 옮기지 않습니다. 이번 21개에는 없지만 요소 안에 섞여 있으면 뺍니다.
- 375px 폭에서 가로 스크롤이 없어야 합니다. 요소의 고정 폭(`Footprint: fixed size`)은 `max-width:100%`로 풀고 보고합니다.
- 다크·라이트, 톤 4종(blue·emerald·violet·amber)에서 글자 대비 4.5:1 이상. `tools/screen-audit.mjs`로 잽니다.

## 4. 묶음과 충돌표

| 묶음 | 요소 | 주로 바꾸는 파일 | 겹치는 감사 갈래(인계 문서 6·7절) | 시작 조건 |
|---|---|---|---|---|
| A 빠른 입력 | 035 · 145 · 081 | `my/mobile-home.js`(497줄 시트 마크업), `client/legacy-ui-runtime.js`(112~135 `applySmartInput`), `client/v5-bundle-mains.js`(352 빠른 입력, 798 저장 피드백), 셸 CSS | **2-A**(`shared-input-parsers.js`, `v5-bundle-mains.js` 빠른 입력 부분, F-1) | V22.9.46 머지 뒤 |
| B 목록·되돌리기 | 070 · 071 · 092 | `client/v5-bundle-mains.js`(10 목표 토스트, 588 활동 레일, 830 날짜 상세), `client/nav-search-notif-mains.js`(586 검색), `api/user-api.js`·`worker/router.js:1289`(검색 API), 셸 CSS | 2단계와 겹치지 않음. 3단계 '가져오기'·'관제'와도 없음 | V22.9.45 머지 뒤 바로 가능 |
| C 분석 스튜디오 | 097 · 096 · 163 · 165 · 151 | `client/insight-main.js`, `my/insight-page.js`(payload·CSS) | 3단계 '돈·집계' D-3(`insight-main.js`) | 사용자 결정 2 + D-3와 같은 작성자이거나 D-3 뒤 |
| D 관리 화면 | 130 · 134 · 029 · 143 · 008 | `my/backup-import.js`, `import/flexible-import-parser.js`, `features/settlement-ops-pages.js`, `settings/categories-keywords.js`, `my/settings-page.js`, `my/households-lifecycle.js` | **2-C**(`categories-keywords.js`, `settings-page.js`), 3단계 '가져오기' E-1~E-17(`backup-import.js`, 파서) | 029·143은 V22.9.46 뒤, 130은 E-1 뒤, 134·008은 바로 가능 |
| E 온보딩·동기부여 | 088 · 197 · 093 · 138 | `my/mobile-home.js`(409 온보딩, 422 빈 상태), `client/v5-bundle-mains.js`(1043 챌린지, 새 투어·가리기 함수), `my/report-challenge.js`, `web/menu-and-guides.js`(255 외관 패널), 셸 CSS | 2단계와 겹치지 않음 | V22.9.45 머지 뒤 바로 가능 |
| F 보류 | 178 · 190 · 034 · 184 | user-scope API 신설이 먼저 | – | 10절 |

- 권장 순서: **E → B → A → D → C**(충돌이 적은 것부터, A는 2-A 뒤). 사용자가 가치 순(A 먼저)을 원하면 A를 2-A 작성자에게 같이 맡깁니다.
- 묶음 하나 = 브랜치 하나 = 버전 하나 = PR 하나. 버전 번호는 브랜치를 만들 때 main의 다음 번호를 씁니다(예: V22.9.47-LUCIAN-E). 번호를 미리 예약하지 않습니다.
- 한 묶음 안에서 요소를 나눠 병렬로 할 때도 `src/index.js`·manifest·자산 주소·버전 파일은 작성자 하나만 씁니다.

## 5. 묶음 A: 빠른 입력 (추론 High)

목표: 가장 자주 쓰는 동작(지출 한 건 입력)을 한 손으로 더 빨리, 틀린 파싱을 저장 전에 눈으로 잡게 합니다.

### 035 송금 금액 입력 → 빠른 입력 금액 칸

- **지금:** `my/mobile-home.js:497`의 `<input id="amountInput" class="amountInput" type="text" name="amount" inputmode="numeric" placeholder="예: 12,000" required/>`. `legacy-ui-runtime.js`의 `formatAmount`가 쉼표를 넣고, 서버는 쉼표를 벗겨 받습니다.
- **바꾸는 것:**
  - `#amountInput`은 그대로 제출 값으로 유지합니다(JS 없이도 동작). 그 위에 035의 자리별 굴림 표시층을 얹습니다. 입력할 때마다 바뀐 자리만 굴리고 천 단위 쉼표를 넣습니다.
  - 빠른 금액 칩 줄: `+1천 · +5천 · +1만 · +5만`(사용자 결정 4). 누르면 더합니다. `지우기` 칩 하나.
  - 예산 잔액 초과: 서버가 시트 섹션에 `data-ab-budget-left="<원>"`를 실어 줍니다(홈 `homeUsage`가 이미 계산하는 값, 지출일 때만). 금액이 잔액을 넘으면 요소처럼 금액이 붉게 흔들리고 `aria-invalid`와 안내문("이번 달 남은 예산 N원을 넘어요")을 보입니다. **저장은 막지 않습니다**(요소는 보내기를 막지만 가계부는 초과 지출도 기록이 사실).
  - 수입 라디오일 때는 예산 비교를 끕니다.
- **완료 기준:** 픽스처 렌더에서 `input#amountInput`과 `data-ab-budget-left`가 있고, 번들에 035 함수가 있으며 `document.currentScript`가 없고, 홈 바이트가 예산 안입니다. DevTools 파이프 검사로 "12000" 입력 → 표시 "12,000", 칩 `+1만` → "22,000", 잔액 초과 → `aria-invalid="true"`, 제출 폼 값이 숫자와 쉼표만인지 확인합니다. 모션 줄이기에서 굴림 없이 즉시 바뀝니다.

### 145 단어별 받아쓰기 수정 → 파싱 토큰 교정

- **지금:** `legacy-ui-runtime.js:112-135` `applySmartInput`이 `shared-input-parsers.js` 결과로 금액·메모·결제수단·분류·구분을 채우고 `.smartHint`에 "12,000원 · 지출로 채웠어요. 저장 전 내용을 확인해주세요." 한 줄만 보여 줍니다. 감사 A-01~06의 오파싱('만두'→10,002원, '어제저녁'→오늘)을 사용자가 알아챌 장치가 없습니다.
- **바꾸는 것:**
  - `#smartInput` 아래에 토큰 줄을 그립니다: `날짜` · `금액` · `구분` · `분류` · `결제수단` · `메모`. 파서가 찾은 값은 값으로, 못 찾은 것은 "없음"으로 흐리게 표시합니다.
  - 토큰을 누르면 해당 입력칸으로 포커스가 가고 값이 선택됩니다(금액→`#amountInput`, 날짜→날짜 칸, 구분→라디오, 분류·결제수단→각 칸, 메모→메모 칸). 요소의 "단어마다 시간이 붙어 틀린 단어만 고친다"를 "토큰마다 칸이 붙어 틀린 토큰만 고친다"로 옮깁니다.
  - 칸을 직접 고치면 토큰 값도 따라 바뀝니다(양방향).
  - `.smartHint`는 `aria-live` 요약으로 유지합니다. 토큰 줄은 `role="list"`, 토큰은 `button`입니다.
  - 파서는 바꾸지 않습니다. 2-A가 고친 파서 결과를 그대로 보여 주는 것이 이 요소의 역할입니다. 그래서 2-A 뒤에 합니다.
- **완료 기준:** "어제 점심 12000 국민카드" → 토큰 6개 중 날짜=어제 날짜, 금액=12,000, 구분=지출, 결제수단=국민카드, 분류=파서 값, 메모=점심. 금액 토큰 클릭 → `#amountInput`에 포커스·선택. 키보드만으로 토큰 이동·실행 가능. 픽스처 렌더의 홈 바이트 예산 유지(토큰 줄 마크업은 JS가 만듭니다).

### 081 결제 링→체크→영수증 → 저장 완료 피드백

- **지금:** `v5-bundle-mains.js:798` `accountbookSaveFeedbackClientMain`이 저장 뒤 복귀 피드백을 처리합니다(`docs/uiux/V22_8_49_STAGE3_QUICK_INPUT_FLOW.md`, `V22_8_50_STAGE4_SAVE_RETURN_FLOW.md`). 제출 중 문구는 `legacy-ui-runtime.js`가 "저장 중…"으로 바꿉니다.
- **바꾸는 것:**
  - 제출 중: 저장 버튼이 081처럼 원으로 오므라들며 링이 돕니다. 기존 `aria-busy`·"저장 중…" 문구는 유지합니다(시각만 더함).
  - 저장 성공 복귀: 링이 체크로 바뀐 뒤 **방금 저장한 기록**(날짜·금액·분류·결제수단·메모)이 영수증 카드로 밀려 올라옵니다. 데이터는 `/u/api/recent-transactions`(이미 있음)에서 가장 최근 1건을 읽습니다. 새 API를 만들지 않습니다.
  - 카드 아래 두 동작: `하나 더 입력`(시트를 비운 채 다시 염, 날짜는 유지) · `닫기`. 주 행동은 `하나 더 입력` 하나입니다.
  - 실패 복귀(`err=`)는 지금 흐름 그대로입니다. 성공 표시는 복귀 신호(`msg=`)와 최근 1건 조회가 모두 맞을 때만 합니다. 조회가 실패하면 영수증 없이 기존 완료 문구만 보입니다.
- **완료 기준:** 픽스처에 기록 1건을 POST한 뒤 복귀 화면에서 영수증 카드의 금액·분류가 저장 값과 같습니다. 모션 줄이기에서 링 없이 체크·카드만 나옵니다. 영수증 카드는 `role="status"`로 읽힙니다.

### 묶음 A 공통

- 셸 CSS와 V5 번들 주소를 한 번 올리고 해시 고정을 갱신합니다.
- 새 검사 `validation/validate-lucian-a-v229NN.mjs`를 11절대로 등록합니다.
- 남는 것: 카카오 쪽 입력에는 적용되지 않습니다(웹 전용). KNOWN-ISSUES에 적습니다.

## 6. 묶음 B: 목록·되돌리기 (추론 High)

목표: 삭제를 "확인창 → 기다림"에서 "즉시 반영 → 5초 되돌리기"로 바꾸고, 빈 검색 결과에 다음 행동을 붙입니다.

### 070 겹쳐 쌓이는 토스트 → 공용 토스트

- **지금:** 토스트는 목표 화면 전용(`v5-bundle-mains.js:17-163`, `#goalToast`·`#goalToastUndo`). 다른 화면은 배너·인라인 문구를 씁니다.
- **바꾸는 것:**
  - V5 번들에 `accountbookToastClientMain`을 새로 만들고 `window.abToast({ text, undo, timeoutMs, promise })`를 내려 줍니다. `validate-client-serialization`의 `PAGE_GLOBALS`에 제공자와 함께 적습니다.
  - 새 알림은 아래에서 올라와 앞에 서고 이전 것은 뒤로 겹칩니다. 커서를 올리거나 포커스하면 펼쳐지고 자동 사라짐이 멈춥니다. `promise`형은 "저장 중"으로 돌다가 결과로 바뀝니다.
  - 목표 화면은 지연 커밋 로직(`startPending/commitPending/pagehide keepalive`)을 그대로 두고 UI만 `abToast`로 바꿉니다.
  - 컨테이너는 `role="region" aria-label="알림"`, 토스트 하나는 `role="status"`. 되돌리기 버튼은 Tab으로 닿습니다. 모바일 하단 탭·빠른 입력 시트와 겹치지 않는 위치(`.abUxBottom` 위)입니다.
- **완료 기준:** 토스트 3개를 연달아 띄워 겹침·펼침·개별 닫기·Esc를 DevTools 파이프로 확인합니다.

### 071 밀어서 지우고 되돌리기 → 거래 삭제 되돌리기

- **지금:** 날짜 상세 팝업의 삭제는 `v5-bundle-mains.js:874`의 폼(`/admin/delete`, `data-ab-day-delete`)이고 `:907`에서 `window.confirm("… 기록을 삭제할까요?")`을 띄웁니다. `legacy-ui-runtime.js:751`의 위험 폼 확인창도 같은 역할을 합니다.
- **바꾸는 것:**
  - `item.can_delete`일 때만 삭제 버튼을 그립니다(지금과 같음). 누르면 확인창 없이 행이 접히며 사라지고, `abToast`로 "N원 기록을 삭제했어요 · 되돌리기(5초)"를 띄웁니다.
  - 5초 뒤 또는 `pagehide` 때 실제 `/admin/delete`를 보냅니다(목표 화면 `commitPending`과 같은 방식, `keepalive`). 되돌리기를 누르면 요청 없이 행을 제자리에 펼칩니다.
  - 실제 삭제가 실패하면(응답 오류·`db_write_unknown`) 행을 다시 그리고 실패 토스트에 "다시 시도"를 둡니다. 성공 표시는 응답 뒤에만 합니다.
  - 같은 팝업에서 삭제를 연달아 하면 앞의 것을 먼저 커밋합니다.
  - 스와이프 제스처는 사용자 결정 3에 따릅니다. 기본은 버튼만입니다.
  - `legacy-ui-runtime.js:751`의 일반 위험 폼 확인창은 그대로 둡니다(가계부 삭제·초대코드 재발급 등은 확인창이 맞음, UX 원칙 "중요한 결과는 확인창").
- **완료 기준:** 픽스처에서 삭제 → 5초 전에는 DB 호출이 0회, 되돌리기 → 행 복구·DB 0회, 5초 뒤 → DELETE 1회. `pagehide` 모사에서 keepalive 요청이 나갑니다. '기록만' 권한 구성원에게는 삭제 버튼이 없습니다(V22.9.43 규칙).

### 092 필터를 풀어 주는 빈 검색 결과

- **지금:** 통합검색(`nav-search-notif-mains.js:586`, API `/u/api/tx/search?q=` `router.js:1289`)과 활동 레일 필터(`v5-bundle-mains.js:588`)는 0건이면 빈 문구만 보입니다.
- **바꾸는 것:**
  - 0건일 때 "필터 하나를 빼면 몇 건"을 버튼으로 보여 줍니다. 후보는 지금 걸린 조건 중 최대 2개(예: `분류 빼기 → 12건`, `기간 넓히기(최근 3개월) → 40건`).
  - 서버: `/u/api/tx/search`가 `relax=1`을 받으면 결과가 0건일 때만 완화 변형 2개의 **개수**를 함께 돌려줍니다(Supabase `count=exact` HEAD 조회 2회). 0건이 아니면 추가 조회가 없습니다. 늘어나는 DB 호출은 "검색 0건일 때 최대 2회"이며 이 수를 PR 본문에 적습니다.
  - 버튼을 누르면 해당 조건 칩이 접히며 사라지고 결과가 다시 로드됩니다(요소의 칩 × 동작). 돋보기 애니메이션은 모션 줄이기에서 꺼집니다.
  - 그래도 0건이면 "기록 추가하기"(빠른 입력 열기) 하나를 둡니다(UX 원칙 6).
- **완료 기준:** 픽스처에서 분류+기간 조건으로 0건 검색 → 응답에 `relaxed` 2개와 개수, 버튼 2개 렌더. 1건 이상이면 `relaxed` 없음. 조회 전용 역할도 검색은 됩니다(쓰기 버튼만 없음).

### 묶음 B 공통

- 셸 CSS와 V5 번들 주소 올림. 새 검사 `validate-lucian-b-v229NN.mjs`.

## 7. 묶음 C: 분석 스튜디오 (추론 High, 사용자 결정 2 승인 뒤)

목표: `/my/analysis`의 차트에 "훑기·제외·목표 눈금·범위"를 더합니다. 레거시 `/analysis`는 손대지 않습니다.

- **보호:** `validate-ux-principles.mjs:182`가 `insightClientMain` 블록을 해시로 고정합니다(BASELINE "분석 화면 고정"). 사용자 승인 뒤 해시를 갱신하고, 검사 주석에 "V22.9.NN Lucian C: 이유"를 적습니다. 승인이 없으면 이 묶음은 하지 않습니다.
- **데이터:** `my/insight-page.js:114-127`의 `window.__INSIGHT__` payload는 `start·today·name·hid·budget·total·basis·cats·rows·truncated`입니다. 클라이언트가 `rows`로 일별 합계를 만듭니다. 096·165·151에 필요한 것:
  - `prevDaily`: 지난달 일별 지출 합계 배열(길이 = 지난달 일수). 서버 집계로 숫자 배열만 싣습니다.
  - `daily84`: 오늘부터 84일 전까지 일별 지출 합계와 건수. 역시 서버 집계.
  - 두 값은 **DB 조회 1회**(날짜 범위 84일, 필요한 열만)로 만들고 `rows`와 별도로 둡니다. `/my/analysis`의 현재 호출 수를 세어 전후를 PR에 적습니다. `truncated`일 때도 집계는 전체 행 기준입니다.

| # | 자리(`insight-page.js` h2) | 바꾸는 것 | 완료 기준 |
|---|---|---|---|
| 097 | `분류별 구성` 도넛 | 조각 hover/포커스 → 가운데에 그 분류 금액·비율. 범례나 조각을 누르면 그 분류를 빼고 남은 조각이 각도를 나눠 다시 채움, 합계도 굴러 바뀜. 다시 누르면 복귀. 색은 기존 `C.cat` 유지 | 제외 상태가 URL이나 저장소에 남지 않음(세션 안에서만). 키보드로 조각 이동·제외 가능 |
| 163 | `예산 소비 페이스` | 분류별 한 줄 불릿: 막대=사용액, 눈금=예산, 라벨 "사용률 %·남은 N원". 80% 이상 `--ab12-gauge-warn`, 100% 초과 `--ab12-gauge-over` | 예산 없는 분류는 눈금 없이 막대만. `basis`가 category가 아니면 섹션 숨김(지금 규칙 유지) |
| 096 | `지출 흐름` | 이번 달 누적 선 + 지난달 같은 날 누적 선(회색). 훑으면(포인터·좌우 방향키) 날짜·금액·지난달 대비 증감. 지난달보다 높으면 선·영역이 `--ab12-up`, 낮으면 `--ab12-down`. 손을 떼면 오늘로 복귀 | `prevDaily`가 없으면 지금 선 그래프로 폴백 |
| 165 | `월말 예상`(기존 단일값) | 띠로 범위 표시. 계산은 결정적으로: 지금까지 일별 지출의 평균 m과 표준편차 s, 남은 날 r일 때 중심 = 누적 + m·r, 80% 띠 = ±1.28·s·√r, 95% 띠 = ±1.96·s·√r. 문구 "이대로면 N~M원" | 경과 3일 미만이면 띠 없이 단일값. 음수는 0으로 |
| 151 | `요일 패턴` 아래 | 84일 격자(12주×7일), 칸 진하기 = 지출. 슬라이더·방향키로 날짜를 고르면 그날 금액·건수 | `daily84` 없으면 섹션 생략. 격자 각 칸 `aria-label`에 날짜·금액 |

- **완료 기준(공통):** 새 검사가 픽스처로 `/my/analysis`와 `/my/analysis/app.js`를 렌더해 payload 키와 다섯 함수의 존재, `document.currentScript` 부재를 확인합니다. `tools/screen-audit.mjs`로 라이트·다크·375px 스크린샷을 `review-artifacts/`에 남기고(커밋 안 함) 대비 4.5:1을 확인합니다. 모션 줄이기에서 morph 없이 최종 상태가 보입니다.

## 8. 묶음 D: 관리 화면 (추론 Medium)

### 130 CSV 필드 연결 → 가져오기 열 매핑

- **지금:** `my/backup-import.js:520` `renderMyImportPreviewHtml`이 파서의 `mappings`(`flexible-import-parser.js:588·615`, `{key, source, field, label}`)를 읽기 전용으로 보여 줍니다(`:535`, `:556`). 자동 인식이 틀리면 고칠 길이 없습니다.
- **바꾸는 것:**
  - 표 형식(`format`이 natural_text가 아닐 때)에서 매핑 줄마다 `<select name="map_<source>">`(날짜·금액·내용·분류·결제수단·지출자·무시)을 둡니다. 같은 필드를 두 번 고르면 즉시 경고하고 `다시 분석`을 잠급니다(요소 동작).
  - `다시 분석` 버튼은 `import_action=preview`로 다시 보내며 `map_*` 값을 함께 보냅니다. 서버(`backup-import.js:241` 처리기)는 파서에 `overrides`를 넘기고, 파서는 해당 헤더의 필드를 강제합니다. 새 미리보기 토큰을 만듭니다. 저장(`commit`) 단계는 바꾸지 않습니다.
  - 자연어 행 형식에는 표시하지 않습니다.
  - CPU: 미리보기 재분석은 지금 분석과 같은 비용입니다(E-1 참고). E-1이 먼저 머지된 뒤 합니다.
- **완료 기준:** 헤더가 "일자, 승인금액, 가맹점"인 CSV를 올려 자동 매핑 뒤, 가맹점을 `분류`로 바꿔 다시 분석하면 미리보기 행의 분류 열이 바뀝니다. 중복 필드 선택 시 경고와 잠금. 토큰 만료 흐름은 지금과 같습니다.

### 134 몫을 나누는 영수증 → 정산 지분 즉시 재계산

- **지금:** `features/settlement-ops-pages.js:353`의 지분 입력(`label.weight` 숫자 칸)을 GET 제출하면 서버 `buildSettlementModel`(`:75-146`, equal/item/weighted)이 다시 계산합니다.
- **바꾸는 것:** 지분 숫자를 바꾸면 제출 전에 각자의 금액과 받을/보낼 금액이 요소처럼 굴러 바뀌는 **미리보기**를 그 페이지의 클라이언트 함수로 더합니다. 계산 규칙은 서버와 같아야 합니다(`allocate`의 반올림·잔돈 처리까지). 제출은 지금처럼 GET이며 서버 값이 최종입니다. 미리보기와 서버 결과가 다르면 버그입니다.
- **완료 기준:** 지분 1:1:2 사례에서 클라이언트 미리보기와 서버 렌더의 사람별 금액이 같습니다(검사에서 두 값을 비교). 조회 전용 역할은 지분 칸이 없습니다(지금 규칙).

### 029 색 태그 입력 → 분류 키워드 칩

- **지금:** `settings/categories-keywords.js:135` `renderKeywordBulkEditor`가 분류별 키워드를 문자열로 받고 `normalizeCategoryKeywords`(`:30`)가 쉼표 목록으로 정리합니다. `legacy-ui-runtime.js:421`이 편집기를 2열 접이식으로 다시 그립니다.
- **바꾸는 것:** 분류마다 칩 입력(Enter 추가, 빈 칸 Backspace 두 번 삭제, 추천 칩은 `admin/category-guide-pages.js`의 `CATEGORY_KEYWORD_GUIDE`에서). 제출 값은 기존 hidden 필드의 쉼표 문자열로 유지해 **서버와 저장 경로를 바꾸지 않습니다**. 색은 분류 색이 아니라 한 가지 강조색(`--ab12-accent-soft`)만 씁니다.
- **완료 기준:** 칩으로 추가·삭제한 결과가 제출 폼 값과 같고, 저장 뒤 `category_keywords:<가계부>` 설정 JSON이 지금과 같은 모양입니다(`{ strict: true }`·잠금 규칙 유지). 2-C(D-4) 뒤에 합니다.

### 143 계산하는 셀 → 예산 표 즉시 합계

- **지금:** `my/settings-page.js:358`의 분류별 예산 칸(`budgetLine expenseLine`)은 저장 뒤에만 합계가 보입니다.
- **바꾸는 것:** 칸을 고치면 합계와 "수입 대비 남는 돈"(같은 화면의 수입 값)이 즉시 다시 계산됩니다. 저장은 지금 폼 그대로입니다. 합계가 수입을 넘으면 경고색(`--ab12-gauge-warn`)만, 저장은 막지 않습니다.
- **완료 기준:** 두 칸 값을 바꿨을 때 합계 표시가 서버 저장 뒤 렌더와 같습니다. 2-C 뒤에 합니다.

### 008 복사 버튼 체크 전환 → 초대코드 복사

- **지금:** `my/households-lifecycle.js:202`의 인라인 스크립트가 `[data-copy]` 버튼의 글자를 1.4초 동안 '복사됨'으로 바꿉니다. 참여자·초대 화면(`/my/members`)의 복사도 `data-copy`를 씁니다(grep으로 확인).
- **바꾸는 것:** 겹친 사각형 아이콘이 체크로 그려지고 코드 위로 빛이 지나가며 '복사됨' 말풍선이 뜹니다. `navigator.clipboard` 실패 시 `prompt` 폴백은 유지합니다. 인라인 스크립트는 직렬화 함수로 옮깁니다.
- **완료 기준:** 복사 성공·실패 두 경로에서 문구가 맞고, 1.4초 뒤 원래 글자로 돌아옵니다.

## 9. 묶음 E: 온보딩·동기부여 (추론 Medium)

### 088 종이를 삼키는 빈 폴더 → 빈 가계부 템플릿

- **지금:** `my/mobile-home.js:409` `homeOnboarding`(3단계 글)과 `:422` `homeEmpty`("아직 이번 달 기록이 없습니다…").
- **바꾸는 것:**
  - 가계부에 **기록이 한 건도 없을 때**(새 가계부)만 빈 폴더 요소를 보입니다. 템플릿 네 장: 우리집 생활비 · 여행 · 모임 정산 · 단발성. 누르면 종이가 폴더로 들어가는 연출 뒤 `/my/households?template=<key>`(기존 템플릿 흐름, `households-lifecycle.js:202`가 `template`을 읽음)로 갑니다. 이미 가계부 이름이 있는 경우는 "첫 기록 남기기"(빠른 입력 열기) 한 장만 둡니다.
  - 이번 달만 비어 있고 과거 기록이 있는 경우는 지금 `homeEmpty` 문구를 유지합니다.
  - 마크업은 작게(링크 4개), CSS·JS는 자산으로. 빈 상태 홈도 35 KiB 안인지 검사합니다.
- **완료 기준:** 기록 0건 픽스처에서 템플릿 4장 렌더, 6행 픽스처에서는 렌더 안 됨. 홈 두 변형 모두 바이트 예산 안.

### 197 화면 안내 스포트라이트 → 홈 첫 방문 투어

- **바꾸는 것:** V5 번들에 `accountbookTourClientMain`. 대상 3개: 빠른 입력 버튼(`[data-ab-quick-open]` 또는 하단 `.tabAdd`), 캘린더 토글(`.homeCalendarToggle a`), 분석 메뉴 링크. 단계마다 설명 한 줄과 `다음`·`건너뛰기`. Esc로 닫힘, 포커스 가둠, `aria-live` 설명. 끝나면 `localStorage abTourDone=1`. 노출 조건은 사용자 결정 6(기본: `homeOnboarding`이 있는 새 가계부 첫 방문 1회, `?tour=1`로 다시 봄).
- **완료 기준:** 대상 요소가 없으면 그 단계를 건너뜁니다. 투어 중 빠른 입력 시트가 열리면 투어가 닫힙니다. 모션 줄이기에서 스포트라이트 이동 없이 즉시 바뀝니다. 홈 HTML에는 바이트가 늘지 않습니다(JS가 만듭니다).

### 093 다 끝내면 터지는 축하

- **지금:** 챌린지 진행률(`my/report-challenge.js:297-326`, 클라이언트 `v5-bundle-mains.js:1043`)과 목표 `st-done` 상태(`:10-200`)는 문구·배지만 바뀝니다.
- **바꾸는 것:** 사용자 결정 7의 세 순간(챌린지 달성, 목표 달성, 월 예산 안에서 마감)에 색종이가 한 번 터지고 배지·연속 기록 숫자가 굴러 올라갑니다. 같은 사건은 기기당 한 번만(`localStorage abCelebrated:<종류>:<키>`). 서버 상태가 "달성"으로 바뀐 사실을 확인한 뒤에만 띄웁니다(목표 화면은 응답 뒤). 모션 줄이기에서는 색종이 없이 배지만.
- **완료 기준:** 같은 달성 화면을 두 번 열면 두 번째는 색종이가 없습니다. 달성 전 화면에서는 나오지 않습니다.

### 138 문서 가림 편집 → 금액 가리기 모드

- **바꾸는 것:**
  - 외관 설정(`web/menu-and-guides.js:255` `abAppearancePanel`)에 `금액 가리기` 토글(`aria-pressed`). 상태는 `localStorage abHideAmounts`(기기별, 서버 저장 없음). 사용자 결정 5에 따라 상단 바 눈 아이콘도 둡니다.
  - 켜면 `html[data-ab-hide-amounts]` 아래 금액 요소가 흐려집니다. 대상 선택자는 grep으로 모읍니다: `.homeTxAmt`, `.homeMetric b`, `.txRow .amt`, `.kpi b`, `.calDay strong/em`, `.abTransactionSummary b/dd`, `.reserveAmt strong`, `.metric b`, 영수증·정산 금액. **입력칸은 제외**합니다.
  - 흐린 금액을 누르면 그 금액만 3초 동안 보입니다(요소의 구간 토글). 글자는 DOM에 그대로 있고 CSS만 가립니다(보조기기에는 읽힘). 토글 문구에 "화면에서만 가립니다"를 적습니다.
  - 첫 페인트 전에 적용되도록 상태 읽기는 셸 머리의 테마 결정 스크립트와 같은 자리에서 합니다(깜빡임 방지).
- **완료 기준:** 토글 뒤 새로고침해도 유지, 끄면 즉시 보임, 입력칸은 영향 없음, 다크·라이트 모두 흐림이 읽히지 않을 만큼 충분함(스크린샷).

### 묶음 E 공통

- 셸 CSS와 V5 번들 주소 올림. 새 검사 `validate-lucian-e-v229NN.mjs`.

## 10. 보류 (F)

- **178 묶음 선택 작업대:** 거래 다중 선택 → 분류 일괄 변경·삭제(되돌리기). `/admin/bulk`(`admin/bulk-and-return-paths.js:16`)는 `verifyAdminSession` 전용이라 쓸 수 없습니다. 먼저 `/u/api/tx/bulk`를 `api/user-api.js`의 `/u/api/goals` 패턴(세션·가계부 역할 재검사, '기록만' 구성원 거절)으로 만들고, 그 다음 UI를 070·071 위에 얹습니다. 거래 수정 이력 설정 JSON(`AGENTS.md`)에 기록을 남기는 규칙을 지킵니다.
- **190 예약 발송 보관함:** 정기 납부 건별 "지금 반영"은 건별 반영 API가 필요합니다(지금은 월 일괄 `/admin/recurring/apply`). 2-C의 D-1·D-2 뒤에 검토합니다.
- **034 자동완성:** 최근 메모·가맹점 제안은 `/u/api/tx/search` 재사용으로 가능하지만 입력마다 호출이 늘어 DB 예산을 먼저 봐야 합니다.
- **184 권한 매트릭스:** 사람별 권한 예외 기능이 생길 때(`NEXT_UPDATE_PLAN.md` V22.9.43 이후 3).

## 11. 검증과 버전 의식

- **묶음마다 새 검사 하나:** `validation/validate-lucian-<묶음>-v229NN.mjs`. 다음 다섯 곳에 반영합니다: `.codex/scripts/verify-repository.mjs` 등록, `package.json` 스크립트, `AGENTS.md` 목록, 체크섬 manifest, `EXPECTED_MINIMUM_CHECKS`.
  - 공통 검사 항목: 픽스처 렌더에 훅 속성 존재, 직렬화 자산에 요소 함수 존재와 `document.currentScript` 부재, 홈 바이트 예산(정상·빈 상태), 자산 주소 올림과 해시 고정 일치, 라이선스 주석 존재.
  - 상호작용 검사는 F 영역 재현처럼 DevTools 파이프(설치된 Chrome)로 합니다. 라이트·다크·375px 스크린샷은 `review-artifacts/lucian-uxui-2026-10-14/<묶음>/`에 남기고 커밋하지 않습니다.
- **기존 검사:** 관련 검사(`validate:ui-perf`, `validate:client-serialization`, `validate:ux-principles`, `validate:v5`, `validate:home-rail-challenge`, `validate:challenge-activity-ux`, `validate:performance`)를 먼저 돌리고 하네스 두 모드(`node .codex/scripts/verify-repository.mjs`, `npm run validate:categories-absent`)와 `git diff --check`를 통과시킵니다.
- **버전 의식:** `HANDOFF_V22_9_44_AUDIT.md` 5절 "버전 의식"과 같습니다. `VERSION.txt`·`package.json`·`site-config.js` APP_VERSION, `CHANGELOG.md`, `KNOWN-ISSUES.md`, `BASELINE.md`(C는 "분석 화면 고정" 문장 갱신), `RELEASE-CHECKLIST.md`, `NEXT_UPDATE_PLAN.md`, `DEPLOYMENT_MATRIX.md`(SQL·env 없음), `VERIFICATION_V22_9_NN.md`, `docs/ASIDE_V22_9_NN.md`(사용자 배포·실기기 확인 절차), 새 manifest.
  - manifest는 `docs/codex/*.md`를 담으므로 이 문서도 첫 PR의 manifest에 넣습니다.
- **실기기:** iOS Safari·Android Chrome·카카오톡 인앱 브라우저에서 묶음 A(금액 입력·토큰)와 E(투어·가리기)를 사용자가 확인합니다. 항목은 ASIDE 문서에 적습니다.
- **하지 않는 것:** 운영 배포, SQL, Secret, 콘솔 변경. 배포는 사용자가 `tools/deploy-worker-version.mjs`로 합니다.

## 12. 사용자 결정이 필요한 것

Codex는 권장안으로 진행하거나 사용자에게 묻습니다.

| 번호 | 질문 | 권장안 |
|---|---|---|
| 1 | 시작 시점과 순서 | V22.9.45·V22.9.46 머지 뒤, E → B → A → D → C. 가치 순(A 먼저)을 원하면 A를 2-A 작성자에게 맡김 |
| 2 | 묶음 C: `/my/analysis` 해시 고정을 풀고 바꿀지 | 승인. 단 C는 별도 PR이고 레거시 `/analysis`는 그대로 |
| 3 | 071 스와이프 제스처 | 버튼+되돌리기만. 스와이프는 iOS 가장자리 제스처·오터치 위험으로 보류 |
| 4 | 035 빠른 금액 칩 값 | `+1천 · +5천 · +1만 · +5만` + `지우기` |
| 5 | 138 금액 가리기 기본값·위치 | 기본 꺼짐. 외관 설정 토글 + 상단 바 눈 아이콘 |
| 6 | 197 투어 노출 조건 | 새 가계부 첫 방문 1회, `?tour=1`로 재시작. 기존 사용자에게 자동 노출 안 함 |
| 7 | 093 축하 범위 | 챌린지 달성·목표 달성·월 예산 안 마감 세 곳, 기기당 사건마다 1회 |
| 8 | 092 완화 개수 조회 | 0건일 때만 변형 2개 COUNT(최대 2회). 호출 수를 PR에 적음 |
| 9 | 요소 원문을 저장소에 넣을지 | 넣지 않음. `review-artifacts`에 두고 옮긴 코드에 라이선스 한 줄만 |
| 10 | 묶음마다 버전·PR을 따로 낼지 | 따로. 한 묶음이 자산 주소를 한 번만 올림 |

## 13. Codex 시작 프롬프트

묶음 E(먼저 시작 가능):

```
$run-kakao-accountbook-loop
D:\Github_Kakao_Account\my 에서 docs/codex/HANDOFF_LUCIAN_UXUI_2026_10_14.md 의 9절(묶음 E: 088·197·093·138)을 진행해 줘.
- 먼저 이 문서 1~4절과 docs/codex/HANDOFF_V22_9_44_AUDIT.md 2·3절을 읽는다. 요소 원문은 D:\Github_Kakao_Account\review-artifacts\lucian-uxui-2026-10-14\elements\ 에서 읽고, 요약만 보고 지어내지 않는다.
- V22.9.45 PR 이 머지된 깨끗한 main 에서 브랜치 codex/lucian-e 를 만든다. 작업 트리의 미커밋 변경이 있으면 멈추고 사용자에게 묻는다.
- 12절의 결정은 권장안으로 진행한다. 사용자가 다른 결정을 주면 그것을 따른다.
- 3절 포팅 규칙(토큰 매핑, 다크 셀렉터, toString 직렬화, 자산 주소 한 번 올림, 홈 35 KiB)을 지키고, 각 요소의 완료 기준을 새 검사 validate-lucian-e 로 고정해 11절의 다섯 곳에 등록한다.
- 관련 검사, 하네스 두 모드(node .codex/scripts/verify-repository.mjs, npm run validate:categories-absent), git diff --check 를 통과시킨다. 버전 의식을 마친 뒤 push 와 PR 까지 한다. 이 인계 문서는 첫 커밋과 manifest 에 넣는다.
- 운영 배포·SQL·Secret·콘솔 변경은 하지 않는다.
- 최종 보고: 옮긴 요소 목록(#ID 제목: 자리, 바꾼 점, https://lucianlabs.dev/uxui-prompt/#ID), 바꾼 파일, 실제 검사 수·체크섬 수, 홈 바이트 전후, 사용자 실기기 확인 절차(docs/ASIDE), 확인하지 못한 것.
```

묶음 B·A·D는 절 번호(6·5·8)와 브랜치 이름(`codex/lucian-b` 등)만 바꿔 같은 방식으로 시작합니다. A는 "V22.9.46 PR 이 머지된 main 에서"로, D는 "029·143은 V22.9.46, 130은 E-1 머지 뒤"로 조건을 적습니다.

묶음 C(사용자 결정 2 승인 뒤):

```
$run-kakao-accountbook-loop
D:\Github_Kakao_Account\my 에서 docs/codex/HANDOFF_LUCIAN_UXUI_2026_10_14.md 의 7절(묶음 C: 097·096·163·165·151)을 진행해 줘.
- 사용자가 12절 결정 2를 승인했다. validate-ux-principles 의 insightClientMain 해시를 갱신하되 근거 주석을 남기고, 레거시 /analysis 는 바꾸지 않는다.
- payload 의 prevDaily·daily84 는 DB 조회 1회로 만들고 /my/analysis 의 호출 수 전후를 PR 에 적는다.
- 나머지 규칙과 보고 형식은 묶음 E 프롬프트와 같다.
```

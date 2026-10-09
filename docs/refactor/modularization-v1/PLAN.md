# 말해가계부 Worker 모듈 분리 설계 v1

- 기준 판: `V22.9.31-GROUP-FIRST-RECORD` (`src/index.js` SHA-256 `bbcd1756a622e4892c2811644c503fb28f2091aac19cbf89f0261daeac6d4c15`, main `6c86ee8`)
- 작성: 2026-10-08, Claude Fable 5.1 (읽기 전용 분석, 코드·SQL·환경·외부 콘솔 변경 없음)
- 실행 주체: Opus 5.5 (max) 세션. 시작 절차는 `HANDOFF_PROMPT.md`를 따른다.
- 같은 폴더의 `*.txt`는 탭 구분 데이터이고 `scripts/`는 이 분석을 재생산하고 1단계 분할을 수행하는 도구다.

## 0. 결론

1. 느려진 원인은 세 가지로 나뉘며 **검증 하네스는 병목이 아니다.** 전체 하네스는 35초(검사 8,000개·체크섬 199개 포함), `import('./src/index.js')`는 51ms다. 느린 것은 (a) 3.15MB·34,249줄 단일 파일을 읽고 고치는 **편집 루프**와 (b) 그 파일을 Cloudflare 대시보드에 붙여넣는 **업로드**다.
2. 해법은 "생성형 단일 파일"이다. `src/index.js`는 지금처럼 **배포 산출물이자 커밋 대상**으로 남기고, 소스는 `src/modules/**` 108개 파일로 나눈다. 빌드는 의존성 없는 연결(concat) 스크립트 하나다. 이 폴더의 드라이런에서 108개로 잘랐다가 다시 이은 결과의 SHA-256이 현재 파일과 **완전히 같았다.** 따라서 1단계는 라우트·API·스키마·권한·카카오 응답 계약을 구조적으로 바꿀 수 없고, 배포도 필요 없다.
3. 검증 스크립트 93개 중 74개가 `src/index.js`를 **원문 텍스트로 읽어** 패턴을 확인한다. 원문을 다시 찍어내는 번들러(esbuild 등)를 쓰면 이 검사들이 깨진다. 그래서 바이트를 보존하는 연결 빌드를 쓰고, 번들러 도입은 검사 이전(5단계) 이후로 미룬다.
4. 업로드는 대시보드 붙여넣기 대신 Cloudflare Versions API로 버전을 올리고(기존 바인딩 `inherit`, `bindings_inherit=strict`), 서버에 저장된 소스 해시와 바인딩을 대조한 뒤 Deployments API로 100% 승격하는 스크립트로 바꾼다. 지금의 "저장 → 대조 → 승격" 절차와 같은 모양이고 설정·바인딩·Secret을 건드리지 않는다. 승인 게이트(사용자 승인 후 배포)는 그대로 둔다. wrangler 전환은 채택하지 않는다.
5. 권장 순서: **0 준비 → 1 위치 분할(무배포) → 6 배포 자동화(독립, 병행 가능) → 2 긴 줄 정리 → 3 모듈 import/export 명시 → 4 의미 보존 재배치(점진) → 5 검증의 원문 의존 축소(선택).** 각 단계는 자체 검증 게이트와 롤백 절차를 가진다.

## 1. 현황 측정 (근거)

| 항목 | 측정값 | 의미 |
|---|---|---|
| `src/index.js` 크기 | 3,151,153 bytes (UTF-8), 2,847,249 chars, 34,249줄 | gzip 784,111 bytes. Workers 한도(64 MiB 비압축)와는 무관 |
| 최상위 선언 | 1,610개 (함수 1,436, const/let 166, export 목록 6) | 클래스 0, `import` 0, `new Function`/`eval` 0 |
| 긴 줄 | 200자 초과 1,642줄, 1,000자 초과 222줄, **10,000자 초과 9줄, 최대 197,745자(24349행)** | diff·리뷰·줄 단위 도구가 무력화되는 지점 |
| 템플릿 리터럴 | 2KB 이상 113개, 합계 836,777 bytes (파일의 29%) | HTML·CSS·클라이언트 JS 문자열 |
| 클라이언트 직렬화 | `fn.toString()` 43곳, 클라이언트 함수 33개 | 이름 변경·축소(minify) 금지 제약의 근거 |
| 전역 상태 | `globalThis.__AB_*` 15개, 최상위 `let` 14개(자산 캐시) | 모듈 분리 후에도 싱글턴 유지 필요 |
| 라우터 | `ACCOUNTBOOK_WORKER.route()` 945–2174행, 59.6KB, 경로 리터럴 332개, if 체인 | 1단계에서는 한 모듈로 그대로 둔다 |
| Supabase | `supabase()` 한 함수, 테이블 16개, RPC 19개 | `data/supabase-client.js` 한 모듈 |
| 환경변수 | `env.*` 62개 | 변경 없음 |
| 검증 하네스 | 93 스크립트, 35초, 검사 8,000개 하한 | 원문 텍스트 의존 74개, 순서 의존(two-arg `indexOf`) 26곳 |
| 단일 검증 | 0.3–2.2초/개, `node --check` 189ms, ESM import 51ms | 파싱 비용은 작다 |
| 배포 | 검증된 `src/index.js` 전체 교체, 서버 저장 소스 해시 대조, 바인딩 30개 비교 | 수동·대시보드 중심 |
| Workers 한도(공식 문서 2026-09-05) | 크기 64 MiB 비압축, 시작 1초, Free CPU 10ms, 서브요청 50/요청 | 분리 자체는 런타임 비용을 바꾸지 않는다 |

측정 방법: `scripts/analyze-worker-structure.mjs`(Node 내장 acorn 8.16, `--expose-internals`)로 AST를 만들고 최상위 선언·참조 간선 5,847개·템플릿·직렬화 지점을 뽑았다. 하네스 시간은 `node .codex/scripts/verify-repository.mjs` 실측이다.

### 1.1 느린 원인 분해

- 편집: 에이전트가 함수 하나를 고치려면 3MB 파일에서 위치를 찾고(grep) 주변을 읽고(Read) 유일 매칭 문자열로 교체(Edit)해야 한다. 파일이 클수록 읽는 토큰과 실패 재시도가 늘고, 10,000자 넘는 줄은 Read 한 줄이 수십 KB다. 최근 30개 커밋이 모두 이 파일을 수백 줄씩 바꿨다.
- 업로드: 대시보드 편집기에 3MB를 붙여넣고 저장 후 버전 승격까지 사람이 한다. API 한 번이면 수 초다.
- 검증: 35초. 유지한다.

## 2. 변경 금지 제약 (설계 전제)

- 라우트 경로·메서드·응답 형태, `/api`·`/u/api`·`/internal` JSON 계약, 카카오 SkillResponse 형태(`version: "2.0"`, 그룹 응답 제한), 쿠키·헤더(`no-store`, immutable, ETag, CSP), Supabase 테이블·RPC·RLS·GRANT, 환경변수·Secret·바인딩·Cron·도메인·Kakao Developers·OpenBuilder는 바꾸지 않는다.
- `src/index.js`는 계속 **단일 ESM 파일**로 배포된다(`export default { fetch, scheduled }`). 번들러·축소기·트랜스파일러를 거치지 않는다. 이유: 원문 의존 검사 74개, `.toString()` 직렬화 43곳, 자산 바이트·ETag 고정 정책.
- 즉시실행 자산(`/assets/*-vNNNN.*`)의 바이트는 주소 판을 올리지 않는 한 1바이트도 바꾸지 않는다. 템플릿 리터럴 안의 공백 변경도 포함된다.
- `BASELINE.md`의 성능 예산(`/my` 4회·35KB·44KB, `/app` 9회)은 그대로다. 분리는 응답 바이트를 바꾸지 않는다.
- `AGENTS.md`의 완료 기준(관련 검증 → 전체 하네스, `git diff --check`, 검사·체크섬 개수 기록)은 매 단계 적용한다.

## 3. 목표 구조

### 3.1 원칙

1. **생성 파일 하나, 소스 여러 개.** `src/modules/**/*.js`가 소스, `src/modules/MANIFEST.txt`가 연결 순서, `tools/build-worker.mjs`가 `src/index.js`를 만든다. 생성 파일도 커밋한다(검증·CI·배포가 전부 그 파일을 본다).
2. **1단계는 위치 기반 분할.** 원본의 최상위 문장 순서를 그대로 보존하는 연속 구간으로 자른다. 그래서 연결 결과가 바이트 동일하고 선언 순서 의존(const 초기화, 검사의 순서 의존)이 깨지지 않는다.
3. **모듈 이름은 내용 기준.** 원본은 버전 순서로 쌓였지만 지역성이 좋아서 108개 구간 대부분이 한 도메인이다. 어긋난 함수(예: `my/home-sections.js`에 있는 밈 카드 보조 함수 7개)는 4단계에서 옮긴다.
4. **빌드 마커.** 모듈 파일에 `// @build:imports-start … // @build:imports-end`, `// @build:exports-start … // @build:exports-end` 블록을 두면 빌드가 그 블록만 제거한다. 3단계에서 이 블록에 진짜 `import`/`export`를 넣어 각 파일을 단독 ESM으로 만들되 생성 결과는 바뀌지 않는다.
5. **드리프트 검사.** 하네스가 매번 모듈을 다시 이어 `src/index.js`와 SHA-256을 비교한다. 생성 파일을 직접 고치면 실패한다.
6. **바이트 규약.** 각 모듈 파일은 원본 줄 범위의 바이트 슬라이스(마지막 줄의 줄바꿈 포함)이고 빌드는 구분자 없는 단순 연결이다. 파일은 정확히 하나의 줄바꿈으로 끝나야 하며(빌드가 거부), 편집기가 마지막 줄바꿈을 보존하는 것만으로는 결과가 바뀌지 않는다. CR이 섞이면 빌드가 거부한다.

### 3.2 디렉터리 책임

| 디렉터리 | 책임 | 비고 |
|---|---|---|
| `runtime/` | 전역 상태, 운영 텔레메트리, 설정·readiness 상수, 임대(lease)·설정 RMW, HTTP 응답·쿠키 유틸 | 거의 모든 모듈이 참조 |
| `worker/` | `ACCOUNTBOOK_WORKER`(fetch/route/scheduled)와 검증용 `export` 목록 | 라우트 계약의 유일한 자리 |
| `public/` | 공개 페이지 카탈로그·robots·sitemap·ads.txt, 판 번호·브랜드·기본 URL 상수 | `APP_VERSION`이 여기 있다 |
| `auth/` | 관리자 세션·KDF·HMAC, 사용자 세션, 식별·재인증, 카카오 OAuth, 로컬 로그인 화면, 1회용 웹 코드 | 보안 기준선 보호 대상 |
| `data/` | `supabase()` 클라이언트, 가계부·참여자·행 조회, 사용자·가계부 생성 | PostgREST·RPC 호출의 집합 |
| `domain/` | 거래 핵심(생성·수정·삭제·통계), 예산, 분석, 사용자·가계부 역할 | 순수 로직 비중이 큼 |
| `nlu/` | 금액·날짜·결제수단·분류 파서, 거래 문장 분해 | 카카오·웹 공용 |
| `kakao/` | 응답 빌더, 의도 감지, 수정 세션 V4, 안내 흐름, 스킬 핸들러, 그룹 연결·첫 기록, 식별·채팅 우선 | 카카오 응답 계약의 자리 |
| `my/` | 개인 웹(`/my/*`, `/app`) 화면과 처리기 | HTML 예산 대상 |
| `admin/` | 관리자 화면·백업·롤백·감사·가이드 페이지 | 가장 큰 디렉터리(566KB) |
| `settings/` | 분류·키워드, 결제 자산, 적립 계획 | 설정 JSON RMW 경로 |
| `features/` | 밈 카드, 카드 혜택, 결제수단 화면, 정산, 예산 알림·연간·목표 | 기능 단위 |
| `client/` | `.toString()`으로 직렬화되는 브라우저 코드와 공용 파서 | 자체 완결(모듈 스코프 참조 금지) |
| `assets/` | CSS·JS 자산 상수, 아이콘·매니페스트, 과거 런타임 자산, 자산 응답 | 바이트 고정 대상 |
| `web/` | 통합 내비, 메뉴·가이드, 로그인 페이지, HTML 후처리, 빠른 입력 아이콘 | 화면 공통 |
| `import/` | 유연한 가져오기 파서, CSV·중복 판정 | |
| `api/` | 사용자 JSON API(`/u/api/*`), 관리자 JSON API(`/api/*`) | |
| `cron/` | 정기 자동 반영 | `scheduled` 핸들러가 호출 |


### 3.2.1 디렉터리별 규모

| 디렉터리 | 파일 | 줄 | KB |
|---|---:|---:|---:|
| `admin/` | 18 | 4771 | 552.7 |
| `assets/` | 9 | 2833 | 440.9 |
| `my/` | 15 | 4033 | 371.5 |
| `client/` | 5 | 4613 | 268.9 |
| `kakao/` | 15 | 4915 | 242.5 |
| `features/` | 6 | 2117 | 237.3 |
| `web/` | 5 | 1168 | 128.4 |
| `auth/` | 6 | 1636 | 95.0 |
| `settings/` | 3 | 1235 | 80.2 |
| `runtime/` | 6 | 1308 | 63.4 |
| `worker/` | 2 | 1323 | 60.7 |
| `domain/` | 4 | 1026 | 56.5 |
| `public/` | 2 | 535 | 48.4 |
| `import/` | 2 | 702 | 37.2 |
| `api/` | 2 | 626 | 33.0 |
| `nlu/` | 4 | 700 | 28.5 |
| `data/` | 3 | 565 | 27.7 |
| `cron/` | 1 | 143 | 7.9 |

### 3.3 모듈 108개 (위치 기반 분할 명세)

줄 범위는 현재 `src/index.js`(SHA-256 `bbcd1756…`) 기준이다. 정확한 명세는 `split-manifest.txt`이며 `scripts/split-worker.mjs`가 그대로 읽는다. 각 모듈은 앞 모듈의 마지막 문장 다음 줄부터 시작하므로 문장 사이 주석과 빈 줄은 뒤따르는 문장의 모듈로 간다. "참조하는/참조받는 모듈"은 모듈 단위 간선 수다.

| # | 모듈 경로 (src/modules/) | 줄 범위 | 줄 | KB | 선언 | 함수 | 가장 큰 선언 3개 | 참조하는 모듈 | 참조받는 모듈 |
|---:|---|---|---:|---:|---:|---:|---|---:|---:|
| 1 | `runtime/global-state.js` | 1–48 | 48 | 2.0 | 10 | 2 | AB_EFFECTIVE_USER_CACHE, AB_NLU_RUNTIME_METRICS, AB_SKILL_RATE_BUCKETS | 0 | 4 |
| 2 | `runtime/ops-telemetry.js` | 49–642 | 594 | 27.3 | 50 | 44 | csrfOriginAllowed, rememberNluRuntimeEvent, getNluOpsSnapshot | 9 | 45 |
| 3 | `runtime/config-readiness.js` | 643–826 | 184 | 9.3 | 17 | 5 | READINESS_RPC_PROBE_BODIES, withRememberedHouseholdCookie, HTML_HEADERS | 1 | 6 |
| 4 | `runtime/ops-monitor.js` | 827–943 | 117 | 9.1 | 8 | 7 | handleComprehensiveMonitor, abMonitorCompleted, abMonitorParseDatabaseMetrics | 4 | 2 |
| 5 | `worker/router.js` | 944–2176 | 1233 | 58.2 | 2 | 0 | ACCOUNTBOOK_WORKER | 64 | 0 |
| 6 | `public/site-config.js` | 2177–2406 | 230 | 16.5 | 35 | 24 | handleKakaoCommandSystemPage, renderSkillGetHealthHtml, renderBusinessInfoFooter | 4 | 43 |
| 7 | `public/content-pages.js` | 2407–2711 | 305 | 31.9 | 8 | 8 | publicPageCatalog, renderPublicContentPage, handlePublicSitemapStylesheet | 4 | 1 |
| 8 | `client/shared-input-parsers.js` | 2712–2853 | 142 | 10.7 | 6 | 6 | quickSmartInputController, moneyTokenSpans, quickInputDate | 0 | 11 |
| 9 | `client/legacy-ui-runtime.js` | 2854–4002 | 1149 | 88.1 | 22 | 13 | V2281_GUIDED_UIUX_STYLE, guidedUiUxClientMain, mobileUiUxClientMain | 2 | 4 |
| 10 | `web/html-postprocess.js` | 4003–4467 | 465 | 31.4 | 10 | 9 | normalizeUserFacingUi, attachUiUxRuntime, normalizeUiV5RemainingPages | 9 | 1 |
| 11 | `runtime/leases.js` | 4468–4633 | 166 | 7.0 | 17 | 17 | claimOperationLease, withSettingsRmwLease, releaseOperationLease | 4 | 44 |
| 12 | `runtime/http.js` | 4634–4832 | 199 | 8.7 | 23 | 23 | renderEmergencyErrorHtml, csvResponse, mobileAppLocation | 8 | 56 |
| 13 | `auth/crypto-admin-session.js` | 4833–5117 | 285 | 12.0 | 30 | 25 | recordAuthAttempt, verifyAdminSession, verifyMyImportPreviewToken | 4 | 46 |
| 14 | `admin/transactions-households.js` | 5118–5653 | 536 | 31.5 | 29 | 28 | handleAdminAddTransaction, handleAdminMemberUpdate, handleAdminMemberRemove | 27 | 24 |
| 15 | `settings/categories-keywords.js` | 5654–5992 | 339 | 19.2 | 20 | 20 | renderKeywordBulkEditor, keywordEditorCss, keywordEditorCard | 12 | 13 |
| 16 | `settings/payment-assets.js` | 5993–6488 | 496 | 24.8 | 34 | 32 | updatePaymentAsset, handlePaymentAssetUpdate, mutatePaymentAssetsAtomically | 13 | 12 |
| 17 | `settings/reserve-plans.js` | 6489–6888 | 400 | 36.2 | 23 | 23 | handleReservePlansPage, normalizeReservePlanList, renderReservePlanEditForm | 21 | 9 |
| 18 | `admin/category-guide-pages.js` | 6889–7106 | 218 | 26.3 | 14 | 13 | renderCategoryAdminHtml, handleKeywordGuidePage, handleChatbotEditGuidePage | 17 | 3 |
| 19 | `admin/bulk-and-return-paths.js` | 7107–7232 | 126 | 6.0 | 4 | 4 | handleAdminBulkUpdate, bulkDeleteTransactions, safeUserReturnPath | 10 | 6 |
| 20 | `import/flexible-import-parser.js` | 7233–7798 | 566 | 31.9 | 31 | 28 | normalizeImportedRecordDetailed, parseFlexibleImportRecords, handleAdminImportJson | 15 | 3 |
| 21 | `data/households-members-rows.js` | 7799–8122 | 324 | 14.9 | 24 | 24 | fetchAdminRows, fetchHouseholdMembers, fetchPostgrestRows | 11 | 49 |
| 22 | `admin/dashboard-page.js` | 8123–8484 | 362 | 86.6 | 3 | 2 | SERVER_DASHBOARD_CSS, renderServerDashboardHtml, renderServerLoginHtml | 14 | 2 |
| 23 | `admin/settings-audit-pages.js` | 8485–8653 | 169 | 15.9 | 12 | 12 | renderSettingsHtml, handleRouteAuditPage, handleRecordFlowAuditPage | 14 | 25 |
| 24 | `admin/backup-compare.js` | 8654–9038 | 385 | 29.3 | 22 | 22 | renderBackupCompareHtml, handleBackupCenterPage, renderBackupPreviewHtml | 13 | 52 |
| 25 | `admin/backup-apply.js` | 9039–9327 | 289 | 34.6 | 18 | 16 | renderBackupCandidateSelectHtml, renderImportApplyHtml, renderImportFinalCheckHtml | 11 | 1 |
| 26 | `admin/import-history-rollback.js` | 9328–9634 | 307 | 32.2 | 21 | 21 | handleRollbackCandidatePage, renderRollbackFinalCheckHtml, handleImportHistoryPage | 11 | 3 |
| 27 | `admin/release-audit-pages.js` | 9635–9953 | 319 | 33.5 | 18 | 16 | handleOperationCenterPage, FINAL_FEATURE_MATRIX, handleUserReleaseCheckPage | 12 | 1 |
| 28 | `features/card-benefits.js` | 9954–10237 | 284 | 22.2 | 18 | 14 | CARD_BENEFIT_CATALOG, handleCardBenefitsPage, calculateCardBenefitUsage | 7 | 1 |
| 29 | `features/payment-methods-page.js` | 10238–10535 | 298 | 32.3 | 16 | 13 | PAYMENT_METHODS_PAGE_STYLE, handlePaymentMethodsPage, renderPaymentAssetRow | 10 | 1 |
| 30 | `admin/ops-diagnostics-pages.js` | 10536–10764 | 229 | 31.6 | 16 | 16 | handleHouseholdUserPage, renderHouseholdAdminHtml, handleProductionOpsAuditPage | 14 | 19 |
| 31 | `web/unified-nav.js` | 10765–11001 | 237 | 24.7 | 2 | 2 | renderUnifiedNav, renderAccountbookBrandIcon | 3 | 30 |
| 32 | `admin/guide-pages.js` | 11002–11400 | 399 | 53.2 | 26 | 26 | handleDeploymentCheckPage, handleBetaStartPage, handleRealUserQaPage | 16 | 2 |
| 33 | `admin/meme-content-pages.js` | 11401–11569 | 169 | 18.6 | 14 | 13 | renderDuplicateSafetyHtml, handleReleaseDryRunPage, handleKakaoCommandsPage | 10 | 2 |
| 34 | `features/budget-alerts-annual-goals.js` | 11570–11747 | 178 | 22.6 | 11 | 11 | renderAnnualReportHtml, renderGoalsHtml, buildBudgetAlertPolishModel | 10 | 3 |
| 35 | `client/v5-bundle-mains.js` | 11748–13036 | 1289 | 73.1 | 12 | 12 | accountbookDayDetailClientMain, accountbookActivityRailClientMain, accountbookQuickInputClientMain | 2 | 1 |
| 36 | `features/settlement-ops-pages.js` | 13037–13405 | 369 | 63.6 | 23 | 23 | handleSettlementSummaryPage, renderBudgetAlertPolishHtml, handleSettlementSummaryPageLegacyV2265 | 19 | 3 |
| 37 | `admin/nlu-openbuilder-ops.js` | 13406–13588 | 183 | 27.0 | 13 | 13 | handleNluOpsPage, handleOpenBuilderGuidePage, handleOpenBuilderReportPage | 10 | 1 |
| 38 | `web/menu-and-guides.js` | 13589–13907 | 319 | 41.5 | 13 | 13 | renderUserStartGuideHtml, handleUnifiedMenuPage, handleBeginnerGuidePage | 23 | 2 |
| 39 | `auth/user-session.js` | 13908–14259 | 352 | 15.5 | 25 | 25 | verifyUserSession, inspectKakaoLoginConfig, resolveEffectiveUserId | 11 | 32 |
| 40 | `auth/identity-reauth.js` | 14260–14585 | 326 | 15.8 | 28 | 28 | findUserByKakaoLoginId, ensureKakaoLoginUser, boundedFormRequest | 12 | 7 |
| 41 | `auth/kakao-oauth.js` | 14586–14824 | 239 | 13.9 | 7 | 7 | handleKakaoLoginCallback, handleKakaoLoginStart, fetchKakaoProfileByCode | 13 | 6 |
| 42 | `data/users-household-create.js` | 14825–14998 | 174 | 9.1 | 10 | 9 | createUserHousehold, fetchUserHouseholds, withHouseholdCreateLock | 10 | 34 |
| 43 | `import/csv-duplicates.js` | 14999–15134 | 136 | 5.2 | 9 | 9 | findExactDuplicateTransaction, parseCsvRows, buildReadableTransactionsCsv | 6 | 3 |
| 44 | `my/members-page.js` | 15135–15170 | 36 | 11.4 | 3 | 3 | renderMyMembersHtml, renderMyMembersHtmlLegacyV2264, handleMyMembersPage | 13 | 1 |
| 45 | `my/card-import-guide.js` | 15171–15355 | 185 | 15.4 | 6 | 5 | cardImportClientMain, cardGuideFigure, cardImportCss | 1 | 1 |
| 46 | `my/backup-import.js` | 15356–15814 | 459 | 44.1 | 16 | 16 | handleMyImport, handleMyBackupPage, renderMyImportPreviewHtml | 21 | 1 |
| 47 | `cron/recurring-auto-apply.js` | 15815–15957 | 143 | 7.9 | 5 | 5 | runRecurringAutoApplyUnlocked, findRecurringAutoDuplicate, runRecurringAutoApply | 13 | 1 |
| 48 | `my/groups-budget-bulk.js` | 15958–16158 | 201 | 12.3 | 18 | 18 | handleMyGroupsPage, handleMyBudgetBulkSave, upsertMyBudgetRow | 21 | 6 |
| 49 | `my/report-challenge.js` | 16159–16484 | 326 | 36.3 | 18 | 17 | reportUxCss, handleReportChallengeSave, renderReportChallenge | 17 | 7 |
| 50 | `my/reports-premium.js` | 16485–16766 | 282 | 28.5 | 19 | 19 | renderMyPremiumHtml, renderFreeReportsHtml, runAutomaticReportsUnlocked | 20 | 12 |
| 51 | `my/insight-page.js` | 16767–17025 | 259 | 19.8 | 4 | 4 | renderMyInsightHtml, handleMyInsightPage, handleMyAnalysisPage | 19 | 1 |
| 52 | `client/insight-main.js` | 17026–18113 | 1088 | 49.1 | 2 | 2 | insightClientMain, budgetExpenseRows | 0 | 1 |
| 53 | `my/analysis-page.js` | 18114–18322 | 209 | 23.6 | 10 | 10 | renderMyAnalysisHtml, renderWeekdayTrend, renderReadableDailyTrend | 11 | 5 |
| 54 | `my/settings-page.js` | 18323–18603 | 281 | 26.3 | 8 | 8 | renderMySettingsHtml, handleRecurringCandidateConfirm, handleMyRecurringSave | 25 | 1 |
| 55 | `my/access-control.js` | 18604–18672 | 69 | 6.0 | 9 | 9 | renderMyAccessStatusHtml, getMySelectedHousehold, myReturnLocation | 6 | 26 |
| 56 | `my/transactions.js` | 18673–18889 | 217 | 11.7 | 15 | 15 | handleMyUpdateTransaction, handleMyAddTransaction, handleMyDeleteTransaction | 14 | 10 |
| 57 | `my/households-lifecycle.js` | 18890–19364 | 475 | 46.5 | 16 | 16 | handleMyHouseholdsPage, handleMyHouseholdsPageLegacyV2264, purgeHouseholdData | 33 | 5 |
| 58 | `domain/budgets.js` | 19365–19688 | 324 | 19.0 | 19 | 19 | budgetSummary, kakaoBudgetStatusText, renderBudgetRows | 11 | 28 |
| 59 | `my/home-sections.js` | 19689–20015 | 327 | 18.2 | 24 | 22 | renderHomeReportCards, renderV8TxEditForm, renderV8TxCards | 5 | 4 |
| 60 | `features/meme-cards.js` | 20016–20559 | 544 | 66.8 | 30 | 30 | memeCollectionFor, handlePublicMemeSharePage, handleMemeArchivePage | 15 | 2 |
| 61 | `web/quick-chip-icons.js` | 20560–20650 | 91 | 4.1 | 8 | 4 | quickChipIconCss, QUICK_CHIP_ICON_RULES, categoryInitial | 1 | 2 |
| 62 | `assets/mobile-v81-css.js` | 20651–20783 | 133 | 34.6 | 1 | 0 | MOBILE_V81_CSS | 0 | 1 |
| 63 | `assets/ab-cursor.js` | 20784–20880 | 97 | 3.6 | 2 | 0 | AB_CURSOR_ASSET_SOURCE, AB_CURSOR_ASSET_PATH | 0 | 1 |
| 64 | `assets/number-flow.js` | 20881–21450 | 570 | 23.1 | 2 | 0 | NUMBER_FLOW_ASSET_SOURCE, NUMBER_FLOW_ASSET_PATH | 0 | 1 |
| 65 | `assets/asset-registry.js` | 21451–21616 | 166 | 20.0 | 27 | 0 | ACCOUNTBOOK_EXPERIENCE_CSS, ACCOUNTBOOK_SHELL_V22811_CSS, ACCOUNTBOOK_V5_SEARCH_OVERLAY_HTML | 0 | 8 |
| 66 | `assets/accountbook-shell-css.js` | 21617–22919 | 1303 | 155.6 | 1 | 0 | ACCOUNTBOOK_SHELL_CSS | 2 | 1 |
| 67 | `assets/theme-home-assets.js` | 22920–23127 | 208 | 8.0 | 8 | 7 | accountbookThemeClientMain, rawMobileHomeInlineRuntime, abUiuxCssAsset | 7 | 2 |
| 68 | `client/nav-search-notif-mains.js` | 23128–24072 | 945 | 48.0 | 8 | 8 | accountbookStage4NavClientMain, accountbookSearchClientMain, accountbookNotifClientMain | 3 | 2 |
| 69 | `assets/icons-manifest.js` | 24073–24347 | 275 | 9.7 | 23 | 13 | abIconIcoBytes, AB_WEB_MANIFEST, abIconPngBytes | 0 | 2 |
| 70 | `assets/historical-runtime-assets.js` | 24348–24349 | 2 | 182.0 | 1 | 0 | AB_HISTORICAL_RUNTIME_ASSETS | 0 | 1 |
| 71 | `assets/asset-responses.js` | 24350–24428 | 79 | 4.3 | 1 | 1 | mobileHomePerformanceAssetResponse | 9 | 1 |
| 72 | `my/mobile-home.js` | 24429–24992 | 564 | 59.9 | 5 | 5 | renderMobileV81Html, handleMobileV8Page, renderHomeCalendarSection | 28 | 2 |
| 73 | `admin/pc-analysis-calendar.js` | 24993–25359 | 367 | 37.0 | 18 | 17 | renderPcAnalysisHtml, renderPcCalendarHtml, handleBudgetSave | 19 | 7 |
| 74 | `my/money-plan-home-layout.js` | 25360–25502 | 143 | 11.5 | 9 | 8 | handleHomeLayoutPage, handleHomeLayoutSave, moneyPlanTabsCss | 15 | 5 |
| 75 | `admin/budget-center-recurring.js` | 25503–25729 | 227 | 39.7 | 7 | 7 | handleBudgetCenterPage, handleBudgetCenterPageLegacyV2264, handleRecurringSave | 26 | 3 |
| 76 | `auth/local-login-pages.js` | 25730–25985 | 256 | 27.1 | 13 | 13 | renderMyBackupLoginHtml, handleMyLocalSignup, renderMyStartChoiceHtml | 22 | 15 |
| 77 | `auth/kakao-web-claim.js` | 25986–26163 | 178 | 10.7 | 16 | 13 | handleMyKakaoClaim, issueKakaoWebClaim, kakaoPrivateWebLinkReply | 16 | 7 |
| 78 | `web/login-page-side-nav.js` | 26164–26219 | 56 | 26.8 | 4 | 4 | renderUserLoginHtml, myNavCss, renderMySideNav | 7 | 11 |
| 79 | `domain/analytics.js` | 26220–26414 | 195 | 14.3 | 16 | 16 | calculateDashboardAnalysis, calculateExtendedAnalytics, renderStrategyCards | 4 | 9 |
| 80 | `features/meme-engine-premium.js` | 26415–26858 | 444 | 29.8 | 30 | 30 | getCoreCardPool, buildAffiliateState, renderCollectionTab | 4 | 3 |
| 81 | `admin/dashboard-fragments.js` | 26859–26975 | 117 | 18.6 | 11 | 9 | renderPublicShareCardHtml, renderTransactionTurboScript, renderDesktopTransactionTable | 5 | 9 |
| 82 | `kakao/reply-texts.js` | 26976–27349 | 374 | 15.6 | 23 | 22 | formatMessage, kakaoAmbiguityGuide, kakaoNoMatchGuideText | 5 | 25 |
| 83 | `kakao/intent-nlu.js` | 27350–27661 | 312 | 14.3 | 19 | 18 | detectKakaoNaturalIntent, KAKAO_INTENT_REGISTRY, normalizeKakaoIntentText | 10 | 8 |
| 84 | `kakao/response-builders.js` | 27662–27812 | 151 | 5.1 | 12 | 11 | kakaoGroupCompatibleResponse, kakaoGroupTextChoices, kakaoQr | 4 | 24 |
| 85 | `kakao/edit-session-v4.js` | 27813–28133 | 321 | 13.4 | 38 | 35 | parseKakaoEditCommandV4, getRecentKakaoOwnedTransactionsV2254, saveKakaoEditUndoV4 | 10 | 5 |
| 86 | `kakao/edit-state-machine.js` | 28134–28703 | 570 | 21.1 | 38 | 22 | handleEditMessage, loopFuzzTest, MENU_EXAMPLES | 2 | 3 |
| 87 | `kakao/edit-flow-v4.js` | 28704–29047 | 344 | 15.4 | 10 | 10 | handleKakaoEditCommandV4, applyKakaoEditFieldV4, processKakaoEditResultV4 | 13 | 1 |
| 88 | `kakao/request-guards.js` | 29048–29209 | 162 | 6.8 | 13 | 12 | checkKakaoRepeatGuard, isStrongKakaoTransactionInput, buildKakaoSkillTestPayload | 15 | 5 |
| 89 | `kakao/guided-flow-state.js` | 29210–29492 | 283 | 11.9 | 27 | 26 | isKakaoFlowLocalReplyV2254, parseDirectMemberAliasCommand, isExplicitKakaoTopLevelCommandV2254 | 12 | 4 |
| 90 | `kakao/household-budget-commands.js` | 29493–29978 | 486 | 22.4 | 38 | 38 | beginKakaoHouseholdChoice, parseKakaoSummaryRange, parseDirectBudgetSetCommand | 19 | 8 |
| 91 | `kakao/guided-flows.js` | 29979–30307 | 329 | 21.2 | 4 | 3 | handlePreHouseholdGuidedFlow, handleHouseholdGuidedFlow, readRequestTextBounded | 13 | 1 |
| 92 | `kakao/skill-handler.js` | 30308–30794 | 487 | 30.5 | 2 | 2 | handleKakaoSkill, handleKakaoSkillStable | 31 | 1 |
| 93 | `kakao/transaction-save.js` | 30795–30966 | 172 | 12.7 | 6 | 5 | saveKakaoParsedTransactionsReply, insertKakaoTransactions, handleKakaoRecentDebug | 18 | 5 |
| 94 | `api/user-api.js` | 30967–31432 | 466 | 23.9 | 15 | 15 | handleUserGoals, handleUserNotifications, handleUserDayTransactions | 20 | 2 |
| 95 | `api/admin-api.js` | 31433–31592 | 160 | 9.1 | 6 | 6 | handleApi, validateAdminApiTransactionBody, readAdminApiJson | 9 | 4 |
| 96 | `kakao/group-links-first-record.js` | 31593–32150 | 558 | 32.7 | 29 | 29 | tryKakaoGroupFirstRecord, bindKakaoGroupByInviteCode, readKakaoGroupFirstSnapshot | 17 | 15 |
| 97 | `admin/identity-merge.js` | 32151–32308 | 158 | 13.9 | 5 | 5 | handleIdentityMerge, handleIdentityAuditPage, buildIdentityAudit | 19 | 1 |
| 98 | `kakao/identity-chat-first.js` | 32309–32573 | 265 | 14.3 | 17 | 17 | tryKakaoChatFirstRecord, persistIdentityAliases, kakaoChatFirstCompleted | 16 | 13 |
| 99 | `domain/users-households.js` | 32574–32748 | 175 | 9.6 | 6 | 6 | ensureUser, joinHouseholdByCode, ensurePrimaryHousehold | 10 | 14 |
| 100 | `data/supabase-client.js` | 32749–32815 | 67 | 3.7 | 1 | 1 | supabase | 0 | 42 |
| 101 | `kakao/simple-commands.js` | 32816–32916 | 101 | 5.1 | 19 | 19 | kakaoSettlementText, isBudgetCommand, isInviteCommand | 6 | 5 |
| 102 | `nlu/transaction-parser.js` | 32917–33062 | 146 | 5.7 | 10 | 10 | parseTransaction, splitTransactionClauses, unwrapKakaoParam | 4 | 5 |
| 103 | `nlu/amount-parser.js` | 33063–33243 | 181 | 6.0 | 16 | 16 | collectSimpleUnitCandidates, collectKoreanNumberCandidates, isLikelyDateAround | 1 | 36 |
| 104 | `nlu/date-payment.js` | 33244–33456 | 213 | 8.1 | 18 | 17 | parseDateStrict, parseExplicitDateFromText, detectPaymentMethod | 3 | 56 |
| 105 | `nlu/category-rules.js` | 33457–33616 | 160 | 8.7 | 10 | 5 | CATEGORY_RULES, cleanMemo, inferCategory | 1 | 7 |
| 106 | `domain/transactions-core.js` | 33617–33948 | 332 | 13.6 | 24 | 24 | createManualTransaction, sanitizeTransactionBody, listTransactions | 13 | 71 |
| 107 | `admin/launch-guide-pages.js` | 33949–34159 | 211 | 17.3 | 11 | 11 | handleGroupChatbotTrafficScalePage, handleGroupChatbotLaunchGuidePage, handleDomainMigrationGuidePage | 6 | 1 |
| 108 | `worker/test-exports.js` | 34160–34249 | 90 | 2.4 | 6 | 0 |  | 0 | 0 |

### 3.4 분할 명세에서 특별히 다룬 곳

- `worker/router.js`(945–2176행, 59.6KB): if 체인 라우터 전체와 `export default`. 1단계에서는 쪼개지 않는다. 순서가 곧 우선순위이므로 분할은 4단계에서 "연속 블록을 `Response|null`을 돌려주는 함수로 추출"하는 방식만 허용한다.
- `worker/test-exports.js`(34160–34249행): 검증 스크립트가 쓰는 `export { … }` 목록 6개. 연결 순서상 마지막이어야 한다.
- `assets/historical-runtime-assets.js`(24348–24349행, 186KB, 한 줄): 옛 판 자산의 본문을 담은 객체 리터럴. 2단계에서 항목마다 줄을 나눈다(문자열 값은 불변).
- `assets/accountbook-shell-css.js`(159KB), `assets/mobile-v81-css.js`(35KB), `admin/dashboard-page.js`(88KB, `SERVER_DASHBOARD_CSS` 62KB 포함): 템플릿 리터럴이 거의 전부다. 바이트 고정 대상이라 편집 시 주의 문구를 파일 머리 주석이 아니라 `PLAN`과 `AGENTS.md`에 둔다(파일 머리에 주석을 넣으면 1단계 바이트 동일성이 깨진다. 3단계 이후 마커 블록 안에 둘 수 있다).
- `client/*`: 33개 클라이언트 함수. 모듈 스코프의 다른 선언을 참조하면 브라우저에서 깨지므로 지금도 자체 완결이다. 7단계 검사 T7이 이를 고정한다.
- `public/site-config.js`: `APP_VERSION`, `FINAL_RELEASE_VERSION = APP_VERSION`(9780행, `admin/release-audit-pages.js`)처럼 상수 초기화가 다른 상수를 읽는 곳 6개는 `init-hazards.txt`에 있다. 연결 순서를 지키는 한 안전하다.
- 경계 보정 2곳: `auth/identity-reauth.js`는 14261행(`userIdentityLinksSettingsKey`)부터, `kakao/edit-state-machine.js`는 28154행(`FIELD_SYNONYMS`)부터 시작한다(28135–28153행의 구획 주석은 앞 모듈 `kakao/edit-session-v4.js` 끝에 붙는다).

## 4. 함수 의존성 지도

### 4.1 파일 안내

| 파일 | 내용 | 행 수 |
|---|---|---:|
| `function-inventory.txt` | 최상위 선언 1,610개: 종류, 이름, 줄 범위, 바이트, export 여부, fan-in/fan-out | 1,611 |
| `function-edges.txt` | 함수→함수 참조 간선 (from, to, 참조 횟수). 지역 변수로 가려진 이름은 제외했고 섀도잉은 과대 추정 쪽으로 처리했다 | 5,848 |
| `module-members.txt` | 선언 → 모듈 배정 | 1,600 |
| `module-edges.txt` | 모듈→모듈 간선 1,180개와 넘어가는 이름 | 1,181 |
| `shared-utilities.txt` | 8개 이상 모듈이 쓰는 공용 선언 59개 | 60 |
| `relocation-candidates.txt` | 자기 모듈에서는 안 쓰고 다른 한 모듈만 쓰는 선언 518개 (4단계 후보) | 519 |
| `module-cycles.txt` | 모듈 그래프의 강결합 성분 | 2 |
| `init-hazards.txt` | 초기화 시 다른 최상위 선언을 읽는 상수 6개 | 7 |
| `tostring-sites.txt` | `.toString()` 직렬화 43곳 | 44 |
| `template-literals.txt` | 2KB 이상 템플릿 리터럴 113개 | 114 |
| `route-literals.txt` | 라우터 안 경로 리터럴 332개 | |
| `env-vars.txt` | `env.*` 62개 | |
| `validator-order-sites.txt` | 검증 스크립트의 순서 의존 `indexOf` 26곳 | |

### 4.2 디렉터리 단위 흐름

의존은 대체로 `admin/my/features/kakao → domain/runtime/nlu/data/auth` 방향이다. 상위 참조 수: `admin→domain` 947, `my→domain` 589, `features→domain` 480, `admin→runtime` 376, `my→runtime` 254, `my→nlu` 191, `auth→runtime` 180, `my→admin` 159(관리자 화면 조각 재사용), `kakao→nlu` 138, `admin→auth` 137, `admin→data` 134, `worker→runtime` 133.

### 4.3 공용 유틸리티 (상위 30)

8개 이상 모듈이 쓰는 선언이다. 4단계에서 `shared/`로 모으면 모듈 간 간선이 크게 준다(예: `escapeHtml`·`numberWithCommas` 두 이름이 `domain/transactions-core.js`로 향하는 간선 대부분을 만든다).

| 이름 | 현재 모듈 | 사용 모듈 수 | 참조 수 |
|---|---|---:|---:|
| `escapeHtml` | `domain/transactions-core.js` | 54 | 1589 |
| `currentMonthKst` | `nlu/date-payment.js` | 51 | 200 |
| `validMonth` | `nlu/date-payment.js` | 44 | 130 |
| `safeArray` | `admin/backup-compare.js` | 43 | 232 |
| `supabase` | `data/supabase-client.js` | 42 | 164 |
| `htmlResponse` | `runtime/http.js` | 42 | 217 |
| `redirectResponse` | `runtime/http.js` | 42 | 408 |
| `safeError` | `runtime/leases.js` | 41 | 120 |
| `numberWithCommas` | `domain/transactions-core.js` | 41 | 595 |
| `rememberOpsEvent` | `runtime/ops-telemetry.js` | 40 | 118 |
| `normalizeText` | `nlu/amount-parser.js` | 35 | 181 |
| `appName` | `public/site-config.js` | 32 | 85 |
| `renderUnifiedNav` | `web/unified-nav.js` | 30 | 88 |
| `verifyAdminSession` | `auth/crypto-admin-session.js` | 29 | 91 |
| `verifyUserSession` | `auth/user-session.js` | 26 | 74 |
| `nowKstDate` | `nlu/date-payment.js` | 25 | 59 |
| `fetchHouseholdMembers` | `data/households-members-rows.js` | 25 | 42 |
| `fetchUserById` | `data/users-household-create.js` | 25 | 48 |
| `safeObject` | `admin/backup-compare.js` | 24 | 104 |
| `formatDate` | `nlu/date-payment.js` | 23 | 72 |
| `fetchAdminRows` | `data/households-members-rows.js` | 23 | 40 |
| `getMySelectedHousehold` | `my/access-control.js` | 19 | 36 |
| `getSettingValue` | `admin/settings-audit-pages.js` | 17 | 25 |
| `fetchAdminHouseholds` | `data/households-members-rows.js` | 17 | 36 |
| `myAccessStatusResponse` | `my/access-control.js` | 17 | 29 |
| `jsonResponse` | `runtime/http.js` | 15 | 115 |
| `formatMessage` | `kakao/reply-texts.js` | 15 | 28 |
| `getSettingValueStrict` | `admin/settings-audit-pages.js` | 15 | 24 |
| `isUncertainStorageWrite` | `kakao/response-builders.js` | 14 | 24 |
| `fetchBudgets` | `domain/budgets.js` | 14 | 22 |

### 4.4 모듈 간선 (상위 25)

| from | to | 참조 수 | 이름 수 | 주요 이름 |
|---|---|---:|---:|---|
| `features/settlement-ops-pages.js` | `domain/transactions-core.js` | 154 | 2 | escapeHtml, numberWithCommas |
| `features/meme-cards.js` | `domain/transactions-core.js` | 136 | 3 | calculateStats, numberWithCommas, escapeHtml |
| `my/mobile-home.js` | `domain/transactions-core.js` | 123 | 4 | escapeHtml, numberWithCommas, nextMonthStart, calculateStats |
| `admin/guide-pages.js` | `domain/transactions-core.js` | 98 | 2 | escapeHtml, numberWithCommas |
| `worker/router.js` | `runtime/http.js` | 87 | 13 | isExplicitAdminUrl, headOnlyResponse, isMobileRequest, redirectResponse, mobileAppLocation |
| `kakao/skill-handler.js` | `kakao/response-builders.js` | 87 | 3 | kakaoText, kakaoGroupCompatibleResponse, dedupeQuickReplies |
| `admin/budget-center-recurring.js` | `domain/transactions-core.js` | 76 | 2 | escapeHtml, numberWithCommas |
| `admin/dashboard-page.js` | `domain/transactions-core.js` | 72 | 5 | escapeHtml, nextMonthStart, calculateStats, getCalendar, numberWithCommas |
| `admin/import-history-rollback.js` | `domain/transactions-core.js` | 72 | 2 | escapeHtml, numberWithCommas |
| `admin/pc-analysis-calendar.js` | `domain/transactions-core.js` | 71 | 5 | calculateStats, getCalendar, escapeHtml, numberWithCommas, nextMonthStart |
| `admin/transactions-households.js` | `runtime/http.js` | 68 | 2 | htmlResponse, redirectResponse |
| `admin/backup-apply.js` | `domain/transactions-core.js` | 68 | 3 | escapeHtml, numberWithCommas, createManualTransaction |
| `my/backup-import.js` | `domain/transactions-core.js` | 68 | 2 | escapeHtml, numberWithCommas |
| `kakao/guided-flows.js` | `kakao/guided-flow-state.js` | 65 | 13 | getKakaoFlowState, isExplicitKakaoFlowCancelCommandV2254, clearKakaoFlowState, kakaoStartQuickReplies, completeKakaoFlowState |
| `web/menu-and-guides.js` | `domain/transactions-core.js` | 58 | 1 | escapeHtml |
| `settings/reserve-plans.js` | `domain/transactions-core.js` | 57 | 2 | numberWithCommas, escapeHtml |
| `admin/nlu-openbuilder-ops.js` | `domain/transactions-core.js` | 57 | 2 | escapeHtml, numberWithCommas |
| `my/analysis-page.js` | `domain/transactions-core.js` | 57 | 3 | calculateStats, numberWithCommas, escapeHtml |
| `features/meme-engine-premium.js` | `domain/transactions-core.js` | 55 | 2 | numberWithCommas, escapeHtml |
| `admin/backup-compare.js` | `domain/transactions-core.js` | 52 | 2 | numberWithCommas, escapeHtml |
| `features/payment-methods-page.js` | `domain/transactions-core.js` | 52 | 2 | escapeHtml, numberWithCommas |
| `admin/meme-content-pages.js` | `domain/transactions-core.js` | 52 | 2 | escapeHtml, numberWithCommas |
| `admin/dashboard-fragments.js` | `domain/transactions-core.js` | 51 | 2 | escapeHtml, numberWithCommas |
| `admin/ops-diagnostics-pages.js` | `domain/transactions-core.js` | 49 | 2 | escapeHtml, numberWithCommas |
| `my/report-challenge.js` | `domain/transactions-core.js` | 46 | 5 | calendarDaysFromRows, calculateStats, numberWithCommas, nextMonthStart, escapeHtml |

### 4.5 순환

모듈 그래프에는 강결합 성분이 둘 있다. `nlu/transaction-parser.js ↔ nlu/date-payment.js`(2개)와 처리기·화면·공용 도우미가 서로 얽힌 67개짜리 성분이다. 연결 빌드와 ESM의 함수 선언 호이스팅에서는 문제가 없다. 문제는 오직 **진짜 ESM 평가 순서**(5단계 이후 번들러나 단일 모듈 `import()`)에서 `const` 초기화가 아직 평가되지 않은 모듈의 값을 읽을 때다. 검사 T8이 연결 순서 기준으로 이를 막고, 단일 모듈 `import()`는 요구하지 않는다.

### 4.6 재배치 후보 (상위 30)

자기 모듈에서는 참조가 없고 다른 한 모듈만 쓰는 선언이다. 4단계의 첫 작업 목록이며 `relocation-candidates.txt`에 518개가 있다.

| 이름 | 현재 모듈 | 유일 사용 모듈 | 참조 수 |
|---|---|---|---:|
| `makeMemeCard` | `my/home-sections.js` | `features/meme-cards.js` | 25 |
| `safeHtmlRoute` | `runtime/http.js` | `worker/router.js` | 21 |
| `tableCheckPair` | `admin/settings-audit-pages.js` | `admin/ops-diagnostics-pages.js` | 21 |
| `handlePublicContentPage` | `public/content-pages.js` | `worker/router.js` | 15 |
| `rememberSkillEvent` | `runtime/ops-telemetry.js` | `kakao/skill-handler.js` | 11 |
| `AB_EFFECTIVE_USER_CACHE` | `runtime/global-state.js` | `auth/user-session.js` | 10 |
| `memeAmountByRegex` | `my/home-sections.js` | `features/meme-cards.js` | 10 |
| `AB_REQUEST_RAW_USER_CACHE` | `runtime/global-state.js` | `auth/user-session.js` | 8 |
| `keywordEditorLocation` | `my/groups-budget-bulk.js` | `my/settings-page.js` | 7 |
| `AB_NLU_RUNTIME_METRICS` | `runtime/global-state.js` | `runtime/ops-telemetry.js` | 6 |
| `kakaoBudgetAmountQuickReplies` | `kakao/guided-flow-state.js` | `kakao/guided-flows.js` | 6 |
| `abMonitorOutcome` | `runtime/ops-monitor.js` | `kakao/skill-handler.js` | 6 |
| `AB_SKILL_RATE_BUCKETS` | `runtime/global-state.js` | `runtime/ops-telemetry.js` | 5 |
| `kakaoGroupCompatibleResponse` | `kakao/response-builders.js` | `kakao/skill-handler.js` | 5 |
| `AB_NLU_RUNTIME_EVENTS` | `runtime/global-state.js` | `runtime/ops-telemetry.js` | 4 |
| `AB_SKILL_EVENTS` | `runtime/global-state.js` | `runtime/ops-telemetry.js` | 4 |
| `READINESS_REQUIRED_TABLES` | `runtime/config-readiness.js` | `worker/router.js` | 4 |
| `READINESS_OPTIONAL_TABLES` | `runtime/config-readiness.js` | `worker/router.js` | 4 |
| `AB_OPERATION_MUTEXES` | `runtime/global-state.js` | `runtime/leases.js` | 4 |
| `LEGACY_ACCOUNTBOOK_SHELL_CSS_ASSET_PATH` | `assets/asset-registry.js` | `assets/asset-responses.js` | 4 |
| `AB_KAKAO_INFLIGHT` | `runtime/ops-telemetry.js` | `kakao/request-guards.js` | 4 |
| `kakaoUnlinkedGroupStartText` | `kakao/household-budget-commands.js` | `kakao/skill-handler.js` | 4 |
| `beginKakaoHouseholdChoice` | `kakao/household-budget-commands.js` | `kakao/skill-handler.js` | 4 |
| `kakaoSkillAuthSnapshot` | `auth/crypto-admin-session.js` | `worker/router.js` | 3 |
| `READINESS_CORE_RPCS` | `runtime/config-readiness.js` | `worker/router.js` | 3 |
| `READINESS_ALTERNATIVE_RPC_GROUPS` | `runtime/config-readiness.js` | `worker/router.js` | 3 |
| `AB_ACCOUNTBOOK_GOALS_JS_CACHE` | `assets/asset-registry.js` | `client/v5-bundle-mains.js` | 3 |
| `AB_ACCOUNTBOOK_FAVROWS_JS_CACHE` | `assets/asset-registry.js` | `client/v5-bundle-mains.js` | 3 |
| `AB_ACCOUNTBOOK_V5_BUNDLE_JS_CACHE` | `assets/asset-registry.js` | `client/v5-bundle-mains.js` | 3 |
| `AB_REQUEST_USER_CACHE` | `runtime/global-state.js` | `auth/user-session.js` | 3 |

### 4.7 초기화 순서 위험 (전부)

| 상수 | 줄 | 초기화 시 참조 |
|---|---:|---|
| `FINAL_RELEASE_VERSION` | 9780 | ref:APP_VERSION |
| `ACCOUNTBOOK_SHELL_CSS` | 21618 | ref:ACCOUNTBOOK_SHELL_V22811_CSS quickChipIconCss ref:quickChipIconCss |
| `AB_WEB_MANIFEST_JSON` | 24307 | ref:AB_WEB_MANIFEST |
| `AB_MANIFEST_LINK` | 24309 | ref:AB_MANIFEST_PATH |
| `AB_ICON_ROUTES` | 24312 | ref:AB_MANIFEST_PATH |
| `AB_CATEGORY_RULES_SCRIPT_TAG` | 33541 | ref:AB_CATEGORY_RULES_ASSET_PATH |

### 4.8 클라이언트 직렬화 지점

서버 함수가 `클라이언트함수.toString()`으로 브라우저 코드를 만든다. 직렬화되는 함수의 **이름과 본문 바이트**가 곧 자산 바이트다. 이름 변경·축소·재출력(번들러)을 금지하는 근거다.

| 직렬화 사용 함수(서버) | 직렬화되는 클라이언트 함수 |
|---|---|
| `deferHeavyBrowserTools` | `myBackupImportClientMain` |
| `attachUiUxRuntime` | `moneyTokenSpans`, `transactionTypeFromText`, `quickInputDate`, `explicitDateIntent`, `parseMobileAmountText`, `mobileUiUxClientMain`, `mobileShellUiClientMain`, `guidedUiUxClientMain`, `inlineActionResultClientMain` |
| `accountbookGoalsJsAsset` | `accountbookGoalsClientMain` |
| `accountbookFavRowsJsAsset` | `accountbookFavRowsClientMain` |
| `accountbookV5BundleJsAsset` | `accountbookSearchClientMain`, `accountbookNotifClientMain`, `accountbookFavRowsClientMain`, `accountbookSidebarDashboardClientMain`, `accountbookQuickInputClientMain`, `accountbookDayDetailClientMain`, `accountbookActivityRailClientMain`, `accountbookSaveFeedbackClientMain`, `accountbookChallengeClientMain`, `accountbookDetailExperienceClientMain` |
| `handleMyBackupPage` | `cardImportClientMain` |
| `renderMyImportPreviewHtml` | `importPreviewClientMain` |
| `insightAppJsResponse` | `budgetExpenseRows`, `insightClientMain` |
| `accountbookThemeJsAsset` | `accountbookThemeClientMain` |
| `mobileHomeJsAsset` | `moneyTokenSpans`, `transactionTypeFromText`, `quickInputDate`, `explicitDateIntent`, `parseMobileAmountText`, `mobileShellUiClientMain`, `guidedUiUxClientMain` |
| `mobileHomeShellJsAsset` | `mobileHomeNavStateClientMain` |
| `accountbookStage4NavJsAsset` | `accountbookStage4NavClientMain` |
| `accountbookSearchJsAsset` | `accountbookSearchClientMain` |
| `accountbookNotifJsAsset` | `accountbookNotifClientMain` |
| `renderMobileV81Html` | `quickSmartInputController` |
| `renderMyBackupLoginHtml` | `passwordMatchFeedbackClientMain` |
| `renderUserLoginHtml` | `kakaoLoginProgressClientMain`, `passwordMatchFeedbackClientMain`, `loginEntryAnchorClientMain` |

### 4.9 큰 템플릿 리터럴 (상위 20)

| 포함 선언 | 줄 | KB | 내용 앞부분 |
|---|---:|---:|---|
| `ACCOUNTBOOK_SHELL_CSS` | 21621 | 145.1 |  html{background:#f2f4f6;color-scheme:light} html[data-ab-re |
| `SERVER_DASHBOARD_CSS` | 8134 | 60.9 |  :root{--bg:#eef3fb;--card:#fff;--line:#e2e8f0;--text:#0f172 |
| `MOBILE_V81_CSS` | 20652 | 34.6 |  *{box-sizing:border-box}html{scroll-behavior:smooth}body{ma |
| `NUMBER_FLOW_ASSET_SOURCE` | 20887 | 22.8 | /*! number-flow v0.6.2 | MIT | (c) Maxwell Barvian | https:/ |
| `renderUserLoginHtml` | 26174 | 20.3 | <!doctype html><html lang="ko"><head><meta charset="utf-8"/> |
| `renderUnifiedNav` | 10856 | 16.2 | <div class="abNavScope" data-nav-scope="${…}" hidden></div>$ |
| `V2281_GUIDED_UIUX_STYLE` | 3200 | 14.9 | <style id="v2281GuidedUiUxStyle"> :root{--ab-bg:#f6f8fb;--ab |
| `renderMobileV81Html` | 24854 | 14.7 | <!doctype html><html lang="ko"><head><meta charset="utf-8"/> |
| `renderMyInsightHtml` | 16863 | 14.5 | <!doctype html><html lang="ko"><head><meta charset="utf-8"/> |
| `renderMyAnalysisHtml` | 18258 | 13.4 | <!doctype html><html lang="ko"><head><meta charset="utf-8"/> |
| `renderUnifiedNav` | 10856 | 13.2 | <style id="unifiedNavStyle"> :root{--abNavW:238px;--abNavCol |
| `handleReservePlansPage` | 6799 | 12.7 | <!doctype html><html lang="ko"><head><meta charset="utf-8"/> |
| `reportUxCss` | 16413 | 11.8 |  .reportChallenge select{width:100%;min-width:0;max-width:10 |
| `handleBudgetCenterPageLegacyV2264` | 25618 | 11.0 | <!doctype html><html lang="ko"><head><meta charset="utf-8"/> |
| `ACCOUNTBOOK_EXPERIENCE_CSS` | 21456 | 10.3 |  /* V22.9.25: scoped enhancements preserve the analysis surf |
| `renderPcAnalysisHtml` | 25251 | 10.3 | <!doctype html><html lang="ko"><head><meta charset="utf-8"/> |
| `ACCOUNTBOOK_SHELL_CSS` | 22755 | 10.3 | \n/* V22.9.9 (개편 5단계): 머리말이 첫 화면을 먹지 않게 조인다. 재 보니 390×844 화면 |
| `handleBudgetCenterPage` | 25582 | 9.5 | <!doctype html><html lang="ko"><head><meta charset="utf-8"/> |
| `renderMySettingsHtml` | 18570 | 9.4 | <!doctype html><html lang="ko"><head><meta charset="utf-8"/> |
| `V2284_UI_REVALIDATION_STYLE` | 3239 | 9.3 | <style id="v2284UiRevalidationStyle"> :root{--ab-bg:#f7f8fa; |

## 5. 위험 등록부

등급: 높음(계약·데이터·보안에 닿음) / 중간(검증으로 잡히지만 수정 비용 있음) / 낮음(기계적으로 검출).

| ID | 위험 | 등급 | 영향 단계 | 완화 | 검출 |
|---|---|---|---|---|---|
| R1 | 모듈을 고치고 `src/index.js`를 다시 만들지 않거나, 생성 파일을 직접 고친다 | 중간 | 1 이후 전부 | 빌드를 하네스 첫 단계로, `AGENTS.md`에 "생성 파일 수정 금지" 명시 | T1 드리프트 검사(SHA-256) |
| R2 | 검증 26곳이 함수의 **상대 순서**에 의존한다(`indexOf("\nfunction ", start)` 등) | 중간 | 4 | 위치 분할은 순서를 보존. 4단계에서 옮기는 함수와 그 **양옆 함수** 이름으로 `validation/`을 grep 후 조정 | 해당 검사 실패 |
| R3 | `.toString()` 직렬화 43곳: 이름 변경·축소·재출력 시 자산 바이트·동작이 바뀐다 | 높음 | 4·5 | 연결 빌드 유지, 번들러·minify 금지, 클라이언트 함수는 `client/`에 격리 | T7 자체 완결 검사, 기존 자산 바이트 검사 |
| R4 | 최상위 `const` 초기화 순서(6곳)와 67모듈 순환 | 중간 | 4·5 | 연결 순서(MANIFEST)를 명시적으로 관리, 상수는 사용 모듈보다 앞에 | T8 초기화 순서 검사, ESM 진입점 검사 |
| R5 | 즉시실행 자산·ETag: 템플릿 리터럴 공백 변경만으로 서비스 바이트가 바뀐다 | 높음 | 2·4 | 1·3단계는 바이트 동일. 2단계는 JS 구조 공백(객체 리터럴 항목 사이)만 변경. 자산 리터럴은 주소 판을 올릴 때만 | `validate-immutable-asset-addresses`, 자산 바이트 검사, T5 HTML 골든 |
| R6 | HTML 예산(35KB·44KB)과 응답 바이트 | 중간 | 2·4 | 템플릿 리터럴 불변. 변경 시 `validate-performance` | 기존 성능 검사, T5 |
| R7 | 체크섬 manifest·검사 하한(8,000)·`verify-repository.mjs` 목록 갱신 누락 | 낮음 | 0 이후 | 새 검사·파일을 manifest와 목록에 추가, 하한 상향 | 하네스 자체 |
| R8 | 줄 끝(CRLF): 이 PC는 `core.autocrlf=true`. `.gitattributes`가 `.js/.mjs/.md/.txt`를 LF로 고정하지만 `.cjs/.tsv`는 고정하지 않는다 | 낮음 | 0 | 새 파일 확장자를 `.mjs/.js/.txt/.md`로 제한. 빌드가 CR과 끝 줄바꿈 누락을 거부 | 빌드 오류, `git diff --check` |
| R9 | 배포 자동화가 설정·바인딩을 바꾼다 | 높음 | 6 | Versions API에 기존 바인딩을 `inherit`로 넘기고 `bindings_inherit=strict`로 누락을 실패 처리. wrangler(설정 파일이 정본이 되어 누락 = 삭제)는 채택하지 않는다 | 승격 전 버전 바인딩·compat 설정 대조 |
| R10 | 운영 배포 자동화가 승인 게이트를 우회한다 | 높음 | 6 | 스크립트는 사용자가 직접 실행하거나 GitHub `workflow_dispatch`로만. 자동 push 배포 금지. 승격 단계는 별도 플래그(`--promote`) | 절차·문서 |
| R11 | 두 모듈이 같은 최상위 이름을 선언한다(에이전트 실수) | 낮음 | 1 이후 | 연결 결과에 `node --check`(ESM 중복 선언은 SyntaxError) | 하네스 문법 검사, T2 |
| R12 | 4단계 이동이 의미를 바꾼다(조건부 호이스팅, `let` 캐시 초기화 시점) | 중간 | 4 | 한 PR에 한 묶음, AST 문장 집합 비교 + 골든 스냅샷 | T3·T4·T5·T6 |
| R13 | 1단계 PR이 커서(파일 108개) 리뷰가 어렵다 | 낮음 | 1 | 리뷰 기준은 diff가 아니라 "재조립 SHA-256 일치"와 manifest 범위 연속성 | T1, split 스크립트의 자체 검증 |
| R14 | Workers Free 한도(CPU 10ms·서브요청 50)는 분리와 무관하게 남는다 | — | — | 범위 밖. `KNOWN-ISSUES.md` 기존 항목 유지 | 관제 화면 |
| R15 | 편집기가 파일 끝에 줄바꿈을 더하거나 빼서 연결 결과가 어긋난다 | 낮음 | 1 이후 | 모듈 파일은 정확히 하나의 줄바꿈으로 끝난다. 빌드가 끝 줄바꿈 누락을 거부하고 추가 빈 줄은 드리프트로 잡는다 | T1 |

## 6. 변경 순서

각 단계는 **독립 PR**이고, 완료 조건에 `node .codex/scripts/verify-repository.mjs` 통과와 `git diff --check`가 포함된다. "배포"는 `src/index.js` 바이트가 바뀐 단계에만 필요하다. 10장의 결정을 이미 반영했다.

### Phase 0 — 빌드·드리프트 도구 도입 (배포 없음, 위험 낮음)

- 작업: `scripts/build-worker.mjs`·`scripts/split-worker.mjs`를 `tools/`로 복사. `validation/validate-build-identity-v22932.mjs` 추가(모듈 폴더가 있으면 재조립 SHA-256 비교, 없으면 통과하되 검사 수는 고정). `verify-repository.mjs` 목록과 `EXPECTED_MINIMUM_CHECKS`에 반영. `package.json`에 `build:worker`, `validate:build-identity` 스크립트 추가.
- 검증: 전체 하네스. `src/index.js` 해시가 `bbcd1756…` 그대로인지.
- 롤백: PR 되돌리기. 생성 파일 변화 없음.

### Phase 1 — 위치 기반 분할 (배포 없음, 위험 매우 낮음)

- 작업: `node tools/split-worker.mjs --manifest docs/refactor/modularization-v1/split-manifest.txt` 실행 → `src/modules/**` 108개와 `src/modules/MANIFEST.txt` 생성. 스크립트는 재조립 해시가 원본과 다르면 실패한다. `AGENTS.md`의 "저장소 구조"와 "변경 원칙"에 "소스는 `src/modules/`, `src/index.js`는 `npm run build:worker`가 만드는 생성 파일" 추가. `.github/workflows/verify.yml`은 하네스가 드리프트 검사를 포함하므로 변경 없음.
- 검증: `node tools/build-worker.mjs --check` → 동일. 전체 하네스. `git status`에서 `src/index.js`가 **변경되지 않았는지**(바뀌었다면 중단).
- 롤백: `src/modules/`와 `MANIFEST.txt` 삭제. `src/index.js`는 손대지 않았으므로 즉시 원상.
- 완료 정의: 모듈 108개, 재조립 SHA-256 `bbcd1756…`, 하네스 8,000개 이상 통과, 체크섬 199개 통과(새 파일은 다음 판 manifest에 추가). Phase 0과 함께 main에 병합하되 운영 배포는 하지 않는다(V22.9.31 병합 때와 같은 방식).

### Phase 6 — 배포 자동화 (Phase 0과 독립, 병행 가능, 위험 중간)

8장 참고. `src/index.js`를 바꾸지 않으므로 어느 시점에든 할 수 있고, 업로드 속도 문제를 가장 먼저 푼다. 구현 PR에서는 `--dry-run`(API 호출 없이 요청 본문·해시만 출력)과 "업로드만, 승격 없음" 경로까지 검증하고, 첫 실제 승격은 Phase 2+3 판(`V22.9.32`)을 사용자 승인 아래 배포할 때 한다. 기능 변화가 거의 없는 판이라 새 배포 경로의 예행연습으로 가장 알맞다.

### Phase 2 — 긴 줄 정리 (배포 필요, 위험 낮음~중간)

- 작업: `assets/historical-runtime-assets.js`의 객체 리터럴을 항목마다 한 줄로 분리(문자열 값 불변). `src/index.js`의 "생성 파일" 안내는 새 문장을 추가하지 말고 **1~29행의 기존 머리 주석 블록 안에 한 줄**로 넣는다(최상위 문장 수와 검증의 앵커가 바뀌지 않는다). 그 밖의 10,000자 넘는 줄 8개는 전부 템플릿 리터럴(HTML·CSS)이라 **손대지 않는다**(R5·R6).
- 검증: T3 AST 문장 집합 비교(문자열 값 동일), 전체 하네스, `validate-immutable-asset-addresses`·자산 바이트 검사 통과, `/my`·`/app` 예산 유지.
- 배포: Phase 3와 함께 `V22.9.32-MODULAR-SOURCE` 한 판으로. `VERSION.txt`·`package.json`·`APP_VERSION`·`DEPLOYMENT_MATRIX.md`·`CHANGELOG.md`·새 체크섬 manifest 갱신. Phase 6 스크립트의 첫 실제 사용.
- 롤백: 이전 `src/index.js` 재배포(해시 `bbcd1756…`), 또는 Deployments API로 직전 버전 100%.

### Phase 3 — 모듈별 import/export 명시 (배포 없음, 위험 낮음)

- 작업: `module-edges.txt`·`module-members.txt`로부터 각 모듈 머리에 `// @build:imports-start` 블록(`import { a, b } from "../x/y.js";`), 꼬리에 `// @build:exports-start` 블록(`export { … };`)을 생성하는 `tools/annotate-modules.mjs` 추가. 생성 결과는 빌드가 제거하므로 `src/index.js`는 Phase 2 결과와 바이트 동일. 이 단계에서 `tools/vendor/acorn.mjs`를 벤더링하고(10장 4번) T2·T7·T8을 추가한다.
- 검증: T1 드리프트 동일, 각 모듈 `node --check`(T2), T7, T8, 전체 하네스. 단일 모듈 `import()` 평가는 요구하지 않는다(4.5).
- 롤백: 마커 블록 제거(`tools/annotate-modules.mjs --strip`). 생성 파일 불변.

### Phase 4 — 의미 보존 재배치 (점진, PR마다 배포 판단, 위험 중간)

- 선행: 7장의 T3·T4·T5·T6을 먼저 추가한다(골든 스냅샷은 Phase 1 산출물에서 기록).
- 작업 단위(각각 PR 하나): (a) `shared/` 신설 — `escapeHtml`, `numberWithCommas`, `safeArray`, `safeObject`, `currentMonthKst`, `validMonth`, `formatDate`, `nowKstDate`, `safeError`, `htmlResponse`, `redirectResponse`, `jsonResponse` 등 상위 공용 유틸(4.3) 이동. (b) 재배치 후보 상위부터(4.6; 예 `makeMemeCard`→`features/meme-cards.js`, `safeHtmlRoute`→`worker/router.js` 옆). (c) 라우터를 `routeAdmin/routePublic/routeMy/routeKakao/routeApi`처럼 **연속 블록 단위**로 추출(순서 유지). (d) 레거시 중복(`*LegacyV2264`, fan-in 0인 선언 22개)은 제거하지 않고 `legacy/`로만 이동(제거는 별도 제품 결정).
- 검증(이동 PR 공통): T3 문장 집합 동일(이동만 했는지), T8 초기화 순서, T4·T5·T6 골든 동일, 전체 하네스, R2 grep 결과 반영.
- 배포: 묶어서 판 단위.

### Phase 5 — 검증의 원문 의존 축소 (선택, 장기)

원문 텍스트 검사 74개 중 "동작"을 확인하는 것은 `app.fetch` 기반으로, "구조"를 확인하는 것은 AST 기반으로 옮긴다. 이 단계가 끝나야 번들러(esbuild/wrangler 번들)나 `.css`·`.js` 자산 파일 분리 같은 다음 구조 변경이 가능하다. 그 전까지 연결 빌드가 정본이다.

### 추론 강도 권고

Phase 0·1·3은 High(기계적이지만 검증 하네스와 배포 기준선에 닿음), Phase 2·6은 High(배포·운영), Phase 4는 Extra High(의미 보존 판단), Phase 5는 Medium~High.

## 7. 회귀 테스트 계획

기존 하네스(93 스크립트·8,000개 하한)는 그대로 두고 아래를 추가한다. 요약줄 형식은 `(N checks)`를 쓴다.

| ID | 검사 | 단계 | 내용 |
|---|---|---|---|
| T1 | `validate-build-identity` | 0 | `MANIFEST.txt` 순서로 재조립한 SHA-256 == `src/index.js`. `src/modules/**/*.js`가 manifest에 정확히 한 번씩 있고, manifest에 없는 파일이 없다. 모든 모듈이 LF이며 줄바꿈 하나로 끝난다 |
| T2 | `validate-module-syntax` | 3 | 모듈마다 `node --check`. 마커 블록 짝 맞음. 최상위 이름 중복 없음(`tools/vendor/acorn.mjs`) |
| T3 | `validate-ast-equivalence` (도구) | 2·4 | 두 생성 파일의 최상위 문장 텍스트 **집합** 비교(순서 무시). 허용 변경 목록을 인자로 받는다. PR 검증용이며 하네스 상시 항목은 아님 |
| T4 | `validate-golden-kakao` | 4 전 | `__AB_QA_FIXED_NOW_MS`로 시계 고정, `qa-fixture.mjs`로 DB 모사. 1:1·그룹·수정 세션·예산·안내 발화 N개의 SkillResponse JSON을 `validation/golden/kakao-*.json`과 완전 비교 |
| T5 | `validate-golden-html` | 4 전 | 같은 고정 시계로 `/my`, `/app`, `/my/analysis`, `/my/settings`, `/budgets`, `/menu`, `/reserve-plans`, `/my/households`, 로그인 화면, 공개 홈의 본문 SHA-256과 `cache-control`·`content-type`·CSP 헤더 스냅샷 비교 |
| T6 | `validate-route-table` | 4 전 | 라우터 AST에서 (메서드, 경로 리터럴/정규식, 호출 핸들러) 튜플을 뽑아 스냅샷 비교. 추가로 경로 332개를 fixture로 호출해 상태 코드 맵 비교 |
| T7 | `validate-client-serialization` | 3 | `.toString()` 대상 33개 함수가 모듈 스코프의 다른 최상위 이름을 참조하지 않는지(자유 식별자 검사). 기존 런타임 실행 검사(`new Function`)는 유지 |
| T8 | `validate-init-order` | 3 | 연결 순서에서 모든 최상위 `const`/`let` 초기화가 참조하는 최상위 선언이 앞서 정의됐는지(함수 선언 제외) |
| T9 | 기존 성능·직렬 깊이·시작 예산 검사 | 전부 | `validate-performance`, `validate-serial-depth`, `validate-startup-budget` 그대로 |
| T10 | 배포 검증 | 6 | 업로드한 버전의 바인딩·compat 설정 == 현재 배포, 승격 후 서버 content 해시 == 로컬, `/health` 판, `tools/verify-deployment-v22920.mjs` 공개 검사 |

검사 개수 하한은 새 검사만큼 올린다(T1 약 5, T2 약 110, T4·T5·T6은 스냅샷 항목 수).

## 8. 배포 방식 조정

### 8.1 현재

검증된 `src/index.js` 전체를 대시보드에서 교체(버전 저장 후 승격), 서버 저장 소스 SHA-256·바인딩 30개·런타임 설정을 수동 대조, `/health`·`/ready`·공개 검사 116개. 느린 부분은 3MB 붙여넣기와 수동 대조다.

### 8.2 선택지와 결정

| 안 | 방법 | 설정·바인딩 | 승인 게이트 | 결정 |
|---|---|---|---|---|
| A (채택, 1차) | Versions API `POST …/scripts/kakao-accountbook/versions?bindings_inherit=strict`로 업로드(배포 아님) → 저장된 버전의 바인딩·compat 대조 → Deployments API `POST …/deployments`로 100% | `bindings`에 현재 바인딩 전부를 `{"type":"inherit","name":…,"version_id":<현재 배포 버전>}`으로 넘긴다. strict라 하나라도 못 찾으면 업로드가 실패한다. Secret 값은 서버에 남는다 | 업로드와 승격이 분리된다. 승격은 `--promote` 플래그와 사용자 승인 뒤에만 | 현재 절차와 같은 모양, 설정 불변 |
| A-대안 | `PUT …/scripts/kakao-accountbook/content` (공식 설명: config·metadata를 건드리지 않고 content만 교체) | 건드리지 않음 | 즉시 100% 배포(승격 분리 없음) | A가 막힐 때의 비상 경로로만 |
| B (채택 안 함) | `wrangler versions upload/deploy` | 설정 파일이 정본. 바인딩·`vars`·Cron·도메인·서비스 바인딩을 전부 적어야 하고 누락은 곧 삭제 | 분리됨 | 설정 정본 이전이 별도 프로젝트. 8.4 골격만 참고용으로 남긴다 |
| C (채택 안 함) | Workers Builds push 자동 배포 | 설정 파일 정본 | 없음 | 승인 문화와 충돌 |
| D (채택, 2차) | GitHub Actions `workflow_dispatch`: 하네스 → A 업로드 → 대조 → (승인 입력 시) 승격 → 공개 검사 | A와 같음 | 수동 트리거 + `promote` 입력값 | A가 두 번 성공한 뒤 도입. 토큰은 GitHub Secrets |

### 8.3 A안 스크립트 설계 (`tools/deploy-worker-version.mjs`, 구현은 Phase 6)

1. 전제 검사: `git status` 깨끗함, `node tools/build-worker.mjs --check` 통과, `VERSION.txt`·`package.json`·`APP_VERSION` 일치, 로컬 `src/index.js` SHA-256 출력.
2. 현재 상태 조회: `GET …/scripts/kakao-accountbook/settings`(바인딩 목록)와 현재 배포의 버전 ID(`GET …/scripts/kakao-accountbook/deployments`), 그 버전의 `compatibility_date`·`compatibility_flags`·`usage_model`. 저장소 밖(`output/deploy/<판>/`)에 보관 — 롤백 자료.
3. 업로드(배포 아님): `POST …/versions?bindings_inherit=strict`, multipart `metadata`에 `main_module: "index.js"`, `compatibility_date`(2번에서 읽은 값 그대로), `compatibility_flags`(그대로), `bindings`(2번 목록 전부를 `inherit`로, `version_id`는 현재 배포 버전. 실제 업로드 API는 `latest`만 받아서 2026-10-09 첫 실행 뒤 `latest`로 바꾸고, 업로드 전에 최신 버전이 현재 배포 버전인지 확인한다), `annotations: {"workers/message": "<판>", "workers/commit_sha": <HEAD>}`. 파일 part `index.js`, `Content-Type: application/javascript+module`.
4. 대조: 응답의 버전 ID로 `GET …/versions/<id>`를 읽어 바인딩 이름·종류 집합과 compat 설정이 2번과 같은지 확인. 다르면 **승격하지 않고** 보고.
5. 승격(`--promote`가 있고 사용자가 승인한 뒤에만): `POST …/deployments` 본문 `{"strategy":"percentage","versions":[{"version_id":"<id>","percentage":100}],"annotations":{"workers/message":"<판>"}}`.
6. 사후 검증: `GET …/scripts/kakao-accountbook/content/v2` 해시 == 로컬, `GET https://malhaebook.com/health`의 `version` == `APP_VERSION`, `node tools/verify-deployment-v22920.mjs`.
7. 기록: `DEPLOYMENT_MATRIX.md`·`docs/deployments/`에 버전 ID·배포 ID·해시·시각.
8. 롤백: Deployments API로 직전 버전 100%(수 초), 또는 보관한 이전 소스를 같은 절차로 재업로드. 이전 판 소스는 Git에 있다.

필요한 것: `CLOUDFLARE_API_TOKEN`(권한 `Workers Scripts Write`, 계정 한정, 만료일 설정)과 `CF_ACCOUNT_ID`(`58e7954ad3d92f0d39a7492ad4689165`, `monitoring/wrangler.jsonc`와 동일)를 환경변수로만 전달. 저장소·로그에 기록하지 않는다. `--dry-run`은 네트워크 호출 없이 요청 본문과 해시만 출력한다.

### 8.4 참고: wrangler를 쓰게 될 때의 `wrangler.toml` 골격 (채택하지 않음)

```toml
name = "kakao-accountbook"
account_id = "58e7954ad3d92f0d39a7492ad4689165"
main = "src/index.js"
compatibility_date = "2026-06-16"   # 운영 메타데이터 기준, 사용 전 재확인
no_bundle = true
find_additional_modules = false     # src/modules/** 가 업로드에 끌려 들어가지 않게
keep_vars = true                    # 대시보드 변수 보존
workers_dev = false                 # 라우트·도메인은 대시보드 정본 유지 시 routes 키 생략
[triggers]
crons = ["10 0 * * *"]
[[services]]
binding = "OPS_MONITOR"
service = "malhaebook-monitor"
```

### 8.5 Workers 한도 (공식 문서, 2026-09-05 갱신)

Worker 크기 64 MiB(비압축, 압축 한도 없음), 시작 1초, Free CPU 10ms/요청, 서브요청 50/요청. 현재 2.85MB·gzip 784KB. 분리는 생성 파일을 바꾸지 않으므로 어떤 한도에도 영향이 없다. 버전 업로드 응답의 `startup_time_ms`를 기록해 두면 좋다.

## 9. Opus 5.5 핸드오프

- 시작 프롬프트: `HANDOFF_PROMPT.md`. Phase 0+1을 한 세션에서 끝내는 분량이다.
- 세션 시작 전: `/model`에서 Opus 5.5·max 선택. 작업 브랜치(예: `codex/v22932-modular-source`) 생성은 사용자 승인 후.
- 구현 세션이 지켜야 할 것: 이 문서의 2장(제약), 6장(단계별 완료 조건), 7장(검사), 10장(확정 결정). `src/index.js`를 손으로 고치지 않는다. Phase 1에서 `src/index.js`가 1바이트라도 바뀌면 중단하고 보고한다.
- 분석 재생산: `node --expose-internals docs/refactor/modularization-v1/scripts/analyze-worker-structure.mjs src/index.js <out>`; 경계·드라이런: `node --expose-internals …/build-split-manifest.mjs src/index.js <out> <dryrun>`.

## 10. 결정 사항 (추천으로 확정)

구현 세션은 아래를 묻지 않고 그대로 따른다. 바꾸려면 사용자가 이 장을 고친다.

| # | 항목 | 결정 | 이유 |
|---|---|---|---|
| 1 | 모듈 루트 | `src/modules/` | `src/` 안에 있어 찾기 쉽고 `.gitattributes`의 `*.js` LF 규칙을 그대로 받는다. wrangler를 쓰지 않으므로 추가 모듈 자동 포함 위험이 없다(쓰게 되면 `find_additional_modules=false`) |
| 2 | 배포 1차 방식 | A안(Versions API `inherit` strict → 대조 → Deployments API) | 현재 "저장 → 대조 → 승격"과 같은 모양이고 설정·바인딩·Secret을 건드리지 않는다. content 교체 API는 즉시 배포라 비상용으로만. wrangler는 설정 정본 이전이 따로 필요해 채택하지 않는다 |
| 3 | 판 묶음 | Phase 0+1은 main에 병합만(배포 없음). Phase 2+3은 `V22.9.32-MODULAR-SOURCE` 한 판으로 배포하며 Phase 6 스크립트의 첫 실제 사용으로 삼는다 | 기능 변화가 없는 판이 새 배포 경로의 예행연습으로 가장 안전하다 |
| 4 | acorn 사용 | Phase 0~2는 acorn 불필요. Phase 3에서 `tools/vendor/acorn.mjs`를 벤더링(MIT, 판·SHA-256을 `tools/bundle-number-flow.mjs`처럼 기록). 분석 스크립트는 그때 벤더 파일로 전환 | 하네스는 자식 Node에 플래그를 넘기지 않으므로 검사 스크립트가 `--expose-internals`에 기댈 수 없다. 벤더링은 number-flow 전례와 같다 |
| 5 | 분석 폴더 | `docs/refactor/modularization-v1/` 전체를 커밋(기준 해시 `bbcd1756…` 스냅샷). `src/index.js`가 바뀌면 `scripts/`로 재생산 | 명세와 재생산 도구가 함께 있어야 다음 세션이 자족적이다. 크기 0.8MB는 허용 범위 |
| 6 | 체크섬 범위 | 다음 판 manifest에 `src/modules/**`, `src/modules/MANIFEST.txt`, `tools/build-worker.mjs`, `tools/split-worker.mjs`, 새 검증 파일, `docs/refactor/modularization-v1/PLAN.md`·`HANDOFF_PROMPT.md`·`split-manifest.txt`·`scripts/*`를 추가. 재생산 가능한 데이터 `*.txt`(간선·목록)는 제외 | 현재 manifest가 검증·도구·핵심 문서를 담는 범위와 같게 맞춘다 |

## 11. 진행 기록

| 단계 | 상태 (2026-10-08) | 비고 |
|---|---|---|
| 0·1 | PR #56 | 모듈 108개, 재조립 SHA-256 동일(`bbcd1756…`). 계획에 없던 V22_9_31 체크섬 목록 세 줄 재고정(같은 판 문서 커밋 선례) |
| 6 | PR #57 | `tools/deploy-worker-version.mjs`. 버전 조회 응답에 annotations가 문서상 없어, 업로드 기록(소스 SHA-256·HEAD·etag)으로 버전과 커밋을 잇는다. 바인딩 0개·배열 아님이면 업로드 거부. 되돌림 뒤 공개 검사는 하지 않음 |
| 2·3 | V22.9.32 판 | T3 결과 1,609/1,610 동일(`APP_VERSION`만 변경). `build:worker`가 annotate를 먼저 실행. import 2,722·export 1,024 이름, 모듈 간 `let` 대입 10건은 4단계 대상 |
| 6 보완 | 2026-10-09 첫 실제 업로드 뒤 | 실제 업로드 API는 inherit의 `version_id`로 `latest`만 받는다(버전 ID는 10057, 문서와 다름). `latest`로 보내고, 업로드 전 `GET /versions`의 최신 버전이 현재 배포 버전(또는 이 스크립트가 그 버전에서 올린 버전)인지 확인한다. `compatibility_flags` 키 없음 = 빈 목록. 버전 조회 응답에는 `annotations`가 있고, etag는 소스 SHA-256과 다르다. 검사 178 → 197 |
| 6 보완 2 | 2026-10-09 첫 승격 뒤 | 승격 뒤 공개 검사의 `/health` 한 번이 전파 중 이전 판을 만나 115/116. 공개 검사 전에 `/health` 5번 연속 일치(2초 간격, 최대 40번, 불일치면 처음부터)를 기다린다. 검사 197 → 207 |

측정값 정정: `split-manifest.txt`의 `bytes` 열과 3장 표의 KB는 UTF-16 문자 수 기준이다. 실제 UTF-8 파일은 10% 안팎 더 크다. 분석 스크립트는 `tools/vendor/acorn.mjs`를 쓰므로 `--expose-internals` 없이 실행한다.

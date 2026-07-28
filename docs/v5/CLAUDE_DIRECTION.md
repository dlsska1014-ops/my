# 똑똑한가계부 V5 — Claude 진행·개선 방향 (Direction & Improvement Plan)

> 작성 주체: **Claude**. Codex의 `V22.8.24-UI-V5-SHELL-CORRECTNESS` 작업본을 **벤치마크(참조)**로만 사용하고,
> 이후 진행방향·판단·개선은 이 문서 기준으로 진행한다. 디자인 기준은 `design_handoff_ttokttok_v5/`(V5 프로토타입·구현명세서).

---

## 0. 현재 기준선 (Baseline)

- 채택본: `src/index.js` = Codex `V22.8.24-UI-V5-SHELL-CORRECTNESS` (CRLF→LF 정규화, `node --check` 통과).
- 성격: 단일 Cloudflare Worker(약 25.9k줄)에 백엔드 + 인라인 HTML 렌더가 모두 포함된 운영 서버.
- 커밋: `chore: adopt Codex V22.8.24 ... as baseline` — 이후 Claude 개선분은 이 위에 diff로 쌓는다.

---

## 1. Codex 작업 벤치마크 (냉정한 평가)

### 1.1 Codex가 택한 전략 = "레트로핏(Retrofit)"
기존 레거시 HTML을 버리지 않고, `body.abV22812Shell` 클래스로 감싼 뒤 **대량의 `!important` CSS 레이어**로 V5 외형을 덧씌운다. 렌더된 HTML 문자열은 `promoteLegacyUserLayoutToV5()`가 후처리해 V5 레이아웃으로 승격한다.

| 단계 | 내용 |
|---|---|
| V22.8.21 step 1 | 데스크톱/모바일 단일 내비게이션 셸 |
| V22.8.22 step 2 | 공통 페이지 헤더·컨트롤바·KPI·콘텐츠 서피스 |
| V22.8.23 step 3 | 나머지 인증 페이지 + 레거시 레이아웃 은퇴 |
| V22.8.24 shell correctness | 900px 경계, 라우트 상태, 포커스 가능한 드로어 |

### 1.2 잘한 점 (유지·계승할 것)
- **토큰 시스템이 견고**: `--ab12-*` 원시 토큰 → 시맨틱 별칭(`--brand/--accent/--card-2/--accent-weak/--on-accent`) → 4개 톤(blue·emerald·violet·amber) × 라이트/다크 캐스케이드. 프로토타입의 팔레트 전환 요구를 이미 충족.
- **접근성 하드닝이 이미 반영**: 기본 블루의 `bg/surface/text/muted/line/brand/accent-soft`는 프로토타입 확정 토큰과 **정확히 일치**. 유일한 의도적 편차는 `--accent/--action:#1d4ed8`(프로토 `#3182F6` 대신) — `#3182F6`은 흰 배경 소형 텍스트에서 WCAG AA 미달(≈3.06:1), `#1d4ed8`은 통과. 즉 **의도된 대비 보정**이다.
- 반응형 셸(사이드바↔하단탭), 다크모드 전면 커버리지, reduced-motion 대응이 이미 존재.

### 1.3 약한 점 (개선 대상)
1. **취약한 결합**: 수백 개 `!important` 규칙이 레거시 클래스명(`.txItem`,`.homeSpendHero`,`.homeBudget`…)에 강결합. 마크업 변경 시 조용히 깨질 수 있음.
2. **문자열 후처리 렌더**: `promoteLegacyUserLayoutToV5()`가 HTML 문자열을 `indexOf/slice`로 잘라 승격 — 마크업이 바뀌면 침묵 실패 위험.
3. **V5 신규 기능 부재**: 명세서의 ★V5 신규(통합검색·알림센터·자산·목표·연간·즐겨찾기·로딩/Undo)가 **아직 미구현**. Codex는 외형 이식(shell)에 집중했고 기능 확장은 시작 전.
4. **시맨틱 색상 미토큰화**: 지출/수입 색이 `#3182F6`/`#ef4444` 등으로 코드 전역에 하드코딩 분산(neg/pos·멤버 색상 토큰 없음).

---

## 2. Claude의 진행 방향 (Direction)

### 2.1 대원칙
1. **셸은 갈아엎지 않는다.** Codex의 레트로핏 셸·토큰·대비 보정은 검증된 자산 → 계승. 회귀 금지(특히 `--accent` 대비값 되돌리지 않음).
2. **개선은 "격리된 추가(additive)"로.** 신규 V5 기능은 레거시 마크업을 건드리지 않는 **독립 모듈(오버레이/뷰)**로 추가해 blast radius 최소화.
3. **기능 추가와 구조 변경을 같은 버전에 섞지 않는다.** (레포 `NEXT_UPDATE_PLAN.md` 원칙 계승.)
4. **모든 증분은 검증 가능해야 한다**: `node --check` + 기존 `validate` 스크립트 + 가능 시 Playwright 스냅샷.
5. **user 스코프 API 분리**: 기존 `/api/*`는 admin 인증 전용 → 최종 사용자용 V5 화면은 **세션(카카오/자체) 기반 user 스코프 엔드포인트**를 신설해 권한을 재검사한다.

### 2.2 아키텍처 결정 로그
| 결정 | 판단 |
|---|---|
| 별도 `web/` SPA 신설? | **아니오.** Codex가 워커 인라인 렌더로 진행 중 → 병렬 프론트는 이중 유지보수. 인라인 방식 계승. |
| 토큰을 프로토타입 원값으로 복원? | **아니오.** 접근성 회귀. Codex 대비 보정 유지. |
| 신규 기능 주입 위치 | 레거시 HTML 후처리(`promoteLegacyUserLayoutToV5`)가 아니라, **셸에 오버레이 마운트 지점**을 추가하고 데이터는 user 스코프 API로 별도 조회. |
| 지출/수입/멤버 색 | `--ab12-neg/-pos/-member-1/-member-2` 시맨틱 토큰 신설 후 **점진적 치환**(한 번에 전량 치환 금지). |

---

## 3. 개선 로드맵 (명세서 Phase 1→4 매핑) + 추론 강도

> 추론 강도(reasoning effort)는 각 단계에서 **기본 권장치**이며, 단계 내 "설계·마이그레이션·정산/중복방지 계산" 구간만 국소적으로 올린다.

### Phase 1 — 코어 안정화 (셸 계승 + 기반 정리)
- 인증·가계부·거래 CRUD·홈/거래/달력·자연어 입력은 **백엔드 기존 존재** → V5 셸 위에서 동작 검증·정리.
- 시맨틱 색상 토큰(`--ab12-neg/pos/member`) 신설 및 홈/거래 뷰부터 점진 치환.
- user 스코프 읽기 API(`/u/api/*`) 골격 정의(권한 재검사 미들웨어).
- **추론 강도: High** (셸 계승 방식·user API 경계·라우트 상태가 여기서 확정).

### Phase 2 — 리포트·예산
- 예산·통계·분석·월마감·정기지출(+자동감지)·가져오기·부부정산: 계산 로직 다수 기존 → 프로토타입 `renderVals()` 셀렉터를 **순수 함수**로 이관.
- **추론 강도: Medium** (반복 패턴. 단 자동감지·정산 계산은 High 스팟).

### Phase 3 — V5 신규 기능 ★핵심 격차
- **통합검색**(Ctrl/Cmd+K 오버레이) → `/u/api/tx/search?q=` 신설(전 기간, 메모·분류·결제수단·멤버·금액 부분일치).
- **알림센터**(6개 규칙 평가) + 홈 예산위험 배너 → `/u/api/notifications`.
- **자산·계좌 + 카드대금 예측**, **저축·목표**(신규 테이블 accounts/goals), **즐겨찾기**(tx.is_favorite), **연간리포트·연말정산**(+PDF), **로딩 스켈레톤/완료 Undo UX**.
- **추론 강도: High** (신규 도메인·파생계산·스키마 마이그레이션. 각 기능은 독립 오버레이/뷰로 격리 추가).

### Phase 4 — 챗봇·정산 고도화
- 카카오 OpenBuilder Skill 자연어 저장(기존 `/skill` 계승) + **external_key 멱등성**(user·ledger·발화해시·시간창) + 예산초과/카드결제일 **푸시**.
- **추론 강도: High** (동시성·중복방지·외부연동 실수 비용 큼).

---

## 4. 다음 착수 증분 (Claude 추천)
가장 안전하면서 V5 격차를 실질적으로 줄이는 첫 기능으로 **통합검색 오버레이(Phase 3의 최소 단위)**를 추천한다:
- 레거시 마크업 무변경(오버레이 신규 마운트) → blast radius 최소.
- 데이터는 신규 user 스코프 `/u/api/tx/search`로 격리 → 기존 admin API 무영향.
- 검증 용이(빈 쿼리·부분일치·금액매칭 케이스).
- 착수 시 추론 강도: **High**(API 경계·권한 재검사 설계), 이후 UI 반복부는 Medium.

> 이 문서는 살아있는 계획서다. 각 증분 완료 시 "잘한 점/약한 점/결정 로그"를 갱신한다.

---

## 5. 진행 로그 (Progress Log)

### V22.8.25 — 통합검색 오버레이 (Phase 3 최소 단위) ✅
- **추가(격리)**: 전역 검색 오버레이(`#abV5Search`, Ctrl/⌘+K) + user 스코프 API `GET /u/api/tx/search?q=&household=`.
- **재사용**: `getScopedHouseholdsForPage`(user 권한 스코프) · `fetchAdminRowsRange`(전 기간) · `attachSpenderNames`(멤버명) · `selectScopedHousehold`.
- **매칭**: 메모·분류·결제수단·raw_text·멤버명 부분일치 + 금액 숫자 포함(2자리 이상). 상위 50건.
- **주입 지점**: 셸 래퍼(`useV22812Shell`)에서 `</body>` 앞에 오버레이+스크립트 1회 주입 → 레거시 마크업 무변경. 결과 렌더는 DOM API(textContent)로 XSS 차단.
- **에셋**: `/assets/accountbook-search-v22825.js`(immutable), 오버레이 CSS는 셸 스타일시트에 병합(경로 v22824→v22825 버전업으로 캐시 버스트).
- **검증**: `node --check` 통과, 매칭 로직·클라이언트 자산 파싱 격리 테스트 통과.
- **약한 점/후속**: 현재 진입점은 키보드(Ctrl/⌘+K) 중심 → **모바일·비단축키 사용자용 가시 트리거(헤더 검색 버튼)** 추가가 즉시 후속. 결과 클릭은 해당 월 `/app?month=...#feed`로 점프(개별 거래 하이라이트는 후속).

### V22.8.26 — 검색 진입 버튼 + 결과 포커스 하이라이트 ✅
- **가시 트리거**: `renderUnifiedNav` 셸 나브에 검색 버튼(`data-abv5-search-open`) 추가 — 데스크톱 사이드바 상단 + 모바일 상단바. 레거시 마크업은 래퍼 span만 추가(구조 무변경). 클릭 → 오버레이 오픈.
- **결과 하이라이트(자기완결형)**: 검색 결과 링크에 `date·abfm(메모)·abfa(금액)` 파라미터를 실어 점프. 목적지에서 검색 에셋이 **메모+금액이 모두 일치하는 첫 행**(`.txRow/.txItem/.timelineItem`)을 폴링(~3.6s)으로 찾아 스크롤·펄스 강조 후 자동 해제. 피드 렌더러 무수정 → 결합 0.
- **판단**: `/app` 피드는 클라이언트 렌더이며 행이 tx id를 노출하지 않아(일자 링크 기반) 진짜 per-tx 하이라이트는 피드 렌더러 개조가 필요. 원칙(격리·최소 blast radius)에 따라 **DOM 텍스트 기반 best-effort 휴리스틱**으로 구현하고, 정밀 앵커링은 별도 증분으로 분리.
- **검증**: `node --check` 통과. Playwright 브라우저 검증 8개 항목 통과(버튼 오픈·Ctrl+K 토글·Esc 닫기·결과 렌더·딥링크·정확 행 하이라이트·오탐 0).

### V22.8.27 — 알림센터 + 홈 예산위험 배너 (Phase 3) ✅
- **API**: `GET /u/api/notifications?household=` — user 세션 스코프. 5개 규칙 평가(생성 순):
  1) 총 예산 초과(danger)/월말초과·85%↑(warn) 2) 분류별 예산 초과 상위 3 3) 미분류 지출 4) 이번 달 반영 대기 정기지출 5) 준비 납부 임박 상위 3.
- **재사용**: `buildBudgetAlertPolishModel`(예산 규칙 1·2·4) · `reserveDashboard`/`reservePlanStatus`(규칙 5) · `isMissingCategory`(규칙 3) · `fetchBudgets`/`fetchRecurring`/`fetchReservePlans`. 신규 계산 로직 최소화.
- **UI**: 나브에 벨 버튼(뱃지) 추가(데스크톱·모바일) + 알림 오버레이 패널. 홈(`/app`)에서 최상위 danger/warn 배너를 fixed 카드로 노출(탭 시 예산 화면 이동).
- **dismiss**: 프로토타입과 동일하게 **localStorage per household**(무스키마). 개별 dismiss → 뱃지·배너 즉시 갱신, 새로고침 후 영속.
- **격리**: 검색과 동일 패턴(오버레이 `</body>` 앞 주입, 전용 JS 에셋, 레거시 마크업 무변경). 결과 렌더는 DOM API(textContent)로 XSS 차단.
- **판단(스키마 없이)**: 명세의 `notif_state` 서버 테이블 대신 프로토타입식 localStorage dismiss 채택 → 무스키마·무마이그레이션. 규칙 6(목표 저축)은 이 레포에 goals 테이블이 없어 정기지출 준비(reserve)로 대체. 카드 결제일(규칙 5 카드 특화)·자동감지(규칙 4 원형)는 후속 증분.
- **검증**: `node --check` 통과. Playwright 13개 항목 통과(벨 오픈·목록/레벨 렌더·dismiss→뱃지·배너 제거·Esc·새로고침 영속·홈 배너 노출·user 스코프 URL).

### V22.8.28 — 즐겨찾기(★) + 검색 통합 (Phase 3) ✅
- **API**: `GET/POST /u/api/favorites?household=` — user 세션 스코프. **스키마 변경 없이** `accountbook_settings` 키-값 저장소에 (가계부·사용자)별 거래 스냅샷 보관(최대 100). POST `{tx}` 추가 / `{id,remove:true}` 제거.
- **재사용**: `getSettingValue`/`saveSettingValue`(reserve_plans와 동일 저장 패턴) · `getScopedHouseholdsForPage`/`selectScopedHousehold`.
- **검색 통합**(명세 §3.15): 검색 결과·즐겨찾기 행에 ★ 토글 버튼, **빈 쿼리 시 즐겨찾기 목록 노출**(헤더 포함). 행을 `<a>`→`div>a+button` 구조로 재편(중첩 anchor/button 무효 회피).
- **판단(스키마 없이)**: 프로토타입은 favIds를 localStorage에 저장했으나, 여기서는 **설정 저장소로 서버 영속**(크로스 디바이스) + 무마이그레이션. 스냅샷 저장으로 빈 쿼리 즐겨찾기 표시 시 tx 재조회 불필요. 레거시 거래목록 행의 ★(명세 §3.2)은 후속 증분.
- **격리**: 신규 API + 기존 검색 오버레이 확장만. 레거시 마크업 무변경.
- **검증**: `node --check` 통과. Playwright 통과(★ 토글 on/off · 서버 저장/제거 · 빈 쿼리 즐겨찾기 목록·헤더 · 상태 반영).

### V22.8.29 — 연간 리포트·연말정산 (Phase 3, §3.12) ✅
- **신규 페이지** `GET /annual?year=YYYY&household_id=` (별칭 `/annual-report`) — user 세션 스코프. budget-alerts/reserve-plans와 동일한 `renderUnifiedNav`+인라인 style 패턴 → 셸·다크모드 자동 참여.
- **재사용**: `fetchAdminRowsRange`(연 단위 전 거래) · `getScopedHouseholdsForPage`/`selectScopedHousehold`.
- **내용**: 연도 네비게이터(미래 연도 비활성) · 연간 수입/지출/저축(적자)·월 평균 · 월별 지출 12칸 막대(당월 강조) · 연간 카테고리 TOP6 · 연말정산 참고(신용카드 15% / 체크·현금·간편결제 30% 안내 + "실제 공제는 국세청 기준" 면책) · PDF(브라우저 인쇄, `@media print`로 내비 숨김).
- **판단**: 자산·계좌(§3.6)는 이미 `/payment-methods`로 구현되어 격차가 아님을 확인 → 진짜 미구현인 연간 리포트를 선택. 레거시 마크업 무변경(신규 라우트+렌더만), 무스키마.
- **검증**: `node --check` 통과. `buildAnnualReportModel` 단위 테스트(수입/지출/저축/월평균/공제 분류/카테고리 TOP) 통과. Playwright 렌더 검증(런타임 에러 0·h1·지표 4·12막대·당월 강조·카테고리·연말정산 2박스·미래연도 비활성·PDF 버튼) 통과 + 스크린샷 확인.

### V22.8.30 — 연간 리포트 진입점(내비) ✅
- `renderUnifiedNav`의 리포트 그룹에 **연간 리포트** 항목 추가(`/annual?year=<현재연도>&household_id=`) → 모든 셸 페이지에서 도달 가능. 연간 페이지 active 키를 `annual`로 맞춰 하이라이트·그룹 open 처리.
- **판단**: 신규 기능은 도달 가능해야 가치가 있다 → 데이터 기반 내비(map)에 한 항목만 추가하는 최소 변경으로 실효성 확보. 레거시 무변경.
- **검증**: `node --check` 통과, 항목 문자열이 형제 항목과 동일 형식(`[key,label,href,icon]`)·`renderUnifiedNav("annual")` 배선 확인.

### V22.8.31 — 저축·목표(§3.7) + 로딩 스켈레톤/토스트·Undo(§3.17) ✅
- **저축·목표**: 신규 V5 네이티브 **클라이언트 렌더 페이지** `/goals`(별칭 `/savings-goals`) + `GET/POST /u/api/goals`(user 스코프). 스키마 없이 `accountbook_settings` 키-값 저장소에 가계부별 목표 보관(최대 50).
  - 전체 진행률(총저축/총목표) · 목표 카드(진행률 바·마감월·남은 개월·월납입 vs 필요 월납입 → 순조/부족/달성) · **원터치 납입**(+월납입) · 추가/삭제. `enrichGoal`로 서버에서 진행률·상태 계산.
- **로딩 스켈레톤/Undo(§3.17)**: 이 목표 서피스에 레퍼런스 구현.
  - **스켈레톤**: 서버가 shimmer 카드 3개를 먼저 렌더 → 클라이언트가 API 응답 후 교체(`prefers-reduced-motion` 대응).
  - **완료 Undo**: 납입/삭제는 **낙관적 업데이트 + 토스트("…했어요 · 실행취소")**, 5초 내 실행취소 시 **서버 커밋 취소**(POST 미발생)·즉시 롤백, 미취소 시 서버 커밋. 다른 액션 시작 시 이전 pending 자동 커밋.
- **판단(무스키마·격리)**: goals 테이블 대신 설정 저장소. 앱 전역 Undo는 레거시 변경 플로우(POST→리다이렉트) 강결합이라 위험 → **V5 네이티브 서피스에서 먼저 실현**하고 레거시 확장은 후속으로 분리. 목표 요소는 셸 토큰(`var(--card)` 등)으로 다크모드 자동 대응.
- **내비**: 자산 그룹에 '저축·목표' 항목 추가.
- **검증**: `node --check` 통과. `normalizeGoal`/`enrichGoal` 단위 테스트(진행률·남은개월·필요월납입·순조/부족/달성) 통과. Playwright: 로드·납입 낙관적+토스트·**Undo 서버 커밋 방지**·5초 후 커밋·추가·삭제·삭제 커밋 전부 통과 + 서버 셸 렌더 스크린샷 확인.

### V22.8.32 — 정기지출 자동감지 알림(§3.4/§3.16 규칙4) ✅
- 알림센터(`/u/api/notifications`)에 **반복 지출 자동감지** 규칙(4b) 추가: 최근 3개월에서 반복된 동일 메모 지출을 감지해 "정기지출로 등록" 딥링크와 함께 알림.
- **판단(중복 방지)**: 구현 중 `detectRecurringCandidates`(+`normalizeRecurringKey`)가 **이미 존재**함을 발견(분석 페이지 `renderRecurringInsightList`로 노출). 내가 새로 만든 중복 정의를 **제거하고 기존 검증 함수를 그대로 재사용** → 진짜 격차였던 "알림센터 노출"만 신규 추가. registered 인자로 기존 정기지출을 제외.
- **검증**: `node --check` 통과. 기존 `detectRecurringCandidates` 재사용 단위 테스트(인터넷 3개월·휴대폰 2개월 감지, 등록분·1회성 제외) 통과.

### V22.8.33 — 거래목록 행 즐겨찾기(★, §3.2) ✅
- 거래 피드 행에 ★ 토글 추가. 검색 오버레이와 **동일한 콘텐츠 기반 키**(`date|type|amount|memo`)로 통일.
- **판단(피드 특성)**: `/app` 피드 데이터는 `window.__INSIGHT__`에 **압축 배열로 주입되며 tx id가 없음**(35KB 홈 성능 최적화). tx id 주입은 성능 역행 → **콘텐츠 키** 채택.
- **격리 설계**: 피드 렌더러에는 **데이터 속성 2개(`data-fav-key`, `data-fav-tx`)만 추가**. ★ 주입·상태·토글 로직은 **분리된 전용 에셋**(`accountbook-favrows`)에서 처리 → 에셋이 실패해도 피드 렌더링 무영향. `MutationObserver`로 비동기 렌더 행까지 강화. 행은 `<a>`이므로 ★는 `<span role=button>`(유효 중첩) + preventDefault/stopPropagation으로 네비 차단.
- 검색 오버레이도 `favKeyOf`로 같은 키를 쓰도록 통일 → 검색·피드 즐겨찾기 상태 교차 일관.
- **검증**: `node --check` 통과. Playwright: ★ 주입(2행)·사전 즐겨찾기 표시·토글 add/remove 서버 반영·행 클릭 네비 차단·MutationObserver 동적행 강화 전부 통과.

---

## 6. Phase 4 조사 결론 (Claude 판단)
- **멱등성(§5): 이미 완전 구현, 명세 초과** → 새로 만들지 않음. 2단계 방어: ① `checkKakaoRepeatGuard`(인메모리, user+대화스코프+발화해시, 8초) ② `findExactDuplicateTransaction`(DB 콘텐츠 정확 일치, 120초, 저장 직전). §5의 external_key 요구를 DB 백엔드로 더 견고하게 달성. 새 컬럼 추가는 중복+게이트된 스키마 마이그레이션이라 부적절.
- **푸시 알림: 범위 외**(사용자 결정) — 카카오 API 유료화 예정 + 외부 연동(채널·Secret·스케줄러·opt-in) 필요. 기록 피드백 메시지로 대체.
- **결론: V5 Phase 1–3 신규 기능 실질 완료.** 남은 것은 제품 결정이 필요한 푸시뿐.

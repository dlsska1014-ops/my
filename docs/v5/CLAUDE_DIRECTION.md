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

# 말해가계부 디자인·UX 개선 작업 지시서 (Claude Code / Codex 전달용)

- 기준 코드: `dlsska1014-ops/my` `main@b25e979` (V22.9.80-FINDINGS-SWEEP)
- 작성일: 2026-10-28
- 이 문서 하나에 다음이 모두 들어 있다:
  1. 앞선 브리프 `DESIGN_UPGRADE_BRIEF.md`의 티켓 전부(UX-01~09, BR-01~03, LIB-01~05, OPT-01~04)
  2. 사용자가 승인한 UX 개선 시안(아이콘·반응·홈·로그인·랜딩·데스크톱)
  - 그래서 이 문서만 넘기면 된다. 옛 ID는 각 티켓 제목 옆에 남겼다.
- 시안과 디자인 시스템은 claude.ai 비공개 아티팩트다. CLI 에이전트는 열 수 없으므로 필요한 값(토큰·팔레트·치수·문구)을 모두 §3에 옮겼다.
- 권장 위치: 저장소의 `docs/ux/MALHAEBOOK_UX_WORK_ORDER.md`로 커밋한 뒤 §10의 단계별 프롬프트로 지시한다.

---

## 0. 사람이 쓰는 법

1. 이 파일을 저장소 `docs/ux/`에 넣는다.
2. §10의 "1단계 프롬프트"를 Claude Code 또는 Codex에 그대로 붙여 넣는다.
3. 단계가 끝나면 에이전트 보고(검증 결과, 체크섬 수, 수동 확인 항목)를 확인한다. 실제 기기에서 확인한 뒤 다음 단계 프롬프트를 넣는다.
4. §6의 결정 D-1·D-3·D-4는 해당 단계 전에 답을 정해 둔다.

---

## 1. 에이전트 작업 규칙 (모든 티켓 공통)

이 문서는 작업 목록이다. 저장소 규칙은 `AGENTS.md`가 우선하며, 어긋나면 `AGENTS.md`를 따르고 보고한다.

1. **시작 전에 읽을 것:** `VERSION.txt`, `docs/STATUS.md`, `docs/ux/UX_PRINCIPLES_BRUNCH_110_PROJECT_MEMORY.md`
2. **수정 위치와 빌드:**
   - `src/modules/`에서만 고친다.
   - `npm run build:worker`로 `src/index.js`를 다시 만들어 함께 커밋한다. `src/index.js`는 직접 고치지 않는다.
3. **홈 HTML 예산:**
   - 예산은 35 KiB(35,840B)다(`validation/validate-performance-v22811.mjs:235`).
   - QA 픽스처 `/app?month=2026-07&household_id=house-home` 실측이 34,988B라 **여유는 약 0.85KB**다.
   - 실사용 예산 44KB(200행)도 있다.
   - 홈 마크업을 늘리는 변경은 티켓마다 바이트를 재고 보고한다.
   - 아이콘·스타일·모션은 캐시되는 버전 자산(CSS/JS)에 넣는다.
4. **정적 자산 판:**
   - 자산 바이트가 바뀌면 주소의 판 번호를 올린다(`accountbook-shell-v22979.css` → `-v22981.css` 등).
   - 옛 주소는 `src/modules/assets/historical-runtime-assets.js`에 옛 바이트로 남긴다(`mobile-v81-css.js` 머리 주석의 관례).
5. **외부 CDN을 런타임에 참조하지 않는다.** 카카오톡 인앱 브라우저에서 외부 도메인이 막힐 수 있다. 라이브러리는 `tools/bundle-number-flow.mjs` 선례대로 원본을 한 파일로 담아 버전 주소로 내려보내고, `import()`로 늦게 부른다. 원본 버전과 SHA-256은 검증에 고정한다.
6. **CSP는 바꾸지 않는다**(바꾸려면 사용자 승인). 현재 `font-src 'self' data:`이고 `'wasm-unsafe-eval'`이 없다.
7. **보호 화면과 해시:**
   - 분석 화면은 바꾸지 않는다.
   - 홈 렌더러를 바꾸면 해시 검증이 실패한다. `validation/lib-audit-v22934.mjs`의 `before*` 역변환 관례로 이번 변경만 되돌려 비교하고, 사유를 검증 파일에 남긴다.
8. **클라이언트 코드:**
   - 새로 쓰는 클라이언트 코드는 실제 함수로 만들고 `.toString()`으로 직렬화한다.
   - Worker 최상위 이름을 그 함수 안에 새로 쓰지 않는다(AGENTS.md).
   - `renderMobileV81Html` 인라인 스크립트 안의 정규식 백슬래시는 이중으로 쓴다.
9. **검증:**
   - 티켓마다 관련 `npm run validate:*`를 실행한다.
   - 단계 끝에 `node .codex/scripts/verify-repository.mjs`와 `npm run validate:categories-absent`를 실행한다.
   - 화면이 바뀌면 `node tools/screen-audit.mjs --pages home --schemes light,dark --shots`를 돌려 전후 스크린샷을 PR 설명에 붙인다(스크린샷은 커밋하지 않는다).
10. **새 검증 파일:** `validation/validate-design-uplift-v22981.mjs`(판마다 새 파일 또는 같은 파일 확장)를 만들고, `package.json`에 `validate:design-uplift`를 등록한다.
11. **한 단계 = 한 판 = 한 PR**이다. 바꾼 내용은 `CHANGELOG.md`, `docs/STATUS.md`, `VERSION.txt` 관례대로 기록한다. 운영 배포·SQL·외부 콘솔은 사용자 승인 없이 하지 않는다.

---

## 2. 무엇을 만드는가 (완료 그림)

시안 화면은 6개다. 아래가 최종 모습이다.

- **모바일 홈 (390×844)**
  - 상단 바: 가계부 이름 한 번 + `‹ 10월 ›` 월 이동 + 금액 가리기 눈
  - 예산 카드:
    - 대표 금액 34px
    - 게이지(오늘 위치 세로 막대)
    - "전체/지출" 한 줄
    - 속도 문장 "이번 달의 39%가 지났고 예산은 20%만 썼어요. 하루 49,070원씩 쓰면 돼요."
  - "한 줄로 기록하기" 입력 바: 누르면 빠른 입력 시트가 열린다.
  - 들어온 돈(초록) / 나간 돈(본문색) 2칸
  - 최근 내역: 카테고리 아이콘 동그라미 + 제목 + "날짜 · 결제수단 · 사람" + 금액
  - 하단 5탭: 활성 탭에 옅은 알약 배경, 가운데 ＋ 원형 버튼
- **빠른 입력 시트**
  - 손잡이, 제목 "빠른 입력", 닫기
  - 지출/수입 세그먼트
  - 금액(24px 굵게, "원" 접미)
  - 내용
  - 자주 쓰는 내용 칩(아이콘 + 라벨, 선택 시 옅은 면)
  - "날짜·결제수단·사람" 접기 줄
  - 미리보기 문장 "저장하면 남는 예산 969,400원 · 하루 48,470원"
  - `기록 저장`(입력 전 비활성 → 저장 중… → 닫힘)
- **저장 뒤**
  - 아래에서 올라오는 알림: "기록을 저장했습니다 / 남은 예산 … · 하루 …" + 실행 취소
  - 새 행이 맨 위에 1.8초 강조된다.
  - 게이지가 새 값까지 채워진다.
- **시작·로그인 (`/my`)**
  - 로고 → `/`
  - 짧은 제목
  - **카카오 로그인**(첫 화면)
  - "로그인 이름으로 로그인"(펼침 폼, 칸 아래 오류 문구)
  - "처음이신가요? 새 계정 만들기", "먼저 둘러보기"
  - 아래에 "카톡 한 줄 → 웹 기록" 예시
- **공개 랜딩 (모바일)**
  - 앱과 같은 파란 장부 로고
  - 히어로 + 주 버튼 "내 가계부 시작하기"
  - 실제 앱 화면 미리보기(가상 데이터)
  - 세 걸음 설명
  - 공동 가계부·정산 안내
  - 알아 둘 점
  - 카카오 로그인 띠
- **데스크톱 홈 (1280)**
  - 접히는 사이드바(252 ↔ 72px)
  - 본문 머리에 제목 + 월 이동 + 오른쪽 아이콘 버튼(알림·화면 설정·금액 가리기)
  - 왼쪽: 예산 카드 + KPI 3칸(들어온 돈·나간 돈·하루에 쓸 수 있는 돈) + 최근 내역 표
  - 오른쪽: 빠른 입력 카드
  - 오른쪽 아래: "빠른 입력" 버튼 하나. 아래로 스크롤하면 원형으로 줄어든다.
  - 떠 있던 4버튼 독은 없앤다.
- **아이콘 체계와 상태 규칙:** §3-2 ~ §3-6

---

## 3. 디자인 명세

### 3-1. 기존 토큰 (`src/modules/assets/accountbook-shell-css.js` 12–35행, 그대로 쓴다)

| 토큰 | 라이트(블루) | 다크(블루) | 쓰는 곳 |
|---|---|---|---|
| `--ab12-bg` | #f2f4f6 | #141519 | 바탕 |
| `--ab12-surface` | #ffffff | #1e2026 | 카드·시트·탭 바 |
| `--ab12-surface-raised` | #f4f6f8 | #282b33 | 세그먼트 트랙·보조 면 |
| `--ab12-text` | #191f28 | #edeff3 | 본문, **지출 금액** |
| `--ab12-muted` | #5f6b7a | #b3bdc9 | 라벨·날짜 |
| `--ab12-line` | #e9ebee | #3b475a | 테두리 |
| `--ab12-brand` | #3182f6 | #4e96fa | 로고 면(흰 글자 금지) |
| `--ab12-accent` | #1d4ed8 | #93c5fd | 링크·선택 글자·테두리 |
| `--ab12-action` | #1d4ed8 | #2563eb | 화면당 하나뿐인 주 버튼, ＋ |
| `--ab12-accent-soft` | #e8f3ff | #1d2c42 | 선택 면·안내 면 |
| `--ab12-nav-inactive` | #475569 | #cbd5e1 | 비활성 탭·세그먼트 글자 |
| `--ab12-placeholder` | #52606f | #cbd5e1 | placeholder |
| `--pos` | #087a55 | #6ee7b7 | **수입 금액** |
| `--ab12-gauge-warn` / `--ab12-gauge-over` | #c2410c / #b91c1c | #fbbf24 / #f87171 | 게이지 주의/초과 |
| `--ab12-warn-*` | #fff7ed / #9a3412 / #fed7aa | #49351a / #fcd34d / #765b26 | 경고 상자 |

- 톤(emerald·violet·amber)은 `brand`·`accent`·`action`·`accent-soft` 넷만 바꾼다(같은 파일 29–35행).
- 간격은 `--ab12-sp-1…6`(4/8/12/16/24/32)이다.
- 모서리는 `--ab12-r-sm/md/lg`(8/12/16)와 `--ab12-radius`(20)다.
- 모션은 `--ab12-dur` 180ms, `-fast` 120ms, `-slow` 320ms, `-gauge` 620ms이고, ease는 `cubic-bezier(.2,.8,.2,1)`이다.

### 3-2. **신규** 카테고리 팔레트 토큰 (셸 CSS에 추가, 톤과 무관)

아이콘 잉크는 동그라미 바탕 대비 라이트 최소 4.48:1(육아), 다크 최소 6.98:1(구독)로 확인했다.

```css
/* V22.9.81 카테고리 동그라미: 바탕(--ab12-cat-<키>-bg)과 아이콘 잉크(--ab12-cat-<키>-ink). 톤 선택자에 넣지 않는다. */
body.abV22812Shell{
--ab12-cat-food-bg:#fff1e6;--ab12-cat-food-ink:#c2410c;
--ab12-cat-cafe-bg:#f8efe2;--ab12-cat-cafe-ink:#8a4b0f;
--ab12-cat-transport-bg:#e8f1ff;--ab12-cat-transport-ink:#1d4ed8;
--ab12-cat-grocery-bg:#e6f6ee;--ab12-cat-grocery-ink:#047857;
--ab12-cat-shopping-bg:#f1ecff;--ab12-cat-shopping-ink:#6d28d9;
--ab12-cat-medical-bg:#ffecef;--ab12-cat-medical-ink:#be123c;
--ab12-cat-housing-bg:#e2f5f3;--ab12-cat-housing-ink:#0f766e;
--ab12-cat-utility-bg:#fdf5d6;--ab12-cat-utility-ink:#854d0e;
--ab12-cat-sub-bg:#eceffe;--ab12-cat-sub-ink:#4338ca;
--ab12-cat-culture-bg:#fdeaf4;--ab12-cat-culture-ink:#be185d;
--ab12-cat-goods-bg:#e1f3f9;--ab12-cat-goods-ink:#0e7490;
--ab12-cat-baby-bg:#edf6dd;--ab12-cat-baby-ink:#4d7c0f;
--ab12-cat-gift-bg:#feecea;--ab12-cat-gift-ink:#b91c1c;
--ab12-cat-income-bg:#e2f4ec;--ab12-cat-income-ink:#087a55;
--ab12-cat-etc-bg:#eef1f4;--ab12-cat-etc-ink:#5f6b7a}
html[data-ab-resolved-theme="dark"] body.abV22812Shell{
--ab12-cat-food-bg:#3a2516;--ab12-cat-food-ink:#fdba74;
--ab12-cat-cafe-bg:#352a1b;--ab12-cat-cafe-ink:#f5c98a;
--ab12-cat-transport-bg:#1d2c42;--ab12-cat-transport-ink:#93c5fd;
--ab12-cat-grocery-bg:#143328;--ab12-cat-grocery-ink:#6ee7b7;
--ab12-cat-shopping-bg:#2d2447;--ab12-cat-shopping-ink:#c4b5fd;
--ab12-cat-medical-bg:#3d1d26;--ab12-cat-medical-ink:#fda4af;
--ab12-cat-housing-bg:#123532;--ab12-cat-housing-ink:#5eead4;
--ab12-cat-utility-bg:#372f12;--ab12-cat-utility-ink:#fde047;
--ab12-cat-sub-bg:#252a4a;--ab12-cat-sub-ink:#a5b4fc;
--ab12-cat-culture-bg:#3c1d30;--ab12-cat-culture-ink:#f9a8d4;
--ab12-cat-goods-bg:#123340;--ab12-cat-goods-ink:#67e8f9;
--ab12-cat-baby-bg:#25331a;--ab12-cat-baby-ink:#bef264;
--ab12-cat-gift-bg:#3d1d1d;--ab12-cat-gift-ink:#fca5a5;
--ab12-cat-income-bg:#143328;--ab12-cat-income-ink:#6ee7b7;
--ab12-cat-etc-bg:#2a2e36;--ab12-cat-etc-ink:#cbd5e1}
```

### 3-3. 카테고리 키·아이콘·판정 규칙

판정 단어는 `src/modules/web/quick-chip-icons.js`의 `QUICK_CHIP_ICON_RULES`와 `categoryInitial()`에서 그대로 가져왔다.
- 순서 규칙은 지금과 같다: 표의 아래쪽 행일수록 우선한다(`QUICK_CHIP_ICON_RULES`처럼 뒤 규칙이 이긴다).
- `type === "income"`이면 무조건 `income`이다.
- 아무 단어에도 맞지 않으면 `etc`다.

| 키 | 표시 이름 | Lucide 아이콘 | 판정 단어 |
|---|---|---|---|
| `gift` | 경조사·선물 | `gift` | 경조사 축의금 부의금 선물 생일 |
| `goods` | 생활용품 | `sparkles` | 생활용품 다이소 세제 휴지 청소 |
| `baby` | 육아 | `baby` | 육아 어린이 유아 아기 키즈 장난감 |
| `culture` | 문화·여가 | `ticket` | 문화 영화 여행 공연 취미 운동 게임 |
| `sub` | 구독 | `tv` | 구독 넷플릭스 유튜브 멤버십 티빙 웨이브 |
| `utility` | 공과금·세금 | `zap` | 공과금 통신 전기 가스 수도 요금 인터넷 보험 세금 재산세 자동차세 |
| `housing` | 주거 | `house` | 주거 월세 전세 관리비 임대 |
| `shopping` | 쇼핑 | `package` | 쿠팡 쇼핑 의류 택배 주문 온라인 |
| `transport` | 교통 | `bus` | 교통 택시 버스 지하철 기차 주유 주차 차량 |
| `medical` | 의료 | `heart-pulse` | 의료 병원 약국 약 진료 치과 |
| `food` | 식비 | `utensils` | 식비 점심 저녁 아침 식사 외식 식당 배달 분식 밥 |
| `grocery` | 장보기 | `shopping-cart` | 마트 장보기 시장 식자재 |
| `cafe` | 카페/간식 | `coffee` | 커피 카페 간식 디저트 빵 |
| `income` | 수입 | `banknote` | (수입 거래) 월급 급여 상여 수입 입금 |
| `etc` | 기타 | `circle-ellipsis` | (맞는 단어 없음) |

- **메뉴 선 아이콘**은 지금 `nav-search-notif-mains.js`의 `iconSvg()` 26개 이름을 유지한다. 원본은 lucide-static에서 가져오고, 선 1.8, 메뉴 20px, 하단 탭 22px, 가운데 ＋ 26px(선 2.2)로 둔다.
- **이모지 → 아이콘(웹 화면만):**
  - 무지출 불꽃 → `flame`
  - 캘린더 접기 달력 → `calendar`
  - SMART NOTICE 장식 그래프 → 삭제(§T-12에서 카드 통합)
  - 웹 예산 경고의 경고 이모지 → `triangle-alert`
  - 카카오톡 메시지 속 이모지는 그대로 둔다.

### 3-4. 컴포넌트 치수

| 컴포넌트 | 명세 |
|---|---|
| 카테고리 동그라미 | 거래 행 42px(아이콘 21), 칩 32px(17), KPI 머리 26px(15). 이름은 항상 옆에 둔다. |
| 칩 | 높이 ≥44px, 모서리 999px, 패딩 `0 14px 0 6px`, gap 6. 기본은 `surface` 면 + `line` 테두리 + `text` 600. 선택은 `accent-soft` 면 + `accent` 테두리·글자 800. `aria-pressed`를 쓴다. |
| 세그먼트 | 트랙 `surface-raised`, 패딩 4, 모서리 14. 칸 높이 44, 모서리 11. 선택 칸은 `surface` 면 + `accent` 테두리·글자 800 + 카드 그림자. 비선택 칸은 투명 면 + `nav-inactive` 글자. 라이트·다크 같은 규칙이다. |
| 주 버튼 | 높이 54(모바일)/50(데스크톱), 모서리 14/12, `action` 면, 흰 글자 800. 비활성은 `surface-raised` 면 + `muted` 글자. 진행은 회전 아이콘 + "저장 중…". |
| 입력 | 높이 52, 모서리 14, `line` 테두리. 초점 시 `accent` 테두리 + `accent-soft` 3px 링. 금액 칸은 24px 800, 오른쪽 "원". |
| 바텀시트 | 모서리 `24px 24px 0 0`, 손잡이 40×5, 패딩 `8px 20px 20px`, 최대 높이 90%. 뒤 막은 라이트 `rgba(17,24,39,.42)` / 다크 `rgba(0,0,0,.6)`. `role="dialog" aria-modal="true"`, Escape로 닫는다. |
| 알림(토스트) | 화면 아래(탭 바 위 84px), 모서리 16. 라이트는 면 #191f28 / 글자 #fff / 보조 #d1d5db / 버튼 #93c5fd. 다크는 면 #edeff3 / 글자 #141519 / 보조 #374151 / 버튼 #1d4ed8. 왼쪽 34px 표시 원: 성공 #087a55 체크, 경고 #c2410c 삼각, 오류 #b91c1c 느낌표. 문구로도 구분한다. |
| 예산 게이지 | 높이 12, 모서리 999. 채움은 `accent` / 85% 이상 `gauge-warn` / 100% 이상 `gauge-over`. 오늘 표시는 2px × (높이+10) `text` 색 세로 막대(이번 달에만). |
| 하단 탭 바 | 높이 72, 5칸. 탭 높이 ≥52, 라벨 11px. 활성은 아이콘 뒤 48×30 `accent-soft` 알약 + `accent` 글자 800. 가운데 ＋는 52px 원 `action`, 위로 22px 솟음, 떠 있는 그림자. |
| 데스크톱 상단 버튼 | 44×44, 모서리 12, `line` 테두리. 알림 배지는 18px 원 #c0362c 흰 글자. |
| 빠른 입력 FAB(데스크톱) | 높이 56, 모서리 999, `action` 면. 펼침은 "＋ 빠른 입력", 아래로 스크롤하면 56×56 원(220ms). |
| 카카오 로그인 | 면 #FEE500, 심볼 #000000, 라벨 `rgba(0,0,0,.85)`, 모서리 12, 높이 54, 라벨 "카카오 로그인"(카카오 로그인 디자인 가이드) |

### 3-5. 반응(모션) 규칙

| 무엇 | 시간 | 모양 |
|---|---|---|
| 누름(버튼·칩·탭·행) | 120ms | `transform: scale(.97)` 후 복귀 |
| 색·선택 바뀜 | 180ms | 면·테두리·글자가 함께 바뀐다 |
| 시트·알림 등장 | 260ms | 아래에서 16px 올라오며 나타남. 뒤 막은 180ms 페이드 |
| 게이지 채움 | 620ms | 저장 뒤 새 값까지 |
| 새 행 강조 | 1.8s | `accent-soft` → 투명 |
| 움직임 줄이기 | 0 | `@media (prefers-reduced-motion: reduce)`에서 위 전부 끈다 |

곡선은 모두 `--ab12-ease`(`cubic-bezier(.2,.8,.2,1)`)다. 키보드 초점은 `accent` 3px 실선, 간격 2–3px이다.

### 3-6. 문구

- **속도 문장(예산 카드, 이번 달):**
  - `사용률 ≤ 경과율`: "이번 달의 {경과}%가 지났고 예산은 {사용}%만 썼어요. 하루 {하루}원씩 쓰면 돼요."
  - `경과율 < 사용률 < 100`: "이번 달의 {경과}%가 지났는데 예산은 {사용}%를 썼어요. 남은 {남은 일수}일은 하루 {하루}원 안에서 써 보세요."
  - `사용률 ≥ 100`: "예산을 {초과}원 넘었어요. 예산을 늘리거나 남은 기간 지출을 줄여 보세요."
  - 경과율은 KST 오늘 ÷ 그 달 일수다. 하루 금액은 기존 `dailyAllowanceAmt` 계산(`mobile-home.js`)을 그대로 쓴다.
  - 지난달을 볼 때는 문장 대신 기존 "지난달 보는 중" 배지 흐름을 따르고, 오늘 표시는 그리지 않는다.
  - 예산이 없으면 지금처럼 "예산을 설정하면 하루 기준이 생겨요" 링크를 둔다.
- **미리보기(시트):**
  - 지출: "저장하면 남는 예산 {남음}원 · 하루 {하루}원"
  - 수입: "저장하면 이번 달 수입이 {합계}원이 돼요"
  - 금액 전: "금액을 넣으면 저장 뒤 남는 예산을 미리 보여드려요"
- **알림:** 제목은 지금 서버 문구를 유지한다(`mobile-home.js:564–570`): "기록을 저장했습니다" / "기록을 저장했고 예산을 확인해야 합니다" / "요청을 완료하지 못했습니다". 버튼은 각각 `실행 취소` / `예산 보기` / `다시 시도`다.
- **빈 상태:** "아직 이번 달 기록이 없어요" + "카카오톡에 "점심 만원"처럼 보내거나 여기서 바로 적어 보세요." + 버튼 `첫 기록 남기기`
- **모든 문장 규칙:**
  - 해요체 안내, 합니다체 결과 보고
  - 버튼은 결과 동사
  - 금액은 천 단위 쉼표 + "원"
  - 수입 `+`, 지출 `-`

---

## 4. 단계 한눈에

| 단계 | 판(예) | 티켓 | 성격 |
|---|---|---|---|
| 1 | V22.9.81 | T-01 ~ T-07 | CSS·JS 몇 줄: 칩, 세그먼트, 읽기 이름, 다크 테두리, 금액 색, 줄바꿈, 누름 반응 |
| 2 | V22.9.82 | T-08 ~ T-10 | 감사 도구 확장, 카테고리 판정·팔레트, 아이콘 파이프라인 |
| 3 | V22.9.83 | T-11 ~ T-18 | 모바일 홈·빠른 입력·저장 반응·탭 바·빈 상태 |
| 4 | V22.9.84 | T-19 ~ T-23 | 데스크톱, `/my` 로그인, 공개 랜딩, OG 이미지, 글꼴 |
| 5 | 판마다 | T-24 ~ T-25 | CSS 계층 정리, (필요 시) 모션 라이브러리 |
| 선택 | — | T-26 ~ T-29 | 랜딩 셰이더, 소개 영상, 디자인 운영, 에이전트 지침 |

각 단계는 앞 단계의 감사 결과가 통과한 뒤 시작한다.

---

## 5. 티켓

형식: 문제 → 근거 → 변경 → 수용 기준 → 검증. 행 번호는 `main@b25e979` 소스 모듈 기준이다.

### 1단계

#### T-01 빠른 입력 칩: 주 버튼처럼 채워지지 않게 + 새 칩 모양 (옛 UX-01)

- **문제:** 칩 5개가 `기록 저장`과 같은 `--ab12-action` 채움이다. 주 행동이 하나가 아니고, 선택 상태도 보이지 않는다.
- **근거:**
  - `accountbook-shell-css.js:51`과 `:160`의 `:is(… .form button:not(.danger) …){background:var(--ab12-action)!important}`가 폼 안 모든 버튼에 닿는다.
  - 칩 규칙(`:243`, `#add .chipRow button`)은 `!important`가 없어 진다.
- **변경:**
  - 51·160행의 `.form button:not(.danger)`를 `.form button[type="submit"]:not(.danger)`로 좁힌다.
  - `grep -rn 'class="form"' src/modules`로 다른 화면에서 채움이 필요했던 `type="button"`을 확인하고, 있으면 명시 클래스를 준다.
  - `:243` 칩 규칙을 §3-4 칩 명세로 바꾼다. 선택은 `[aria-pressed="true"]`와 `.isOn`이다.
  - 칩을 누르면 `aria-pressed`를 토글하는 처리를 빠른 입력 스크립트에 넣는다(이미 있으면 확인만 한다).
- **수용 기준:**
  - 라이트·다크 8테마에서 기본 칩은 `surface` 면 + `line` 테두리다.
  - 선택 칩은 `accent-soft` 면 + `accent` 테두리·글자다.
  - `기록 저장`은 그대로다.
  - 칩 높이 ≥44px다.
- **검증:** `validate:ux-principles`, `validate:v5`, `validate:polish`, screen-audit

#### T-02 지출/수입 세그먼트: 다크에서도 선택이 보이게 + 트랙형 (옛 UX-02)

- **문제:** 다크에서 고른 칸과 안 고른 칸의 면·테두리가 같다(#282b33 / #3b475a). 글자만 다르고(#93c5fd 대 #edeff3), 안 고른 쪽이 더 밝다.
- **근거:**
  - `accountbook-shell-css.js:79`가 다크에서 `.seg span`을 `surface-raised`로 덮는다.
  - `:89`는 다크에서 글자색만 준다.
  - V22811 바탕 규칙(`asset-registry.js:155`)에 리터럴 `#1b64da`·`#b7d8ff`가 남아 있다.
- **변경:**
  - §3-4 세그먼트 명세로 바꾼다. `.seg`는 트랙, `.seg input:checked+span`은 `surface` 면 + `accent` 테두리·글자 + 그림자, 비선택은 투명 면 + `nav-inactive`다.
  - 다크 `:79` 목록에서 `.seg span`을 빼고 `:89`에 면·테두리를 더한다.
  - `asset-registry.js:155`의 리터럴은 토큰으로 바꾼다.
- **수용 기준:**
  - 8테마 모두 선택 칸과 비선택 칸의 면이 다르다.
  - 선택 테두리 대비 ≥3:1, 선택 글자 ≥4.5:1이다.
- **검증:** T-08의 "선택 상태 구분" 검사, screen-audit dark

#### T-03 거래 행 스크린리더 이름 (옛 UX-03)

- **문제:** "가족 카페2026-07-09 · 카페/간식 · 카카오페이지출자 Bin-28,600원수정·삭제 상세 보기"처럼 붙어 읽힌다.
- **근거:** `src/modules/client/v5-bundle-mains.js:1340`이 `main.textContent`를 그대로 이름으로 쓴다.
- **변경:**
  - `summary.v8-tx-main`의 `b`, `span`, `span.v8-spender`, `strong`을 각각 읽어 `", "`로 잇는다.
  - 끝에 "수정·삭제 상세 보기"를 한 번 붙인다.
- **수용 기준:** "가족 카페, 2026-07-09 · 카페/간식 · 카카오페이, 지출자 Bin, -28,600원, 수정·삭제 상세 보기"
- **검증:** `validate:client-serialization`, `validate:v5`, 새 검증에 픽스처 DOM 문자열 검사

#### T-04 다크 빠른 입력 패널 테두리 (옛 UX-04)

- **근거:** `src/modules/assets/mobile-v81-css.js:47` `#add.panel{border:1px solid #e8edf4!important}`(id 선택자라 다크 규칙을 이긴다). `:16`의 `#dbe7f4`도 같다.
- **변경:** 리터럴을 `var(--ab12-line,#e8edf4)`로 바꾼다. 홈 CSS 자산 주소(`asset-registry.js:10` `mobile-home-v22979.css`)의 판을 올리고 옛 바이트를 보존한다.
- **수용 기준:** 다크에서 `#add`와 `#feed` 테두리 계산값이 같다.
- **검증:** `validate:performance`, screen-audit dark

#### T-05 금액 색: 수입 초록, 지출 본문색 (옛 UX-05, 시안 규칙으로 갱신)

- **문제:** KPI "들어온 돈 / 나간 돈"이 라이트에서는 둘 다 #191f28이고, 다크에서는 초록 / 빨강이다.
- **근거:**
  - `accountbook-shell-css.js:590` `.abV5KpiGrid :is(.kpi,.metric,.homeMetric)>b{…color:var(--text)!important}`
  - 다크 `.income`·`.expense` 색 규칙
- **변경:**
  - KPI와 거래 행 금액에서 수입은 `--pos`, 지출은 `--ab12-text`로 맞춘다(8테마 같음).
  - 빨강(`--neg`, `--ab12-gauge-over`)은 초과·오류에만 쓴다.
- **수용 기준:** 8테마에서 수입 `--pos`, 지출 `--ab12-text`다. 둘 다 `surface` 위 ≥4.5:1이다.
- **검증:** `validate:report-dashboard`, screen-audit

#### T-06 한국어 줄바꿈 (옛 UX-06)

- **문제:** "카카/오페이", "바로 이/어서"처럼 낱말 중간에서 끊긴다.
- **변경:**
  - 셸 본문 규칙(`accountbook-shell-css.js:351–353`)에 `word-break:keep-all;overflow-wrap:anywhere`를 더한다.
  - 공개 페이지 CSS(`src/modules/public/content-pages.js:121` 부근)와 로그인 화면 CSS(`src/modules/web/login-page-side-nav.js`)에도 같은 규칙을 둔다. 표는 넘침이 없는지 확인한다.
- **수용 기준:** 390px에서 홈·`/my`·공개 첫 화면에 낱말 중간 줄바꿈이 없고, 가로 넘침은 0이다.
- **검증:** screen-audit, `validate:public-articles`

#### T-07 누름 반응·전환 공통 규칙 (시안)

- **변경:** 셸 CSS에 다음을 둔다.
  - 공통 반응 규칙: `button, .chip, .abNavBottom a, .v8-tx-main, a.btn`에 `transition: transform var(--ab12-dur-fast) var(--ab12-ease), background-color var(--ab12-dur) var(--ab12-ease), border-color …, color …`
  - `:active{transform:scale(.97)}`
  - `prefers-reduced-motion: reduce`에서 모두 끈다.
  - 초점 링은 `accent` 3px다(이미 있는 규칙과 합친다).
- **수용 기준:** 모바일에서 누를 때 즉시 줄어든다. 움직임 줄이기 설정에서는 변화가 없다. 홈 HTML 바이트는 늘지 않는다.
- **검증:** `validate:ui-perf`, `validate:startup-budget`

### 2단계

#### T-08 화면 감사 확장 (옛 LIB-05, 2단계 첫 작업)

- **변경(`tools/screen-audit.mjs`):**
  - `--width 1280` 데스크톱 모드를 추가한다.
  - `--tones blue,emerald,violet,amber` 순회(`data-ab-tone`)를 추가한다.
  - **선택 상태 구분 검사**를 추가한다: `[aria-pressed=true]`, `:checked+span`, `[aria-current]`, `.active` 요소와 같은 그룹 비선택 형제의 면 또는 테두리 대비가 3:1 미만이면 실패다.
  - **고정 요소 겹침 보고**를 추가한다: `position:fixed`가 글자 노드를 덮는 비율. 실패로 치지 않는다.
  - **테마 전환 대기:** 테마를 바꾼 뒤 `--ab12-dur`(180ms) 이상 기다린 뒤 잰다. 바로 재면 이전 테마 색이 나온다.
- **수용 기준:** 수정 전 코드(T-02 전)에서 다크 세그먼트를 잡아내고, 수정 후 통과한다.

#### T-09 카테고리 판정 공용화 + 팔레트 토큰 (시안)

- **문제:** 카테고리 표시가 이니셜 글자(`categoryInitial()`, `quick-chip-icons.js:11`)다. 판정 규칙이 이니셜용과 칩 이모지용(`QUICK_CHIP_ICON_RULES`) 둘로 나뉘어 있다.
- **변경:**
  1. `quick-chip-icons.js`에 `categoryKey(category, type, memo)`를 만든다. §3-3 표를 그대로 쓰고, 반환값은 15개 키 중 하나다. `categoryInitial()`은 호출하는 곳을 옮긴 뒤 지운다(죽은 코드로 남기지 않는다).
  2. 같은 규칙을 클라이언트에서도 쓸 수 있게 실제 함수로 만들어 `.toString()` 직렬화 자산에 싣는다. 판정 표는 한 곳에서 생성한다.
  3. §3-2 팔레트 토큰을 셸 CSS에 더한다.
- **수용 기준:**
  - 단위 검사: 점심→food, 커피→cafe, 쿠팡→shopping, 병원→medical, 마트→grocery, 주유→transport, 관리비→housing, 자동차세→utility, 수입 거래→income, "알 수 없음"→etc
  - 서버·클라이언트 판정이 같다.
- **검증:** 새 `validate:design-uplift`, `validate:client-serialization`

#### T-10 아이콘 파이프라인: Lucide + SVGO + 이모지 교체 (옛 LIB-01)

- **변경:**
  1. `tools/build-icons.mjs`를 새로 만든다.
     - `lucide-static`(고정 버전, 원본을 받는 방법과 SHA-256을 스크립트 머리에 기록) SVG를 읽는다.
     - SVGO(고정 버전)로 path만 남긴다.
     - 결과를 `src/modules/assets/icon-paths.js`로 생성한다.
     - ISC 표기를 단다.
  2. 메뉴 26개(`nav-search-notif-mains.js` `iconSvg()`)는 이름을 유지하고 생성 파일을 읽게 한다.
  3. **카테고리 15개는 CSS 마스크 자산으로 둔다.**
     - `.abCatIcon[data-ck="food"]{-webkit-mask:url("data:image/svg+xml,…") center/60% no-repeat;mask:…;background:var(--ab12-cat-food-ink)}`
     - 동그라미는 `.abCat[data-ck]{background:var(--ab12-cat-<키>-bg)}`
     - 홈 HTML에 SVG를 넣지 않는다.
  4. 이모지 교체(§3-3): `report-challenge.js:368`(🔥), `mobile-home.js:390`(📅), `mobile-v81-css.js`의 `.homeNotice:after`(📊)
- **수용 기준:**
  - 아이콘 원본이 생성 파일 하나다.
  - 홈 HTML 바이트가 늘지 않는다.
  - 8테마에서 아이콘 잉크 대비 ≥3:1이다.
- **검증:** `validate:performance`, `validate:build-identity`, screen-audit

### 3단계 — 모바일 홈·빠른 입력

#### T-11 모바일 홈 머리말: 이름은 한 번만 (옛 UX-08)

- **문제:** 390px에서 상단 바와 머리말 선택 상자에 "우리집 생활비"가 두 번 나온다. 첫 화면 약 190px을 쓴다.
- **근거:** `src/modules/my/mobile-home.js:593`(`header.appTop`: `h1.srOnly` + `select[name=household_id]` + `input[type=month]`), 상단 바(`unified-nav.js` `abNavMobileTop`)
- **변경:**
  - 모바일(≤899px)에서는 가계부 전환을 상단 바 이름 버튼("우리집 생활비 ⌄")에서 연다.
    - 기존 `select`를 시트/드롭다운으로 감싸 쓴다.
    - JS가 없으면 지금 `select`가 그대로 보이게 한다.
  - 머리말에는 `‹ 10월 ›` 월 이동 한 줄만 둔다. 기존 `input[type=month]` 제출 흐름을 유지한다.
  - 데스크톱은 §T-19를 따른다.
- **수용 기준:**
  - 390×844 첫 화면에 예산 카드의 대표 금액·게이지·속도 문장이 보인다.
  - 이름은 한 번만 보인다.
  - 홈 HTML ≤35 KiB다.
- **검증:** `validate:performance`, `validate:home-rail-challenge`, `validate:v5`, 렌더러 해시 갱신(사유 기록)

#### T-12 예산 카드: 오늘 표시 + 속도 문장 + SMART NOTICE 통합 (시안)

- **근거:** `mobile-home.js`의 `section.homeBudget`(593행 템플릿), `section.homeNotice`
- **변경:**
  - 게이지 안에 오늘 표시 `<i class="homeBudgetToday" style="left:{경과율}%"></i>`(이번 달만)를 둔다.
  - 게이지 아래에 속도 문장(§3-6)을 둔다. `accent-soft` 면, 시계 아이콘(CSS)이다.
  - 같은 정보를 두 번 말하지 않도록 예산이 있는 달에는 홈의 `homeNotice` 띠를 빼고 문장 하나로 합친다. 예산이 없는 달의 안내는 카드 안 링크 한 줄로 둔다.
  - 이 커밋은 단독으로 만들어 되돌리기 쉽게 한다.
- **수용 기준:**
  - 문장 세 경우(여유·주의·초과)와 예산 없음, 지난달 보기가 픽스처 검사로 확인된다.
  - 홈 HTML 바이트 변화를 보고한다(통합으로 줄거나 같아야 한다).
- **검증:** `validate:performance`, `validate:home-rail-challenge`, `validate:income-reserve`, 새 검증

#### T-13 카테고리 아이콘 표시 (시안)

- **변경:**
  1. **홈 타임라인**(`mobile-home.js:484–492`, `homeTimeline`; 이니셜은 `:486`, 마크업은 `:489`): `<div class="homeIcon">${categoryInitial(...)}</div>`를 `<span class="abCat" data-ck="${categoryKey(...)}"><i class="abCatIcon"></i></span>`로 바꾼다. 행당 바이트 증가를 재고, 6행 기준 HTML 예산 안에 있어야 한다.
  2. **거래 목록**(`#v8Feed` `article.v8-tx`, 행 수가 많다): HTML을 늘리지 않는다.
     - 클라이언트가 행의 분류 텍스트(`summary.v8-tx-main span` 둘째 조각)로 `categoryKey`를 계산한다.
     - `summary` 맨 앞에 동그라미를 넣는다.
     - 위치는 `v5-bundle-mains.js:1336–1341`의 행 초기화 루프에 같이 둔다(T-03과 같은 자리).
  3. **빠른 입력 칩:** 칩이 이미 가진 `data-cat`·`data-memo`(`quickChipIconCss()` 방식)로 CSS 선택자를 만든다. 칩 왼쪽에 32px 동그라미를 그린다. 바이트는 0이다.
- **수용 기준:**
  - 8테마에서 동그라미·잉크 색이 §3-2와 같다.
  - JS가 꺼져 있으면 아이콘 없이 지금처럼 보인다.
  - 읽기 이름에는 아이콘을 넣지 않는다(장식, `aria-hidden`).
- **검증:** `validate:performance`, `validate:v5`, screen-audit

#### T-14 "한 줄로 기록하기" 입력 바 + 빠른 입력 시트 개편 (시안)

- **근거:**
  - 이미 시트가 있다: `window.openAbQuickInput`(`v5-bundle-mains.js` 629행 부근)을 쓴다.
  - `[data-ab-quick-open]` 클릭 위임(632행)이 있다.
  - 하단 탭 ＋가 이 경로를 쓴다(`unified-nav.js:96–116`).
- **변경:**
  1. 모바일 홈 예산 카드 아래에 입력 바 하나를 둔다: `<a class="abEntryBar" data-ab-quick-open href="…#add">한 줄로 기록하기 <small>예: 점심 12000 국민카드</small></a>`. 링크라서 JS가 없어도 `#add`로 간다.
  2. 시트 모양을 §3-4 바텀시트 명세로 맞춘다:
     - 손잡이, 제목 "빠른 입력", 닫기(`aria-label="닫기"`)
     - 세그먼트(T-02)
     - 금액 큰 입력 → 내용 → 칩(T-01·T-13)
     - "날짜·결제수단·사람" 접기(기존 `quickMore`)
     - 미리보기 줄(§3-6, 기존 `quickAfter` 재사용)
     - `기록 저장`
  3. `기록 저장`은 금액과 내용이 모두 있을 때만 활성이다. 비활성 이유는 미리보기 줄이 말한다.
  4. 모바일 홈의 인라인 `#add` 패널은 시트와 같은 폼을 쓰고, 중복으로 그리지 않는다. 기존 앵커 동작은 유지한다.
- **수용 기준:**
  - ＋ 탭과 입력 바 둘 다 같은 시트를 연다.
  - Escape·뒤 막 누름으로 닫힌다.
  - 초점이 시트 안에 갇히고, 닫으면 연 버튼으로 돌아간다(기존 동작 유지).
  - 임시 저장(초안)이 그대로 동작한다.
- **검증:** `validate:v5`, `validate:lucian-a`, `validate:input-prerequisites`, `validate:core-write`

#### T-15 저장 뒤 반응: 알림 개편 + 새 행 강조 + 게이지 채움 (시안)

- **근거:**
  - 서버가 `msg`·`balert`·`err`로 알림을 그린다(`mobile-home.js:563–586`, `.abSaveFeedback`).
  - 저장 리디렉트에 새 거래 id가 `saved_rid`로 온다(`admin/transactions-households.js:341–343`).
- **변경:**
  1. 알림 모양을 §3-4로 바꾼다:
     - 텍스트 표시(✓ △ !)를 CSS 아이콘 원으로 바꾼다.
     - 둘째 줄 "남은 예산 … · 하루 …"는 지금 문구를 유지한다.
     - 위치는 모바일은 탭 바 위, 데스크톱은 본문 가운데 아래다.
  2. 경고 알림 버튼은 `예산 보기`(`/budget-alerts?month=…`), 오류 알림 버튼은 `다시 시도`(시트를 다시 열고 초안 복원)다.
  3. `saved_rid`가 있으면 그 행(`#tx-<id>`)에 `.abTxNew` 강조를 1.8초 준다. 예산 게이지는 0에서 새 값까지 620ms 채운다. 움직임 줄이기에서는 즉시 바꾼다.
- **수용 기준:**
  - 세 종류 알림이 아이콘과 문구로 구분된다.
  - 새 행 강조와 게이지 채움은 1회만 일어난다.
  - `role`·`aria-live`는 지금 값을 유지한다.
- **검증:** `validate:core-write`, `validate:v5`, `validate:ux-principles`

#### T-16 실행 취소 (조건부, T-15 뒤)

- **변경:**
  - 성공 알림에 `실행 취소`를 둔다. 같은 세션이 방금 만든 `saved_rid` 거래만 대상이다.
  - 기존 거래 삭제 경로(`POST /my/delete` → `handleMyDeleteTransaction`, `worker/router.js:479`)의 권한·같은 출처 검사를 그대로 거친다.
  - 5초 동안만 보인다.
  - 권한이 없거나 이미 바뀐 거래면 버튼 대신 "수정·삭제 화면 열기" 링크를 보인다.
- **수용 기준:**
  - 남의 거래와 오래된 거래는 지워지지 않는다.
  - 지운 뒤 "저장을 취소했습니다 / 방금 기록을 지우고 예산을 되돌렸어요"를 보인다.
- **검증:** `validate:household-security`, `validate:core-write`, `validate:lifecycle`
- 보안 판단이 애매하면 구현하지 말고 보고한다.

#### T-17 하단 탭 바 모양 (시안)

- **근거:** `unified-nav.js:116` 부근 `nav.abNavBottom`, 셸 CSS `.abNavBottom` 규칙
- **변경:** §3-4 하단 탭 바 명세대로 바꾼다. 활성은 알약 배경 + `accent` 글자, 가운데 ＋는 원형으로 솟게 한다. 기존 활성 위쪽 막대(`a.active:before`)는 알약으로 대체한다.
- **수용 기준:**
  - 탭 높이 ≥52px다.
  - 활성 표시는 색 외에 모양(알약)으로도 구분된다.
  - 강제 색상 모드 규칙(셸 CSS 567행 `@media(forced-colors:active)`)이 유지된다.
- **검증:** `validate:v5`, screen-audit

#### T-18 빈 상태·오류 상태 공통 모양 (시안)

- **근거:**
  - `mobile-home.js:70` `abTxEmpty`
  - 홈 타임라인 빈 문구(`mobile-home.js:492`)
  - `lucian-onboarding.js` 빈 폴더
- **변경:**
  - §3-6 빈 상태 문구로 맞춘다. 모양은 점선 테두리 상자 + 52px `accent-soft` 아이콘 타일 + 제목 + 한 줄 + 행동 버튼(빠른 입력 열기)이다.
  - 기존 온보딩 흐름은 바꾸지 않는다.
- **수용 기준:** 기록 0건 달에서 버튼 하나로 시트가 열린다.
- **검증:** `validate:v5`, `validate:lifecycle`

### 4단계 — 데스크톱·시작·공개

#### T-19 데스크톱: 떠 있는 독 → 상단 버튼 + 빠른 입력 버튼 하나 (옛 UX-09 대체, 시안)

- **문제:** 1280×800에서 본문 아래 가운데에 떠 있는 4버튼 독(약 453×62px)이 스크롤 중 글줄을 덮는다.
- **근거:** 셸 CSS `:902` `.abGlobalActions[data-ab-quick-dock]`, 독 생성 스크립트 `nav-search-notif-mains.js`
- **변경(≥900px):**
  1. 거래 검색은 사이드바의 기존 검색 버튼(`abNavSearchBtn`)이 맡는다. 알림·화면 설정·금액 가리기는 본문 오른쪽 위 44px 아이콘 버튼으로 둔다. `aria-label`과 알림 배지는 유지한다.
  2. "빠른 입력"만 오른쪽 아래 떠 있는 버튼으로 남긴다(§3-4).
     - 아래로 스크롤하면 원형으로 줄고, 위로 스크롤하면 펼친다.
     - 스크롤은 `requestAnimationFrame`으로 묶은 passive 리스너로 처리한다.
     - 움직임 줄이기에서는 바로 바뀐다.
  3. 페이지 머리말(`.abV5PageHeader`)의 오른쪽에 아이콘 버튼 자리를 비워 겹치지 않게 한다.
  4. 모바일(≤899px) 동작은 그대로다(독 숨김, 서랍).
- **수용 기준:**
  - 1280·1024·900px에서 위쪽 버튼이 머리말 글자와 겹치지 않는다.
  - 떠 있는 버튼이 글줄을 덮는 비율이 T-08 보고에서 줄어든다.
- **검증:** `validate:v5`, `validate:ux-principles`, T-08 데스크톱 모드
- 익숙한 위치를 옮기는 변경이므로 UX 메모의 "근거 없이 재배치 금지"에 따라 근거(가림 측정)를 PR에 적는다.

#### T-20 `/my` 시작 화면: 로그인 우선 (옛 UX-07, 시안)

- **문제:**
  - 채운 주 버튼이 "기능 먼저 보기"다.
  - 카카오 로그인은 약 1,594px 아래에 있다(데스크톱 800px 폭).
  - 머리글과 홈 링크가 없다.
  - UX 메모의 "기존 웹 사용자는 계정 로그인을 주 동선"과 어긋난다.
- **근거:** `src/modules/web/login-page-side-nav.js:17` `renderUserLoginHtml()`(`#feature-preview`·`#login-start`·`#signup-start`)
- **변경(시안 순서):**
  1. 머리글: 로고(§3-4 장부 마크 타일) → `/`, 오른쪽 "서비스 소개"
  2. 제목 "말하듯 기록하고, 숫자로 바로 이해하세요." + 한 줄
  3. **카카오 로그인** 버튼(§3-4)을 첫 화면에 둔다. `/auth/kakao/start`다.
  4. "로그인 이름으로 로그인"은 `<details>`(JS 없이도 열림) 안에 기존 폼을 둔다.
     - 칸 아래에 오류 문구를 둔다("로그인 이름을 입력해 주세요", "비밀번호는 8자리 이상이에요")와 함께 `aria-invalid`, `aria-describedby`를 쓴다.
     - 비밀번호 보기 버튼을 둔다.
  5. "처음이신가요? 새 계정 만들기"(기존 `#signup-start`), "먼저 둘러보기 →"(`/demo` 또는 `/`)
  6. 그 아래에 "카톡 한 줄 → 웹 기록" 예시 카드를 둔다. 기존 기능 미리보기는 그 아래로 간다.
- **수용 기준:**
  - 390×812와 1280×800 첫 화면 안에 카카오 로그인이 있다.
  - 채운 버튼은 하나다(카카오).
  - `/my` 데이터 요청은 4회 이하다.
  - 기존 서버 검증·문구는 유지한다.
- **검증:** `validate:account-runtime`, `validate:signup-kdf`, `validate:performance`, `validate:ux-principles`, 카카오 인앱 수동 확인(RELEASE-CHECKLIST)

#### T-21 공개 랜딩: 앱과 같은 브랜드 + 실제 앱 미리보기 (옛 BR-01·BR-02, 시안)

- **결정:** 사용자가 시안을 승인했다(2026-10-28). 브랜드 기준은 **앱의 파란 장부 마크(#3182f6)**이고, 카카오 노랑은 카카오 로그인 버튼에만 쓴다.
- **근거:**
  - `src/modules/public/site-config.js:356` `.pubBrand>span`(노란 ₩)
  - 공개 `theme-color` #312e81(`content-pages.js`)
  - 매니페스트 이름 "말해 가계부"(`icons-manifest.js:201`)
  - 랜딩 `renderPublicContentPage(…,"home")`(`content-pages.js:126`), `/demo` `renderPublicDemo()`(`:109`)
- **변경:**
  1. 공개 머리글 로고를 장부 마크 타일로 바꾼다. `theme-color`는 #3182f6, 매니페스트 `name`은 "말해가계부"다.
  2. 주 버튼(헤더·히어로·`/demo`)을 모두 `--ab12-action` 계열 하나로 맞춘다. 헤더 버튼 검정, 히어로 노랑, `/demo` 남색을 없앤다.
  3. 랜딩 순서:
     - 히어로(지금 문구 유지, 주 버튼 "내 가계부 시작하기" + 보조 "가상 가계부 둘러보기")
     - **앱 화면 미리보기**(가상 데이터 표시. 예산 카드·게이지·속도 문장·거래 3행. T-12·T-13과 같은 마크업·CSS)
     - 세 걸음(카톡에 한 줄 / 금액·내용·결제수단 정리 / 웹에서 예산 확인)
     - 공동 가계부·정산
     - 알아 둘 점(은행·카드 자동 연결 안 함, 카카오 공식 서비스 아님 — 지금 문구)
     - 카카오 로그인 띠
     - 바닥글
  4. `/demo` 위쪽에도 같은 앱 미리보기를 읽기 전용으로 둔다. 서버 요청·쿠키·저장은 0이다.
  5. 광고 게이트·정식 주소 규칙(`validate:ads-gate`, `validate:www-canonical`)을 유지한다.
- **수용 기준:**
  - 공개·로그인·앱의 로고·주 버튼 색·`theme-color`가 하나다.
  - `/demo` 첫 화면에 앱과 같은 예산 카드가 보인다.
- **검증:** `validate:public-articles`, `validate:public-articles-v22974`, `validate:ads-gate`, `validate:www-canonical`

#### T-22 공유 미리보기 이미지 og:image (옛 BR-03)

- **문제:** 공개 페이지에 `og:image`가 없어 카카오톡 공유 미리보기가 글자뿐이다.
- **변경:**
  - `tools/build-og-images.mjs`(sharp, 고정 버전)로 1200×630 PNG를 빌드 때 만든다. 장부 마크 + 한 줄 + 앱 미리보기 일부를 담는다.
  - Worker가 `icons-manifest.js`처럼 버전 주소로 내려보낸다.
  - 공개 진입 페이지(홈·`/demo`·사용 가이드·생활비 글 목록과 글)에 `og:image`, `og:image:width/height`, `twitter:card=summary_large_image`를 넣는다.
  - 생성물은 스크립트로 재현 가능해야 하고, 원본 PNG는 커밋하지 않는다.
- **수용 기준:** `image/png` immutable 응답이고, 이미지당 Worker 증가는 100KB 이하다.
- **검증:** `validate:public-articles`, `validate:performance`

#### T-23 글꼴 Pretendard (옛 LIB-02, 결정 D-1 필요)

- **A 자체 서빙:**
  - Fontsource 또는 `orioncactus/pretendard`(OFL)의 woff2를 쓴다. 한글 서브셋, 400·600·800 세 굵기다.
  - 같은 출처 정적 자산이 필요하다(Workers Static Assets나 R2 바인딩, 배포 구성 변경 → 사용자 승인).
  - `font-display:swap`, 첫 굵기만 `preload`한다.
- **B 스택 정리:** `Pretendard`를 빼고 `-apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`로 둔다.
- **수용 기준(A):** 첫 렌더 글꼴 요청 1회 이하, CLS 증가 없음, `/app` 요청 예산 유지

### 5단계 — 구조

#### T-24 CSS 계층 정리 (옛 LIB-04, 판마다 일부)

- **문제:**
  - 셸 스타일시트가 216,534B다.
  - `accountbook-shell-css.js`에 `!important`가 1,333회 나온다.
  - `body.abV22812Shell` 접두가 모듈 전체에 1,195회 나온다.
  - T-01·02·04·05가 모두 이 우선순위 싸움에서 생겼다.
- **변경:**
  - 셸 CSS 맨 앞에 `@layer base, legacy, shell, components, overrides;`를 선언한다.
  - 새 규칙은 `components` 레이어에 `!important` 없이 둔다. 컴포넌트 단위(Button → SegmentedControl → QuickChips → KPI → Panel)로 옮기면서 같은 대상의 옛 `!important`를 지운다.
  - 리터럴 색(#e8edf4, #1b64da, #b7d8ff 등)을 토큰으로 바꾼다. V22811 바탕(`asset-registry.js:146–177`)도 대상이다.
  - 판마다 `!important` 수와 셸 CSS 바이트를 `validate:design-uplift`에 상한으로 묶는다.
- **수용 기준:** 판마다 개수가 줄고, 스크린샷 차이는 의도한 것뿐이다.

#### T-25 모션 라이브러리 (옛 LIB-03, 필요할 때만)

- T-07·T-14·T-15·T-19를 CSS로 먼저 만든다.
- CSS로 안 되는 것(중단 가능한 스프링, 목록 재정렬 FLIP)이 남을 때만 Motion 바닐라 `animate` 미니판을 쓴다.
  - number-flow처럼 한 파일로 담아 `/assets/motion-mini-v<판>.mjs`로 두고, `import()`로 늦게 부른다.
  - SHA-256을 검증에 고정한다.
- GSAP·Anime.js는 같이 들이지 않는다.
- **수용 기준:** 첫 HTML·첫 요청 변화 0, 모션 자산은 첫 상호작용 뒤에 내려온다.

### 선택

- **T-26 랜딩 히어로 시각 요소(옛 OPT-01):**
  - Paper Shaders(`@paper-design/shaders`, Apache-2.0, 바닐라)의 MeshGradient 하나를 브랜드 토큰 색으로 쓴다.
  - 공개 랜딩 첫 화면에만 두고, 움직임 줄이기·저사양에서는 정적 이미지로 대신한다. 앱 화면에는 금지한다.
- **T-27 소개 영상(옛 OPT-02):** Remotion + Remotion Skills + FFmpeg로 15초 "카톡 한 줄 → 웹 예산 카드" 영상을 만든다. 저장소 밖에서 만들고, D-4(라이선스)를 먼저 정한다.
- **T-28 디자인 운영(옛 OPT-03):** `docs/uiux/` 흐름 문서마다 Excalidraw JSON을 둔다. 디자이너가 합류하면 Penpot을 원본으로 두고 토큰 변환 스크립트를 만든다.
- **T-29 에이전트 디자인 지침(옛 OPT-04):**
  - 사용자 수준 스킬에 `design-taste`의 core·craft만 설치한다. Better Design MCP는 `get-review-rules`·`get-ui-principle`만 리뷰에 쓴다.
  - 장르 팩, 외부 브랜드 디자인 시스템, shadcn/React 컴포넌트는 금지한다.
  - 저장소 지침이 이긴다.

---

## 6. 사용자 결정

| ID | 질문 | 상태 | 막는 티켓 |
|---|---|---|---|
| D-1 | Pretendard를 자체 서빙할까, 스택에서 뺄까 | **미정** | T-23 |
| D-2 | 브랜드 기준 | **결정됨:** 앱 파란 장부 마크, 카카오 노랑은 카카오 로그인에만(시안 승인 2026-10-28) | — |
| D-3 | CSP 변경 허용 | **미정**(바꾸지 않음 권장) | Rive·dotLottie 재검토 |
| D-4 | Remotion 사용 시 조직 인원(3명 초과면 유료) | **미정** | T-27 |

---

## 7. 완료 보고 형식 (단계마다)

AGENTS.md "완료 기준" + 아래를 보고한다.

- 바꾼 티켓과 커밋 목록
- 홈 HTML 바이트(기준 픽스처·200행 픽스처) 전후
- 셸 CSS 바이트와 `!important` 개수 전후
- T-08 감사 결과(넘침·대비·선택 구분·겹침), 8테마
- 실행한 검증, 실제 검사 수, 체크섬 수
- 수동 확인이 필요한 것: 카카오 인앱, iOS 사파리, 안드로이드 크롬, 다크·고대비·움직임 줄이기
- 남은 위험과 하지 못한 것

---

## 8. 30개 레포 판정 (참고, 앞선 브리프 §2 그대로)

| 묶음 | 채택 | 조건부 | 도구로만 | 제외 |
|---|---|---|---|---|
| Design + Storyboard | Lucide | Fontsource | Penpot, Excalidraw | — |
| Assets + Animation | SVGO | sharp | — | Lottie-web, Rive(WASM·CSP) |
| Timelines | Motion(바닐라 미니, 필요 시) | — | — | GSAP, Anime.js(중복), Theatre.js |
| 3D | — | — | — | Three.js, R3F, Drei, Postprocessing(React 없음·무게) |
| Production | — | — | Remotion, Remotion Skills, FFmpeg | Mediabunny |
| Claude Code·Codex 디자인 | — | Better Design(검토 규칙만), Design Taste(core·craft만), Paper Shaders(랜딩만) | Superdesign(유지보수 중단) | Canvas UI, UI Layouts, Hyperiux(받은 링크 열리지 않음), Motion Primitives |

- Cursify는 이미 `ab-cursor.js`(V22.8.95)에 반영돼 있다.
- Trickle은 링크와 검색 모두 확인되지 않았다.

---

## 9. 바로잡음과 주의

- **측정 함정:** 테마를 바꾼 직후 전환(180ms) 중에 색을 재면 이전 테마 값이 나온다. 앞선 보고의 "다크에서 칩·저장 버튼이 라이트용 파랑"은 이 오측정이었다(실제 다크 값 #2563eb). T-08이 전환 대기를 넣는 이유다.
- **금액 색:** 앞선 브리프는 UX-05에서 지출을 빨강(`--neg`)으로 적었다. 시안 승인에 따라 이 문서는 **지출 = 본문색, 빨강은 초과·오류만**으로 정했다(T-05).
- **SMART NOTICE 통합(T-12)은 제품 표현을 바꾼다.** 단독 커밋으로 두고, 문제가 생기면 그 커밋만 되돌린다.

---

## 10. 단계별 붙여넣기 프롬프트

아래를 Claude Code 또는 Codex에 그대로 붙여 넣는다. 파일 위치는 `docs/ux/MALHAEBOOK_UX_WORK_ORDER.md`로 가정했다.

### 1단계

```
docs/ux/MALHAEBOOK_UX_WORK_ORDER.md 를 읽고 §1 규칙과 AGENTS.md 를 따른다.
1단계(T-01 ~ T-07)만 진행한다. 다른 단계는 시작하지 않는다.
- 시작 전에 VERSION.txt, docs/STATUS.md, UX 원칙 메모를 읽고, 이번 판 번호와 계획을 먼저 보여 준다.
- 티켓마다 §5의 변경·수용 기준대로 고치고 관련 검증을 실행한다.
- 홈 HTML 바이트와 셸 CSS 자산 주소 판 올림을 확인한다.
- 마지막에 node .codex/scripts/verify-repository.mjs 와 npm run validate:categories-absent 를 실행하고 §7 형식으로 보고한다.
배포, SQL, 외부 설정은 하지 않는다.
```

### 2단계

```
docs/ux/MALHAEBOOK_UX_WORK_ORDER.md 의 2단계(T-08 ~ T-10)를 진행한다. §1 규칙과 AGENTS.md 를 따른다.
- T-08(screen-audit 확장)을 먼저 끝내고, 1단계 이전 커밋에서 다크 세그먼트를 잡아내는지 확인한 결과를 보고한다.
- T-09 categoryKey 는 §3-3 표 그대로, 서버·클라이언트 판정이 같다는 검사를 새 validate:design-uplift 에 넣는다.
- T-10 은 lucide-static·SVGO 버전과 SHA-256 을 tools/build-icons.mjs 머리에 기록하고, 홈 HTML 바이트가 늘지 않았음을 보여 준다.
§7 형식으로 보고한다.
```

### 3단계

```
docs/ux/MALHAEBOOK_UX_WORK_ORDER.md 의 3단계(T-11 ~ T-18)를 진행한다. §1 규칙, §3 명세, AGENTS.md 를 따른다.
- 홈 렌더러 해시 검증은 lib-audit 의 before* 역변환 관례로 이번 변경만 되돌려 비교하고 사유를 남긴다.
- T-12 (SMART NOTICE 통합)는 단독 커밋으로 둔다.
- T-16(실행 취소)은 보안 판단이 애매하면 구현하지 말고 이유를 보고한다.
- 티켓마다 홈 HTML 바이트(35 KiB 기준·44KB 실사용)를 재서 보고한다.
§7 형식으로 보고하고, 390px·1280px 라이트/다크 스크린샷 전후를 PR 설명에 붙인다(커밋하지 않는다).
```

### 4단계

```
docs/ux/MALHAEBOOK_UX_WORK_ORDER.md 의 4단계(T-19 ~ T-23)를 진행한다. §1 규칙, §3 명세, AGENTS.md 를 따른다.
- T-19 는 가림 측정(T-08 데스크톱 모드) 전후를 PR 에 근거로 적는다.
- T-20 은 기존 서버 검증·문구를 유지하고 /my 데이터 요청 4회 이하를 확인한다.
- T-21 은 D-2 결정(앱 파란 장부 마크)을 따르고 광고 게이트·정식 주소 검증을 유지한다.
- T-23 은 D-1 결정을 내가 줄 때까지 시작하지 않는다.
§7 형식으로 보고한다.
```

### 5단계 (판마다 일부)

```
docs/ux/MALHAEBOOK_UX_WORK_ORDER.md 의 T-24 를 이번 판 범위로 진행한다: @layer 선언과 <컴포넌트 이름> 하나만 components 레이어로 옮기고 같은 대상의 옛 !important 를 지운다.
!important 개수·셸 CSS 바이트 상한을 validate:design-uplift 에 갱신하고 스크린샷 전후를 보고한다.
```

---

## 출처

- 저장소: `AGENTS.md`, `src/modules/**`(본문에 파일:행), `validation/validate-performance-v22811.mjs`, `validation/lib-audit-v22934.mjs`, `tools/screen-audit.mjs`, `tools/bundle-number-flow.mjs`
- 실서비스: https://malhaebook.com/ , /demo , /my (2026-10-28 확인)
- [Lucide](https://github.com/lucide-icons/lucide)
- [Fontsource Pretendard](https://fontsource.org/fonts/pretendard/install)
- [Motion 기능 비교](https://motion.dev/docs/feature-comparison)
- [Remotion 라이선스 FAQ](https://www.remotion.dev/docs/license/faq)
- [Penpot 토큰 형식 논의](https://community.penpot.app/t/token-export-is-tokens-studio-format-not-dtcg-2025-10/10544)
- [Rive 런타임 크기](https://rive.app/docs/runtimes/runtime-sizes.md)
- [Paper Shaders](https://github.com/paper-design/shaders)
- [Better Design](https://github.com/marvkr/better-design)
- [Design Taste](https://github.com/madebymustafa/design-taste)

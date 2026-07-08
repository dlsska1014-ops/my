# Local Runtime Test Report — V19.3-REPORT-CLEAN-FINAL

## Result
**PASS — 51/51**

Node 환경에서 Supabase REST(PostgREST)를 in-memory mock으로 대체하고,
Worker의 `fetch(request, env)`를 직접 호출하는 방식으로 실제 라우팅·인증·렌더링을 검증했습니다.

## Mock 데이터

- 가계부: `h1`(우리집 가계부), `h2`(비밀 옆집 가계부)
- 사용자: `u1` → h1에만 참여(owner), `u2` → h2에만 참여(owner), `u3` → h1 viewer
- h2에는 식별 가능한 비밀 마커 데이터(가계부명·거래·분류·결제수단·예산·정기지출·자산·카카오키)를 넣고,
  u1 세션 응답 HTML에 해당 마커가 한 글자라도 나오면 실패로 처리

## 정적 검사

- `node --check src/index.js` → 통과
- 렌더링된 12개 페이지의 인라인 `<script>` 12개 → vm 문법 검사 전부 통과
- `"async async"` 문자열 → 0건

## Smoke Test (u1 세션)

`/health`(version=V19.3-REPORT-CLEAN-FINAL, mode=report-clean-final 확인), `/app`, `/analysis`,
`/my/analysis`, `/calendar`, `/budgets`, `/reserve-plans`, `/payment-methods`, `/keyword-guide`,
`/households`, `/my`(세션 보유 시 정상 리다이렉트) → 전부 정상 응답, Error 1101 없음

## 데이터 누출 테스트 (u1 로그인 상태에서 h2 미노출)

9개 화면 × 2가지 조건(기본 조회 / `household_id=h2` 강제 주입) = 18케이스 전부 PASS:

1. /app — h2 가계부명/거래 미노출
2. /analysis — h2 거래/예산 미포함 (6/12개월 장기 조회 포함)
3. /my/analysis — h2 거래/예산 미포함
4. /calendar — h2 거래 미포함
5. /budgets — h2 예산 미노출 (**clean 전에는 강제 주입 시 노출되던 것을 수정 후 재검증**)
6. /reserve-plans — h2 정기지출 미노출
7. /payment-methods — h2 자산/결제수단 미노출
8. /households — h2 가계부/참여자/카카오키 미노출
9. /keyword-guide — h2 가계부 미노출

## UX 검증

- /calendar: 전체 달력 details 기본 접힘 + 히트맵 유지 → PASS
- /my/calendar: "기록 있는 날짜" 우선 표시 + 전체 달력 접힘 → PASS
- /analysis, /my/analysis: 접기(foldSection) 구조 각각 5개 섹션 렌더링 → PASS
- /payment-methods: 등록 자산/보유 자산 합계/이번 달 지출/미등록 결제수단/최다 사용 결제수단 카드 → PASS
- /budgets: 예산 정합성(budgetOk/budgetWarn) 블록 표시, `__income`/`__total` 원시 코드값 미노출 → PASS

## 권한 테스트

- viewer(u3): /budgets, /reserve-plans, /payment-methods에서 저장/삭제 버튼 미노출 → PASS
- owner(u1): 동일 화면에서 저장/삭제 버튼 정상 노출 → PASS
- viewer가 예산 저장 POST 강제 호출 → 서버 차단(err 리다이렉트, DB 변화 없음) → PASS
- u1이 h2에 예산/정기지출/자산 저장 POST 강제 호출 → 전부 서버 차단 → PASS
- owner가 자기 가계부(h1)에 자산 저장 → 정상 저장 → PASS
- 비로그인 접근(/app, /analysis, /budgets) → /my로 안전 리다이렉트 → PASS

## 한계

- 실제 Supabase 인스턴스/카카오 로그인 OAuth 흐름은 mock 범위 밖이며, 운영 배포 후
  FINAL_APPLY_CHECKLIST.md의 확인 절차로 재검증해야 합니다.

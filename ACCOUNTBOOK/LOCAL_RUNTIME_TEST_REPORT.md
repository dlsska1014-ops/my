# Local Runtime Test Report — V19.4-BUDGET-ONBOARDING-STABILITY

## Result
**PASS — 57/57** (runtime) + **13/13** (inline script syntax)

Node 환경에서 Supabase REST(PostgREST)를 in-memory mock으로 대체하고,
Worker의 `fetch(request, env)`를 직접 호출해 라우팅·인증·렌더링을 검증했습니다.
V19.3-CLEAN-FINAL의 51개 테스트에 v19.4 신규 기능 검증 6건을 더했습니다.

## Mock 데이터
- 가계부 h1/h2, u1(h1 owner), u2(h2 owner), u3(h1 viewer)
- h2에는 식별용 비밀 마커(가계부명·거래·분류·결제수단·예산·정기지출·자산·카카오키) 삽입 —
  u1 세션 응답에 한 글자라도 나오면 실패 처리

## 정적 검사
- `node --check src/index.js` 통과
- 렌더링된 13개 페이지(신규: /start-guide 포함)의 인라인 `<script>` 13개 → vm 문법 검사 전부 통과
- `"async async"` 문자열 0건

## v19.3에서 이어지는 회귀 테스트 (전부 PASS)
- `/health` version=V19.4-BUDGET-ONBOARDING-STABILITY, mode=budget-onboarding-stability
- smoke: /app /analysis /my/analysis /calendar /budgets /reserve-plans /payment-methods /keyword-guide /households /my
- 누출: 9개 화면 × (기본/`household_id=h2` 강제) 18케이스 — h2 데이터 미노출
- 권한: viewer 버튼 미노출 + POST 서버 차단, u1→h2 교차 저장 차단, owner 정상 저장, 비로그인 안전 리다이렉트
- UX 회귀: 캘린더 접힘, analysis foldSection, __income/__total 원시값 미노출, 자산 인사이트 카드 5종

## v19.4 신규 기능 테스트 (전부 PASS)
1. /budgets 자동 산정 UI — 모드 배지(modeTag), 초과 저장 경고 스크립트(BUDGET_CTX), "남은 배정 가능 예산" 표기
2. /budgets 직접 설정 상태에서 "자동 산정(분류 합계)으로 전환" 버튼 노출
3. /budgets `__total` 삭제 후 "월 예산 자동 산정" 안내 + <분류 합계 자동> 배지 전환 확인
4. /app 빠른 입력 — 자주 쓰는 항목 칩(freqChips)·오늘/어제 날짜 칩(dateChip) 렌더링
5. /reserve-plans "이번 달 납부 예정" 메트릭 렌더링
6. /start-guide 8단계 체크리스트(ckList) 렌더링 및 실데이터 기반 완료 판정

## 기타 확인
- /deployment-check: 비로그인 접근 시 안전 리다이렉트(303) — Error 1101 없음

## 한계
- 실제 Supabase/카카오 OAuth/OpenBuilder 발화는 mock 범위 밖 — 배포 후 FINAL_APPLY_CHECKLIST.md 절차로 재검증 필요

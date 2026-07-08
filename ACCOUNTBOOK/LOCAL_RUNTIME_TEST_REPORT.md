# Local Runtime Test Report — V19.5-SMART-FLOW

## Result
**PASS — 73/73** (runtime) + **13/13** (inline script syntax)

Node에서 Supabase REST를 in-memory mock으로 대체하고 Worker `fetch()`를 직접 호출해 검증.
v19.4의 57개 테스트에 v19.5 권한 매트릭스·신규 기능 16건을 추가했습니다.

## Mock 구성
- h1: u1(owner), u3(viewer), u4(member) / h2: u2(owner)
- h2 비밀 마커 데이터 — u1 응답에 노출 시 실패

## 정적 검사
- `node --check` 통과 · 13개 화면 인라인 스크립트 13개 문법 통과 · "async async" 0건

## 회귀 (v19.3~v19.4 전체 유지)
- /health(V19.5-SMART-FLOW/smart-flow), 10개 화면 smoke, 누출 18케이스, 예산/정기지출/자산 권한,
  캘린더 접힘, 분석 접기, 예산 자동 산정 UI, 입력 칩, 시작가이드 체크리스트 — 전부 PASS

## v19.5 신규 테스트 (전부 PASS)
1. owner가 /admin/transactions로 기록 추가 성공 (일반 사용자 세션)
2. 분류 미입력 시 서버 자동 추론으로 category 채워짐
3. viewer 기록 추가 차단 (서버)
4. 타 가계부 소유자의 h1 기록 추가 차단
5. member 기록 추가 시 지출자(user_id) 본인 강제
6. member가 타인 기록 수정 시도 → 차단 (row 소유권 검증)
7. member 본인 기록 수정 성공
8. viewer 삭제 차단
9. 타 가계부 row 삭제 차단 — 폼에 자기 household_id를 넣어도 DB row 기준으로 차단
10. viewer 고정지출 저장 차단 / owner 저장 성공
11. /app 한 줄 스마트 입력·오늘 쓴 돈 카드 렌더링
12. viewer에게 /app 입력·수정·고정지출 폼 미노출
13. /analysis 분류 랭킹 드릴다운 링크 · /payment-methods 결제수단 드릴다운 링크

## 한계
- 실제 Supabase/카카오 OAuth/OpenBuilder 발화는 mock 범위 밖 — FINAL_APPLY_CHECKLIST.md로 배포 후 재검증

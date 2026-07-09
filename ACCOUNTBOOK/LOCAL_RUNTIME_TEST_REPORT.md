# Local Runtime Test Report — V19.6-KAKAO-COMPLIANCE

## Result
**PASS — 76/76** (runtime) + **13/13** (inline script syntax) + 재전송/반복 입력 단위 확인

## 정적 검사
- `node --check` 통과 · 13개 화면 인라인 스크립트 문법 통과 · "async async" 0건

## 회귀 (v19.3~v19.5 전체 유지)
- /health, 10개 화면 smoke, 누출 18케이스, 권한 매트릭스(viewer/member/owner, 교차 가계부), 예산 자동 산정,
  입력 칩, 시작가이드 체크리스트, 스마트 한 줄 입력, 드릴다운, 오늘 카드 — 전부 PASS

## v19.6 신규 (전부 PASS)
1. 카카오 재전송 멱등: 같은 발화 즉시 2회 → 1건만 저장 (retry window 120초)
2. 정당한 반복 입력: 기존 동일 거래가 10분 전 것이면(창 밖) 새 기록 정상 저장 (단위 확인)
3. /privacy 보관 기간 문구 존재 + 금지 표현("학습해") 없음
4. /health version=V19.6-KAKAO-COMPLIANCE, mode=kakao-compliance

## 한계
- 실제 Supabase/카카오 OAuth/OpenBuilder 발화·재전송은 mock 범위 밖 — 배포 후 FINAL_APPLY_CHECKLIST.md 16-8/16-9로 재검증

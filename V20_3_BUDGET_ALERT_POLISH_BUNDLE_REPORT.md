# V20.3-BUDGET-ALERT-POLISH-BUNDLE

## 목적
V20.2의 트래픽/중복 안전 구조를 유지하면서, 사용자가 매일 보는 예산 안내를 더 실용적으로 정리한 번들입니다.

## 추가 경로
- `/budget-alerts`
- `/today-budget`
- `/monthly-forecast`
- `/fixed-preview`
- `/budget-alert-guide`
- `/budget-polish-guide`

## 주요 추가 내용
- 오늘 사용 가능 금액 계산
- 월말 예상 지출 계산
- 정기지출 반영 예정 금액 표시
- 분류별 예산 초과/주의/정상 상태 표시
- 카카오 안내 문구 예시 제공
- 운영센터 및 통합 메뉴에 예산 알림 진입점 추가

## 유지한 것
- `/my`, `/app`, `/skill` 핵심 저장 로직
- 권한 체크와 user household scope
- 여러 가계부 생성/참여
- V20.2 중복 저장 방어와 트래픽 안전 구조
- 하단 사업자 푸터
- Supabase 테이블 구조

## 검증
- `node --check src/index.js` PASS
- ES module import PASS
- `/health` smoke test PASS
- `/budget-alert-guide` smoke test PASS
- `/budget-alerts` 비로그인 redirect smoke test PASS
- `/operation-center` smoke test PASS
- ZIP 무결성 PASS

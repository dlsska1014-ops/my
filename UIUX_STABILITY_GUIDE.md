# v18.6 UI/UX Stability Guide

## 안정화 기준
PC와 모바일이 같은 화면을 사용하되, 모바일에서는 메뉴·폼·표·카드가 깨지지 않도록 공통 안정화 CSS를 추가했습니다.

## 주요 개선
- 모바일 하단 5개 탭 활성 상태 표시
- 모바일 메뉴 열림 상태에서 외부 클릭/ESC/링크 클릭 시 자동 닫힘
- iPhone safe-area 대응 유지
- 모든 주요 입력폼은 모바일에서 1열 구조와 16px 입력 크기 적용
- 카드/패널/표/캘린더가 화면 밖으로 밀리지 않도록 overflow 안정화
- 넓은 표/캘린더에는 좌우 스크롤 안내 표시
- PC에서는 좌측 메뉴 폭을 고려해 본문 최대 폭을 자동 조정

## 확인 경로
- `/app`
- `/analysis`
- `/calendar`
- `/budgets`
- `/reserve-plans`
- `/keyword-guide`
- `/payment-methods`

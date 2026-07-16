# V22.6.5 모바일 화면 캡처 인덱스

## 캡처 환경

- 모바일 Chromium headless
- 한국어 locale, 실제 Noto Sans KR 웹폰트 주입
- 390×844와 360×780, device scale factor 1
- 로그인 사용자·가계부·멤버·수입·지출·예산 fixture 사용

## 화면

| 번호 | 경로 | 캡처 이름 |
|---|---|---|
| 01 | 홈·최근 내역 | `01_app` |
| 02 | 가계부 생성·전환·옵션·삭제 | `02_households` |
| 03 | 참여자·초대 | `03_members` |
| 04 | 수입·예산 | `04_budgets` |
| 05 | 설정 | `05_settings` |
| 06 | 개인 비밀번호 | `06_security` |
| 07 | 전체 메뉴 | `07_menu` |
| 08 | 백업·가져오기 | `08_backup` |
| 09 | 분석 | `09_analysis` |
| 10 | 프리미엄 베타 | `10_premium` |
| 11 | 결제수단 | `11_payment` |
| 12 | 정기지출 준비 | `12_reserve` |
| 13 | 정산 요약 | `13_settlement` |

`visual_qa_v2265/`에는 390px 전체 화면 캡처가 있고, 처음 7개 화면은 첫 viewport와 footer 근처 캡처도 포함한다. `visual_qa_v2265_360/`은 같은 구성을 360px에서 반복한다.

## 자동 판정

- 26개 경로 렌더링 모두 통과
- 문서 가로 넘침 0
- viewport 밖 표시 요소 0
- 중복 ID 0
- 이름 없는 폼 제어 0
- footer 누락 0
- 고정 하단 메뉴/footer 겹침 0

아이폰 Safari와 Android Chrome의 시스템 이모지·인앱브라우저 safe-area는 실제 기기에서 최종 확인한다.

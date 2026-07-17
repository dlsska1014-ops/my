# V22.4 AdSense 공개 콘텐츠·온보딩 복구 번들

## 목적
- AdSense 사이트 심사에 필요한 공개 탐색 구조와 독창적인 서비스 콘텐츠 페이지 제공
- 가계부 생성 단계에서 선택지를 이해하지 못하면 같은 문구가 반복되는 무한 루프 제거
- 기존 카카오 `/skill`, Supabase 스키마, OpenBuilder 시나리오·블록·발화 유지

## 공개 경로
- `/` 서비스 소개
- `/service-guide`
- `/how-it-works`
- `/kakao-guide`
- `/budget-guide`
- `/group-accountbook`
- `/security`
- `/faq`
- `/about`
- `/contact`
- `/privacy`
- `/terms`
- `/cookies`
- `/robots.txt`
- `/sitemap.xml`
- `/ads.txt`

## AdSense 설정
- `ADSENSE_PUBLISHER_ID=ca-pub-...`: 공개 페이지 메타 태그 및 ads.txt 생성
- `ADSENSE_ENABLED=0`: 심사 중 실제 광고 스크립트 비활성 권장
- `ADSENSE_AUTO_ADS=0`: 정식 런칭·안정화 전 자동광고 비활성 권장
- `PUBLIC_SUPPORT_EMAIL`: 공식 문의 이메일이 있는 경우 공개 문의 페이지에 표시

## 온보딩 복구
- 선택 목록을 텍스트로 항상 표시해 그룹방에서도 선택지를 확인 가능
- `우리집 가계부` 같은 이름형 입력을 인식하고 생성 전 확인
- `어떤 선택이 있는데`, `선택`, `종류 알려줘`는 목록 안내로 처리
- `그냥 가계부`, `일반`, `개인`은 직접 입력 가계부로 처리
- 이름 확인·이름 재입력·종류 재선택·취소 경로 제공
- 반복 실패 횟수를 상태에 저장하고 원하는 이름을 바로 입력하도록 안내

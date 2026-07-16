# V22.4 적용 체크리스트

## 1. Worker 배포
- `src/index.js` 배포
- `/health`에서 `V22.4-ADSENSE-PUBLIC-CONTENT-ONBOARDING-RECOVERY-BUNDLE` 확인

## 2. AdSense 심사 준비
- Cloudflare 변수 `ADSENSE_PUBLISHER_ID=ca-pub-실제번호` 설정
- `ADSENSE_ENABLED=0`
- `ADSENSE_AUTO_ADS=0`
- 공식 이메일이 있으면 `PUBLIC_SUPPORT_EMAIL` 설정
- `/ads.txt`가 HTTP 200과 실제 publisher ID를 반환하는지 확인
- `/sitemap.xml`, `/robots.txt` 확인
- 공개 페이지의 모바일 탐색과 내부 링크 확인
- 개인정보처리방침·쿠키 안내·이용약관 검토

## 3. 가계부 생성 회귀
1. `가계부 생성`
2. `우리집 가계부`
3. `이 이름으로 만들기`
4. 생성 완료와 초대코드 확인

추가 테스트:
- `가계부 생성` → `어떤 선택이 있는데` → 선택 목록 표시
- `가계부 생성` → `선택` → 선택 목록 표시
- `가계부 생성` → `그냥 가계부` → 이름 확인
- `종류 다시 선택`, `이름 다시 입력`, `취소`

## 4. 변경하지 않는 것
- OpenBuilder 시나리오명·블록명·발화
- Skill URL `/skill`
- Supabase 기존 스키마
- V22.3 NLU 운영 집계와 분석 스튜디오

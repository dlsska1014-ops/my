# V22.4.2 적용 체크리스트

1. `src/index.js`를 Cloudflare Worker에 배포합니다.
2. `/health`에서 `V22.4.2-PUBLIC-CONTENT-POLICY-UI-STABILITY-BUNDLE`을 확인합니다.
3. `/about`, `/privacy`, `/cookies`, `/contact`, `/site-map`을 PC와 모바일에서 확인합니다.
4. `/sitemap.xml`이 표 형태로 보이고, 페이지 원본에는 표준 `<urlset>`이 유지되는지 확인합니다.
5. Search Console에는 `https://ttokttok-accountbook.com/sitemap.xml`을 제출합니다. `/site-map`은 사용자를 위한 HTML 페이지입니다.
6. AdSense 심사 전 `ADSENSE_PUBLISHER_ID`와 `/ads.txt`를 확인하고 실제 광고는 승인 전까지 `ADSENSE_ENABLED=0`을 유지합니다.
7. 카카오 기록·가계부·권한 회귀 테스트를 진행합니다.

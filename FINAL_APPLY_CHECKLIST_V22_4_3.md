# V22.4.3 적용 체크리스트

1. Cloudflare Worker에 `src/index.js` 배포
2. `/health`에서 `V22.4.3-SITEMAP-XML-DISPLAY-HOTFIX` 확인
3. 브라우저 시크릿 창에서 `/sitemap.xsl` 열기: XML 문서가 보이면 정상
4. 브라우저 시크릿 창에서 `/sitemap.xml` 열기: 표 형태 사이트맵 확인
5. `/site-map` 사용자용 HTML 사이트맵 확인
6. `/robots.txt`에 `Sitemap: https://ttokttok-accountbook.com/sitemap.xml` 확인
7. Cloudflare 캐시가 남아 있으면 `/sitemap.xml`, `/sitemap.xsl` URL 캐시 제거 후 재확인

OpenBuilder와 Supabase는 변경하지 않습니다.

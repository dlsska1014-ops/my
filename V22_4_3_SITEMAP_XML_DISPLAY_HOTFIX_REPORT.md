# V22.4.3 Sitemap XML Display Hotfix

## 문제
`/sitemap.xml`은 XML 자체를 반환했지만 연결된 `/sitemap.xsl` 안에 `<!DOCTYPE html>` 선언이 XSL 템플릿 내부에 들어가 있었습니다. XML 문법상 DOCTYPE은 문서 루트 이전에만 올 수 있으므로 XSL 문서가 유효하지 않았고, 일부 브라우저에서 사이트맵 화면이 빈 화면으로 표시될 수 있었습니다.

## 수정
- XSL 템플릿 내부의 잘못된 `<!DOCTYPE html>` 제거
- `xsl:output`에 `omit-xml-declaration="yes"` 적용
- `/sitemap.xsl` 응답 Content-Type을 `application/xml; charset=utf-8`로 정리
- `/sitemap.xml` 표준 구조, `/site-map` 사용자용 HTML 사이트맵, robots.txt 경로는 유지
- OpenBuilder, `/skill`, Supabase, 거래·예산·권한·계정 로직은 변경하지 않음

## 기대 결과
- `/sitemap.xml`을 브라우저에서 열면 표 형태의 사이트맵이 표시됨
- XSL을 지원하지 않는 환경에서는 XML 원문이 표시됨
- 검색엔진 제출 주소는 계속 `/sitemap.xml` 사용

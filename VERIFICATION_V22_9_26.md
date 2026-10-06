# V22.9.26 검증 기록

2026-10-06에 독립 합성 데이터로 저장소 검증을 마쳤습니다. 운영 DB 스키마와 실제 사용자 거래는 변경하지 않았으며 운영 배포는 사용자 승인 후 별도로 진행합니다.

## 구현 범위

공개 페이지 푸터 링크 묶음 끝에 "생활 계산기"(https://everyday-tools-ko.pages.dev) 링크를 추가했습니다.
링크는 새 창으로 열리고 `rel="noopener"`를 붙이며 주소는 `publicSiteFooter` 한 곳에만 있습니다.
개인 데이터 화면(/my, /app), 카카오 응답, 계산·저장 로직, immutable 자산은 바꾸지 않았습니다.

## 자동 검증

- `node .codex/scripts/verify-repository.mjs`: 파일 체크섬 167개, 자동 검사 5,372개(하한 5,371), Worker 문법·ESM 진입점·Git 공백 검사를 통과했습니다.
- `npm run validate:sister-link`: 소스의 링크 위치·단일 출처·기존 링크 순서, 공개 페이지 10개(/, /about, /contact, /privacy, /terms, /cookies, /site-map, /faq, /how-it-works, /security)의 푸터 노출, 로그인 전후 /my·/app의 외부 링크 부재를 확인하는 44개를 통과했습니다.
- 기존 검사 중 판 번호 정본 검사가 VERSION.txt·package.json·코드의 판을 대조합니다. 검사 파일에는 판 번호를 글자로 박지 않았습니다.
- 기존 164개 파일의 체크섬 범위를 모두 유지하고 신규 검증·안내 파일 3개를 추가했습니다.

소스 SHA-256은 `d7e9d3c9f5781148a5592647f20ae6cac0c3c20b7c7650cd3c3a5ce53ba0776c`입니다.

## 운영과 수동 확인

- 운영 배포는 아직 하지 않았습니다. 사용자 승인 후 검증한 `src/index.js` 전체를 앱 Worker에 교체합니다. 관제 Worker, SQL, 환경변수, Secret, 카카오 설정은 변경하지 않습니다.
- 배포 후 `node tools/verify-deployment-v22920.mjs --origin https://malhaebook.com`으로 버전·공개 경로·개인 HTML 캐시를 확인하고, 브라우저에서 공개 페이지 푸터의 "생활 계산기" 링크가 새 창으로 열리는 것을 확인합니다.
- 생활 계산기 사이트 자체의 가용성과 내용은 이 저장소의 검증 범위 밖입니다. 주소가 커스텀 도메인으로 바뀌면 푸터 링크를 갱신한 새 판이 필요합니다.

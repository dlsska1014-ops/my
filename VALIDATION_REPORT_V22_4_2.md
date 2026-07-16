# V22.4.2 검증 보고서

## 대상
`V22.4.2-PUBLIC-CONTENT-POLICY-UI-STABILITY-BUNDLE`

## 검증 결과
- `node --check src/index.js` 통과
- 공개 페이지 14개 응답·내부 구현 용어 미노출·사업자 푸터 압축 검사 통과
- `/site-map`, `/sitemap.xml`, `/sitemap.xsl` 검사 통과
- XML 사이트맵 표준 네임스페이스 파싱 및 14개 URL 확인
- 쿠키·개인정보 페이지 Google 공식 안내 링크 검사 통과
- V22.4 가계부 생성 무한루프 회귀 통과
- V22.4.1 사용자 식별·가계부 owner 안정성 회귀 통과
- V22.1~V22.4.1 전체 기능 회귀 통과
- NLU 합성 평가 4,738/4,738 통과
- Supabase 요청당 450ms 지연 모의시험에서 자연어·그룹멘션·`/기록` 약 3.9초 통과
- 공개 페이지에서 `OpenBuilder`/`오픈빌더` 및 구체적인 광고 배치 약속 문구가 노출되지 않는지 검사 통과

## 변경하지 않은 영역
- 카카오 `/skill` URL 및 OpenBuilder 설정
- 거래 저장·수정·삭제
- 예산·요약·정산
- 권한·중복 저장 방어
- V22.4.1 계정 통합과 owner 안정화
- Supabase 기존 스키마

상세 실행 출력은 `VALIDATION_LOG_V22_4_2.txt`를 참고합니다.

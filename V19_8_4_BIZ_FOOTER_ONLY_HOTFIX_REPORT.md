# V19.8.4 Biz Footer Only Hotfix

## 목적

사용자 요청에 따라 `/my`와 `/app` 본문에 노출되던 본문 사업자 정보 카드를 제거하고, 하단 사업자 푸터만 유지했습니다.

## 유지되는 사업자 정보

- 상호: 도담 네트워크
- 사업자등록번호: 729-24-02288
- 사업장 소재지: 경기도 평택시 신촌3로 12
- 업태: 정보통신업
- 종목: 응용 소프트웨어 개발 및 공급업
- 서비스명: 똑똑한가계부

## 변경 범위

- `renderBusinessInfoReviewCard()`는 호환용 빈 함수로 변경
- `/my`, `/app` 등 본문 카드 삽입 호출 제거
- `htmlResponse()`의 자동 하단 사업자 푸터 삽입은 유지

## 검증

- `node --check src/index.js` PASS
- ES module import PASS
- 본문 사업자 정보 카드 문구 제거 확인
- 하단 사업자 푸터 유지 확인
- ZIP 무결성 PASS

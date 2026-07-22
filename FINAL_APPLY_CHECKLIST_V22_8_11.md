# V22.8.11 최종 적용 체크리스트

## 적용 전

- [ ] 현재 Worker 코드 백업
- [ ] 현재 환경변수 이름 목록 백업
- [ ] `BUNDLE_FILE_CHECKSUMS_V22_8_11.sha256` 확인
- [ ] 전체 저장소 하네스 통과 확인
- [ ] 운영 배포 승인 확인

## 적용

- [ ] `src/index.js` 전체 교체
- [ ] SQL 실행하지 않음
- [ ] 환경변수·Secret 변경하지 않음
- [ ] Kakao Developers 변경하지 않음
- [ ] OpenBuilder 변경하지 않음

## 적용 후

- [ ] `/health` 버전 확인
- [ ] 새 CSS·JavaScript 200·MIME·캐시 확인
- [ ] V22.8.10 기본 CSS·JavaScript 200 확인
- [ ] PC Chrome 홈·사이드바·주요 메뉴
- [ ] iPhone Safari와 Android Chrome 홈·입력·하단 메뉴
- [ ] 기록·정산·예산·분석
- [ ] 가계부 전환·계정 보안
- [ ] 영수증 OCR
- [ ] 카카오 1:1·그룹

## 실패 시

- [ ] V22.8.10 `src/index.js`로 전체 코드 롤백
- [ ] SQL·환경변수·외부 콘솔 롤백 없음 확인

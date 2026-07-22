# V22.8.10 최종 적용 체크리스트

## 배포 전

- [ ] 현재 Worker 코드 백업
- [ ] 현재 환경변수 이름 목록 백업
- [ ] ZIP 체크섬 확인
- [ ] `VERSION.txt` 확인
- [ ] `DEPLOYMENT_MATRIX.md`에서 SQL 없음 확인

## 적용

- [ ] `src/index.js` 전체 교체
- [ ] SQL 실행하지 않음
- [ ] 환경변수 변경하지 않음
- [ ] Kakao Developers 변경하지 않음
- [ ] OpenBuilder 변경하지 않음

## 배포 후

- [ ] `/health`
- [ ] `/my`와 `/app`
- [ ] `/assets/mobile-home-v22810.css`
- [ ] `/assets/mobile-home-v22810.js`
- [ ] 가계부 전환·참여자 표시
- [ ] 빠른 입력·기록 저장
- [ ] 예산·최근 기록
- [ ] `/my/analysis`
- [ ] `/receipts`
- [ ] `/skill` 1:1·그룹

## 실패 시

- [ ] V22.8.9 `src/index.js`로 전체 롤백
- [ ] SQL 롤백 없음
- [ ] 캐시 문제면 V22.8.9 코드 경로로 복귀 확인

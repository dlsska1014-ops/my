# V22.8.7 최종 적용 체크리스트

## 적용 판단

- [x] 기준 소스: 올바른 V22.8.6 영수증 최적화·안정화본
- [x] `src/index.js` 전체 교체
- [x] 신규 SQL 없음
- [x] 환경변수 변경 없음
- [x] OpenBuilder Skill URL·블록·엔티티 변경 없음

## 배포 전

- [ ] 현재 Worker 코드와 Supabase 데이터를 백업
- [ ] `BUNDLE_FILE_CHECKSUMS_V22_8_7.sha256` 검증
- [ ] 카카오 그룹 챗봇 권한과 테스트 그룹방 준비

## 적용

- [ ] `src/index.js` 전체 교체 후 배포
- [ ] `/health`에서 `V22.8.7-GROUP-CHAT-RESPONSE-MANUAL-ALIGNMENT` 확인
- [ ] 1:1 채팅에서 `시작` QuickReplies 확인
- [ ] 그룹 채팅에서 `시작` 번호형 입력 안내 확인
- [ ] 그룹방 기록·요약·예산·취소 확인
- [ ] 영수증·로그인·메뉴·분석 화면 확인

```bash
bash validate_v2287.sh
```

문제 발생 시 V22.8.6 `src/index.js`로 롤백하며 SQL은 실행하거나 롤백하지 않습니다.

# V22.8.17 최종 적용 체크리스트

- [ ] 현재 Worker 코드와 환경변수 이름 목록 백업
- [ ] `node .codex/scripts/verify-repository.mjs` 통과
- [ ] `src/index.js` 전체 교체
- [ ] SQL·환경변수·Kakao Developers·OpenBuilder를 변경하지 않음
- [ ] `/health`에서 `V22.8.17-KAKAO-EDIT-RESTORE-FIX` 확인
- [ ] `삭제 01번` → `복구 01번` 되돌리기 성공 확인 (이번 핫픽스의 재현 시나리오)
- [ ] V22.8.16에서 삭제해 복구 실패했던 건이 있으면 같은 `복구 NN번` 재시도로 복구 확인
- [ ] `수정 01번` → `지출자 변경` → 번호 선택 회귀 확인
- [ ] 기록 저장·요약·예산·정산 회귀 확인
- [ ] (테이블 생성 환경) `unrecognized_inputs`에서 `type='restore_error'` 신규 발생 없음 확인

실패 시 직전 V22.8.16 `src/index.js`로 전체 코드만 롤백합니다. 단 V22.8.16의 복구 기능은 동작하지 않습니다.

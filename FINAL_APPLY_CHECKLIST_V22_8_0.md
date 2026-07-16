# V22.8.0 최종 적용 체크리스트

## 1. 백업

- [ ] 현재 Cloudflare Worker의 `src/index.js`를 별도 보관
- [ ] Supabase 백업 또는 스냅샷 생성
- [ ] 서비스의 `/backup`에서 테스트 가계부 JSON 백업 저장

## 2. DB 선적용

- [ ] `schema_v22_6_8_operations_integrity.sql` 적용 상태 확인
- [ ] `schema_v22_7_0_auth_atomicity.sql` 적용 상태 확인
- [ ] `schema_v22_8_0_asset_dashboard_complete.sql`을 Supabase SQL Editor에서 실행
- [ ] 오류 없이 `commit`되었는지 확인
- [ ] 함수 `public.accountbook_mutate_payment_assets_v2280`이 존재하는지 확인

## 3. Worker 배포

- [ ] Production Secret 값은 기존 값을 유지하고 화면·로그에 노출하지 않음
- [ ] 새 패키지의 `src/index.js` 전체 반영
- [ ] Cloudflare Production에 배포
- [ ] `/health`의 version이 `V22.8.0-ASSET-DASHBOARD-COMPLETE-STABILITY`인지 확인
- [ ] `/ready`가 ready 상태인지 확인

## 4. 자산 실사용 확인

- [ ] 소유자 계정에서 `메뉴 → 자산·결제수단` 진입
- [ ] 통장 1개, 신용카드 1개, 대출 1개 추가
- [ ] 순자산이 `포함 자산 - 부채`로 계산되는지 확인
- [ ] 잔액 빠른 수정 후 월별 이력과 그래프가 갱신되는지 확인
- [ ] 상세 수정에서 이름·종류·발급사·메모 저장 확인
- [ ] 항목 삭제 후 합계와 이력 갱신 확인
- [ ] 12자리 이상 계좌·카드 번호 입력이 거절되는지 확인
- [ ] 같은 이름을 공백만 다르게 추가해도 중복으로 거절되는지 확인

## 5. 권한·격리 확인

- [ ] 일반 참여자는 자산을 볼 수 있지만 추가·수정·삭제 폼은 보이지 않음
- [ ] 다른 가계부로 전환하면 이전 가계부 자산이 보이지 않음
- [ ] 여러 단톡방·가계부를 쓰는 같은 계정에서도 선택한 가계부 기준으로만 표시

## 6. 기존 핫픽스 회귀 확인

- [ ] `가계부 전환·추가`가 `/my/households`에서 열리고 안전모드로 빠지지 않음
- [ ] 개인 비밀번호 인증 뒤 요청한 내부 화면으로 복귀
- [ ] 기록 목록에서 지출자 표시 및 수정 저장 정상
- [ ] 카카오 인앱 브라우저에서 기록 수정·삭제 정상
- [ ] 외부 사이트의 교차 출처 POST는 차단
- [ ] `/meme-lab`, `/meme-archive`, `/card-benefits`가 Production에서 계속 숨김

## 7. 문제 발생 시

- [ ] 운영 이벤트에서 `asset_rpc_legacy_fallback` 또는 `asset_rpc_non_atomic_fallback` 확인
- [ ] 해당 이벤트가 있으면 V22.8.0 SQL 적용 및 함수 권한을 다시 확인
- [ ] 저장 오류 시 반복 제출 전에 기존 값이 유지되었는지 확인
- [ ] 긴급 롤백은 Worker를 V22.7.3으로 되돌리고 DB 함수는 유지

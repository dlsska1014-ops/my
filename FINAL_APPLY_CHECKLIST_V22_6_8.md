# V22.6.8 최종 적용 체크리스트

## 배포 전

- [ ] Worker 소스와 Supabase 운영 데이터를 백업했다.
- [ ] `OPERATIONS_DATA_INTEGRITY_AUDIT_V22_6_8.sql` 결과를 보관했다.
- [ ] 설정 키·계정·참여행·초대코드·영수증·정기거래 중복 결과가 0행이다.
- [ ] 소유자 없음/다수와 고아 참여·거래가 있으면 복구 담당과 처리 방법을 정했다.
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `USER_SESSION_SECRET`, `CRON_SECRET`을 확인했다.
- [ ] 밈/카드 실적 관련 환경값은 제거 또는 `0`이고 `INCOMPLETE_FEATURE_QA_ENABLED`는 운영에 없다.

## DB 적용

- [ ] `schema_v22_6_8_operations_integrity.sql`이 오류 없이 커밋됐다.
- [ ] V22.6.8 고유 인덱스 6개가 보인다.
- [ ] `accountbook_claim_operation`, `accountbook_release_operation` 함수가 보인다.
- [ ] 잠금 테이블과 함수가 anon/authenticated가 아닌 service_role 전용이다.

## Worker 배포

- [ ] `src/index.js`를 배포했다.
- [ ] `/health`가 `V22.6.8-OPERATIONS-DATA-INTEGRITY`을 반환한다.
- [ ] `/health`의 `integrity`가 `atomic-dedup-and-cron-lease`다.
- [ ] `/meme-lab`, `/meme-archive`, `/share/meme`, `/card-benefits`가 404·noindex다.

## 핵심 기능

- [ ] 동일 영수증을 연속 저장해 한 건만 남고 중복 이유가 안내된다.
- [ ] 원문이 다른 정상 영수증은 사람 확인 후 각각 저장할 수 있다.
- [ ] 정기거래 Cron을 두 번 실행해 두 번째에 중복 거래가 생기지 않는다.
- [ ] 정산 완료 버튼을 연속 제출해 이력 한 건만 남는다.
- [ ] 주간·월간 리포트가 선택 가계부 범위에서만 생성된다.
- [ ] owner/admin/member/viewer/pending/blocked 권한이 기존 기준대로 동작한다.
- [ ] 참여하지 않은 가계부 ID로 조회·저장을 시도하면 거부된다.
- [ ] 한 계정의 여러 가계부와 여러 단톡방 연결이 서로 덮어쓰지 않는다.

## Cron·운영

- [ ] 정기거래와 리포트 응답의 `lock_mode`가 `database`다.
- [ ] 같은 Cron을 동시에 호출하면 한 응답이 `skipped_run: true`다.
- [ ] `failed`, `invalid`, `scheduled_partial`, `operation_lock_release_failed` 이벤트를 확인했다.
- [ ] 사용자가 요청하지 않은 카카오 메시지나 외부 전송이 발생하지 않는다.

## 실기기

- [ ] iPhone Safari 또는 카카오 인앱브라우저에서 홈·가계부 생성·보안 설정·메뉴·예산을 확인했다.
- [ ] Android Chrome 또는 카카오 인앱브라우저에서 같은 흐름을 확인했다.
- [ ] 키보드가 열린 상태에서 저장 버튼과 하단 메뉴가 가려지지 않는다.
- [ ] 긴 가계부 이름·금액·카카오 닉네임으로 줄바꿈과 가로 넘침을 확인했다.


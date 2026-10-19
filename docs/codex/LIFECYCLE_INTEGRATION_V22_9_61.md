# V22.9.61 수명주기 RPC 연결

V60의 추적·미추적 실제 파일 853개를 별도 디렉터리에 독립 복사한 후보입니다. V58·V59·V59 복구·V60의 파일 바이트·mtime·Git 상태·index 보존과 이번 작업의 실제 변경 목록은 외부 증거로 확인합니다. 생성 Worker는 모듈 수정 후 build:worker로 생성합니다.

소속 등록과 상태 변경은 accountbook_import_source_v22960에 가계부 ID·source_hash·전체 expected/next 텍스트를 전달합니다. 일반 가져오기는 accountbook_commit_import_v22960에 원래 pending 텍스트와 고정 행을 전달합니다. 관리자 JSON·백업 적용과 가져온 거래 삭제 취소도 같은 commit RPC를 사용하며 소속이 확인된 pending을 우회하지 않습니다. 쓰기 성공 응답이나 ID 존재만으로 완료를 판단하지 않습니다. 원래 저장 필드 전체를 대조하고 이전 pending의 정확한 바이트 CAS가 성공해야 DB 상태가 완료됩니다.

가계부 삭제는 소속 표식과 해시로 확인한 pending만 조건부로 완료시킨 뒤 accountbook_purge_household_v22960을 호출합니다. 이 RPC가 가져오기 metadata와 관계형 자료를 같은 트랜잭션에서 지우므로 기존 별도 HTTP metadata 삭제는 제거했습니다. 카카오 이력·그룹 해제·비가져오기 설정 정리와 소유자/재인증/구성원 보호는 유지합니다. 생성 실패 보상 삭제도 새 purge를 사용합니다.

V60 초안에서 확인된 구형 관리자 REST 우회는 backup_import_v19_3 직접 INSERT도 차단하는 가드로 보완했습니다. 원래 백업 거래의 카카오 삭제 취소는 새 계약에서 같은 ID와 출처를 유지합니다. 이를 위해 구형 내부 import 본문은 새 프로토콜에서만 진입하도록 가드하고, source가 backup_import_v19_3인 복구 행만 그 출처를 보존합니다. 나머지 일반 가져오기는 기존 my_import 출처를 유지합니다. 두 SQL 본문의 차이와 새 RPC는 검토용 적용안에서 확인할 수 있습니다.

Worker 임대가 만료되어도 이미 전송한 SQL은 살아 있을 수 있습니다. 같은 pending의 jti·행·값·ID를 보존하고 다른 expected 값·완료 후 도착·삭제 후 도착은 거절합니다. 새 RPC 부재 시 구형 RPC/REST를 사용하지 않습니다. 원문·유효 토큰이 사라지고 정확한 저장값도 확인되지 않은 pending은 자동 해제하지 않습니다.

검증 증거는 D:/Github_Kakao_Account/review-artifacts/v61-lifecycle-integration-2026-10-17/RESULT.json과 lifecycle/attempt-*에 기록합니다. Node 메모리 모형, 실제 PostgreSQL RPC/행 조회, 전체 하네스와 Node 22 SQLite 결과를 구분합니다. 로컬 PostgreSQL 시험의 인증·Worker 임대 부분은 Node 픽스처이며 실제 Supabase/PostgREST나 운영 전환 검증이 아닙니다. 기존 카탈로그 SELECT와 R2 SQL 검증은 반복하지 않았습니다.

운영 적용안과 중지안은 docs/db-review/v22961에 있습니다. 저장된 지정 객체 카탈로그를 대조했으나 전체 운영 스키마의 미관측 객체·외부 호출자·ACL·시퀀스·트리거·전환 조건은 추가 검토가 필요합니다. 실행 차단문이 있는 검토 자료이며 바로 적용할 운영 SQL이 아닙니다. CPU/count 비용, 실제 바인딩과 활성 content, iOS Safari·Android Chrome·카카오 인앱과 보조기기 확인도 남아 있습니다. 별도 승인을 받은 운영 적용 완료로 표현하지 않습니다.

호환 복구 후보는 같은 실제 소스를 복사해 빌드 시 가져오기 쓰기를 차단합니다. 새 RPC·전체 값 CAS·pending 보호·원자적 purge를 유지하며 구형 Worker로 단순 복귀하지 않습니다. 복구 모드는 이미 시작된 요청을 취소하지 않습니다.

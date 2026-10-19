# V22.9.59 검증 근거

최종 실행 결과와 Worker 해시의 정본은 D:/Github_Kakao_Account/review-artifacts/v59-local-contract-2026-10-17/FINAL_REPORT.json입니다. 전체 stdout·stderr와 명령·종료 코드·런타임·로그 SHA-256은 같은 폴더에 보관합니다. 실패 이력도 덮어쓰지 않습니다.

시작 원본은 839개 파일·체크섬529개이며 Worker SHA-256은 82499308518100533ea176800e9793a495993ed13ef1a3325436c5b38f7be5c4입니다. SETUP.json, SOURCE_BEFORE.json, CANDIDATE_START.json과 최종 SOURCE_PRESERVATION.json을 통해 실제 파일·mtime·Git 상태·diff·index와 독립 복사를 대조합니다.

새 회귀는 미리보기·서명·고정 ID·RPC·저장 행·화면 건수·재분석 사유를 구분합니다. 소속 불명 구형 상태, 다른 가계부 pending, 저장/삭제 경쟁과 부분 실패를 검사합니다. 복구 후보 검사는 같은 토큰·열린 탭·만료·소실·원래 요청의 지연 완료를 포함합니다. 전체 두 모드·540개 체크섬·ESM·공백 검사와 Node v22.23.1 SQLite84개는 실제 실행 로그를 따릅니다.

합성 모형은 PostgreSQL·PostgREST·RLS·DB 트랜잭션·운영 CPU·실기기 증거가 아닙니다. 과거 Chrome149개를 새 실행 결과로 합산하지 않습니다. SQL 검토문은 미실행이며 운영 적용, 현재 연결 대조, 실제 복구 승격과 실기기 검증은 별도 후속입니다.

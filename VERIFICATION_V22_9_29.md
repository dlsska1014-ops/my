# V22.9.29 검증 기록

## 현재 상태
- 운영 Worker: 직전 V22.9.28 f82db225-cde1-40a0-92d9-25123308b4a2 유지.
- 운영 SQL: 원래 함수 정의와 저장소 V22.9.28 원문 일치 확인. 신규 SQL 미적용.
- 신규 Worker·GitHub push: 대기.

## 확인 완료
- Node.js v26.5.0, Worker 문법 검사.
- validate-remaining-ops-v22929.mjs 206개: 달력·중복·전체 배치 거부·참여 권한·검색 한도·조회 GET/HEAD 시간 제한·늦은/불명확한 소유자 저장·사용자 생성/OAuth 삭제 방지·1,000건 후보/참여자 초과 중단. 모두 가상 fixture 쓰기.
- validate-chat-first-v22928.mjs 258개: 명확한 400 거부 보상과 503 불명확 후보 보존, 재시도 관찰과 고정 UUID 증명을 분리·강화.
- validate-launch-review-followups-v22926.mjs 125개: 기존 잘못된 말일 차단 요구를 실제 31일 반영 검사로 대체하고 원본 alias 실패 원인을 유지.
- 운영 PostgreSQL 순수 SELECT 17개 날짜 경계 모두 true. 금융 테이블/RPC를 실행하지 않음.
- 운영 함수 메타: accountbook_apply_recurring_v227(uuid,text), security_definer=true, search_path=public, service_role 실행 가능, anon/authenticated 실행 불가.
- 기존 recurring PK/FK/type 검사와 recurring identity/cloud 거래 유일 인덱스 확인.
- 등록 x-api-key를 사용한 가상 읽기 전용 요청 200, 다른 키 403. 실제 카카오 앱 전달/대화 완료의 증명과 구분.
- V5 새 번들 /assets/accountbook-v5-v22929.js: 85,460 bytes, ETag accountbook-v5-v22929-js, SHA-256 453e3d0963d6591573562c986e983e4c57bfd4a700fd6c0d4dacfacbfc7ce030.

## 대기
- 독립 보안·SQL 검토, 최종 전체 하네스·새 체크섬.
- 별도 SQL 승인과 최소 함수 정의 적용·읽기 전용 재확인.
- Worker 배포·운영 소스 해시·트래픽·기존 설정 보존·공개 스모크와 GitHub push.

## 외부 수동/제약
- 실제 1:1/그룹·OAuth 실계정·실기기 접근성·실제 금융 데이터 쓰기.
- 실제 PostgreSQL 금융 RPC 실행 및 다중 isolate 경합은 수행하지 않음.
- 쓰기 강제 타임아웃은 결과 조정·호출자 안전성 검토가 끝나기 전 적용하지 않음.
- 협력 lease는 직접 DB writer와 이미 시작된 만료 이후 커밋을 완전히 fence하지 않음.
- 기존 잘못된 28일 거래·지정일을 추정해 자동 수정하지 않음. 과거 관리자 입력이 28로 저장된 경우 원래 의도는 복원할 수 없고 사용자 확인이 필요함.

## 독립 검토 보완
- SQL 정적 호환성 검토 PASS: forward/rollback은 날짜 clamp 하나만 다르고 기준 SQL 함수와 forward 본문이 동일합니다.
- 보안 검토의 3개 P1(참여 재조회 원인 소실·4개 정기 폼 거짓 재시도 안내·금융 JSON/목표)은 모두 수정했고 좁은 재검토에서 해결 확인했습니다. P0 없음, 남은 범위 내 blocker 없음.
- 추가 회귀까지 신규 206개, core_write_smoke 108개, 첫 기록 258개, 후속 125개 통과.
- Supabase Data API 설정 읽기 전용: Max rows=1000, Pool size 자동, 새 테이블 자동 노출 켜짐. Max Rows는 유지 가능하며 자동 노출 끄기는 별도 승인할 미래 객체 권한 강화 후보입니다. 기존 객체 권한/노출을 임의 변경하지 않음.

## 최종 사전 운영 게이트
전체 하네스 6,129개(하한 6,129)·체크섬 185개·ESM default.fetch·Git 공백 검사 통과. 최종 src/index.js SHA-256: 85dc239dcdf384001503e3a064b74962069fea3b9b755bc69251b6f15fde1ec0.
Cloudflare 현재 Free 요금제, 하루 100,000 요청·요청 CPU 10ms 한도를 UI로 확인. 마지막 대시보드 표시 error rate 0%, median CPU 4.01ms는 제한 초과 부재나 p95 여유의 완전한 증명이 아닙니다. 비용 확대 승인 없이 요금제·CPU 설정을 변경하지 않습니다.
운영 SQL·Worker·Data API 미래 객체 자동 노출 설정은 아직 적용하지 않았으며 별도 승인 대기입니다. Secrets·Kakao 설정·기존 금융 행은 변경하지 않았습니다.

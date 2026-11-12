# 백업·복구 운영 절차

갱신 2026-11-12(V22.9.119 O-2). 실제로 해 본 절차와 아직 준비만 한 것을 나눠 적는다. 앱 CSV 내보내기는 서비스 전체 백업이 아니다.

## 지금 상태
- 운영 DB 는 Supabase 서울 프로젝트 `jqzmpzdqvmzkxznnylkp`(2026-11-05 19:09 KST 부터)이고 **Free 요금제라 대시보드에서 내려받을 자동 백업이 없다.** 백업은 운영자 PC 에서 직접 받는 `pg_dump` 덤프뿐이다.
- 앱은 Supabase Storage·Auth 를 쓰지 않는다(`src/modules` 에 `storage/v1`·`auth/v1` 호출 없음, 2026-11-12 확인). 소비 카드 이미지(`/meme-image`·`/share/meme-image`)도 파일로 저장하지 않고 요청 때마다 SVG 로 그린다(공유 카드는 `accountbook_meme_cards` 표의 행에서, `features/meme-cards.js`). 앱 데이터는 모두 `public` 스키마의 표 18개다 → `public` 스키마 덤프가 앱 데이터 전부다.
- 지금까지 받은 덤프(모두 저장소 밖, 운영자 PC):
  - 2026-11-05 14:23 KST — 옛(시드니) 프로젝트 전체 덤프. 서울 이전에 실제로 복원해 썼다(아래 ‘복원 리허설’). 이전이 끝난 뒤 데이터 파일은 지웠다.
  - 2026-11-10 13:44 KST — 서울 운영 프로젝트(pg_dump 17). 표 18개의 COPY 행 수가 덤프 직전에 센 행 수와 같았다(차이 0). 지우지 않고 보관 중.
  - 다음 수동 덤프는 2026-11-19(출시 전날 점검), 그 뒤로는 매일 덤프(준비만 됨, 아래).
- 목표: 기록 손실 허용(RPO) 24시간, 복구 시간(RTO) 하루. **매일 덤프를 등록하기 전까지 실제 RPO 는 ‘마지막 수동 덤프 뒤 전부’다.** 등록 뒤에도 PC 가 꺼져 있던 날은 그날 덤프가 없다.

## 도구와 스크립트(저장소 밖, 운영자 PC 의 `review-artifacts/supabase-seoul-migration/`)
- PostgreSQL 17 명령줄 도구(`C:\Program Files\PostgreSQL\17\bin` 의 `pg_dump`·`psql`). 운영 PostgreSQL 이 17 이라 같은 판을 쓴다.
- 접속은 Supabase **Session pooler**(포트 5432, 사용자 `postgres.<프로젝트 ref>`). 주소는 Supabase 대시보드의 Connect 화면에서 본다.
- 비밀번호는 `%APPDATA%\postgresql\pgpass.conf` 에만 둔다(`pgpass-write.ps1` 이 화면에 안 보이게 적는다). 비밀번호·접속 URI·키를 저장소·CI 로그·대화·Aside 지시문에 적지 않는다.
- `11-dump-auto.ps1 -Ref <ref> -PgHost <Session pooler 주소>` — 덤프 한 벌: `dump\<yyyyMMdd-HHmmss>\` 에 `schema.sql`(public 스키마만)·`data.sql`(public 데이터)·`counts-old.tsv`(표마다 행 수 + 함수·정책·트리거·인덱스·뷰 수, `counts.sql`)·`custom-roles.txt`(사용자 정의 역할이 있을 때). 운영 DB 는 읽기만 한다.
- `12-restore-auto.ps1` — 덤프를 **새 빈 프로젝트**에 단일 트랜잭션으로 복원한다. `13-compare-auto.ps1` — 두 프로젝트의 행 수·함수·정책·트리거·인덱스·뷰 수를 대조한다.
- `20-daily-dump.ps1` + `REGISTER-DAILY-DUMP.md` — 매일 덤프(초안, 2026-11-12). `11-dump-auto.ps1` 을 불러 `dump\daily\<시각>\` 에 받고, 행 수 요약을 `dump\daily\daily-dump.log` 에 남기고, 성공한 날에만 최근 14벌을 넘는 가장 오래된 폴더를 지운다(핵심 표 users·households·household_members·transactions 중 하나라도 행 수가 직전 매일 덤프보다 20% 넘게 줄면 — 새 값 < 직전 값 × 0.8 — 지우지 않고 경고. 직전 매일 덤프에서 5행 이상인 표만 견주고, 첫 매일 덤프는 견주지 않는다). **작업 스케줄러 등록·첫 실행은 사용자가 한다(예정 2026-11-19).**
- 덤프(특히 `data.sql`)에는 모든 사용자의 기록이 평문으로 들어 있다. 저장소(공개)에 넣지 않는다. PC 밖 사본은 암호화해서만 둔다(BitLocker To Go 디스크 또는 비밀번호 건 7z, 방법은 `REGISTER-DAILY-DUMP.md`).

## 복원 리허설 기록(2026-11-05 서울 이전 = 실제 복원)
- 순서: 옛 프로젝트 덤프(14:23) → 새 서울 프로젝트에 복원 → 행·함수·정책·트리거·인덱스·뷰 대조(23줄 모두 같음) → 쓰기 멈춘 뒤 데이터만 다시 받아 넣기(약 30초) → Cloudflare Secret 두 개(`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`)를 새 값으로 올린 version 승격(19:09:48) → `/ready`·행 수·실제 기록으로 확인. 덤프부터 전환까지 약 5시간(권한 정리 포함).
- **복원 뒤 권한이 넓어져 있었다**: 새 프로젝트에서 `anon`·`authenticated` 가 표 18개 전부에 쓰기, 함수 23개 실행, 기본 권한(default privileges)까지 가지고 있었다. `pg_dump` 는 내장 기본값과 다른 GRANT 만 내보내므로, 새 프로젝트의 기본값이 넓으면 덤프로는 좁혀지지 않는다. 옛 프로젝트의 ACL 로 REVOKE 를 만들어 맞췄다(표·시퀀스·함수 ACL, 기본 권한, 스키마 ACL, 표 18개의 RLS 플래그 차이 0).
- 그래서 **어느 복원이든 끝에 권한·RLS 대조가 필수**다: `pg_class.relacl`(표·시퀀스), `pg_proc.proacl`(함수), `pg_default_acl`, `pg_namespace.nspacl`·스키마 owner, `pg_class.relrowsecurity` 를 원본과 견주고 차이가 0 이 될 때까지 새 쪽을 좁힌다. 대조 SQL·결과는 저장소 밖 `cutover-2026-11-05/` 에 있다.
- 복원 대상은 언제나 **운영과 상관없는 새 빈 프로젝트**다. 운영 프로젝트 `jqzmpzdqvmzkxznnylkp` 나 옛 시드니 프로젝트에 덤프를 되돌려 넣지 않는다.

## 장애 때 복구 순서(실제 운영 전환은 사용자 지목 뒤에만)
1. 가장 최근 성공 덤프를 고른다(`dump\daily\daily-dump.log` 의 마지막 ‘성공’ 줄, 없으면 수동 덤프). 그 시각 뒤의 기록은 되살릴 수 없다는 것을 먼저 알린다.
2. 새 빈 Supabase 프로젝트(서울 ap-northeast-2)를 만든다(사용자). `pgpass.conf` 에 새 프로젝트 줄을 더한다.
3. `12-restore-auto.ps1` 로 복원 → `13-compare-auto.ps1` 로 덤프의 `counts-old.tsv` 와 대조(표 18개 행 수·함수·정책·트리거·인덱스·뷰).
4. 위 ‘권한·RLS 대조’를 원본(살아 있으면 운영, 아니면 덤프의 `schema.sql` GRANT·REVOKE)과 해서 차이 0 으로 맞춘다. `notify pgrst, 'reload schema'`.
5. 합성 시험 계정으로 앱 읽기·쓰기를 본다(원문 금융 행을 대화·문서에 옮기지 않는다).
6. 사용자가 지목하면 Cloudflare Secret 두 개를 새 프로젝트 값으로 올린 version 을 승격한다(값은 대화에 적지 않는다). 그다음 `/ready`, 행 수, 카카오·웹 기록 한 건씩.
7. 무엇을 언제 복원했는지(덤프 시각·잃은 범위·걸린 시간)를 배포 기록과 `SQL_HISTORY.md` 에 남긴다.

## 아직 안 한 것
- 매일 덤프의 작업 스케줄러 등록·첫 자동 실행(사용자, 2026-11-19 예정).
- PC 밖 암호화 사본(주 1회 권장) — 아직 한 번도 두지 않았다.
- 분기 복원 시험(새 빈 프로젝트에 최근 덤프를 복원하고 위 대조까지) — 11-05 이전이 마지막이다.
- Supabase 유료 요금제의 자동 백업·시점 복구(PITR)는 쓰지 않는다(유료 전환은 사용자 추이 뒤로 결정, 2026-11-05).

## legacy-only 계정 복구

V22.9.30은 FNV 32비트 값으로 로그인 또는 삭제/자격 변경을 인증하지 않습니다. 강한 identity가 이미 있으면 이전 이름·옛 코드로 이를 덮어쓰지도 않습니다. legacy-only 계정은 금융 행과 사용자 ID를 삭제하지 않은 채 복구 대상으로 남습니다.

원래 연결한 카카오 계정이나 새로 발급받은 개인 1회용 웹 코드로 확인할 수 있으면 해당 계정의 5분 증명으로 강한 비밀번호를 설정합니다. 그것도 없는 계정은 기존 관리자 감사·복구 절차로 실제 소유 관계를 확인한 뒤 별도 승인된 연결/병합을 검토합니다. 약한 코드 충돌을 안전한 소유 증명으로 취급하거나 새 계정을 만들어 기존 행을 자동 옮기지 않습니다.

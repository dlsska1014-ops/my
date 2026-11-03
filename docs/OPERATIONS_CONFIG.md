# 운영 설정 이름 (Cloudflare Worker `kakao-accountbook`)

V22.9.76 작성(감사 G-15). 값은 적지 않는다. 이름과 빠졌을 때의 동작만 적는다. 바꿀 때는 Cloudflare 대시보드에서 바꾸고,
바꾼 뒤에는 배포 스크립트로 새 판을 올리기 전에 다시 업로드한다(업로드 뒤 Secret 을 바꾸면 승격이 거절된다, 감사 G-4).

## 필수 (없으면 `/ready` 503)

| 이름 | 쓰는 곳 |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 모든 DB 요청 |
| `ADMIN_SESSION_SECRET` | 관리자 로그인 세션 서명 |
| `USER_SESSION_SECRET` | 사용자 로그인 세션 서명 |
| `ADMIN_API_TOKEN` | 관리자 API Bearer. **`/cron/*` 도 이 Bearer 로 통과한다** |
| `MY_IMPORT_TOKEN_SECRET` | 웹 가져오기 토큰 서명 |

목록의 정본은 `src/modules/runtime/config-readiness.js` 의 `REQUIRED_RUNTIME_CONFIG` 다.

## 카카오 스킬 호출자 인증

| 이름 | 동작 |
|---|---|
| `KAKAO_SKILL_SECRET` | OpenBuilder 가 보내는 `x-api-key`(또는 `x-kakao-skill-secret`, `Bearer`) 와 비교. 없으면 인증 꺼짐 |
| `KAKAO_SKILL_AUTH_REQUIRED` | `1` 이면 Secret 이 없을 때 `/ready` 503 이고, V22.9.76 부터 `/skill` 도 403 으로 막는다 |
| `KAKAO_SKILL_AUTH_MODE` | `observe` 면 틀린 헤더도 세기만 하고 통과(헤더를 맞추는 동안의 비상용). 켠 채 두지 않는다. 현재 값은 `/ready` 의 `skill_caller_auth.mode` |

## 카카오 로그인 (웹)

`KAKAO_LOGIN_ENABLED`, `KAKAO_REST_API_KEY`, `KAKAO_REDIRECT_URI`, `KAKAO_CLIENT_SECRET`, `KAKAO_CLIENT_SECRET_REQUIRED`.
상태는 관리자 운영 진단 화면(`src/modules/admin/ops-diagnostics-pages.js`)에 보인다.
`KAKAO_INAPP_AUTO_LOGIN`(V22.9.91, 없으면 켬): 카카오톡 인앱 브라우저에서 세션 없이 /my·/app 을 열면 카카오 로그인을 화면 없이(prompt=none) 한 번 해 본다. `0` 이면 끈다. 위 로그인 설정이 준비되지 않으면 저절로 쉰다.
자동 로그인은 새 계정을 만들지 않고, 가계부나 이을 계정이 있는 웹 계정만 들인다.

`KAKAO_ACCOUNT_LINK_ENABLED`(V22.9.91, 없으면 끔): 단톡방 기록 계정과 웹 계정 잇기(/my 의 안내, /my/account-link 확인 화면, 합치기)를 켠다. `1` 이면 켠다.
꺼져 있어도 잇기 제안(`kakao_login_link_offers_v22991`)과 appUserId 진단은 남는다. 켜는 것은 설정 변경이라 사용자 승인 뒤에 한다.
켜기 전 확인(DEPLOYMENT_MATRIX V22.9.91 절): 카카오 콘솔에서 웹 로그인 앱 1489689 를 그룹 챗봇에 연결하고, 운영자 자신의 갈라진 계정으로 관리자 /identity-audit 의 ‘appUserId 옴’과 잇기 제안을 본다.
TEST 앱 1508592 는 연결하지 않는다(다른 회원번호가 와 남의 웹 계정을 가리킬 수 있다). 관리자 진단 칸이 이 값의 켜짐·꺼짐을 보인다.

## 예약 작업 (cron)

- 일정(Triggers)은 저장소가 아니라 Cloudflare 대시보드에 있다. 정기 항목 자동 기록과 월간 리포트 생성이 이 일정으로 돈다.
- 수동 실행 경로 `POST /cron/recurring/apply`, `POST /cron/reports/generate` 는 `CRON_SECRET`(`x-cron-secret` 또는 `Bearer`) 이나 `ADMIN_API_TOKEN` Bearer 로 통과한다.
- 임대 시간: `CRON_RECURRING_LEASE_SECONDS`, `CRON_REPORT_LEASE_SECONDS`(기본 900초).
- 감사 기록 보존(V22.9.95): `AUDIT_RETENTION_DAYS`(기본 180, 30~3650 밖이면 180 으로 돌고 운영 이벤트 `audit_retention_days_invalid`). 매일 예약 실행의 정리 단계가 이 일수를 넘은 `accountbook_transaction_audit` 행을 오래된 것부터 500행 × 2묶음까지 지운다(더 남으면 다음 실행). 개인정보처리방침 9절의 ‘거래 변경 이력 180일’ 이 이 기본값에 기대므로 값을 바꾸면 방침 문구도 바꾼다.

## 관제

`OPS_MONITOR`(관제 Worker 서비스 연결), `OPS_MONITOR_TOKEN`(공유 Bearer), `OPS_MONITOR_PUBLIC_ORIGIN`(관제 화면 주소).
둘 중 하나라도 없으면 앱은 표본을 보내지 않고 그대로 동작한다. 관제 쪽 설정은 `monitoring/README.md`.

## 광고

`ADS_MODE` 는 정확히 `live` 일 때만 광고 코드를 넣고 그 밖에는 `review`. `ADS_SLOT_CONTENT` 는 숫자 8~12자리만 쓴다(`src/modules/public/site-config.js`).

V22.9.92: `ADS_MODE` 가 정확히 `adfit` 이면 카카오 애드핏이다. 공개 정본 문서 45쪽에만 광고 자리 하나를 두고(로그인 뒤 화면 5개는 빼고), Google 광고 코드는 싣지 않는다.
애드핏 광고 단위는 `ADFIT_UNIT_CONTENT`(애드핏이 발급한 광고단위 ID, `DAN-` 뒤 영문·숫자 6~32자)와 `ADFIT_UNIT_SIZE`(`320x50`·`320x100`·`300x250`·`250x250` 중 하나)다.
둘 중 하나라도 맞지 않으면 광고·CSP 확장·정책 문구 변경이 모두 없다. 상태는 `/ready` 의 `ads_mode`·`adfit_unit`(`ok`·`missing`, 애드핏일 때만)이다.
애드핏을 `ADS_MODE` 의 새 값으로 둔 것은 되돌리기 때문이다. V22.9.91 까지의 판은 `adfit` 을 `review` 로 읽어 광고를 싣지 않는다.
광고 코드는 요청 호스트를 보지 않는다. `CANONICAL_REDIRECT=1` 이 아니면 workers.dev·미리보기 주소에서도 같은 광고 코드가 실리므로 켜기 전에 확인한다.
켜는 순서와 확인은 DEPLOYMENT_MATRIX V22.9.92 절이다. 애드핏 신청·변수 설정은 각각 사용자 승인 뒤에 한다.

## 후원·공지·법무 (V22.9.95, 모두 선택)

후원 안내 `/support` 와 후원자 표시는 운영 변수로만 켠다(값은 사용자가 준다. Secret 이 아니라 일반 변수이고 `/health`·`/ready` 에 내보내지 않는다. 변수는 `src/modules/public/support-page.js` 한 곳에서만 읽는다):
`SUPPORT_KAKAOPAY_URL`(카카오페이 송금 링크), `SUPPORT_BANK_ACCOUNT`(계좌 한 줄, 100자 이하), `SUPPORT_TOSS_URL`(토스 송금 링크), `COMMUNITY_OPENCHAT_URL`(누구나 들어오는 오픈채팅),
`SUPPORTER_OPENCHAT_URL`(후원자 오픈채팅 — 공개 페이지에는 싣지 않고 후원자의 /menu 화면 설정에만). 주소는 http(s) 만 받고 따옴표·공백·계정 정보가 든 값은 무시한다.
셋(카카오페이·계좌·토스)이 다 없을 때 `COMMUNITY_OPENCHAT_URL` 이 있으면 /support 의 ‘후원하는 방법’ 은 ‘오픈채팅방에서 운영자가 직접 안내’ 문장 + 오픈채팅 경유 링크이고(V22.9.97, 사용자 2026-11-03 결정: 운영 값 https://open.kakao.com/o/sKbnenVi), 그것도 없으면 ‘준비 중’ 한 줄이다. 후원자 표시 자체는 변수 없이 관리자 `/admin/supporters` 에서 켠다(설정 표 `supporter:<user_id>`).
V22.9.97 후원 지표(변수 없음, 새 SQL 없음): 송금·오픈채팅 단추는 변수 주소를 바로 싣지 않고 경유 주소 `GET /support/go/<kind>`(kakaopay·toss·openchat·supporter-openchat)로 간다 — 변수가 있으면 그 주소로 302(캐시 없음·리퍼러 없음·noindex)하며 누른 수를 세고, 변수가 없거나 http(s) 가 아니거나 모르는 종류면 404 다. supporter-openchat 은 켜진 후원자 세션에만 302 한다.
/support 화면이 실제로 보일 때 `POST /support/visit`(늘 204)로 방문을 센다. 집계는 설정 표 `accountbook_settings` 의 `support_stats:<KST 날짜>` 한 줄(`{visits, clicks:{kakaopay,toss,openchat,supporter_openchat}}`, 대략값, 사용자 id·IP 없음, 봇 UA 제외)이고 `/internal/ops-usage` 의 `support` 칸(최근 30일 합계·활성 후원자 수)으로 관제 1.6.0 이용 현황의 ‘후원(대략, 30일)’ 줄에 보인다(관제 1.5.0 은 칸을 버린다).
후원 변수를 넣으면 그때부터 경유 주소가 302 로 살아나고, 변수 추가는 그 자체가 새 배포다(운영은 2026-11-03 13:30 부터 `COMMUNITY_OPENCHAT_URL` 이 있어 바인딩 33, 나머지 넷까지 넣으면 최대 37).

공지 띠: `NOTICE_TEXT`(200자, 이스케이프)와 `NOTICE_LINK`(같은 사이트 경로 `/…` 또는 따옴표·꺾쇠 없는 https 주소만). 있으면 /app·/my·/my/*·공개 문서의 머리말 위에 띠가 붙고, 없으면 띠가 없다.
  - 방침 개정 안내(E-17, V22.9.96 재결정으로 공고일 = 시행일 2026-11-02): 개정을 알리는 띠를 켜려면 `NOTICE_TEXT` = `개인정보처리방침과 이용약관을 11월 2일에 개정해 바로 적용하고 있어요.`, `NOTICE_LINK` = `/privacy`. 변수를 더하면 Worker 바인딩이 30 → 32 가 되므로 다음 배포 대조(지시문의 바인딩 수)를 그 값으로 바꾼다. 변수 추가·삭제는 그 자체가 새 버전·배포다. 출시(11-13) 뒤 일주일쯤 지나면 두 변수를 지운다. V22.9.95 배포(11-02 18:17)에는 넣지 않았고, V22.9.96 배포 직후 사용자 지시("개정 공고 … 지금 바로")로 넣는다.

법무: 약관·개인정보처리방침의 개정일은 환경변수가 아니라 코드 상수 `POLICY_REVISION_DATE`(`src/modules/public/site-config.js`)다. 동의 기록 `consent:<user_id>` 의 version 도 이 값이다.
배포 전에 사용자가 정한 날짜로 바꾸고 하네스·manifest 를 다시 만든다.

## 주소

`PUBLIC_BASE_URL`, `CANONICAL_BASE_URL`, `CANONICAL_REDIRECT`, `APP_BASE_URL`, `SERVICE_BASE_URL`, `SUPPORT_EMAIL`·`PUBLIC_SUPPORT_EMAIL`.

## 조정용 (없으면 코드 기본값)

요청 제한 `SKILL_RATE_LIMIT`·`SKILL_RATE_WINDOW_MS`·`SKILL_IP_GUARD_LIMIT`·`TRAFFIC_GUARD_LIMIT`·`TRAFFIC_GUARD_WINDOW_MS`·`AUTH_RATE_LIMIT`·`AUTH_ACCOUNT_RATE_LIMIT`,
카카오 `KAKAO_BULK_LIMIT`·`KAKAO_RESPONSE_BUDGET_MS`·`KAKAO_RETRY_DEDUP_SECONDS`·`KAKAO_REPEAT_GUARD_SECONDS`·`DUPLICATE_GUARD_SECONDS`·`KAKAO_DEFAULT_HOUSEHOLD_ID`,
DB `SUPABASE_READ_ATTEMPT_MS`·`SUPABASE_WRITE_TIMEOUT_MS`, 가져오기 `MY_IMPORT_LIMIT`·`MY_IMPORT_MAX_BYTES`, 자산 `PAYMENT_ASSET_LEASE_SECONDS`,
NLU 기록 `NLU_*`. 전체 목록은 `grep -rhoE "env[.?]+[A-Z][A-Z0-9_]+" src/modules | sort -u` 로 본다.

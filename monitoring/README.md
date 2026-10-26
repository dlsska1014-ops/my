# 말해가계부 종합 관제

상태: V22.9.23에서 관제 Worker와 전용 D1·Secrets를 운영에 연결했습니다.
앱 전체 교체와 실제 자동 수집 확인을 완료했습니다. 관리자 주소는 `https://malhaebook.com/ops-monitor`입니다.

## 수집 항목과 판단

| 항목 | 출처와 범위 | 확인 주기 | 판단 기준 |
|---|---|---|---|
| Workers 요청·런타임 오류 | Cloudflare GraphQL, 계정 전체와 앱을 구분합니다. | 5분 | Free 일간 100,000회와 최근 1시간 추세를 비교합니다. UTC 자정에 초기화합니다. |
| D1 읽기·쓰기·저장 용량 | Cloudflare GraphQL, 계정 전체입니다. | 5분 | Free 일간 읽기 500만 행·쓰기 10만 행과 저장 용량 5 GiB를 비교합니다. 저장 용량은 DB별 일간 최대값의 합입니다. |
| DB 용량·CPU·연결·메모리 | 기존 앱이 Supabase Metrics를 조회한 뒤 허용한 숫자만 전달합니다. | 5분 | Free DB 논리 용량 500 MiB를 비교합니다. CPU는 누적 카운터 차이로 계산합니다. |
| 서비스 접속·DB 준비 상태 | 공개 `/health`, `/ready`입니다. | 5분 | 접속 실패와 준비 상태 실패를 구분합니다. |
| 카카오·웹 응답 및 DB 호출 | 앱이 응답을 완료한 뒤 비동기로 전달하는 표본입니다. | 요청 후 | p95는 무작위 표본 30건 이상일 때 계산합니다. 카카오 p95 3.5초부터 경고합니다. |
| 앱 표본 경로(왕복 확인, 1.3.0) | 관제가 DB 수집 요청에 실어 앱이 같은 전송으로 보내게 하는 확인 표본입니다. | 5분 | 받으면 정상, 앱이 못 보냈거나 이 관제에 없으면 실패(정상 없이 3번이면 주의 경고), 옛 앱·앱을 부르지 못함은 확인 불가입니다. |
| Supabase 전송·캐시 전송·파일 용량 | 공식 Billing/Usage의 조직 전체 값을 관리자 화면에 등록합니다. | 24시간 이내 재확인 | 실제 청구 기간에 맞춰 사용량과 기간 종료 예상을 비교합니다. |

사용률 70%는 주의, 85%는 전환 검토, 95%는 긴급입니다. 한도 초과 예상과 자원 제한
오류도 전환 검토 근거입니다. 이 기준은 운영 권고이며 결제를 실행하지 않습니다.
현재 화면은 월간 추가 요금을 자동 예측하지 않습니다. Workers Paid는 월 US$5부터, Supabase Pro는 월 US$25부터입니다. 추가 사용량·프로젝트·
컴퓨트·세금·환율을 포함한 청구 총액은 공식 Billing에서 확인해야 합니다.

## 인증과 비용 보호

- 기존 앱 관리자 인증을 통과한 사용자만 `/ops-monitor`를 읽을 수 있습니다.
- 앱과 관제의 내부 통신에는 서로 같은 새 Secret `OPS_MONITOR_TOKEN`을 사용합니다.
- 별도 관제 로그인은 60초짜리 일회용 티켓을 POST 본문으로 전달합니다. Secret을 URL에 넣지 않습니다.
- 별도 관제 세션은 Secure·HttpOnly 쿠키로 7일간 유지됩니다. 앱의 DB가 중단되어도 이미 로그인한 관제를 읽을 수 있습니다. 신규 관리자 로그인은 앱 상태에 영향을 받습니다.
- 관제에는 원문 발화·사용자 ID·가계부 ID·거래 금액·개인정보·Secret을 저장하지 않습니다.
- 무작위 표본은 요청의 2%입니다. 오류·지연 표본은 별도로 선정합니다. 한 인스턴스에서는 분당 최대 100건을 전송합니다.
- 저장된 요청 행은 전역적으로 5분마다 무작위·오류 유형별 최대 10건입니다. 상한에 따른 누락이 있으므로 표본에서 전체 오류율을 계산하지 않습니다. 이 상한은 영구 저장 행을 제한하며 관제 요청 수와 INSERT 시도 자체를 제한하지 않습니다.
- 요청 표본은 7일, 집계는 30일 뒤부터 제한된 배치로 정리합니다. 요청 정리는 매시간 1,000건, 집계 정리는 매일 2,000건입니다. 즉시 삭제 시각은 보장하지 않습니다.
- 관제 전송 실패는 사용자 응답을 바꾸거나 거래 쓰기를 재시도하지 않습니다. DB 호출 계측은 공통 Supabase 함수와 정확한 건수 조회에 적용하며 모든 외부 호출을 계측하지 않습니다.

## 준비된 적용 순서

실행 전 신규 관제 리소스·SQL·Secret·서비스 연결·전체 Worker 배포를 승인받습니다.
기존 Supabase 테이블·RLS·RPC·카카오 설정을 변경하지 않습니다. 유료 요금제 가입은 하지 않습니다.

1. 기존 Worker 전체 소스, 공개 변수, 서비스 연결, 도메인과 Cron을 백업합니다. 기존 Secret 9개를 유지합니다.
2. 현재 Wrangler OAuth에는 D1 권한이 없습니다. D1 생성 시 API 오류 10000이 확인됐습니다. 기존 권한에 D1 편집만 추가하거나 Aside의 D1 콘솔을 사용합니다. 분석용 상시 토큰에는 D1 편집 권한을 부여하지 않습니다.
3. 무료 범위의 D1 `malhaebook-monitor`를 생성합니다. `monitoring/wrangler.jsonc`에 실제 account_id와 database_id를 기입합니다. 0으로 된 임시 ID로 배포하지 않습니다.

```powershell
npx wrangler d1 create malhaebook-monitor --location apac --config monitoring/wrangler.jsonc
npx wrangler d1 execute malhaebook-monitor --remote --file monitoring/schema.sql --config monitoring/wrangler.jsonc
```

4. 현재 계정에 한정된 `Account Analytics Read` 토큰을 생성합니다. 만료일은 1년으로 설정하고 갱신 일정을 기록합니다. 토큰 값은 코드·문서·로그에 기록하지 않습니다.
5. 무작위 공유 Secret을 생성해 앱과 관제에 각각 `OPS_MONITOR_TOKEN`으로 저장합니다. 관제에만 분석 토큰 `CF_ANALYTICS_TOKEN`을 저장합니다. 입력은 Wrangler의 비공개 프롬프트나 메모리의 표준 입력으로 전달합니다.
6. Supabase 요금제는 확인일과 함께 Free로 기록되어 있습니다. 자동 확인용 Management PAT는 선택 사항입니다. 현재 Workers 요금제는 공식 Billing에서 확인한 뒤 등록합니다. 확인하지 않은 요금제는 unknown으로 유지합니다.
7. 관제 Worker를 먼저 배포합니다. 기존 앱으로 향하는 `ACCOUNTBOOK` 서비스 바인딩을 유지합니다.

```powershell
npx wrangler deploy --config monitoring/wrangler.jsonc
```

8. 기존 앱 배포 설정에 `OPS_MONITOR` → `malhaebook-monitor` 서비스 바인딩과 `OPS_MONITOR_PUBLIC_ORIGIN` → 실제 관제 HTTPS workers.dev 주소를 추가합니다. 기존 9개 Secret·변수·세 도메인·Cron을 유지하며 `src/index.js` 전체를 배포합니다. 기존 앱은 단일 파일이므로 검증한 전체 소스를 번들링하지 않는 배포 설정을 사용합니다.
9. 앱의 공개 검사, 관리자 인증, 일반 사용자 차단, 관제 SSO와 쿠키, 재사용 티켓 거절, Cron 수집, 실제 GraphQL/Prometheus 반환값을 확인합니다. CPU는 2회 수집 뒤, 성장 예측은 2일 이상 기록 뒤 확인합니다.
10. 공식 Supabase Usage의 전송·캐시 전송·파일 용량을 실제 청구 기간과 함께 등록합니다. 표시한 단위가 GB이면 GiB로 변환하고 입력합니다. 하루 뒤부터는 재확인이 필요합니다.

## 독립 접속 검사

`node monitoring/external-check.mjs`는 자격 증명 없이 실제 공개 경로를 검사합니다.
`.github/workflows/monitoring.yml`은 수동 실행(`workflow_dispatch`)과 30분 예약(`*/30 * * * *`)으로 돕니다(2026-10-12 사용자 승인으로 예약 활성화). 예약은 기본 브랜치(main)에 병합된 워크플로에서만 실행됩니다. `monitoring/external-check.workflow.yml`은 10분 주기 예시 템플릿이며 적용하지 않습니다. 실행한 검사가 실패하면 GitHub가 워크플로 실패 알림 메일을 보냅니다. 공개 저장소라 Actions 분은 무료입니다.
GitHub 예약은 지연될 수 있으며 24시간 감시 또는 즉시 통보를 보장하지 않습니다. 공개 저장소에서 60일 동안 활동이 없으면 GitHub 가 예약을 자동으로 끕니다.

## 알림 발송 (1.1.0)

1.0.1 까지는 경고를 관리자가 `/ops-monitor`를 열 때만 계산했고 아무 데도 보내지 않았습니다. 1.1.0 부터 5분 수집이 끝날 때마다 `summary()`를 돌려 **새 경고를 이메일·웹훅으로 보냅니다.**

- **채널:** 이메일은 Workers 의 `send_email` 바인딩(`ALERT_EMAIL`)과 수신 주소 Secret `ALERT_TO`, 발신 주소 `ALERT_FROM`(malhaebook.com 주소). 웹훅은 Secret `ALERT_WEBHOOK_URL`(JSON `{"text": …}` POST, Slack·Discord 호환). 둘 중 하나 이상이 없으면 수집 상태 `alerts`가 `not_connected`이고 화면에 "알림 발송 채널 미연결"이 뜹니다.
- **무엇을 보내나:** `summary()`의 경고 가운데 긴급(critical)·전환 검토(upgrade)·주의(warning). 같은 제목의 경고는 긴급 6시간, 전환 검토 12시간, 주의 24시간 안에 다시 보내지 않습니다(등급이 오르면 바로 보냄). 긴급 경고가 해소되면 "해소"를 보냅니다. 해소 판정과 재발 규칙은 아래 1.2.0 절을 봅니다. 발송 기록은 D1 `settings`의 `alert:*` 행입니다.
- **실패하면:** 모든 채널이 실패하면 수집 상태 `alerts`가 `delivery_failed`가 되고 기록을 남기지 않아 다음 5분에 다시 시도합니다. 발송 실패는 사용자 응답에 영향이 없습니다.
- **새 경고(1.1.0):** 앱 Worker 오늘 런타임 오류 3건 이상(주의)·20건 이상(긴급), 요금제 확인 기록 7일 만료(주의, 그동안은 마지막 확인 요금제의 한도로 계속 비교), Cloudflare 분석 토큰 만료 30일 전(주의)·7일 전(긴급)·비활성(긴급).
- **참고 사항으로 바뀐 것:** 카카오·웹 p95 표본 부족은 낮은 트래픽에서 정상이라 "확인 불가"가 아니라 참고(`notes`)로 보입니다.
- **발송 실패 원인(1.1.1):** 채널별 원인이 `error_code` 에 `delivery_failed email:E_SENDER_NOT_VERIFIED webhook:http_500` 꼴로 남고, `/ops-monitor` "확인되지 않은 항목"의 "알림 발송: …" 줄과 Workers Logs(`monitor alert email failed: …`)에 그대로 보입니다. 1.1.0 은 `delivery_failed` 만 남겨 원인을 알 수 없었습니다. 이메일 코드는 Cloudflare Email Service 의 오류 코드입니다. `E_SENDER_NOT_VERIFIED`·`E_SENDER_DOMAIN_NOT_AVAILABLE` 는 발신 도메인(`ALERT_FROM` 의 malhaebook.com)이 Email Service(발신)에 등록·인증되지 않은 것, `E_RECIPIENT_NOT_ALLOWED` 는 수신 주소가 바인딩 허용 목록 밖, `E_VALIDATION_ERROR`·`E_FIELD_MISSING` 은 주소 형식(Secret 값의 공백·줄바꿈 포함)입니다.

**설정 순서(사용자 승인 뒤 실행):**
1. Cloudflare → Email Routing → 대상 주소에 알림을 받을 주소를 추가하고 인증합니다(이미 문의 메일 전달에 쓰는 주소면 그대로). 발송이 `E_SENDER_NOT_VERIFIED` 로 실패하면 Cloudflare → Email → Email Service(발신)에서 malhaebook.com 을 등록하고 안내된 DNS 레코드(SPF·DKIM)를 추가해 인증합니다.
2. 수신 주소는 `npx wrangler secret put ALERT_TO --config monitoring/wrangler.jsonc` 로 넣습니다(Email Routing 대상 주소로 인증된 주소여야 함). `monitoring/wrangler.jsonc`에는 `send_email` 바인딩(`ALERT_EMAIL`)이 이미 켜져 있고, 공개 저장소에 개인 주소를 남기지 않도록 `destination_address`를 적지 않습니다(계정에서 인증된 대상 주소로만 보낼 수 있음). `ALERT_TO`는 vars 에 두지 않습니다 — 비어 있는 var 가 배포마다 Secret·대시보드 값을 덮어쓰지 않게 하기 위해서입니다. 예전 설정(빈 `ALERT_TO` var)으로 배포된 상태에서 이름이 겹친다며 거부되면 4번 배포를 먼저 한 뒤 다시 넣습니다. `ALERT_FROM`은 `monitor@malhaebook.com`처럼 이 도메인의 주소입니다.
3. (선택) `npx wrangler secret put ALERT_WEBHOOK_URL --config monitoring/wrangler.jsonc`.
4. `npx wrangler deploy --config monitoring/wrangler.jsonc`. 배포 뒤 첫 수집(5분 안)에서 `/ops-monitor` 하단 "알림 발송" 상태가 `수집됨`인지 봅니다. 채널이 없으면 `not_connected`로 남습니다.
5. 한 번 실제로 받아 보려면 요금제 확인 기록을 비워 두면 됩니다(주의 등급 "요금제 확인 기록 만료"가 하루 한 번 옵니다). 확인 뒤 화면에서 요금제를 저장하면 멈춥니다.

Cloudflare 관제는 앱과 계정 한도 및 플랫폼 장애를 공유합니다. 외부 검사 활성화 전에는
Cloudflare 전체 장애를 독립적으로 계속 관측한다고 표시하지 않습니다.

## 경고 깜빡임·'처리 중' 결과·cron CPU (1.2.0, V22.9.77)

2026-10-14 감사 V44:G-3·G-5·G-6 을 고쳤습니다. D1 스키마는 바뀌지 않아 이전(migration)이 없습니다.

- **해소 판정(G-3):** 1.1.x 는 수집 한 번만 정상이어도 해소로 보고 `alert:*` 행을 지워, 임계값 근처에서 깜빡이면 재발송 간격이 매번 처음부터 시작했습니다(/ready 가 5분마다 실패·정상 → 1시간에 긴급 메일 12통, DB CPU 86%·84% → 주의 6통). 1.2.0 은 5분 수집 **3번 연속, 10분 이상** 정상일 때만 해소로 보고, 해소 뒤에도 행에 마지막 발송 시각(`sent_at`)·해소 시각(`resolved_at`)·해소 메일 시각(`recovered_at`)을 남깁니다. 그래서 해소 뒤 다시 생겨도 간격 안이면 보내지 않습니다. 예외는 둘입니다. 등급이 오르면 바로 보내고, 해소 메일을 보낸 뒤 다시 생기면 "· 해소 뒤 다시 생김"을 붙여 한 번 보냅니다(해소를 믿는 운영자에게 침묵하지 않기 위해).
- **해소 메일:** 긴급 경고만, 같은 경고마다 6시간에 한 번 보냅니다. 6시간 안에 다시 해소된 것은 6시간이 지나 아직 정상이면 "· HH:MM KST부터 정상"을 붙여 보냅니다. 해소된 행은 등급별 간격(긴급 6·전환 검토 12·주의 24시간)이 지나면 지웁니다.
- **'처리 중' 먼저 답(G-5):** 카카오 5초 제한 때문에 '처리 중'으로 먼저 답한 요청은 응답 시점 표본(`outcome=deferred`, 늘 오류·지연 표본)과, 뒤 작업이 끝난 뒤의 최종 결과 표본(`ref` = 첫 표본 id, 걸린 시간·DB 실패 포함)을 보냅니다. 관제는 최종 결과로 첫 표본 행을 고칩니다. 최종 결과가 먼저 오면 첫 표본 id 로 넣고 늦게 온 `deferred` 는 무시합니다. 10분이 지나도 `deferred` 로 남은 행은 결과 미확인으로 보고 "최근 처리 실패 기록"에 셉니다. 1.1.x 관제는 `ref` 를 버리고 최종 결과를 별도 행으로, `deferred` 를 `unknown` 으로 저장합니다.
- **5분 cron CPU(G-6):** 알림 판정은 `summary(env, now, { alerting: true })` 로 돕니다. DB 용량 성장 예측은 7일치 2,016행 대신 D1 에서 첫·마지막 점과 점 개수만 받고, 요청 표본은 1,000행 대신 집계 한 행(+ 카카오 p95 위치 한 행)을 받습니다. `/api/summary` 화면은 7일 그래프·최근 표본 30건을 그대로 내되 DB 크기만 `json_extract` 로 받아 `JSON.parse` 2,016번을 없앴습니다. 결과의 `scope` 는 `alerts`·`full` 입니다. 오프라인 측정(Node, D1 행 해석 비용 제외)은 cron 한 번 D1 8회·8행, `summary()` 처리 알림 판정 약 0.3ms·화면 약 5.5ms(예전 약 8.3ms)입니다.
- **분석 토큰 확인(V77 N-14):** 1.1.2 는 토큰 확인 요청에 `redirect: "error"` 를 넣었는데 Workers(workerd)의 fetch 는 redirect 로 `follow`·`manual` 만 받아, 토큰이 정상이어도 늘 `token_user_transport` 로 끝났습니다(2026-10-23·24 운영). 1.2.0 은 1.1.2 의 사용자 토큰 → 계정 토큰 재확인과 오류 코드 진단을 그대로 옮기고 `redirect: "manual"` 로 보냅니다(3xx 는 따라가지 않고 `token_<scope>_http_3xx`). 토큰 확인은 매시 0~4분 수집에서 돕니다. 이 오류만으로 토큰을 다시 발급하지 않습니다.
- **배포 순서:** 앱 Worker(최종 결과 표본을 보내는 판)를 먼저, 관제 1.2.0 을 그다음에 배포합니다. 관제만 먼저 올리면 옛 앱의 `deferred` 표본이 10분 뒤 결과 미확인 주의로 잡힙니다. 앱만 먼저 올린 동안 1.1.x 관제는 최종 결과를 별도 행으로 저장할 뿐 오류는 없습니다.
- **검증:** `node validation/validate-monitor-v22977.mjs`(Node 22 SQLite 로 실제 SQL), `node monitoring/test-d1.mjs`.

## 토큰 확인 수집 기준 (1.2.1, V22.9.78)

V77 N-19 를 고쳤습니다. D1 스키마는 바뀌지 않아 이전(migration)이 없습니다.

- **수집기 상태(N-19):** 화면은 수집기마다 마지막 성공 시각으로 정상·갱신 지연을 판정합니다. 1.2.0 은 요금제 확인(2시간)을 뺀 모든 수집기를 20분 기준으로 봐서, 매시 0~4분에만 도는 분석 토큰 만료 확인이 정상이어도 매시간 약 40분 ‘갱신 지연’으로 보였습니다(2026-10-25 확인). 1.2.1 은 토큰 확인을 70분, 5분 수집기를 20분, 요금제 확인을 2시간 기준으로 봅니다. 토큰 경고·만료 알림은 그대로입니다.
- **배포:** 앱 Worker 와 서로 기대지 않습니다. 한 파일 묶음으로 대시보드 편집기에 올립니다(V22.9.77 과 같은 방식).
- **검증:** `node validation/validate-monitor-v22978.mjs`.

## 앱 표본 왕복 확인 (1.3.0, V22.9.81)

V79 T-43 을 고쳤습니다. D1 스키마는 바뀌지 않아 이전(migration)이 없습니다. 새 Secret·바인딩·설정도 없습니다.

- **문제:** 앱 요청 표본은 사용자 경로 요청의 2% 와 사고 요청만 보내므로, 하루 창 안에 표본이 없으면 화면은 ‘미연결’로만 보였고 저사용량과 전송 고장을 가르지 못했습니다(2026-10-26 확인: 10-25 08:49:32 뒤 25시간 넘게 표본 0건).
- **방식:** 관제는 5분마다 앱을 부르는 DB 수집 요청(`ACCOUNTBOOK` → `/internal/ops-metrics`)에 왕복 확인 id 를 `x-ab-monitor-roundtrip` 머리로 싣습니다. V22.9.81 앱은 토큰을 확인한 뒤 사용자 표본과 같은 전송(`OPS_MONITOR` → `/internal/telemetry`, 같은 토큰·2초 시한)으로 확인 표본(`sample_kind: "roundtrip"`, 발화·사용자·주소 없음) 하나를 DB 지표 조회와 함께 보내고, 결과(`sent`·`not_connected`·`http_NNN`·`timeout`·`transport`)를 답의 `roundtrip` 에 붙입니다. DB 지표가 실패(503)해도 붙입니다. 관제는 그 id 의 행을 지우면서 받았는지 확인하고 D1 `settings` 의 `roundtrip` 한 행에 상태·연속 실패·마지막 정상 시각을 적습니다. 앱 요청은 늘지 않고, cron 한 번에 D1 문장 3개(행 지우기·이전 기록 읽기·기록 쓰기)가 더해집니다.
- **판정:** 정상 = 관제가 확인 표본을 받음. 실패 = 앱이 보내지 못했다고 답함(연결 없음·관제 거절·시한·연결 끊김) 또는 보냈다는데 이 관제에 없음(`not_received`, 앱의 `OPS_MONITOR` 가 다른 관제를 가리킴). 확인 불가 = 앱이 왕복 확인을 모름(`unsupported`, V22.9.80 까지의 앱)·토큰 불일치(`unauthorized`, DB 수집에도 따로 보임)·관제가 앱을 부르지 못함·20분 넘게 확인 없음(`stale`).
- **화면·경고:** ‘응답과 DB 부하’에 요청 표본 수신 옆으로 왕복 확인 배지(정상·실패·확인 불가)와 해석 문장이, ‘수집 연결 상태’ 표에 ‘앱 표본 왕복 확인’ 줄이 보입니다. 왕복 확인이 정상이면 표본 0건은 ‘확인되지 않은 항목’이 아니라 참고(요청이 적음)입니다. 사고 요청은 모두 보내므로, 경로가 살아 있는데 표본이 없으면 그동안 실패·지연 요청이 관측되지 않았다는 뜻입니다. 실패·확인 불가이면 1.2.1 처럼 확인되지 않은 항목입니다. 정상 확인 없이 3번(5분 수집 3번, 사이의 확인 불가 회차는 세지도 끊지도 않음) 실패하면 주의 경고 ‘앱 요청 표본 전송 실패’를 보내고, 정상 확인 3번(10분 이상)에 해소로 봅니다. 확인 불가는 경고를 만들지 않습니다.
- **통계:** 확인 표본은 요청 표본 수·p95·실패 수·최근 표본에 넣지 않습니다(관제가 받으면 곧 지우고, 답을 잃어 남은 행도 질의에서 뺍니다. 남은 행은 7일 정리 때 지워집니다).
- **배포 순서:** 어느 쪽을 먼저 올려도 됩니다. 새 관제 + 옛 앱이면 왕복 확인은 ‘확인 불가(unsupported)’이고 경고가 없으며 전체 상태는 1.2.1 과 같습니다. 옛 관제 1.2.1 + 새 앱이면 머리가 없으므로 앱은 V22.9.80 과 같은 바이트로 답하고 확인 표본을 보내지 않습니다. 권장은 앱(V22.9.81)을 먼저, 관제 1.3.0 을 그다음에 올리는 것입니다(관제의 첫 수집부터 정상으로 보입니다). 관제는 예전처럼 `model.mjs`·`dashboard.mjs`·`worker.mjs` 를 한 파일로 이어 대시보드 편집기에 올립니다.
- **되돌리기:** 관제를 1.2.1 로 되돌려도 수집 상태 표에는 새 행이 없고(`settings` 의 `roundtrip` 행은 1.2.1 이 읽지 않습니다), 확인 표본 행은 받은 즉시 지워져 1.2.1 의 요청 표본에 남지 않습니다. ‘앱 요청 표본 전송 실패’ 경고 기억 행이 있었다면 1.2.1 은 그 행을 해소로 판정하지 못하고 그대로 둡니다(메일은 보내지 않습니다). 앱만 되돌리면 1.3.0 화면이 ‘확인 불가(unsupported)’로 바뀝니다.
- **검증:** `node validation/validate-monitor-v22981.mjs`(관제는 Node 22 SQLite 로 실제 SQL, 앱은 실제 번들을 서비스 바인딩 흉내로 이어 돌립니다).

## 검증과 복구

```powershell
node validation/validate-monitoring-v22922.mjs
node monitoring/test-d1.mjs
node .codex/scripts/verify-repository.mjs
npx wrangler deploy --config monitoring/wrangler.jsonc --dry-run
```

D1 로컬 검사는 Node.js 22의 SQLite를 사용합니다. 나머지 하네스는 기존 Node.js 18 이상 기준을 유지합니다.
관제를 비활성화하려면 앱 Worker의 `OPS_MONITOR` 서비스 연결을 제거하거나 `OPS_MONITOR_TOKEN`을 비웁니다.
앱은 둘 중 하나가 없으면 표본을 보내지 않고 그대로 동작하므로, 앱을 옛 백업으로 되돌릴 필요는 없습니다
(V22.9.76에서 옛 ‘V22.9.21 백업으로 복구’ 안내를 고쳤습니다). 관제 저장소를 삭제할 필요는 없습니다. 새 Secret을 교체하면 기존 별도 관제
쿠키도 무효화됩니다. 배포 완료 여부와 실제 수집 결과는 `VERIFICATION_V22_9_22.md`에 기록합니다.

## 공식 기준

2026-10-01에 [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 요금](https://developers.cloudflare.com/d1/platform/pricing/),
[Supabase 요금](https://supabase.com/pricing),
[Supabase Metrics](https://supabase.com/docs/guides/observability/metrics)을 확인했습니다.
Pro 물리 디스크 제공량을 Free의 논리 DB 용량과 직접 비교하지 않습니다. GraphQL 샘플링 결과를
다시 배수로 환산하지 않습니다. 공급자 집계에는 반영 지연이 있습니다.

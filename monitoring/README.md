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
`external-check.workflow.yml`은 외부 GitHub Actions 검사 템플릿이며 아직 예약 실행되지 않습니다.
저장소 게시와 워크플로 활성화가 승인되면 `.github/workflows/monitoring.yml`로 복사합니다.
GitHub 예약은 지연될 수 있으며 24시간 감시 또는 즉시 통보를 보장하지 않습니다.
알림 이메일·메신저 발송은 연결하지 않았습니다.

Cloudflare 관제는 앱과 계정 한도 및 플랫폼 장애를 공유합니다. 외부 검사 활성화 전에는
Cloudflare 전체 장애를 독립적으로 계속 관측한다고 표시하지 않습니다.

## 검증과 복구

```powershell
node validation/validate-monitoring-v22922.mjs
node monitoring/test-d1.mjs
node .codex/scripts/verify-repository.mjs
npx wrangler deploy --config monitoring/wrangler.jsonc --dry-run
```

D1 로컬 검사는 Node.js 22의 SQLite를 사용합니다. 나머지 하네스는 기존 Node.js 18 이상 기준을 유지합니다.
관제를 비활성화하려면 앱의 `OPS_MONITOR` 연결을 제거하거나 공유 Secret을 비우고 V22.9.21
백업으로 복구합니다. 관제 저장소를 삭제할 필요는 없습니다. 새 Secret을 교체하면 기존 별도 관제
쿠키도 무효화됩니다. 배포 완료 여부와 실제 수집 결과는 `VERIFICATION_V22_9_22.md`에 기록합니다.

## 공식 기준

2026-10-01에 [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 요금](https://developers.cloudflare.com/d1/platform/pricing/),
[Supabase 요금](https://supabase.com/pricing),
[Supabase Metrics](https://supabase.com/docs/guides/observability/metrics)을 확인했습니다.
Pro 물리 디스크 제공량을 Free의 논리 DB 용량과 직접 비교하지 않습니다. GraphQL 샘플링 결과를
다시 배수로 환산하지 않습니다. 공급자 집계에는 반영 지연이 있습니다.

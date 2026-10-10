# V22.9.37 감사 결함 묶음 적용 안내와 운영 확인 지시문

이 문서는 `V22.9.37-AUDIT-BATCH` 적용 준비본이며 두 부분으로 되어 있습니다.
- **배포 담당자용 적용 순서**
- **운영 확인 지시문:** 사용자나 외부 점검자에게 그대로 맡길 수 있게 쓴 것

새 동결 `src/index.js`는 **3,764,542 bytes**, SHA-256 `12c2d1671819bb1d2336ecc49bc7fd9d92be14f7b1454de507f0ab667a4f9130`입니다.

기준 운영은 V22.9.35 입니다(V22.9.36 은 main 에 병합됐지만 아직 배포하지 않았습니다).
- 버전 `4f9da854-c185-40f0-8d0f-7bac9a3c9dc4`, 배포 `994d2f22-d0bd-4761-bc83-c26ef992e5bb`, 소스 `636cab5c…`
- V22.9.36 을 먼저 배포했다면 그 버전 ID 가 기준이고 되돌리기 대상입니다.
- 이 판은 V22.9.36(카카오 분류 표 대체)을 포함하므로 V22.9.35 에서 바로 올려도 됩니다.

## 1. 변경 결과

- **앱 Worker:** 감사 결함 묶음 A~D 와 관제 표본·저장 실패 분류·cron 부분 처리 수정(`00_READ_FIRST_V22_9_37.md`).
- **1년 캐시 자산(새 주소):** `accountbook-shell-v22937.css`, `accountbook-nav-v22937.js`, `accountbook-v5-v22937.js`, `accountbook-goals-v22937.js`, `accountbook-favrows-v22937.js`, `accountbook-search-v22937.js`, `accountbook-notif-v22937.js`. 이전 JS 주소(nav-v22930, v5-v22934, goals-v22929, favrows-v22836, search-v22929, notif-v22836)는 이전 바이트로 계속 내려갑니다. 이전 CSS 주소(shell-v22925)는 내려가지 않습니다(이전 규칙과 같음).
- **관제 Worker 1.1.0(별도 배포):** 알림 발송(이메일·웹훅), 요금제 만료 뒤 한도 유지, 토큰 만료 경고, Workers Logs 켜기. `monitoring/wrangler.jsonc`에 `CF_PLAN`·`ALERT_FROM`·`ALERT_TO` 변수가 생깁니다.
- **GitHub Actions:** `.github/workflows/monitoring.yml`이 30분마다 공개 `/health`·`/ready`를 확인합니다. 병합되면 자동으로 켜집니다(공개 저장소라 무료).
- **바뀌지 않은 것:** SQL·RPC, 환경변수·Secrets·바인딩(앱), Worker 내보내기 목록(`named_handlers` 대조 동일), Kakao Developers·OpenBuilder.
- **DB 에 쌓이는 새 값:** `accountbook_transaction_audit.actor_kind = 'kakao'`(카카오 삭제·수정). 제약이 없어 SQL 변경은 없습니다.

## 2. 배포 전후 읽기 전용 확인 (Supabase SQL Editor)

① **V22.9.36 미배포 상태에서 카카오 저장 실패 영향**(V22.9.36 ASIDE 2절 ②와 같음)
```sql
select date_trunc('day', created_at at time zone 'Asia/Seoul') as day_kst, count(*) as kakao_rows
from public.transactions
where source = 'kakao_skill' and created_at >= '2026-10-01 00:00:00+09'
group by 1 order by 1;
```

② **배포 뒤 카카오 삭제·수정의 감사 기록**(기대: 카카오로 삭제·수정한 뒤 `actor_kind = 'kakao'` 행)
```sql
select action, actor_kind, count(*) from public.accountbook_transaction_audit
where created_at >= now() - interval '1 day' group by 1, 2 order by 1, 2;
```

## 3. 적용 순서

1. PR 을 main 에 병합합니다. 깨끗한 main checkout 에서 `VERSION.txt`, 위 SHA-256, `npm test`(전체 하네스)를 확인합니다.
2. `node tools/deploy-worker-version.mjs --dry-run`.
3. 사용자가 토큰을 만들어 업로드합니다(권한 Workers Scripts Edit, 이 계정 한정, 만료일). 사용자가 직접 연 PowerShell 창에서, 토큰 입력은 가려집니다.
   ```powershell
   cd D:\Github_Kakao_Account\my
   $env:CLOUDFLARE_API_TOKEN = [System.Net.NetworkCredential]::new("", (Read-Host "Cloudflare token" -AsSecureString)).Password
   $env:CLOUDFLARE_ACCOUNT_ID = "58e7954ad3d92f0d39a7492ad4689165"
   node tools/deploy-worker-version.mjs
   ```
   `output/deploy/V22.9.37-AUDIT-BATCH/upload-<버전ID>.json`에서 바인딩 30개·`script_runtime`·handlers 대조를 확인합니다.
4. 승인 후 승격합니다.
   ```powershell
   node tools/deploy-worker-version.mjs --promote <버전ID> --legacy-origin https://ttokttok-accountbook.com
   ```
   스크립트가 `/health` 5번 연속 V22.9.37 과 공개 검사(새 자산 7개 포함)를 확인합니다.
5. **관제 Worker(선택이지만 권장):** `monitoring/README.md` "알림 발송 (1.1.0)" 순서대로 Email Routing 대상 주소를 인증하고 `monitoring/wrangler.jsonc`의 `send_email` 주석을 풀어 `ALERT_TO`를 적은 뒤:
   ```powershell
   npx wrangler deploy --config monitoring/wrangler.jsonc
   ```
   채널을 아직 못 정했으면 그대로 배포해도 됩니다(화면에 "알림 발송 채널 미연결"만 뜹니다).
6. 문제가 있으면 승인 후 되돌립니다.
   ```powershell
   node tools/deploy-worker-version.mjs --rollback 4f9da854-c185-40f0-8d0f-7bac9a3c9dc4
   ```
   (V22.9.36 을 배포했었다면 그 버전 ID 로.) 되돌리면 카카오 새 기록 저장이 다시 실패합니다(V22.9.35 결함).
7. 결과는 `docs/deployments/V22_9_37_<날짜>.md`에 기록하고 토큰을 폐기합니다.

## 4. 운영 확인 지시문

> 점검용 계정·점검용 가계부만 씁니다. 금액은 100원처럼 작게 넣고 확인 뒤 지웁니다.

### 4-1. 카카오 (1:1 대화방)

| 번호 | 보낼 말 | 기대 결과 |
|---|---|---|
| K1 | `커피 100원 점검37` | "💸 지출 저장했어요"(V22.9.36 효과). |
| K2 | `삭제 01번` (K1 번호) | 지워졌다는 답장에 날짜·기록 이름이 있고, DB ②에 `delete / kakao` 행이 생깁니다. |
| K3 | `복구 01번` | 되살아납니다(id 그대로). |
| K4 | `예산 50억` | 20억 상한 안내, 저장되지 않습니다. |
| K5 | `예산 50만원` (분류별 예산이 있는 달) | "설정했어요" 뒤에 "분류별 예산이 있는 달에는 전체 예산을 계산에 쓰지 않아요" 안내가 붙습니다. |
| K6 | `가계부 참여 ABCD1234`(실제 초대코드) | 앞 문구를 떼고 코드로 참여 요청이 됩니다. |
| K7 | 일반 참여자 계정으로 `초대코드` | 관리자만 볼 수 있다는 안내. |

### 4-2. 웹 (PC 크롬 + 휴대폰)

| 번호 | 확인 | 기대 결과 |
|---|---|---|
| W1 | 정기 수입·지출에서 항목 A 의 이름을 항목 B 와 같게 바꿈 | 거절 안내. B 가 남아 있습니다(SIM-3). |
| W2 | 설치 앱 `/app`(주소에 가계부 없음)에서 전체 검색·알림·즐겨찾기 | 화면의 가계부 기록이 나옵니다(H1·U3). |
| W3 | 다크 모드로 로그아웃 → 로그인 화면 | 글자가 보입니다(U4). |
| W4 | 일반 참여자로 전체 메뉴 | "참여자·초대", "단톡방 연결"에 "관리자 전용" 표시(U14). |
| W5 | 지난달 홈에서 "카테고리 비율 · 월간 리포트 →" | 지난달 분석이 열립니다(U7). |
| W6 | 가져오기: 날짜가 없는 행이 섞인 CSV 미리보기 | 그 행은 "확인 필요"이고 2004·2042년 날짜가 생기지 않습니다(N5·D6). |
| W7 | 자산·결제수단에서 잔액에 "abc" 입력 | 거절 안내, 0원으로 저장되지 않습니다(N7). |
| W8 | 홈 "나간 돈" 문장 | "지난달 1~N일보다 …"(D12). |
| W9 | 가계부 삭제(참여자 17명 이상이면) | 삭제됩니다(H5). 참여자가 적으면 생략. |

### 4-3. 관제
- `/ops-monitor` 하단 "알림 발송" 상태: 채널을 연결했으면 `수집됨`, 아니면 `not_connected`.
- 요금제 확인 기록을 저장하지 않았다면 다음 날 "요금제 확인 기록 만료" 메일(주의)이 한 번 옵니다. 화면에서 요금제를 저장하면 멈춥니다.
- Cloudflare 대시보드 → `malhaebook-monitor` → Logs 에 cron 로그가 보입니다(observability 켜짐).

### 4-4. 결과 보고 형식
```text
[V22.9.37 운영 확인] 점검일시(KST) / 점검자 / 기기
K1~K7: PASS|FAIL 각 답장 첫 줄
W1~W9: PASS|FAIL
관제: 알림 발송 상태 / 메일 수신 여부
DB ①·② 결과
```

## 5. 남은 위험

- 자산 주소 7개가 바뀌므로 승격 직후 이전 HTML 을 캐시한 탭은 이전 JS 주소(보존됨)를 계속 받습니다. CSS 이전 주소는 404 가 되지만 개인 화면은 `no-store`라 새로고침이면 새 주소를 받습니다(이전 판들과 같은 규칙).
- 수동 정기 반영은 자격 없는 지출자 규칙이 있을 때만 규칙별로 나눠 넣습니다(원자성 완화). 자격 없는 규칙이 없으면 예전과 같은 RPC 한 번입니다.
- 관제 알림은 채널(이메일 대상 인증 또는 웹훅 Secret)을 연결해야 실제로 옵니다.
- 실기기·실제 카카오 대화·OAuth 왕복은 자동 검사로 대신하지 않습니다.

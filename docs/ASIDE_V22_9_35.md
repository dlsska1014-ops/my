# V22.9.35 가입 해시 수정 적용 안내와 운영 확인 지시문

이 문서는 `V22.9.35-SIGNUP-KDF-FIX` 적용 준비본이며 두 부분으로 되어 있습니다.
- **배포 담당자용 적용 순서**
- **운영 확인 지시문:** 사용자나 외부 점검자에게 그대로 맡길 수 있게 쓴 것

새 동결 `src/index.js`는 **3,514,697 bytes**, SHA-256 `636cab5cb9f049d2bc1be9f9e9d06ce357292e6c36f4d41e642bc8fd3db0fbb8`입니다.

기준 운영은 V22.9.34 입니다.
- 버전 `04da3a9e-ef12-48ec-be2c-4367114d0d18`
- 배포 `7f7432d1-3c65-49fb-9741-c9b20ae695e0`
- 소스 SHA-256 `f74f729a…`
- 기록 `docs/deployments/V22_9_34_2026_10_09.md`

## 1. 변경 결과

- **새 해시 반복 횟수:** 비밀번호 해시(PBKDF2-SHA256)의 반복 횟수를 210,000 에서 100,000 으로 낮췄습니다. Cloudflare Workers 운영 런타임은 100,000 을 넘는 PBKDF2 를 거절합니다. 그래서 210,000 으로는 다음이 모두 실패했습니다.
  - ID·비밀번호 가입
  - 카카오 사용자의 ID·비밀번호 설정
  - 관리자 비밀번호 변경
  - 없는 로그인 이름의 로그인(시간 맞추기 해시)
- **상한을 넘는 저장값:** 상한을 넘는 반복 횟수로 저장된 계정은 계산하지 않고 처리 오류로 안내합니다. 운영 이벤트 `local_login_failed`(상세 `password_kdf_iterations_unsupported`)를 남깁니다.
- **로그인 처리 오류:** 이제 운영 이벤트 `local_login_failed`로 남습니다.
- **바뀌지 않은 것:**
  - SQL: 계정 생성·설정 RPC 는 100,000 이상을 받습니다.
  - 환경변수·Secrets·바인딩·외부 콘솔
  - 1년 캐시 자산
  - Worker 내보내기 목록. 그래서 배포 스크립트의 `named_handlers` 대조도 같습니다.

## 2. 배포 전 확인

필수 확인은 없습니다. 아래 읽기 전용 조회는 배포 전후 아무 때나 해도 됩니다. 해시·솔트는 읽지 않습니다.

① **V22.9.34 점검 때 가입하려던 A 계정이 생기지 않았는지**(기대 0)
```sql
select count(*) as local_identities_created
from public.accountbook_user_identities
where provider = 'local'
  and created_at >= '2026-10-09 23:43:00+09' and created_at < '2026-10-09 23:46:00+09';
```

② **로컬 계정의 반복 횟수 분포**
```sql
select credential_iterations, count(*) as identities,
       min(created_at) at time zone 'Asia/Seoul' as first_created_kst,
       max(updated_at) at time zone 'Asia/Seoul' as last_updated_kst
from public.accountbook_user_identities
where provider = 'local'
group by credential_iterations
order by credential_iterations;
```
`credential_iterations`가 100,000 을 넘는 행은 운영 런타임에서 로그인할 수 없습니다. 이런 행이 있으면 알려 주세요. 카카오 로그인 뒤 `/my/backup-login`에서 ID·비밀번호를 다시 설정하면 100,000 으로 다시 저장됩니다.

## 3. 적용 순서

1. PR 을 main 에 병합합니다. 깨끗한 main checkout 에서 `VERSION.txt`, 위 SHA-256, `npm test`(전체 하네스)를 확인합니다.
2. `node tools/deploy-worker-version.mjs --dry-run`으로 네트워크 없이 로컬 해시·커밋·요청 순서를 확인합니다.
3. 사용자가 토큰을 만들어 업로드합니다. 토큰 권한은 Workers Scripts Edit, 이 계정 한정, 만료일 지정입니다.
   - 사용자가 직접 연 PowerShell 창에서 실행합니다. 토큰 입력은 `*`로 가려집니다.
   ```powershell
   cd D:\Github_Kakao_Account\my
   $env:CLOUDFLARE_API_TOKEN = [System.Net.NetworkCredential]::new("", (Read-Host "Cloudflare token" -AsSecureString)).Password
   $env:CLOUDFLARE_ACCOUNT_ID = "58e7954ad3d92f0d39a7492ad4689165"
   node tools/deploy-worker-version.mjs
   ```
   업로드는 버전만 저장하고 배포하지 않습니다. `output/deploy/V22.9.35-SIGNUP-KDF-FIX/upload-<버전ID>.json`에서 바인딩 30개·`script_runtime`·handlers 대조 결과를 확인합니다.
4. 승인 후 같은 창에서 승격합니다.
   ```powershell
   node tools/deploy-worker-version.mjs --promote <버전ID> --legacy-origin https://ttokttok-accountbook.com
   ```
   - 스크립트가 현재 배포, `content/v2` 소스 해시, `/health` 5번 연속 V22.9.35, 공개 검사를 확인합니다.
   - `--legacy-origin`은 옛 도메인이 새 도메인으로 넘어가는지를 함께 보는 옵션입니다. 기본 검사는 `malhaebook.com`으로 합니다.
5. 문제가 있으면 승인 후 V22.9.34 로 되돌립니다.
   ```powershell
   node tools/deploy-worker-version.mjs --rollback 04da3a9e-ef12-48ec-be2c-4367114d0d18
   ```
   - 되돌리면 가입이 다시 실패합니다.
   - V22.9.35 에서 100,000 으로 만든 계정은 V22.9.34 에서도 로그인할 수 있습니다(저장된 반복 횟수로 확인).
6. 결과는 `docs/deployments/V22_9_35_<날짜>.md`에 기록하고, 사용자는 토큰을 폐기합니다.

## 4. 운영 확인 지시문

> 이 절은 점검자에게 그대로 건네도 되도록 썼습니다. 점검자는 사람이어도 되고 브라우저를 다루는 AI 점검 도구여도 됩니다.

### 점검 원칙

- 점검용 새 계정만 씁니다. 실제 사용자 기록은 건드리지 않습니다.
- **가입 전에 비밀번호를 먼저 안전한 곳에 저장합니다.** V22.9.34 점검에서는 비밀번호 보관이 실패해 다음 단계를 못 했습니다.
- 가입은 한 번만 합니다. 실패하면 다시 시도하지 말고 화면과 시각(KST)을 남깁니다.
- 운영 DB 에는 2절의 읽기 전용 조회만 실행합니다.

### 4-1. 가입·로그인 (PC 크롬)

| 번호 | 확인 | 방법 | 기대 결과 |
|---|---|---|---|
| S1 | 가입 | `https://malhaebook.com/my`에서 "새 계정 만들기"로 점검용 계정 A 를 만듭니다. | 로그인된 상태로 가계부 화면(/my)으로 갑니다. |
| S2 | 다시 로그인 | 전체 메뉴의 "로그아웃"을 누른 뒤, 같은 이름·비밀번호로 로그인합니다. | 로그인됩니다. 이것으로 V22.9.34 W1(로그아웃)도 함께 확인됩니다. |
| S3 | 틀린 비밀번호 | 로그아웃 뒤 같은 이름에 틀린 비밀번호를 넣습니다. | "로그인 이름 또는 비밀번호가 맞지 않습니다" 안내가 나옵니다. |
| S4 | 없는 이름 | 쓰지 않는 이름(예: 오늘 날짜를 붙인 임의 이름)과 아무 비밀번호로 로그인합니다. | S3 와 같은 안내가 나옵니다. "처리하지 못했습니다"가 나오면 실패입니다. |

**S1 이 실패하면 화면을 보고 둘 중 하나로 나눕니다.**
- Cloudflare 오류 화면 "Error 1102 Worker exceeded resource limits": 무료 요금제 CPU 한도입니다. 5절의 요금제 판단으로 넘어갑니다.
- 가계부 화면의 "계정을 만들지 못했습니다": 다른 원인입니다. 시각을 남기고, 관리자는 `/ops-events`에서 `local_signup_failed`의 상세를 확인합니다.
  - 운영 이벤트는 서버 인스턴스의 메모리에만 남습니다. 몇 분 안에 보지 않으면 사라질 수 있습니다.

### 4-2. Cloudflare 대시보드 (계정 소유자)

S1~S4 를 마친 뒤 Workers & Pages → `kakao-accountbook` → Metrics(지표) → Errors(오류) → Invocation Statuses(호출 상태)를 봅니다. 점검 시각에 "Exceeded CPU Time Limits"가 있는지 기록합니다. 기대 결과는 0입니다.

### 4-3. V22.9.34 운영 확인 이어 하기

S1 이 통과하면 그 계정으로 `docs/ASIDE_V22_9_34.md` 4절(W1~W13)을 이어서 합니다. V22.9.34 점검은 가입 실패로 모두 BLOCKED 였습니다.

### 4-4. 결과 보고 형식

```text
[V22.9.35 운영 확인] 점검일시(KST) / 점검자 / 기기·브라우저
S1 PASS|FAIL(1102|앱 오류)  가입 시각
S2 PASS|FAIL
S3 PASS|FAIL
S4 PASS|FAIL
대시보드 Exceeded CPU Time Limits: N건
DB① A 계정 생성 수 / DB② 반복 횟수별 행 수
이어서 V22.9.34 W1~W13 결과(ASIDE_V22_9_34 4-5 형식)
```

## 5. 남은 위험과 요금제 판단

- **무료 요금제 CPU:** PBKDF2 100,000회는 거의 전부 CPU 작업입니다. 이 PC(Intel i9-10900)에서 약 35ms 걸렸습니다. Cloudflare 서버는 SHA 가속이 있어 더 빠를 수 있지만, 무료 요금제 한도(요청당 10ms)는 넘을 가능성이 큽니다.
  - Cloudflare 는 가끔 넘는 것은 허용하지만, 계속 넘으면 1102 로 끊습니다. 가입·로그인은 드물어서 통과할 수도 있습니다. 실제로는 4절로 확인합니다.
  - 1102 가 나오면 두 가지 중에서 고릅니다.
    - **권장: Workers Paid($5/월).** CPU 한도가 요청당 30초가 되어 해시 강도를 낮추지 않아도 됩니다.
    - **반복 횟수를 더 낮추기.** 10ms 안에 들도록 낮추면 비밀번호 DB 가 유출됐을 때 더 쉽게 풀립니다. 권장하지 않습니다.
- **해시 강도:** 100,000회는 OWASP 2023 권고(PBKDF2-SHA256 600,000회)보다 낮지만, Workers Web Crypto 로 만들 수 있는 최대값입니다. 다음이 함께 막고 있습니다.
  - 계정마다 다른 솔트
  - 로그인·가입 횟수 제한
  - 비밀번호 8자 이상
- **더 높이는 방법:** 서버 비밀값(pepper)을 더하는 방법이 있습니다. 새 Secret 이 필요하므로 별도 판단입니다.
- **workerd 상한 변경:** 상한을 1,000,000 으로 올리는 workerd PR #7550 은 아직 병합되지 않았습니다. 병합·배포되더라도 운영에서 확인한 뒤에만 반복 횟수를 올립니다.

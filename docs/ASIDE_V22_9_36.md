# V22.9.36 카카오 분류 표 대체 적용 안내와 운영 확인 지시문

이 문서는 `V22.9.36-KAKAO-CATEGORY-FALLBACK` 적용 준비본이며 두 부분으로 되어 있습니다.
- **배포 담당자용 적용 순서**
- **운영 확인 지시문:** 사용자나 외부 점검자에게 그대로 맡길 수 있게 쓴 것

새 동결 `src/index.js`는 **3,515,821 bytes**, SHA-256 `b8b93790bbdb277673502c9c4d454bcb849fbc61a27e05bcc6a2ca67f9ced9f4`입니다.

기준 운영은 V22.9.35 입니다.
- 버전 `4f9da854-c185-40f0-8d0f-7bac9a3c9dc4`
- 배포 `994d2f22-d0bd-4761-bc83-c26ef992e5bb`
- 소스 SHA-256 `636cab5c…`
- 기록 `docs/deployments/V22_9_35_2026_10_10.md`

## 1. 변경 결과

- **카카오 새 기록 저장:** 분류 표(`accountbook_categories`)가 없거나 조회가 실패해도 저장합니다. 분류는 설정에 저장된 사용자 분류·기본 분류·키워드로 정합니다(웹 빠른 입력과 같은 규칙).
- **운영 이벤트:** 표 조회 실패는 `kakao_category_table_unavailable`(warn)로 서버 인스턴스마다 한 번만 남깁니다.
- **바뀌지 않은 것:** SQL, 환경변수·Secrets·바인딩, 1년 캐시 자산, Worker 내보내기 목록(`named_handlers` 대조 동일), 카카오 수정·삭제·복구·조회·예산 명령, 웹 기록.

## 2. 배포 전후 읽기 전용 확인 (Supabase SQL Editor)

필수는 아니지만 영향 범위를 알려 줍니다. 아무것도 바꾸지 않습니다.

① **표가 정말 없는지** (기대: `null`)
```sql
select to_regclass('public.accountbook_categories') as categories_table;
```

② **V22.9.30 배포 뒤 카카오 새 기록이 들어왔는지** (기대: 결함이 맞다면 2026-10-08 배포 시각 이후 0건)
```sql
select date_trunc('day', created_at at time zone 'Asia/Seoul') as day_kst, count(*) as kakao_rows
from public.transactions
where source = 'kakao_skill'
  and created_at >= '2026-10-01 00:00:00+09'
group by 1
order by 1;
```
10-08 이후 날짜에 행이 있으면 알려 주세요. 그 경우 표가 있거나 다른 경로로 저장된 것이므로 원인을 다시 봅니다.

## 3. 적용 순서

1. PR 을 main 에 병합합니다. 깨끗한 main checkout 에서 `VERSION.txt`, 위 SHA-256, `npm test`(전체 하네스)를 확인합니다.
2. `node tools/deploy-worker-version.mjs --dry-run`으로 네트워크 없이 로컬 해시·커밋·요청 순서를 확인합니다.
3. 사용자가 토큰을 만들어 업로드합니다. 토큰 권한은 Workers Scripts Edit, 이 계정 한정, 만료일 지정입니다. 사용자가 직접 연 PowerShell 창에서 실행하고, 토큰 입력은 `*`로 가려집니다.
   ```powershell
   cd D:\Github_Kakao_Account\my
   $env:CLOUDFLARE_API_TOKEN = [System.Net.NetworkCredential]::new("", (Read-Host "Cloudflare token" -AsSecureString)).Password
   $env:CLOUDFLARE_ACCOUNT_ID = "58e7954ad3d92f0d39a7492ad4689165"
   node tools/deploy-worker-version.mjs
   ```
   업로드는 버전만 저장하고 배포하지 않습니다. `output/deploy/V22.9.36-KAKAO-CATEGORY-FALLBACK/upload-<버전ID>.json`에서 바인딩 30개·`script_runtime`·handlers 대조 결과를 확인합니다.
4. 승인 후 같은 창에서 승격합니다.
   ```powershell
   node tools/deploy-worker-version.mjs --promote <버전ID> --legacy-origin https://ttokttok-accountbook.com
   ```
   스크립트가 현재 배포, `content/v2` 소스 해시, `/health` 5번 연속 V22.9.36, 공개 검사를 확인합니다. `--legacy-origin`은 옛 도메인이 새 도메인으로 넘어가는지를 함께 보는 옵션이고 기본 검사는 `malhaebook.com`으로 합니다.
5. 문제가 있으면 승인 후 V22.9.35 로 되돌립니다.
   ```powershell
   node tools/deploy-worker-version.mjs --rollback 4f9da854-c185-40f0-8d0f-7bac9a3c9dc4
   ```
   되돌리면 카카오 새 기록 저장이 다시 실패합니다.
6. 결과는 `docs/deployments/V22_9_36_<날짜>.md`에 기록하고, 사용자는 토큰을 폐기합니다.

## 4. 운영 확인 지시문

> 이 절은 점검자에게 그대로 건네도 되도록 썼습니다.

### 점검 원칙
- 점검용 계정과 점검용 가계부만 씁니다. 금액은 100원처럼 작게 넣고, 확인 뒤 웹에서 삭제합니다.
- 같은 문장을 8초 안에 다시 보내면 "처리 중" 안내가 나올 수 있으니 문장을 조금씩 바꿉니다.

### 4-1. 카카오 저장 (1:1 대화방)

| 번호 | 보낼 말 | 기대 결과 |
|---|---|---|
| C1 | `커피 100원 분류점검` | "💸 지출 저장했어요" 답장. 날짜·가계부·"01번 - 커피 분류점검 / 100원 / … / 카페/간식"처럼 분류가 붙습니다. |
| C2 | `월급 100원 수입점검` | "💰 수입 저장했어요" 답장. |
| C3 | 웹 `/app` 거래내역 | C1·C2 가 보입니다. 확인 뒤 삭제합니다. |
| C4 | 단톡방(연결된 방이 있으면) `점심 100원 단톡점검` | 저장 답장이 옵니다. |

C1 이 "저장하지 못했어요"나 "처리하지 못했어요"로 실패하면 시각(KST)과 답장 전문을 남깁니다. 관리자는 몇 분 안에 `/ops-events`에서 `kakao_save_failed`·`kakao_category_table_unavailable`의 상세를 봅니다(운영 이벤트는 인스턴스 메모리에만 남습니다).

### 4-2. 이어서 할 것
C1 이 통과하면 `docs/ASIDE_V22_9_34.md` 4-2 의 카카오 K1~K10 과 4-1 의 웹 W1~W13 을 합니다. V22.9.35 4절(가입 S1~S4)이 아직이면 먼저 합니다.

### 4-3. 결과 보고 형식
```text
[V22.9.36 운영 확인] 점검일시(KST) / 점검자 / 기기
C1 PASS|FAIL  답장 첫 줄
C2 PASS|FAIL
C3 PASS|FAIL
C4 PASS|FAIL|해당없음
DB① categories_table 값 / DB② 날짜별 kakao_rows
이어서 V22.9.35 S1~S4, V22.9.34 K1~K10·W1~W13 결과
```

## 5. 남은 위험

- **운영 확인 전:** 이 결함은 코드와 `/ready` 결과로 찾았습니다. 운영 카카오 대화로 실패를 직접 본 것은 아닙니다. 2절 ②의 결과가 "10-08 이후에도 행이 있음"이면 원인을 다시 봅니다.
- **픽스처 격차:** 메모리 픽스처에는 이 표가 있어 운영보다 너그럽습니다. V22.9.37 에서 표 없는 모드로 전체 하네스를 한 번 더 돌리는 검사를 더합니다.
- **표를 만들지 않습니다:** 설정 저장 분류로 충분하고, 새 SQL 은 별도 승인 범위입니다.
